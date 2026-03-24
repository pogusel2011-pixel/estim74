import { PropertyType } from "@/types/property";

export const DVF_LOCAL_TYPES: Record<PropertyType, string[]> = {
  APARTMENT: ["Appartement"],
  HOUSE: ["Maison"],
  LAND: ["Terrain"],
  COMMERCIAL: ["Local industriel. commercial ou assimilé", "Dépendance"],
};

export function dvfTypeToPropertyType(dvfType: string): PropertyType | null {
  for (const [propType, dvfTypes] of Object.entries(DVF_LOCAL_TYPES)) {
    if (dvfTypes.includes(dvfType)) return propType as PropertyType;
  }
  return null;
}

export function propertyTypeToDvfTypes(type: PropertyType): string[] {
  return DVF_LOCAL_TYPES[type] ?? [];
}

export const MOTEURIMMO_TYPE_MAP: Record<PropertyType, string> = {
  APARTMENT: "appartement",
  HOUSE: "maison",
  LAND: "terrain",
  COMMERCIAL: "local-commercial",
};
