import { PropertyInput } from "@/types/property";
import { ActiveListing } from "@/types/listing";
import { QualitativeComparison } from "@/types/listing";
import { scoreComparison } from "@/lib/valuation/scoring";

export function buildQualitativeComparisons(
  subject: PropertyInput,
  listings: ActiveListing[]
): QualitativeComparison[] {
  return listings.map((listing) => {
    const { subjectScore, listingScore, adjustmentFactor } = scoreComparison(subject, listing);
    const delta = subjectScore - listingScore;
    const adjustedPrice = Math.round(listing.price * (1 + adjustmentFactor));

    const factors: QualitativeComparison["factors"] = [];
    if (subject.surface !== listing.surface) {
      const diff = ((subject.surface - listing.surface) / listing.surface) * 100;
      factors.push({ label: "Surface", impact: diff > 0 ? "positive" : "negative", value: `${subject.surface} vs ${listing.surface} m²` });
    }
    if (subject.dpeLetter && listing.dpe && subject.dpeLetter !== listing.dpe) {
      const dpeOrder = ["A","B","C","D","E","F","G"];
      const better = dpeOrder.indexOf(subject.dpeLetter) < dpeOrder.indexOf(listing.dpe);
      factors.push({ label: "DPE", impact: better ? "positive" : "negative", value: `${subject.dpeLetter} vs ${listing.dpe}` });
    }
    if (subject.hasPool && !listing.features?.includes("piscine")) {
      factors.push({ label: "Piscine", impact: "positive", value: "Présente" });
    }

    return { listingId: listing.id, subjectScore, listingScore, delta, adjustedPrice, factors };
  });
}
