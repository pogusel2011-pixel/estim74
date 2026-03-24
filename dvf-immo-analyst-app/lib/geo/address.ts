/**
 * Géocode une adresse via l'API Adresse data.gouv.fr (BAN)
 */

const BAN_MIN_SCORE = 0.3;

export interface GeoResult {
  lat: number;
  lng: number;
  label: string;
  score: number;
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

    // Seuil de qualité : score < 0.3 = adresse trop floue
    if (score < BAN_MIN_SCORE) {
      return {
        error: "Adresse imprécise ou introuvable, veuillez vérifier la saisie",
        score,
        label: feature.properties.label,
      };
    }

    const [lng, lat] = feature.geometry.coordinates;
    return {
      lat,
      lng,
      label: feature.properties.label,
      score,
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
    return {
      lat,
      lng,
      label: feature.properties.label,
      score: feature.properties.score,
      postalCode: feature.properties.postcode,
      city: feature.properties.city,
      citycode: feature.properties.citycode ?? feature.properties.city_code,
    };
  } catch {
    return null;
  }
}
