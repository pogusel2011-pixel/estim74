"use client";

import dynamic from "next/dynamic";

export const OsmProximitiesMapDynamic = dynamic(
  () => import("./osm-map").then((m) => m.OsmProximitiesMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[300px] rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
        Chargement de la carte…
      </div>
    ),
  }
);
