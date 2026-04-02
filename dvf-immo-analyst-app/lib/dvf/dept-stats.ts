import { DeptBenchmark } from "@/types/dvf";
import { loadAllCsvMutations } from "./csv-loader";
import { loadDbDeptStats } from "./db-stats";
import { percentile } from "@/lib/utils";

// ─── Cache global keyed par type de bien (24h TTL) ──────────────────────────
// Évite de recalculer à chaque requête tout en restant frais après un redémarrage.
declare global {
  // eslint-disable-next-line no-var
  var __dvfDeptStatsCache: Map<string, { result: DeptBenchmark; ts: number }> | null;
}
global.__dvfDeptStatsCache = global.__dvfDeptStatsCache ?? null;

const DEPT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

/** Mappe un type de bien applicatif → libellé DVF du CSV */
const APP_TO_DVF_TYPE: Record<string, string> = {
  APARTMENT: "Appartement",
  HOUSE: "Maison",
  LAND: "Terrain",
};

/** Médiane d'un tableau trié (ne trie pas lui-même — passer un tableau déjà trié) */
function medianSorted(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Filtre outliers par IQR × 1.5 sur un tableau de valeurs (déjà trié) */
function filterOutliersIQR(sorted: number[]): number[] {
  if (sorted.length < 4) return sorted;
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return sorted.filter((v) => v >= lo && v <= hi);
}

/**
 * Calcule les statistiques DVF départementales Haute-Savoie (74)
 * directement depuis le CSV local en mémoire.
 *
 * Remplace l'appel immoapi.app/v1/stats qui retournait HTTP 404.
 *
 * Calcule :
 *  - médiane €/m² département (toutes années confondues — données indexées 2025)
 *  - évolution annuelle = (médiane 0-12 mois − médiane 12-24 mois) / médiane 12-24 mois
 *  - nombre de transactions propres retenues
 *
 * Cache global 24 h keyed par typeLocal pour ne pas recalculer à chaque requête.
 */
export async function fetchDeptStats(
  propertyType?: string | null
): Promise<DeptBenchmark | null> {
  const dvfTypeLocal = propertyType ? (APP_TO_DVF_TYPE[propertyType] ?? "") : "";
  const cacheKey = dvfTypeLocal || "ALL";

  // ── Cache hit ────────────────────────────────────────────────────────────
  if (!global.__dvfDeptStatsCache) {
    global.__dvfDeptStatsCache = new Map();
  }
  const cached = global.__dvfDeptStatsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < DEPT_CACHE_TTL_MS) {
    return cached.result;
  }

  // ── Mode base de données (Neon) ──────────────────────────────────────────
  if (process.env.DVF_SOURCE === "database") {
    const result = await loadDbDeptStats(propertyType);
    if (result) global.__dvfDeptStatsCache!.set(cacheKey, { result, ts: Date.now() });
    return result;
  }

  // ── Mode CSV local ────────────────────────────────────────────────────────
  const all = await loadAllCsvMutations();
  if (all.length === 0) {
    console.warn("[DeptStats] CSV vide ou non chargé — benchmark indisponible");
    return null;
  }

  const now = Date.now();
  const MS_12M = 365.25 * 24 * 3600 * 1000;
  const cutoff24m = new Date(now - 2 * MS_12M);
  const cutoff12m = new Date(now - MS_12M);

  // ── Extraction des prix/m² valides ──────────────────────────────────────
  const psmAll: number[] = [];
  const psm0to12: number[] = [];  // derniers 12 mois
  const psm12to24: number[] = []; // 12-24 mois (pour évolution YoY)

  for (const m of all) {
    // Filtre type
    if (m.nature_mutation !== "Vente") continue;
    if (dvfTypeLocal && m.type_local !== dvfTypeLocal) continue;
    if (!dvfTypeLocal && m.type_local !== "Appartement" && m.type_local !== "Maison") continue;

    // Surface valide
    const surface = m.surface_reelle_bati ?? m.lot1_surface_carrez;
    if (!surface || surface < 9) continue;

    // Prix valide
    if (!m.valeur_fonciere || m.valeur_fonciere < 1000) continue;

    const psm = m.valeur_fonciere / surface;
    // Sanity check global : entre 300 et 25 000 €/m² (couvre tout le marché 74)
    if (psm < 300 || psm > 25_000) continue;

    psmAll.push(psm);

    // Sous-périodes pour évolution
    const mDate = new Date(m.date_mutation);
    if (mDate >= cutoff12m) {
      psm0to12.push(psm);
    } else if (mDate >= cutoff24m) {
      psm12to24.push(psm);
    }
  }

  if (psmAll.length < 5) {
    console.warn("[DeptStats] Données CSV insuffisantes pour le benchmark départemental");
    return null;
  }

  // ── Médiane départementale (sur toutes les années, après filtrage outliers) ─
  psmAll.sort((a, b) => a - b);
  const psmClean = filterOutliersIQR(psmAll);
  const medianPsm = Math.round(medianSorted(psmClean));

  // ── Évolution annuelle YoY ───────────────────────────────────────────────
  let evolutionPct: number | undefined;
  if (psm0to12.length >= 5 && psm12to24.length >= 5) {
    psm0to12.sort((a, b) => a - b);
    psm12to24.sort((a, b) => a - b);
    const med0to12 = medianSorted(filterOutliersIQR(psm0to12));
    const med12to24 = medianSorted(filterOutliersIQR(psm12to24));
    if (med12to24 > 0) {
      evolutionPct = Math.round(((med0to12 - med12to24) / med12to24) * 1000) / 10;
    }
  }

  const result: DeptBenchmark = {
    codeDepement: "74",
    typeLocal: dvfTypeLocal || "Appartements & Maisons",
    medianPsm,
    evolutionPct,
    totalTransactions: psmClean.length,
  };

  global.__dvfDeptStatsCache.set(cacheKey, { result, ts: now });

  console.log(
    `[DeptStats] 74 CSV — médiane ${medianPsm} €/m²` +
    (evolutionPct != null ? `, évol. ${evolutionPct > 0 ? "+" : ""}${evolutionPct}% YoY` : "") +
    `, ${psmClean.length.toLocaleString("fr-FR")} transactions` +
    (dvfTypeLocal ? ` (${dvfTypeLocal})` : " (toutes catégories)")
  );

  return result;
}
