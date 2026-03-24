import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AnalysisSummaryPanel } from "@/components/analysis/analysis-summary";
import { ValuationCards } from "@/components/analysis/valuation-cards";
import { DVFComparablesTable } from "@/components/dvf/dvf-comparables-table";
import { DVFStatsPanel } from "@/components/dvf/dvf-stats-panel";
import { ActiveListingsPanel } from "@/components/listings/active-listings-panel";
import { MarketReading } from "@/components/analysis/market-reading";
import { PerimeterPanel } from "@/components/analysis/perimeter-panel";
import { GPTActionsPanel } from "@/components/gpt/gpt-actions-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

export default async function AnalysisPage({ params }: { params: { id: string } }) {
  const analysis = await prisma.analysis.findUnique({ where: { id: params.id } });
  if (!analysis) notFound();

  const serialized = JSON.parse(JSON.stringify(analysis));

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <AnalysisSummaryPanel analysis={serialized} />

      {/* Valorisation */}
      <ValuationCards
        low={serialized.valuationLow}
        mid={serialized.valuationMid}
        high={serialized.valuationHigh}
        psm={serialized.valuationPsm}
        confidence={serialized.confidence}
        confidenceLabel={serialized.confidenceLabel}
        adjustments={serialized.adjustments}
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
            <DVFStatsPanel stats={serialized.dvfStats} sampleSize={serialized.dvfSampleSize} perimeterKm={serialized.perimeterKm} />
            <div className="lg:col-span-2">
              <PerimeterPanel lat={serialized.lat} lng={serialized.lng} perimeterKm={serialized.perimeterKm} />
            </div>
          </div>
          <DVFComparablesTable comparables={serialized.dvfComparables ?? []} />
        </TabsContent>

        <TabsContent value="listings" className="mt-4">
          <ActiveListingsPanel listings={serialized.listings ?? []} />
        </TabsContent>

        <TabsContent value="market" className="mt-4">
          <MarketReading marketReading={serialized.marketReading} />
        </TabsContent>

        <TabsContent value="gpt" className="mt-4">
          <GPTActionsPanel analysisId={serialized.id} initialOutputs={serialized.gptOutputs ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
