import { PropertyInput } from "@/types/property";
import { ActiveListing } from "@/types/listing";
import { searchMoteurImmo, isApiKeyConfigured } from "./client";
import { SURFACE_RANGE_FACTOR } from "@/lib/constants";

export { isApiKeyConfigured };

export interface FindListingsOptions {
  /** Lat/lng du bien sujet pour calculer la distance de chaque annonce */
  lat?: number;
  lng?: number;
}

/**
 * Recherche les annonces actives comparables via l'API MoteurImmo.
 * Filtre par code postal, type de bien et fourchette de surface ±40%.
 * Trie les résultats par distance croissante.
 * Retourne [] silencieusement si API non configurée ou en erreur.
 */
export async function findActiveListings(
  property: PropertyInput,
  opts?: FindListingsOptions
): Promise<ActiveListing[]> {
  const postalCode = property.postalCode ?? "";
  if (!postalCode) {
    console.warn("[MoteurImmo] Code postal absent — recherche annonces ignorée");
    return [];
  }

  const subjectLat = opts?.lat ?? property.lat;
  const subjectLng = opts?.lng ?? property.lng;

  const surfaceMin = Math.round(property.surface * (1 - SURFACE_RANGE_FACTOR));
  const surfaceMax = Math.round(property.surface * (1 + SURFACE_RANGE_FACTOR));

  const roomsMin = property.rooms ? Math.max(1, property.rooms - 1) : undefined;
  const roomsMax = property.rooms ? property.rooms + 1 : undefined;

  const listings = await searchMoteurImmo({
    postalCode,
    propertyType: property.propertyType,
    surfaceMin,
    surfaceMax,
    roomsMin,
    roomsMax,
    nbResultats: 20,
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
