export interface DVFMutation {
  id_mutation: string;
  date_mutation: string;
  nature_mutation: string;
  valeur_fonciere: number;
  adresse_numero?: string;
  adresse_nom_voie?: string;
  code_postal?: string;
  nom_commune: string;
  code_commune: string;
  code_departement: string;
  id_parcelle?: string;
  type_local?: string;
  surface_reelle_bati?: number;
  lot1_surface_carrez?: number;
  nombre_pieces_principales?: number;
  surface_terrain?: number;
  lat?: number;
  lon?: number;
  distance_m?: number;
  prix_m2?: number;
  /** Source de la donnée : "csv" = fichier local DGFiP, "live" = API cquest.org temps réel */
  _source?: "csv" | "live";
  /** true si la transaction est détectée comme valeur aberrante (hors bornes IQR×2) */
  outlier?: boolean;
  /** Raison de l'exclusion : "prix_m2_aberrant" */
  outlierReason?: string;
}

export interface MarketPressureData {
  /** Médiane des prix/m² affichés dans les annonces actives */
  medianListingPsm: number;
  /** Médiane DVF signée de référence */
  dvfMedianPsm: number;
  /** Écart relatif affiché/signé en % : (listing - dvf) / dvf × 100 */
  gapPct: number;
  /** Ajustement appliqué sur l'estimation, plafonné à ±5% */
  adjustment: number;
}

export interface DVFStats {
  count: number;
  medianPsm: number;
  meanPsm: number;
  minPsm: number;
  maxPsm: number;
  p25Psm: number;
  p75Psm: number;
  stdPsm: number;
  periodMonths: number;
  oldestDate: string;
  newestDate: string;
  source: "csv" | "api" | "mixed";
  /** Nombre de transactions exclues (valeurs aberrantes IQR) — undefined pour anciennes analyses */
  excludedCount?: number;
  /** Données de pression de marché affiché/signé — undefined si indisponible */
  marketPressure?: MarketPressureData;
  /** true si toutes les statistiques (médiane, moyenne, Q1, Q3…) sont en valeur indexée 2025 */
  isIndexed?: boolean;
  /** Moyenne pondérée €/m² indexée 2025 (poids : distance × surface × récence) */
  weightedAvgPsm?: number;
  /**
   * Écart-type des prix/m² indexés (= stdPsm, exposé explicitement pour le
   * calcul de l'intervalle de confiance statistique à 95% : IC = ±1.96 × fsd)
   */
  fsd?: number;
}

export interface DVFComparable {
  id: string;
  date: string;
  address: string;
  city: string;
  type: string;
  surface: number;
  price: number;
  pricePsm: number;
  /** Prix/m² indexé en valeur 2025 (indice notaires Haute-Savoie) — undefined pour anciennes analyses */
  indexedPricePsm?: number;
  rooms?: number;
  landSurface?: number;
  distanceM?: number;
  similarity?: number;
  /** Score composite 0-1 (distance 40% + surface 30% + recency 20% + rooms 10%) */
  score?: number;
  /** true si ce comparable fait partie du top 5-10 les plus pertinents */
  topComparable?: boolean;
  /** Source : "csv" = données locales 2014-2024, "live" = API temps réel */
  source?: "csv" | "live";
  /** true si la transaction est une valeur aberrante exclue du calcul de référence */
  outlier?: boolean;
}

export interface DVFFilters {
  lat: number;
  lng: number;
  radiusKm: number;
  propertyType: string;
  surfaceMin: number;
  surfaceMax: number;
  monthsBack: number;
  excludeOutliers: boolean;
}

/** Benchmark DVF départemental Haute-Savoie (74) via immoapi.app/v1/stats */
export interface DeptBenchmark {
  codeDepement: "74";
  /** Libellé du type de bien filtré : "Appartement", "Maison", "Tous types" */
  typeLocal: string;
  /** Médiane €/m² pour le département et le type de bien */
  medianPsm: number;
  /** Évolution annuelle en % (positif = hausse) — undefined si non disponible */
  evolutionPct?: number;
  /** Nombre total de transactions sur la période considérée */
  totalTransactions?: number;
}
