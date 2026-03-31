import { Adjustment } from "@/types/valuation";
import { DVFStats } from "@/types/dvf";
import { GPTOutput } from "@/types/gpt";
import { MarketReading } from "@/types/analysis";
import { ActiveListing } from "@/types/listing";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR") + " €";
}

function fmtPsm(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR") + " €/m²";
}

function pct(factor: number): string {
  const p = Math.round(factor * 100);
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p}%`;
}

function pctRaw(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)} %`;
}

interface GammaPromptInput {
  serialized: Record<string, unknown>;
  adjustments: Adjustment[];
  gptOutputs: GPTOutput[];
  dvfStats: DVFStats | null;
  perimeterKm: number | null;
  baseUrl?: string;
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

export function buildGammaExpertPrompt(input: GammaPromptInput, baseUrl?: string): string {
  if (!input.baseUrl && baseUrl) input = { ...input, baseUrl };
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

  const clientFirstName = serialized.clientFirstName as string | null | undefined;
  const clientLastName = serialized.clientLastName as string | null | undefined;
  const clientEmail = serialized.clientEmail as string | null | undefined;
  const clientPhone = serialized.clientPhone as string | null | undefined;
  const clientName = [clientFirstName, clientLastName].filter(Boolean).join(" ");

  const valuationLow = serialized.valuationLow as number | null;
  const valuationMid = serialized.valuationMid as number | null;
  const valuationHigh = serialized.valuationHigh as number | null;
  const valuationPsm = serialized.valuationPsm as number | null;
  const confidenceRaw = serialized.confidence as number | null;
  const confidencePts = confidenceRaw != null ? Math.round(confidenceRaw * 100) : null;
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

  const positiveAdj = adjustments.filter(a => a.factor > 0 && a.category !== "proximity");
  const negativeAdj = adjustments.filter(a => a.factor < 0);
  const proximityAdj = adjustments.filter(a => a.category === "proximity");

  const dvfSampleSize = serialized.dvfSampleSize as number | null;

  const marketReading = serialized.marketReading as MarketReading | null | undefined;
  const dvfControl = marketReading?.dvfControl;
  const pappersStats = marketReading?.pappersStats;

  const rawListings = serialized.listings;
  const listings: ActiveListing[] = Array.isArray(rawListings)
    ? (rawListings as ActiveListing[]).filter(l => !l.outlier).slice(0, 5)
    : [];

  const lines: string[] = [];

  lines.push(`Crée une présentation professionnelle d'expertise immobilière pour un agent immobilier ou un notaire. Style : sobre, technique, chiffré, crédible. Police professionnelle, palette bleue marine.`);
  lines.push(``);
  lines.push(`## PAGE DE COUVERTURE`);
  lines.push(`[EMPLACEMENT PHOTO CONSEILLÈRE — à insérer manuellement]`);
  lines.push(`**CONSEILLÈRE :** Aurélie LIVERSET — IAD France — Haute-Savoie (74)`);
  lines.push(`[EMPLACEMENT LOGO IAD — à insérer manuellement]`);
  lines.push(``);
  if (clientName) {
    lines.push(`**PRÉPARÉ POUR :** ${clientName}`);
    if (clientEmail) lines.push(clientEmail);
    if (clientPhone) lines.push(clientPhone);
  } else {
    lines.push(`**PRÉPARÉ POUR :** [Nom du client — à compléter]`);
  }
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
  if (confidencePts != null) lines.push(`- Indice de confiance : **${confidencePts}/100** (${confidenceLabel ?? ""})`);
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
      proximityAdj.forEach(a => {
        const sign = a.factor >= 0 ? "+" : "";
        lines.push(`- ${a.label} : ${sign}${Math.round(a.factor * 100)}%`);
      });
    }
    lines.push(``);
  }

  if (dvfStats) {
    lines.push(`## BASE DVF (Demandes de Valeurs Foncières)`);
    if (dvfSampleSize != null) lines.push(`- ${dvfSampleSize} ventes comparables${perimeterKm ? " dans un rayon de " + perimeterKm + " km" : ""}`);
    if (dvfStats.medianPsm != null) lines.push(`- Prix médian : ${fmtPsm(dvfStats.medianPsm)}`);
    if (dvfStats.meanPsm != null) lines.push(`- Prix moyen : ${fmtPsm(dvfStats.meanPsm)}`);
    if (dvfStats.stdPsm != null) lines.push(`- Écart-type : ${fmtPsm(dvfStats.stdPsm)}`);
    if (dvfStats.minPsm != null && dvfStats.maxPsm != null) lines.push(`- Fourchette marché : ${fmtPsm(dvfStats.minPsm)} — ${fmtPsm(dvfStats.maxPsm)}`);
    lines.push(``);
  }

  if (dvfControl) {
    lines.push(`## CONTRÔLE DVF — DYNAMIQUE DE MARCHÉ`);
    if (dvfControl.trend6m != null) lines.push(`- Tendance 6 mois : ${pctRaw(dvfControl.trend6m)} (${dvfControl.count6m ?? "—"} ventes)`);
    if (dvfControl.trend12m != null) lines.push(`- Tendance 12 mois : ${pctRaw(dvfControl.trend12m)} (${dvfControl.count12m ?? "—"} ventes)`);
    if (dvfControl.communeMedianPsm != null) lines.push(`- Médiane commune : ${fmtPsm(dvfControl.communeMedianPsm)}`);
    if (dvfControl.deptMedianPsm != null) lines.push(`- Médiane Haute-Savoie (74) : ${fmtPsm(dvfControl.deptMedianPsm)}`);
    if (dvfControl.divergencePct != null) {
      const sign = dvfControl.divergencePct >= 0 ? "+" : "";
      lines.push(`- Écart commune / département : ${sign}${dvfControl.divergencePct.toFixed(1)} %`);
    }
    lines.push(``);
  }

  if (pappersStats) {
    const propertyType = serialized.propertyType as string;
    const prixM2 =
      propertyType === "APARTMENT" ? (pappersStats.prixM2Apparts ?? pappersStats.prixM2)
      : propertyType === "HOUSE" ? (pappersStats.prixM2Maisons ?? pappersStats.prixM2)
      : pappersStats.prixM2;

    lines.push(`## DONNÉES DE MARCHÉ — ${pappersStats.commune.toUpperCase()}`);
    if (prixM2 != null) lines.push(`- Prix médian ${propertyType === "APARTMENT" ? "appartements" : propertyType === "HOUSE" ? "maisons" : ""} : ${fmtPsm(prixM2)}`);
    if (pappersStats.prixM2 != null) lines.push(`- Médiane tous types : ${fmtPsm(pappersStats.prixM2)}`);
    if (pappersStats.variation1An != null) lines.push(`- Évolution annuelle : ${pctRaw(pappersStats.variation1An)}`);
    if (pappersStats.nbTransactions1An != null) lines.push(`- Transactions (12 mois) : ${pappersStats.nbTransactions1An}`);
    if (pappersStats.dept) {
      lines.push(`- Référence Haute-Savoie :`);
      if (pappersStats.dept.prixM2 != null) lines.push(`  - Médiane dept : ${fmtPsm(pappersStats.dept.prixM2)}`);
      if (pappersStats.dept.variation1An != null) lines.push(`  - Évolution annuelle dept : ${pctRaw(pappersStats.dept.variation1An)}`);
    }
    if (pappersStats.source === "departement") {
      lines.push(`  *(Données au niveau département — commune non répertoriée)*`);
    }
    lines.push(``);
  }

  if (listings.length > 0) {
    lines.push(`## ANNONCES ACTIVES (MoteurImmo) — ${listings.length} bien${listings.length > 1 ? "s" : ""} en concurrence`);
    listings.forEach((l, i) => {
      const dist = l.distance != null ? ` — ${(l.distance / 1000).toFixed(1)} km` : "";
      lines.push(`${i + 1}. **${l.surface} m²** · ${fmt(l.price)} (${fmtPsm(l.pricePsm)})${dist}${l.rooms ? ` · ${l.rooms} pièces` : ""}${l.dpe ? ` · DPE ${l.dpe}` : ""}`);
    });
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
  if (clientName) {
    const clientAttention = [clientName, clientEmail, clientPhone].filter(Boolean).join(" — ");
    lines.push(`*Avis de valeur établi à l'attention de : ${clientAttention}*`);
    lines.push(``);
  }
  lines.push(`[EMPLACEMENT PHOTO CONSEILLÈRE — à insérer manuellement]`);
  lines.push(`**CONSEILLÈRE :** Aurélie LIVERSET`);
  lines.push(`aurelie.liverset@iadfrance.fr — 07 82 72 78 83`);
  lines.push(`IAD France — Haute-Savoie (74)`);
  lines.push(`[EMPLACEMENT LOGO IAD — à insérer manuellement]`);
  lines.push(``);
  lines.push(`*Données ESTIM'74 — Haute-Savoie (74) — DVF 2014–2024*`);
  lines.push(``);
  lines.push(`> Note : Remplacer les emplacements photo et logo par les vraies images après génération.`);

  return lines.join("\n");
}

