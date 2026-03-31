import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type AdjItem = { label: string; factor: number; impact: number; category: string };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/gpt-action/analysis/[id]
 * Public endpoint — returns a clean JSON summary of an analysis for use
 * by a ChatGPT custom GPT Action. No authentication required.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const a = await prisma.analysis.findUnique({ where: { id: params.id } });
    if (!a) {
      return NextResponse.json(
        { error: "Analysis not found", id: params.id },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const rawAdj = (a.adjustments as AdjItem[] | null) ?? [];
    const dvfStats = (a.dvfStats as Record<string, unknown> | null) ?? {};
    const marketReading = (a.marketReading as Record<string, unknown> | null) ?? null;

    const propertyAdj = rawAdj
      .filter((adj) => adj.category !== "proximity")
      .map((adj) => ({
        label: adj.label,
        category: adj.category,
        impactPct: parseFloat((adj.impact * 100).toFixed(1)),
      }));

    const proximityAdj = rawAdj
      .filter((adj) => adj.category === "proximity")
      .map((adj) => ({
        label: adj.label,
        impactPct: parseFloat((adj.impact * 100).toFixed(1)),
      }));

    const notairesData =
      (marketReading?.notairesData as Record<string, unknown> | null) ?? null;

    const body = {
      id: a.id,
      createdAt: a.createdAt.toISOString(),
      status: a.status,

      property: {
        address: a.address ?? null,
        postalCode: a.postalCode ?? null,
        city: a.city ?? null,
        lat: a.lat ?? null,
        lng: a.lng ?? null,
        type: a.propertyType,
        surfaceM2: a.surface,
        rooms: a.rooms ?? null,
        bedrooms: a.bedrooms ?? null,
        floor: a.floor ?? null,
        totalFloors: a.totalFloors ?? null,
        landSurfaceM2: a.landSurface ?? null,
        yearBuilt: a.yearBuilt ?? null,
        condition: a.condition,
        dpe: a.dpeLetter ?? null,
        ghg: a.gheGrade ?? null,
        mitoyennete: a.mitoyennete ?? null,
        orientation: a.orientation ?? null,
        view: a.view ?? null,
        amenities: {
          parking: a.hasParking,
          garage: a.hasGarage,
          balcony: a.hasBalcony,
          terrace: a.hasTerrace,
          cellar: a.hasCellar,
          pool: a.hasPool,
          elevator: a.hasElevator,
        },
      },

      valuation: {
        low: a.valuationLow ?? null,
        mid: a.valuationMid ?? null,
        high: a.valuationHigh ?? null,
        listingPriceLow: a.valuationMid != null ? Math.round(a.valuationMid * 1.02) : null,
        listingPriceHigh: a.valuationMid != null ? Math.round(a.valuationMid * 1.03) : null,
        pricePsmEur: a.valuationPsm ?? null,
        confidence: a.confidence != null
          ? parseInt((a.confidence * 100).toFixed(0))
          : null,
        confidenceLabel: a.confidenceLabel ?? null,
      },

      dvfStats: {
        sampleSize: a.dvfSampleSize ?? (dvfStats.count as number | null) ?? null,
        medianPsmEur: a.dvfMedianPsm ?? (dvfStats.medianPsm as number | null) ?? null,
        p25PsmEur: (dvfStats.p25Psm as number | null) ?? null,
        p75PsmEur: (dvfStats.p75Psm as number | null) ?? null,
        periodMonths: a.dvfPeriodMonths ?? (dvfStats.periodMonths as number | null) ?? null,
        oldestDate: (dvfStats.oldestDate as string | null) ?? null,
        newestDate: (dvfStats.newestDate as string | null) ?? null,
        perimeterKm: a.perimeterKm ?? null,
        source: (dvfStats.source as string | null) ?? "DVF",
      },

      adjustments: propertyAdj,
      proximity: proximityAdj,

      marketTrend: marketReading
        ? {
            trend: (marketReading.trend as string | null) ?? null,
            trendPercent: (marketReading.trendPercent as number | null) ?? null,
            supplyDemand: (marketReading.supplyDemand as string | null) ?? null,
            commentary: (marketReading.commentary as string | null) ?? null,
            source: (notairesData?.source as string | null) ?? "DVF",
            quarterlyChangePct:
              (notairesData?.quarterlyChange as number | null) ?? null,
          }
        : null,
    };

    return NextResponse.json(body, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("[gpt-action] GET error:", err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
