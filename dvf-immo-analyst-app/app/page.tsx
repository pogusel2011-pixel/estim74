import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, Database, Loader2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPsm, formatNum, percentile } from "@/lib/utils";
import { loadAllCsvMutations } from "@/lib/dvf/csv-loader";
import { computePrixM2 } from "@/lib/dvf/outliers";

export const dynamic = "force-dynamic";

async function DVFStats() {
  const all = await loadAllCsvMutations();
  const withPsm = computePrixM2(all).filter(m => m.prix_m2 != null && m.prix_m2 > 0);
  const psms = withPsm.map(m => m.prix_m2!);
  const medianPsm = Math.round(percentile(psms, 50));
  const p75Psm = Math.round(percentile(psms, 75));

  const byCommune = new Map<string, number>();
  for (const m of all) {
    if (!m.nom_commune) continue;
    byCommune.set(m.nom_commune, (byCommune.get(m.nom_commune) ?? 0) + 1);
  }
  const top5 = Array.from(byCommune.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([commune, count]) => ({ commune, count }));

  const byYear = new Map<number, number>();
  for (const m of all) {
    const year = new Date(m.date_mutation).getFullYear();
    if (year >= 2014) byYear.set(year, (byYear.get(year) ?? 0) + 1);
  }
  const yearlyVol = Array.from(byYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, count]) => ({ year, count }));
  const lastYear = yearlyVol[yearlyVol.length - 1];
  const prevYear = yearlyVol[yearlyVol.length - 2];
  const maxCount = Math.max(...yearlyVol.map(v => v.count));

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
        <Database className="h-5 w-5 text-primary" />
        Base de données DVF — Haute-Savoie (74)
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Transactions totales"
          value={formatNum(all.length)}
          sub="2020–2025"
        />
        <StatCard
          label="Prix médian/m²"
          value={formatPsm(medianPsm)}
          sub="toutes typologies"
        />
        <StatCard
          label="75e percentile/m²"
          value={formatPsm(p75Psm)}
          sub="toutes typologies"
        />
        {lastYear && prevYear && (
          <StatCard
            label={`Ventes ${lastYear.year}`}
            value={formatNum(lastYear.count)}
            sub={`${formatNum(prevYear.count)} en ${prevYear.year}`}
          />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Top 5 communes — volume de ventes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {top5.map((c, i) => (
                <li key={c.commune} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="font-medium">
                      {c.commune.charAt(0) + c.commune.slice(1).toLowerCase()}
                    </span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatNum(c.count)} tx
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Volume annuel de transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {yearlyVol.slice(-8).map(y => {
                const pct = Math.round((y.count / maxCount) * 100);
                return (
                  <div key={y.year} className="flex items-center gap-2 text-xs">
                    <span className="w-10 text-muted-foreground shrink-0">{y.year}</span>
                    <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-primary/70 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-16 text-right text-muted-foreground tabular-nums">
                      {formatNum(y.count)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function DVFStatsFallback() {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
        <Database className="h-5 w-5 text-primary" />
        Base de données DVF — Haute-Savoie (74)
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}><CardContent className="pt-5 pb-4 h-[72px] animate-pulse bg-muted/30" /></Card>
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement des statistiques DVF…
      </div>
    </section>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function FeatureCard({ icon: Icon, color, title, description }: {
  icon: React.ElementType; color: string; title: string; description: string;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Icon className={"h-5 w-5 " + color} />
          <CardTitle className="text-sm">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-sm leading-relaxed">{description}</CardDescription>
      </CardContent>
    </Card>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col gap-10 py-6 max-w-4xl mx-auto">
      {/* Hero */}
      <section className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          ESTIM&apos;74 — <span className="text-primary">Haute-Savoie</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Outil d&apos;estimation immobilière terrain — Haute-Savoie (74)
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Button asChild size="lg">
            <Link href="/analyses/new">
              Nouvelle estimation <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/analyses">Historique des analyses</Link>
          </Button>
        </div>
      </section>

      {/* DVF Stats — streamed in after CSV loads */}
      <Suspense fallback={<DVFStatsFallback />}>
        <DVFStats />
      </Suspense>

      {/* Features */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FeatureCard
          icon={Database}
          color="text-blue-600"
          title="Données DVF officielles"
          description="353 000+ transactions réelles enregistrées par la DGFiP de 2020 à 2025 pour toute la Haute-Savoie."
        />
        <FeatureCard
          icon={BarChart3}
          color="text-emerald-600"
          title="Estimation multi-méthodes"
          description="Médiane DVF, ajustements qualitatifs (DPE, état, équipements), expansion automatique du rayon de recherche."
        />
        <FeatureCard
          icon={TrendingUp}
          color="text-amber-600"
          title="Analyses IA contextualisées"
          description="Analyse de marché, conseils de négociation, potentiel d'investissement et évaluation des risques générés à partir des données réelles."
        />
      </section>

      <p className="text-xs text-center text-muted-foreground">
        Couverture : Haute-Savoie (74) • Données DVF 2020–2025 • Source DGFiP (data.gouv.fr)
      </p>
    </div>
  );
}
