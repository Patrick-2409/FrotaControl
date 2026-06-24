/** Bump a cada release que altera assets criticos: forca activate nos clientes. */
const CACHE_NAME = "frotamax-v4";
const SHELL = ["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

const isHashedAsset = (pathname) =>
  pathname.startsWith("/assets/") || /\.(js|css|mjs)(\?|$)/i.test(pathname);

const isHtmlNavigation = (request) =>
  request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(
        () =>
          new Response(JSON.stringify({ success: false, error: "offline", message: "Sem ligacao" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
      )
    );
    return;
  }

  // HTML segue network-first para atualizar quando online e manter fallback PWA quando offline.
  if (isHtmlNavigation(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() =>
          caches.match("/").then(
            (cached) =>
              cached ||
              new Response("Sem ligacao. Recarregue quando estiver online.", {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              })
          )
        )
    );
    return;
  }

  if (isHashedAsset(url.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(
            (cached) =>
              cached ||
              new Response("Recurso indisponivel offline.", {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              })
          )
        )
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then(
        (cached) =>
          cached ||
          new Response("Recurso indisponivel offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
      )
    )
  );
});
