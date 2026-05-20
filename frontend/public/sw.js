/** Bump ao publicar UI crítica — invalida caches antigos no activate. */
const CACHE = "frotacontrol-v11";
const SHELL = ["/manifest.json", "/icon.png"];

const isHashedAsset = (pathname) =>
  pathname.startsWith("/assets/") || /\.(js|css|mjs)(\?|$)/i.test(pathname);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
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

  if (isHashedAsset(url.pathname)) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  const isHtmlNavigation =
    event.request.mode === "navigate" ||
    (event.request.headers.get("accept") || "").includes("text/html");

  if (isHtmlNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request) || caches.match("/"))
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
