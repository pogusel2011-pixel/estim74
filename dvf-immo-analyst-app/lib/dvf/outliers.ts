import { DVFMutation } from "@/types/dvf";
import { percentile } from "@/lib/utils";
import { BUSINESS_RULES } from "@/lib/rules/business-rules";

/** Facteur IQR utilisé pour la détection des valeurs aberrantes (RULE_OUTLIER_IQR_FACTOR_V1 = 2.0) */
const IQR_FACTOR = BUSINESS_RULES.OUTLIER_IQR_FACTOR.value;

/**
 * Marque les mutations dont le prix/m² est hors bornes IQR×2.
 * Toutes les mutations sont conservées ; les aberrantes ont `outlier=true`.
 * Contrairement à removeOutliers, cette fonction ne filtre PAS — elle annote.
 */
export function markOutliers(mutations: DVFMutation[]): DVFMutation[] {
  const psms = mutations
    .map((m) => m.prix_m2)
    .filter((p): p is number => p != null && p > 0);

  if (psms.length < 4) return mutations;

  const q1 = percentile(psms, 25);
  const q3 = percentile(psms, 75);
  const iqr = q3 - q1;
  const lower = q1 - IQR_FACTOR * iqr;
  const upper = q3 + IQR_FACTOR * iqr;

  return mutations.map((m) => {
    if (!m.prix_m2 || m.prix_m2 <= 0) return m;
    if (m.prix_m2 < lower || m.prix_m2 > upper) {
      const adresse = [m.adresse_numero, m.adresse_nom_voie, m.nom_commune]
        .filter(Boolean).join(" ");
      console.warn(
        `[DVF outlier] Exclu — adresse: "${adresse}" | date: ${m.date_mutation} ` +
        `| prix/m²: ${m.prix_m2} €/m² | bornes: [${Math.round(lower)}, ${Math.round(upper)}]`
      );
      return { ...m, outlier: true, outlierReason: "prix_m2_aberrant" };
    }
    return { ...m, outlier: false };
  });
}

/**
 * Filtre définitif des outliers (legacy — utilisé uniquement si excludeOutliers=true côté requête).
 * Pour l'affichage, préférer markOutliers + filtrage côté stats.
 */
export function removeOutliers(mutations: DVFMutation[]): DVFMutation[] {
  return markOutliers(mutations).filter((m) => !m.outlier);
}

export function computePrixM2(mutations: DVFMutation[]): DVFMutation[] {
  return mutations.map((m) => {
    let surface: number | undefined;

    if (m.type_local) {
      surface = m.surface_reelle_bati ?? m.lot1_surface_carrez;
    } else {
      surface = m.surface_terrain;
    }

    if (surface && surface > 0 && m.valeur_fonciere > 0) {
      return { ...m, prix_m2: Math.round(m.valeur_fonciere / surface) };
    }
    return m;
  });
}
