import { describe, it, expect } from "vitest";
import { computeDVFStats } from "@/lib/dvf/stats";
import type { DVFMutation } from "@/types/dvf";

function makeMutation(overrides: Partial<DVFMutation> = {}): DVFMutation {
  return {
    id_mutation: `mut-${Math.random().toString(36).slice(2)}`,
    date_mutation: "2024-01-01",
    nature_mutation: "Vente",
    valeur_fonciere: 300000,
    nom_commune: "Annecy",
    code_commune: "74010",
    code_departement: "74",
    prix_m2: 4000,
    surface_reelle_bati: 75,
    ...overrides,
  };
}

describe("computeDVFStats", () => {
  it("returns null for empty array", () => {
    expect(computeDVFStats([])).toBeNull();
  });

  it("returns null when no mutations have valid prix_m2", () => {
    const mutations = [
      makeMutation({ prix_m2: undefined }),
      makeMutation({ prix_m2: 0 }),
    ];
    expect(computeDVFStats(mutations)).toBeNull();
  });

  it("returns correct count for valid mutations", () => {
    const mutations = [
      makeMutation({ prix_m2: 3000 }),
      makeMutation({ prix_m2: 4000 }),
      makeMutation({ prix_m2: 5000 }),
    ];
    const stats = computeDVFStats(mutations);
    expect(stats?.count).toBe(3);
  });

  it("computes correct median for 3 items (indexed)", () => {
    // All same year (2025 = index 126/126 = 1, no change)
    const mutations = [
      makeMutation({ prix_m2: 3000, date_mutation: "2025-01-01" }),
      makeMutation({ prix_m2: 4000, date_mutation: "2025-01-01" }),
      makeMutation({ prix_m2: 5000, date_mutation: "2025-01-01" }),
    ];
    const stats = computeDVFStats(mutations);
    expect(stats?.medianPsm).toBe(4000);
  });

  it("sets isIndexed to true", () => {
    const mutations = [makeMutation()];
    const stats = computeDVFStats(mutations);
    expect(stats?.isIndexed).toBe(true);
  });

  it("computes weightedAvgPsm when subjectSurface is provided", () => {
    const mutations = [
      makeMutation({ prix_m2: 4000, surface_reelle_bati: 70 }),
      makeMutation({ prix_m2: 5000, surface_reelle_bati: 70 }),
      makeMutation({ prix_m2: 4500, surface_reelle_bati: 70 }),
    ];
    const stats = computeDVFStats(mutations, 70);
    expect(stats?.weightedAvgPsm).toBeDefined();
    expect(stats?.weightedAvgPsm).toBeGreaterThan(0);
  });

  it("does not compute weightedAvgPsm without subjectSurface", () => {
    const mutations = [
      makeMutation({ prix_m2: 4000 }),
      makeMutation({ prix_m2: 5000 }),
    ];
    const stats = computeDVFStats(mutations);
    expect(stats?.weightedAvgPsm).toBeUndefined();
  });

  it("sets source to 'csv'", () => {
    const mutations = [makeMutation()];
    const stats = computeDVFStats(mutations);
    expect(stats?.source).toBe("csv");
  });

  it("computes period months between oldest and newest date", () => {
    const mutations = [
      makeMutation({ date_mutation: "2023-01-01", prix_m2: 4000 }),
      makeMutation({ date_mutation: "2024-01-01", prix_m2: 4000 }),
    ];
    const stats = computeDVFStats(mutations);
    expect(stats?.oldestDate).toBe("2023-01-01");
    expect(stats?.newestDate).toBe("2024-01-01");
    expect(stats?.periodMonths).toBeCloseTo(12, 0);
  });

  it("p25Psm <= medianPsm <= p75Psm", () => {
    const mutations = Array.from({ length: 10 }, (_, i) =>
      makeMutation({ prix_m2: 3000 + i * 200, date_mutation: "2025-01-01" })
    );
    const stats = computeDVFStats(mutations);
    expect(stats!.p25Psm).toBeLessThanOrEqual(stats!.medianPsm);
    expect(stats!.medianPsm).toBeLessThanOrEqual(stats!.p75Psm);
  });

  it("minPsm <= medianPsm <= maxPsm", () => {
    const mutations = [
      makeMutation({ prix_m2: 2000, date_mutation: "2025-01-01" }),
      makeMutation({ prix_m2: 4000, date_mutation: "2025-01-01" }),
      makeMutation({ prix_m2: 6000, date_mutation: "2025-01-01" }),
    ];
    const stats = computeDVFStats(mutations);
    expect(stats!.minPsm).toBeLessThanOrEqual(stats!.medianPsm);
    expect(stats!.medianPsm).toBeLessThanOrEqual(stats!.maxPsm);
  });
});
