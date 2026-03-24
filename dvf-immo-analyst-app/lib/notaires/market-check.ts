import { MarketReading } from "@/types/analysis";

interface NotairesResponse {
  tendance?: string;
  variation_annuelle?: number;
  variation_trimestrielle?: number;
  indice_volume?: number;
}

/**
 * Récupère les données de marché des Notaires de France
 * API publique : https://www.notaires.fr/fr/immobilier-succession/prix-et-tendances-de-limmobilier
 */
export async function fetchNotairesMarket(
  postalCode: string,
  propertyType: string
): Promise<MarketReading | null> {
  // L'API notaires n'est pas documentée publiquement — on interroge leur endpoint observé
  const dept = postalCode.slice(0, 2);
  const url = `https://www.notaires.fr/api/prix-immobilier?departement=${dept}&type=${encodeURIComponent(propertyType)}`;

  try {
    const res = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "DVF-Analyst/1.0" },
      next: { revalidate: 86400 * 7 }, // cache 7 jours
    });

    if (!res.ok) {
      console.warn("[Notaires] API indisponible:", res.status);
      return buildFallbackReading();
    }

    const data: NotairesResponse = await res.json();
    return parseNotairesResponse(data);
  } catch (err) {
    console.warn("[Notaires] Erreur fetch:", err);
    return buildFallbackReading();
  }
}

function parseNotairesResponse(data: NotairesResponse): MarketReading {
  const annualChange = data.variation_annuelle ?? 0;
  const trend = annualChange > 1.5 ? "hausse" : annualChange < -1.5 ? "baisse" : "stable";
  const absChange = Math.abs(annualChange);

  return {
    trend,
    trendPercent: annualChange,
    supplyDemand: trend === "hausse" ? "tendu" : trend === "baisse" ? "detendu" : "equilibre",
    commentary: buildCommentary(trend, annualChange),
    notairesData: {
      annualChange,
      quarterlyChange: data.variation_trimestrielle,
      volumeIndex: data.indice_volume,
      source: "Notaires de France",
    },
  };
}

function buildCommentary(trend: string, change: number): string {
  if (trend === "hausse") return `Le marché local affiche une hausse de ${change.toFixed(1)}% sur 12 mois selon les Notaires de France, traduisant une demande soutenue.`;
  if (trend === "baisse") return `Le marché local recule de ${Math.abs(change).toFixed(1)}% sur 12 mois selon les Notaires de France, dans un contexte de moindre demande.`;
  return "Le marché local est globalement stable selon les Notaires de France.";
}

function buildFallbackReading(): MarketReading {
  return {
    trend: "stable",
    supplyDemand: "equilibre",
    commentary: "Données de marché Notaires non disponibles. Analyse basée sur les transactions DVF récentes.",
    notairesData: { source: "Non disponible" },
  };
}
