"use client";

import { useEffect, useRef, useMemo } from "react";
import { DVFComparable } from "@/types/dvf";
import { formatPrice, formatPsm, formatDateShort } from "@/lib/utils";

interface Props {
  comparables: DVFComparable[];
  subjectLat: number;
  subjectLng: number;
  perimeterKm?: number | null;
}

function buildPopup(c: DVFComparable): string {
  const star = c.topComparable ? "★ Comparable clé<br/>" : "";
  const outlierBadge = c.outlier ? '<span style="color:#dc2626;font-weight:600">⚠ Outlier exclu</span><br/>' : "";
  return `
    <div style="min-width:180px;font-family:sans-serif;font-size:12px;line-height:1.6">
      ${outlierBadge}
      ${star ? `<span style="color:#2563eb;font-weight:600">${star}</span>` : ""}
      <b>${c.type}</b> — ${c.surface} m²${c.rooms ? ` / ${c.rooms} p.` : ""}<br/>
      <b>${formatPrice(c.price)}</b> · <b style="color:#2563eb">${formatPsm(c.pricePsm)}</b><br/>
      ${c.indexedPricePsm ? `<span style="color:#16a34a">Indexé 2025 : ${formatPsm(c.indexedPricePsm)}</span><br/>` : ""}
      <span style="color:#6b7280">${formatDateShort(c.date)} · ${c.city}</span><br/>
      ${c.distanceM != null ? `<span style="color:#6b7280">${Math.round(c.distanceM)} m du bien</span>` : ""}
    </div>`;
}

export function DVFComparablesMap({ comparables, subjectLat, subjectLng, perimeterKm }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import("leaflet").Map | null>(null);

  const withCoords = useMemo(
    () => comparables.filter((c) => c.lat != null && c.lng != null),
    [comparables]
  );

  useEffect(() => {
    if (!mapRef.current) return;

    let L: typeof import("leaflet");

    const init = async () => {
      L = (await import("leaflet")).default;

      // Fix Leaflet default icon broken by webpack (cast via unknown required by strict TS)
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const map = L.map(mapRef.current!).setView([subjectLat, subjectLng], 14);
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // ── Cercle de périmètre ──────────────────────────────────────────────
      if (perimeterKm) {
        L.circle([subjectLat, subjectLng], {
          radius: perimeterKm * 1000,
          color: "#3b82f6",
          fillColor: "#3b82f6",
          fillOpacity: 0.04,
          weight: 1.5,
          dashArray: "6 4",
        }).addTo(map);
      }

      // ── Icônes personnalisées ──────────────────────────────────────────
      const makeIcon = (color: string, size: [number, number] = [14, 14]) =>
        L.divIcon({
          className: "",
          html: `<div style="
            width:${size[0]}px;height:${size[1]}px;
            border-radius:50%;
            background:${color};
            border:2.5px solid white;
            box-shadow:0 1px 4px rgba(0,0,0,0.4);
          "></div>`,
          iconSize: size,
          iconAnchor: [size[0] / 2, size[1] / 2],
          popupAnchor: [0, -size[1] / 2],
        });

      const subjectIcon = L.divIcon({
        className: "",
        html: `<div style="
          width:18px;height:18px;
          border-radius:50%;
          background:#1d4ed8;
          border:3px solid white;
          box-shadow:0 2px 6px rgba(0,0,0,0.5);
          display:flex;align-items:center;justify-content:center;
        "></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -12],
      });

      // ── Pin du bien sujet ────────────────────────────────────────────────
      L.marker([subjectLat, subjectLng], { icon: subjectIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup(`<div style="font-family:sans-serif;font-size:12px"><b style="color:#1d4ed8">📍 Bien à estimer</b></div>`)
        .openPopup();

      // ── Pins des comparables ─────────────────────────────────────────────
      withCoords.forEach((c) => {
        const isTop = c.topComparable && !c.outlier;
        const isOutlier = c.outlier;
        const color = isOutlier ? "#dc2626" : isTop ? "#16a34a" : "#22c55e";
        const size: [number, number] = isOutlier ? [10, 10] : isTop ? [16, 16] : [12, 12];
        const icon = makeIcon(color, size);

        L.marker([c.lat!, c.lng!], { icon })
          .addTo(map)
          .bindPopup(buildPopup(c), { maxWidth: 240 });
      });

      // ── Ajuste la vue pour englober tous les pins ────────────────────────
      const allCoords: [number, number][] = [
        [subjectLat, subjectLng],
        ...withCoords.map((c): [number, number] => [c.lat!, c.lng!]),
      ];
      if (allCoords.length > 1) {
        map.fitBounds(L.latLngBounds(allCoords).pad(0.15));
      }
    };

    init();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [subjectLat, subjectLng, perimeterKm, withCoords]);

  const retained = comparables.filter((c) => !c.outlier);
  const outliers = comparables.filter((c) => c.outlier);
  const noCoords = withCoords.length === 0 && comparables.length > 0;

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Légende */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap px-1">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-700 border-2 border-white shadow"></span>
          Bien estimé
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-4 rounded-full bg-green-600 border-2 border-white shadow"></span>
          Comparable clé ★
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-green-400 border-2 border-white shadow"></span>
          Comparable retenu ({retained.length})
        </span>
        {outliers.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 border-2 border-white shadow"></span>
            Outlier exclu ({outliers.length})
          </span>
        )}
        {noCoords && (
          <span className="text-amber-600 ml-auto">
            ⚠ Re-simuler l&apos;analyse pour afficher les pins comparables
          </span>
        )}
      </div>

      {/* Carte */}
      <div ref={mapRef} className="flex-1 rounded-lg overflow-hidden border border-border" style={{ minHeight: 260 }} />
    </div>
  );
}
