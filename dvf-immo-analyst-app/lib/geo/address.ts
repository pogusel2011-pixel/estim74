/**
 * Géocodage d'adresses — IGN Géoplateforme (primaire) + BAN data.gouv.fr (fallback)
 *
 * 1. geocodeAddress() : essaie IGN d'abord ; si score insuffisant ou erreur → BAN
 * 2. reverseGeocode()  : IGN d'abord, BAN en fallback
 * 3. lookupParcel()    : IGN reverse index=parcel → données cadastrales (non bloquant)
 *
 * Aucune clé API requise pour les deux APIs.
 */

// ── Seuils de score ────────────────────────────────────────────────────────
/** Score en-dessous duquel on renvoie une erreur bloquante */
const SCORE_ERROR = 0.5;
/** Score en-dessous duquel on renvoie un avertissement (mais on continue) */
const SCORE_WARN = 0.7;
/** Score absolu minimum — en-dessous, adresse totalement inconnue */
const SCORE_MIN = 0.3;

// ── Endpoints ─────────────────────────────────────────────────────────────
const IGN_BASE  = "https://data.geopf.fr/geocodage";
const BAN_BASE  = "https://api-adresse.data.gouv.fr";

// ── Cache géocodage en mémoire (TTL 24h, scope processus) ─────────────────
const GEO_CACHE = new Map<string, { result: GeoResult | GeoError | null; ts: number }>();
const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ── Types publics ──────────────────────────────────────────────────────────
export type GeoQuality = "good" | "warning" | "error";

export interface GeoResult {
  lat: number;
  lng: number;
  label: string;
  score: number;
  /** Qualité du géocodage : good ≥0.7, warning 0.5–0.7, error <0.5 */
  geoQuality: GeoQuality;
  /** Message d'avertissement si geoQuality === "warning" */
  warning?: string;
  postalCode?: string;
  city?: string;
  context?: string;
  /** Code INSEE de la commune (ex: "74010" pour Annecy) */
  citycode?: string;
  /** Source du géocodage */
  source?: "ign" | "ban";
}

/** Résultat d'erreur métier retourné quand le score est trop bas */
export interface GeoError {
  error: string;
  score: number;
  label: string;
}

/** Données cadastrales retournées par l'API parcelle IGN */
export interface CadastralData {
  /** Référence cadastrale complète (ex: "74010000AB0042") */
  ref: string;
  /** Section cadastrale (ex: "AB") */
  section: string;
  /** Numéro de parcelle dans la section (ex: "0042") */
  numero: string;
  /** Code INSEE commune (ex: "74010") */
  codeCommune?: string;
  /** Nom de la commune */
  commune?: string;
}

/** Type guard pour distinguer GeoError de GeoResult */
export function isGeoError(r: GeoResult | GeoError | null): r is GeoError {
  return r !== null && "error" in r;
}

// ── Normalisation interne d'une feature GeoJSON ───────────────────────────

interface RawFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, unknown>;
}

function extractGeoResult(
  feature: RawFeature,
  source: "ign" | "ban"
): GeoResult {
  const props = feature.properties;
  const score: number =
    typeof props.score === "number" ? props.score : Number(props.score ?? 0);
  const label = String(props.label ?? "");
  const [lng, lat] = feature.geometry.coordinates;

  const postalCode =
    String(props.postcode ?? props.code_postal ?? "").trim() || undefined;
  const city =
    String(props.city ?? props.nom_com ?? props.nom_commune ?? "").trim() ||
    undefined;
  const citycode =
    String(props.citycode ?? props.code_com ?? props.insee ?? "").trim() ||
    undefined;
  const context = props.context ? String(props.context) : undefined;

  const geoQuality: GeoQuality =
    score < SCORE_ERROR ? "error" : score < SCORE_WARN ? "warning" : "good";
  const warning =
    geoQuality === "warning"
      ? "Adresse approximative — vérifiez que les coordonnées correspondent bien au bien"
      : undefined;

  return { lat, lng, label, score, geoQuality, warning, postalCode, city, context, citycode, source };
}

