import { DVFMutation } from "@/types/dvf";
import { getBoundingBox } from "@/lib/geo/perimeter";
import { loadCsvMutations } from "./csv-loader";

/**
 * Récupère les mutations DVF depuis l'API data.gouv.fr (cquest)
 */
export async function fetchDVFFromAPI(
  lat: number,
  lng: number,
  radiusKm: number,
  monthsBack = 24
): Promise<DVFMutation[]> {
  const box = getBoundingBox(lat, lng, radiusKm);
  const dateMin = new Date();
  dateMin.setMonth(dateMin.getMonth() - monthsBack);
  const dateStr = dateMin.toISOString().split("T")[0];

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    dist: String(radiusKm * 1000),
    date_min: dateStr,
  });

  const url = `${process.env.DVF_API_URL ?? "https://api.cquest.org/dvf"}?${params}`;

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) {
      console.warn("[DVF API] Erreur:", res.status);
      return [];
    }
    const data = await res.json();
    return (data.resultats ?? data.features ?? []) as DVFMutation[];
  } catch (err) {
    console.error("[DVF API] Fetch error:", err);
    return [];
  }
}

/**
 * Point d'entrée principal : CSV local en priorité, fallback API
 */
export async function getDVFMutations(
  lat: number,
  lng: number,
  radiusKm: number,
  monthsBack = 24,
  propertyTypes?: string[]
): Promise<{ mutations: DVFMutation[]; source: "csv" | "api" | "mixed" }> {
  // Tente d'abord le CSV local
  const csvMutations = await loadCsvMutations(lat, lng, radiusKm, monthsBack, propertyTypes);
  if (csvMutations.length >= 5) {
    return { mutations: csvMutations, source: "csv" };
  }

  // Fallback API
  const apiMutations = await fetchDVFFromAPI(lat, lng, radiusKm, monthsBack);

  if (csvMutations.length === 0 && apiMutations.length === 0) {
    return { mutations: [], source: "api" };
  }

  // Merge si les deux sources ont des données
  if (csvMutations.length > 0 && apiMutations.length > 0) {
    const merged = deduplicateMutations([...csvMutations, ...apiMutations]);
    return { mutations: merged, source: "mixed" };
  }

  return {
    mutations: apiMutations.length > 0 ? apiMutations : csvMutations,
    source: apiMutations.length > 0 ? "api" : "csv",
  };
}

function deduplicateMutations(mutations: DVFMutation[]): DVFMutation[] {
  const seen = new Set<string>();
  return mutations.filter((m) => {
    const key = m.id_mutation ?? `${m.date_mutation}-${m.valeur_fonciere}-${m.adresse_nom_voie}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
