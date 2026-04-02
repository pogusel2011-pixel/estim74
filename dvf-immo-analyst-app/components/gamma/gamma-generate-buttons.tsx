"use client";
import { useState } from "react";
import { Loader2, Sparkles, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  analysisId: string;
}

type GenState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; gammaUrl: string }
  | { status: "error"; message: string };

function useGenerate(analysisId: string, type: "expert" | "client") {
  const [state, setState] = useState<GenState>({ status: "idle" });

  async function generate() {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/gamma/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, type }),
      });
      const data = await res.json() as { gammaUrl?: string; message?: string; error?: string };

      if (!res.ok || !data.gammaUrl) {
        setState({ status: "error", message: data.message ?? "Erreur de génération" });
        return;
      }

      setState({ status: "done", gammaUrl: data.gammaUrl });
      window.open(data.gammaUrl, "_blank", "noopener,noreferrer");
    } catch {
      setState({ status: "error", message: "Erreur réseau — réessayer" });
    }
  }

  function reset() {
    setState({ status: "idle" });
  }

  return { state, generate, reset };
}

function GammaGenButton({
  label,
  analysisId,
  type,
}: {
  label: string;
  analysisId: string;
  type: "expert" | "client";
}) {
  const { state, generate, reset } = useGenerate(analysisId, type);

  if (state.status === "done") {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <a
          href={state.gammaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-purple-700 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          Ouvrir le document
        </a>
        <button
          onClick={reset}
          className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          Générer à nouveau
        </button>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-xs text-red-600 font-medium">{state.message}</span>
        <button
          onClick={reset}
          className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={generate}
      disabled={state.status === "loading"}
      className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50 hover:text-purple-800 hover:border-purple-400 disabled:opacity-70"
      title={`Générer ${label} via Gamma`}
    >
      {state.status === "loading" ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          <span className="whitespace-nowrap">Génération en cours&hellip; ~30s</span>
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4 shrink-0" />
          {label}
        </>
      )}
    </Button>
  );
}

export function GammaGenerateButtons({ analysisId }: Props) {
  return (
    <>
      <GammaGenButton
        label="Générer Avis Expert"
        analysisId={analysisId}
        type="expert"
      />
      <GammaGenButton
        label="Générer Avis Client"
        analysisId={analysisId}
        type="client"
      />
    </>
  );
}
