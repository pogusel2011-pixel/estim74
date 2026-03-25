"use client";
import { useEffect, useRef, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { PropertyFormValues } from "@/lib/validation/property";
import { getCommunesByPostalCode } from "@/lib/geo/cp-insee";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface Props {
  form: UseFormReturn<PropertyFormValues>;
}

/** Capitalise "ALBY-SUR-CHERAN" → "Alby-sur-Cheran" */
function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(-|\s)/)
    .map((w) => (/^[a-zéèêëàâîïùûüç]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join("");
}

export function CommuneSuggest({ form }: Props) {
  const { register, setValue, watch, formState: { errors } } = form;

  const postalCode = watch("postalCode") ?? "";
  const cityValue  = watch("city") ?? "";

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Derive suggestions whenever postalCode or typed city changes
  useEffect(() => {
    const trimCp = (postalCode ?? "").trim();
    if (trimCp.length !== 5 || !trimCp.startsWith("74")) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const entries = getCommunesByPostalCode(trimCp);
    if (entries.length === 0) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const cityQ = (cityValue ?? "").trim().toUpperCase();
    const filtered = entries
      .filter((e) => !cityQ || e.commune.startsWith(cityQ))
      .map((e) => toTitleCase(e.commune));

    setSuggestions(filtered);
    // Auto-open only if there are suggestions and city is not already a perfect match
    const exact = filtered.some((f) => f.toUpperCase() === cityQ);
    setOpen(filtered.length > 0 && !exact);
  }, [postalCode, cityValue]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectCommune(name: string) {
    setValue("city", name, { shouldValidate: true });
    setOpen(false);
  }

  return (
    <div className="space-y-1 relative" ref={containerRef}>
      <Label htmlFor="city" className="flex items-center gap-1">
        Commune <span className="text-destructive">*</span>
      </Label>
      <Input
        id="city"
        placeholder="Annecy"
        autoComplete="off"
        {...register("city")}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
      />
      {errors.city && (
        <p className="text-xs text-destructive">{errors.city.message}</p>
      )}

      {/* Suggestions dropdown */}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-52 overflow-y-auto text-sm">
          {suggestions.map((name) => (
            <li
              key={name}
              className="px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground select-none"
              onMouseDown={(e) => {
                e.preventDefault(); // prevent input blur before click registers
                selectCommune(name);
              }}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
