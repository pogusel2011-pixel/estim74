import type { SwotResult, SwotItem } from "@/lib/analysis/swot";

const CATEGORY_LABELS: Record<SwotItem["category"], string> = {
  energie: "Énergie",
  etat: "État",
  equipement: "Équipements",
  localisation: "Localisation",
  risque: "Risques",
  urbanisme: "Urbanisme",
  marche: "Marché",
  proximite: "Proximité",
};

interface Props {
  swot: SwotResult;
}

export function SwotTable({ swot }: Props) {
  const { strengths, weaknesses } = swot;

  if (strengths.length === 0 && weaknesses.length === 0) {
    return (
      <p className="text-sm text-slate-500 italic">Analyse forces/faiblesses non disponible.</p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Forces */}
      <div>
        <h4 className="text-sm font-semibold text-emerald-700 mb-3 flex items-center gap-1.5">
          <span>✅</span>
          Points forts ({strengths.length})
        </h4>
        <div className="space-y-1.5">
          {strengths.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Aucun point fort identifié</p>
          ) : (
            strengths.map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100"
              >
                <span className="text-emerald-500 shrink-0 mt-0.5">✅</span>
                <div className="min-w-0">
                  <span className="text-xs font-medium text-emerald-800">{item.label}</span>
                  {item.detail && (
                    <span className="block text-xs text-emerald-600 opacity-75">{item.detail}</span>
                  )}
                  <span className="inline-block mt-0.5 text-xs px-1.5 py-0 rounded-full bg-emerald-100 text-emerald-600 border border-emerald-200">
                    {CATEGORY_LABELS[item.category]}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Faiblesses */}
      <div>
        <h4 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-1.5">
          <span>❌</span>
          Points de vigilance ({weaknesses.length})
        </h4>
        <div className="space-y-1.5">
          {weaknesses.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Aucune faiblesse identifiée</p>
          ) : (
            weaknesses.map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100"
              >
                <span className="text-red-500 shrink-0 mt-0.5">❌</span>
                <div className="min-w-0">
                  <span className="text-xs font-medium text-red-800">{item.label}</span>
                  {item.detail && (
                    <span className="block text-xs text-red-600 opacity-75">{item.detail}</span>
                  )}
                  <span className="inline-block mt-0.5 text-xs px-1.5 py-0 rounded-full bg-red-100 text-red-600 border border-red-200">
                    {CATEGORY_LABELS[item.category]}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
