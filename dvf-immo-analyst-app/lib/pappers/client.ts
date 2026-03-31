import { DVFMutation } from "@/types/dvf";

const PAPPERS_BASE = "https://api-immobilier.pappers.fr/v1";
const PAPPERS_TIMEOUT_MS = 8000;

/** Lettre DPE valide (A-G) */
const DPE_LETTERS = new Set(["A", "B", "C", "D", "E", "F", "G"]);

/**
 * Construit les query params d'auth Pappers.
 * L'API Pappers Immobilier utilise api_token en query param (pas de header api-key).
 * Le plan d'entrée est limité à par_page=1 — ce paramètre est obligatoire.
 */
function pappersParams(extra: Record<string, string> = {}): URLSearchParams {
  const apiKey = process.env.PAPPERS_API_KEY ?? "";
  return new URLSearchParams({ api_token: apiKey, par_page: "1", ...extra });
}

/**
 * Extrait le tableau de résultats depuis la réponse Pappers.
 * La clé top-level réelle est "resultats" (confirmé en production).
 */
function extractResultats(data: Record<string, unknown>): Record<string, unknown>[] {
  const arr =
    data.resultats ??
    data.parcelles ??
    data.results ??
    data.data ??
    (Array.isArray(data) ? data : []);
  return Array.isArray(arr) ? (arr as Record<string, unknown>[]) : [];
}

// ─── Enrich DPE + Batiments ─────────────────────────────────────────────────

export interface PappersEnrichResult {
  dpeLetter?: string;
  yearBuilt?: number;
}

/**
 * Récupère le DPE et l'année de construction d'un bien depuis Pappers Immobilier.
 * GET /parcelles?adresse=[adresse]&bases=dpe,batiments&par_page=1&api_token=[key]
 *
 * Structure réelle de la réponse (confirmée) :
 *   { resultats: [{ dpe: [{classe_bilan_dpe, classe_conso_energie_arrete_2012, ...}],
 *                   batiments: [{annee_construction, ...}] }] }
 *
 * Retourne null si la clé est absente, si l'API échoue ou si aucune donnée n'est trouvée.
 */
