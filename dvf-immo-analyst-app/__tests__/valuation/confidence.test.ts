import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { computeConfidence } from "@/lib/valuation/confidence";
import type { DVFStats, DVFComparable } from "@/types/dvf";

// Fix time for deterministic freshness scores
const FIXED_NOW = new Date("2025-01-01T00:00:00Z").getTime();
beforeAll(() => vi.setSystemTime(FIXED_NOW));
afterAll(() => vi.useRealTimers());

function makeStats(overrides: Partial<DVFStats> = {}): DVFStats {
  return {
    count: 10,
    medianPsm: 4500,
    meanPsm: 4600,
    minPsm: 3200,
    maxPsm: 6000,
    p25Psm: 4000,
    p75Psm: 5200,
    stdPsm: 500,
    periodMonths: 24,
    oldestDate: "2022-01-01",
    newestDate: "2024-12-01",
    source: "csv",
    isIndexed: true,
    ...overrides,
  };
}

function makeComparable(overrides: Partial<DVFComparable> = {}): DVFComparable {
  return {
    id: `c-${Math.random().toString(36).slice(2)}`,
    date: "2024-09-01",
    address: "10 RUE DE LA PAIX",
    city: "Annecy",
    type: "Appartement",
    surface: 70,
    price: 315000,
    pricePsm: 4500,
    distanceM: 200,
    ...overrides,
  };
}

describe("computeConfidence — null dvfStats", () => {
  it("returns score 0.08 and label 'Insuffisant' when dvfStats is null", () => {
    const result = computeConfidence(null);
    expect(result.score).toBe(0.08);
    expect(result.label).toBe("Insuffisant");
    expect(result.factors.total).toBe(0);
  });

  it("returns score 0.08 when dvfStats is undefined", () => {
    const result = computeConfidence(undefined);
    expect(result.score).toBe(0.08);
  });
});

describe("computeConfidence — density", () => {
  it("gives max density score (30 pts) for high count", () => {
    const stats = makeStats({ count: 20 });
    const { factors } = computeConfidence(stats);
    expect(factors.density).toBe(30);
  });

  it("gives 0 density points for very few samples", () => {
    const stats = makeStats({ count: 1 });
    const { factors } = computeConfidence(stats);
    expect(factors.density).toBe(0);
  });
});

describe("computeConfidence — freshness", () => {
  it("gives max freshness (25 pts) for comparables within last year", () => {
    const stats = makeStats();
    const comparables = [
      makeComparable({ date: "2024-10-01" }), // ~3 months ago
      makeComparable({ date: "2024-11-01" }),
    ];
    const { factors } = computeConfidence(stats, 70, comparables);
    expect(factors.freshness).toBe(25);
  });

  it("gives min freshness for very old comparables", () => {
    const stats = makeStats();
    const comparables = [
      makeComparable({ date: "2018-01-01" }),
      makeComparable({ date: "2019-01-01" }),
    ];
    const { factors } = computeConfidence(stats, 70, comparables);
    expect(factors.freshness).toBe(5);
  });
});

describe("computeConfidence — proximity", () => {
  it("gives max proximity (25 pts) for very close comparables", () => {
    const stats = makeStats();
    const comparables = [
      makeComparable({ distanceM: 100 }),
      makeComparable({ distanceM: 150 }),
    ];
    const { factors } = computeConfidence(stats, 70, comparables);
    expect(factors.proximity).toBe(25);
  });

  it("gives neutral proximity (8 pts) when no distance info", () => {
    const stats = makeStats();
    const { factors } = computeConfidence(stats);
    expect(factors.proximity).toBe(8);
  });
});

describe("computeConfidence — homogeneity", () => {
  it("gives max homogeneity (20 pts) for low CV", () => {
    // Low CV: stdPsm << medianPsm
    const stats = makeStats({ stdPsm: 100, fsd: 100, medianPsm: 4500 }); // CV ≈ 0.022
    const { factors } = computeConfidence(stats);
    expect(factors.homogeneity).toBe(20);
  });

  it("gives 0 homogeneity for very high CV", () => {
    // High CV: stdPsm >> medianPsm
    const stats = makeStats({ stdPsm: 4000, fsd: 4000, medianPsm: 4500 }); // CV ≈ 0.89
    const { factors } = computeConfidence(stats);
    expect(factors.homogeneity).toBe(0);
  });
});

describe("computeConfidence — labels", () => {
  it("returns 'Très bonne' for high-quality data", () => {
    const stats = makeStats({ count: 20, stdPsm: 100, fsd: 100, medianPsm: 4500 });
    const comparables = Array.from({ length: 15 }, () =>
      makeComparable({ date: "2024-10-01", distanceM: 100 })
    );
    const { label } = computeConfidence(stats, 70, comparables);
    expect(label).toBe("Très bonne");
  });

  it("returns 'Insuffisant' for null stats", () => {
    const { label } = computeConfidence(null);
    expect(label).toBe("Insuffisant");
  });

  it("score is between 0 and 1", () => {
    const stats = makeStats();
    const { score } = computeConfidence(stats);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("factors.total equals sum of all four factors", () => {
    const stats = makeStats();
    const { factors } = computeConfidence(stats);
    expect(factors.total).toBe(
      factors.density + factors.freshness + factors.proximity + factors.homogeneity
    );
  });
});
