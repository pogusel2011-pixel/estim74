// ESTIM'74 Service Worker — v3
// Strategy:
//  - Navigation (HTML) : network-first, offline fallback
//  - API routes        : network-only (never cache dynamic data)
//  - /_next/static/    : cache-first (fingerprinted bundles, safe to cache forever)
//  - Everything else   : network-first, cache fallback

const CACHE_NAME = "estim74-v3";

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ESTIM\u202774 \u2014 Pas de connexion</title>
  <style>
    body{font-family:system-ui,sans-serif;display:flex;flex-direction:column;
         align-items:center;justify-content:center;min-height:100dvh;margin:0;
         background:#f8fafc;color:#1e293b;text-align:center;padding:2rem}
    h1{font-size:1.5rem;margin-bottom:.5rem}
    p{color:#64748b;margin-bottom:1.5rem;max-width:30ch}
    button{background:#2563eb;color:#fff;border:none;border-radius:.5rem;
           padding:.6rem 1.4rem;font-size:1rem;cursor:pointer}
    button:hover{background:#1d4ed8}
  </style>
</head>
<body>
  <h1>Pas de connexion</h1>
  <p>ESTIM\u2019\u002774 n\u2019est pas accessible hors ligne \u2014 v\u00e9rifiez votre connexion internet.</p>
  <button onclick="window.location.reload()">R\u00e9essayer</button>
</body>
</html>`;

// ── Install: cache nothing dynamic, just warm up ──────────────────────────
self.addEventListener("install", (event) => {
  // Skip waiting so the new SW activates immediately on update
  self.skipWaiting();
});

// ── Activate: delete all caches from previous versions ───────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: tiered caching strategy ───────────────────────────────────────
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Skip cross-origin requests entirely
  if (url.origin !== self.location.origin) return;

  // ── 1. API routes: network-only (never cache dynamic data) ──────────────
  if (url.pathname.startsWith("/api/")) {
    // Let the browser handle it natively — no SW involvement
    return;
  }

  // ── 2. Next.js static bundles: cache-first (fingerprinted, safe forever) ─
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // ── 3. Navigation (HTML pages): network-first, NO caching of HTML ────────
  //   This ensures that "Actualiser" and PWA launch always get fresh
  //   server-rendered data from Neon DB via Vercel.
  const isNavigation =
    event.request.mode === "navigate" ||
    (event.request.headers.get("accept") ?? "").includes("text/html");

  if (isNavigation) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).catch(() => {
        // Offline: serve a friendly page
        return new Response(OFFLINE_HTML, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      })
    );
    return;
  }

  // ── 4. Other same-origin assets (images, fonts, icons): network-first ────
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
