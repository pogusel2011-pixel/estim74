import { PropertyInput } from "@/types/property";
import { ActiveListing } from "@/types/listing";
import { QualitativeComparison } from "@/types/listing";
import { MarketPressureData } from "@/types/dvf";
import { DVFStats } from "@/types/dvf";
import { scoreComparison } from "@/lib/valuation/scoring";
import { BUSINESS_RULES } from "@/lib/rules/business-rules";
import { percentile } from "@/lib/utils";

export function buildQualitativeComparisons(
  subject: PropertyInput,
  listings: ActiveListing[]
): QualitativeComparison[] {
  return listings.map((listing) => {
    const { subjectScore, listingScore, adjustmentFactor } = scoreComparison(subject, listing);
    const delta = subjectScore - listingScore;
    const adjustedPrice = Math.round(listing.price * (1 + adjustmentFactor));

    const factors: QualitativeComparison["factors"] = [];
    if (subject.surface !== listing.surface) {
      const diff = ((subject.surface - listing.surface) / listing.surface) * 100;
      factors.push({ label: "Surface", impact: diff > 0 ? "positive" : "negative", value: `${subject.surface} vs ${listing.surface} m²` });
    }
    if (subject.dpeLetter && listing.dpe && subject.dpeLetter !== listing.dpe) {
      const dpeOrder = ["A","B","C","D","E","F","G"];
      const better = dpeOrder.indexOf(subject.dpeLetter) < dpeOrder.indexOf(listing.dpe);
      factors.push({ label: "DPE", impact: better ? "positive" : "negative", value: `${subject.dpeLetter} vs ${listing.dpe}` });
    }
    if (subject.hasPool && !listing.features?.includes("piscine")) {
      factors.push({ label: "Piscine", impact: "positive", value: "Présente" });
    }

    return { listingId: listing.id, subjectScore, listingScore, delta, adjustedPrice, factors };
  });
}

/**
 * Calcule la pression de marché affiché/signé (méthode pro).
 *
 * Compare la médiane des annonces actives (prix affiché) vs la médiane DVF (prix signé).
 * Retourne un ajustement plafonné à ±MARKET_PRESSURE_CAP (5%), calculé comme
 * gap × MARKET_PRESSURE_WEIGHT (0.25).
 *
 * Exemple : affiché 4 500 €/m², signé 3 864 €/m² → gap +16.4% → ajustement +4.1%
 *
 * @returns MarketPressureData ou null si données insuffisantes
 */
export function computeMarketPressure(
  dvfStats: DVFStats | null,
  listings: ActiveListing[]
): MarketPressureData | null {
  if (!dvfStats || dvfStats.medianPsm <= 0) return null;
  if (listings.length === 0) return null;

  const validPsms = listings
    .map((l) => l.pricePsm)
    .filter((p) => p != null && p > 0);
  if (validPsms.length === 0) return null;

  const WEIGHT = BUSINESS_RULES.MARKET_PRESSURE_WEIGHT.value;
  const CAP = BUSINESS_RULES.MARKET_PRESSURE_CAP.value;

  const medianListingPsm = Math.round(
    validPsms.length === 1 ? validPsms[0] : percentile(validPsms, 50)
  );

  const dvfMedianPsm = dvfStats.medianPsm;
  const gapPct = ((medianListingPsm - dvfMedianPsm) / dvfMedianPsm) * 100;

  // Fraction prudente de l'écart, plafonnée à ±CAP
  const rawAdjustment = (gapPct / 100) * WEIGHT;
  const adjustment = Math.max(-CAP, Math.min(CAP, rawAdjustment));

  console.log(
    `[marketPressure] affiché: ${medianListingPsm} €/m² | signé DVF: ${dvfMedianPsm} €/m² ` +
    `| gap: ${gapPct.toFixed(1)}% | ajustement appliqué: ${(adjustment * 100).toFixed(2)}%`
  );

  return { medianListingPsm, dvfMedianPsm, gapPct, adjustment };
}
