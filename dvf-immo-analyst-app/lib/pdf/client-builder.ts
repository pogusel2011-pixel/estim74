import { PDFDocument } from "pdf-lib";
  import { loadCsvMutations } from "@/lib/dvf/csv-loader";
  import { computePrixM2 } from "@/lib/dvf/outliers";
  import { percentile } from "@/lib/utils";
  import { PROPERTY_TYPE_LABELS, CONDITION_LABELS } from "@/lib/constants";
  import { DVFComparable } from "@/types/dvf";
  import { Adjustment } from "@/types/valuation";
  import { Writer, loadFonts, drawTable, san, fPrice, fPsm, fDateShort, wrapText, C, FS, ML, MR, CW, PAGE_W, PAGE_H } from "./helpers";

  async function getTrend(lat: number, lng: number, km: number, type?: string) {
    try {
      const raw = await loadCsvMutations(lat, lng, Math.max(km, 3), 130, type ? [type] : undefined);
      const muts = computePrixM2(raw).filter((m) => m.prix_m2 != null && m.prix_m2 > 0);
      const byY = new Map<number, number[]>();
      for (const m of muts) {
        const yr = new Date(m.date_mutation).getFullYear();
        if (yr >= 2017) { if (!byY.has(yr)) byY.set(yr, []); byY.get(yr)!.push(m.prix_m2!); }
      }
      const stats = Array.from(byY.entries()).map(([year, ps]) => ({ year, medianPsm: Math.round(percentile(ps, 50)), count: ps.length })).sort((a, b) => a.year - b.year);
      let trend: "hausse" | "baisse" | "stable" = "stable";
      let trendPct: number | null = null;
      if (stats.length >= 6) {
        const r = stats.slice(-3).reduce((s, y) => s + y.medianPsm, 0) / 3;
        const p = stats.slice(-6, -3).reduce((s, y) => s + y.medianPsm, 0) / 3;
        trendPct = Math.round(((r - p) / p) * 1000) / 10;
        trend = trendPct > 3 ? "hausse" : trendPct < -3 ? "baisse" : "stable";
      }
      return { stats, trend, trendPct };
    } catch { return { stats: [] as {year:number;medianPsm:number;count:number}[], trend: null as null, trendPct: null as null }; }
  }

  function clientLabel(adj: Adjustment, cond: string): string {
    const l = adj.label.toLowerCase();
    if (l.includes("excellent") || l.includes("refait") || l.includes("neuf")) return "Excellent etat general";
    if (l.includes("etat") || l.includes("condition")) return cond || san(adj.label);
    if (l.includes("parking")) return "Parking";
    if (l.includes("garage")) return "Garage";
    if (l.includes("balcon")) return "Balcon";
    if (l.includes("terrasse")) return "Terrasse";
    if (l.includes("cave")) return "Cave";
    if (l.includes("piscine")) return "Piscine";
    if (l.includes("ascenseur")) return "Ascenseur";
    return san(adj.label);
  }

  export async function buildClientPdf(a: Record<string, unknown>, refId: string): Promise<Uint8Array> {
    const dvfComparables: DVFComparable[] = Array.isArray(a.dvfComparables) ? (a.dvfComparables as DVFComparable[]) : [];
    const adjustments: Adjustment[] = Array.isArray(a.adjustments) ? (a.adjustments as Adjustment[]) : [];
    const propertyLabel = san(PROPERTY_TYPE_LABELS[a.propertyType as string] ?? (a.propertyType as string) ?? "");
    const conditionLabel = a.condition ? san(CONDITION_LABELS[a.condition as string] ?? "") : "";
    const perimeterKm = (a.perimeterKm as number) ?? null;
    const isIndicative = a.confidenceLabel === "Indicative" || ((a.dvfSampleSize as number) != null && (a.dvfSampleSize as number) < 3);
    const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    const surface = (a.surface as number) ?? 0;

    const positiveAdj = adjustments.filter((adj) => adj.factor > 0);
    const negativeAdj = adjustments.filter((adj) => adj.factor < 0);
    const top5 = dvfComparables.filter((c) => !c.outlier).sort((x, y) => (y.score ?? 0) - (x.score ?? 0)).slice(0, 5);
    const dvfTypeForChart = a.propertyType === "APARTMENT" ? "Appartement" : a.propertyType === "HOUSE" ? "Maison" : undefined;
    const { stats: trendStats, trend, trendPct } = (a.lat && a.lng)
      ? await getTrend(a.lat as number, a.lng as number, Math.max(perimeterKm ?? 2, 2), dvfTypeForChart)
      : { stats: [] as {year:number;medianPsm:number;count:number}[], trend: null as null, trendPct: null as null };

    const pdf = await PDFDocument.create();
    const fonts = await loadFonts(pdf);
    const w = new Writer(pdf, fonts);

    // ═══════════ COVER ═══════════════════════════════════════════════════
    const cp = w.addPage();
    cp.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: C.darkBlue });
    cp.drawRectangle({ x: 0, y: PAGE_H - 190, width: PAGE_W, height: 190, color: C.blue });
    cp.drawText("ESTIM'74", { x: ML, y: PAGE_H - 58, font: fonts.bold, size: 34, color: C.white });
    cp.drawText("Estimation immobiliere - Haute-Savoie (74)", { x: ML, y: PAGE_H - 76, font: fonts.regular, size: FS.small, color: C.white, opacity: 0.70 });
    cp.drawLine({ start: { x: ML, y: PAGE_H - 93 }, end: { x: PAGE_W - MR, y: PAGE_H - 93 }, color: C.white, thickness: 0.5, opacity: 0.25 });
    cp.drawText("RAPPORT D'ESTIMATION", { x: ML, y: PAGE_H - 116, font: fonts.bold, size: FS.small, color: C.white, opacity: 0.6 });
    cp.drawText(propertyLabel.toUpperCase(), { x: ML, y: PAGE_H - 132, font: fonts.regular, size: FS.small, color: C.white, opacity: 0.5 });
    const addr = san([a.address, a.postalCode, a.city].filter(Boolean).join(", ") || "Adresse non renseignee");
    wrapText(fonts.bold, addr, 17, CW - 20).forEach((line, i) => {
      cp.drawText(line, { x: ML, y: PAGE_H - 160 - i * 24, font: fonts.bold, size: 17, color: C.white });
    });
    const chips = [surface ? `${surface} m2` : null, a.rooms ? `${a.rooms} pieces` : null, a.yearBuilt ? `Construit en ${a.yearBuilt}` : null, conditionLabel || null, a.dpeLetter ? `DPE ${a.dpeLetter}` : null].filter(Boolean) as string[];
    let chx = ML;
    chips.forEach((chip) => { cp.drawText(chip, { x: chx + 7, y: PAGE_H - 218, font: fonts.regular, size: FS.small, color: C.white, opacity: 0.8 }); chx += fonts.regular.widthOfTextAtSize(chip, FS.small) + 20; });
    const bY = 80;
    cp.drawLine({ start: { x: ML, y: bY + 56 }, end: { x: PAGE_W - MR, y: bY + 56 }, color: C.white, thickness: 0.5, opacity: 0.2 });
    cp.drawText("Date du rapport", { x: ML, y: bY + 36, font: fonts.bold, size: FS.micro, color: C.white, opacity: 0.5 });
    cp.drawText(today, { x: ML, y: bY + 20, font: fonts.bold, size: FS.body, color: C.white });
    cp.drawText("Prepare par :", { x: ML, y: bY + 1, font: fonts.regular, size: FS.body, color: C.white, opacity: 0.7 });
    cp.drawLine({ start: { x: ML + 70, y: bY - 1 }, end: { x: ML + 260, y: bY - 1 }, color: C.white, thickness: 0.5, opacity: 0.5 });

    // ═══════════ PAGE 2: ESTIMATION + POINTS FORTS/VIGILANCES ════════════
    w.addPage();
    w.footer(refId, today);
    w.sectionTitle("1. Estimation de valeur");
    w.gap(8);

    if (a.valuationMid) {
      // Big central price
      const mainBoxH = 64;
      const bxY = w.y - mainBoxH;
      w.rect(ML, bxY, CW, mainBoxH, C.lightBlueBg);
      w.rectStroke(ML, bxY, CW, mainBoxH, C.borderBlue, 1);
      // Label
      w.page.drawText(isIndicative ? "ESTIMATION INDICATIVE" : "ESTIMATION CENTRALE", { x: ML + 16, y: bxY + mainBoxH - 14, font: fonts.bold, size: FS.micro, color: isIndicative ? C.amber : C.blue });
      // Main price
      const mainPriceStr = san(fPrice(a.valuationMid as number));
      w.page.drawText(mainPriceStr, { x: ML + 16, y: bxY + mainBoxH - 34, font: fonts.bold, size: 20, color: isIndicative ? C.amber : C.darkBlue });
      // PSM
      if (a.valuationPsm) {
        w.page.drawText(san(fPsm(a.valuationPsm as number)), { x: ML + 16, y: bxY + 10, font: fonts.regular, size: FS.body, color: C.blue });
      }
      // Confidence badge on right
      if (a.confidenceLabel) {
        const badgeTxt = san(`Fiabilite ${a.confidenceLabel}`);
        const badgeX = ML + CW - fonts.bold.widthOfTextAtSize(badgeTxt, FS.small) - 16;
        w.page.drawText(badgeTxt, { x: badgeX, y: bxY + mainBoxH - 14, font: fonts.bold, size: FS.small, color: C.blue });
      }
      w.y = bxY - 10;

      // Range row
      const halfW = (CW - 6) / 2;
      const rnY = w.y - 32;
      w.rect(ML, rnY, halfW, 34, C.rowAlt);
      w.rectStroke(ML, rnY, halfW, 34, C.border, 0.5);
      w.page.drawText("FOURCHETTE BASSE", { x: ML + 10, y: rnY + 22, font: fonts.bold, size: FS.micro, color: C.gray });
      w.page.drawText(san(fPrice(a.valuationLow as number)), { x: ML + 10, y: rnY + 8, font: fonts.bold, size: 11, color: C.dark });
      w.rect(ML + halfW + 6, rnY, halfW, 34, C.rowAlt);
      w.rectStroke(ML + halfW + 6, rnY, halfW, 34, C.border, 0.5);
      w.page.drawText("FOURCHETTE HAUTE", { x: ML + halfW + 16, y: rnY + 22, font: fonts.bold, size: FS.micro, color: C.gray });
      w.page.drawText(san(fPrice(a.valuationHigh as number)), { x: ML + halfW + 16, y: rnY + 8, font: fonts.bold, size: 11, color: C.dark });
      w.y = rnY - 6;

      // Info line
      const infoParts = [
        a.dvfSampleSize != null ? `${a.dvfSampleSize} ventes de reference` : null,
        perimeterKm ? `Zone ${perimeterKm} km` : null,
      ].filter(Boolean).join(" - ");
      if (infoParts) {
        w.text(infoParts, ML, w.y, fonts.italic, FS.small, C.lightGray);
        w.gap(14);
      }

      if (isIndicative) {
        w.gap(4);
        w.rect(ML, w.y - 16, CW, 18, C.amberBg);
        w.rect(ML, w.y - 16, 3, 18, C.amber);
        w.page.drawText("[!] Estimation indicative - le nombre de ventes de reference est limite dans ce secteur.", { x: ML + 9, y: w.y - 10, font: fonts.regular, size: FS.small, color: C.amber });
        w.gap(24);
      }
    } else {
      w.text("Estimation non disponible - donnees insuffisantes dans ce secteur.", ML, w.y, fonts.italic, FS.body, C.gray);
      w.gap(20);
    }

    w.gap(16);

    // ─── Points forts / Vigilances ──────────────────────────────────────
    if (adjustments.length > 0) {
      w.sectionTitle("2. Points forts et points de vigilance");
      w.gap(6);

      const colW = (CW - 12) / 2;
      const leftX = ML;
      const rightX = ML + colW + 12;
      let leftY = w.y;
      let rightY = w.y;

      // Left column header
      w.page.drawText("POINTS FORTS", { x: leftX, y: leftY, font: fonts.bold, size: FS.small, color: C.green });
      w.hline(leftX, leftY - 3, colW, C.greenBorder, 1.5);
      leftY -= 18;

      // Right column header
      w.page.drawText("POINTS DE VIGILANCE", { x: rightX, y: rightY, font: fonts.bold, size: FS.small, color: C.amber });
      w.hline(rightX, rightY - 3, colW, C.border, 1.5);
      rightY -= 18;

      if (positiveAdj.length === 0) {
        w.page.drawText("Aucun point fort identifie.", { x: leftX, y: leftY, font: fonts.italic, size: FS.body, color: C.lightGray });
        leftY -= FS.body * 1.6;
      } else {
        positiveAdj.forEach((adj) => {
          const lbl = clientLabel(adj, conditionLabel);
          w.page.drawText("[OK] " + lbl, { x: leftX, y: leftY, font: fonts.regular, size: FS.body, color: C.dark });
          w.hline(leftX, leftY - 3, colW, C.border, 0.3);
          leftY -= FS.body * 1.7;
        });
      }

      if (negativeAdj.length === 0) {
        w.page.drawText("Aucun point de vigilance.", { x: rightX, y: rightY, font: fonts.italic, size: FS.body, color: C.lightGray });
        rightY -= FS.body * 1.6;
      } else {
        negativeAdj.forEach((adj) => {
          const lbl = clientLabel(adj, conditionLabel);
          w.page.drawText("[!] " + lbl, { x: rightX, y: rightY, font: fonts.regular, size: FS.body, color: C.dark });
          w.hline(rightX, rightY - 3, colW, C.border, 0.3);
          rightY -= FS.body * 1.7;
        });
      }

      w.y = Math.min(leftY, rightY) - 6;
    }

    // ═══════════ PAGE 3: TOP 5 COMPARABLES ═══════════════════════════════
    if (top5.length > 0) {
      w.addPage();
      w.footer(refId, today);
      w.sectionTitle(`3. Les ${top5.length} ventes comparables les plus pertinentes`);
      w.gap(8);
      drawTable(w, {
        cols: [
          { header: "Date", width: 64, align: "left" as const },
          { header: "Type de bien", width: 100, align: "left" as const },
          { header: "Surface", width: 58, align: "right" as const },
          { header: "Prix de vente", width: 100, align: "right" as const },
          { header: "Prix / m2", width: 80, align: "right" as const, bold: true, color: () => C.blue },
          { header: "Localisation", width: 113, align: "left" as const },
        ],
        rows: top5.map((c, i) => [
          fDateShort(c.date),
          san(c.type),
          `${c.surface} m2`,
          fPrice(c.price),
          fPsm(c.indexedPricePsm ?? c.pricePsm),
          san(c.city) + (c.distanceM != null ? ` (${Math.round(c.distanceM)} m)` : ""),
        ]),
        rowHeight: 15,
        stripedRows: true,
      });
      w.gap(6);
      w.text("Prix en valeur 2025 (indice notaires Haute-Savoie). Source : Demandes de Valeurs Foncieres - DGFiP.", ML, w.y, fonts.italic, FS.micro, C.lightGray);
      w.gap(20);
    }

    // ═══════════ PAGE 4: CONTEXTE MARCHE ═════════════════════════════════
    w.addPage();
    w.footer(refId, today);
    w.sectionTitle("4. Contexte du marche immobilier local");
    w.gap(8);

    if (trend && trendStats.length >= 2) {
      const trendWord = trend === "hausse" ? "en hausse" : trend === "baisse" ? "en baisse" : "stable";
      const trendIcon = trend === "hausse" ? "^" : trend === "baisse" ? "v" : "->";
      const trendColor = trend === "hausse" ? C.green : trend === "baisse" ? C.red : C.gray;
      const trendTitle = `Marche ${trendWord}${trendPct != null ? ` de ${Math.abs(trendPct)}% sur les 3 dernieres annees` : ""}`;

      // Trend header
      w.rect(ML, w.y - 24, CW, 26, trend === "hausse" ? C.greenBg : trend === "baisse" ? C.amberBg : C.rowAlt);
      w.rectStroke(ML, w.y - 24, CW, 26, trend === "hausse" ? C.greenBorder : C.border, 0.7);
      w.page.drawText(trendIcon + " " + trendTitle, { x: ML + 10, y: w.y - 16, font: fonts.bold, size: FS.body, color: trendColor });
      const dvfTypeStr = dvfTypeForChart ? `${dvfTypeForChart}s - ` : "";
      w.page.drawText(`${dvfTypeStr}Rayon ${Math.max(perimeterKm ?? 2, 2)} km`, { x: ML + 10, y: w.y - 27, font: fonts.regular, size: FS.micro, color: C.gray });
      w.gap(36);

      // Stats KV
      const last = trendStats[trendStats.length - 1];
      const prev = trendStats[trendStats.length - 2];
      const diff = last.medianPsm - prev.medianPsm;
      const diffPct = Math.round((diff / prev.medianPsm) * 1000) / 10;
      w.kv(`Prix median ${prev.year}`, fPsm(prev.medianPsm));
      w.kv(`Prix median ${last.year}`, fPsm(last.medianPsm));
      w.kv("Evolution annuelle", (diff >= 0 ? "+" : "") + diffPct + "%");
      w.gap(12);

      // Commentary
      const commentaries = {
        hausse: "Le marche immobilier local est dynamique : les prix sont en progression reguliere. Dans ce contexte de demande soutenue, les delais de vente sont generalement courts et la marge de negociation limitee.",
        baisse: "Le marche local marque un repli sur les dernieres annees. Les acheteurs disposent d'une marge de negociation plus importante. Une mise en valeur soignee du bien et un prix coherent restent essentiels pour conclure la vente.",
        stable: "Le marche local est stable : les prix se maintiennent dans une fourchette coherente, offrant une bonne visibilite aux vendeurs comme aux acquereurs. Les conditions actuelles sont propices a une transaction dans des delais raisonnables.",
      };
      const commentary = san(commentaries[trend]);
      w.rect(ML, w.y - 6, 3, 56, C.blue);
      const commLines = wrapText(fonts.regular, commentary, FS.body, CW - 16);
      commLines.forEach((line, i) => {
        w.page.drawText(line, { x: ML + 10, y: w.y - i * (FS.body * 1.5), font: fonts.regular, size: FS.body, color: C.dark });
      });
      w.gap(commLines.length * FS.body * 1.5 + 12);
    } else {
      w.text("Donnees de tendance non disponibles pour ce secteur.", ML, w.y, fonts.italic, FS.body, C.gray);
      w.gap(16);
    }

    return pdf.save();
  }
  