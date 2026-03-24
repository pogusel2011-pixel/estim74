import { ActiveListing } from "@/types/listing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListingCard } from "./listing-card";
import { Search } from "lucide-react";

interface Props { listings: ActiveListing[]; }

export function ActiveListingsPanel({ listings }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          Annonces actives comparables ({listings.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {listings.length === 0 ? (
          <p className="text-sm text-center text-muted-foreground py-4">Aucune annonce active trouvée dans ce secteur</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
