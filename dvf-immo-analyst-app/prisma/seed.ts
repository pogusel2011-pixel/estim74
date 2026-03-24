import { PrismaClient, PropertyType, Condition, AnalysisStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  await prisma.analysis.createMany({
    data: [
      {
        address: "12 Rue des Alpes",
        postalCode: "74000",
        city: "Annecy",
        lat: 45.8992,
        lng: 6.1294,
        propertyType: PropertyType.APARTMENT,
        surface: 65,
        rooms: 3,
        bedrooms: 2,
        floor: 2,
        totalFloors: 5,
        yearBuilt: 1985,
        condition: Condition.GOOD,
        dpeLetter: "C",
        hasParking: true,
        hasBalcony: true,
        valuationLow: 280000,
        valuationMid: 312000,
        valuationHigh: 340000,
        valuationPsm: 4800,
        confidence: 0.82,
        confidenceLabel: "Bonne",
        dvfSampleSize: 47,
        dvfMedianPsm: 4650,
        dvfPeriodMonths: 24,
        perimeterKm: 0.5,
        status: AnalysisStatus.COMPLETE,
      },
      {
        address: "8 Chemin du Lac",
        postalCode: "74290",
        city: "Talloires",
        lat: 45.8358,
        lng: 6.2061,
        propertyType: PropertyType.HOUSE,
        surface: 145,
        rooms: 6,
        bedrooms: 4,
        landSurface: 800,
        yearBuilt: 1972,
        condition: Condition.AVERAGE,
        dpeLetter: "E",
        hasGarage: true,
        hasPool: false,
        valuationLow: 680000,
        valuationMid: 750000,
        valuationHigh: 820000,
        valuationPsm: 5172,
        confidence: 0.68,
        confidenceLabel: "Correcte",
        dvfSampleSize: 18,
        dvfMedianPsm: 5000,
        dvfPeriodMonths: 36,
        perimeterKm: 1.0,
        status: AnalysisStatus.COMPLETE,
      },
    ],
  });

  console.log("✅ Seed terminé");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
