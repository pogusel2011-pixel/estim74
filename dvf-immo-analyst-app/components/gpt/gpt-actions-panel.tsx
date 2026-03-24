"use client";
import { useState } from "react";
import { GPTOutput, GPTActionType } from "@/types/gpt";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GPTOutputCard } from "./gpt-output-card";
import { GPT_ACTION_LABELS } from "@/lib/gpt/prompt-builders";
import { Sparkles, Loader2 } from "lucide-react";

interface Props { analysisId: string; initialOutputs: GPTOutput[]; }

const ACTIONS: GPTActionType[] = ["MARKET_ANALYSIS", "NEGOTIATION_ADVICE", "INVESTMENT_POTENTIAL", "PROPERTY_DESCRIPTION", "RISK_ASSESSMENT"];

export function GPTActionsPanel({ analysisId, initialOutputs }: Props) {
  const [outputs, setOutputs] = useState<GPTOutput[]>(initialOutputs);
  const [loading, setLoading] = useState<GPTActionType | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Analyses IA (GPT-4o)
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

      {outputs.map((output) => (
        <GPTOutputCard key={output.id} output={output} />
      ))}
    </div>
  );
}
