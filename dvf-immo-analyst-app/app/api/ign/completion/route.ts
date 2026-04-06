import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get("text") ?? "";

  if (text.trim().length < 3) {
    return NextResponse.json({ status: "OK", results: [] });
  }

  const upstream = new URL("https://data.geopf.fr/geocodage/completion");
  upstream.searchParams.set("text", text);
  upstream.searchParams.set("type", "StreetAddress,PositionOfInterest");
  upstream.searchParams.set("maximumResponses", "15");

  try {
    const res = await fetch(upstream.toString(), {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json({ status: "OK", results: [] });
    }

    const data = await res.json();

    const results = (data.results ?? [])
      .filter((r: { zipcode?: string }) => !r.zipcode || r.zipcode.startsWith("74"))
      .slice(0, 7);

    return NextResponse.json(
      { status: "OK", results },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      }
    );
  } catch {
    return NextResponse.json({ status: "OK", results: [] });
  }
}
