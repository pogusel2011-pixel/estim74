import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

export interface IrisRecord {
  CODE_IRIS: string;
  LIB_IRIS: string;
  TYP_IRIS: string;
  DEPCOM: string;
  LIBCOM: string;
}

// ─── IRIS zone CSV cache ────────────────────────────────────────────────────

let irisCache: IrisRecord[] | null = null;
let irisByDepcom: Map<string, IrisRecord[]> | null = null;
let irisByCode: Map<string, IrisRecord> | null = null;

function loadIrisSync(): void {
  if (irisCache) return;

  const filePath = path.join(process.cwd(), "data", "iris", "iris_74_2025.csv");
  if (!fs.existsSync(filePath)) {
    console.warn("[IRIS] iris_74_2025.csv introuvable:", filePath);
    irisCache = [];
    irisByDepcom = new Map();
    irisByCode = new Map();
    return;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const rawRows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ",",
    cast: false, // always keep raw strings
  }) as Record<string, string>[];

  // Normalize keys to canonical string format regardless of whether the CSV
  // stored them as integers or strings (e.g. 74010 → "74010", 740100502 → "740100502").
  const rows: IrisRecord[] = rawRows.map((r) => ({
    CODE_IRIS: String(r.CODE_IRIS ?? "").padStart(9, "0"),
    LIB_IRIS:  r.LIB_IRIS  ?? "",
    TYP_IRIS:  r.TYP_IRIS  ?? "",
    DEPCOM:    String(r.DEPCOM  ?? "").padStart(5, "0"),
    LIBCOM:    r.LIBCOM    ?? "",
  }));

  irisCache = rows;
  irisByDepcom = new Map();
  irisByCode = new Map();

  for (const row of rows) {
    const list = irisByDepcom.get(row.DEPCOM) ?? [];
    list.push(row);
    irisByDepcom.set(row.DEPCOM, list);
    irisByCode.set(row.CODE_IRIS, row);
  }

  console.log(`[IRIS] ${rows.length} zones chargées`);
}

// ─── Public helpers ──────────────────────────────────────────────────────────

export function getIrisForCommune(depcom: string): IrisRecord[] {
  loadIrisSync();
  const key = String(depcom).padStart(5, "0");
  return irisByDepcom?.get(key) ?? [];
}

export function getIrisLabel(codeIris: string): string | null {
  loadIrisSync();
  const key = String(codeIris).padStart(9, "0");
  return irisByCode?.get(key)?.LIB_IRIS ?? null;
}

export function getIrisRecord(codeIris: string): IrisRecord | null {
  loadIrisSync();
  const key = String(codeIris).padStart(9, "0");
  return irisByCode?.get(key) ?? null;
}

export function getIrisDisplayLabel(codeIris: string): string | null {
  const rec = getIrisRecord(codeIris);
  if (!rec) return null;
  if (rec.TYP_IRIS === "Z") return rec.LIBCOM;
  return `${rec.LIB_IRIS} — ${rec.LIBCOM}`;
}

// ─── IRIS zone centroids (fallback only) ─────────────────────────────────────

interface Centroid { lat: number; lng: number }
let centroidsCache: Map<string, Centroid> | null = null;
let centroidsLoading: Promise<Map<string, Centroid>> | null = null;

const CENTROID_CACHE_FILE = path.join(process.cwd(), "data", "iris", "iris_centroids_74.json");

async function loadIrisCentroids(): Promise<Map<string, Centroid>> {
  if (centroidsCache) return centroidsCache;
  if (centroidsLoading) return centroidsLoading;

  centroidsLoading = (async () => {
    if (fs.existsSync(CENTROID_CACHE_FILE)) {
      try {
        const raw = JSON.parse(fs.readFileSync(CENTROID_CACHE_FILE, "utf-8")) as Record<string, Centroid>;
        centroidsCache = new Map(Object.entries(raw));
        console.log(`[IRIS] ${centroidsCache.size} centroides chargés depuis cache`);
        return centroidsCache;
      } catch {
        console.warn("[IRIS] Centroïdes cache illisible, refetch");
      }
    }

    const result: Record<string, Centroid> = {};
    let offset = 0;
    const limit = 100;

    try {
      while (true) {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 5000);
        const url =
          `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/georef-france-iris/records` +
          `?limit=${limit}&refine=dep_code%3A74&fields=iris_code%2Cgeo_point_2d&offset=${offset}`;
        const res = await fetch(url, { signal: ac.signal });
        clearTimeout(t);
        if (!res.ok) { console.warn(`[IRIS] OpenDataSoft HTTP ${res.status}`); break; }
        const data = (await res.json()) as {
          results: { iris_code?: string | string[]; geo_point_2d?: { lat: number; lon: number } }[];
          total_count: number;
        };
        for (const rec of data.results) {
          const code = Array.isArray(rec.iris_code) ? rec.iris_code[0] : rec.iris_code;
          if (code && rec.geo_point_2d) {
            result[code] = { lat: rec.geo_point_2d.lat, lng: rec.geo_point_2d.lon };
          }
        }
        if (data.results.length < limit) break;
        offset += limit;
      }

      if (Object.keys(result).length > 0) {
        fs.writeFileSync(CENTROID_CACHE_FILE, JSON.stringify(result));
        console.log(`[IRIS] ${Object.keys(result).length} centroides sauvegardés`);
      }
    } catch (e) {
      console.warn("[IRIS] Erreur chargement centroides:", e);
    }

    centroidsCache = new Map(Object.entries(result));
    return centroidsCache;
  })();

  return centroidsLoading;
}

