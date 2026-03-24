import { PropertyInput } from "@/types/property";
import { ActiveListing } from "@/types/listing";
import { MOTEURIMMO_TYPE_MAP } from "@/lib/mapping/property-type";
import { searchMoteurImmo } from "./client";
import { SURFACE_RANGE_FACTOR } from "@/lib/constants";

export async function findActiveListings(property: PropertyInput): Promise<ActiveListing[]> {
  const type = MOTEURIMMO_TYPE_MAP[property.propertyType];
  const surfaceMin = Math.round(property.surface * (1 - SURFACE_RANGE_FACTOR));
  const surfaceMax = Math.round(property.surface * (1 + SURFACE_RANGE_FACTOR));
  const roomsMin = property.rooms ? Math.max(1, property.rooms - 1) : undefined;
  const roomsMax = property.rooms ? property.rooms + 1 : undefined;

  return searchMoteurImmo({
    type,
    postalCode: property.postalCode,
    surfaceMin,
    surfaceMax,
    roomsMin,
    roomsMax,
    limit: 15,
  });
}
