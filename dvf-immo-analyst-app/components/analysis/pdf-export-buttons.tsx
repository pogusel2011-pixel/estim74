"use client";
import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  analysisId: string;
}

type Version = "expert" | "client";

async function downloadPdf(analysisId: string, version: Version): Promise<void> {
  const url = `/api/pdf/${version}/${analysisId}`;
  const res = await fetch(url);
  if (!res.ok) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(msg || `Erreur serveur (${res.status})`);
  }
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = `estim74-${version}-${analysisId.slice(0, 8).toUpperCase()}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objUrl);
}

function PdfButton({
  analysisId,
  version,
  label,
}: {
  analysisId: string;
  version: Version;
  label: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setLoading(true);
    setError(null);
    try {
      await downloadPdf(analysisId, version);
    } catch (err) {
      console.error(`[PDF ${version}]`, err);
      setError(err instanceof Error ? err.message : "Erreur génération PDF");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <Button
        onClick={handle}
        disabled={loading}
        size="sm"
        variant="outline"
        className="gap-2 text-xs"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileText className="h-3.5 w-3.5" />
        )}
        {loading ? "Génération…" : label}
      </Button>
      {error && (
        <p className="text-xs text-destructive text-right max-w-[200px]">{error}</p>
      )}
    </div>
  );
}

export function PdfExportButtons({ analysisId }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <PdfButton analysisId={analysisId} version="expert" label="Export Expert" />
      <PdfButton analysisId={analysisId} version="client" label="Export Client" />
    </div>
  );
}
