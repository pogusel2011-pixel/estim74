import { formatDate } from "@/lib/utils";
import { PROPERTY_TYPE_LABELS, CONDITION_LABELS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { MapPin, Home, Calendar, Ruler } from "lucide-react";

interface Props { analysis: Record<string, unknown>; }

export function AnalysisSummaryPanel({ analysis }: Props) {
  const status = analysis.status as string;
  const statusVariant = status === "COMPLETE" ? "success" : status === "ARCHIVED" ? "secondary" : "outline";
  const statusLabel = status === "COMPLETE" ? "Complète" : status === "ARCHIVED" ? "Archivée" : "Brouillon";

  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant as never}>{statusLabel}</Badge>
          <Badge variant="outline">{PROPERTY_TYPE_LABELS[analysis.propertyType as string] ?? analysis.propertyType as string}</Badge>
        </div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
          {analysis.address as string}, {analysis.postalCode as string} {analysis.city as string}
        </h1>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><Ruler className="h-3.5 w-3.5" />{analysis.surface as number} m²</span>
          {analysis.rooms && <span className="flex items-center gap-1"><Home className="h-3.5 w-3.5" />{analysis.rooms as number} pièces</span>}
          <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(analysis.createdAt as string)}</span>
          {analysis.yearBuilt && <span>Construit en {analysis.yearBuilt as number}</span>}
          {analysis.condition && <span>{CONDITION_LABELS[analysis.condition as string]}</span>}
          {analysis.dpeLetter && <span className="font-medium">DPE {analysis.dpeLetter as string}</span>}
        </div>
      </div>
    </div>
  );
}
