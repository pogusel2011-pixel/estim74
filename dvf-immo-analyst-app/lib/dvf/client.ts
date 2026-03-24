import { DVFMutation } from "@/types/dvf";
import { getBoundingBox } from "@/lib/geo/perimeter";
import { loadCsvMutations } from "./csv-loader";

const MIN_SAMPLES = 5;
const EXPANSION_STEP_KM = 0.5;
const MAX_RADIUS_KM = 5;

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
 * Point d'entrée principal : CSV local en priorité, fallback API.
 * Auto-expand le rayon par pas de 0.5 km (jusqu'à 5 km) si < 5 transactions.
 * Retourne le rayon final effectivement utilisé.
 */
export async function getDVFMutations(
  lat: number,
  lng: number,
  initialRadiusKm: number,
  monthsBack = 24,
  propertyTypes?: string[]
): Promise<{ mutations: DVFMutation[]; source: "csv" | "api" | "mixed"; radiusKm: number }> {
  let radiusKm = initialRadiusKm;

  while (true) {
    const result = await _fetchAtRadius(lat, lng, radiusKm, monthsBack, propertyTypes);

    if (result.mutations.length >= MIN_SAMPLES) {
      if (radiusKm !== initialRadiusKm) {
        console.log(
          `[DVF] Rayon élargi de ${initialRadiusKm} km à ${radiusKm} km (${result.mutations.length} transactions)`
        );
      }
      return { ...result, radiusKm };
    }

    const nextRadius = Math.round((radiusKm + EXPANSION_STEP_KM) * 10) / 10;
    if (nextRadius > MAX_RADIUS_KM) {
      // Rayon max atteint, on retourne ce qu'on a
      console.warn(
        `[DVF] Rayon max (${MAX_RADIUS_KM} km) atteint avec seulement ${result.mutations.length} transactions`
      );
      return { ...result, radiusKm };
    }

    radiusKm = nextRadius;
  }
}

async function _fetchAtRadius(
  lat: number,
  lng: number,
  radiusKm: number,
  monthsBack: number,
  propertyTypes?: string[]
): Promise<{ mutations: DVFMutation[]; source: "csv" | "api" | "mixed" }> {
  const csvMutations = await loadCsvMutations(lat, lng, radiusKm, monthsBack, propertyTypes);
  if (csvMutations.length >= MIN_SAMPLES) {
    return { mutations: csvMutations, source: "csv" };
  }

  const apiMutations = await fetchDVFFromAPI(lat, lng, radiusKm, monthsBack);

  if (csvMutations.length === 0 && apiMutations.length === 0) {
    return { mutations: [], source: "api" };
  }

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
