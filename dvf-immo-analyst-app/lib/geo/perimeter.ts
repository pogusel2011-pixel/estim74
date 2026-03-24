import { haversineDistance } from "@/lib/utils";

export interface BoundingBox {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

/**
 * Calcule une bounding box approximative autour d'un point
 */
export function getBoundingBox(lat: number, lng: number, radiusKm: number): BoundingBox {
  const latDelta = radiusKm / 111.0;
  const lngDelta = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180));
  return {
    latMin: lat - latDelta,
    latMax: lat + latDelta,
    lngMin: lng - lngDelta,
    lngMax: lng + lngDelta,
  };
}

/**
 * Filtre un tableau de points par distance
 */
export function filterByRadius<T extends { lat?: number | null; lon?: number | null }>(
  items: T[],
  centerLat: number,
  centerLng: number,
  radiusKm: number
): (T & { distance_m: number })[] {
  return items
    .filter((item) => item.lat != null && item.lon != null)
    .map((item) => ({
      ...item,
      distance_m: haversineDistance(centerLat, centerLng, item.lat!, item.lon!),
    }))
    .filter((item) => item.distance_m <= radiusKm * 1000);
}

export function expandRadius(currentKm: number, step = 0.5, maxKm = 5): number {
  return Math.min(currentKm + step, maxKm);
}
