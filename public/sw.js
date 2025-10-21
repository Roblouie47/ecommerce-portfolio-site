// Basic service worker for offline shell + product list caching
const VERSION = 'v1';
const CORE = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/components.js',
    '/en.json'
];
self.addEventListener('install', e => {
    e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)));
});
self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))));
});
self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    if (url.pathname.startsWith('/api/products')) {
        // Network first, fallback cache
        e.respondWith(fetch(e.request).then(res => { const clone = res.clone(); caches.open(VERSION).then(c => c.put(e.request, clone)); return res; }).catch(() => caches.match(e.request)));
        return;
    }
    if (CORE.includes(url.pathname)) {
        e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    }
});
