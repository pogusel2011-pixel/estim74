import { NextResponse } from "next/server";
import { findActiveListings, isApiKeyConfigured } from "@/lib/moteurimmo/search";
import { PropertyInput } from "@/types/property";

export async function GET() {
  return NextResponse.json({ apiAvailable: isApiKeyConfigured() });
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { property: PropertyInput };
    const { property } = body;
    const listings = await findActiveListings(property, {
      lat: property.lat,
      lng: property.lng,
    });
    return NextResponse.json({
      listings,
      count: listings.length,
      apiAvailable: isApiKeyConfigured(),
    });
  } catch (err) {
    console.error("[POST /api/moteurimmo]", err);
    return NextResponse.json({ error: "Erreur recherche annonces" }, { status: 500 });
  }
}
