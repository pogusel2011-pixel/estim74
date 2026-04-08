export type PropertyType = "APARTMENT" | "HOUSE" | "LAND" | "COMMERCIAL";
export type Condition = "TO_RENOVATE" | "AVERAGE" | "GOOD" | "EXCELLENT";
export type DPELetter = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export type GHGGrade = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export type Orientation = "N" | "NE" | "E" | "SE" | "S" | "SO" | "O" | "NO";
export type Mitoyennete = "individuelle" | "mitoyenne_un_cote" | "mitoyenne_deux_cotes";

export interface PropertyInput {
  // Localisation
  address?: string;
  postalCode?: string;
  city?: string;
  lat?: number;
  lng?: number;
  irisCode?: string;

  // Caractéristiques
  propertyType: PropertyType;
  surface: number;
  rooms?: number;
  bedrooms?: number;
  floor?: number;
  totalFloors?: number;
  landSurface?: number;
  yearBuilt?: number;
  condition: Condition;

  // Énergie
  dpeLetter?: DPELetter;
  ghgGrade?: GHGGrade;

  // Options
  hasParking: boolean;
  hasGarage: boolean;
  hasBalcony: boolean;
  hasTerrace: boolean;
  hasCellar: boolean;
  hasPool: boolean;
  hasElevator: boolean;
  orientation?: Orientation;
  view?: string;
  mitoyennete?: Mitoyennete;

  // Contraintes du bien (malus qualitatifs)
  hasBruit?: boolean;
  hasCopropDegradee?: boolean;
  hasExpositionNord?: boolean;
  hasRDCSansExterieur?: boolean;
}
