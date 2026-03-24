import { AnalysisSummary } from "@/types/analysis";
import Link from "next/link";
import { formatDate, formatPrice } from "@/lib/utils";
import { PROPERTY_TYPE_LABELS, CONFIDENCE_COLORS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, MapPin } from "lucide-react";

interface Props { analyses: AnalysisSummary[]; }

export function AnalysisHistoryList({ analyses }: Props) {
  if (analyses.length === 0) {
    return (
      <Card>
        <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
          <p className="text-lg font-medium">Aucune analyse</p>
          <p className="text-sm mt-1">Commencez par créer une nouvelle estimation.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {analyses.map((a) => (
        <Link key={a.id} href={"/analyses/" + a.id}>
          <Card className="hover:shadow-md transition-all hover:border-primary/30 cursor-pointer group">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">{PROPERTY_TYPE_LABELS[a.propertyType] ?? a.propertyType}</Badge>
                    <Badge variant={a.status === "COMPLETE" ? "success" : "secondary" as never} className="text-xs">
                      {a.status === "COMPLETE" ? "Complète" : a.status === "ARCHIVED" ? "Archivée" : "Brouillon"}
                    </Badge>
                  </div>
                  <p className="font-medium truncate flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {a.address}, {a.city}
                  </p>
                  <p className="text-xs text-muted-foreground">{a.surface} m² • {formatDate(a.createdAt)}</p>
                </div>

                <div className="text-right shrink-0 space-y-1">
                  {a.valuationMid ? (
                    <p className="font-bold text-primary">{formatPrice(a.valuationMid, true)}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                  {a.confidence != null && a.confidenceLabel && (
                    <div className="flex items-center justify-end gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CONFIDENCE_COLORS[a.confidenceLabel] ?? "#6b7280" }} />
                      <span className="text-xs text-muted-foreground">{a.confidenceLabel}</span>
                    </div>
                  )}
                </div>

                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
