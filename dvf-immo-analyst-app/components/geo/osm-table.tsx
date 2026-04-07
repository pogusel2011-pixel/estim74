import type { OsmPlace, OsmCategory } from "@/lib/geo/osm";

const CATEGORY_LABELS: Record<OsmCategory, string> = {
  school: "École",
  shop: "Commerce",
  transport: "Transport",
  health: "Santé",
  park: "Espace vert",
};

const CATEGORY_EMOJI: Record<OsmCategory, string> = {
  school: "🏫",
  shop: "🛒",
  transport: "🚌",
  health: "🏥",
  park: "🌳",
};

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
    <div className="space-y-4">
      {(["school", "shop", "transport", "health", "park"] as OsmCategory[]).map((cat) => {
        const items = grouped.get(cat);
        if (!items || items.length === 0) return null;
        return (
          <div key={cat}>
            <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
              <span>{CATEGORY_EMOJI[cat]}</span>
              {CATEGORY_LABELS[cat]}
            </h4>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Nom</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600">Distance</th>
                  </tr>
                </thead>
                <tbody>
                  {items.sort((a, b) => a.distanceM - b.distanceM).map((p, i) => (
                    <tr key={p.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="px-3 py-2 text-slate-700">{p.name}</td>
                      <td className="px-3 py-2 text-right text-slate-500 font-mono tabular-nums">
                        {p.distanceM < 1000
                          ? `${p.distanceM} m`
                          : `${(p.distanceM / 1000).toFixed(1)} km`}
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
