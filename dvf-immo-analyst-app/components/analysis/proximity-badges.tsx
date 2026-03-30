import { Adjustment } from "@/types/valuation";
import { TrendingUp, TrendingDown, Waves, Mountain, Car, School, ShoppingCart, Train } from "lucide-react";

interface Props {
  adjustments: Adjustment[];
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  lake:     <Waves className="h-3.5 w-3.5" />,
  ski:      <Mountain className="h-3.5 w-3.5" />,
  motorway: <Car className="h-3.5 w-3.5" />,
  school:   <School className="h-3.5 w-3.5" />,
  shop:     <ShoppingCart className="h-3.5 w-3.5" />,
  train:    <Train className="h-3.5 w-3.5" />,
};

/** Infers the icon from the adjustment label content. */
function inferIcon(label: string): React.ReactNode {
  const l = label.toLowerCase();
  if (l.includes("lac")) return CATEGORY_ICONS.lake;
  if (l.includes("ski") || l.includes("station")) return CATEGORY_ICONS.ski;
  if (l.includes("autoroute")) return CATEGORY_ICONS.motorway;
  if (l.includes("école") || l.includes("ecole")) return CATEGORY_ICONS.school;
  if (l.includes("commerce")) return CATEGORY_ICONS.shop;
  if (l.includes("gare")) return CATEGORY_ICONS.train;
  return null;
}

export function ProximityBadges({ adjustments }: Props) {
  const proximityAdjs = adjustments.filter((a) => a.category === "proximity");
  if (proximityAdjs.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Proximité équipements
      </p>
      <div className="flex flex-wrap gap-1.5">
        {proximityAdjs.map((adj, i) => {
          const isPos = adj.factor > 0;
          const isNeg = adj.factor < 0;
          const icon = inferIcon(adj.label);
          return (
            <span
              key={i}
              className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium ${
                isNeg
                  ? "border-red-200 bg-red-50 text-red-800"
                  : isPos
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-border bg-background text-foreground"
              }`}
            >
              {icon && <span className="opacity-70">{icon}</span>}
              <span>{adj.label}</span>
              <span
                className={`ml-0.5 font-semibold ${
                  isNeg ? "text-red-600" : "text-emerald-700"
                }`}
              >
                {adj.factor > 0 ? "+" : ""}
                {(adj.factor * 100).toFixed(1)}%
              </span>
              {isPos ? (
                <TrendingUp className="h-3 w-3 text-emerald-600 opacity-60" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-500 opacity-60" />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