// ── Geocoding IGN Géoplateforme ────────────────────────────────────────────

async function fetchIGN(
  url: string
): Promise<{ features: RawFeature[] } | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data?.features) || data.features.length === 0) return null;
    return data as { features: RawFeature[] };
  } catch {
    return null;
  }
}

async function fetchBAN(
  url: string
): Promise<{ features: RawFeature[] } | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data?.features) || data.features.length === 0) return null;
    return data as { features: RawFeature[] };
  } catch {
    return null;
  }
}

// ── API publique : geocodeAddress ──────────────────────────────────────────

async function geocodeAddressImpl(
  address: string,
  postalCode?: string
): Promise<GeoResult | GeoError | null> {
  const query = postalCode ? `${address} ${postalCode}` : address;

  // ── 1. IGN Géoplateforme (primaire) ──────────────────────────────────────
  const ignUrl = `${IGN_BASE}/search?q=${encodeURIComponent(query)}&limit=1`;
  const ignData = await fetchIGN(ignUrl);

  if (ignData) {
    const feature = ignData.features[0];
    const score: number =
      typeof feature.properties.score === "number"
        ? feature.properties.score
        : Number(feature.properties.score ?? 0);
    const label = String(feature.properties.label ?? "");
    const type = String(feature.properties.type ?? "unknown");

    console.log(
      `[IGN] score=${score.toFixed(3)} | type=${type} | label="${label}" | query="${query}"`
    );

    if (score >= SCORE_MIN) {
      if (score < SCORE_ERROR) {
        return {
          error: "Adresse trop approximative — veuillez préciser le numéro de rue, la commune ou le code postal",
          score,
          label,
        };
      }
      const result = extractGeoResult(feature, "ign");
      if (result.warning) {
        console.warn(`[IGN] ⚠️ Score faible (${score.toFixed(3)}) — ${result.warning}`);
      }
      return result;
    }
    // Score trop bas sur IGN → essai BAN
    console.log(`[IGN] Score ${score.toFixed(3)} trop bas → fallback BAN`);
  } else {
    console.log("[IGN] Pas de résultat → fallback BAN");
  }

  // ── 2. BAN data.gouv.fr (fallback) ───────────────────────────────────────
  const banUrl = `${BAN_BASE}/search/?q=${encodeURIComponent(query)}&limit=1`;
  const banData = await fetchBAN(banUrl);

  if (!banData) return null;

  const feature = banData.features[0];
  const score: number =
    typeof feature.properties.score === "number"
      ? feature.properties.score
      : Number(feature.properties.score ?? 0);
  const label = String(feature.properties.label ?? "");
  const type = String(feature.properties.type ?? "unknown");

  console.log(
    `[BAN] score=${score.toFixed(3)} | type=${type} | label="${label}" | query="${query}"`
  );

  if (score < SCORE_MIN) {
    return {
      error: "Adresse imprécise ou introuvable — vérifiez la saisie",
      score,
      label,
    };
  }
  if (score < SCORE_ERROR) {
    return {
      error: "Adresse trop approximative — veuillez préciser le numéro de rue, la commune ou le code postal",
      score,
      label,
    };
  }

  const result = extractGeoResult(feature, "ban");
  if (result.warning) {
    console.warn(`[BAN] ⚠️ Score faible (${score.toFixed(3)}) — ${result.warning}`);
  }
  return result;
}

export async function geocodeAddress(
  address: string,
  postalCode?: string
): Promise<GeoResult | GeoError | null> {
  const key = `${address.trim().toLowerCase()}|${postalCode?.trim() ?? ""}`;
  const hit = GEO_CACHE.get(key);
  if (hit && Date.now() - hit.ts < GEO_CACHE_TTL_MS) return hit.result;
  const result = await geocodeAddressImpl(address, postalCode);
  GEO_CACHE.set(key, { result, ts: Date.now() });
  return result;
}

