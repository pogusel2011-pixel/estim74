import { NextResponse } from "next/server";
import { loadCsvMutations } from "@/lib/dvf/csv-loader";
import { computePrixM2 } from "@/lib/dvf/outliers";
import { percentile } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = parseFloat(searchParams.get("lat") ?? "");
    const lng = parseFloat(searchParams.get("lng") ?? "");
    const radius = parseFloat(searchParams.get("radius") ?? "5");
    const type = searchParams.get("type") ?? undefined;

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({ error: "lat et lng requis" }, { status: 400 });
    }

    // Load all mutations for the last 10+ years (130 months ≈ 2014–2024)
    const types = type ? [type] : undefined;
    const rawMutations = await loadCsvMutations(lat, lng, radius, 130, types);
    const mutations = computePrixM2(rawMutations).filter(m => m.prix_m2 != null && m.prix_m2 > 0);

    // Group by year
    const byYear = new Map<number, number[]>();
    for (const m of mutations) {
      const year = new Date(m.date_mutation).getFullYear();
      if (year >= 2014 && year <= new Date().getFullYear()) {
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year)!.push(m.prix_m2!);
      }
    }

    const yearlyStats = Array.from(byYear.entries())
      .map(([year, psms]) => ({
        year,
        medianPsm: Math.round(percentile(psms, 50)),
        meanPsm: Math.round(psms.reduce((a, b) => a + b, 0) / psms.length),
        count: psms.length,
      }))
      .sort((a, b) => a.year - b.year);

    // Compute trend: last 3 years vs previous 3 years
    let trend: "hausse" | "baisse" | "stable" = "stable";
    let trendPct: number | null = null;
    if (yearlyStats.length >= 6) {
      const recent3 = yearlyStats.slice(-3);
      const prev3 = yearlyStats.slice(-6, -3);
      const recentMedian = recent3.reduce((s, y) => s + y.medianPsm, 0) / 3;
      const prevMedian = prev3.reduce((s, y) => s + y.medianPsm, 0) / 3;
      trendPct = Math.round(((recentMedian - prevMedian) / prevMedian) * 100 * 10) / 10;
      trend = trendPct > 3 ? "hausse" : trendPct < -3 ? "baisse" : "stable";
    }

    return NextResponse.json({ yearlyStats, trend, trendPct, totalMutations: mutations.length });
  } catch (err) {
    console.error("[GET /api/dvf/trend]", err);
    return NextResponse.json({ error: "Erreur chargement tendances" }, { status: 500 });
  }
}
