export interface ValuationResult {
  low: number;
  mid: number;
  high: number;
  pricePsm: number;
  confidence: number;
  confidenceLabel: "Indicative" | "Insuffisant" | "Faible" | "Moyenne" | "Bonne" | "Très bonne";
  method: "dvf_stats" | "comparables" | "mixed" | "fallback";
  adjustments: Adjustment[];
  breakdown: ValuationBreakdown;
  listingPriceLow?: number;
  listingPriceHigh?: number;
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

/** Composantes du score de qualité des données (0-100 pts total) */
export interface ConfidenceFactors {
  /** Densité : 0-30 pts — nombre de ventes retenues */
  density: number;
  /** Fraîcheur : 0-25 pts — date médiane des comparables */
  freshness: number;
  /** Proximité : 0-25 pts — distance médiane des comparables */
  proximity: number;
  /** Homogénéité : 0-20 pts — coefficient de variation des prix/m² */
  homogeneity: number;
  /** Total : 0-100 pts */
  total: number;
}