// ─── Haversine distance ─────────────────────────────────────────────────────

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Geo-intersect lookup (point-in-polygon via OpenDataSoft) ────────────────

/**
 * Query OpenDataSoft for which IRIS zone *contains* the property point.
 * Uses the actual IGN polygon boundaries — 100% accurate.
 * Result is cached per coordinate pair.
 */
const geoLookupCache = new Map<string, IrisRecord | null>();

async function lookupIrisByGeoIntersect(
  lat: number,
  lng: number,
  zones: IrisRecord[],
): Promise<IrisRecord | null> {
  // Round to ~10 m precision for cache key
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (geoLookupCache.has(key)) return geoLookupCache.get(key)!;

  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 6000);

    // ODSQL intersects() checks if the geo_shape polygon contains the POINT
    const where = encodeURIComponent(`intersects(geo_shape, geom'POINT(${lng} ${lat})')`);
    const url =
      `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/georef-france-iris/records` +
      `?where=${where}&limit=1&fields=iris_code%2Clib_iris`;

    const res = await fetch(url, { signal: ac.signal });
    clearTimeout(t);

    if (!res.ok) {
      console.warn(`[IRIS] GeoIntersect HTTP ${res.status}`);
      geoLookupCache.set(key, null);
      return null;
    }

    const data = (await res.json()) as {
      results: { iris_code?: string | string[]; lib_iris?: string | string[] }[];
    };

    if (!data.results?.length) {
      console.warn(`[IRIS] GeoIntersect: aucune zone trouvée pour (${lat}, ${lng})`);
      geoLookupCache.set(key, null);
      return null;
    }

    const rec = data.results[0];
    const rawCodeRaw = Array.isArray(rec.iris_code) ? rec.iris_code[0] : rec.iris_code;
    if (!rawCodeRaw) {
      geoLookupCache.set(key, null);
      return null;
    }
    // Normalize the API response code to match our padded map keys
    const rawCode = String(rawCodeRaw).padStart(9, "0");

    // Match against our local CSV (which is authoritative for names)
    const localZone = irisByCode?.get(rawCode) ?? null;
    if (localZone) {
      console.log(`[IRIS] ✓ GeoIntersect → ${localZone.CODE_IRIS} — ${localZone.LIB_IRIS}`);
      geoLookupCache.set(key, localZone);
      return localZone;
    }

    // Code from API not in local CSV: check if it's within the commune's zones
    const rawLib = Array.isArray(rec.lib_iris) ? rec.lib_iris[0] : rec.lib_iris;
    const comZone = zones.find(z => z.CODE_IRIS === rawCode);
    if (comZone) {
      geoLookupCache.set(key, comZone);
      return comZone;
    }

    console.warn(`[IRIS] GeoIntersect: code ${rawCode} (${rawLib}) hors CSV local`);
    geoLookupCache.set(key, null);
    return null;
  } catch (e) {
    console.warn("[IRIS] GeoIntersect erreur:", e);
    return null;
  }
}

// ─── Fallback: nearest centroid ─────────────────────────────────────────────

async function lookupIrisByNearestCentroid(
  lat: number,
  lng: number,
  zones: IrisRecord[],
): Promise<IrisRecord | null> {
  const centroids = await loadIrisCentroids();
  let best: IrisRecord | null = null;
  let bestDist = Infinity;

  for (const zone of zones) {
    const c = centroids.get(zone.CODE_IRIS);
    if (!c) continue;
    const d = haversine(lat, lng, c.lat, c.lng);
    if (d < bestDist) { bestDist = d; best = zone; }
  }

  return best;
}

// ─── Main public lookup ─────────────────────────────────────────────────────

export async function lookupIrisForProperty(
  lat: number,
  lng: number,
  depcom: string,
): Promise<{ codeIris: string; libIris: string; libCom: string; isIrised: boolean } | null> {
  loadIrisSync();

  const depcomKey = String(depcom).padStart(5, "0");
  const zones = irisByDepcom?.get(depcomKey) ?? [];
  if (zones.length === 0) return null;

  // Communes non irisées (zone unique ou type Z) → retour direct sans lookup
  if (zones.length === 1 || zones[0].TYP_IRIS === "Z") {
    const z = zones[0];
    return { codeIris: z.CODE_IRIS, libIris: z.LIB_IRIS, libCom: z.LIBCOM, isIrised: false };
  }

  // ── Approche 1 : point-in-polygon via OpenDataSoft (périmètre officiel IGN) ─
  const geoRec = await lookupIrisByGeoIntersect(lat, lng, zones);
  if (geoRec) {
    console.log(`[IRIS] Zone : ${geoRec.CODE_IRIS} — ${geoRec.LIB_IRIS} (${geoRec.LIBCOM})`);
    return {
      codeIris: geoRec.CODE_IRIS,
      libIris: geoRec.LIB_IRIS,
      libCom: geoRec.LIBCOM,
      isIrised: true,
    };
  }

  // ── Approche 2 : centroïde le plus proche (fallback si API indisponible) ────
  const centroidRec = await lookupIrisByNearestCentroid(lat, lng, zones);
  if (centroidRec) {
    console.log(`[IRIS] ✓ Centroïde (fallback) → ${centroidRec.CODE_IRIS} — ${centroidRec.LIB_IRIS}`);
    return {
      codeIris: centroidRec.CODE_IRIS,
      libIris: centroidRec.LIB_IRIS,
      libCom: centroidRec.LIBCOM,
      isIrised: true,
    };
  }

  console.warn(`[IRIS] Aucune zone identifiée pour (${lat.toFixed(4)},${lng.toFixed(4)}) DEPCOM=${depcom}`);
  return null;
}
