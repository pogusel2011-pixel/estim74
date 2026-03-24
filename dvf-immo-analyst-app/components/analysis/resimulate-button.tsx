"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ResimulateButtonProps {
  analysisId: string;
}

export function ResimulateButton({ analysisId }: ResimulateButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResimulate() {
    setLoading(true);
    setSuccess(false);
    setError(null);
    try {
      const res = await fetch(`/api/analyses/${analysisId}/resimulate`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erreur lors de la re-simulation");
      }
      setSuccess(true);
      router.refresh();
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
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
      {success && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Estimation recalculée avec les données DVF actuelles
        </p>
      )}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
