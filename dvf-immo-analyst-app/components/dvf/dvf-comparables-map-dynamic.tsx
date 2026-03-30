"use client";
/**
 * Wrapper dynamique pour DVFComparablesMap.
 * Leaflet utilise `window` / `document` — il faut désactiver le SSR.
 */
import dynamic from "next/dynamic";

export const DVFComparablesMapDynamic = dynamic(
  () => import("./dvf-comparables-map").then((m) => m.DVFComparablesMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[300px] rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
        Chargement de la carte…
      </div>
    ),
  }
);
