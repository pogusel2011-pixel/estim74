import { DVFMutation } from "@/types/dvf";
import { loadCsvMutations } from "./csv-loader";
import { BUSINESS_RULES } from "@/lib/rules/business-rules";

const MIN_SAMPLES = BUSINESS_RULES.MIN_SAMPLE_SIZE.value;
const EXPANSION_STEP_KM = BUSINESS_RULES.GEO_RADIUS_EXPANSION_STEP.value;
const MAX_RADIUS_KM = BUSINESS_RULES.GEO_RADIUS_MAX.value;

const IMMOAPI_BASE = "https://immoapi.app/v1";
const IMMOAPI_TIMEOUT_MS = 10000;
const IMMOAPI_MAX_PER_PAGE = 100;
const IMMOAPI_MAX_PAGES = 3;          // cap à 300 résultats par appel
const IMMOAPI_RADIUS_MAX_M = 5000;    // API accepte au maximum 5 000 mètres

/**
 * Mappe un enregistrement brut de l'API immoapi.app/v1/mutations/nearby vers DVFMutation.
 *
 * Paramètres officiels de l'endpoint :
 *  - radius     : entier en mètres (max 5 000 m)
 *  - lat / lng  : float
 *  - type_local : "Appartement" | "Maison"
 *  - per_page   : integer (max 100)
 *  - page       : integer (pagination)
 *
 * Champs de réponse observés :
 *  - response wrapper : `data` (pas `mutations`)
 *  - distance         : `distance_km` → ×1000 pour distance_m
 *  - nom_commune      : champ `commune`
 *  - latitude/lon     : strings décimales
 *  - valeur_fonciere  : string décimale
 */
function mapImmoApiRecord(raw: Record<string, unknown>): DVFMutation {
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

  const valeur = parseNum(raw.valeur_fonciere);
  const surface =
    parseNumOpt(raw.surface_reelle_bati) ??
    parseNumOpt(raw.lot1_surface_carrez) ??
    parseNumOpt(raw.surface_terrain);
  const prixM2 =
    surface && surface > 0 && valeur > 0
      ? Math.round(valeur / surface)
      : undefined;

  // distance_km → distance_m
  const distKm = parseNumOpt(raw.distance_km);
  const distanceM = distKm != null ? Math.round(distKm * 1000) : undefined;

  // date_mutation peut contenir un suffixe ISO (T00:00:00.000Z) — on tronque à YYYY-MM-DD
  const rawDate = String(raw.date_mutation ?? "");
  const dateMutation = rawDate.slice(0, 10);

  return {
    id_mutation: String(raw.id_mutation ?? raw.id ?? ""),
    date_mutation: dateMutation,
    nature_mutation: String(raw.nature_mutation ?? "Vente"),
    valeur_fonciere: valeur,
    adresse_numero: raw.adresse_numero ? String(raw.adresse_numero) : undefined,
    adresse_nom_voie: raw.adresse_nom_voie ? String(raw.adresse_nom_voie) : undefined,
    code_postal: raw.code_postal ? String(raw.code_postal) : undefined,
    nom_commune: String(raw.commune ?? raw.nom_commune ?? ""),
    code_commune: String(raw.code_commune ?? ""),
    code_departement: String(raw.code_departement ?? "74"),
    type_local: raw.type_local ? String(raw.type_local) : undefined,
    surface_reelle_bati: parseNumOpt(raw.surface_reelle_bati),
    lot1_surface_carrez: parseNumOpt(raw.lot1_surface_carrez),
    nombre_pieces_principales: parseNumOpt(raw.nombre_pieces_principales),
    surface_terrain: parseNumOpt(raw.surface_terrain),
    lat: parseNumOpt(raw.latitude),
    lon: parseNumOpt(raw.longitude),
    distance_m: distanceM,
    prix_m2: prixM2,
    _source: "live",
  };
}

/**
 * Appel à l'API immoapi.app/v1/mutations/nearby — source live complémentaire au CSV.
 *
 * Paramètres API officiels :
 *   lat (float), lng (float), radius (entier mètres, max 5 000),
 *   type_local ("Appartement" | "Maison"), per_page (max 100), page
 *
 * Gère la pagination (max IMMOAPI_MAX_PAGES × 100 résultats).
 * Filtre côté client par date (monthsBack).
 * Fallback silencieux sur erreur/timeout/clé absente.
 *
 * Clé d'authentification : IMMOAPI_KEY
 */
