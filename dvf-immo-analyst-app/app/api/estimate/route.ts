import { NextResponse } from "next/server";
import { estimateRequestSchema } from "@/lib/validation/estimate";
import { getDVFMutations } from "@/lib/dvf/client";
import { computePrixM2, markOutliers } from "@/lib/dvf/outliers";
import { computeMarketPressure } from "@/lib/moteurimmo/qualitative";
import { computeDVFStats } from "@/lib/dvf/stats";
import { toComparables } from "@/lib/dvf/comparables";
import { propertyTypeToDvfTypes } from "@/lib/mapping/property-type";
import { findActiveListings } from "@/lib/moteurimmo/search";
import { computeValuation } from "@/lib/valuation/valuation";
import { fetchNotairesMarket } from "@/lib/notaires/market-check";
import { checkRefusalConditions } from "@/lib/valuation/refusal-matrix";
import { prisma } from "@/lib/prisma";
import { geocodeAddress, isGeoError } from "@/lib/geo/address";
import { getInseeByPostalCodeAndCommune, getInseeByPostalCode } from "@/lib/geo/cp-insee";

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
    let communeCode: string | undefined;

    if (!lat || !lng) {
      // Geocode from address if provided, otherwise fall back to city + postal code
      const geocodeQuery = property.address || property.city;
      if (!geocodeQuery) {
        return NextResponse.json({ error: "La commune est requise pour l'estimation" }, { status: 422 });
      }
      const geo = await geocodeAddress(geocodeQuery, property.postalCode);
      if (isGeoError(geo)) {
        return NextResponse.json({ error: geo.error }, { status: 422 });
      }
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
        communeCode = geo.citycode;
      }
    }

    if (!lat || !lng) {
      return NextResponse.json({ error: "Impossible de géolocaliser le bien — vérifiez la commune et le code postal" }, { status: 422 });
    }

    // Fallback : enrichir communeCode depuis le référentiel cp-insee-74 si BAN ne l'a pas retourné
    if (!communeCode && property.postalCode) {
      communeCode =
        (property.city
          ? getInseeByPostalCodeAndCommune(property.postalCode, property.city)
          : undefined) ?? getInseeByPostalCode(property.postalCode);
    }

    const propertyWithGeo = { ...property, lat, lng };

    // 2. DVF — mutations (avec auto-expansion du rayon si < 5 transactions)
    // On passe city + postalCode pour activer le filtre INSEE secondaire (mutations sans coords)
    const dvfTypes = propertyTypeToDvfTypes(property.propertyType);
    const { mutations, source, radiusKm: finalRadiusKm } = await getDVFMutations(
      lat, lng, radiusKm, monthsBack, dvfTypes,
      property.city, property.postalCode
    );
    let enrichedMutations = computePrixM2(mutations);
    // Toujours marquer les outliers (IQR×2) — ils restent visibles dans le tableau avec badge
    enrichedMutations = markOutliers(enrichedMutations);
    const cleanMutations = excludeOutliers
      ? enrichedMutations.filter((m) => !m.outlier)
      : enrichedMutations.filter((m) => !m.outlier); // stats toujours sur clean
    const excludedCount = enrichedMutations.length - cleanMutations.length;

    const dvfStats = computeDVFStats(cleanMutations);
    if (dvfStats) {
      dvfStats.source = source;
      dvfStats.excludedCount = excludedCount;
    }

    // Comparables : inclure TOUTES les mutations (outliers inclus, badgés dans le tableau)
    const dvfComparables = toComparables(enrichedMutations, property.surface, property.rooms);

    // 3. Matrice de refus — vérification des conditions bloquantes et avertissements
    const { blocking, warnings } = checkRefusalConditions({
      dvfStats,
      lat,
      lng,
      surface: property.surface,
    });

    if (blocking) {
      console.warn(`[estimate] Refus bloquant: ${blocking.code} — ${blocking.technicalLog}`);
      return NextResponse.json(
        {
          error: blocking.userMessage,
          code: blocking.code,
          corrective: blocking.corrective,
        },
        { status: 422 }
      );
    }

    if (warnings.length > 0) {
      console.log(`[estimate] Avertissements: ${warnings.map(w => w.code).join(", ")}`);
    }

    // 5. Annonces actives (via MoteurImmo avec code INSEE + coords du sujet)
    const listings = includeListings
      ? await findActiveListings(propertyWithGeo, {
          inseeCode: communeCode,
          lat,
          lng,
        })
      : [];

    // 6. Pression de marché affiché/signé (méthode pro) — enrichit dvfStats avant la valorisation
    const marketPressure = computeMarketPressure(dvfStats ?? null, listings);
    if (dvfStats && marketPressure) {
      dvfStats.marketPressure = marketPressure;
    }

    // 7. Valorisation (applique marketPressure depuis dvfStats.marketPressure)
    const valuation = computeValuation(propertyWithGeo, dvfStats ?? null, listings, dvfComparables);

    // 8. Contexte marché Notaires
    const marketReading = await fetchNotairesMarket(property.postalCode, property.propertyType);

    // 8. Construction du gptPayload (export complet pour GPT)
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

    // 9. Sauvegarde en BDD
    let analysisId: string | null = null;
    try {
      const saved = await prisma.analysis.create({
        data: {
          address: property.address,
          postalCode: property.postalCode,
          city: property.city,
          lat,
          lng,
          communeCode: communeCode ?? null,
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
      warnings: warnings.map(w => ({
        code: w.code,
        message: w.userMessage,
        corrective: w.corrective,
      })),
    });
  } catch (err) {
    console.error("[POST /api/estimate]", err);
    return NextResponse.json({ error: "Erreur estimation" }, { status: 500 });
  }
}
