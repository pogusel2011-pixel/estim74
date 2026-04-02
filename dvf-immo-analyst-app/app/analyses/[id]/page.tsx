import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { getIrisDisplayLabel } from "@/lib/geo/iris-loader";
import { AlertTriangle, ArrowLeft, MapPin, Map } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { ResimulateButton } from "@/components/analysis/resimulate-button";
import { PdfExportButtons } from "@/components/analysis/pdf-export-buttons";
import { AnalysisSummaryPanel } from "@/components/analysis/analysis-summary";
import { ValuationCards } from "@/components/analysis/valuation-cards";
import { DVFComparablesTable } from "@/components/dvf/dvf-comparables-table";
import { DVFStatsPanel } from "@/components/dvf/dvf-stats-panel";
import { MarketTrendChart } from "@/components/dvf/market-trend-chart";
import { ActiveListingsPanel } from "@/components/listings/active-listings-panel";
import { DVFRecentSalesPanel } from "@/components/listings/dvf-recent-sales-panel";
import { MarketReading } from "@/components/analysis/market-reading";
import { NotairesPanel } from "@/components/analysis/notaires-panel";
import { DVFComparablesMapDynamic } from "@/components/dvf/dvf-comparables-map-dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeptBenchmarkPanel } from "@/components/dvf/dept-benchmark-panel";
import { GPTActionsPanel } from "@/components/gpt/gpt-actions-panel";

import { GptAnalyzeButton } from "@/components/gpt/gpt-analyze-button";
import { GammaButtons } from "@/components/gamma/gamma-buttons";
import { buildGammaExpertPrompt, buildGammaClientPrompt } from "@/lib/gamma/gamma-prompt-builder";
import { MethodeCalculPanel } from "@/components/analysis/methode-calcul-panel";
import { ListingPriceCard } from "@/components/analysis/listing-price-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDVFMutations } from "@/lib/dvf/client";
import { computePrixM2, markOutliers } from "@/lib/dvf/outliers";
import { markListingOutliers } from "@/lib/listings/outliers";
import { computeDVFStats } from "@/lib/dvf/stats";
import { toComparables } from "@/lib/dvf/comparables";
import { propertyTypeToDvfTypes } from "@/lib/mapping/property-type";
import { isApiKeyConfigured } from "@/lib/moteurimmo/search";
import { computeConfidence } from "@/lib/valuation/confidence";
import { buildChatGPTPrompt } from "@/lib/gpt/chatgpt-prompt-builder";
import { computeMarketPressure } from "@/lib/moteurimmo/qualitative";
import { fetchDeptStats } from "@/lib/dvf/dept-stats";
import { DVFStats, DVFComparable } from "@/types/dvf";
import { ActiveListing } from "@/types/listing";
import { Adjustment, ConfidenceFactors } from "@/types/valuation";
import { GPTOutput } from "@/types/gpt";
import { MarketReading as MarketReadingType } from "@/types/analysis";
import { PropertyType } from "@/types/property";

export const dynamic = "force-dynamic";

/** Formate une adresse pour l'URL Pappers immobilier (slug kebab-case sans accents).
 * Ex: "47 chemin de crêt vial" + "74540" → "47-chemin-de-cret-vial-74540"
 */
function formatAddressForPappers(address: string | null, postalCode: string | null): string {
  const full = [address, postalCode].filter(Boolean).join(" ");
  return full
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // supprime les diacritiques (é→e, ê→e, à→a…)
    .replace(/[^a-z0-9]+/g, "-")       // toute séquence non-alphanumérique → un seul tiret
    .replace(/^-|-$/g, "");            // retire les tirets en début/fin
}

