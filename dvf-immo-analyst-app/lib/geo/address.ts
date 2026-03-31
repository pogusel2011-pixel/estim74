/**
 * Géocode une adresse via l'API Adresse data.gouv.fr (BAN)
 */

/** Score en-dessous duquel on renvoie une erreur bloquante */
const BAN_SCORE_ERROR = 0.5;
/** Score en-dessous duquel on renvoie un avertissement (mais on continue) */
const BAN_SCORE_WARN = 0.7;
/** Score absolu minimum — en-dessous, adresse totalement inconnue */
const BAN_SCORE_MIN = 0.3;

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
}

/** Résultat d'erreur métier retourné quand le score BAN est trop bas */
export interface GeoError {
  error: string;
  score: number;
  label: string;
}

/** Type guard pour distinguer GeoError de GeoResult */
export function isGeoError(r: GeoResult | GeoError | null): r is GeoError {
  return r !== null && "error" in r;
}

export async function geocodeAddress(
  address: string,
  postalCode?: string
): Promise<GeoResult | GeoError | null> {
  const query = postalCode ? `${address} ${postalCode}` : address;
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=1`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.features?.length) return null;

    const feature = data.features[0];
    const score: number = feature.properties.score;
    const label: string = feature.properties.label;
    const type: string = feature.properties.type ?? "unknown";

    console.log(
      `[BAN] score=${score.toFixed(3)} | type=${type} | label="${label}" | query="${query}"`
    );

    // Score trop bas — adresse totalement inconnue ou absurde
    if (score < BAN_SCORE_MIN) {
      return {
        error: "Adresse imprécise ou introuvable — vérifiez la saisie",
        score,
        label,
      };
    }

    // Score bas mais pas nul — erreur bloquante (demander à l'utilisateur de corriger)
    if (score < BAN_SCORE_ERROR) {
      return {
        error:
          "Adresse trop approximative — veuillez préciser le numéro de rue, la commune ou le code postal",
        score,
        label,
      };
    }

    const [lng, lat] = feature.geometry.coordinates;

    // Score moyen — on continue mais on avertit
    const geoQuality: GeoQuality = score < BAN_SCORE_WARN ? "warning" : "good";
    const warning =
      geoQuality === "warning"
        ? "Adresse approximative — vérifiez que les coordonnées correspondent bien au bien"
        : undefined;

    if (warning) {
      console.warn(`[BAN] ⚠️ Score faible (${score.toFixed(3)}) — ${warning} | label="${label}"`);
    }

    return {
      lat,
      lng,
      label,
      score,
      geoQuality,
      warning,
      postalCode: feature.properties.postcode,
      city: feature.properties.city,
      context: feature.properties.context,
      citycode: feature.properties.citycode ?? feature.properties.city_code,
    };
  } catch {
    return null;
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult | null> {
  const url = `https://api-adresse.data.gouv.fr/reverse/?lat=${lat}&lon=${lng}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.features?.length) return null;
    const feature = data.features[0];
    const score: number = feature.properties.score ?? 1;
    return {
      lat,
      lng,
      label: feature.properties.label,
      score,
      geoQuality: score >= BAN_SCORE_WARN ? "good" : score >= BAN_SCORE_ERROR ? "warning" : "error",
      postalCode: feature.properties.postcode,
      city: feature.properties.city,
      citycode: feature.properties.citycode ?? feature.properties.city_code,
    };
  } catch {
    return null;
  }
}
