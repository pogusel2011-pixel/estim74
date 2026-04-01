import { DeptBenchmark } from "@/types/dvf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPsm, formatNum } from "@/lib/utils";
import { MapPin, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  benchmark: DeptBenchmark | null;
  /** Prix/m² estimé du bien analysé (pour calcul de l'écart) */
  subjectPsm?: number | null;
}

export function DeptBenchmarkPanel({ benchmark, subjectPsm }: Props) {
  if (!benchmark) return null;

  const gapPct =
    subjectPsm != null && benchmark.medianPsm > 0
      ? ((subjectPsm - benchmark.medianPsm) / benchmark.medianPsm) * 100
      : null;

  const GapIcon =
    gapPct == null ? null
    : gapPct > 1 ? TrendingUp
    : gapPct < -1 ? TrendingDown
    : Minus;

  const gapColor =
    gapPct == null ? ""
    : gapPct > 1 ? "text-green-600"
    : gapPct < -1 ? "text-orange-600"
    : "text-muted-foreground";

  const gapLabel =
    gapPct == null ? null
    : gapPct > 1 ? `+${gapPct.toFixed(1)}% vs médiane 74`
    : gapPct < -1 ? `${gapPct.toFixed(1)}% vs médiane 74`
    : `Dans la médiane dép. 74`;

  const evolutionColor =
    benchmark.evolutionPct == null ? "text-muted-foreground"
    : benchmark.evolutionPct > 0 ? "text-green-600"
    : benchmark.evolutionPct < 0 ? "text-orange-600"
    : "text-muted-foreground";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary shrink-0" />
          Benchmark départemental — Haute-Savoie (74)
          <Badge variant="outline" className="ml-auto text-xs font-normal">
            {benchmark.typeLocal}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2">
          {/* Médiane département */}
          <div className="flex justify-between text-sm gap-2">
            <dt className="text-muted-foreground shrink-0">Médiane €/m² (dépt.)</dt>
            <dd className="font-semibold text-right">{formatPsm(benchmark.medianPsm)}</dd>
          </div>

          {/* Évolution annuelle */}
          {benchmark.evolutionPct != null && (
            <div className="flex justify-between text-sm gap-2">
              <dt className="text-muted-foreground shrink-0">Évolution annuelle</dt>
              <dd className={["font-medium text-right", evolutionColor].join(" ")}>
                {benchmark.evolutionPct > 0 ? "+" : ""}
                {benchmark.evolutionPct.toFixed(1)} %
              </dd>
            </div>
          )}

          {/* Transactions */}
          {benchmark.totalTransactions != null && (
            <div className="flex justify-between text-sm gap-2">
              <dt className="text-muted-foreground shrink-0">Transactions analysées</dt>
              <dd className="font-medium text-right text-muted-foreground">
                {formatNum(benchmark.totalTransactions)}
              </dd>
            </div>
          )}

          {/* Positionnement du bien */}
          {gapPct != null && GapIcon && (
            <div className="pt-2 mt-1 border-t flex justify-between items-center text-sm gap-2">
              <dt className="text-muted-foreground shrink-0">Positionnement estimé</dt>
              <dd className={["font-semibold text-right flex items-center gap-1", gapColor].join(" ")}>
                <GapIcon className="h-3.5 w-3.5" />
                {gapLabel}
              </dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
