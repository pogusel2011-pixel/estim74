import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintTrigger } from "@/components/analysis/print-trigger";
import { getDVFMutations } from "@/lib/dvf/client";
import { loadCsvMutations } from "@/lib/dvf/csv-loader";
import { computePrixM2, removeOutliers } from "@/lib/dvf/outliers";
import { computeDVFStats } from "@/lib/dvf/stats";
import { toComparables } from "@/lib/dvf/comparables";
import { propertyTypeToDvfTypes } from "@/lib/mapping/property-type";
import { percentile, formatPrice, formatPsm, formatDate, formatDateShort } from "@/lib/utils";
import { PROPERTY_TYPE_LABELS, CONDITION_LABELS, DPE_COLORS, CONFIDENCE_COLORS } from "@/lib/constants";
import { DVFStats, DVFComparable } from "@/types/dvf";
import { Adjustment } from "@/types/valuation";

export const dynamic = "force-dynamic";

interface YearlyStat {
  year: number;
  medianPsm: number;
  count: number;
}

interface TrendResult {
  yearlyStats: YearlyStat[];
  trend: "hausse" | "baisse" | "stable" | null;
  trendPct: number | null;
}

async function getTrendData(lat: number, lng: number, radiusKm: number, type?: string): Promise<TrendResult> {
  try {
    const types = type ? [type] : undefined;
    const rawMutations = await loadCsvMutations(lat, lng, Math.max(radiusKm, 3), 130, types);
    const mutations = computePrixM2(rawMutations).filter(m => m.prix_m2 != null && m.prix_m2 > 0);

    const byYear = new Map<number, number[]>();
    for (const m of mutations) {
      const year = new Date(m.date_mutation).getFullYear();
      if (year >= 2014 && year <= new Date().getFullYear()) {
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year)!.push(m.prix_m2!);
      }
    }

    const yearlyStats = Array.from(byYear.entries())
      .map(([year, psms]) => ({
        year,
        medianPsm: Math.round(percentile(psms, 50)),
        count: psms.length,
      }))
      .sort((a, b) => a.year - b.year);

    let trend: "hausse" | "baisse" | "stable" = "stable";
    let trendPct: number | null = null;
    if (yearlyStats.length >= 6) {
      const recent3 = yearlyStats.slice(-3);
      const prev3 = yearlyStats.slice(-6, -3);
      const recentMedian = recent3.reduce((s, y) => s + y.medianPsm, 0) / 3;
      const prevMedian = prev3.reduce((s, y) => s + y.medianPsm, 0) / 3;
      trendPct = Math.round(((recentMedian - prevMedian) / prevMedian) * 100 * 10) / 10;
      trend = trendPct > 3 ? "hausse" : trendPct < -3 ? "baisse" : "stable";
    }

    return { yearlyStats, trend, trendPct };
  } catch {
    return { yearlyStats: [], trend: null, trendPct: null };
  }
}

