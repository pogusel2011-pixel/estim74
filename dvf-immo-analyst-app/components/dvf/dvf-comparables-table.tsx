"use client";
import { DVFComparable } from "@/types/dvf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, formatPsm, formatDateShort } from "@/lib/utils";
import { Table2 } from "lucide-react";
import { useState } from "react";

interface Props { comparables: DVFComparable[]; }

export function DVFComparablesTable({ comparables }: Props) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? comparables : comparables.slice(0, 10);

  if (!comparables.length) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">Aucun comparable DVF dans ce périmètre</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Table2 className="h-4 w-4 text-primary" />
          Transactions comparables ({comparables.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {["Date","Adresse","Type","Surface","Prix","€/m²","Distance","Score"].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((c, i) => (
                <tr key={c.id ?? i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{formatDateShort(c.date)}</td>
                  <td className="px-4 py-2 max-w-[160px] truncate" title={c.address + ", " + c.city}>{c.address}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{c.type}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{c.surface} m²</td>
                  <td className="px-4 py-2 whitespace-nowrap font-medium">{formatPrice(c.price, true)}</td>
                  <td className="px-4 py-2 whitespace-nowrap font-semibold text-primary">{formatPsm(c.pricePsm)}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{c.distanceM != null ? Math.round(c.distanceM) + " m" : "—"}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: ((c.similarity ?? 0) * 100) + "%" }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{Math.round((c.similarity ?? 0) * 100)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {comparables.length > 10 && (
          <div className="px-4 py-3 border-t text-center">
            <button onClick={() => setShowAll(!showAll)} className="text-sm text-primary hover:underline">
              {showAll ? "Réduire" : "Voir les " + comparables.length + " transactions"}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
