"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { PropertyFormValues } from "@/lib/validation/property";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface IGNResult {
  fulltext: string;
  x: number;
  y: number;
  city?: string;
  zipcode?: string;
  street?: string;
  housenum?: string;
  kind?: string;
}

interface Props {
  form: UseFormReturn<PropertyFormValues>;
}

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(-|\s)/)
    .map((w) => (/^[a-zéèêëàâîïùûüçœ]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join("");
}

export function AddressAutocomplete({ form }: Props) {
  const { setValue, watch, formState: { errors } } = form;
  const addressVal = watch("address") ?? "";

  const [inputValue, setInputValue] = useState(addressVal);
  const [results, setResults]       = useState<IGNResult[]>([]);
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(false);

  // Keep local input in sync when defaultValues change (edit form)
  useEffect(() => {
    if (addressVal && !inputValue) setInputValue(addressVal);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressVal]);

  const fetchSuggestions = useCallback(async (text: string) => {
    if (text.trim().length < 3) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const url = new URL("/api/ign/completion", window.location.origin);
      url.searchParams.set("text", text);
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return;
      const data: { status: string; results?: IGNResult[] } = await res.json();
      setResults(data.results ?? []);
      setOpen((data.results ?? []).length > 0);
    } catch {
      // silencieux
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInputValue(val);
    selectedRef.current = false;
    setValue("address", val, { shouldValidate: false });

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  }

  function handleSelect(result: IGNResult) {
    selectedRef.current = true;

    // Extract street-only part from fulltext: remove "zipcode city" suffix
    let street = result.fulltext;
    if (result.zipcode && result.city) {
      const suffix = `, ${result.zipcode} ${result.city}`;
      if (street.endsWith(suffix)) street = street.slice(0, -suffix.length);
    }

    setInputValue(street);
    setValue("address",    street,                    { shouldValidate: false });
    if (result.zipcode) setValue("postalCode", result.zipcode,              { shouldValidate: true });
    if (result.city)    setValue("city",       toTitleCase(result.city),    { shouldValidate: true });

    setOpen(false);
    setResults([]);
  }

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="md:col-span-2 space-y-1 relative" ref={containerRef}>
      <Label htmlFor="address" className="flex items-center gap-1.5">
        Adresse{" "}
        <span className="text-xs font-normal text-muted-foreground">(optionnel)</span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </Label>
      <Input
        id="address"
        placeholder="12 rue des Alpes, Annecy…"
        autoComplete="off"
        value={inputValue}
        onChange={handleChange}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {errors.address && (
        <p className="text-xs text-destructive">{errors.address.message}</p>
      )}

      {open && results.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-60 overflow-y-auto text-sm">
          {results.map((r, i) => (
            <li
              key={i}
              className="px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground select-none leading-snug"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(r);
              }}
            >
              <span className="font-medium">{r.fulltext}</span>
            </li>
          ))}
          <li className="px-3 py-1.5 text-xs text-muted-foreground border-t border-border select-none">
            Source : IGN Géoplateforme — Haute-Savoie (74)
          </li>
        </ul>
      )}
    </div>
  );
}
