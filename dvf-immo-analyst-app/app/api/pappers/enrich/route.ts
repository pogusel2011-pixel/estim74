import { NextResponse } from "next/server";
import { fetchPappersEnrich } from "@/lib/pappers/client";

/**
 * GET /api/pappers/enrich?adresse=[adresse]&postalCode=[cp]
 *
 * Appelle Pappers Immobilier pour récupérer le DPE et l'année de construction.
 * Permet au formulaire côté client de pré-remplir ces champs sans exposer la clé API.
 *
 * Réponse : { dpeLetter?, yearBuilt?, source: "pappers" }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const adresse = (searchParams.get("adresse") ?? "").trim();
  const postalCode = (searchParams.get("postalCode") ?? "").trim() || undefined;

  if (!adresse || adresse.length < 5) {
    return NextResponse.json(
      { error: "Adresse manquante ou trop courte" },
      { status: 400 }
    );
  }

  const result = await fetchPappersEnrich(adresse, postalCode);

  if (!result) {
    return NextResponse.json({ source: "pappers", dpeLetter: null, yearBuilt: null });
  }

  return NextResponse.json({
    source: "pappers",
    dpeLetter: result.dpeLetter ?? null,
    yearBuilt: result.yearBuilt ?? null,
  });
}
