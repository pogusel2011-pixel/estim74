import { describe, it, expect } from "vitest";
import { computeAdjustments, applyAdjustments } from "@/lib/valuation/adjustments";
import type { PropertyInput } from "@/types/property";
import type { AmenityResult } from "@/lib/geo/amenities";

function makeProperty(overrides: Partial<PropertyInput> = {}): PropertyInput {
  return {
    propertyType: "APARTMENT",
    surface: 70,
    condition: "GOOD",
    hasParking: false,
    hasGarage: false,
    hasBalcony: false,
    hasTerrace: false,
    hasCellar: false,
    hasPool: false,
    hasElevator: false,
    ...overrides,
  };
}

describe("computeAdjustments — condition", () => {
  it("EXCELLENT → +5% adjustment", () => {
    const adjs = computeAdjustments(makeProperty({ condition: "EXCELLENT" }));
    const condAdj = adjs.find((a) => a.category === "condition");
    expect(condAdj?.factor).toBe(0.05);
  });

  it("GOOD → no condition adjustment", () => {
    const adjs = computeAdjustments(makeProperty({ condition: "GOOD" }));
    expect(adjs.find((a) => a.category === "condition")).toBeUndefined();
  });

  it("AVERAGE → -4% adjustment", () => {
    const adjs = computeAdjustments(makeProperty({ condition: "AVERAGE" }));
    const condAdj = adjs.find((a) => a.category === "condition");
    expect(condAdj?.factor).toBe(-0.04);
  });

  it("TO_RENOVATE → -10% adjustment", () => {
    const adjs = computeAdjustments(makeProperty({ condition: "TO_RENOVATE" }));
    const condAdj = adjs.find((a) => a.category === "condition");
    expect(condAdj?.factor).toBe(-0.10);
  });
});

describe("computeAdjustments — floor (apartments)", () => {
  it("RDC (floor=0) → -4% adjustment", () => {
    const adjs = computeAdjustments(makeProperty({
      propertyType: "APARTMENT",
      floor: 0,
      totalFloors: 5,
    }));
    const floorAdj = adjs.find((a) => a.category === "floor");
    expect(floorAdj?.factor).toBe(-0.04);
  });

  it("High floor without elevator → -6.5%", () => {
    const adjs = computeAdjustments(makeProperty({
      propertyType: "APARTMENT",
      floor: 4,
      totalFloors: 5,
      hasElevator: false,
    }));
    const floorAdj = adjs.find((a) => a.category === "floor");
    expect(floorAdj?.factor).toBe(-0.065);
  });

  it("High floor with elevator → +1%", () => {
    const adjs = computeAdjustments(makeProperty({
      propertyType: "APARTMENT",
      floor: 4,
      totalFloors: 5,
      hasElevator: true,
    }));
    const floorAdj = adjs.find((a) => a.category === "floor");
    expect(floorAdj?.factor).toBe(0.01);
  });

  it("No floor adjustment for houses", () => {
    const adjs = computeAdjustments(makeProperty({
      propertyType: "HOUSE",
      floor: 0,
      totalFloors: 2,
    }));
    expect(adjs.find((a) => a.category === "floor")).toBeUndefined();
  });
});

describe("computeAdjustments — features", () => {
  it("balcony → +2%", () => {
    const adjs = computeAdjustments(makeProperty({ hasBalcony: true }));
    expect(adjs.find((a) => a.label === "Balcon")?.factor).toBe(0.02);
  });

  it("terrace → +3%", () => {
    const adjs = computeAdjustments(makeProperty({ hasTerrace: true }));
    expect(adjs.find((a) => a.label === "Terrasse")?.factor).toBe(0.03);
  });

  it("pool → +4%", () => {
    const adjs = computeAdjustments(makeProperty({ hasPool: true }));
    expect(adjs.find((a) => a.label === "Piscine")?.factor).toBe(0.04);
  });

  it("garage for apartment → +5%", () => {
    const adjs = computeAdjustments(makeProperty({
      propertyType: "APARTMENT",
      hasGarage: true,
    }));
    expect(adjs.find((a) => a.label === "Garage")?.factor).toBe(0.05);
  });

  it("garage for house → +3%", () => {
    const adjs = computeAdjustments(makeProperty({
      propertyType: "HOUSE",
      hasGarage: true,
    }));
    expect(adjs.find((a) => a.label === "Garage")?.factor).toBe(0.03);
  });

  it("apartment with both parking and garage → only garage (+5%)", () => {
    const adjs = computeAdjustments(makeProperty({
      propertyType: "APARTMENT",
      hasParking: true,
      hasGarage: true,
    }));
    expect(adjs.find((a) => a.label === "Garage (inclut parking)")?.factor).toBe(0.05);
    expect(adjs.find((a) => a.label === "Parking")).toBeUndefined();
  });
});

