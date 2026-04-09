import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { scoreComparable, toComparables } from "@/lib/dvf/comparables";
import type { DVFMutation } from "@/types/dvf";

// Fix time so recency scores are deterministic
const FIXED_NOW = new Date("2025-01-01T00:00:00Z").getTime();
beforeAll(() => vi.setSystemTime(FIXED_NOW));
afterAll(() => vi.useRealTimers());

function makeMutation(overrides: Partial<DVFMutation> = {}): DVFMutation {
  return {
    id_mutation: `mut-${Math.random().toString(36).slice(2)}`,
    date_mutation: "2024-06-01",
    nature_mutation: "Vente",
    valeur_fonciere: 300000,
    nom_commune: "Annecy",
    code_commune: "74010",
    code_departement: "74",
    surface_reelle_bati: 70,
    nombre_pieces_principales: 3,
    distance_m: 300,
    prix_m2: 4500,
    type_local: "Appartement",
    adresse_numero: "10",
    adresse_nom_voie: "RUE DE LA PAIX",
    ...overrides,
  };
}

describe("scoreComparable", () => {
  it("returns a value between 0 and 1", () => {
    const score = scoreComparable(
      { surface: 70, distanceM: 200, date: "2024-06-01", rooms: 3 },
      { surface: 70, rooms: 3 }
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("scores perfect match (same surface, 0m, recent, same rooms) close to 1", () => {
    const score = scoreComparable(
      { surface: 70, distanceM: 0, date: "2024-12-01", rooms: 3 },
      { surface: 70, rooms: 3 }
    );
    expect(score).toBeGreaterThan(0.85);
  });

  it("uses neutral score 0.4 for unknown distance", () => {
    const scoreWithUnknown = scoreComparable(
      { surface: 70, date: "2024-06-01", rooms: 3 },
      { surface: 70, rooms: 3 }
    );
    const scoreWithZero = scoreComparable(
      { surface: 70, distanceM: 0, date: "2024-06-01", rooms: 3 },
      { surface: 70, rooms: 3 }
    );
    // Unknown distance (0.4 * 0.40 = 0.16) vs zero distance (1.0 * 0.40 = 0.40)
    expect(scoreWithZero).toBeGreaterThan(scoreWithUnknown);
  });

  it("penalises large surface difference", () => {
    const closeScore = scoreComparable(
      { surface: 70, distanceM: 100, date: "2024-06-01" },
      { surface: 70 }
    );
    const farScore = scoreComparable(
      { surface: 200, distanceM: 100, date: "2024-06-01" },
      { surface: 70 }
    );
    expect(closeScore).toBeGreaterThan(farScore);
  });

  it("penalises old dates (low recency score)", () => {
    const recentScore = scoreComparable(
      { surface: 70, distanceM: 100, date: "2024-11-01" },
      { surface: 70 }
    );
    const oldScore = scoreComparable(
      { surface: 70, distanceM: 100, date: "2020-01-01" },
      { surface: 70 }
    );
    expect(recentScore).toBeGreaterThan(oldScore);
  });

  it("gives room match bonus: exact=1, diff 1=0.7, diff 2=0.3, diff >2=0", () => {
    const base = { surface: 70, distanceM: 0, date: "2024-06-01" };
    const target = { surface: 70, rooms: 3 };
    const exact = scoreComparable({ ...base, rooms: 3 }, target);
    const off1  = scoreComparable({ ...base, rooms: 4 }, target);
    const off2  = scoreComparable({ ...base, rooms: 5 }, target);
    const off3  = scoreComparable({ ...base, rooms: 6 }, target);
    expect(exact).toBeGreaterThan(off1);
    expect(off1).toBeGreaterThan(off2);
    expect(off2).toBeGreaterThan(off3);
  });
});

describe("toComparables", () => {
  it("deduplicates by id_mutation", () => {
    const id = "dup-001";
    const mutations = [
      makeMutation({ id_mutation: id, prix_m2: 4000 }),
      makeMutation({ id_mutation: id, prix_m2: 4000 }),
      makeMutation({ id_mutation: "other", prix_m2: 4200 }),
    ];
    const result = toComparables(mutations, 70);
    const dupCount = result.filter((c) => c.id === id).length;
    expect(dupCount).toBe(1);
  });

  it("deduplicates by (date + prix + surface) when id differs", () => {
    const mutations = [
      makeMutation({ id_mutation: "a", date_mutation: "2024-01-01", valeur_fonciere: 300000, surface_reelle_bati: 70, prix_m2: 4285 }),
      makeMutation({ id_mutation: "b", date_mutation: "2024-01-01", valeur_fonciere: 300000, surface_reelle_bati: 70, prix_m2: 4285 }),
    ];
    const result = toComparables(mutations, 70);
    expect(result).toHaveLength(1);
  });

  it("filters out mutations with no prix_m2 or zero valeur_fonciere", () => {
    const mutations = [
      makeMutation({ prix_m2: undefined, valeur_fonciere: 100000 }),           // missing prix_m2
      makeMutation({ prix_m2: 4000, valeur_fonciere: 0, surface_reelle_bati: 80 }), // zero valeur_fonciere
      makeMutation({ prix_m2: 4200, valeur_fonciere: 350000, surface_reelle_bati: 83 }), // valid
    ];
    const result = toComparables(mutations, 70);
    expect(result).toHaveLength(1);
    expect(result[0].pricePsm).toBe(4200);
  });

  it("marks top comparables — outliers are never topComparable", () => {
    const mutations = Array.from({ length: 15 }, (_, i) =>
      makeMutation({ id_mutation: `m-${i}`, prix_m2: 4000 + i * 50 })
    );
    // Mark one as outlier
    mutations[0].outlier = true;

    const result = toComparables(mutations, 70);
    const outlierComp = result.find((c) => c.outlier);
    expect(outlierComp?.topComparable).toBeFalsy();
  });

  it("sorts top comparables first in output", () => {
    // Use unique valeur_fonciere and surface to avoid deduplication collisions
    const mutations = Array.from({ length: 12 }, (_, i) =>
      makeMutation({
        id_mutation: `m-${i}`,
        prix_m2: 4000 + i * 50,
        valeur_fonciere: 280000 + i * 5000,
        surface_reelle_bati: 65 + i,
      })
    );
    const result = toComparables(mutations, 70);
    // Ensure we actually have both top and non-top items
    const topItems = result.filter((c) => c.topComparable);
    const nonTopItems = result.filter((c) => !c.topComparable && !c.outlier);
    expect(topItems.length).toBeGreaterThan(0);
    expect(nonTopItems.length).toBeGreaterThan(0);
    const firstNonTop = result.findIndex((c) => !c.topComparable && !c.outlier);
    const lastTop = result.map((c) => c.topComparable).lastIndexOf(true);
    // All top comparables appear before any non-top
    expect(lastTop).toBeLessThan(firstNonTop);
  });

  it("returns at most 30 comparables", () => {
    const mutations = Array.from({ length: 50 }, (_, i) =>
      makeMutation({ id_mutation: `m-${i}`, prix_m2: 4000 + i * 10 })
    );
    const result = toComparables(mutations, 70);
    expect(result.length).toBeLessThanOrEqual(30);
  });

  it("sets indexedPricePsm on each comparable", () => {
    const mutations = [makeMutation({ prix_m2: 4000, date_mutation: "2020-06-01" })];
    const result = toComparables(mutations, 70);
    expect(result[0].indexedPricePsm).toBeDefined();
    // 2020 index=114, 2025 index=126 → indexed > raw
    expect(result[0].indexedPricePsm!).toBeGreaterThan(4000);
  });
});
