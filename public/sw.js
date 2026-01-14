// Service Worker for Camvasser - caches static map images for faster loading
const CACHE_NAME = 'camvasser-maps-v1';
const MAP_CACHE_NAME = 'camvasser-static-maps-v1';

// Cache static assets on install
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('camvasser-') && name !== CACHE_NAME && name !== MAP_CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Intercept fetch requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cache Google Static Maps images aggressively
  if (url.hostname === 'maps.googleapis.com' && url.pathname.includes('/staticmap')) {
    event.respondWith(
      caches.open(MAP_CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          return fetch(event.request).then((response) => {
            // Only cache successful responses
            if (response.ok) {
              // Clone the response before caching
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => {
            // Return a placeholder or error response if fetch fails
            return new Response('Map unavailable', { status: 503 });
          });
        });
      })
    );
    return;
  }

  // Cache Google Geocoding API responses
  if (url.hostname === 'maps.googleapis.com' && url.pathname.includes('/geocode')) {
    event.respondWith(
      caches.open(MAP_CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          return fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  // For all other requests, just fetch normally
  event.respondWith(fetch(event.request));
});

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }

  // Allow clearing the map cache
  if (event.data === 'clearMapCache') {
    caches.delete(MAP_CACHE_NAME);
  }
});
