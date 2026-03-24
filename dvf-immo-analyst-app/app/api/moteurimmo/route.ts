import { NextResponse } from "next/server";
import { findActiveListings } from "@/lib/moteurimmo/search";
import { PropertyInput } from "@/types/property";

export async function POST(req: Request) {
  try {
    const property = (await req.json()) as PropertyInput;
    const listings = await findActiveListings(property);
    return NextResponse.json({ listings, count: listings.length });
  } catch (err) {
    console.error("[POST /api/moteurimmo]", err);
    return NextResponse.json({ error: "Erreur recherche annonces" }, { status: 500 });
  }
}
