import { DVFMutation } from "@/types/dvf";
import { percentile } from "@/lib/utils";
import { BUSINESS_RULES } from "@/lib/rules/business-rules";

/** Facteur IQR utilisé pour la détection des valeurs aberrantes (RULE_OUTLIER_IQR_FACTOR_V2 = 1.5) */
const IQR_FACTOR = BUSINESS_RULES.OUTLIER_IQR_FACTOR.value;

/** Seuil de déviation relative par rapport à la médiane (RULE_OUTLIER_MEDIAN_DEV_V1 = 0.40 soit ±40%) */
const MEDIAN_DEVIATION_THRESHOLD = BUSINESS_RULES.OUTLIER_MEDIAN_DEVIATION.value;

/**
 * Marque les mutations dont le prix/m² est aberrant selon deux critères cumulatifs :
 *
 * Passe 1 — IQR×1.5 : tout ce qui est hors [Q1 − 1.5×IQR, Q3 + 1.5×IQR] est marqué outlier.
 * Passe 2 — Déviation médiane ±40% : calcul de la médiane sur le set propre (passe 1),
 *   puis marquage de toute transaction dont le prix/m² s'écarte de plus de 40% de cette médiane.
 *
 * Toutes les mutations sont conservées ; les aberrantes ont `outlier=true`.
 * `outlierReason` précise la cause : "prix_m2_aberrant" (IQR) ou "prix_m2_deviation" (médiane).
 */
export function markOutliers(mutations: DVFMutation[]): DVFMutation[] {
  const psms = mutations
    .map((m) => m.prix_m2)
    .filter((p): p is number => p != null && p > 0);

  if (psms.length < 4) return mutations;

  // ── Passe 1 : filtre IQR ────────────────────────────────────────────────
  const q1 = percentile(psms, 25);
  const q3 = percentile(psms, 75);
  const iqr = q3 - q1;
  const lower = q1 - IQR_FACTOR * iqr;
  const upper = q3 + IQR_FACTOR * iqr;

  const afterIQR = mutations.map((m) => {
    if (!m.prix_m2 || m.prix_m2 <= 0) return m;
    if (m.prix_m2 < lower || m.prix_m2 > upper) {
      const adresse = [m.adresse_numero, m.adresse_nom_voie, m.nom_commune]
        .filter(Boolean).join(" ");
      console.warn(
        `[DVF outlier IQR] Exclu — adresse: "${adresse}" | date: ${m.date_mutation} ` +
        `| prix/m²: ${m.prix_m2} €/m² | bornes IQR: [${Math.round(lower)}, ${Math.round(upper)}]`
      );
      return { ...m, outlier: true, outlierReason: "prix_m2_aberrant" };
    }
    return { ...m, outlier: false };
  });

  // ── Passe 2 : filtre déviation médiane ──────────────────────────────────
  // Calcul de la médiane sur le set propre après IQR
  const cleanPsms = afterIQR
    .filter((m) => !m.outlier && m.prix_m2 != null && m.prix_m2 > 0)
    .map((m) => m.prix_m2!);

  if (cleanPsms.length < 2) return afterIQR;

  const median = percentile(cleanPsms, 50);

  return afterIQR.map((m) => {
    // Ne pas re-tester ce qui est déjà exclu par IQR
    if (m.outlier || !m.prix_m2 || m.prix_m2 <= 0) return m;

    const deviation = Math.abs(m.prix_m2 - median) / median;
    if (deviation > MEDIAN_DEVIATION_THRESHOLD) {
      const adresse = [m.adresse_numero, m.adresse_nom_voie, m.nom_commune]
        .filter(Boolean).join(" ");
      console.warn(
        `[DVF outlier médiane] Exclu — adresse: "${adresse}" | date: ${m.date_mutation} ` +
        `| prix/m²: ${m.prix_m2} €/m² | médiane: ${Math.round(median)} €/m² ` +
        `| écart: ${Math.round(deviation * 100)}% (seuil: ${Math.round(MEDIAN_DEVIATION_THRESHOLD * 100)}%)`
      );
      return { ...m, outlier: true, outlierReason: "prix_m2_deviation" };
    }
    return m;
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
