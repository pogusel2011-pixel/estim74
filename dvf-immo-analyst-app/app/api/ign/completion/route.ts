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
  upstream.searchParams.set("terr", "74");
  upstream.searchParams.set("type", "StreetAddress,PositionOfInterest");
  upstream.searchParams.set("maximumResponses", "7");

  try {
    const res = await fetch(upstream.toString(), {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json({ status: "OK", results: [] });
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch {
    return NextResponse.json({ status: "OK", results: [] });
  }
}
