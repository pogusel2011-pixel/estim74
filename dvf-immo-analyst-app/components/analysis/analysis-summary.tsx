import { formatDate } from "@/lib/utils";
import { PROPERTY_TYPE_LABELS, CONDITION_LABELS, DPE_COLORS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, Hash } from "lucide-react";

function normalizeAddr(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/^(\d+[A-Za-z]?)([A-Za-zÀ-ÖØ-öø-ÿ])/, "$1 $2");
}

interface Props {
  analysis: Record<string, unknown>;
  analysisId?: string;
  irisDisplayLabel?: string | null;
}

export function AnalysisSummaryPanel({ analysis, analysisId, irisDisplayLabel }: Props) {
  const status = analysis.status as string;
  const statusVariant = status === "COMPLETE" ? "success" : status === "ARCHIVED" ? "secondary" : "outline";
  const statusLabel = status === "COMPLETE" ? "Complète" : status === "ARCHIVED" ? "Archivée" : "Brouillon";

  const fullAddress = [
    normalizeAddr(analysis.address as string),
    [analysis.postalCode, analysis.city].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ") || "Adresse non renseignée";

  const dpeLetter = analysis.dpeLetter as string | null | undefined;
  const dpeColor = dpeLetter ? DPE_COLORS[dpeLetter] : undefined;

  const chips: { label: string }[] = [
    { label: PROPERTY_TYPE_LABELS[analysis.propertyType as string] ?? (analysis.propertyType as string) },
    ...(analysis.surface ? [{ label: `${analysis.surface} m²` }] : []),
    ...(analysis.rooms ? [{ label: `${analysis.rooms} pièce${(analysis.rooms as number) > 1 ? "s" : ""}` }] : []),
    ...(analysis.bedrooms ? [{ label: `${analysis.bedrooms} ch.` }] : []),
    ...(analysis.condition ? [{ label: CONDITION_LABELS[analysis.condition as string] ?? (analysis.condition as string) }] : []),
    ...(analysis.yearBuilt ? [{ label: `Construit ${analysis.yearBuilt}` }] : []),
  ];

  const refId = analysisId ? analysisId.slice(-8).toUpperCase() : null;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={statusVariant as never}>{statusLabel}</Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(analysis.createdAt as string)}
          </span>
        </div>
        {refId && (
          <span className="text-xs text-muted-foreground/60 flex items-center gap-1 shrink-0 font-mono">
            <Hash className="h-3 w-3" />
            {refId}
          </span>
        )}
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-[#1F2937] flex items-start gap-2 leading-tight">
        <MapPin className="h-5 w-5 text-[#2563EB] shrink-0 mt-0.5" />
        <span>{fullAddress}</span>
      </h1>

      {irisDisplayLabel && (
        <p className="text-sm text-slate-500 flex items-center gap-1.5">
          <span>📍</span>
          <span>Secteur : <span className="font-medium text-slate-700">{irisDisplayLabel}</span></span>
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 items-center">
        {chips.map((chip, i) => (
          <span
            key={i}
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
          >
            {chip.label}
          </span>
        ))}
        {dpeLetter && dpeColor && (
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border"
            style={{ backgroundColor: dpeColor + "22", color: dpeColor, borderColor: dpeColor + "55" }}
          >
            DPE {dpeLetter}
          </span>
        )}
      </div>
    </div>
  );
}
