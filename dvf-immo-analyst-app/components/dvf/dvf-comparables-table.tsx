"use client";
import { DVFComparable } from "@/types/dvf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPrice, formatPsm, formatDateShort } from "@/lib/utils";
import { Table2, Star, AlertTriangle } from "lucide-react";
import { useState } from "react";

interface Props {
  comparables: DVFComparable[];
  hasLiveData?: boolean;
}

function SourceBadge({ source }: { source?: "csv" | "live" }) {
  if (source === "live") {
    return (
      <span className="inline-flex items-center rounded-full border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 whitespace-nowrap">
        DVF Live
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
          <span className="inline-flex items-center gap-0.5 rounded-full border border-orange-300 bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 cursor-help whitespace-nowrap">
            <AlertTriangle className="h-2.5 w-2.5" />
            Valeur atypique
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          Cette vente présente un prix/m² anormalement éloigné de la médiane du secteur. Elle est exclue du calcul de référence.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const HEADERS = ["", "Date", "Distance", "Nature du bien", "Surface", "Pièces", "Prix DVF", "€/m²", "Adresse/parcelle", "Source"];

export function DVFComparablesTable({ comparables, hasLiveData }: Props) {
  const [showAll, setShowAll] = useState(false);

  const topComparables = comparables.filter((c) => c.topComparable && !c.outlier);
  const normalComparables = comparables.filter((c) => !c.topComparable && !c.outlier);
  const outlierComparables = comparables.filter((c) => c.outlier);

  const allSorted = [...topComparables, ...normalComparables, ...outlierComparables];
  const displayed = showAll ? allSorted : allSorted.slice(0, 10);

  const liveCount = comparables.filter((c) => c.source === "live").length;
  const outlierCount = outlierComparables.length;
  const retainedCount = comparables.length - outlierCount;

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
              <span className="text-orange-600"> / {outlierCount} atypique{outlierCount > 1 ? "s" : ""}</span>
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
              {liveCount} DVF Live
            </Badge>
          )}
          {(hasLiveData || liveCount > 0) && (
            <span className="text-xs text-muted-foreground font-normal ml-auto">
              DVF 2014–2024 + données récentes
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
                  key={c.id ?? i}
                  className={[
                    "border-b last:border-0 transition-colors",
                    c.outlier
                      ? "bg-orange-50/40 opacity-60 hover:opacity-80"
                      : c.topComparable
                      ? "bg-blue-50/40 hover:bg-blue-50/70"
                      : "hover:bg-muted/30",
                  ].join(" ")}
                >
                  {/* Badge colonne */}
                  <td className="px-2 py-2 whitespace-nowrap">
                    {c.outlier ? <OutlierBadge /> : c.topComparable ? <TopBadge /> : null}
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
                  {/* Prix/m² */}
                  <td className="px-3 py-2 whitespace-nowrap font-semibold text-primary">
                    {formatPsm(c.pricePsm)}
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
        {comparables.length > 10 && (
          <div className="px-4 py-3 border-t text-center">
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-sm text-primary hover:underline"
            >
              {showAll ? "Réduire" : `Voir les ${comparables.length} transactions`}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
