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

    // 6. Construction du gptPayload (export complet pour GPT)
    const gptPayload = JSON.stringify({
      adresse: property.address,
      ville: property.city,
      codePostal: property.postalCode,
      type: property.propertyType,
      surface: property.surface,
      pieces: property.rooms,
      chambres: property.bedrooms,
      etage: property.floor != null ? `${property.floor}/${property.totalFloors}` : null,
      ascenseur: property.hasElevator,
      etat: property.condition,
      dpe: property.dpeLetter,
      options: {
        parking: property.hasParking,
        garage: property.hasGarage,
        balcon: property.hasBalcony,
        terrasse: property.hasTerrace,
        cave: property.hasCellar,
        piscine: property.hasPool,
        orientation: property.orientation,
        vue: property.view,
        terrain: property.landSurface,
      },
      dvf: {
        nombreVentes: dvfStats?.count ?? 0,
        medianePsm: dvfStats?.medianPsm ?? null,
        q1Psm: dvfStats?.p25Psm ?? null,
        q3Psm: dvfStats?.p75Psm ?? null,
        periodeDebut: dvfStats?.oldestDate ?? null,
        periodeFin: dvfStats?.newestDate ?? null,
        rayonRetenuKm: finalRadiusKm,
        rayonDemandeKm: radiusKm,
        source: dvfStats?.source ?? null,
      },
      estimation: {
        fourchetteBasse: valuation.low,
        fourchetteCentrale: valuation.mid,
        fourchetteHaute: valuation.high,
        psmRetenu: valuation.pricePsm,
        methode: valuation.method,
        niveauConfidence: valuation.confidenceLabel,
        scoreConfidence: valuation.confidence,
      },
      ajustements: valuation.adjustments.map((a) => ({
        libelle: a.label,
        facteur: a.factor,
        pourcentage: `${(a.factor * 100).toFixed(1)}%`,
        categorie: a.category,
      })),
      ajustementTotal: `${(valuation.breakdown.totalAdjustmentFactor * 100).toFixed(1)}%`,
      psmBase: valuation.breakdown.basePsm,
      psmAjuste: valuation.breakdown.adjustedPsm,
    });

    // 7. Sauvegarde en BDD
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
          gptPayload,
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
