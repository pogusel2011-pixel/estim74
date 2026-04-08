import { PDFDocument } from "pdf-lib";
  import { loadCsvMutations } from "@/lib/dvf/csv-loader";
  import { computePrixM2 } from "@/lib/dvf/outliers";
  import { percentile } from "@/lib/utils";
  import { PROPERTY_TYPE_LABELS, CONDITION_LABELS } from "@/lib/constants";
  import { DVFComparable, DVFStats } from "@/types/dvf";
  import { Adjustment } from "@/types/valuation";
  import { computeSwot } from "@/lib/analysis/swot";
  import type { OsmPlace } from "@/lib/geo/osm";
  import type { ServitudeItem } from "@/lib/geo/sup";
  import { Writer, loadFonts, drawTable, san, fPrice, fPsm, fDateShort, wrapText, C, FS, ML, MR, CW, PAGE_W, PAGE_H, numFr, normalizeAddr } from "./helpers";
  import { getIrisDisplayLabel } from "@/lib/geo/iris-loader";

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
    if (l.includes("excellent") || l.includes("refait") || l.includes("neuf")) return "Excellent état général";
    if (l.includes("etat") || l.includes("condition")) return cond || san(adj.label);
    if (l.includes("parking")) return "Parking";
    if (l.includes("garage")) return "Garage";
    if (l.includes("balcon")) return "Balcon";
    if (l.includes("terrasse")) return "Terrasse";
    if (l.includes("cave")) return "Cave";
    if (l.includes("piscine")) return "Piscine";
    if (l.includes("ascenseur")) return "Ascenseur";
    if (l.includes("mitoyenne") || l.includes("individuelle")) return san(adj.label);
    // Proximité
    if (adj.category === "proximity") return san(adj.label);
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

    const positiveAdj = adjustments.filter((adj) => adj.factor > 0 && adj.category !== "proximity");
    const negativeAdj = adjustments.filter((adj) => adj.factor < 0 && adj.category !== "proximity");
    const top5 = dvfComparables.filter((c) => !c.outlier).sort((x, y) => (y.score ?? 0) - (x.score ?? 0)).slice(0, 5);
    const dvfTypeForChart = a.propertyType === "APARTMENT" ? "Appartement" : a.propertyType === "HOUSE" ? "Maison" : undefined;
    const { stats: trendStats, trend, trendPct } = (a.lat && a.lng)
      ? await getTrend(a.lat as number, a.lng as number, Math.max(perimeterKm ?? 2, 2), dvfTypeForChart)
      : { stats: [] as {year:number;medianPsm:number;count:number}[], trend: null as null, trendPct: null as null };

    const pdf = await PDFDocument.create();
    const fonts = await loadFonts(pdf);
    const w = new Writer(pdf, fonts);
    await w.initImages();

    // ═══════════ COVER ═══════════════════════════════════════════════════
    const cp = w.addPage();
    cp.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: C.coverBg });
    cp.drawRectangle({ x: 0, y: PAGE_H - 190, width: PAGE_W, height: 190, color: C.blue });
    cp.drawText("ESTIM’74", { x: ML, y: PAGE_H - 58, font: fonts.bold, size: 34, color: C.white });
    cp.drawText("Avis de Valeur — Haute-Savoie (74)", { x: ML, y: PAGE_H - 76, font: fonts.regular, size: FS.small, color: C.darkBlue });
    cp.drawLine({ start: { x: ML, y: PAGE_H - 93 }, end: { x: PAGE_W - MR, y: PAGE_H - 93 }, color: C.borderBlue, thickness: 0.5 });
    cp.drawText("AVIS DE VALEUR IMMOBILIER", { x: ML, y: PAGE_H - 116, font: fonts.bold, size: FS.small, color: C.gray });
    cp.drawText(propertyLabel.toUpperCase(), { x: ML, y: PAGE_H - 132, font: fonts.regular, size: FS.small, color: C.darkBlue });
    const addr = san([normalizeAddr(a.address as string), a.postalCode, a.city].filter(Boolean).join(", ") || "Adresse non renseignée");
    wrapText(fonts.bold, addr, 17, CW - 20).forEach((line, i) => {
      cp.drawText(line, { x: ML, y: PAGE_H - 160 - i * 24, font: fonts.bold, size: 17, color: C.dark });
    });
    const chips = [surface ? `${surface} m²` : null, a.rooms ? `${a.rooms} pièces` : null, a.yearBuilt ? `Construit en ${a.yearBuilt}` : null, conditionLabel || null, a.dpeLetter ? `DPE ${a.dpeLetter}` : null].filter(Boolean) as string[];
    let chx = ML;
    chips.forEach((chip) => { cp.drawText(chip, { x: chx + 7, y: PAGE_H - 218, font: fonts.regular, size: FS.small, color: C.dark }); chx += fonts.regular.widthOfTextAtSize(chip, FS.small) + 20; });
    // ── Cover bottom: séparateur + bloc agent + bloc client ──────────────
    const SEP_Y = 148;
    cp.drawLine({ start: { x: ML, y: SEP_Y }, end: { x: PAGE_W - MR, y: SEP_Y }, color: C.borderBlue, thickness: 0.5 });

    // Date du rapport (colonne gauche, au-dessus du séparateur)
    cp.drawText("Date du rapport", { x: ML, y: SEP_Y - 12, font: fonts.bold, size: FS.micro, color: C.gray });
    cp.drawText(today, { x: ML, y: SEP_Y - 28, font: fonts.bold, size: FS.body, color: C.dark });

    // Photo + texte agent (colonne gauche, sous le séparateur)
    const photoSize = 40;
    const photoY = 57;
    if (w.agentPhoto) {
      cp.drawImage(w.agentPhoto, { x: ML, y: photoY, width: photoSize, height: photoSize });
    }
    const agentTxtX = w.agentPhoto ? ML + photoSize + 8 : ML;
    cp.drawText(san("Aurelie LIVERSET"),               { x: agentTxtX, y: 92, font: fonts.bold,    size: FS.body,  color: C.dark });
    cp.drawText(san("aurelie.liverset@iadfrance.fr"),  { x: agentTxtX, y: 80, font: fonts.regular, size: FS.small, color: C.gray });
    cp.drawText(san("07 82 72 78 83"),                 { x: agentTxtX, y: 69, font: fonts.regular, size: FS.small, color: C.gray });
    cp.drawText(san("IAD France - Haute-Savoie (74)"), { x: agentTxtX, y: 58, font: fonts.regular, size: FS.small, color: C.gray });

    // Logo IAD (colonne droite)
    if (w.iadLogo) {
      cp.drawImage(w.iadLogo, { x: PAGE_W - MR - 80, y: 69, width: 80, height: 25 });
    }

    // Bloc client — colonne centrale (PRÉPARÉ POUR)
    const clientName = [a.clientFirstName, a.clientLastName].filter(Boolean).map((v) => san(v as string)).join(" ");
    if (clientName) {
      const cx = PAGE_W / 2;
      cp.drawText(san("Pr\u00e9par\u00e9 pour :"), { x: cx, y: SEP_Y - 12, font: fonts.bold,    size: FS.micro, color: C.gray });
      cp.drawText(clientName,                        { x: cx, y: SEP_Y - 26, font: fonts.bold,    size: FS.small, color: C.dark });
      let cLineY = SEP_Y - 39;
      if (a.clientAddress) { cp.drawText(san(a.clientAddress as string), { x: cx, y: cLineY, font: fonts.regular, size: FS.micro, color: C.gray }); cLineY -= 11; }
      if (a.clientEmail)   { cp.drawText(san(a.clientEmail as string),   { x: cx, y: cLineY, font: fonts.regular, size: FS.micro, color: C.gray }); cLineY -= 11; }
      if (a.clientPhone)   { cp.drawText(san(a.clientPhone as string),   { x: cx, y: cLineY, font: fonts.regular, size: FS.micro, color: C.gray }); }
    }

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
      w.page.drawText(san(isIndicative ? "ESTIMATION INDICATIVE" : "ESTIMATION CENTRALE"), { x: ML + 16, y: bxY + mainBoxH - 14, font: fonts.bold, size: FS.micro, color: isIndicative ? C.amber : C.blue });
      // Main price
      const mainPriceStr = san(fPrice(a.valuationMid as number));
      w.page.drawText(san(mainPriceStr), { x: ML + 16, y: bxY + mainBoxH - 34, font: fonts.bold, size: 20, color: isIndicative ? C.amber : C.darkBlue });
      // PSM
      if (a.valuationPsm) {
        w.page.drawText(san(fPsm(a.valuationPsm as number)), { x: ML + 16, y: bxY + 10, font: fonts.regular, size: FS.body, color: C.blue });
      }
      // Confidence badge on right
      if (a.confidenceLabel) {
        const badgeTxt = san(`Fiabilité ${a.confidenceLabel}`);
        const badgeX = ML + CW - fonts.bold.widthOfTextAtSize(badgeTxt, FS.small) - 16;
        w.page.drawText(san(badgeTxt), { x: badgeX, y: bxY + mainBoxH - 14, font: fonts.bold, size: FS.small, color: C.blue });
      }
      w.y = bxY - 10;

      // Range row
      const halfW = (CW - 6) / 2;
      const rnY = w.y - 32;
      w.rect(ML, rnY, halfW, 34, C.rowAlt);
      w.rectStroke(ML, rnY, halfW, 34, C.border, 0.5);
      w.page.drawText(san("FOURCHETTE BASSE"), { x: ML + 10, y: rnY + 22, font: fonts.bold, size: FS.micro, color: C.gray });
      w.page.drawText(san(fPrice(a.valuationLow as number)), { x: ML + 10, y: rnY + 8, font: fonts.bold, size: 11, color: C.dark });
      w.rect(ML + halfW + 6, rnY, halfW, 34, C.rowAlt);
      w.rectStroke(ML + halfW + 6, rnY, halfW, 34, C.border, 0.5);
      w.page.drawText(san("FOURCHETTE HAUTE"), { x: ML + halfW + 16, y: rnY + 22, font: fonts.bold, size: FS.micro, color: C.gray });
      w.page.drawText(san(fPrice(a.valuationHigh as number)), { x: ML + halfW + 16, y: rnY + 8, font: fonts.bold, size: 11, color: C.dark });
      w.y = rnY - 6;

      // Info line
      const infoParts = [
        a.dvfSampleSize != null ? `${a.dvfSampleSize} ventes de référence` : null,
        perimeterKm ? `Zone ${perimeterKm} km` : null,
      ].filter(Boolean).join(" - ");
      if (infoParts) {
        w.text(infoParts, ML, w.y, fonts.italic, FS.small, C.lightGray);
        w.gap(14);
      }

      // ── IC 95% note ──────────────────────────────────────────────────
      if (!isIndicative && a.valuationMid && a.valuationHigh) {
        const dvfStatsC = (a.dvfStats as DVFStats) ?? null;
        const fsdExplicitC = dvfStatsC?.fsd ?? null;
        const fsdFallbackC = dvfStatsC?.stdPsm ?? null;
        const spreadPctC = Math.round(((a.valuationHigh as number) - (a.valuationMid as number)) / (a.valuationMid as number) * 1000) / 10;
        let icNote: string;
        if (fsdExplicitC && fsdExplicitC > 0) {
          icNote = san(`Fourchette calculee sur intervalle de confiance statistique a 95% (+/-${spreadPctC}%)`);
        } else {
          icNote = san(`Fourchette statistique a 95% (+/-${spreadPctC}%)`);
        }
        w.text(icNote, ML, w.y, fonts.italic, FS.small, C.lightGray);
        w.gap(14);
      }

      if (isIndicative) {
        w.gap(4);
        w.rect(ML, w.y - 16, CW, 18, C.amberBg);
        w.rect(ML, w.y - 16, 3, 18, C.amber);
        w.page.drawText(san("! Estimation indicative - le nombre de ventes de référence est limité dans ce secteur."), { x: ML + 9, y: w.y - 10, font: fonts.regular, size: FS.small, color: C.amber });
        w.gap(24);
      }

    } else {
      w.text("Estimation non disponible - données insuffisantes dans ce secteur.", ML, w.y, fonts.italic, FS.body, C.gray);
      w.gap(20);
    }

    w.gap(8);
    w.addPage();
    w.footer(refId, today);

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
      w.page.drawText(san("POINTS FORTS"), { x: leftX, y: leftY, font: fonts.bold, size: FS.small, color: C.green });
      w.hline(leftX, leftY - 3, colW, C.greenBorder, 1.5);
      leftY -= 18;

      // Right column header
      w.page.drawText(san("POINTS DE VIGILANCE"), { x: rightX, y: rightY, font: fonts.bold, size: FS.small, color: C.amber });
      w.hline(rightX, rightY - 3, colW, C.border, 1.5);
      rightY -= 18;

      if (positiveAdj.length === 0) {
        w.page.drawText(san("Aucun point fort identifié."), { x: leftX, y: leftY, font: fonts.italic, size: FS.body, color: C.lightGray });
        leftY -= FS.body * 1.6;
      } else {
        positiveAdj.forEach((adj) => {
          const lbl = clientLabel(adj, conditionLabel);
          w.page.drawText(san("+ " + lbl), { x: leftX, y: leftY, font: fonts.regular, size: FS.body, color: C.dark });
          w.hline(leftX, leftY - 3, colW, C.border, 0.3);
          leftY -= FS.body * 1.7;
        });
      }

      if (negativeAdj.length === 0) {
        w.page.drawText(san("Aucun point de vigilance."), { x: rightX, y: rightY, font: fonts.italic, size: FS.body, color: C.lightGray });
        rightY -= FS.body * 1.6;
      } else {
        negativeAdj.forEach((adj) => {
          const lbl = clientLabel(adj, conditionLabel);
          w.page.drawText(san("! " + lbl), { x: rightX, y: rightY, font: fonts.regular, size: FS.body, color: C.dark });
          w.hline(rightX, rightY - 3, colW, C.border, 0.3);
          rightY -= FS.body * 1.7;
        });
      }

      w.y = Math.min(leftY, rightY) - 6;
    }

    // ─── Équipements de proximité ─────────────────────────────────────────
    const proximityAdjs = adjustments.filter((adj) => adj.category === "proximity");
    if (proximityAdjs.length > 0) {
      w.gap(12);
      w.page.drawText(san("ÉQUIPEMENTS DE PROXIMITÉ"), { x: ML, y: w.y, font: fonts.bold, size: FS.small, color: C.blue });
      w.hline(ML, w.y - 3, CW, C.borderBlue, 1.5);
      w.gap(16);
      let px = ML;
      for (const pa of proximityAdjs) {
        const lbl = san(pa.label);
        const pct = san(`${pa.factor > 0 ? "+" : ""}${(pa.factor * 100).toFixed(1)}%`);
        const col = pa.factor < 0 ? C.red : C.green;
        const txtW = fonts.regular.widthOfTextAtSize(lbl, FS.body) + fonts.bold.widthOfTextAtSize(` (${pct})`, FS.body) + 20;
        if (px + txtW > ML + CW) { px = ML; w.gap(14); }
        w.page.drawText(`${lbl} `, { x: px, y: w.y, font: fonts.regular, size: FS.body, color: C.dark });
        w.page.drawText(`(${pct})`, { x: px + fonts.regular.widthOfTextAtSize(`${lbl} `, FS.body), y: w.y, font: fonts.bold, size: FS.body, color: col });
        px += txtW;
      }
      w.gap(14);
    }

    // ═══════════ PAGE 3: TOP 5 COMPARABLES ═══════════════════════════════
    if (top5.length > 0) {
      w.addPage();
      w.footer(refId, today);
      w.sectionTitle(`3. Les ${top5.length} ventes comparables les plus pertinentes`);
      w.gap(8);
      const irisDisplayLabelC = a.irisCode ? getIrisDisplayLabel(a.irisCode as string) : null;
      if (irisDisplayLabelC) {
        const irisLineC = san("Secteur IRIS : " + irisDisplayLabelC);
        w.rect(ML, w.y - 14, CW, 16, C.headerBg);
        w.text(irisLineC, ML + 8, w.y - 4, fonts.bold, FS.body, C.blue);
        w.y -= 24;
      }
      const pluLabelC = a.zonePLU
        ? san(`Urbanisme : Zone ${a.zonePLU as string}${a.documentUrbanisme ? " — " + (a.documentUrbanisme as string) + (a.city ? " " + (a.city as string) : "") : ""}`)
        : null;
      if (pluLabelC) {
        w.rect(ML, w.y - 14, CW, 16, C.headerBg);
        w.text(pluLabelC, ML + 8, w.y - 4, fonts.regular, FS.body, C.dark);
        w.y -= 24;
      }
      drawTable(w, {
        cols: [
          { header: "Date", width: 64, align: "left" as const },
          { header: "Type de bien", width: 100, align: "left" as const },
          { header: "Surface", width: 58, align: "right" as const },
          { header: "Prix de vente", width: 100, align: "right" as const },
          { header: "Prix / m²", width: 80, align: "right" as const, bold: true, color: () => C.blue },
          { header: "Localisation", width: 113, align: "left" as const },
        ],
        rows: top5.map((c, i) => [
          fDateShort(c.date),
          san(c.type),
          `${c.surface} m²`,
          fPrice(c.price),
          fPsm(c.indexedPricePsm ?? c.pricePsm),
          san(c.city) + (c.distanceM != null ? ` (${Math.round(c.distanceM)} m)` : ""),
        ]),
        rowHeight: 15,
        stripedRows: true,
      });
      w.gap(6);
      w.text("Prix en valeur 2025 (indice notaires Haute-Savoie). Source : Demandes de Valeurs Foncières - DGFiP.", ML, w.y, fonts.italic, FS.micro, C.lightGray);
      w.gap(20);
    }

    // ═══════════ PAGE 4: RISQUES & SWOT ══════════════════════════════════
    {
      const risksSummary = Array.isArray(a.risksSummary) ? (a.risksSummary as string[]) : [];
      const servitudes = Array.isArray(a.servitudes) ? (a.servitudes as ServitudeItem[]) : [];
      const proximities = Array.isArray(a.proximities) ? (a.proximities as OsmPlace[]) : [];

      const swot = computeSwot({
        propertyType: a.propertyType as string,
        condition: a.condition as string | null,
        dpeLetter: a.dpeLetter as string | null,
        floor: a.floor as number | null,
        totalFloors: a.totalFloors as number | null,
        yearBuilt: a.yearBuilt as number | null,
        hasParking: Boolean(a.hasParking),
        hasGarage: Boolean(a.hasGarage),
        hasBalcony: Boolean(a.hasBalcony),
        hasTerrace: Boolean(a.hasTerrace),
        hasCellar: Boolean(a.hasCellar),
        hasPool: Boolean(a.hasPool),
        hasElevator: Boolean(a.hasElevator),
        landSurface: a.landSurface as number | null,
        surface: a.surface as number,
        rooms: a.rooms as number | null,
        orientation: a.orientation as string | null,
        view: a.view as string | null,
        mitoyennete: a.mitoyennete as string | null,
        hasBruit: Boolean(a.hasBruit),
        hasCopropDegradee: Boolean(a.hasCopropDegradee),
        hasExpositionNord: Boolean(a.hasExpositionNord),
        hasRDCSansExterieur: Boolean(a.hasRDCSansExterieur),
        zonePLU: a.zonePLU as string | null,
        zonePLUType: a.zonePLUType as string | null,
        riskFlood: a.riskFlood as string | null,
        riskEarthquake: a.riskEarthquake as string | null,
        riskClay: a.riskClay as string | null,
        riskLandslide: a.riskLandslide as string | null,
        risksSummary: risksSummary.length > 0 ? risksSummary : null,
        servitudes: servitudes.length > 0 ? servitudes : null,
        proximities: proximities.length > 0 ? proximities : null,
        confidence: a.confidence as number | null,
        dvfSampleSize: a.dvfSampleSize as number | null,
      });

      if (swot.strengths.length > 0 || swot.weaknesses.length > 0 || risksSummary.length > 0) {
        w.addPage();
        w.footer(refId, today);
        w.sectionTitle("4. Points forts, vigilances & risques du bien");
        w.gap(8);

        // SWOT
        const halfW = (CW - 12) / 2;
        w.page.drawText(san("ATOUTS DU BIEN"), { x: ML, y: w.y, font: fonts.bold, size: FS.small, color: C.green });
        w.hline(ML, w.y - 3, halfW, C.greenBorder, 1.5);
        w.page.drawText(san("POINTS DE VIGILANCE"), { x: ML + halfW + 12, y: w.y, font: fonts.bold, size: FS.small, color: C.amber });
        w.hline(ML + halfW + 12, w.y - 3, halfW, C.border, 1.5);
        w.gap(18);

        const startY = w.y;
        let sY = startY;
        let wY = startY;

        swot.strengths.forEach((item) => {
          w.page.drawText(san("+ " + item.label), { x: ML, y: sY, font: fonts.regular, size: FS.body, color: C.dark });
          sY -= FS.body * 1.7;
        });
        if (swot.strengths.length === 0) {
          w.page.drawText(san("Aucun atout identifié."), { x: ML, y: sY, font: fonts.italic, size: FS.body, color: C.lightGray });
          sY -= FS.body * 1.7;
        }

        swot.weaknesses.forEach((item) => {
          w.page.drawText(san("! " + item.label), { x: ML + halfW + 12, y: wY, font: fonts.regular, size: FS.body, color: C.dark });
          wY -= FS.body * 1.7;
        });
        if (swot.weaknesses.length === 0) {
          w.page.drawText(san("Aucun point de vigilance."), { x: ML + halfW + 12, y: wY, font: fonts.italic, size: FS.body, color: C.lightGray });
          wY -= FS.body * 1.7;
        }

        w.y = Math.min(sY, wY) - 12;

        // Risques naturels
        if (risksSummary.length > 0 || (a.risksSummary as unknown) === null) {
          w.rect(ML, w.y - 14, CW, 16, C.headerBg);
          w.rect(ML, w.y - 14, 3, 16, C.amber);
          w.page.drawText(san("RISQUES NATURELS ET TECHNOLOGIQUES"), { x: ML + 10, y: w.y - 10, font: fonts.bold, size: FS.micro, color: C.amber });
          w.gap(22);
          if (risksSummary.length > 0) {
            risksSummary.forEach((risk) => {
              w.text(san("⚠ " + risk), ML + 6, w.y, fonts.regular, FS.body, C.amber);
              w.gap(13);
            });
          } else {
            w.text(san("Aucun risque naturel majeur recensé dans ce secteur."), ML + 6, w.y, fonts.regular, FS.body, C.green);
            w.gap(13);
          }
        }
      }
    }

    // ═══════════ PAGE 5: CONTEXTE MARCHE ═════════════════════════════════
    w.addPage();
    w.footer(refId, today);
    w.sectionTitle("5. Contexte du marché immobilier local");
    w.gap(8);

    if (trend && trendStats.length >= 2) {
      const trendWord = trend === "hausse" ? "en hausse" : trend === "baisse" ? "en baisse" : "stable";
      const trendIcon = trend === "hausse" ? "^" : trend === "baisse" ? "v" : "->";
      const trendColor = trend === "hausse" ? C.green : trend === "baisse" ? C.red : C.gray;
      const trendTitle = `Marché ${trendWord}${trendPct != null ? ` de ${Math.abs(trendPct)}% sur les 3 dernières années` : ""}`;

      // Trend header
      w.rect(ML, w.y - 24, CW, 26, trend === "hausse" ? C.greenBg : trend === "baisse" ? C.amberBg : C.rowAlt);
      w.rectStroke(ML, w.y - 24, CW, 26, trend === "hausse" ? C.greenBorder : C.border, 0.7);
      w.page.drawText(san(trendIcon + " " + trendTitle), { x: ML + 10, y: w.y - 16, font: fonts.bold, size: FS.body, color: trendColor });
      const dvfTypeStr = dvfTypeForChart ? `${dvfTypeForChart}s - ` : "";
      w.page.drawText(san(`${dvfTypeStr}Rayon ${Math.max(perimeterKm ?? 2, 2)} km`), { x: ML + 10, y: w.y - 27, font: fonts.regular, size: FS.micro, color: C.gray });
      w.gap(36);

      // Stats KV
      const last = trendStats[trendStats.length - 1];
      const prev = trendStats[trendStats.length - 2];
      const diff = last.medianPsm - prev.medianPsm;
      const diffPct = Math.round((diff / prev.medianPsm) * 1000) / 10;
      w.kv(`Prix médian ${prev.year}`, fPsm(prev.medianPsm));
      w.kv(`Prix médian ${last.year}`, fPsm(last.medianPsm));
      w.kv("Évolution annuelle", (diff >= 0 ? "+" : "") + diffPct + "%");
      w.gap(12);

      // Commentary
      const commentaries = {
        hausse: "Le marché immobilier local est dynamique : les prix sont en progression régulière. Dans ce contexte de demande soutenue, les délais de vente sont généralement courts et la marge de négociation limitée.",
        baisse: "Le marché local marque un repli sur les dernières années. Les acheteurs disposent d’une marge de négociation plus importante. Une mise en valeur soignée du bien et un prix cohérent restent essentiels pour conclure la vente.",
        stable: "Le marché local est stable : les prix se maintiennent dans une fourchette cohérente, offrant une bonne visibilité aux vendeurs comme aux acquéreurs. Les conditions actuelles sont propices à une transaction dans des délais raisonnables.",
      };
      const commentary = san(commentaries[trend]);
      w.rect(ML, w.y - 6, 3, 56, C.blue);
      const commLines = wrapText(fonts.regular, commentary, FS.body, CW - 16);
      commLines.forEach((line, i) => {
        w.page.drawText(san(line), { x: ML + 10, y: w.y - i * (FS.body * 1.5), font: fonts.regular, size: FS.body, color: C.dark });
      });
      w.gap(commLines.length * FS.body * 1.5 + 12);
    } else {
      w.text("Données de tendance non disponibles pour ce secteur.", ML, w.y, fonts.italic, FS.body, C.gray);
      w.gap(16);
    }

    return pdf.save();
  }
  