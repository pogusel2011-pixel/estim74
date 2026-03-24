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

export function PropertyFeatures({ form }: { form: UseFormReturn<PropertyFormValues> }) {
  const { watch, setValue } = form;

  return (
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
                  checked ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