export async function fetchPappersEnrich(
  adresse: string,
  postalCode?: string
): Promise<PappersEnrichResult | null> {
  const apiKey = process.env.PAPPERS_API_KEY;
  if (!apiKey) {
    console.warn("[Pappers] PAPPERS_API_KEY absent — enrichissement DPE ignoré");
    return null;
  }

  const query = postalCode ? `${adresse} ${postalCode}` : adresse;
  const url = `${PAPPERS_BASE}/parcelles?${pappersParams({
    adresse: query,
    bases: "dpe,batiments",
  })}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(PAPPERS_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.warn(`[Pappers] /parcelles DPE → HTTP ${res.status}`);
      return null;
    }

    const data = await res.json() as Record<string, unknown>;
    const parcelles = extractResultats(data);
    if (!parcelles.length) {
      console.log(`[Pappers] Aucune parcelle trouvée pour "${query}"`);
      return null;
    }

    const parcelle = parcelles[0];
    let dpeLetter: string | undefined;
    let yearBuilt: number | undefined;

    // ── DPE : tableau de diagnostics ──────────────────────────────────────
    // Champs vérifiés en production :
    //   classe_bilan_dpe          → label DPE post-2021 (ex: "E")
    //   classe_conso_energie_arrete_2012 → label DPE pré-2021 (ex: "E")
    const dpeArr: Record<string, unknown>[] = Array.isArray(parcelle.dpe)
      ? (parcelle.dpe as Record<string, unknown>[])
      : parcelle.dpe
        ? [parcelle.dpe as Record<string, unknown>]
        : [];

    // On préfère le DPE le plus récent (dernier dans le tableau)
    const dpe = dpeArr[dpeArr.length - 1];
    if (dpe) {
      const raw =
        dpe.classe_bilan_dpe ??
        dpe.classe_conso_energie_arrete_2012 ??
        dpe.classe_consommation_energie ??
        dpe.classe_dpe ??
        dpe.lettre_dpe ??
        dpe.classe;
      const letter = String(raw ?? "").toUpperCase().trim().charAt(0);
      if (DPE_LETTERS.has(letter)) dpeLetter = letter;

      // Année de construction depuis le DPE (fallback)
      if (!yearBuilt) {
        const rawYear = dpe.annee_construction_dpe ?? dpe.annee_construction;
        const y = Number(rawYear);
        if (y >= 1800 && y <= new Date().getFullYear()) yearBuilt = y;
      }
    }

    // ── Bâtiment : tableau BDNB (plus fiable que DPE pour l'année) ───────
    const batArr: Record<string, unknown>[] = Array.isArray(parcelle.batiments)
      ? (parcelle.batiments as Record<string, unknown>[])
      : parcelle.batiment
        ? [parcelle.batiment as Record<string, unknown>]
        : [];

    const batiment = batArr[0];
    if (batiment) {
      const rawYear =
        batiment.annee_construction ??
        batiment.date_construction ??
        batiment.annee;
      const y = Number(rawYear);
      if (y >= 1800 && y <= new Date().getFullYear()) yearBuilt = y;
    }

    if (dpeLetter || yearBuilt) {
      console.log(
        `[Pappers] Enrichissement OK — DPE: ${dpeLetter ?? "??"}, ` +
        `construction: ${yearBuilt ?? "??"} (${adresse})`
      );
    } else {
      console.log(`[Pappers] Parcelle trouvée mais DPE/année vides (${adresse})`);
    }

    return { dpeLetter, yearBuilt };
  } catch (err) {
    if ((err as Error).name === "TimeoutError") {
      console.warn("[Pappers] Timeout enrichissement DPE");
    } else {
      console.warn("[Pappers] Erreur enrichissement:", (err as Error).message);
    }
    return null;
  }
}

// ─── Comparable Sales ────────────────────────────────────────────────────────

/**
 * Recherche des transactions comparables via Pappers Immobilier.
 * GET /parcelles?latitude=[lat]&longitude=[lng]&distance=[radiusM]
 *              &bases=ventes&type_local_vente=[typeLocal]&date_vente_min=[dateMin]
 *              &par_page=1&api_token=[key]
 *
 * Note : sur le plan actuel, la clé "ventes" dans chaque parcelle peut être vide
 * si l'abonnement ne couvre pas l'historique des transactions géolocalisées.
 * Dans ce cas, fetchPappersSales retourne [] sans erreur — le fallback DVF CSV
 * reste la source principale.
 *
 * Retourne [] si la clé est absente, si l'API échoue ou si aucune vente n'est trouvée.
 */
export async function fetchPappersSales(
  lat: number,
  lng: number,
  radiusM: number,
  typeLocal?: string,
  monthsBack = 24
): Promise<DVFMutation[]> {
  const apiKey = process.env.PAPPERS_API_KEY;
  if (!apiKey) {
    console.warn("[Pappers] PAPPERS_API_KEY absent — ventes comparables ignorées");
    return [];
  }

  const dateMin = new Date();
  dateMin.setMonth(dateMin.getMonth() - monthsBack);
  const dateMinStr = dateMin.toISOString().slice(0, 10);

  const extra: Record<string, string> = {
    lat: String(lat),
    lon: String(lng),
    rayon: String(Math.round(radiusM)),
    bases: "ventes",
    date_vente_min: dateMinStr,
  };
  if (typeLocal) extra.type_local_vente = typeLocal;

  const url = `${PAPPERS_BASE}/parcelles?${pappersParams(extra)}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(PAPPERS_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.warn(`[Pappers] /parcelles ventes → HTTP ${res.status}`);
      return [];
    }

    const data = await res.json() as Record<string, unknown>;
    const parcelles = extractResultats(data);

    const mutations: DVFMutation[] = [];

    for (const parcelle of parcelles) {
      const p = parcelle as Record<string, unknown>;
      const parcelLat = Number(p.latitude ?? p.lat ?? 0) || undefined;
      const parcelLon = Number(p.longitude ?? p.lon ?? p.lng ?? 0) || undefined;

      const ventes: Record<string, unknown>[] =
        Array.isArray(p.ventes) ? (p.ventes as Record<string, unknown>[]) : [];

      for (const v of ventes) {
        const mut = mapPappersVenteToMutation(v, parcelLat, parcelLon, lat, lng);
        if (mut) mutations.push(mut);
      }
    }

    console.log(
      `[Pappers] ${mutations.length} transactions (rayon ${radiusM}m` +
      `${typeLocal ? `, type: ${typeLocal}` : ""}, depuis ${dateMinStr}, ` +
      `${parcelles.length} parcelle(s) inspectée(s))`
    );

    return mutations;
  } catch (err) {
    if ((err as Error).name === "TimeoutError") {
      console.warn("[Pappers] Timeout ventes comparables");
    } else {
      console.warn("[Pappers] Erreur ventes:", (err as Error).message);
    }
    return [];
  }
}

