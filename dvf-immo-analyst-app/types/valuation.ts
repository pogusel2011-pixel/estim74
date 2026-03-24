export interface ValuationResult {
  low: number;
  mid: number;
  high: number;
  pricePsm: number;
  confidence: number;
  confidenceLabel: "Indicative" | "Faible" | "Correcte" | "Bonne" | "Très bonne" | "Excellente";
  method: "dvf_stats" | "comparables" | "mixed" | "fallback";
  adjustments: Adjustment[];
  breakdown: ValuationBreakdown;
}

export interface Adjustment {
  label: string;
  factor: number;
  impact: number;
  category: "condition" | "floor" | "energy" | "features" | "orientation" | "view";
}

export interface ValuationBreakdown {
  basePrice: number;
  basePsm: number;
  adjustedPsm: number;
  totalAdjustmentFactor: number;
  dvfWeight: number;
  listingsWeight: number;
}

export interface ConfidenceFactors {
  sampleSize: number;
  dataFreshness: number;
  priceDispersion: number;
  surfaceMatch: number;
  geographicDensity: number;
}
