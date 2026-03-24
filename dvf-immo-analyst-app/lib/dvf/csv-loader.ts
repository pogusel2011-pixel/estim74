import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { DVFMutation } from "@/types/dvf";
import { haversineDistance } from "@/lib/utils";

let csvCache: DVFMutation[] | null = null;
let csvLoadedAt: number | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

export async function loadAllCsvMutations(): Promise<DVFMutation[]> {
  const now = Date.now();
  if (csvCache && csvLoadedAt && now - csvLoadedAt < CACHE_TTL_MS) {
    return csvCache;
  }

  const csvPath = path.join(process.cwd(), process.env.DVF_CSV_PATH ?? "data/dvf/2014-2024_mutations_d74.csv");

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
      cast: true,
    }) as Record<string, unknown>[];

    csvCache = rows.map((row) => ({
      id_mutation: String(row.id_mutation ?? ""),
      date_mutation: String(row.date_mutation ?? ""),
      nature_mutation: String(row.nature_mutation ?? ""),
      valeur_fonciere: Number(row.valeur_fonciere ?? 0),
      adresse_numero: row.adresse_numero ? String(row.adresse_numero) : undefined,
      adresse_nom_voie: row.adresse_nom_voie ? String(row.adresse_nom_voie) : undefined,
      code_postal: row.code_postal ? String(row.code_postal).padStart(5, "0") : undefined,
      nom_commune: String(row.nom_commune ?? ""),
      code_commune: String(row.code_commune ?? ""),
      code_departement: String(row.code_departement ?? ""),
      id_parcelle: row.id_parcelle ? String(row.id_parcelle) : undefined,
      type_local: row.type_local ? String(row.type_local) : undefined,
      surface_reelle_bati: row.surface_reelle_bati ? Number(row.surface_reelle_bati) : undefined,
      nombre_pieces_principales: row.nombre_pieces_principales ? Number(row.nombre_pieces_principales) : undefined,
      surface_terrain: row.surface_terrain ? Number(row.surface_terrain) : undefined,
      lat: row.latitude ? Number(row.latitude) : undefined,
      lon: row.longitude ? Number(row.longitude) : undefined,
    }));

    csvLoadedAt = now;
    console.log(`[DVF CSV] ${csvCache.length} mutations chargées`);
    return csvCache;
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
      if (propertyTypes && m.type_local && !propertyTypes.includes(m.type_local)) return false;

      const mDate = new Date(m.date_mutation);
      if (mDate < dateMin) return false;

      const dist = haversineDistance(lat, lng, m.lat, m.lon);
      if (dist > radiusKm * 1000) return false;

      m.distance_m = dist;
      return true;
    })
    .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));
}
