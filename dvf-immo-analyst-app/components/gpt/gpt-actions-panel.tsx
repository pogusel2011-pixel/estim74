"use client";
import { useState } from "react";
import { GPTOutput, GPTActionType } from "@/types/gpt";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { GPTOutputCard } from "./gpt-output-card";
import { ChatGPTButton } from "./chatgpt-button";
import { GPT_ACTION_LABELS } from "@/lib/gpt/prompt-builders";
import { Sparkles, Loader2, Download } from "lucide-react";

interface Props {
  analysisId: string;
  initialOutputs: GPTOutput[];
  chatgptPrompt?: string;
  address?: string | null;
  city?: string | null;
}

const ACTIONS: GPTActionType[] = ["MARKET_ANALYSIS", "NEGOTIATION_ADVICE", "INVESTMENT_POTENTIAL", "PROPERTY_DESCRIPTION", "RISK_ASSESSMENT"];

export function GPTActionsPanel({ analysisId, initialOutputs, chatgptPrompt, address, city }: Props) {
  const [outputs, setOutputs] = useState<GPTOutput[]>(initialOutputs);
  const [loading, setLoading] = useState<GPTActionType | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleDownload() {
    if (!chatgptPrompt) return;
    const slug = [address, city]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z0-9À-ÿ\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    const date = new Date().toISOString().slice(0, 10);
    const filename = `dossier-gpt_${slug || "bien"}_${date}.txt`;
    const blob = new Blob([chatgptPrompt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function runAction(action: GPTActionType) {
    setLoading(action);
    setError(null);
    try {
      const res = await fetch("/api/gpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, action }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Erreur GPT");
      }
      const output: GPTOutput = await res.json();
      setOutputs((prev) => [output, ...prev.filter((o) => o.actionType !== action)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Bloc DVF Immo Analyst (GPT personnalisé) */}
      {chatgptPrompt && (
        <Card className="border-[#10a37f]/30 bg-[#10a37f]/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-[#0d7a5f]">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#10a37f] shrink-0" aria-hidden="true">
                <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
              </svg>
              DVF Immo Analyst — GPT personnalisé
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Le dossier complet (bien, estimation, DVF, comparables, annonces, PLU, risques, servitudes, proximités, SWOT) sera copié dans votre presse-papier.
              Collez-le dans le GPT personnalisé pour générer un rapport structuré.
            </p>
            <ChatGPTButton
              promptText={chatgptPrompt}
              variant="default"
              size="sm"
              showInstructions={true}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="gap-2 w-full border-[#10a37f]/40 text-[#0d7a5f] hover:bg-[#10a37f]/10 hover:border-[#10a37f]"
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              Télécharger le dossier GPT (.txt)
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Analyses IA intégrées (GPT-4o via API) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Analyses IA intégrées (GPT-4o)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-destructive mb-3">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {ACTIONS.map((action) => (
              <Button
                key={action}
                variant={outputs.some(o => o.actionType === action) ? "secondary" : "outline"}
                size="sm"
                onClick={() => runAction(action)}
                disabled={loading !== null}
              >
                {loading === action ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1.5 h-3 w-3" />}
                {GPT_ACTION_LABELS[action]}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {outputs.length > 0 && <Separator />}

      {outputs.map((output) => (
        <GPTOutputCard key={output.id} output={output} />
      ))}
    </div>
  );
}
