"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Check } from "lucide-react";

const GPT_URL =
  "https://chatgpt.com/g/g-69914d0e2aa48191955454117055fdc6-dvf-immo-analyst";

interface Props {
  analysisId: string;
}

export function GptAnalyzeButton({ analysisId }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    const message = `[APPEL ACTION] getAnalysis id=${analysisId}\nAppelle immédiatement l'action getAnalysis avec cet id et fais l'analyse complète.`;

    try {
      await navigator.clipboard.writeText(message);
    } catch {
      // Clipboard refusé — on ouvre quand même le GPT
    }

    window.open(GPT_URL, "_blank", "noopener,noreferrer");
    setCopied(true);
    setTimeout(() => setCopied(false), 4000);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        onClick={handleClick}
        className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
        )}
        {copied ? "Message copié !" : "Analyser avec mon GPT"}
      </Button>

      {copied && (
        <p className="text-xs text-emerald-700 animate-in fade-in slide-in-from-top-1">
          Collez-le dans ChatGPT
        </p>
      )}
    </div>
  );
}
