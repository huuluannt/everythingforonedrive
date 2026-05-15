const SHELL_CACHE = "everything-onedrive-shell-v2";
const SEARCH_CACHE = "everything-onedrive-search-v1";
const SHELL_URLS = ["/", "/manifest.webmanifest", "/favicon.ico", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![SHELL_CACHE, SEARCH_CACHE].includes(key))
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

async function trimSearchCache(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(20).map((request) => cache.delete(request)));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname === "/api/search") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          const cache = await caches.open(SEARCH_CACHE);
          await cache.put(request, response.clone());
          await trimSearchCache(cache);
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || Response.json({ results: [], offline: true });
        }),
    );
    return;
  }

  if (request.mode === "navigate" || url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put(request, response.clone());
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match("/")),
    );
  }
});
