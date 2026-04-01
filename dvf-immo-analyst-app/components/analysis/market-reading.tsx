import { MarketReading as MarketReadingType } from "@/types/analysis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, BarChart2, AlertTriangle, CheckCircle2, Database, Building2 } from "lucide-react";

interface Props { marketReading?: MarketReadingType | null; dvfMedianPsm?: number | null; propertyType?: string; }

function fmtPct(v: number) {
  return (v > 0 ? "+" : "") + v.toFixed(1) + "%";
}
function fmtPsm(v: number) {
  return v.toLocaleString("fr-FR") + " €/m²";
}

export function MarketReading({ marketReading, dvfMedianPsm, propertyType }: Props) {
  if (!marketReading) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">Données marché non disponibles</CardContent>
      </Card>
    );
  }

  const TrendIcon = marketReading.trend === "hausse" ? TrendingUp : marketReading.trend === "baisse" ? TrendingDown : Minus;
  const trendColor = marketReading.trend === "hausse" ? "text-emerald-600" : marketReading.trend === "baisse" ? "text-red-500" : "text-muted-foreground";
  const supplyLabel = { tendu: "Marché tendu", equilibre: "Marché équilibré", detendu: "Marché détendu" }[marketReading.supplyDemand];
  const supplyVariant = { tendu: "destructive", equilibre: "outline", detendu: "secondary" }[marketReading.supplyDemand] as never;

  const ctrl = marketReading.dvfControl;
  const divergenceAbove10 = ctrl?.divergencePct != null && Math.abs(ctrl.divergencePct) > 10;

  const pp = marketReading.pappersStats;
  const isAppart = propertyType === "APARTMENT";
  const isHouse = propertyType === "HOUSE";
  const ppPrixCommune = isAppart ? pp?.prixM2Apparts : isHouse ? pp?.prixM2Maisons : pp?.prixM2;
  const ppPrixDept = isAppart ? pp?.dept?.prixM2Apparts : isHouse ? pp?.dept?.prixM2Maisons : pp?.dept?.prixM2;
  const ppTypeLabel = isAppart ? "appartements" : isHouse ? "maisons" : "tous types";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-primary" />
            Tendance de marché
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <TrendIcon className={"h-8 w-8 " + trendColor} />
            <div>
              <p className={"text-lg font-bold capitalize " + trendColor}>
                {marketReading.trend === "hausse" ? "En hausse" : marketReading.trend === "baisse" ? "En baisse" : "Stable"}
                {marketReading.trendPercent != null && ` (${fmtPct(marketReading.trendPercent)} / an)`}
              </p>
              <Badge variant={supplyVariant} className="mt-1">{supplyLabel}</Badge>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{marketReading.commentary}</p>
        </CardContent>
      </Card>

      {ctrl && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Contrôle DVF officiel
            </CardTitle>
            <p className="text-xs text-muted-foreground">{ctrl.source}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {ctrl.trend6m != null && (
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Tendance 6 mois</p>
                  <p className={`text-lg font-bold ${ctrl.trend6m > 0 ? "text-emerald-600" : ctrl.trend6m < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                    {fmtPct(ctrl.trend6m)}
                  </p>
                  {ctrl.count6m != null && (
                    <p className="text-xs text-muted-foreground mt-0.5">{ctrl.count6m} vente{ctrl.count6m > 1 ? "s" : ""} signée{ctrl.count6m > 1 ? "s" : ""}</p>
                  )}
                </div>
              )}
              {ctrl.trend12m != null && (
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Tendance 12 mois</p>
                  <p className={`text-lg font-bold ${ctrl.trend12m > 0 ? "text-emerald-600" : ctrl.trend12m < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                    {fmtPct(ctrl.trend12m)}
                  </p>
                  {ctrl.count12m != null && (
                    <p className="text-xs text-muted-foreground mt-0.5">{ctrl.count12m} vente{ctrl.count12m > 1 ? "s" : ""} signée{ctrl.count12m > 1 ? "s" : ""}</p>
                  )}
                </div>
              )}
              {ctrl.trend6m == null && ctrl.trend12m == null && (
                <div className="col-span-2 text-sm text-muted-foreground italic">
                  Données insuffisantes sur ce secteur pour calculer la tendance (moins de 5 ventes sur la période).
                </div>
              )}
            </div>

            {(ctrl.communeMedianPsm != null || ctrl.deptMedianPsm != null) && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Comparaison locale / département 74</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {ctrl.communeMedianPsm != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Médiane locale (12 mois)</p>
                      <p className="font-bold">{fmtPsm(ctrl.communeMedianPsm)}</p>
                    </div>
                  )}
                  {ctrl.deptMedianPsm != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Médiane dép. 74</p>
                      <p className="font-bold">{fmtPsm(ctrl.deptMedianPsm)}</p>
                    </div>
                  )}
                </div>

                {ctrl.divergencePct != null && (
                  divergenceAbove10 ? (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">
                          Écart DVF local / département : {fmtPct(ctrl.divergencePct)}
                        </p>
                        <p className="text-xs text-amber-700 mt-0.5">
                          {ctrl.divergencePct > 0
                            ? "Ce secteur se traite significativement au-dessus de la moyenne départementale."
                            : "Ce secteur se traite significativement en dessous de la moyenne départementale."}
                          {" "}Vérifier la cohérence avec les comparables retenus.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-emerald-700 mt-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Secteur cohérent avec la moyenne départementale ({fmtPct(ctrl.divergencePct)})
                    </div>
                  )
                )}
              </div>
            )}

            {dvfMedianPsm != null && ctrl.communeMedianPsm != null && dvfMedianPsm !== ctrl.communeMedianPsm && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  Médiane DVF de l&apos;estimation (rayon retenu) : <span className="font-medium text-foreground">{fmtPsm(dvfMedianPsm)}</span>
                  <span className="ml-2 text-muted-foreground">vs commune (12 mois) : {fmtPsm(ctrl.communeMedianPsm)}</span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {pp && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-500" />
              Prix de marché — Pappers Immobilier
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {pp.source === "commune" ? pp.commune : "Haute-Savoie (dép. 74)"} · {ppTypeLabel}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {ppPrixCommune != null && (
                <div className="bg-blue-50/60 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">
                    Médiane {pp.source === "commune" ? pp.commune : "Haute-Savoie"}
                  </p>
                  <p className="text-lg font-bold text-blue-700">{fmtPsm(ppPrixCommune)}</p>
                  {pp.variation1An != null && (
                    <p className={`text-xs mt-0.5 font-medium ${pp.variation1An > 0 ? "text-emerald-600" : pp.variation1An < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                      {fmtPct(pp.variation1An)} / an
                    </p>
                  )}
                </div>
              )}
              {ppPrixDept != null && (
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Médiane Haute-Savoie</p>
                  <p className="text-lg font-bold">{fmtPsm(ppPrixDept)}</p>
                  {pp.dept?.variation1An != null && (
                    <p className={`text-xs mt-0.5 font-medium ${pp.dept.variation1An > 0 ? "text-emerald-600" : pp.dept.variation1An < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                      {fmtPct(pp.dept.variation1An)} / an
                    </p>
                  )}
                </div>
              )}
            </div>

            {pp.nbTransactions1An != null && (
              <p className="text-xs text-muted-foreground">
                Volume : <span className="font-medium text-foreground">{pp.nbTransactions1An.toLocaleString("fr-FR")} transactions</span> sur 12 mois
              </p>
            )}

            {ppPrixCommune != null && ppPrixDept != null && (() => {
              const ecart = ((ppPrixCommune - ppPrixDept) / ppPrixDept) * 100;
              return (
                <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${Math.abs(ecart) > 10 ? "bg-amber-50 border border-amber-200 text-amber-800" : "bg-emerald-50/60 text-emerald-700"}`}>
                  {Math.abs(ecart) > 10
                    ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                  <span>
                    {pp.commune} {ecart > 0 ? "au-dessus" : "en dessous"} de la médiane 74 ({ecart > 0 ? "+" : ""}{ecart.toFixed(1)}%)
                  </span>
                </div>
              );
            })()}

            <p className="text-xs text-muted-foreground/70">Source : immobilier.pappers.fr</p>
          </CardContent>
        </Card>
      )}

      {marketReading.notairesData && !ctrl && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">Source : {marketReading.notairesData.source}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            {marketReading.notairesData.annualChange != null && (
              <div><p className="text-muted-foreground">Variation annuelle</p><p className="font-bold">{fmtPct(marketReading.notairesData.annualChange)}</p></div>
            )}
            {marketReading.notairesData.quarterlyChange != null && (
              <div><p className="text-muted-foreground">Variation trimestrielle</p><p className="font-bold">{fmtPct(marketReading.notairesData.quarterlyChange)}</p></div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
