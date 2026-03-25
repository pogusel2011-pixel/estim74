import { ActiveListing } from "@/types/listing";
import { normalizeMoteurImmoListing } from "./normalize";

const API_URL = "https://moteurimmo.fr/api/ads";
const API_KEY = process.env.MOTEURIMMO_API_KEY ?? "";

/**
 * MoteurImmo renvoie category = "flat" (appartement) ou "house" (maison).
 * Le champ categories dans le body POST n'accepte pas de valeurs reconnues
 * → on filtre localement après la requête.
 */
const CATEGORY_FILTER: Record<string, string> = {
  APARTMENT: "flat",
  HOUSE: "house",
};

export interface MoteurImmoSearchParams {
  inseeCode: string;
  propertyType: string; // "APARTMENT" | "HOUSE" | "LAND" | "COMMERCIAL"
  surfaceMin: number;
  surfaceMax: number;
  maxLength?: number;
  /** Coordonnées du bien sujet pour calculer la distance de chaque annonce */
  subjectLat?: number;
  subjectLng?: number;
}

export function isApiKeyConfigured(): boolean {
  return Boolean(API_KEY);
}

export async function searchMoteurImmo(
  params: MoteurImmoSearchParams
): Promise<ActiveListing[]> {
  if (!API_KEY) {
    console.warn("[MoteurImmo] Clé API absente — marché affiché indisponible");
    return [];
  }

  // Terrain / Commercial non supportés par l'API MoteurImmo
  const categoryFilter = CATEGORY_FILTER[params.propertyType];
  if (!categoryFilter) {
    return [];
  }

  // L'API accepte surfaceMin/surfaceMax uniquement si les deux sont fournis
  const body: Record<string, unknown> = {
    apiKey: API_KEY,
    types: ["sale"],
    locations: [{ inseeCode: params.inseeCode }],
    maxLength: Math.min(params.maxLength ?? 30, 100),
  };
  if (params.surfaceMin) body.surfaceMin = params.surfaceMin;
  if (params.surfaceMax) body.surfaceMax = params.surfaceMax;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[MoteurImmo] Erreur API:", res.status, text.slice(0, 200));
      return [];
    }

    const data = await res.json();
    const raw: unknown[] = Array.isArray(data) ? data : (data.ads ?? data.results ?? data.data ?? []);

    // Filtre local par category (flat / house) car le champ categories du body est non supporté
    const filtered = raw.filter((item) => {
      const ad = item as Record<string, unknown>;
      return ad.category === categoryFilter;
    });

    return filtered
      .map((item) => normalizeMoteurImmoListing(item, params.subjectLat, params.subjectLng))
      .filter(Boolean) as ActiveListing[];
  } catch (err) {
    clearTimeout(timeout);
    if ((err as Error).name === "AbortError") {
      console.warn("[MoteurImmo] Timeout 8s dépassé");
    } else {
      console.error("[MoteurImmo] Fetch error:", err);
    }
    return [];
  }
}
