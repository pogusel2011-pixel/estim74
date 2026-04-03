"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PropertyForm } from "@/components/forms/property-form";
import { PropertyFormValues } from "@/lib/validation/property";

export default function NewAnalysisPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: PropertyFormValues) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property: values,
          radiusKm: 0.5,
          monthsBack: 24,
          excludeOutliers: true,
          includeListings: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Erreur lors de l'estimation");
      }

      const data = await res.json();
      if (data.analysisId) {
        router.push("/analyses/" + data.analysisId + "?nouveau=1");
      } else {
        setError("L'estimation a réussi mais aucun identifiant retourné.");
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nouvelle estimation</h1>
        <p className="text-muted-foreground text-sm">Renseignez les caractéristiques du bien à estimer</p>
      </div>
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}
      <PropertyForm onSubmit={handleSubmit} loading={loading} />
    </div>
  );
}
