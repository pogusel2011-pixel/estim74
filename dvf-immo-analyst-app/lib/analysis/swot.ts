import type { OsmProximities } from "@/lib/geo/osm";
import type { ServitudesResult } from "@/lib/geo/sup";

export interface SwotItem {
  label: string;
  detail?: string;
  type: "strength" | "weakness";
  category: "energie" | "etat" | "equipement" | "localisation" | "risque" | "urbanisme" | "marche" | "proximite";
}

export interface SwotResult {
  strengths: SwotItem[];
  weaknesses: SwotItem[];
}

interface SwotInput {
  propertyType: string;
  condition: string | null;
  dpeLetter: string | null;
  floor: number | null;
  totalFloors: number | null;
  yearBuilt: number | null;
  hasParking: boolean;
  hasGarage: boolean;
  hasBalcony: boolean;
  hasTerrace: boolean;
  hasCellar: boolean;
  hasPool: boolean;
  hasElevator: boolean;
  landSurface: number | null;
  surface: number;
  rooms: number | null;
  orientation: string | null;
  view: string | null;
  mitoyennete: string | null;
  // Contraintes du bien
  hasBruit?: boolean;
  hasCopropDegradee?: boolean;
  hasExpositionNord?: boolean;
  hasRDCSansExterieur?: boolean;
  // Context
  zonePLU: string | null;
  zonePLUType: string | null;
  riskFlood: string | null;
  riskEarthquake: string | null;
  riskClay: string | null;
  riskLandslide: string | null;
  risksSummary: string[] | null;
  servitudes: ServitudesResult | null;
  proximities: OsmProximities | null;
  // Market
  confidence: number | null;
  dvfSampleSize: number | null;
}

