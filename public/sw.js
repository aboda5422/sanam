/* Sanam storefront service worker — cache-first assets, stale-while-revalidate for pages & images.
 * Client keeps responses up to 30 days; background fetch refreshes quietly. */
const VERSION = "sanam-sw-v1";
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const IMAGE_CACHE = `${VERSION}-images`;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(STATIC_CACHE));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("sanam-sw-") && !k.startsWith(VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isHashedAsset(url) {
  return url.pathname.startsWith("/assets/");
}

function isImageRequest(url, dest) {
  if (dest === "image") return true;
  return /\.(png|jpe?g|webp|gif|svg|avif|ico)(\?|$)/i.test(url.pathname);
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isAnalytics(url) {
  return (
    url.hostname.includes("google-analytics.com") ||
    url.hostname.includes("googletagmanager.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("gstatic.com")
  );
}

async function putWithTimestamp(cache, request, response) {
  if (!response || !response.ok) return;
  const headers = new Headers(response.headers);
  headers.set("sw-cached-at", String(Date.now()));
  const body = await response.clone().blob();
  await cache.put(request, new Response(body, { status: response.status, statusText: response.statusText, headers }));
}

function isFresh(response) {
  const cachedAt = Number(response.headers.get("sw-cached-at") || 0);
  if (!cachedAt) return true;
  return Date.now() - cachedAt < MAX_AGE_MS;
}

async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then(async (response) => {
      await putWithTimestamp(cache, request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached && isFresh(cached)) {
    void networkPromise;
    return cached;
  }

  const network = await networkPromise;
  if (network) return network;
  if (cached) return cached;
  throw new Error("offline");
}

async function cacheFirstHashed(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await putWithTimestamp(cache, request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (isAnalytics(url)) return;

  // Navigation: network first, fall back to cached shell
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(RUNTIME_CACHE);
          await putWithTimestamp(cache, request, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(RUNTIME_CACHE);
          const cached = await cache.match(request);
          if (cached) return cached;
          const fallback = await cache.match("/");
          if (fallback) return fallback;
          throw new Error("offline");
        }
      })(),
    );
    return;
  }

  if (isSameOrigin(url) && isHashedAsset(url)) {
    event.respondWith(cacheFirstHashed(request));
    return;
  }

  if (isImageRequest(url, request.destination)) {
    event.respondWith(staleWhileRevalidate(IMAGE_CACHE, request));
    return;
  }

  // Same-origin CSS/JS/fonts/manifest without hash — SWR
  if (
    isSameOrigin(url) &&
    (request.destination === "script" ||
      request.destination === "style" ||
      request.destination === "font" ||
      /\.(js|css|woff2?)(\?|$)/i.test(url.pathname))
  ) {
    event.respondWith(staleWhileRevalidate(STATIC_CACHE, request));
  }
});
