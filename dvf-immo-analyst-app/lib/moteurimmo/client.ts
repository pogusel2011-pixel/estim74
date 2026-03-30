import { ActiveListing } from "@/types/listing";
import { normalizeMoteurImmoListing } from "./normalize";

/**
 * API MoteurImmo — annonces actives à la vente.
 *
 * Endpoint : GET https://api.moteurimmo.fr/v1/annonces
 * Auth     : Header X-Api-Key: [MOTEURIMMO_API_KEY]
 * Params   : type_bien, code_postal, surface_min, surface_max,
 *            nb_pieces_min, nb_pieces_max, nb_resultats (max 20)
 */

const API_BASE = "https://api.moteurimmo.fr/v1";
const ANNONCES_ENDPOINT = `${API_BASE}/annonces`;
const TIMEOUT_MS = 8000;
const MAX_RESULTATS = 20;

const TYPE_BIEN_MAP: Record<string, string> = {
  APARTMENT: "appartement",
  HOUSE: "maison",
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

  const typeBien = TYPE_BIEN_MAP[params.propertyType];
  if (!typeBien) {
    return [];
  }

  const qp: Record<string, string> = {
    type_bien: typeBien,
    code_postal: params.postalCode,
    nb_resultats: String(Math.min(params.nbResultats ?? MAX_RESULTATS, MAX_RESULTATS)),
  };
  if (params.surfaceMin) qp.surface_min = String(params.surfaceMin);
  if (params.surfaceMax) qp.surface_max = String(params.surfaceMax);
  if (params.roomsMin != null) qp.nb_pieces_min = String(params.roomsMin);
  if (params.roomsMax != null) qp.nb_pieces_max = String(params.roomsMax);

  const url = `${ANNONCES_ENDPOINT}?${new URLSearchParams(qp)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Api-Key": apiKey,
      },
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
      : (data.annonces ?? data.ads ?? data.results ?? data.data ?? []);

    const listings = raw
      .map((item) =>
        normalizeMoteurImmoListing(item, params.subjectLat, params.subjectLng)
      )
      .filter(Boolean) as ActiveListing[];

    console.log(
      `[MoteurImmo] ${listings.length} annonces (${typeBien}, CP ${params.postalCode})`
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
