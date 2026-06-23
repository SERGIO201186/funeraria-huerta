/**
 * SERVICE WORKER — Funeraria Huerta PWA
 * v2: Network-first para HTML (siempre intenta traer la versión más nueva).
 * Cache-first solo para assets estáticos (fuentes, íconos).
 * Offline: si no hay red, sirve desde caché como respaldo.
 */

const CACHE_NAME = 'huerta-v3.0';

// Archivos que se cachean al instalar el SW (shell de la app)
const ASSETS_ESTATICOS = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/webfonts/fa-solid-900.ttf'
];

// ── INSTALL: pre-cachear assets y activar de inmediato ──
self.addEventListener('install', function(event) {
  console.log('[SW] Instalando versión:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.allSettled(
        ASSETS_ESTATICOS.map(function(url) {
          return cache.add(url).catch(function(e) {
            console.warn('[SW] No se pudo cachear:', url, e.message);
          });
        })
      );
    }).then(function() {
      return self.skipWaiting(); // activa esta versión sin esperar a cerrar pestañas
    })
  );
});

// ── ACTIVATE: limpiar TODOS los cachés viejos y tomar control inmediato ──
self.addEventListener('activate', function(event) {
  console.log('[SW] Activado:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) {
              console.log('[SW] Eliminando caché viejo:', key);
              return caches.delete(key);
            })
      );
    }).then(function() {
      return self.clients.claim(); // toma control de todas las pestañas/app abiertas YA
    })
  );
});

// ── FETCH: estrategia por tipo de recurso ──
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Google Apps Script — nunca cachear, siempre red
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(
          JSON.stringify({ exito: false, error: 'Sin conexión al servidor Google.' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // CDN fonts/icons — Cache-first (rara vez cambian)
  if (url.hostname.includes('cdnjs.cloudflare.com') ||
      url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
          return response;
        }).catch(function() { return new Response('', { status: 503 }); });
      })
    );
    return;
  }

  // HTML / JS / JSON propio — NETWORK-FIRST: siempre intenta traer lo último
  // Esto es lo que soluciona el problema de la app instalada viendo versiones viejas
  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
        }
        return response;
      })
      .catch(function() {
        // Solo si NO hay internet, usar caché como respaldo
        return caches.match(event.request).then(function(cached) {
          return cached || caches.match('./index.html');
        });
      })
  );
});

// ── SYNC: Background Sync cuando se recupera la conexión ──
self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-ordenes') {
    event.waitUntil(
      self.clients.matchAll().then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'TRIGGER_SYNC' });
        });
      })
    );
  }
});

// ── MESSAGE: recibir mensajes del cliente ──
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CACHE_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});
