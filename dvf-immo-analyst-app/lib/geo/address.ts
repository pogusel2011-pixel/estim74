/**
 * Géocode une adresse via l'API Adresse data.gouv.fr (BAN)
 */
export interface GeoResult {
  lat: number;
  lng: number;
  label: string;
  score: number;
  postalCode?: string;
  city?: string;
  context?: string;
}

export async function geocodeAddress(address: string, postalCode?: string): Promise<GeoResult | null> {
  const query = postalCode ? `${address} ${postalCode}` : address;
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=1`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.features?.length) return null;

    const feature = data.features[0];
    const [lng, lat] = feature.geometry.coordinates;
    return {
      lat,
      lng,
      label: feature.properties.label,
      score: feature.properties.score,
      postalCode: feature.properties.postcode,
      city: feature.properties.city,
      context: feature.properties.context,
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
    };
  } catch {
    return null;
  }
}
