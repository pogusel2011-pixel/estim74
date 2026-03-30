import { DVFMutation, DVFFilters } from "@/types/dvf";
import { propertyTypeToDvfTypes } from "@/lib/mapping/property-type";
import { loadCsvMutations } from "./csv-loader";

export async function getFilteredMutations(filters: DVFFilters): Promise<DVFMutation[]> {
  const dvfTypes = propertyTypeToDvfTypes(filters.propertyType as never);

  const mutations = await loadCsvMutations(
    filters.lat, filters.lng, filters.radiusKm,
    filters.monthsBack, dvfTypes
  );

  return mutations.filter((m) => {
    const surface = m.surface_reelle_bati ?? (m.type_local === "Terrain" ? m.surface_terrain : undefined);
    if (!surface) return false;
    if (surface < filters.surfaceMin) return false;
    if (surface > filters.surfaceMax) return false;
    return true;
  });
}
