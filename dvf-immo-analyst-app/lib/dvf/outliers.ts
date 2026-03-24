import { DVFMutation } from "@/types/dvf";
import { percentile } from "@/lib/utils";
import { OUTLIER_IQR_FACTOR } from "@/lib/constants";

export function removeOutliers(mutations: DVFMutation[]): DVFMutation[] {
  const psms = mutations.map((m) => m.prix_m2).filter((p): p is number => p != null && p > 0);
  if (psms.length < 4) return mutations;

  const q1 = percentile(psms, 25);
  const q3 = percentile(psms, 75);
  const iqr = q3 - q1;
  const lower = q1 - OUTLIER_IQR_FACTOR * iqr;
  const upper = q3 + OUTLIER_IQR_FACTOR * iqr;

  return mutations.filter((m) => {
    if (!m.prix_m2) return true;
    return m.prix_m2 >= lower && m.prix_m2 <= upper;
  });
}

export function computePrixM2(mutations: DVFMutation[]): DVFMutation[] {
  return mutations.map((m) => {
    const surface = m.surface_reelle_bati ?? m.surface_terrain;
    if (surface && surface > 0 && m.valeur_fonciere > 0) {
      return { ...m, prix_m2: Math.round(m.valeur_fonciere / surface) };
    }
    return m;
  });
}
