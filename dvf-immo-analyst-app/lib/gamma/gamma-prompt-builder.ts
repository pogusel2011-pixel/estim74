import { Adjustment } from "@/types/valuation";
import { DVFStats } from "@/types/dvf";
import { GPTOutput } from "@/types/gpt";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR") + " €";
}

function fmtPsm(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR") + " €/m²";
}

function pct(factor: number): string {
  const p = Math.round((factor - 1) * 100);
  return (p >= 0 ? "+" : "") + p + "%";
}

interface GammaPromptInput {
  serialized: Record<string, unknown>;
  adjustments: Adjustment[];
  gptOutputs: GPTOutput[];
  dvfStats: DVFStats | null;
  perimeterKm: number | null;
}

const PROPERTY_LABELS: Record<string, string> = {
  APARTMENT: "Appartement",
  HOUSE: "Maison",
  LAND: "Terrain",
};

const CONDITION_LABELS: Record<string, string> = {
  EXCELLENT: "Excellent état",
  GOOD: "Bon état",
  AVERAGE: "État moyen",
  TO_RENOVATE: "À rénover",
};

export function buildGammaExpertPrompt(input: GammaPromptInput): string {
  const { serialized, adjustments, gptOutputs, dvfStats, perimeterKm } = input;

  const type = PROPERTY_LABELS[serialized.propertyType as string] ?? (serialized.propertyType as string);
  const surface = serialized.surface as number;
  const city = serialized.city as string;
  const postalCode = serialized.postalCode as string | null;
  const address = serialized.address as string | null;
  const rooms = serialized.rooms as number | null;
  const bedrooms = serialized.bedrooms as number | null;
  const yearBuilt = serialized.yearBuilt as number | null;
  const dpeLetter = serialized.dpeLetter as string | null;
  const condition = serialized.condition as string | null;
  const landSurface = serialized.landSurface as number | null;
  const floor = serialized.floor as number | null;
  const totalFloors = serialized.totalFloors as number | null;
  const orientation = serialized.orientation as string | null;
  const view = serialized.view as string | null;
  const mitoyennete = serialized.mitoyennete as string | null;

  const valuationLow = serialized.valuationLow as number | null;
  const valuationMid = serialized.valuationMid as number | null;
  const valuationHigh = serialized.valuationHigh as number | null;
  const valuationPsm = serialized.valuationPsm as number | null;
  const confidence = serialized.confidence as number | null;
  const confidenceLabel = serialized.confidenceLabel as string | null;

  const listingPriceLow = valuationMid ? Math.round(valuationMid * 1.02) : null;
  const listingPriceHigh = valuationMid ? Math.round(valuationMid * 1.03) : null;

  const features: string[] = [];
  if (serialized.hasParking) features.push("Parking");
  if (serialized.hasGarage) features.push("Garage");
  if (serialized.hasBalcony) features.push("Balcon");
  if (serialized.hasTerrace) features.push("Terrasse");
  if (serialized.hasCellar) features.push("Cave");
  if (serialized.hasPool) features.push("Piscine");
  if (serialized.hasElevator) features.push("Ascenseur");

  const positiveAdj = adjustments.filter(a => a.factor > 1);
  const negativeAdj = adjustments.filter(a => a.factor < 1);
  const proximityAdj = adjustments.filter(a => a.category === "proximity" || a.category === "river" || a.category === "stream" || a.category === "lake");

  const dvfSampleSize = serialized.dvfSampleSize as number | null;

  const lines: string[] = [];

  lines.push(`Crée une présentation professionnelle d'expertise immobilière pour un agent immobilier ou un notaire. Style : sobre, technique, chiffré, crédible. Police professionnelle, palette bleue marine.`);
  lines.push(``);
  lines.push(`## BIEN ESTIMÉ`);
  lines.push(`**${type}** — ${surface} m² — ${address ? address + ", " : ""}${city}${postalCode ? " (" + postalCode + ")" : ""}`);
  if (rooms) lines.push(`${rooms} pièce${rooms > 1 ? "s" : ""}${bedrooms ? " dont " + bedrooms + " chambre" + (bedrooms > 1 ? "s" : "") : ""}`);
  if (floor != null && totalFloors != null) lines.push(`Étage ${floor}/${totalFloors}`);
  if (yearBuilt) lines.push(`Construit en ${yearBuilt}`);
  if (condition) lines.push(`État : ${CONDITION_LABELS[condition] ?? condition}`);
  if (dpeLetter) lines.push(`DPE : ${dpeLetter}`);
  if (landSurface) lines.push(`Terrain : ${landSurface.toLocaleString("fr-FR")} m²`);
  if (mitoyennete && mitoyennete !== "NONE") {
    const mitoLabel = mitoyennete === "ONE_SIDE" ? "Mitoyen 1 côté" : "Mitoyen 2 côtés";
    lines.push(`Mitoyenneté : ${mitoLabel}`);
  }
  if (orientation) lines.push(`Orientation : ${orientation}`);
  if (view) lines.push(`Vue : ${view}`);
  if (features.length) lines.push(`Équipements : ${features.join(", ")}`);
  lines.push(``);

  lines.push(`## ESTIMATION ESTIM'74`);
  lines.push(`- Fourchette basse : **${fmt(valuationLow)}**`);
  lines.push(`- Estimation centrale : **${fmt(valuationMid)}** (${fmtPsm(valuationPsm)})`);
  lines.push(`- Fourchette haute : **${fmt(valuationHigh)}**`);
  if (confidence != null) lines.push(`- Indice de confiance : **${confidence}/100** (${confidenceLabel ?? ""})`);
  if (listingPriceLow && listingPriceHigh) lines.push(`- Prix d'annonce conseillé : ${fmt(listingPriceLow)} à ${fmt(listingPriceHigh)}`);
  lines.push(``);

  if (adjustments.length > 0) {
    lines.push(`## AJUSTEMENTS APPLIQUÉS`);
    if (positiveAdj.length > 0) {
      lines.push(`**Points forts :**`);
      positiveAdj.forEach(a => lines.push(`- ${a.label} : ${pct(a.factor)}`));
    }
    if (negativeAdj.length > 0) {
      lines.push(`**Points de décote :**`);
      negativeAdj.forEach(a => lines.push(`- ${a.label} : ${pct(a.factor)}`));
    }
    if (proximityAdj.length > 0) {
      lines.push(`**Équipements à proximité :**`);
      proximityAdj.forEach(a => lines.push(`- ${a.label} : ${pct(a.factor)}`));
    }
    lines.push(``);
  }

  if (dvfStats) {
    lines.push(`## BASE DVF (Demandes de Valeurs Foncières)`);
    if (dvfSampleSize != null) lines.push(`- ${dvfSampleSize} ventes comparables${perimeterKm ? " dans un rayon de " + perimeterKm + " km" : ""}`);
    if (dvfStats.medianPsm != null) lines.push(`- Prix médian : ${fmtPsm(dvfStats.medianPsm)}`);
    if (dvfStats.meanPsm != null) lines.push(`- Prix moyen : ${fmtPsm(dvfStats.meanPsm)}`);
    if ((dvfStats as Record<string, unknown>).stdPsm != null) lines.push(`- Écart-type : ${fmtPsm((dvfStats as Record<string, unknown>).stdPsm as number)}`);
    if (dvfStats.minPsm != null && dvfStats.maxPsm != null) lines.push(`- Fourchette marché : ${fmtPsm(dvfStats.minPsm)} — ${fmtPsm(dvfStats.maxPsm)}`);
    lines.push(``);
  }

  if (gptOutputs.length > 0) {
    lines.push(`## ANALYSE IA (GPT-4o)`);
    gptOutputs.forEach(g => {
      lines.push(`### ${g.title}`);
      lines.push(g.content);
      lines.push(``);
    });
  }

  lines.push(`---`);
  lines.push(`*Données ESTIM'74 — Haute-Savoie (74) — DVF 2014–2024*`);

  return lines.join("\n");
}

