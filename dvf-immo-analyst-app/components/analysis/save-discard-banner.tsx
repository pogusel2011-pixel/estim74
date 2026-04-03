"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SaveDiscardBannerProps {
  analysisId: string;
}

export function SaveDiscardBanner({ analysisId }: SaveDiscardBannerProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  function handleSave() {
    router.replace(`/analyses/${analysisId}`);
  }

  async function handleDiscard() {
    setDeleting(true);
    try {
      await fetch(`/api/analyses/${analysisId}`, { method: "DELETE" });
      router.push("/analyses");
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 mb-5">
      <div>
        <p className="text-sm font-semibold text-blue-900">Estimation non sauvegardée</p>
        <p className="text-xs text-blue-700 mt-0.5">
          Sauvegardez ce dossier pour le retrouver dans votre historique, ou supprimez-le si c'est une estimation temporaire.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
          onClick={handleDiscard}
          disabled={deleting}
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          {deleting ? "Suppression…" : "Ne pas sauvegarder"}
        </Button>
        <Button
          size="sm"
          className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          onClick={handleSave}
        >
          <Save className="h-3.5 w-3.5" />
          Sauvegarder
        </Button>
      </div>
    </div>
  );
}
