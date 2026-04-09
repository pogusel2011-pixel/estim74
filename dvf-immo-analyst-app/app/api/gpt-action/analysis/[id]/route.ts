import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeSwot } from "@/lib/analysis/swot";
import type { OsmPlace } from "@/lib/geo/osm";
import type { ServitudeItem } from "@/lib/geo/sup";

export const maxDuration = 60;

type AdjItem = { label: string; factor: number; impact: number; category: string };

type RawComp = {
  date?: string | null;
  distanceM?: number | null;
  type?: string;
  surface?: number;
  rooms?: number | null;
  price?: number;
  pricePsm?: number;
  indexedPricePsm?: number | null;
  address?: string | null;
  city?: string | null;
  score?: number | null;
  topComparable?: boolean;
  outlier?: boolean;
  source?: string;
};

type RawListing = {
  price?: number | null;
  surface?: number | null;
  pricePsm?: number | null;
  rooms?: number | null;
  city?: string | null;
  title?: string | null;
  url?: string | null;
};

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
 * Public endpoint — returns a full JSON dossier of an analysis for use
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
    const rawComps = (a.dvfComparables as RawComp[] | null) ?? [];
    const rawListings = (a.listings as RawListing[] | null) ?? [];
    const rawProximities = (a.proximities as OsmPlace[] | null) ?? [];
    const rawServitudes = (a.servitudes as ServitudeItem[] | null) ?? [];
    const rawRisks = (a.risksSummary as string[] | null) ?? null;

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

    // ── Comparables : top 10 non-outliers triés par score desc ─────────────
    const comparables = rawComps
      .filter((c) => !c.outlier)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 10)
      .map((c) => ({
        date: c.date ?? null,
        distanceM: c.distanceM != null ? Math.round(c.distanceM) : null,
        type: c.type ?? null,
        surfaceM2: c.surface ?? null,
        rooms: c.rooms ?? null,
        priceEur: c.price ?? null,
        pricePsmEur: c.pricePsm != null ? Math.round(c.pricePsm) : null,
        indexedPricePsmEur: c.indexedPricePsm != null ? Math.round(c.indexedPricePsm) : null,
        address: c.address ?? null,
        city: c.city ?? null,
        score: c.score != null ? Math.round(c.score * 100) : null,
        isTopComparable: c.topComparable ?? false,
        source: c.source ?? "dvf",
      }));

    const dvfLiveCount = rawComps.filter((c) => c.source === "dvf-live").length;

    // ── Annonces actives : top 8 triés par prix/m² ─────────────────────────
    const listings = rawListings
      .filter((l) => l.price && l.surface)
      .sort((a, b) => (a.pricePsm ?? 0) - (b.pricePsm ?? 0))
      .slice(0, 8)
      .map((l) => ({
        priceEur: l.price ?? null,
        surfaceM2: l.surface ?? null,
        pricePsmEur: l.pricePsm != null ? Math.round(l.pricePsm) : null,
        rooms: l.rooms ?? null,
        city: l.city ?? null,
        title: l.title ?? null,
      }));

    // ── Équipements OSM : top 3 par catégorie ───────────────────────────────
    const osmCategories = ["school", "shop", "transport", "health", "park"] as const;
    const proximities: Record<string, Array<{ name: string; distanceM: number }>> = {};
    for (const cat of osmCategories) {
      const items = rawProximities
        .filter((p) => p.category === cat)
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, 3)
        .map((p) => ({ name: p.name, distanceM: p.distanceM }));
      if (items.length > 0) proximities[cat] = items;
    }

    // ── Risques naturels ─────────────────────────────────────────────────────
    const risks = {
      flood: a.riskFlood ?? null,
      earthquake: a.riskEarthquake ?? null,
      clay: a.riskClay ?? null,
      landslide: a.riskLandslide ?? null,
      summary: rawRisks,
    };

    // ── Servitudes SUP ───────────────────────────────────────────────────────
    const servitudes = rawServitudes.slice(0, 6).map((s) => ({
      type: s.typeSup ?? null,
      label: s.libelle ?? null,
    }));

    // ── SWOT (calculé à la volée) ────────────────────────────────────────────
    const swot = computeSwot({
      propertyType: a.propertyType,
      condition: a.condition,
      dpeLetter: a.dpeLetter ?? null,
      floor: a.floor ?? null,
      totalFloors: a.totalFloors ?? null,
      yearBuilt: a.yearBuilt ?? null,
      hasParking: a.hasParking,
      hasGarage: a.hasGarage,
      hasBalcony: a.hasBalcony,
      hasTerrace: a.hasTerrace,
      hasCellar: a.hasCellar,
      hasPool: a.hasPool,
      hasElevator: a.hasElevator,
      landSurface: a.landSurface ?? null,
      surface: a.surface,
      rooms: a.rooms ?? null,
      orientation: a.orientation ?? null,
      view: a.view ?? null,
      mitoyennete: a.mitoyennete ?? null,
      hasBruit: a.hasBruit,
      hasCopropDegradee: a.hasCopropDegradee,
      hasExpositionNord: a.hasExpositionNord,
      hasRDCSansExterieur: a.hasRDCSansExterieur,
      zonePLU: a.zonePLU ?? null,
      zonePLUType: a.zonePLUType ?? null,
      riskFlood: a.riskFlood ?? null,
      riskEarthquake: a.riskEarthquake ?? null,
      riskClay: a.riskClay ?? null,
      riskLandslide: a.riskLandslide ?? null,
      risksSummary: rawRisks,
      servitudes: rawServitudes.length > 0 ? rawServitudes : null,
      proximities: rawProximities.length > 0 ? rawProximities : null,
      confidence: a.confidence ?? null,
      dvfSampleSize: a.dvfSampleSize ?? null,
    });

    const body = {
      id: a.id,
      createdAt: a.createdAt.toISOString(),
      status: a.status,

      // ── 1. BIEN ────────────────────────────────────────────────────────────
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
        constraints: {
          bruit: a.hasBruit,
          copropDegradee: a.hasCopropDegradee,
          expositionNord: a.hasExpositionNord,
          rdcSansExterieur: a.hasRDCSansExterieur,
        },
      },

      // ── 2. ESTIMATION ESTIM'74 ─────────────────────────────────────────────
      valuation: {
        low: a.valuationLow ?? null,
        mid: a.valuationMid ?? null,
        high: a.valuationHigh ?? null,
        listingPriceLow: a.valuationMid != null ? Math.round(a.valuationMid * 1.02) : null,
        listingPriceHigh: a.valuationMid != null ? Math.round(a.valuationMid * 1.03) : null,
        pricePsmEur: a.valuationPsm ?? null,
        confidence: a.confidence != null ? parseInt((a.confidence * 100).toFixed(0)) : null,
        confidenceLabel: a.confidenceLabel ?? null,
        adjustments: propertyAdj,
        proximityAdjustments: proximityAdj,
      },

      // ── 3. SOCLE DVF ───────────────────────────────────────────────────────
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
        dvfLiveCount: dvfLiveCount > 0 ? dvfLiveCount : null,
      },

      // ── 4. COMPARABLES (top 10) ────────────────────────────────────────────
      comparables,

      // ── 5. ANNONCES ACTIVES ────────────────────────────────────────────────
      activeListings: listings.length > 0 ? listings : null,

      // ── 6. TENDANCE MARCHÉ ─────────────────────────────────────────────────
      marketTrend: marketReading
        ? {
            trend: (marketReading.trend as string | null) ?? null,
            trendPercent: (marketReading.trendPercent as number | null) ?? null,
            supplyDemand: (marketReading.supplyDemand as string | null) ?? null,
            commentary: (marketReading.commentary as string | null) ?? null,
            source: (notairesData?.source as string | null) ?? "DVF",
            quarterlyChangePct: (notairesData?.quarterlyChange as number | null) ?? null,
          }
        : null,

      // ── 7. URBANISME PLU ───────────────────────────────────────────────────
      urbanisme: a.zonePLU
        ? {
            zone: a.zonePLU,
            type: a.zonePLUType ?? null,
            document: a.documentUrbanisme ?? null,
          }
        : null,

      // ── 8. RISQUES NATURELS ────────────────────────────────────────────────
      risks: (risks.flood || risks.earthquake || risks.clay || risks.landslide || risks.summary)
        ? risks
        : null,

      // ── 9. SERVITUDES SUP ──────────────────────────────────────────────────
      servitudes: servitudes.length > 0 ? servitudes : null,

      // ── 10. ÉQUIPEMENTS OSM ────────────────────────────────────────────────
      proximities: Object.keys(proximities).length > 0 ? proximities : null,

      // ── 11. SWOT ───────────────────────────────────────────────────────────
      swot: {
        strengths: swot.strengths.map((s) => s.label + (s.detail ? ` (${s.detail})` : "")),
        weaknesses: swot.weaknesses.map((s) => s.label + (s.detail ? ` (${s.detail})` : "")),
      },
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
