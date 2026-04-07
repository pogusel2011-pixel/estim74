import { DVFMutation } from "@/types/dvf";
import { haversineDistance } from "@/lib/utils";

const DVF_LIVE_URL = "https://dvf.data.gouv.fr/api/getDvfLive";
const TIMEOUT_MS = 8_000;

/**
 * Shape retournée par l'API DVF Live data.gouv.fr.
 * Les noms de champs suivent la convention DVF officielle (CSV DGFiP).
 * Champs `latitude`/`longitude` utilisés en fallback si `lat`/`lon` absents.
 */
interface DvfLiveRow {
  id_mutation?: string;
  date_mutation?: string;
  nature_mutation?: string;
  valeur_fonciere?: number | string;
  adresse_numero?: string;
  adresse_nom_voie?: string;
  code_postal?: string;
  nom_commune?: string;
  code_commune?: string;
  code_departement?: string;
  id_parcelle?: string;
  type_local?: string;
  surface_reelle_bati?: number | string;
  lot1_surface_carrez?: number | string;
  nombre_pieces_principales?: number | string;
  surface_terrain?: number | string;
  // Coords — official DVF uses lat/lon; some APIs return latitude/longitude
  lat?: number | string;
  lon?: number | string;
  latitude?: number | string;
  longitude?: number | string;
}

function parseNum(v: number | string | undefined): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function rowToMutation(row: DvfLiveRow, subjectLat: number, subjectLng: number): DVFMutation | null {
  if (row.nature_mutation !== "Vente") return null;

  const valeur = parseNum(row.valeur_fonciere);
  if (valeur <= 0) return null;

  const surface = parseNum(row.surface_reelle_bati) || parseNum(row.lot1_surface_carrez);
  if (surface <= 0) return null;

  const rowLat = parseNum(row.lat ?? row.latitude) || undefined;
  const rowLon = parseNum(row.lon ?? row.longitude) || undefined;

  const distanceM = rowLat && rowLon
    ? haversineDistance(subjectLat, subjectLng, rowLat, rowLon)
    : undefined;

  const idMutation = row.id_mutation
    ?? `dvf-live|${row.date_mutation ?? ""}|${valeur}|${row.adresse_nom_voie ?? ""}`;

  return {
    id_mutation: idMutation,
    date_mutation: row.date_mutation ?? "",
    nature_mutation: "Vente",
    valeur_fonciere: valeur,
    adresse_numero: row.adresse_numero,
    adresse_nom_voie: row.adresse_nom_voie,
    code_postal: row.code_postal,
    nom_commune: row.nom_commune ?? "",
    code_commune: row.code_commune ?? "",
    code_departement: row.code_departement ?? "74",
    id_parcelle: row.id_parcelle,
    type_local: row.type_local,
    surface_reelle_bati: surface,
    lot1_surface_carrez: parseNum(row.lot1_surface_carrez) || undefined,
    nombre_pieces_principales: parseNum(row.nombre_pieces_principales) || undefined,
    surface_terrain: parseNum(row.surface_terrain) || undefined,
    lat: rowLat,
    lon: rowLon,
    distance_m: distanceM,
    _source: "dvf-live",
  };
}

/**
 * Récupère les transactions récentes (< 6 mois) depuis l'API DVF Live data.gouv.fr.
 * Non-bloquant : timeout 8 s, retourne [] en cas d'erreur ou de timeout.
 *
 * @param lat           Latitude du bien
 * @param lng           Longitude du bien
 * @param radiusKm      Rayon de recherche en km
 * @param propertyTypes Types de biens DVF à conserver (ex: ["Appartement", "Maison"])
 */
export async function fetchDvfLive(
  lat: number,
  lng: number,
  radiusKm: number,
  propertyTypes?: string[],
): Promise<DVFMutation[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    rayon: String(Math.round(radiusKm * 1000)),
    nb: "200",
  });

  try {
    const res = await fetch(`${DVF_LIVE_URL}?${params}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[DVF Live] HTTP ${res.status} — données exclues`);
      return [];
    }

    const json: unknown = await res.json();
    if (!Array.isArray(json)) {
      console.warn("[DVF Live] Format inattendu :", typeof json);
      return [];
    }

    const mutations: DVFMutation[] = [];
    for (const row of json as DvfLiveRow[]) {
      if (propertyTypes && row.type_local && !propertyTypes.includes(row.type_local)) continue;
      const m = rowToMutation(row, lat, lng);
      if (m) mutations.push(m);
    }

    console.log(`[DVF Live] ${mutations.length} transactions récentes récupérées (rayon ${radiusKm} km)`);
    return mutations;
  } catch (err) {
    clearTimeout(timer);
    const msg = (err as Error).message ?? "";
    if ((err as Error).name === "AbortError") {
      console.warn("[DVF Live] Timeout 8 s — données exclues de cette analyse");
    } else if (msg.includes("ENOTFOUND") || msg.includes("fetch failed")) {
      console.warn("[DVF Live] API non joignable (ENOTFOUND) — données exclues");
    } else {
      console.warn("[DVF Live] Erreur :", msg);
    }
    return [];
  }
}
