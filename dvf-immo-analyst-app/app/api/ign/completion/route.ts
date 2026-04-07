import { NextResponse } from "next/server";

export const runtime = "edge";

interface BanFeature {
  type: string;
  geometry: { type: string; coordinates: [number, number] };
  properties: {
    label: string;
    score: number;
    housenumber?: string;
    name?: string;
    postcode?: string;
    citycode?: string;
    city?: string;
    type?: string;
    street?: string;
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const text = (searchParams.get("text") ?? "").trim();
  const city = (searchParams.get("city") ?? "").trim();

  if (text.length < 3) {
    return NextResponse.json({ status: "OK", results: [] });
  }

  const query = city ? `${text} ${city}` : text;

  const upstream = new URL("https://api-adresse.data.gouv.fr/search/");
  upstream.searchParams.set("q", query);
  upstream.searchParams.set("limit", "15");
  upstream.searchParams.set("autocomplete", "1");

  try {
    const res = await fetch(upstream.toString(), {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json({ status: "OK", results: [] });
    }

    const data: { features?: BanFeature[] } = await res.json();

    const results = (data.features ?? [])
      .filter((f) => {
        const pc = f.properties.postcode ?? f.properties.citycode ?? "";
        return pc.startsWith("74");
      })
      .slice(0, 7)
      .map((f) => ({
        fulltext: f.properties.label,
        x: f.geometry.coordinates[0],
        y: f.geometry.coordinates[1],
        city: f.properties.city ?? "",
        zipcode: f.properties.postcode ?? "",
        street: f.properties.street ?? f.properties.name ?? "",
        housenum: f.properties.housenumber ?? "",
        kind: f.properties.type ?? "",
      }));

    return NextResponse.json(
      { status: "OK", results },
      {
        headers: {
          "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
        },
      }
    );
  } catch {
    return NextResponse.json({ status: "OK", results: [] });
  }
}
