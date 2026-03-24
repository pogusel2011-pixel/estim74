import { formatPrice, formatPsm } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge } from "./confidence-badge";
import { Adjustment } from "@/types/valuation";
import { TrendingUp, TrendingDown, Minus, AlertCircle } from "lucide-react";

interface Props {
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  psm?: number | null;
  confidence?: number | null;
  confidenceLabel?: string | null;
  adjustments?: Adjustment[] | null;
  dvfSampleSize?: number | null;
  perimeterKm?: number | null;
}

export function ValuationCards({ low, mid, high, psm, confidence, confidenceLabel, adjustments, dvfSampleSize, perimeterKm }: Props) {
  const isIndicative = confidenceLabel === "Indicative" || (mid != null && mid > 0 && (dvfSampleSize != null && dvfSampleSize < 3));

  if (!mid) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-6 text-center text-muted-foreground">
          Estimation non disponible — données DVF insuffisantes dans ce secteur.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Indicative warning banner */}
      {isIndicative && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <div>
            <span className="font-semibold">Estimation indicative</span>
            {" — "}données DVF limitées
            {dvfSampleSize != null && dvfSampleSize > 0 && ` (${dvfSampleSize} transaction${dvfSampleSize > 1 ? "s" : ""}`}
            {perimeterKm != null && dvfSampleSize != null && dvfSampleSize > 0 && ` dans un rayon de ${perimeterKm} km)`}
            {dvfSampleSize != null && dvfSampleSize === 0 && " dans ce secteur"}
            {". "}Recoupez avec d'autres sources avant toute décision.
          </div>
        </div>
      )}

      {/* Prix principaux */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-muted">
          <CardHeader className="pb-1 pt-4"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Basse</CardTitle></CardHeader>
          <CardContent className="pb-4"><p className="text-xl font-bold text-foreground">{formatPrice(low!)}</p></CardContent>
        </Card>
        <Card className={isIndicative ? "border-amber-300 bg-amber-50/60 shadow-sm" : "border-primary/40 bg-primary/5 shadow-sm"}>
          <CardHeader className="pb-1 pt-4">
            <CardTitle className={`text-xs uppercase tracking-wide flex items-center gap-1 ${isIndicative ? "text-amber-700" : "text-primary"}`}>
              {isIndicative ? (
                <><Badge variant="outline" className="text-[10px] h-4 border-amber-400 text-amber-700">Indicative</Badge></>
              ) : "Estimation"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className={`text-2xl font-extrabold ${isIndicative ? "text-amber-800" : "text-primary"}`}>{formatPrice(mid)}</p>
            {psm && <p className="text-sm text-muted-foreground mt-0.5">{formatPsm(psm)}</p>}
          </CardContent>
        </Card>
        <Card className="border-muted">
          <CardHeader className="pb-1 pt-4"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Haute</CardTitle></CardHeader>
          <CardContent className="pb-4"><p className="text-xl font-bold text-foreground">{formatPrice(high!)}</p></CardContent>
        </Card>
      </div>

      {/* Fiabilité + ajustements */}
      <div className="flex flex-wrap gap-2 items-center">
        {confidence != null && confidenceLabel && (
          <ConfidenceBadge score={confidence} label={confidenceLabel} />
        )}
        {adjustments && adjustments.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {adjustments.slice(0, 6).map((adj, i) => (
              <span key={i} className="inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full border bg-background">
                {adj.factor > 0 ? <TrendingUp className="h-3 w-3 text-emerald-600" /> : adj.factor < 0 ? <TrendingDown className="h-3 w-3 text-red-500" /> : <Minus className="h-3 w-3 text-muted-foreground" />}
                {adj.label} {adj.factor > 0 ? "+" : ""}{(adj.factor * 100).toFixed(0)}%
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
