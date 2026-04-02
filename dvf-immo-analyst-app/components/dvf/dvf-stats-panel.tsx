import { DVFStats } from "@/types/dvf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPsm, formatDate } from "@/lib/utils";
import { Database, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  stats?: DVFStats | null;
  sampleSize?: number | null;
  perimeterKm?: number | null;
  requestedRadiusKm?: number | null;
  trend12m?: number | null;
}

export function DVFStatsPanel({ stats, sampleSize, perimeterKm, requestedRadiusKm, trend12m }: Props) {
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

  const retainedCount = sampleSize ?? stats.count;
  const excludedCount = stats.excludedCount;
  const fsd = stats.fsd ?? stats.stdPsm ?? null;

  const dvfPsm = stats.weightedAvgPsm ?? stats.medianPsm;
  const mktAdj = stats.marketPressure?.adjustment ?? 0;
  const dvfAdjPsm = Math.round(dvfPsm * (1 + mktAdj));

  const hasListings = !!stats.marketPressure;
  const listingAdjPsm = stats.marketPressure
    ? Math.round(stats.marketPressure.medianListingPsm * 0.96)
    : 0;

  const dvfW = hasListings && retainedCount >= 5 ? 0.70 : hasListings ? 0.70 : 1.0;
  const lstW = hasListings ? 1 - dvfW : 0;
  const basePsm = Math.round(dvfAdjPsm * dvfW + listingAdjPsm * lstW);

  const perimeterDisplay = perimeterKm
    ? wasExpanded
      ? `${perimeterKm} km (élargi depuis ${requestedRadiusKm} km)`
      : `${perimeterKm} km`
    : "—";

  const searchDisplay = stats.searchPath ?? perimeterDisplay;

  const ic95HalfWidth = fsd && fsd > 0 ? Math.round(1.96 * fsd) : null;
  const rawSpread = fsd && fsd > 0 && stats.medianPsm > 0 ? (1.96 * fsd) / stats.medianPsm : null;
  const spreadCapped = rawSpread != null && rawSpread > 0.15;

  const periodMonths = (() => {
    if (!stats.oldestDate || !stats.newestDate) return null;
    const a = new Date(stats.oldestDate);
    const b = new Date(stats.newestDate);
    return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  })();

  const TrendIcon = trend12m == null ? null : trend12m > 0 ? TrendingUp : trend12m < 0 ? TrendingDown : Minus;
  const trendColor = trend12m == null ? "" : trend12m > 0 ? "text-green-600" : trend12m < 0 ? "text-red-500" : "text-muted-foreground";

  return (
    <Card className="shadow-sm">
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

      <CardContent className="space-y-4">

        {/* ── Bandeau périmètre ── */}
        {searchDisplay && (
          <div className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-800 flex items-start gap-2">
            <span className="shrink-0 mt-0.5">🔍</span>
            <span><span className="font-semibold">Recherche&nbsp;: </span>{searchDisplay}</span>
          </div>
        )}

        {/* ── Tableau de prix ── */}
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left font-medium text-muted-foreground px-3 py-2">Source</th>
                <th className="text-right font-medium text-muted-foreground px-3 py-2">Prix/m²</th>
                <th className="text-right font-medium text-muted-foreground px-3 py-2 w-16">Poids</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/60">
                <td className="px-3 py-2 text-foreground">DVF pondéré
                  {mktAdj !== 0 && (
                    <span className={["ml-1.5 text-xs", mktAdj > 0 ? "text-green-600" : "text-orange-600"].join(" ")}>
                      ({mktAdj > 0 ? "+" : ""}{Math.round(mktAdj * 100)}% marché)
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{formatPsm(dvfAdjPsm)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{Math.round(dvfW * 100)}&nbsp;%</td>
              </tr>
              {hasListings && (
                <tr className="border-b border-border/60">
                  <td className="px-3 py-2 text-foreground">Annonces actives <span className="text-xs text-muted-foreground">(-4%)</span></td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatPsm(listingAdjPsm)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{Math.round(lstW * 100)}&nbsp;%</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-primary/5 border-t-2 border-primary/20">
                <td className="px-3 py-2.5 font-semibold text-primary">
                  Prix de base
                  <span className="ml-1.5 text-xs font-normal text-primary/70">retenu</span>
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-primary tabular-nums text-base">{formatPsm(basePsm)}</td>
                <td className="px-3 py-2.5" />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Blocs statistiques ── */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">

          <StatBlock label="Médiane DVF" value={formatPsm(stats.medianPsm)} />

          <StatBlock
            label="Écart-type (σ)"
            value={fsd ? formatPsm(fsd) : "—"}
            sub={ic95HalfWidth ? `IC 95 % ± ${formatPsm(ic95HalfWidth)}` : undefined}
            warn={spreadCapped}
          />

          <StatBlock
            label="Nb transactions"
            value={String(retainedCount)}
            sub={excludedCount && excludedCount > 0 ? `${excludedCount} exclue${excludedCount > 1 ? "s" : ""}` : undefined}
            subWarn={!!(excludedCount && excludedCount > 0)}
          />

          <StatBlock
            label="Période"
            value={periodMonths ? `${periodMonths} mois` : "—"}
            sub={
              stats.oldestDate && stats.newestDate
                ? formatDate(stats.oldestDate) + " – " + formatDate(stats.newestDate)
                : undefined
            }
          />

          {(trend12m != null) && (
            <StatBlock
              label="Tendance 12 mois"
              value={
                <span className={["font-semibold", trendColor].join(" ")}>
                  {TrendIcon && <TrendIcon className={["inline h-3.5 w-3.5 mr-0.5 -mt-0.5", trendColor].join(" ")} />}
                  {trend12m > 0 ? "+" : ""}{trend12m.toFixed(1)}&nbsp;%
                </span>
              }
            />
          )}

          <StatBlock
            label="Périmètre retenu"
            value={perimeterKm ? `${perimeterKm} km` : "—"}
          />

        </div>

        {spreadCapped && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
            Fourchette plafonnée à 15 % — dispersion élevée, estimation indicative
          </p>
        )}

        {/* ── Pression de marché détail ── */}
        {stats.marketPressure && (
          <div className="pt-3 border-t space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pression de marché</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Médiane annonces</span>
              <span className="font-medium">{formatPsm(stats.marketPressure.medianListingPsm)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Écart affiché / signé</span>
              <span className={["font-medium", stats.marketPressure.gapPct >= 0 ? "text-green-600" : "text-orange-600"].join(" ")}>
                {stats.marketPressure.gapPct >= 0 ? "+" : ""}{stats.marketPressure.gapPct.toFixed(1)}&nbsp;%
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Ajustement appliqué</span>
              <span className={["font-semibold", stats.marketPressure.adjustment >= 0 ? "text-green-600" : "text-orange-600"].join(" ")}>
                {stats.marketPressure.adjustment >= 0 ? "+" : ""}{(stats.marketPressure.adjustment * 100).toFixed(1)}&nbsp;%
              </span>
            </div>
          </div>
        )}

        {!stats.marketPressure && (
          <div className="pt-3 border-t">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Pression de marché</span>
              <span className="text-muted-foreground italic">données indisponibles</span>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground/60 italic border-t pt-2">
          * Données juin 2025 partielles (enregistrement cadastral en cours)
        </p>
      </CardContent>
    </Card>
  );
}

function StatBlock({
  label,
  value,
  sub,
  warn,
  subWarn,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  warn?: boolean;
  subWarn?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground leading-tight">{label}</p>
      <p className={["text-sm font-semibold leading-tight", warn ? "text-amber-600" : ""].join(" ")}>
        {value}
      </p>
      {sub && (
        <p className={["text-xs leading-tight", subWarn ? "text-orange-500" : "text-muted-foreground/70"].join(" ")}>
          {sub}
        </p>
      )}
    </div>
  );
}
