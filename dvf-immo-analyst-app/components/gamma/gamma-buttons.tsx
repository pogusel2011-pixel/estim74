"use client";
import { useState } from "react";
import { Copy, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GammaButtonsProps {
  expertPrompt: string;
  clientPrompt: string;
}

type CopyState = "idle" | "copied";

export function GammaButtons({ expertPrompt, clientPrompt }: GammaButtonsProps) {
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
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => copy(expertPrompt, setExpertState)}
        className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50 hover:text-purple-800 hover:border-purple-400"
        title="Copier le prompt Gamma Expert dans le presse-papier"
      >
        {expertState === "copied"
          ? <Check className="h-4 w-4 text-green-600" />
          : <Sparkles className="h-4 w-4" />
        }
        {expertState === "copied" ? "Copié !" : "Prompt Gamma Expert"}
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => copy(clientPrompt, setClientState)}
        className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50 hover:text-purple-800 hover:border-purple-400"
        title="Copier le prompt Gamma Client dans le presse-papier"
      >
        {clientState === "copied"
          ? <Check className="h-4 w-4 text-green-600" />
          : <Sparkles className="h-4 w-4" />
        }
        {clientState === "copied" ? "Copié !" : "Prompt Gamma Client"}
      </Button>
    </>
  );
}
