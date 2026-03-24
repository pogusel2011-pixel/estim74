import { ActiveListing } from "@/types/listing";
import { normalizeListing } from "./normalize";

const API_URL = process.env.MOTEURIMMO_API_URL ?? "https://api.moteurimmo.fr/v1";
const API_KEY = process.env.MOTEURIMMO_API_KEY ?? "";

export interface MoteurImmoSearchParams {
  type: string;
  postalCode: string;
  surfaceMin: number;
  surfaceMax: number;
  roomsMin?: number;
  roomsMax?: number;
  limit?: number;
}

export async function searchMoteurImmo(params: MoteurImmoSearchParams): Promise<ActiveListing[]> {
  if (!API_KEY) {
    console.warn("[MoteurImmo] Clé API manquante, retour liste vide");
    return [];
  }

  const query = new URLSearchParams({
    type_bien: params.type,
    code_postal: params.postalCode,
    surface_min: String(params.surfaceMin),
    surface_max: String(params.surfaceMax),
    nb_resultats: String(params.limit ?? 20),
  });

  if (params.roomsMin) query.set("nb_pieces_min", String(params.roomsMin));
  if (params.roomsMax) query.set("nb_pieces_max", String(params.roomsMax));

  try {
    const res = await fetch(`${API_URL}/annonces?${query}`, {
      headers: { "X-Api-Key": API_KEY, "Content-Type": "application/json" },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      console.error("[MoteurImmo] Erreur API:", res.status, await res.text());
      return [];
    }

    const data = await res.json();
    const raw = data.annonces ?? data.results ?? data ?? [];
    return raw.map(normalizeListing).filter(Boolean) as ActiveListing[];
  } catch (err) {
    console.error("[MoteurImmo] Fetch error:", err);
    return [];
  }
}
