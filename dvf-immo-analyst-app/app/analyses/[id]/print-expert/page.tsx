import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintTrigger } from "@/components/analysis/print-trigger";
import { getDVFMutations } from "@/lib/dvf/client";
import { loadCsvMutations } from "@/lib/dvf/csv-loader";
import { computePrixM2, removeOutliers } from "@/lib/dvf/outliers";
import { computeDVFStats } from "@/lib/dvf/stats";
import { toComparables } from "@/lib/dvf/comparables";
import { propertyTypeToDvfTypes } from "@/lib/mapping/property-type";
import { PropertyType } from "@/types/property";
import { markListingOutliers } from "@/lib/listings/outliers";
import { percentile, formatPrice, formatPsm, formatDate, formatDateShort } from "@/lib/utils";
import { PROPERTY_TYPE_LABELS, CONDITION_LABELS, DPE_COLORS, CONFIDENCE_COLORS } from "@/lib/constants";
import { DVFStats, DVFComparable } from "@/types/dvf";
import { ActiveListing } from "@/types/listing";
import { Adjustment } from "@/types/valuation";

export const dynamic = "force-dynamic";

interface YearlyStat { year: number; medianPsm: number; count: number }

async function getTrendData(lat: number, lng: number, radiusKm: number, type?: string) {
  try {
    const rawMutations = await loadCsvMutations(lat, lng, Math.max(radiusKm, 3), 130, type ? [type] : undefined);
    const mutations = computePrixM2(rawMutations).filter((m) => m.prix_m2 != null && m.prix_m2 > 0);
    const byYear = new Map<number, number[]>();
    for (const m of mutations) {
      const year = new Date(m.date_mutation).getFullYear();
      if (year >= 2014 && year <= new Date().getFullYear()) {
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year)!.push(m.prix_m2!);
      }
    }
    const yearlyStats: YearlyStat[] = Array.from(byYear.entries())
      .map(([year, psms]) => ({ year, medianPsm: Math.round(percentile(psms, 50)), count: psms.length }))
      .sort((a, b) => a.year - b.year);
    let trend: "hausse" | "baisse" | "stable" = "stable";
    let trendPct: number | null = null;
    if (yearlyStats.length >= 6) {
      const r3 = yearlyStats.slice(-3), p3 = yearlyStats.slice(-6, -3);
      const r = r3.reduce((s, y) => s + y.medianPsm, 0) / 3;
      const p = p3.reduce((s, y) => s + y.medianPsm, 0) / 3;
      trendPct = Math.round(((r - p) / p) * 1000) / 10;
      trend = trendPct > 3 ? "hausse" : trendPct < -3 ? "baisse" : "stable";
    }
    return { yearlyStats, trend, trendPct };
  } catch {
    return { yearlyStats: [] as YearlyStat[], trend: null as null, trendPct: null as null };
  }
}

