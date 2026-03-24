import { DVFStats } from "@/types/dvf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPsm, formatDate } from "@/lib/utils";
import { Database } from "lucide-react";

interface Props {
  stats?: DVFStats | null;
  sampleSize?: number | null;
  perimeterKm?: number | null;
  requestedRadiusKm?: number | null;
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

  const rows = [
    { label: "Transactions", value: String(sampleSize ?? stats.count) },
    { label: "Médiane €/m²", value: formatPsm(stats.medianPsm) },
    { label: "Moyenne €/m²", value: formatPsm(stats.meanPsm) },
    { label: "Q1 – Q3", value: formatPsm(stats.p25Psm) + " – " + formatPsm(stats.p75Psm) },
    { label: "Min – Max", value: formatPsm(stats.minPsm) + " – " + formatPsm(stats.maxPsm) },
    { label: "Période", value: formatDate(stats.oldestDate) + " – " + formatDate(stats.newestDate) },
    {
      label: "Périmètre",
      value: wasExpanded
        ? `${perimeterDisplay} (demandé : ${requestedRadiusKm} km)`
        : perimeterDisplay,
    },
    { label: "Source", value: stats.source === "csv" ? "CSV local" : stats.source === "api" ? "API DVF" : "CSV + API" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          Statistiques DVF
          {wasExpanded && (
            <Badge variant="outline" className="ml-auto text-xs font-normal text-amber-600 border-amber-400">
              Rayon élargi à {perimeterKm} km
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
