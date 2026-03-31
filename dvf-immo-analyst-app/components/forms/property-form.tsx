"use client";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { propertySchema, PropertyFormValues } from "@/lib/validation/property";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap } from "lucide-react";
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
  const addressVal   = watch("address") ?? "";
  const postalCodeVal = watch("postalCode") ?? "";
  const dpeLetter    = watch("dpeLetter");

  // ── DPE auto-fetch (Pappers Immobilier) ────────────────────────────────────
  const [dpeFetched, setDpeFetched]     = useState<"dpe" | "year" | "both" | null>(null);
  const [dpeFetching, setDpeFetching]   = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // On déclenche quand adresse (≥10 car.) + code postal (74xxx) sont renseignés
    const trimAddr = addressVal.trim();
    const trimCp   = postalCodeVal.trim();
    if (trimAddr.length < 10 || trimCp.length < 5) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setDpeFetching(true);
      setDpeFetched(null);
      try {
        const params = new URLSearchParams({ adresse: trimAddr, postalCode: trimCp });
        const res = await fetch(`/api/pappers/enrich?${params}`);
        if (!res.ok) return;
        const data: { dpeLetter?: string | null; yearBuilt?: number | null } = await res.json();

        let enriched: "dpe" | "year" | "both" | null = null;

        if (data.dpeLetter) {
          setValue("dpeLetter", data.dpeLetter as "A"|"B"|"C"|"D"|"E"|"F"|"G", { shouldValidate: false });
          enriched = "dpe";
        }
        if (data.yearBuilt) {
          setValue("yearBuilt", data.yearBuilt, { shouldValidate: false });
          enriched = enriched === "dpe" ? "both" : "year";
        }
        setDpeFetched(enriched);
      } catch {
        // silencieux
      } finally {
        setDpeFetching(false);
      }
    }, 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [addressVal, postalCodeVal, setValue]);

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
            <Label htmlFor="yearBuilt">
              Année construction
              {dpeFetched === "year" || dpeFetched === "both" ? (
                <Badge variant="secondary" className="ml-2 gap-1 text-xs font-normal py-0">
                  <Zap className="h-3 w-3 text-amber-500" />
                  Récupérée
                </Badge>
              ) : null}
            </Label>
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
            <Label className="flex items-center gap-2">
              DPE
              {dpeFetching && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
              {(dpeFetched === "dpe" || dpeFetched === "both") && !dpeFetching ? (
                <Badge variant="secondary" className="gap-1 text-xs font-normal py-0 bg-green-50 text-green-700 border-green-200">
                  <Zap className="h-3 w-3" />
                  DPE récupéré automatiquement
                </Badge>
              ) : null}
            </Label>
            <Select
              onValueChange={(v) => {
                setValue("dpeLetter", v as never);
                setDpeFetched(null);
              }}
              value={dpeLetter ?? ""}
            >
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

      {/* Destinataire de l'avis de valeur */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Destinataire de l'avis de valeur <span className="normal-case text-xs font-normal">(optionnel)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label>Prénom</Label>
              <Input {...register("clientFirstName")} placeholder="Prénom" />
            </div>
            <div className="space-y-1">
              <Label>Nom</Label>
              <Input {...register("clientLastName")} placeholder="NOM" />
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input {...register("clientEmail")} type="email" placeholder="email@exemple.fr" />
            </div>
            <div className="space-y-1">
              <Label>Téléphone</Label>
              <Input {...register("clientPhone")} type="tel" placeholder="06 XX XX XX XX" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Adresse</Label>
            <Input {...register("clientAddress")} placeholder="Adresse du destinataire (optionnel)" />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Estimation en cours...</> : "Lancer l'estimation"}
      </Button>
    </form>
  );
}
