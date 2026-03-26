/**
 * ESTIM'74 — Registre des règles métier versionnées
 *
 * TOUTES les valeurs numériques importantes de l'application sont ici.
 * Pour modifier une règle, changez sa valeur ET incrémentez sa version.
 * Les composants référencent BUSINESS_RULES.xxx.value pour éviter toute duplication.
 */
export const BUSINESS_RULES = {
  // ── Géographie / périmètre DVF ─────────────────────────────────────────────
  GEO_RADIUS_INITIAL: {
    id: "RULE_GEO_RADIUS_INITIAL_V1",
    value: 0.5,
    unit: "km",
    description: "Rayon initial de recherche DVF (avant auto-expansion)",
    version: "V1",
  },
  GEO_RADIUS_EXPANSION_STEP: {
    id: "RULE_GEO_RADIUS_STEP_V1",
    value: 0.5,
    unit: "km",
    description: "Pas d'expansion automatique du rayon si < MIN_SAMPLES ventes",
    version: "V1",
  },
  GEO_RADIUS_MAX: {
    id: "RULE_GEO_RADIUS_MAX_V1",
    value: 5,
    unit: "km",
    description: "Rayon maximum d'expansion automatique",
    version: "V1",
  },

  // ── Qualité des données / comparables ──────────────────────────────────────
  MIN_SAMPLE_SIZE: {
    id: "RULE_MIN_SAMPLE_V1",
    value: 5,
    unit: "ventes",
    description: "Seuil minimal de ventes pour une estimation fiable (non indicative)",
    version: "V1",
  },
  TOP_COMPARABLES_COUNT: {
    id: "RULE_TOP_COMPARABLES_V1",
    value: 8,
    unit: "comparables",
    description: "Nombre de comparables clés à mettre en avant (badge ★)",
    version: "V1",
  },
  SURFACE_TOLERANCE: {
    id: "RULE_SURFACE_TOLERANCE_40_V1",
    value: 0.40,
    unit: "%",
    description: "Tolérance ±40% sur la surface pour la sélection des comparables",
    version: "V1",
  },

  // ── Ajustements qualitatifs ────────────────────────────────────────────────
  QUALITATIVE_CAP: {
    id: "RULE_QUALITATIVE_CAP_20_V1",
    value: 0.20,
    unit: "%",
    description: "Plafond global des ajustements qualitatifs (±20%)",
    version: "V1",
  },

  // ── Score de qualité — seuils (0-100 pts) ─────────────────────────────────
  CONFIDENCE_DENSITY_HIGH: {
    id: "RULE_CONFIDENCE_DENSITY_HIGH_V1",
    value: 10,
    unit: "ventes",
    description: "Seuil densité haute — ≥10 ventes = 30 pts",
    version: "V1",
  },
  CONFIDENCE_DENSITY_MEDIUM: {
    id: "RULE_CONFIDENCE_DENSITY_MEDIUM_V1",
    value: 4,
    unit: "ventes",
    description: "Seuil densité moyenne — 4-9 ventes = 20 pts",
    version: "V1",
  },
  CONFIDENCE_DENSITY_LOW: {
    id: "RULE_CONFIDENCE_DENSITY_LOW_V1",
    value: 2,
    unit: "ventes",
    description: "Seuil densité faible — 2-3 ventes = 10 pts",
    version: "V1",
  },
  CONFIDENCE_FRESHNESS_12M: {
    id: "RULE_CONFIDENCE_FRESH_12M_V1",
    value: 12,
    unit: "mois",
    description: "Fraîcheur : < 12 mois = 25 pts (score maximal)",
    version: "V1",
  },
  CONFIDENCE_FRESHNESS_24M: {
    id: "RULE_CONFIDENCE_FRESH_24M_V1",
    value: 24,
    unit: "mois",
    description: "Fraîcheur : 12-24 mois = 18 pts",
    version: "V1",
  },
  CONFIDENCE_FRESHNESS_36M: {
    id: "RULE_CONFIDENCE_FRESH_36M_V1",
    value: 36,
    unit: "mois",
    description: "Fraîcheur : 24-36 mois = 10 pts — au-delà = 5 pts",
    version: "V1",
  },
  CONFIDENCE_PROXIMITY_NEAR: {
    id: "RULE_CONFIDENCE_PROX_500_V1",
    value: 500,
    unit: "m",
    description: "Proximité : rayon ≤ 500 m = 25 pts",
    version: "V1",
  },
  CONFIDENCE_PROXIMITY_MID: {
    id: "RULE_CONFIDENCE_PROX_800_V1",
    value: 800,
    unit: "m",
    description: "Proximité : rayon ≤ 800 m = 15 pts",
    version: "V1",
  },
  CONFIDENCE_PROXIMITY_FAR: {
    id: "RULE_CONFIDENCE_PROX_1000_V1",
    value: 1000,
    unit: "m",
    description: "Proximité : rayon ≤ 1000 m = 8 pts — au-delà = 4 pts",
    version: "V1",
  },
  CONFIDENCE_HOMOGENEITY_LOW_CV: {
    id: "RULE_CONFIDENCE_HOMO_15_V1",
    value: 0.15,
    unit: "ratio",
    description: "Homogénéité : CV < 15% = 20 pts (très homogène)",
    version: "V1",
  },
  CONFIDENCE_HOMOGENEITY_MID_CV: {
    id: "RULE_CONFIDENCE_HOMO_25_V1",
    value: 0.25,
    unit: "ratio",
    description: "Homogénéité : CV 15-25% = 12 pts",
    version: "V1",
  },
  CONFIDENCE_HOMOGENEITY_HIGH_CV: {
    id: "RULE_CONFIDENCE_HOMO_35_V1",
    value: 0.35,
    unit: "ratio",
    description: "Homogénéité : CV 25-35% = 6 pts — au-delà = 0 pts",
    version: "V1",
  },

  // ── Score qualité — niveaux (sur 100 pts) ─────────────────────────────────
  CONFIDENCE_LEVEL_TRES_BONNE: {
    id: "RULE_CONF_LEVEL_75_V1",
    value: 75,
    unit: "pts",
    description: "Qualité Très bonne : ≥ 75/100",
    version: "V1",
  },
  CONFIDENCE_LEVEL_BONNE: {
    id: "RULE_CONF_LEVEL_55_V1",
    value: 55,
    unit: "pts",
    description: "Qualité Bonne : ≥ 55/100",
    version: "V1",
  },
  CONFIDENCE_LEVEL_MOYENNE: {
    id: "RULE_CONF_LEVEL_35_V1",
    value: 35,
    unit: "pts",
    description: "Qualité Moyenne : ≥ 35/100",
    version: "V1",
  },
  CONFIDENCE_LEVEL_FAIBLE: {
    id: "RULE_CONF_LEVEL_15_V1",
    value: 15,
    unit: "pts",
    description: "Qualité Faible : ≥ 15/100",
    version: "V1",
  },

  // ── Matrice de refus ───────────────────────────────────────────────────────
  REFUSAL_MIN_COMPARABLES: {
    id: "RULE_REFUSAL_COMPS_V1",
    value: 1,
    unit: "ventes",
    description: "Refus bloquant si 0-1 vente DVF retenue",
    version: "V1",
  },
  WARNING_LOW_COMPARABLES_THRESHOLD: {
    id: "RULE_WARNING_COMPS_V1",
    value: 3,
    unit: "ventes",
    description: "Avertissement si 2-3 ventes DVF seulement",
    version: "V1",
  },
  WARNING_HIGH_DISPERSION_CV: {
    id: "RULE_WARNING_CV_40_V1",
    value: 0.40,
    unit: "ratio",
    description: "Avertissement si CV des prix/m² > 40% (marché hétérogène)",
    version: "V1",
  },
  WARNING_OLD_COMPARABLES_MONTHS: {
    id: "RULE_WARNING_OLD_36M_V1",
    value: 36,
    unit: "mois",
    description: "Avertissement si date médiane des comparables > 36 mois",
    version: "V1",
  },

  // ── Détection des valeurs aberrantes DVF (outliers) ───────────────────────
  OUTLIER_IQR_FACTOR: {
    id: "RULE_OUTLIER_IQR_FACTOR_V1",
    value: 2.0,
    unit: "×IQR",
    description: "Facteur IQR pour la détection des outliers DVF : Q1 - 2×IQR / Q3 + 2×IQR",
    version: "V1",
  },

  // ── Pression de marché affiché/signé ──────────────────────────────────────
  MARKET_PRESSURE_WEIGHT: {
    id: "RULE_MARKET_PRESSURE_WEIGHT_V1",
    value: 0.25,
    unit: "ratio",
    description: "Fraction de l'écart affiché/signé appliquée comme ajustement de pression marché",
    version: "V1",
  },
  MARKET_PRESSURE_CAP: {
    id: "RULE_MARKET_PRESSURE_CAP_V1",
    value: 0.05,
    unit: "%",
    description: "Plafond de l'ajustement de pression de marché (±5% maximum)",
    version: "V1",
  },
} as const;

export type BusinessRuleKey = keyof typeof BUSINESS_RULES;