export default async function PrintExpertPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { noprint?: string };
}) {
  const skipPrint = searchParams.noprint === "1";
  const analysis = await prisma.analysis.findUnique({ where: { id: params.id } });
  if (!analysis) notFound();

  const a = JSON.parse(JSON.stringify(analysis)) as Record<string, unknown>;

  let dvfStats: DVFStats | null = (a.dvfStats as DVFStats) ?? null;
  let dvfComparables: DVFComparable[] = (a.dvfComparables as DVFComparable[]) ?? [];
  let perimeterKm: number | null = (a.perimeterKm as number) ?? null;
  let requestedRadiusKm: number | null = (a.requestedRadiusKm as number) ?? null;

  const rawListings: ActiveListing[] = Array.isArray(a.listings) ? (a.listings as ActiveListing[]) : [];
  const listings = markListingOutliers(rawListings);
  const cleanListings = listings.filter((l) => !l.outlier);

  if (!dvfStats && a.lat && a.lng) {
    try {
      const dvfTypes = propertyTypeToDvfTypes(a.propertyType as PropertyType);
      const reqRadius = (a.perimeterKm as number) ?? 0.5;
      const monthsBack = (a.dvfPeriodMonths as number) ?? 24;
      const { mutations, source, radiusKm: fr } = await getDVFMutations(a.lat as number, a.lng as number, reqRadius, monthsBack, dvfTypes);
      requestedRadiusKm = reqRadius; perimeterKm = fr;
      let enriched = computePrixM2(mutations);
      enriched = removeOutliers(enriched);
      dvfStats = computeDVFStats(enriched, a.surface as number);
      if (dvfStats) dvfStats.source = source;
      dvfComparables = toComparables(enriched, a.surface as number, a.rooms as number | undefined);
    } catch { /* no DVF data */ }
  }

  const dvfTypeForChart = a.propertyType === "APARTMENT" ? "Appartement" : a.propertyType === "HOUSE" ? "Maison" : a.propertyType === "LAND" ? "Terrain" : undefined;
  const trendData = (a.lat && a.lng)
    ? await getTrendData(a.lat as number, a.lng as number, Math.max(perimeterKm ?? 2, 2), dvfTypeForChart)
    : { yearlyStats: [], trend: null, trendPct: null };

  const propertyLabel = PROPERTY_TYPE_LABELS[a.propertyType as string] ?? (a.propertyType as string);
  const conditionLabel = a.condition ? CONDITION_LABELS[a.condition as string] : null;
  const dpeColor = a.dpeLetter ? DPE_COLORS[a.dpeLetter as string] ?? "#6B7280" : null;
  const wasExpanded = requestedRadiusKm != null && perimeterKm != null && perimeterKm > requestedRadiusKm;
  const isIndicative = a.confidenceLabel === "Indicative" || ((a.dvfSampleSize as number) != null && (a.dvfSampleSize as number) < 3);
  const adjustments = (a.adjustments as Adjustment[]) ?? [];
  const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Paris" });
  const maxTrendCount = trendData.yearlyStats.length > 0 ? Math.max(...trendData.yearlyStats.map((y) => y.count)) : 1;
  const trendColor = trendData.trend === "hausse" ? "#16A34A" : trendData.trend === "baisse" ? "#DC2626" : "#6B7280";
  const trendLabel = trendData.trend === "hausse" ? "En hausse" : trendData.trend === "baisse" ? "En baisse" : "Stable";

  // Méthode & Calcul
  const dvfRetenues = dvfStats?.count ?? 0;
  const dvfExclus = dvfStats?.excludedCount ?? 0;
  const dvfBrutes = dvfRetenues + dvfExclus;
  const dvfPsmRef = dvfStats?.weightedAvgPsm ?? dvfStats?.medianPsm ?? 0;
  const marketPressureAdj = dvfStats?.marketPressure?.adjustment ?? 0;
  const dvfAdjPsm = Math.round(dvfPsmRef * (1 + marketPressureAdj));
  const listingAvgPsm = cleanListings.length > 0 ? cleanListings.reduce((s, l) => s + l.pricePsm, 0) / cleanListings.length : 0;
  const listingAdjPsm = Math.round(listingAvgPsm * 0.96);
  let dvfWeight = 0, listingsWeight = 0;
  if (dvfRetenues >= 5 && cleanListings.length > 0) { dvfWeight = 0.70; listingsWeight = 0.30; }
  else if (dvfRetenues >= 5) { dvfWeight = 1.0; }
  else if (cleanListings.length >= 3) { listingsWeight = 1.0; }
  else if (dvfRetenues > 0 && cleanListings.length > 0) { dvfWeight = 0.70; listingsWeight = 0.30; }
  else if (dvfRetenues > 0) { dvfWeight = 1.0; }
  const basePsm = Math.round(dvfAdjPsm * dvfWeight + listingAdjPsm * listingsWeight);
  const savedMarketReading = (a.marketReading as Record<string, unknown> | null) ?? null;
  const dvfCtrl = (savedMarketReading?.dvfControl as Record<string, unknown> | null) ?? null;

  const findAdj = (cat: string[], frag?: string) => {
    if (frag) return adjustments.find((a) => a.label.toLowerCase().includes(frag.toLowerCase())) ?? null;
    return adjustments.find((a) => cat.includes(a.category)) ?? null;
  };
  const adjRows: { critere: string; adj: Adjustment | null }[] = [
    { critere: "État du bien", adj: findAdj(["condition"]) },
    { critere: "DPE (énergie)", adj: findAdj(["energy"]) },
    { critere: "Étage", adj: findAdj(["floor"]) },
    { critere: "Parking", adj: findAdj([], "parking") },
    { critere: "Garage", adj: findAdj([], "garage") },
    { critere: "Balcon", adj: findAdj([], "balcon") },
    { critere: "Terrasse", adj: findAdj([], "terrasse") },
    { critere: "Cave", adj: findAdj([], "cave") },
    { critere: "Piscine", adj: findAdj([], "piscine") },
    { critere: "Orientation", adj: findAdj(["orientation"]) },
    { critere: "Vue", adj: findAdj(["view"]) },
    { critere: "Jardin / terrain", adj: findAdj([], "jardin") ?? findAdj([], "terrain") },
  ];
  const totalAdjFactor = adjustments.reduce((s, a) => s + a.factor, 0);
  const retainedComparables = dvfComparables.filter((c) => !c.outlier);
  const excludedCount = dvfComparables.filter((c) => c.outlier).length;

  function pct(f: number) { return (f >= 0 ? "+" : "") + (f * 100).toFixed(1) + "%" }

  return (
    <>
      <PrintTrigger skip={skipPrint} />
      <style suppressHydrationWarning>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @media screen {
          body { background: #F3F4F6; }
          .print-page { min-height: 100vh; display: flex; justify-content: center; padding: 32px 16px 64px; }
          .print-sheet { background: #fff; width: 210mm; box-shadow: 0 4px 40px rgba(0,0,0,0.12); border-radius: 6px; overflow: hidden; }
        }
        @media print {
          .print-page { background: none; padding: 0; }
          .print-sheet { width: 100%; box-shadow: none; border-radius: 0; }
          .page-break-hint { page-break-before: always; }
        }
        .print-sheet { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 13px; color: #111827; line-height: 1.6; }
        /* COVER */
        .cover {
          background: linear-gradient(150deg, #1D4ED8 0%, #2563EB 55%, #3B82F6 100%);
          color: #fff; padding: 20mm 18mm 18mm;
          min-height: 200px;
        }
        .cover-eyebrow { font-size: 8px; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(255,255,255,0.7); margin-bottom: 8px; font-weight: 600; }
        .cover-rule { border: none; border-top: 1px solid rgba(255,255,255,0.25); margin: 16px 0; }
        .cover-type { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(255,255,255,0.65); margin-bottom: 8px; }
        .cover-title { font-size: 26px; font-weight: 900; letter-spacing: -0.02em; color: #fff; margin-bottom: 10px; }
        .cover-address { font-size: 14px; font-weight: 700; color: rgba(255,255,255,0.95); margin-bottom: 8px; line-height: 1.4; word-wrap: break-word; overflow-wrap: break-word; }
        .cover-meta { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11px; color: rgba(255,255,255,0.75); margin-bottom: 14px; }
        .cover-chips { display: flex; gap: 7px; flex-wrap: wrap; }
        .cover-chip { border: 1px solid rgba(255,255,255,0.35); border-radius: 99px; padding: 3px 10px; font-size: 9px; color: rgba(255,255,255,0.9); white-space: nowrap; }
        .cover-footer-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.2); }
        .cover-date-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.6); margin-bottom: 2px; }
        .cover-date-value { font-size: 12px; font-weight: 700; color: #fff; }
        /* CONTENT LAYOUT */
        .content { padding: 14mm 18mm 12mm; }
        /* SECTION HEADER — visual page-break hint */
        .section { margin-bottom: 24px; }
        .section-break { margin-top: 32px; padding-top: 20px; border-top: 3px solid #2563EB; margin-bottom: 20px; }
        .section-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #2563EB; margin-bottom: 12px; border-bottom: 1.5px solid #DBEAFE; padding-bottom: 5px; }
        .divider { border: none; border-top: 1px solid #E5E7EB; margin: 20px 0; }
        /* ESTIMATION */
        .estim-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 14px; }
        .estim-box { border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px 14px; background: #F9FAFB; }
        .estim-box.main { border-color: #BFDBFE; background: #EFF6FF; }
        .estim-box.amber { border-color: #FCD34D; background: #FFFBEB; }
        .estim-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.08em; color: #9CA3AF; margin-bottom: 5px; }
        .estim-label.main { color: #2563EB; }
        .estim-label.amber { color: #92400E; }
        .estim-price { font-size: 18px; font-weight: 800; color: #374151; }
        .estim-price.main { font-size: 22px; color: #1D4ED8; }
        .estim-price.amber { font-size: 22px; color: #92400E; }
        .estim-psm { font-size: 11px; color: #6B7280; margin-top: 3px; }
        .estim-psm.main { color: #2563EB; font-weight: 600; }
        .chips-row { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
        .chip { display: inline-flex; border: 1px solid #E5E7EB; border-radius: 99px; padding: 3px 10px; font-size: 10px; font-weight: 600; color: #374151; white-space: nowrap; }
        /* TABLES — common */
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        table.fixed { table-layout: fixed; }
        th { background: #F8FAFC; padding: 7px 10px; text-align: left; font-weight: 600; color: #6B7280; border-bottom: 1.5px solid #E5E7EB; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; overflow: hidden; word-wrap: break-word; }
        td { padding: 7px 10px; border-bottom: 1px solid #F3F4F6; vertical-align: middle; overflow: hidden; word-wrap: break-word; overflow-wrap: break-word; }
        tr:last-child td { border-bottom: none; }
        .tr-green td { background: #F0FDF4; }
        .tr-orange td { background: #FFF7ED; }
        .tr-blue td { background: #EFF6FF; }
        .tr-dark td { background: #1D4ED8; color: #fff; font-weight: 700; }
        .tr-gray td { background: #F9FAFB; }
        .tr-subhead td { background: #F1F5F9; font-weight: 600; font-size: 10px; color: #475569; border-bottom: 1.5px solid #E2E8F0; }
        /* STAT ROW */
        .stat-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dotted #E5E7EB; font-size: 12px; }
        .stat-row:last-child { border-bottom: none; }
        .stat-k { color: #6B7280; }
        .stat-v { font-weight: 600; color: #1F2937; text-align: right; }
        /* SECTION LETTER BADGE */
        .sec-badge { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: #2563EB; color: #fff; font-size: 10px; font-weight: 800; flex-shrink: 0; margin-right: 8px; }
        .sec-label { display: flex; align-items: center; font-size: 11px; font-weight: 700; color: #1F2937; margin-bottom: 10px; }
        /* PIPELINE TABLE */
        .pipeline td { padding: 8px 10px; }
        /* TREND BAR */
        .bar-bg { background: #E5E7EB; border-radius: 4px; height: 7px; overflow: hidden; }
        .bar-fill { height: 100%; background: #2563EB; border-radius: 4px; }
        /* STATUS BADGES */
        .badge-ok { display: inline-block; background: #DCFCE7; color: #166534; border: 1px solid #BBF7D0; border-radius: 99px; padding: 1px 8px; font-size: 9px; font-weight: 700; white-space: nowrap; }
        .badge-warn { display: inline-block; background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; border-radius: 99px; padding: 1px 8px; font-size: 9px; font-weight: 700; white-space: nowrap; }
        .badge-iqr { display: inline-block; background: #FEE2E2; color: #991B1B; border: 1px solid #FECACA; border-radius: 99px; padding: 1px 8px; font-size: 9px; font-weight: 700; white-space: nowrap; }
        /* FOOTER */
        .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #E5E7EB; display: flex; justify-content: space-between; font-size: 9px; color: #9CA3AF; }
        .footer-legal { font-size: 8px; color: #D1D5DB; text-align: center; margin-top: 6px; }
      `}</style>

      <div className="print-page">
        <div className="print-sheet">

          {/* ── COVER ── */}
          <div className="cover">
            <div className="cover-eyebrow">ESTIM&apos;74 — Haute-Savoie (74) · Données DVF DGFiP 2014–2024</div>
            <hr className="cover-rule" />
            <div className="cover-type">Rapport d&apos;expertise · {propertyLabel}</div>
            <div className="cover-title">RAPPORT D&apos;EXPERTISE</div>
            <div className="cover-address">
              {[a.address, a.postalCode, a.city].filter(Boolean).join(", ") || "Adresse non renseignée"}
            </div>
            <div className="cover-meta">
              <span>{a.surface as number} m²</span>
              {!!a.rooms && <span>{a.rooms as number} pièces</span>}
              {!!a.yearBuilt && <span>Construit en {a.yearBuilt as number}</span>}
              {!!conditionLabel && <span>{conditionLabel}</span>}
            </div>
            <div className="cover-chips">
              {!!a.dpeLetter && (
                <span className="cover-chip" style={{ borderColor: dpeColor! + "90" }}>DPE {a.dpeLetter as string}</span>
              )}
              {!!a.hasParking && <span className="cover-chip">Parking</span>}
              {!!a.hasGarage && <span className="cover-chip">Garage</span>}
              {!!a.hasBalcony && <span className="cover-chip">Balcon</span>}
              {!!a.hasTerrace && <span className="cover-chip">Terrasse</span>}
              {!!a.hasPool && <span className="cover-chip">Piscine</span>}
              {!!a.hasElevator && <span className="cover-chip">Ascenseur</span>}
            </div>
            <div className="cover-footer-row">
              <div>
                <div className="cover-date-label">Généré le</div>
                <div className="cover-date-value">{today}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="cover-date-label">Référence</div>
                <div style={{ fontFamily: "monospace", fontSize: "11px", color: "rgba(255,255,255,0.85)", fontWeight: 700 }}>
                  {params.id.slice(0, 8).toUpperCase()}
                </div>
              </div>
            </div>
          </div>

          {/* ── CONTENT ── */}
          <div className="content">

            {/* §1 — ESTIMATION */}
            <div className="section">
              <div className="section-title">1. Estimation de valeur</div>
              {a.valuationMid ? (
                <>
                  {isIndicative && (
                    <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, padding: "10px 14px", fontSize: "12px", color: "#92400E", marginBottom: 12 }}>
                      <strong>Estimation indicative</strong> — données DVF limitées ({a.dvfSampleSize as number ?? 0} transaction{(a.dvfSampleSize as number ?? 0) !== 1 ? "s" : ""}). Recoupez avec d&apos;autres sources.
                    </div>
                  )}
                  <div className="estim-grid">
                    <div className="estim-box">
                      <div className="estim-label">Fourchette basse</div>
                      <div className="estim-price">{formatPrice(a.valuationLow as number)}</div>
                    </div>
                    <div className={`estim-box ${isIndicative ? "amber" : "main"}`}>
                      <div className={`estim-label ${isIndicative ? "amber" : "main"}`}>Estimation centrale</div>
                      <div className={`estim-price ${isIndicative ? "amber" : "main"}`}>{formatPrice(a.valuationMid as number)}</div>
                      {!!a.valuationPsm && <div className={`estim-psm ${isIndicative ? "" : "main"}`}>{formatPsm(a.valuationPsm as number)}</div>}
                    </div>
                    <div className="estim-box">
                      <div className="estim-label">Fourchette haute</div>
                      <div className="estim-price">{formatPrice(a.valuationHigh as number)}</div>
                    </div>
                  </div>
                  <div className="chips-row">
                    {a.confidence != null && !!a.confidenceLabel && (
                      <span className="chip" style={{ borderColor: CONFIDENCE_COLORS[a.confidenceLabel as string] ?? "#E5E7EB", color: CONFIDENCE_COLORS[a.confidenceLabel as string] ?? "#374151" }}>
                        Fiabilité : {a.confidenceLabel as string} ({Math.round((a.confidence as number) * 100)}/100)
                      </span>
                    )}
                    {perimeterKm && (
                      <span className="chip">{wasExpanded ? `Rayon élargi ${perimeterKm} km` : `Rayon ${perimeterKm} km`}</span>
                    )}
                    {a.dvfSampleSize != null && (
                      <span className="chip">{a.dvfSampleSize as number} transaction{(a.dvfSampleSize as number) !== 1 ? "s" : ""} DVF</span>
                    )}
                  </div>
                </>
              ) : (
                <p style={{ color: "#6B7280", fontStyle: "italic" }}>Estimation non disponible — données DVF insuffisantes dans ce secteur.</p>
              )}
            </div>

            {/* §2 — AJUSTEMENTS QUALITATIFS */}
            <div className="section-break page-break-hint">
              <div className="section-title">2. Ajustements qualitatifs — grille Estim74</div>
              <table className="fixed">
                <colgroup>
                  <col style={{ width: "26%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "14%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Critère</th>
                    <th style={{ textAlign: "center" }}>Présent</th>
                    <th style={{ textAlign: "right" }}>Facteur</th>
                    <th style={{ textAlign: "right" }}>Impact €/m²</th>
                    <th style={{ textAlign: "right" }}>Impact total</th>
                    <th style={{ textAlign: "right" }}>Label appliqué</th>
                  </tr>
                </thead>
                <tbody>
                  {adjRows.map(({ critere, adj }) => {
                    const impactPsm = adj ? Math.round(adj.factor * basePsm) : 0;
                    const impactTotal = adj ? Math.round(adj.factor * basePsm * (a.surface as number)) : 0;
                    const col = adj && adj.factor > 0 ? "#16A34A" : adj && adj.factor < 0 ? "#DC2626" : "#9CA3AF";
                    return (
                      <tr key={critere} style={adj ? undefined : { opacity: 0.5 }}>
                        <td style={{ fontWeight: adj ? 600 : 400 }}>{critere}</td>
                        <td style={{ textAlign: "center", fontSize: "13px" }}>{adj ? "✓" : "—"}</td>
                        <td style={{ textAlign: "right", color: col, fontWeight: adj ? 700 : 400 }}>{adj ? pct(adj.factor) : "—"}</td>
                        <td style={{ textAlign: "right", color: col, fontWeight: adj ? 600 : 400 }}>
                          {adj ? (impactPsm >= 0 ? "+" : "") + impactPsm.toLocaleString("fr-FR") + " €" : "—"}
                        </td>
                        <td style={{ textAlign: "right", color: col, fontWeight: adj ? 600 : 400 }}>
                          {adj ? (impactTotal >= 0 ? "+" : "") + impactTotal.toLocaleString("fr-FR") + " €" : "—"}
                        </td>
                        <td style={{ textAlign: "right", fontSize: "10px", color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {adj?.label ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {adjustments.length > 0 && (
                    <tr className="tr-gray">
                      <td colSpan={2} style={{ fontWeight: 700 }}>Total ajustements</td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: totalAdjFactor >= 0 ? "#16A34A" : "#DC2626" }}>{pct(totalAdjFactor)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: totalAdjFactor >= 0 ? "#16A34A" : "#DC2626" }}>
                        {(totalAdjFactor >= 0 ? "+" : "") + Math.round(totalAdjFactor * basePsm).toLocaleString("fr-FR")} €/m²
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: totalAdjFactor >= 0 ? "#16A34A" : "#DC2626" }}>
                        {(totalAdjFactor >= 0 ? "+" : "") + Math.round(totalAdjFactor * basePsm * (a.surface as number)).toLocaleString("fr-FR")} €
                      </td>
                      <td></td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p style={{ fontSize: "10px", color: "#9CA3AF", marginTop: 6 }}>Base de calcul : {formatPsm(basePsm)} · Surface : {a.surface as number} m²</p>
            </div>

            {/* §3 — MÉTHODE & CALCUL */}
            <div className="section-break page-break-hint">
              <div className="section-title">3. Méthode &amp; Calcul</div>

              {/* Section A */}
              <div style={{ marginBottom: 20 }}>
                <div className="sec-label"><span className="sec-badge">A</span> Données DVF — transactions signées</div>
                <table className="fixed pipeline">
                  <colgroup><col style={{ width: "75%" }} /><col style={{ width: "25%" }} /></colgroup>
                  <thead><tr><th>Étape du pipeline</th><th style={{ textAlign: "right" }}>Transactions</th></tr></thead>
                  <tbody>
                    <tr><td>Mutations brutes dans le périmètre ({perimeterKm ?? "?"} km)</td><td style={{ textAlign: "right", fontWeight: 600 }}>{dvfBrutes}</td></tr>
                    <tr className="tr-orange">
                      <td>Valeurs aberrantes exclues (IQR×2 + médiane ±40%)</td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: "#C2410C" }}>{dvfExclus > 0 ? `−\u202F${dvfExclus}` : "0"}</td>
                    </tr>
                    <tr className="tr-green">
                      <td style={{ fontWeight: 700, color: "#15803D" }}>✓ Transactions retenues</td>
                      <td style={{ textAlign: "right", fontWeight: 800, color: "#15803D" }}>{dvfRetenues}</td>
                    </tr>
                  </tbody>
                </table>
                {dvfStats?.isIndexed && (
                  <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 6, padding: "7px 12px", fontSize: "11px", color: "#166534", marginTop: 8 }}>
                    Tous les prix sont indexés en valeur 2025 via les indices notariaux Haute-Savoie (correction du biais temporel 2014–2024).
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  <div className="stat-row"><span className="stat-k">Médiane DVF (indexée 2025)</span><span className="stat-v">{dvfStats ? formatPsm(dvfStats.medianPsm) : "—"}</span></div>
                  {dvfStats?.weightedAvgPsm != null && (
                    <div className="stat-row"><span className="stat-k">Moy. pondérée (distance × surface × récence)</span><span className="stat-v" style={{ color: "#2563EB" }}>{formatPsm(dvfStats.weightedAvgPsm)}</span></div>
                  )}
                  {marketPressureAdj !== 0 && (
                    <div className="stat-row"><span className="stat-k">Pression marché ({pct(marketPressureAdj)})</span><span className="stat-v">{formatPsm(dvfAdjPsm)}</span></div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#2563EB", marginTop: 6, padding: "6px 0", borderTop: "1.5px solid #BFDBFE" }}>
                    <span>Prix DVF retenu</span><span>{formatPsm(dvfAdjPsm)}</span>
                  </div>
                  {dvfCtrl && (
                    <div style={{ marginTop: 8, padding: "6px 10px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 5, fontSize: "10px", color: "#475569" }}>
                      <span style={{ fontWeight: 600 }}>Contrôle source DVF — </span>
                      {dvfCtrl.trend6m != null && (
                        <span>Tendance 6 mois : <strong style={{ color: (dvfCtrl.trend6m as number) > 0 ? "#16A34A" : (dvfCtrl.trend6m as number) < 0 ? "#DC2626" : "#6B7280" }}>
                          {(dvfCtrl.trend6m as number) > 0 ? "+" : ""}{(dvfCtrl.trend6m as number).toFixed(1)}%
                        </strong>{" "}</span>
                      )}
                      {dvfCtrl.trend12m != null && (
                        <span>Tendance 12 mois : <strong style={{ color: (dvfCtrl.trend12m as number) > 0 ? "#16A34A" : (dvfCtrl.trend12m as number) < 0 ? "#DC2626" : "#6B7280" }}>
                          {(dvfCtrl.trend12m as number) > 0 ? "+" : ""}{(dvfCtrl.trend12m as number).toFixed(1)}%
                        </strong>{" "}</span>
                      )}
                      {dvfCtrl.communeMedianPsm != null && dvfCtrl.deptMedianPsm != null && (
                        <span>· Local {formatPsm(dvfCtrl.communeMedianPsm as number)} vs Dép.74 {formatPsm(dvfCtrl.deptMedianPsm as number)}
                          {dvfCtrl.divergencePct != null && Math.abs(dvfCtrl.divergencePct as number) > 10 && (
                            <span style={{ marginLeft: 4, color: "#B45309", fontWeight: 600 }}>
                              ⚠ Écart {(dvfCtrl.divergencePct as number) > 0 ? "+" : ""}{dvfCtrl.divergencePct as number}%
                            </span>
                          )}
                        </span>
                      )}
                      <span style={{ float: "right", color: "#94A3B8" }}>Source : DGFiP DVF officiel</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Section B */}
              <div style={{ marginBottom: 20 }}>
                <div className="sec-label"><span className="sec-badge">B</span> Annonces actives — marché affiché</div>
                {listings.length === 0 ? (
                  <p style={{ color: "#9CA3AF", fontStyle: "italic", fontSize: "12px" }}>Aucune annonce active trouvée dans ce secteur.</p>
                ) : (
                  <>
                    <table className="fixed pipeline">
                      <colgroup><col style={{ width: "75%" }} /><col style={{ width: "25%" }} /></colgroup>
                      <thead><tr><th>Étape du pipeline</th><th style={{ textAlign: "right" }}>Annonces</th></tr></thead>
                      <tbody>
                        <tr><td>Annonces trouvées</td><td style={{ textAlign: "right", fontWeight: 600 }}>{listings.length}</td></tr>
                        <tr className="tr-orange">
                          <td>Valeurs aberrantes exclues (IQR×2 + médiane ±40%)</td>
                          <td style={{ textAlign: "right", fontWeight: 600, color: "#C2410C" }}>
                            {listings.filter(l => l.outlier).length > 0 ? `−\u202F${listings.filter(l => l.outlier).length}` : "0"}
                          </td>
                        </tr>
                        <tr className="tr-green">
                          <td style={{ fontWeight: 700, color: "#15803D" }}>✓ Annonces retenues</td>
                          <td style={{ textAlign: "right", fontWeight: 800, color: "#15803D" }}>{cleanListings.length}</td>
                        </tr>
                      </tbody>
                    </table>
                    <div style={{ marginTop: 10 }}>
                      <div className="stat-row"><span className="stat-k">Prix affiché moyen (annonces retenues)</span><span className="stat-v">{listingAvgPsm > 0 ? formatPsm(Math.round(listingAvgPsm)) : "—"}</span></div>
                      <div className="stat-row"><span className="stat-k">Abattement vendeur −4% (négociation)</span><span className="stat-v">{listingAdjPsm > 0 ? formatPsm(listingAdjPsm) : "—"}</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#2563EB", marginTop: 6, padding: "6px 0", borderTop: "1.5px solid #BFDBFE" }}>
                        <span>Prix annonces retenu</span><span>{listingAdjPsm > 0 ? formatPsm(listingAdjPsm) : "—"}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Section C */}
              <div>
                <div className="sec-label"><span className="sec-badge">C</span> Réconciliation finale</div>
                <table className="fixed">
                  <colgroup>
                    <col style={{ width: "35%" }} />
                    <col style={{ width: "22%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "28%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th style={{ textAlign: "right" }}>Prix €/m²</th>
                      <th style={{ textAlign: "right" }}>Poids</th>
                      <th style={{ textAlign: "right" }}>Contribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>DVF — moy. pondérée</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{dvfAdjPsm > 0 ? formatPsm(dvfAdjPsm) : "—"}</td>
                      <td style={{ textAlign: "right" }}>{(dvfWeight * 100).toFixed(0)} %</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{dvfAdjPsm > 0 ? formatPsm(Math.round(dvfAdjPsm * dvfWeight)) : "—"}</td>
                    </tr>
                    <tr>
                      <td>Annonces actives (−4%)</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{listingAdjPsm > 0 ? formatPsm(listingAdjPsm) : "—"}</td>
                      <td style={{ textAlign: "right" }}>{(listingsWeight * 100).toFixed(0)} %</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{listingAdjPsm > 0 ? formatPsm(Math.round(listingAdjPsm * listingsWeight)) : "—"}</td>
                    </tr>
                    <tr className="tr-blue">
                      <td colSpan={3} style={{ fontWeight: 700, color: "#1D4ED8" }}>Prix de base (avant ajustements)</td>
                      <td style={{ textAlign: "right", fontWeight: 800, color: "#1D4ED8" }}>{formatPsm(basePsm)}</td>
                    </tr>
                    {totalAdjFactor !== 0 && (
                      <tr>
                        <td colSpan={3} style={{ color: "#6B7280" }}>Ajustements qualitatifs ({pct(totalAdjFactor)})</td>
                        <td style={{ textAlign: "right", fontWeight: 600, color: totalAdjFactor >= 0 ? "#16A34A" : "#DC2626" }}>
                          {(totalAdjFactor >= 0 ? "+" : "") + Math.round(totalAdjFactor * basePsm).toLocaleString("fr-FR")} €/m²
                        </td>
                      </tr>
                    )}
                    <tr className="tr-dark">
                      <td colSpan={3}>Prix final · {a.surface as number} m² = {formatPrice(a.valuationMid as number)}</td>
                      <td style={{ textAlign: "right", fontSize: "13px" }}>{a.valuationPsm ? formatPsm(a.valuationPsm as number) : "—"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* §4 — COMPARABLES DVF */}
            <div className="section-break page-break-hint">
              <div className="section-title">4. Transactions DVF retenues ({retainedComparables.length})</div>
              {retainedComparables.length > 0 ? (
                <>
                  <table className="fixed">
                    <colgroup>
                      <col style={{ width: "4%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "9%" }} />
                      <col style={{ width: "7%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "6%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th></th>
                        <th>Date</th>
                        <th>Distance</th>
                        <th>Type</th>
                        <th style={{ textAlign: "right" }}>Surface</th>
                        <th style={{ textAlign: "right" }}>Pcs</th>
                        <th style={{ textAlign: "right" }}>Prix DVF</th>
                        <th style={{ textAlign: "right" }}>€/m²</th>
                        <th style={{ textAlign: "right" }}>€/m² idx.2025</th>
                        <th>Src</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retainedComparables.map((c, i) => (
                        <tr key={`${c.id ?? "c"}-${i}`} style={c.topComparable ? { background: "#EFF6FF" } : undefined}>
                          <td style={{ textAlign: "center" }}>
                            {c.topComparable && <span style={{ display: "inline-block", background: "#DBEAFE", color: "#1D4ED8", border: "1px solid #93C5FD", borderRadius: 99, padding: "0 4px", fontSize: "8px", fontWeight: 800 }}>★</span>}
                          </td>
                          <td style={{ color: "#6B7280", whiteSpace: "nowrap" }}>{formatDateShort(c.date)}</td>
                          <td style={{ color: "#6B7280" }}>{c.distanceM != null ? Math.round(c.distanceM) + " m" : "—"}</td>
                          <td>{c.type}</td>
                          <td style={{ textAlign: "right" }}>{c.surface} m²</td>
                          <td style={{ textAlign: "right", color: "#6B7280" }}>{c.rooms ?? "—"}</td>
                          <td style={{ textAlign: "right", fontWeight: 600 }}>{formatPrice(c.price, true)}</td>
                          <td style={{ textAlign: "right", color: "#6B7280" }}>{formatPsm(c.pricePsm)}</td>
                          <td style={{ textAlign: "right", fontWeight: 700, color: "#2563EB" }}>{c.indexedPricePsm ? formatPsm(c.indexedPricePsm) : "—"}</td>
                          <td style={{ fontSize: "9px", color: c.source === "live" ? "#2563EB" : "#9CA3AF" }}>{c.source === "live" ? "Live" : "CSV"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {excludedCount > 0 && (
                    <p style={{ fontSize: "10px", color: "#9CA3AF", marginTop: 6 }}>
                      {excludedCount} transaction{excludedCount > 1 ? "s" : ""} exclue{excludedCount > 1 ? "s" : ""} (valeur aberrante) — non présentée{excludedCount > 1 ? "s" : ""}.
                    </p>
                  )}
                </>
              ) : (
                <p style={{ color: "#6B7280", fontStyle: "italic" }}>Aucun comparable DVF disponible dans ce périmètre.</p>
              )}
            </div>

            {/* §5 — ANNONCES ACTIVES */}
            {listings.length > 0 && (
              <div className="section-break page-break-hint">
                <div className="section-title">
                  5. Annonces actives — {cleanListings.length} retenue{cleanListings.length !== 1 ? "s" : ""} / {listings.filter(l => l.outlier).length} exclue{listings.filter(l => l.outlier).length !== 1 ? "s" : ""}
                </div>
                <table className="fixed">
                  <colgroup>
                    <col style={{ width: "28%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "6%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Titre</th>
                      <th>Ville</th>
                      <th style={{ textAlign: "right" }}>Surface</th>
                      <th style={{ textAlign: "right" }}>Pcs</th>
                      <th style={{ textAlign: "right" }}>Prix affiché</th>
                      <th style={{ textAlign: "right" }}>€/m²</th>
                      <th>Distance</th>
                      <th style={{ textAlign: "center" }}>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listings.map((l, i) => (
                      <tr key={`${l.id ?? "l"}-${i}`} style={l.outlier ? { background: "#FFF7ED" } : { background: "#F0FDF4" }}>
                        <td style={{ fontSize: "10px", fontWeight: 500 }}>{l.title}</td>
                        <td style={{ color: "#6B7280", fontSize: "10px" }}>{l.city}</td>
                        <td style={{ textAlign: "right" }}>{l.surface} m²</td>
                        <td style={{ textAlign: "right", color: "#6B7280" }}>{l.rooms ?? "—"}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{formatPrice(l.price, true)}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: l.outlier ? "#C2410C" : "#2563EB" }}>{formatPsm(l.pricePsm)}</td>
                        <td style={{ color: "#6B7280", fontSize: "10px" }}>
                          {l.distance ? (l.distance >= 1000 ? (l.distance / 1000).toFixed(1) + " km" : Math.round(l.distance) + " m") : "—"}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {l.outlier ? (
                            <span className={l.outlierReason === "iqr" ? "badge-iqr" : "badge-warn"}>
                              {l.outlierReason === "iqr" ? "IQR" : "Méd."}
                            </span>
                          ) : (
                            <span className="badge-ok">✓</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* §6 — MARCHÉ LOCAL */}
            {trendData.yearlyStats.length > 0 && (
              <div className="section-break page-break-hint">
                <div className="section-title">6. Évolution du marché local{dvfTypeForChart ? ` — ${dvfTypeForChart}s` : ""}</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
                  {trendData.trend && (
                    <span className="chip" style={{ borderColor: trendColor, color: trendColor }}>
                      {trendLabel}{trendData.trendPct != null && ` · ${trendData.trendPct > 0 ? "+" : ""}${trendData.trendPct}% sur 6 ans`}
                    </span>
                  )}
                  <span style={{ fontSize: "10px", color: "#9CA3AF" }}>
                    Rayon {Math.max(perimeterKm ?? 2, 2)} km · {trendData.yearlyStats.reduce((s, y) => s + y.count, 0).toLocaleString("fr-FR")} transactions analysées
                  </span>
                </div>
                <table className="fixed">
                  <colgroup>
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "55%" }} />
                    <col style={{ width: "15%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Année</th>
                      <th style={{ textAlign: "right" }}>Médiane €/m²</th>
                      <th>Volume</th>
                      <th style={{ textAlign: "right" }}>Transactions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendData.yearlyStats.map((y, idx) => {
                      const pctBar = Math.round((y.count / maxTrendCount) * 100);
                      const isRecent = idx >= trendData.yearlyStats.length - 3;
                      return (
                        <tr key={y.year} style={isRecent ? { background: "#F0F9FF" } : undefined}>
                          <td style={{ fontWeight: isRecent ? 700 : 400 }}>{y.year}</td>
                          <td style={{ textAlign: "right", fontWeight: 700, color: "#2563EB" }}>{formatPsm(y.medianPsm)}</td>
                          <td style={{ paddingRight: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div className="bar-bg" style={{ flex: 1 }}>
                                <div className="bar-fill" style={{ width: `${pctBar}%` }} />
                              </div>
                            </div>
                          </td>
                          <td style={{ textAlign: "right", color: "#6B7280" }}>{y.count.toLocaleString("fr-FR")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* FOOTER */}
            <div className="footer">
              <span>Estimation fondée sur les prix signés DVF · Source DGFiP 2014–2024 · Usage professionnel uniquement</span>
              <span>ESTIM&apos;74 · Réf. {params.id.slice(0, 8).toUpperCase()} · {today}</span>
            </div>
            <div className="footer-legal">
              Ce document est une estimation et ne constitue pas une expertise officielle au sens du Code civil. Données DVF fournies par la DGFiP (data.gouv.fr). ESTIM&apos;74 est un outil d&apos;aide à la décision.
            </div>
          </div>
        </div>
      </div>

      {!skipPrint && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "#2563EB", color: "#fff", padding: "8px 20px", borderRadius: 99, fontSize: 13, fontFamily: "sans-serif", zIndex: 1000, boxShadow: "0 2px 12px rgba(37,99,235,0.3)", whiteSpace: "nowrap" }}>
          Ouverture de la boîte d&apos;impression…
        </div>
      )}
    </>
  );
}
