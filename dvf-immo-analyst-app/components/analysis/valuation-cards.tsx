"use client";
import { useState } from "react";
import { formatPrice, formatPsm } from "@/lib/utils";
import { ConfidenceBadge } from "./confidence-badge";
import { ProximityBadges } from "./proximity-badges";
import { Adjustment, ConfidenceFactors } from "@/types/valuation";
import { TrendingUp, TrendingDown, Minus, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  psm?: number | null;
  confidence?: number | null;
  confidenceLabel?: string | null;
  adjustments?: Adjustment[] | null;
  dvfSampleSize?: number | null;
  perimeterKm?: number | null;
  confidenceFactors?: ConfidenceFactors | null;
}

export function ValuationCards({
  low, mid, high, psm,
  confidence, confidenceLabel,
  adjustments,
  dvfSampleSize, perimeterKm,
  confidenceFactors,
}: Props) {
  const [adjustmentsOpen, setAdjustmentsOpen] = useState(false);

  const isIndicative =
    confidenceLabel === "Indicative" ||
    (mid != null && mid > 0 && dvfSampleSize != null && dvfSampleSize < 3);

  const nonProximityAdjs = (adjustments ?? []).filter((a) => a.category !== "proximity");
  const hasAdjustments =
    nonProximityAdjs.length > 0 ||
    (adjustments ?? []).some((a) => a.category === "proximity");

  if (!mid) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-muted-foreground">
        Estimation non disponible — données DVF insuffisantes dans ce secteur.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white shadow-sm border border-border/50 overflow-hidden">

      {/* Indicative warning banner */}
      {isIndicative && (
        <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <div>
            <span className="font-semibold">Estimation indicative</span>
            {" — "}données DVF limitées
            {dvfSampleSize != null && dvfSampleSize > 0
              && ` (${dvfSampleSize} transaction${dvfSampleSize > 1 ? "s" : ""}`}
            {perimeterKm != null && dvfSampleSize != null && dvfSampleSize > 0
              && ` dans un rayon de ${perimeterKm} km)`}
            {dvfSampleSize != null && dvfSampleSize === 0 && " dans ce secteur"}
            {". "}Recoupez avec d'autres sources avant toute décision.
          </div>
        </div>
      )}

      {/* 3 price columns */}
      <div className="grid grid-cols-3 divide-x divide-border/50">
        {/* Basse */}
        <div className="px-5 py-6">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Basse</p>
          <p className="text-2xl font-bold text-[#1F2937]">{formatPrice(low!)}</p>
        </div>

        {/* Centrale */}
        <div className={`px-5 py-6 ${isIndicative ? "bg-amber-50" : "bg-[#2563EB]/5"}`}>
          <p className={`text-[11px] font-bold uppercase tracking-widest mb-3 ${isIndicative ? "text-amber-700" : "text-[#2563EB]"}`}>
            {isIndicative ? "Indicative" : "Estimation"}
          </p>
          <p className={`text-3xl font-extrabold leading-none ${isIndicative ? "text-amber-800" : "text-[#2563EB]"}`}>
            {formatPrice(mid)}
          </p>
          {psm && (
            <p className="text-sm text-slate-500 mt-1.5">{formatPsm(psm)}</p>
          )}
          {confidence != null && confidenceLabel && (
            <div className="mt-4">
              <ConfidenceBadge score={confidence} label={confidenceLabel} factors={confidenceFactors} />
            </div>
          )}
        </div>

        {/* Haute */}
        <div className="px-5 py-6">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Haute</p>
          <p className="text-2xl font-bold text-[#1F2937]">{formatPrice(high!)}</p>
        </div>
      </div>

      {/* Collapsible adjustments */}
      {hasAdjustments && (
        <div className="border-t border-border/40">
          <button
            onClick={() => setAdjustmentsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-2.5 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <span>
              {adjustmentsOpen ? "Masquer" : "Voir"} les ajustements appliqués
              {nonProximityAdjs.length > 0 && ` (${nonProximityAdjs.length})`}
            </span>
            {adjustmentsOpen
              ? <ChevronUp className="h-3.5 w-3.5" />
              : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {adjustmentsOpen && (
            <div className="px-5 pb-4 pt-3 space-y-3 border-t border-border/30">
              {nonProximityAdjs.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {nonProximityAdjs.map((adj, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-0.5 text-xs px-2.5 py-1 rounded-full border bg-white"
                    >
                      {adj.factor > 0
                        ? <TrendingUp className="h-3 w-3 text-emerald-600" />
                        : adj.factor < 0
                        ? <TrendingDown className="h-3 w-3 text-red-500" />
                        : <Minus className="h-3 w-3 text-slate-400" />}
                      {adj.label}{" "}
                      {adj.factor > 0 ? "+" : ""}{(adj.factor * 100).toFixed(0)}%
                    </span>
                  ))}
                </div>
              )}
              <ProximityBadges adjustments={adjustments ?? []} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