// ─── Mapping interne ────────────────────────────────────────────────────────

function mapPappersVenteToMutation(
  v: Record<string, unknown>,
  parcelLat: number | undefined,
  parcelLon: number | undefined,
  searchLat: number,
  searchLng: number
): DVFMutation | null {
  const parseNum = (x: unknown): number => {
    if (typeof x === "number") return x;
    if (typeof x === "string") return parseFloat(x.replace(",", ".")) || 0;
    return 0;
  };
  const parseNumOpt = (x: unknown): number | undefined => {
    if (x == null || x === "") return undefined;
    const n = parseNum(x);
    return isNaN(n) || n === 0 ? undefined : n;
  };

  const valeur = parseNum(v.valeur_fonciere ?? v.prix ?? v.prix_vente);
  if (!valeur) return null;

  const rawDate =
    String(v.date_mutation ?? v.date_vente ?? v.date ?? "").slice(0, 10);
  if (!rawDate || rawDate.length < 10) return null;

  const surface =
    parseNumOpt(v.surface_reelle_bati) ??
    parseNumOpt(v.lot1_surface_carrez) ??
    parseNumOpt(v.surface) ??
    parseNumOpt(v.surface_terrain);

  const prixM2 =
    surface && surface > 0 && valeur > 0
      ? Math.round(valeur / surface)
      : undefined;

  let distanceM: number | undefined;
  if (parcelLat != null && parcelLon != null) {
    distanceM = Math.round(haversineM(searchLat, searchLng, parcelLat, parcelLon));
  }

  return {
    id_mutation: String(v.id_mutation ?? v.id ?? `pappers-${rawDate}-${valeur}`),
    date_mutation: rawDate,
    nature_mutation: String(v.nature_mutation ?? "Vente"),
    valeur_fonciere: valeur,
    adresse_nom_voie: v.adresse_nom_voie ? String(v.adresse_nom_voie) : undefined,
    code_postal: v.code_postal ? String(v.code_postal) : undefined,
    nom_commune: String(v.nom_commune ?? v.commune ?? ""),
    code_commune: String(v.code_commune ?? v.code_insee ?? ""),
    code_departement: String(v.code_departement ?? "74"),
    type_local: v.type_local ? String(v.type_local) : undefined,
    surface_reelle_bati: parseNumOpt(v.surface_reelle_bati ?? v.surface),
    lot1_surface_carrez: parseNumOpt(v.lot1_surface_carrez),
    nombre_pieces_principales: parseNumOpt(v.nombre_pieces_principales ?? v.nb_pieces),
    surface_terrain: parseNumOpt(v.surface_terrain),
    lat: parcelLat,
    lon: parcelLon,
    distance_m: distanceM,
    prix_m2: prixM2,
    _source: "live",
  };
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
