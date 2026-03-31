import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintTrigger } from "@/components/analysis/print-trigger";
import { loadCsvMutations } from "@/lib/dvf/csv-loader";
import { computePrixM2 } from "@/lib/dvf/outliers";
import { percentile, formatPrice, formatPsm, formatDateShort } from "@/lib/utils";
import { PROPERTY_TYPE_LABELS, CONDITION_LABELS, DPE_COLORS } from "@/lib/constants";
import { DVFStats, DVFComparable } from "@/types/dvf";
import { Adjustment } from "@/types/valuation";

export const dynamic = "force-dynamic";

async function getTrend(lat: number, lng: number, radiusKm: number, type?: string) {
  try {
    const rawMutations = await loadCsvMutations(lat, lng, Math.max(radiusKm, 3), 130, type ? [type] : undefined);
    const mutations = computePrixM2(rawMutations).filter((m) => m.prix_m2 != null && m.prix_m2 > 0);
    const byYear = new Map<number, number[]>();
    for (const m of mutations) {
      const year = new Date(m.date_mutation).getFullYear();
      if (year >= 2017) {
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year)!.push(m.prix_m2!);
      }
    }
    const stats = Array.from(byYear.entries())
      .map(([year, psms]) => ({ year, medianPsm: Math.round(percentile(psms, 50)), count: psms.length }))
      .sort((a, b) => a.year - b.year);
    let trend: "hausse" | "baisse" | "stable" = "stable";
    let trendPct: number | null = null;
    if (stats.length >= 6) {
      const r3 = stats.slice(-3), p3 = stats.slice(-6, -3);
      const r = r3.reduce((s, y) => s + y.medianPsm, 0) / 3;
      const p = p3.reduce((s, y) => s + y.medianPsm, 0) / 3;
      trendPct = Math.round(((r - p) / p) * 1000) / 10;
      trend = trendPct > 3 ? "hausse" : trendPct < -3 ? "baisse" : "stable";
    }
    return { stats, trend, trendPct };
  } catch {
    return { stats: [], trend: null as null, trendPct: null as null };
  }
}

