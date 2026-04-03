"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PropertyForm } from "@/components/forms/property-form";
import { PropertyFormValues } from "@/lib/validation/property";

export default function EditAnalysisPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [defaultValues, setDefaultValues] = useState<Partial<PropertyFormValues> | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Charger le dossier existant
  useEffect(() => {
    fetch(`/api/analyses/${params.id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Dossier introuvable");
        return r.json();
      })
      .then((data) => {
        // Mapper les champs du dossier vers les champs du formulaire
        const vals: Partial<PropertyFormValues> = {
          address: data.address ?? "",
          postalCode: data.postalCode ?? "",
          city: data.city ?? "",
          lat: data.lat ?? undefined,
          lng: data.lng ?? undefined,
          propertyType: data.propertyType ?? undefined,
          surface: data.surface ?? undefined,
          rooms: data.rooms ?? undefined,
          bedrooms: data.bedrooms ?? undefined,
          floor: data.floor ?? undefined,
          totalFloors: data.totalFloors ?? undefined,
          landSurface: data.landSurface ?? undefined,
          yearBuilt: data.yearBuilt ?? undefined,
          condition: data.condition ?? "AVERAGE",
          dpeLetter: data.dpeLetter ?? undefined,
          hasParking: data.hasParking ?? false,
          hasGarage: data.hasGarage ?? false,
          hasBalcony: data.hasBalcony ?? false,
          hasTerrace: data.hasTerrace ?? false,
          hasCellar: data.hasCellar ?? false,
          hasPool: data.hasPool ?? false,
          hasElevator: data.hasElevator ?? false,
          orientation: data.orientation ?? undefined,
          view: data.view ?? undefined,
          mitoyennete: data.mitoyennete ?? undefined,
          clientFirstName: data.clientFirstName ?? undefined,
          clientLastName: data.clientLastName ?? undefined,
          clientAddress: data.clientAddress ?? undefined,
          clientEmail: data.clientEmail ?? undefined,
          clientPhone: data.clientPhone ?? undefined,
        };
        setDefaultValues(vals);
      })
      .catch((e) => setFetchError(e.message));
  }, [params.id]);

  async function handleSubmit(values: PropertyFormValues) {
    setLoading(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/analyses/${params.id}/resimulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, radiusKm: 0.5, monthsBack: 24 }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erreur lors de l'estimation");
      }

      router.push(`/analyses/${params.id}`);
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erreur inconnue");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
            <Link href="/analyses">
              <ArrowLeft className="h-4 w-4" />
              Retour aux analyses
            </Link>
          </Button>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href={`/analyses/${params.id}`}>
            <BarChart2 className="h-4 w-4" />
            Voir le dashboard
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Modifier l'estimation</h1>
        <p className="text-muted-foreground text-sm">
          Modifiez les caractéristiques du bien et relancez l'estimation. Le dossier existant sera mis à jour.
        </p>
      </div>

      {fetchError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {fetchError}
        </div>
      )}
      {submitError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {submitError}
        </div>
      )}

      {defaultValues === null && !fetchError && (
        <div className="text-sm text-muted-foreground animate-pulse">Chargement du dossier…</div>
      )}

      {defaultValues !== null && (
        <PropertyForm
          onSubmit={handleSubmit}
          loading={loading}
          defaultValues={defaultValues}
        />
      )}
    </div>
  );
}
