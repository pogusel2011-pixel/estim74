import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildGPTDossier } from "@/lib/gpt/dossier";
import { buildPrompt, GPT_ACTION_LABELS } from "@/lib/gpt/prompt-builders";
import { buildGPTOutput } from "@/lib/gpt/outputs";
import { generateRuleBasedAnalysis } from "@/lib/gpt/rule-based";
import { GPTActionType } from "@/types/gpt";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { analysisId, action } = await req.json() as { analysisId: string; action: GPTActionType };

    const analysis = await prisma.analysis.findUnique({ where: { id: analysisId } });
    if (!analysis) return NextResponse.json({ error: "Analyse introuvable" }, { status: 404 });

    const openaiKey = process.env.OPENAI_API_KEY;

    const dossier = buildGPTDossier(
      {
        address: analysis.address ?? undefined,
        postalCode: analysis.postalCode ?? undefined,
        city: analysis.city ?? undefined,
        lat: analysis.lat ?? undefined,
        lng: analysis.lng ?? undefined,
        propertyType: analysis.propertyType as never,
        surface: analysis.surface,
        rooms: analysis.rooms ?? undefined,
        bedrooms: analysis.bedrooms ?? undefined,
        floor: analysis.floor ?? undefined,
        totalFloors: analysis.totalFloors ?? undefined,
        landSurface: analysis.landSurface ?? undefined,
        yearBuilt: analysis.yearBuilt ?? undefined,
        condition: analysis.condition as never,
        dpeLetter: analysis.dpeLetter as never,
        hasParking: analysis.hasParking,
        hasGarage: analysis.hasGarage,
        hasBalcony: analysis.hasBalcony,
        hasTerrace: analysis.hasTerrace,
        hasCellar: analysis.hasCellar,
        hasPool: analysis.hasPool,
        hasElevator: analysis.hasElevator,
        orientation: analysis.orientation as never,
        view: analysis.view ?? undefined,
      },
      {
        low: analysis.valuationLow ?? 0,
        mid: analysis.valuationMid ?? 0,
        high: analysis.valuationHigh ?? 0,
        pricePsm: analysis.valuationPsm ?? 0,
        confidence: analysis.confidence ?? 0,
        confidenceLabel: analysis.confidenceLabel as never ?? "Faible",
        method: "dvf_stats",
        adjustments: (analysis.adjustments as never) ?? [],
        breakdown: { basePrice: 0, basePsm: 0, adjustedPsm: 0, totalAdjustmentFactor: 0, dvfWeight: 0.7, listingsWeight: 0.3 },
      },
      (analysis.dvfStats as never) ?? null,
      (analysis.marketReading as never) ?? null
    );

    let content: string;
    let model: string;
    let tokens: number | undefined;

    if (!openaiKey) {
      // Fallback rule-based — no external API call
      content = generateRuleBasedAnalysis(action, dossier);
      model = "rule-based";
    } else {
      const prompt = buildPrompt(action, dossier);
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 1200,
          temperature: 0.7,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        let errMsg = `Erreur OpenAI (${response.status})`;
        try {
          const errJson = JSON.parse(errText);
          if (errJson.error?.message) errMsg = errJson.error.message;
        } catch { /* ignore */ }
        console.error("[GPT] OpenAI API error:", response.status, errText.slice(0, 300));
        // Degrade gracefully to rule-based on API failure
        content = generateRuleBasedAnalysis(action, dossier);
        model = "rule-based";
      } else {
        const data = await response.json();
        content = data.choices?.[0]?.message?.content ?? "";
        tokens = data.usage?.total_tokens;
        model = "gpt-4o";

        if (!content) {
          return NextResponse.json({ error: "Réponse GPT vide — veuillez réessayer." }, { status: 502 });
        }
      }
    }

    const output = buildGPTOutput(action, GPT_ACTION_LABELS[action], content, model, tokens);

    const existing = ((analysis.gptOutputs as never[]) ?? []) as typeof output[];
    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        gptOutputs: [
          ...existing.filter((o: { actionType: string }) => o.actionType !== action),
          output,
        ] as never,
      },
    });

    return NextResponse.json(output);
  } catch (err) {
    console.error("[POST /api/gpt]", err);
    const msg = err instanceof Error ? err.message : "Erreur GPT inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
