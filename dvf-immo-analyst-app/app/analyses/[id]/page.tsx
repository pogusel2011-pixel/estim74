import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
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
import { ChatGPTButton } from "@/components/gpt/chatgpt-button";
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

  if (!dvfStats && serialized.lat && serialized.lng) {
    try {
      const dvfTypes = propertyTypeToDvfTypes(serialized.propertyType as PropertyType);
      const requestedRadius = (serialized.perimeterKm as number | null) ?? 0.5;
      const monthsBack = (serialized.dvfPeriodMonths as number | null) ?? 24;
      const { mutations, source, radiusKm: finalRadius } = await getDVFMutations(
        serialized.lat as number,
        serialized.lng as number,
        requestedRadius,
        monthsBack,
        dvfTypes
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

  // Map propertyType to DVF type string for the trend chart
  const dvfTypeForChart = serialized.propertyType === "APARTMENT" ? "Appartement"
    : serialized.propertyType === "HOUSE" ? "Maison"
    : serialized.propertyType === "LAND" ? "Terrain"
    : undefined;

  return (
    <div className="space-y-6">
      {/* Breadcrumb / retour */}
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
          <Link href="/analyses">
            <ArrowLeft className="h-4 w-4" />
            Retour aux analyses
          </Link>
        </Button>
      </div>

      {/* En-tête */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <AnalysisSummaryPanel analysis={serialized} />
        </div>
        <div className="flex items-start gap-2 shrink-0 flex-wrap justify-end">
          <ResimulateButton analysisId={serialized.id as string} />
          <ChatGPTButton promptText={chatgptPrompt} variant="outline" size="sm" />
          <PdfExportButtons analysisId={serialized.id as string} />
        </div>
      </div>

      {/* Valorisation */}
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

      {/* Prix d'annonce conseillé */}
      {serialized.valuationMid ? (
        <ListingPriceCard
          listingPriceLow={Math.round((serialized.valuationMid as number) * 1.02)}
          listingPriceHigh={Math.round((serialized.valuationMid as number) * 1.03)}
        />
      ) : null}

      {/* Tabs secondaires */}
      <Tabs defaultValue="dvf" className="w-full">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="dvf">DVF</TabsTrigger>
          <TabsTrigger value="listings">Annonces</TabsTrigger>
          <TabsTrigger value="market">Marché</TabsTrigger>
          <TabsTrigger value="methode">Méthode</TabsTrigger>
          <TabsTrigger value="gpt">IA</TabsTrigger>
        </TabsList>

        <TabsContent value="dvf" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <DVFStatsPanel
              stats={dvfStats}
              sampleSize={serialized.dvfSampleSize as number | null}
              perimeterKm={perimeterKm}
              requestedRadiusKm={requestedRadiusKm}
            />
            <div className="lg:col-span-2">
              {serialized.lat && serialized.lng ? (
                <Card className="flex-1 h-full">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
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
                <Card className="flex-1">
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

        <TabsContent value="listings" className="space-y-4 mt-4">
          <ActiveListingsPanel
            listings={safeListings}
            apiAvailable={apiAvailable}
          />
          <DVFRecentSalesPanel comparables={dvfComparables} />
        </TabsContent>

        <TabsContent value="market" className="space-y-4 mt-4">
          <MarketReading marketReading={safeMarketReading} />
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

        <TabsContent value="methode" className="space-y-4 mt-4">
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

        <TabsContent value="gpt" className="mt-4">
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
