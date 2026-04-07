import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { getIrisDisplayLabel } from "@/lib/geo/iris-loader";
import { AlertTriangle, ArrowLeft, MapPin, Map, Pencil, Landmark, ShieldAlert, Building2, UserRound } from "lucide-react";
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
import { OsmProximitiesMapDynamic } from "@/components/geo/osm-map-dynamic";
import { OsmProximitiesTable } from "@/components/geo/osm-table";
import { SwotTable } from "@/components/analysis/swot-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeptBenchmarkPanel } from "@/components/dvf/dept-benchmark-panel";
import { GPTActionsPanel } from "@/components/gpt/gpt-actions-panel";
import { GptAnalyzeButton } from "@/components/gpt/gpt-analyze-button";
import { GammaButtons } from "@/components/gamma/gamma-buttons";
import { buildGammaExpertPrompt, buildGammaClientPrompt } from "@/lib/gamma/gamma-prompt-builder";
import { MethodeCalculPanel } from "@/components/analysis/methode-calcul-panel";
import { ListingPriceCard } from "@/components/analysis/listing-price-card";
import { SaveDiscardBanner } from "@/components/analysis/save-discard-banner";
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
import { computeSwot } from "@/lib/analysis/swot";
import { DVFStats, DVFComparable } from "@/types/dvf";
import { ActiveListing } from "@/types/listing";
import { Adjustment, ConfidenceFactors } from "@/types/valuation";
import { GPTOutput } from "@/types/gpt";
import { MarketReading as MarketReadingType } from "@/types/analysis";
import { PropertyType } from "@/types/property";
import type { OsmPlace } from "@/lib/geo/osm";
import type { ServitudeItem } from "@/lib/geo/sup";
import { PROPERTY_TYPE_LABELS, CONDITION_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

function formatAddressForPappers(address: string | null, postalCode: string | null): string {
  const full = [address, postalCode].filter(Boolean).join(" ");
  return full
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function safeJsonArray<T = unknown>(value: unknown): T[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value as T[];
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

function InfoRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className={`text-xs text-slate-800 font-medium text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

export default async function AnalysisPage({ params }: { params: { id: string } }) {
  const analysis = await prisma.analysis.findUnique({ where: { id: params.id } });
  if (!analysis) notFound();

  let serialized: Record<string, unknown>;
  try {
    serialized = JSON.parse(JSON.stringify(analysis));
  } catch {
    serialized = analysis as unknown as Record<string, unknown>;
  }

  const rawListings = safeJsonArray(serialized.listings);
  const safeListings = markListingOutliers(rawListings as ActiveListing[]) as ActiveListing[];
  const safeDvfComparables = safeJsonArray<DVFComparable>(serialized.dvfComparables);
  const safeGptOutputs = safeJsonArray<GPTOutput>(serialized.gptOutputs);
  const safeAdjustments = safeJsonArray<Adjustment>(serialized.adjustments);
  const safeDvfStatsRaw = safeJsonObject<DVFStats>(serialized.dvfStats);
  const safeMarketReading = safeJsonObject<MarketReadingType>(serialized.marketReading);

  // IRIS
  const storedIrisCode = serialized.irisCode as string | null | undefined;
  const irisDisplayLabel = storedIrisCode ? getIrisDisplayLabel(storedIrisCode) : null;

  // OSM proximities
  const safeProximities = safeJsonArray<OsmPlace>(serialized.proximities);

  // Servitudes
  const safeServitudes = safeJsonArray<ServitudeItem>(serialized.servitudes);

  // Risks summary
  const safeRisksSummary = safeJsonArray<string>(serialized.risksSummary);

  let dvfStats: DVFStats | null = safeDvfStatsRaw;
  let dvfComparables: DVFComparable[] = safeDvfComparables;
  let liveFinalRadiusKm: number | null = null;
  let liveRequestedRadiusKm: number | null = null;

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

  const cleanSafeListings = safeListings.filter((l) => !l.outlier);
  if (dvfStats && !dvfStats.marketPressure && cleanSafeListings.length > 0) {
    const mp = computeMarketPressure(dvfStats, cleanSafeListings);
    if (mp) dvfStats.marketPressure = mp;
  }

  const deptBenchmark = await fetchDeptStats(serialized.propertyType as string | null).catch(() => null);

  const { factors: confidenceFactors } = computeConfidence(
    dvfStats,
    (serialized.surface as number | null) ?? 0,
    dvfComparables,
    perimeterKm ?? undefined,
  );

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

  const dvfTypeForChart = serialized.propertyType === "APARTMENT" ? "Appartement"
    : serialized.propertyType === "HOUSE" ? "Maison"
    : serialized.propertyType === "LAND" ? "Terrain"
    : undefined;

  const geoQuality = serialized.geoQuality as string | null | undefined;
  const geoScore = serialized.geoScore as number | null | undefined;

  const pappersMapUrl = (serialized.lat && serialized.lng)
    ? `https://immobilier.pappers.fr/?lat=${serialized.lat}&lon=${serialized.lng}&z=15`
    : null;

  // SWOT computation
  const swot = computeSwot({
    propertyType: serialized.propertyType as string,
    condition: serialized.condition as string | null,
    dpeLetter: serialized.dpeLetter as string | null,
    floor: serialized.floor as number | null,
    totalFloors: serialized.totalFloors as number | null,
    yearBuilt: serialized.yearBuilt as number | null,
    hasParking: Boolean(serialized.hasParking),
    hasGarage: Boolean(serialized.hasGarage),
    hasBalcony: Boolean(serialized.hasBalcony),
    hasTerrace: Boolean(serialized.hasTerrace),
    hasCellar: Boolean(serialized.hasCellar),
    hasPool: Boolean(serialized.hasPool),
    hasElevator: Boolean(serialized.hasElevator),
    landSurface: serialized.landSurface as number | null,
    surface: serialized.surface as number,
    rooms: serialized.rooms as number | null,
    orientation: serialized.orientation as string | null,
    view: serialized.view as string | null,
    mitoyennete: serialized.mitoyennete as string | null,
    zonePLU: serialized.zonePLU as string | null,
    zonePLUType: serialized.zonePLUType as string | null,
    riskFlood: serialized.riskFlood as string | null,
    riskEarthquake: serialized.riskEarthquake as string | null,
    riskClay: serialized.riskClay as string | null,
    riskLandslide: serialized.riskLandslide as string | null,
    risksSummary: safeRisksSummary.length > 0 ? safeRisksSummary : (serialized.risksSummary === null ? null : undefined as unknown as null),
    servitudes: safeServitudes.length > 0 ? safeServitudes : null,
    proximities: safeProximities.length > 0 ? safeProximities : (serialized.proximities === null ? null : undefined as unknown as null),
    confidence: serialized.confidence as number | null,
    dvfSampleSize: serialized.dvfSampleSize as number | null,
  });

  // Property details helpers
  const propType = PROPERTY_TYPE_LABELS[serialized.propertyType as string] ?? (serialized.propertyType as string);
  const condLabel = CONDITION_LABELS[serialized.condition as string] ?? (serialized.condition as string);
  const featuresList = [
    Boolean(serialized.hasParking) && "Parking",
    Boolean(serialized.hasGarage) && "Garage",
    Boolean(serialized.hasBalcony) && "Balcon",
    Boolean(serialized.hasTerrace) && "Terrasse",
    Boolean(serialized.hasCellar) && "Cave",
    Boolean(serialized.hasPool) && "Piscine",
    Boolean(serialized.hasElevator) && "Ascenseur",
  ].filter(Boolean) as string[];

  return (
    <div className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pb-12" style={{ backgroundColor: "#F8FAFC" }}>

      {/* ── Breadcrumb ── */}
      <div className="pt-4 pb-3">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-slate-500 hover:text-slate-800 -ml-2">
          <Link href="/analyses">
            <ArrowLeft className="h-4 w-4" />
            Retour aux analyses
          </Link>
        </Button>
      </div>

      {/* ── Bannières géocodage ── */}
      {geoQuality === "warning" && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 mb-4">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
          <div>
            <p className="font-medium">Adresse approximative — vérifier les coordonnées</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Score géocodage : {geoScore != null ? geoScore.toFixed(2) : "—"} (recommandé ≥ 0.70).
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
              Score géocodage : {geoScore != null ? geoScore.toFixed(2) : "—"} (minimum ≥ 0.50).
            </p>
          </div>
        </div>
      )}

      {/* ── Bannière sauvegarde ── */}
      {serialized.status === "DRAFT" && (
        <SaveDiscardBanner analysisId={serialized.id as string} />
      )}

      {/* ── HEADER ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 px-6 py-6 mb-5">
        <AnalysisSummaryPanel analysis={serialized} analysisId={serialized.id as string} irisDisplayLabel={irisDisplayLabel} />
      </div>

      {/* ── TOOLBAR ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 px-5 py-4 mb-5">
        <div className="flex flex-wrap items-start gap-x-0 gap-y-3">
          <div className="flex items-center gap-2 pr-4 mr-4 border-r border-slate-200">
            <ResimulateButton analysisId={serialized.id as string} />
            <Button asChild variant="outline" size="sm" className="gap-1.5 text-slate-600 border-slate-300">
              <Link href={`/analyses/${serialized.id}/edit`}>
                <Pencil className="h-3.5 w-3.5" />
                Modifier le bien
              </Link>
            </Button>
          </div>
          <div className="flex items-center pr-4 mr-4 border-r border-slate-200">
            <GptAnalyzeButton analysisId={serialized.id as string} />
          </div>
          <div className="flex items-start gap-3 flex-wrap">
            <PdfExportButtons analysisId={serialized.id as string} />
            <div className="w-px bg-slate-200 self-stretch hidden sm:block" />
            <GammaButtons analysisId={serialized.id as string} expertPrompt={gammaExpertPrompt} clientPrompt={gammaClientPrompt} />
          </div>
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

      {/* ── 5 ONGLETS ── */}
      <Tabs defaultValue="resultats" className="w-full">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 px-2 py-2 mb-5">
          <TabsList className="grid grid-cols-5 w-full h-9 bg-slate-100/80 rounded-xl">
            <TabsTrigger value="resultats" className="rounded-lg text-xs sm:text-sm font-medium">Résultats</TabsTrigger>
            <TabsTrigger value="comparables" className="rounded-lg text-xs sm:text-sm font-medium">Comparables</TabsTrigger>
            <TabsTrigger value="contexte" className="rounded-lg text-xs sm:text-sm font-medium">Contexte</TabsTrigger>
            <TabsTrigger value="proximites" className="rounded-lg text-xs sm:text-sm font-medium">Proximités</TabsTrigger>
            <TabsTrigger value="bien" className="rounded-lg text-xs sm:text-sm font-medium">Bien</TabsTrigger>
          </TabsList>
        </div>

        {/* ─── Tab 1 : Résultats ─────────────────────────────────────────── */}
        <TabsContent value="resultats" className="space-y-5 mt-0">
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
          {!!serialized.valuationMid && (
            <ListingPriceCard
              listingPriceLow={Math.round((serialized.valuationMid as number) * 1.02)}
              listingPriceHigh={Math.round((serialized.valuationMid as number) * 1.03)}
            />
          )}
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
          <GPTActionsPanel
            analysisId={serialized.id as string}
            initialOutputs={safeGptOutputs}
            chatgptPrompt={chatgptPrompt}
            address={serialized.address as string | null}
            city={serialized.city as string | null}
          />
        </TabsContent>

        {/* ─── Tab 2 : Comparables ───────────────────────────────────────── */}
        <TabsContent value="comparables" className="space-y-4 mt-0">
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
          <ActiveListingsPanel listings={safeListings} apiAvailable={apiAvailable} />
          <DVFRecentSalesPanel comparables={dvfComparables} />
        </TabsContent>

        {/* ─── Tab 3 : Contexte ──────────────────────────────────────────── */}
        <TabsContent value="contexte" className="space-y-4 mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* IRIS + Parcelle */}
            <Card className="shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-blue-500" />
                  Localisation & Cadastre
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <InfoRow label="Secteur IRIS" value={irisDisplayLabel} />
                <InfoRow
                  label={serialized.propertyType === "APARTMENT" ? "Parcelle immeuble" : "Parcelle"}
                  value={
                    serialized.cadastralSection && serialized.cadastralNumber
                      ? `Section ${serialized.cadastralSection} — n°${serialized.cadastralNumber}`
                      : (serialized.cadastralRef as string | null)
                  }
                  mono
                />
                <InfoRow label="Commune INSEE" value={serialized.communeCode as string | null} mono />
                {!!serialized.cadastralRef && (
                  <a
                    href="https://www.cadastre.gouv.fr/scpc/rechercherPlan.do"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center text-xs text-blue-500 hover:text-blue-700 hover:underline gap-1"
                  >
                    Voir le cadastre →
                  </a>
                )}
              </CardContent>
            </Card>

            {/* PLU */}
            <Card className="shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-emerald-600" />
                  Urbanisme (PLU/PLUi)
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {serialized.zonePLU ? (
                  <>
                    <InfoRow label="Zone" value={serialized.zonePLU as string} mono />
                    <InfoRow label="Type de zone" value={
                      serialized.zonePLUType === "U" ? "U — Zone urbaine"
                      : serialized.zonePLUType === "AU" ? "AU — Zone à urbaniser"
                      : serialized.zonePLUType === "N" ? "N — Zone naturelle"
                      : serialized.zonePLUType === "A" ? "A — Zone agricole"
                      : (serialized.zonePLUType as string | null)
                    } />
                    <InfoRow label="Document" value={serialized.documentUrbanisme as string | null} />
                  </>
                ) : (
                  <p className="text-xs text-slate-400 italic">Données PLU non disponibles pour ce bien.</p>
                )}
              </CardContent>
            </Card>

            {/* Risques naturels */}
            <Card className="shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  Risques naturels (Géorisques)
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {safeRisksSummary.length > 0 ? (
                  <div className="space-y-1.5">
                    {safeRisksSummary.map((risk, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-amber-500 text-sm">⚠️</span>
                        <span className="text-xs text-slate-700">{risk}</span>
                      </div>
                    ))}
                  </div>
                ) : serialized.risksSummary === null ? (
                  <div className="flex items-center gap-2">
                    <span className="text-green-500 text-sm">✅</span>
                    <span className="text-xs text-slate-600">Aucun risque naturel majeur recensé</span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    Données risques non disponibles — re-simuler pour les obtenir.
                  </p>
                )}
                <a
                  href={`https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi/rapport2?form-adresse=true&type=adresse&adresse=${encodeURIComponent([serialized.address, serialized.postalCode, serialized.city].filter(Boolean).join(" "))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center text-xs text-amber-600 hover:text-amber-800 hover:underline gap-1"
                >
                  Rapport Géorisques complet →
                </a>
              </CardContent>
            </Card>

            {/* Servitudes */}
            <Card className="shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-violet-500" />
                  Servitudes d'utilité publique
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {safeServitudes.length > 0 ? (
                  <div className="space-y-2">
                    {safeServitudes.map((s, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-violet-400 shrink-0 mt-0.5 text-xs font-bold">{s.typeSup ?? "SUP"}</span>
                        <span className="text-xs text-slate-700">{s.libelle ?? "Servitude"}</span>
                      </div>
                    ))}
                  </div>
                ) : serialized.servitudes === null ? (
                  <div className="flex items-center gap-2">
                    <span className="text-green-500 text-sm">✅</span>
                    <span className="text-xs text-slate-600">Aucune servitude SUP recensée</span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    Données servitudes non disponibles — re-simuler pour les obtenir.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Tab 4 : Proximités ────────────────────────────────────────── */}
        <TabsContent value="proximites" className="space-y-5 mt-0">
          {/* OSM Map */}
          {!!(serialized.lat && serialized.lng) && (
            <Card className="shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-blue-500" />
                  Équipements à proximité (1 km)
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {safeProximities.length > 0 ? (
                  <OsmProximitiesMapDynamic
                    places={safeProximities}
                    subjectLat={serialized.lat as number}
                    subjectLng={serialized.lng as number}
                  />
                ) : serialized.proximities === null ? (
                  <p className="text-xs text-slate-400 italic">Aucun équipement recensé dans un rayon de 1 km.</p>
                ) : (
                  <p className="text-xs text-slate-400 italic">Données proximités non disponibles — re-simuler pour les obtenir.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* OSM Table */}
          {safeProximities.length > 0 && (
            <Card className="shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Liste des équipements</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <OsmProximitiesTable places={safeProximities} />
              </CardContent>
            </Card>
          )}

          {/* SWOT Table */}
          <Card className="shadow-sm rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Analyse forces & faiblesses</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <SwotTable swot={swot} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 5 : Bien ──────────────────────────────────────────────── */}
        <TabsContent value="bien" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Caractéristiques */}
            <Card className="shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-500" />
                  Caractéristiques du bien
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <InfoRow label="Type" value={propType} />
                <InfoRow label="Surface habitable" value={serialized.surface ? `${serialized.surface} m²` : null} />
                <InfoRow label="Pièces" value={serialized.rooms ? `${serialized.rooms} pièce${(serialized.rooms as number) > 1 ? "s" : ""}` : null} />
                <InfoRow label="Chambres" value={serialized.bedrooms ? `${serialized.bedrooms} chambre${(serialized.bedrooms as number) > 1 ? "s" : ""}` : null} />
                <InfoRow label="Étage" value={serialized.floor != null && serialized.totalFloors != null ? `${serialized.floor}/${serialized.totalFloors}` : null} />
                <InfoRow label="Année de construction" value={serialized.yearBuilt ? String(serialized.yearBuilt) : null} />
                <InfoRow label="État général" value={condLabel} />
                <InfoRow label="DPE" value={serialized.dpeLetter ? `Classe ${serialized.dpeLetter}` : null} />
                <InfoRow label="Terrain" value={serialized.landSurface ? `${(serialized.landSurface as number).toLocaleString("fr-FR")} m²` : null} />
                <InfoRow label="Orientation" value={serialized.orientation as string | null} />
                <InfoRow label="Vue" value={serialized.view as string | null} />
                <InfoRow label="Mitoyenneté" value={
                  serialized.mitoyennete === "individuelle" ? "Individuelle"
                  : serialized.mitoyennete === "mitoyenne_un_cote" ? "Mitoyenne d'un côté"
                  : serialized.mitoyennete === "mitoyenne_deux_cotes" ? "Mitoyenne des deux côtés"
                  : (serialized.mitoyennete as string | null)
                } />
                {featuresList.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {featuresList.map((f) => (
                      <span key={f} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700 border border-slate-200">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Destinataire */}
            <Card className="shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-slate-500" />
                  Destinataire de l'avis de valeur
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {[serialized.clientFirstName, serialized.clientLastName].filter(Boolean).length > 0 ? (
                  <>
                    <InfoRow label="Nom" value={[serialized.clientFirstName, serialized.clientLastName].filter(Boolean).join(" ")} />
                    <InfoRow label="Adresse" value={serialized.clientAddress as string | null} />
                    <InfoRow label="Email" value={serialized.clientEmail as string | null} />
                    <InfoRow label="Téléphone" value={serialized.clientPhone as string | null} />
                  </>
                ) : (
                  <p className="text-xs text-slate-400 italic">Aucun destinataire renseigné.</p>
                )}
                <div className="mt-3">
                  <Button asChild variant="outline" size="sm" className="gap-1.5 text-slate-600 border-slate-300 text-xs">
                    <Link href={`/analyses/${serialized.id}/edit`}>
                      <Pencil className="h-3 w-3" />
                      Modifier les informations
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
