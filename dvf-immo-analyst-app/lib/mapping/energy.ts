type DPELetter = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export const DPE_ADJUSTMENT: Record<DPELetter, number> = {
  A: 0.06, B: 0.04, C: 0.02, D: 0.00, E: -0.03, F: -0.07, G: -0.12,
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
