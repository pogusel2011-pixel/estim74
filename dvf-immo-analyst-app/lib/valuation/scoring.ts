import { ActiveListing } from "@/types/listing";
import { PropertyInput } from "@/types/property";

interface ScoringResult {
  listingScore: number;
  subjectScore: number;
  adjustmentFactor: number;
}

/**
 * Compare le bien sujet à une annonce active pour ajuster le prix
 */
export function scoreComparison(subject: PropertyInput, listing: ActiveListing): ScoringResult {
  let subjectScore = 0;
  let listingScore = 0;

  // Surface
  const surfaceRatio = subject.surface / listing.surface;
  subjectScore += surfaceRatio > 1 ? 2 : surfaceRatio > 0.85 ? 1 : 0;
  listingScore += surfaceRatio < 1 ? 2 : surfaceRatio < 1.15 ? 1 : 0;

  // Pièces
  if (subject.rooms != null && listing.rooms != null) {
    if (subject.rooms > listing.rooms) subjectScore += 1;
    else if (subject.rooms < listing.rooms) listingScore += 1;
  }

  // DPE
  const dpeOrder = ["A","B","C","D","E","F","G"];
  const subjectDpe = subject.dpeLetter ? dpeOrder.indexOf(subject.dpeLetter) : 3;
  const listingDpe = listing.dpe ? dpeOrder.indexOf(listing.dpe) : 3;
  if (subjectDpe < listingDpe) subjectScore += 1;
  else if (subjectDpe > listingDpe) listingScore += 1;

  // Options
  if (subject.hasParking && !listing.features?.includes("parking")) subjectScore += 0.5;
  if (subject.hasPool && !listing.features?.includes("piscine")) subjectScore += 1;
  if (subject.hasTerrace && !listing.features?.includes("terrasse")) subjectScore += 0.5;

  const delta = subjectScore - listingScore;
  const adjustmentFactor = clampAdjust(delta * 0.02);

  return { subjectScore, listingScore, adjustmentFactor };
}

function clampAdjust(v: number): number {
  return Math.min(Math.max(v, -0.15), 0.15);
}
