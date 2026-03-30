import { DVFMutation, DVFComparable } from "@/types/dvf";
import { BUSINESS_RULES } from "@/lib/rules/business-rules";
import { applyTemporalIndex } from "./temporal-index";

/** Nombre de "top comparables" à identifier (référence BUSINESS_RULES) */
const TOP_N = BUSINESS_RULES.TOP_COMPARABLES_COUNT.value;

/**
 * Score composite pour un comparable DVF (0-1) :
 *  - Distance       40 % — plus proche = meilleur
 *  - Surface        30 % — plus proche de la cible = meilleur
 *  - Récence        20 % — plus récent = meilleur (0 à 2 ans)
 *  - Pièces         10 % — correspondance exacte ou à 1 pièce près
 */
export function scoreComparable(
  comp: { surface: number; distanceM?: number; date: string; rooms?: number },
  target: { surface: number; rooms?: number }
): number {
  // 1. Distance (40 %)
  const distScore = comp.distanceM != null
    ? Math.max(0, 1 - comp.distanceM / 2000)
    : 0.4; // inconnu → score neutre

  // 2. Surface (30 %)
  const sRatio = Math.min(comp.surface, target.surface) / Math.max(comp.surface, target.surface);
  const surfScore = Math.pow(sRatio, 1.5); // pénalise davantage les grands écarts

  // 3. Récence (20 %) — full score < 6 mois, zéro à 3 ans
  const ageMs = Date.now() - new Date(comp.date).getTime();
  const ageDays = ageMs / 86_400_000;
  const recencyScore = Math.max(0, 1 - ageDays / (365 * 3));

  // 4. Pièces (10 %)
  let roomScore = 0.5; // inconnu
  if (comp.rooms != null && target.rooms != null) {
    const diff = Math.abs(comp.rooms - target.rooms);
    roomScore = diff === 0 ? 1.0 : diff === 1 ? 0.7 : diff === 2 ? 0.3 : 0.0;
  }

  return (
    distScore    * 0.40 +
    surfScore    * 0.30 +
    recencyScore * 0.20 +
    roomScore    * 0.10
  );
}

export function toComparables(
  mutations: DVFMutation[],
  subjectSurface: number,
  subjectRooms?: number
): DVFComparable[] {
  // Déduplication : même id_mutation OU même (date + prix + surface)
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const deduped = mutations.filter((m) => {
    if (seenIds.has(m.id_mutation)) return false;
    const key = `${m.date_mutation}|${m.valeur_fonciere}|${m.surface_reelle_bati ?? m.surface_terrain ?? 0}`;
    if (seenKeys.has(key)) return false;
    seenIds.add(m.id_mutation);
    seenKeys.add(key);
    return true;
  });

  const raw = deduped
    .filter((m) => m.prix_m2 != null && m.valeur_fonciere > 0)
    .map((m): DVFComparable => {
      const surface = m.surface_reelle_bati ?? m.surface_terrain ?? 0;
      const adresseRaw = [m.adresse_numero, m.adresse_nom_voie].filter(Boolean).join(" ");
      // Normalise "30AVENUE" → "30 AVENUE" (cas CSV où numéro et voie sont collés)
      const adresse = adresseRaw.replace(/^(\d+[A-Za-z]?)([A-Za-zÀ-ÖØ-öø-ÿ])/, "$1 $2");

      const score = scoreComparable(
        { surface, distanceM: m.distance_m, date: m.date_mutation, rooms: m.nombre_pieces_principales },
        { surface: subjectSurface, rooms: subjectRooms }
      );

      // Indexation temporelle : ramène le prix/m² à la valeur équivalente 2025
      const saleYear = new Date(m.date_mutation).getFullYear();
      const indexedPricePsm = applyTemporalIndex(m.prix_m2!, saleYear);

      return {
        id: m.id_mutation,
        date: m.date_mutation,
        address: adresse || "Adresse non disponible",
        city: m.nom_commune,
        type: m.type_local ?? "Inconnu",
        surface,
        price: m.valeur_fonciere,
        pricePsm: m.prix_m2!,
        indexedPricePsm,
        rooms: m.nombre_pieces_principales,
        landSurface: m.surface_terrain,
        distanceM: m.distance_m,
        similarity: Math.round(score * 100) / 100,
        score: Math.round(score * 100) / 100,
        topComparable: false, // set below
        source: m._source ?? "csv",
        outlier: m.outlier ?? false,
        lat: m.lat,
        lng: m.lon, // DVFMutation uses `lon`, DVFComparable uses `lng`
      };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // Mark top N as key comparables — outliers are explicitly excluded
  const result = raw.slice(0, 30);
  const nonOutliers = result.filter((c) => !c.outlier);
  nonOutliers.slice(0, Math.min(TOP_N, nonOutliers.length)).forEach((c) => {
    c.topComparable = true;
  });

  // Keep top comparables first, then the rest in descending score order
  return result;
}
