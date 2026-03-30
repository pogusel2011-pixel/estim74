"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { propertySchema, PropertyFormValues } from "@/lib/validation/property";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { PROPERTY_TYPE_OPTIONS, CONDITION_OPTIONS, DPE_OPTIONS, ORIENTATION_OPTIONS, VIEW_OPTIONS } from "@/lib/mapping/options";
import { PropertyFeatures } from "./property-features";
import { CommuneSuggest } from "./commune-suggest";

interface PropertyFormProps {
  onSubmit: (values: PropertyFormValues) => void;
  loading?: boolean;
  defaultValues?: Partial<PropertyFormValues>;
}

export function PropertyForm({ onSubmit, loading, defaultValues }: PropertyFormProps) {
  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      condition: "AVERAGE",
      hasParking: false, hasGarage: false, hasBalcony: false,
      hasTerrace: false, hasCellar: false, hasPool: false, hasElevator: false,
      ...defaultValues,
    },
  });

  const { register, handleSubmit, setValue, watch, formState: { errors } } = form;
  const propertyType = watch("propertyType");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Localisation */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Localisation</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 space-y-1">
            <Label htmlFor="address" className="flex items-center gap-1">
              Adresse <span className="text-xs font-normal text-muted-foreground">(optionnel)</span>
            </Label>
            <Input id="address" placeholder="12 rue des Alpes" {...register("address")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="postalCode" className="flex items-center gap-1">
              Code postal <span className="text-xs font-normal text-muted-foreground">(optionnel)</span>
            </Label>
            <Input id="postalCode" placeholder="74000" maxLength={5} {...register("postalCode")} />
            {errors.postalCode && <p className="text-xs text-destructive">{errors.postalCode.message}</p>}
          </div>
          <CommuneSuggest form={form} />
        </CardContent>
      </Card>

      {/* Caractéristiques */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Caractéristiques</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>Type de bien</Label>
            <Select onValueChange={(v) => setValue("propertyType", v as never)} defaultValue={defaultValues?.propertyType}>
              <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
              <SelectContent>{PROPERTY_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            {errors.propertyType && <p className="text-xs text-destructive">Requis</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="surface">Surface (m²)</Label>
            <Input id="surface" type="number" min={1} placeholder="65" {...register("surface", { valueAsNumber: true })} />
            {errors.surface && <p className="text-xs text-destructive">{errors.surface.message}</p>}
          </div>

          <div className="space-y-1">
            <Label>État général</Label>
            <Select onValueChange={(v) => setValue("condition", v as never)} defaultValue={defaultValues?.condition ?? "AVERAGE"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CONDITION_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="rooms">Pièces</Label>
            <Input id="rooms" type="number" min={1} placeholder="3" {...register("rooms", { valueAsNumber: true })} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="bedrooms">Chambres</Label>
            <Input id="bedrooms" type="number" min={0} placeholder="2" {...register("bedrooms", { valueAsNumber: true })} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="yearBuilt">Année construction</Label>
            <Input id="yearBuilt" type="number" min={1800} max={2026} placeholder="1985" {...register("yearBuilt", { valueAsNumber: true })} />
          </div>

          {propertyType === "APARTMENT" && (
            <>
              <div className="space-y-1">
                <Label htmlFor="floor">Étage</Label>
                <Input id="floor" type="number" min={0} placeholder="2" {...register("floor", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="totalFloors">Nbre étages total</Label>
                <Input id="totalFloors" type="number" min={1} placeholder="5" {...register("totalFloors", { valueAsNumber: true })} />
              </div>
            </>
          )}

          {(propertyType === "HOUSE" || propertyType === "LAND") && (
            <div className="space-y-1">
              <Label htmlFor="landSurface">Surface terrain (m²)</Label>
              <Input id="landSurface" type="number" min={0} placeholder="500" {...register("landSurface", { valueAsNumber: true })} />
            </div>
          )}

          {propertyType === "HOUSE" && (
            <div className="space-y-1">
              <Label>Mitoyenneté</Label>
              <Select
                onValueChange={(v) => setValue("mitoyennete", v as never)}
                defaultValue={defaultValues?.mitoyennete}
              >
                <SelectTrigger><SelectValue placeholder="Type de maison" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individuelle">Maison individuelle (référence)</SelectItem>
                  <SelectItem value="mitoyenne_un_cote">Mitoyenne d&apos;un côté (-4%)</SelectItem>
                  <SelectItem value="mitoyenne_deux_cotes">Mitoyenne des deux côtés (-7%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Énergie */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Énergie & exposition</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>DPE</Label>
            <Select onValueChange={(v) => setValue("dpeLetter", v as never)} defaultValue={defaultValues?.dpeLetter}>
              <SelectTrigger><SelectValue placeholder="Classe énergie" /></SelectTrigger>
              <SelectContent>{DPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Orientation</Label>
            <Select onValueChange={(v) => setValue("orientation", v as never)} defaultValue={defaultValues?.orientation}>
              <SelectTrigger><SelectValue placeholder="Orientation" /></SelectTrigger>
              <SelectContent>{ORIENTATION_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Vue</Label>
            <Select onValueChange={(v) => setValue("view", v)} defaultValue={defaultValues?.view}>
              <SelectTrigger><SelectValue placeholder="Type de vue" /></SelectTrigger>
              <SelectContent>{VIEW_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Options & équipements */}
      <PropertyFeatures form={form} />

      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Estimation en cours...</> : "Lancer l'estimation"}
      </Button>
    </form>
  );
}
