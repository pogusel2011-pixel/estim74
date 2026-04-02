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

/** Try PyRIS API (primary IRIS lookup by coordinates) */
async function tryPyRIS(
  lat: number,
  lng: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(
      `https://pyris.eig-forever.ovh/api/v1/address2iris?lon=${lng}&lat=${lat}`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { iris?: string };
    return data.iris ?? null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/** Try IGN apicarto IRIS API (secondary lookup) */
async function tryIgnIris(
  lat: number,
  lng: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(
      `https://apicarto.ign.fr/api/cadastre/iris?lon=${lng}&lat=${lat}&format=json`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: { properties?: { code_iris?: string } }[];
    };
    return data.features?.[0]?.properties?.code_iris ?? null;
  } catch {
    clearTimeout(timer);
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

  // Communes non irisées (zone unique ou type Z) → retour direct, pas besoin d'API
  if (zones.length === 1 || zones[0].TYP_IRIS === "Z") {
    const z = zones[0];
    return { codeIris: z.CODE_IRIS, libIris: z.LIB_IRIS, libCom: z.LIBCOM, isIrised: false };
  }

  // Communes multi-zones : résolution par coordonnées via API externe
  // Tentative 1 : PyRIS
  const pyrisCode = await tryPyRIS(lat, lng);
  if (pyrisCode) {
    const record = irisByCode?.get(pyrisCode);
    if (record) {
      console.log(`[IRIS] PyRIS → ${pyrisCode} — ${record.LIB_IRIS} (${record.LIBCOM})`);
      return { codeIris: record.CODE_IRIS, libIris: record.LIB_IRIS, libCom: record.LIBCOM, isIrised: true };
    }
    console.warn(`[IRIS] PyRIS a retourné ${pyrisCode} mais code absent du CSV — essai IGN`);
  } else {
    console.warn("[IRIS] PyRIS indisponible — essai IGN apicarto");
  }

  // Tentative 2 : IGN apicarto
  const ignCode = await tryIgnIris(lat, lng);
  if (ignCode) {
    const record = irisByCode?.get(ignCode);
    if (record) {
      console.log(`[IRIS] IGN → ${ignCode} — ${record.LIB_IRIS} (${record.LIBCOM})`);
      return { codeIris: record.CODE_IRIS, libIris: record.LIB_IRIS, libCom: record.LIBCOM, isIrised: true };
    }
    console.warn(`[IRIS] IGN a retourné ${ignCode} mais code absent du CSV`);
  } else {
    console.warn("[IRIS] IGN apicarto indisponible");
  }

  // Aucune API n'a répondu : ne pas deviner — retour null pour éviter un faux secteur
  console.warn(`[IRIS] Impossible de déterminer la zone IRIS pour ${depcom} (${lat},${lng}) — secteur non affiché`);
  return null;
}
