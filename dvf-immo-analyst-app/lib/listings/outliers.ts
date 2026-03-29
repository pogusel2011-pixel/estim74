import { ActiveListing } from "@/types/listing";
import { percentile } from "@/lib/utils";
import { BUSINESS_RULES } from "@/lib/rules/business-rules";

const IQR_FACTOR = BUSINESS_RULES.OUTLIER_IQR_FACTOR.value;
const MEDIAN_DEVIATION_THRESHOLD = BUSINESS_RULES.OUTLIER_MEDIAN_DEVIATION.value;

/**
 * Marque les annonces actives dont le prix/m² est aberrant.
 *
 * Deux passes, appliquées selon le nombre d'annonces :
 *
 * Passe 1 — IQR×2 (uniquement si ≥ 4 annonces) :
 *   Exclut tout ce qui est hors [Q1 − 2×IQR, Q3 + 2×IQR].
 *
 * Passe 2 — Déviation médiane ±40% (dès 2 annonces) :
 *   Calcule la médiane sur le set en entrée de cette passe, puis exclut
 *   toute annonce dont le prix/m² s'écarte de plus de 40% de cette médiane.
 *   Si la passe 1 a été appliquée, la médiane est calculée sur les non-outliers.
 *   Sinon (< 4 annonces), la médiane est calculée sur l'ensemble des annonces —
 *   ce qui permet de détecter les valeurs aberrantes même avec seulement 2-3 annonces.
 *
 * Exemples :
 *   3 annonces [1 473, 3 459, 4 493 €/m²] → médiane = 3 459
 *   Écart de 1 473 : |1473 - 3459| / 3459 = 57 % > 40 % → outlier ✓
 *
 * Toutes les annonces sont conservées ; les aberrantes ont `outlier=true`.
 */
export function markListingOutliers(listings: ActiveListing[]): ActiveListing[] {
  const validPsms = listings
    .map((l) => l.pricePsm)
    .filter((p): p is number => p != null && p > 0);

  // Pas assez de données pour calculer une médiane significative
  if (validPsms.length < 2) return listings;

  // ── Passe 1 : filtre IQR (uniquement si ≥ 4 annonces) ───────────────────
  let afterIQR: ActiveListing[];

  if (validPsms.length >= 4) {
    const q1 = percentile(validPsms, 25);
    const q3 = percentile(validPsms, 75);
    const iqr = q3 - q1;
    const lower = q1 - IQR_FACTOR * iqr;
    const upper = q3 + IQR_FACTOR * iqr;

    afterIQR = listings.map((l) => {
      if (!l.pricePsm || l.pricePsm <= 0) return l;
      if (l.pricePsm < lower || l.pricePsm > upper) {
        console.warn(
          `[Listing outlier IQR] Exclu — "${l.title}" | ${l.city} ` +
          `| prix/m²: ${Math.round(l.pricePsm)} €/m² | bornes IQR: [${Math.round(lower)}, ${Math.round(upper)}]`
        );
        return { ...l, outlier: true, outlierReason: "iqr" as const };
      }
      return { ...l, outlier: false };
    });
  } else {
    // Moins de 4 annonces : on passe directement à la déviation médiane
    afterIQR = listings.map((l) => ({ ...l, outlier: false }));
  }

  // ── Passe 2 : filtre déviation médiane ≥ 40% ────────────────────────────
  // Médiane calculée sur les non-outliers restants (ou sur tout si passe 1 non appliquée)
  const inputPsms = afterIQR
    .filter((l) => !l.outlier && l.pricePsm != null && l.pricePsm > 0)
    .map((l) => l.pricePsm!);

  if (inputPsms.length < 2) return afterIQR;

  const median = percentile(inputPsms, 50);

  return afterIQR.map((l) => {
    if (l.outlier || !l.pricePsm || l.pricePsm <= 0) return l;

    const deviation = Math.abs(l.pricePsm - median) / median;
    if (deviation > MEDIAN_DEVIATION_THRESHOLD) {
      console.warn(
        `[Listing outlier médiane] Exclu — "${l.title}" | ${l.city} ` +
        `| prix/m²: ${Math.round(l.pricePsm)} €/m² | médiane: ${Math.round(median)} €/m² ` +
        `| écart: ${Math.round(deviation * 100)}% (seuil: ${Math.round(MEDIAN_DEVIATION_THRESHOLD * 100)}%)`
      );
      return { ...l, outlier: true, outlierReason: "median" as const };
    }
    return l;
  });
}
