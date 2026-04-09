import type { OsmPlace, OsmCategory } from "@/lib/geo/osm";

const CATEGORY_LABELS: Record<OsmCategory, string> = {
  school: "Écoles",
  shop: "Commerces",
  transport: "Transports",
  health: "Santé",
  park: "Espaces verts",
};

const CATEGORY_EMOJI: Record<OsmCategory, string> = {
  school: "🏫",
  shop: "🛒",
  transport: "🚌",
  health: "🏥",
  park: "🌳",
};

/** Walking time at 4.5 km/h = 75 m/min */
function walkingTime(distanceM: number): string {
  const minutes = Math.max(1, Math.round(distanceM / 75));
  return `~${minutes} min`;
}

function formatDist(distanceM: number): string {
  return distanceM < 1000
    ? `${distanceM} m`
    : `${(distanceM / 1000).toFixed(1)} km`;
}

interface Props {
  places: OsmPlace[];
}

export function OsmProximitiesTable({ places }: Props) {
  if (places.length === 0) {
    return (
      <p className="text-sm text-slate-500 italic">Aucun équipement trouvé dans un rayon de 1 km.</p>
    );
  }

  // Group by category
  const grouped = new Map<OsmCategory, OsmPlace[]>();
  for (const p of places) {
    if (!grouped.has(p.category)) grouped.set(p.category, []);
    grouped.get(p.category)!.push(p);
  }

  return (
    <div className="space-y-3">
      {(["school", "shop", "transport", "health", "park"] as OsmCategory[]).map((cat) => {
        const items = grouped.get(cat);
        if (!items || items.length === 0) return null;
        const sorted = [...items].sort((a, b) => a.distanceM - b.distanceM);
        return (
          <div key={cat}>
            <h4 className="text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5 uppercase tracking-wide">
              <span>{CATEGORY_EMOJI[cat]}</span>
              {CATEGORY_LABELS[cat]}
              <span className="font-normal text-slate-400 normal-case tracking-normal">({items.length})</span>
            </h4>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-1.5 font-medium text-slate-500">Nom</th>
                    <th className="text-right px-3 py-1.5 font-medium text-slate-500">Distance</th>
                    <th className="text-right px-3 py-1.5 font-medium text-slate-500">À pied</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p, i) => (
                    <tr key={p.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="px-3 py-1.5 text-slate-700 max-w-[200px] truncate" title={p.name}>{p.name}</td>
                      <td className="px-3 py-1.5 text-right text-slate-500 font-mono tabular-nums">
                        {formatDist(p.distanceM)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-400 tabular-nums">
                        {walkingTime(p.distanceM)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

