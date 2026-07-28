/* ==========================================================================
   FASO STYLE — SERVICE WORKER
   App shell en cache-first (précaché à l'installation),
   reste du réseau en stale-while-revalidate.
   ========================================================================== */

const VERSION = "faso-style-v7";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/design-system.css",
  "./assets/css/app.css",
  "./assets/js/app.js",
  "./assets/js/data.js",
  "./assets/fonts/poppins.css",
  "./assets/fonts/poppins-latin-400.woff2",
  "./assets/fonts/poppins-latin-500.woff2",
  "./assets/fonts/poppins-latin-600.woff2",
  "./assets/fonts/poppins-latin-700.woff2",
  "./assets/fonts/poppins-latin-ext-400.woff2",
  "./assets/fonts/poppins-latin-ext-500.woff2",
  "./assets/fonts/poppins-latin-ext-600.woff2",
  "./assets/fonts/poppins-latin-ext-700.woff2",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // addAll échoue en bloc si une ressource manque : on tolère les absences.
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // Navigations : réseau d'abord, repli sur l'app shell hors connexion.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html", { ignoreSearch: true }))
    );
    return;
  }

  // Code (JS/CSS) : réseau d'abord. Un cache-first ici peut resservir une
  // version périmée et incompatible avec le HTML fraîchement livré — c'est
  // exactement ce qui casse une mise à jour côté visiteur déjà venu.
  if (/\.(js|css)$/.test(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Polices, icônes, manifeste : cache d'abord, revalidation en arrière-plan.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
