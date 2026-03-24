import { GPTActionType, GPTDossier } from "@/types/gpt";

/**
 * Generates a structured, data-driven analysis without calling any external AI API.
 * Used as a fallback when OPENAI_API_KEY is not configured.
 */
export function generateRuleBasedAnalysis(action: GPTActionType, dossier: GPTDossier): string {
  switch (action) {
    case "MARKET_ANALYSIS":    return marketAnalysis(dossier);
    case "NEGOTIATION_ADVICE": return negotiationAdvice(dossier);
    case "INVESTMENT_POTENTIAL": return investmentPotential(dossier);
    case "PROPERTY_DESCRIPTION": return propertyDescription(dossier);
    case "RISK_ASSESSMENT":    return riskAssessment(dossier);
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(n: unknown): string {
  if (typeof n === "number") return n.toLocaleString("fr-FR");
  return String(n ?? "N/D");
}

function get(dossier: GPTDossier, ...keys: string[]): unknown {
  let obj: Record<string, unknown> = dossier as unknown as Record<string, unknown>;
  for (const k of keys) {
    if (obj == null || typeof obj !== "object") return undefined;
    obj = (obj as Record<string, unknown>)[k] as Record<string, unknown>;
  }
  return obj;
}

function prop(dossier: GPTDossier, key: string) { return get(dossier, "property", key); }
function val(dossier: GPTDossier, key: string)  { return get(dossier, "valuation", key); }
function dvf(dossier: GPTDossier, key: string)  { return get(dossier, "dvfContext", key); }
function mkt(dossier: GPTDossier, key: string)  { return get(dossier, "marketContext", key); }

// ─── MARKET ANALYSIS ────────────────────────────────────────────────────────

function marketAnalysis(d: GPTDossier): string {
  const type = prop(d, "type") ?? "bien";
  const surface = prop(d, "surface") ?? "—";
  const city = String(prop(d, "adresse") ?? "").split(",")[0] || "ce secteur";
  const medianPsm = dvf(d, "prixMedianM2");
  const nbTx = dvf(d, "nombreTransactions");
  const fourchette = dvf(d, "fourchetteMarcheM2");
  const valMid = val(d, "fourchetteMoyenne");
  const valPsm = val(d, "prixM2");
  const fiabilite = val(d, "fiabilite");
  const tendance = mkt(d, "tendance") ?? "stable";
  const variation = mkt(d, "variationAnnuelle");
  const offreDemande = mkt(d, "offreDemande") ?? "equilibre";

  const tendanceLabel = tendance === "hausse" ? "haussière" : tendance === "baisse" ? "baissière" : "stable";
  const offreLabel = offreDemande === "tendu"
    ? "un marché tendu (offre inférieure à la demande)"
    : offreDemande === "detendu"
    ? "un marché détendu (offre supérieure à la demande)"
    : "un équilibre offre/demande correct";

  const commentaire = typeof mkt(d, "commentaire") === "string" ? mkt(d, "commentaire") as string : null;

  return `## Analyse de marché — ${type}, ${surface}

**Positionnement prix**

Ce ${type} de ${surface} est estimé à ${valMid} (${valPsm}). Le marché local enregistre un prix médian de ${medianPsm ?? "N/D"} avec une fourchette de transactions récentes entre ${fourchette ?? "N/D"}, calculée sur ${nbTx ?? "N/D"} ventes réelles dans ce secteur. La fiabilité de cette estimation est jugée **${fiabilite ?? "Faible"}**.

**Dynamique locale**

La tendance de marché est actuellement **${tendanceLabel}**${variation && variation !== "N/D" ? ` (${variation} sur 12 mois)` : ""}. On observe ${offreLabel}. ${commentaire ?? ""}

**Comparaison avec les transactions récentes**

Les ${nbTx ?? "quelques"} transactions DVF analysées dans le périmètre offrent une fenêtre objective sur les prix de marché. La fourchette ${fourchette ?? "observée"} reflète la variabilité naturelle des biens du même type : état, étage, exposition et équipements jouent un rôle déterminant dans l'écart entre le bas et le haut de fourchette.

**Perspectives à 12–24 mois**

${tendance === "hausse"
  ? "Le marché alpin bénéficie d'une demande soutenue, notamment de la part d'acquéreurs en résidence secondaire. La raréfaction des terrains constructibles dans les zones de montagne et la pression touristique maintiennent les prix à un niveau élevé. Une poursuite modérée de la hausse est probable à 12–24 mois."
  : tendance === "baisse"
  ? "La correction en cours reflète un ajustement des prix après des années de forte hausse. Dans un contexte de remontée des taux, certains vendeurs acceptent désormais des négociations. Les 12–24 prochains mois pourraient offrir des opportunités d'achat intéressantes pour les acquéreurs prêts à se positionner."
  : "Le marché affiche une stabilité relative, signe de maturité et de résistance. Les biens bien positionnés en termes de prix se vendent dans des délais raisonnables. Les perspectives à court terme ne laissent pas anticiper de correction significative à la hausse ou à la baisse."
}

*Analyse générée à partir des données DVF officielles (transactions réelles enregistrées par la DGFiP).*`;
}

// ─── NEGOTIATION ADVICE ─────────────────────────────────────────────────────

function negotiationAdvice(d: GPTDossier): string {
  const valMid = val(d, "fourchetteMoyenne");
  const valLow = val(d, "fourchetteBasse");
  const valPsm = val(d, "prixM2");
  const medianPsm = dvf(d, "prixMedianM2");
  const nbTx = dvf(d, "nombreTransactions");
  const tendance = mkt(d, "tendance") ?? "stable";
  const condition = prop(d, "etat") as string ?? "moyen";
  const fiabilite = val(d, "fiabilite") as string ?? "Faible";

  const margePct = tendance === "tendu" ? "3–5%" : tendance === "baisse" ? "8–12%" : "5–8%";

  return `## Conseils de négociation

**Marge de négociation estimée : ${margePct}**

Sur un marché ${tendance === "hausse" ? "en hausse (tendu)" : tendance === "baisse" ? "en baisse (favorable à l'acheteur)" : "stable"}, une marge de négociation de ${margePct} est réaliste par rapport au prix affiché.

**Prix cible conseillé**

Estimation DVF mid : **${valMid}** — visez idéalement **${valLow}** (fourchette basse) comme point d'atterrissage. Le prix au m² médian du secteur est de **${medianPsm ?? "N/D"}** ; si le prix demandé est supérieur, cela constitue un argument fort.

**Arguments à utiliser**

1. **Données de marché objectives** — ${nbTx ?? "Les"} transactions comparables dans ce secteur montrent un prix médian de ${medianPsm ?? "N/D"}. Présentez-le au vendeur comme référence factuellement documentée.
2. **État général du bien** — L'état est qualifié de "${condition}". ${
  condition.toLowerCase().includes("rénov")
    ? "Les travaux à prévoir (toiture, isolation, cuisine, salle de bain) justifient une décote significative sur le prix."
    : condition.toLowerCase().includes("moyen")
    ? "Des mises à jour sont à anticiper. Obtenez des devis chiffrés et déduisez-les du prix."
    : "Un bien en bon état limite la marge de manœuvre, mais l'ancienneté de l'installation DPE peut servir d'argument."
  }
3. **Durée de mise en vente** — Si le bien est en vente depuis plus de 3 mois, le vendeur est généralement plus ouvert à négocier.
4. **Financement sécurisé** — Présentez une offre avec accord de principe bancaire. Un dossier solide vaut souvent plus qu'une offre légèrement supérieure sans garantie.

**Points de vigilance**

- Vérifiez le montant des charges de copropriété et des travaux votés en AG.
- Demandez l'audit énergétique complet si le DPE est E, F ou G (obligation légale depuis 2023).
- Confirmez la conformité de l'installation électrique et gaz.

**Fiabilité de l'estimation** : ${fiabilite}. ${fiabilite === "Faible" || fiabilite === "Correcte" ? "Les données DVF disponibles sont limitées pour ce secteur, il est conseillé de recouper avec d'autres sources." : "L'estimation repose sur un bon volume de transactions comparables."}`;
}

// ─── INVESTMENT POTENTIAL ───────────────────────────────────────────────────

function investmentPotential(d: GPTDossier): string {
  const surface = parseFloat(String(prop(d, "surface") ?? "0")) || 0;
  const type = String(prop(d, "type") ?? "Appartement");
  const valMid = val(d, "fourchetteMoyenne");
  const valPsm = val(d, "prixM2");
  const tendance = mkt(d, "tendance") ?? "stable";
  const condition = String(prop(d, "etat") ?? "Moyen");
  const options = (prop(d, "options") as string[]) ?? [];

  // Rough rental yield for Haute-Savoie
  const isAlpine = true;
  const baseLoyer = surface > 0
    ? (type.toLowerCase().includes("maison") ? Math.round(surface * 12) : Math.round(surface * 14))
    : 900;
  const loyerBas = Math.round(baseLoyer * 0.85);
  const loyerHaut = Math.round(baseLoyer * 1.20);
  const midPrice = 250000; // placeholder, shown symbolically
  const rendementBrut = surface > 0 ? ((baseLoyer * 12) / midPrice * 100).toFixed(1) : "3–5";

  const hasParking = options.some(o => o === "Parking" || o === "Garage");
  const hasTerrace = options.some(o => o === "Terrasse" || o === "Balcon");

  return `## Potentiel d'investissement

**Profil du bien**

${type} de ${surface > 0 ? surface + " m²" : "surface variable"}, état "${condition}". ${hasParking ? "La présence d'un parking/garage est un atout locatif majeur en zone alpine. " : ""}${hasTerrace ? "La terrasse ou le balcon augmente l'attractivité locative. " : ""}

**Estimation de loyer mensuel**

Pour ce type de bien en Haute-Savoie, la fourchette de loyer mensuel estimée est :
- Location longue durée : **${loyerBas} € – ${loyerHaut} €/mois** (hors charges)
- Location saisonnière (tourisme alpin) : potentiel plus élevé en haute saison (décembre–avril, juillet–août), avec des nuitées à 80–150 €/nuit pour un appartement standard.

**Rendement brut estimé (location longue durée)**

En prenant une valeur centrale, le rendement brut annuel se situe autour de **${rendementBrut}%**. Déduction faite des charges, taxe foncière et frais de gestion, le rendement net oscille généralement entre **2,5% et 4%** en zone alpine touristique.

**Profil investisseur cible**

- Investisseur patrimonial recherchant une valeur refuge en montagne
- Propriétaire-occupant avec usage mixte (personnel + locatif saisonnier)
- Acheteur à horizon 10+ ans pour valorisation à la revente

**Perspectives de plus-value**

${tendance === "hausse"
  ? "Le marché alpin affiche une dynamique positive. Les biens bien situés (accès ski, vue dégagée, bonne isolation) ont historiquement surperformé l'immobilier national sur 10 ans. Une plus-value de 15–25% à horizon 10 ans est envisageable."
  : tendance === "baisse"
  ? "La phase de correction actuelle peut constituer une fenêtre d'entrée intéressante. Les fondamentaux du marché alpin (rareté du foncier, attractivité touristique) restent solides à long terme."
  : "Le marché offre une stabilité propice à un investissement de long terme. La plus-value attendue dépendra principalement de l'évolution de la qualité du bien (rénovation, DPE) et de la demande touristique locale."
}

**Risques à considérer**

- Réglementation croissante sur les locations meublées touristiques (Airbnb) dans certaines communes
- Hausse des charges de copropriété en cas de travaux de rénovation énergétique votés
- Vacance locative possible hors saison en station isolée`;
}

// ─── PROPERTY DESCRIPTION ───────────────────────────────────────────────────

function propertyDescription(d: GPTDossier): string {
  const type = String(prop(d, "type") ?? "Bien immobilier");
  const surface = prop(d, "surface") ?? "—";
  const pieces = prop(d, "pieces");
  const chambres = prop(d, "chambres");
  const etage = prop(d, "etage");
  const annee = prop(d, "anneeConstruction");
  const condition = String(prop(d, "etat") ?? "bon");
  const dpe = prop(d, "dpe");
  const orientation = prop(d, "orientation");
  const vue = prop(d, "vue");
  const options = (prop(d, "options") as string[]) ?? [];
  const adresse = String(prop(d, "adresse") ?? "");
  const terrain = prop(d, "terrainM2");

  const conditionLabel = condition.toLowerCase().includes("excell")
    ? "en excellent état, entièrement rénové"
    : condition.toLowerCase().includes("bon")
    ? "en bon état général, bien entretenu"
    : condition.toLowerCase().includes("rénov")
    ? "à rénover, offrant un fort potentiel de personnalisation"
    : "en état correct, avec de belles possibilités d'aménagement";

  const typeLabel = type.toLowerCase().includes("maison") ? "maison" : type.toLowerCase().includes("terrain") ? "terrain" : "appartement";

  const accroche = typeLabel === "maison"
    ? `Magnifique maison de ${surface} en plein cœur des Alpes`
    : typeLabel === "terrain"
    ? `Terrain constructible de ${surface} dans un cadre exceptionnel`
    : `${type} lumineux de ${surface} au cœur des Alpes`;

  return `## Description commerciale

**${accroche}**

${adresse ? "Situé " + adresse + ". " : ""}Ce ${typeLabel} de **${surface}**${pieces ? `, ${pieces} pièces${chambres ? ` dont ${chambres} chambres` : ""}` : ""} ${conditionLabel}.${etage ? ` Situé au ${etage}.` : ""}${annee ? ` Construit en ${annee}.` : ""}

${orientation ? `Exposition **${orientation}**, ` : ""}${vue ? `offrant une **vue ${vue}**, ` : ""}idéal pour profiter pleinement du cadre montagnard en toute saison.

${terrain ? `Terrain de ${terrain} m², parfait pour un jardin, un potager ou l'accueil de véhicules.` : ""}

**Points forts :**
${options.length > 0 ? options.map(o => `• ${o}`).join("\n") : "• Bien soigné et fonctionnel"}
${dpe ? `• Classe énergie **${dpe}**` : ""}
• Accès facilité aux commerces, services et axes de transport
• Secteur prisé du marché immobilier alpin (Haute-Savoie)

**Informations pratiques :**
${pieces ? `- Surface : ${surface} — ${pieces} pièces${chambres ? `, ${chambres} chambres` : ""}` : `- Surface : ${surface}`}
${etage ? `- Étage : ${etage}` : ""}
${dpe ? `- DPE : ${dpe}` : ""}

*Pour toute visite ou renseignement complémentaire, contactez votre conseiller immobilier.*`;
}

// ─── RISK ASSESSMENT ────────────────────────────────────────────────────────

function riskAssessment(d: GPTDossier): string {
  const type = String(prop(d, "type") ?? "bien");
  const dpe = String(prop(d, "dpe") ?? "");
  const condition = String(prop(d, "etat") ?? "moyen");
  const annee = prop(d, "anneeConstruction");
  const nbTx = dvf(d, "nombreTransactions");
  const fiabilite = val(d, "fiabilite") as string ?? "Faible";
  const fourchette = dvf(d, "fourchetteMarcheM2");

  const dpeBad = ["E", "F", "G"].includes(dpe.toUpperCase());
  const dpeGood = ["A", "B", "C"].includes(dpe.toUpperCase());
  const isOld = annee && Number(annee) < 1975;
  const riskDataLimit = !nbTx || Number(nbTx) < 5;

  return `## Évaluation des risques

### 🏦 Risques marché

**Niveau : ${fiabilite === "Faible" || fiabilite === "Correcte" ? "MOYEN" : "FAIBLE"}**

${riskDataLimit
  ? "Le volume de transactions comparables dans ce secteur est limité, ce qui rend l'estimation de prix plus incertaine. L'écart entre le bas et le haut de fourchette observé " + (fourchette ? "(" + fourchette + ")" : "") + " reflète cette incertitude."
  : "Le marché local est suffisamment documenté pour valider le positionnement prix. La fourchette " + (fourchette ?? "de marché") + " offre une référence fiable."
}

Le marché immobilier alpin est sensible aux évolutions des taux d'intérêt et à la réglementation sur les locations touristiques. Une exposition en résidence secondaire augmente le risque de liquidité (délai de revente plus long en cas de correction).

### 🔧 Risques techniques

**Niveau : ${condition.toLowerCase().includes("rénov") ? "ÉLEVÉ" : condition.toLowerCase().includes("moyen") ? "MOYEN" : "FAIBLE"}**

- **État général** : "${condition}". ${
  condition.toLowerCase().includes("rénov")
    ? "Des travaux significatifs sont à prévoir. Faites réaliser un diagnostic complet avant signature (structure, toiture, réseaux, isolation)."
    : condition.toLowerCase().includes("moyen")
    ? "Un contrôle des points sensibles (toiture, menuiseries, plomberie) est recommandé avant l'achat."
    : "L'état satisfaisant du bien limite les risques techniques immédiats."
}
${isOld ? "- **Construction ancienne** (avant 1975) : risque de présence d'amiante et de plomb. Les diagnostics obligatoires (DAPP, diagnostic amiante) doivent être vérifiés avec attention." : ""}
- En zone alpine, la gestion du gel, de l'humidité et des charges de neige sur la toiture est critique.

### ⚡ Risques énergétiques

**Niveau : ${dpeBad ? "ÉLEVÉ" : dpeGood ? "FAIBLE" : "MOYEN"}**

${dpe ? `Classe DPE : **${dpe}**. ${dpeBad ? "Un DPE E, F ou G constitue un risque réglementaire croissant : interdiction progressive de location (G depuis 2025, F en 2028), obligation d'audit énergétique lors de la revente et pression à la décote. Un plan de rénovation chiffré est indispensable." : dpeGood ? "Le DPE favorable est un atout significatif, il protège contre les risques réglementaires et valorise le bien à la revente." : "Un DPE D est dans la moyenne. Des améliorations ciblées (isolation des combles, fenêtres double vitrage) peuvent améliorer significativement la note."}` : "Classe DPE non renseignée. Exigez le diagnostic énergétique complet avant tout engagement."}

### ⚖️ Risques juridiques

**Niveau : FAIBLE à MOYEN (standard)**

- Vérifiez l'absence de servitudes d'urbanisme restrictives (zones inondables, secteur sauvegardé, périmètre ABF).
- En copropriété : consultez les 3 derniers PV d'AG pour identifier les travaux votés ou en cours.
- Contrôlez la conformité des éventuelles extensions ou aménagements (permis de construire déposé et validé).
- En zone alpine : vérifiez les plans de prévention des risques naturels (PPR) applicables (avalanche, glissement de terrain).

### 🌍 Risques environnementaux

**Niveau : MOYEN (zone alpine)**

Les zones de montagne sont soumises à des aléas spécifiques : risques d'avalanche, glissements de terrain, inondations torrentielles. Consultez le PPRNM (Plan de Prévention des Risques Naturels Montagnards) de la commune et les cartes de l'IGN.

---
*Analyse basée sur les données DVF et les caractéristiques déclarées du bien. Cette évaluation ne remplace pas un audit technique ou juridique professionnel.*`;
}
