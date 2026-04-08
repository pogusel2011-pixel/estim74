import { Adjustment } from "@/types/valuation";
import { DVFStats } from "@/types/dvf";
import { GPTOutput } from "@/types/gpt";
import { MarketReading } from "@/types/analysis";
import { ActiveListing } from "@/types/listing";
import { getIrisDisplayLabel } from "@/lib/geo/iris-loader";
import { computeSwot } from "@/lib/analysis/swot";
import type { OsmPlace } from "@/lib/geo/osm";
import type { ServitudeItem } from "@/lib/geo/sup";

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
  const irisDisplayLabelGamma = serialized.irisCode ? getIrisDisplayLabel(serialized.irisCode as string) : null;
  const zonePLUGamma = serialized.zonePLU as string | null;
  const documentUrbanismeGamma = serialized.documentUrbanisme as string | null;
  const pluDisplayLabelGamma = zonePLUGamma
    ? `Zone ${zonePLUGamma}${documentUrbanismeGamma ? " — " + documentUrbanismeGamma + " " + city : ""}`
    : null;
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
  const clientAddress = serialized.clientAddress as string | null | undefined;
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
  lines.push(`CONSEILLÈRE : Aurélie LIVERSET`);
  lines.push(`Email : aurelie.liverset@iadfrance.fr`);
  lines.push(`Tél : 07 82 72 78 83`);
  lines.push(`IAD France — Haute-Savoie (74)`);
  lines.push(``);
  lines.push(`[INSTRUCTION GAMMA — COVER PAGE]`);
  lines.push(`En bas à gauche de la page de couverture : insérer la photo de la conseillère (format portrait, petit carré arrondi).`);
  lines.push(`En bas à droite : insérer le logo IAD France (fond blanc, format horizontal).`);
  lines.push(`Ces éléments doivent apparaître sur TOUTES les pages en pied de page.`);
  lines.push(``);
  if (clientName) {
    lines.push(`PRÉPARÉ POUR : ${clientName}`);
    if (clientAddress) lines.push(clientAddress);
    if (clientEmail) lines.push(clientEmail);
    if (clientPhone) lines.push(clientPhone);
    lines.push(``);
  }
  lines.push(`## BIEN ESTIMÉ`);
  lines.push(`**${type}** — ${surface} m² — ${address ? address + ", " : ""}${city}${postalCode ? " (" + postalCode + ")" : ""}`);
  if (irisDisplayLabelGamma) lines.push(`Secteur IRIS : ${irisDisplayLabelGamma}`);
  if (pluDisplayLabelGamma) lines.push(`Zonage urbanisme : ${pluDisplayLabelGamma}`);
  if (rooms) lines.push(`${rooms} pièce${rooms > 1 ? "s" : ""}${bedrooms ? " dont " + bedrooms + " chambre" + (bedrooms > 1 ? "s" : "") : ""}`);
  if (floor != null && totalFloors != null) lines.push(`Étage ${floor}/${totalFloors}`);
  if (yearBuilt) lines.push(`Construit en ${yearBuilt}`);
  if (condition) lines.push(`État : ${CONDITION_LABELS[condition] ?? condition}`);
  if (dpeLetter) lines.push(`DPE : ${dpeLetter}`);
  if (landSurface) lines.push(`Terrain : ${landSurface.toLocaleString("fr-FR")} m²`);
  if (mitoyennete && mitoyennete !== "individuelle") {
    const mitoLabel = mitoyennete === "mitoyenne_un_cote" ? "Mitoyenne d'un côté" : "Mitoyenne des deux côtés";
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

    // ── Périmètre de recherche DVF ──
    lines.push(`### Périmètre de recherche DVF`);
    if (irisDisplayLabelGamma) lines.push(`- Secteur IRIS : ${irisDisplayLabelGamma}`);
    if (pluDisplayLabelGamma) lines.push(`- Zonage urbanisme (PLU) : ${pluDisplayLabelGamma}`);
    if (dvfStats.searchPath) {
      lines.push(`- Périmètre retenu : ${dvfStats.searchPath}`);
    } else if (perimeterKm) {
      lines.push(`- Périmètre retenu : ${perimeterKm} km`);
    }
    if (dvfStats.excludedCount != null && dvfStats.excludedCount > 0) {
      lines.push(`- Transactions : ${(dvfSampleSize ?? dvfStats.count) + dvfStats.excludedCount} brutes → ${dvfSampleSize ?? dvfStats.count} retenues (${dvfStats.excludedCount} exclues)`);
    } else if (dvfSampleSize != null) {
      lines.push(`- Transactions retenues : ${dvfSampleSize}`);
    }
    if (dvfStats.periodMonths || (dvfStats.oldestDate && dvfStats.newestDate)) {
      const period = dvfStats.oldestDate && dvfStats.newestDate
        ? `${dvfStats.oldestDate.slice(0, 7)} – ${dvfStats.newestDate.slice(0, 7)}`
        : null;
      if (period) lines.push(`- Période couverte : ${period}`);
    }
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

  // ─── Risques naturels ─────────────────────────────────────────────────
  const risksSummaryGamma = Array.isArray(serialized.risksSummary) ? (serialized.risksSummary as string[]) : [];
  const servitudesGamma = Array.isArray(serialized.servitudes) ? (serialized.servitudes as ServitudeItem[]) : [];
  const proximitiesGamma = Array.isArray(serialized.proximities) ? (serialized.proximities as OsmPlace[]) : [];

  if (risksSummaryGamma.length > 0 || (serialized.risksSummary as unknown) === null) {
    lines.push(`## RISQUES NATURELS (Géorisques GASPAR)`);
    if (risksSummaryGamma.length > 0) {
      risksSummaryGamma.forEach(r => lines.push(`- ⚠️ ${r}`));
    } else {
      lines.push(`- ✅ Aucun risque naturel majeur recensé dans ce secteur`);
    }
    lines.push(``);
  }

  if (servitudesGamma.length > 0 || (serialized.servitudes as unknown) === null) {
    lines.push(`## SERVITUDES D'UTILITÉ PUBLIQUE (GPU IGN)`);
    if (servitudesGamma.length > 0) {
      servitudesGamma.slice(0, 6).forEach(s => {
        lines.push(`- [${s.typeSup ?? "SUP"}] ${s.libelle ?? "Servitude"}`);
      });
    } else {
      lines.push(`- ✅ Aucune servitude SUP recensée`);
    }
    lines.push(``);
  }

  if (proximitiesGamma.length > 0) {
    lines.push(`## ÉQUIPEMENTS DE PROXIMITÉ (OSM — rayon 1 km)`);
    const CAT_LABELS_G: Record<string, string> = { school: "Écoles", shop: "Commerces", transport: "Transports", health: "Santé", park: "Espaces verts" };
    for (const cat of ["school", "shop", "transport", "health", "park"] as const) {
      const items = proximitiesGamma.filter(p => p.category === cat).sort((a, b) => a.distanceM - b.distanceM).slice(0, 5);
      if (items.length > 0) {
        lines.push(`**${CAT_LABELS_G[cat]} :**`);
        items.forEach(p => {
          const dist = p.distanceM < 1000 ? `${p.distanceM} m` : `${(p.distanceM / 1000).toFixed(1)} km`;
          lines.push(`- ${p.name} — ${dist}`);
        });
      }
    }
    lines.push(``);
  }

  // ─── SWOT ─────────────────────────────────────────────────────────────
  {
    const swotG = computeSwot({
      propertyType: serialized.propertyType as string,
      condition: serialized.condition as string | null,
      dpeLetter: serialized.dpeLetter as string | null,
      floor: serialized.floor as number | null,
      totalFloors: serialized.totalFloors as number | null,
      yearBuilt: serialized.yearBuilt as number | null,
      hasParking: Boolean(serialized.hasParking),
      hasGarage: Boolean(serialized.hasGarage),
      hasBalcony: Boolean(serialized.hasBalcony),
      hasTerrace: Boolean(serialized.hasTerrace),
      hasCellar: Boolean(serialized.hasCellar),
      hasPool: Boolean(serialized.hasPool),
      hasElevator: Boolean(serialized.hasElevator),
      landSurface: serialized.landSurface as number | null,
      surface: serialized.surface as number,
      rooms: serialized.rooms as number | null,
      orientation: serialized.orientation as string | null,
      view: serialized.view as string | null,
      mitoyennete: serialized.mitoyennete as string | null,
      hasBruit: Boolean(serialized.hasBruit),
      hasCopropDegradee: Boolean(serialized.hasCopropDegradee),
      hasExpositionNord: Boolean(serialized.hasExpositionNord),
      hasRDCSansExterieur: Boolean(serialized.hasRDCSansExterieur),
      zonePLU: serialized.zonePLU as string | null,
      zonePLUType: serialized.zonePLUType as string | null,
      riskFlood: serialized.riskFlood as string | null,
      riskEarthquake: serialized.riskEarthquake as string | null,
      riskClay: serialized.riskClay as string | null,
      riskLandslide: serialized.riskLandslide as string | null,
      risksSummary: risksSummaryGamma.length > 0 ? risksSummaryGamma : null,
      servitudes: servitudesGamma.length > 0 ? servitudesGamma : null,
      proximities: proximitiesGamma.length > 0 ? proximitiesGamma : null,
      confidence: serialized.confidence as number | null,
      dvfSampleSize: serialized.dvfSampleSize as number | null,
    });
    if (swotG.strengths.length > 0 || swotG.weaknesses.length > 0) {
      lines.push(`## ANALYSE FORCES & FAIBLESSES`);
      if (swotG.strengths.length > 0) {
        lines.push(`**Points forts :**`);
        swotG.strengths.forEach(s => lines.push(`- ✅ ${s.label}`));
      }
      if (swotG.weaknesses.length > 0) {
        lines.push(`**Points de vigilance :**`);
        swotG.weaknesses.forEach(s => lines.push(`- ❌ ${s.label}`));
      }
      lines.push(``);
    }
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
    const clientAttention = [clientName, clientAddress, clientEmail, clientPhone].filter(Boolean).join(" — ");
    lines.push(`*Avis de valeur établi à l'attention de : ${clientAttention}*`);
    lines.push(``);
  }
  lines.push(`![Photo Aurélie LIVERSET](https://drive.google.com/uc?export=view&id=1oV7eOY0udKKgC4kvZ2d7N1FwfbaCfjlP)`);
  lines.push(`**CONSEILLÈRE :** Aurélie LIVERSET`);
  lines.push(`aurelie.liverset@iadfrance.fr — 07 82 72 78 83`);
  lines.push(`IAD France — Haute-Savoie (74)`);
  lines.push(`![Logo IAD France](https://estim74.vercel.app/iad-logo.png)`);
  lines.push(``);
  lines.push(`*Données ESTIM'74 — Haute-Savoie (74) — DVF 2020–2025*`);

  return lines.join("\n");
}

