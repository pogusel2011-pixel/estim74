import Link from "next/link";
import { ArrowRight, BarChart3, Database, FileText, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  { icon: Database, title: "Données DVF", description: "Accès aux transactions réelles 2014-2024 du département 74 + API nationale.", color: "text-blue-600" },
  { icon: BarChart3, title: "Estimation multi-méthodes", description: "Médiane DVF, annonces actives MoteurImmo, ajustements qualitatifs.", color: "text-emerald-600" },
  { icon: TrendingUp, title: "Marché en temps réel", description: "Tendances Notaires de France, offre/demande, comparables récents.", color: "text-amber-600" },
  { icon: FileText, title: "Rapports détaillés", description: "Historique des analyses, exports, dossiers complets par bien.", color: "text-violet-600" },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-12 py-8">
      {/* Hero */}
      <section className="text-center space-y-4 max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          Estimez <span className="text-primary">précisément</span> vos biens immobiliers
        </h1>
        <p className="text-lg text-muted-foreground">
          Outil d'analyse basé sur les données DVF officielles, les annonces actives et les tendances notariales — pour le marché alpin.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Button asChild size="lg">
            <Link href="/analyses/new">
              Nouvelle estimation <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/analyses">Voir les analyses</Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto w-full">
        {features.map((f) => (
          <Card key={f.title} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <f.icon className={"h-5 w-5 " + f.color} />
                <CardTitle className="text-base">{f.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm leading-relaxed">{f.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* CTA */}
      <section className="text-center">
        <p className="text-sm text-muted-foreground">
          Couverture : Haute-Savoie (74) • Données DVF 2014–2024 • Mise à jour continue
        </p>
      </section>
    </div>
  );
}
