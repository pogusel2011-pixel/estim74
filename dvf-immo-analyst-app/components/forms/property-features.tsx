"use client";
import { UseFormReturn } from "react-hook-form";
import { PropertyFormValues } from "@/lib/validation/property";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const FEATURES = [
  { key: "hasParking", label: "Parking" },
  { key: "hasGarage", label: "Garage" },
  { key: "hasBalcony", label: "Balcon" },
  { key: "hasTerrace", label: "Terrasse" },
  { key: "hasCellar", label: "Cave" },
  { key: "hasPool", label: "Piscine" },
  { key: "hasElevator", label: "Ascenseur" },
] as const;

const CONTRAINTES = [
  { key: "hasBruit",             label: "Nuisances sonores", detail: "-3%" },
  { key: "hasCopropDegradee",    label: "Copropriété dégradée", detail: "-5%" },
  { key: "hasExpositionNord",    label: "Exposition Nord", detail: "-2%" },
  { key: "hasRDCSansExterieur",  label: "RDC sans extérieur", detail: "-2%" },
] as const;

export function PropertyFeatures({ form }: { form: UseFormReturn<PropertyFormValues> }) {
  const { watch, setValue } = form;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Options & équipements</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {FEATURES.map(({ key, label }) => {
              const checked = watch(key as keyof PropertyFormValues) as boolean;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setValue(key as never, !checked as never)}
                  className={cn(
                    "px-3 py-1.5 rounded-full border text-sm font-medium transition-colors",
                    checked
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-orange-200 dark:border-orange-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-400 flex-shrink-0" />
            Contraintes du bien
            <span className="text-xs font-normal text-muted-foreground ml-1">(malus appliqués si cochés)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {CONTRAINTES.map(({ key, label, detail }) => {
              const checked = watch(key as keyof PropertyFormValues) as boolean;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setValue(key as never, !checked as never)}
                  className={cn(
                    "px-3 py-1.5 rounded-full border text-sm font-medium transition-colors flex items-center gap-1.5",
                    checked
                      ? "bg-orange-100 text-orange-800 border-orange-400 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-600"
                      : "bg-background text-muted-foreground border-orange-200 hover:border-orange-400 hover:text-orange-700 dark:border-orange-800"
                  )}
                >
                  {label}
                  <span className={cn(
                    "text-xs",
                    checked ? "text-orange-600 dark:text-orange-300" : "text-muted-foreground"
                  )}>
                    {detail}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
