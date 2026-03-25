import { DVFStats } from "@/types/dvf";
import { BUSINESS_RULES } from "@/lib/rules/business-rules";

export type RefusalLevel = "blocking" | "warning";

export interface RefusalCondition {
  code: string;
  level: RefusalLevel;
  userMessage: string;
  technicalLog: string;
  corrective: string;
}

export interface RefusalCheckInput {
  dvfStats: DVFStats | null;
  lat?: number | null;
  lng?: number | null;
  surface?: number | null;
}

/**
 * Vérifie les conditions de refus / avertissement selon la matrice métier.
 *
 * Retourne :
 *   - le premier refus bloquant s'il y en a un
 *   - la liste de tous les avertissements non bloquants
 */
export function checkRefusalConditions(input: RefusalCheckInput): {
  blocking: RefusalCondition | null;
  warnings: RefusalCondition[];
} {
  const blocking = getBlockingRefusal(input);
  if (blocking) return { blocking, warnings: [] };

  const warnings = getWarnings(input);
  return { blocking: null, warnings };
}

function getBlockingRefusal(input: RefusalCheckInput): RefusalCondition | null {
  const { dvfStats, lat, lng, surface } = input;

  // REFUSAL_SURFACE_MISSING : surface ≤ 0 ou null
  if (!surface || surface <= 0) {
    return {
      code: "REFUSAL_SURFACE_MISSING",
      level: "blocking",
      userMessage: "La surface habitable est requise pour réaliser une estimation.",
      technicalLog: `surface=${surface}`,
      corrective: "Renseignez la surface habitable du bien (en m²).",
    };
  }

  // REFUSAL_GEOCODING_FAILED : lat/lng null ou (0,0)
  if (!lat || !lng || (lat === 0 && lng === 0)) {
    return {
      code: "REFUSAL_GEOCODING_FAILED",
      level: "blocking",
      userMessage:
        "L'adresse n'a pas pu être localisée. Vérifiez la commune et le code postal saisis.",
      technicalLog: `lat=${lat}, lng=${lng}`,
      corrective:
        "Saisissez une commune valide du département 74 avec son code postal.",
    };
  }

  // REFUSAL_NO_COMPARABLES : 0-1 vente retenue
  const count = dvfStats?.count ?? 0;
  if (count <= BUSINESS_RULES.REFUSAL_MIN_COMPARABLES.value) {
    return {
      code: "REFUSAL_NO_COMPARABLES",
      level: "blocking",
      userMessage:
        "Les données DVF sont insuffisantes dans ce secteur pour produire une estimation fiable. Élargissez le périmètre ou choisissez une commune plus dense.",
      technicalLog: `dvfCount=${count}`,
      corrective:
        "Essayez d'augmenter le rayon de recherche ou de sélectionner une commune voisine.",
    };
  }

  return null;
}

function getWarnings(input: RefusalCheckInput): RefusalCondition[] {
  const { dvfStats } = input;
  if (!dvfStats) return [];

  const warnings: RefusalCondition[] = [];
  const count = dvfStats.count;

  // WARNING_LOW_COMPARABLES : 2-3 ventes
  if (count >= 2 && count <= BUSINESS_RULES.WARNING_LOW_COMPARABLES_THRESHOLD.value) {
    warnings.push({
      code: "WARNING_LOW_COMPARABLES",
      level: "warning",
      userMessage:
        `Peu de ventes comparables (${count}) dans ce périmètre — estimation prudente. Recoupez avec d'autres sources.`,
      technicalLog: `dvfCount=${count}`,
      corrective: "Élargissez le périmètre ou allongez la période d'analyse.",
    });
  }

  // WARNING_HIGH_DISPERSION : CV des prix/m² > 40%
  if (dvfStats.stdPsm && dvfStats.medianPsm > 0) {
    const cv = dvfStats.stdPsm / dvfStats.medianPsm;
    if (cv > BUSINESS_RULES.WARNING_HIGH_DISPERSION_CV.value) {
      warnings.push({
        code: "WARNING_HIGH_DISPERSION",
        level: "warning",
        userMessage:
          `Forte dispersion des prix (CV = ${Math.round(cv * 100)}%) — le marché local est hétérogène. L'estimation doit être interprétée avec prudence.`,
        technicalLog: `cv=${cv.toFixed(3)}, std=${dvfStats.stdPsm}, median=${dvfStats.medianPsm}`,
        corrective:
          "Vérifiez si plusieurs micro-marchés coexistent dans le périmètre.",
      });
    } else {
      // Fallback IQR si pas de stdPsm : IQR/median > ~54% ≈ CV > 40%
      const iqr = dvfStats.p75Psm - dvfStats.p25Psm;
      const iqrCv = iqr / dvfStats.medianPsm;
      if (iqrCv > 0.54) {
        warnings.push({
          code: "WARNING_HIGH_DISPERSION",
          level: "warning",
          userMessage:
            `Forte dispersion des prix (IQR/médiane = ${Math.round(iqrCv * 100)}%) — le marché local est hétérogène.`,
          technicalLog: `iqrCv=${iqrCv.toFixed(3)}`,
          corrective:
            "Vérifiez si plusieurs micro-marchés coexistent dans le périmètre.",
        });
      }
    }
  }

  // WARNING_OLD_COMPARABLES : date médiane > 36 mois
  if (dvfStats.newestDate) {
    const newestMs = new Date(dvfStats.newestDate).getTime();
    const ageMonths = (Date.now() - newestMs) / (1000 * 60 * 60 * 24 * 30.5);
    if (ageMonths > BUSINESS_RULES.WARNING_OLD_COMPARABLES_MONTHS.value) {
      warnings.push({
        code: "WARNING_OLD_COMPARABLES",
        level: "warning",
        userMessage:
          `Les données DVF disponibles datent de plus de ${Math.round(ageMonths)} mois — le marché a peut-être évolué depuis.`,
        technicalLog: `newestDate=${dvfStats.newestDate}, ageMonths=${ageMonths.toFixed(1)}`,
        corrective: "Consultez les annonces actives pour compléter l'analyse.",
      });
    }
  }

  return warnings;
}