export default async function PrintClientPage({
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

  const dvfStats: DVFStats | null = (a.dvfStats as DVFStats) ?? null;
  const dvfComparables: DVFComparable[] = (a.dvfComparables as DVFComparable[]) ?? [];
  const adjustments = (a.adjustments as Adjustment[]) ?? [];
  const perimeterKm: number | null = (a.perimeterKm as number) ?? null;

  const propertyLabel = PROPERTY_TYPE_LABELS[a.propertyType as string] ?? (a.propertyType as string);
  const conditionLabel = a.condition ? CONDITION_LABELS[a.condition as string] : null;
  const dpeColor = a.dpeLetter ? DPE_COLORS[a.dpeLetter as string] ?? "#6B7280" : null;
  const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Paris" });
  const isIndicative = a.confidenceLabel === "Indicative" || ((a.dvfSampleSize as number) != null && (a.dvfSampleSize as number) < 3);

  const top5 = dvfComparables
    .filter((c) => !c.outlier)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5);

  const dvfTypeForChart = a.propertyType === "APARTMENT" ? "Appartement" : a.propertyType === "HOUSE" ? "Maison" : undefined;
  const { stats: trendStats, trend, trendPct } = (a.lat && a.lng)
    ? await getTrend(a.lat as number, a.lng as number, Math.max(perimeterKm ?? 2, 2), dvfTypeForChart)
    : { stats: [], trend: null, trendPct: null };

  const positiveAdj = adjustments.filter((adj) => adj.factor > 0);
  const negativeAdj = adjustments.filter((adj) => adj.factor < 0);

  const trendColor = trend === "hausse" ? "#16A34A" : trend === "baisse" ? "#DC2626" : "#6B7280";
  const trendIcon = trend === "hausse" ? "↑" : trend === "baisse" ? "↓" : "→";
  const trendLabelFr = trend === "hausse" ? "en hausse" : trend === "baisse" ? "en baisse" : "stable";

  // Map adjustment labels to client-friendly text (no percentages, no technical terms)
  function clientLabel(adj: Adjustment): string {
    const l = adj.label.toLowerCase();
    if (l.includes("excellent état") || l.includes("refait") || l.includes("neuf")) return "Excellent état général";
    if (l.includes("état") || l.includes("condition")) return conditionLabel ?? adj.label;
    if (l.includes("parking")) return "Parking";
    if (l.includes("garage")) return "Garage";
    if (l.includes("balcon")) return "Balcon";
    if (l.includes("terrasse")) return "Terrasse";
    if (l.includes("cave")) return "Cave";
    if (l.includes("piscine")) return "Piscine";
    if (l.includes("ascenseur")) return "Ascenseur";
    if (l.includes("jardin") || l.includes("terrain")) return adj.label;
    if (l.includes("orientation")) return adj.label;
    if (l.includes("vue")) return adj.label;
    if (l.includes("dpe") || l.includes("énergie") || l.includes("energie")) return `DPE ${a.dpeLetter ?? ""}`;
    if (l.includes("étage") || l.includes("etage")) return adj.label;
    return adj.label;
  }

  const confidenceLabel = a.confidenceLabel as string | null;
  const confidenceFr: Record<string, string> = {
    "Très bonne": "Très bonne",
    "Bonne": "Bonne",
    "Correcte": "Correcte",
    "Indicative": "Indicative",
    "Faible": "Faible",
    "Insuffisant": "Insuffisante",
  };

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
        }
        .print-sheet { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 13px; color: #111827; line-height: 1.6; }
        /* COVER */
        .cover {
          background: linear-gradient(150deg, #1D4ED8 0%, #2563EB 50%, #3B82F6 100%);
          color: #fff;
          padding: 24mm 18mm 20mm;
          min-height: 230mm;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .cover-top {}
        .cover-eyebrow { font-size: 8px; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(255,255,255,0.7); margin-bottom: 12px; font-weight: 600; }
        .cover-logo { font-size: 36px; font-weight: 900; letter-spacing: -0.03em; color: #fff; }
        .cover-logo-tagline { font-size: 11px; color: rgba(255,255,255,0.75); margin-top: 4px; margin-bottom: 28px; }
        .cover-rule { border: none; border-top: 1px solid rgba(255,255,255,0.25); margin: 20px 0; }
        .cover-type { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(255,255,255,0.65); margin-bottom: 8px; }
        .cover-address { font-size: 16px; font-weight: 800; line-height: 1.3; color: #fff; margin-bottom: 10px; }
        .cover-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
        .cover-chip { border: 1px solid rgba(255,255,255,0.35); border-radius: 99px; padding: 3px 10px; font-size: 10px; color: rgba(255,255,255,0.9); }
        .cover-bottom { border-top: 1px solid rgba(255,255,255,0.2); padding-top: 18px; }
        .cover-date-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.6); margin-bottom: 3px; }
        .cover-date-value { font-size: 13px; font-weight: 700; color: #fff; }
        .cover-preparedby { margin-top: 16px; }
        .cover-preparedby-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.6); margin-bottom: 6px; }
        .cover-preparedby-line { border-bottom: 1px solid rgba(255,255,255,0.5); width: 200px; height: 22px; }
        /* CONTENT */
        .content { padding: 16mm 18mm 14mm; }
        .section { margin-bottom: 28px; }
        .section-title {
          font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
          color: #2563EB; margin-bottom: 14px;
          border-bottom: 2px solid #DBEAFE; padding-bottom: 6px;
        }
        .divider { border: none; border-top: 1px solid #E5E7EB; margin: 24px 0; }
        /* ESTIMATION */
        .estim-box {
          background: #EFF6FF; border: 1.5px solid #BFDBFE; border-radius: 10px;
          padding: 20px 24px; text-align: center; margin-bottom: 16px;
        }
        .estim-box.amber { background: #FFFBEB; border-color: #FCD34D; }
        .estim-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #2563EB; margin-bottom: 8px; }
        .estim-label.amber { color: #92400E; }
        .estim-price { font-size: 34px; font-weight: 900; color: #1D4ED8; letter-spacing: -0.02em; line-height: 1; }
        .estim-price.amber { color: #92400E; }
        .estim-psm { font-size: 14px; font-weight: 700; color: #2563EB; margin-top: 6px; }
        .estim-psm.amber { color: #B45309; }
        .range-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
        .range-box { border: 1px solid #E5E7EB; border-radius: 8px; padding: 10px 14px; background: #F9FAFB; }
        .range-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.08em; color: #9CA3AF; margin-bottom: 4px; }
        .range-val { font-size: 14px; font-weight: 700; color: #374151; }
        .info-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
        .chip { display: inline-flex; border: 1px solid #E5E7EB; border-radius: 99px; padding: 4px 12px; font-size: 10px; font-weight: 600; color: #374151; background: #F9FAFB; }
        .chip.blue { border-color: #BFDBFE; color: #1D4ED8; background: #EFF6FF; }
        .chip.green { border-color: #BBF7D0; color: #166534; background: #F0FDF4; }
        .chip.amber { border-color: #FDE68A; color: #92400E; background: #FFFBEB; }
        /* BULLET LISTS */
        .bullet-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .bullet-col-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding-bottom: 8px; margin-bottom: 10px; border-bottom: 2px solid; }
        .bullet-col-title.green { color: #16A34A; border-color: #BBF7D0; }
        .bullet-col-title.amber { color: #B45309; border-color: #FDE68A; }
        .bullet-item { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; border-bottom: 1px solid #F3F4F6; font-size: 13px; color: #1F2937; line-height: 1.4; }
        .bullet-item:last-child { border-bottom: none; }
        .bullet-icon-ok { color: #16A34A; font-size: 14px; flex-shrink: 0; margin-top: 1px; }
        .bullet-icon-warn { color: #D97706; font-size: 14px; flex-shrink: 0; margin-top: 1px; }
        .bullet-empty { font-size: 12px; color: #9CA3AF; font-style: italic; }
        /* COMPARABLES */
        .comp-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
        .comp-table th { background: #F8FAFC; padding: 7px 8px; text-align: left; font-weight: 600; color: #6B7280; border-bottom: 1.5px solid #E5E7EB; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; overflow: hidden; word-wrap: break-word; }
        .comp-table td { padding: 7px 8px; border-bottom: 1px solid #F3F4F6; vertical-align: middle; overflow: hidden; word-wrap: break-word; overflow-wrap: break-word; }
        .comp-table tr:last-child td { border-bottom: none; }
        .comp-table tr:first-child td { background: #F0F9FF; }
        /* MARKET */
        .market-card { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 10px; padding: 16px 20px; }
        .market-trend-row { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
        .market-icon { font-size: 28px; font-weight: 900; line-height: 1; }
        .market-trend-title { font-size: 14px; font-weight: 700; }
        .market-trend-sub { font-size: 11px; color: #6B7280; margin-top: 2px; }
        .market-stats { border-top: 1px solid #E5E7EB; padding-top: 12px; }
        .market-stat-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dotted #E5E7EB; font-size: 12px; }
        .market-stat-row:last-child { border-bottom: none; }
        .market-stat-label { color: #6B7280; }
        .market-stat-val { font-weight: 600; color: #1F2937; }
        .market-commentary { margin-top: 14px; font-size: 12px; color: #4B5563; line-height: 1.65; background: #EFF6FF; border-radius: 6px; padding: 10px 14px; border-left: 3px solid #2563EB; }
        /* FOOTER */
        .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #E5E7EB; display: flex; justify-content: space-between; align-items: flex-end; font-size: 9px; color: #9CA3AF; }
        .footer-legal { font-size: 8px; color: #D1D5DB; text-align: center; margin-top: 6px; }
      `}</style>

      <div className="print-page">
        <div className="print-sheet">

          {/* ── COVER ── */}
          <div className="cover">
            <div className="cover-top">
              <div className="cover-eyebrow">Haute-Savoie (74) · Données DVF DGFiP 2020–2025</div>
              <div className="cover-logo">ESTIM&apos;74</div>
              <div className="cover-logo-tagline">Outil d&apos;estimation fondé sur les données réelles de ventes signées</div>
              <hr className="cover-rule" />
              <div className="cover-type">Rapport d&apos;estimation · {propertyLabel}</div>
              <div className="cover-address">
                {[a.address, a.postalCode, a.city].filter(Boolean).join(", ") || "Adresse non renseignée"}
              </div>
              <div className="cover-chips">
                <span className="cover-chip">{a.surface as number} m²</span>
                {!!a.rooms && <span className="cover-chip">{a.rooms as number} pièces</span>}
                {!!a.bedrooms && <span className="cover-chip">{a.bedrooms as number} chambres</span>}
                {!!a.yearBuilt && <span className="cover-chip">Construit en {a.yearBuilt as number}</span>}
                {!!conditionLabel && <span className="cover-chip">{conditionLabel}</span>}
                {!!a.dpeLetter && (
                  <span className="cover-chip" style={{ borderColor: dpeColor! + "80" }}>DPE {a.dpeLetter as string}</span>
                )}
              </div>
            </div>
            <div className="cover-bottom">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div>
                  <div className="cover-date-label">Date du rapport</div>
                  <div className="cover-date-value">{today}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="cover-date-label">Référence</div>
                  <div style={{ fontFamily: "monospace", fontSize: "11px", color: "rgba(255,255,255,0.85)", fontWeight: 700 }}>
                    {params.id.slice(0, 8).toUpperCase()}
                  </div>
                </div>
              </div>
              <div className="cover-preparedby">
                <div className="cover-preparedby-label">Préparé par</div>
                <div className="cover-preparedby-line" />
              </div>
            </div>
          </div>

          {/* ── CONTENT ── */}
          <div className="content">

            {/* §1 — ESTIMATION */}
            <div className="section">
              <div className="section-title">Estimation de valeur</div>
              {a.valuationMid ? (
                <>
                  <div className={`estim-box${isIndicative ? " amber" : ""}`}>
                    <div className={`estim-label${isIndicative ? " amber" : ""}`}>Estimation centrale</div>
                    <div className={`estim-price${isIndicative ? " amber" : ""}`}>{formatPrice(a.valuationMid as number)}</div>
                    {!!a.valuationPsm && <div className={`estim-psm${isIndicative ? " amber" : ""}`}>{formatPsm(a.valuationPsm as number)}</div>}
                  </div>
                  <div className="range-row">
                    <div className="range-box">
                      <div className="range-label">Fourchette basse</div>
                      <div className="range-val">{formatPrice(a.valuationLow as number)}</div>
                    </div>
                    <div className="range-box">
                      <div className="range-label">Fourchette haute</div>
                      <div className="range-val">{formatPrice(a.valuationHigh as number)}</div>
                    </div>
                  </div>
                  <div className="info-chips">
                    {confidenceLabel && (
                      <span className={`chip ${confidenceLabel === "Très bonne" || confidenceLabel === "Bonne" ? "green" : isIndicative ? "amber" : "blue"}`}>
                        Fiabilité {confidenceFr[confidenceLabel] ?? confidenceLabel}
                      </span>
                    )}
                    {a.dvfSampleSize != null && (
                      <span className="chip">{a.dvfSampleSize as number} ventes de référence</span>
                    )}
                    {perimeterKm && <span className="chip">Zone {perimeterKm} km</span>}
                  </div>
                  {isIndicative && (
                    <div style={{ marginTop: 12, background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, padding: "10px 14px", fontSize: "12px", color: "#92400E" }}>
                      <strong>Estimation indicative</strong> — le nombre de ventes de référence est limité dans ce secteur. Nous recommandons de croiser cette estimation avec d&apos;autres sources avant toute décision.
                    </div>
                  )}
                </>
              ) : (
                <p style={{ color: "#6B7280", fontStyle: "italic" }}>Estimation non disponible — données insuffisantes dans ce secteur.</p>
              )}
            </div>

            <hr className="divider" />

            {/* §2 — ATOUTS & VIGILANCES */}
            {adjustments.length > 0 && (
              <div className="section">
                <div className="section-title">Caractéristiques du bien</div>
                <div className="bullet-grid">
                  {/* Points forts */}
                  <div>
                    <div className="bullet-col-title green">Points forts</div>
                    {positiveAdj.length === 0 ? (
                      <div className="bullet-empty">Aucun point fort identifié</div>
                    ) : (
                      positiveAdj.map((adj) => (
                        <div key={adj.label} className="bullet-item">
                          <span className="bullet-icon-ok">✓</span>
                          <span>{clientLabel(adj)}</span>
                        </div>
                      ))
                    )}
                  </div>
                  {/* Points de vigilance */}
                  <div>
                    <div className="bullet-col-title amber">Points de vigilance</div>
                    {negativeAdj.length === 0 ? (
                      <div className="bullet-empty">Aucun point de vigilance</div>
                    ) : (
                      negativeAdj.map((adj) => (
                        <div key={adj.label} className="bullet-item">
                          <span className="bullet-icon-warn">⚠</span>
                          <span>{clientLabel(adj)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {adjustments.length > 0 && <hr className="divider" />}

            {/* §3 — VENTES DE RÉFÉRENCE */}
            {top5.length > 0 && (
              <div className="section">
                <div className="section-title">Les {top5.length} ventes comparables les plus récentes</div>
                <table className="comp-table">
                  <colgroup>
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "19%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Surface</th>
                      <th>Prix de vente</th>
                      <th>Prix / m²</th>
                      <th>Localisation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top5.map((c, i) => (
                      <tr key={`${c.id ?? "c"}-${i}`}>
                        <td style={{ color: "#6B7280" }}>{formatDateShort(c.date)}</td>
                        <td>{c.type}</td>
                        <td>{c.surface} m²</td>
                        <td style={{ fontWeight: 600 }}>{formatPrice(c.price, true)}</td>
                        <td style={{ fontWeight: 700, color: "#2563EB" }}>
                          {formatPsm(c.indexedPricePsm ?? c.pricePsm)}
                        </td>
                        <td style={{ color: "#6B7280" }}>
                          {c.city}{c.distanceM != null ? ` · ${Math.round(c.distanceM)} m` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ fontSize: "9px", color: "#9CA3AF", marginTop: 6 }}>
                  Prix en valeur 2025 (indice notaires Haute-Savoie). Source : Demandes de Valeurs Foncières — DGFiP.
                </p>
              </div>
            )}

            {top5.length > 0 && <hr className="divider" />}

            {/* §4 — CONTEXTE MARCHÉ */}
            <div className="section">
              <div className="section-title">Contexte du marché immobilier local</div>
              <div className="market-card">
                {trend ? (
                  <>
                    <div className="market-trend-row">
                      <div className="market-icon" style={{ color: trendColor }}>{trendIcon}</div>
                      <div>
                        <div className="market-trend-title" style={{ color: trendColor }}>
                          Marché {trendLabelFr}
                          {trendPct != null && ` de ${Math.abs(trendPct)}% sur les 3 dernières années`}
                        </div>
                        <div className="market-trend-sub">
                          {dvfTypeForChart ? `${dvfTypeForChart}s · ` : ""}Rayon {Math.max(perimeterKm ?? 2, 2)} km
                        </div>
                      </div>
                    </div>

                    {trendStats.length >= 2 && (() => {
                      const last = trendStats[trendStats.length - 1];
                      const prev = trendStats[trendStats.length - 2];
                      const diff = last.medianPsm - prev.medianPsm;
                      const diffPct = Math.round((diff / prev.medianPsm) * 1000) / 10;
                      return (
                        <div className="market-stats">
                          <div className="market-stat-row">
                            <span className="market-stat-label">Prix médian {prev.year}</span>
                            <span className="market-stat-val">{formatPsm(prev.medianPsm)}</span>
                          </div>
                          <div className="market-stat-row">
                            <span className="market-stat-label">Prix médian {last.year}</span>
                            <span className="market-stat-val" style={{ color: "#2563EB" }}>{formatPsm(last.medianPsm)}</span>
                          </div>
                          <div className="market-stat-row">
                            <span className="market-stat-label">Évolution annuelle</span>
                            <span className="market-stat-val" style={{ color: diff >= 0 ? "#16A34A" : "#DC2626" }}>
                              {diff >= 0 ? "+" : ""}{diffPct}%
                            </span>
                          </div>
                          {dvfStats && (
                            <div className="market-stat-row">
                              <span className="market-stat-label">Ventes analysées</span>
                              <span className="market-stat-val">{dvfStats.count} transactions</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <div className="market-commentary">
                      {trend === "hausse" &&
                        "Le marché immobilier local est dynamique : les prix sont en progression régulière. Dans ce contexte de demande soutenue, les délais de vente sont généralement courts et la marge de négociation limitée."}
                      {trend === "baisse" &&
                        "Le marché local marque un repli sur les dernières années. Les acheteurs disposent d'une marge de négociation plus importante. Une mise en valeur soignée du bien et un prix cohérent restent essentiels pour conclure la vente."}
                      {trend === "stable" &&
                        "Le marché local est stable : les prix se maintiennent dans une fourchette cohérente, offrant une bonne visibilité aux vendeurs comme aux acquéreurs. Les conditions actuelles sont propices à une transaction dans des délais raisonnables."}
                    </div>
                  </>
                ) : (
                  <p style={{ color: "#6B7280", fontStyle: "italic", fontSize: "12px" }}>
                    Données de tendance non disponibles pour ce secteur.
                  </p>
                )}
              </div>
            </div>

            {/* FOOTER */}
            <div className="footer">
              <span>Ce document est une estimation et ne constitue pas une expertise officielle.</span>
              <span>ESTIM&apos;74 · {today}</span>
            </div>
            <div className="footer-legal">
              Données DVF issues de la base nationale DGFiP (data.gouv.fr). ESTIM&apos;74 est un outil d&apos;aide à la décision à usage exclusif du destinataire.
            </div>

          </div>
        </div>
      </div>

      {!skipPrint && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "#2563EB", color: "#fff", padding: "8px 20px", borderRadius: 99, fontSize: 13, fontFamily: "sans-serif", zIndex: 1000, boxShadow: "0 2px 12px rgba(0,0,0,0.2)", whiteSpace: "nowrap" }}>
          Ouverture de la boîte d&apos;impression…
        </div>
      )}
    </>
  );
}
