import { ActiveListing } from "@/types/listing";
import { normalizeMoteurImmoListing } from "./normalize";

/**
 * API MoteurImmo — annonces actives à la vente.
 *
 * Endpoint : POST https://moteurimmo.fr/api/ads
 * Auth     : apiKey dans le corps JSON
 * Réponse  : tableau d'annonces (voir normalizeMoteurImmoListing pour le mapping)
 */

const API_URL = "https://moteurimmo.fr/api/ads";
const TIMEOUT_MS = 8000;

const CATEGORY_MAP: Record<string, string> = {
  APARTMENT: "flat",
  HOUSE: "house",
  LAND: "land",
  COMMERCIAL: "premises",
};

export interface MoteurImmoSearchParams {
  postalCode: string;
  propertyType: string;
  surfaceMin?: number;
  surfaceMax?: number;
  roomsMin?: number;
  roomsMax?: number;
  nbResultats?: number;
  subjectLat?: number;
  subjectLng?: number;
}

export function isApiKeyConfigured(): boolean {
  return Boolean(process.env.MOTEURIMMO_API_KEY);
}

export async function searchMoteurImmo(
  params: MoteurImmoSearchParams
): Promise<ActiveListing[]> {
  const apiKey = process.env.MOTEURIMMO_API_KEY;
  if (!apiKey) {
    console.warn("[MoteurImmo] MOTEURIMMO_API_KEY absent — annonces non disponibles");
    return [];
  }

  const category = CATEGORY_MAP[params.propertyType];
  if (!category) {
    return [];
  }

  const body: Record<string, unknown> = {
    apiKey,
    types: ["sale"],
    categories: [category],
    locations: [{ postalCode: params.postalCode }],
    maxLength: Math.min(params.nbResultats ?? 20, 20),
    options: ["isNotSoldRented"],
  };
  if (params.surfaceMin != null) body.surfaceMin = params.surfaceMin;
  if (params.surfaceMax != null) body.surfaceMax = params.surfaceMax;
  if (params.roomsMin != null) body.roomsMin = params.roomsMin;
  if (params.roomsMax != null) body.roomsMax = params.roomsMax;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[MoteurImmo] Erreur API:", res.status, text.slice(0, 200));
      return [];
    }

    const data = await res.json();
    const raw: unknown[] = Array.isArray(data)
      ? data
      : (data.ads ?? data.results ?? data.data ?? []);

    const listings = raw
      .map((item) =>
        normalizeMoteurImmoListing(item, params.subjectLat, params.subjectLng)
      )
      .filter(Boolean) as ActiveListing[];

    console.log(
      `[MoteurImmo] ${listings.length} annonces (${category}, CP ${params.postalCode})`
    );

    return listings;
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === "AbortError") {
      console.warn("[MoteurImmo] Timeout 8s dépassé — annonces non disponibles");
    } else {
      console.error("[MoteurImmo] Fetch error:", err);
    }
    return [];
  }
}
