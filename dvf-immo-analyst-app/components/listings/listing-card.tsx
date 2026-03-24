import { ActiveListing } from "@/types/listing";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice, formatPsm } from "@/lib/utils";
import { ExternalLink, Home, Ruler } from "lucide-react";
import { DPE_COLORS } from "@/lib/constants";

interface Props { listing: ActiveListing; }

export function ListingCard({ listing }: Props) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium line-clamp-2 flex-1">{listing.title}</p>
          {listing.url && (
            <a href={listing.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary shrink-0">
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>

        <p className="text-xs text-muted-foreground">{listing.city}{listing.postalCode ? " " + listing.postalCode : ""}</p>

        <div className="flex gap-2 flex-wrap">
          <span className="flex items-center gap-1 text-xs text-muted-foreground"><Ruler className="h-3 w-3" />{listing.surface} m²</span>
          {listing.rooms && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Home className="h-3 w-3" />{listing.rooms} p.</span>}
          {listing.dpe && <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: DPE_COLORS[listing.dpe] + "22", color: DPE_COLORS[listing.dpe] }}>DPE {listing.dpe}</span>}
        </div>

        <div className="pt-1 border-t flex items-baseline justify-between">
          <p className="font-bold">{formatPrice(listing.price, true)}</p>
          <p className="text-xs text-muted-foreground">{formatPsm(listing.pricePsm)}</p>
        </div>

        <p className="text-xs text-muted-foreground">{listing.source}</p>
      </CardContent>
    </Card>
  );
}
