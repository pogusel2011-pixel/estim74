import { PropertyInput } from "@/types/property";
import { ActiveListing } from "@/types/listing";
import { searchMoteurImmo, isApiKeyConfigured } from "./client";
import { SURFACE_RANGE_FACTOR } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { haversineDistance } from "@/lib/utils";

export { isApiKeyConfigured };

export interface FindListingsOptions {
  /** Lat/lng du bien sujet pour calculer la distance de chaque annonce */
  lat?: number;
  lng?: number;
}

const CATEGORY_MAP: Record<string, string> = {
  APARTMENT: "flat",
  HOUSE: "house",
  LAND: "land",
  COMMERCIAL: "premises",
};

const MIN_LOCAL_RESULTS = 3;

/**
 * Recherche les annonces actives comparables.
 *
 * Ordre de priorité :
 *  A) ActiveListing locale (PostgreSQL) — source principale (webhook MoteurImmo)
 *  B) API MoteurImmo directe si < 3 résultats locaux
 *  C) [] silencieux si l'API échoue aussi (la valuation bascule sur DVF pur)
 *
 * Filtre par code postal, catégorie de bien et fourchette de surface ±40%.
 * Trie les résultats par distance croissante.
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

  const surfaceMin = property.surface * (1 - SURFACE_RANGE_FACTOR);
  const surfaceMax = property.surface * (1 + SURFACE_RANGE_FACTOR);

  const category = CATEGORY_MAP[property.propertyType];

  // ── A) Requête base locale ────────────────────────────────────────────────
  const localRows = await queryLocalListings({
    postalCode,
    category: category ?? null,
    surfaceMin,
    surfaceMax,
  });

  if (localRows.length >= MIN_LOCAL_RESULTS) {
    console.log(
      `[MoteurImmo/local] ${localRows.length} annonces locales (${category ?? "?"}, CP ${postalCode})`
    );
    return sortByDistance(localRows, subjectLat, subjectLng);
  }

  console.log(
    `[MoteurImmo/local] ${localRows.length} résultat(s) local/aux — fallback API`
  );

  // ── B) Fallback : API MoteurImmo directe ──────────────────────────────────
  const roomsMin = property.rooms ? Math.max(1, property.rooms - 1) : undefined;
  const roomsMax = property.rooms ? property.rooms + 1 : undefined;

  const apiListings = await searchMoteurImmo({
    postalCode,
    propertyType: property.propertyType,
    surfaceMin: Math.round(surfaceMin),
    surfaceMax: Math.round(surfaceMax),
    roomsMin,
    roomsMax,
    nbResultats: 20,
    subjectLat,
    subjectLng,
  });

  // Merge: start with local results (if any), then API results not already present
  if (localRows.length > 0) {
    const localIds = new Set(localRows.map((l) => l.id));
    const merged = [
      ...localRows,
      ...apiListings.filter((l) => !localIds.has(l.id)),
    ];
    return sortByDistance(merged, subjectLat, subjectLng);
  }

  return apiListings;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface LocalQuery {
  postalCode: string;
  category: string | null;
  surfaceMin: number;
  surfaceMax: number;
}

async function queryLocalListings(q: LocalQuery): Promise<ActiveListing[]> {
  try {
    const rows = await prisma.activeListing.findMany({
      where: {
        postalCode: q.postalCode,
        ...(q.category ? { category: q.category } : {}),
        isActive: true,
        deletedAt: null,
        surface: { gte: q.surfaceMin, lte: q.surfaceMax },
        price: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
    });

    return rows.map((row): ActiveListing => ({
      id: row.uniqueId,
      source: "MoteurImmo (local)",
      title: row.title ?? "Annonce",
      city: row.city ?? "",
      postalCode: row.postalCode ?? undefined,
      propertyType: row.category ?? "",
      surface: row.surface ?? 0,
      rooms: row.rooms ?? undefined,
      price: row.price ?? 0,
      pricePsm: row.pricePsm ?? (row.price && row.surface ? Math.round(row.price / row.surface) : 0),
      url: row.url ?? undefined,
      pictureUrl: row.pictureUrl ?? undefined,
      dpe: row.energyGrade ?? undefined,
      lat: row.lat ?? undefined,
      lng: row.lng ?? undefined,
      features: Array.isArray(row.options) ? (row.options as string[]) : [],
      publishedAt: row.createdAt.toISOString(),
    }));
  } catch (err) {
    console.error("[MoteurImmo/local] DB query error:", err);
    return [];
  }
}

function sortByDistance(
  listings: ActiveListing[],
  subjectLat?: number,
  subjectLng?: number
): ActiveListing[] {
  const withDistance = listings.map((l) => {
    if (
      subjectLat != null &&
      subjectLng != null &&
      l.lat != null &&
      l.lng != null
    ) {
      return {
        ...l,
        distance: Math.round(haversineDistance(subjectLat, subjectLng, l.lat, l.lng)),
      };
    }
    return l;
  });

  return withDistance.sort((a, b) => {
    if (a.distance == null && b.distance == null) return 0;
    if (a.distance == null) return 1;
    if (b.distance == null) return -1;
    return a.distance - b.distance;
  });
}
