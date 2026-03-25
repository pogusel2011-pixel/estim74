/**
 * Référentiel statique code postal ↔ code INSEE pour la Haute-Savoie (74)
 * Source : public.opendatasoft.com — 294 communes
 * Pas d'appel API en runtime, uniquement le JSON local.
 */
import data from "@/data/referentials/cp-insee-74.json";

export interface CpInseeEntry {
  insee: string;
  cp: string;
  commune: string;
}

const referential: CpInseeEntry[] = data as CpInseeEntry[];

/** Retourne toutes les communes pour un code postal donné */
export function getCommunesByPostalCode(cp: string): CpInseeEntry[] {
  if (!cp || cp.length !== 5) return [];
  return referential.filter((e) => e.cp === cp);
}

/** Retourne le code INSEE pour un code postal + nom de commune */
export function getInseeByPostalCodeAndCommune(
  cp: string,
  commune: string
): string | undefined {
  const normalized = commune.trim().toUpperCase();
  const entry = referential.find(
    (e) => e.cp === cp && e.commune === normalized
  );
  return entry?.insee;
}

/** Retourne le code INSEE pour un code postal (prend le premier si plusieurs communes) */
export function getInseeByPostalCode(cp: string): string | undefined {
  const entries = getCommunesByPostalCode(cp);
  return entries.length === 1 ? entries[0].insee : undefined;
}

/** Recherche partielle par nom de commune (pour debug / enrichissement) */
export function findByCommune(name: string): CpInseeEntry[] {
  const q = name.trim().toUpperCase();
  return referential.filter((e) => e.commune.includes(q));
}

export default referential;
