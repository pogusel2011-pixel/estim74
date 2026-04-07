/**
 * Lookup PLU/PLUi zoning via API Carto IGN GPU
 * https://apicarto.ign.fr/api/gpu/zone-urba
 * No API key required — public dataset (Géoportail Urbanisme)
 */

export interface PLUResult {
  /** Zone code, ex: "UA", "Uah", "N", "A" */
  zonePLU: string;
  /** Zone category: U (urbain), AU (à urbaniser), A (agricole), N (naturel) */
  zonePLUType: string;
  /** Document type: "PLU", "PLUi", "POS", "CC", "PSMV" */
  documentUrbanisme: string;
  /** Full zone description, ex: "Zone Uah de centre historique" */
  zonePLULabel: string;
}

function extractDocType(idurba: string): string {
  const upper = idurba.toUpperCase();
  if (upper.includes("PLUI")) return "PLUi";
  if (upper.includes("PLU")) return "PLU";
  if (upper.includes("POS")) return "POS";
  if (upper.includes("CC_")) return "CC";
  if (upper.includes("PSMV")) return "PSMV";
  if (upper.includes("RNU")) return "RNU";
  return "Document d'urbanisme";
}

export async function lookupPLU(lat: number, lng: number): Promise<PLUResult | null> {
  const geom = JSON.stringify({ type: "Point", coordinates: [lng, lat] });
  const url =
    "https://apicarto.ign.fr/api/gpu/zone-urba?geom=" + encodeURIComponent(geom);

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    console.warn(`[PLU] GPU API error: ${res.status}`);
    return null;
  }

  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature) {
    console.log("[PLU] Aucune zone trouvée pour ces coordonnées");
    return null;
  }

  const p = feature.properties;
  const zonePLU: string = (p.libelle ?? "").trim();
  const zonePLUType: string = (p.typezone ?? "").trim();
  const zonePLULabel: string = (p.libelong ?? "").trim();
  const documentUrbanisme: string = p.idurba ? extractDocType(p.idurba) : "PLU";

  if (!zonePLU) return null;

  console.log(
    `[PLU] Zone ${zonePLU} (${zonePLUType}) — ${documentUrbanisme} — ${zonePLULabel}`
  );

  return { zonePLU, zonePLUType, documentUrbanisme, zonePLULabel };
}
