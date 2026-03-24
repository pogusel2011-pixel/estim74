import { ActiveListing } from "@/types/listing";
import { haversineDistance } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeMoteurImmoListing(
  raw: any,
  subjectLat?: number,
  subjectLng?: number
): ActiveListing | null {
  const price = Number(raw.price ?? 0);
  const surface = Number(raw.surface ?? 0);
  if (!price || !surface) return null;

  // Position: [lon, lat] selon la doc MoteurImmo
  const position: [number, number] | undefined = Array.isArray(raw.position) && raw.position.length >= 2
    ? raw.position
    : undefined;
  const listingLng = position?.[0];
  const listingLat = position?.[1];

  // Distance Haversine si on dispose des coordonnées du sujet et de l'annonce
  let distance: number | undefined;
  if (subjectLat != null && subjectLng != null && listingLat != null && listingLng != null) {
    distance = Math.round(haversineDistance(subjectLat, subjectLng, listingLat, listingLng));
  }

  const pricePsm = raw.pricePerSquareMeter
    ? Math.round(Number(raw.pricePerSquareMeter))
    : Math.round(price / surface);

  const location = raw.location ?? {};
  const publisher = raw.publisher ?? {};

  // Options — l'API retourne un objet options{}
  const opts = raw.options ?? {};
  const features: string[] = [];
  if (opts.hasGarage) features.push("Garage");
  if (opts.hasParking) features.push("Parking");
  if (opts.hasGarden) features.push("Jardin");
  if (opts.hasTerrace) features.push("Terrasse");
  if (opts.hasSwimmingPool) features.push("Piscine");
  if (opts.hasBalcony) features.push("Balcon");
  if (opts.hasCellar) features.push("Cave");
  if (opts.hasElevator) features.push("Ascenseur");

  return {
    id: String(raw.reference ?? raw.id ?? Math.random()),
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
    publishedAt: raw.lastEventDate,
    lastEventDate: raw.lastEventDate,
    photos: raw.pictureUrl ? [raw.pictureUrl] : [],
    pictureUrl: raw.pictureUrl,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeListing(raw: any): ActiveListing | null {
  return normalizeMoteurImmoListing(raw);
}
