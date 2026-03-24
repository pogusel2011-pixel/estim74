import { PropertyInput } from "@/types/property";
import { DVFStats } from "@/types/dvf";
import { ActiveListing } from "@/types/listing";
import { ValuationResult } from "@/types/valuation";
import { computeAdjustments, applyAdjustments } from "./adjustments";
import { computeConfidence } from "./confidence";

export function computeValuation(
  property: PropertyInput,
  dvfStats: DVFStats | null,
  listings: ActiveListing[]
): ValuationResult {
  const adjustments = computeAdjustments(property);

  let basePsm: number;
  let dvfWeight = 0;
  let listingsWeight = 0;
  let method: ValuationResult["method"] = "fallback";

  if (dvfStats && dvfStats.count >= 5) {
    basePsm = dvfStats.medianPsm;
    dvfWeight = 0.7;
    method = "dvf_stats";
  } else if (listings.length >= 3) {
    const avgListingPsm = listings.reduce((s, l) => s + l.pricePsm, 0) / listings.length;
    // Annonces = prix demandés, on applique un abattement de 3-5%
    basePsm = Math.round(avgListingPsm * 0.96);
    listingsWeight = 0.7;
    method = "comparables";
  } else if (dvfStats && listings.length > 0) {
    const listingsPsm = listings.reduce((s, l) => s + l.pricePsm, 0) / listings.length;
    basePsm = Math.round(dvfStats.medianPsm * 0.7 + listingsPsm * 0.96 * 0.3);
    dvfWeight = 0.7;
    listingsWeight = 0.3;
    method = "mixed";
  } else {
    // Pas de données — on ne peut pas estimer fiablement
    return {
      low: 0, mid: 0, high: 0, pricePsm: 0,
      confidence: 0.2, confidenceLabel: "Faible",
      method: "fallback", adjustments: [], breakdown: { basePrice: 0, basePsm: 0, adjustedPsm: 0, totalAdjustmentFactor: 0, dvfWeight: 0, listingsWeight: 0 },
    };
  }

  const adjustedPsm = applyAdjustments(basePsm, adjustments);
  const totalFactor = adjustments.reduce((sum, a) => sum + a.factor, 0);

  const mid = Math.round(adjustedPsm * property.surface);
  const spread = 0.08; // ±8%
  const low = Math.round(mid * (1 - spread));
  const high = Math.round(mid * (1 + spread));

  const { score, label } = computeConfidence(dvfStats, property.surface);

  return {
    low, mid, high,
    pricePsm: adjustedPsm,
    confidence: score,
    confidenceLabel: label,
    method,
    adjustments,
    breakdown: {
      basePrice: Math.round(basePsm * property.surface),
      basePsm,
      adjustedPsm,
      totalAdjustmentFactor: Math.round(totalFactor * 1000) / 1000,
      dvfWeight,
      listingsWeight,
    },
  };
}
