/** Bump a cada release que altera assets críticos — força activate nos clientes. */
const CACHE_NAME = "frotamax-v3";
const SHELL = ["/manifest.json", "/icons/icon-192.png"];

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
          new Response(JSON.stringify({ success: false, error: "offline", message: "Sem ligação" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
      )
    );
    return;
  }

  // HTML sempre da rede — evita index.html antigo apontando para chunks de deploy anterior.
  if (isHtmlNavigation(event.request)) {
    event.respondWith(
      fetch(event.request).catch(
        () =>
          caches.match(event.request).then(
            (cached) =>
              cached ||
              new Response("Sem ligação. Recarregue quando estiver online.", {
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
      fetch(event.request).catch(() => caches.match(event.request).then((cached) => cached || fetch(event.request)))
    );
    return;
  }

  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
