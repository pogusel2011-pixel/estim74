import { DVFMutation, DVFStats } from "@/types/dvf";
import { percentile, standardDeviation } from "@/lib/utils";
import { applyTemporalIndex } from "./temporal-index";

// ── Fonctions de pondération ──────────────────────────────────────────────────

/**
 * Poids distance : max à 0 m, min 0.1 à maxDistM.
 * Linéaire : w = max(0.1, 1 - d / maxDistM)
 */
function distanceWeight(distanceM: number | undefined, maxDistM: number): number {
  if (distanceM == null) return 0.5;
  return Math.max(0.1, 1 - distanceM / maxDistM);
}

/**
 * Poids surface : plein (1.0) si écart ≤ 15%, minimum (0.1) si écart ≥ 40%.
 * Interpolation linéaire entre 15% et 40%.
 */
function surfaceWeight(mutationSurface: number | undefined, subjectSurface: number): number {
  if (!mutationSurface || mutationSurface <= 0) return 0.5;
  const ratio = Math.abs(mutationSurface - subjectSurface) / subjectSurface;
  if (ratio <= 0.15) return 1.0;
  if (ratio >= 0.40) return 0.1;
  return 1.0 - ((ratio - 0.15) / (0.40 - 0.15)) * 0.9;
}

/**
 * Poids date : plein (1.0) si ≤ 6 mois, minimum (0.1) si ≥ 24 mois.
 * Interpolation linéaire entre 6 et 24 mois.
 */
function dateWeight(dateStr: string): number {
  const ageDays = (Date.now() - new Date(dateStr).getTime()) / 86_400_000;
  const ageMonths = ageDays / 30.44;
  if (ageMonths <= 6) return 1.0;
  if (ageMonths >= 24) return 0.1;
  return 1.0 - ((ageMonths - 6) / (24 - 6)) * 0.9;
}

/**
 * Calcule la moyenne pondérée des prix/m² indexés 2025.
 * Poids combiné multiplicatif : distance × surface × récence.
 * Retourne null si moins de 2 mutations valides.
 */
function computeWeightedAvgPsm(
  mutations: DVFMutation[],
  subjectSurface: number
): number | null {
  const valid = mutations.filter(
    (m) => m.prix_m2 != null && m.prix_m2 > 0 && m.date_mutation
  );
  if (valid.length < 2) return null;

  // Rayon de référence = max distance dans le set (adaptif) ou 3000 m min
  const maxDistM = Math.max(
    3000,
    ...valid.map((m) => m.distance_m ?? 0)
  );

  let sumWeightedPsm = 0;
  let sumWeights = 0;

  for (const m of valid) {
    const saleYear = new Date(m.date_mutation).getFullYear();
    const indexedPsm = applyTemporalIndex(m.prix_m2!, saleYear);

    // Surface de la mutation (bati ou terrain)
    const mutSurface = m.surface_reelle_bati ?? m.lot1_surface_carrez ?? m.surface_terrain;

    const w =
      distanceWeight(m.distance_m, maxDistM) *
      surfaceWeight(mutSurface, subjectSurface) *
      dateWeight(m.date_mutation);

    sumWeightedPsm += w * indexedPsm;
    sumWeights += w;
  }

  if (sumWeights === 0) return null;
  return Math.round(sumWeightedPsm / sumWeights);
}

/**
 * Calcule les statistiques DVF sur un ensemble de mutations propres (outliers exclus).
 * Toutes les métriques de prix (médiane, moyenne, Q1, Q3, min, max, écart-type) sont
 * exprimées en valeur indexée 2025 via les indices notariaux Haute-Savoie.
 *
 * @param mutations  Mutations nettoyées (outliers déjà exclus)
 * @param subjectSurface  Surface du bien sujet (m²) — si fournie, calcule aussi la moyenne pondérée
 */
export function computeDVFStats(
  mutations: DVFMutation[],
  subjectSurface?: number
): DVFStats | null {
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

  const weightedAvgPsm =
    subjectSurface != null && subjectSurface > 0
      ? computeWeightedAvgPsm(valid, subjectSurface) ?? undefined
      : undefined;

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
    weightedAvgPsm,
  };
}
