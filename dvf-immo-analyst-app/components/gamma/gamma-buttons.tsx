"use client";
import { useState } from "react";
import { Copy, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GammaGenerateButtons } from "./gamma-generate-buttons";

interface GammaButtonsProps {
  analysisId: string;
  expertPrompt: string;
  clientPrompt: string;
}

type CopyState = "idle" | "copied";

export function GammaButtons({ analysisId, expertPrompt, clientPrompt }: GammaButtonsProps) {
  const [expertState, setExpertState] = useState<CopyState>("idle");
  const [clientState, setClientState] = useState<CopyState>("idle");

  async function copy(text: string, setState: (s: CopyState) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {/* ── Génération directe via Gamma API ── */}
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <GammaGenerateButtons analysisId={analysisId} />
      </div>

      {/* ── Copie du prompt (fallback) ── */}
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => copy(expertPrompt, setExpertState)}
          className="gap-1 text-xs text-muted-foreground hover:text-purple-700 h-7 px-2"
          title="Copier le prompt Gamma Expert dans le presse-papier"
        >
          {expertState === "copied"
            ? <Check className="h-3 w-3 text-green-600" />
            : <Copy className="h-3 w-3" />
          }
          {expertState === "copied" ? "Copié !" : "Copier prompt Expert"}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => copy(clientPrompt, setClientState)}
          className="gap-1 text-xs text-muted-foreground hover:text-purple-700 h-7 px-2"
          title="Copier le prompt Gamma Client dans le presse-papier"
        >
          {clientState === "copied"
            ? <Check className="h-3 w-3 text-green-600" />
            : <Copy className="h-3 w-3" />
          }
          {clientState === "copied" ? "Copié !" : "Copier prompt Client"}
        </Button>
      </div>

      <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
        <Sparkles className="h-2.5 w-2.5" />
        Powered by Gamma
      </div>
    </div>
  );
}
