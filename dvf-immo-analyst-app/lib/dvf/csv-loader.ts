import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { DVFMutation } from "@/types/dvf";
import { haversineDistance } from "@/lib/utils";
import { getInseeCodesForCity } from "@/lib/geo/iris_utils";
import { loadDbMutations, loadDbMutationsByCommune } from "@/lib/dvf/db-loader";

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

  // ── Mode base de données (Neon) ──
  if (process.env.DVF_SOURCE === "database") {
    try {
      const { prisma } = await import("@/lib/prisma");
      const rows = await prisma.dvfMutation.findMany({
        select: {
          id_mutation: true, date_mutation: true, nature_mutation: true,
          valeur_fonciere: true, adresse_numero: true, adresse_nom_voie: true,
          code_postal: true, nom_commune: true, code_commune: true,
          code_departement: true, id_parcelle: true, type_local: true,
          surface_reelle_bati: true, lot1_surface_carrez: true,
          nombre_pieces_principales: true, surface_terrain: true,
          lat: true, lon: true,
        },
      });
      global.__dvfCsvCache = rows.map((row) => ({
        id_mutation: row.id_mutation,
        date_mutation: row.date_mutation,
        nature_mutation: row.nature_mutation,
        valeur_fonciere: row.valeur_fonciere,
        adresse_numero: row.adresse_numero ?? undefined,
        adresse_nom_voie: row.adresse_nom_voie ?? undefined,
        code_postal: row.code_postal ?? undefined,
        nom_commune: row.nom_commune,
        code_commune: row.code_commune,
        code_departement: row.code_departement,
        id_parcelle: row.id_parcelle ?? undefined,
        type_local: row.type_local ?? undefined,
        surface_reelle_bati: row.surface_reelle_bati ?? undefined,
        lot1_surface_carrez: row.lot1_surface_carrez ?? undefined,
        nombre_pieces_principales: row.nombre_pieces_principales ?? undefined,
        surface_terrain: row.surface_terrain ?? undefined,
        lat: row.lat ?? undefined,
        lon: row.lon ?? undefined,
        _source: "csv" as const,
      }));
      global.__dvfCsvLoadedAt = now;
      console.log(`[DVF DB] ${global.__dvfCsvCache.length} mutations chargées depuis Neon`);
      return global.__dvfCsvCache;
    } catch (err) {
      console.error("[DVF DB] Erreur chargement depuis Neon:", err);
      return [];
    }
  }

  // ── Mode CSV local ──
  const csvPath = path.join(
    process.cwd(),
    process.env.DVF_CSV_PATH ?? "data/dvf/2020-2025_mutations_d74.csv"
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

/**
 * Filtre les mutations DVF par rayon géographique (Haversine) + filtre INSEE secondaire
 * pour les mutations sans coordonnées.
 *
 * @param city     Nom de la commune (optionnel) — active le filtre INSEE de secours
 * @param postalCode Code postal (optionnel) — précise la recherche INSEE
 */
export async function loadCsvMutations(
  lat: number,
  lng: number,
  radiusKm: number,
  monthsBack: number,
  propertyTypes?: string[],
  city?: string,
  postalCode?: string,
): Promise<DVFMutation[]> {
  if (process.env.DVF_SOURCE === "database") {
    return loadDbMutations(lat, lng, radiusKm, monthsBack, propertyTypes, city, postalCode);
  }

  const all = await loadAllCsvMutations();

  const dateMin = new Date();
  dateMin.setMonth(dateMin.getMonth() - monthsBack);

  // Récupérer les codes INSEE de la commune pour le filtre de secours
  // (mutations sans coordonnées lat/lon, ~2% du CSV)
  let inseeCodes: string[] = [];
  if (city) {
    try {
      inseeCodes = await getInseeCodesForCity(city, postalCode);
      if (inseeCodes.length > 0) {
        console.log(`[DVF CSV] Codes INSEE pour "${city}" (${postalCode ?? ""}): [${inseeCodes.join(", ")}]`);
      }
    } catch {
      // Non bloquant — le filtre Haversine reste la source principale
    }
  }

  let inseeFallbackCount = 0;

  const filtered = all
    .filter((m) => {
      // Vérifications de base
      if (m.nature_mutation !== "Vente") return false;
      if (!m.valeur_fonciere || m.valeur_fonciere <= 0) return false;
      if (propertyTypes && (!m.type_local || !propertyTypes.includes(m.type_local))) return false;

      const mDate = new Date(m.date_mutation);
      if (mDate < dateMin) return false;

      if (m.lat && m.lon) {
        // ── Filtre primaire : distance Haversine ──
        const dist = haversineDistance(lat, lng, m.lat, m.lon);
        if (dist > radiusKm * 1000) return false;
        m.distance_m = dist;
        return true;
      } else {
        // ── Filtre secondaire : code INSEE pour les mutations sans coordonnées ──
        if (inseeCodes.length === 0) return false;
        const match = inseeCodes.includes(m.code_commune);
        if (match) inseeFallbackCount++;
        return match;
      }
    })
    .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));

  if (inseeFallbackCount > 0) {
    console.log(`[DVF CSV] ${inseeFallbackCount} mutations sans coords récupérées par code INSEE`);
  }

  return filtered;
}

/**
 * Retourne toutes les mutations de la commune (par code INSEE), sans limite de rayon.
 * Utilisé comme étape intermédiaire entre la recherche IRIS (rayon serré) et l'expansion radiale.
 * Les mutations avec coordonnées sont triées par distance croissante si lat/lng fournis.
 */
export async function loadCsvMutationsByCommune(
  depcoms: string[],
  monthsBack: number,
  propertyTypes?: string[],
  lat?: number,
  lng?: number,
): Promise<DVFMutation[]> {
  if (depcoms.length === 0) return [];

  if (process.env.DVF_SOURCE === "database") {
    return loadDbMutationsByCommune(depcoms, monthsBack, propertyTypes, lat, lng);
  }

  const all = await loadAllCsvMutations();

  const dateMin = new Date();
  dateMin.setMonth(dateMin.getMonth() - monthsBack);

  const filtered = all.filter((m) => {
    if (m.nature_mutation !== "Vente") return false;
    if (!m.valeur_fonciere || m.valeur_fonciere <= 0) return false;
    if (propertyTypes && (!m.type_local || !propertyTypes.includes(m.type_local))) return false;
    const mDate = new Date(m.date_mutation);
    if (mDate < dateMin) return false;
    return depcoms.includes(m.code_commune);
  });

  if (lat !== undefined && lng !== undefined) {
    for (const m of filtered) {
      if (m.lat && m.lon && m.distance_m == null) {
        m.distance_m = haversineDistance(lat, lng, m.lat, m.lon);
      }
    }
    filtered.sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));
  }

  console.log(`[DVF CSV] Commune (${depcoms.join(", ")}) : ${filtered.length} mutations`);
  return filtered;
}
