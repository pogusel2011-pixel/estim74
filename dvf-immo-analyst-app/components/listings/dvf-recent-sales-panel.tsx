import { DVFComparable } from "@/types/dvf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, Ruler, Home, MapPin } from "lucide-react";
import { formatPrice, formatPsm, formatDate } from "@/lib/utils";

interface Props {
  comparables: DVFComparable[];
}

const TYPE_LABELS: Record<string, string> = {
  "Appartement": "Appt",
  "Maison": "Maison",
  "Local industriel. commercial ou assimilé": "Local comm.",
  "Terrain": "Terrain",
};

export function DVFRecentSalesPanel({ comparables }: Props) {
  // Filter to last 12 months
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 12);
  const recent = comparables
    .filter(c => new Date(c.date) >= cutoff)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 12);

  const all = comparables
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 12);

  const toShow = recent.length > 0 ? recent : all;
  const label = recent.length > 0 ? `12 derniers mois • ${toShow.length} vente${toShow.length > 1 ? "s" : ""}` : `Ventes les plus récentes • ${toShow.length}`;

  if (toShow.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground py-8">
          Aucune vente DVF comparable disponible pour ce secteur.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Dernières ventes comparables
          </span>
          <Badge variant="secondary" className="text-xs font-normal">{label}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {toShow.map(c => (
            <DVFSaleCard key={c.id} sale={c} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DVFSaleCard({ sale }: { sale: DVFComparable }) {
  const typeShort = TYPE_LABELS[sale.type] ?? sale.type;

  return (
    <Card className="hover:shadow-md transition-shadow border-border/60">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium line-clamp-2 flex-1 leading-snug">{sale.address}</p>
          <Badge variant="outline" className="shrink-0 text-[10px] h-5">{typeShort}</Badge>
        </div>

        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {sale.city}
          {sale.distanceM != null && (
            <span className="ml-1 text-muted-foreground/70">
              · {sale.distanceM < 1000
                ? `${Math.round(sale.distanceM)} m`
                : `${(sale.distanceM / 1000).toFixed(1)} km`}
            </span>
          )}
        </p>

        <div className="flex gap-3 flex-wrap">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Ruler className="h-3 w-3" />{sale.surface} m²
          </span>
          {sale.rooms && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Home className="h-3 w-3" />{sale.rooms} p.
            </span>
          )}
        </div>

        <div className="pt-1 border-t flex items-baseline justify-between">
          <p className="font-bold text-sm">{formatPrice(sale.price, true)}</p>
          <p className="text-xs text-muted-foreground">{formatPsm(sale.pricePsm)}</p>
        </div>

        <p className="text-xs text-muted-foreground">Vendu le {formatDate(sale.date)}</p>
      </CardContent>
    </Card>
  );
}
