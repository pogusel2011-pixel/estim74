import { MarketReading } from "@/types/analysis";
import { loadAllCsvMutations } from "@/lib/dvf/csv-loader";
import { fetchDeptStats } from "@/lib/dvf/dept-stats";
import { percentile } from "@/lib/utils";

/**
 * Contrôle de marché fondé exclusivement sur les données DVF officielles (CSV DGFiP).
 *
 * Toutes les APIs Notaires publiques testées sont inaccessibles :
 *   – api.notaires.fr → 404  (aucun endpoint exposé)
 *   – leprixdelimmo.notaires.fr → 404 (backend Spring Boot, routes non publiées)
 *   – meilleursagents.com → 403
 *
 * Ce module calcule à partir du CSV local (353 k transactions, 74, 2020–2025) :
 *   – Tendance récente 6 mois  (médiane J-0/J-6m vs J-6m/J-12m)
 *   – Tendance annuelle 12 mois (médiane J-0/J-12m vs J-12m/J-24m)
 *   – Médiane locale (12 derniers mois) vs médiane dép. 74
 *   – Indicateur de divergence local/dép (> 10% → badge avertissement)
 */

const APP_TO_DVF_TYPE: Record<string, string> = {
  APARTMENT: "Appartement",
  HOUSE:     "Maison",
  LAND:      "Terrain",
};

function medianSorted(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function filterOutliersIQR(sorted: number[]): number[] {
  if (sorted.length < 4) return sorted;
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;
  return sorted.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
}

declare global {
  // eslint-disable-next-line no-var
  var __marketCheckCache: Map<string, { result: MarketReading; ts: number }> | null;
}
global.__marketCheckCache = global.__marketCheckCache ?? null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function fetchNotairesMarket(
  postalCode: string | undefined | null,
  propertyType: string
): Promise<MarketReading | null> {
  const dvfType = APP_TO_DVF_TYPE[propertyType] ?? "";
  const cacheKey = `${postalCode ?? "ALL"}|${dvfType}`;

  if (!global.__marketCheckCache) global.__marketCheckCache = new Map();
  const cached = global.__marketCheckCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.result;

  try {
    const [all, deptBenchmark] = await Promise.all([
      loadAllCsvMutations(),
      fetchDeptStats(propertyType),
    ]);

    const now = Date.now();
    const MS_6M  = 183 * 24 * 3600 * 1000;
    const MS_12M = 365 * 24 * 3600 * 1000;
    const MS_24M = 730 * 24 * 3600 * 1000;

    const cut6m  = new Date(now - MS_6M);
    const cut12m = new Date(now - MS_12M);
    const cut24m = new Date(now - MS_24M);

    const psmLast6m:  number[] = [];
    const psmPrev6m:  number[] = [];
    const psmLocal12: number[] = [];
    const psmPrevYr:  number[] = [];

    for (const m of all) {
      if (m.nature_mutation !== "Vente") continue;
      if (dvfType && m.type_local !== dvfType) continue;

      const surface = m.surface_reelle_bati ?? m.lot1_surface_carrez;
      if (!surface || surface < 9) continue;
      if (!m.valeur_fonciere || m.valeur_fonciere < 1000) continue;

      const psm = m.valeur_fonciere / surface;
      if (psm < 300 || psm > 25_000) continue;

      const matchesCommune = !postalCode || m.code_postal === postalCode;
      if (!matchesCommune) continue;

      const d = new Date(m.date_mutation);

      if (d >= cut12m) {
        psmLocal12.push(psm);
        if (d >= cut6m) psmLast6m.push(psm);
        else            psmPrev6m.push(psm);
      } else if (d >= cut24m) {
        psmPrevYr.push(psm);
      }
    }

    psmLast6m.sort( (a, b) => a - b);
    psmPrev6m.sort( (a, b) => a - b);
    psmLocal12.sort((a, b) => a - b);
    psmPrevYr.sort( (a, b) => a - b);

    const cLast6  = filterOutliersIQR(psmLast6m);
    const cPrev6  = filterOutliersIQR(psmPrev6m);
    const cLocal12 = filterOutliersIQR(psmLocal12);
    const cPrevYr = filterOutliersIQR(psmPrevYr);

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

    const communeMedianPsm = cLocal12.length >= 5
      ? Math.round(medianSorted(cLocal12))
      : undefined;
    const deptMedianPsm = deptBenchmark?.medianPsm;

    let divergencePct: number | undefined;
    if (communeMedianPsm && deptMedianPsm && deptMedianPsm > 0) {
      divergencePct = Math.round(((communeMedianPsm - deptMedianPsm) / deptMedianPsm) * 100);
    }

    const trendPct = trend12m ?? trend6m;
    const trend: MarketReading["trend"] =
      trendPct == null ? "stable"
      : trendPct >  1.5 ? "hausse"
      : trendPct < -1.5 ? "baisse"
      : "stable";

    const supplyDemand: MarketReading["supplyDemand"] =
      trend === "hausse" ? "tendu" : trend === "baisse" ? "detendu" : "equilibre";

    const result: MarketReading = {
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
        count6m:  cLast6.length,
        count12m: cLocal12.length,
        source: "Demandes de Valeurs Foncières — DGFiP (data.gouv.fr)",
      },
    };

    global.__marketCheckCache.set(cacheKey, { result, ts: Date.now() });

    const divergeLog = divergencePct != null
      ? ` | écart local/dép: ${divergencePct > 0 ? "+" : ""}${divergencePct}%`
      : "";
    console.log(
      `[MarketCheck DVF] ${postalCode ?? "74"} ${dvfType || "all"} | ` +
      `6m: ${trend6m != null ? (trend6m > 0 ? "+" : "") + trend6m + "%" : "n/d"} | ` +
      `12m: ${trend12m != null ? (trend12m > 0 ? "+" : "") + trend12m + "%" : "n/d"}` +
      divergeLog
    );

    return result;
  } catch (err) {
    console.warn("[MarketCheck DVF] Erreur:", err);
    return null;
  }
}

function buildCommentary(
  trend: "hausse" | "stable" | "baisse",
  trendPct: number | undefined,
  postalCode: string | undefined | null
): string {
  const loc = postalCode ? `sur le secteur ${postalCode}` : "en Haute-Savoie (74)";
  if (trend === "hausse" && trendPct != null)
    return `Les prix signés DVF ${loc} progressent de +${trendPct.toFixed(1)}% sur 12 mois, traduisant une demande soutenue. Source : DGFiP DVF officiel.`;
  if (trend === "baisse" && trendPct != null)
    return `Les prix signés DVF ${loc} reculent de ${trendPct.toFixed(1)}% sur 12 mois. Source : DGFiP DVF officiel.`;
  return `Les prix signés DVF ${loc} sont globalement stables sur 12 mois. Source : DGFiP DVF officiel.`;
}
