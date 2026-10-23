const CACHE_PREFIX = "candor-";
const CACHE_VERSION = new URL(self.location.href).searchParams.get("v") || "unversioned";
const SHELL_CACHE = `${CACHE_PREFIX}shell-${CACHE_VERSION}`;
const DATA_CACHE = `${CACHE_PREFIX}data-${CACHE_VERSION}`;
const SHELL = ["/offline", "/manifest.webmanifest"];

async function networkFirst(request, cacheName, fallbackRequest) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackRequest) {
      const fallback = await caches.match(fallbackRequest);
      if (fallback) return fallback;
    }
    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all([
      ...keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && ![SHELL_CACHE, DATA_CACHE].includes(key))
        .map((key) => caches.delete(key)),
      self.clients.claim()
    ]))
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }))
    );
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      url.pathname === "/api/stories" ? networkFirst(request, DATA_CACHE) : fetch(request)
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, DATA_CACHE, "/offline"));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = typeof payload.title === "string" ? payload.title : "Candor";
  const body = typeof payload.body === "string" ? payload.body : "Today's drop is ready.";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: "/?src=reminder" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = event.notification.data?.url || "/?src=reminder";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(destination);
      return existing.focus();
    }
    return self.clients.openWindow(destination);
  })());
});
