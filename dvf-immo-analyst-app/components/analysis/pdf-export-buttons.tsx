"use client";
import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  analysisId: string;
}

type Version = "expert" | "client";

async function generatePDF(analysisId: string, version: Version): Promise<void> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const url = `/analyses/${analysisId}/print-${version}?noprint=1`;
  const filename = `estim74-${version}-${analysisId.slice(0, 8)}.pdf`;

  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;top:0;left:0;width:794px;height:1px;opacity:0;pointer-events:none;border:none;";
  iframe.src = url;
  document.body.appendChild(iframe);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timeout chargement page")),
      25000
    );
    iframe.onload = () => {
      clearTimeout(timeout);
      resolve();
    };
    iframe.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("Erreur chargement page"));
    };
  });

  // Extra time for fonts/images
  await new Promise((r) => setTimeout(r, 1200));

  const doc = iframe.contentDocument;
  if (!doc) throw new Error("Impossible d'accéder au document");

  const sheet = doc.querySelector<HTMLElement>(".print-sheet");
  if (!sheet) throw new Error("Contenu PDF introuvable");

  sheet.style.width = "794px";

  const canvas = await html2canvas(sheet, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: 794,
  });

  document.body.removeChild(iframe);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 0;
  const contentW = pageW - margin * 2;
  const imgH = (canvas.height * contentW) / canvas.width;

  let yOffset = 0;
  while (yOffset < imgH) {
    if (yOffset > 0) pdf.addPage();
    const pageImgH = Math.min(pageH - margin * 2, imgH - yOffset);
    const srcY = Math.floor((yOffset / imgH) * canvas.height);
    const srcH = Math.ceil((pageImgH / imgH) * canvas.height);

    const crop = document.createElement("canvas");
    crop.width = canvas.width;
    crop.height = srcH;
    crop.getContext("2d")!.drawImage(canvas, 0, -srcY);

    pdf.addImage(
      crop.toDataURL("image/jpeg", 0.93),
      "JPEG",
      margin,
      margin,
      contentW,
      pageImgH
    );
    yOffset += pageImgH;
  }

  pdf.save(filename);
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
      await generatePDF(analysisId, version);
    } catch (err) {
      console.error(`[PDF ${version}]`, err);
      setError("Erreur génération PDF — utilisez Ctrl+P");
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
        variant={version === "expert" ? "outline" : "outline"}
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
        <p className="text-xs text-destructive text-right max-w-[180px]">{error}</p>
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
