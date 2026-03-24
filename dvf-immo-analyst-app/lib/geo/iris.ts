import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";

interface IRISRecord {
  CODE_IRIS: string;
  NOM_IRIS: string;
  CODE_COM: string;
  NOM_COM: string;
  TYP_IRIS: string;
  LAT?: number;
  LON?: number;
}

let irisCache: IRISRecord[] | null = null;

export async function loadIrisData(): Promise<IRISRecord[]> {
  if (irisCache) return irisCache;

  const filePath = path.join(process.cwd(), "data", "iris", "reference_IRIS_geo2025.xlsx");
  if (!fs.existsSync(filePath)) {
    console.warn("[IRIS] Fichier de référence IRIS introuvable:", filePath);
    return [];
  }

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<IRISRecord>(sheet);
  irisCache = rows;
  return rows;
}

export async function getIrisCode(lat: number, lng: number): Promise<string | null> {
  // Appel API IRIS INSEE si disponible, sinon lookup via le fichier
  try {
    const url = `https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lng}&fields=codesPostaux,code,nom&format=json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data[0]?.code ?? null;
  } catch {
    return null;
  }
}
