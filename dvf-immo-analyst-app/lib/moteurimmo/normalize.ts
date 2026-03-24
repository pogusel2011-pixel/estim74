import { ActiveListing } from "@/types/listing";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeListing(raw: any): ActiveListing | null {
  const price = Number(raw.prix ?? raw.price ?? 0);
  const surface = Number(raw.surface ?? raw.surface_habitable ?? 0);
  if (!price || !surface) return null;

  return {
    id: String(raw.id ?? raw.ref ?? Math.random()),
    source: raw.source ?? "MoteurImmo",
    url: raw.url ?? raw.lien,
    title: raw.titre ?? raw.title ?? "Annonce",
    address: raw.adresse ?? raw.address,
    city: raw.ville ?? raw.city ?? "",
    postalCode: raw.code_postal ?? raw.postal_code,
    propertyType: raw.type_bien ?? raw.type ?? "",
    surface,
    rooms: raw.nb_pieces ? Number(raw.nb_pieces) : undefined,
    floor: raw.etage ? Number(raw.etage) : undefined,
    price,
    pricePsm: Math.round(price / surface),
    description: raw.description,
    publishedAt: raw.date_publication ?? raw.published_at,
    photos: raw.photos ?? raw.images ?? [],
    features: raw.options ?? raw.features ?? [],
    dpe: raw.dpe ?? raw.classe_energie,
    lat: raw.lat ? Number(raw.lat) : undefined,
    lng: raw.lng ?? raw.lon ? Number(raw.lng ?? raw.lon) : undefined,
  };
}