export function buildGammaClientPrompt(input: GammaPromptInput, baseUrl?: string): string {
  if (!input.baseUrl && baseUrl) input = { ...input, baseUrl };
  const { serialized, adjustments, gptOutputs } = input;

  const type = PROPERTY_LABELS[serialized.propertyType as string] ?? (serialized.propertyType as string);
  const surface = serialized.surface as number;
  const city = serialized.city as string;
  const address = serialized.address as string | null;
  const irisDisplayLabelGammaC = serialized.irisCode ? getIrisDisplayLabel(serialized.irisCode as string) : null;
  const zonePLUGammaC = serialized.zonePLU as string | null;
  const documentUrbanismeGammaC = serialized.documentUrbanisme as string | null;
  const pluDisplayLabelGammaC = zonePLUGammaC
    ? `Zone ${zonePLUGammaC}${documentUrbanismeGammaC ? " — " + documentUrbanismeGammaC + " " + city : ""}`
    : null;
  const rooms = serialized.rooms as number | null;
  const bedrooms = serialized.bedrooms as number | null;
  const yearBuilt = serialized.yearBuilt as number | null;
  const dpeLetter = serialized.dpeLetter as string | null;
  const landSurface = serialized.landSurface as number | null;
  const orientation = serialized.orientation as string | null;
  const view = serialized.view as string | null;

  const clientFirstName = serialized.clientFirstName as string | null | undefined;
  const clientLastName = serialized.clientLastName as string | null | undefined;
  const clientAddress = serialized.clientAddress as string | null | undefined;
  const clientEmail = serialized.clientEmail as string | null | undefined;
  const clientPhone = serialized.clientPhone as string | null | undefined;
  const clientName = [clientFirstName, clientLastName].filter(Boolean).join(" ");

  const valuationLow = serialized.valuationLow as number | null;
  const valuationMid = serialized.valuationMid as number | null;
  const valuationHigh = serialized.valuationHigh as number | null;

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

  lines.push(`Crée une présentation élégante et rassurante pour présenter un avis de valeur immobilier à un propriétaire. Style : chaleureux, clair, moderne, sans jargon technique. Palette verte ou bleue apaisante.`);
  lines.push(``);
  lines.push(`## PAGE DE COUVERTURE`);
  lines.push(`CONSEILLÈRE : Aurélie LIVERSET`);
  lines.push(`Email : aurelie.liverset@iadfrance.fr`);
  lines.push(`Tél : 07 82 72 78 83`);
  lines.push(`IAD France — Haute-Savoie (74)`);
  lines.push(``);
  lines.push(`[INSTRUCTION GAMMA — COVER PAGE]`);
  lines.push(`En bas à gauche de la page de couverture : insérer la photo de la conseillère (format portrait, petit carré arrondi).`);
  lines.push(`En bas à droite : insérer le logo IAD France (fond blanc, format horizontal).`);
  lines.push(`Ces éléments doivent apparaître sur TOUTES les pages en pied de page.`);
  lines.push(``);
  if (clientName) {
    lines.push(`PRÉPARÉ POUR : ${clientName}`);
    if (clientAddress) lines.push(clientAddress);
    if (clientEmail) lines.push(clientEmail);
    if (clientPhone) lines.push(clientPhone);
    lines.push(``);
  }
  lines.push(`## VOTRE BIEN`);
  lines.push(`**${type}** de **${surface} m²** — ${address ? address + ", " : ""}${city}`);
  if (irisDisplayLabelGammaC) lines.push(`Secteur IRIS : ${irisDisplayLabelGammaC}`);
  if (pluDisplayLabelGammaC) lines.push(`Zonage urbanisme : ${pluDisplayLabelGammaC}`);

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
  lines.push(`Avis de valeur établi à partir de milliers de ventes réelles en Haute-Savoie (74).`);
  lines.push(`Données DVF officielles 2020–2025.`);

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
    const clientAttention = [clientName, clientAddress, clientEmail, clientPhone].filter(Boolean).join(" — ");
    lines.push(`*Avis de valeur établi à l'attention de : ${clientAttention}*`);
    lines.push(``);
  }
  lines.push(`![Photo Aurélie LIVERSET](https://drive.google.com/uc?export=view&id=1oV7eOY0udKKgC4kvZ2d7N1FwfbaCfjlP)`);
  lines.push(`**CONSEILLÈRE :** Aurélie LIVERSET`);
  lines.push(`aurelie.liverset@iadfrance.fr — 07 82 72 78 83`);
  lines.push(`IAD France — Haute-Savoie (74)`);
  lines.push(`![Logo IAD France](https://estim74.vercel.app/iad-logo.png)`);
  lines.push(``);
  lines.push(`*Avis de Valeur ESTIM'74 — Confidentiel — Document réservé au propriétaire*`);

  return lines.join("\n");
}
