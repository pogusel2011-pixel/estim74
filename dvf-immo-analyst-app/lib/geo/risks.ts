export interface RisksResult {
  riskFlood: string | null;
  riskEarthquake: string | null;
  riskClay: string | null;
  riskLandslide: string | null;
  risksSummary: string[] | null;
}

/**
 * Lookup natural risks from georisques.gouv.fr (GASPAR API)
 * API: GET https://georisques.gouv.fr/api/v1/gaspar/risques?latlon=lng,lat
 * No API key required. Non-blocking: returns null on error.
 */
export async function lookupRisks(lat: number, lng: number): Promise<RisksResult | null> {
  const url = `https://georisques.gouv.fr/api/v1/gaspar/risques?latlon=${lng},${lat}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      console.warn(`[risks] API returned ${res.status}`);
      return null;
    }
    const data = await res.json();

    // API returns { data: [ { codeRisque, libelleRisque, ... } ] }
    const items: Record<string, unknown>[] = Array.isArray(data?.data)
      ? (data.data as Record<string, unknown>[])
      : Array.isArray(data?.risques)
      ? (data.risques as Record<string, unknown>[])
      : [];

    let riskFlood: string | null = null;
    let riskEarthquake: string | null = null;
    let riskClay: string | null = null;
    let riskLandslide: string | null = null;
    const summary: string[] = [];

    for (const r of items) {
      const code = String(r.codeRisque ?? r.code_risque ?? r.code ?? "").toLowerCase();
      const label = String(r.libelleRisque ?? r.libelle_risque ?? r.libelle ?? r.label ?? "");

      // Inondation
      if (code.includes("ino") || code.includes("inond") || code === "inp" || code === "in") {
        riskFlood = label || "Oui";
        if (!summary.includes("Inondation")) summary.push("Inondation");
      }
      // Séisme
      else if (code.includes("sis") || code.includes("seis") || code.includes("sei")) {
        riskEarthquake = label || "Oui";
        if (!summary.includes("Séisme")) summary.push(`Séisme${label ? " " + label : ""}`);
      }
      // Retrait-gonflement des argiles
      else if (code.includes("rga") || code.includes("argile") || code.includes("retr")) {
        riskClay = label || "Oui";
        if (!summary.includes("Retrait-gonflement argiles")) summary.push("Retrait-gonflement argiles");
      }
      // Mouvements de terrain
      else if (code.includes("mvt") || code.includes("mouv") || code.includes("gliss") || code === "mv") {
        riskLandslide = label || "Oui";
        if (!summary.includes("Mouvement de terrain")) summary.push("Mouvement de terrain");
      }
      // Autres risques recensés mais non classifiés — on les ajoute au summary uniquement
      else if (label && !summary.includes(label)) {
        summary.push(label);
      }
    }

    console.log(`[risks] lat=${lat} lng=${lng} → ${summary.length} risque(s): ${summary.join(", ") || "aucun"}`);
    return { riskFlood, riskEarthquake, riskClay, riskLandslide, risksSummary: summary.length > 0 ? summary : null };
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      console.warn("[risks] Timeout 8s — non bloquant");
    } else {
      console.warn("[risks] Erreur non bloquante:", (e as Error).message);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
