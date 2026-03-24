import { CONFIDENCE_COLORS } from "@/lib/constants";
import { Progress } from "@/components/ui/progress";

interface Props { score: number; label: string; }

export function ConfidenceBadge({ score, label }: Props) {
  const color = CONFIDENCE_COLORS[label] ?? "#6b7280";
  return (
    <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 shadow-sm">
      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs font-medium">Fiabilité : {label}</span>
      <Progress value={score * 100} className="w-16 h-1.5" />
      <span className="text-xs text-muted-foreground">{Math.round(score * 100)}%</span>
    </div>
  );
}
