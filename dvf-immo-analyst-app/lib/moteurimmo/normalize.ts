import { ActiveListing } from "@/types/listing";
import { haversineDistance } from "@/lib/utils";

/**
 * Normalise une annonce brute retournée par POST https://moteurimmo.fr/api/ads
 * vers notre type ActiveListing.
 *
 * Champs réels observés dans la réponse :
 *   reference, title, price, surface, rooms, bedrooms, floor,
 *   pricePerSquareMeter, landSurface, energyGrade, gasGrade,
 *   options (string[]), position ([lon,lat] | null),
 *   location { city, postalCode, inseeCode, coordinates:[lon,lat] },
 *   publisher { type, name, phone, email }, url, category, type,
 *   pictureUrl, pictureUrls[], lastEventDate
 */
export function normalizeMoteurImmoListing(
  raw: any, // eslint-disable-line -- raw API response, shape varies per immoapi.app version
  subjectLat?: number,
  subjectLng?: number
): ActiveListing | null {
  const price = Number(raw.price ?? 0);
  const surface = Number(raw.surface ?? 0);
  if (!price || !surface) return null;

  // Coordonnées : position [lon, lat] ou location.coordinates [lon, lat]
  const coords: [number, number] | null =
    Array.isArray(raw.position) && raw.position.length >= 2
      ? raw.position
      : Array.isArray(raw.location?.coordinates) && raw.location.coordinates.length >= 2
      ? raw.location.coordinates
      : null;

  const listingLng = coords?.[0];
  const listingLat = coords?.[1];

  // Distance Haversine en mètres
  let distance: number | undefined;
  if (subjectLat != null && subjectLng != null && listingLat != null && listingLng != null) {
    distance = Math.round(haversineDistance(subjectLat, subjectLng, listingLat, listingLng));
  }

  const pricePsm = raw.pricePerSquareMeter
    ? Math.round(Number(raw.pricePerSquareMeter))
    : Math.round(price / surface);

  const location = raw.location ?? {};
  const publisher = raw.publisher ?? {};

  // Options — l'API retourne un tableau de strings: ["hasGarage", "hasTerrace", ...]
  const opts: string[] = Array.isArray(raw.options) ? raw.options : [];
  const OPTION_LABELS: Record<string, string> = {
    hasGarage: "Garage",
    hasParking: "Parking",
    hasGarden: "Jardin",
    hasTerrace: "Terrasse",
    hasSwimmingPool: "Piscine",
    hasBalcony: "Balcon",
    hasCave: "Cave",
    hasCellar: "Cave",
    hasElevator: "Ascenseur",
    hasLift: "Ascenseur",
    hasPool: "Piscine",
    isNew: "Neuf",
  };
  const features: string[] = [];
  const seen = new Set<string>();
  for (const opt of opts) {
    const label = OPTION_LABELS[opt];
    if (label && !seen.has(label)) {
      features.push(label);
      seen.add(label);
    }
  }

  return {
    id: String(raw.reference ?? raw.adId ?? raw.id ?? Math.random()),
    source: "MoteurImmo",
    url: raw.url,
    title: raw.title ?? "Annonce",
    city: location.city ?? raw.city ?? "",
    postalCode: location.postalCode ?? raw.postalCode,
    inseeCode: location.inseeCode,
    propertyType: raw.category ?? raw.type ?? "",
    surface,
    rooms: raw.rooms != null ? Number(raw.rooms) : undefined,
    bedrooms: raw.bedrooms != null ? Number(raw.bedrooms) : undefined,
    floor: raw.floor != null ? Number(raw.floor) : undefined,
    price,
    pricePsm,
    description: raw.description,
    publishedAt: raw.publicationDate ?? raw.lastEventDate,
    lastEventDate: raw.lastEventDate,
    photos: raw.pictureUrls ?? (raw.pictureUrl ? [raw.pictureUrl] : []),
    pictureUrl: raw.pictureUrl ?? raw.pictureUrls?.[0],
    features,
    dpe: raw.energyGrade ?? undefined,
    lat: listingLat,
    lng: listingLng,
    distance,
    publisher: {
      name: publisher.name,
      phone: publisher.phone,
    },
  };
}

/** @deprecated Utiliser normalizeMoteurImmoListing — conservé pour compatibilité */
export function normalizeListing(raw: any): ActiveListing | null { // eslint-disable-line
  return normalizeMoteurImmoListing(raw);
}
