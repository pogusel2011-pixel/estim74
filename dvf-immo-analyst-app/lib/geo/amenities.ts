/**
 * Proximity amenities scoring for Haute-Savoie market.
 * Fetches nearby POIs via the OpenStreetMap Overpass API.
 */

export interface AmenityResult {
  category: "lake" | "ski" | "motorway" | "school" | "shop" | "train";
  label: string;
  distanceM: number;
}

/** Maximum search radius per category (must be ≥ max adjustment threshold). */
const RADII: Record<AmenityResult["category"], number> = {
  lake:     3000,
  ski:      6000,
  motorway: 2500,
  school:   1500,
  shop:     2500,
  train:    6000,
};

export const AMENITY_LABELS: Record<AmenityResult["category"], string> = {
  lake:     "Vue/accès lac",
  ski:      "Proximité ski",
  motorway: "Accès autoroute",
  school:   "École à proximité",
  shop:     "Commerces proches",
  train:    "Gare à proximité",
};

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildQuery(lat: number, lng: number): string {
  const { lake, ski, motorway, school, shop, train } = RADII;
  return `[out:json][timeout:12];
(
  way(around:${lake},${lat},${lng})[natural=water];
  relation(around:${lake},${lat},${lng})[natural=water];
  way(around:${lake},${lat},${lng})[natural=lake];
  node(around:${ski},${lat},${lng})[aerialway];
  way(around:${ski},${lat},${lng})[aerialway];
  way(around:${motorway},${lat},${lng})[highway=motorway];
  way(around:${motorway},${lat},${lng})[highway=motorway_link];
  node(around:${school},${lat},${lng})[amenity=school];
  way(around:${school},${lat},${lng})[amenity=school];
  node(around:${school},${lat},${lng})[amenity=kindergarten];
  node(around:${shop},${lat},${lng})[shop=supermarket];
  way(around:${shop},${lat},${lng})[shop=supermarket];
  node(around:${shop},${lat},${lng})[shop=convenience];
  node(around:${train},${lat},${lng})[railway=station];
  node(around:${train},${lat},${lng})[railway=halt];
);
out center;`;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function elementCoords(el: OverpassElement): { lat: number; lng: number } | null {
  if (el.type === "node" && el.lat != null && el.lon != null) {
    return { lat: el.lat, lng: el.lon };
  }
  if ((el.type === "way" || el.type === "relation") && el.center) {
    return { lat: el.center.lat, lng: el.center.lon };
  }
  return null;
}

function tagToCategory(tags: Record<string, string>): AmenityResult["category"] | null {
  if (tags.natural === "water" || tags.natural === "lake") return "lake";
  if (tags.aerialway) return "ski";
  if (tags.highway === "motorway" || tags.highway === "motorway_link") return "motorway";
  if (tags.amenity === "school" || tags.amenity === "kindergarten" || tags.amenity === "college") return "school";
  if (tags.shop === "supermarket" || tags.shop === "convenience" || tags.shop === "grocery") return "shop";
  if (tags.railway === "station" || tags.railway === "halt") return "train";
  return null;
}

/** Simple in-memory cache keyed by ~1 km precision coordinates. */
const _cache = new Map<string, AmenityResult[]>();

/**
 * Fetches nearby amenities for a coordinate using the Overpass API.
 * Falls back gracefully to [] on timeout or network error.
 */
export async function fetchAmenities(lat: number, lng: number): Promise<AmenityResult[]> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (_cache.has(key)) return _cache.get(key)!;

  const query = buildQuery(lat, lng);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 13_000);

    let response: Response;
    try {
      response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.warn(`[amenities] Overpass API error HTTP ${response.status}`);
      return [];
    }

    const data = (await response.json()) as { elements: OverpassElement[] };

    const nearest = new Map<AmenityResult["category"], number>();
    for (const el of data.elements) {
      const tags = el.tags ?? {};
      const category = tagToCategory(tags);
      if (!category) continue;
      const coords = elementCoords(el);
      if (!coords) continue;
      const dist = haversineM(lat, lng, coords.lat, coords.lng);
      const current = nearest.get(category);
      if (current == null || dist < current) {
        nearest.set(category, dist);
      }
    }

    const results: AmenityResult[] = [];
    nearest.forEach((distanceM, category) => {
      results.push({ category, label: AMENITY_LABELS[category], distanceM: Math.round(distanceM) });
    });

    _cache.set(key, results);
    console.log(
      `[amenities] ${results.length} catégorie(s) détectée(s) près de (${lat.toFixed(4)}, ${lng.toFixed(4)}): ${results.map((r) => `${r.category}@${r.distanceM}m`).join(", ") || "—"}`
    );
    return results;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.warn("[amenities] Overpass API timeout — scoring proximité ignoré");
    } else {
      console.warn("[amenities] Overpass API erreur:", err);
    }
    return [];
  }
}
