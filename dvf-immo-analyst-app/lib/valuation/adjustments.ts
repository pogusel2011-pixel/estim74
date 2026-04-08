import { PropertyInput } from "@/types/property";
import { Adjustment } from "@/types/valuation";
import { AmenityResult } from "@/lib/geo/amenities";
import { getDpeAdjustment } from "@/lib/mapping/energy";
import { clamp } from "@/lib/utils";
import { BUSINESS_RULES } from "@/lib/rules/business-rules";

/**
 * Calcule les ajustements qualitatifs selon la grille spec Estim74.
 *
 * État :            Refait neuf +5% | Bon état 0% | Rafraîchissement -4% | Travaux lourds -10%
 * DPE :             A/B +2% | C/D 0% | E -3% | F -6% | G -7%
 * Garage :          Appartement +5% | Maison +3%
 * Balcon :          +2% | Terrasse +3%
 * Jardin/Terrain :  Maison <100m² -3% | 100-500m² +1% | 500-1000m² +2% | 1000-2000m² +3% | 2000-5000m² +5% | >5000m² +7%
 * Piscine :         +4%
 * Vue :             lac +5% | panoramique/montagne +3% | dégagée +1.5% | standard 0% | vis-à-vis -2% | route/parking -2% | voie ferrée -3%
 * Étage appt :      RDC -4% | Élevé sans ascenseur -6.5% | Élevé avec ascenseur +1%
 * Bruit :           -3% | Copropriété dégradée -5% | Exposition Nord -2% | RDC sans extérieur -2%
 * Autoroute :       ≤500m -3% | 500m-2km 0% (neutre)
 * Plafond :         ±20% (dans applyAdjustments)
 */
