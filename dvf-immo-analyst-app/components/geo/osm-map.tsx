"use client";

import { useEffect, useRef } from "react";
import type { OsmPlace, OsmCategory } from "@/lib/geo/osm";

const CATEGORY_COLORS: Record<OsmCategory, string> = {
  school: "#2563eb",
  shop: "#f59e0b",
  transport: "#7c3aed",
  health: "#dc2626",
  park: "#16a34a",
};

const CATEGORY_LABELS: Record<OsmCategory, string> = {
  school: "École",
  shop: "Commerce",
  transport: "Transport",
  health: "Santé",
  park: "Parc",
};

interface Props {
  places: OsmPlace[];
  subjectLat: number;
  subjectLng: number;
}

function buildPopup(p: OsmPlace): string {
  return `
    <div style="min-width:160px;font-family:sans-serif;font-size:12px;line-height:1.6">
      <b>${p.name}</b><br/>
      <span style="color:#6b7280">${CATEGORY_LABELS[p.category]} · ${p.distanceM} m</span>
    </div>`;
}

export function OsmProximitiesMap({ places, subjectLat, subjectLng }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import("leaflet").Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    let L: typeof import("leaflet");

    const init = async () => {
      L = (await import("leaflet")).default;
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

      const map = L.map(mapRef.current!, { zoomControl: true });
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      // Subject marker (property)
      const subjectIcon = L.divIcon({
        className: "",
        html: `<div style="width:16px;height:16px;border-radius:50%;background:#1e3a5f;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      L.marker([subjectLat, subjectLng], { icon: subjectIcon })
        .addTo(map)
        .bindPopup("<b>Bien estimé</b>");

      // POI markers
      for (const p of places) {
        const color = CATEGORY_COLORS[p.category] ?? "#6b7280";
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });
        L.marker([p.lat, p.lng], { icon })
          .addTo(map)
          .bindPopup(buildPopup(p));
      }

      // Fit bounds
      const allLats = [subjectLat, ...places.map((p) => p.lat)];
      const allLngs = [subjectLng, ...places.map((p) => p.lng)];
      if (allLats.length > 1) {
        map.fitBounds(
          [[Math.min(...allLats), Math.min(...allLngs)], [Math.max(...allLats), Math.max(...allLngs)]],
          { padding: [30, 30], maxZoom: 15 }
        );
      } else {
        map.setView([subjectLat, subjectLng], 15);
      }
    };

    init().catch(console.error);
    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, [places, subjectLat, subjectLng]);

  return (
    <div className="space-y-2">
      <div ref={mapRef} style={{ height: 300, width: "100%", borderRadius: 8, border: "1px solid #e2e8f0" }} />
      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {(Object.entries(CATEGORY_COLORS) as [OsmCategory, string][]).map(([cat, color]) => (
          <span key={cat} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: color }} />
            {CATEGORY_LABELS[cat]}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-slate-600">
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#1e3a5f" }} />
          Bien estimé
        </span>
      </div>
    </div>
  );
}
