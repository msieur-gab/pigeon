// Pigeon service worker
// - Works offline after the first visit (network first, cache fallback,
//   so new versions show up as soon as you're online)
// - Receives images shared to the installed app (Android share sheet)

const CACHE = 'pigeon-v3';
const SHARED_CACHE = 'pigeon-shared';

const SHELL = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './js/app.js',
    './js/services/contacts.js',
    './js/services/flock.js',
    './js/services/identity.js',
    './js/services/messages.js',
    './js/services/sync.js',
    './js/utils/crypto.js',
    './js/utils/diagnose.js',
    './js/utils/payload-codec.js',
    './js/utils/stego.js',
    './js/utils/stego-f5.js',
    './js/utils/storage.js',
    './js/utils/wordlist.js',
    './js/vendor/f5stego.min.js',
    './js/vendor/nacl-fast.min.js',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then(cache => cache.addAll(SHELL.map(url => new Request(url, { cache: 'no-cache' }))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE && k !== SHARED_CACHE).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // Image shared to Pigeon: stash it, then open the app to read it
    if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
        event.respondWith(receiveShare(req));
        return;
    }

    // Only handle our own static files; leave the sync API alone
    if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) {
        return;
    }

    event.respondWith(networkFirst(req));
});

async function receiveShare(req) {
    const scope = self.registration.scope;
    try {
        const form = await req.formData();
        const file = form.get('image');
        if (file && typeof file !== 'string') {
            const cache = await caches.open(SHARED_CACHE);
            await cache.put(new URL('shared-image', scope).href, new Response(file, {
                headers: {
                    'Content-Type': file.type || 'image/jpeg',
                    'X-Filename': encodeURIComponent(file.name || 'shared.jpg')
                }
            }));
        }
    } catch (err) {
        console.error('Share target failed:', err);
    }
    return Response.redirect(new URL('./?shared=1', scope).href, 303);
}

async function networkFirst(req) {
    const cache = await caches.open(CACHE);
    try {
        // 'no-cache' revalidates with the server (cheap 304 when unchanged),
        // so a new deploy shows up on the next load instead of after
        // GitHub Pages' 10-minute browser cache expires.
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok) cache.put(req, res.clone());
        return res;
    } catch {
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (req.mode === 'navigate') {
            const shell = await cache.match('./index.html');
            if (shell) return shell;
        }
        throw new Error('Offline and not cached');
    }
}
