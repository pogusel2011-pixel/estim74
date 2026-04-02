/**
 * Aggregated DVF statistics computed directly in Neon (no full-table load).
 * Used when DVF_SOURCE=database to avoid loading 353k rows into memory.
 */

import { prisma } from "@/lib/prisma";
import { DeptBenchmark } from "@/types/dvf";
import { MarketReading } from "@/types/analysis";

export interface DVFOverviewStats {
  totalTransactions: number;
  transactionsWithPsm: number;
  medianPsm: number;
  p75Psm: number;
  top5Communes: { commune: string; count: number }[];
  yearlyVolume: { year: number; count: number }[];
}

export async function loadDbOverviewStats(): Promise<DVFOverviewStats> {
  // ── 1. Counts + PSM percentiles ──────────────────────────────────────────
  const psmResult = await prisma.$queryRaw<
    { total_count: bigint; psm_count: bigint; median_psm: number | null; p75_psm: number | null }[]
  >`
    SELECT
      COUNT(*)                                                                      AS total_count,
      COUNT(*) FILTER (WHERE surface_reelle_bati > 0 AND valeur_fonciere > 0)      AS psm_count,
      PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY valeur_fonciere / surface_reelle_bati)
        FILTER (WHERE surface_reelle_bati > 0 AND valeur_fonciere > 0)             AS median_psm,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valeur_fonciere / surface_reelle_bati)
        FILTER (WHERE surface_reelle_bati > 0 AND valeur_fonciere > 0)             AS p75_psm
    FROM "DvfMutation"
    WHERE nature_mutation = 'Vente'
  `;

  // ── 2. Top 5 communes by transaction count ───────────────────────────────
  const communeResult = await prisma.$queryRaw<
    { nom_commune: string; count: bigint }[]
  >`
    SELECT nom_commune, COUNT(*) AS count
    FROM "DvfMutation"
    WHERE nom_commune IS NOT NULL AND nom_commune <> ''
    GROUP BY nom_commune
    ORDER BY count DESC
    LIMIT 5
  `;

  // ── 3. Yearly volume ─────────────────────────────────────────────────────
  const yearResult = await prisma.$queryRaw<
    { year: number; count: bigint }[]
  >`
    SELECT
      EXTRACT(YEAR FROM date_mutation::date)::int AS year,
      COUNT(*) AS count
    FROM "DvfMutation"
    WHERE EXTRACT(YEAR FROM date_mutation::date) >= 2014
    GROUP BY year
    ORDER BY year
  `;

  const row = psmResult[0];

  return {
    totalTransactions: Number(row?.total_count ?? 0),
    transactionsWithPsm: Number(row?.psm_count ?? 0),
    medianPsm: Math.round(row?.median_psm ?? 0),
    p75Psm: Math.round(row?.p75_psm ?? 0),
    top5Communes: communeResult.map((r) => ({
      commune: r.nom_commune,
      count: Number(r.count),
    })),
    yearlyVolume: yearResult.map((r) => ({
      year: r.year,
      count: Number(r.count),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Département benchmark (replaces fetchDeptStats CSV path)
// Uses a CTE to IQR-filter PSM values directly in SQL.
// ─────────────────────────────────────────────────────────────────────────────

export async function loadDbDeptStats(
  propertyType?: string | null,
): Promise<DeptBenchmark | null> {
  const dvfType = propertyType
    ? ({ APARTMENT: "Appartement", HOUSE: "Maison", LAND: "Terrain" }[propertyType] ?? "")
    : "";

  const typeFilter = dvfType
    ? `AND type_local = '${dvfType}'`
    : `AND type_local IN ('Appartement', 'Maison')`;

  const now = new Date();
  const cut12m = new Date(now.getTime() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const cut24m = new Date(now.getTime() - 2 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  type PsmRow = {
    median_all: number | null;
    median_0to12: number | null;
    median_12to24: number | null;
    total_count: bigint;
  };

  const result = await prisma.$queryRawUnsafe<PsmRow[]>(`
    WITH raw AS (
      SELECT
        valeur_fonciere / COALESCE(NULLIF(surface_reelle_bati, 0), NULLIF(lot1_surface_carrez, 0)) AS psm,
        date_mutation
      FROM "DvfMutation"
      WHERE nature_mutation = 'Vente'
        ${typeFilter}
        AND COALESCE(surface_reelle_bati, lot1_surface_carrez) >= 9
        AND valeur_fonciere >= 1000
    ),
    bounds AS (
      SELECT
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY psm) AS q1,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY psm) AS q3
      FROM raw WHERE psm BETWEEN 300 AND 25000
    ),
    filtered AS (
      SELECT raw.psm, raw.date_mutation
      FROM raw, bounds
      WHERE raw.psm BETWEEN (bounds.q1 - 1.5 * (bounds.q3 - bounds.q1))
                        AND (bounds.q3 + 1.5 * (bounds.q3 - bounds.q1))
    )
    SELECT
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psm)                              AS median_all,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psm)
        FILTER (WHERE date_mutation >= '${cut12m}')                                  AS median_0to12,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psm)
        FILTER (WHERE date_mutation >= '${cut24m}' AND date_mutation < '${cut12m}')  AS median_12to24,
      COUNT(*)                                                                        AS total_count
    FROM filtered
  `);

  const r = result[0];
  if (!r || !r.median_all) return null;

  let evolutionPct: number | undefined;
  if (r.median_0to12 && r.median_12to24 && r.median_12to24 > 0) {
    evolutionPct = Math.round(((r.median_0to12 - r.median_12to24) / r.median_12to24) * 1000) / 10;
  }

  return {
    codeDepement: "74",
    typeLocal: dvfType || "Appartements & Maisons",
    medianPsm: Math.round(r.median_all),
    evolutionPct,
    totalTransactions: Number(r.total_count),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Market reading (replaces fetchNotairesMarket CSV path)
// Loads only the per-postal-code / per-type rows (small set) from DB.
// ─────────────────────────────────────────────────────────────────────────────

function medianSorted(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function filterIQR(sorted: number[]): number[] {
  if (sorted.length < 4) return sorted;
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  return sorted.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
}

function buildCommentary(
  trend: "hausse" | "stable" | "baisse",
  trendPct: number | undefined,
  postalCode: string | undefined | null,
): string {
  const loc = postalCode ? `sur le secteur ${postalCode}` : "en Haute-Savoie (74)";
  if (trend === "hausse" && trendPct != null)
    return `Les prix signés DVF ${loc} progressent de +${trendPct.toFixed(1)}% sur 12 mois, traduisant une demande soutenue. Source : DGFiP DVF officiel.`;
  if (trend === "baisse" && trendPct != null)
    return `Les prix signés DVF ${loc} reculent de ${trendPct.toFixed(1)}% sur 12 mois. Source : DGFiP DVF officiel.`;
  return `Les prix signés DVF ${loc} sont globalement stables sur 12 mois. Source : DGFiP DVF officiel.`;
}

export async function loadDbMarketStats(
  postalCode: string | undefined | null,
  propertyType: string,
  deptBenchmark: DeptBenchmark | null,
): Promise<MarketReading | null> {
  const dvfType =
    ({ APARTMENT: "Appartement", HOUSE: "Maison", LAND: "Terrain" } as Record<string, string>)[
      propertyType
    ] ?? "";

  const now = new Date();
  const cut24m = new Date(now.getTime() - 2 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  // Load only the rows we need (filtered by postal code + type + date range)
  const rows = await prisma.dvfMutation.findMany({
    where: {
      nature_mutation: "Vente",
      ...(dvfType ? { type_local: dvfType } : { type_local: { in: ["Appartement", "Maison"] } }),
      ...(postalCode ? { code_postal: postalCode } : {}),
      date_mutation: { gte: cut24m },
    },
    select: {
      valeur_fonciere: true,
      surface_reelle_bati: true,
      lot1_surface_carrez: true,
      date_mutation: true,
    },
  });

  const cut6m = new Date(now.getTime() - 183 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const cut12m = new Date(now.getTime() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const psmLast6m: number[] = [];
  const psmPrev6m: number[] = [];
  const psmLocal12: number[] = [];
  const psmPrevYr: number[] = [];

  for (const m of rows) {
    const surface = m.surface_reelle_bati ?? m.lot1_surface_carrez;
    if (!surface || surface < 9) continue;
    if (!m.valeur_fonciere || m.valeur_fonciere < 1000) continue;
    const psm = m.valeur_fonciere / surface;
    if (psm < 300 || psm > 25_000) continue;

    const d = m.date_mutation;
    if (d >= cut12m) {
      psmLocal12.push(psm);
      if (d >= cut6m) psmLast6m.push(psm);
      else psmPrev6m.push(psm);
    } else {
      psmPrevYr.push(psm);
    }
  }

  const sort = (a: number[]) => [...a].sort((x, y) => x - y);
  const cLast6 = filterIQR(sort(psmLast6m));
  const cPrev6 = filterIQR(sort(psmPrev6m));
  const cLocal12 = filterIQR(sort(psmLocal12));
  const cPrevYr = filterIQR(sort(psmPrevYr));

  let trend6m: number | undefined;
  if (cLast6.length >= 5 && cPrev6.length >= 5) {
    const mL = medianSorted(cLast6);
    const mP = medianSorted(cPrev6);
    if (mP > 0) trend6m = Math.round(((mL - mP) / mP) * 1000) / 10;
  }

  let trend12m: number | undefined;
  if (cLocal12.length >= 5 && cPrevYr.length >= 5) {
    const mL = medianSorted(cLocal12);
    const mP = medianSorted(cPrevYr);
    if (mP > 0) trend12m = Math.round(((mL - mP) / mP) * 1000) / 10;
  }

  const communeMedianPsm = cLocal12.length >= 5 ? Math.round(medianSorted(cLocal12)) : undefined;
  const deptMedianPsm = deptBenchmark?.medianPsm;

  let divergencePct: number | undefined;
  if (communeMedianPsm && deptMedianPsm && deptMedianPsm > 0) {
    divergencePct = Math.round(((communeMedianPsm - deptMedianPsm) / deptMedianPsm) * 100);
  }

  const trendPct = trend12m ?? trend6m;
  const trend: MarketReading["trend"] =
    trendPct == null ? "stable" : trendPct > 1.5 ? "hausse" : trendPct < -1.5 ? "baisse" : "stable";
  const supplyDemand: MarketReading["supplyDemand"] =
    trend === "hausse" ? "tendu" : trend === "baisse" ? "detendu" : "equilibre";

  return {
    trend,
    trendPercent: trend12m,
    supplyDemand,
    commentary: buildCommentary(trend, trendPct, postalCode),
    dvfControl: {
      trend6m,
      trend12m,
      communeMedianPsm,
      deptMedianPsm,
      divergencePct,
      count6m: cLast6.length,
      count12m: cLocal12.length,
      source: "Demandes de Valeurs Foncières — DGFiP (data.gouv.fr)",
    },
  };
}
