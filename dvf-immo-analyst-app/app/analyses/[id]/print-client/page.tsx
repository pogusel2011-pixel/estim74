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
      const recent3 = stats.slice(-3);
      const prev3 = stats.slice(-6, -3);
      const r = recent3.reduce((s, y) => s + y.medianPsm, 0) / 3;
      const p = prev3.reduce((s, y) => s + y.medianPsm, 0) / 3;
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
  const dpeColor = a.dpeLetter ? DPE_COLORS[a.dpeLetter as string] ?? "#6b7280" : null;
  const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const isIndicative = a.confidenceLabel === "Indicative" || ((a.dvfSampleSize as number) != null && (a.dvfSampleSize as number) < 3);

  // Top 5 comparables by score
  const top5 = dvfComparables
    .filter((c) => !c.outlier)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5);

  // Trend
  const dvfTypeForChart = a.propertyType === "APARTMENT" ? "Appartement" : a.propertyType === "HOUSE" ? "Maison" : undefined;
  const { stats: trendStats, trend, trendPct } = (a.lat && a.lng)
    ? await getTrend(a.lat as number, a.lng as number, Math.max(perimeterKm ?? 2, 2), dvfTypeForChart)
    : { stats: [], trend: null, trendPct: null };

  // Adjustments split
  const positiveAdj = adjustments.filter((adj) => adj.factor > 0);
  const negativeAdj = adjustments.filter((adj) => adj.factor < 0);

  const trendColor = trend === "hausse" ? "#16a34a" : trend === "baisse" ? "#dc2626" : "#6b7280";
  const trendLabel = trend === "hausse" ? "en hausse" : trend === "baisse" ? "en baisse" : "stable";
  const trendIcon = trend === "hausse" ? "↑" : trend === "baisse" ? "↓" : "→";

  const confidenceDisplay: Record<string, string> = {
    "Très bonne": "Très bonne",
    "Bonne": "Bonne",
    "Correcte": "Correcte",
    "Indicative": "Indicative",
  };

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
        .cover { background:linear-gradient(160deg,#1e3a8a 0%,#1e40af 60%,#2563eb 100%); color:#fff; padding:22mm 18mm 18mm; min-height:240mm; display:flex; flex-direction:column; justify-content:space-between; }
        .cover-top {}
        .cover-eyebrow { font-size:7.5pt; color:#93c5fd; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:8px; font-weight:600; }
        .cover-logo { font-size:28pt; font-weight:900; letter-spacing:-0.03em; margin:12px 0 6px; }
        .cover-logo-sub { font-size:9pt; color:#bfdbfe; font-weight:400; margin-bottom: 24px; }
        .cover-divider { border:none; border-top:1px solid rgba(255,255,255,0.2); margin:18px 0; }
        .cover-type { font-size:8.5pt; color:#93c5fd; text-transform:uppercase; letter-spacing:0.08em; font-weight:600; margin-bottom:6px; }
        .cover-addr { font-size:14pt; font-weight:800; margin-bottom:8px; line-height:1.3; }
        .cover-meta { font-size:9pt; color:#bfdbfe; display:flex; gap:18px; flex-wrap:wrap; margin-bottom:6px; }
        .cover-bottom { border-top:1px solid rgba(255,255,255,0.15); padding-top:16px; margin-top:24px; }
        .cover-date { font-size:8pt; color:#93c5fd; margin-bottom:3px; }
        .cover-date-val { font-size:10.5pt; font-weight:700; }
        .cover-expert { margin-top:16px; }
        .cover-expert-label { font-size:7.5pt; color:#93c5fd; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:4px; }
        .cover-expert-line { border-bottom:1px solid rgba(255,255,255,0.4); width:180px; height:24px; }
        .content { padding:12mm 16mm 14mm; }
        .sh2 { font-size:8.5pt; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:#1e40af; margin:0 0 10px; border-bottom:2px solid #dbeafe; padding-bottom:4px; }
        .section { margin-bottom:18px; }
        .divider { border:none; border-top:1px solid #e2e8f0; margin:14px 0; }
        .estim-main { background:linear-gradient(120deg,#eff6ff,#dbeafe); border:1px solid #93c5fd; border-radius:10px; padding:16px 20px; margin-bottom:12px; text-align:center; }
        .estim-label { font-size:7.5pt; color:#1e40af; text-transform:uppercase; letter-spacing:0.08em; font-weight:700; margin-bottom:6px; }
        .estim-price { font-size:30pt; font-weight:900; color:#1e3a8a; letter-spacing:-0.02em; line-height:1; }
        .estim-psm { font-size:13pt; font-weight:700; color:#1e40af; margin-top:4px; }
        .estim-amber { background:linear-gradient(120deg,#fffbeb,#fef3c7); border-color:#fcd34d; }
        .estim-amber .estim-label { color:#92400e; }
        .estim-amber .estim-price { color:#92400e; }
        .estim-amber .estim-psm { color:#b45309; }
        .range-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px; }
        .range-box { border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; }
        .range-label { font-size:7pt; color:#94a3b8; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:3px; }
        .range-val { font-size:12pt; font-weight:700; color:#374151; }
        .badge-row { display:flex; gap:8px; flex-wrap:wrap; }
        .badge { display:inline-flex; align-items:center; border:1px solid; border-radius:99px; padding:3px 10px; font-size:7.5pt; font-weight:600; }
        .adj-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .adj-col-title { font-size:8pt; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px; padding-bottom:4px; border-bottom:2px solid; }
        .adj-col-title.green { color:#16a34a; border-color:#86efac; }
        .adj-col-title.red { color:#dc2626; border-color:#fca5a5; }
        .adj-item { display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px dotted #f1f5f9; font-size:8.5pt; }
        .adj-item:last-child { border-bottom:none; }
        .comp-table { width:100%; border-collapse:collapse; font-size:8.5pt; }
        .comp-table th { background:#f8fafc; padding:5px 8px; text-align:left; font-weight:600; color:#475569; border-bottom:1px solid #e2e8f0; font-size:7.5pt; white-space:nowrap; }
        .comp-table td { padding:5px 8px; border-bottom:1px solid #f1f5f9; vertical-align:middle; }
        .comp-table tr:last-child td { border-bottom:none; }
        .market-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px; }
        .market-trend-big { font-size:22pt; font-weight:900; }
        .footer { margin-top:14px; padding-top:10px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; font-size:7pt; color:#94a3b8; }
      `}</style>

      <div className="print-page">
        <div className="print-sheet">

          {/* ── COVER ── */}
          <div className="cover">
            <div className="cover-top">
              <div className="cover-eyebrow">Haute-Savoie (74) · Données DVF DGFiP</div>
              <div className="cover-logo">ESTIM&apos;74</div>
              <div className="cover-logo-sub">Outil d&apos;estimation immobilière — Données réelles de ventes signées</div>
              <hr className="cover-divider" />
              <div className="cover-type">Rapport d&apos;estimation — {propertyLabel}</div>
              <div className="cover-addr">
                {[a.address, a.postalCode, a.city].filter(Boolean).join(", ") || "Adresse non renseignée"}
              </div>
              <div className="cover-meta">
                <span>{a.surface as number} m²</span>
                {a.rooms && <span>{a.rooms as number} pièces</span>}
                {a.bedrooms && <span>{a.bedrooms as number} chambres</span>}
                {a.yearBuilt && <span>Construit en {a.yearBuilt as number}</span>}
                {conditionLabel && <span>{conditionLabel}</span>}
                {a.dpeLetter && (
                  <span style={{ color: dpeColor! }}>DPE {a.dpeLetter as string}</span>
                )}
              </div>
            </div>
            <div className="cover-bottom">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div>
                  <div className="cover-date">Date du rapport</div>
                  <div className="cover-date-val">{today}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="cover-date">Réf.</div>
                  <div style={{ fontFamily: "monospace", fontSize: "9pt", fontWeight: 700 }}>{params.id.slice(0, 8).toUpperCase()}</div>
                </div>
              </div>
              <div className="cover-expert">
                <div className="cover-expert-label">Conseiller immobilier</div>
                <div className="cover-expert-line" />
              </div>
            </div>
          </div>

          <div className="content">

            {/* ── 1. ESTIMATION ── */}
            <div className="section">
              <div className="sh2">Estimation de valeur</div>
              {a.valuationMid ? (
                <>
                  <div className={`estim-main${isIndicative ? " estim-amber" : ""}`}>
                    <div className="estim-label">Estimation centrale</div>
                    <div className="estim-price">{formatPrice(a.valuationMid as number)}</div>
                    {a.valuationPsm && <div className="estim-psm">{formatPsm(a.valuationPsm as number)}</div>}
                  </div>
                  <div className="range-grid">
                    <div className="range-box">
                      <div className="range-label">Fourchette basse</div>
                      <div className="range-val">{formatPrice(a.valuationLow as number)}</div>
                    </div>
                    <div className="range-box">
                      <div className="range-label">Fourchette haute</div>
                      <div className="range-val">{formatPrice(a.valuationHigh as number)}</div>
                    </div>
                  </div>
                  <div className="badge-row">
                    {a.confidenceLabel && (
                      <span className="badge" style={{ borderColor: a.confidenceLabel === "Très bonne" ? "#86efac" : a.confidenceLabel === "Bonne" ? "#93c5fd" : "#fcd34d", color: a.confidenceLabel === "Très bonne" ? "#15803d" : a.confidenceLabel === "Bonne" ? "#1e40af" : "#92400e", background: a.confidenceLabel === "Très bonne" ? "#f0fdf4" : a.confidenceLabel === "Bonne" ? "#eff6ff" : "#fffbeb" }}>
                        Fiabilité : {confidenceDisplay[a.confidenceLabel as string] ?? a.confidenceLabel}
                        {a.confidence != null && ` (${Math.round((a.confidence as number) * 100)}%)`}
                      </span>
                    )}
                    {a.dvfSampleSize != null && (
                      <span className="badge" style={{ borderColor: "#e2e8f0", color: "#64748b" }}>
                        {a.dvfSampleSize as number} ventes de référence
                      </span>
                    )}
                    {perimeterKm && (
                      <span className="badge" style={{ borderColor: "#e2e8f0", color: "#64748b" }}>
                        Zone {perimeterKm} km
                      </span>
                    )}
                  </div>
                  {isIndicative && (
                    <div style={{ marginTop: 10, background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 6, padding: "6px 10px", fontSize: "8pt", color: "#92400e" }}>
                      <strong>Estimation indicative</strong> — le nombre de ventes de référence est limité dans ce secteur. Nous recommandons de croiser cette estimation avec d&apos;autres sources.
                    </div>
                  )}
                </>
              ) : (
                <p style={{ color: "#64748b" }}>Estimation non disponible — données insuffisantes dans ce secteur.</p>
              )}
            </div>

            <hr className="divider" />

            {/* ── 2. ATOUTS & VIGILANCES ── */}
            {adjustments.length > 0 && (
              <div className="section">
                <div className="sh2">Caractéristiques du bien</div>
                <div className="adj-grid">
                  <div>
                    <div className="adj-col-title green">
                      ✓ Points forts ({positiveAdj.length})
                    </div>
                    {positiveAdj.length === 0 ? (
                      <p style={{ fontSize: "8pt", color: "#94a3b8", fontStyle: "italic" }}>Aucun point fort identifié.</p>
                    ) : (
                      positiveAdj.map((adj) => (
                        <div key={adj.label} className="adj-item">
                          <span>{adj.label}</span>
                          <span style={{ color: "#16a34a", fontWeight: 700 }}>
                            +{(adj.factor * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <div>
                    <div className="adj-col-title red">
                      ⚠ Points de vigilance ({negativeAdj.length})
                    </div>
                    {negativeAdj.length === 0 ? (
                      <p style={{ fontSize: "8pt", color: "#94a3b8", fontStyle: "italic" }}>Aucun point de vigilance.</p>
                    ) : (
                      negativeAdj.map((adj) => (
                        <div key={adj.label} className="adj-item">
                          <span>{adj.label}</span>
                          <span style={{ color: "#dc2626", fontWeight: 700 }}>
                            {(adj.factor * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {adjustments.length > 0 && <hr className="divider" />}

            {/* ── 3. VENTES DE RÉFÉRENCE ── */}
            {top5.length > 0 && (
              <div className="section">
                <div className="sh2">Les {top5.length} ventes les plus proches &amp; récentes</div>
                <table className="comp-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th style={{ textAlign: "right" }}>Surface</th>
                      <th style={{ textAlign: "right" }}>Prix de vente</th>
                      <th style={{ textAlign: "right" }}>Prix/m²</th>
                      <th>Localisation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top5.map((c, i) => (
                      <tr key={`${c.id ?? "c"}-${i}`} style={{ background: i === 0 ? "#f0f9ff" : undefined }}>
                        <td style={{ whiteSpace: "nowrap", color: "#64748b" }}>{formatDateShort(c.date)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{c.type}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{c.surface} m²</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{formatPrice(c.price, true)}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: "#1e40af" }}>
                          {formatPsm(c.indexedPricePsm ?? c.pricePsm)}
                        </td>
                        <td style={{ color: "#64748b", fontSize: "7.5pt" }}>
                          {c.city}{c.distanceM != null ? ` · ${Math.round(c.distanceM)} m` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ fontSize: "7pt", color: "#94a3b8", marginTop: 4 }}>
                  Prix indexés en valeur 2025 (indices notariaux Haute-Savoie). Source : DGFiP — Demandes de valeurs foncières.
                </p>
              </div>
            )}

            {top5.length > 0 && <hr className="divider" />}

            {/* ── 4. CONTEXTE DE MARCHÉ ── */}
            <div className="section">
              <div className="sh2">Contexte du marché immobilier local</div>
              <div className="market-box">
                {trend ? (
                  <>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                      <div style={{ fontSize: "22pt", fontWeight: 900, color: trendColor }}>{trendIcon}</div>
                      <div>
                        <div style={{ fontSize: "11pt", fontWeight: 800, color: trendColor }}>
                          Marché {trendLabel}
                          {trendPct != null && ` de ${Math.abs(trendPct)}% sur les 3 dernières années`}
                        </div>
                        <div style={{ fontSize: "8pt", color: "#64748b" }}>
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
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "8.5pt", padding: "4px 0", borderBottom: "1px dotted #e2e8f0" }}>
                            <span style={{ color: "#64748b" }}>Médiane {prev.year}</span>
                            <span style={{ fontWeight: 600 }}>{formatPsm(prev.medianPsm)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "8.5pt", padding: "4px 0", borderBottom: "1px dotted #e2e8f0" }}>
                            <span style={{ color: "#64748b" }}>Médiane {last.year}</span>
                            <span style={{ fontWeight: 700, color: "#1e40af" }}>{formatPsm(last.medianPsm)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "8.5pt", padding: "4px 0" }}>
                            <span style={{ color: "#64748b" }}>Évolution annuelle</span>
                            <span style={{ fontWeight: 700, color: diff >= 0 ? "#16a34a" : "#dc2626" }}>
                              {diff >= 0 ? "+" : ""}{diffPct}%
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                    <div style={{ fontSize: "8pt", color: "#64748b", lineHeight: 1.6, background: "#f8fafc", borderRadius: 6, padding: "8px 10px" }}>
                      {trend === "hausse" && (
                        <>
                          Le marché immobilier local est dynamique : les prix médians sont en progression.{" "}
                          Dans ce contexte de demande soutenue, les délais de vente sont généralement courts et le potentiel de négociation limité.
                        </>
                      )}
                      {trend === "baisse" && (
                        <>
                          Le marché local marque un repli sur les dernières années.{" "}
                          Les acheteurs bénéficient d&apos;une marge de négociation plus importante. Une mise en valeur soignée du bien est recommandée.
                        </>
                      )}
                      {trend === "stable" && (
                        <>
                          Le marché local est stable. Les prix se maintiennent dans une fourchette cohérente,{" "}
                          offrant une visibilité satisfaisante pour les vendeurs comme pour les acquéreurs.
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <p style={{ color: "#64748b", fontSize: "8.5pt" }}>Données de tendance non disponibles pour ce secteur.</p>
                )}
              </div>
              {dvfStats && (
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className="badge" style={{ borderColor: "#e2e8f0", color: "#475569" }}>
                    Médiane locale : {formatPsm(dvfStats.medianPsm)}
                  </span>
                  <span className="badge" style={{ borderColor: "#e2e8f0", color: "#475569" }}>
                    {dvfStats.count} ventes analysées
                  </span>
                  <span className="badge" style={{ borderColor: "#e2e8f0", color: "#475569" }}>
                    Données 2014–2025
                  </span>
                </div>
              )}
            </div>

            {/* ── FOOTER ── */}
            <div className="footer">
              <span>Cette estimation est fondée sur les données réelles de ventes signées (DVF · DGFiP). Elle ne constitue pas une expertise officielle.</span>
              <span>ESTIM&apos;74 · {today}</span>
            </div>
            <div style={{ marginTop: 4, fontSize: "6.5pt", color: "#cbd5e1", textAlign: "center" }}>
              Document confidentiel — à usage exclusif du destinataire. Les données DVF sont issues de la base nationale DGFiP (data.gouv.fr). ESTIM&apos;74 est un outil d&apos;aide à la décision.
            </div>

          </div>
        </div>
      </div>

      {!skipPrint && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "#1e40af", color: "#fff", padding: "8px 20px", borderRadius: 99, fontSize: 13, fontFamily: "sans-serif", zIndex: 1000, whiteSpace: "nowrap", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
          Ouverture de la boîte d&apos;impression…
        </div>
      )}
    </>
  );
}
