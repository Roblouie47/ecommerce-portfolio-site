// Basic service worker for offline shell + product list caching
const APP_VERSION = '20260201';
const VERSION = `v-${APP_VERSION}`;
const CORE = [
    '/',
    '/index.html',
    `/styles.css?v=${APP_VERSION}`,
    `/js/app.js?v=${APP_VERSION}`,
    `/components.js?v=${APP_VERSION}`,
    '/en.json',
    // Core modules
    '/js/state.js',
    '/js/dom-helpers.js',
    '/js/currency.js',
    '/js/api.js',
    '/js/cart.js',
    '/js/favorites.js',
    '/js/reviews.js',
    '/js/customer-auth.js',
    '/js/admin-auth.js',
    '/js/navigation.js',
    // Page modules
    '/js/pages/home.js',
    '/js/pages/catalog.js',
    '/js/pages/product-detail.js',
    '/js/pages/cart-page.js',
    '/js/pages/favorites-page.js',
    '/js/pages/my-orders.js',
    // Admin modules
    '/js/admin/admin-main.js',
    '/js/admin/admin-products.js',
    '/js/admin/admin-orders.js',
    '/js/admin/admin-refunds.js',
    '/js/admin/admin-reviews.js',
    '/js/admin/admin-discounts.js',
    '/js/admin/admin-analytics.js'
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
