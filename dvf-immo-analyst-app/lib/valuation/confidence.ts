import { DVFStats, DVFComparable } from "@/types/dvf";
import { ConfidenceFactors } from "@/types/valuation";
import { BUSINESS_RULES } from "@/lib/rules/business-rules";

const R = BUSINESS_RULES;

/**
 * Calcule le score de qualité des données DVF sur 100 points (4 composantes).
 *
 * Densité      0-30 pts : nombre de ventes retenues
 * Fraîcheur    0-25 pts : date médiane des comparables (ou newestDate)
 * Proximité    0-25 pts : distance médiane des comparables
 * Homogénéité  0-20 pts : coefficient de variation std/médiane
 *
 * Score final converti en 0-1 pour rétro-compatibilité DB/UI (÷ 100).
 */
export function computeConfidence(
  dvfStats: DVFStats | null | undefined,
  _subjectSurface?: number,
  comparables?: DVFComparable[],
  perimeterKm?: number,
): { score: number; label: string; factors: ConfidenceFactors } {
  if (!dvfStats) {
    const factors = { density: 0, freshness: 0, proximity: 0, homogeneity: 0, total: 0 };
    return { score: 0.08, label: "Insuffisant", factors };
  }

  // ── 1. DENSITÉ (0-30 pts) ────────────────────────────────────────────────
  const count = dvfStats.count;
  const density =
    count >= R.CONFIDENCE_DENSITY_HIGH.value   ? 30 :
    count >= R.CONFIDENCE_DENSITY_MEDIUM.value ? 20 :
    count >= R.CONFIDENCE_DENSITY_LOW.value    ? 10 : 0;

  // ── 2. FRAÎCHEUR (0-25 pts) ──────────────────────────────────────────────
  // Préfère la date médiane des comparables, sinon newestDate des stats DVF
  let freshnessAgeMonths: number;
  if (comparables && comparables.length > 0) {
    const dates = comparables
      .map(c => new Date(c.date).getTime())
      .sort((a, b) => a - b);
    const medianTs = dates[Math.floor(dates.length / 2)];
    freshnessAgeMonths = (Date.now() - medianTs) / (1000 * 60 * 60 * 24 * 30.5);
  } else {
    const newest = dvfStats.newestDate
      ? new Date(dvfStats.newestDate).getTime()
      : Date.now() - dvfStats.periodMonths * 30.5 * 24 * 3600 * 1000;
    freshnessAgeMonths = (Date.now() - newest) / (1000 * 60 * 60 * 24 * 30.5);
  }
  const freshness =
    freshnessAgeMonths < R.CONFIDENCE_FRESHNESS_12M.value ? 25 :
    freshnessAgeMonths < R.CONFIDENCE_FRESHNESS_24M.value ? 18 :
    freshnessAgeMonths < R.CONFIDENCE_FRESHNESS_36M.value ? 10 : 5;

  // ── 3. PROXIMITÉ (0-25 pts) ───────────────────────────────────────────────
  // Distance médiane des comparables ou rayon utilisé en fallback
  let medianDistM: number | null = null;
  if (comparables && comparables.length > 0) {
    const dists = comparables
      .filter(c => c.distanceM != null)
      .map(c => c.distanceM!)
      .sort((a, b) => a - b);
    if (dists.length > 0) {
      medianDistM = dists[Math.floor(dists.length / 2)];
    }
  }
  const refDistM = medianDistM ?? (perimeterKm != null ? perimeterKm * 1000 : null);
  const proximity =
    refDistM == null                                  ? 8  :
    refDistM <= R.CONFIDENCE_PROXIMITY_NEAR.value     ? 25 :
    refDistM <= R.CONFIDENCE_PROXIMITY_MID.value      ? 15 :
    refDistM <= R.CONFIDENCE_PROXIMITY_FAR.value      ? 8  : 4;

  // ── 4. HOMOGÉNÉITÉ (0-20 pts) ─────────────────────────────────────────────
  // CV = fsd/médiane si disponible (préféré), sinon stdPsm/médiane, sinon approx. IQR/1.35
  let cv: number | null = null;
  const stdForCv = (dvfStats.fsd ?? dvfStats.stdPsm) ?? 0;
  if (stdForCv > 0 && dvfStats.medianPsm > 0) {
    cv = stdForCv / dvfStats.medianPsm;
  } else if (dvfStats.medianPsm > 0) {
    const iqr = dvfStats.p75Psm - dvfStats.p25Psm;
    cv = iqr / (dvfStats.medianPsm * 1.35);
  }
  const homogeneity =
    cv == null                                          ? 10 :
    cv < R.CONFIDENCE_HOMOGENEITY_LOW_CV.value          ? 20 :
    cv < R.CONFIDENCE_HOMOGENEITY_MID_CV.value          ? 12 :
    cv < R.CONFIDENCE_HOMOGENEITY_HIGH_CV.value         ? 6  : 0;

  // ── Score total ──────────────────────────────────────────────────────────
  const total = density + freshness + proximity + homogeneity;
  const score = Math.round(total) / 100; // 0-1 pour rétro-compat

  const label =
    total >= R.CONFIDENCE_LEVEL_TRES_BONNE.value ? "Très bonne" :
    total >= R.CONFIDENCE_LEVEL_BONNE.value       ? "Bonne"      :
    total >= R.CONFIDENCE_LEVEL_MOYENNE.value     ? "Moyenne"    :
    total >= R.CONFIDENCE_LEVEL_FAIBLE.value      ? "Faible"     : "Insuffisant";

  return {
    score,
    label: label as never,
    factors: { density, freshness, proximity, homogeneity, total },
  };
}
