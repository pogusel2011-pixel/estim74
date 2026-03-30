import { PropertyInput } from "@/types/property";
import { DVFStats, DVFComparable } from "@/types/dvf";
import { ActiveListing } from "@/types/listing";
import { ValuationResult } from "@/types/valuation";
import { computeAdjustments, applyAdjustments } from "./adjustments";
import { computeConfidence } from "./confidence";

// Spec Estim74 : Refait neuf +5% | Bon état 0% | Rafraîchissement -4% | Travaux lourds -10%
const CONDITION_COEFFICIENTS: Record<string, number> = {
  EXCELLENT: 0.05,
  GOOD: 0.00,
  AVERAGE: -0.04,
  TO_RENOVATE: -0.10,
};

// Spec Estim74 : A/B +2% | C/D 0% | E -3% | F -6% | G -7%
const DPE_COEFFICIENTS: Record<string, number> = {
  A: 0.02, B: 0.02, C: 0.00, D: 0.00, E: -0.03, F: -0.06, G: -0.07,
};

export function computeValuation(
  property: PropertyInput,
  dvfStats: DVFStats | null,
  listings: ActiveListing[],
  dvfComparables?: DVFComparable[]
): ValuationResult {
  const adjustments = computeAdjustments(property);

  // Ajustement de pression de marché pré-calculé dans dvfStats (par computeMarketPressure)
  const marketPressure = dvfStats?.marketPressure ?? null;
  const marketPressureAdj = marketPressure?.adjustment ?? 0;

  let basePsm: number;
  let dvfWeight = 0;
  let listingsWeight = 0;
  let method: ValuationResult["method"] = "fallback";
  let isIndicative = false;

  if (dvfStats && dvfStats.count >= 5) {
    // Priorité à la moyenne pondérée si disponible, sinon médiane
    const dvfReferencePsm = dvfStats.weightedAvgPsm ?? dvfStats.medianPsm;
    // Appliquer la pression de marché sur le PSM de base DVF
    basePsm = Math.round(dvfReferencePsm * (1 + marketPressureAdj));
    dvfWeight = 0.7;
    method = "dvf_stats";
    if (marketPressureAdj !== 0) {
      console.log(
        `[valuation] Pression marché appliquée : ${(marketPressureAdj * 100).toFixed(2)}% ` +
        `| PSM DVF: ${dvfStats.medianPsm} → PSM base ajusté: ${basePsm}`
      );
    }
  } else if (listings.length >= 3) {
    const avgListingPsm = listings.reduce((s, l) => s + l.pricePsm, 0) / listings.length;
    basePsm = Math.round(avgListingPsm * 0.96);
    listingsWeight = 0.7;
    method = "comparables";
  } else if (dvfStats && dvfStats.count > 0 && listings.length > 0) {
    const dvfReferencePsm = dvfStats.weightedAvgPsm ?? dvfStats.medianPsm;
    const listingsPsm = listings.reduce((s, l) => s + l.pricePsm, 0) / listings.length;
    basePsm = Math.round(dvfReferencePsm * (1 + marketPressureAdj) * 0.7 + listingsPsm * 0.96 * 0.3);
    dvfWeight = 0.7;
    listingsWeight = 0.3;
    method = "mixed";
  } else if (dvfStats && dvfStats.count > 0) {
    // Données DVF limitées (< 5 transactions) — estimation indicative
    const condCoef = CONDITION_COEFFICIENTS[property.condition] ?? 0;
    const dpeCoef = property.dpeLetter ? (DPE_COEFFICIENTS[property.dpeLetter] ?? 0) : 0;
    basePsm = Math.round(dvfStats.medianPsm * (1 + condCoef + dpeCoef));
    dvfWeight = Math.min(dvfStats.count / 5, 0.4);
    method = "fallback";
    isIndicative = true;
  } else {
    return {
      low: 0, mid: 0, high: 0, pricePsm: 0,
      confidence: 0.15, confidenceLabel: "Faible",
      method: "fallback", adjustments: [], breakdown: { basePrice: 0, basePsm: 0, adjustedPsm: 0, totalAdjustmentFactor: 0, dvfWeight: 0, listingsWeight: 0 },
      listingPriceLow: 0, listingPriceHigh: 0,
    };
  }

  const adjustedPsm = isIndicative ? basePsm : applyAdjustments(basePsm, adjustments);
  const totalFactor = adjustments.reduce((sum, a) => sum + a.factor, 0);

  const mid = Math.round(adjustedPsm * property.surface);

  let spread: number;
  if (isIndicative) {
    spread = 0.15;
  } else {
    const fsd = dvfStats?.fsd ?? dvfStats?.stdPsm ?? null;
    if (fsd && fsd > 0 && adjustedPsm > 0) {
      const rawSpread = (1.96 * fsd) / adjustedPsm;
      spread = Math.max(0.04, Math.min(0.20, rawSpread));
    } else {
      spread = 0.08;
    }
  }

  const low = Math.round(mid * (1 - spread));
  const high = Math.round(mid * (1 + spread));

  const { score, label } = computeConfidence(dvfStats, property.surface, dvfComparables);

  return {
    low, mid, high,
    pricePsm: adjustedPsm,
    confidence: isIndicative ? Math.min(score, 0.35) : score,
    confidenceLabel: (isIndicative ? "Indicative" : label) as ValuationResult["confidenceLabel"],
    method,
    adjustments: isIndicative ? [] : adjustments,
    breakdown: {
      basePrice: Math.round(basePsm * property.surface),
      basePsm,
      adjustedPsm,
      totalAdjustmentFactor: Math.round(totalFactor * 1000) / 1000,
      dvfWeight,
      listingsWeight,
    },
    listingPriceLow: Math.round(mid * 1.02),
    listingPriceHigh: Math.round(mid * 1.03),
  };
}
