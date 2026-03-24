type DPELetter = "A" | "B" | "C" | "D" | "E" | "F" | "G";

// Spec Estim74 : A/B +1-3% → +2% | C/D 0% | E -2/-4% → -3% | F -5/-8% → -6% | G -5/-8% → -7%
export const DPE_ADJUSTMENT: Record<DPELetter, number> = {
  A: 0.02, B: 0.02, C: 0.00, D: 0.00, E: -0.03, F: -0.06, G: -0.07,
};

export function getDpeAdjustment(letter?: string): number {
  if (!letter) return 0;
  return DPE_ADJUSTMENT[letter as DPELetter] ?? 0;
}

export function getDpeLabel(letter: string): string {
  const labels: Record<string, string> = {
    A: "Très performant", B: "Performant", C: "Assez performant",
    D: "Peu performant", E: "Énergivore", F: "Très énergivore", G: "Extrêmement énergivore",
  };
  return labels[letter] ?? letter;
}
