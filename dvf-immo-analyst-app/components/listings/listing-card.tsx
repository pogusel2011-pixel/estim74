import { ActiveListing } from "@/types/listing";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice, formatPsm } from "@/lib/utils";
import { ExternalLink, Home, Ruler, MapPin, Building2 } from "lucide-react";
import { DPE_COLORS } from "@/lib/constants";

interface Props { listing: ActiveListing; }

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function ListingCard({ listing }: Props) {
  return (
    <Card className="hover:shadow-md transition-shadow overflow-hidden flex flex-col">
      {/* Photo */}
      {listing.pictureUrl ? (
        <div className="relative h-36 w-full bg-muted overflow-hidden shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={listing.pictureUrl}
            alt={listing.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      ) : (
        <div className="h-28 w-full bg-muted/50 flex items-center justify-center shrink-0">
          <Building2 className="h-8 w-8 text-muted-foreground/30" />
        </div>
      )}

      <CardContent className="p-3 space-y-2 flex-1 flex flex-col">
        {/* Titre + lien externe */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium line-clamp-2 flex-1 leading-snug">{listing.title}</p>
          {listing.url && (
            <a
              href={listing.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary shrink-0 mt-0.5"
              title="Voir l'annonce"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>

        {/* Ville + distance */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span>
            {listing.city}
            {listing.postalCode ? ` ${listing.postalCode}` : ""}
          </span>
          {listing.distance != null && (
            <Badge variant="secondary" className="ml-auto text-xs py-0 px-1.5 font-normal">
              {formatDistance(listing.distance)}
            </Badge>
          )}
        </div>

        {/* Surface / pièces / DPE */}
        <div className="flex gap-2 flex-wrap">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Ruler className="h-3 w-3" />
            {listing.surface} m²
          </span>
          {listing.rooms != null && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Home className="h-3 w-3" />
              {listing.rooms} p.
            </span>
          )}
          {listing.bedrooms != null && (
            <span className="text-xs text-muted-foreground">{listing.bedrooms} ch.</span>
          )}
          {listing.dpe && (
            <span
              className="text-xs font-bold px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: (DPE_COLORS[listing.dpe] ?? "#999") + "22",
                color: DPE_COLORS[listing.dpe] ?? "#999",
              }}
            >
              DPE {listing.dpe}
            </span>
          )}
        </div>

        {/* Options */}
        {listing.features && listing.features.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {listing.features.slice(0, 3).map((f) => (
              <Badge key={f} variant="outline" className="text-xs py-0 px-1.5 font-normal">
                {f}
              </Badge>
            ))}
            {listing.features.length > 3 && (
              <Badge variant="outline" className="text-xs py-0 px-1.5 font-normal">
                +{listing.features.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Prix */}
        <div className="pt-1.5 border-t flex items-baseline justify-between mt-auto">
          <p className="font-bold text-sm">{formatPrice(listing.price, true)}</p>
          <p className="text-xs text-muted-foreground">{formatPsm(listing.pricePsm)}</p>
        </div>

        {/* Source / vendeur */}
        {listing.publisher?.name ? (
          <p className="text-xs text-muted-foreground truncate">{listing.publisher.name}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{listing.source}</p>
        )}
      </CardContent>
    </Card>
  );
}
