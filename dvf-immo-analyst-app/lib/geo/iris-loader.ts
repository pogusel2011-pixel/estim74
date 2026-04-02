import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { loadAllCsvMutations } from "@/lib/dvf/csv-loader";

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
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ",",
  }) as IrisRecord[];

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
  return irisByDepcom?.get(depcom) ?? [];
}

export function getIrisLabel(codeIris: string): string | null {
  loadIrisSync();
  return irisByCode?.get(codeIris)?.LIB_IRIS ?? null;
}

export function getIrisRecord(codeIris: string): IrisRecord | null {
  loadIrisSync();
  return irisByCode?.get(codeIris) ?? null;
}

export function getIrisDisplayLabel(codeIris: string): string | null {
  const rec = getIrisRecord(codeIris);
  if (!rec) return null;
  if (rec.TYP_IRIS === "Z") return rec.LIBCOM;
  return `${rec.LIB_IRIS} — ${rec.LIBCOM}`;
}

// ─── IRIS zone centroids (fetched from OpenDataSoft, cached to disk) ─────────

interface Centroid { lat: number; lng: number }
let centroidsCache: Map<string, Centroid> | null = null;
let centroidsLoading: Promise<Map<string, Centroid>> | null = null;

const CENTROID_CACHE_FILE = path.join(process.cwd(), "data", "iris", "iris_centroids_74.json");

async function loadIrisCentroids(): Promise<Map<string, Centroid>> {
  if (centroidsCache) return centroidsCache;
  if (centroidsLoading) return centroidsLoading;

  centroidsLoading = (async () => {
    // 1. Try local cache first
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

    // 2. Fetch from OpenDataSoft (free, public, no key)
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
        if (!res.ok) {
          console.warn(`[IRIS] OpenDataSoft HTTP ${res.status}`);
          break;
        }
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
        console.log(`[IRIS] Centroides : ${Object.keys(result).length}/${data.total_count}`);
        if (data.results.length < limit) break;
        offset += limit;
      }

      // Save to disk
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

// ─── Haversine distance ────────────────────────────────────────────────────

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── DVF mutation IRIS assignment via nearest centroid ────────────────────

/**
 * Given a location (lat, lng) and a list of IRIS zones for the commune,
 * return the zone whose centroid is closest to (lat, lng).
 * Falls back to first zone if no centroid data available.
 */
async function assignIrisByNearestCentroid(
  lat: number,
  lng: number,
  zones: IrisRecord[],
): Promise<IrisRecord | null> {
  if (zones.length === 0) return null;
  if (zones.length === 1) return zones[0];

  const centroids = await loadIrisCentroids();
  let best: IrisRecord | null = null;
  let bestDist = Infinity;

  for (const zone of zones) {
    const c = centroids.get(zone.CODE_IRIS);
    if (!c) continue;
    const d = haversine(lat, lng, c.lat, c.lng);
    if (d < bestDist) {
      bestDist = d;
      best = zone;
    }
  }

  return best;
}

// ─── DVF-based IRIS lookup ────────────────────────────────────────────────

/**
 * Load nearest DVF mutations from the CSV and use their coordinates
 * (with centroid-based zone assignment) to vote on the most likely
 * IRIS zone for a property at (lat, lng).
 *
 * This is fully offline — uses only the local DVF CSV + centroid cache.
 */
async function lookupIrisByDvfMutations(
  lat: number,
  lng: number,
  zones: IrisRecord[],
): Promise<IrisRecord | null> {
  if (zones.length === 0) return null;
  if (zones.length === 1) return zones[0];

  try {
    // Use the global in-memory cache (loaded once, shared across all requests)
    const allMutations = await loadAllCsvMutations();
    const centroids = await loadIrisCentroids();

    // No centroids = can't assign zones
    if (centroids.size === 0) return null;

    // Find the K nearest mutations with valid coordinates (full scan, in-memory)
    const K = 10;
    const candidates: { lat: number; lng: number; dist: number }[] = [];

    for (const mut of allMutations) {
      if (!mut.lat || !mut.lon) continue;

      const d = haversine(lat, lng, mut.lat, mut.lon);
      if (d > 3) continue; // Ignore anything > 3 km

      if (candidates.length < K) {
        candidates.push({ lat: mut.lat, lng: mut.lon, dist: d });
        candidates.sort((a, b) => a.dist - b.dist);
      } else if (d < candidates[K - 1].dist) {
        candidates[K - 1] = { lat: mut.lat, lng: mut.lon, dist: d };
        candidates.sort((a, b) => a.dist - b.dist);
      }
    }

    if (candidates.length === 0) return null;
    console.log(
      `[IRIS] DVF: ${candidates.length} mutations proches ` +
      `(jusqu'à ${candidates[candidates.length - 1].dist.toFixed(2)} km)`,
    );

    // Assign each mutation to the nearest IRIS zone using centroids → vote
    const votes = new Map<string, number>();

    for (const mut of candidates) {
      let bestZone: IrisRecord | null = null;
      let bestDist = Infinity;
      for (const zone of zones) {
        const c = centroids.get(zone.CODE_IRIS);
        if (!c) continue;
        const d = haversine(mut.lat, mut.lng, c.lat, c.lng);
        if (d < bestDist) { bestDist = d; bestZone = zone; }
      }
      if (bestZone) {
        votes.set(bestZone.CODE_IRIS, (votes.get(bestZone.CODE_IRIS) ?? 0) + 1);
      }
    }

    if (votes.size === 0) return null;

    // Majority vote → winner
    let winnerCode: string | null = null;
    let maxVotes = 0;
    votes.forEach((count, code) => {
      if (count > maxVotes) { maxVotes = count; winnerCode = code; }
    });

    if (!winnerCode) return null;
    const winner = irisByCode?.get(winnerCode) ?? null;
    if (winner) {
      console.log(
        `[IRIS] ✓ DVF vote → ${winner.CODE_IRIS} — ${winner.LIB_IRIS} (${maxVotes}/${candidates.length})`,
      );
    }
    return winner ?? null;
  } catch (e) {
    console.warn("[IRIS] Erreur DVF lookup:", e);
    return null;
  }
}

// ─── Main public lookup ────────────────────────────────────────────────────

export async function lookupIrisForProperty(
  lat: number,
  lng: number,
  depcom: string,
): Promise<{ codeIris: string; libIris: string; libCom: string; isIrised: boolean } | null> {
  loadIrisSync();

  const zones = irisByDepcom?.get(depcom) ?? [];
  if (zones.length === 0) return null;

  // Communes non irisées (zone unique ou type Z) → retour direct sans lookup
  if (zones.length === 1 || zones[0].TYP_IRIS === "Z") {
    const z = zones[0];
    return { codeIris: z.CODE_IRIS, libIris: z.LIB_IRIS, libCom: z.LIBCOM, isIrised: false };
  }

  // ── Approche 1 : DVF mutations + vote par centroïde (priorité) ────────────
  const dvfRec = await lookupIrisByDvfMutations(lat, lng, zones);
  if (dvfRec) {
    return {
      codeIris: dvfRec.CODE_IRIS,
      libIris: dvfRec.LIB_IRIS,
      libCom: dvfRec.LIBCOM,
      isIrised: true,
    };
  }

  // ── Approche 2 : centroïde le plus proche (fallback direct) ───────────────
  const centroidRec = await assignIrisByNearestCentroid(lat, lng, zones);
  if (centroidRec) {
    console.log(`[IRIS] ✓ Centroïde → ${centroidRec.CODE_IRIS} — ${centroidRec.LIB_IRIS}`);
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
