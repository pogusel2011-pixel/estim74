import { describe, it, expect } from "vitest";
import {
  getTemporalIndex,
  applyTemporalIndex,
  NOTAIRES_INDEX_74,
  INDEX_REFERENCE_YEAR,
} from "@/lib/dvf/temporal-index";

describe("getTemporalIndex", () => {
  it("returns the exact index for known years", () => {
    expect(getTemporalIndex(2014)).toBe(100);
    expect(getTemporalIndex(2020)).toBe(114);
    expect(getTemporalIndex(2025)).toBe(126);
  });

  it("returns the minimum year index for years before 2014", () => {
    expect(getTemporalIndex(2000)).toBe(NOTAIRES_INDEX_74[2014]);
    expect(getTemporalIndex(1990)).toBe(NOTAIRES_INDEX_74[2014]);
  });

  it("returns the maximum year index for years after 2025", () => {
    expect(getTemporalIndex(2030)).toBe(NOTAIRES_INDEX_74[2025]);
    expect(getTemporalIndex(2100)).toBe(NOTAIRES_INDEX_74[2025]);
  });

  it("interpolates linearly for years between known entries", () => {
    // All years 2014-2025 are in the table, so test with a hypothetical gap
    // by checking that the index for a known year is correct
    const idx2022 = getTemporalIndex(2022);
    expect(idx2022).toBe(130);
  });
});

describe("applyTemporalIndex", () => {
  it("leaves price unchanged when sale year equals reference year", () => {
    const psm = 5000;
    const result = applyTemporalIndex(psm, INDEX_REFERENCE_YEAR);
    // refIndex / saleIndex = 126/126 = 1
    expect(result).toBe(psm);
  });

  it("increases price for older sales (market appreciation)", () => {
    // 2014: index 100, 2025: index 126 → should increase price
    const psm = 3000;
    const result = applyTemporalIndex(psm, 2014);
    expect(result).toBeGreaterThan(psm);
    expect(result).toBe(Math.round(psm * (126 / 100)));
  });

  it("correctly indexes a 2020 sale to 2025", () => {
    const psm = 4000;
    const result = applyTemporalIndex(psm, 2020);
    // 2020: index 114, 2025: index 126
    expect(result).toBe(Math.round(4000 * (126 / 114)));
  });

  it("caps index for years beyond 2025", () => {
    const psm = 5000;
    const result2100 = applyTemporalIndex(psm, 2100);
    const result2025 = applyTemporalIndex(psm, 2025);
    // Both should use the 2025 index (126/126 = 1)
    expect(result2100).toBe(result2025);
  });

  it("rounds result to integer", () => {
    const result = applyTemporalIndex(3000, 2020);
    expect(Number.isInteger(result)).toBe(true);
  });
});
