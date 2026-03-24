import { DVFMutation, DVFStats } from "@/types/dvf";
import { percentile, standardDeviation } from "@/lib/utils";

export function computeDVFStats(mutations: DVFMutation[]): DVFStats | null {
  const valid = mutations.filter((m) => m.prix_m2 != null && m.prix_m2 > 0);
  if (valid.length === 0) return null;

  const psms = valid.map((m) => m.prix_m2!);
  const sorted = [...psms].sort((a, b) => a - b);
  const dates = valid.map((m) => m.date_mutation).sort();

  const oldest = new Date(dates[0]);
  const newest = new Date(dates[dates.length - 1]);
  const periodMonths = Math.round((newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24 * 30));

  return {
    count: valid.length,
    medianPsm: Math.round(percentile(psms, 50)),
    meanPsm: Math.round(psms.reduce((a, b) => a + b, 0) / psms.length),
    minPsm: Math.round(sorted[0]),
    maxPsm: Math.round(sorted[sorted.length - 1]),
    p25Psm: Math.round(percentile(psms, 25)),
    p75Psm: Math.round(percentile(psms, 75)),
    stdPsm: Math.round(standardDeviation(psms)),
    periodMonths,
    oldestDate: dates[0],
    newestDate: dates[dates.length - 1],
    source: "csv",
  };
}
