const BASE_URL = "https://public-api.gamma.app";
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 120_000;

export interface GammaResult {
  gammaUrl: string;
  exportUrl?: string;
}

type GenerationStatus = {
  status: "pending" | "completed" | "failed";
  gammaUrl?: string;
  exportUrl?: string;
  error?: string;
};

/**
 * Generates a Gamma document from a text prompt and polls until completed.
 *
 * @param prompt  Full text prompt (markdown) built by gamma-prompt-builder
 * @returns       { gammaUrl, exportUrl } when generation is complete
 * @throws        Error("MISSING_KEY") | Error("INSUFFICIENT_CREDITS") | Error("TIMEOUT") | Error(message)
 */
export async function generateGammaDoc(prompt: string): Promise<GammaResult> {
  const apiKey = process.env.GAMMA_API_KEY;
  if (!apiKey) throw new Error("MISSING_KEY");

  const authHeaders = {
    "X-API-KEY": apiKey,
    "Content-Type": "application/json",
  };

  // ── Step 1: Create generation ──────────────────────────────────────────────
  const createRes = await fetch(`${BASE_URL}/v1.0/generations`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      inputText: prompt,
      textMode: "preserve",
      format: "document",
      exportAs: "pdf",
      additionalInstructions:
        "Professional real estate document, blue color scheme, clean and modern",
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({ message: "Erreur inconnue" })) as { message?: string };
    const msg = err.message ?? `Gamma API erreur ${createRes.status}`;
    if (createRes.status === 403 && msg.toLowerCase().includes("credit")) {
      throw new Error("INSUFFICIENT_CREDITS");
    }
    throw new Error(msg);
  }

  const { generationId } = await createRes.json() as { generationId: string };
  console.log(`[Gamma] Génération démarrée : ${generationId}`);

  // ── Step 2: Poll for completion ────────────────────────────────────────────
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const statusRes = await fetch(`${BASE_URL}/v1.0/generations/${generationId}`, {
      headers: { "X-API-KEY": apiKey },
    });

    if (!statusRes.ok) {
      throw new Error(`Erreur polling Gamma (${statusRes.status})`);
    }

    const data = (await statusRes.json()) as GenerationStatus;
    console.log(`[Gamma] Statut ${generationId} : ${data.status}`);

    if (data.status === "completed") {
      return {
        gammaUrl: data.gammaUrl!,
        exportUrl: data.exportUrl,
      };
    }

    if (data.status === "failed") {
      throw new Error(data.error ?? "Génération Gamma échouée");
    }
    // status === "pending" → keep polling
  }

  throw new Error("TIMEOUT");
}
