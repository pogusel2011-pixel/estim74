export type OsmCategory = "school" | "shop" | "transport" | "health" | "park";

export interface OsmPlace {
  id: number;
  name: string;
  category: OsmCategory;
  lat: number;
  lng: number;
  distanceM: number;
  tags: Record<string, string>;
}

export type OsmProximities = OsmPlace[];

const CATEGORY_QUERIES: { category: OsmCategory; filters: string[] }[] = [
  {
    category: "school",
    filters: [
      `node["amenity"~"school|college|university|kindergarten|nursery"]`,
      `way["amenity"~"school|college|university|kindergarten"]`,
    ],
  },
  {
    category: "health",
    filters: [
      `node["amenity"~"hospital|clinic|pharmacy|doctors|dentist|health_centre"]`,
      `way["amenity"~"hospital|clinic"]`,
    ],
  },
  {
    category: "shop",
    filters: [
      `node["shop"~"supermarket|convenience|bakery|butcher|greengrocer|general|mini_supermarket"]`,
      `node["amenity"~"marketplace"]`,
    ],
  },
  {
    category: "transport",
    filters: [
      `node["public_transport"~"station|stop_position|platform"]`,
      `node["amenity"="bus_stop"]`,
      `node["railway"~"station|halt|tram_stop"]`,
    ],
  },
  {
    category: "park",
    filters: [
      `node["leisure"~"park|garden|playground|nature_reserve"]`,
      `way["leisure"~"park|garden|playground"]`,
    ],
  },
];

const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const RADIUS_M = 1000;

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bestName(tags: Record<string, string>, category: OsmCategory): string {
  if (tags.name) return tags.name;
  if (tags["name:fr"]) return tags["name:fr"];
  const labels: Record<OsmCategory, string> = {
    school: "École",
    health: "Santé",
    shop: "Commerce",
    transport: "Transport",
    park: "Espace vert",
  };
  if (tags.amenity) return tags.amenity.charAt(0).toUpperCase() + tags.amenity.slice(1);
  if (tags.shop) return tags.shop.charAt(0).toUpperCase() + tags.shop.slice(1);
  if (tags.leisure) return tags.leisure.charAt(0).toUpperCase() + tags.leisure.slice(1);
  if (tags.public_transport) return tags.public_transport.charAt(0).toUpperCase() + tags.public_transport.slice(1);
  return labels[category] ?? "Lieu";
}

/**
 * Query Overpass API (OpenStreetMap) for amenities within 1km of a point.
 * Returns up to 10 items per category. Non-blocking: returns null on error.
 */
export async function lookupOsmProximities(
  lat: number,
  lng: number
): Promise<OsmProximities | null> {
  const allFilters = CATEGORY_QUERIES.flatMap((cq) =>
    cq.filters.map((f) => `${f}(around:${RADIUS_M},${lat},${lng});`)
  ).join("\n");

  const query = `[out:json][timeout:20];\n(\n${allFilters}\n);\nout center body;`;

  for (const overpassUrl of OVERPASS_URLS) {
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(overpassUrl, {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: controller.signal,
      });
      if (!res.ok) {
        console.warn(`[osm] Overpass ${overpassUrl} → ${res.status} — essai suivant`);
        continue;
      }
      const data = await res.json();
      const elements: Record<string, unknown>[] = Array.isArray(data?.elements)
        ? (data.elements as Record<string, unknown>[])
        : [];

      const places: OsmPlace[] = [];
      const seenNames = new Set<string>();

      for (const el of elements) {
        const tags = ((el.tags ?? {}) as Record<string, string>);
        let eLat: number | undefined;
        let eLng: number | undefined;
        if (el.type === "node") {
          eLat = el.lat as number;
          eLng = el.lon as number;
        } else if (el.center) {
          const c = el.center as { lat: number; lon: number };
          eLat = c.lat;
          eLng = c.lon;
        }
        if (eLat == null || eLng == null) continue;

        let category: OsmCategory | null = null;
        for (const cq of CATEGORY_QUERIES) {
          const amenity = tags.amenity ?? "";
          const shop = tags.shop ?? "";
          const leisure = tags.leisure ?? "";
          const pt = tags.public_transport ?? "";
          const railway = tags.railway ?? "";

          if (cq.category === "school" && amenity.match(/school|college|university|kindergarten|nursery/)) { category = "school"; break; }
          if (cq.category === "health" && amenity.match(/hospital|clinic|pharmacy|doctors|dentist|health_centre/)) { category = "health"; break; }
          if (cq.category === "shop" && (shop.match(/supermarket|convenience|bakery|butcher|greengrocer|general|mini_supermarket/) || amenity === "marketplace")) { category = "shop"; break; }
          if (cq.category === "transport" && (pt.match(/station|stop_position|platform/) || amenity === "bus_stop" || railway.match(/station|halt|tram_stop/))) { category = "transport"; break; }
          if (cq.category === "park" && leisure.match(/park|garden|playground|nature_reserve/)) { category = "park"; break; }
        }
        if (!category) continue;

        const distanceM = Math.round(haversineM(lat, lng, eLat, eLng));
        const name = bestName(tags, category);
        const key = `${category}-${name}`;
        if (seenNames.has(key)) continue;
        seenNames.add(key);

        places.push({ id: el.id as number, name, category, lat: eLat, lng: eLng, distanceM, tags });
      }

      places.sort((a, b) => a.distanceM - b.distanceM);
      const byCategory = new Map<OsmCategory, OsmPlace[]>();
      for (const p of places) {
        if (!byCategory.has(p.category)) byCategory.set(p.category, []);
        const arr = byCategory.get(p.category)!;
        if (arr.length < 10) arr.push(p);
      }
      const result = Array.from(byCategory.values()).flat().sort((a, b) => a.distanceM - b.distanceM);
      console.log(`[osm] ${result.length} lieux trouvés dans ${RADIUS_M}m (${overpassUrl})`);
      return result;
    } catch (e) {
      const name = (e as Error).name;
      const msg = (e as Error).message;
      console.warn(`[osm] ${overpassUrl} — ${name === "AbortError" ? "timeout 20s" : msg} — essai suivant`);
    } finally {
      clearTimeout(abortTimer);
    }
  }

  console.warn("[osm] Tous les endpoints Overpass ont échoué");
  return null;
}