/** Safely parses a Prisma Json? field into an array — returns [] on null/non-array/error. */
function safeJsonArray<T = unknown>(value: unknown): T[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value as T[];
  // Stored as JSON string (legacy)
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Safely parses a Prisma Json? field into an object — returns null on null/non-object/error. */
function safeJsonObject<T = Record<string, unknown>>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as T;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export default async function AnalysisPage({ params }: { params: { id: string } }) {
  const analysis = await prisma.analysis.findUnique({ where: { id: params.id } });
  if (!analysis) notFound();

  // Safe serialization — Prisma objects are always JSON-safe, but guard anyway
  let serialized: Record<string, unknown>;
  try {
    serialized = JSON.parse(JSON.stringify(analysis));
  } catch {
    console.error("[AnalysisPage] Serialization error for", params.id);
    serialized = analysis as unknown as Record<string, unknown>;
  }

  // Defensive reads of all Json? fields — handle null, non-array, JSON-string legacy formats
  const rawListings = safeJsonArray(serialized.listings);
  // Applique le marquage outlier côté page aussi (pour les analyses antérieures à la v2)
  const safeListings = markListingOutliers(rawListings as ActiveListing[]) as ActiveListing[];
  const safeDvfComparables = safeJsonArray<DVFComparable>(serialized.dvfComparables);
  const safeGptOutputs = safeJsonArray<GPTOutput>(serialized.gptOutputs);
  const safeAdjustments = safeJsonArray<Adjustment>(serialized.adjustments);
  const safeDvfStatsRaw = safeJsonObject<DVFStats>(serialized.dvfStats);
  const safeMarketReading = safeJsonObject<MarketReadingType>(serialized.marketReading);

  // If the analysis has no dvfStats saved (e.g. seeded records), fetch live
  let dvfStats: DVFStats | null = safeDvfStatsRaw;
  let dvfComparables: DVFComparable[] = safeDvfComparables;
  let liveFinalRadiusKm: number | null = null;
  let liveRequestedRadiusKm: number | null = null;

  // IRIS — zone géographique du bien (lookup depuis CSV, synchrone)
  const storedIrisCode = serialized.irisCode as string | null | undefined;
  const irisDisplayLabel = storedIrisCode ? getIrisDisplayLabel(storedIrisCode) : null;

  if (!dvfStats && serialized.lat && serialized.lng) {
    try {
      const dvfTypes = propertyTypeToDvfTypes(serialized.propertyType as PropertyType);
      const requestedRadius = (serialized.perimeterKm as number | null) ?? 0.5;
      const monthsBack = (serialized.dvfPeriodMonths as number | null) ?? 24;
      const { mutations, source, radiusKm: finalRadius, dvfSearchPath } = await getDVFMutations(
        serialized.lat as number,
        serialized.lng as number,
        requestedRadius,
        monthsBack,
        dvfTypes,
        serialized.city as string | undefined,
        serialized.postalCode as string | undefined,
      );
      liveRequestedRadiusKm = requestedRadius;
      liveFinalRadiusKm = finalRadius;
      let enriched = computePrixM2(mutations);
      enriched = markOutliers(enriched);
      const cleanEnriched = enriched.filter((m) => !m.outlier);
      dvfStats = computeDVFStats(cleanEnriched, serialized.surface as number | undefined);
      if (dvfStats) {
        dvfStats.source = source;
        dvfStats.excludedCount = enriched.length - cleanEnriched.length;
        dvfStats.searchPath = dvfSearchPath;
      }
      dvfComparables = toComparables(enriched, serialized.surface as number, serialized.rooms as number | undefined);
    } catch (err) {
      console.error("[AnalysisPage] DVF live fetch error:", err);
    }
  }

  const perimeterKm = liveFinalRadiusKm ?? (serialized.perimeterKm as number | null);
  const requestedRadiusKm = liveRequestedRadiusKm ?? (serialized.requestedRadiusKm as number | null);
  const apiAvailable = isApiKeyConfigured();

  // Enrichir dvfStats avec la pression de marché si listings disponibles
  // (pour analyses stockées dont dvfStats ne contient pas encore marketPressure)
  // N'utilise que les annonces retenues (sans outliers) pour le calcul
  const cleanSafeListings = safeListings.filter((l) => !l.outlier);
  if (dvfStats && !dvfStats.marketPressure && cleanSafeListings.length > 0) {
    const mp = computeMarketPressure(dvfStats, cleanSafeListings);
    if (mp) dvfStats.marketPressure = mp;
  }

  // Benchmark départemental 74 — récupéré en parallèle, fallback silencieux si API indisponible
  const deptBenchmark = await fetchDeptStats(serialized.propertyType as string | null).catch(() => null);

  // Calcul des facteurs de confiance (4 composantes) à partir des données disponibles
  const { factors: confidenceFactors } = computeConfidence(
    dvfStats,
    (serialized.surface as number | null) ?? 0,
    dvfComparables,
    perimeterKm ?? undefined,
  );

  // Construction du prompt ChatGPT (côté serveur — toutes les données disponibles)
  const chatgptPrompt = buildChatGPTPrompt({
    propertyType: serialized.propertyType as string,
    address: serialized.address as string | null,
    city: serialized.city as string,
    postalCode: serialized.postalCode as string | null,
    surface: serialized.surface as number,
    rooms: serialized.rooms as number | null,
    bedrooms: serialized.bedrooms as number | null,
    floor: serialized.floor as number | null,
    totalFloors: serialized.totalFloors as number | null,
    condition: serialized.condition as string | null,
    dpeLetter: serialized.dpeLetter as string | null,
    landSurface: serialized.landSurface as number | null,
    yearBuilt: serialized.yearBuilt as number | null,
    hasParking: Boolean(serialized.hasParking),
    hasGarage: Boolean(serialized.hasGarage),
    hasBalcony: Boolean(serialized.hasBalcony),
    hasTerrace: Boolean(serialized.hasTerrace),
    hasCellar: Boolean(serialized.hasCellar),
    hasPool: Boolean(serialized.hasPool),
    hasElevator: Boolean(serialized.hasElevator),
    orientation: serialized.orientation as string | null,
    view: serialized.view as string | null,
    valuationLow: serialized.valuationLow as number | null,
    valuationMid: serialized.valuationMid as number | null,
    valuationHigh: serialized.valuationHigh as number | null,
    valuationPsm: serialized.valuationPsm as number | null,
    confidence: serialized.confidence as number | null,
    confidenceLabel: serialized.confidenceLabel as string | null,
    confidenceFactors,
    dvfStats,
    perimeterKm: perimeterKm ?? null,
    adjustments: safeAdjustments as Adjustment[],
    dvfComparables,
    listings: safeListings as ActiveListing[],
  });

  // Build Gamma prompts (server-side — all data available)
  const gammaInput = {
    serialized,
    adjustments: safeAdjustments as Adjustment[],
    gptOutputs: safeGptOutputs,
    dvfStats,
    perimeterKm: perimeterKm ?? null,
  };
  const host = headers().get("host") ?? "";
  const proto = host.includes("localhost") ? "http" : "https";
  const baseUrl = host ? `${proto}://${host}` : "";
  const gammaExpertPrompt = buildGammaExpertPrompt({ ...gammaInput, baseUrl });
  const gammaClientPrompt = buildGammaClientPrompt({ ...gammaInput, baseUrl });

  // Map propertyType to DVF type string for the trend chart
  const dvfTypeForChart = serialized.propertyType === "APARTMENT" ? "Appartement"
    : serialized.propertyType === "HOUSE" ? "Maison"
    : serialized.propertyType === "LAND" ? "Terrain"
    : undefined;

  const geoQuality = serialized.geoQuality as string | null | undefined;
  const geoScore = serialized.geoScore as number | null | undefined;

  // URLs externes Pappers
  const pappersMapUrl = (serialized.lat && serialized.lng)
    ? `https://immobilier.pappers.fr/?lat=${serialized.lat}&lon=${serialized.lng}&z=15`
    : null;

  return (
    <div className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pb-12" style={{ backgroundColor: "#F8FAFC" }}>

      {/* ── Breadcrumb ────────────────────────────────────────────────────── */}
      <div className="pt-4 pb-3">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-slate-500 hover:text-slate-800 -ml-2">
          <Link href="/analyses">
            <ArrowLeft className="h-4 w-4" />
            Retour aux analyses
          </Link>
        </Button>
      </div>

      {/* ── Bannières géocodage ───────────────────────────────────────────── */}
      {geoQuality === "warning" && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 mb-4">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
          <div>
            <p className="font-medium">Adresse approximative — vérifier les coordonnées</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Score BAN : {geoScore != null ? geoScore.toFixed(2) : "—"} (recommandé ≥ 0.70).
              La localisation peut influencer les comparables DVF retenus.
            </p>
          </div>
        </div>
      )}
      {geoQuality === "error" && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
          <div>
            <p className="font-medium">Adresse non trouvée — vérifiez l'adresse saisie</p>
            <p className="text-xs text-red-700 mt-0.5">
              Score BAN : {geoScore != null ? geoScore.toFixed(2) : "—"} (minimum ≥ 0.50).
              Corrigez l'adresse et relancez l'estimation.
            </p>
          </div>
        </div>
      )}

      {/* ── 1. HEADER — Identité du bien ─────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 px-6 py-6 mb-5">
        <AnalysisSummaryPanel analysis={serialized} analysisId={serialized.id as string} irisDisplayLabel={irisDisplayLabel} />
      </div>

      {/* ── 2. TOOLBAR — Actions ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 px-5 py-4 mb-5">
        <div className="flex flex-wrap items-start gap-x-0 gap-y-3">

          {/* Groupe gauche — Re-simuler */}
          <div className="flex items-center pr-4 mr-4 border-r border-slate-200">
            <ResimulateButton analysisId={serialized.id as string} />
          </div>

          {/* Groupe centre — GPT */}
          <div className="flex items-center pr-4 mr-4 border-r border-slate-200">
            <GptAnalyzeButton analysisId={serialized.id as string} />
          </div>

          {/* Groupe droite — PDF + Gamma */}
          <div className="flex items-start gap-3 flex-wrap">
            <PdfExportButtons analysisId={serialized.id as string} />
            <div className="w-px bg-slate-200 self-stretch hidden sm:block" />
            <GammaButtons expertPrompt={gammaExpertPrompt} clientPrompt={gammaClientPrompt} />
          </div>

          {/* Groupe liens externes — Pappers */}
          {pappersMapUrl && (
            <>
              <div className="w-px bg-slate-200 self-stretch hidden sm:block mx-1" />
              <a
                href={pappersMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors shadow-sm"
              >
                <Map className="h-3.5 w-3.5" />
                Carte du secteur
              </a>
            </>
          )}

        </div>
      </div>

      {/* ── 3. ESTIMATION ────────────────────────────────────────────────── */}
      <ValuationCards
        low={serialized.valuationLow as number | null}
        mid={serialized.valuationMid as number | null}
        high={serialized.valuationHigh as number | null}
        psm={serialized.valuationPsm as number | null}
        confidence={serialized.confidence as number | null}
        confidenceLabel={serialized.confidenceLabel as string | null}
        adjustments={safeAdjustments}
        dvfSampleSize={serialized.dvfSampleSize as number | null}
        perimeterKm={perimeterKm}
        confidenceFactors={confidenceFactors}
      />

      {/* Prix d'annonce — bannière sous l'estimation */}
      {serialized.valuationMid ? (
        <div className="mt-3 mb-5">
          <ListingPriceCard
            listingPriceLow={Math.round((serialized.valuationMid as number) * 1.02)}
            listingPriceHigh={Math.round((serialized.valuationMid as number) * 1.03)}
          />
        </div>
      ) : <div className="mb-5" />}

      {/* ── 4. ONGLETS ───────────────────────────────────────────────────── */}
      <Tabs defaultValue="market" className="w-full">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 px-2 py-2 mb-5">
          <TabsList className="grid grid-cols-5 w-full h-9 bg-slate-100/80 rounded-xl">
            <TabsTrigger value="market" className="rounded-lg text-xs sm:text-sm font-medium">Marché</TabsTrigger>
            <TabsTrigger value="signed" className="rounded-lg text-xs sm:text-sm font-medium">Ventes signées</TabsTrigger>
            <TabsTrigger value="active" className="rounded-lg text-xs sm:text-sm font-medium">Marché actif</TabsTrigger>
            <TabsTrigger value="methode" className="rounded-lg text-xs sm:text-sm font-medium">Calcul détaillé</TabsTrigger>
            <TabsTrigger value="gpt" className="rounded-lg text-xs sm:text-sm font-medium">Analyse IA</TabsTrigger>
          </TabsList>
        </div>

        {/* 1 — Marché */}
        <TabsContent value="market" className="space-y-4 mt-0">
          <MarketReading
            marketReading={safeMarketReading}
            dvfMedianPsm={dvfStats?.medianPsm ?? null}
            propertyType={serialized.propertyType as string | undefined}
          />
          <DeptBenchmarkPanel
            benchmark={deptBenchmark}
            subjectPsm={serialized.valuationPsm as number | null}
          />
          {!!(serialized.lat && serialized.lng) && (
            <MarketTrendChart
              lat={serialized.lat as number}
              lng={serialized.lng as number}
              radiusKm={Math.max(perimeterKm ?? 2, 2)}
              propertyType={dvfTypeForChart}
            />
          )}
          <NotairesPanel
            city={serialized.city as string | null}
            propertyType={serialized.propertyType as string | null}
          />
        </TabsContent>

        {/* 2 — Ventes signées */}
        <TabsContent value="signed" className="space-y-4 mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <DVFStatsPanel
              stats={dvfStats}
              sampleSize={serialized.dvfSampleSize as number | null}
              perimeterKm={perimeterKm}
              requestedRadiusKm={requestedRadiusKm}
              trend12m={safeMarketReading?.dvfControl?.trend12m ?? null}
            />
            <div className="lg:col-span-2">
              {serialized.lat && serialized.lng ? (
                <Card className="flex-1 h-full shadow-sm rounded-xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-[#2563EB]" />
                      Transactions comparables{perimeterKm ? ` • Périmètre ${perimeterKm} km` : ""}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3" style={{ height: 310 }}>
                    <DVFComparablesMapDynamic
                      comparables={dvfComparables}
                      subjectLat={serialized.lat as number}
                      subjectLng={serialized.lng as number}
                      perimeterKm={perimeterKm}
                    />
                  </CardContent>
                </Card>
              ) : (
                <Card className="flex-1 shadow-sm rounded-xl">
                  <CardContent className="pt-6 text-center text-sm text-muted-foreground">
                    Coordonnées non disponibles
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
          <DVFComparablesTable
            comparables={dvfComparables}
            hasLiveData={dvfComparables.some((c) => c.source === "live")}
          />
        </TabsContent>

        {/* 3 — Marché actif */}
        <TabsContent value="active" className="space-y-4 mt-0">
          <ActiveListingsPanel listings={safeListings} apiAvailable={apiAvailable} />
          <DVFRecentSalesPanel comparables={dvfComparables} />
        </TabsContent>

        {/* 4 — Calcul détaillé */}
        <TabsContent value="methode" className="space-y-4 mt-0">
          <MethodeCalculPanel
            dvfStats={dvfStats}
            listings={safeListings}
            adjustments={safeAdjustments as Adjustment[]}
            surface={serialized.surface as number}
            valuationPsm={serialized.valuationPsm as number}
            valuationLow={serialized.valuationLow as number}
            valuationHigh={serialized.valuationHigh as number}
            valuationMid={serialized.valuationMid as number}
          />
        </TabsContent>

        {/* 5 — Analyse IA */}
        <TabsContent value="gpt" className="mt-0">
          <GPTActionsPanel
            analysisId={serialized.id as string}
            initialOutputs={safeGptOutputs}
            chatgptPrompt={chatgptPrompt}
            address={serialized.address as string | null}
            city={serialized.city as string | null}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
