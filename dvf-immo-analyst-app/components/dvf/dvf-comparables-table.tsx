"use client";
import { DVFComparable } from "@/types/dvf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice, formatPsm, formatDateShort } from "@/lib/utils";
import { Table2 } from "lucide-react";
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

// Spec Estim74 : Date | Distance (m) | Nature du bien | Surface (m²) | Pièces | Prix signé DVF | Prix/m² | Adresse/parcelle | Source
const HEADERS = ["Date", "Distance", "Nature du bien", "Surface", "Pièces", "Prix DVF", "€/m²", "Adresse/parcelle", "Source"];

export function DVFComparablesTable({ comparables, hasLiveData }: Props) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? comparables : comparables.slice(0, 10);

  const liveCount = comparables.filter((c) => c.source === "live").length;

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
          <span>Transactions comparables ({comparables.length})</span>
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
                    className="px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap"
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
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                >
                  {/* Date */}
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {formatDateShort(c.date)}
                  </td>
                  {/* Distance (m) */}
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {c.distanceM != null ? `${Math.round(c.distanceM)} m` : "—"}
                  </td>
                  {/* Nature du bien */}
                  <td className="px-3 py-2 whitespace-nowrap">{c.type}</td>
                  {/* Surface (m²) */}
                  <td className="px-3 py-2 whitespace-nowrap">{c.surface} m²</td>
                  {/* Pièces */}
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {c.rooms != null ? c.rooms : "—"}
                  </td>
                  {/* Prix signé DVF */}
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
