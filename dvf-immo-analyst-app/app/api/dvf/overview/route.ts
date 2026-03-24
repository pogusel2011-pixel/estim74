import { NextResponse } from "next/server";
import { loadAllCsvMutations } from "@/lib/dvf/csv-loader";
import { computePrixM2 } from "@/lib/dvf/outliers";
import { percentile } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const all = await loadAllCsvMutations();
    const withPsm = computePrixM2(all).filter(m => m.prix_m2 != null && m.prix_m2 > 0);

    const psms = withPsm.map(m => m.prix_m2!);
    const medianPsm = Math.round(percentile(psms, 50));
    const meanPsm = Math.round(psms.reduce((a, b) => a + b, 0) / psms.length);

    // Count by commune
    const byCommune = new Map<string, number>();
    for (const m of all) {
      if (!m.nom_commune) continue;
      byCommune.set(m.nom_commune, (byCommune.get(m.nom_commune) ?? 0) + 1);
    }
    const top5 = Array.from(byCommune.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([commune, count]) => ({ commune, count }));

    // Count by year
    const byYear = new Map<number, number>();
    for (const m of all) {
      const year = new Date(m.date_mutation).getFullYear();
      if (year >= 2014) byYear.set(year, (byYear.get(year) ?? 0) + 1);
    }
    const yearlyVolume = Array.from(byYear.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, count]) => ({ year, count }));

    return NextResponse.json({
      totalTransactions: all.length,
      transactionsWithPsm: withPsm.length,
      medianPsm,
      meanPsm,
      top5Communes: top5,
      yearlyVolume,
    });
  } catch (err) {
    console.error("[GET /api/dvf/overview]", err);
    return NextResponse.json({ error: "Erreur chargement aperçu DVF" }, { status: 500 });
  }
}
