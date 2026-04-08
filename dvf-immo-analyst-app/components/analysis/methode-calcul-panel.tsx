import React from "react";
import { DVFStats } from "@/types/dvf";
import { ActiveListing } from "@/types/listing";
import { Adjustment } from "@/types/valuation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPsm, formatPrice } from "@/lib/utils";
import { CheckCircle2, XCircle, Info } from "lucide-react";

interface Props {
  dvfStats: DVFStats | null;
  listings: ActiveListing[];
  adjustments: Adjustment[];
  surface: number;
  valuationPsm: number;
  valuationLow: number;
  valuationHigh: number;
  valuationMid: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function pct(factor: number): string {
  return (factor >= 0 ? "+" : "") + (factor * 100).toFixed(1) + "%";
}

function SectionTitle({ letter, title }: { letter: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
        {letter}
      </span>
      <h3 className="font-semibold text-sm">{title}</h3>
    </div>
  );
}

function DataTable({ rows }: { rows: { label: string; value: React.ReactNode; bold?: boolean }[] }) {
  return (
    <table className="w-full text-sm border-collapse">
      <tbody>
        {rows.map(({ label, value, bold }) => (
          <tr key={label} className="border-b last:border-0">
            <td className="py-1.5 text-muted-foreground pr-4 w-1/2">{label}</td>
            <td className={["py-1.5 text-right", bold ? "font-semibold" : "font-medium"].join(" ")}>
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function MethodeCalculPanel({
  dvfStats,
  listings,
  adjustments,
  surface,
  valuationPsm,
  valuationLow,
  valuationHigh,
  valuationMid,
}: Props) {

  // ── Section A: DVF Pipeline ─────────────────────────────────────────────────
  const dvfRetenues = dvfStats?.count ?? 0;
  const dvfExclus = dvfStats?.excludedCount ?? 0;
  const dvfBrutes = dvfRetenues + dvfExclus;
  const dvfPsmRef = dvfStats?.weightedAvgPsm ?? dvfStats?.medianPsm ?? 0;
  const hasWeightedAvg = dvfStats?.weightedAvgPsm != null;

  // ── Section B: Listings Pipeline ────────────────────────────────────────────
  const totalListings = listings.length;
  const listingOutliers = listings.filter((l) => l.outlier).length;
  const cleanListings = listings.filter((l) => !l.outlier);
  const listingAvgPsm = cleanListings.length > 0
    ? cleanListings.reduce((s, l) => s + l.pricePsm, 0) / cleanListings.length
    : 0;
  const listingAdjPsm = Math.round(listingAvgPsm * 0.96);

  // ── Section C: Reconciliation ───────────────────────────────────────────────
  const marketPressureAdj = dvfStats?.marketPressure?.adjustment ?? 0;
  const dvfAdjPsm = Math.round(dvfPsmRef * (1 + marketPressureAdj));

  // Determine weights (mirrors logic in valuation.ts)
  let dvfWeight = 0;
  let listingsWeight = 0;
  if (dvfRetenues >= 5 && cleanListings.length > 0) {
    dvfWeight = 0.70;
    listingsWeight = 0.30;
  } else if (dvfRetenues >= 5) {
    dvfWeight = 1.0;
    listingsWeight = 0;
  } else if (cleanListings.length >= 3) {
    dvfWeight = 0;
    listingsWeight = 1.0;
  } else if (dvfRetenues > 0 && cleanListings.length > 0) {
    dvfWeight = 0.70;
    listingsWeight = 0.30;
  } else if (dvfRetenues > 0) {
    dvfWeight = 1.0;
    listingsWeight = 0;
  }

  const basePsm = Math.round(dvfAdjPsm * dvfWeight + listingAdjPsm * listingsWeight);

  // ── Adjustments table ───────────────────────────────────────────────────────
  const findAdj = (categories: string[], labelFragment?: string) => {
    if (labelFragment) {
      return adjustments.find((a) =>
        a.label.toLowerCase().includes(labelFragment.toLowerCase())
      ) ?? null;
    }
    return adjustments.find((a) => categories.includes(a.category)) ?? null;
  };

  const adjRows: { critere: string; adj: Adjustment | null }[] = [
    { critere: "État du bien",    adj: findAdj(["condition"]) },
    { critere: "DPE (énergie)",  adj: findAdj(["energy"]) },
    { critere: "Étage",          adj: findAdj(["floor"]) },
    { critere: "Parking",        adj: findAdj([], "parking") },
    { critere: "Garage",         adj: findAdj([], "garage") },
    { critere: "Balcon",         adj: findAdj([], "balcon") },
    { critere: "Terrasse",       adj: findAdj([], "terrasse") },
    { critere: "Cave",           adj: findAdj([], "cave") },
    { critere: "Piscine",        adj: findAdj([], "piscine") },
    { critere: "Orientation",    adj: findAdj(["orientation"]) },
    { critere: "Vue",            adj: findAdj(["view"]) },
    { critere: "Jardin / terrain", adj: findAdj([], "jardin") ?? findAdj([], "terrain") },
    { critere: "Mitoyenneté",    adj: findAdj(["mitoyennete"]) ?? findAdj([], "mitoyenne") },
    { critere: "Nuisances sonores",      adj: findAdj([], "nuisances sonores") },
    { critere: "Copropriété dégradée",   adj: findAdj([], "copropriété dégradée") },
    { critere: "Exposition Nord",        adj: findAdj([], "exposition nord") },
    { critere: "RDC sans extérieur",     adj: findAdj([], "rdc sans extérieur") },
  ];

  // Ajustements de proximité — affichés individuellement après les critères fixes
  const proximityRows: { critere: string; adj: Adjustment }[] = adjustments
    .filter((a) => a.category === "proximity")
    .map((a) => ({ critere: a.label, adj: a }));

  const totalAdjFactor = adjustments.reduce((s, a) => s + a.factor, 0);
  const spread = Math.abs(valuationHigh - valuationLow) / valuationMid;
  const isIndicative = spread > 0.10;

  return (
    <div className="space-y-4">
      {/* ── Section A : DVF ── */}
      <Card>
        <CardHeader className="pb-3">
          <SectionTitle letter="A" title="Données DVF (transactions signées)" />
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Pipeline table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-1.5 text-left font-medium">Étape</th>
                  <th className="py-1.5 text-right font-medium">Transactions</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-1.5">Mutations dans le périmètre</td>
                  <td className="py-1.5 text-right font-medium">{dvfBrutes}</td>
                </tr>
                <tr className="border-b">
                  <td className="py-1.5 text-orange-600 flex items-center gap-1.5">
                    ⚠️ Valeurs aberrantes exclues (IQR×2 + médiane ±40%)
                  </td>
                  <td className="py-1.5 text-right font-medium text-orange-600">
                    {dvfExclus > 0 ? `− ${dvfExclus}` : "0"}
                  </td>
                </tr>
                <tr className="bg-green-50">
                  <td className="py-1.5 font-semibold text-green-700">✓ Transactions retenues</td>
                  <td className="py-1.5 text-right font-bold text-green-700">{dvfRetenues}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Indexation note */}
          {dvfStats?.isIndexed && (
            <div className="flex items-start gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-700">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Tous les prix sont indexés en valeur 2025 via les indices notariaux Haute-Savoie
                (correction du biais temporel 2020–2025).
              </span>
            </div>
          )}

          {/* Prix DVF retenu */}
          <DataTable rows={[
            {
              label: "Médiane DVF (indexée 2025)",
              value: dvfStats ? formatPsm(dvfStats.medianPsm) : "—",
            },
            ...(hasWeightedAvg ? [{
              label: "Moy. pondérée retenue (distance × surface × récence)",
              value: <span className="text-primary font-bold">{formatPsm(dvfPsmRef)}</span>,
              bold: true,
            }] : []),
            ...(marketPressureAdj !== 0 ? [{
              label: `Pression marché appliquée (${pct(marketPressureAdj)})`,
              value: formatPsm(dvfAdjPsm),
            }] : []),
          ]} />
          <div className="flex justify-between items-center pt-1 border-t">
            <span className="text-sm font-semibold">Prix DVF retenu</span>
            <Badge className="text-sm bg-primary text-primary-foreground">{formatPsm(dvfAdjPsm)}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* ── Section B : Annonces actives ── */}
      <Card>
        <CardHeader className="pb-3">
          <SectionTitle letter="B" title="Annonces actives (marché affiché)" />
        </CardHeader>
        <CardContent className="space-y-4">
          {totalListings === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Aucune annonce active trouvée dans ce secteur.
            </p>
          ) : (
            <>
              {/* Pipeline table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-1.5 text-left font-medium">Étape</th>
                      <th className="py-1.5 text-right font-medium">Annonces</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-1.5">Annonces trouvées</td>
                      <td className="py-1.5 text-right font-medium">{totalListings}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-1.5 text-orange-600">
                        ⚠️ Valeurs aberrantes exclues (IQR×2 + médiane ±40%)
                      </td>
                      <td className="py-1.5 text-right font-medium text-orange-600">
                        {listingOutliers > 0 ? `− ${listingOutliers}` : "0"}
                      </td>
                    </tr>
                    <tr className="bg-green-50">
                      <td className="py-1.5 font-semibold text-green-700">✓ Annonces retenues</td>
                      <td className="py-1.5 text-right font-bold text-green-700">{cleanListings.length}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <DataTable rows={[
                {
                  label: "Prix affiché moyen (annonces retenues)",
                  value: listingAvgPsm > 0 ? formatPsm(Math.round(listingAvgPsm)) : "—",
                },
                {
                  label: "Abattement vendeur −4%",
                  value: listingAdjPsm > 0 ? formatPsm(listingAdjPsm) : "—",
                  bold: true,
                },
              ]} />
              <div className="flex justify-between items-center pt-1 border-t">
                <span className="text-sm font-semibold">Prix annonces retenu</span>
                <Badge variant="outline" className="text-sm border-primary text-primary">
                  {listingAdjPsm > 0 ? formatPsm(listingAdjPsm) : "—"}
                </Badge>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Section C : Réconciliation finale ── */}
      <Card>
        <CardHeader className="pb-3">
          <SectionTitle letter="C" title="Réconciliation finale" />
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Pondération DVF / Annonces */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Pondération des sources
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="py-1.5 text-left font-medium">Source</th>
                    <th className="py-1.5 text-right font-medium">Prix €/m²</th>
                    <th className="py-1.5 text-right font-medium">Poids</th>
                    <th className="py-1.5 text-right font-medium">Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-1.5">DVF — moy. pondérée</td>
                    <td className="py-1.5 text-right font-medium">{dvfAdjPsm > 0 ? formatPsm(dvfAdjPsm) : "—"}</td>
                    <td className="py-1.5 text-right font-medium">{(dvfWeight * 100).toFixed(0)} %</td>
                    <td className="py-1.5 text-right font-medium">{dvfAdjPsm > 0 ? formatPsm(Math.round(dvfAdjPsm * dvfWeight)) : "—"}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1.5">Annonces actives (−4%)</td>
                    <td className="py-1.5 text-right font-medium">{listingAdjPsm > 0 ? formatPsm(listingAdjPsm) : "—"}</td>
                    <td className="py-1.5 text-right font-medium">{(listingsWeight * 100).toFixed(0)} %</td>
                    <td className="py-1.5 text-right font-medium">{listingAdjPsm > 0 ? formatPsm(Math.round(listingAdjPsm * listingsWeight)) : "—"}</td>
                  </tr>
                  <tr className="bg-blue-50">
                    <td className="py-1.5 font-semibold text-blue-700" colSpan={3}>Prix de base (avant ajustements)</td>
                    <td className="py-1.5 text-right font-bold text-blue-700">{formatPsm(basePsm)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Ajustements qualitatifs */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Ajustements qualitatifs (grille Estim74)
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="py-1.5 text-left font-medium">Critère</th>
                    <th className="py-1.5 text-center font-medium">Présent</th>
                    <th className="py-1.5 text-right font-medium">Facteur</th>
                    <th className="py-1.5 text-right font-medium">Impact €/m²</th>
                  </tr>
                </thead>
                <tbody>
                  {adjRows.map(({ critere, adj }) => {
                    const impact = adj ? Math.round(adj.factor * basePsm) : 0;
                    return (
                      <tr key={critere} className="border-b last:border-0">
                        <td className="py-1.5 text-sm">{critere}</td>
                        <td className="py-1.5 text-center">
                          {adj ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 inline-block" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground/40 inline-block" />
                          )}
                        </td>
                        <td className={[
                          "py-1.5 text-right font-medium",
                          adj && adj.factor > 0 ? "text-green-600" : "",
                          adj && adj.factor < 0 ? "text-red-600" : "",
                          !adj ? "text-muted-foreground" : "",
                        ].join(" ")}>
                          {adj ? pct(adj.factor) : "—"}
                        </td>
                        <td className={[
                          "py-1.5 text-right font-medium",
                          impact > 0 ? "text-green-600" : "",
                          impact < 0 ? "text-red-600" : "",
                          !adj ? "text-muted-foreground" : "",
                        ].join(" ")}>
                          {adj ? (impact >= 0 ? "+" : "") + impact.toLocaleString("fr-FR") + " €/m²" : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {proximityRows.length > 0 && (
                    <>
                      <tr className="bg-blue-50/50">
                        <td colSpan={4} className="py-1 px-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Équipements de proximité
                        </td>
                      </tr>
                      {proximityRows.map(({ critere, adj }) => {
                        const impact = Math.round(adj.factor * basePsm);
                        return (
                          <tr key={critere} className="border-b last:border-0">
                            <td className="py-1.5 text-sm pl-2">{critere}</td>
                            <td className="py-1.5 text-center">
                              <CheckCircle2 className="h-4 w-4 text-green-600 inline-block" />
                            </td>
                            <td className={[
                              "py-1.5 text-right font-medium",
                              adj.factor > 0 ? "text-green-600" : "text-red-600",
                            ].join(" ")}>
                              {pct(adj.factor)}
                            </td>
                            <td className={[
                              "py-1.5 text-right font-medium",
                              impact > 0 ? "text-green-600" : "text-red-600",
                            ].join(" ")}>
                              {(impact >= 0 ? "+" : "") + impact.toLocaleString("fr-FR") + " €/m²"}
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                  {adjustments.length > 0 && (
                    <tr className="bg-gray-50">
                      <td className="py-1.5 font-semibold" colSpan={2}>Total ajustements</td>
                      <td className={[
                        "py-1.5 text-right font-bold",
                        totalAdjFactor >= 0 ? "text-green-700" : "text-red-700",
                      ].join(" ")}>
                        {pct(totalAdjFactor)}
                      </td>
                      <td className={[
                        "py-1.5 text-right font-bold",
                        totalAdjFactor >= 0 ? "text-green-700" : "text-red-700",
                      ].join(" ")}>
                        {(totalAdjFactor >= 0 ? "+" : "") + Math.round(totalAdjFactor * basePsm).toLocaleString("fr-FR")} €/m²
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Résultat final */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Résultat
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Prix final au m²</p>
                <p className="text-xl font-bold text-primary">{formatPsm(valuationPsm)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  × {surface} m² = Estimation totale
                </p>
                <p className="text-xl font-bold">{formatPrice(valuationMid, true)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  Fourchette {isIndicative ? "±15%" : "±8%"}
                </p>
                <p className="text-sm font-semibold">
                  {formatPrice(valuationLow, true)}
                </p>
                <p className="text-xs text-muted-foreground">à</p>
                <p className="text-sm font-semibold">
                  {formatPrice(valuationHigh, true)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
