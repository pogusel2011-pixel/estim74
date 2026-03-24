import { NextResponse } from "next/server";
import { getDVFMutations } from "@/lib/dvf/client";
import { computePrixM2, removeOutliers } from "@/lib/dvf/outliers";
import { computeDVFStats } from "@/lib/dvf/stats";
import { toComparables } from "@/lib/dvf/comparables";
import { propertyTypeToDvfTypes } from "@/lib/mapping/property-type";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const radiusKm = parseFloat(searchParams.get("radius") ?? "0.5");
  const monthsBack = parseInt(searchParams.get("months") ?? "24");
  const propertyType = searchParams.get("type") ?? "APARTMENT";
  const surface = parseFloat(searchParams.get("surface") ?? "0");

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat/lng requis" }, { status: 400 });
  }

  const dvfTypes = propertyTypeToDvfTypes(propertyType as never);
  const { mutations, source } = await getDVFMutations(lat, lng, radiusKm, monthsBack, dvfTypes);
  let enriched = computePrixM2(mutations);
  enriched = removeOutliers(enriched);
  const stats = computeDVFStats(enriched);
  const comparables = surface > 0 ? toComparables(enriched, surface) : [];

  return NextResponse.json({ stats, comparables, source, count: enriched.length });
}
