"use client";
import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, BarChart2 } from "lucide-react";

interface YearlyStat {
  year: number;
  medianPsm: number;
  count: number;
}

interface Props {
  lat: number;
  lng: number;
  radiusKm?: number;
  propertyType?: string;
}

const formatPsm = (n: number) => n.toLocaleString("fr-FR") + " €/m²";

export function MarketTrendChart({ lat, lng, radiusKm = 5, propertyType }: Props) {
  const [data, setData] = useState<YearlyStat[]>([]);
  const [trend, setTrend] = useState<"hausse" | "baisse" | "stable" | null>(null);
  const [trendPct, setTrendPct] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      radius: String(radiusKm),
      ...(propertyType ? { type: propertyType } : {}),
    });
    fetch(`/api/dvf/trend?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setData(d.yearlyStats ?? []);
        setTrend(d.trend ?? null);
        setTrendPct(d.trendPct ?? null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [lat, lng, radiusKm, propertyType]);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground animate-pulse">
          Chargement des tendances de marché…
        </CardContent>
      </Card>
    );
  }

  if (error || data.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          {error ?? "Données d'évolution non disponibles pour ce secteur."}
        </CardContent>
      </Card>
    );
  }

  const TrendIcon = trend === "hausse" ? TrendingUp : trend === "baisse" ? TrendingDown : Minus;
  const trendColor = trend === "hausse" ? "text-emerald-600" : trend === "baisse" ? "text-red-500" : "text-muted-foreground";
  const trendBadgeClass = trend === "hausse"
    ? "border-emerald-400 text-emerald-700 bg-emerald-50"
    : trend === "baisse"
    ? "border-red-400 text-red-700 bg-red-50"
    : "border-border text-muted-foreground";

  const totalTx = data.reduce((s, d) => s + d.count, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-primary" />
            Évolution du prix médian (2020–2025)
          </span>
          <div className="flex items-center gap-2">
            {trend && (
              <Badge variant="outline" className={`text-xs font-normal ${trendBadgeClass}`}>
                <TrendIcon className={`h-3 w-3 mr-1 ${trendColor}`} />
                {trend === "hausse" ? "En hausse" : trend === "baisse" ? "En baisse" : "Stable"}
                {trendPct != null && ` (${trendPct > 0 ? "+" : ""}${trendPct}% sur 6 ans)`}
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                tickFormatter={v => (v / 1000).toFixed(0) + "k"}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                width={36}
              />
              <Tooltip
                formatter={(value: number) => [formatPsm(value), "Médiane €/m²"]}
                labelFormatter={label => `Année ${label}`}
                contentStyle={{
                  fontSize: 12,
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                }}
              />
              <Line
                type="monotone"
                dataKey="medianPsm"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3, fill: "hsl(var(--primary))" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Annual volumes */}
        <div className="mt-4 border-t pt-3">
          <p className="text-xs text-muted-foreground mb-2 font-medium">Transactions par année ({totalTx.toLocaleString("fr-FR")} au total)</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {data.map(d => (
              <span key={d.year} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{d.year}</span> : {d.count}
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
