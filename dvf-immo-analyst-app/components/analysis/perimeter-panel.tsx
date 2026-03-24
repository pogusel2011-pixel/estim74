import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin } from "lucide-react";

interface Props { lat?: number | null; lng?: number | null; perimeterKm?: number | null; }

export function PerimeterPanel({ lat, lng, perimeterKm }: Props) {
  if (!lat || !lng) {
    return (
      <Card className="flex-1">
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">Coordonnées non disponibles</CardContent>
      </Card>
    );
  }

  const zoom = perimeterKm && perimeterKm > 1 ? 13 : 15;
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.01}&layer=mapnik&marker=${lat},${lng}`;

  return (
    <Card className="flex-1">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Localisation{perimeterKm ? ` • Périmètre ${perimeterKm} km` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-hidden rounded-b-lg">
        <iframe
          src={mapUrl}
          width="100%"
          height="220"
          className="border-0"
          title="Localisation du bien"
          loading="lazy"
        />
      </CardContent>
    </Card>
  );
}
