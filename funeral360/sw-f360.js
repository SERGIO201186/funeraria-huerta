// ═══════════════════════════════════════════════════════════════
// SERVICE WORKER — Funeral360 by Omnia T3chnology
// sw-f360.js — propio de este módulo (independiente de sw-ods.js, el de
// la app de Huerta), para que "Instalar app" ofrezca su propio ícono y
// nombre y funcione sin conexión igual que la app de Huerta.
// ═══════════════════════════════════════════════════════════════
const CACHE_NAME = 'funeral360-v1';

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

  // Backend de Google Apps Script — siempre red, nunca cachear.
  if (url.includes('script.google.com') || url.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(
          JSON.stringify({ ok: false, mensaje: 'Sin conexión a Internet' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // CDNs (html2canvas, jsPDF) — red primero, cache como respaldo.
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

  // App principal — RED primero (la app cambia seguido); solo cae a la copia
  // en caché si no hay conexión o la red tarda demasiado.
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
        if (event.request.mode === 'navigate') {
          return caches.match(self.registration.scope + 'index.html');
        }
      });
    })
  );
});

self.addEventListener('message', function(event) {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
