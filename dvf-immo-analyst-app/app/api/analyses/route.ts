import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AnalysisSummary } from "@/types/analysis";

export async function GET() {
  try {
    const analyses = await prisma.analysis.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, createdAt: true, address: true, city: true,
        propertyType: true, surface: true, valuationMid: true,
        confidence: true, confidenceLabel: true, status: true,
      },
    });

    const summaries: AnalysisSummary[] = analyses.map((a) => ({
      id: a.id,
      createdAt: a.createdAt.toISOString(),
      address: a.address,
      city: a.city,
      propertyType: a.propertyType,
      surface: a.surface,
      valuationMid: a.valuationMid ?? undefined,
      confidence: a.confidence ?? undefined,
      confidenceLabel: a.confidenceLabel ?? undefined,
      status: a.status as never,
    }));

    return NextResponse.json(summaries);
  } catch (err) {
    console.error("[GET /api/analyses]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await prisma.analysis.deleteMany({});
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/analyses]", err);
    return NextResponse.json({ error: "Erreur suppression" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const analysis = await prisma.analysis.create({
      data: {
        address: body.address,
        postalCode: body.postalCode,
        city: body.city,
        lat: body.lat,
        lng: body.lng,
        irisCode: body.irisCode,
        propertyType: body.propertyType,
        surface: body.surface,
        rooms: body.rooms,
        bedrooms: body.bedrooms,
        floor: body.floor,
        totalFloors: body.totalFloors,
        landSurface: body.landSurface,
        yearBuilt: body.yearBuilt,
        condition: body.condition ?? "AVERAGE",
        dpeLetter: body.dpeLetter,
        gheGrade: body.ghgGrade,
        hasParking: body.hasParking ?? false,
        hasGarage: body.hasGarage ?? false,
        hasBalcony: body.hasBalcony ?? false,
        hasTerrace: body.hasTerrace ?? false,
        hasCellar: body.hasCellar ?? false,
        hasPool: body.hasPool ?? false,
        hasElevator: body.hasElevator ?? false,
        orientation: body.orientation,
        view: body.view,
        status: "DRAFT",
      },
    });
    return NextResponse.json(analysis, { status: 201 });
  } catch (err) {
    console.error("[POST /api/analyses]", err);
    return NextResponse.json({ error: "Erreur création" }, { status: 500 });
  }
}
