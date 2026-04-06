"use client";
import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RefreshButton() {
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    const now = new Date();
    setLoadedAt(
      now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    );
  }, []);

  function handleClick() {
    if (spinning) return;
    setSpinning(true);
    // Small delay so the spin animation is guaranteed to render
    // before the browser starts the page reload.
    setTimeout(() => {
      window.location.reload();
    }, 300);
  }

  return (
    <div className="flex items-center gap-2">
      {loadedAt && (
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Actualisé à {loadedAt}
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleClick}
        disabled={spinning}
        className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-7 px-2 disabled:opacity-60"
        title="Actualiser la page"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${spinning ? "animate-spin" : ""}`} />
        <span className="hidden sm:inline">Actualiser</span>
      </Button>
    </div>
  );
}
