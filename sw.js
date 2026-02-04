/**
 * Pigeon Service Worker
 * Handles caching for offline access and share target
 */

const CACHE_NAME = 'pigeon-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/tokens/base.css',
  '/css/tokens/layout.css',
  '/js/app.js',
  '/js/services/identity.js',
  '/js/services/contacts.js',
  '/js/services/messages.js',
  '/js/services/sync.js',
  '/js/utils/crypto.js',
  '/js/utils/stego.js',
  '/js/utils/stego-f5.js',
  '/js/utils/wordlist.js',
  '/js/vendor/f5stego.min.js',
  '/docs/pigeon_logo.webp'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip external URLs (CDN scripts)
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(event.request);
      })
  );
});

// Handle share target
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'POST') {
    return;
  }

  // Check if this is a share target request
  const url = new URL(event.request.url);
  if (url.pathname === '/' && event.request.headers.get('Content-Type')?.includes('multipart/form-data')) {
    event.respondWith(
      (async () => {
        const formData = await event.request.formData();
        const imageFile = formData.get('image');

        // Store the shared file in a way the app can access
        if (imageFile) {
          const clients = await self.clients.matchAll({ type: 'window' });
          if (clients.length > 0) {
            // Post message to existing client
            clients[0].postMessage({
              type: 'share-target',
              file: imageFile
            });
          } else {
            // Store for when app opens
            // Using cache as temporary storage
            const cache = await caches.open('pigeon-share');
            const blob = await imageFile.arrayBuffer();
            const response = new Response(blob, {
              headers: { 'Content-Type': imageFile.type }
            });
            await cache.put('shared-image', response);
          }
        }

        // Redirect to app
        return Response.redirect('/?share=true', 303);
      })()
    );
  }
});
