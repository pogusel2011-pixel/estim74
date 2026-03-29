import { DVFMutation, DVFStats } from "@/types/dvf";
import { percentile, standardDeviation } from "@/lib/utils";
import { applyTemporalIndex } from "./temporal-index";

/**
 * Calcule les statistiques DVF sur un ensemble de mutations propres (outliers exclus).
 * Toutes les métriques de prix (médiane, moyenne, Q1, Q3, min, max, écart-type) sont
 * exprimées en valeur indexée 2025 via les indices notariaux Haute-Savoie.
 *
 * Cela corrige le biais introduit par les ventes historiques (2014-2020) dont les prix
 * nominaux sont inférieurs aux niveaux actuels, garantissant une médiane représentative
 * du marché en valeurs courantes.
 */
export function computeDVFStats(mutations: DVFMutation[]): DVFStats | null {
  const valid = mutations.filter((m) => m.prix_m2 != null && m.prix_m2 > 0);
  if (valid.length === 0) return null;

  // Indexation temporelle : chaque prix/m² est ramené à son équivalent 2025
  const indexedPsms = valid.map((m) => {
    const saleYear = new Date(m.date_mutation).getFullYear();
    return applyTemporalIndex(m.prix_m2!, saleYear);
  });

  const sorted = [...indexedPsms].sort((a, b) => a - b);
  const dates = valid.map((m) => m.date_mutation).sort();

  const oldest = new Date(dates[0]);
  const newest = new Date(dates[dates.length - 1]);
  const periodMonths = Math.round(
    (newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24 * 30)
  );

  return {
    count: valid.length,
    medianPsm: Math.round(percentile(indexedPsms, 50)),
    meanPsm: Math.round(indexedPsms.reduce((a, b) => a + b, 0) / indexedPsms.length),
    minPsm: Math.round(sorted[0]),
    maxPsm: Math.round(sorted[sorted.length - 1]),
    p25Psm: Math.round(percentile(indexedPsms, 25)),
    p75Psm: Math.round(percentile(indexedPsms, 75)),
    stdPsm: Math.round(standardDeviation(indexedPsms)),
    periodMonths,
    oldestDate: dates[0],
    newestDate: dates[dates.length - 1],
    source: "csv",
    isIndexed: true,
  };
}
