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
  { value: "lac",          label: "Vue lac / mer (+5%)" },
  { value: "panoramique",  label: "Vue panoramique / montagne (+3%)" },
  { value: "degagee",      label: "Vue dégagée (+1,5%)" },
  { value: "standard",     label: "Vue standard (0%)" },
  { value: "vis_a_vis",    label: "Vue sur vis-à-vis (-2%)" },
  { value: "route_parking", label: "Vue sur route / parking (-2%)" },
  { value: "voie_ferree",  label: "Vue sur voie ferrée (-3%)" },
];
