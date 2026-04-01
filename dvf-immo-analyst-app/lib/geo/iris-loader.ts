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

export async function lookupIrisForProperty(
  lat: number,
  lng: number,
  depcom: string,
): Promise<{ codeIris: string; libIris: string; libCom: string; isIrised: boolean } | null> {
  loadIrisSync();

  const zones = irisByDepcom?.get(depcom) ?? [];
  if (zones.length === 0) return null;

  if (zones.length === 1 || zones[0].TYP_IRIS === "Z") {
    const z = zones[0];
    return { codeIris: z.CODE_IRIS, libIris: z.LIB_IRIS, libCom: z.LIBCOM, isIrised: false };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(
      `https://pyris.eig-forever.ovh/api/v1/address2iris?lon=${lng}&lat=${lat}`,
      { signal: controller.signal },
    );
    clearTimeout(timer);

    if (res.ok) {
      const data = (await res.json()) as {
        iris?: string;
        nom_iris?: string;
        nom_commune?: string;
      };
      const codeIris = data.iris;
      if (codeIris) {
        const record = irisByCode?.get(codeIris);
        const libIris = record?.LIB_IRIS ?? data.nom_iris ?? zones[0].LIB_IRIS;
        const libCom = record?.LIBCOM ?? data.nom_commune ?? zones[0].LIBCOM;
        console.log(`[IRIS] Zone détectée : ${codeIris} — ${libIris} (${libCom})`);
        return { codeIris, libIris, libCom, isIrised: true };
      }
    }
  } catch {
    console.warn("[IRIS] PyRIS API indisponible, fallback commune");
  }

  const fallback = zones.find((z) => z.TYP_IRIS === "H") ?? zones[0];
  return {
    codeIris: fallback.CODE_IRIS,
    libIris: fallback.LIB_IRIS,
    libCom: fallback.LIBCOM,
    isIrised: true,
  };
}
