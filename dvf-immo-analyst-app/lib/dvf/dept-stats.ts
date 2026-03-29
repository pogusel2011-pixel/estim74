import { DeptBenchmark } from "@/types/dvf";

const IMMOAPI_BASE = "https://immoapi.app/v1";
const IMMOAPI_TIMEOUT_MS = 8000;

/** Mappe un type de bien applicatif → libellé DVF attendu par l'API */
function toApiTypeLocal(propertyType?: string | null): string {
  if (!propertyType) return "";
  const map: Record<string, string> = {
    APARTMENT: "Appartement",
    HOUSE: "Maison",
    LAND: "Terrain",
  };
  return map[propertyType] ?? "";
}

/**
 * Récupère les statistiques DVF départementales via immoapi.app/v1/stats.
 * Retourne null en cas d'erreur/timeout/clé absente (fallback silencieux).
 *
 * Endpoint : GET /v1/stats?code_departement=74&type_local=Appartement
 */
export async function fetchDeptStats(
  propertyType?: string | null
): Promise<DeptBenchmark | null> {
  const apiKey = process.env.MOTEURIMMO_API_KEY;
  if (!apiKey) {
    console.warn("[DeptStats] MOTEURIMMO_API_KEY absent — skip /v1/stats");
    return null;
  }

  const typeLocal = toApiTypeLocal(propertyType);
  const params = new URLSearchParams({ code_departement: "74" });
  if (typeLocal) params.set("type_local", typeLocal);

  const url = `${IMMOAPI_BASE}/stats?${params}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(IMMOAPI_TIMEOUT_MS),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      next: { revalidate: 3600 }, // cache 1h — stat agrégée, pas critique au temps-réel
    });

    if (!res.ok) {
      console.warn(`[DeptStats] immoapi.app /v1/stats → HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();
    // L'API peut retourner les stats dans `data`, `stats`, ou directement à la racine
    const payload: Record<string, unknown> = json.data ?? json.stats ?? json;

    const parseNum = (v: unknown): number | undefined => {
      if (typeof v === "number" && isFinite(v)) return v;
      if (typeof v === "string") {
        const n = parseFloat(v);
        return isFinite(n) ? n : undefined;
      }
      return undefined;
    };

    const medianPsm =
      parseNum(payload.mediane_prix_m2) ??
      parseNum(payload.median_prix_m2) ??
      parseNum(payload.mediane) ??
      parseNum(payload.prix_m2_median);

    const evolutionPct =
      parseNum(payload.evolution_annuelle) ??
      parseNum(payload.evolution_pct) ??
      parseNum(payload.evolution);

    const totalTransactions =
      parseNum(payload.nombre_transactions) ??
      parseNum(payload.total) ??
      parseNum(payload.count);

    if (medianPsm == null) {
      console.warn("[DeptStats] Réponse API inattendue — champ médiane absent", payload);
      return null;
    }

    const result: DeptBenchmark = {
      codeDepement: "74",
      typeLocal: typeLocal || "Tous types",
      medianPsm: Math.round(medianPsm),
      evolutionPct: evolutionPct != null ? Math.round(evolutionPct * 10) / 10 : undefined,
      totalTransactions: totalTransactions != null ? Math.round(totalTransactions) : undefined,
    };

    console.log(
      `[DeptStats] 74 — médiane ${result.medianPsm} €/m²` +
      (result.evolutionPct != null ? `, évolution ${result.evolutionPct}%` : "") +
      (typeLocal ? `, type: ${typeLocal}` : "")
    );

    return result;
  } catch (err) {
    if ((err as Error).name === "TimeoutError") {
      console.warn("[DeptStats] Timeout immoapi.app /v1/stats");
    } else {
      console.warn("[DeptStats] Erreur /v1/stats:", (err as Error).message);
    }
    return null;
  }
}
