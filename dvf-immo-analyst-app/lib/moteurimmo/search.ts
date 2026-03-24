import { PropertyInput } from "@/types/property";
import { ActiveListing } from "@/types/listing";
import { searchMoteurImmo, isApiKeyConfigured } from "./client";
import { SURFACE_RANGE_FACTOR } from "@/lib/constants";

export { isApiKeyConfigured };

export interface FindListingsOptions {
  /** Code INSEE de la commune (ex: "74010") — préféré au code postal */
  inseeCode?: string;
  /** Lat/lng du bien sujet pour calculer la distance de chaque annonce */
  lat?: number;
  lng?: number;
}

/**
 * Recherche les annonces actives comparables via l'API MoteurImmo.
 * Filtre par code INSEE, type de bien et fourchette de surface ±20%.
 * Trie les résultats par distance croissante.
 * Retourne [] silencieusement si API non configurée ou en erreur.
 */
export async function findActiveListings(
  property: PropertyInput,
  opts?: FindListingsOptions
): Promise<ActiveListing[]> {
  const inseeCode = opts?.inseeCode ?? property.postalCode ?? "";
  const subjectLat = opts?.lat ?? property.lat;
  const subjectLng = opts?.lng ?? property.lng;

  const surfaceMin = Math.round(property.surface * (1 - SURFACE_RANGE_FACTOR));
  const surfaceMax = Math.round(property.surface * (1 + SURFACE_RANGE_FACTOR));

  const listings = await searchMoteurImmo({
    inseeCode,
    propertyType: property.propertyType,
    surfaceMin,
    surfaceMax,
    maxLength: 30,
    subjectLat,
    subjectLng,
  });

  // Tri par distance croissante (annonces sans coords en dernier)
  return listings.sort((a, b) => {
    if (a.distance == null && b.distance == null) return 0;
    if (a.distance == null) return 1;
    if (b.distance == null) return -1;
    return a.distance - b.distance;
  });
}