// ── API publique : reverseGeocode ──────────────────────────────────────────

export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult | null> {
  // IGN first
  const ignUrl = `${IGN_BASE}/reverse?lon=${lng}&lat=${lat}&limit=1`;
  try {
    const res = await fetch(ignUrl, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.features) && data.features.length > 0) {
        return extractGeoResult(data.features[0] as RawFeature, "ign");
      }
    }
  } catch {
    // fall through to BAN
  }

  // BAN fallback
  const banUrl = `${BAN_BASE}/reverse/?lat=${lat}&lon=${lng}`;
  try {
    const res = await fetch(banUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data?.features) || data.features.length === 0) return null;
    const feature = data.features[0];
    const score: number = feature.properties.score ?? 1;
    return {
      lat,
      lng,
      label: String(feature.properties.label ?? ""),
      score,
      geoQuality: score >= SCORE_WARN ? "good" : score >= SCORE_ERROR ? "warning" : "error",
      postalCode: feature.properties.postcode,
      city: feature.properties.city,
      citycode: feature.properties.citycode ?? feature.properties.city_code,
      source: "ban",
    };
  } catch {
    return null;
  }
}

// ── API publique : lookupParcel (données cadastrales IGN) ─────────────────

/**
 * Identifie la parcelle cadastrale d'un point via l'API IGN Géoplateforme
 * (index=parcel, reverse geocoding). Non bloquant : retourne null si l'API
 * échoue ou si aucune parcelle n'est trouvée.
 *
 * URL : https://data.geopf.fr/geocodage/reverse?lon=...&lat=...&index=parcel&limit=1
 */
export async function lookupParcel(
  lat: number,
  lng: number
): Promise<CadastralData | null> {
  const url = `${IGN_BASE}/reverse?lon=${lng}&lat=${lat}&index=parcel&limit=1`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;

    const data = await res.json();
    if (!Array.isArray(data?.features) || data.features.length === 0) return null;

    const props = data.features[0].properties as Record<string, unknown>;

    // Fields returned by IGN parcel index
    // section: cadastral section (e.g. "AB" or "000AB")
    // numero:  parcel number within section (e.g. "0042")
    // id:      full cadastral reference if provided
    // code_com / nom_com: commune identifiers
    const rawSection = String(props.section ?? props.feuille ?? "").trim().toUpperCase();
    const rawNumero  = String(props.numero ?? props.numero_parcelle ?? "").trim();
    const codeCommune = String(
      props.code_com ?? props.codeCommune ?? props.code_insee ?? ""
    ).trim() || undefined;
    const commune = String(
      props.nom_com ?? props.nom_commune ?? props.city ?? ""
    ).trim() || undefined;

    if (!rawSection || !rawNumero) {
      console.log("[Parcel-IGN] Résultat sans section/numéro:", JSON.stringify(props));
      return null;
    }

    // Build a normalized section (last 2 chars if prefixed with zeros, e.g. "000AB" → "AB")
    const section = rawSection.replace(/^0+([A-Z]{1,2})$/, "$1") || rawSection;
    // Normalize numero to 4 digits
    const numero = rawNumero.padStart(4, "0");

    // Build full cadastral reference: codeCommune(5) + section(2) + numero(4) = 11 chars
    // or use IGN-provided id if available
    const ref = props.id
      ? String(props.id)
      : [codeCommune ?? "00000", section.padStart(2, "0"), numero].join("");

    console.log(`[Parcel-IGN] ${ref} — section ${section} n°${numero} (${commune ?? "?"})`);
    return { ref, section, numero, codeCommune, commune };
  } catch (err) {
    console.warn("[Parcel-IGN] Lookup échoué (non bloquant):", (err as Error).message);
    return null;
  }
}
