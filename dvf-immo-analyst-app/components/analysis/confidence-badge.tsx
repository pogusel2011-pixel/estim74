import { CONFIDENCE_COLORS } from "@/lib/constants";
import { Progress } from "@/components/ui/progress";
import { ConfidenceFactors } from "@/types/valuation";

interface Props {
  score: number;
  label: string;
  factors?: ConfidenceFactors | null;
}

export function ConfidenceBadge({ score, label, factors }: Props) {
  const color = CONFIDENCE_COLORS[label] ?? "#6b7280";
  const pct = Math.round(score * 100);

  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card px-3 py-2 shadow-sm">
      {/* Ligne principale */}
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs font-medium">Qualité des données : {label}</span>
        <Progress value={pct} className="w-16 h-1.5" />
        <span className="text-xs text-muted-foreground">{pct}/100</span>
      </div>

      {/* Détail des 4 composantes (si disponibles) */}
      {factors && (
        <div className="text-[10px] text-muted-foreground pl-4 flex flex-wrap gap-x-3 gap-y-0.5">
          <span>
            <span className="font-medium text-foreground/70">Densité</span>{" "}
            {factors.density}/30
          </span>
          <span>
            <span className="font-medium text-foreground/70">Fraîcheur</span>{" "}
            {factors.freshness}/25
          </span>
          <span>
            <span className="font-medium text-foreground/70">Proximité</span>{" "}
            {factors.proximity}/25
          </span>
          <span>
            <span className="font-medium text-foreground/70">Homogénéité</span>{" "}
            {factors.homogeneity}/20
          </span>
        </div>
      )}
    </div>
  );
}
