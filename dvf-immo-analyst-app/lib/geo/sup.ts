export interface ServitudeItem {
  typeSup: string | null;
  libelle: string | null;
  idSupRef: string | null;
}

export type ServitudesResult = ServitudeItem[];

/**
 * Lookup urban servitudes (SUP) from IGN GPU API Carto (Géoportail Urbanisme)
 * API: GET https://apicarto.ign.fr/api/gpu/servitude?geom={"type":"Point","coordinates":[lon,lat]}
 * No API key required. Non-blocking: returns null on error.
 */
export async function lookupServitudes(lat: number, lng: number): Promise<ServitudesResult | null> {
  const geom = JSON.stringify({ type: "Point", coordinates: [lng, lat] });
  const url = `https://apicarto.ign.fr/api/gpu/servitude?geom=${encodeURIComponent(geom)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      console.warn(`[sup] API returned ${res.status}`);
      return null;
    }
    const data = await res.json();

    // API returns GeoJSON FeatureCollection
    const features: Record<string, unknown>[] = Array.isArray(data?.features)
      ? (data.features as Record<string, unknown>[])
      : [];

    if (features.length === 0) {
      console.log(`[sup] Aucune servitude trouvée`);
      return [];
    }

    const items: ServitudeItem[] = features.map((f) => {
      const props = (f.properties ?? {}) as Record<string, unknown>;
      return {
        typeSup: String(props.typesup ?? props.type_sup ?? props.typeSup ?? "").toUpperCase() || null,
        libelle: String(props.libelle ?? props.label ?? props.lib ?? "") || null,
        idSupRef: String(props.idsupref ?? props.id_sup_ref ?? props.idSupRef ?? props.id ?? "") || null,
      };
    });

    // Deduplicate by typeSup
    const seen = new Set<string>();
    const deduped = items.filter((item) => {
      const key = `${item.typeSup}-${item.libelle}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`[sup] ${deduped.length} servitude(s) trouvée(s)`);
    return deduped;
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      console.warn("[sup] Timeout 8s — non bloquant");
    } else {
      console.warn("[sup] Erreur non bloquante:", (e as Error).message);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
