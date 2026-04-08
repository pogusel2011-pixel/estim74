"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ESTIM74 Error]", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-red-100 rounded-xl shadow-sm p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-red-50 rounded-full">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
        </div>
        <h2 className="text-xl font-semibold text-slate-800 mb-2">
          Une erreur est survenue
        </h2>
        <p className="text-slate-500 text-sm mb-6">
          Un problème inattendu s'est produit. Veuillez réessayer ou contacter
          le support si le problème persiste.
        </p>
        {error.digest && (
          <p className="text-xs text-slate-400 font-mono mb-4">
            Référence : {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Réessayer
        </button>
      </div>
    </div>
  );
}
