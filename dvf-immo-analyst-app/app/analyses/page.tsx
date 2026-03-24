import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnalysisHistoryList } from "@/components/history/analysis-history-list";

export const dynamic = "force-dynamic";

export default async function AnalysesPage() {
  const analyses = await prisma.analysis.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, createdAt: true, address: true, city: true,
      propertyType: true, surface: true, valuationMid: true,
      confidence: true, confidenceLabel: true, status: true, notes: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analyses</h1>
          <p className="text-muted-foreground text-sm">{analyses.length} estimation{analyses.length !== 1 ? "s" : ""} enregistrée{analyses.length !== 1 ? "s" : ""}</p>
        </div>
        <Button asChild>
          <Link href="/analyses/new">
            <Plus className="mr-2 h-4 w-4" /> Nouvelle estimation
          </Link>
        </Button>
      </div>
      <AnalysisHistoryList analyses={analyses.map(a => ({ ...a, createdAt: a.createdAt.toISOString(), valuationMid: a.valuationMid ?? undefined, confidence: a.confidence ?? undefined, confidenceLabel: a.confidenceLabel ?? undefined, notes: a.notes ?? undefined, status: a.status as never, propertyType: a.propertyType as never }))} />
    </div>
  );
}
