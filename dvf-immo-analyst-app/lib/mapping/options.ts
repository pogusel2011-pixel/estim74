import { PropertyType, Condition } from "@/types/property";

export const PROPERTY_TYPE_OPTIONS: { value: PropertyType; label: string }[] = [
  { value: "APARTMENT", label: "Appartement" },
  { value: "HOUSE", label: "Maison" },
  { value: "LAND", label: "Terrain" },
  { value: "COMMERCIAL", label: "Local commercial" },
];

export const CONDITION_OPTIONS: { value: Condition; label: string; description: string }[] = [
  { value: "TO_RENOVATE", label: "À rénover", description: "Travaux importants nécessaires" },
  { value: "AVERAGE", label: "État moyen", description: "Entretien courant à prévoir" },
  { value: "GOOD", label: "Bon état", description: "Bien entretenu, prêt à vivre" },
  { value: "EXCELLENT", label: "Excellent état", description: "Rénové ou neuf, finitions haut de gamme" },
];

export const DPE_OPTIONS = ["A","B","C","D","E","F","G"].map((v) => ({ value: v, label: "DPE " + v }));

export const ORIENTATION_OPTIONS = [
  { value: "N", label: "Nord" }, { value: "NE", label: "Nord-Est" },
  { value: "E", label: "Est" }, { value: "SE", label: "Sud-Est" },
  { value: "S", label: "Sud" }, { value: "SO", label: "Sud-Ouest" },
  { value: "O", label: "Ouest" }, { value: "NO", label: "Nord-Ouest" },
];

export const VIEW_OPTIONS = [
  { value: "degagee", label: "Vue dégagée" },
  { value: "lac", label: "Vue lac / mer" },
  { value: "montagne", label: "Vue montagne" },
  { value: "jardin", label: "Vue jardin" },
  { value: "rue", label: "Vue sur rue" },
  { value: "cour", label: "Vue sur cour" },
];