export default async function PrintPage({ params }: { params: { id: string } }) {
  const analysis = await prisma.analysis.findUnique({ where: { id: params.id } });
  if (!analysis) notFound();

  const a = JSON.parse(JSON.stringify(analysis)) as Record<string, unknown>;

  // DVF data (reuse saved or fetch live)
  let dvfStats: DVFStats | null = (a.dvfStats as DVFStats) ?? null;
  let dvfComparables: DVFComparable[] = (a.dvfComparables as DVFComparable[]) ?? [];
  let perimeterKm: number | null = (a.perimeterKm as number) ?? null;
  let requestedRadiusKm: number | null = (a.requestedRadiusKm as number) ?? null;

  if (!dvfStats && a.lat && a.lng) {
    try {
      const dvfTypes = propertyTypeToDvfTypes(a.propertyType as string);
      const reqRadius = (a.perimeterKm as number) ?? 0.5;
      const monthsBack = (a.dvfPeriodMonths as number) ?? 24;
      const { mutations, source, radiusKm: finalRadius } = await getDVFMutations(
        a.lat as number, a.lng as number, reqRadius, monthsBack, dvfTypes
      );
      requestedRadiusKm = reqRadius;
      perimeterKm = finalRadius;
      let enriched = computePrixM2(mutations);
      enriched = removeOutliers(enriched);
      dvfStats = computeDVFStats(enriched);
      if (dvfStats) dvfStats.source = source;
      dvfComparables = toComparables(enriched, a.surface as number);
    } catch { /* no DVF data */ }
  }

  // Trend data
  const dvfTypeForChart = a.propertyType === "APARTMENT" ? "Appartement"
    : a.propertyType === "HOUSE" ? "Maison"
    : a.propertyType === "LAND" ? "Terrain"
    : undefined;

  const trendData = (a.lat && a.lng)
    ? await getTrendData(a.lat as number, a.lng as number, Math.max(perimeterKm ?? 2, 2), dvfTypeForChart)
    : { yearlyStats: [], trend: null, trendPct: null };

  // Helpers
  const propertyLabel = PROPERTY_TYPE_LABELS[a.propertyType as string] ?? (a.propertyType as string);
  const conditionLabel = a.condition ? CONDITION_LABELS[a.condition as string] : null;
  const dpeColor = a.dpeLetter ? DPE_COLORS[a.dpeLetter as string] ?? "#6b7280" : null;
  const confidenceColor = a.confidenceLabel ? CONFIDENCE_COLORS[a.confidenceLabel as string] ?? "#6b7280" : null;
  const wasExpanded = requestedRadiusKm != null && perimeterKm != null && perimeterKm > requestedRadiusKm;
  const isIndicative = a.confidenceLabel === "Indicative" || ((a.dvfSampleSize as number) != null && (a.dvfSampleSize as number) < 3 && a.valuationMid);
  const adjustments = (a.adjustments as Adjustment[]) ?? [];
  const trendLabel = trendData.trend === "hausse" ? "En hausse" : trendData.trend === "baisse" ? "En baisse" : "Stable";
  const trendColor = trendData.trend === "hausse" ? "#16a34a" : trendData.trend === "baisse" ? "#dc2626" : "#6b7280";
  const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const maxTrendCount = trendData.yearlyStats.length > 0 ? Math.max(...trendData.yearlyStats.map(y => y.count)) : 1;

  return (
    <>
      <PrintTrigger />

      {/* Embedded print + screen styles */}
      <style suppressHydrationWarning>{`
        @media screen {
          .print-page {
            background: #f3f4f6;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            padding: 24px 16px 48px;
            box-sizing: border-box;
          }
          .print-sheet {
            background: #fff;
            width: 210mm;
            min-height: 297mm;
            box-shadow: 0 4px 32px rgba(0,0,0,0.15);
            border-radius: 4px;
            padding: 16mm 16mm 14mm;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
            font-size: 10pt;
            color: #111;
            line-height: 1.5;
          }
          .screen-hint {
            position: fixed;
            top: 16px;
            left: 50%;
            transform: translateX(-50%);
            background: #1e40af;
            color: #fff;
            padding: 8px 20px;
            border-radius: 99px;
            font-size: 13px;
            font-family: -apple-system, sans-serif;
            z-index: 1000;
            white-space: nowrap;
            box-shadow: 0 2px 12px rgba(0,0,0,0.2);
          }
        }
        @media print {
          .screen-hint { display: none !important; }
          .print-page {
            background: none;
            padding: 0;
            min-height: unset;
          }
          .print-sheet {
            width: 100%;
            min-height: unset;
            box-shadow: none;
            border-radius: 0;
            padding: 12mm 14mm 10mm;
            font-size: 9pt;
          }
          section { page-break-inside: avoid; }
          .no-break { page-break-inside: avoid; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; }
        }

        /* Shared styles */
        .print-sheet h1 { font-size: 14pt; font-weight: 700; margin: 0 0 2px; }
        .print-sheet h2 { font-size: 10pt; font-weight: 700; margin: 0 0 8px; letter-spacing: 0.02em; text-transform: uppercase; color: #1e40af; }
        .print-sheet p { margin: 0; }
        .print-sheet table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
        .print-sheet th { background: #f1f5f9; padding: 5px 8px; text-align: left; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
        .print-sheet td { padding: 4px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        .print-sheet tr:last-child td { border-bottom: none; }
        .print-sheet .divider { border: none; border-top: 1px solid #e2e8f0; margin: 12px 0; }
        .print-sheet .section { margin-bottom: 14px; }
        .print-sheet .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .print-sheet .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .print-sheet .price-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; }
        .print-sheet .price-box.main { border-color: #93c5fd; background: #eff6ff; }
        .print-sheet .price-box.amber { border-color: #fcd34d; background: #fffbeb; }
        .print-sheet .label { font-size: 7.5pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
        .print-sheet .val { font-size: 14pt; font-weight: 700; color: #1e3a8a; }
        .print-sheet .val.amber { color: #92400e; }
        .print-sheet .sub { font-size: 8pt; color: #64748b; }
        .print-sheet .stat-row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dotted #e2e8f0; font-size: 8.5pt; }
        .print-sheet .stat-row:last-child { border-bottom: none; }
        .print-sheet .stat-row .k { color: #64748b; }
        .print-sheet .stat-row .v { font-weight: 600; text-align: right; }
        .print-sheet .badge { display: inline-flex; align-items: center; gap: 4px; border: 1px solid; border-radius: 99px; padding: 2px 8px; font-size: 7.5pt; font-weight: 600; }
        .print-sheet .trend-bar-bg { background: #e2e8f0; border-radius: 4px; height: 6px; flex: 1; overflow: hidden; }
        .print-sheet .trend-bar-fill { height: 100%; background: #3b82f6; border-radius: 4px; }
        .print-sheet .footer { margin-top: 16px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 7.5pt; color: #94a3b8; }
      `}</style>

      <div className="print-page">
        <div className="print-sheet">

          {/* ── REPORT HEADER ── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: "8pt", color: "#3b82f6", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
                ESTIM&apos;74 — Haute-Savoie (74)
              </div>
              <div style={{ fontSize: "7.5pt", color: "#94a3b8" }}>Rapport d'estimation immobilière</div>
            </div>
            <div style={{ textAlign: "right", fontSize: "7.5pt", color: "#94a3b8" }}>
              <div>Données DVF 2014–2024 · DGFiP</div>
              <div>Généré le {today}</div>
            </div>
          </div>

          <hr className="divider" />

          {/* ── 1. PROPERTY HEADER ── */}
          <div className="section no-break">
            <h2>Bien immobilier</h2>
            <h1>{[a.address, a.postalCode, a.city].filter(Boolean).join(", ") || "Adresse non renseignée"}</h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", marginTop: 6, fontSize: "8.5pt", color: "#475569" }}>
              <span><strong style={{ color: "#111" }}>Type</strong> : {propertyLabel}</span>
              <span><strong style={{ color: "#111" }}>Surface</strong> : {a.surface as number} m²</span>
              {a.rooms && <span><strong style={{ color: "#111" }}>Pièces</strong> : {a.rooms as number}</span>}
              {a.bedrooms && <span><strong style={{ color: "#111" }}>Chambres</strong> : {a.bedrooms as number}</span>}
              {a.floor != null && <span><strong style={{ color: "#111" }}>Étage</strong> : {a.floor as number}{a.totalFloors ? `/${a.totalFloors}` : ""}</span>}
              {a.yearBuilt && <span><strong style={{ color: "#111" }}>Construction</strong> : {a.yearBuilt as number}</span>}
              {conditionLabel && <span><strong style={{ color: "#111" }}>État</strong> : {conditionLabel}</span>}
              <span><strong style={{ color: "#111" }}>Date</strong> : {formatDate(a.createdAt as string)}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {a.dpeLetter && (
                <span className="badge" style={{ borderColor: dpeColor!, color: dpeColor!, backgroundColor: dpeColor! + "18" }}>
                  DPE {a.dpeLetter as string}
                </span>
              )}
              {a.hasParking && <span className="badge" style={{ borderColor: "#94a3b8", color: "#475569" }}>Parking</span>}
              {a.hasGarage && <span className="badge" style={{ borderColor: "#94a3b8", color: "#475569" }}>Garage</span>}
              {a.hasBalcony && <span className="badge" style={{ borderColor: "#94a3b8", color: "#475569" }}>Balcon</span>}
              {a.hasTerrace && <span className="badge" style={{ borderColor: "#94a3b8", color: "#475569" }}>Terrasse</span>}
              {a.hasPool && <span className="badge" style={{ borderColor: "#94a3b8", color: "#475569" }}>Piscine</span>}
              {a.hasElevator && <span className="badge" style={{ borderColor: "#94a3b8", color: "#475569" }}>Ascenseur</span>}
            </div>
          </div>

          <hr className="divider" />

          {/* ── 2. ESTIMATION BLOCK ── */}
          <div className="section no-break">
            <h2>Estimation de valeur</h2>
            {a.valuationMid ? (
              <>
                {isIndicative && (
                  <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 6, padding: "6px 10px", fontSize: "8pt", color: "#92400e", marginBottom: 10 }}>
                    <strong>Estimation indicative</strong> — données DVF limitées ({a.dvfSampleSize as number ?? 0} transaction{(a.dvfSampleSize as number ?? 0) !== 1 ? "s" : ""}
                    {perimeterKm ? ` dans un rayon de ${perimeterKm} km` : ""}). Recoupez avec d'autres sources.
                  </div>
                )}
                <div className="grid3" style={{ marginBottom: 10 }}>
                  <div className="price-box">
                    <div className="label">Basse</div>
                    <div style={{ fontSize: "11pt", fontWeight: 700, color: "#374151" }}>{formatPrice(a.valuationLow as number)}</div>
                  </div>
                  <div className={`price-box ${isIndicative ? "amber" : "main"}`}>
                    <div className="label" style={{ color: isIndicative ? "#92400e" : "#1e40af" }}>Estimation centrale</div>
                    <div className={`val ${isIndicative ? "amber" : ""}`}>{formatPrice(a.valuationMid as number)}</div>
                    {a.valuationPsm && <div className="sub">{formatPsm(a.valuationPsm as number)}</div>}
                  </div>
                  <div className="price-box">
                    <div className="label">Haute</div>
                    <div style={{ fontSize: "11pt", fontWeight: 700, color: "#374151" }}>{formatPrice(a.valuationHigh as number)}</div>
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  {a.confidence != null && a.confidenceLabel && (
                    <span className="badge" style={{ borderColor: confidenceColor!, color: confidenceColor!, backgroundColor: confidenceColor! + "18" }}>
                      Fiabilité : {a.confidenceLabel as string} ({Math.round((a.confidence as number) * 100)}%)
                    </span>
                  )}
                  {perimeterKm && (
                    <span className="badge" style={{ borderColor: "#94a3b8", color: "#475569" }}>
                      {wasExpanded ? `Rayon élargi à ${perimeterKm} km` : `Rayon : ${perimeterKm} km`}
                    </span>
                  )}
                  {a.dvfSampleSize != null && (
                    <span className="badge" style={{ borderColor: "#94a3b8", color: "#475569" }}>
                      {a.dvfSampleSize as number} transaction{(a.dvfSampleSize as number) !== 1 ? "s" : ""} DVF
                    </span>
                  )}
                </div>

                {adjustments.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: "8pt", color: "#64748b" }}>
                    <span style={{ fontWeight: 600, marginRight: 6 }}>Ajustements :</span>
                    {adjustments.map((adj, i) => (
                      <span key={i} style={{ marginRight: 8 }}>
                        {adj.label} <span style={{ color: adj.factor > 0 ? "#16a34a" : adj.factor < 0 ? "#dc2626" : "#6b7280", fontWeight: 600 }}>
                          {adj.factor > 0 ? "+" : ""}{(adj.factor * 100).toFixed(0)}%
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p style={{ color: "#64748b", fontSize: "8.5pt" }}>Estimation non disponible — données DVF insuffisantes dans ce secteur.</p>
            )}
          </div>

          <hr className="divider" />

          {/* ── 3. DVF STATS TABLE ── */}
          <div className="section no-break">
            <h2>Statistiques DVF locales</h2>
            {dvfStats ? (
              <div className="grid2">
                <div>
                  {[
                    { k: "Transactions analysées", v: String(a.dvfSampleSize ?? dvfStats.count) },
                    { k: "Prix médian /m²", v: formatPsm(dvfStats.medianPsm) },
                    { k: "Prix moyen /m²", v: formatPsm(dvfStats.meanPsm) },
                    { k: "1er quartile (Q1)", v: formatPsm(dvfStats.p25Psm) },
                    { k: "3e quartile (Q3)", v: formatPsm(dvfStats.p75Psm) },
                  ].map(({ k, v }) => (
                    <div key={k} className="stat-row"><span className="k">{k}</span><span className="v">{v}</span></div>
                  ))}
                </div>
                <div>
                  {[
                    { k: "Prix minimum /m²", v: formatPsm(dvfStats.minPsm) },
                    { k: "Prix maximum /m²", v: formatPsm(dvfStats.maxPsm) },
                    { k: "Période couverte", v: `${formatDate(dvfStats.oldestDate)} – ${formatDate(dvfStats.newestDate)}` },
                    { k: "Périmètre de recherche", v: wasExpanded ? `${perimeterKm} km (demandé : ${requestedRadiusKm} km)` : `${perimeterKm ?? "—"} km` },
                    { k: "Source des données", v: dvfStats.source === "csv" ? "CSV local DGFiP" : dvfStats.source === "api" ? "API DVF" : "CSV + API" },
                  ].map(({ k, v }) => (
                    <div key={k} className="stat-row"><span className="k">{k}</span><span className="v">{v}</span></div>
                  ))}
                </div>
              </div>
            ) : (
              <p style={{ color: "#64748b", fontSize: "8.5pt" }}>Aucune statistique DVF disponible pour ce bien.</p>
            )}
          </div>

          <hr className="divider" />

          {/* ── 4. COMPARABLE TRANSACTIONS TABLE ── */}
          <div className="section">
            <h2>Transactions comparables ({dvfComparables.length})</h2>
            {dvfComparables.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    {["Date", "Distance", "Nature", "Surface", "Pièces", "Prix DVF", "€/m²", "Adresse/parcelle", "Source"].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dvfComparables.slice(0, 20).map((c, i) => (
                    <tr key={c.id ?? i}>
                      <td style={{ color: "#64748b", whiteSpace: "nowrap" }}>{formatDateShort(c.date)}</td>
                      <td style={{ whiteSpace: "nowrap", color: "#64748b" }}>{c.distanceM != null ? Math.round(c.distanceM) + " m" : "—"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{c.type}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{c.surface} m²</td>
                      <td style={{ whiteSpace: "nowrap", color: "#64748b" }}>{c.rooms != null ? c.rooms : "—"}</td>
                      <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{formatPrice(c.price, true)}</td>
                      <td style={{ whiteSpace: "nowrap", fontWeight: 700, color: "#1e40af" }}>{formatPsm(c.pricePsm)}</td>
                      <td style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#64748b" }}>
                        {c.address}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {c.source === "live"
                          ? <span style={{ color: "#1d4ed8", fontWeight: 600, fontSize: "7pt" }}>Live</span>
                          : <span style={{ color: "#94a3b8", fontSize: "7pt" }}>Local</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ color: "#64748b", fontSize: "8.5pt" }}>Aucun comparable DVF disponible dans ce périmètre.</p>
            )}
            {dvfComparables.length > 20 && (
              <p style={{ fontSize: "7.5pt", color: "#94a3b8", marginTop: 4 }}>
                {dvfComparables.length - 20} transaction{dvfComparables.length - 20 > 1 ? "s" : ""} supplémentaire{dvfComparables.length - 20 > 1 ? "s" : ""} non affichée{dvfComparables.length - 20 > 1 ? "s" : ""}.
              </p>
            )}
          </div>

          {/* ── 5. MARKET TREND ── */}
          {trendData.yearlyStats.length > 0 && (
            <>
              <hr className="divider" />
              <div className="section no-break">
                <h2>
                  Évolution du marché local
                  {dvfTypeForChart ? ` — ${dvfTypeForChart}s` : ""}
                </h2>
                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
                  {trendData.trend && (
                    <span className="badge" style={{ borderColor: trendColor, color: trendColor, backgroundColor: trendColor + "18" }}>
                      {trendLabel}
                      {trendData.trendPct != null && ` · ${trendData.trendPct > 0 ? "+" : ""}${trendData.trendPct}% sur 6 ans`}
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
                      <th>Médiane €/m²</th>
                      <th style={{ width: "40%" }}>Volume</th>
                      <th style={{ textAlign: "right" }}>Transactions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendData.yearlyStats.map(y => {
                      const pct = Math.round((y.count / maxTrendCount) * 100);
                      return (
                        <tr key={y.year}>
                          <td style={{ fontWeight: 600 }}>{y.year}</td>
                          <td style={{ color: "#1e40af", fontWeight: 700 }}>{formatPsm(y.medianPsm)}</td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div className="trend-bar-bg">
                                <div className="trend-bar-fill" style={{ width: `${pct}%` }} />
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
            </>
          )}

          {/* ── FOOTER ── */}
          <div className="footer">
            <span>Généré par ESTIM&apos;74 · Données DVF officielles DGFiP 2014–2024</span>
            <span>Réf. {params.id.slice(0, 8).toUpperCase()} · {today}</span>
          </div>

        </div>
      </div>

      {/* Screen-only hint bubble (hidden at print time via CSS) */}
      <div className="screen-hint print:hidden">
        Ouverture de la boîte d'impression…
      </div>
    </>
  );
}
