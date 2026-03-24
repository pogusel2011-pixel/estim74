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
  nombre_pieces_principales?: number;
  surface_terrain?: number;
  lat?: number;
  lon?: number;
  distance_m?: number;
  prix_m2?: number;
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
  rooms?: number;
  landSurface?: number;
  distanceM?: number;
  similarity?: number;
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
