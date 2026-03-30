import { Tag } from "lucide-react";

interface Props {
  listingPriceLow: number;
  listingPriceHigh: number;
}

function fPrice(n: number): string {
  return n.toLocaleString("fr-FR").replace(/\u202f/g, "\u00a0") + "\u00a0\u20AC";
}

export function ListingPriceCard({ listingPriceLow, listingPriceHigh }: Props) {
  if (!listingPriceLow || !listingPriceHigh) return null;
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-start gap-3">
      <Tag className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-foreground">
            Prix d&apos;annonce conseill&eacute;&nbsp;:
          </span>
          <span className="text-base font-bold text-primary">
            entre {fPrice(listingPriceLow)} et {fPrice(listingPriceHigh)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Int&egrave;gre une marge de n&eacute;gociation de 2&nbsp;&agrave;&nbsp;3&nbsp;% sur le prix de vente estim&eacute;
        </p>
      </div>
    </div>
  );
}
