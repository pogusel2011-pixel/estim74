"use client";
import { useState } from "react";
import { RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ResimulateButtonProps {
  analysisId: string;
}

export function ResimulateButton({ analysisId }: ResimulateButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResimulate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analyses/${analysisId}/resimulate`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erreur lors de la re-simulation");
      }
      // Hard reload — bypasses Next.js router cache so the server re-renders
      // the page with the updated DVF stats, valuation and comparables.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={handleResimulate}
        disabled={loading}
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Recalcul en cours…" : "Re-simuler l'estimation"}
      </Button>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
