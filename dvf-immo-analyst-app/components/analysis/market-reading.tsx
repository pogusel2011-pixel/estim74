import { MarketReading as MarketReadingType } from "@/types/analysis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, BarChart2 } from "lucide-react";

interface Props { marketReading?: MarketReadingType | null; }

export function MarketReading({ marketReading }: Props) {
  if (!marketReading) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">Données marché non disponibles</CardContent>
      </Card>
    );
  }

  const TrendIcon = marketReading.trend === "hausse" ? TrendingUp : marketReading.trend === "baisse" ? TrendingDown : Minus;
  const trendColor = marketReading.trend === "hausse" ? "text-emerald-600" : marketReading.trend === "baisse" ? "text-red-500" : "text-muted-foreground";
  const supplyLabel = { tendu: "Marché tendu", equilibre: "Marché équilibré", detendu: "Marché détendu" }[marketReading.supplyDemand];
  const supplyVariant = { tendu: "destructive", equilibre: "outline", detendu: "secondary" }[marketReading.supplyDemand] as never;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><BarChart2 className="h-4 w-4 text-primary" />Tendance de marché</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <TrendIcon className={"h-8 w-8 " + trendColor} />
            <div>
              <p className={"text-lg font-bold capitalize " + trendColor}>
                {marketReading.trend === "hausse" ? "En hausse" : marketReading.trend === "baisse" ? "En baisse" : "Stable"}
                {marketReading.trendPercent != null && ` (${marketReading.trendPercent > 0 ? "+" : ""}${marketReading.trendPercent.toFixed(1)}% / an)`}
              </p>
              <Badge variant={supplyVariant} className="mt-1">{supplyLabel}</Badge>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{marketReading.commentary}</p>
        </CardContent>
      </Card>

      {marketReading.notairesData && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm text-muted-foreground">Source : {marketReading.notairesData.source}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            {marketReading.notairesData.annualChange != null && (
              <div><p className="text-muted-foreground">Variation annuelle</p><p className="font-bold">{marketReading.notairesData.annualChange > 0 ? "+" : ""}{marketReading.notairesData.annualChange.toFixed(1)}%</p></div>
            )}
            {marketReading.notairesData.quarterlyChange != null && (
              <div><p className="text-muted-foreground">Variation trimestrielle</p><p className="font-bold">{marketReading.notairesData.quarterlyChange > 0 ? "+" : ""}{marketReading.notairesData.quarterlyChange.toFixed(1)}%</p></div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