/** Formats a distance in meters as a human-readable French string. */
function fDist(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

export function computeAdjustments(property: PropertyInput, amenities?: AmenityResult[]): Adjustment[] {
  const adjustments: Adjustment[] = [];

  // ── 1. ÉTAT / CONDITION ──────────────────────────────────────────────────
  // Refait neuf +4-6% → +5% | Bon état 0% | Rafraîchissement -3/-5% → -4% | Travaux -8/-12% → -10%
  const conditionFactors: Record<string, number> = {
    EXCELLENT: 0.05,
    GOOD: 0.00,
    AVERAGE: -0.04,
    TO_RENOVATE: -0.10,
  };
  const conditionFactor = conditionFactors[property.condition] ?? 0;
  if (conditionFactor !== 0) {
    adjustments.push({
      label: "État du bien",
      factor: conditionFactor,
      impact: conditionFactor,
      category: "condition",
    });
  }

  // ── 2. DPE ───────────────────────────────────────────────────────────────
  // A/B +1-3% → +2% | C/D 0% | E -2/-4% → -3% | F -5/-8% → -6% | G -5/-8% → -7%
  const dpeFactor = getDpeAdjustment(property.dpeLetter);
  if (dpeFactor !== 0) {
    adjustments.push({
      label: `Diagnostic énergétique (DPE ${property.dpeLetter})`,
      factor: dpeFactor,
      impact: dpeFactor,
      category: "energy",
    });
  }

  // ── 3. ÉTAGE (APPARTEMENTS — CRITIQUE) ───────────────────────────────────
  // RDC -3/-5% → -4%
  // Étage élevé (ratio ≥ 70%) SANS ascenseur -5/-8% → -6.5%
  // Étage élevé AVEC ascenseur 0/+2% → +1%
  // Étage intermédiaire (ratio 40-70%) → +1%
  // Maison : étage sans impact autonome
  if (
    property.propertyType === "APARTMENT" &&
    property.floor != null &&
    property.totalFloors != null &&
    property.totalFloors > 0
  ) {
    // F3 : si floor=1 et totalFloors=1 (immeuble mono-étage), ratio 0.5 neutre
    const floorRatio =
      property.floor === 1 && property.totalFloors === 1
        ? 0.5
        : property.floor / property.totalFloors;
    let floorFactor = 0;
    let floorLabel = "";

    if (property.floor === 0) {
      floorFactor = -0.04;
      floorLabel = `RDC (décote prudente)`;
    } else if (floorRatio >= 0.7) {
      if (property.hasElevator) {
        floorFactor = 0.01;
        floorLabel = `Étage élevé (${property.floor}/${property.totalFloors}) avec ascenseur`;
      } else {
        floorFactor = -0.065;
        floorLabel = `Étage élevé (${property.floor}/${property.totalFloors}) sans ascenseur`;
      }
    } else if (floorRatio >= 0.4) {
      floorFactor = 0.01;
      floorLabel = `Étage intermédiaire (${property.floor}/${property.totalFloors})`;
    }

    if (floorFactor !== 0) {
      adjustments.push({
        label: floorLabel,
        factor: floorFactor,
        impact: floorFactor,
        category: "floor",
      });
    }
  }

  // ── 4. PARKING / GARAGE ──────────────────────────────────────────────────
  // Parking : +2% | Garage : appartement +5% | maison +3%
  // F2 : pour un appartement avec les deux, seul le plus avantageux est retenu
  // (parking et garage désignent souvent le même emplacement — évite le double comptage).
  if (property.propertyType === "APARTMENT" && property.hasParking && property.hasGarage) {
    adjustments.push({ label: "Garage (inclut parking)", factor: 0.05, impact: 0.05, category: "features" });
  } else {
    if (property.hasParking) {
      adjustments.push({ label: "Parking", factor: 0.02, impact: 0.02, category: "features" });
    }
    if (property.hasGarage) {
      const garageFactor = property.propertyType === "APARTMENT" ? 0.05 : 0.03;
      adjustments.push({ label: "Garage", factor: garageFactor, impact: garageFactor, category: "features" });
    }
  }

  // ── 5. BALCON / TERRASSE ─────────────────────────────────────────────────
  // Balcon +2-4% → +2% | Terrasse +2-4% → +3%
  if (property.hasBalcony) {
    adjustments.push({ label: "Balcon", factor: 0.02, impact: 0.02, category: "features" });
  }
  if (property.hasTerrace) {
    adjustments.push({ label: "Terrasse", factor: 0.03, impact: 0.03, category: "features" });
  }

  // ── 6. JARDIN / TERRAIN ──────────────────────────────────────────────────
  // 6 paliers selon surface (maison : décote si < 100 m²)
  if (property.landSurface != null && property.landSurface > 0) {
    let jardinFactor = 0;
    const s = property.landSurface;
    if (property.propertyType === "HOUSE" && s < 100) {
      jardinFactor = -0.03;
    } else if (s < 500) {
      jardinFactor = 0.01;
    } else if (s < 1000) {
      jardinFactor = 0.02;
    } else if (s < 2000) {
      jardinFactor = 0.03;
    } else if (s < 5000) {
      jardinFactor = 0.05;
    } else {
      jardinFactor = 0.07;
    }

    const jardinLabel =
      property.propertyType === "HOUSE"
        ? `Jardin/terrain (${Math.round(s)} m²)`
        : `Terrain (${Math.round(s)} m²)`;

    if (jardinFactor !== 0) {
      adjustments.push({ label: jardinLabel, factor: jardinFactor, impact: jardinFactor, category: "features" });
    }
  }

  // ── 7. PISCINE ───────────────────────────────────────────────────────────
  // +4%
  if (property.hasPool) {
    adjustments.push({ label: "Piscine", factor: 0.04, impact: 0.04, category: "features" });
  }

  // ── 8. CAVE ──────────────────────────────────────────────────────────────
  if (property.hasCellar) {
    adjustments.push({ label: "Cave", factor: 0.01, impact: 0.01, category: "features" });
  }

  // ── 9. ORIENTATION ───────────────────────────────────────────────────────
  const orientFactors: Record<string, number> = {
    S: 0.03, SE: 0.025, SO: 0.025, E: 0.01, O: 0.01, N: -0.02, NE: -0.01, NO: -0.01,
  };
  const orientFactor = property.orientation ? (orientFactors[property.orientation] ?? 0) : 0;
  if (orientFactor !== 0) {
    adjustments.push({
      label: `Orientation ${property.orientation}`,
      factor: orientFactor,
      impact: orientFactor,
      category: "orientation",
    });
  }

  // ── 10. MITOYENNETÉ (MAISONS) ────────────────────────────────────────────
  // individuelle: référence 0% | mitoyenne_un_cote: -4% | mitoyenne_deux_cotes: -7%
  if (property.propertyType === "HOUSE" && property.mitoyennete) {
    const mitoyenneFactors: Record<string, number> = {
      individuelle:          0.00,
      mitoyenne_un_cote:    -0.04,
      mitoyenne_deux_cotes: -0.07,
    };
    const mitoyenneLabels: Record<string, string> = {
      individuelle:          "Maison individuelle",
      mitoyenne_un_cote:    "Mitoyenne d'un côté",
      mitoyenne_deux_cotes: "Mitoyenne des deux côtés",
    };
    const mf = mitoyenneFactors[property.mitoyennete] ?? 0;
    console.log(`[estimate] mitoyennete: ${property.mitoyennete} → ${mf !== 0 ? (mf * 100).toFixed(0) + "%" : "0% (individuelle, pas d'ajustement)"}`);
    if (mf !== 0) {
      adjustments.push({
        label: mitoyenneLabels[property.mitoyennete] ?? property.mitoyennete,
        factor: mf,
        impact: mf,
        category: "mitoyennete",
      });
    }
  }

  // ── 11bis. CONTRAINTES DU BIEN (nouveaux malus qualitatifs) ──────────────
  if (property.hasBruit) {
    adjustments.push({ label: "Nuisances sonores (route / voie ferrée)", factor: -0.03, impact: -0.03, category: "contrainte" });
  }
  if (property.hasCopropDegradee) {
    adjustments.push({ label: "Copropriété dégradée", factor: -0.05, impact: -0.05, category: "contrainte" });
  }
  if (property.hasExpositionNord) {
    adjustments.push({ label: "Exposition Nord défavorable", factor: -0.02, impact: -0.02, category: "contrainte" });
  }
  if (property.hasRDCSansExterieur) {
    adjustments.push({ label: "RDC sans extérieur privatif", factor: -0.02, impact: -0.02, category: "contrainte" });
  }

  // ── 11 (ancien 10). VUE ───────────────────────────────────────────────────
  // 7 types : lac +5% | panoramique/montagne +3% | dégagée +1.5% | standard 0%
  //           vis-à-vis -2% | route/parking -2% | voie ferrée -3%
  const viewFactors: Record<string, number> = {
    lac:           0.05,
    panoramique:   0.03,
    degagee:       0.015,
    standard:      0,
    vis_a_vis:    -0.02,
    route_parking: -0.02,
    voie_ferree:  -0.03,
    // rétrocompat anciennes valeurs
    montagne:      0.03,
    jardin:        0.01,
    cour:         -0.01,
    rue:           0,
  };
  const viewLabels: Record<string, string> = {
    lac:           "Vue lac / mer",
    panoramique:   "Vue panoramique / montagne",
    degagee:       "Vue dégagée",
    standard:      "Vue standard",
    vis_a_vis:    "Vue sur vis-à-vis",
    route_parking: "Vue sur route / parking",
    voie_ferree:  "Vue sur voie ferrée",
    montagne:      "Vue montagne",
    jardin:        "Vue sur jardin",
    cour:          "Vue sur cour",
    rue:           "Vue sur rue",
  };
  const viewFactor =
    property.view && viewFactors[property.view] != null ? viewFactors[property.view] : 0;
  if (viewFactor !== 0) {
    adjustments.push({
      label: viewLabels[property.view!] ?? `Vue (${property.view})`,
      factor: viewFactor,
      impact: viewFactor,
      category: "view",
    });
  }

  // ── 11. PROXIMITÉ ÉQUIPEMENTS (Haute-Savoie) ──────────────────────────────
  // Lake ≤500m: +8% | 500m–2km: +3%
  // Ski ≤5km: +5%
  // Motorway ≤500m: -3% (nuisance) | 500m–2km: +2%
  // School ≤500m: +1.5%
  // Shop ≤1km: +0.5%
  // Train ≤1km: +1% | 1km–3km: +0.5%
  if (amenities && amenities.length > 0) {
    // F4 : dédoublonnage par catégorie — seul l'équipement le plus proche est retenu
    // pour éviter l'empilement de bonus si Overpass retourne plusieurs POI du même type.
    const closestByCategory = new Map<string, AmenityResult>();
    for (const am of amenities) {
      const existing = closestByCategory.get(am.category);
      if (!existing || am.distanceM < existing.distanceM) {
        closestByCategory.set(am.category, am);
      }
    }
    for (const am of Array.from(closestByCategory.values())) {
      const d = am.distanceM;
      let factor = 0;
      let label = "";

      if (am.category === "lake") {
        if (d <= 500) {
          factor = 0.08;
          label = `Lac à ${fDist(d)} (accès direct)`;
        } else if (d <= 2000) {
          factor = 0.03;
          label = `Lac à ${fDist(d)}`;
        }
      } else if (am.category === "river") {
        // Rivière : cadre naturel recherché en Haute-Savoie
        if (d <= 200) {
          factor = 0.02;
          label = `Rivière à ${fDist(d)}`;
        } else if (d <= 1000) {
          factor = 0.015;
          label = `Rivière à ${fDist(d)}`;
        }
      } else if (am.category === "ski") {
        if (d <= 5000) {
          factor = 0.05;
          label = `Station ski à ${fDist(d)}`;
        }
      } else if (am.category === "motorway") {
        if (d <= 500) {
          factor = -0.03;
          label = `Autoroute à ${fDist(d)} (nuisance sonore)`;
        }
        // ≤2km : neutre (0%) — accès pratique mais sans bonus valorisant
      } else if (am.category === "school") {
        if (d <= 500) {
          factor = 0.015;
          label = `École à ${fDist(d)}`;
        }
      } else if (am.category === "shop") {
        if (d <= 1000) {
          factor = 0.005;
          label = `Commerces à ${fDist(d)}`;
        }
      } else if (am.category === "train") {
        if (d <= 1000) {
          factor = 0.01;
          label = `Gare à ${fDist(d)}`;
        } else if (d <= 3000) {
          factor = 0.005;
          label = `Gare à ${fDist(d)}`;
        }
      }

      if (factor !== 0) {
        adjustments.push({ label, factor, impact: factor, category: "proximity" });
      }
    }
  }

  return adjustments;
}

/**
 * Applique les ajustements au prix/m² de base.
 * Plafond global : ±20% (spec Estim74).
 * Logge le brut calculé et le retenu après plafond.
 */
export function applyAdjustments(basePsm: number, adjustments: Adjustment[]): number {
  const totalFactor = adjustments.reduce((sum, adj) => sum + adj.factor, 0);
  const brutPct = (totalFactor * 100).toFixed(2);

  const cap = BUSINESS_RULES.QUALITATIVE_CAP.value;
  const clamped = clamp(totalFactor, -cap, cap);
  const retenuPct = (clamped * 100).toFixed(2);

  if (Math.abs(totalFactor - clamped) > 0.0001) {
    console.log(
      `[Valuation] Ajustement brut calculé: ${brutPct}% → plafond ±20% appliqué → ajustement retenu: ${retenuPct}%`
    );
  } else {
    console.log(
      `[Valuation] Ajustement brut calculé: ${brutPct}% → dans les limites → ajustement retenu: ${retenuPct}%`
    );
  }

  return Math.round(basePsm * (1 + clamped));
}
