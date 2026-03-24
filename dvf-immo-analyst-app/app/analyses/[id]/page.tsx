import { notFound } from "next/navigation";
import Link from "next/link";
import { FileDown } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { AnalysisSummaryPanel } from "@/components/analysis/analysis-summary";
import { ValuationCards } from "@/components/analysis/valuation-cards";
import { DVFComparablesTable } from "@/components/dvf/dvf-comparables-table";
import { DVFStatsPanel } from "@/components/dvf/dvf-stats-panel";
import { MarketTrendChart } from "@/components/dvf/market-trend-chart";
import { ActiveListingsPanel } from "@/components/listings/active-listings-panel";
import { DVFRecentSalesPanel } from "@/components/listings/dvf-recent-sales-panel";
import { MarketReading } from "@/components/analysis/market-reading";
import { PerimeterPanel } from "@/components/analysis/perimeter-panel";
import { GPTActionsPanel } from "@/components/gpt/gpt-actions-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDVFMutations } from "@/lib/dvf/client";
import { computePrixM2, removeOutliers } from "@/lib/dvf/outliers";
import { computeDVFStats } from "@/lib/dvf/stats";
import { toComparables } from "@/lib/dvf/comparables";
import { propertyTypeToDvfTypes } from "@/lib/mapping/property-type";
import { DVFStats, DVFComparable } from "@/types/dvf";

export const dynamic = "force-dynamic";

export default async function AnalysisPage({ params }: { params: { id: string } }) {
  const analysis = await prisma.analysis.findUnique({ where: { id: params.id } });
  if (!analysis) notFound();

  const serialized = JSON.parse(JSON.stringify(analysis));

  // If the analysis has no dvfStats saved (e.g. seeded records), fetch live
  let dvfStats: DVFStats | null = serialized.dvfStats ?? null;
  let dvfComparables: DVFComparable[] = serialized.dvfComparables ?? [];
  let liveFinalRadiusKm: number | null = null;
  let liveRequestedRadiusKm: number | null = null;

  if (!dvfStats && serialized.lat && serialized.lng) {
    try {
      const dvfTypes = propertyTypeToDvfTypes(serialized.propertyType);
      const requestedRadius = serialized.perimeterKm ?? 0.5;
      const monthsBack = serialized.dvfPeriodMonths ?? 24;
      const { mutations, source, radiusKm: finalRadius } = await getDVFMutations(
        serialized.lat,
        serialized.lng,
        requestedRadius,
        monthsBack,
        dvfTypes
      );
      liveRequestedRadiusKm = requestedRadius;
      liveFinalRadiusKm = finalRadius;
      let enriched = computePrixM2(mutations);
      enriched = removeOutliers(enriched);
      dvfStats = computeDVFStats(enriched);
      if (dvfStats) dvfStats.source = source;
      dvfComparables = toComparables(enriched, serialized.surface);
    } catch (err) {
      console.error("[AnalysisPage] DVF live fetch error:", err);
    }
  }

  const perimeterKm = liveFinalRadiusKm ?? serialized.perimeterKm;
  const requestedRadiusKm = liveRequestedRadiusKm ?? serialized.requestedRadiusKm;

  // Map propertyType to DVF type string for the trend chart
  const dvfTypeForChart = serialized.propertyType === "APARTMENT" ? "Appartement"
    : serialized.propertyType === "HOUSE" ? "Maison"
    : serialized.propertyType === "LAND" ? "Terrain"
    : undefined;

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <AnalysisSummaryPanel analysis={serialized} />
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
          <Link href={`/analyses/${serialized.id}/print`} target="_blank" rel="noopener noreferrer">
            <FileDown className="h-4 w-4" />
            Exporter PDF
          </Link>
        </Button>
      </div>

      {/* Valorisation */}
      <ValuationCards
        low={serialized.valuationLow}
        mid={serialized.valuationMid}
        high={serialized.valuationHigh}
        psm={serialized.valuationPsm}
        confidence={serialized.confidence}
        confidenceLabel={serialized.confidenceLabel}
        adjustments={serialized.adjustments}
        dvfSampleSize={serialized.dvfSampleSize}
        perimeterKm={perimeterKm}
      />

      {/* Tabs secondaires */}
      <Tabs defaultValue="dvf" className="w-full">
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="dvf">DVF</TabsTrigger>
          <TabsTrigger value="listings">Annonces</TabsTrigger>
          <TabsTrigger value="market">Marché</TabsTrigger>
          <TabsTrigger value="gpt">IA</TabsTrigger>
        </TabsList>

        <TabsContent value="dvf" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <DVFStatsPanel
              stats={dvfStats}
              sampleSize={serialized.dvfSampleSize}
              perimeterKm={perimeterKm}
              requestedRadiusKm={requestedRadiusKm}
            />
            <div className="lg:col-span-2">
              <PerimeterPanel lat={serialized.lat} lng={serialized.lng} perimeterKm={perimeterKm} />
            </div>
          </div>
          <DVFComparablesTable comparables={dvfComparables} />
        </TabsContent>

        <TabsContent value="listings" className="space-y-4 mt-4">
          {(serialized.listings ?? []).length > 0 ? (
            <ActiveListingsPanel listings={serialized.listings ?? []} />
          ) : null}
          <DVFRecentSalesPanel comparables={dvfComparables} />
        </TabsContent>

        <TabsContent value="market" className="space-y-4 mt-4">
          <MarketReading marketReading={serialized.marketReading} />
          {serialized.lat && serialized.lng && (
            <MarketTrendChart
              lat={serialized.lat}
              lng={serialized.lng}
              radiusKm={Math.max(perimeterKm ?? 2, 2)}
              propertyType={dvfTypeForChart}
            />
          )}
        </TabsContent>

        <TabsContent value="gpt" className="mt-4">
          <GPTActionsPanel analysisId={serialized.id} initialOutputs={serialized.gptOutputs ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
