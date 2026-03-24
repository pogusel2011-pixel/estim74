import exCommunesData from "@/data/referentials/ex-communes.json";

interface ExCommune {
  codeInsee: string;
  nom: string;
  communeFusionnee?: string;
  codeInseeActuel?: string;
}

export function resolveCommune(codeInsee: string): string {
  const found = (exCommunesData as ExCommune[]).find((c) => c.codeInsee === codeInsee);
  return found?.codeInseeActuel ?? codeInsee;
}