export function buildGammaClientPrompt(input: GammaPromptInput, baseUrl?: string): string {
  if (!input.baseUrl && baseUrl) input = { ...input, baseUrl };
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

  const clientFirstName = serialized.clientFirstName as string | null | undefined;
  const clientLastName = serialized.clientLastName as string | null | undefined;
  const clientEmail = serialized.clientEmail as string | null | undefined;
  const clientPhone = serialized.clientPhone as string | null | undefined;
  const clientName = [clientFirstName, clientLastName].filter(Boolean).join(" ");

  const valuationLow = serialized.valuationLow as number | null;
  const valuationMid = serialized.valuationMid as number | null;
  const valuationHigh = serialized.valuationHigh as number | null;
  const listingPriceLow = valuationMid ? Math.round(valuationMid * 1.02) : null;
  const listingPriceHigh = valuationMid ? Math.round(valuationMid * 1.03) : null;

  const marketReading = serialized.marketReading as MarketReading | null | undefined;
  const pappersStats = marketReading?.pappersStats;
  const dvfControl = marketReading?.dvfControl;

  const propertyType = serialized.propertyType as string;
  const prixM2Commune = pappersStats
    ? (propertyType === "APARTMENT" ? (pappersStats.prixM2Apparts ?? pappersStats.prixM2)
       : propertyType === "HOUSE" ? (pappersStats.prixM2Maisons ?? pappersStats.prixM2)
       : pappersStats.prixM2)
    : null;

  const features: string[] = [];
  if (serialized.hasParking) features.push("Parking");
  if (serialized.hasGarage) features.push("Garage");
  if (serialized.hasBalcony) features.push("Balcon");
  if (serialized.hasTerrace) features.push("Terrasse");
  if (serialized.hasCellar) features.push("Cave");
  if (serialized.hasPool) features.push("Piscine");
  if (serialized.hasElevator) features.push("Ascenseur");
  if (landSurface) features.push(`Terrain ${landSurface.toLocaleString("fr-FR")} m²`);

  const positiveAdj = adjustments.filter(a => a.factor > 0 && a.category !== "proximity");
  const proximityAdj = adjustments.filter(a => a.factor > 0 && a.category === "proximity");

  const clientGptTypes = ["MARKET_ANALYSIS", "NEGOTIATION_ADVICE", "PROPERTY_DESCRIPTION"];
  const clientGptOutputs = gptOutputs.filter(g => clientGptTypes.includes(g.actionType));

  const lines: string[] = [];

  lines.push(`Crée une présentation élégante et rassurante pour présenter une estimation immobilière à un propriétaire. Style : chaleureux, clair, moderne, sans jargon technique. Palette verte ou bleue apaisante.`);
  lines.push(``);
  lines.push(`## PAGE DE COUVERTURE`);
  lines.push(`[EMPLACEMENT PHOTO CONSEILLÈRE — à insérer manuellement]`);
  lines.push(`**Aurélie LIVERSET** — Conseillère IAD France — Haute-Savoie (74)`);
  lines.push(`[EMPLACEMENT LOGO IAD — à insérer manuellement]`);
  lines.push(``);
  if (clientName) {
    lines.push(`**PRÉPARÉ POUR :** ${clientName}`);
    if (clientEmail) lines.push(clientEmail);
    if (clientPhone) lines.push(clientPhone);
  } else {
    lines.push(`**PRÉPARÉ POUR :** [Nom du client — à compléter]`);
  }
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

  if (prixM2Commune != null || dvfControl?.trend12m != null) {
    lines.push(``);
    if (prixM2Commune != null && pappersStats) {
      lines.push(`À **${pappersStats.commune}**, le prix médian est actuellement de **${fmtPsm(prixM2Commune)}**.`);
    }
    if (pappersStats?.variation1An != null) {
      const trend = pappersStats.variation1An >= 0 ? "en hausse" : "en baisse";
      lines.push(`Le marché local est ${trend} de **${Math.abs(pappersStats.variation1An).toFixed(1)} %** sur un an.`);
    } else if (dvfControl?.trend12m != null) {
      const trend = dvfControl.trend12m >= 0 ? "en hausse" : "en baisse";
      lines.push(`Le marché local est ${trend} de **${Math.abs(dvfControl.trend12m).toFixed(1)} %** sur 12 mois.`);
    }
    if (pappersStats?.nbTransactions1An != null) {
      lines.push(`${pappersStats.nbTransactions1An} transactions enregistrées sur les 12 derniers mois.`);
    }
  }

  lines.push(``);
  lines.push(`---`);
  if (clientName) {
    const clientAttention = [clientName, clientEmail, clientPhone].filter(Boolean).join(" — ");
    lines.push(`*Avis de valeur établi à l'attention de : ${clientAttention}*`);
    lines.push(``);
  }
  lines.push(`[EMPLACEMENT PHOTO CONSEILLÈRE — à insérer manuellement]`);
  lines.push(`**CONSEILLÈRE :** Aurélie LIVERSET`);
  lines.push(`aurelie.liverset@iadfrance.fr — 07 82 72 78 83`);
  lines.push(`IAD France — Haute-Savoie (74)`);
  lines.push(`[EMPLACEMENT LOGO IAD — à insérer manuellement]`);
  lines.push(``);
  lines.push(`*Estimation ESTIM'74 — Confidentiel — Document réservé au propriétaire*`);
  lines.push(``);
  lines.push(`> Note : Remplacer les emplacements photo et logo par les vraies images après génération.`);

  return lines.join("\n");
}