export function buildGammaClientPrompt(input: GammaPromptInput): string {
  const { serialized, adjustments, gptOutputs } = input;

  const type = PROPERTY_LABELS[serialized.propertyType as string] ?? (serialized.propertyType as string);
  const surface = serialized.surface as number;
  const city = serialized.city as string;
  const address = serialized.address as string | null;
  const rooms = serialized.rooms as number | null;
  const bedrooms = serialized.bedrooms as number | null;
  const yearBuilt = serialized.yearBuilt as number | null;
  const dpeLetter = serialized.dpeLetter as string | null;
  const landSurface = serialized.landSurface as number | null;
  const orientation = serialized.orientation as string | null;
  const view = serialized.view as string | null;

  const valuationLow = serialized.valuationLow as number | null;
  const valuationMid = serialized.valuationMid as number | null;
  const valuationHigh = serialized.valuationHigh as number | null;
  const listingPriceLow = valuationMid ? Math.round(valuationMid * 1.02) : null;
  const listingPriceHigh = valuationMid ? Math.round(valuationMid * 1.03) : null;

  const features: string[] = [];
  if (serialized.hasParking) features.push("Parking");
  if (serialized.hasGarage) features.push("Garage");
  if (serialized.hasBalcony) features.push("Balcon");
  if (serialized.hasTerrace) features.push("Terrasse");
  if (serialized.hasCellar) features.push("Cave");
  if (serialized.hasPool) features.push("Piscine");
  if (serialized.hasElevator) features.push("Ascenseur");
  if (landSurface) features.push(`Terrain ${landSurface.toLocaleString("fr-FR")} m²`);

  const positiveAdj = adjustments.filter(a =>
    a.factor > 1 && a.category !== "proximity" && a.category !== "river" && a.category !== "stream" && a.category !== "lake"
  );
  const proximityAdj = adjustments.filter(a =>
    a.factor > 1 && (a.category === "proximity" || a.category === "river" || a.category === "stream" || a.category === "lake")
  );

  const clientGptTypes = ["MARKET_ANALYSIS", "NEGOTIATION_ADVICE", "PROPERTY_DESCRIPTION"];
  const clientGptOutputs = gptOutputs.filter(g => clientGptTypes.includes(g.actionType));

  const lines: string[] = [];

  lines.push(`Crée une présentation élégante et rassurante pour présenter une estimation immobilière à un propriétaire. Style : chaleureux, clair, moderne, sans jargon technique. Palette verte ou bleue apaisante.`);
  lines.push(``);
  lines.push(`## VOTRE BIEN`);
  lines.push(`**${type}** de **${surface} m²** — ${address ? address + ", " : ""}${city}`);

  const descParts: string[] = [];
  if (rooms) descParts.push(`${rooms} pièce${rooms > 1 ? "s" : ""}${bedrooms ? " dont " + bedrooms + " chambre" + (bedrooms > 1 ? "s" : "") : ""}`);
  if (yearBuilt) descParts.push(`construit en ${yearBuilt}`);
  if (dpeLetter) descParts.push(`DPE ${dpeLetter}`);
  if (orientation) descParts.push(`orientation ${orientation}`);
  if (view) descParts.push(`vue ${view}`);
  if (descParts.length) lines.push(descParts.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(" • "));
  if (features.length) lines.push(`✓ ${features.join("  ✓ ")}`);
  lines.push(``);

  lines.push(`## RÉSULTAT DE L'ESTIMATION`);
  lines.push(`Fourchette de valeur : **${fmt(valuationLow)}** à **${fmt(valuationHigh)}**`);
  lines.push(`Valeur la plus probable : **${fmt(valuationMid)}**`);
  if (listingPriceLow && listingPriceHigh) {
    lines.push(``);
    lines.push(`Prix de mise en vente conseillé : **${fmt(listingPriceLow)} à ${fmt(listingPriceHigh)}**`);
  }
  lines.push(``);

  if (positiveAdj.length > 0) {
    lines.push(`## LES ATOUTS DE VOTRE BIEN`);
    positiveAdj.forEach(a => lines.push(`✓ ${a.label}`));
    lines.push(``);
  }

  if (proximityAdj.length > 0) {
    lines.push(`## ENVIRONNEMENT FAVORABLE`);
    proximityAdj.forEach(a => lines.push(`✓ ${a.label}`));
    lines.push(``);
  }

  if (clientGptOutputs.length > 0) {
    clientGptOutputs.forEach(g => {
      lines.push(`## ${g.title.toUpperCase()}`);
      lines.push(g.content);
      lines.push(``);
    });
  }

  lines.push(`## VOTRE MARCHÉ EN BREF`);
  lines.push(`Estimation réalisée à partir de milliers de ventes réelles en Haute-Savoie (74).`);
  lines.push(`Données DVF officielles 2014–2024.`);
  lines.push(``);
  lines.push(`---`);
  lines.push(`*Estimation ESTIM'74 — Confidentiel — Document réservé au propriétaire*`);

  return lines.join("\n");
}
