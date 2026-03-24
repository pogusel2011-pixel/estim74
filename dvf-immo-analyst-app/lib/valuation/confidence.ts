import { DVFStats } from "@/types/dvf";
import { ConfidenceFactors } from "@/types/valuation";
import { clamp } from "@/lib/utils";

export function computeConfidence(
  dvfStats: DVFStats | null | undefined,
  subjectSurface: number
): { score: number; label: string; factors: ConfidenceFactors } {
  if (!dvfStats) {
    return { score: 0.3, label: "Faible", factors: { sampleSize: 0, dataFreshness: 0, priceDispersion: 0, surfaceMatch: 0, geographicDensity: 0 } };
  }

  // Taille échantillon (max à 50+ mutations)
  const sampleSize = clamp(dvfStats.count / 50, 0, 1);

  // Fraîcheur (données < 12 mois = 1, > 48 mois = 0.3)
  const ageMonths = dvfStats.periodMonths;
  const dataFreshness = clamp(1 - (ageMonths - 12) / 36, 0.3, 1);

  // Dispersion des prix (IQR/median)
  const iqr = dvfStats.p75Psm - dvfStats.p25Psm;
  const dispersionRatio = iqr / dvfStats.medianPsm;
  const priceDispersion = clamp(1 - dispersionRatio * 2, 0, 1);

  // Match de surface (difficile à mesurer sans les surfaces détaillées)
  const surfaceMatch = 0.7;

  // Densité géographique (proxy: count par km²)
  const geographicDensity = clamp(dvfStats.count / 20, 0, 1);

  const score = (sampleSize * 0.35 + dataFreshness * 0.25 + priceDispersion * 0.2 + surfaceMatch * 0.1 + geographicDensity * 0.1);

  const label =
    score >= 0.85 ? "Excellente" :
    score >= 0.70 ? "Très bonne" :
    score >= 0.55 ? "Bonne" :
    score >= 0.40 ? "Correcte" : "Faible";

  return {
    score: Math.round(score * 100) / 100,
    label: label as never,
    factors: { sampleSize, dataFreshness, priceDispersion, surfaceMatch, geographicDensity },
  };
}
