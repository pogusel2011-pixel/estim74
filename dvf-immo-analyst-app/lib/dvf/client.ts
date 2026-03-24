import { DVFMutation } from "@/types/dvf";
import { loadCsvMutations } from "./csv-loader";

const MIN_SAMPLES = 5;
const EXPANSION_STEP_KM = 0.5;
const MAX_RADIUS_KM = 5;
const DVF_API_BASE = process.env.DVF_API_URL ?? "https://api.cquest.org/dvf";
const DVF_API_TIMEOUT_MS = 8000;

/**
 * Mappe un objet brut de l'API cquest.org vers notre type DVFMutation interne.
 * L'API renvoie des champs identiques au format DVF officiel sauf :
 *  - `distance`  → distance_m (en mètres depuis le point de requête)
 *  - `valeur_fonciere` peut être une chaîne avec virgule décimale
 */
function mapApiRecord(raw: Record<string, unknown>): DVFMutation {
  const parseNum = (v: unknown): number => {
    if (typeof v === "number") return v;
    if (typeof v === "string") return parseFloat(v.replace(",", ".")) || 0;
    return 0;
  };
  const parseNumOpt = (v: unknown): number | undefined => {
    if (v == null || v === "") return undefined;
    const n = parseNum(v);
    return isNaN(n) ? undefined : n;
  };

  return {
    id_mutation: String(raw.id_mutation ?? raw.id ?? ""),
    date_mutation: String(raw.date_mutation ?? ""),
    nature_mutation: String(raw.nature_mutation ?? "Vente"),
    valeur_fonciere: parseNum(raw.valeur_fonciere),
    adresse_numero: raw.adresse_numero ? String(raw.adresse_numero) : undefined,
    adresse_nom_voie: raw.adresse_nom_voie ? String(raw.adresse_nom_voie) : undefined,
    code_postal: raw.code_postal ? String(raw.code_postal) : undefined,
    nom_commune: String(raw.nom_commune ?? ""),
    code_commune: String(raw.code_commune ?? ""),
    code_departement: String(raw.code_departement ?? "74"),
    type_local: raw.type_local ? String(raw.type_local) : undefined,
    surface_reelle_bati: parseNumOpt(raw.surface_reelle_bati),
    lot1_surface_carrez: parseNumOpt(raw.lot1_surface_carrez),
    nombre_pieces_principales: parseNumOpt(raw.nombre_pieces_principales),
    surface_terrain: parseNumOpt(raw.surface_terrain),
    lat: parseNumOpt(raw.lat),
    lon: parseNumOpt(raw.lon),
    // L'API renvoie "distance" (mètres), on le mappe vers distance_m
    distance_m: parseNumOpt(raw.distance ?? raw.distance_m),
    _source: "live",
  };
}

/**
 * Appel à l'API cquest.org/dvf — source temps réel complémentaire au CSV.
 * Filtre par type_local si fourni. Fallback silencieux sur erreur/timeout.
 */
export async function fetchDVFFromAPI(
  lat: number,
  lng: number,
  radiusKm: number,
  monthsBack = 24,
  typeLocal?: string
): Promise<DVFMutation[]> {
  const dateMin = new Date();
  dateMin.setMonth(dateMin.getMonth() - monthsBack);
  const dateStr = dateMin.toISOString().split("T")[0];

  const params: Record<string, string> = {
    lat: String(lat),
    lon: String(lng),
    dist: String(Math.round(radiusKm * 1000)),
    nature_mutation: "Vente",
    date_min: dateStr,
  };
  if (typeLocal) params.type_local = typeLocal;

  const url = `${DVF_API_BASE}?${new URLSearchParams(params)}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(DVF_API_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.warn(`[DVF Live] API ${res.status}: ${url}`);
      return [];
    }

    const data = await res.json();
    const raw: Record<string, unknown>[] = data.resultats ?? data.features ?? data.results ?? [];

    const mapped = raw
      .map((r) => mapApiRecord(r))
      .filter((m) => m.valeur_fonciere > 0 && m.date_mutation);

    console.log(`[DVF Live] ${mapped.length} transactions (rayon ${radiusKm} km, type: ${typeLocal ?? "tous"})`);
    return mapped;
  } catch (err) {
    if ((err as Error).name === "TimeoutError") {
      console.warn("[DVF Live] Timeout — fallback CSV uniquement");
    } else {
      console.warn("[DVF Live] Erreur:", (err as Error).message);
    }
    return [];
  }
}

/**
 * Point d'entrée principal :
 * 1. Charge les mutations depuis le CSV local (source prioritaire, 2014-2024)
 * 2. Appelle l'API cquest.org pour les données récentes (complémentaire)
 * 3. Fusionne + déduplique
 * 4. Auto-expand le rayon par pas de 0.5 km (jusqu'à 5 km) si < 5 transactions
 */
export async function getDVFMutations(
  lat: number,
  lng: number,
  initialRadiusKm: number,
  monthsBack = 24,
  propertyTypes?: string[]
): Promise<{ mutations: DVFMutation[]; source: "csv" | "api" | "mixed"; radiusKm: number }> {
  let radiusKm = initialRadiusKm;

  while (true) {
    const result = await _fetchAtRadius(lat, lng, radiusKm, monthsBack, propertyTypes);

    if (result.mutations.length >= MIN_SAMPLES) {
      if (radiusKm !== initialRadiusKm) {
        console.log(
          `[DVF] Rayon élargi de ${initialRadiusKm} km à ${radiusKm} km (${result.mutations.length} transactions)`
        );
      }
      return { ...result, radiusKm };
    }

    const nextRadius = Math.round((radiusKm + EXPANSION_STEP_KM) * 10) / 10;
    if (nextRadius > MAX_RADIUS_KM) {
      console.warn(
        `[DVF] Rayon max (${MAX_RADIUS_KM} km) atteint avec ${result.mutations.length} transactions`
      );
      return { ...result, radiusKm };
    }

    radiusKm = nextRadius;
  }
}

async function _fetchAtRadius(
  lat: number,
  lng: number,
  radiusKm: number,
  monthsBack: number,
  propertyTypes?: string[]
): Promise<{ mutations: DVFMutation[]; source: "csv" | "api" | "mixed" }> {
  // CSV local en priorité — on marque chaque mutation
  const csvRaw = await loadCsvMutations(lat, lng, radiusKm, monthsBack, propertyTypes);
  const csvMutations: DVFMutation[] = csvRaw.map((m) => ({ ...m, _source: "csv" as const }));

  // API Live en parallèle (on convertit le premier type DVF si disponible)
  const typeLocal = propertyTypes?.[0]; // ex: "Appartement", "Maison"
  const apiMutations = await fetchDVFFromAPI(lat, lng, radiusKm, 18, typeLocal);

  if (csvMutations.length === 0 && apiMutations.length === 0) {
    return { mutations: [], source: "api" };
  }

  if (csvMutations.length > 0 && apiMutations.length > 0) {
    const merged = deduplicateMutations([...csvMutations, ...apiMutations]);
    return { mutations: merged, source: "mixed" };
  }

  if (apiMutations.length > 0) {
    return { mutations: apiMutations, source: "api" };
  }

  return { mutations: csvMutations, source: "csv" };
}

function deduplicateMutations(mutations: DVFMutation[]): DVFMutation[] {
  const seen = new Set<string>();
  return mutations.filter((m) => {
    // Clé de déduplication : date + valeur + rue (insensible à la casse)
    const key = m.id_mutation
      ? m.id_mutation
      : `${m.date_mutation}|${m.valeur_fonciere}|${(m.adresse_nom_voie ?? "").toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
