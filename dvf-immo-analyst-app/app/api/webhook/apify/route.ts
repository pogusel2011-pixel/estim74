import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/webhook/apify
 *
 * Receives Apify scraper results and upserts them into the ActiveListing table.
 * Deduplicates by uniqueId (item.id → item.url as fallback).
 * Always responds HTTP 200 to prevent Apify retry storms.
 *
 * ── Supported payload formats ────────────────────────────────────────────────
 *
 * Mode A — Apify Run Completion Webhook (recommended):
 *   Apify POSTs a run-completion event. This handler fetches the full dataset
 *   from the Apify API using APIFY_TOKEN.
 *   Body shape: { eventType: "ACTOR.RUN.SUCCEEDED", resource: { defaultDatasetId: "..." } }
 *
 * Mode B — Direct items array:
 *   POST a JSON array of listing objects directly to this endpoint.
 *   Body shape: [ { id, title, price, ... }, ... ]
 *
 * Mode C — Wrapped items:
 *   Body shape: { items: [ { ... }, ... ] }
 *
 * ── Configuring Apify to call this webhook automatically ─────────────────────
 *
 * 1. In Apify Console → your Actor (or Task) → Webhooks tab
 * 2. Click "Add webhook"
 * 3. Set:
 *      Event types : ACTOR.RUN.SUCCEEDED
 *      Request URL : https://<your-vercel-domain>/api/webhook/apify
 *      Payload template: (leave as default — Apify sends the standard run object)
 * 4. Save. Apify will POST after every successful run.
 *
 * 5. Add APIFY_TOKEN to Vercel environment variables (Settings → Environment Variables):
 *      Key   : APIFY_TOKEN
 *      Value : your Apify personal API token (apify.com → Settings → Integrations)
 *
 * ── Field mapping (Apify item → ActiveListing) ───────────────────────────────
 *
 *   uniqueId    ← item.id | item.uniqueId | item.url
 *   title       ← item.title | item.name | item.titre
 *   price       ← item.price | item.prix
 *   surface     ← item.surface | item.area | item.livingArea | item.surfaceArea
 *   pricePsm    ← item.pricePerSqm | item.prixM2 | computed(price/surface)
 *   rooms       ← item.rooms | item.pieces | item.nombrePieces | item.bedrooms
 *   city        ← item.city | item.ville | item.location.city
 *   postalCode  ← item.postalCode | item.zipCode | item.codePostal | item.location.postalCode
 *   lat         ← item.lat | item.latitude | item.geoLocation.lat
 *   lng         ← item.lng | item.lon | item.longitude | item.geoLocation.lng
 *   category    ← item.category | item.type | item.propertyType — normalised to "flat"|"house"
 *   energyGrade ← item.energyGrade | item.energyClass | item.dpe | item.energyRating
 *   url         ← item.url
 *   pictureUrl  ← item.images[0] | item.photos[0] | item.imageUrl | item.pictureUrl
 */

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    let items: unknown[] = [];

    if (Array.isArray(body)) {
      // Mode B — direct array
      items = body;
      console.log(`[Webhook/Apify] Mode B (direct array) | items=${items.length}`);
    } else if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;

      if (b.eventType || b.resource) {
        // Mode A — Apify run completion webhook
        const resource = (b.resource ?? {}) as Record<string, unknown>;
        const datasetId = resource.defaultDatasetId as string | undefined;
        const runId = resource.id as string | undefined;
        console.log(`[Webhook/Apify] Mode A (run event) | runId=${runId} | datasetId=${datasetId}`);

        if (!datasetId) {
          console.warn("[Webhook/Apify] No defaultDatasetId — skipping");
          return NextResponse.json({ ok: true, skipped: "no_dataset_id" });
        }

        items = await fetchApifyDataset(datasetId);
      } else if (Array.isArray(b.items)) {
        // Mode C — wrapped items
        items = b.items;
        console.log(`[Webhook/Apify] Mode C (wrapped) | items=${items.length}`);
      }
    }

    if (items.length === 0) {
      console.log("[Webhook/Apify] No items to process");
      return NextResponse.json({ ok: true, upserted: 0, total: 0 });
    }

    const { upserted, skipped } = await processItems(items);
    console.log(`[Webhook/Apify] Done | upserted=${upserted} skipped=${skipped} total=${items.length}`);

    return NextResponse.json({ ok: true, upserted, skipped, total: items.length });
  } catch (err) {
    console.error("[Webhook/Apify] Unhandled error:", err);
    return NextResponse.json({ ok: true, error: "handler_error" });
  }
}

// ─── Apify Dataset Fetcher ────────────────────────────────────────────────────

async function fetchApifyDataset(datasetId: string): Promise<unknown[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error("[Webhook/Apify] APIFY_TOKEN env var not set — cannot fetch dataset");
    return [];
  }

  const url =
    `https://api.apify.com/v2/datasets/${datasetId}/items` +
    `?token=${token}&format=json&clean=true&limit=10000`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": "estim74-webhook/1.0" } });
  } catch (e) {
    console.error("[Webhook/Apify] Network error fetching dataset:", e);
    return [];
  }

  if (!res.ok) {
    console.error(`[Webhook/Apify] Dataset API error ${res.status}: ${await res.text()}`);
    return [];
  }

  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    console.warn("[Webhook/Apify] Dataset response is not an array");
    return [];
  }

  console.log(`[Webhook/Apify] Fetched ${data.length} items from dataset ${datasetId}`);
  return data;
}