describe("computeAdjustments — constraints", () => {
  it("hasBruit → -3%", () => {
    const adjs = computeAdjustments(makeProperty({ hasBruit: true }));
    const adj = adjs.find((a) => a.category === "contrainte" && a.factor === -0.03);
    expect(adj).toBeDefined();
  });

  it("hasCopropDegradee → -5%", () => {
    const adjs = computeAdjustments(makeProperty({ hasCopropDegradee: true }));
    const adj = adjs.find((a) => a.factor === -0.05);
    expect(adj).toBeDefined();
  });
});

describe("computeAdjustments — amenity proximity", () => {
  it("lake at 300m → +8%", () => {
    const amenities: AmenityResult[] = [{ category: "lake", label: "Lac d'Annecy", distanceM: 300 }];
    const adjs = computeAdjustments(makeProperty(), amenities);
    const lakAdj = adjs.find((a) => a.category === "proximity" && a.factor === 0.08);
    expect(lakAdj).toBeDefined();
  });

  it("lake at 1500m → +3%", () => {
    const amenities: AmenityResult[] = [{ category: "lake", label: "Lac", distanceM: 1500 }];
    const adjs = computeAdjustments(makeProperty(), amenities);
    const lakAdj = adjs.find((a) => a.category === "proximity" && a.factor === 0.03);
    expect(lakAdj).toBeDefined();
  });

  it("lake at 2500m → no lake adjustment", () => {
    const amenities: AmenityResult[] = [{ category: "lake", label: "Lac", distanceM: 2500 }];
    const adjs = computeAdjustments(makeProperty(), amenities);
    expect(adjs.find((a) => a.category === "proximity")).toBeUndefined();
  });

  it("motorway at 400m → -3%", () => {
    const amenities: AmenityResult[] = [{ category: "motorway", label: "A41", distanceM: 400 }];
    const adjs = computeAdjustments(makeProperty(), amenities);
    const mwAdj = adjs.find((a) => a.factor === -0.03);
    expect(mwAdj).toBeDefined();
  });

  it("ski at 3km → +5%", () => {
    const amenities: AmenityResult[] = [{ category: "ski", label: "La Clusaz", distanceM: 3000 }];
    const adjs = computeAdjustments(makeProperty(), amenities);
    const skiAdj = adjs.find((a) => a.factor === 0.05);
    expect(skiAdj).toBeDefined();
  });

  it("deduplicates amenities by category — uses closest", () => {
    const amenities: AmenityResult[] = [
      { category: "lake", label: "Lac A", distanceM: 1800 }, // 3% bonus
      { category: "lake", label: "Lac B", distanceM: 300 },  // 8% bonus — closer, wins
    ];
    const adjs = computeAdjustments(makeProperty(), amenities);
    const lakeAdjs = adjs.filter((a) => a.category === "proximity");
    expect(lakeAdjs).toHaveLength(1);
    expect(lakeAdjs[0].factor).toBe(0.08); // closest wins
  });
});

describe("applyAdjustments", () => {
  it("applies adjustments correctly within cap", () => {
    const basePsm = 5000;
    const adjustments = [
      { label: "Condition", factor: 0.05, impact: 0.05, category: "condition" },
    ];
    const result = applyAdjustments(basePsm, adjustments);
    expect(result).toBe(Math.round(5000 * 1.05)); // 5250
  });

  it("caps total adjustments at +20%", () => {
    const basePsm = 5000;
    const adjustments = [
      { label: "A", factor: 0.10, impact: 0.10, category: "features" },
      { label: "B", factor: 0.10, impact: 0.10, category: "features" },
      { label: "C", factor: 0.10, impact: 0.10, category: "features" }, // total 0.30 → capped 0.20
    ];
    const result = applyAdjustments(basePsm, adjustments);
    expect(result).toBe(Math.round(5000 * 1.20)); // 6000
  });

  it("caps total adjustments at -20%", () => {
    const basePsm = 5000;
    const adjustments = [
      { label: "A", factor: -0.15, impact: -0.15, category: "condition" },
      { label: "B", factor: -0.10, impact: -0.10, category: "floor" }, // total -0.25 → capped -0.20
    ];
    const result = applyAdjustments(basePsm, adjustments);
    expect(result).toBe(Math.round(5000 * 0.80)); // 4000
  });

  it("returns rounded integer", () => {
    const result = applyAdjustments(4999, [
      { label: "Test", factor: 0.031, impact: 0.031, category: "features" },
    ]);
    expect(Number.isInteger(result)).toBe(true);
  });
});
