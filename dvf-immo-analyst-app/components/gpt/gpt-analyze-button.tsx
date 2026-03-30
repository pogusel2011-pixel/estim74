"use client";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

const GPT_BASE =
  "https://chatgpt.com/g/g-69914d0e2aa48191955454117055fdc6-dvf-immo-analyst";

interface Props {
  analysisId: string;
}

export function GptAnalyzeButton({ analysisId }: Props) {
  function handleClick() {
    const message = `Analyse l'estimation avec l'id : ${analysisId}`;
    const url = `${GPT_BASE}?q=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <Button
      size="sm"
      onClick={handleClick}
      className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0" />
      Analyser avec mon GPT
    </Button>
  );
}
