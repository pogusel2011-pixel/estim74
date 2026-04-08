import { PDFDocument } from "pdf-lib";
  import { PROPERTY_TYPE_LABELS, CONDITION_LABELS } from "@/lib/constants";
  import { getIrisDisplayLabel } from "@/lib/geo/iris-loader";
  import { markListingOutliers } from "@/lib/listings/outliers";
  import { DVFStats, DVFComparable } from "@/types/dvf";
  import { ActiveListing } from "@/types/listing";
  import { Adjustment } from "@/types/valuation";
  import { computeSwot } from "@/lib/analysis/swot";
  import type { OsmPlace } from "@/lib/geo/osm";
  import type { ServitudeItem } from "@/lib/geo/sup";
  import { Writer, loadFonts, drawTable, san, fPrice, fPsm, fPct, fDateShort, wrapText, C, FS, ML, MR, CW, PAGE_W, PAGE_H, numFr, normalizeAddr } from "./helpers";

  export async function buildExpertPdf(a: Record<string, unknown>, refId: string): Promise<Uint8Array> {
    const dvfStats: DVFStats | null = (a.dvfStats as DVFStats) ?? null;
    const dvfComparables: DVFComparable[] = Array.isArray(a.dvfComparables) ? (a.dvfComparables as DVFComparable[]) : [];
    const rawListings: ActiveListing[] = Array.isArray(a.listings) ? (a.listings as ActiveListing[]) : [];
    const listings = markListingOutliers(rawListings);
    const cleanListings = listings.filter((l) => !l.outlier);
    const adjustments: Adjustment[] = Array.isArray(a.adjustments) ? (a.adjustments as Adjustment[]) : [];
    const propertyLabel = san(PROPERTY_TYPE_LABELS[a.propertyType as string] ?? (a.propertyType as string) ?? "");
    const conditionLabel = a.condition ? san(CONDITION_LABELS[a.condition as string] ?? "") : "";
    const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    const surface = (a.surface as number) ?? 0;
    const perimeterKm = (a.perimeterKm as number) ?? null;
    const isIndicative = a.confidenceLabel === "Indicative" || ((a.dvfSampleSize as number) != null && (a.dvfSampleSize as number) < 3);
    const dvfRetenues = dvfStats?.count ?? 0;
    const dvfExclus = dvfStats?.excludedCount ?? 0;
    const dvfPsmRef = dvfStats?.weightedAvgPsm ?? dvfStats?.medianPsm ?? 0;
    const mktAdj = dvfStats?.marketPressure?.adjustment ?? 0;
    const dvfAdjPsm = Math.round(dvfPsmRef * (1 + mktAdj));
    const listingAvgPsm = cleanListings.length > 0 ? cleanListings.reduce((s, l) => s + l.pricePsm, 0) / cleanListings.length : 0;
    const listingAdjPsm = Math.round(listingAvgPsm * 0.96);
    let dvfW = 0, lstW = 0;
    if (dvfRetenues >= 5 && cleanListings.length > 0) { dvfW = 0.70; lstW = 0.30; }
    else if (dvfRetenues >= 5) { dvfW = 1.0; }
    else if (cleanListings.length >= 3) { lstW = 1.0; }
    else if (dvfRetenues > 0 && cleanListings.length > 0) { dvfW = 0.70; lstW = 0.30; }
    else { dvfW = 1.0; }
    const basePsm = Math.round(dvfAdjPsm * dvfW + listingAdjPsm * lstW);
    const totalAdjFactor = adjustments.reduce((s, adj) => s + adj.factor, 0);

    const pdf = await PDFDocument.create();
    const fonts = await loadFonts(pdf);
    const w = new Writer(pdf, fonts);
    await w.initImages();

    // ═══════════ COVER ═══════════════════════════════════════════════════
    const cp = w.addPage();
    cp.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: C.coverBg });
    cp.drawRectangle({ x: 0, y: PAGE_H - 120, width: PAGE_W, height: 120, color: C.blue });
    cp.drawText("ESTIM’74 - HAUTE-SAVOIE (74) - DONNÉES DVF DGFiP 2020-2025", { x: ML, y: PAGE_H - 48, font: fonts.regular, size: FS.micro, color: C.white, opacity: 0.6 });
    cp.drawText("AVIS DE VALEUR — RAPPORT D’EXPERTISE", { x: ML, y: PAGE_H - 86, font: fonts.bold, size: 20, color: C.white });
    cp.drawLine({ start: { x: ML, y: PAGE_H - 108 }, end: { x: PAGE_W - MR, y: PAGE_H - 108 }, color: C.white, thickness: 0.5, opacity: 0.3 });
    cp.drawText(propertyLabel.toUpperCase(), { x: ML, y: PAGE_H - 130, font: fonts.bold, size: FS.small, color: C.darkBlue });
    const addr = san([normalizeAddr(a.address as string), a.postalCode, a.city].filter(Boolean).join(", ") || "Adresse non renseignée");
    wrapText(fonts.bold, addr, 16, CW - 20).forEach((line, i) => {
      cp.drawText(line, { x: ML, y: PAGE_H - 156 - i * 22, font: fonts.bold, size: 16, color: C.dark });
    });
    const metaChips = [surface ? `${surface} m²` : null, a.rooms ? `${a.rooms} pièces` : null, a.yearBuilt ? `Construit en ${a.yearBuilt}` : null, conditionLabel || null, a.dpeLetter ? `DPE ${a.dpeLetter}` : null].filter(Boolean) as string[];
    let mx = ML;
    metaChips.forEach((chip) => { cp.drawText(chip, { x: mx, y: PAGE_H - 218, font: fonts.regular, size: FS.small, color: C.dark }); mx += fonts.regular.widthOfTextAtSize(chip, FS.small) + 14; });
    const feats = [a.hasParking && "Parking", a.hasGarage && "Garage", a.hasBalcony && "Balcon", a.hasTerrace && "Terrasse", a.hasPool && "Piscine", a.hasElevator && "Ascenseur", a.hasCellar && "Cave"].filter(Boolean) as string[];
    let fx = ML;
    feats.forEach((f) => { cp.drawText(f, { x: fx, y: PAGE_H - 238, font: fonts.regular, size: FS.small, color: C.gray }); fx += fonts.regular.widthOfTextAtSize(f, FS.small) + 14; });
    // ── Cover bottom: séparateur, date/ref, agent, logo, client ─────────
    cp.drawLine({ start: { x: ML, y: 100 }, end: { x: PAGE_W - MR, y: 100 }, color: C.borderBlue, thickness: 0.5 });

    // Date (gauche) + Référence (droite)
    cp.drawText("GÉNÉRÉ LE", { x: ML, y: 80, font: fonts.bold, size: FS.micro, color: C.gray });
    cp.drawText(today,       { x: ML, y: 63, font: fonts.bold, size: 13, color: C.dark });
    cp.drawText("RÉFÉRENCE", { x: PAGE_W - MR - 90, y: 80, font: fonts.bold, size: FS.micro, color: C.gray });
    cp.drawText(refId,       { x: PAGE_W - MR - 90, y: 63, font: fonts.bold, size: 13, color: C.dark });

    // Nom agent (gauche, dessous la date) + Logo IAD (droite, dessous la ref)
    cp.drawText(san("Aurelie LIVERSET"),               { x: ML, y: 42, font: fonts.bold,    size: FS.body,  color: C.dark });
    cp.drawText(san("IAD France - Haute-Savoie (74)"), { x: ML, y: 29, font: fonts.regular, size: FS.small, color: C.gray });
    if (w.iadLogo) {
      cp.drawImage(w.iadLogo, { x: PAGE_W - MR - 80, y: 26, width: 80, height: 25 });
    }

    // Bloc client — colonne centrale (PRÉPARÉ POUR)
    const clientName = [a.clientFirstName, a.clientLastName].filter(Boolean).map((v) => san(v as string)).join(" ");
    if (clientName) {
      const cx = PAGE_W / 2;
      cp.drawText("PR\u00C9PAR\u00C9 POUR :", { x: cx, y: 80, font: fonts.bold,    size: FS.micro, color: C.gray });
      cp.drawText(clientName,                  { x: cx, y: 66, font: fonts.bold,    size: FS.small, color: C.dark });
      let cLineY = 55;
      if (a.clientAddress) { cp.drawText(san(a.clientAddress as string), { x: cx, y: cLineY, font: fonts.regular, size: FS.micro, color: C.gray }); cLineY -= 11; }
      if (a.clientEmail)   { cp.drawText(san(a.clientEmail as string),   { x: cx, y: cLineY, font: fonts.regular, size: FS.micro, color: C.gray }); cLineY -= 11; }
      if (a.clientPhone)   { cp.drawText(san(a.clientPhone as string),   { x: cx, y: cLineY, font: fonts.regular, size: FS.micro, color: C.gray }); }
    }

    // ═══════════ PAGE 2: ESTIMATION + AJUSTEMENTS ════════════════════════
    w.addPage();
    w.footer(refId, today);
    w.sectionTitle("1. Estimation de valeur");
    w.gap(4);

    if (a.valuationMid) {
      if (isIndicative) {
        w.rect(ML, w.y - 18, CW, 20, C.amberBg);
        w.rect(ML, w.y - 18, 3, 20, C.amber);
        w.page.drawText(san("! Estimation indicative - données DVF limitées"), { x: ML + 8, y: w.y - 12, font: fonts.bold, size: FS.body, color: C.amber });
        w.gap(26);
      }
      const boxW = (CW - 12) / 3;
      const boxH = 52;
      const bxY = w.y - boxH;
      const boxes = [
        { label: "FOURCHETTE BASSE", value: fPrice(a.valuationLow as number), psm: "", hi: false },
        { label: "ESTIMATION CENTRALE", value: fPrice(a.valuationMid as number), psm: fPsm(a.valuationPsm as number), hi: true },
        { label: "FOURCHETTE HAUTE", value: fPrice(a.valuationHigh as number), psm: "", hi: false },
      ];
      boxes.forEach((box, i) => {
        const bx = ML + i * (boxW + 6);
        w.rect(bx, bxY, boxW, boxH, box.hi ? C.lightBlueBg : C.rowAlt);
        w.rectStroke(bx, bxY, boxW, boxH, box.hi ? C.borderBlue : C.border, 0.7);
        w.page.drawText(san(box.label), { x: bx + 8, y: bxY + boxH - 14, font: fonts.bold, size: FS.micro, color: box.hi ? C.blue : C.gray });
        w.page.drawText(san(box.value), { x: bx + 8, y: bxY + boxH - 30, font: fonts.bold, size: box.hi ? 13 : 11, color: box.hi ? C.darkBlue : C.dark });
        if (box.psm) w.page.drawText(san(box.psm), { x: bx + 8, y: bxY + 8, font: fonts.regular, size: FS.small, color: C.blue });
      });
      w.y = bxY - 6;

      const infoChips = [
        a.confidenceLabel ? san(`Fiabilité ${a.confidenceLabel}`) : null,
        a.dvfSampleSize != null ? `${a.dvfSampleSize} trans. DVF` : null,
        perimeterKm ? (perimeterKm > (a.requestedRadiusKm as number ?? 0) ? `Rayon élargi ${perimeterKm} km` : `Rayon ${perimeterKm} km`) : null,
      ].filter(Boolean) as string[];
      let chX = ML;
      infoChips.forEach((chip) => {
        const cw = fonts.regular.widthOfTextAtSize(chip, FS.small) + 14;
        w.rect(chX, w.y - 6, cw, 14, C.headerBg);
        w.rectStroke(chX, w.y - 6, cw, 14, C.border, 0.4);
        w.page.drawText(san(chip), { x: chX + 7, y: w.y, font: fonts.regular, size: FS.small, color: C.gray });
        chX += cw + 6;
      });
      w.gap(22);

      // ── IC 95% note ──────────────────────────────────────────────────
      // fsd est explicitement stocké par la v2 (fsd = stdPsm). Pour les analyses
      // antérieures, seul stdPsm est disponible — on ne peut pas affirmer IC 95%.
      const fsdExplicit = dvfStats?.fsd ?? null;
      const fsdFallback = dvfStats?.stdPsm ?? null;
      const spreadPct = a.valuationMid && a.valuationHigh
        ? Math.round(((a.valuationHigh as number) - (a.valuationMid as number)) / (a.valuationMid as number) * 1000) / 10
        : null;
      if (spreadPct != null) {
        let icLine: string;
        if (fsdExplicit && fsdExplicit > 0) {
          icLine = san(`Fourchette calculee sur intervalle de confiance statistique a 95% (+/-${spreadPct}% | sigma = ${fPsm(fsdExplicit)})`);
        } else if (fsdFallback && fsdFallback > 0) {
          icLine = san(`Fourchette +/-${spreadPct}% | Ecart-type : ${fPsm(fsdFallback)} (resimulation pour IC dynamique)`);
        } else {
          icLine = san(`Fourchette standard +/-${spreadPct}%`);
        }
        w.text(icLine, ML, w.y, fonts.italic, FS.micro, C.lightGray);
        w.gap(14);
      }

      // ── Prix d'annonce conseillé ─────────────────────────────────────
      const lpLow = Math.round((a.valuationMid as number) * 1.02);
      const lpHigh = Math.round((a.valuationMid as number) * 1.03);
      const lpBoxH = 44;
      const lpY = w.y - lpBoxH;
      w.rect(ML, lpY, CW, lpBoxH, C.rowAlt);
      w.rectStroke(ML, lpY, CW, lpBoxH, C.border, 0.7);
      w.page.drawText(san("PRIX D'ANNONCE CONSEILLE"), { x: ML + 12, y: lpY + lpBoxH - 13, font: fonts.bold, size: FS.micro, color: C.gray });
      w.page.drawText(san(`entre ${fPrice(lpLow)} et ${fPrice(lpHigh)}`), { x: ML + 12, y: lpY + lpBoxH - 28, font: fonts.bold, size: 12, color: C.darkBlue });
      w.page.drawText(san("Marge de negociation de 2 a 3% sur le prix de vente estime"), { x: ML + 12, y: lpY + 8, font: fonts.italic, size: FS.micro, color: C.lightGray });
      w.y = lpY - 8;
    } else {
      w.text("Estimation non disponible - données insuffisantes.", ML, w.y, fonts.italic, FS.body, C.gray);
      w.gap(16);
    }

    w.addPage();
    w.footer(refId, today);
    w.sectionTitle("2. Ajustements qualitatifs - grille Estim74");
    w.gap(4);

    if (adjustments.length > 0) {
      const findAdj = (frag?: string, cat?: string, catFrag?: string): Adjustment | null => {
        // catFrag : cherche frag uniquement dans la catégorie cat (évite les faux positifs cross-catégorie)
        if (catFrag && cat) return adjustments.find((x) => x.category === cat && x.label.toLowerCase().includes(catFrag.toLowerCase())) ?? null;
        if (frag) return adjustments.find((x) => x.label.toLowerCase().includes(frag.toLowerCase())) ?? null;
        if (cat) return adjustments.find((x) => x.category === cat) ?? null;
        return null;
      };
      const adjDefs = [
        { critere: "État du bien", adj: findAdj(undefined, "condition") },
        { critere: "DPE (énergie)", adj: findAdj(undefined, "energy") },
        { critere: "Étage", adj: findAdj(undefined, "floor") },
        { critere: "Parking", adj: findAdj("parking") },
        { critere: "Garage", adj: findAdj("garage") },
        { critere: "Balcon", adj: findAdj("balcon") },
        { critere: "Terrasse", adj: findAdj("terrasse") },
        { critere: "Cave", adj: findAdj("cave") },
        { critere: "Piscine", adj: findAdj("piscine") },
        { critere: "Mitoyenneté", adj: findAdj("mitoyenne") },
        { critere: "Orientation", adj: findAdj(undefined, "orientation") },
        { critere: "Vue", adj: findAdj(undefined, "view") },
        // Recherche "jardin" ou "terrain" uniquement dans la catégorie "features"
        // pour ne pas capturer "Vue sur jardin privatif" (category="view")
        { critere: "Jardin / terrain", adj: findAdj(undefined, "features", "jardin") ?? findAdj(undefined, "features", "terrain") },
      ];

      // Lignes de proximité (catégorie "proximity")
      const proximityAdjs = adjustments.filter((x) => x.category === "proximity");
      for (const pa of proximityAdjs) {
        adjDefs.push({ critere: san(pa.label), adj: pa });
      }
      const adjRows = adjDefs.map(({ critere, adj }) => {
        if (!adj) return [critere, "-", "-", "-", "-", "-"];
        const ip = Math.round(adj.factor * basePsm);
        const it = Math.round(adj.factor * basePsm * surface);
        return [critere, "OUI", fPct(adj.factor), (ip >= 0 ? "+" : "") + numFr(ip) + " €", (it >= 0 ? "+" : "") + numFr(it) + " €", san(adj.label)];
      });
      const tip = Math.round(totalAdjFactor * basePsm);
      const tit = Math.round(totalAdjFactor * basePsm * surface);
      adjRows.push(["TOTAL AJUSTEMENTS", "", fPct(totalAdjFactor), (tip >= 0 ? "+" : "") + numFr(tip) + " €", (tit >= 0 ? "+" : "") + numFr(tit) + " €", ""]);

      drawTable(w, {
        cols: [
          { header: "Critère", width: 100 },
          { header: "Présent", width: 44, align: "center" as const },
          { header: "Facteur", width: 56, align: "right" as const, color: (row) => { const f = parseFloat(row[2]); return isNaN(f) ? C.dark : f > 0 ? C.green : f < 0 ? C.red : C.dark; } },
          { header: "Impact €/m²", width: 88, align: "right" as const, color: (row) => !row[3] || row[3] === "-" ? C.gray : row[3].startsWith("+") ? C.green : C.red },
          { header: "Impact total €", width: 100, align: "right" as const, color: (row) => !row[4] || row[4] === "-" ? C.gray : row[4].startsWith("+") ? C.green : C.red },
          { header: "Label", width: 127 },
        ],
        rows: adjRows,
        rowHeight: 14,
        stripedRows: true,
      });
      w.gap(5);
      w.text(`Base : ${fPsm(basePsm)} - Surface : ${surface} m²`, ML, w.y, fonts.italic, FS.micro, C.lightGray);
      w.gap(12);
    }

    // ═══════════ PAGE 3: METHODE & CALCUL ════════════════════════════════
    w.addPage();
    w.footer(refId, today);
    w.sectionTitle("3. Méthode et calcul");
    w.gap(6);

    // ── Bloc périmètre de recherche DVF ──────────────────────────────
    const irisDisplayLabel = a.irisCode ? getIrisDisplayLabel(a.irisCode as string) : null;
    const pluBlockLabel = a.zonePLU
      ? `Zone ${a.zonePLU as string}${a.documentUrbanisme ? " — " + (a.documentUrbanisme as string) + (a.city ? " " + (a.city as string) : "") : ""}`
      : null;
    {
      const blockH = 14 + (irisDisplayLabel ? 14 : 0) + (pluBlockLabel ? 14 : 0) + (dvfStats?.searchPath ? 14 : 0) + 14;
      w.rect(ML, w.y - blockH, CW, blockH + 2, C.headerBg);
      w.rect(ML, w.y - blockH, 3, blockH + 2, C.blue);
      w.page.drawText(san("PÉRIMÈTRE DE RECHERCHE DVF"), { x: ML + 10, y: w.y - 10, font: fonts.bold, size: FS.micro, color: C.blue });
      let bY = w.y - 22;
      if (irisDisplayLabel) {
        w.page.drawText(san("Secteur IRIS : " + irisDisplayLabel), { x: ML + 10, y: bY, font: fonts.bold, size: FS.body, color: C.dark });
        bY -= 13;
      }
      if (pluBlockLabel) {
        w.page.drawText(san("Urbanisme : " + pluBlockLabel), { x: ML + 10, y: bY, font: fonts.regular, size: FS.body, color: C.dark });
        bY -= 13;
      }
      const searchPathLine = dvfStats?.searchPath
        ? san("Périmètre retenu : " + dvfStats.searchPath)
        : perimeterKm
          ? san("Périmètre retenu : " + perimeterKm + " km")
          : null;
      if (searchPathLine) {
        w.page.drawText(searchPathLine, { x: ML + 10, y: bY, font: fonts.regular, size: FS.body, color: C.dark });
        bY -= 13;
      }
      const transLine = dvfExclus > 0
        ? san(`Transactions : ${dvfRetenues + dvfExclus} brutes → ${dvfRetenues} retenues (${dvfExclus} exclue${dvfExclus > 1 ? "s" : ""})`)
        : san(`Transactions retenues : ${dvfRetenues}`);
      w.page.drawText(transLine, { x: ML + 10, y: bY, font: fonts.regular, size: FS.body, color: C.gray });
      w.y = bY - 14;
    }

    // Badge A
    w.rect(ML, w.y - 14, 18, 16, C.blue);
    w.page.drawText(san("A"), { x: ML + 5, y: w.y - 10, font: fonts.bold, size: FS.body, color: C.white });
    w.page.drawText(san("Données DVF - transactions signées"), { x: ML + 24, y: w.y - 9, font: fonts.bold, size: FS.body, color: C.dark });
    w.gap(22);

    drawTable(w, {
      cols: [
        { header: "Étape pipeline DVF", width: CW - 80 },
        { header: "Transactions", width: 80, align: "right" as const, color: (row) => row[0].startsWith("Valeurs") ? C.red : row[0].includes("[OK]") ? C.green : C.dark },
      ],
      rows: [
        [`Mutations brutes dans le périmètre (${perimeterKm ?? "?"} km)`, String(dvfRetenues + dvfExclus)],
        ["Valeurs aberrantes exclues (IQR x2 + médiane +-40%)", dvfExclus > 0 ? `-${dvfExclus}` : "0"],
        ["+ Transactions retenues", String(dvfRetenues)],
      ],
      rowHeight: 14,
      stripedRows: false,
    });

    w.gap(8);
    if (dvfStats?.isIndexed) {
      w.rect(ML, w.y - 14, CW, 16, C.greenBg);
      w.rect(ML, w.y - 14, 3, 16, C.green);
      w.page.drawText(san("+ Prix indexés en valeur 2025 via les indices notariaux Haute-Savoie"), { x: ML + 8, y: w.y - 9, font: fonts.regular, size: FS.small, color: C.green });
      w.gap(22);
    }

    if (dvfStats) { w.kv("Médiane DVF (indexée 2025)", fPsm(dvfStats.medianPsm)); }
    if (dvfStats?.weightedAvgPsm != null) { w.kv("Moy. pondérée (dist. x surf. x récence)", fPsm(dvfStats.weightedAvgPsm)); }
    if (mktAdj !== 0) { w.kv(`Pression marché (${fPct(mktAdj)})`, fPsm(dvfAdjPsm)); }
    w.hline(ML, w.y + 2, CW, C.borderBlue, 1);
    w.gap(3);
    w.page.drawText(san("Prix DVF retenu"), { x: ML, y: w.y, font: fonts.bold, size: FS.body, color: C.coverBg });
    w.page.drawText(san(fPsm(dvfAdjPsm)), { x: ML + CW - fonts.bold.widthOfTextAtSize(fPsm(dvfAdjPsm), FS.body), y: w.y, font: fonts.bold, size: FS.body, color: C.coverBg });
    w.gap(20);

    // Badge B
    w.rect(ML, w.y - 14, 18, 16, C.blue);
    w.page.drawText(san("B"), { x: ML + 5, y: w.y - 10, font: fonts.bold, size: FS.body, color: C.white });
    w.page.drawText(san("Annonces actives - marché affiché"), { x: ML + 24, y: w.y - 9, font: fonts.bold, size: FS.body, color: C.dark });
    w.gap(22);

    if (listings.length === 0) {
      w.text("Aucune annonce active trouvée.", ML, w.y, fonts.italic, FS.body, C.gray);
      w.gap(16);
    } else {
      const outlierC = listings.filter((l) => l.outlier).length;
      drawTable(w, {
        cols: [
          { header: "Étape pipeline annonces", width: CW - 80 },
          { header: "Annonces", width: 80, align: "right" as const, color: (row) => row[0].startsWith("Valeurs") ? C.red : row[0].includes("[OK]") ? C.green : C.dark },
        ],
        rows: [
          ["Annonces trouvées", String(listings.length)],
          ["Valeurs aberrantes exclues (IQR x2 + médiane +-40%)", outlierC > 0 ? `-${outlierC}` : "0"],
          ["+ Annonces retenues", String(cleanListings.length)],
        ],
        rowHeight: 14,
        stripedRows: false,
      });
      w.gap(8);
      if (listingAvgPsm > 0) {
        w.kv("Prix affiche moyen (annonces retenues)", fPsm(Math.round(listingAvgPsm)));
        w.kv("Abattement vendeur -4%", fPsm(listingAdjPsm));
        w.hline(ML, w.y + 2, CW, C.borderBlue, 1);
        w.gap(3);
        w.page.drawText(san("Prix annonces retenu"), { x: ML, y: w.y, font: fonts.bold, size: FS.body, color: C.coverBg });
        w.page.drawText(san(fPsm(listingAdjPsm)), { x: ML + CW - fonts.bold.widthOfTextAtSize(fPsm(listingAdjPsm), FS.body), y: w.y, font: fonts.bold, size: FS.body, color: C.coverBg });
        w.gap(20);
      }
    }

    // Badge C
    w.ensureSpace(80);
    w.rect(ML, w.y - 14, 18, 16, C.blue);
    w.page.drawText(san("C"), { x: ML + 5, y: w.y - 10, font: fonts.bold, size: FS.body, color: C.white });
    w.page.drawText(san("Réconciliation finale"), { x: ML + 24, y: w.y - 9, font: fonts.bold, size: FS.body, color: C.dark });
    w.gap(22);

    const reconRows2: string[][] = [
      ["DVF - moy. pondérée", fPsm(dvfAdjPsm), `${Math.round(dvfW * 100)} %`, fPsm(Math.round(dvfAdjPsm * dvfW))],
      ["Annonces actives (-4%)", listingAdjPsm > 0 ? fPsm(listingAdjPsm) : "-", `${Math.round(lstW * 100)} %`, listingAdjPsm > 0 ? fPsm(Math.round(listingAdjPsm * lstW)) : "-"],
      ["PRIX DE BASE (avant ajust.)", "", "", fPsm(basePsm)],
    ];
    if (totalAdjFactor !== 0) {
      const adj2 = Math.round(totalAdjFactor * basePsm);
      reconRows2.push([`Ajustements (${fPct(totalAdjFactor)})`, "", "", (adj2 >= 0 ? "+" : "") + numFr(adj2) + " €/m²"]);
    }
    reconRows2.push([`PRIX FINAL - ${surface} m2 = ${fPrice(a.valuationMid as number)}`, "", "", a.valuationPsm ? fPsm(a.valuationPsm as number) : "-"]);

    drawTable(w, {
      cols: [
        { header: "Source", width: 180, color: (row) => row[0].includes("PRIX FINAL") ? C.white : row[0].includes("PRIX DE BASE") ? C.darkBlue : C.dark, bgColor: (row) => row[0].includes("PRIX FINAL") ? C.darkBlue : row[0].includes("PRIX DE BASE") ? C.lightBlueBg : null },
        { header: "€/m²", width: 100, align: "right" as const, color: (row) => row[0].includes("PRIX FINAL") ? C.white : C.gray, bgColor: (row) => row[0].includes("PRIX FINAL") ? C.darkBlue : row[0].includes("PRIX DE BASE") ? C.lightBlueBg : null },
        { header: "Poids", width: 65, align: "right" as const, color: (row) => row[0].includes("PRIX FINAL") ? C.white : C.gray, bgColor: (row) => row[0].includes("PRIX FINAL") ? C.darkBlue : row[0].includes("PRIX DE BASE") ? C.lightBlueBg : null },
        { header: "Contribution", width: 170, align: "right" as const, bold: true, color: (row) => row[0].includes("PRIX FINAL") ? C.white : row[0].includes("PRIX DE BASE") ? C.darkBlue : row[0].includes("Ajust") ? (totalAdjFactor >= 0 ? C.green : C.red) : C.dark, bgColor: (row) => row[0].includes("PRIX FINAL") ? C.darkBlue : row[0].includes("PRIX DE BASE") ? C.lightBlueBg : null },
      ],
      rows: reconRows2,
      rowHeight: 14,
      stripedRows: false,
    });

    // ═══════════ PAGE 4: CONTEXTE & RISQUES & PROXIMITÉS ════════════════
    {
      const risksSummary = Array.isArray(a.risksSummary) ? (a.risksSummary as string[]) : [];
      const servitudes = Array.isArray(a.servitudes) ? (a.servitudes as ServitudeItem[]) : [];
      const proximities = Array.isArray(a.proximities) ? (a.proximities as OsmPlace[]) : [];

      // Compute SWOT
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

      w.addPage();
      w.footer(refId, today);
      w.sectionTitle("4. Contexte — Risques, Urbanisme & Proximités");
      w.gap(4);

      // Risques naturels
      w.rect(ML, w.y - 14, CW, 16, C.headerBg);
      w.rect(ML, w.y - 14, 3, 16, C.amber);
      w.page.drawText(san("RISQUES NATURELS (Géorisques GASPAR)"), { x: ML + 10, y: w.y - 10, font: fonts.bold, size: FS.micro, color: C.amber });
      w.gap(22);
      if (risksSummary.length > 0) {
        risksSummary.forEach((risk) => {
          w.text(san("⚠ " + risk), ML + 6, w.y, fonts.regular, FS.body, C.red);
          w.gap(14);
        });
      } else {
        w.text(san("Aucun risque naturel majeur recensé (GASPAR)"), ML + 6, w.y, fonts.regular, FS.body, C.green);
        w.gap(14);
      }

      // Servitudes
      w.gap(4);
      w.rect(ML, w.y - 14, CW, 16, C.headerBg);
      w.rect(ML, w.y - 14, 3, 16, C.blue);
      w.page.drawText(san("SERVITUDES D'UTILITÉ PUBLIQUE (GPU Géoportail)"), { x: ML + 10, y: w.y - 10, font: fonts.bold, size: FS.micro, color: C.blue });
      w.gap(22);
      if (servitudes.length > 0) {
        servitudes.slice(0, 6).forEach((s) => {
          const typeLabel = s.typeSup ? san(`[${s.typeSup}] `) : "";
          const lib = san(s.libelle ?? "Servitude");
          w.text(typeLabel + lib, ML + 6, w.y, fonts.regular, FS.body, C.dark);
          w.gap(14);
        });
      } else {
        w.text(san("Aucune servitude d'utilité publique recensée"), ML + 6, w.y, fonts.regular, FS.body, C.green);
        w.gap(14);
      }

      // Proximités
      if (proximities.length > 0) {
        w.gap(4);
        w.rect(ML, w.y - 14, CW, 16, C.headerBg);
        w.rect(ML, w.y - 14, 3, 16, C.green);
        w.page.drawText(san("PROXIMITÉS OSM — TOP 5 PAR CATÉGORIE (rayon 1 km)"), { x: ML + 10, y: w.y - 10, font: fonts.bold, size: FS.micro, color: C.green });
        w.gap(22);

        const CATEGORIES = ["school", "shop", "transport", "health", "park"] as const;
        const CAT_LABELS: Record<string, string> = { school: "Écoles", shop: "Commerces", transport: "Transports", health: "Santé", park: "Espaces verts" };
        for (const cat of CATEGORIES) {
          const items = proximities.filter((p) => p.category === cat).sort((a, b) => a.distanceM - b.distanceM).slice(0, 5);
          if (items.length === 0) continue;
          w.text(san(CAT_LABELS[cat]), ML + 4, w.y, fonts.bold, FS.body, C.dark);
          w.gap(13);
          items.forEach((p) => {
            const dist = p.distanceM < 1000 ? `${p.distanceM} m` : `${(p.distanceM / 1000).toFixed(1)} km`;
            w.text(san(`  ${p.name} — ${dist}`), ML + 10, w.y, fonts.regular, FS.small, C.gray);
            w.gap(12);
          });
        }
      }

      // SWOT
      w.ensureSpace(80);
      w.gap(4);
      w.rect(ML, w.y - 14, CW, 16, C.headerBg);
      w.rect(ML, w.y - 14, 3, 16, C.darkBlue);
      w.page.drawText(san("ANALYSE FORCES & FAIBLESSES"), { x: ML + 10, y: w.y - 10, font: fonts.bold, size: FS.micro, color: C.darkBlue });
      w.gap(22);

      const halfW = (CW - 8) / 2;
      const swotStartY = w.y;

      // Strengths column
      w.page.drawText(san("✓ Points forts"), { x: ML, y: swotStartY, font: fonts.bold, size: FS.body, color: C.green });
      let sY = swotStartY - 14;
      swot.strengths.forEach((item) => {
        w.page.drawText(san(`+ ${item.label}`), { x: ML + 4, y: sY, font: fonts.regular, size: FS.small, color: C.green });
        sY -= 12;
      });

      // Weaknesses column
      w.page.drawText(san("✗ Points de vigilance"), { x: ML + halfW + 8, y: swotStartY, font: fonts.bold, size: FS.body, color: C.red });
      let wY = swotStartY - 14;
      swot.weaknesses.forEach((item) => {
        w.page.drawText(san(`- ${item.label}`), { x: ML + halfW + 12, y: wY, font: fonts.regular, size: FS.small, color: C.red });
        wY -= 12;
      });

      const lowestY = Math.min(sY, wY);
      w.y = lowestY - 8;
    }

    // ═══════════ PAGE 5+: DVF COMPARABLES ════════════════════════════════
    const retained = dvfComparables.filter((c) => !c.outlier);
    const excluded = dvfComparables.filter((c) => c.outlier);
    w.addPage();
    w.footer(refId, today);
    w.sectionTitle(`5. Transactions DVF retenues (${retained.length})`);
    w.gap(4);

    if (retained.length > 0) {
      drawTable(w, {
        cols: [
          { header: "Top", width: 28, align: "center" as const },
          { header: "Date", width: 54, align: "left" as const },
          { header: "Dist.", width: 46, align: "right" as const },
          { header: "Type de bien", width: 88, align: "left" as const },
          { header: "Surf.", width: 44, align: "right" as const },
          { header: "Pc", width: 22, align: "center" as const },
          { header: "Prix DVF", width: 78, align: "right" as const },
          { header: "€/m²", width: 68, align: "right" as const },
          { header: "€/m² idx.2025", width: 87, align: "right" as const, bold: true, color: () => C.blue },
        ],
        rows: retained.map((c) => [
          c.topComparable ? "*" : "",
          fDateShort(c.date),
          c.distanceM != null ? `${Math.round(c.distanceM)} m` : "-",
          san(c.type),
          `${c.surface} m2`,
          String(c.rooms ?? "-"),
          fPrice(c.price),
          fPsm(c.pricePsm),
          c.indexedPricePsm ? fPsm(c.indexedPricePsm) : "-",
        ]),
        rowHeight: 14,
        stripedRows: true,
      });
      if (excluded.length > 0) {
        w.gap(6);
        w.text(`${excluded.length} transaction(s) exclue(s) comme valeur aberrante.`, ML, w.y, fonts.italic, FS.micro, C.lightGray);
        w.gap(10);
      }
    } else {
      w.text("Aucun comparable DVF dans ce périmètre.", ML, w.y, fonts.italic, FS.body, C.gray);
      w.gap(16);
    }

    // ═══════════ ANNONCES ACTIVES ═════════════════════════════════════════
    if (listings.length > 0) {
      w.addPage();
      w.footer(refId, today);
      const outlierC2 = listings.filter((l) => l.outlier).length;
      w.sectionTitle(`6. Annonces actives - ${cleanListings.length} retenue(s) / ${outlierC2} exclue(s)`);
      w.gap(4);
      drawTable(w, {
        cols: [
          { header: "Titre", width: 128, color: (row) => row[7] === "EXCLU" ? C.amber : C.dark },
          { header: "Ville", width: 78 },
          { header: "Surf.", width: 46, align: "right" as const },
          { header: "Pc", width: 22, align: "center" as const },
          { header: "Prix", width: 78, align: "right" as const },
          { header: "€/m²", width: 66, align: "right" as const, bold: true, color: (row) => row[7] === "EXCLU" ? C.red : C.blue, bgColor: (row) => row[7] === "EXCLU" ? C.orangeBg : C.greenBg },
          { header: "Dist.", width: 46, align: "right" as const },
          { header: "Statut", width: 51, align: "center" as const, color: (row) => row[7] === "EXCLU" ? C.red : C.green, bgColor: (row) => row[7] === "EXCLU" ? C.orangeBg : C.greenBg },
        ],
        rows: listings.map((l) => [
          san(l.title),
          san(l.city),
          `${l.surface} m2`,
          String(l.rooms ?? "-"),
          fPrice(l.price),
          fPsm(l.pricePsm),
          l.distance ? (l.distance >= 1000 ? (l.distance / 1000).toFixed(1) + " km" : Math.round(l.distance) + " m") : "-",
          l.outlier ? "EXCLU" : "OK",
        ]),
        rowHeight: 14,
        stripedRows: false,
      });
    }

    // ═══════════ CONCLUSION ══════════════════════════════════════════════
    w.addPage();
    w.footer(refId, today);
    w.sectionTitle("7. Conclusion");
    w.gap(6);
    [
      `Bien : ${propertyLabel} de ${surface} m² - ${san([normalizeAddr(a.address as string), a.postalCode, a.city].filter(Boolean).join(", "))}`,
      `Périmètre : ${perimeterKm ?? "?"} km - ${dvfRetenues} transaction(s) DVF retenue(s)`,
      `Estimation centrale : ${fPrice(a.valuationMid as number)} (${fPsm(a.valuationPsm as number)})`,
      `Fourchette : ${fPrice(a.valuationLow as number)} - ${fPrice(a.valuationHigh as number)}`,
      a.confidenceLabel ? `Fiabilité : ${san(a.confidenceLabel as string)} (score ${Math.round((a.confidence as number ?? 0) * 100)}/100)` : "",
    ].filter(Boolean).forEach((line) => {
      w.text(line, ML, w.y, fonts.regular, FS.body, C.dark);
      w.gap(FS.body * 1.65);
    });

    return pdf.save();
  }
  