// ─── Field Mapper & Upsert ────────────────────────────────────────────────────

async function processItems(
  items: unknown[]
): Promise<{ upserted: number; skipped: number }> {
  let upserted = 0;
  let skipped = 0;

  for (const raw of items) {
    if (!raw || typeof raw !== "object") { skipped++; continue; }
    const item = raw as Record<string, unknown>;

    // ── uniqueId ─────────────────────────────────────────────────────────────
    const uniqueId = coerceStr(item.id ?? item.uniqueId ?? item.url);
    if (!uniqueId) { skipped++; continue; }

    // ── Numeric fields ────────────────────────────────────────────────────────
    const price = coerceNum(item.price ?? item.prix);
    const surface = coerceNum(
      item.surface ?? item.area ?? item.livingArea ?? item.surfaceArea
    );
    const pricePsmRaw = coerceNum(item.pricePerSqm ?? item.prixM2 ?? item.pricePerSquareMeter);
    const pricePsm =
      pricePsmRaw ??
      (price !== null && surface !== null && surface > 0
        ? Math.round(price / surface)
        : null);
    const rooms = coerceNum(
      item.rooms ?? item.pieces ?? item.nombrePieces ?? item.bedrooms
    );

    // ── Location ──────────────────────────────────────────────────────────────
    const loc = (item.location ?? {}) as Record<string, unknown>;
    const city = coerceStr(item.city ?? item.ville ?? loc.city) || null;
    const postalCode =
      coerceStr(item.postalCode ?? item.zipCode ?? item.codePostal ?? loc.postalCode) ||
      null;

    // ── Coordinates ───────────────────────────────────────────────────────────
    const geo = (item.geoLocation ?? item.geo ?? {}) as Record<string, unknown>;
    const lat = coerceNum(item.lat ?? item.latitude ?? geo.lat ?? geo.latitude);
    const lng = coerceNum(
      item.lng ?? item.lon ?? item.longitude ?? geo.lng ?? geo.lon ?? geo.longitude
    );

    // ── Category — normalise to "flat" | "house" | raw value ─────────────────
    const rawCat = (
      coerceStr(item.category ?? item.type ?? item.propertyType ?? item.typeBien) ?? ""
    ).toLowerCase();
    let category: string | null = null;
    if (/maison|house|villa|pavillon/.test(rawCat)) {
      category = "house";
    } else if (/appart|flat|studio|duplex|loft/.test(rawCat)) {
      category = "flat";
    } else if (rawCat) {
      category = rawCat;
    }

    // ── Energy ────────────────────────────────────────────────────────────────
    const energyGrade = coerceStr(
      item.energyGrade ?? item.energyClass ?? item.dpe ?? item.energyRating
    );

    // ── Picture ───────────────────────────────────────────────────────────────
    const pictureUrl = (() => {
      if (Array.isArray(item.images) && item.images.length > 0)
        return coerceStr(item.images[0]);
      if (Array.isArray(item.photos) && item.photos.length > 0)
        return coerceStr(item.photos[0]);
      return coerceStr(item.imageUrl ?? item.pictureUrl ?? item.photo);
    })();

    // ── Title ─────────────────────────────────────────────────────────────────
    const title = coerceStr(item.title ?? item.name ?? item.titre);

    // ── URL ───────────────────────────────────────────────────────────────────
    const url = coerceStr(item.url ?? item.link ?? item.adUrl);

    await prisma.activeListing.upsert({
      where: { uniqueId },
      create: {
        uniqueId,
        title,
        city,
        postalCode,
        price,
        pricePsm,
        surface,
        rooms: rooms !== null ? Math.round(rooms) : null,
        category,
        lat,
        lng,
        url,
        pictureUrl,
        energyGrade,
        options: Prisma.JsonNull,
        isActive: true,
      },
      update: {
        ...(title != null && { title }),
        ...(city != null && { city }),
        ...(postalCode != null && { postalCode }),
        ...(price != null && { price }),
        ...(pricePsm != null && { pricePsm }),
        ...(surface != null && { surface }),
        ...(rooms != null && { rooms: Math.round(rooms) }),
        ...(category != null && { category }),
        ...(lat != null && { lat }),
        ...(lng != null && { lng }),
        ...(url != null && { url }),
        ...(pictureUrl != null && { pictureUrl }),
        ...(energyGrade != null && { energyGrade }),
        isActive: true,
        deletedAt: null,
      },
    });
    upserted++;
  }

  return { upserted, skipped };
}

// ─── Coercion helpers ─────────────────────────────────────────────────────────

function coerceStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" || s === "null" || s === "undefined" ? null : s;
}

function coerceNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v.replace(/[^\d.-]/g, "")) : Number(v);
  return isFinite(n) ? n : null;
}
