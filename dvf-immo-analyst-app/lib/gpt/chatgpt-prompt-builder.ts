import { DVFStats, DVFComparable } from "@/types/dvf";
import { Adjustment, ConfidenceFactors } from "@/types/valuation";
import { ActiveListing } from "@/types/listing";
import { PROPERTY_TYPE_LABELS, CONDITION_LABELS } from "@/lib/constants";
import type { OsmPlace } from "@/lib/geo/osm";
import type { ServitudeItem } from "@/lib/geo/sup";
import type { SwotResult } from "@/lib/analysis/swot";

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
  hasBruit?: boolean;
  hasCopropDegradee?: boolean;
  hasExpositionNord?: boolean;
  hasRDCSansExterieur?: boolean;

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
  dvfLiveCount?: number;

  // Comparables
  dvfComparables?: DVFComparable[];

  // Annonces actives
  listings?: ActiveListing[];

  // PLU
  zonePLU?: string | null;
  zonePLUType?: string | null;

  // Risques naturels — undefined = non renseigné ; null = vérifié, aucun ; string[] = risques trouvés
  risksSummary?: string[] | null;

  // Servitudes SUP — undefined = non renseigné ; null = vérifié, aucune ; ServitudeItem[] = servitudes trouvées
  servitudes?: ServitudeItem[] | null;

  // Proximités OSM
  proximities?: OsmPlace[];

  // SWOT
  swot?: SwotResult | null;
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
    (() => {
      const contraintes = [
        d.hasBruit && "nuisances sonores",
        d.hasCopropDegradee && "copropriété dégradée",
        d.hasExpositionNord && "exposition Nord",
        d.hasRDCSansExterieur && "RDC sans extérieur",
      ].filter(Boolean) as string[];
      return contraintes.length > 0 ? `- Contraintes : ${contraintes.join(", ")}` : null;
    })(),
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
    `- Source données  : ${stats.source === "csv" ? "CSV DGFiP 2020-2025" : stats.source === "api" ? "API cquest.org (live)" : "CSV + API"}`,
    (d.dvfLiveCount ?? 0) > 0
      ? `- DVF Live (data.gouv.fr) : ${d.dvfLiveCount} transaction${(d.dvfLiveCount ?? 0) > 1 ? "s" : ""} récente${(d.dvfLiveCount ?? 0) > 1 ? "s" : ""} incluse${(d.dvfLiveCount ?? 0) > 1 ? "s" : ""}`
      : null,
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

const PLU_TYPE_LABELS: Record<string, string> = {
  U: "Zone urbaine",
  AU: "Zone à urbaniser",
  N: "Zone naturelle",
  A: "Zone agricole",
};

function sectionPlu(d: ChatGPTPromptData): string | null {
  if (!d.zonePLU) return null;
  const typeLabel = d.zonePLUType ? (PLU_TYPE_LABELS[d.zonePLUType] ?? d.zonePLUType) : null;
  return [
    `URBANISME (PLU/PLUi)`,
    `- Zone : ${d.zonePLU}${typeLabel ? ` — ${typeLabel}` : ""}`,
  ].join("\n");
}

function sectionRisques(d: ChatGPTPromptData): string | null {
  if (d.risksSummary === undefined) return null;
  const lines = [`RISQUES NATURELS (Géorisques)`];
  if (!d.risksSummary || d.risksSummary.length === 0) {
    lines.push(`- Aucun risque naturel majeur recensé dans ce secteur`);
  } else {
    d.risksSummary.forEach(r => lines.push(`- ${r}`));
  }
  return lines.join("\n");
}

function sectionServitudes(d: ChatGPTPromptData): string | null {
  if (d.servitudes === undefined) return null;
  const lines = [`SERVITUDES D'UTILITÉ PUBLIQUE (GPU IGN)`];
  if (!d.servitudes || d.servitudes.length === 0) {
    lines.push(`- Aucune servitude SUP recensée`);
  } else {
    d.servitudes.slice(0, 6).forEach(s => {
      lines.push(`- [${s.typeSup ?? "SUP"}] ${s.libelle ?? "Servitude"}`);
    });
  }
  return lines.join("\n");
}

const OSM_CAT_LABELS: Record<string, string> = {
  school: "Écoles / Éducation",
  shop: "Commerces",
  transport: "Transports",
  health: "Santé",
  park: "Espaces verts",
};

function sectionProximites(d: ChatGPTPromptData): string | null {
  const places = d.proximities;
  if (!places || places.length === 0) return null;
  const lines = [`ÉQUIPEMENTS DE PROXIMITÉ (OSM — rayon 1 km)`];
  for (const cat of ["school", "shop", "transport", "health", "park"] as const) {
    const items = places
      .filter(p => p.category === cat)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 3);
    if (items.length === 0) continue;
    lines.push(`${OSM_CAT_LABELS[cat]} :`);
    items.forEach(p => {
      const dist = p.distanceM < 1000 ? `${p.distanceM} m` : `${(p.distanceM / 1000).toFixed(1)} km`;
      lines.push(`  - ${p.name} — ${dist}`);
    });
  }
  return lines.join("\n");
}

function sectionSwot(d: ChatGPTPromptData): string | null {
  const swot = d.swot;
  if (!swot || (swot.strengths.length === 0 && swot.weaknesses.length === 0)) return null;
  const lines = [`ANALYSE FORCES & FAIBLESSES (SWOT)`];
  if (swot.strengths.length > 0) {
    lines.push(`Points forts :`);
    swot.strengths.forEach(s => lines.push(`  + ${s.label}${s.detail ? ` (${s.detail})` : ""}`));
  }
  if (swot.weaknesses.length > 0) {
    lines.push(`Points de vigilance :`);
    swot.weaknesses.forEach(s => lines.push(`  - ${s.label}${s.detail ? ` (${s.detail})` : ""}`));
  }
  return lines.join("\n");
}

// ─── Builder principal ────────────────────────────────────────────────────────

export function buildChatGPTPrompt(data: ChatGPTPromptData): string {
  const today = new Date().toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });

  const plu         = sectionPlu(data);
  const risques     = sectionRisques(data);
  const servitudes  = sectionServitudes(data);
  const proximites  = sectionProximites(data);
  const swot        = sectionSwot(data);

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
    plu        ? `\n${plu}`        : null,
    risques    ? `\n${risques}`    : null,
    servitudes ? `\n${servitudes}` : null,
    proximites ? `\n${proximites}` : null,
    swot       ? `\n${swot}`       : null,
    ``,
    `---`,
    `Merci d'analyser ce dossier complet et de produire le rapport d'estimation structuré selon les directives du GPT DVF Immo Analyst.`,
  ].filter(s => s !== null);

  return sections.join("\n");
}
