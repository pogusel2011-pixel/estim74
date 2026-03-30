import { ActiveListing } from "@/types/listing";
import { haversineDistance } from "@/lib/utils";

/**
 * Normalise une annonce brute retournée par POST https://moteurimmo.fr/api/ads
 * vers notre type ActiveListing.
 *
 * Mapping officiel des champs MoteurImmo :
 *   uniqueId         → id
 *   title            → title
 *   location.city    → city
 *   location.postalCode → postalCode
 *   category         → propertyType
 *   surface          → surface
 *   rooms            → rooms
 *   price            → price
 *   pricePerSquareMeter → pricePsm
 *   description      → description
 *   creationDate     → publishedAt
 *   pictureUrls      → photos
 *   options          → features (tableau de strings)
 *   energyGrade      → dpe
 *   position[1]      → lat   (position = [lng, lat])
 *   position[0]      → lng
 *   url              → url
 */
export function normalizeMoteurImmoListing(
  raw: any, // eslint-disable-line -- forme variable selon la version de l'API
  subjectLat?: number,
  subjectLng?: number
): ActiveListing | null {
  const price = Number(raw.price ?? 0);
  const surface = Number(raw.surface ?? 0);
  if (!price || !surface) return null;

  // position = [lng, lat] (GeoJSON order)
  const lat: number | undefined =
    Array.isArray(raw.position) && raw.position.length >= 2
      ? Number(raw.position[1])
      : undefined;
  const lng: number | undefined =
    Array.isArray(raw.position) && raw.position.length >= 2
      ? Number(raw.position[0])
      : undefined;

  // Distance Haversine en mètres
  let distance: number | undefined;
  if (subjectLat != null && subjectLng != null && lat != null && lng != null) {
    distance = Math.round(haversineDistance(subjectLat, subjectLng, lat, lng));
  }

  const pricePsm = raw.pricePerSquareMeter
    ? Math.round(Number(raw.pricePerSquareMeter))
    : Math.round(price / surface);

  const location = raw.location ?? {};

  // Options — tableau de strings : ["hasGarage", "hasTerrace", ...]
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
  const opts: string[] = Array.isArray(raw.options) ? raw.options : [];
  const features: string[] = [];
  const seen = new Set<string>();
  for (const opt of opts) {
    const label = OPTION_LABELS[opt];
    if (label && !seen.has(label)) {
      features.push(label);
      seen.add(label);
    }
  }

  const publisher = raw.publisher ?? {};

  return {
    id: String(raw.uniqueId ?? raw.reference ?? raw.id ?? Math.random()),
    source: "MoteurImmo",
    url: raw.url,
    title: raw.title ?? "Annonce",
    city: location.city ?? raw.city ?? "",
    postalCode: location.postalCode ?? raw.postalCode,
    propertyType: raw.category ?? raw.type ?? "",
    surface,
    rooms: raw.rooms != null ? Number(raw.rooms) : undefined,
    bedrooms: raw.bedrooms != null ? Number(raw.bedrooms) : undefined,
    floor: raw.floor != null ? Number(raw.floor) : undefined,
    price,
    pricePsm,
    description: raw.description,
    publishedAt: raw.creationDate ?? raw.publicationDate ?? raw.lastEventDate,
    lastEventDate: raw.lastEventDate,
    photos: raw.pictureUrls ?? (raw.pictureUrl ? [raw.pictureUrl] : []),
    pictureUrl: raw.pictureUrls?.[0] ?? raw.pictureUrl,
    features,
    dpe: raw.energyGrade ?? undefined,
    lat,
    lng,
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
