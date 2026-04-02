import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateGammaDoc } from "@/lib/gamma/gamma-api-client";
import { buildGammaExpertPrompt, buildGammaClientPrompt } from "@/lib/gamma/gamma-prompt-builder";
import { Adjustment } from "@/types/valuation";
import { DVFStats } from "@/types/dvf";
import { GPTOutput } from "@/types/gpt";

export const dynamic = "force-dynamic";
// Allow up to 180s for Gamma generation + polling (Next.js Edge/Serverless timeout)
export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const { analysisId, type } = (await req.json()) as {
      analysisId: string;
      type: "expert" | "client";
    };

    if (!process.env.GAMMA_API_KEY) {
      return NextResponse.json(
        { error: "MISSING_KEY", message: "Clé API Gamma manquante" },
        { status: 503 }
      );
    }

    const analysis = await prisma.analysis.findUnique({ where: { id: analysisId } });
    if (!analysis) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Analyse introuvable" }, { status: 404 });
    }

    const serialized = JSON.parse(JSON.stringify(analysis)) as Record<string, unknown>;
    const adjustments: Adjustment[] = Array.isArray(serialized.adjustments)
      ? (serialized.adjustments as Adjustment[])
      : [];
    const gptOutputs: GPTOutput[] = Array.isArray(serialized.gptOutputs)
      ? (serialized.gptOutputs as GPTOutput[])
      : [];
    const dvfStats = (serialized.dvfStats as DVFStats | null) ?? null;
    const perimeterKm = (serialized.perimeterKm as number | null) ?? null;

    const gammaInput = { serialized, adjustments, gptOutputs, dvfStats, perimeterKm };

    const prompt =
      type === "expert"
        ? buildGammaExpertPrompt(gammaInput)
        : buildGammaClientPrompt(gammaInput);

    const result = await generateGammaDoc(prompt);

    return NextResponse.json({ ...result, status: "completed" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur inconnue";

    if (msg === "TIMEOUT") {
      return NextResponse.json(
        { error: "TIMEOUT", message: "Génération trop longue — réessayer" },
        { status: 504 }
      );
    }
    if (msg === "INSUFFICIENT_CREDITS") {
      return NextResponse.json(
        { error: "INSUFFICIENT_CREDITS", message: "Crédits Gamma insuffisants" },
        { status: 403 }
      );
    }
    if (msg === "MISSING_KEY") {
      return NextResponse.json(
        { error: "MISSING_KEY", message: "Clé API Gamma manquante" },
        { status: 503 }
      );
    }

    console.error("[Gamma Generate]", err);
    return NextResponse.json(
      { error: "GENERATION_FAILED", message: msg },
      { status: 500 }
    );
  }
}
