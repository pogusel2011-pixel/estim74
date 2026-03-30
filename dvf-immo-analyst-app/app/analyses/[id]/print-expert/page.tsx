import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintTrigger } from "@/components/analysis/print-trigger";
import { getDVFMutations } from "@/lib/dvf/client";
import { loadCsvMutations } from "@/lib/dvf/csv-loader";
import { computePrixM2, removeOutliers } from "@/lib/dvf/outliers";
import { computeDVFStats } from "@/lib/dvf/stats";
import { toComparables } from "@/lib/dvf/comparables";
import { propertyTypeToDvfTypes } from "@/lib/mapping/property-type";
import { markListingOutliers } from "@/lib/listings/outliers";
import { percentile, formatPrice, formatPsm, formatDate, formatDateShort } from "@/lib/utils";
import {
  PROPERTY_TYPE_LABELS,
  CONDITION_LABELS,
  DPE_COLORS,
  CONFIDENCE_COLORS,
} from "@/lib/constants";
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
      const recent3 = yearlyStats.slice(-3);
      const prev3 = yearlyStats.slice(-6, -3);
      const r = recent3.reduce((s, y) => s + y.medianPsm, 0) / 3;
      const p = prev3.reduce((s, y) => s + y.medianPsm, 0) / 3;
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
      const dvfTypes = propertyTypeToDvfTypes(a.propertyType as string);
      const reqRadius = (a.perimeterKm as number) ?? 0.5;
      const monthsBack = (a.dvfPeriodMonths as number) ?? 24;
      const { mutations, source, radiusKm: fr } = await getDVFMutations(
        a.lat as number, a.lng as number, reqRadius, monthsBack, dvfTypes
      );
      requestedRadiusKm = reqRadius;
      perimeterKm = fr;
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
  const dpeColor = a.dpeLetter ? DPE_COLORS[a.dpeLetter as string] ?? "#6b7280" : null;
  const confidenceColor = a.confidenceLabel ? CONFIDENCE_COLORS[a.confidenceLabel as string] ?? "#6b7280" : null;
  const wasExpanded = requestedRadiusKm != null && perimeterKm != null && perimeterKm > requestedRadiusKm;
  const adjustments = (a.adjustments as Adjustment[]) ?? [];
  const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const maxTrendCount = trendData.yearlyStats.length > 0 ? Math.max(...trendData.yearlyStats.map((y) => y.count)) : 1;

  // ── Méthode & Calcul data ────────────────────────────────────────────────────
  const dvfRetenues = dvfStats?.count ?? 0;
  const dvfExclus = dvfStats?.excludedCount ?? 0;
  const dvfBrutes = dvfRetenues + dvfExclus;
  const dvfPsmRef = dvfStats?.weightedAvgPsm ?? dvfStats?.medianPsm ?? 0;
  const marketPressureAdj = dvfStats?.marketPressure?.adjustment ?? 0;
  const dvfAdjPsm = Math.round(dvfPsmRef * (1 + marketPressureAdj));
  const listingAvgPsm = cleanListings.length > 0
    ? cleanListings.reduce((s, l) => s + l.pricePsm, 0) / cleanListings.length : 0;
  const listingAdjPsm = Math.round(listingAvgPsm * 0.96);

  let dvfWeight = 0, listingsWeight = 0;
  if (dvfRetenues >= 5 && cleanListings.length > 0) { dvfWeight = 0.70; listingsWeight = 0.30; }
  else if (dvfRetenues >= 5) { dvfWeight = 1.0; listingsWeight = 0; }
  else if (cleanListings.length >= 3) { dvfWeight = 0; listingsWeight = 1.0; }
  else if (dvfRetenues > 0 && cleanListings.length > 0) { dvfWeight = 0.70; listingsWeight = 0.30; }
  else if (dvfRetenues > 0) { dvfWeight = 1.0; listingsWeight = 0; }

  const basePsm = Math.round(dvfAdjPsm * dvfWeight + listingAdjPsm * listingsWeight);

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
  const trendColor = trendData.trend === "hausse" ? "#16a34a" : trendData.trend === "baisse" ? "#dc2626" : "#6b7280";
  const trendLabel = trendData.trend === "hausse" ? "En hausse" : trendData.trend === "baisse" ? "En baisse" : "Stable";
  const isIndicative = a.confidenceLabel === "Indicative" || ((a.dvfSampleSize as number) != null && (a.dvfSampleSize as number) < 3);
  const retainedComparables = dvfComparables.filter((c) => !c.outlier);

  function pct(factor: number) { return (factor >= 0 ? "+" : "") + (factor * 100).toFixed(1) + "%" }

  return (
    <>
      <PrintTrigger skip={skipPrint} />
      <style suppressHydrationWarning>{`
        @media screen {
          .print-page { background:#f3f4f6; min-height:100vh; display:flex; justify-content:center; padding:24px 16px 48px; }
          .print-sheet { background:#fff; width:210mm; box-shadow:0 4px 32px rgba(0,0,0,0.15); border-radius:4px; font-family:-apple-system,BlinkMacSystemFont,"Inter",sans-serif; font-size:9.5pt; color:#111; line-height:1.5; overflow:hidden; }
        }
        @media print {
          .print-page { background:none; padding:0; }
          .print-sheet { width:100%; box-shadow:none; border-radius:0; font-size:9pt; }
        }
        .cover { background:#1e3a8a; color:#fff; padding:20mm 16mm 18mm; }
        .cover-sub { font-size:7.5pt; color:#bfdbfe; letter-spacing:0.06em; text-transform:uppercase; margin-bottom:6px; }
        .cover-title { font-size:20pt; font-weight:900; letter-spacing:-0.01em; margin:16px 0 10px; }
        .cover-addr { font-size:13pt; font-weight:700; margin-bottom:4px; }
        .cover-meta { font-size:8.5pt; color:#93c5fd; }
        .cover-divider { border:none; border-top:1px solid rgba(255,255,255,0.2); margin:14px 0; }
        .content { padding:14mm 16mm 14mm; }
        .sh2 { font-size:9pt; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#1e40af; margin:0 0 8px; }
        .section { margin-bottom:16px; }
        .divider { border:none; border-top:1px solid #e2e8f0; margin:14px 0; }
        table { width:100%; border-collapse:collapse; font-size:8.5pt; }
        th { background:#f1f5f9; padding:5px 8px; text-align:left; font-weight:600; color:#475569; border-bottom:1px solid #e2e8f0; white-space:nowrap; }
        td { padding:4px 8px; border-bottom:1px solid #f1f5f9; vertical-align:middle; }
        tr:last-child td { border-bottom:none; }
        .grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
        .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .pbox { border:1px solid #e2e8f0; border-radius:6px; padding:8px 12px; }
        .pbox-main { border-color:#93c5fd; background:#eff6ff; }
        .pbox-amber { border-color:#fcd34d; background:#fffbeb; }
        .label { font-size:7.5pt; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px; }
        .val { font-size:14pt; font-weight:700; color:#1e3a8a; }
        .val-amber { color:#92400e; }
        .sub { font-size:8pt; color:#64748b; }
        .stat-row { display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px dotted #e2e8f0; font-size:8.5pt; }
        .stat-row:last-child { border-bottom:none; }
        .stat-row .k { color:#64748b; }
        .stat-row .v { font-weight:600; text-align:right; }
        .badge { display:inline-flex; align-items:center; border:1px solid; border-radius:99px; padding:2px 8px; font-size:7.5pt; font-weight:600; }
        .trend-bar-bg { background:#e2e8f0; border-radius:4px; height:6px; flex:1; overflow:hidden; }
        .trend-bar-fill { height:100%; background:#3b82f6; border-radius:4px; }
        .footer { margin-top:16px; padding-top:10px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; font-size:7pt; color:#94a3b8; }
        .section-letter { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; border-radius:50%; background:#1e40af; color:#fff; font-size:7.5pt; font-weight:800; margin-right:6px; }
        .green-row td { background:#f0fdf4; }
        .orange-row td { background:#fff7ed; }
        .blue-row td { background:#eff6ff; }
        .gray-row td { background:#f8fafc; }
        .pipeline-table td { padding:5px 8px; }
      `}</style>

      <div className="print-page">
        <div className="print-sheet">

          {/* ── COVER ── */}
          <div className="cover">
            <div className="cover-sub">ESTIM&apos;74 — Haute-Savoie (74) · Données DVF DGFiP 2014–2024</div>
            <hr className="cover-divider" />
            <div className="cover-title">RAPPORT D&apos;EXPERTISE</div>
            <div className="cover-addr">
              {[a.address, a.postalCode, a.city].filter(Boolean).join(", ") || "Adresse non renseignée"}
            </div>
            <div className="cover-meta" style={{ marginTop: 6, display: "flex", gap: "20px", flexWrap: "wrap" }}>
              <span>{propertyLabel}</span>
              <span>{a.surface as number} m²</span>
              {a.rooms && <span>{a.rooms as number} pièces</span>}
              {a.yearBuilt && <span>Construit en {a.yearBuilt as number}</span>}
              {conditionLabel && <span>{conditionLabel}</span>}
            </div>
            <hr className="cover-divider" />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div>
                <div style={{ fontSize: "8pt", color: "#bfdbfe", marginBottom: 2 }}>Généré le</div>
                <div style={{ fontSize: "10pt", fontWeight: 700 }}>{today}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "8pt", color: "#bfdbfe", marginBottom: 2 }}>Référence</div>
                <div style={{ fontFamily: "monospace", fontSize: "9pt" }}>{params.id.slice(0, 8).toUpperCase()}</div>
              </div>
            </div>
            {/* Features badges */}
            <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {a.dpeLetter && (
                <span className="badge" style={{ borderColor: dpeColor! + "80", color: "#fff", background: "rgba(255,255,255,0.1)" }}>
                  DPE {a.dpeLetter as string}
                </span>
              )}
              {a.hasParking && <span className="badge" style={{ borderColor: "rgba(255,255,255,0.3)", color: "#bfdbfe" }}>Parking</span>}
              {a.hasGarage && <span className="badge" style={{ borderColor: "rgba(255,255,255,0.3)", color: "#bfdbfe" }}>Garage</span>}
              {a.hasBalcony && <span className="badge" style={{ borderColor: "rgba(255,255,255,0.3)", color: "#bfdbfe" }}>Balcon</span>}
              {a.hasTerrace && <span className="badge" style={{ borderColor: "rgba(255,255,255,0.3)", color: "#bfdbfe" }}>Terrasse</span>}
              {a.hasPool && <span className="badge" style={{ borderColor: "rgba(255,255,255,0.3)", color: "#bfdbfe" }}>Piscine</span>}
              {a.hasElevator && <span className="badge" style={{ borderColor: "rgba(255,255,255,0.3)", color: "#bfdbfe" }}>Ascenseur</span>}
            </div>
          </div>

          <div className="content">

            {/* ── 1. ESTIMATION ── */}
            <div className="section">
              <div className="sh2">1. Estimation de valeur</div>
              {a.valuationMid ? (
                <>
                  {isIndicative && (
                    <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 6, padding: "6px 10px", fontSize: "8pt", color: "#92400e", marginBottom: 10 }}>
                      <strong>Estimation indicative</strong> — données DVF limitées ({a.dvfSampleSize as number ?? 0} transaction{(a.dvfSampleSize as number ?? 0) !== 1 ? "s" : ""}). Recoupez avec d&apos;autres sources.
                    </div>
                  )}
                  <div className="grid3" style={{ marginBottom: 10 }}>
                    <div className="pbox">
                      <div className="label">Basse</div>
                      <div style={{ fontSize: "11pt", fontWeight: 700, color: "#374151" }}>{formatPrice(a.valuationLow as number)}</div>
                    </div>
                    <div className={`pbox ${isIndicative ? "pbox-amber" : "pbox-main"}`}>
                      <div className="label" style={{ color: isIndicative ? "#92400e" : "#1e40af" }}>Estimation centrale</div>
                      <div className={`val ${isIndicative ? "val-amber" : ""}`}>{formatPrice(a.valuationMid as number)}</div>
                      {a.valuationPsm && <div className="sub">{formatPsm(a.valuationPsm as number)}</div>}
                    </div>
                    <div className="pbox">
                      <div className="label">Haute</div>
                      <div style={{ fontSize: "11pt", fontWeight: 700, color: "#374151" }}>{formatPrice(a.valuationHigh as number)}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {a.confidence != null && a.confidenceLabel && (
                      <span className="badge" style={{ borderColor: confidenceColor!, color: confidenceColor!, background: confidenceColor! + "18" }}>
                        Fiabilité : {a.confidenceLabel as string} · Score {Math.round((a.confidence as number) * 100)}/100
                      </span>
                    )}
                    {perimeterKm && (
                      <span className="badge" style={{ borderColor: "#94a3b8", color: "#475569" }}>
                        {wasExpanded ? `Rayon élargi ${perimeterKm} km` : `Rayon ${perimeterKm} km`}
                      </span>
                    )}
                    {a.dvfSampleSize != null && (
                      <span className="badge" style={{ borderColor: "#94a3b8", color: "#475569" }}>
                        {a.dvfSampleSize as number} transactions DVF retenues
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <p style={{ color: "#64748b", fontSize: "8.5pt" }}>Estimation non disponible — données DVF insuffisantes.</p>
              )}
            </div>

            <hr className="divider" />

            {/* ── 2. AJUSTEMENTS QUALITATIFS ── */}
            <div className="section">
              <div className="sh2">2. Ajustements qualitatifs (grille Estim74)</div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "30%" }}>Critère</th>
                    <th style={{ width: "12%", textAlign: "center" }}>Présent</th>
                    <th style={{ textAlign: "right" }}>Facteur</th>
                    <th style={{ textAlign: "right" }}>Impact €/m²</th>
                    <th style={{ textAlign: "right" }}>Impact total</th>
                  </tr>
                </thead>
                <tbody>
                  {adjRows.map(({ critere, adj }) => {
                    const impactPsm = adj ? Math.round(adj.factor * basePsm) : 0;
                    const impactTotal = adj ? Math.round(adj.factor * basePsm * (a.surface as number)) : 0;
                    const color = adj && adj.factor > 0 ? "#16a34a" : adj && adj.factor < 0 ? "#dc2626" : "#94a3b8";
                    return (
                      <tr key={critere}>
                        <td style={{ fontWeight: adj ? 600 : 400, color: adj ? "#111" : "#94a3b8" }}>{critere}</td>
                        <td style={{ textAlign: "center", fontSize: "10pt" }}>{adj ? "✓" : "—"}</td>
                        <td style={{ textAlign: "right", color, fontWeight: 600 }}>{adj ? pct(adj.factor) : "—"}</td>
                        <td style={{ textAlign: "right", color, fontWeight: adj ? 600 : 400 }}>{adj ? (impactPsm >= 0 ? "+" : "") + impactPsm.toLocaleString("fr-FR") + " €" : "—"}</td>
                        <td style={{ textAlign: "right", color, fontWeight: adj ? 600 : 400 }}>{adj ? (impactTotal >= 0 ? "+" : "") + impactTotal.toLocaleString("fr-FR") + " €" : "—"}</td>
                      </tr>
                    );
                  })}
                  {adjustments.length > 0 && (
                    <tr className="gray-row">
                      <td colSpan={2} style={{ fontWeight: 700 }}>Total ajustements</td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: totalAdjFactor >= 0 ? "#16a34a" : "#dc2626" }}>{pct(totalAdjFactor)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: totalAdjFactor >= 0 ? "#16a34a" : "#dc2626" }}>
                        {(totalAdjFactor >= 0 ? "+" : "") + Math.round(totalAdjFactor * basePsm).toLocaleString("fr-FR")} €/m²
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: totalAdjFactor >= 0 ? "#16a34a" : "#dc2626" }}>
                        {(totalAdjFactor >= 0 ? "+" : "") + Math.round(totalAdjFactor * basePsm * (a.surface as number)).toLocaleString("fr-FR")} €
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div style={{ fontSize: "7.5pt", color: "#94a3b8", marginTop: 4 }}>
                Base de calcul : {formatPsm(basePsm)} · Surface : {a.surface as number} m²
              </div>
            </div>

            <hr className="divider" />

            {/* ── 3. MÉTHODE & CALCUL ── */}
            <div className="section">
              <div className="sh2">3. Méthode &amp; Calcul</div>

              {/* Section A — DVF */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 6, fontWeight: 700, fontSize: "8.5pt" }}>
                  <span className="section-letter">A</span> Données DVF (transactions signées)
                </div>
                <table className="pipeline-table">
                  <thead>
                    <tr><th>Étape</th><th style={{ textAlign: "right" }}>Transactions</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>Mutations dans le périmètre ({perimeterKm ?? "?"} km)</td><td style={{ textAlign: "right", fontWeight: 600 }}>{dvfBrutes}</td></tr>
                    <tr className="orange-row">
                      <td>⚠ Valeurs aberrantes exclues (IQR×2 + médiane ±40%)</td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: "#c2410c" }}>{dvfExclus > 0 ? `−\u202F${dvfExclus}` : "0"}</td>
                    </tr>
                    <tr className="green-row">
                      <td style={{ fontWeight: 700, color: "#15803d" }}>✓ Transactions retenues</td>
                      <td style={{ textAlign: "right", fontWeight: 800, color: "#15803d" }}>{dvfRetenues}</td>
                    </tr>
                  </tbody>
                </table>
                {dvfStats?.isIndexed && (
                  <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 4, padding: "4px 8px", fontSize: "7.5pt", color: "#15803d", marginTop: 4 }}>
                    Tous les prix sont indexés en valeur 2025 (indices notariaux Haute-Savoie).
                  </div>
                )}
                <div className="stat-row" style={{ marginTop: 6 }}>
                  <span className="k">Médiane DVF (indexée 2025)</span>
                  <span className="v">{dvfStats ? formatPsm(dvfStats.medianPsm) : "—"}</span>
                </div>
                {dvfStats?.weightedAvgPsm != null && (
                  <div className="stat-row">
                    <span className="k">Moy. pondérée retenue (distance × surface × récence)</span>
                    <span className="v" style={{ color: "#1e40af" }}>{formatPsm(dvfStats.weightedAvgPsm)}</span>
                  </div>
                )}
                {marketPressureAdj !== 0 && (
                  <div className="stat-row">
                    <span className="k">Pression marché ({pct(marketPressureAdj)})</span>
                    <span className="v">{formatPsm(dvfAdjPsm)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#1e40af", marginTop: 4, padding: "4px 0", borderTop: "1px solid #bfdbfe" }}>
                  <span>Prix DVF retenu</span>
                  <span>{formatPsm(dvfAdjPsm)}</span>
                </div>
              </div>

              {/* Section B — Annonces */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 6, fontWeight: 700, fontSize: "8.5pt" }}>
                  <span className="section-letter">B</span> Annonces actives (marché affiché)
                </div>
                {listings.length === 0 ? (
                  <p style={{ color: "#94a3b8", fontSize: "8pt", fontStyle: "italic" }}>Aucune annonce active trouvée.</p>
                ) : (
                  <>
                    <table className="pipeline-table">
                      <thead>
                        <tr><th>Étape</th><th style={{ textAlign: "right" }}>Annonces</th></tr>
                      </thead>
                      <tbody>
                        <tr><td>Annonces trouvées</td><td style={{ textAlign: "right", fontWeight: 600 }}>{listings.length}</td></tr>
                        <tr className="orange-row">
                          <td>⚠ Valeurs aberrantes exclues (IQR×2 + médiane ±40%)</td>
                          <td style={{ textAlign: "right", fontWeight: 600, color: "#c2410c" }}>{listings.filter(l => l.outlier).length > 0 ? `−\u202F${listings.filter(l => l.outlier).length}` : "0"}</td>
                        </tr>
                        <tr className="green-row">
                          <td style={{ fontWeight: 700, color: "#15803d" }}>✓ Annonces retenues</td>
                          <td style={{ textAlign: "right", fontWeight: 800, color: "#15803d" }}>{cleanListings.length}</td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="stat-row" style={{ marginTop: 6 }}>
                      <span className="k">Prix affiché moyen (annonces retenues)</span>
                      <span className="v">{listingAvgPsm > 0 ? formatPsm(Math.round(listingAvgPsm)) : "—"}</span>
                    </div>
                    <div className="stat-row">
                      <span className="k">Abattement vendeur −4% (négociation)</span>
                      <span className="v">{listingAdjPsm > 0 ? formatPsm(listingAdjPsm) : "—"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#1e40af", marginTop: 4, padding: "4px 0", borderTop: "1px solid #bfdbfe" }}>
                      <span>Prix annonces retenu</span>
                      <span>{listingAdjPsm > 0 ? formatPsm(listingAdjPsm) : "—"}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Section C — Réconciliation */}
              <div>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 6, fontWeight: 700, fontSize: "8.5pt" }}>
                  <span className="section-letter">C</span> Réconciliation finale
                </div>
                <table>
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
                    <tr className="blue-row">
                      <td colSpan={3} style={{ fontWeight: 700, color: "#1e40af" }}>Prix de base (avant ajustements)</td>
                      <td style={{ textAlign: "right", fontWeight: 800, color: "#1e40af" }}>{formatPsm(basePsm)}</td>
                    </tr>
                    {totalAdjFactor !== 0 && (
                      <tr>
                        <td colSpan={3} style={{ color: "#64748b" }}>Ajustements qualitatifs ({pct(totalAdjFactor)})</td>
                        <td style={{ textAlign: "right", fontWeight: 600, color: totalAdjFactor >= 0 ? "#16a34a" : "#dc2626" }}>
                          {(totalAdjFactor >= 0 ? "+" : "") + Math.round(totalAdjFactor * basePsm).toLocaleString("fr-FR")} €/m²
                        </td>
                      </tr>
                    )}
                    <tr style={{ background: "#1e3a8a" }}>
                      <td colSpan={3} style={{ fontWeight: 800, color: "#fff" }}>
                        Prix final · {a.surface as number} m² = {formatPrice(a.valuationMid as number)}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 800, color: "#fff", fontSize: "10pt" }}>
                        {a.valuationPsm ? formatPsm(a.valuationPsm as number) : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <hr className="divider" />

            {/* ── 4. COMPARABLES DVF ── */}
            <div className="section">
              <div className="sh2">4. Transactions DVF comparables retenues ({retainedComparables.length})</div>
              {retainedComparables.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Date</th>
                      <th>Dist.</th>
                      <th>Type</th>
                      <th style={{ textAlign: "right" }}>Surface</th>
                      <th style={{ textAlign: "right" }}>Pièces</th>
                      <th style={{ textAlign: "right" }}>Prix DVF</th>
                      <th style={{ textAlign: "right" }}>€/m²</th>
                      <th style={{ textAlign: "right" }}>€/m² idx2025</th>
                      <th>Adresse</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retainedComparables.map((c, i) => (
                      <tr key={`${c.id ?? "c"}-${i}`} style={c.topComparable ? { background: "#eff6ff" } : undefined}>
                        <td>
                          {c.topComparable && (
                            <span style={{ display: "inline-block", background: "#dbeafe", color: "#1d4ed8", border: "1px solid #60a5fa", borderRadius: 99, padding: "1px 5px", fontSize: "6.5pt", fontWeight: 700 }}>★</span>
                          )}
                        </td>
                        <td style={{ color: "#64748b", whiteSpace: "nowrap" }}>{formatDateShort(c.date)}</td>
                        <td style={{ whiteSpace: "nowrap", color: "#64748b" }}>{c.distanceM != null ? Math.round(c.distanceM) + " m" : "—"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{c.type}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{c.surface} m²</td>
                        <td style={{ textAlign: "right", color: "#64748b" }}>{c.rooms ?? "—"}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{formatPrice(c.price, true)}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: "#475569" }}>{formatPsm(c.pricePsm)}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: "#1e40af" }}>
                          {c.indexedPricePsm ? formatPsm(c.indexedPricePsm) : "—"}
                        </td>
                        <td style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#64748b", fontSize: "7.5pt" }}>
                          {c.address || c.city}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: "#64748b", fontSize: "8.5pt" }}>Aucun comparable DVF disponible.</p>
              )}
              {dvfComparables.filter(c => c.outlier).length > 0 && (
                <p style={{ fontSize: "7.5pt", color: "#94a3b8", marginTop: 4 }}>
                  {dvfComparables.filter(c => c.outlier).length} transaction{dvfComparables.filter(c => c.outlier).length > 1 ? "s" : ""} exclue{dvfComparables.filter(c => c.outlier).length > 1 ? "s" : ""} (valeur aberrante).
                </p>
              )}
            </div>

            <hr className="divider" />

            {/* ── 5. ANNONCES ACTIVES ── */}
            {listings.length > 0 && (
              <div className="section">
                <div className="sh2">5. Annonces actives ({cleanListings.length} retenues / {listings.filter(l => l.outlier).length} exclues)</div>
                <table>
                  <thead>
                    <tr>
                      <th>Titre</th>
                      <th>Ville</th>
                      <th style={{ textAlign: "right" }}>Surface</th>
                      <th style={{ textAlign: "right" }}>Pièces</th>
                      <th style={{ textAlign: "right" }}>Prix affiché</th>
                      <th style={{ textAlign: "right" }}>€/m²</th>
                      <th>Dist.</th>
                      <th style={{ textAlign: "center" }}>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listings.map((l, i) => (
                      <tr key={`${l.id ?? "l"}-${i}`} style={l.outlier ? { background: "#fff7ed" } : { background: "#f0fdf4" }}>
                        <td style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "7.5pt" }}>{l.title}</td>
                        <td style={{ whiteSpace: "nowrap", color: "#64748b", fontSize: "7.5pt" }}>{l.city}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{l.surface} m²</td>
                        <td style={{ textAlign: "right", color: "#64748b" }}>{l.rooms ?? "—"}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{formatPrice(l.price, true)}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: l.outlier ? "#c2410c" : "#1e40af" }}>{formatPsm(l.pricePsm)}</td>
                        <td style={{ whiteSpace: "nowrap", color: "#64748b", fontSize: "7.5pt" }}>
                          {l.distance ? (l.distance >= 1000 ? (l.distance / 1000).toFixed(1) + " km" : Math.round(l.distance) + " m") : "—"}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {l.outlier ? (
                            <span style={{ background: "#ffedd5", color: "#c2410c", border: "1px solid #fbbf24", borderRadius: 99, padding: "1px 6px", fontSize: "6.5pt", fontWeight: 700 }}>
                              {l.outlierReason === "iqr" ? "Exclu IQR" : "Exclu médiane"}
                            </span>
                          ) : (
                            <span style={{ background: "#dcfce7", color: "#15803d", border: "1px solid #86efac", borderRadius: 99, padding: "1px 6px", fontSize: "6.5pt", fontWeight: 700 }}>
                              Retenu
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {listings.length > 0 && <hr className="divider" />}

            {/* ── 6. MARCHÉ LOCAL ── */}
            {trendData.yearlyStats.length > 0 && (
              <div className="section">
                <div className="sh2">6. Évolution du marché local{dvfTypeForChart ? ` — ${dvfTypeForChart}s` : ""}</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
                  {trendData.trend && (
                    <span className="badge" style={{ borderColor: trendColor, color: trendColor, background: trendColor + "18" }}>
                      {trendLabel}{trendData.trendPct != null && ` · ${trendData.trendPct > 0 ? "+" : ""}${trendData.trendPct}% sur 6 ans`}
                    </span>
                  )}
                  <span style={{ fontSize: "7.5pt", color: "#94a3b8" }}>
                    Rayon {Math.max(perimeterKm ?? 2, 2)} km · {trendData.yearlyStats.reduce((s, y) => s + y.count, 0).toLocaleString("fr-FR")} transactions au total
                  </span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Année</th>
                      <th style={{ textAlign: "right" }}>Médiane €/m²</th>
                      <th style={{ width: "40%" }}>Volume</th>
                      <th style={{ textAlign: "right" }}>Transactions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendData.yearlyStats.map((y) => {
                      const pctBar = Math.round((y.count / maxTrendCount) * 100);
                      const isLast3 = trendData.yearlyStats.indexOf(y) >= trendData.yearlyStats.length - 3;
                      return (
                        <tr key={y.year} style={isLast3 ? { background: "#f0f9ff" } : undefined}>
                          <td style={{ fontWeight: isLast3 ? 700 : 400 }}>{y.year}</td>
                          <td style={{ textAlign: "right", fontWeight: 700, color: "#1e40af" }}>{formatPsm(y.medianPsm)}</td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div className="trend-bar-bg">
                                <div className="trend-bar-fill" style={{ width: `${pctBar}%` }} />
                              </div>
                            </div>
                          </td>
                          <td style={{ textAlign: "right", color: "#64748b" }}>{y.count.toLocaleString("fr-FR")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── FOOTER ── */}
            <div className="footer">
              <span>Estimation fondée sur les prix signés DVF · Source DGFiP 2014–2024 · Usage professionnel uniquement</span>
              <span>ESTIM&apos;74 · Réf. {params.id.slice(0, 8).toUpperCase()} · {today}</span>
            </div>
            <div style={{ marginTop: 4, fontSize: "6.5pt", color: "#cbd5e1", textAlign: "center" }}>
              Ce document est une estimation et ne constitue pas une expertise officielle au sens du Code civil. Les données DVF sont fournies par la DGFiP (data.gouv.fr). ESTIM&apos;74 est un outil d&apos;aide à la décision.
            </div>

          </div>
        </div>
      </div>

      {!skipPrint && <div className="screen-hint" style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "#1e40af", color: "#fff", padding: "8px 20px", borderRadius: 99, fontSize: 13, fontFamily: "sans-serif", zIndex: 1000, whiteSpace: "nowrap", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>Ouverture de la boîte d&apos;impression…</div>}
    </>
  );
}