export async function fetchDVFFromAPI(
  lat: number,
  lng: number,
  radiusKm: number,
  monthsBack = 18,
  typeLocal?: string
): Promise<DVFMutation[]> {
  const apiKey = process.env.IMMOAPI_KEY;
  if (!apiKey) {
    console.warn("[DVF Live] IMMOAPI_KEY absent — skip immoapi.app/v1/mutations/nearby");
    return [];
  }

  // Convertir km → mètres entier, plafonné au maximum API
  const radiusM = Math.min(Math.round(radiusKm * 1000), IMMOAPI_RADIUS_MAX_M);

  const dateMin = new Date();
  dateMin.setMonth(dateMin.getMonth() - monthsBack);

  const allMutations: DVFMutation[] = [];

  try {
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= IMMOAPI_MAX_PAGES) {
      const params: Record<string, string> = {
        lat: String(lat),
        lng: String(lng),
        radius: String(radiusM),
        per_page: String(IMMOAPI_MAX_PER_PAGE),
        page: String(page),
      };
      if (typeLocal) params.type_local = typeLocal;

      const url = `${IMMOAPI_BASE}/mutations/nearby?${new URLSearchParams(params)}`;

      const res = await fetch(url, {
        signal: AbortSignal.timeout(IMMOAPI_TIMEOUT_MS),
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!res.ok) {
        console.warn(`[DVF Live] immoapi.app ${res.status} (page ${page}, rayon ${radiusM}m)`);
        break;
      }

      const data = await res.json();
      const raw: Record<string, unknown>[] =
        data.data ?? data.mutations ?? data.results ?? [];

      const mapped = raw
        .map((r) => mapImmoApiRecord(r))
        .filter((m) => {
          if (!m.valeur_fonciere || !m.date_mutation) return false;
          return new Date(m.date_mutation) >= dateMin;
        });

      allMutations.push(...mapped);

      hasMore = raw.length === IMMOAPI_MAX_PER_PAGE;
      page++;
    }

    console.log(
      `[DVF Live] immoapi.app — ${allMutations.length} transactions ` +
      `(rayon ${radiusM}m${typeLocal ? `, type: ${typeLocal}` : ""})`
    );
    return allMutations;
  } catch (err) {
    if ((err as Error).name === "TimeoutError") {
      console.warn("[DVF Live] Timeout immoapi.app — fallback CSV uniquement");
    } else {
      console.warn("[DVF Live] Erreur immoapi.app:", (err as Error).message);
    }
    return [];
  }
}

/**
 * Point d'entrée principal :
 * 1. Charge les mutations depuis le CSV local (source prioritaire, 2014-2024)
 * 2. Si CSV < 5 résultats, appelle immoapi.app comme fallback
 * 3. Fusion + déduplique les sources
 * 4. Auto-expand le rayon par pas de 0.5 km (jusqu'à 5 km) si encore < 5 transactions
 *
 * @param city       Nom de la commune — active le filtre INSEE secondaire
 * @param postalCode Code postal — précise la recherche INSEE
 */
export async function getDVFMutations(
  lat: number,
  lng: number,
  initialRadiusKm: number,
  monthsBack = 24,
  propertyTypes?: string[],
  city?: string,
  postalCode?: string,
): Promise<{ mutations: DVFMutation[]; source: "csv" | "api" | "mixed"; radiusKm: number }> {
  let radiusKm = initialRadiusKm;

  while (true) {
    const result = await _fetchAtRadius(lat, lng, radiusKm, monthsBack, propertyTypes, city, postalCode);

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

/**
 * Stratégie CSV-first à un rayon donné :
 * 1. Interroge le CSV local (données 2014-2024, source fiable)
 * 2. Si CSV ≥ MIN_SAMPLES → retourne CSV uniquement (rapide, pas d'appel API)
 * 3. Si CSV insuffisant → appelle immoapi.app comme complément
 * 4. Fusionne et déduplique les deux sources
 */
async function _fetchAtRadius(
  lat: number,
  lng: number,
  radiusKm: number,
  monthsBack: number,
  propertyTypes?: string[],
  city?: string,
  postalCode?: string,
): Promise<{ mutations: DVFMutation[]; source: "csv" | "api" | "mixed" }> {
  // Étape 1 : CSV local (priorité absolue)
  const csvRaw = await loadCsvMutations(lat, lng, radiusKm, monthsBack, propertyTypes, city, postalCode);
  const csvMutations: DVFMutation[] = csvRaw.map((m) => ({ ...m, _source: "csv" as const }));

  // Étape 2 : CSV suffisant → on n'appelle pas l'API
  if (csvMutations.length >= MIN_SAMPLES) {
    return { mutations: csvMutations, source: "csv" };
  }

  // Étape 3 : CSV insuffisant → ImmoAPI comme fallback
  console.log(
    `[DVF] CSV insuffisant (${csvMutations.length} tx, rayon ${radiusKm} km) — interrogation immoapi.app`
  );
  const typeLocal = propertyTypes?.[0];
  const apiMutations = await fetchDVFFromAPI(lat, lng, radiusKm, monthsBack, typeLocal);

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
    const key = m.id_mutation
      ? m.id_mutation
      : `${m.date_mutation}|${m.valeur_fonciere}|${(m.adresse_nom_voie ?? "").toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