export function computeSwot(input: SwotInput): SwotResult {
  const strengths: SwotItem[] = [];
  const weaknesses: SwotItem[] = [];

  // ── ÉTAT DU BIEN ──────────────────────────────────────────────────────────
  if (input.condition === "EXCELLENT") {
    strengths.push({ label: "Excellent état général", type: "strength", category: "etat" });
  } else if (input.condition === "GOOD") {
    strengths.push({ label: "Bon état général", type: "strength", category: "etat" });
  } else if (input.condition === "TO_RENOVATE") {
    weaknesses.push({ label: "Travaux de rénovation nécessaires", type: "weakness", category: "etat" });
  }

  // ── ÉNERGIE DPE ───────────────────────────────────────────────────────────
  if (input.dpeLetter) {
    if (["A", "B"].includes(input.dpeLetter)) {
      strengths.push({ label: `DPE ${input.dpeLetter} — Très performant énergétiquement`, type: "strength", category: "energie" });
    } else if (input.dpeLetter === "C") {
      strengths.push({ label: `DPE C — Bonne performance énergétique`, type: "strength", category: "energie" });
    } else if (["F", "G"].includes(input.dpeLetter)) {
      weaknesses.push({ label: `DPE ${input.dpeLetter} — Passoire énergétique (obligation de travaux)`, type: "weakness", category: "energie" });
    } else if (input.dpeLetter === "E") {
      weaknesses.push({ label: `DPE E — Performance énergétique dégradée`, type: "weakness", category: "energie" });
    }
  }

  // ── ÉQUIPEMENTS ───────────────────────────────────────────────────────────
  if (input.hasParking) strengths.push({ label: "Parking inclus", type: "strength", category: "equipement" });
  if (input.hasGarage) strengths.push({ label: "Garage privatif", type: "strength", category: "equipement" });
  if (input.hasPool) strengths.push({ label: "Piscine", type: "strength", category: "equipement" });
  if (input.hasTerrace) strengths.push({ label: "Terrasse", type: "strength", category: "equipement" });
  if (input.hasBalcony) strengths.push({ label: "Balcon", type: "strength", category: "equipement" });
  if (input.hasCellar) strengths.push({ label: "Cave", type: "strength", category: "equipement" });
  if (input.hasElevator && input.propertyType === "APARTMENT") {
    strengths.push({ label: "Ascenseur", type: "strength", category: "equipement" });
  }

  // Maison sans parking → faiblesse si appartement
  if (input.propertyType === "APARTMENT" && !input.hasParking && !input.hasGarage) {
    weaknesses.push({ label: "Absence de stationnement privatif", type: "weakness", category: "equipement" });
  }

  // ── ÉTAGE ─────────────────────────────────────────────────────────────────
  if (input.propertyType === "APARTMENT" && input.floor != null && input.totalFloors != null) {
    if (input.floor === input.totalFloors && input.floor >= 2) {
      strengths.push({ label: `Dernier étage (${input.floor}/${input.totalFloors})`, type: "strength", category: "localisation" });
    } else if (input.floor === 0 || input.floor === 1) {
      const hasTerre = input.hasTerrace || input.landSurface;
      if (!hasTerre) {
        weaknesses.push({ label: `Rez-de-chaussée — étage bas (${input.floor}/${input.totalFloors})`, type: "weakness", category: "localisation" });
      }
    }
    if (input.floor >= 3 && !input.hasElevator) {
      weaknesses.push({ label: `Sans ascenseur au ${input.floor}e étage`, type: "weakness", category: "equipement" });
    }
  }

  // ── ORIENTATION / VUE ─────────────────────────────────────────────────────
  if (input.orientation) {
    const goodOrient = ["Sud", "Sud-Est", "Sud-Ouest", "Ouest", "south", "south-east", "south-west"];
    const goodView = ["montagne", "lac", "panoramique", "dégagée", "jardin", "nature"];
    if (goodOrient.some((o) => (input.orientation ?? "").toLowerCase().includes(o.toLowerCase()))) {
      strengths.push({ label: `Orientation ${input.orientation}`, type: "strength", category: "localisation" });
    }
    if (input.view && goodView.some((v) => (input.view ?? "").toLowerCase().includes(v))) {
      strengths.push({ label: `Vue ${input.view}`, type: "strength", category: "localisation" });
    }
  }

  // ── TERRAIN ───────────────────────────────────────────────────────────────
  if (input.propertyType === "HOUSE" && input.landSurface) {
    if (input.landSurface >= 500) {
      strengths.push({ label: `Grand terrain (${input.landSurface.toLocaleString("fr-FR")} m²)`, type: "strength", category: "equipement" });
    } else if (input.landSurface >= 200) {
      strengths.push({ label: `Terrain (${input.landSurface.toLocaleString("fr-FR")} m²)`, type: "strength", category: "equipement" });
    }
  }

  // ── PLU / URBANISME ───────────────────────────────────────────────────────
  if (input.zonePLU && input.zonePLUType) {
    if (input.zonePLUType === "U") {
      strengths.push({ label: `Zone urbaine constructible (Zone ${input.zonePLU})`, type: "strength", category: "urbanisme" });
    } else if (input.zonePLUType === "AU") {
      strengths.push({ label: `Zone à urbaniser (Zone ${input.zonePLU}) — potentiel constructible`, type: "strength", category: "urbanisme" });
    } else if (input.zonePLUType === "N") {
      weaknesses.push({ label: `Zone naturelle (Zone ${input.zonePLU}) — constructibilité très limitée`, type: "weakness", category: "urbanisme" });
    } else if (input.zonePLUType === "A") {
      weaknesses.push({ label: `Zone agricole (Zone ${input.zonePLU}) — pas constructible`, type: "weakness", category: "urbanisme" });
    }
  }

  // ── RISQUES NATURELS ─────────────────────────────────────────────────────
  const hasAnyRisk = input.riskFlood || input.riskEarthquake || input.riskClay || input.riskLandslide;
  if (!hasAnyRisk && input.risksSummary !== undefined) {
    // Only add if we actually got a response (risksSummary might be null meaning no risks)
    if (input.risksSummary !== null) {
      // has risks
    } else {
      strengths.push({ label: "Aucun risque naturel majeur recensé (Géorisques)", type: "strength", category: "risque" });
    }
  }
  if (input.riskFlood) {
    weaknesses.push({ label: `Zone à risque d'inondation`, detail: input.riskFlood !== "Oui" ? input.riskFlood : undefined, type: "weakness", category: "risque" });
  }
  if (input.riskEarthquake) {
    weaknesses.push({ label: `Zone sismique`, detail: input.riskEarthquake !== "Oui" ? input.riskEarthquake : undefined, type: "weakness", category: "risque" });
  }
  if (input.riskClay) {
    weaknesses.push({ label: `Risque retrait-gonflement des argiles`, type: "weakness", category: "risque" });
  }
  if (input.riskLandslide) {
    weaknesses.push({ label: `Risque de mouvement de terrain`, type: "weakness", category: "risque" });
  }

  // ── SERVITUDES ────────────────────────────────────────────────────────────
  if (input.servitudes && input.servitudes.length > 0) {
    weaknesses.push({
      label: `${input.servitudes.length} servitude(s) d'utilité publique`,
      detail: input.servitudes.slice(0, 3).map((s) => s.typeSup ?? s.libelle ?? "").filter(Boolean).join(", ") || undefined,
      type: "weakness",
      category: "urbanisme",
    });
  }

  // ── PROXIMITÉS ────────────────────────────────────────────────────────────
  if (input.proximities && input.proximities.length > 0) {
    const byCategory = new Map<string, number>();
    for (const p of input.proximities) {
      byCategory.set(p.category, Math.min(byCategory.get(p.category) ?? Infinity, p.distanceM));
    }

    const schools = byCategory.get("school");
    if (schools != null && schools <= 500) {
      strengths.push({ label: `École à ${schools} m`, type: "strength", category: "proximite" });
    }
    const transport = byCategory.get("transport");
    if (transport != null && transport <= 300) {
      strengths.push({ label: `Transport en commun à ${transport} m`, type: "strength", category: "proximite" });
    } else if (transport != null && transport > 700) {
      weaknesses.push({ label: `Transport en commun éloigné (${transport} m)`, type: "weakness", category: "proximite" });
    }
    const shops = byCategory.get("shop");
    if (shops != null && shops <= 300) {
      strengths.push({ label: `Commerces à ${shops} m`, type: "strength", category: "proximite" });
    }
    const health = byCategory.get("health");
    if (health != null && health <= 500) {
      strengths.push({ label: `Services de santé à ${health} m`, type: "strength", category: "proximite" });
    }
    const parks = byCategory.get("park");
    if (parks != null && parks <= 400) {
      strengths.push({ label: `Espace vert / parc à ${parks} m`, type: "strength", category: "proximite" });
    }

    // No proximity data found at all
  } else if (input.proximities !== null) {
    weaknesses.push({ label: "Peu d'équipements recensés dans un rayon de 1 km", type: "weakness", category: "proximite" });
  }

  // ── ÂGE DU BIEN ───────────────────────────────────────────────────────────
  if (input.yearBuilt) {
    const age = new Date().getFullYear() - input.yearBuilt;
    if (age <= 5) {
      strengths.push({ label: `Construction récente (${input.yearBuilt})`, type: "strength", category: "etat" });
    } else if (age > 50 && input.condition !== "EXCELLENT" && input.condition !== "GOOD") {
      weaknesses.push({ label: `Bien ancien (${input.yearBuilt}) — attention aux mises aux normes`, type: "weakness", category: "etat" });
    }
  }

  // ── MITOYENNETÉ ──────────────────────────────────────────────────────────
  if (input.mitoyennete === "mitoyenne_deux_cotes" && input.propertyType === "HOUSE") {
    weaknesses.push({ label: "Maison mitoyenne des deux côtés", type: "weakness", category: "localisation" });
  }

  // ── VUE (mauvaises vues comme faiblesses) ─────────────────────────────────
  if (input.view === "vis_a_vis") {
    weaknesses.push({ label: "Vue sur vis-à-vis — luminosité et intimité réduites", type: "weakness", category: "localisation" });
  } else if (input.view === "route_parking") {
    weaknesses.push({ label: "Vue sur route / parking — nuisances visuelles", type: "weakness", category: "localisation" });
  } else if (input.view === "voie_ferree") {
    weaknesses.push({ label: "Vue sur voie ferrée — nuisances sonores et visuelles", type: "weakness", category: "localisation" });
  } else if (input.view === "lac" || input.view === "panoramique") {
    strengths.push({ label: `Vue ${input.view === "lac" ? "lac / mer" : "panoramique / montagne"} — fort atout en Haute-Savoie`, type: "strength", category: "localisation" });
  }

  // ── CONTRAINTES DU BIEN (nouveaux malus) ─────────────────────────────────
  if (input.hasBruit) {
    weaknesses.push({ label: "Nuisances sonores (route / voie ferrée)", type: "weakness", category: "localisation" });
  }
  if (input.hasCopropDegradee) {
    weaknesses.push({ label: "Copropriété dégradée — risque de charges et dépréciation", type: "weakness", category: "etat" });
  }
  if (input.hasExpositionNord) {
    weaknesses.push({ label: "Exposition Nord — luminosité naturelle limitée", type: "weakness", category: "localisation" });
  }
  if (input.hasRDCSansExterieur) {
    weaknesses.push({ label: "RDC sans extérieur privatif — absence de jardin ou terrasse", type: "weakness", category: "localisation" });
  }

  return { strengths, weaknesses };
}
