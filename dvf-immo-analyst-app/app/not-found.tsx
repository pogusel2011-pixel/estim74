import Link from "next/link";
import { FileSearch, Home, BarChart3 } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-slate-100 rounded-full">
            <FileSearch className="h-10 w-10 text-slate-400" />
          </div>
        </div>
        <h1 className="text-4xl font-bold text-slate-800 mb-2">404</h1>
        <h2 className="text-xl font-semibold text-slate-700 mb-3">
          Page introuvable
        </h2>
        <p className="text-slate-500 text-sm mb-8 leading-relaxed">
          L&apos;analyse ou la page que vous recherchez n&apos;existe pas ou a
          été supprimée. Vérifiez l&apos;URL ou retournez à l&apos;accueil.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Home className="h-4 w-4" />
            Accueil
          </Link>
          <Link
            href="/analyses"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-slate-700 text-sm font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <BarChart3 className="h-4 w-4" />
            Mes analyses
          </Link>
        </div>
      </div>
    </div>
  );
}
