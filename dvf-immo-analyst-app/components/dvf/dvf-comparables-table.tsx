"use client";
import { DVFComparable } from "@/types/dvf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPrice, formatPsm, formatDateShort } from "@/lib/utils";
import { Table2, Star, AlertTriangle, TrendingUp } from "lucide-react";
import { useState, useEffect } from "react";

interface Props {
  comparables: DVFComparable[];
  hasLiveData?: boolean;
}

function SourceBadge({ source }: { source?: "csv" | "live" | "dvf-live" }) {
  if (source === "dvf-live") {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 whitespace-nowrap">
        DVF Live
      </span>
    );
  }
  if (source === "live") {
    return (
      <span className="inline-flex items-center rounded-full border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 whitespace-nowrap">
        Pappers
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 whitespace-nowrap">
      Local
    </span>
  );
}

function TopBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full border border-blue-400 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 whitespace-nowrap">
      <Star className="h-2.5 w-2.5 fill-blue-400 text-blue-400" />
      Comparable clé
    </span>
  );
}

function OutlierBadge() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-0.5 rounded-full border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 cursor-help whitespace-nowrap">
            <AlertTriangle className="h-2.5 w-2.5" />
            Outlier exclu
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          Cette vente est exclue du calcul de référence : son prix/m² s'écarte de plus de 40% de la médiane locale ou dépasse les bornes IQR×2. Elle reste visible pour transparence.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ScoreIndicator({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const colorClass =
    score >= 0.7
      ? "bg-green-100 border-green-400 text-green-700"
      : score >= 0.4
      ? "bg-amber-100 border-amber-400 text-amber-700"
      : "bg-gray-100 border-gray-300 text-gray-500";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center justify-center w-8 h-8 rounded-full border ${colorClass} text-[10px] font-bold cursor-default`}
          >
            {pct}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          Score de pertinence : distance (40%), surface (30%), récence (20%), pièces (10%)
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const HEADERS = ["", "Score", "Date", "Distance", "Nature du bien", "Surface", "Pièces", "Prix DVF", "€/m² (2025)", "Adresse/parcelle", "Source"];
const PAGE_SIZE = 10;

export function DVFComparablesTable({ comparables, hasLiveData }: Props) {
  const [page, setPage] = useState(0);

  const topComparables = comparables.filter((c) => c.topComparable && !c.outlier);
  const normalComparables = comparables.filter((c) => !c.topComparable && !c.outlier);
  const outlierComparables = comparables.filter((c) => c.outlier);

  const allSorted = [...topComparables, ...normalComparables, ...outlierComparables];
  const totalPages = Math.max(1, Math.ceil(allSorted.length / PAGE_SIZE));
  const displayed = allSorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset to first page when comparables change (new analysis)
  useEffect(() => { setPage(0); }, [comparables]);

  const liveCount = comparables.filter((c) => c.source === "live").length;
  const dvfLiveCount = comparables.filter((c) => c.source === "dvf-live").length;
  const outlierCount = outlierComparables.length;
  const retainedCount = comparables.length - outlierCount;

  // Compute date range dynamically from all comparables
  const dates = comparables
    .map((c) => c.date)
    .filter(Boolean)
    .map((d) => new Date(d as string))
    .filter((d) => !isNaN(d.getTime()));

  const newestDate = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
  const oldestDate = dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;

  const newestYear = newestDate ? newestDate.getFullYear() : null;
  const oldestYear = oldestDate ? oldestDate.getFullYear() : null;

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const dataStale = newestDate != null && newestDate < twelveMonthsAgo;

  if (!comparables.length) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          Aucun comparable DVF dans ce périmètre
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <Table2 className="h-4 w-4 text-primary shrink-0" />
          <span>
            Transactions comparables — {retainedCount} retenue{retainedCount > 1 ? "s" : ""}
            {outlierCount > 0 && (
              <span className="text-red-600"> / {outlierCount} outlier{outlierCount > 1 ? "s" : ""} exclu{outlierCount > 1 ? "s" : ""}</span>
            )}
          </span>
          {topComparables.length > 0 && (
            <Badge variant="outline" className="text-xs font-normal text-blue-700 border-blue-300 bg-blue-50 gap-1">
              <Star className="h-2.5 w-2.5 fill-blue-400 text-blue-400" />
              {topComparables.length} comparable{topComparables.length > 1 ? "s" : ""} clé{topComparables.length > 1 ? "s" : ""}
            </Badge>
          )}
          {liveCount > 0 && (
            <Badge variant="outline" className="text-xs font-normal text-blue-600 border-blue-300 bg-blue-50">
              {liveCount} Pappers
            </Badge>
          )}
          {dvfLiveCount > 0 && (
            <Badge variant="outline" className="text-xs font-normal text-emerald-700 border-emerald-300 bg-emerald-50">
              {dvfLiveCount} DVF Live
            </Badge>
          )}
          {(hasLiveData || liveCount > 0 || dvfLiveCount > 0) && (
            <span className="text-xs text-muted-foreground font-normal ml-auto flex items-center gap-1">
              {oldestYear != null && newestYear != null
                ? `Données ${oldestYear}–${newestYear}`
                : "Données DVF"}
              {dataStale && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 cursor-default shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      Données peut-être incomplètes
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {HEADERS.map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap first:w-[1px] first:px-2"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((c, i) => (
                <tr
                  key={`${c.id ?? "c"}_${i}`}
                  className={[
                    "border-b last:border-0 transition-colors",
                    c.outlier
                      ? "bg-red-50/40 opacity-60 hover:opacity-80"
                      : c.topComparable
                      ? "bg-blue-50/40 hover:bg-blue-50/70"
                      : "hover:bg-muted/30",
                  ].join(" ")}
                >
                  {/* Badge colonne */}
                  <td className="px-2 py-2 whitespace-nowrap">
                    {c.outlier ? <OutlierBadge /> : c.topComparable ? <TopBadge /> : null}
                  </td>
                  {/* Score */}
                  <td className="px-2 py-2 whitespace-nowrap">
                    {c.score != null ? <ScoreIndicator score={c.score} /> : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  {/* Date */}
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {formatDateShort(c.date)}
                  </td>
                  {/* Distance */}
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {c.distanceM != null ? `${Math.round(c.distanceM)} m` : "—"}
                  </td>
                  {/* Nature du bien */}
                  <td className="px-3 py-2 whitespace-nowrap">{c.type}</td>
                  {/* Surface */}
                  <td className="px-3 py-2 whitespace-nowrap">{c.surface} m²</td>
                  {/* Pièces */}
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {c.rooms != null ? c.rooms : "—"}
                  </td>
                  {/* Prix DVF */}
                  <td className="px-3 py-2 whitespace-nowrap font-medium">
                    {formatPrice(c.price, true)}
                  </td>
                  {/* Prix/m² — indexé 2025 si disponible, sinon brut */}
                  <td className="px-3 py-2 whitespace-nowrap font-semibold text-primary">
                    {c.indexedPricePsm != null ? (
                      <span
                        className="flex items-center gap-1 cursor-default"
                        title={`Prix brut : ${formatPsm(c.pricePsm)} · Indexé 2025 (indice notaires 74)`}
                      >
                        {formatPsm(c.indexedPricePsm)}
                        <TrendingUp className="h-3 w-3 text-emerald-600 shrink-0" />
                      </span>
                    ) : (
                      formatPsm(c.pricePsm)
                    )}
                  </td>
                  {/* Adresse/parcelle */}
                  <td
                    className="px-3 py-2 max-w-[160px] truncate text-muted-foreground"
                    title={[c.address, c.city].filter(Boolean).join(", ")}
                  >
                    {c.address || "—"}
                  </td>
                  {/* Source */}
                  <td className="px-3 py-2">
                    <SourceBadge source={c.source} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t flex items-center justify-between gap-4 text-sm">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 rounded border text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/50 transition-colors"
            >
              ← Précédent
            </button>
            <span className="text-muted-foreground">
              Page {page + 1} / {totalPages}
              <span className="ml-1 text-xs">({allSorted.length} transactions)</span>
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="px-3 py-1 rounded border text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/50 transition-colors"
            >
              Suivant →
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
