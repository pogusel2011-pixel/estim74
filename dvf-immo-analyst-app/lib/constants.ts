export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  APARTMENT: "Appartement",
  HOUSE: "Maison",
  LAND: "Terrain",
  COMMERCIAL: "Local commercial",
};

export const CONDITION_LABELS: Record<string, string> = {
  TO_RENOVATE: "À rénover",
  AVERAGE: "État moyen",
  GOOD: "Bon état",
  EXCELLENT: "Excellent état",
};

export const DPE_COLORS: Record<string, string> = {
  A: "#00A651", B: "#53B947", C: "#BAD531", D: "#FFD700", E: "#F7941D", F: "#ED1C24", G: "#9B1C1C",
};

export const CONFIDENCE_COLORS: Record<string, string> = {
  "Indicative": "#D97706",
  "Faible": "#EF4444",
  "Correcte": "#F97316",
  "Bonne": "#EAB308",
  "Très bonne": "#22C55E",
  "Excellente": "#10B981",
};

export const DVF_TYPE_MAP: Record<string, string[]> = {
  APARTMENT: ["Appartement"],
  HOUSE: ["Maison"],
  LAND: ["Terrain"],
  COMMERCIAL: ["Local industriel. commercial ou assimilé", "Dépendance"],
};

export const DEFAULT_PERIMETER_KM = 0.5;
export const MAX_PERIMETER_KM = 5;
export const DEFAULT_MONTHS_BACK = 24;
export const MAX_MONTHS_BACK = 60;
export const MIN_SAMPLE_SIZE = 5;
export const OUTLIER_IQR_FACTOR = 1.5;

export const SURFACE_RANGE_FACTOR = 0.4; // ±40% surface pour les comparables
