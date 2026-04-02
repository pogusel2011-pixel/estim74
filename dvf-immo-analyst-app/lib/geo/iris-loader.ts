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

/** Normalize zone name for fuzzy matching (lowercase, no accents, no punctuation) */
function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Given an IRIS code (possibly old pre-merger code) and zone name from an external API,
 * resolve the matching IrisRecord in our 2025 CSV for the given DEPCOM.
 * Strategy:
 *  1. Exact code match in CSV
 *  2. Exact zone name match within DEPCOM zones
 *  3. Partial zone name match within DEPCOM zones
 */
function resolveIrisRecord(
  apiCode: string | null | undefined,
  apiName: string | null | undefined,
  zones: IrisRecord[],
): IrisRecord | null {
  // 1. Exact code match
  if (apiCode) {
    const byCode = irisByCode?.get(apiCode);
    if (byCode) return byCode;
  }

  // 2 & 3. Name-based matching within the commune
  if (apiName && zones.length > 0) {
    const needle = normName(apiName);

    // Exact normalised name match
    const exact = zones.find((z) => normName(z.LIB_IRIS) === needle);
    if (exact) return exact;

    // Partial: needle starts with zone name or zone name starts with needle
    const partial = zones.find(
      (z) =>
        needle.startsWith(normName(z.LIB_IRIS)) ||
        normName(z.LIB_IRIS).startsWith(needle),
    );
    if (partial) return partial;
  }

  return null;
}

/** PyRIS point-in-polygon lookup */
async function tryPyRIS(
  lat: number,
  lng: number,
): Promise<{ code: string | null; name: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `https://pyris.eig-forever.ovh/api/v1/address2iris?lon=${lng}&lat=${lat}`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[IRIS] PyRIS HTTP ${res.status}`);
      return { code: null, name: null };
    }
    const data = (await res.json()) as {
      iris?: string;
      nom_iris?: string;
      nom_commune?: string;
    };
    console.log("[IRIS] PyRIS raw:", JSON.stringify(data));
    return { code: data.iris ?? null, name: data.nom_iris ?? null };
  } catch (e) {
    clearTimeout(timer);
    console.warn("[IRIS] PyRIS erreur:", (e as Error).message);
    return { code: null, name: null };
  }
}

/** IGN apicarto IRIS point-in-polygon lookup */
async function tryIgnIris(
  lat: number,
  lng: number,
): Promise<{ code: string | null; name: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `https://apicarto.ign.fr/api/cadastre/iris?lon=${lng}&lat=${lat}&format=json`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[IRIS] IGN apicarto HTTP ${res.status}`);
      return { code: null, name: null };
    }
    const data = (await res.json()) as {
      features?: { properties?: { code_iris?: string; nom_iris?: string } }[];
    };
    console.log("[IRIS] IGN raw:", JSON.stringify(data?.features?.[0]?.properties));
    const props = data.features?.[0]?.properties;
    return { code: props?.code_iris ?? null, name: props?.nom_iris ?? null };
  } catch (e) {
    clearTimeout(timer);
    console.warn("[IRIS] IGN apicarto erreur:", (e as Error).message);
    return { code: null, name: null };
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

  // Tentative 1 — PyRIS (point-in-polygon officiel)
  const pyris = await tryPyRIS(lat, lng);
  const rec1 = resolveIrisRecord(pyris.code, pyris.name, zones);
  if (rec1) {
    console.log(`[IRIS] Résolu via PyRIS : ${rec1.CODE_IRIS} — ${rec1.LIB_IRIS} (${rec1.LIBCOM})`);
    return { codeIris: rec1.CODE_IRIS, libIris: rec1.LIB_IRIS, libCom: rec1.LIBCOM, isIrised: true };
  }

  // Tentative 2 — IGN apicarto
  const ign = await tryIgnIris(lat, lng);
  const rec2 = resolveIrisRecord(ign.code, ign.name, zones);
  if (rec2) {
    console.log(`[IRIS] Résolu via IGN : ${rec2.CODE_IRIS} — ${rec2.LIB_IRIS} (${rec2.LIBCOM})`);
    return { codeIris: rec2.CODE_IRIS, libIris: rec2.LIB_IRIS, libCom: rec2.LIBCOM, isIrised: true };
  }

  // Aucune API n'a permis d'identifier la zone → ne pas deviner
  console.warn(
    `[IRIS] Aucune zone identifiée pour (${lat.toFixed(4)}, ${lng.toFixed(4)}) DEPCOM=${depcom} — secteur non affiché`,
  );
  return null;
}
