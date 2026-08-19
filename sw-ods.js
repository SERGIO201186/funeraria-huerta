// ═══════════════════════════════════════════════════════════════
// SERVICE WORKER — Funeraria Huerta · Control Operativo
// sw-ods.js — Archivo separado requerido por GitHub Pages
// ═══════════════════════════════════════════════════════════════

// v4: la app no abría sin conexión. Causa: el "install" de antes intentaba
// cachear index.html UNA sola vez y, si esa descarga fallaba (señal débil —
// muy común en el trabajo de campo de esta funeraria: panteones, sótanos de
// hospital, zonas rurales), el error se tragaba en silencio ("catch(){}")
// y el Service Worker terminaba de instalarse igual, pero con la caché
// vacía. La próxima vez que el celular estuviera de verdad sin conexión,
// no había nada guardado que servir — la app simplemente no cargaba.
// Se sube de versión (como en v3) para forzar que cualquier celular con esa
// caché vacía/vieja la reemplace por una completa en cuanto tenga señal.
const CACHE_NAME = 'huerta-ods-v4';

// Lo mínimo para que la app "abra" sin conexión: la página principal, el
// manifest y los íconos (para que además siga viéndose como app instalada).
const APP_SHELL = [
  'index.html',
  'manifest.json',
  'icons/icon-72.png',
  'icons/icon-96.png',
  'icons/icon-128.png',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

// Reintenta cada recurso del shell varias veces antes de darse por vencido,
// en vez de fallar a la primera con una conexión inestable.
function fetchConReintentos(url, intentos) {
  return fetch(url, { cache: 'no-store' }).then(function(r) {
    if (r && r.ok) return r;
    throw new Error('respuesta no válida');
  }).catch(function(err) {
    if (intentos <= 1) throw err;
    return new Promise(function(resolve) { setTimeout(resolve, 700); })
      .then(function() { return fetchConReintentos(url, intentos - 1); });
  });
}

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.all(APP_SHELL.map(function(path) {
        const url = self.registration.scope + path;
        return fetchConReintentos(url, 3)
          .then(function(r) { return cache.put(url, r); })
          .catch(function() {}); // un ícono que no cargó no debe tumbar la instalación completa
      }));
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

// fetch() puede tardar mucho en fallar en una conexión mala (no cortada del
// todo, solo muy lenta) — sin este límite, la app se quedaba "cargando"
// indefinidamente en vez de caer rápido a la copia guardada.
function fetchConLimite(request, ms) {
  return new Promise(function(resolve, reject) {
    const timer = setTimeout(function() { reject(new Error('tiempo agotado')); }, ms);
    fetch(request).then(function(r) { clearTimeout(timer); resolve(r); },
                         function(e) { clearTimeout(timer); reject(e); });
  });
}

self.addEventListener('fetch', function(event) {
  const url = event.request.url;

  // Google Apps Script — siempre red, nunca cachear
  if (url.includes('script.google.com') || url.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(
          JSON.stringify({ result: 'error', message: 'Sin conexión a Internet' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // CDNs — red primero, cache como respaldo
  if (url.includes('cdn.') || url.includes('unpkg.com') || url.includes('fonts.')) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(event.request, clone); });
        }
        return response;
      }).catch(function() { return caches.match(event.request); })
    );
    return;
  }

  // App principal (index.html y navegación) — RED primero: la app cambia
  // seguido y un "cache primero" dejaba a los usuarios viendo una versión
  // vieja aunque ya hubiera una actualización publicada, hasta recargar dos
  // veces. Solo se usa la copia en caché como respaldo si no hay conexión
  // (o si la red tarda demasiado — ver fetchConLimite arriba).
  event.respondWith(
    fetchConLimite(event.request, 4000).then(function(response) {
      if (response && response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(function(c) { c.put(event.request, clone); });
      }
      return response;
    }).catch(function() {
      return caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        // Ni siquiera esta URL exacta está en caché: como es una SPA, para
        // cualquier navegación (abrir la app, un acceso directo, etc.) sirve
        // el index.html guardado en vez de dejar la pantalla en blanco.
        if (event.request.mode === 'navigate') {
          return caches.match(self.registration.scope + 'index.html');
        }
      });
    })
  );
});

// Mensajes desde la app
self.addEventListener('message', function(event) {
  if (!event.data) return;
  if (event.data.type === 'CACHE_PAGE') {
    const url = event.data.url;
    caches.open(CACHE_NAME).then(function(cache) {
      fetch(url).then(function(r) { if (r.ok) cache.put(url, r); }).catch(function(){});
    });
  }
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
