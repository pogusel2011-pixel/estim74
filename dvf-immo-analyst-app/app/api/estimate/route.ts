import { NextResponse } from "next/server";
import { estimateRequestSchema } from "@/lib/validation/estimate";
import { getDVFMutations } from "@/lib/dvf/client";
import { computePrixM2 } from "@/lib/dvf/outliers";
import { removeOutliers } from "@/lib/dvf/outliers";
import { computeDVFStats } from "@/lib/dvf/stats";
import { toComparables } from "@/lib/dvf/comparables";
import { propertyTypeToDvfTypes } from "@/lib/mapping/property-type";
import { findActiveListings } from "@/lib/moteurimmo/search";
import { computeValuation } from "@/lib/valuation/valuation";
import { fetchNotairesMarket } from "@/lib/notaires/market-check";
import { prisma } from "@/lib/prisma";
import { geocodeAddress } from "@/lib/geo/address";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = estimateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const { property, radiusKm, monthsBack, excludeOutliers, includeListings } = parsed.data;

    // 1. Géocodage si pas de coordonnées
    let lat = property.lat;
    let lng = property.lng;
    if (!lat || !lng) {
      const geo = await geocodeAddress(property.address, property.postalCode);
      if (geo) { lat = geo.lat; lng = geo.lng; }
    }

    if (!lat || !lng) {
      return NextResponse.json({ error: "Impossible de géocoder l'adresse" }, { status: 422 });
    }

    const propertyWithGeo = { ...property, lat, lng };

    // 2. DVF — mutations (avec auto-expansion du rayon si < 5 transactions)
    const dvfTypes = propertyTypeToDvfTypes(property.propertyType);
    const { mutations, source, radiusKm: finalRadiusKm } = await getDVFMutations(lat, lng, radiusKm, monthsBack, dvfTypes);
    let enrichedMutations = computePrixM2(mutations);
    if (excludeOutliers) enrichedMutations = removeOutliers(enrichedMutations);

    const dvfStats = computeDVFStats(enrichedMutations);
    if (dvfStats) dvfStats.source = source;

    const dvfComparables = toComparables(enrichedMutations, property.surface);

    // 3. Annonces actives
    const listings = includeListings ? await findActiveListings(propertyWithGeo) : [];

    // 4. Valorisation
    const valuation = computeValuation(propertyWithGeo, dvfStats ?? null, listings);

    // 5. Contexte marché Notaires
    const marketReading = await fetchNotairesMarket(property.postalCode, property.propertyType);

    // 6. Sauvegarde en BDD
    let analysisId: string | null = null;
    try {
      const saved = await prisma.analysis.create({
        data: {
          address: property.address,
          postalCode: property.postalCode,
          city: property.city,
          lat,
          lng,
          propertyType: property.propertyType,
          surface: property.surface,
          rooms: property.rooms,
          bedrooms: property.bedrooms,
          floor: property.floor,
          totalFloors: property.totalFloors,
          landSurface: property.landSurface,
          yearBuilt: property.yearBuilt,
          condition: property.condition,
          dpeLetter: property.dpeLetter,
          hasParking: property.hasParking,
          hasGarage: property.hasGarage,
          hasBalcony: property.hasBalcony,
          hasTerrace: property.hasTerrace,
          hasCellar: property.hasCellar,
          hasPool: property.hasPool,
          hasElevator: property.hasElevator,
          orientation: property.orientation,
          view: property.view,
          valuationLow: valuation.low,
          valuationMid: valuation.mid,
          valuationHigh: valuation.high,
          valuationPsm: valuation.pricePsm,
          confidence: valuation.confidence,
          confidenceLabel: valuation.confidenceLabel,
          dvfSampleSize: dvfStats?.count,
          dvfMedianPsm: dvfStats?.medianPsm,
          dvfPeriodMonths: dvfStats?.periodMonths,
          perimeterKm: finalRadiusKm,
          requestedRadiusKm: radiusKm,
          dvfComparables: dvfComparables as never,
          dvfStats: dvfStats as never,
          listings: listings as never,
          adjustments: valuation.adjustments as never,
          marketReading: marketReading as never,
          status: "COMPLETE",
        },
      });
      analysisId = saved.id;
    } catch (dbErr) {
      console.error("[estimate] Erreur sauvegarde:", dbErr);
    }

    return NextResponse.json({
      analysisId,
      property: propertyWithGeo,
      dvfStats,
      dvfComparables,
      listings,
      valuation,
      marketReading,
      perimeterKm: finalRadiusKm,
      requestedRadiusKm: radiusKm,
    });
  } catch (err) {
    console.error("[POST /api/estimate]", err);
    return NextResponse.json({ error: "Erreur estimation" }, { status: 500 });
  }
}
