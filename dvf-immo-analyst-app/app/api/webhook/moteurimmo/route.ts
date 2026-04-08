import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/webhook/moteurimmo
 *
 * Receives webhook events from MoteurImmo and keeps the local ActiveListing
 * table in sync. Supported event types:
 *   "newAds"               → upsert each ad into ActiveListing
 *   "watchedAdPriceChanged" → update price / pricePsm of existing listing
 *   "watchedAdDeleted"     → soft-delete (isActive=false, deletedAt=now())
 *
 * Always responds HTTP 200 within 30 s.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = String(body.event ?? "");
  const ads: unknown[] = Array.isArray(body.ads) ? body.ads : [];

  console.log(`[Webhook/MoteurImmo] event=${event} | ads=${ads.length}`);

  try {
    if (event === "newAds") {
      await handleNewAds(ads);
    } else if (event === "watchedAdPriceChanged") {
      await handlePriceChanged(ads);
    } else if (event === "watchedAdDeleted") {
      await handleDeleted(ads);
    } else {
      console.warn(`[Webhook/MoteurImmo] Unknown event type: ${event}`);
    }
  } catch (err) {
    console.error("[Webhook/MoteurImmo] Handler error:", err);
  }

  return NextResponse.json({ ok: true });
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleNewAds(ads: unknown[]) {
  let saved = 0;
  let failed = 0;
  for (const raw of ads) {
    const ad = raw as Record<string, unknown>;
    const uniqueId = String(ad.uniqueId ?? ad.id ?? "");
    if (!uniqueId) continue;

    const location = (ad.location as Record<string, unknown> | undefined) ?? {};
    const position = Array.isArray(ad.position) ? ad.position : [];
    // MoteurImmo position = [lng, lat] (GeoJSON order)
    const lng = position.length >= 2 ? Number(position[0]) : null;
    const lat = position.length >= 2 ? Number(position[1]) : null;

    const price = ad.price != null ? Number(ad.price) : null;
    const surface = ad.surface != null ? Number(ad.surface) : null;
    const pricePsm = ad.pricePerSquareMeter != null
      ? Number(ad.pricePerSquareMeter)
      : (price && surface ? Math.round(price / surface) : null);

    try {
      await prisma.activeListing.upsert({
        where: { uniqueId },
        create: {
          uniqueId,
          title: ad.title != null ? String(ad.title) : null,
          city: (location.city as string | undefined) ?? null,
          postalCode: (location.postalCode as string | undefined) ?? null,
          price,
          pricePsm,
          surface,
          rooms: ad.rooms != null ? Number(ad.rooms) : null,
          category: ad.category != null ? String(ad.category) : null,
          lat,
          lng,
          url: ad.url != null ? String(ad.url) : null,
          pictureUrl: (() => {
            const urls = ad.pictureUrls;
            if (Array.isArray(urls) && urls.length > 0) return String(urls[0]);
            if (ad.pictureUrl != null) return String(ad.pictureUrl);
            return null;
          })(),
          energyGrade: ad.energyGrade != null ? String(ad.energyGrade) : null,
          options: Array.isArray(ad.options) ? ad.options : Prisma.JsonNull,
          isActive: true,
        },
        update: {
          title: ad.title != null ? String(ad.title) : undefined,
          price,
          pricePsm,
          surface,
          rooms: ad.rooms != null ? Number(ad.rooms) : undefined,
          lat,
          lng,
          url: ad.url != null ? String(ad.url) : undefined,
          pictureUrl: (() => {
            const urls = ad.pictureUrls;
            if (Array.isArray(urls) && urls.length > 0) return String(urls[0]);
            if (ad.pictureUrl != null) return String(ad.pictureUrl);
            return undefined;
          })(),
          energyGrade: ad.energyGrade != null ? String(ad.energyGrade) : undefined,
          options: Array.isArray(ad.options) ? ad.options : undefined,
          isActive: true,
          deletedAt: null,
        },
      });
      saved++;
    } catch (err) {
      console.error(`[Webhook/MoteurImmo] Upsert failed for uniqueId="${uniqueId}":`, err);
      failed++;
    }
  }
  console.log(`[Webhook/MoteurImmo] newAds: ${saved}/${ads.length} upserted, ${failed} failed`);
}

async function handlePriceChanged(ads: unknown[]) {
  let updated = 0;
  let failed = 0;
  for (const raw of ads) {
    const ad = raw as Record<string, unknown>;
    const uniqueId = String(ad.uniqueId ?? ad.id ?? "");
    if (!uniqueId) continue;

    const price = ad.price != null ? Number(ad.price) : undefined;
    const pricePsm = ad.pricePerSquareMeter != null
      ? Number(ad.pricePerSquareMeter)
      : undefined;

    try {
      await prisma.activeListing.updateMany({
        where: { uniqueId },
        data: {
          ...(price != null && { price }),
          ...(pricePsm != null && { pricePsm }),
        },
      });
      updated++;
    } catch (err) {
      console.error(`[Webhook/MoteurImmo] Price update failed for uniqueId="${uniqueId}":`, err);
      failed++;
    }
  }
  console.log(`[Webhook/MoteurImmo] priceChanged: ${updated} updated, ${failed} failed`);
}

async function handleDeleted(ads: unknown[]) {
  let deleted = 0;
  let failed = 0;
  for (const raw of ads) {
    const ad = raw as Record<string, unknown>;
    const uniqueId = String(ad.uniqueId ?? ad.id ?? "");
    if (!uniqueId) continue;

    try {
      await prisma.activeListing.updateMany({
        where: { uniqueId },
        data: { isActive: false, deletedAt: new Date() },
      });
      deleted++;
    } catch (err) {
      console.error(`[Webhook/MoteurImmo] Soft-delete failed for uniqueId="${uniqueId}":`, err);
      failed++;
    }
  }
  console.log(`[Webhook/MoteurImmo] deleted: ${deleted} soft-deleted, ${failed} failed`);
}
