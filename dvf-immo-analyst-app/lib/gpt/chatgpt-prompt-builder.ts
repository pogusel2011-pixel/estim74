import { DVFStats, DVFComparable } from "@/types/dvf";
import { Adjustment, ConfidenceFactors } from "@/types/valuation";
import { ActiveListing } from "@/types/listing";
import { PROPERTY_TYPE_LABELS, CONDITION_LABELS } from "@/lib/constants";

const GPT_URL = "https://chatgpt.com/g/g-69914d0e2aa48191955454117055fdc6-dvf-immo-analyst";

export { GPT_URL };

/**
 * Données nécessaires pour générer le prompt ChatGPT complet du dossier.
 * Tous les champs facultatifs produisent "N/D" si absents.
 */
export interface ChatGPTPromptData {
  // Bien
  propertyType: string;
  address?: string | null;
  city: string;
  postalCode?: string | null;
  surface: number;
  rooms?: number | null;
  bedrooms?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  condition?: string | null;
  dpeLetter?: string | null;
  landSurface?: number | null;
  yearBuilt?: number | null;
  hasParking?: boolean;
  hasGarage?: boolean;
  hasBalcony?: boolean;
  hasTerrace?: boolean;
  hasCellar?: boolean;
  hasPool?: boolean;
  hasElevator?: boolean;
  orientation?: string | null;
  view?: string | null;

  // Estimation
  valuationLow?: number | null;
  valuationMid?: number | null;
  valuationHigh?: number | null;
  valuationPsm?: number | null;
  confidence?: number | null;          // 0-1
  confidenceLabel?: string | null;
  confidenceFactors?: ConfidenceFactors | null;

  // DVF
  dvfStats?: DVFStats | null;
  perimeterKm?: number | null;
  adjustments?: Adjustment[] | null;

  // Comparables
  dvfComparables?: DVFComparable[];

