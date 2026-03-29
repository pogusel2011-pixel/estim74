import { ActiveListing } from "@/types/listing";
import { percentile } from "@/lib/utils";
import { BUSINESS_RULES } from "@/lib/rules/business-rules";

const IQR_FACTOR = BUSINESS_RULES.OUTLIER_IQR_FACTOR.value;
const MEDIAN_DEVIATION_THRESHOLD = BUSINESS_RULES.OUTLIER_MEDIAN_DEVIATION.value;

/**
 * Marque les annonces actives dont le prix/m² est aberrant selon deux critères cumulatifs :
 *
 * Passe 1 — IQR×2 : tout ce qui est hors [Q1 − 2×IQR, Q3 + 2×IQR] est marqué outlier.
 * Passe 2 — Déviation médiane ±40% : calcul de la médiane sur le set propre (passe 1),
 *   puis marquage de toute annonce dont le prix/m² s'écarte de plus de 40% de cette médiane.
 *
 * Toutes les annonces sont conservées ; les aberrantes ont `outlier=true`.
 * Nécessite au moins 4 annonces pour activer le filtre (sinon retourne sans modification).
 */
export function markListingOutliers(listings: ActiveListing[]): ActiveListing[] {
  const validPsms = listings
    .map((l) => l.pricePsm)
    .filter((p): p is number => p != null && p > 0);

  if (validPsms.length < 4) return listings;

  // ── Passe 1 : filtre IQR ─────────────────────────────────────────────────
  const q1 = percentile(validPsms, 25);
  const q3 = percentile(validPsms, 75);
  const iqr = q3 - q1;
  const lower = q1 - IQR_FACTOR * iqr;
  const upper = q3 + IQR_FACTOR * iqr;

  const afterIQR = listings.map((l) => {
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

  // ── Passe 2 : filtre déviation médiane ───────────────────────────────────
  const cleanPsms = afterIQR
    .filter((l) => !l.outlier && l.pricePsm != null && l.pricePsm > 0)
    .map((l) => l.pricePsm!);

  if (cleanPsms.length < 2) return afterIQR;

  const median = percentile(cleanPsms, 50);

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
