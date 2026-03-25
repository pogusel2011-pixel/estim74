import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Scale } from "lucide-react";

interface Props {
  city?: string | null;
  propertyType?: string | null;
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  APARTMENT: "Appartement",
  HOUSE: "Maison",
  LAND: "Terrain",
  COMMERCIAL: "Local commercial",
};

export function NotairesPanel({ city, propertyType }: Props) {
  const communeLabel = city ? city.charAt(0).toUpperCase() + city.slice(1).toLowerCase() : "votre commune";
  const typeLabel = propertyType ? (PROPERTY_TYPE_LABELS[propertyType] ?? propertyType) : "";

  // Le site leprixdelimmo utilise des routes en hash (#) — on passe la commune
  // en query param `localisation` (paramètre documenté dans leur SPA)
  const communeEncoded = encodeURIComponent(city ?? "");
  const basePrixUrl = `https://leprixdelimmo.notaires.fr/#/prix-immobilier${communeEncoded ? `?localisation=${communeEncoded}` : ""}`;
  const baseVentesUrl = `https://leprixdelimmo.notaires.fr/#/dernieres-ventes-immobilieres${communeEncoded ? `?localisation=${communeEncoded}` : ""}`;

  return (
    <Card className="border-amber-200 bg-amber-50/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
          <Scale className="h-4 w-4 text-amber-700 shrink-0" />
          Indicateurs Notaires de France — Fraîcheur S2-2025
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Explication */}
        <p className="text-sm text-amber-900 leading-relaxed">
          Consultez les statistiques officielles des notaires pour contrôler la fraîcheur des prix signés sur ce secteur.
          Données disponibles jusqu&apos;en décembre 2025{typeLabel ? ` pour les ${typeLabel.toLowerCase()}s` : ""}.
        </p>

        {/* Boutons liens */}
        <div className="flex flex-wrap gap-3">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="gap-2 border-amber-400 bg-white text-amber-900 hover:bg-amber-100 hover:border-amber-500"
          >
            <a href={basePrixUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Prix au m² — {communeLabel}
            </a>
          </Button>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="gap-2 border-amber-400 bg-white text-amber-900 hover:bg-amber-100 hover:border-amber-500"
          >
            <a href={baseVentesUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Dernières ventes — {communeLabel}
            </a>
          </Button>
        </div>

        {/* Note discrète */}
        <p className="text-[11px] text-amber-700/80 leading-snug border-t border-amber-200 pt-3">
          Source : Notaires de France — LePrixDeLImmo.fr — Consultation manuelle requise.
          Ces données ne sont pas injectées dans le calcul d&apos;estimation.
        </p>
      </CardContent>
    </Card>
  );
}
