import { NextResponse } from "next/server";
import { fetchPappersStats } from "@/lib/pappers/stats";

/**
 * GET /api/pappers/stats?city=Annecy&postalCode=74000
 *
 * Returns commune-level real estate stats from the public Pappers Immobilier
 * SSR payload — no Pappers API key required.
 *
 * Response: PappersStats | { error: string }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = (searchParams.get("city") ?? "").trim();
  const postalCode = (searchParams.get("postalCode") ?? "").trim();

  if (!city) {
    return NextResponse.json({ error: "city manquant" }, { status: 400 });
  }

  const stats = await fetchPappersStats(city, postalCode || undefined);

  if (!stats) {
    return NextResponse.json(
      { error: "Données Pappers Immobilier non disponibles pour cette commune" },
      { status: 404 }
    );
  }

  return NextResponse.json(stats);
}
