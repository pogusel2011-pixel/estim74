import { prisma } from "@/lib/prisma";
import { DVFMutation } from "@/types/dvf";
import { haversineDistance } from "@/lib/utils";
import { getInseeCodesForCity } from "@/lib/geo/iris_utils";

function rowToMutation(row: {
  id_mutation: string;
  date_mutation: string;
  nature_mutation: string;
  valeur_fonciere: number;
  adresse_numero: string | null;
  adresse_nom_voie: string | null;
  code_postal: string | null;
  nom_commune: string;
  code_commune: string;
  code_departement: string;
  id_parcelle: string | null;
  type_local: string | null;
  surface_reelle_bati: number | null;
  lot1_surface_carrez: number | null;
  nombre_pieces_principales: number | null;
  surface_terrain: number | null;
  lat: number | null;
  lon: number | null;
}): DVFMutation {
  return {
    id_mutation: row.id_mutation,
    date_mutation: row.date_mutation,
    nature_mutation: row.nature_mutation,
    valeur_fonciere: row.valeur_fonciere,
    adresse_numero: row.adresse_numero ?? undefined,
    adresse_nom_voie: row.adresse_nom_voie ?? undefined,
    code_postal: row.code_postal ?? undefined,
    nom_commune: row.nom_commune,
    code_commune: row.code_commune,
    code_departement: row.code_departement,
    id_parcelle: row.id_parcelle ?? undefined,
    type_local: row.type_local ?? undefined,
    surface_reelle_bati: row.surface_reelle_bati ?? undefined,
    lot1_surface_carrez: row.lot1_surface_carrez ?? undefined,
    nombre_pieces_principales: row.nombre_pieces_principales ?? undefined,
    surface_terrain: row.surface_terrain ?? undefined,
    lat: row.lat ?? undefined,
    lon: row.lon ?? undefined,
    _source: "csv",
  };
}

function dateMinStr(monthsBack: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  return d.toISOString().slice(0, 10);
}

export async function loadDbMutations(
  lat: number,
  lng: number,
  radiusKm: number,
  monthsBack: number,
  propertyTypes?: string[],
  city?: string,
  postalCode?: string,
): Promise<DVFMutation[]> {
  const minDate = dateMinStr(monthsBack);

  // Bounding box pre-filter (1 deg lat ≈ 111 km)
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const latMin = lat - latDelta;
  const latMax = lat + latDelta;
  const lngMin = lng - lngDelta;
  const lngMax = lng + lngDelta;

  // Get INSEE codes for fallback (mutations without coords)
  let inseeCodes: string[] = [];
  if (city) {
    try {
      inseeCodes = await getInseeCodesForCity(city, postalCode);
      if (inseeCodes.length > 0) {
        console.log(`[DVF DB] Codes INSEE pour "${city}" (${postalCode ?? ""}): [${inseeCodes.join(", ")}]`);
      }
    } catch {
      // Non bloquant
    }
  }

  // Build where clause: bounding box rows + INSEE fallback rows
  const baseWhere = {
    nature_mutation: "Vente",
    valeur_fonciere: { gt: 0 },
    date_mutation: { gte: minDate },
    ...(propertyTypes && propertyTypes.length > 0 ? { type_local: { in: propertyTypes } } : {}),
  };

  const rows = await prisma.dvfMutation.findMany({
    where: {
      ...baseWhere,
      OR: [
        // Bounding box (has coords)
        {
          lat: { gte: latMin, lte: latMax },
          lon: { gte: lngMin, lte: lngMax },
        },
        // INSEE fallback (no coords)
        ...(inseeCodes.length > 0
          ? [{ lat: null, code_commune: { in: inseeCodes } }]
          : []),
      ],
    },
    select: {
      id_mutation: true, date_mutation: true, nature_mutation: true,
      valeur_fonciere: true, adresse_numero: true, adresse_nom_voie: true,
      code_postal: true, nom_commune: true, code_commune: true,
      code_departement: true, id_parcelle: true, type_local: true,
      surface_reelle_bati: true, lot1_surface_carrez: true,
      nombre_pieces_principales: true, surface_terrain: true,
      lat: true, lon: true,
    },
  });

  // Precise Haversine filter on rows that have coords
  let inseeFallbackCount = 0;
  const mutations: DVFMutation[] = [];

  for (const row of rows) {
    const m = rowToMutation(row);
    if (m.lat && m.lon) {
      const dist = haversineDistance(lat, lng, m.lat, m.lon);
      if (dist > radiusKm * 1000) continue;
      m.distance_m = dist;
    } else {
      inseeFallbackCount++;
    }
    mutations.push(m);
  }

  mutations.sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));

  console.log(`[DVF DB] ${mutations.length} mutations chargées (${inseeFallbackCount} fallback INSEE)`);
  return mutations;
}

export async function loadDbMutationsByCommune(
  depcoms: string[],
  monthsBack: number,
  propertyTypes?: string[],
  lat?: number,
  lng?: number,
): Promise<DVFMutation[]> {
  if (depcoms.length === 0) return [];

  const minDate = dateMinStr(monthsBack);

  const rows = await prisma.dvfMutation.findMany({
    where: {
      nature_mutation: "Vente",
      valeur_fonciere: { gt: 0 },
      date_mutation: { gte: minDate },
      code_commune: { in: depcoms },
      ...(propertyTypes && propertyTypes.length > 0 ? { type_local: { in: propertyTypes } } : {}),
    },
    select: {
      id_mutation: true, date_mutation: true, nature_mutation: true,
      valeur_fonciere: true, adresse_numero: true, adresse_nom_voie: true,
      code_postal: true, nom_commune: true, code_commune: true,
      code_departement: true, id_parcelle: true, type_local: true,
      surface_reelle_bati: true, lot1_surface_carrez: true,
      nombre_pieces_principales: true, surface_terrain: true,
      lat: true, lon: true,
    },
  });

  const mutations = rows.map(rowToMutation);

  if (lat !== undefined && lng !== undefined) {
    for (const m of mutations) {
      if (m.lat && m.lon && m.distance_m == null) {
        m.distance_m = haversineDistance(lat, lng, m.lat, m.lon);
      }
    }
    mutations.sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));
  }

  console.log(`[DVF DB] Commune (${depcoms.join(", ")}) : ${mutations.length} mutations`);
  return mutations;
}
