"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted]       = useState(false);

  // Viewport-relative rect for the fixed dropdown
  const [dropRect, setDropRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const inputRef    = useRef<HTMLInputElement>(null);
  const dropRef     = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Needed for portal (only on client)
  useEffect(() => { setMounted(true); }, []);

  // Keep local input in sync when defaultValues change (edit form)
  useEffect(() => {
    if (addressVal && !inputValue) setInputValue(addressVal);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressVal]);

  function getRect() {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return null;
    // getBoundingClientRect() returns VIEWPORT-relative coordinates.
    // With position:fixed we must NOT add scrollY/scrollX.
    return { top: rect.bottom + 4, left: rect.left, width: rect.width };
  }

  async function fetchSuggestions(text: string) {
    if (text.trim().length < 3) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/ign/completion?text=${encodeURIComponent(text)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { status: string; results?: IGNResult[] } = await res.json();
      const list = data.results ?? [];
      setResults(list);
      if (list.length > 0) {
        setDropRect(getRect());
        setOpen(true);
      } else {
        setOpen(false);
      }
    } catch (err) {
      console.error("[IGN autocomplete]", err);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInputValue(val);
    setValue("address", val, { shouldValidate: false });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  }

  function handleSelect(result: IGNResult) {
    let street = result.fulltext;
    if (result.zipcode && result.city) {
      const suffix = `, ${result.zipcode} ${result.city}`;
      if (street.endsWith(suffix)) street = street.slice(0, -suffix.length);
    }
    setInputValue(street);
    setValue("address",    street,                 { shouldValidate: false });
    if (result.zipcode) setValue("postalCode", result.zipcode,           { shouldValidate: true });
    if (result.city)    setValue("city",       toTitleCase(result.city), { shouldValidate: true });
    setOpen(false);
    setResults([]);
  }

  // Close on outside click or scroll (reposition if scroll while open)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        inputRef.current && !inputRef.current.contains(e.target as Node) &&
        dropRef.current  && !dropRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleScroll() {
      if (open) setDropRect(getRect());
    }
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", handleScroll, true);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dropdown = open && results.length > 0 && dropRect ? (
    <ul
      ref={dropRef}
      style={{
        position: "fixed",
        top: dropRect.top,
        left: dropRect.left,
        width: dropRect.width,
        zIndex: 9999,
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: "0.375rem",
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        maxHeight: "15rem",
        overflowY: "auto",
        fontSize: "0.875rem",
        listStyle: "none",
        margin: 0,
        padding: 0,
      }}
    >
      {results.map((r, i) => (
        <li
          key={i}
          style={{ padding: "0.5rem 0.75rem", cursor: "pointer", lineHeight: 1.4 }}
          onMouseEnter={e => (e.currentTarget.style.background = "#f1f5f9")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          onMouseDown={(e) => {
            e.preventDefault();
            handleSelect(r);
          }}
        >
          {r.fulltext}
        </li>
      ))}
      <li
        style={{
          padding: "0.375rem 0.75rem",
          fontSize: "0.75rem",
          color: "#94a3b8",
          borderTop: "1px solid #e2e8f0",
        }}
      >
        Source : IGN Géoplateforme — Haute-Savoie (74)
      </li>
    </ul>
  ) : null;

  return (
    <div className="md:col-span-2 space-y-1">
      <Label htmlFor="address" className="flex items-center gap-1.5">
        Adresse{" "}
        <span className="text-xs font-normal text-muted-foreground">(optionnel)</span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </Label>
      <Input
        ref={inputRef}
        id="address"
        placeholder="12 rue des Alpes, Annecy…"
        autoComplete="off"
        value={inputValue}
        onChange={handleChange}
        onFocus={() => {
          if (results.length > 0) {
            setDropRect(getRect());
            setOpen(true);
          }
        }}
      />
      {errors.address && (
        <p className="text-xs text-destructive">{errors.address.message}</p>
      )}
      {mounted && createPortal(dropdown, document.body)}
    </div>
  );
}
