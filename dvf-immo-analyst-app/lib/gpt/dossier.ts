import { PropertyInput } from "@/types/property";
import { DVFStats } from "@/types/dvf";
import { ValuationResult } from "@/types/valuation";
import { MarketReading } from "@/types/analysis";
import { GPTDossier } from "@/types/gpt";
import { PROPERTY_TYPE_LABELS, CONDITION_LABELS } from "@/lib/constants";
import { formatPrice, formatPsm } from "@/lib/utils";

const ORIENTATION_LABELS: Record<string, string> = {
  N: "Nord", NE: "Nord-Est", E: "Est", SE: "Sud-Est",
  S: "Sud", SO: "Sud-Ouest", O: "Ouest", NO: "Nord-Ouest",
};

const VIEW_LABELS: Record<string, string> = {
  degagee: "Vue dégagée",
  lac: "Vue lac / mer",
  montagne: "Vue montagne",
  jardin: "Vue jardin",
  rue: "Vue sur rue",
  cour: "Vue sur cour",
};

export function buildGPTDossier(
  property: PropertyInput,
  valuation: ValuationResult,
  dvfStats: DVFStats | null,
  marketReading: MarketReading | null
): GPTDossier {
  return {
    property: {
      adresse: property.address + ", " + property.postalCode + " " + property.city,
      type: PROPERTY_TYPE_LABELS[property.propertyType],
      surface: property.surface + " m²",
      pieces: property.rooms,
      chambres: property.bedrooms,
      etage: property.floor != null ? property.floor + "/" + (property.totalFloors ?? "?") : undefined,
      anneeConstruction: property.yearBuilt,
      etat: CONDITION_LABELS[property.condition],
      dpe: property.dpeLetter,
      terrainM2: property.landSurface,
      options: [
        property.hasParking && "Parking",
        property.hasGarage && "Garage",
        property.hasPool && "Piscine",
        property.hasTerrace && "Terrasse",
        property.hasBalcony && "Balcon",
        property.hasCellar && "Cave",
        property.hasElevator && "Ascenseur",
      ].filter(Boolean),
      orientation: property.orientation ? (ORIENTATION_LABELS[property.orientation] ?? property.orientation) : undefined,
      vue: property.view ? (VIEW_LABELS[property.view] ?? property.view) : undefined,
    },
    valuation: {
      fourchetteBasse: formatPrice(valuation.low),
      fourchetteMoyenne: formatPrice(valuation.mid),
      fourchetteHaute: formatPrice(valuation.high),
      prixM2: formatPsm(valuation.pricePsm),
      fiabilite: valuation.confidenceLabel + " (" + Math.round(valuation.confidence * 100) + "%)",
      methode: valuation.method,
      ajustements: valuation.adjustments.map((a) => ({
        critere: a.label,
        impact: (a.factor > 0 ? "+" : "") + (a.factor * 100).toFixed(1) + "%",
      })),
    },
    dvfContext: dvfStats ? {
      nombreTransactions: dvfStats.count,
      prixMedianM2: formatPsm(dvfStats.medianPsm),
      fourchetteMarcheM2: formatPsm(dvfStats.p25Psm) + " – " + formatPsm(dvfStats.p75Psm),
      periode: dvfStats.periodMonths + " mois",
      source: dvfStats.source,
    } : { message: "Données DVF insuffisantes dans ce secteur" },
    marketContext: marketReading ? {
      tendance: marketReading.trend,
      variationAnnuelle: marketReading.trendPercent != null ? marketReading.trendPercent.toFixed(1) + "%" : "N/D",
      offreDemande: marketReading.supplyDemand,
      commentaire: marketReading.commentary,
    } : { message: "Données marché non disponibles" },
  };
}
