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

/** Normalize zone name for fuzzy matching */
function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Resolve IrisRecord from API-returned code + name.
 * 1. Exact code match (handles current 2025 codes)
 * 2. Exact normalised name match within DEPCOM zones
 * 3. Partial name match (handles pre-merger codes with correct names)
 */
function resolveByCodeOrName(
  apiCode: string | null | undefined,
  apiName: string | null | undefined,
  zones: IrisRecord[],
): IrisRecord | null {
  if (apiCode) {
    const byCode = irisByCode?.get(apiCode);
    if (byCode) return byCode;
  }
  if (apiName && zones.length > 0) {
    const needle = normName(apiName);
    const exact = zones.find((z) => normName(z.LIB_IRIS) === needle);
    if (exact) return exact;
    const partial = zones.find(
      (z) =>
        needle.startsWith(normName(z.LIB_IRIS)) ||
        normName(z.LIB_IRIS).startsWith(needle),
    );
    if (partial) return partial;
  }
  return null;
}

/** PyRIS point-in-polygon */
async function tryPyRIS(lat: number, lng: number): Promise<{ code: string | null; name: string | null }> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 2500);
  try {
    const res = await fetch(
      `https://pyris.eig-forever.ovh/api/v1/address2iris?lon=${lng}&lat=${lat}`,
      { signal: ac.signal },
    );
    clearTimeout(t);
    if (!res.ok) { console.warn(`[IRIS] PyRIS HTTP ${res.status}`); return { code: null, name: null }; }
    const data = (await res.json()) as { iris?: string; nom_iris?: string };
    console.log("[IRIS] PyRIS →", data.iris, data.nom_iris);
    return { code: data.iris ?? null, name: data.nom_iris ?? null };
  } catch {
    clearTimeout(t);
    return { code: null, name: null };
  }
}

/** IGN apicarto IRIS */
async function tryIgn(lat: number, lng: number): Promise<{ code: string | null; name: string | null }> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 2500);
  try {
    const res = await fetch(
      `https://apicarto.ign.fr/api/cadastre/iris?lon=${lng}&lat=${lat}&format=json`,
      { signal: ac.signal },
    );
    clearTimeout(t);
    if (!res.ok) { console.warn(`[IRIS] IGN HTTP ${res.status}`); return { code: null, name: null }; }
    const data = (await res.json()) as { features?: { properties?: { code_iris?: string; nom_iris?: string } }[] };
    const p = data.features?.[0]?.properties;
    console.log("[IRIS] IGN →", p?.code_iris, p?.nom_iris);
    return { code: p?.code_iris ?? null, name: p?.nom_iris ?? null };
  } catch {
    clearTimeout(t);
    return { code: null, name: null };
  }
}

/** Nominatim (OpenStreetMap) reverse geocoding — suburb/quarter name matching */
async function tryNominatim(lat: number, lng: number, zones: IrisRecord[]): Promise<IrisRecord | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 3000);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=15&accept-language=fr`,
      {
        signal: ac.signal,
        headers: { "User-Agent": "Estim74/1.0 (aurelie.liverset@iadfrance.fr)" },
      },
    );
    clearTimeout(t);
    if (!res.ok) { console.warn(`[IRIS] Nominatim HTTP ${res.status}`); return null; }
    const data = (await res.json()) as {
      address?: {
        suburb?: string;
        city_district?: string;
        quarter?: string;
        neighbourhood?: string;
        town?: string;
      };
    };
    // Candidates: suburb, city_district, quarter, neighbourhood
    const candidates = [
      data.address?.suburb,
      data.address?.city_district,
      data.address?.quarter,
      data.address?.neighbourhood,
    ].filter(Boolean) as string[];

    console.log("[IRIS] Nominatim →", candidates);

    for (const candidate of candidates) {
      const match = resolveByCodeOrName(null, candidate, zones);
      if (match) return match;
    }
    return null;
  } catch {
    clearTimeout(t);
    return null;
  }
}

export async function lookupIrisForProperty(
  lat: number,
  lng: number,
  depcom: string,
): Promise<{ codeIris: string; libIris: string; libCom: string; isIrised: boolean } | null> {
  loadIrisSync();

  const zones = irisByDepcom?.get(depcom) ?? [];
  if (zones.length === 0) return null;

  // Communes non irisées (zone unique ou type Z) → retour direct
  if (zones.length === 1 || zones[0].TYP_IRIS === "Z") {
    const z = zones[0];
    return { codeIris: z.CODE_IRIS, libIris: z.LIB_IRIS, libCom: z.LIBCOM, isIrised: false };
  }

  // Tentative 1 — PyRIS (point-in-polygon)
  const pyris = await tryPyRIS(lat, lng);
  const rec1 = resolveByCodeOrName(pyris.code, pyris.name, zones);
  if (rec1) {
    console.log(`[IRIS] ✓ PyRIS → ${rec1.CODE_IRIS} — ${rec1.LIB_IRIS}`);
    return { codeIris: rec1.CODE_IRIS, libIris: rec1.LIB_IRIS, libCom: rec1.LIBCOM, isIrised: true };
  }

  // Tentative 2 — IGN apicarto
  const ign = await tryIgn(lat, lng);
  const rec2 = resolveByCodeOrName(ign.code, ign.name, zones);
  if (rec2) {
    console.log(`[IRIS] ✓ IGN → ${rec2.CODE_IRIS} — ${rec2.LIB_IRIS}`);
    return { codeIris: rec2.CODE_IRIS, libIris: rec2.LIB_IRIS, libCom: rec2.LIBCOM, isIrised: true };
  }

  // Tentative 3 — Nominatim (suburb/quarter name matching)
  const rec3 = await tryNominatim(lat, lng, zones);
  if (rec3) {
    console.log(`[IRIS] ✓ Nominatim → ${rec3.CODE_IRIS} — ${rec3.LIB_IRIS}`);
    return { codeIris: rec3.CODE_IRIS, libIris: rec3.LIB_IRIS, libCom: rec3.LIBCOM, isIrised: true };
  }

  console.warn(`[IRIS] Aucune zone identifiée pour (${lat.toFixed(4)},${lng.toFixed(4)}) DEPCOM=${depcom}`);
  return null;
}
