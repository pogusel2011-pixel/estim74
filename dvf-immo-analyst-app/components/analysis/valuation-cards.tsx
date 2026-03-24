import { formatPrice, formatPsm } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfidenceBadge } from "./confidence-badge";
import { Adjustment } from "@/types/valuation";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  psm?: number | null;
  confidence?: number | null;
  confidenceLabel?: string | null;
  adjustments?: Adjustment[] | null;
}

export function ValuationCards({ low, mid, high, psm, confidence, confidenceLabel, adjustments }: Props) {
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
      {/* Prix principaux */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-muted">
          <CardHeader className="pb-1 pt-4"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Basse</CardTitle></CardHeader>
          <CardContent className="pb-4"><p className="text-xl font-bold text-foreground">{formatPrice(low!)}</p></CardContent>
        </Card>
        <Card className="border-primary/40 bg-primary/5 shadow-sm">
          <CardHeader className="pb-1 pt-4"><CardTitle className="text-xs text-primary uppercase tracking-wide">Estimation</CardTitle></CardHeader>
          <CardContent className="pb-4">
            <p className="text-2xl font-extrabold text-primary">{formatPrice(mid)}</p>
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