  // Annonces actives
  listings?: ActiveListing[];
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtPrice(n: number | null | undefined): string {
  if (!n) return "N/D";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function fmtPsm(n: number | null | undefined): string {
  if (!n) return "N/D";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n) + "/m²";
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "N/D";
  try {
    return new Date(d).toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n == null) return "N/D";
  return (n > 0 ? "+" : "") + n.toFixed(decimals) + "%";
}

// ─── Sections ────────────────────────────────────────────────────────────────

function sectionBien(d: ChatGPTPromptData): string {
  const typeLabel = PROPERTY_TYPE_LABELS[d.propertyType] ?? d.propertyType;
  const adresse = d.address
    ? `${d.address}, ${d.postalCode ?? ""} ${d.city}`.trim()
    : `${d.postalCode ?? ""} ${d.city}`.trim();

  const equip: string[] = [];
  if (d.hasParking)  equip.push("Parking");
  if (d.hasGarage)   equip.push("Garage");
  if (d.hasBalcony)  equip.push("Balcon");
  if (d.hasTerrace)  equip.push("Terrasse");
  if (d.hasCellar)   equip.push("Cave");
  if (d.hasPool)     equip.push("Piscine");
  if (d.hasElevator) equip.push("Ascenseur");

  const etage = (d.floor != null && d.totalFloors != null)
    ? `${d.floor}/${d.totalFloors}`
    : d.floor != null ? String(d.floor) : null;

  const conditionLabel = d.condition ? (CONDITION_LABELS[d.condition] ?? d.condition) : null;

  const caracteristiques = [
    d.rooms      ? `${d.rooms} pièces` : null,
    d.bedrooms   ? `${d.bedrooms} chambres` : null,
    etage        ? `Étage ${etage}` : null,
    d.dpeLetter  ? `DPE ${d.dpeLetter}` : null,
    conditionLabel ? `État : ${conditionLabel}` : null,
  ].filter(Boolean).join(" | ");

  const lines = [
    `BIEN ESTIMÉ`,
    `- Type : ${typeLabel}`,
    `- Adresse : ${adresse}`,
    `- Surface : ${d.surface} m²`,
    caracteristiques ? `- Caractéristiques : ${caracteristiques}` : null,
    d.landSurface ? `- Terrain : ${Math.round(d.landSurface)} m²` : null,
    d.yearBuilt ? `- Année construction : ${d.yearBuilt}` : null,
    equip.length > 0 ? `- Équipements : ${equip.join(", ")}` : null,
    d.orientation ? `- Orientation : ${d.orientation}` : null,
    d.view ? `- Vue : ${d.view}` : null,
  ].filter(Boolean);

  return lines.join("\n");
}

function sectionEstimation(d: ChatGPTPromptData): string {
  const total = d.confidenceFactors?.total ?? (d.confidence != null ? Math.round(d.confidence * 100) : null);
  const factorsLine = d.confidenceFactors
    ? `  Détail : Densité ${d.confidenceFactors.density}/30 • Fraîcheur ${d.confidenceFactors.freshness}/25 • Proximité ${d.confidenceFactors.proximity}/25 • Homogénéité ${d.confidenceFactors.homogeneity}/20`
    : null;

  const lines = [
    `RÉSULTAT D'ESTIMATION`,
    `- Fourchette basse    : ${fmtPrice(d.valuationLow)}`,
    `- Estimation centrale : ${fmtPrice(d.valuationMid)}`,
    `- Fourchette haute    : ${fmtPrice(d.valuationHigh)}`,
    `- Prix/m² estimé      : ${fmtPsm(d.valuationPsm)}`,
    `- Qualité des données : ${d.confidenceLabel ?? "N/D"}${total != null ? ` (${total}/100)` : ""}`,
    factorsLine,
  ].filter(Boolean);

  return lines.join("\n");
}

function sectionDvf(d: ChatGPTPromptData): string {
  const stats = d.dvfStats;
  if (!stats) {
    return `SOCLE DVF\n- Données DVF insuffisantes dans ce secteur`;
  }

  const perimM = d.perimeterKm != null ? `${Math.round(d.perimeterKm * 1000)} m` : "N/D";

  const adjTotal = d.adjustments && d.adjustments.length > 0
    ? d.adjustments.reduce((s, a) => s + a.factor, 0)
    : null;

  const adjDetails = d.adjustments && d.adjustments.length > 0
    ? d.adjustments
        .map(a => `${a.label} ${a.factor > 0 ? "+" : ""}${(a.factor * 100).toFixed(1)}%`)
        .join(", ")
    : null;

  const lines = [
    `SOCLE DVF`,
    `- Ventes retenues : ${stats.count} transactions`,
    `- Période         : ${fmtDate(stats.oldestDate)} à ${fmtDate(stats.newestDate)}`,
    `- Rayon utilisé   : ${perimM}`,
    `- Médiane DVF     : ${fmtPsm(stats.medianPsm)} | Q1 : ${fmtPsm(stats.p25Psm)} | Q3 : ${fmtPsm(stats.p75Psm)}`,
    adjTotal != null
      ? `- Ajustements qualitatifs : ${fmtPct(adjTotal * 100, 1)} (plafonné à ±20%)`
      : null,
    adjDetails ? `  Détail : ${adjDetails}` : null,
    `- Source données  : ${stats.source === "csv" ? "CSV DGFiP 2014-2024" : stats.source === "api" ? "API cquest.org (live)" : "CSV + API"}`,
  ].filter(Boolean);

  return lines.join("\n");
}

function sectionComparables(d: ChatGPTPromptData): string {
  const comps = (d.dvfComparables ?? [])
    .filter(c => c.topComparable || (c.score ?? 0) > 0)
    .slice(0, 5);

  if (comps.length === 0) {
    return `COMPARABLES CLÉS (top 5)\n- Aucun comparable disponible`;
  }

  const header = "Date       | Dist.  | Surface | Pièces | Prix signé   | €/m²   | Adresse";
  const sep    = "-----------|--------|---------|--------|--------------|--------|----------------------------------";

  const rows = comps.map(c => {
    const date    = fmtDate(c.date).padEnd(10);
    const dist    = c.distanceM != null ? `${Math.round(c.distanceM)} m`.padEnd(6) : "N/D   ";
    const surf    = `${c.surface} m²`.padEnd(7);
    const rooms   = c.rooms != null ? String(c.rooms).padEnd(6) : "N/D   ";
    const price   = fmtPrice(c.price).padEnd(12);
    const psm     = fmtPsm(c.pricePsm).padEnd(6);
    const adresse = (c.address + (c.city ? `, ${c.city}` : "")).slice(0, 35);
    return `${date} | ${dist} | ${surf} | ${rooms} | ${price} | ${psm} | ${adresse}`;
  });

  return [`COMPARABLES CLÉS (top 5)`, header, sep, ...rows].join("\n");
}

function sectionListings(d: ChatGPTPromptData): string {
  const listings = d.listings ?? [];
  if (listings.length === 0) {
    return `MARCHÉ ACTIF (MoteurImmo)\n- Aucune annonce active trouvée dans ce secteur`;
  }

  const prices = listings.map(l => l.price).filter(Boolean).sort((a, b) => a - b);
  const psms   = listings.map(l => l.pricePsm).filter(Boolean).sort((a, b) => a - b);
  const medPsm = psms.length > 0 ? psms[Math.floor(psms.length / 2)] : null;

  let ecart = "N/D";
  if (medPsm && d.dvfStats?.medianPsm && d.dvfStats.medianPsm > 0) {
    const pct = ((medPsm - d.dvfStats.medianPsm) / d.dvfStats.medianPsm) * 100;
    ecart = fmtPct(pct);
  }

  const lines = [
    `MARCHÉ ACTIF (MoteurImmo)`,
    `- Annonces actives comparables : ${listings.length}`,
    prices.length > 0
      ? `- Fourchette prix affichés     : ${fmtPrice(prices[0])} à ${fmtPrice(prices[prices.length - 1])}`
      : null,
    medPsm ? `- Prix affiché médian          : ${fmtPsm(medPsm)}` : null,
    `- Écart affiché / signé DVF    : ${ecart}`,
  ].filter(Boolean);

  return lines.join("\n");
}

// ─── Builder principal ────────────────────────────────────────────────────────

export function buildChatGPTPrompt(data: ChatGPTPromptData): string {
  const today = new Date().toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });

  const sections = [
    `Dossier d'estimation ESTIM'74 — ${today}`,
    ``,
    sectionBien(data),
    ``,
    sectionEstimation(data),
    ``,
    sectionDvf(data),
    ``,
    sectionComparables(data),
    ``,
    sectionListings(data),
    ``,
    `---`,
    `Merci d'analyser ce dossier complet et de produire le rapport d'estimation structuré selon les directives du GPT DVF Immo Analyst.`,
  ];

  return sections.join("\n");
}
