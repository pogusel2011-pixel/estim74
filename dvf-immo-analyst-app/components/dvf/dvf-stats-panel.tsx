import { DVFStats, MarketPressureData } from "@/types/dvf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPsm, formatDate } from "@/lib/utils";
import { Database, TrendingUp } from "lucide-react";

interface Props {
  stats?: DVFStats | null;
  sampleSize?: number | null;
  perimeterKm?: number | null;
  requestedRadiusKm?: number | null;
}

function MarketPressureRow({ mp }: { mp: MarketPressureData }) {
  const gapFormatted = (mp.gapPct >= 0 ? "+" : "") + mp.gapPct.toFixed(1) + "%";
  const adjFormatted = (mp.adjustment >= 0 ? "+" : "") + (mp.adjustment * 100).toFixed(1) + "%";
  const isTight = mp.gapPct >= 0;

  return (
    <div className="pt-2 mt-2 border-t space-y-1.5">
      <div className="flex justify-between text-sm">
        <dt className="text-muted-foreground">Marché affiché (médiane)</dt>
        <dd className="font-medium text-right">{formatPsm(mp.medianListingPsm)}</dd>
      </div>
      <div className="flex justify-between text-sm">
        <dt className="text-muted-foreground">Écart affiché / signé</dt>
        <dd className={["font-medium text-right", isTight ? "text-green-600" : "text-orange-600"].join(" ")}>
          {gapFormatted}
        </dd>
      </div>
      <div className="flex justify-between text-sm">
        <dt className="text-muted-foreground">Ajustement pression marché</dt>
        <dd className={["font-semibold text-right", isTight ? "text-green-600" : "text-orange-600"].join(" ")}>
          {adjFormatted}
        </dd>
      </div>
    </div>
  );
}

export function DVFStatsPanel({ stats, sampleSize, perimeterKm, requestedRadiusKm }: Props) {
  if (!stats) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">Aucune donnée DVF disponible</CardContent>
      </Card>
    );
  }

  const wasExpanded =
    requestedRadiusKm != null &&
    perimeterKm != null &&
    perimeterKm > requestedRadiusKm;

  const perimeterDisplay = perimeterKm ? `${perimeterKm} km` : "—";

  const retainedCount = sampleSize ?? stats.count;
  const excludedCount = stats.excludedCount;
  const transactionsValue =
    excludedCount != null && excludedCount > 0
      ? `${retainedCount} retenue${retainedCount > 1 ? "s" : ""} / ${excludedCount} exclue${excludedCount > 1 ? "s" : ""} ⚠️`
      : String(retainedCount);

  const fsd = stats.fsd ?? stats.stdPsm ?? null;
  const ic95HalfWidth = fsd && fsd > 0 ? Math.round(1.96 * fsd) : null;
  const rawSpread = fsd && fsd > 0 && stats.medianPsm > 0 ? (1.96 * fsd) / stats.medianPsm : null;
  const spreadCapped = rawSpread != null && rawSpread > 0.15;

  const rows: { label: string; value: string; highlight?: boolean; stat?: boolean }[] = [
    { label: "Transactions", value: transactionsValue },
    { label: "Médiane €/m²", value: formatPsm(stats.medianPsm) },
    ...(stats.weightedAvgPsm != null
      ? [{ label: "Moy. pondérée €/m²", value: formatPsm(stats.weightedAvgPsm), highlight: true }]
      : []),
    { label: "Moyenne simple €/m²", value: formatPsm(stats.meanPsm) },
    { label: "Q1 – Q3", value: formatPsm(stats.p25Psm) + " – " + formatPsm(stats.p75Psm) },
    { label: "Min – Max", value: formatPsm(stats.minPsm) + " – " + formatPsm(stats.maxPsm) },
    ...(fsd != null
      ? [{ label: "Écart-type (σ)", value: formatPsm(fsd), stat: true }]
      : []),
    ...(ic95HalfWidth != null
      ? [{ label: "Intervalle de confiance 95 %", value: `± ${formatPsm(ic95HalfWidth)}`, stat: true }]
      : []),
    { label: "Période", value: formatDate(stats.oldestDate) + " – " + formatDate(stats.newestDate) },
    {
      label: "Périmètre",
      value: stats.searchPath
        ? stats.searchPath
        : wasExpanded
          ? `${perimeterDisplay} (demandé : ${requestedRadiusKm} km)`
          : perimeterDisplay,
    },
    { label: "Source", value: stats.source === "csv" ? "CSV local 2020–2025" : stats.source === "api" ? "DVF Live (API)" : "CSV local + DVF Live" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <Database className="h-4 w-4 text-primary shrink-0" />
          Statistiques DVF
          {stats.isIndexed && (
            <Badge variant="outline" className="text-xs font-normal text-emerald-700 border-emerald-400 bg-emerald-50 gap-1">
              <TrendingUp className="h-2.5 w-2.5" />
              Prix indexés 2025
            </Badge>
          )}
          {wasExpanded && (
            <Badge variant="outline" className="ml-auto text-xs font-normal text-amber-600 border-amber-400">
              Rayon élargi à {perimeterKm} km
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Bandeau recherche DVF */}
        {(stats.searchPath || perimeterKm) && (
          <div className="mb-3 px-2.5 py-2 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-800 flex items-start gap-1.5">
            <span className="shrink-0 mt-0.5">🔍</span>
            <span>
              <span className="font-semibold">Recherche&nbsp;: </span>
              {stats.searchPath
                ? stats.searchPath
                : wasExpanded
                  ? `Rayon ${perimeterKm} km (élargi depuis ${requestedRadiusKm} km)`
                  : `Rayon ${perimeterKm} km`}
            </span>
          </div>
        )}
        <dl className="space-y-2">
          {rows.map(({ label, value, highlight, stat }) => (
            <div
              key={label}
              className={[
                "flex justify-between text-sm gap-2",
                highlight ? "bg-primary/5 -mx-1 px-1 py-0.5 rounded" : "",
                stat ? "bg-indigo-50/60 -mx-1 px-1 py-0.5 rounded" : "",
              ].join(" ")}
            >
              <dt className={[
                "shrink-0",
                highlight ? "text-primary font-medium" : "text-muted-foreground",
                stat ? "text-indigo-600 font-medium" : "",
              ].join(" ")}>
                {label}
                {highlight && <span className="ml-1 text-xs font-normal text-primary/70">(retenu)</span>}
              </dt>
              <dd className={[
                "font-medium text-right",
                highlight ? "text-primary" : "",
                stat ? "text-indigo-700" : "",
                label === "Transactions" && excludedCount && excludedCount > 0
                  ? "text-orange-600"
                  : "",
              ].join(" ")}>{value}</dd>
            </div>
          ))}
        </dl>

        {spreadCapped && (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            Fourchette plafonnée à 15 % (dispersion élevée)
          </p>
        )}

        {/* Pression de marché */}
        {stats.marketPressure ? (
          <MarketPressureRow mp={stats.marketPressure} />
        ) : (
          <div className="pt-2 mt-2 border-t">
            <div className="flex justify-between text-sm">
              <dt className="text-muted-foreground">Pression de marché</dt>
              <dd className="text-muted-foreground text-right italic">données indisponibles</dd>
            </div>
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground/70 italic border-t pt-2">
          * Données juin 2025 partielles (enregistrement cadastral en cours)
        </p>
      </CardContent>
    </Card>
  );
}
