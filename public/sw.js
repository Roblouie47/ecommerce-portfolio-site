// Basic service worker for offline shell + product list caching
const APP_VERSION = '20251208-2';
const VERSION = `v-${APP_VERSION}`;
const CORE = [
    '/',
    '/index.html',
    `/styles.css?v=${APP_VERSION}`,
    `/app.js?v=${APP_VERSION}`,
    `/components.js?v=${APP_VERSION}`,
    '/en.json'
];

self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)));
});

self.addEventListener('activate', e => {
    e.waitUntil(
        Promise.all([
            caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))),
            self.clients.claim()
        ])
    );
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    if (url.pathname.startsWith('/api/products')) {
        // Network first, fallback cache
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    const clone = res.clone();
                    caches.open(VERSION).then(c => c.put(e.request, clone));
                    return res;
                })
                .catch(() => caches.match(e.request))
        );
        return;
    }

    if (CORE.some(entry => new URL(entry, self.location.origin).href === url.href)) {
        e.respondWith(
            caches.match(e.request).then(r => r || fetch(e.request))
        );
    }
});
