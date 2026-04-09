import { CONFIDENCE_COLORS } from "@/lib/constants";
import { ConfidenceFactors } from "@/types/valuation";

interface Props {
  score: number;
  label: string;
  factors?: ConfidenceFactors | null;
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="h-1.5 flex-1 min-w-[32px] rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] tabular-nums text-slate-500 shrink-0">{value}/{max}</span>
    </div>
  );
}

export function ConfidenceBadge({ score, label, factors }: Props) {
  const color = CONFIDENCE_COLORS[label] ?? "#6b7280";
  const pct = Math.round(score * 100);

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5 shadow-sm">
      {/* Ligne principale */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs font-semibold" style={{ color }}>Fiabilité : {label}</span>
        <span className="ml-auto text-xs font-bold tabular-nums" style={{ color }}>{pct}/100</span>
      </div>

      {/* Barre globale */}
      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>

      {/* Détail des 4 composantes */}
      {factors && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-0.5">
          {[
            { label: "Densité",       value: factors.density,     max: 30 },
            { label: "Fraîcheur",     value: factors.freshness,   max: 25 },
            { label: "Proximité",     value: factors.proximity,   max: 25 },
            { label: "Homogénéité",   value: factors.homogeneity, max: 20 },
          ].map(({ label: fl, value, max }) => (
            <div key={fl} className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium text-slate-500">{fl}</span>
              <MiniBar value={value} max={max} color={color} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

