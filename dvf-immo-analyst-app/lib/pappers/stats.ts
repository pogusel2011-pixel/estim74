/**
 * lib/pappers/stats.ts
 *
 * Fetches commune-level real estate stats from the public Pappers Immobilier
 * _payload.json endpoint (Nuxt 3 SSR, no API key required, 24-h cache).
 *
 * One call returns:
 *  - Commune: prix_m2, prix_m2_appartements, prix_m2_maisons,
 *             variation_1_an, nombre_transactions_1_an, prix_par_annee_10_ans
 *  - Département 74: same metrics embedded in the commune payload
 */

const PAPPERS_IMMO_BASE = "https://immobilier.pappers.fr/prix-immobilier";
const REGION_DEPT_74 = "auvergne-rhone-alpes/haute-savoie";

export interface PappersStats {
  commune: string;
  prixM2: number | null;
  prixM2Apparts: number | null;
  prixM2Maisons: number | null;
  variation1An: number | null;
  nbTransactions1An: number | null;
  prixParAnnee?: Record<string, number>;
  dept?: {
    prixM2: number | null;
    prixM2Apparts: number | null;
    prixM2Maisons: number | null;
    variation1An: number | null;
    prixParAnnee?: Record<string, number>;
  };
  source: "commune" | "departement";
}

// ─── Minimal Nuxt devalue decoder ────────────────────────────────────────────

function devalueResolve(pool: unknown[], idx: number): unknown {
  if (idx < 0 || idx >= pool.length) return undefined;
  const val = pool[idx];
  if (val === null || typeof val !== "object") return val;

  if (Array.isArray(val)) {
    const tag = val[0];
    if (tag === "ShallowReactive" || tag === "Reactive") {
      return devalueResolve(pool, val[1] as number);
    }
    if (tag === "undefined") return undefined;
    if (tag === "NaN") return NaN;
    if (tag === "Infinity") return Infinity;
    if (tag === "-Infinity") return -Infinity;
    if (tag === "-0") return -0;
    if (tag === "Date") return new Date(val[1] as string);
    // Generic array: each element is an index into the pool
    return (val as number[]).map((v) => devalueResolve(pool, v));
  }

  // Plain object: each value is an index into the pool
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, number>)) {
    result[k] = devalueResolve(pool, v);
  }
  return result;
}

function parsePappersPayload(raw: string): Record<string, unknown> | null {
  try {
    const pool = JSON.parse(raw) as unknown[];
    if (!Array.isArray(pool) || pool.length < 3) return null;

    const rootMeta = pool[0] as { data: number };
    const rootDecoded = devalueResolve(pool, rootMeta.data);

    // Unwrap ShallowReactive → {hashKey: communeData} → communeData
    if (rootDecoded === null || typeof rootDecoded !== "object") return null;
    const inner = Object.values(rootDecoded as object)[0];
    if (inner === null || typeof inner !== "object") return null;
    return inner as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Slug builder ─────────────────────────────────────────────────────────────

export function slugifyCommune(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Extract typed stat from decoded commune / dept object ───────────────────

function extractStats(obj: Record<string, unknown>) {
  const stats = (obj.stats ?? {}) as Record<string, unknown>;

  const prixM2 = (obj.prix_m2 ?? stats.prix_m2_1_an ?? null) as number | null;
  const prixM2Apparts = (obj.prix_m2_appartements ?? stats.prix_m2_appartements_1_an ?? null) as number | null;
  const prixM2Maisons = (obj.prix_m2_maisons ?? stats.prix_m2_maisons_1_an ?? null) as number | null;

  // stats.variation_prix_m2_1_an is already a percentage (e.g., -2.33) for communes.
  // For depts, fall back to the last year of variations_prix_m2_par_annee_10_ans which uses
  // decimal format (0.01593 = +1.59%) — multiply by 100.
  let variation1An = (stats.variation_prix_m2_1_an ?? null) as number | null;
  if (variation1An === null) {
    const varAnnee = (obj.variations_prix_m2_par_annee_10_ans ?? null) as Record<string, number> | null;
    if (varAnnee) {
      const lastYear = Object.keys(varAnnee).sort().at(-1);
      if (lastYear != null) {
        const v = varAnnee[lastYear] as number;
        // decimal (|v| < 2) → ×100; already percentage → as-is
        variation1An = Math.abs(v) < 2 ? Math.round(v * 1000) / 10 : v;
      }
    }
  }

  const nbTransactions1An = (stats.nombre_transactions_1_an ?? null) as number | null;
  const prixParAnnee = (obj.prix_m2_par_annee_10_ans ?? null) as Record<string, number> | null;

  return { prixM2, prixM2Apparts, prixM2Maisons, variation1An, nbTransactions1An, prixParAnnee };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches price stats for a commune in Haute-Savoie (74).
 * Falls back to département-level data if the commune page doesn't exist.
 * No API key required — uses the public Pappers Immobilier SSR payload.
 */
export async function fetchPappersStats(
  city: string,
  _postalCode?: string,
): Promise<PappersStats | null> {
  const slug = slugifyCommune(city);
  const communeUrl = `${PAPPERS_IMMO_BASE}/${REGION_DEPT_74}/${slug}/_payload.json`;
  const deptUrl = `${PAPPERS_IMMO_BASE}/${REGION_DEPT_74}/_payload.json`;

  // ── Try commune first ──────────────────────────────────────────────────────
  try {
    const res = await fetch(communeUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const raw = await res.text();
      const data = parsePappersPayload(raw);
      if (data) {
        const comm = extractStats(data);
        // If every price field is null the commune slug isn't in Pappers DB → dept fallback
        if (comm.prixM2 === null && comm.prixM2Apparts === null && comm.prixM2Maisons === null) {
          throw new Error("empty");
        }
        const deptObj = (data.departement ?? {}) as Record<string, unknown>;
        const dept = Object.keys(deptObj).length > 0 ? extractStats(deptObj) : null;

        return {
          commune: (data.nom as string | undefined) ?? city,
          ...comm,
          prixParAnnee: comm.prixParAnnee ?? undefined,
          dept: dept
            ? {
                prixM2: dept.prixM2,
                prixM2Apparts: dept.prixM2Apparts,
                prixM2Maisons: dept.prixM2Maisons,
                variation1An: dept.variation1An,
                prixParAnnee: dept.prixParAnnee ?? undefined,
              }
            : undefined,
          source: "commune",
        };
      }
    }
  } catch {
    // fall through to dept fallback
  }

  // ── Fallback: département level ───────────────────────────────────────────
  try {
    const res = await fetch(deptUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const raw = await res.text();
    const data = parsePappersPayload(raw);
    if (!data) return null;

    const dept = extractStats(data);
    return {
      commune: "Haute-Savoie",
      ...dept,
      prixParAnnee: dept.prixParAnnee ?? undefined,
      source: "departement",
    };
  } catch {
    return null;
  }
}

