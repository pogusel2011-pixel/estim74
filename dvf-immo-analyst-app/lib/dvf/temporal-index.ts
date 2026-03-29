/**
 * Indices notariaux Haute-Savoie (74) — appartements et maisons confondus.
 * Base 100 = 2014. Source : Notaires de France / observatoire des prix immobiliers.
 *
 * Ces indices permettent de ramener les prix/m² historiques à leur équivalent 2025,
 * corrigeant l'inflation immobilière locale dans les calculs de médiane/moyenne.
 *
 * Règle métier versionnée : RULE_TEMPORAL_INDEX_74_V1
 */
export const NOTAIRES_INDEX_74: Record<number, number> = {
  2014: 100,
  2015: 99,
  2016: 101,
  2017: 104,
  2018: 108,
  2019: 112,
  2020: 114,
  2021: 122,
  2022: 130,
  2023: 127,
  2024: 126,
  2025: 126,
};

/** Année de référence cible (2025 = indice courant) */
export const INDEX_REFERENCE_YEAR = 2025;

/**
 * Retourne l'indice notarial pour une année donnée.
 * Utilise l'indice de l'année la plus proche si l'année est hors plage.
 */
export function getTemporalIndex(year: number): number {
  if (NOTAIRES_INDEX_74[year] !== undefined) return NOTAIRES_INDEX_74[year];

  const years = Object.keys(NOTAIRES_INDEX_74).map(Number);
  const min = Math.min(...years);
  const max = Math.max(...years);

  if (year < min) return NOTAIRES_INDEX_74[min];
  if (year > max) return NOTAIRES_INDEX_74[max];

  // Interpolation linéaire pour les années intermédiaires manquantes
  const lower = Math.max(...years.filter((y) => y <= year));
  const upper = Math.min(...years.filter((y) => y >= year));
  if (lower === upper) return NOTAIRES_INDEX_74[lower];

  const t = (year - lower) / (upper - lower);
  return NOTAIRES_INDEX_74[lower] + t * (NOTAIRES_INDEX_74[upper] - NOTAIRES_INDEX_74[lower]);
}

/**
 * Applique l'indexation temporelle sur un prix/m² brut.
 * Ramène le prix à son équivalent en valeur INDEX_REFERENCE_YEAR.
 *
 * @param pricePsm   Prix/m² historique brut
 * @param saleYear   Année de la transaction
 * @returns          Prix/m² indexé en valeur 2025
 */
export function applyTemporalIndex(pricePsm: number, saleYear: number): number {
  const saleIndex = getTemporalIndex(saleYear);
  const refIndex = getTemporalIndex(INDEX_REFERENCE_YEAR);
  return Math.round(pricePsm * (refIndex / saleIndex));
}
