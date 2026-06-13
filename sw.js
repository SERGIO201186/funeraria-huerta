/**
 * SERVICE WORKER — Funeraria Huerta PWA
 * Estrategia: Cache-first para assets estáticos, Network-first para datos.
 * Offline: sirve desde caché, encola operaciones para sync posterior.
 */

const CACHE_NAME    = 'huerta-v1.4';
const CACHE_OFFLINE = 'huerta-offline-v1.4';

// Archivos que se cachean al instalar el SW (shell de la app)
const ASSETS_ESTATICOS = [
  './panel.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/webfonts/fa-solid-900.ttf'
];

// ── INSTALL: pre-cachear assets ──
self.addEventListener('install', function(event) {
  console.log('[SW] Instalando versión:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // Cachear assets críticos — ignorar errores individuales
      return Promise.allSettled(
        ASSETS_ESTATICOS.map(function(url) {
          return cache.add(url).catch(function(e) {
            console.warn('[SW] No se pudo cachear:', url, e.message);
          });
        })
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: limpiar cachés viejos ──
self.addEventListener('activate', function(event) {
  console.log('[SW] Activado:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE_NAME && key !== CACHE_OFFLINE;
        }).map(function(key) {
          console.log('[SW] Eliminando caché viejo:', key);
          return caches.delete(key);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── FETCH: estrategia por tipo de recurso ──
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Google Apps Script — no se puede cachear (CORS), dejar pasar
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request).catch(function() {
        // Offline: devolver respuesta JSON de error controlado
        return new Response(
          JSON.stringify({ exito: false, error: 'Sin conexión al servidor Google.' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // CDN fonts/icons — Cache-first
  if (url.hostname.includes('cdnjs.cloudflare.com') ||
      url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
          return response;
        }).catch(function() {
          return new Response('', { status: 503 });
        });
      })
    );
    return;
  }

  // panel.html y assets locales — Cache-first con actualización en background
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      var networkFetch = fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        return null;
      });

      // Retornar caché inmediatamente, actualizar en background
      return cached || networkFetch;
    })
  );
});

// ── SYNC: Background Sync cuando se recupera la conexión ──
self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-ordenes') {
    console.log('[SW] Background Sync activado: sync-ordenes');
    event.waitUntil(
      // Notificar a todos los clientes activos para que ejecuten la sincronización
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
