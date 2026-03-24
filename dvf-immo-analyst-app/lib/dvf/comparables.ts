import { DVFMutation, DVFComparable } from "@/types/dvf";

export function toComparables(mutations: DVFMutation[], subjectSurface: number): DVFComparable[] {
  return mutations
    .filter((m) => m.prix_m2 != null && m.valeur_fonciere > 0)
    .map((m): DVFComparable => {
      const surface = m.surface_reelle_bati ?? m.surface_terrain ?? 0;
      const similarity = computeSimilarity(surface, subjectSurface, m.distance_m);
      const adresse = [m.adresse_numero, m.adresse_nom_voie].filter(Boolean).join(" ");

      return {
        id: m.id_mutation,
        date: m.date_mutation,
        address: adresse || "Adresse non disponible",
        city: m.nom_commune,
        type: m.type_local ?? "Inconnu",
        surface,
        price: m.valeur_fonciere,
        pricePsm: m.prix_m2!,
        rooms: m.nombre_pieces_principales,
        landSurface: m.surface_terrain,
        distanceM: m.distance_m,
        similarity,
      };
    })
    .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
    .slice(0, 30);
}

function computeSimilarity(surface: number, subjectSurface: number, distanceM?: number): number {
  const surfaceRatio = Math.min(surface, subjectSurface) / Math.max(surface, subjectSurface);
  const distScore = distanceM ? Math.max(0, 1 - distanceM / 2000) : 0.5;
  return Math.round((surfaceRatio * 0.6 + distScore * 0.4) * 100) / 100;
}
