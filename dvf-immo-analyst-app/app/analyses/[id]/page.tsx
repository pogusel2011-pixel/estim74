import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { getIrisDisplayLabel } from "@/lib/geo/iris-loader";
import { AlertTriangle, ArrowLeft, MapPin, Map, Pencil, Landmark, ShieldAlert, Building2, UserRound, Download, FileText, Sparkles, Bot } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { ResimulateButton } from "@/components/analysis/resimulate-button";
import { PdfExportButtons } from "@/components/analysis/pdf-export-buttons";
import { AnalysisSummaryPanel } from "@/components/analysis/analysis-summary";
import { ValuationCards } from "@/components/analysis/valuation-cards";
import { DVFComparablesTable } from "@/components/dvf/dvf-comparables-table";
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
import { formatPsm } from "@/lib/utils";

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
        dvfStats.dvfLiveCount = mutations.filter((m) => m._source === "dvf-live").length;
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

  // SWOT computation (must be before chatgptPrompt)
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
    hasBruit: Boolean(serialized.hasBruit),
    hasCopropDegradee: Boolean(serialized.hasCopropDegradee),
    hasExpositionNord: Boolean(serialized.hasExpositionNord),
    hasRDCSansExterieur: Boolean(serialized.hasRDCSansExterieur),
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
    hasBruit: Boolean(serialized.hasBruit),
    hasCopropDegradee: Boolean(serialized.hasCopropDegradee),
    hasExpositionNord: Boolean(serialized.hasExpositionNord),
    hasRDCSansExterieur: Boolean(serialized.hasRDCSansExterieur),
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
    dvfLiveCount: dvfStats?.dvfLiveCount,
    dvfComparables,
    listings: safeListings as ActiveListing[],
    zonePLU: serialized.zonePLU as string | null,
    zonePLUType: serialized.zonePLUType as string | null,
    risksSummary: safeRisksSummary.length > 0 ? safeRisksSummary : (serialized.risksSummary === null ? null : undefined),
    servitudes: safeServitudes.length > 0 ? safeServitudes : (serialized.servitudes === null ? null : undefined),
    proximities: safeProximities.length > 0 ? safeProximities : undefined,
    swot,
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
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <AnalysisSummaryPanel analysis={serialized} analysisId={serialized.id as string} irisDisplayLabel={irisDisplayLabel} />
          </div>
          <div className="flex flex-col gap-2 shrink-0 pt-1">
            <ResimulateButton analysisId={serialized.id as string} />
            <Button asChild variant="outline" size="sm" className="gap-1.5 text-slate-600 border-slate-300 justify-start">
              <Link href={`/analyses/${serialized.id}/edit`}>
                <Pencil className="h-3.5 w-3.5" />
                Modifier le bien
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* ── 6 ONGLETS ── */}
      <Tabs defaultValue="bien" className="w-full">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 px-2 py-2 mb-5">
          <TabsList className="grid grid-cols-6 w-full h-9 bg-slate-100/80 rounded-xl">
            <TabsTrigger value="bien" className="rounded-lg text-xs sm:text-sm font-medium">Bien</TabsTrigger>
            <TabsTrigger value="resultats" className="rounded-lg text-xs sm:text-sm font-medium">Résultats</TabsTrigger>
            <TabsTrigger value="comparables" className="rounded-lg text-xs sm:text-sm font-medium">Comparables</TabsTrigger>
            <TabsTrigger value="marche" className="rounded-lg text-xs sm:text-sm font-medium">Marché</TabsTrigger>
            <TabsTrigger value="contexte" className="rounded-lg text-xs sm:text-sm font-medium">Contexte</TabsTrigger>
            <TabsTrigger value="livrables" className="rounded-lg text-xs sm:text-sm font-medium flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Livrables
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ─── Tab 1 : Résultats ─────────────────────────────────────────── */}
        <TabsContent value="resultats" className="space-y-5 mt-0">
          {/* Row 1 : Estimation fourchette */}
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
          {/* Row 2 : Ajustements qualitatifs */}
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
          {/* Row 3 : Prix d'annonce conseillé + Indicateurs Notaires */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {!!serialized.valuationMid && (
              <ListingPriceCard
                listingPriceLow={Math.round((serialized.valuationMid as number) * 1.02)}
                listingPriceHigh={Math.round((serialized.valuationMid as number) * 1.03)}
              />
            )}
            <NotairesPanel
              city={serialized.city as string | null}
              propertyType={serialized.propertyType as string | null}
            />
          </div>
        </TabsContent>

        {/* ─── Tab 2 : Comparables ───────────────────────────────────────── */}
        <TabsContent value="comparables" className="space-y-4 mt-0">
          {serialized.lat && serialized.lng ? (
            <Card className="shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[#2563EB]" />
                  Transactions comparables{perimeterKm ? ` • Périmètre ${perimeterKm} km` : ""}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3" style={{ height: 340 }}>
                <DVFComparablesMapDynamic
                  comparables={dvfComparables}
                  subjectLat={serialized.lat as number}
                  subjectLng={serialized.lng as number}
                  perimeterKm={perimeterKm}
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-sm rounded-xl">
              <CardContent className="pt-6 text-center text-sm text-muted-foreground">
                Coordonnées non disponibles
              </CardContent>
            </Card>
          )}
          <DVFComparablesTable
            comparables={dvfComparables}
            hasLiveData={dvfComparables.some((c) => c.source === "live")}
          />
          <ActiveListingsPanel listings={safeListings} apiAvailable={apiAvailable} />
          <DVFRecentSalesPanel comparables={dvfComparables} />
        </TabsContent>

        {/* ─── Tab 3 : Marché (NEW) ──────────────────────────────────────── */}
        <TabsContent value="marche" className="space-y-5 mt-0">

          {/* Row 1 : Tendance marché + Prix Pappers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MarketReading
              marketReading={safeMarketReading}
              dvfMedianPsm={dvfStats?.medianPsm ?? null}
              propertyType={serialized.propertyType as string | undefined}
            />
            <Card className="shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Map className="h-4 w-4 text-blue-500" />
                  Prix de marché Pappers Immobilier
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {dvfStats?.marketPressure ? (
                  <div className="space-y-0">
                    <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100">
                      <span className="text-xs text-slate-500 shrink-0">Médiane annonces actives</span>
                      <span className="text-xs font-semibold text-slate-800">{formatPsm(dvfStats.marketPressure.medianListingPsm)}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100">
                      <span className="text-xs text-slate-500 shrink-0">Prix de vente estimé (−4 % négo.)</span>
                      <span className="text-xs font-semibold text-slate-800">{formatPsm(Math.round(dvfStats.marketPressure.medianListingPsm * 0.96))}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100">
                      <span className="text-xs text-slate-500 shrink-0">Écart annonces / DVF</span>
                      <span className={`text-xs font-semibold ${dvfStats.marketPressure.gapPct > 0 ? "text-amber-600" : "text-green-600"}`}>
                        {dvfStats.marketPressure.gapPct > 0 ? "+" : ""}{dvfStats.marketPressure.gapPct.toFixed(1)} %
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-4 py-2">
                      <span className="text-xs text-slate-500 shrink-0">Ajustement appliqué</span>
                      <span className={`text-xs font-semibold ${dvfStats.marketPressure.adjustment > 0 ? "text-green-600" : dvfStats.marketPressure.adjustment < 0 ? "text-red-600" : "text-slate-600"}`}>
                        {dvfStats.marketPressure.adjustment > 0 ? "+" : ""}{(dvfStats.marketPressure.adjustment * 100).toFixed(1)} %
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-3 italic">
                      Source : annonces actives Pappers Immobilier — {cleanSafeListings.length} annonce{cleanSafeListings.length !== 1 ? "s" : ""} analysée{cleanSafeListings.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    Données Pappers Immobilier non disponibles — re-simuler pour les obtenir.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 2 : Benchmark départemental */}
          <DeptBenchmarkPanel
            benchmark={deptBenchmark}
            subjectPsm={serialized.valuationPsm as number | null}
          />

          {/* Row 3 : Graphique évolution prix médian */}
          {!!(serialized.lat && serialized.lng) && (
            <MarketTrendChart
              lat={serialized.lat as number}
              lng={serialized.lng as number}
              radiusKm={Math.max(perimeterKm ?? 2, 2)}
              propertyType={dvfTypeForChart}
            />
          )}

          {/* Row 4 : Statistiques DVF en 4 blocs 2×2 */}
          {dvfStats && (() => {
            const dvfPsm = dvfStats.weightedAvgPsm ?? dvfStats.medianPsm;
            const mktAdj = dvfStats.marketPressure?.adjustment ?? 0;
            const fsd = dvfStats.fsd ?? dvfStats.stdPsm;
            const cv = dvfStats.medianPsm > 0 ? fsd / dvfStats.medianPsm : 0;
            const retained = serialized.dvfSampleSize as number | null ?? dvfStats.count;
            const excluded = dvfStats.excludedCount ?? 0;
            const trend12m = safeMarketReading?.dvfControl?.trend12m ?? null;
            const wasExpanded = requestedRadiusKm != null && perimeterKm != null && perimeterKm > requestedRadiusKm;
            const fmtDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
            const StatRow = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
              <div className="flex items-start justify-between gap-4 py-1.5 border-b border-slate-100 last:border-0">
                <span className="text-xs text-slate-500 shrink-0">{label}</span>
                <span className={`text-xs font-semibold text-right ${highlight ? "text-[#2563EB]" : "text-slate-800"}`}>{value}</span>
              </div>
            );
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Sources de données */}
                <Card className="shadow-sm rounded-xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">📊 Sources de données</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <StatRow label="DVF pondéré (réf.)" value={formatPsm(dvfPsm)} />
                    {dvfStats.marketPressure && (
                      <StatRow label="Annonces actives (−4 % négo.)" value={formatPsm(Math.round(dvfStats.marketPressure.medianListingPsm * 0.96))} />
                    )}
                    {mktAdj !== 0 && (
                      <StatRow label="Pression marché" value={`${mktAdj > 0 ? "+" : ""}${(mktAdj * 100).toFixed(1)} %`} />
                    )}
                    <div className="mt-2 p-2 rounded-lg bg-blue-50 border border-blue-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-blue-700">Prix de base retenu</span>
                        <span className="text-sm font-bold text-[#2563EB]">{formatPsm(Math.round(dvfPsm * (1 + mktAdj)))}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Qualité de l'échantillon */}
                <Card className="shadow-sm rounded-xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">🔍 Qualité de l&apos;échantillon</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <StatRow label="Médiane DVF" value={formatPsm(dvfStats.medianPsm)} />
                    <StatRow label="Écart-type (σ)" value={formatPsm(fsd)} />
                    <StatRow label="Transactions retenues" value={`${retained}`} />
                    <StatRow label="Transactions exclues" value={`${excluded}`} />
                    <StatRow label="Période couverte" value={`${fmtDate(dvfStats.oldestDate)} → ${fmtDate(dvfStats.newestDate)}`} />
                    {dvfStats.searchPath && (
                      <StatRow label="Périmètre" value={dvfStats.searchPath} />
                    )}
                  </CardContent>
                </Card>

                {/* Contexte marché */}
                <Card className="shadow-sm rounded-xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">📈 Contexte marché</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {trend12m != null && (
                      <StatRow
                        label="Tendance 12 mois"
                        value={`${trend12m > 0 ? "+" : ""}${trend12m.toFixed(1)} %`}
                      />
                    )}
                    {perimeterKm && (
                      <StatRow label="Périmètre retenu" value={`${perimeterKm} km${wasExpanded ? " (élargi)" : ""}`} />
                    )}
                    {dvfStats.marketPressure && (
                      <StatRow
                        label="Pression de marché appliquée"
                        value={`${dvfStats.marketPressure.adjustment > 0 ? "+" : ""}${(dvfStats.marketPressure.adjustment * 100).toFixed(1)} %`}
                      />
                    )}
                    <StatRow label="Source données" value={dvfStats.source === "csv" ? "Fichier DGFiP local" : dvfStats.source === "api" ? "API temps réel" : "Mixte CSV + API"} />
                    {dvfStats.isIndexed && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="text-green-500 text-xs">✅</span>
                        <span className="text-xs text-slate-600">Prix indexés en valeur 2025</span>
                      </div>
                    )}
                    {(dvfStats.dvfLiveCount ?? 0) > 0 && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="text-emerald-500 text-xs">🟢</span>
                        <span className="text-xs text-slate-600">
                          Données DVF Live incluses ({dvfStats.dvfLiveCount} transaction{(dvfStats.dvfLiveCount ?? 0) > 1 ? "s" : ""} récente{(dvfStats.dvfLiveCount ?? 0) > 1 ? "s" : ""})
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Fiabilité */}
                <Card className="shadow-sm rounded-xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">⚠️ Fiabilité</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    {retained < 5 ? (
                      <div className="flex items-start gap-2">
                        <span className="text-amber-500 shrink-0">⚠️</span>
                        <span className="text-xs text-slate-700">Données partielles : seulement {retained} transaction{retained !== 1 ? "s" : ""} retenue{retained !== 1 ? "s" : ""}</span>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <span className="text-green-500 shrink-0">✅</span>
                        <span className="text-xs text-slate-700">Échantillon suffisant ({retained} transactions)</span>
                      </div>
                    )}
                    {cv > 0.2 ? (
                      <div className="flex items-start gap-2">
                        <span className="text-amber-500 shrink-0">⚠️</span>
                        <span className="text-xs text-slate-700">Dispersion élevée (σ/médiane = {(cv * 100).toFixed(0)} %) — fourchette large</span>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <span className="text-green-500 shrink-0">✅</span>
                        <span className="text-xs text-slate-700">Dispersion homogène (σ/médiane = {(cv * 100).toFixed(0)} %)</span>
                      </div>
                    )}
                    {excluded > retained ? (
                      <div className="flex items-start gap-2">
                        <span className="text-red-500 shrink-0">❌</span>
                        <span className="text-xs text-slate-700">{excluded} transactions aberrantes exclues — résultat à interpréter avec prudence</span>
                      </div>
                    ) : excluded > 0 ? (
                      <div className="flex items-start gap-2">
                        <span className="text-slate-400 shrink-0">ℹ️</span>
                        <span className="text-xs text-slate-600">{excluded} valeur{excluded !== 1 ? "s" : ""} aberrante{excluded !== 1 ? "s" : ""} exclue{excluded !== 1 ? "s" : ""} (IQR × 1.5)</span>
                      </div>
                    ) : null}
                    {wasExpanded && (
                      <div className="flex items-start gap-2">
                        <span className="text-slate-400 shrink-0">ℹ️</span>
                        <span className="text-xs text-slate-600">Périmètre élargi de {requestedRadiusKm} à {perimeterKm} km faute de données suffisantes</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })()}</TabsContent>

        {/* ─── Tab 4 : Contexte ──────────────────────────────────────────── */}
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

        {/* ─── Tab 5 : Bien (+ Proximités + SWOT) ───────────────────────── */}
        <TabsContent value="bien" className="space-y-5 mt-0">
          {/* Row 1 : Caractéristiques + Destinataire */}
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
                <InfoRow label="Vue" value={(() => {
                  const vueLabels: Record<string, string> = {
                    lac: "Vue lac / mer",
                    panoramique: "Vue panoramique / montagne",
                    degagee: "Vue dégagée",
                    standard: "Vue standard",
                    vis_a_vis: "Vue sur vis-à-vis",
                    route_parking: "Vue sur route / parking",
                    voie_ferree: "Vue sur voie ferrée",
                    montagne: "Vue montagne",
                    jardin: "Vue sur jardin",
                    cour: "Vue sur cour",
                    rue: "Vue sur rue",
                  };
                  const v = serialized.view as string | null;
                  return v ? (vueLabels[v] ?? v) : null;
                })()} />
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
                {(() => {
                  const contraintes = [
                    Boolean(serialized.hasBruit) && "Nuisances sonores",
                    Boolean(serialized.hasCopropDegradee) && "Copropriété dégradée",
                    Boolean(serialized.hasExpositionNord) && "Exposition Nord",
                    Boolean(serialized.hasRDCSansExterieur) && "RDC sans extérieur",
                  ].filter(Boolean) as string[];
                  return contraintes.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs text-orange-600 font-medium mb-1.5">Contraintes</p>
                      <div className="flex flex-wrap gap-1.5">
                        {contraintes.map((c) => (
                          <span key={c} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-orange-50 text-orange-700 border border-orange-200">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </CardContent>
            </Card>

            {/* Destinataire */}
            <Card className="shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-slate-500" />
                  Destinataire de l&apos;avis de valeur
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
              </CardContent>
            </Card>
          </div>

          {/* Row 2 : Carte des équipements OSM */}
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
                ) : serialized.proximities === undefined ? (
                  <p className="text-xs text-slate-400 italic">Données proximités non disponibles — re-simuler pour les obtenir.</p>
                ) : (
                  <p className="text-xs text-slate-400 italic">Aucun équipement recensé dans un rayon de 1 km.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Row 3 : Table des distances */}
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

          {/* Row 4 : SWOT */}
          <Card className="shadow-sm rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Analyse forces &amp; faiblesses</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <SwotTable swot={swot} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 6 : Livrables ─────────────────────────────────────────── */}
        <TabsContent value="livrables" className="space-y-5 mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Analyse IA rapide */}
            <Card className="shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bot className="h-4 w-4 text-slate-500" />
                  Analyse IA rapide (GPT-4o)
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <GptAnalyzeButton analysisId={serialized.id as string} />
                <p className="text-xs text-slate-400 mt-2">
                  Synthèse automatique du bien et du marché. Le résultat apparaît dans l&apos;onglet Résultats.
                </p>
              </CardContent>
            </Card>

            {/* Export PDF */}
            <Card className="shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-500" />
                  Export PDF
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <PdfExportButtons analysisId={serialized.id as string} />
                <p className="text-xs text-slate-400">
                  <strong>Expert</strong> : rapport complet avec données DVF, risques, comparables, SWOT.<br />
                  <strong>Client</strong> : avis de valeur simplifié, à remettre au propriétaire.
                </p>
              </CardContent>
            </Card>

            {/* Gamma */}
            <Card className="shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-slate-500" />
                  Présentation Gamma
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <GammaButtons analysisId={serialized.id as string} expertPrompt={gammaExpertPrompt} clientPrompt={gammaClientPrompt} />
                <p className="text-xs text-slate-400">
                  Génère un prompt prêt à coller dans Gamma pour créer une présentation PowerPoint professionnelle.
                </p>
              </CardContent>
            </Card>

            {/* Ressources externes */}
            {pappersMapUrl && (
              <Card className="shadow-sm rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Map className="h-4 w-4 text-slate-500" />
                    Ressources externes
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 flex flex-wrap gap-3">
                  <a
                    href={pappersMapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
                  >
                    <Map className="h-4 w-4" />
                    Carte du secteur (Pappers Immobilier)
                  </a>
                </CardContent>
              </Card>
            )}
          </div>

          {/* DVF Immo Analyst — GPT personnalisé + Analyses IA intégrées */}
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
