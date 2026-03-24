import { ActiveListing } from "@/types/listing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ListingCard } from "./listing-card";
import { Search, WifiOff } from "lucide-react";

interface Props {
  listings: ActiveListing[];
  apiAvailable?: boolean;
}

export function ActiveListingsPanel({ listings, apiAvailable = true }: Props) {
  const hasListings = listings.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <Search className="h-4 w-4 text-primary shrink-0" />
          <span>Marché affiché</span>
          {!apiAvailable ? (
            <Badge variant="secondary" className="gap-1 font-normal text-xs">
              <WifiOff className="h-3 w-3" />
              API non configurée
            </Badge>
          ) : hasListings ? (
            <Badge className="gap-1 font-normal text-xs bg-green-600 hover:bg-green-600 text-white">
              Marché actif — {listings.length} annonce{listings.length > 1 ? "s" : ""}
            </Badge>
          ) : (
            <Badge variant="secondary" className="font-normal text-xs">
              Aucune annonce comparable
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {!apiAvailable ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
            <WifiOff className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Marché affiché indisponible
            </p>
            <p className="text-xs text-muted-foreground/70">
              API MoteurImmo non configurée
            </p>
          </div>
        ) : !hasListings ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
            <Search className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Marché affiché non disponible
            </p>
            <p className="text-xs text-muted-foreground/70">
              Aucune annonce comparable trouvée dans ce secteur
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
