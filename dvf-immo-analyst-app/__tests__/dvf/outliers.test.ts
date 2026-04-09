import { describe, it, expect, vi } from "vitest";
import { markOutliers, removeOutliers, computePrixM2 } from "@/lib/dvf/outliers";
import type { DVFMutation } from "@/types/dvf";

// Suppress console.warn output from outlier detection logs
vi.spyOn(console, "warn").mockImplementation(() => {});

function makeMutation(overrides: Partial<DVFMutation> = {}): DVFMutation {
  return {
    id_mutation: `mut-${Math.random()}`,
    date_mutation: "2023-06-01",
    nature_mutation: "Vente",
    valeur_fonciere: 300000,
    nom_commune: "Annecy",
    code_commune: "74010",
    code_departement: "74",
    prix_m2: 4000,
    ...overrides,
  };
}

describe("computePrixM2", () => {
  it("uses surface_reelle_bati when type_local is set", () => {
    const m = makeMutation({
      type_local: "Appartement",
      surface_reelle_bati: 60,
      surface_terrain: 200,
      valeur_fonciere: 300000,
      prix_m2: undefined,
    });
    const [result] = computePrixM2([m]);
    expect(result.prix_m2).toBe(Math.round(300000 / 60)); // 5000
  });

  it("uses surface_terrain when type_local is not set", () => {
    const m = makeMutation({
      type_local: undefined,
      surface_terrain: 500,
      valeur_fonciere: 100000,
      prix_m2: undefined,
    });
    const [result] = computePrixM2([m]);
    expect(result.prix_m2).toBe(Math.round(100000 / 500)); // 200
  });

  it("falls back to lot1_surface_carrez when surface_reelle_bati is missing", () => {
    const m = makeMutation({
      type_local: "Appartement",
      surface_reelle_bati: undefined,
      lot1_surface_carrez: 50,
      valeur_fonciere: 200000,
      prix_m2: undefined,
    });
    const [result] = computePrixM2([m]);
    expect(result.prix_m2).toBe(Math.round(200000 / 50)); // 4000
  });

  it("does not set prix_m2 when surface is zero", () => {
    const m = makeMutation({
      type_local: "Appartement",
      surface_reelle_bati: 0,
      valeur_fonciere: 200000,
      prix_m2: undefined,
    });
    const [result] = computePrixM2([m]);
    expect(result.prix_m2).toBeUndefined();
  });

  it("does not set prix_m2 when valeur_fonciere is zero", () => {
    const m = makeMutation({
      type_local: "Appartement",
      surface_reelle_bati: 60,
      valeur_fonciere: 0,
      prix_m2: undefined,
    });
    const [result] = computePrixM2([m]);
    expect(result.prix_m2).toBeUndefined();
  });
});

describe("markOutliers", () => {
  it("returns input unchanged when fewer than 4 items", () => {
    const mutations = [
      makeMutation({ prix_m2: 4000 }),
      makeMutation({ prix_m2: 5000 }),
      makeMutation({ prix_m2: 3000 }),
    ];
    const result = markOutliers(mutations);
    expect(result).toHaveLength(3);
    result.forEach((m) => expect(m.outlier).toBeUndefined());
  });

  it("marks extreme high price as outlier via IQR", () => {
    // Q1=3000, Q3=5000, IQR=2000, upper=5000+1.5*2000=8000
    // 50000 >> 8000 → outlier
    const mutations = [
      makeMutation({ prix_m2: 3000 }),
      makeMutation({ prix_m2: 4000 }),
      makeMutation({ prix_m2: 4500 }),
      makeMutation({ prix_m2: 5000 }),
      makeMutation({ prix_m2: 50000 }), // obvious outlier
    ];
    const result = markOutliers(mutations);
    const outliers = result.filter((m) => m.outlier);
    expect(outliers).toHaveLength(1);
    expect(outliers[0].prix_m2).toBe(50000);
    expect(outliers[0].outlierReason).toBe("prix_m2_aberrant");
  });

  it("marks extreme low price as outlier via IQR", () => {
    const mutations = [
      makeMutation({ prix_m2: 200 }), // far below reasonable range
      makeMutation({ prix_m2: 4000 }),
      makeMutation({ prix_m2: 4500 }),
      makeMutation({ prix_m2: 5000 }),
      makeMutation({ prix_m2: 5500 }),
    ];
    const result = markOutliers(mutations);
    const outliers = result.filter((m) => m.outlier);
    expect(outliers).toHaveLength(1);
    expect(outliers[0].prix_m2).toBe(200);
  });

  it("does not flag normal data as outliers", () => {
    const mutations = [
      makeMutation({ prix_m2: 3800 }),
      makeMutation({ prix_m2: 4000 }),
      makeMutation({ prix_m2: 4200 }),
      makeMutation({ prix_m2: 4400 }),
      makeMutation({ prix_m2: 4600 }),
    ];
    const result = markOutliers(mutations);
    result.forEach((m) => {
      expect(m.outlier).toBe(false);
    });
  });

  it("marks items deviating >40% from clean median as outlier in pass 2", () => {
    // Set up 5 normal items + 1 that passes IQR but fails median deviation
    // Normal range ~4000. 7000 is 75% above 4000 → median deviation outlier
    const mutations = [
      makeMutation({ prix_m2: 3800 }),
      makeMutation({ prix_m2: 4000 }),
      makeMutation({ prix_m2: 4100 }),
      makeMutation({ prix_m2: 4200 }),
      makeMutation({ prix_m2: 4300 }),
      makeMutation({ prix_m2: 4400 }),
      makeMutation({ prix_m2: 7000 }), // 75% above median ~4100 → deviation outlier
    ];
    const result = markOutliers(mutations);
    const outliers = result.filter((m) => m.outlier);
    expect(outliers.length).toBeGreaterThanOrEqual(1);
    const highOutlier = outliers.find((m) => m.prix_m2 === 7000);
    expect(highOutlier).toBeDefined();
  });

  it("skips items with missing or zero prix_m2", () => {
    const mutations = [
      makeMutation({ prix_m2: 4000 }),
      makeMutation({ prix_m2: 4200 }),
      makeMutation({ prix_m2: undefined }),
      makeMutation({ prix_m2: 0 }),
      makeMutation({ prix_m2: 4400 }),
    ];
    // Should not throw; undefined/0 are preserved without outlier flag
    const result = markOutliers(mutations);
    expect(result).toHaveLength(5);
    const undefinedItem = result.find((m) => m.prix_m2 === undefined);
    expect(undefinedItem?.outlier).toBeUndefined();
  });
});

describe("removeOutliers", () => {
  it("removes items flagged as outliers", () => {
    const mutations = [
      makeMutation({ prix_m2: 3800 }),
      makeMutation({ prix_m2: 4000 }),
      makeMutation({ prix_m2: 4200 }),
      makeMutation({ prix_m2: 4400 }),
      makeMutation({ prix_m2: 50000 }), // outlier
    ];
    const result = removeOutliers(mutations);
    expect(result.every((m) => !m.outlier)).toBe(true);
    expect(result.find((m) => m.prix_m2 === 50000)).toBeUndefined();
  });
});
