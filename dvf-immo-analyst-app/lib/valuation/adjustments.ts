import { PropertyInput } from "@/types/property";
import { Adjustment } from "@/types/valuation";
import { getDpeAdjustment } from "@/lib/mapping/energy";
import { clamp } from "@/lib/utils";

export function computeAdjustments(property: PropertyInput): Adjustment[] {
  const adjustments: Adjustment[] = [];

  // Condition
  const conditionFactors = { TO_RENOVATE: -0.15, AVERAGE: 0, GOOD: 0.05, EXCELLENT: 0.12 };
  const conditionFactor = conditionFactors[property.condition] ?? 0;
  if (conditionFactor !== 0) {
    adjustments.push({ label: "État du bien", factor: conditionFactor, impact: conditionFactor, category: "condition" });
  }

  // DPE
  const dpeFactor = getDpeAdjustment(property.dpeLetter);
  if (dpeFactor !== 0) {
    adjustments.push({ label: "Diagnostic énergétique (DPE " + property.dpeLetter + ")", factor: dpeFactor, impact: dpeFactor, category: "energy" });
  }

  // Étage (appartements)
  if (property.propertyType === "APARTMENT" && property.floor != null && property.totalFloors != null) {
    const floorRatio = property.floor / property.totalFloors;
    let floorFactor = 0;
    if (property.floor === 0) floorFactor = -0.04;
    else if (floorRatio >= 0.7) floorFactor = 0.03;
    else if (floorRatio >= 0.4) floorFactor = 0.01;
    if (floorFactor !== 0) {
      adjustments.push({ label: "Étage (" + property.floor + "/" + property.totalFloors + ")", factor: floorFactor, impact: floorFactor, category: "floor" });
    }
  }

  // Options
  if (property.hasParking) adjustments.push({ label: "Parking", factor: 0.02, impact: 0.02, category: "features" });
  if (property.hasGarage) adjustments.push({ label: "Garage", factor: 0.03, impact: 0.03, category: "features" });
  if (property.hasPool) adjustments.push({ label: "Piscine", factor: 0.05, impact: 0.05, category: "features" });
  if (property.hasTerrace) adjustments.push({ label: "Terrasse", factor: 0.025, impact: 0.025, category: "features" });
  if (property.hasBalcony) adjustments.push({ label: "Balcon", factor: 0.015, impact: 0.015, category: "features" });
  if (property.hasCellar) adjustments.push({ label: "Cave", factor: 0.01, impact: 0.01, category: "features" });

  // Orientation
  const orientFactors: Record<string, number> = { S: 0.03, SE: 0.025, SO: 0.025, E: 0.01, O: 0.01, N: -0.02, NE: -0.01, NO: -0.01 };
  if (property.orientation && orientFactors[property.orientation]) {
    adjustments.push({ label: "Orientation " + property.orientation, factor: orientFactors[property.orientation], impact: orientFactors[property.orientation], category: "orientation" });
  }

  // Vue
  const viewFactors: Record<string, number> = { lac: 0.12, montagne: 0.07, degagee: 0.04, jardin: 0.02, cour: -0.01, rue: 0 };
  if (property.view && viewFactors[property.view] != null && viewFactors[property.view] !== 0) {
    adjustments.push({ label: "Vue (" + property.view + ")", factor: viewFactors[property.view], impact: viewFactors[property.view], category: "view" });
  }

  return adjustments;
}

export function applyAdjustments(basePsm: number, adjustments: Adjustment[]): number {
  const totalFactor = adjustments.reduce((sum, adj) => sum + adj.factor, 0);
  const clamped = clamp(totalFactor, -0.4, 0.4);
  return Math.round(basePsm * (1 + clamped));
}
