import { DVFMutation } from "@/types/dvf";
import { loadCsvMutations } from "./csv-loader";
import { fetchPappersSales } from "@/lib/pappers/client";
import { BUSINESS_RULES } from "@/lib/rules/business-rules";

const MIN_SAMPLES = BUSINESS_RULES.MIN_SAMPLE_SIZE.value;
const EXPANSION_STEP_KM = BUSINESS_RULES.GEO_RADIUS_EXPANSION_STEP.value;
const MAX_RADIUS_KM = BUSINESS_RULES.GEO_RADIUS_MAX.value;

/**
 * Point d'entrée principal :
 * 1. Charge les mutations depuis le CSV local (source prioritaire, 2014-2024)
 * 2. Si CSV < MIN_SAMPLES → appelle Pappers Immobilier comme fallback
 * 3. Fusion + déduplique les sources
 * 4. Auto-expand le rayon par pas de 0.5 km (jusqu'à 5 km) si encore < MIN_SAMPLES
 *
 * @param city       Nom de la commune — active le filtre INSEE secondaire
 * @param postalCode Code postal — précise la recherche INSEE
 */
export async function getDVFMutations(
  lat: number,
  lng: number,
  initialRadiusKm: number,
  monthsBack = 24,
  propertyTypes?: string[],
  city?: string,
  postalCode?: string,
): Promise<{ mutations: DVFMutation[]; source: "csv" | "api" | "mixed"; radiusKm: number }> {
  let radiusKm = initialRadiusKm;

  while (true) {
    const result = await _fetchAtRadius(
      lat, lng, radiusKm, monthsBack, propertyTypes, city, postalCode
    );

    if (result.mutations.length >= MIN_SAMPLES) {
      if (radiusKm !== initialRadiusKm) {
        console.log(
          `[DVF] Rayon élargi de ${initialRadiusKm} km à ${radiusKm} km ` +
          `(${result.mutations.length} transactions)`
        );
      }
      return { ...result, radiusKm };
    }

    const nextRadius = Math.round((radiusKm + EXPANSION_STEP_KM) * 10) / 10;
    if (nextRadius > MAX_RADIUS_KM) {
      console.warn(
        `[DVF] Rayon max (${MAX_RADIUS_KM} km) atteint avec ${result.mutations.length} transactions`
      );
      return { ...result, radiusKm };
    }

    radiusKm = nextRadius;
  }
}

/**
 * Stratégie CSV-first à un rayon donné :
 * 1. Interroge le CSV local (données 2014-2024, source fiable)
 * 2. Si CSV ≥ MIN_SAMPLES → retourne CSV uniquement (rapide, pas d'appel API)
 * 3. Si CSV insuffisant → appelle Pappers Immobilier comme complément
 * 4. Fusionne et déduplique les deux sources
 */
async function _fetchAtRadius(
  lat: number,
  lng: number,
  radiusKm: number,
  monthsBack: number,
  propertyTypes?: string[],
  city?: string,
  postalCode?: string,
): Promise<{ mutations: DVFMutation[]; source: "csv" | "api" | "mixed" }> {
  // Étape 1 : CSV local (priorité absolue)
  const csvRaw = await loadCsvMutations(
    lat, lng, radiusKm, monthsBack, propertyTypes, city, postalCode
  );
  const csvMutations: DVFMutation[] = csvRaw.map((m) => ({ ...m, _source: "csv" as const }));

  // Étape 2 : CSV suffisant → on n'appelle pas l'API
  if (csvMutations.length >= MIN_SAMPLES) {
    return { mutations: csvMutations, source: "csv" };
  }

  // Étape 3 : CSV insuffisant → Pappers comme fallback
  console.log(
    `[DVF] CSV insuffisant (${csvMutations.length} tx, rayon ${radiusKm} km) ` +
    `— interrogation Pappers Immobilier`
  );

  const radiusM = Math.round(radiusKm * 1000);
  const typeLocal = propertyTypes?.[0]; // ex: "Appartement"
  const pappersRaw = await fetchPappersSales(lat, lng, radiusM, typeLocal, monthsBack);

  if (csvMutations.length === 0 && pappersRaw.length === 0) {
    return { mutations: [], source: "api" };
  }

  if (csvMutations.length > 0 && pappersRaw.length > 0) {
    const merged = deduplicateMutations([...csvMutations, ...pappersRaw]);
    return { mutations: merged, source: "mixed" };
  }

  if (pappersRaw.length > 0) {
    return { mutations: pappersRaw, source: "api" };
  }

  return { mutations: csvMutations, source: "csv" };
}

function deduplicateMutations(mutations: DVFMutation[]): DVFMutation[] {
  const seen = new Set<string>();
  return mutations.filter((m) => {
    const key = m.id_mutation
      ? m.id_mutation
      : `${m.date_mutation}|${m.valeur_fonciere}|${(m.adresse_nom_voie ?? "").toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
