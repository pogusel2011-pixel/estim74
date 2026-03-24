import { GPTActionType, GPTDossier } from "@/types/gpt";

const BASE_CONTEXT = (dossier: GPTDossier) => `
Tu es un expert en immobilier français spécialisé sur le marché alpin (Haute-Savoie, Savoie).
Tu analyses le dossier suivant avec rigueur et objectivité.

== BIEN ==
${JSON.stringify(dossier.property, null, 2)}

== ESTIMATION ==
${JSON.stringify(dossier.valuation, null, 2)}

== CONTEXTE DVF (transactions réelles) ==
${JSON.stringify(dossier.dvfContext, null, 2)}

== CONTEXTE MARCHÉ ==
${JSON.stringify(dossier.marketContext, null, 2)}
`;

export function buildPrompt(action: GPTActionType, dossier: GPTDossier): string {
  const context = BASE_CONTEXT(dossier);

  switch (action) {
    case "MARKET_ANALYSIS":
      return context + `
Rédige une analyse de marché complète et professionnelle pour ce bien.
Inclus : positionnement prix, dynamique du marché local, comparaison avec les transactions récentes, perspectives à 12-24 mois.
Format : paragraphes structurés, 400-600 mots, ton expert et factuel.`;

    case "NEGOTIATION_ADVICE":
      return context + `
Fournis des conseils de négociation précis pour un acheteur intéressé par ce bien.
Inclus : marge de négociation estimée, arguments à utiliser, points de vigilance, prix cible conseillé.
Format : conseils numérotés, concis et actionables, 300-400 mots.`;

    case "INVESTMENT_POTENTIAL":
      return context + `
Évalue le potentiel d'investissement de ce bien (rendement locatif potentiel, plus-value, risques).
Inclus : fourchette de loyer estimée, rendement brut/net, profil investisseur cible, horizon de revente.
Format : analyse structurée avec chiffres, 400-500 mots.`;

    case "PROPERTY_DESCRIPTION":
      return context + `
Rédige une description commerciale percutante pour ce bien, utilisable dans une annonce immobilière.
Mets en valeur les atouts, utilise un vocabulaire séduisant mais honnête.
Format : accroche + corps + points forts en bullet, 200-300 mots.`;

    case "RISK_ASSESSMENT":
      return context + `
Identifie et évalue les risques liés à ce bien et à son acquisition.
Inclus : risques juridiques potentiels, risques marché, risques techniques (état du bien, énergie), risques environnementaux.
Format : risques par catégorie, niveau (faible/moyen/élevé), 300-400 mots.`;
  }
}

export const GPT_ACTION_LABELS: Record<GPTActionType, string> = {
  MARKET_ANALYSIS: "Analyse de marché",
  NEGOTIATION_ADVICE: "Conseils de négociation",
  INVESTMENT_POTENTIAL: "Potentiel d'investissement",
  PROPERTY_DESCRIPTION: "Description commerciale",
  RISK_ASSESSMENT: "Évaluation des risques",
};
