"use client";
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  analysisId: string;
  filename?: string;
}

export function PdfDownloadButton({ analysisId, filename }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      // Load the print page in a hidden iframe to capture it
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;top:0;left:0;width:210mm;height:1px;opacity:0;pointer-events:none;border:none;";
      iframe.src = `/analyses/${analysisId}/print?noprint=1`;
      document.body.appendChild(iframe);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timeout chargement page")), 15000);
        iframe.onload = () => { clearTimeout(timeout); resolve(); };
        iframe.onerror = () => { clearTimeout(timeout); reject(new Error("Erreur chargement page")); };
      });

      // Give fonts/images extra time to render
      await new Promise((r) => setTimeout(r, 800));

      const doc = iframe.contentDocument;
      if (!doc) throw new Error("Impossible d'accéder au document");

      const sheet = doc.querySelector<HTMLElement>(".print-sheet");
      if (!sheet) throw new Error("Contenu PDF introuvable");

      // Make sheet full-width for capture
      const origWidth = sheet.style.width;
      sheet.style.width = "794px"; // ~A4 at 96dpi

      const canvas = await html2canvas(sheet, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: 794,
      });

      sheet.style.width = origWidth;
      document.body.removeChild(iframe);

      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentW = pageW - margin * 2;
      const imgH = (canvas.height * contentW) / canvas.width;

      let yOffset = 0;
      while (yOffset < imgH) {
        if (yOffset > 0) pdf.addPage();
        const srcY = (yOffset / imgH) * canvas.height;
        const pageImgH = Math.min(pageH - margin * 2, imgH - yOffset);
        const srcH = (pageImgH / imgH) * canvas.height;

        // Crop to current page slice
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = canvas.width;
        cropCanvas.height = Math.ceil(srcH);
        const ctx = cropCanvas.getContext("2d")!;
        ctx.drawImage(canvas, 0, -Math.floor(srcY));

        pdf.addImage(
          cropCanvas.toDataURL("image/jpeg", 0.92),
          "JPEG",
          margin,
          margin,
          contentW,
          pageImgH
        );
        yOffset += pageImgH;
      }

      const pdfFilename = filename ?? `estim74-${analysisId.slice(0, 8)}.pdf`;
      pdf.save(pdfFilename);
    } catch (err) {
      console.error("[PdfDownload]", err);
      setError("Erreur lors de la génération du PDF. Utilisez l'impression navigateur (Ctrl+P).");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={handleDownload}
        disabled={loading}
        size="sm"
        className="gap-2"
      >
        {loading ? (
          <><Loader2 className="h-4 w-4 animate-spin" />Génération…</>
        ) : (
          <><Download className="h-4 w-4" />Télécharger PDF</>
        )}
      </Button>
      {error && (
        <p className="text-xs text-destructive max-w-xs text-right">{error}</p>
      )}
    </div>
  );
}
