import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDVFMutations } from "@/lib/dvf/client";
import { computePrixM2, removeOutliers } from "@/lib/dvf/outliers";
import { computeDVFStats } from "@/lib/dvf/stats";
import { toComparables } from "@/lib/dvf/comparables";
import { propertyTypeToDvfTypes } from "@/lib/mapping/property-type";
import { PropertyType, Condition } from "@/types/property";
import { findActiveListings } from "@/lib/moteurimmo/search";
import { computeValuation } from "@/lib/valuation/valuation";
import { fetchNotairesMarket } from "@/lib/notaires/market-check";
import { geocodeAddress, isGeoError } from "@/lib/geo/address";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    // 1. Charger l'analyse existante
    const existing = await prisma.analysis.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Analyse introuvable" }, { status: 404 });
    }

    // 2. Lire le body optionnel (propriété modifiée depuis la fiche bien)
    let bodyOverride: Record<string, unknown> = {};
    try {
      bodyOverride = await req.json();
    } catch {
      // Pas de body — re-simulation avec les données existantes
    }

    // 3. Reconstruire le PropertyInput à partir des données DB (+ overrides éventuels)
    const property = {
      address: existing.address ?? "",
      postalCode: existing.postalCode ?? "",
      city: existing.city ?? "",
      lat: existing.lat ?? undefined,
      lng: existing.lng ?? undefined,
      propertyType: existing.propertyType,
      surface: existing.surface,
      rooms: existing.rooms ?? undefined,
      bedrooms: existing.bedrooms ?? undefined,
      floor: existing.floor ?? undefined,
      totalFloors: existing.totalFloors ?? undefined,
      landSurface: existing.landSurface ?? undefined,
      yearBuilt: existing.yearBuilt ?? undefined,
      condition: existing.condition ?? "AVERAGE",
      dpeLetter: existing.dpeLetter ?? undefined,
      hasParking: existing.hasParking ?? false,
      hasGarage: existing.hasGarage ?? false,
      hasBalcony: existing.hasBalcony ?? false,
      hasTerrace: existing.hasTerrace ?? false,
      hasCellar: existing.hasCellar ?? false,
      hasPool: existing.hasPool ?? false,
      hasElevator: existing.hasElevator ?? false,
      orientation: existing.orientation ?? undefined,
      view: existing.view ?? undefined,
      ...bodyOverride,
    } as Record<string, unknown>;

    const radiusKm: number = (bodyOverride.radiusKm as number) ?? existing.requestedRadiusKm ?? 0.5;
    const monthsBack: number = (bodyOverride.monthsBack as number) ?? 24;

    // 4. Géocodage si coordonnées manquantes ou si adresse modifiée
    let lat = property.lat as number | undefined;
    let lng = property.lng as number | undefined;
    let communeCode: string | undefined = existing.communeCode ?? undefined;

    if (!lat || !lng) {
      const geo = await geocodeAddress(property.address as string, property.postalCode as string);
      if (isGeoError(geo)) {
        return NextResponse.json({ error: geo.error }, { status: 422 });
      }
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
        communeCode = geo.citycode ?? communeCode;
      }
    }
    if (!lat || !lng) {
      return NextResponse.json({ error: "Impossible de géocoder l'adresse" }, { status: 422 });
    }
    const propertyWithGeo = { ...property, lat, lng };

    // 5. DVF mutations (+ filtre INSEE secondaire via city/postalCode)
    const dvfTypes = propertyTypeToDvfTypes(property.propertyType as PropertyType);
    const { mutations, source, radiusKm: finalRadiusKm } = await getDVFMutations(
      lat, lng, radiusKm, monthsBack, dvfTypes,
      property.city as string | undefined,
      property.postalCode as string | undefined,
    );
    let enriched = computePrixM2(mutations);
    enriched = removeOutliers(enriched);
    const dvfStats = computeDVFStats(enriched);
    if (dvfStats) dvfStats.source = source;
    const dvfComparables = toComparables(enriched, property.surface as number, property.rooms as number | undefined);

    // 6. Annonces actives (via MoteurImmo avec code INSEE + coords du sujet)
    const listings = await findActiveListings(propertyWithGeo as never, {
      inseeCode: communeCode,
      lat,
      lng,
    });

    // 7. Valorisation
    const valuation = computeValuation(propertyWithGeo as never, dvfStats ?? null, listings, dvfComparables);

    // 8. Contexte marché
    const marketReading = await fetchNotairesMarket(
      property.postalCode as string,
      property.propertyType as string
    );

    // 9. gptPayload
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

    // 10. Mise à jour en base (on garde gptOutputs existants)
    await prisma.analysis.update({
      where: { id },
      data: {
        address: property.address as string,
        postalCode: property.postalCode as string,
        city: property.city as string,
        lat,
        lng,
        communeCode: communeCode ?? null,
        propertyType: property.propertyType as PropertyType,
        surface: property.surface as number,
        rooms: property.rooms as number ?? null,
        bedrooms: property.bedrooms as number ?? null,
        floor: property.floor as number ?? null,
        totalFloors: property.totalFloors as number ?? null,
        landSurface: property.landSurface as number ?? null,
        yearBuilt: property.yearBuilt as number ?? null,
        condition: property.condition as Condition,
        dpeLetter: property.dpeLetter as string ?? null,
        hasParking: property.hasParking as boolean,
        hasGarage: property.hasGarage as boolean,
        hasBalcony: property.hasBalcony as boolean,
        hasTerrace: property.hasTerrace as boolean,
        hasCellar: property.hasCellar as boolean,
        hasPool: property.hasPool as boolean,
        hasElevator: property.hasElevator as boolean,
        orientation: property.orientation as string ?? null,
        view: property.view as string ?? null,
        valuationLow: valuation.low,
        valuationMid: valuation.mid,
        valuationHigh: valuation.high,
        valuationPsm: valuation.pricePsm,
        confidence: valuation.confidence,
        confidenceLabel: valuation.confidenceLabel,
        dvfSampleSize: dvfStats?.count ?? null,
        dvfMedianPsm: dvfStats?.medianPsm ?? null,
        dvfPeriodMonths: dvfStats?.periodMonths ?? null,
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

    return NextResponse.json({
      success: true,
      valuation,
      dvfStats,
      perimeterKm: finalRadiusKm,
    });
  } catch (err) {
    console.error("[resimulate]", err);
    return NextResponse.json({ error: "Erreur lors de la re-simulation" }, { status: 500 });
  }
}
