import { DVFMutation } from "@/types/dvf";
import { loadCsvMutations, loadCsvMutationsByCommune } from "./csv-loader";
import { fetchPappersSales } from "@/lib/pappers/client";
import { BUSINESS_RULES } from "@/lib/rules/business-rules";
import { getInseeCodesForCity } from "@/lib/geo/iris_utils";

const MIN_SAMPLES = BUSINESS_RULES.MIN_SAMPLE_SIZE.value;
const EXPANSION_STEP_KM = BUSINESS_RULES.GEO_RADIUS_EXPANSION_STEP.value;
const MAX_RADIUS_KM = BUSINESS_RULES.GEO_RADIUS_MAX.value;

/**
 * Point d'entrée principal — recherche DVF à 3 niveaux (purement radiale) :
 *
 * A) Rayon initial  : rayon serré autour du bien (≤ initialRadiusKm)
 * B) Commune entière : toutes les mutations de la commune (par code INSEE)
 * C) Expansion radiale : rayon croissant jusqu'à MAX_RADIUS_KM
 *
 * La zone IRIS est utilisée uniquement pour l'affichage du badge,
 * elle n'influence PAS la sélection des transactions DVF.
 */
export async function getDVFMutations(
  lat: number,
  lng: number,
  initialRadiusKm: number,
  monthsBack = 24,
  propertyTypes?: string[],
  city?: string,
  postalCode?: string,
): Promise<{ mutations: DVFMutation[]; source: "csv" | "api" | "mixed"; radiusKm: number; dvfSearchPath: string }> {

  // Pré-chargement des codes INSEE de la commune (pour Step B)
  let depcoms: string[] = [];
  if (city) {
    try {
      depcoms = await getInseeCodesForCity(city, postalCode);
    } catch {
      // non-bloquant
    }
  }

  // ── A) Rayon initial ─────────────────────────────────────────────────────
  {
    const csvRaw = await loadCsvMutations(
      lat, lng, initialRadiusKm, monthsBack, propertyTypes, city, postalCode,
    );
    const mutations: DVFMutation[] = csvRaw.map((m) => ({ ...m, _source: "csv" as const }));

    if (mutations.length >= MIN_SAMPLES) {
      const dvfSearchPath = `Rayon ${initialRadiusKm} km`;
      return { mutations, source: "csv", radiusKm: initialRadiusKm, dvfSearchPath };
    }

    console.log(
      `[DVF] Étape A (rayon ${initialRadiusKm} km) : ${mutations.length} tx — passage étape B`,
    );
  }

  // ── B) Commune entière (par code INSEE) ──────────────────────────────────
  if (depcoms.length > 0) {
    const csvRaw = await loadCsvMutationsByCommune(
      depcoms, monthsBack, propertyTypes, lat, lng,
    );
    const mutations: DVFMutation[] = csvRaw.map((m) => ({ ...m, _source: "csv" as const }));

    if (mutations.length >= MIN_SAMPLES) {
      const communeLabel = city ?? depcoms[0];
      const dvfSearchPath = `Commune ${communeLabel}`;
      console.log(`[DVF] Étape B (commune entière) : ${mutations.length} tx`);
      return { mutations, source: "csv", radiusKm: 0, dvfSearchPath };
    }

    console.log(
      `[DVF] Étape B (commune ${depcoms.join(", ")}) : ${csvRaw.length} tx — passage étape C`,
    );
  }

  // ── C) Expansion radiale (peut franchir les limites communales) ──────────
  let radiusKm = initialRadiusKm;

  while (true) {
    const result = await _fetchAtRadius(
      lat, lng, radiusKm, monthsBack, propertyTypes, city, postalCode,
    );

    if (result.mutations.length >= MIN_SAMPLES) {
      const communeLabel = city ?? "";
      const communePrefix = depcoms.length > 0 && communeLabel
        ? `Commune ${communeLabel} → `
        : "";
      const dvfSearchPath = radiusKm !== initialRadiusKm
        ? `${communePrefix}${radiusKm} km (élargi depuis ${initialRadiusKm} km)`
        : `${communePrefix}${radiusKm} km`;

      if (radiusKm !== initialRadiusKm) {
        console.log(
          `[DVF] Rayon élargi de ${initialRadiusKm} km à ${radiusKm} km ` +
          `(${result.mutations.length} transactions)`,
        );
      }
      return { ...result, radiusKm, dvfSearchPath };
    }

    const nextRadius = Math.round((radiusKm + EXPANSION_STEP_KM) * 10) / 10;
    if (nextRadius > MAX_RADIUS_KM) {
      const dvfSearchPath = `Rayon max ${radiusKm} km`;
      console.warn(
        `[DVF] Rayon max (${MAX_RADIUS_KM} km) atteint avec ${result.mutations.length} transactions`,
      );
      return { ...result, radiusKm, dvfSearchPath };
    }

    radiusKm = nextRadius;
  }
}

/**
 * Stratégie CSV-first à un rayon donné :
 * 1. Interroge le CSV local (données 2020-2025, source fiable)
 * 2. Si CSV ≥ MIN_SAMPLES → retourne CSV uniquement
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
  const csvRaw = await loadCsvMutations(
    lat, lng, radiusKm, monthsBack, propertyTypes, city, postalCode,
  );
  const csvMutations: DVFMutation[] = csvRaw.map((m) => ({ ...m, _source: "csv" as const }));

  if (csvMutations.length >= MIN_SAMPLES) {
    return { mutations: csvMutations, source: "csv" };
  }

  console.log(
    `[DVF] CSV insuffisant (${csvMutations.length} tx, rayon ${radiusKm} km) ` +
    `— interrogation Pappers Immobilier`,
  );

  const radiusM = Math.round(radiusKm * 1000);
  const typeLocal = propertyTypes?.[0];
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
