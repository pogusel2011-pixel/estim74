import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { DVFMutation } from "@/types/dvf";
import { haversineDistance } from "@/lib/utils";

// Use a global singleton so the cache survives Next.js hot-module reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var __dvfCsvCache: DVFMutation[] | null;
  // eslint-disable-next-line no-var
  var __dvfCsvLoadedAt: number | null;
}

global.__dvfCsvCache = global.__dvfCsvCache ?? null;
global.__dvfCsvLoadedAt = global.__dvfCsvLoadedAt ?? null;

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

function parseNumber(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0;
  const str = String(val).trim().replace(",", ".");
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function parseOptionalNumber(val: unknown): number | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  const n = parseNumber(val);
  return n > 0 ? n : undefined;
}

export async function loadAllCsvMutations(): Promise<DVFMutation[]> {
  const now = Date.now();
  if (
    global.__dvfCsvCache &&
    global.__dvfCsvLoadedAt &&
    now - global.__dvfCsvLoadedAt < CACHE_TTL_MS
  ) {
    return global.__dvfCsvCache;
  }

  const csvPath = path.join(
    process.cwd(),
    process.env.DVF_CSV_PATH ?? "data/dvf/2014-2024_mutations_d74.csv"
  );

  if (!fs.existsSync(csvPath)) {
    console.warn("[DVF CSV] Fichier introuvable:", csvPath);
    return [];
  }

  try {
    const content = fs.readFileSync(csvPath, "utf-8");
    const rows = parse(content, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ",",
      cast: false,
    }) as Record<string, unknown>[];

    global.__dvfCsvCache = rows.map((row) => ({
      id_mutation: String(row.id_mutation ?? ""),
      date_mutation: String(row.date_mutation ?? ""),
      nature_mutation: String(row.nature_mutation ?? ""),
      valeur_fonciere: parseNumber(row.valeur_fonciere),
      adresse_numero: row.adresse_numero ? String(row.adresse_numero) : undefined,
      adresse_nom_voie: row.adresse_nom_voie ? String(row.adresse_nom_voie) : undefined,
      code_postal: row.code_postal
        ? String(row.code_postal).padStart(5, "0")
        : undefined,
      nom_commune: String(row.nom_commune ?? ""),
      code_commune: String(row.code_commune ?? ""),
      code_departement: String(row.code_departement ?? ""),
      id_parcelle: row.id_parcelle ? String(row.id_parcelle) : undefined,
      type_local: row.type_local ? String(row.type_local) : undefined,
      surface_reelle_bati: parseOptionalNumber(row.surface_reelle_bati),
      lot1_surface_carrez: parseOptionalNumber(row.lot1_surface_carrez),
      nombre_pieces_principales: parseOptionalNumber(row.nombre_pieces_principales),
      surface_terrain: parseOptionalNumber(row.surface_terrain),
      lat: row.latitude ? parseNumber(row.latitude) || undefined : undefined,
      lon: row.longitude ? parseNumber(row.longitude) || undefined : undefined,
    }));

    global.__dvfCsvLoadedAt = now;
    console.log(`[DVF CSV] ${global.__dvfCsvCache.length} mutations chargées`);
    return global.__dvfCsvCache;
  } catch (err) {
    console.error("[DVF CSV] Erreur parsing:", err);
    return [];
  }
}

export async function loadCsvMutations(
  lat: number,
  lng: number,
  radiusKm: number,
  monthsBack: number,
  propertyTypes?: string[]
): Promise<DVFMutation[]> {
  const all = await loadAllCsvMutations();

  const dateMin = new Date();
  dateMin.setMonth(dateMin.getMonth() - monthsBack);

  return all
    .filter((m) => {
      if (!m.lat || !m.lon) return false;
      if (m.nature_mutation !== "Vente") return false;
      if (!m.valeur_fonciere || m.valeur_fonciere <= 0) return false;

      if (propertyTypes) {
        if (!m.type_local) return false;
        if (!propertyTypes.includes(m.type_local)) return false;
      }

      const mDate = new Date(m.date_mutation);
      if (mDate < dateMin) return false;

      const dist = haversineDistance(lat, lng, m.lat, m.lon);
      if (dist > radiusKm * 1000) return false;

      m.distance_m = dist;
      return true;
    })
    .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));
}
