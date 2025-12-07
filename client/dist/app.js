// @ts-nocheck
/**
 * Frontend Single-File App (reconstructed header after patch)
 */
(function () {
    'use strict';
    console.log('App JS version: 2025-10-24-7');

    const PRODUCT_PLACEHOLDER_BASE = 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab';
    // Provide a consistent on-brand fallback image sized per context.
    function productPlaceholder(width = 640) {
        const safeWidth = Math.max(320, Math.min(Math.round(width), 1600));
        return `${PRODUCT_PLACEHOLDER_BASE}?auto=format&fit=crop&w=${safeWidth}&q=80`;
    }

    async function copyTextToClipboard(value) {
        if (!value) return;
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
                return;
            }
        } catch (err) {
            console.warn('navigator clipboard copy failed', err);
        }
        try {
            const area = document.createElement('textarea');
            area.value = value;
            area.setAttribute('readonly', 'true');
            area.style.position = 'absolute';
            area.style.left = '-9999px';
            document.body.appendChild(area);
            area.select();
            document.execCommand('copy');
            document.body.removeChild(area);
        } catch (fallbackErr) {
            console.warn('fallback copy failed', fallbackErr);
            throw fallbackErr;
        }
    }

    function renderProductReviews(productId) {
        const prod = state.productsById.get(productId) || state.productsById.get(String(productId)) || state.productsById.get(Number(productId));
        if (!prod || prod.deletedAt) {
            notify('Product not found', 'error');
            navigate('catalog');
            return;
        }

        rootEl.innerHTML = '';
        const panel = el('section', { class: 'panel product-reviews mt-lg' });
        panel.appendChild(el('div', { class: 'panel-header flex align-start justify-between gap-sm flex-wrap' },
            el('div', { class: 'flex flex-col gap-xs' },
                el('span', {}, 'Product Reviews'),
                el('h2', { class: 'h5' }, prod.title),
                el('div', { class: 'flex gap-sm align-center tiny muted' },
                    renderStarRating(prod.reviewSummary?.average ?? null, prod.reviewSummary?.count || null, { size: 'sm' }),
                    el('span', {}, money(prod.priceCents))
                )
            ),
            el('div', { class: 'flex gap-sm' },
                el('button', { class: 'btn btn-small btn-outline', attrs: { 'data-route': 'product', 'data-id': prod.id } }, 'Back to Product'),
                el('button', { class: 'btn btn-small btn-outline', attrs: { 'data-route': 'catalog' } }, 'Catalog')
            )
        ));

        const summaryBox = el('div', { class: 'review-summary-box flex flex-col gap-sm' });
        panel.appendChild(summaryBox);
        let data = {
            summary: prod.reviewSummary || { count: 0, average: null, totalQuantity: 0, distribution: {} },
            reviews: []
        };
        const cached = state.reviewsByProduct.get(prod.id);
        if (cached) data = cached;
        const reviewList = el('div', { class: 'review-list flex flex-col gap-md', attrs: { id: 'product-review-list' } });
        panel.appendChild(reviewList);
        panel.appendChild(el('div', { class: 'alert alert-info review-view-only-note' }, 'Reviews are currently read-only. Check back soon for new stories.'));

        function renderSummary(summary) {
            summaryBox.innerHTML = '';
            const safeSummary = summary || { count: 0, average: null, totalQuantity: 0, distribution: {} };
            const count = safeSummary.count || 0;
            summaryBox.appendChild(el('div', { class: 'review-summary-main flex gap-sm align-center' },
                renderStarRating(safeSummary.average ?? null, count || null, { size: 'lg' }),
                el('div', { class: 'flex flex-col' },
                    el('span', { class: 'summary-average' }, count ? `${(safeSummary.average ?? 0).toFixed(1)} / 5` : 'No ratings yet'),
                    el('span', { class: 'summary-count tiny muted' }, count ? `${count} review${count === 1 ? '' : 's'}` : 'Be the first to review')
                )
            ));
            summaryBox.appendChild(el('div', { class: 'summary-total tiny muted' }, `Verified units purchased via reviews: ${safeSummary.totalQuantity || 0}`));
            const distribution = safeSummary.distribution || {};
            const distList = el('ul', { class: 'rating-distribution' });
            for (let rating = 5; rating >= 1; rating -= 1) {
                const ratingCount = distribution[rating] || 0;
                const pct = count ? Math.round((ratingCount / count) * 100) : 0;
                distList.appendChild(el('li', { class: 'flex gap-sm align-center' },
                    el('span', { class: 'tiny muted' }, `${rating}★`),
                    el('div', { class: 'dist-bar' },
                        el('span', { class: 'dist-fill', attrs: { style: `width:${pct}%` } })
                    ),
                    el('span', { class: 'tiny muted' }, ratingCount)
                ));
            }
            summaryBox.appendChild(distList);
        }

        function renderReviews(reviews) {
            reviewList.innerHTML = '';
            const safeReviews = Array.isArray(reviews) ? reviews : [];
            if (!safeReviews.length) {
                reviewList.appendChild(el('div', { class: 'muted tiny' }, 'No reviews yet. Be the first to share your story.'));
                return;
            }
            for (const review of safeReviews) {
                const createdAt = review?.createdAt ? new Date(review.createdAt) : null;
                reviewList.appendChild(el('article', { class: 'review-card flex flex-col gap-sm' },
                    el('div', { class: 'review-card-header flex gap-sm align-center justify-between flex-wrap' },
                        el('div', { class: 'flex gap-sm align-center' },
                            renderStarRating(review?.rating ?? null, null, { size: 'sm' }),
                            el('span', { class: 'review-author' }, review?.authorName || 'Verified buyer')
                        ),
                        createdAt ? el('span', { class: 'tiny muted' }, createdAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })) : null
                    ),
                    review?.title ? el('h4', { class: 'review-title' }, review.title) : null,
                    el('p', { class: 'review-body' }, review?.body || 'No review text provided.'),
                    review?.quantityPurchased ? el('span', { class: 'review-extra tiny muted' }, `Purchased ${review.quantityPurchased} unit${review.quantityPurchased === 1 ? '' : 's'}`) : null
                ));
            }
        }

        async function hydrateReviews(force = false) {
            try {
                data = await fetchProductReviews(prod.id, { force });
                const summary = data?.summary || prod.reviewSummary;
                renderSummary(summary);
                renderReviews(data?.reviews);
                const entry = state.productsById.get(prod.id);
                if (entry && summary) entry.reviewSummary = summary;
                if (summary) prod.reviewSummary = summary;
                const idx = state.products.findIndex(p => p.id === prod.id);
                if (idx >= 0 && summary) state.products[idx] = { ...state.products[idx], reviewSummary: summary };
            } catch (err) {
                reviewList.innerHTML = '';
                reviewList.appendChild(el('div', { class: 'alert alert-error' }, 'Failed to load reviews: ' + err.message));
            }
        }

        rootEl.appendChild(panel);

        renderSummary(prod.reviewSummary);
        renderReviews(data.reviews);
        hydrateReviews();
    }

    const state = {
        products: [],
        productsById: new Map(),
        // Holds client-side snapshots of products just deleted (optimistic) so they reliably appear in
        // Show Deleted view immediately even if server list hasn't refreshed yet.
        deletedBuffer: new Map(),
        currentRoute: 'home',
        currentProduct: null,
        reviewsByProduct: new Map(),
        cart: (function () { try { return JSON.parse(localStorage.getItem('cart') || '[]'); } catch { return []; } })(),
        // Persist cart page UX state (discount + ship estimator) between re-renders
        cartPage: { discountCode: '', discountApplied: false, shipCountry: 'PH' },
        admin: {
            token: localStorage.getItem('adminToken') || '',
            user: (function () {
                try {
                    const raw = localStorage.getItem('adminProfile');
                    if (!raw) return null;
                    const parsed = JSON.parse(raw);
                    if (!parsed || typeof parsed !== 'object') return null;
                    return {
                        id: typeof parsed.id === 'string' ? parsed.id : '',
                        email: typeof parsed.email === 'string' ? parsed.email : '',
                        name: typeof parsed.name === 'string' ? parsed.name : ''
                    };
                } catch {
                    return null;
                }
            })(),
            orders: [],
            showDeleted: localStorage.getItem('adminShowDeleted') === '1',
            activePanel: 'products',
            discounts: [],
            lowStock: [],
            reviews: { status: 'pending', items: [] },
            refundThreads: new Map()
        },
        customer: (function () {
            try {
                const rawProfile = localStorage.getItem('customerProfile');
                const token = localStorage.getItem('customerSessionToken') || '';
                if (!rawProfile || !token) return null;
                const data = JSON.parse(rawProfile);
                if (!data || typeof data !== 'object') return null;
                const profile = {
                    id: typeof data.id === 'string' ? data.id : '',
                    name: typeof data.name === 'string' ? data.name : '',
                    email: typeof data.email === 'string' ? data.email : '',
                    avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : '',
                    country: typeof data.country === 'string' ? data.country : '',
                        address: typeof data.address === 'string' ? data.address : '',
                        phone: typeof data.phone === 'string' ? data.phone : ''
                };
                if (!profile.email && !profile.name) return null;
                return { ...profile, sessionToken: token };
            } catch {
                return null;
            }
        })(),
        meta: null,
        lastOrder: null,
        pendingCatalogSearchTerm: '',
        myOrders: [],
        myOrdersEmail: '',
        myOrdersDetailCache: new Map(),
        myOrdersFilter: { query: '' },
        customerRefundThreads: new Map(),
        favorites: (function () { try { const arr = JSON.parse(localStorage.getItem('favorites') || '[]'); return Array.isArray(arr) ? arr.map(String) : []; } catch { return []; } })()
    };

    const rootEl = document.getElementById('app-root');
    const modalRoot = document.getElementById('modal-root');
    const spinnerRoot = document.getElementById('spinner-root');

    const CATALOG_PREVIEW_FILTERS = [
        {
            title: "Men's Wear",
            items: [
                { label: 'T-Shirts', term: 'men t-shirt' },
                { label: 'Hoodies', term: 'men hoodie' },
                { label: 'Pants', term: 'men pants' },
                { label: 'Accessories', term: 'men accessories' }
            ]
        },
        {
            title: "Girls' Wear",
            items: [
                { label: 'T-Shirts', term: 'women t-shirt' },
                { label: 'Hoodies', term: 'women hoodie' },
                { label: 'Pants', term: 'women pants' },
                { label: 'Accessories', term: 'women accessories' }
            ]
        },
        {
            title: "Kids' Wear",
            items: [
                { label: 'T-Shirts', term: 'kids t-shirt' },
                { label: 'Hoodies', term: 'kids hoodie' },
                { label: 'Pants', term: 'kids pants' },
                { label: 'Accessories', term: 'kids accessories' }
            ]
        }
    ];

    const MINI_CART_ENABLED = false; // disable mini-cart drawer UI
    if (!MINI_CART_ENABLED) {
        document.addEventListener('DOMContentLoaded', () => {
            const existingMini = document.getElementById('mini-cart-drawer');
            if (existingMini) existingMini.remove();
        });
    }

    function setBodyRoute(route) {
        if (!document.body) return;
        const rootEl = document.documentElement;
        if (route) {
            document.body.setAttribute('data-route', route);
            if (rootEl) rootEl.setAttribute('data-route', route);
        } else {
            document.body.removeAttribute('data-route');
            if (rootEl) rootEl.removeAttribute('data-route');
        }
    }

    // Global error surface so silent script errors (that could block checkout button wiring) are visible
    if (!window.__globalErrorHookInstalled) {
        window.__globalErrorHookInstalled = true;
        window.addEventListener('error', (e) => {
            try { console.error('Global error:', e.message, e.error); } catch { }
            try { notify('Script error: ' + e.message, 'error', 7000); } catch { }
        });
        window.addEventListener('unhandledrejection', (e) => {
            try { console.error('Unhandled promise rejection:', e.reason); } catch { }
            try { notify('Async error: ' + (e.reason && e.reason.message ? e.reason.message : e.reason), 'error', 7000); } catch { }
        });
    }

    function el(tag, opts = {}, ...children) {
        opts = opts || {};
        const node = document.createElement(tag);
        if (opts.class) node.className = opts.class;
        if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) if (v != null) node.setAttribute(k, v);
        for (const c of children.flat()) {
            if (c == null) continue;
            if (typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean') {
                node.appendChild(document.createTextNode(String(c)));
            } else if (c instanceof Node) {
                node.appendChild(c);
            } else {
                // Fallback: stringify unknown objects
                node.appendChild(document.createTextNode(String(c)));
            }
        }
        return node;
    }
    // Dynamic currency display: base pricing stored in USD cents.
    const CURRENCY_RATES = {
        USD: { rate: 1, symbol: '$', format: v => '$' + v.toFixed(2) },
        PHP: { rate: 56, symbol: '₱', format: v => '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
        EUR: { rate: 0.92, symbol: '€', format: v => '€' + v.toFixed(2) },
        JPY: { rate: 155, symbol: '¥', format: v => '¥' + Math.round(v).toLocaleString('ja-JP') },
        AUD: { rate: 1.5, symbol: 'A$', format: v => 'A$' + v.toFixed(2) },
        CAD: { rate: 1.35, symbol: 'C$', format: v => 'C$' + v.toFixed(2) }
    };
    let activeCurrency = 'USD';
    function setActiveCurrency(cur) { if (CURRENCY_RATES[cur]) { activeCurrency = cur; } }
    function countryToCurrency(countryCode) {
        const up = (countryCode || '').toUpperCase();
        if (['PH', 'PHL', 'PHILIPPINES'].includes(up)) return 'PHP';
        if (['US', 'USA'].includes(up)) return 'USD';
        if (['CA', 'CANADA'].includes(up)) return 'CAD';
        if (['AU', 'AUS', 'AUSTRALIA'].includes(up)) return 'AUD';
        if (['JP', 'JPN', 'JAPAN'].includes(up)) return 'JPY';
        if (['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'SE', 'FI', 'DK', 'IE', 'PT', 'AT', 'PL', 'CZ', 'HU', 'SK', 'RO', 'BG', 'GR'].includes(up)) return 'EUR';
        return 'USD';
    }

    function mountCountrySelector() {
        const header = document.querySelector('.site-header');
        if (!header) return;
        const headerActions = header.querySelector('.header-actions') || header; // prefer new actions container
        let existing = document.getElementById('global-country-select');
        if (existing) return; // already added
        const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '.4rem';
    wrap.style.marginLeft = '1rem';
    wrap.innerHTML = '<label style="font-size:.6rem;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:#1f2937;">Country</label>';
        const sel = document.createElement('select');
        sel.id = 'global-country-select';
    sel.style.padding = '.35rem .6rem';
        sel.classList.add('header-country-select');
        sel.style.fontSize = '.7rem';
        sel.style.borderRadius = '4px';
    sel.style.border = '1px solid rgba(17,24,39,.15)';
    sel.style.background = '#f8fafc';
    sel.style.color = '#111827';
    sel.style.backdropFilter = 'none';
        sel.style.minWidth = '140px';
        sel.style.zIndex = '500'; // ensure dropdown not hidden by other elements
        // Central country list so we can also reuse for checkout form later
        const COUNTRY_CHOICES = [
            ['PH', 'Philippines'], ['US', 'USA'], ['CA', 'Canada'], ['AU', 'Australia'], ['JP', 'Japan'], ['DE', 'Germany'], ['FR', 'France'], ['ES', 'Spain'], ['IT', 'Italy'], ['NL', 'Netherlands'], ['BE', 'Belgium'], ['SE', 'Sweden'], ['FI', 'Finland'], ['DK', 'Denmark'], ['IE', 'Ireland'], ['PT', 'Portugal'], ['AT', 'Austria'], ['PL', 'Poland'], ['CZ', 'Czech'], ['HU', 'Hungary'], ['SK', 'Slovakia'], ['RO', 'Romania'], ['BG', 'Bulgaria'], ['GR', 'Greece'], ['OTHER', 'Other']
        ];
        sel.innerHTML = COUNTRY_CHOICES.map(([c, l]) => `<option value="${c}">${l}</option>`).join('');
        wrap.appendChild(sel);
        headerActions.appendChild(wrap);
        const storedCountry = localStorage.getItem('globalCountry');
        if (storedCountry) sel.value = storedCountry;
        setActiveCurrency(countryToCurrency(sel.value));
        // Re-render any product price displays
        function rerenderPrices() {
            // Catalog cards
            document.querySelectorAll('.home-product-card .price').forEach(el => {
                const pid = el.closest('.home-product-card')?.getAttribute('data-product-id');
                if (pid && state.productsById.has(pid)) {
                    const p = state.productsById.get(pid);
                    el.textContent = money(p.priceCents);
                }
            });
            // Cart lines
            document.querySelectorAll('.cart-line .line-total').forEach(el => {
                const lineEl = el.closest('.cart-line');
                if (!lineEl) return; // skip
            });
            // Any standalone price elements with data-price-cents attribute
            document.querySelectorAll('[data-price-cents]').forEach(el => {
                const cents = parseInt(el.getAttribute('data-price-cents'), 10); if (!isNaN(cents)) el.textContent = money(cents);
            });
        }
        sel.addEventListener('change', () => {
            localStorage.setItem('globalCountry', sel.value);
            setActiveCurrency(countryToCurrency(sel.value));
            rerenderPrices();
        });
        // initial pass
        setTimeout(rerenderPrices, 0);

        // Debug / healing: if options somehow collapsed (user reported only one visible), rebuild once.
        setTimeout(() => {
            if (sel.options.length < COUNTRY_CHOICES.length) {
                console.warn('[country-select] Option list shorter than expected, rebuilding');
                sel.innerHTML = COUNTRY_CHOICES.map(([c, l]) => `<option value="${c}">${l}</option>`).join('');
                if (storedCountry) sel.value = storedCountry;
            }
        }, 50);
    }
    function mountHeaderEnhancements() {
        mountCountrySelector();
        mountCustomerHeaderControls();
        mountHomeMegaMenu();
        mountAdminHeaderControls();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountHeaderEnhancements, { once: true });
    } else {
        mountHeaderEnhancements();
    }
    function mountCustomerHeaderControls() {
        const header = document.querySelector('.site-header');
        if (!header) return;
        const actions = header.querySelector('.header-actions') || header;
        let container = document.getElementById('customer-auth-controls');
        const cartAnchor = actions.querySelector('.cart-fab');
        if (!container) {
            container = el('div', { class: 'customer-auth-controls', attrs: { id: 'customer-auth-controls' } });
            if (cartAnchor) actions.insertBefore(container, cartAnchor);
            else actions.appendChild(container);
        }
        container.innerHTML = '';
        const hideForAdmin = !!(state.admin.token && state.admin.user);
        if ((state.customer && state.customer.sessionToken) || hideForAdmin) {
            if (hideForAdmin) {
                container.classList.add('hidden');
                return;
            }
            container.classList.remove('hidden');
            const name = (state.customer.name || state.customer.email || 'Customer').trim();
            const signOutBtn = el('button', { class: 'header-auth-btn outline', attrs: { type: 'button' } }, 'Sign Out');
            signOutBtn.addEventListener('click', (evt) => { evt.preventDefault(); customerLogoutFlow(); });
            container.appendChild(signOutBtn);
            container.appendChild(el('span', { class: 'customer-name-label' }, name));
            const avatar = el('div', { class: 'customer-avatar', attrs: { 'aria-hidden': 'true' } });
            if (state.customer.avatarUrl) {
                avatar.appendChild(el('img', { attrs: { src: state.customer.avatarUrl, alt: '', referrerpolicy: 'no-referrer' } }));
            }
            container.appendChild(avatar);
        } else {
            container.classList.remove('hidden');
            const signInBtn = el('button', { class: 'header-auth-btn', attrs: { type: 'button' } }, 'Sign In');
            signInBtn.addEventListener('click', (evt) => { evt.preventDefault(); showCustomerAuthModal('login'); });
            const signUpBtn = el('button', { class: 'header-auth-btn outline', attrs: { type: 'button' } }, 'Sign Up');
            signUpBtn.addEventListener('click', (evt) => { evt.preventDefault(); showCustomerAuthModal('register'); });
            container.appendChild(signInBtn);
            container.appendChild(signUpBtn);
        }
    }

    function mountHomeMegaMenu() {
        const header = document.querySelector('.site-header');
        if (!header) return;
        const homeLink = header.querySelector('.nav-link[data-route="home"]');
        if (!homeLink) return;

        const linkId = homeLink.id || 'nav-home-link';
        if (!homeLink.id) homeLink.id = linkId;
        homeLink.setAttribute('aria-haspopup', 'true');
        homeLink.setAttribute('aria-controls', 'home-mega-menu');
        homeLink.setAttribute('aria-expanded', header.classList.contains('mega-menu-open') ? 'true' : 'false');

        let menu = document.getElementById('home-mega-menu');
        if (!menu) {
            menu = el('div', {
                class: 'home-mega-menu',
                attrs: {
                    id: 'home-mega-menu',
                    role: 'group',
                    'aria-hidden': 'true',
                    'aria-labelledby': linkId,
                    tabindex: '-1'
                }
            });
            header.appendChild(menu);
        } else {
            menu.setAttribute('aria-labelledby', linkId);
        }

        menu.innerHTML = '';
        const inner = el('div', { class: 'home-mega-menu-inner' });
        const columnsWrap = el('div', { class: 'home-mega-menu-columns' });

        CATALOG_PREVIEW_FILTERS.forEach(section => {
            const column = el('div', { class: 'home-mega-menu-column' },
                el('h3', { class: 'catalog-preview-heading' }, section.title)
            );
            const links = el('ul', { class: 'catalog-preview-links' });
            section.items.forEach(item => {
                const btn = el('button', {
                    class: 'catalog-preview-link',
                    attrs: { type: 'button', 'data-term': item.term }
                }, item.label);
                btn.addEventListener('click', (evt) => {
                    evt.preventDefault();
                    closeNow();
                    state.pendingCatalogSearchTerm = item.term;
                    navigate('catalog');
                });
                links.appendChild(el('li', {}, btn));
            });
            column.appendChild(links);
            columnsWrap.appendChild(column);
        });

        inner.appendChild(columnsWrap);

        menu.appendChild(inner);

        let hideTimer = null;

    const isPointerInside = () => homeLink.matches(':hover') || menu.matches(':hover');

        const hasFocusInside = () => {
            const active = document.activeElement;
            return !!active && (menu.contains(active) || active === homeLink);
        };

        const openMenu = () => {
            clearTimeout(hideTimer);
            header.classList.add('mega-menu-open');
            menu.setAttribute('aria-hidden', 'false');
            homeLink.setAttribute('aria-expanded', 'true');
        };

        const closeNow = () => {
            clearTimeout(hideTimer);
            header.classList.remove('mega-menu-open');
            menu.setAttribute('aria-hidden', 'true');
            homeLink.setAttribute('aria-expanded', 'false');
        };

        const scheduleClose = () => {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                if (isPointerInside() || hasFocusInside()) return;
                closeNow();
            }, 140);
        };

        const bindHoverHandlers = (el) => {
            el.addEventListener('pointerenter', openMenu);
            el.addEventListener('pointerleave', scheduleClose);
            el.addEventListener('focusin', openMenu);
            el.addEventListener('focusout', scheduleClose);
        };

        if (!homeLink.dataset.megaMenuWired) {
            bindHoverHandlers(homeLink);
            homeLink.addEventListener('keydown', (evt) => {
                if (evt.key === 'ArrowDown') {
                    evt.preventDefault();
                    openMenu();
                    const firstInteractive = menu.querySelector('button.catalog-preview-link');
                    if (firstInteractive) firstInteractive.focus();
                }
            });
            homeLink.addEventListener('click', () => {
                requestAnimationFrame(closeNow);
            });
            homeLink.dataset.megaMenuWired = 'true';
        }

        if (!menu.dataset.hoverBound) {
            bindHoverHandlers(menu);
            menu.dataset.hoverBound = 'true';
        }

        menu.addEventListener('keydown', (evt) => {
            if (evt.key === 'Escape') {
                evt.preventDefault();
                closeNow();
                homeLink.focus();
            }
        });

        if (!menu._escListener) {
            menu._escListener = (evt) => {
                if (evt.key === 'Escape' && header.classList.contains('mega-menu-open')) {
                    closeNow();
                    homeLink.focus();
                }
            };
            document.addEventListener('keydown', menu._escListener);
        }

        menu.querySelectorAll('button.catalog-preview-link').forEach(btn => {
            btn.addEventListener('focus', openMenu);
        });

        menu.querySelectorAll('[data-route="catalog"]').forEach(elm => {
            elm.addEventListener('click', () => {
                requestAnimationFrame(closeNow);
            });
        });

        closeNow();
    }

    function normalizeAdminProfile(value) {
        if (!value || typeof value !== 'object') return null;
        return {
            id: typeof value.id === 'string' ? value.id : '',
            email: typeof value.email === 'string' ? value.email : '',
            name: typeof value.name === 'string' ? value.name : ''
        };
    }

    function updateAdminNavVisibility() {
        const visible = !!(state.admin.token && state.admin.user);
        try {
            document.querySelectorAll('[data-route="admin"]').forEach(link => {
                link.style.display = visible ? '' : 'none';
            });
        } catch { /* no-op */ }
        if (document.body && document.body.classList) {
            document.body.classList.toggle('admin-authenticated', visible);
        }
    }

    function setAdminAuth(auth) {
        const token = auth && typeof auth.token === 'string' ? auth.token : '';
        const profile = normalizeAdminProfile(auth?.user);
        state.admin.token = token;
        state.admin.user = profile;
        try {
            if (token) localStorage.setItem('adminToken', token);
            else localStorage.removeItem('adminToken');
            if (profile) localStorage.setItem('adminProfile', JSON.stringify(profile));
            else localStorage.removeItem('adminProfile');
        } catch { /* ignore storage issues */ }
        updateAdminNavVisibility();
        mountAdminHeaderControls();
    }

    function clearAdminAuth(notifyUser = false) {
        const wasOnAdminRoute = state.currentRoute === 'admin';
        try {
            state.admin.token = '';
            state.admin.user = null;
            state.admin.orders = [];
            state.admin.discounts = [];
            state.admin.lowStock = [];
            state.admin.reviews = { status: 'pending', items: [] };
            try {
                localStorage.removeItem('adminToken');
                localStorage.removeItem('adminProfile');
            } catch { /* ignore */ }
            updateAdminNavVisibility();
            mountAdminHeaderControls();
            mountCustomerHeaderControls();
            if (notifyUser) notify('Admin signed out.', 'info', 2400);
        } catch (err) {
            console.error('Failed to clear admin auth state:', err);
        } finally {
            if (wasOnAdminRoute) {
                const redirectHome = () => {
                    try {
                        showSpinner(false);
                        if (state.currentRoute !== 'home') {
                            navigate('home');
                        } else {
                            renderHome();
                        }
                    } catch (navErr) {
                        console.error('Failed to navigate home after admin sign-out:', navErr);
                        try {
                            state.currentRoute = 'home';
                            renderHome();
                        } catch (renderErr) {
                            console.error('Failed to render home after admin sign-out:', renderErr);
                            try { window.location.replace('/'); } catch { /* no-op */ }
                        }
                    }
                };
                const scheduleRedirect = (fn) => {
                    if (typeof requestAnimationFrame === 'function') {
                        requestAnimationFrame(() => {
                            try { fn(); } catch (err) { console.error('RAF redirect failed after admin sign-out:', err); }
                        });
                        return;
                    }
                    if (typeof setTimeout === 'function') {
                        setTimeout(() => {
                            try { fn(); } catch (err) { console.error('Timeout redirect failed after admin sign-out:', err); }
                        }, 0);
                        return;
                    }
                    try {
                        fn();
                    } catch (err) {
                        console.error('Immediate redirect failed after admin sign-out:', err);
                    }
                };
                scheduleRedirect(redirectHome);
            }
        }
    }

    function showAdminLoginModal() {
        if (state.admin.token && state.admin.user) {
            navigate('admin');
            return;
        }
        showCustomerAuthModal('login');
    }

    function mountAdminHeaderControls() {
        const header = document.querySelector('.site-header');
        if (!header) return;
        const actions = header.querySelector('.header-actions') || header;
        let container = document.getElementById('admin-access-controls');
        const cartAnchor = actions.querySelector('.cart-fab');
        if (!container) {
            container = el('div', { class: 'admin-access-controls', attrs: { id: 'admin-access-controls' } });
            if (cartAnchor) actions.insertBefore(container, cartAnchor);
            else actions.appendChild(container);
        }
        container.innerHTML = '';
        const isAuthed = !!(state.admin.token && state.admin.user);
        if (isAuthed) {
            const name = (state.admin.user?.name || state.admin.user?.email || 'Admin').trim();
            const signOutBtn = el('button', { class: 'admin-auth-btn', attrs: { type: 'button', id: 'admin-header-signout' } }, 'Sign Out');
            signOutBtn.addEventListener('click', (evt) => { evt.preventDefault(); clearAdminAuth(true); });
            container.appendChild(signOutBtn);
            container.appendChild(el('span', { class: 'admin-name-label' }, name));
            const avatar = el('div', { class: 'admin-avatar', attrs: { 'aria-hidden': 'true' } });
            avatar.textContent = (name.charAt(0) || 'A').toUpperCase();
            container.appendChild(avatar);
            const customerControls = document.getElementById('customer-auth-controls');
            if (customerControls) customerControls.classList.add('hidden');
        }
        updateAdminNavVisibility();
    }

    function setCustomerSession(payload) {
        if (!payload || !payload.user) {
            clearCustomerSession(false);
            return;
        }
        const token = payload.token || state.customer?.sessionToken || '';
        if (!token) {
            clearCustomerSession(false);
            return;
        }
        const user = payload.user;
        const normalizedCountry = (user.country || '').toString().trim().toUpperCase();
        state.customer = {
            id: user.id || '',
            name: user.name || '',
            email: user.email || '',
            avatarUrl: user.avatarUrl || '',
            country: normalizedCountry,
            address: user.address || '',
            sessionToken: token
        };
        state.customerRefundThreads = new Map();
        if (state.customer.country) state.cartPage.shipCountry = state.customer.country;
        try {
            localStorage.setItem('customerSessionToken', token);
            localStorage.setItem('customerProfile', JSON.stringify({
                id: state.customer.id,
                name: state.customer.name,
                email: state.customer.email,
                avatarUrl: state.customer.avatarUrl,
                country: state.customer.country,
                address: state.customer.address
            }));
            if (state.customer.email) localStorage.setItem('customerEmail', state.customer.email);
            if (state.customer.country) localStorage.setItem('globalCountry', state.customer.country);
        } catch { }
        if (state.customer.country) {
            setActiveCurrency(countryToCurrency(state.customer.country));
            const sel = document.getElementById('global-country-select');
            if (sel && sel.value !== state.customer.country) {
                sel.value = state.customer.country;
                sel.dispatchEvent(new Event('change'));
            } else if (sel) {
                sel.dispatchEvent(new Event('change'));
            }
        }
        mountCustomerHeaderControls();
        if (state.currentRoute === 'my-orders') {
            renderMyOrders();
        }
    }

    function clearCustomerSession(notifyUser = false) {
        state.customer = null;
        state.customerRefundThreads = new Map();
        try {
            localStorage.removeItem('customerSessionToken');
            localStorage.removeItem('customerProfile');
        } catch { }
        mountCustomerHeaderControls();
        if (notifyUser) notify('Signed out.', 'info', 2400);
        if (state.currentRoute === 'my-orders') {
            renderMyOrders();
        }
    }

    async function customerLoginRequest(credentials) {
        const payload = {
            email: (credentials.email || '').trim(),
            password: credentials.password || ''
        };
        const data = await apiFetch('/api/customer/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const adminInfo = data?.admin;
        if (adminInfo?.token) {
            setAdminAuth({ token: adminInfo.token, user: adminInfo.user });
        }
        if (data?.token && data?.user) {
            setCustomerSession({ token: data.token, user: data.user });
        }
        if (!adminInfo?.token && !(data?.token && data?.user)) {
            throw new Error('Login failed.');
        }
        return data;
    }

    async function customerRegisterRequest(details) {
        let formattedAddress = '';
        if (details.address && typeof details.address === 'object') {
            try { formattedAddress = JSON.stringify(details.address); }
            catch { formattedAddress = ''; }
        } else {
            formattedAddress = (details.address || '').trim();
        }
        const payload = {
            name: (details.name || '').trim(),
            email: (details.email || '').trim(),
            password: details.password || '',
            country: (details.country || '').trim().toUpperCase(),
            address: formattedAddress,
            verificationCode: typeof details.verificationCode === 'string' ? details.verificationCode.trim() : '',
            verificationId: typeof details.verificationId === 'string' ? details.verificationId.trim() : ''
        };
        const data = await apiFetch('/api/customer/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!data || !data.user || !data.token) throw new Error('Registration failed.');
        setCustomerSession({ token: data.token, user: data.user });
        return data;
    }

    async function requestRegistrationCode(email) {
        const payload = { email: (email || '').trim() };
        return apiFetch('/api/customer/register/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            suppressAuthNotify: true
        });
    }

    async function customerLogoutRequest() {
        return apiFetch('/api/customer/logout', { method: 'POST', suppressAuthNotify: true });
    }

    async function customerLogoutFlow() {
        if (!state.customer || !state.customer.sessionToken) {
            clearCustomerSession(true);
            return;
        }
        try {
            await customerLogoutRequest();
        } catch (err) {
            console.warn('Customer logout failed:', err.message);
        }
        clearCustomerSession(true);
    }

    async function verifyCustomerSession() {
        if (!state.customer || !state.customer.sessionToken) {
            mountCustomerHeaderControls();
            return false;
        }
        try {
            const data = await apiFetch('/api/customer/session', { suppressAuthNotify: true });
            if (data && data.user) {
                const token = data.token || state.customer.sessionToken;
                if (!token) {
                    clearCustomerSession(false);
                    return false;
                }
                setCustomerSession({ token, user: data.user });
                return true;
            }
        } catch (err) {
            console.warn('Customer session verification failed:', err.message);
            clearCustomerSession(false);
        }
        return false;
    }

    function showCustomerAuthModal(initialMode = 'login') {
        let mode = initialMode === 'register' ? 'register' : 'login';
        let submitting = false;
        showModal((close) => {
            const wrap = el('div', { class: 'modal auth-dialog', attrs: { role: 'dialog', 'aria-modal': 'true' } });
            const closeBtn = el('button', { class: 'modal-close', attrs: { type: 'button' } }, '×');
            wrap.appendChild(closeBtn);
            const heading = el('h2', { class: 'auth-heading' }, mode === 'login' ? 'Welcome Back' : 'Create Account');
            const tabBar = el('div', { class: 'auth-tabs' },
                el('button', { class: 'auth-tab' + (mode === 'login' ? ' active' : ''), attrs: { type: 'button', 'data-mode': 'login' } }, 'Sign In'),
                el('button', { class: 'auth-tab' + (mode === 'register' ? ' active' : ''), attrs: { type: 'button', 'data-mode': 'register' } }, 'Sign Up')
            );
            const formSlot = el('div', { class: 'auth-form-slot' });
            const status = el('div', { class: 'auth-status tiny muted', attrs: { role: 'status' } });
            wrap.append(heading, tabBar, formSlot, status);
            modalRoot.appendChild(wrap);
            closeBtn.addEventListener('click', close);

            tabBar.addEventListener('click', (evt) => {
                const btn = evt.target.closest('[data-mode]');
                if (!btn) return;
                mode = btn.getAttribute('data-mode') === 'register' ? 'register' : 'login';
                heading.textContent = mode === 'login' ? 'Welcome Back' : 'Create Account';
                tabBar.querySelectorAll('.auth-tab').forEach(tab => tab.classList.toggle('active', tab.getAttribute('data-mode') === mode));
                renderForm();
            });

            const socialProviders = {
                google: { name: 'Google', label: 'Sign in with Google', href: '/auth/google', iconClass: 'google' },
                facebook: { name: 'Facebook', label: 'Sign in with Facebook', href: '/auth/facebook', iconClass: 'facebook' },
                apple: { name: 'Apple', label: 'Sign in with Apple', href: '/auth/apple', iconClass: 'apple' }
            };

            function renderForm() {
                formSlot.innerHTML = '';
                status.textContent = '';
                status.classList.remove('error');
                submitting = false;
                if (mode === 'login') {
                    formSlot.appendChild(buildLoginForm());
                } else {
                    formSlot.appendChild(buildRegisterForm());
                }
            }

            function handleSocialSignIn(provider) {
                const config = socialProviders[provider];
                if (!config) return;
                status.classList.remove('error');
                if (!config.href) {
                    status.textContent = `${config.name} sign-in is not configured.`;
                    status.classList.add('error');
                    return;
                }
                status.textContent = `Opening ${config.name} sign-in…`;
                const width = 520;
                const height = 640;
                const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
                const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
                const popup = window.open(config.href, `${provider}-oauth`, `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
                if (!popup || popup.closed || typeof popup.closed === 'undefined') {
                    status.textContent = `Please allow pop-ups to continue with ${config.name}.`;
                    status.classList.add('error');
                    notify(`Enable pop-ups and try again to sign in with ${config.name}.`, 'error', 4200);
                } else {
                    popup.focus();
                }
            }

            function buildLoginForm() {
                const emailField = el('div', { class: 'field' },
                    el('label', { attrs: { for: 'auth-email' } }, 'Email'),
                    el('input', { attrs: { id: 'auth-email', type: 'email', autocomplete: 'email', required: 'true', placeholder: 'you@example.com' } })
                );
                const passField = el('div', { class: 'field' },
                    el('label', { attrs: { for: 'auth-password' } }, 'Password'),
                    el('input', { attrs: { id: 'auth-password', type: 'password', autocomplete: 'current-password', required: 'true', placeholder: '••••••••' } })
                );
                if (state.customer?.email) emailField.querySelector('input').value = state.customer.email;
                const form = el('form', { class: 'auth-form', attrs: { autocomplete: 'on' } },
                    emailField,
                    passField,
                    el('button', { class: 'auth-submit', attrs: { type: 'submit' } }, 'Sign In')
                );
                form.addEventListener('submit', async (evt) => {
                    evt.preventDefault();
                    if (submitting) return;
                    const email = emailField.querySelector('input').value.trim();
                    const password = passField.querySelector('input').value;
                    if (!email || !password) {
                        status.textContent = 'Enter your email and password.';
                        status.classList.add('error');
                        return;
                    }
                    submitting = true;
                    status.classList.remove('error');
                    status.textContent = 'Signing you in…';
                    try {
                        const res = await customerLoginRequest({ email, password });
                        const adminGranted = !!(res.admin?.token);
                        if (adminGranted && !(res.token && res.user)) {
                            notify('Admin access granted.', 'success', 2600);
                            close();
                            navigate('admin');
                        } else {
                            const userInfo = res.user || res.admin?.user || {};
                            notify('Welcome back, ' + (userInfo.name || userInfo.email || 'shopper') + '!', 'success', 2600);
                            close();
                        }
                    } catch (err) {
                        status.textContent = err.message || 'Sign-in failed.';
                        status.classList.add('error');
                    } finally {
                        submitting = false;
                    }
                });
                const divider = el('div', { class: 'auth-divider' },
                    el('span', null, 'Or continue with')
                );
                const socialButtons = el('div', { class: 'social-buttons' },
                    ...Object.entries(socialProviders).map(([key, config]) => {
                        const btn = el('button', { class: `social-btn ${config.iconClass}`, attrs: { type: 'button', 'data-provider': key } },
                            el('span', { class: `social-icon ${config.iconClass}` }),
                            el('span', { class: 'social-label' }, config.label)
                        );
                        btn.addEventListener('click', () => handleSocialSignIn(key));
                        return btn;
                    })
                );
                return el('div', { class: 'auth-login-stack' }, form, divider, socialButtons);
            }

            function buildRegisterForm() {
                const codeInput = el('input', { attrs: { id: 'reg-code', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', required: 'true', placeholder: 'Enter verification code' } });
                const resendBtn = el('button', { class: 'resend-btn', attrs: { type: 'button', 'aria-label': 'Send verification code' } }, '✉');
                resendBtn.disabled = true;
                const resendLabel = el('span', { class: 'resend-label help-text' }, 'Enter your email to receive a code.');
                const codeField = el('div', { class: 'field verification-field' },
                    el('label', { attrs: { for: 'reg-code' } }, 'Code*'),
                    el('div', { class: 'input-inline' },
                        codeInput,
                        resendBtn
                    ),
                    resendLabel
                );
                const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                let resendTimer = null;
                let resendRemaining = 0;
                let sendingCode = false;
                let verificationId = '';
                let codeEmail = '';
                let codeSent = false;

                function clearResendTimer() {
                    if (resendTimer) {
                        clearInterval(resendTimer);
                        resendTimer = null;
                    }
                }

                function updateResendLabel() {
                    const emailValue = emailInput ? (emailInput.value || '').trim() : '';
                    const validEmail = EMAIL_PATTERN.test(emailValue);
                    const waiting = resendRemaining > 0;
                    const disabled = sendingCode || waiting || !validEmail;
                    resendBtn.disabled = disabled;
                    if (sendingCode) {
                        resendLabel.textContent = 'Sending verification code…';
                    } else if (!emailValue) {
                        resendLabel.textContent = 'Enter your email to receive a code.';
                    } else if (!validEmail) {
                        resendLabel.textContent = 'Enter a valid email address.';
                    } else if (waiting) {
                        resendLabel.textContent = `Resend code in ${resendRemaining}s`;
                    } else if (!codeSent) {
                        resendLabel.textContent = 'Send a verification code to continue.';
                    } else {
                        resendLabel.textContent = 'Need a new code? You can request another now.';
                    }
                    resendBtn.textContent = codeSent ? '↻' : '✉';
                    resendBtn.setAttribute('aria-label', codeSent ? 'Resend verification code' : 'Send verification code');
                }

                function startResendCountdown(seconds) {
                    clearResendTimer();
                    resendRemaining = Math.max(0, Number(seconds) || 0);
                    updateResendLabel();
                    if (resendRemaining <= 0) return;
                    resendTimer = setInterval(() => {
                        resendRemaining -= 1;
                        if (resendRemaining <= 0) {
                            clearResendTimer();
                        }
                        updateResendLabel();
                    }, 1000);
                }

                function resetVerificationState() {
                    verificationId = '';
                    codeEmail = '';
                    codeSent = false;
                    codeInput.value = '';
                    resendRemaining = 0;
                    clearResendTimer();
                    updateResendLabel();
                }

                resendBtn.addEventListener('click', async () => {
                    if (sendingCode) return;
                    const emailValue = emailInput ? (emailInput.value || '').trim() : '';
                    if (!EMAIL_PATTERN.test(emailValue)) {
                        status.textContent = 'Enter a valid email before requesting a code.';
                        status.classList.add('error');
                        updateResendLabel();
                        return;
                    }
                    const requestedEmail = emailValue.trim();
                    const requestedEmailLower = requestedEmail.toLowerCase();
                    sendingCode = true;
                    status.classList.remove('error');
                    status.textContent = 'Sending verification code…';
                    updateResendLabel();
                    try {
                        const res = await requestRegistrationCode(requestedEmail);
                        const currentNormalized = emailInput ? (emailInput.value || '').trim().toLowerCase() : '';
                        if (currentNormalized && currentNormalized !== requestedEmailLower) {
                            resetVerificationState();
                            status.textContent = 'Email updated. Request a new verification code.';
                            status.classList.add('error');
                            return;
                        }
                        verificationId = (res?.verificationId || '').trim();
                        codeEmail = requestedEmailLower;
                        codeSent = true;
                        status.textContent = `Verification code sent to ${requestedEmail}.`;
                        const cooldown = typeof res?.retryAfter === 'number' ? res.retryAfter : 45;
                        startResendCountdown(cooldown);
                    } catch (err) {
                        status.textContent = err.message || 'Unable to send verification code.';
                        status.classList.add('error');
                        resendRemaining = 0;
                        clearResendTimer();
                    } finally {
                        sendingCode = false;
                        updateResendLabel();
                    }
                });

                const firstInput = el('input', { attrs: { id: 'reg-first', type: 'text', autocomplete: 'given-name', required: 'true', placeholder: 'First name' } });
                const lastInput = el('input', { attrs: { id: 'reg-last', type: 'text', autocomplete: 'family-name', required: 'true', placeholder: 'Surname' } });
                const firstField = el('div', { class: 'field' },
                    el('label', { attrs: { for: 'reg-first' } }, 'First Name*'),
                    firstInput
                );
                const lastField = el('div', { class: 'field' },
                    el('label', { attrs: { for: 'reg-last' } }, 'Surname*'),
                    lastInput
                );
                const nameRow = el('div', { class: 'field-row double' }, firstField, lastField);

                const emailInput = el('input', { attrs: { id: 'reg-email', type: 'email', autocomplete: 'email', required: 'true', placeholder: 'you@example.com' } });
                const emailField = el('div', { class: 'field' },
                    el('label', { attrs: { for: 'reg-email' } }, 'Email*'),
                    emailInput
                );
                emailInput.addEventListener('input', () => {
                    const normalized = (emailInput.value || '').trim().toLowerCase();
                    if (codeEmail && normalized !== codeEmail) {
                        resetVerificationState();
                        status.textContent = 'Email changed. Request a new verification code.';
                        status.classList.add('error');
                    } else {
                        updateResendLabel();
                    }
                });
                updateResendLabel();

                const passwordInput = el('input', { attrs: { id: 'reg-pass', type: 'password', autocomplete: 'new-password', required: 'true', minlength: '8', placeholder: 'Minimum 8 characters' } });
                const passwordToggle = el('button', { class: 'password-toggle', attrs: { type: 'button', 'aria-label': 'Show password' } }, '👁');
                const passwordHints = el('ul', { class: 'password-hints' },
                    el('li', { attrs: { 'data-rule': 'length' } }, 'Minimum of 8 characters'),
                    el('li', { attrs: { 'data-rule': 'uppercase' } }, 'At least one uppercase letter'),
                    el('li', { attrs: { 'data-rule': 'lowercase' } }, 'At least one lowercase letter'),
                    el('li', { attrs: { 'data-rule': 'number' } }, 'At least one number')
                );
                const passField = el('div', { class: 'field password-field' },
                    el('label', { attrs: { for: 'reg-pass' } }, 'Password*'),
                    el('div', { class: 'input-inline' },
                        passwordInput,
                        passwordToggle
                    ),
                    passwordHints
                );

                const confirmInput = el('input', { attrs: { id: 'reg-confirm', type: 'password', autocomplete: 'new-password', required: 'true', minlength: '8', placeholder: 'Re-enter password' } });
                const confirmField = el('div', { class: 'field' },
                    el('label', { attrs: { for: 'reg-confirm' } }, 'Confirm Password*'),
                    confirmInput
                );

                const preferenceSelect = el('select', { attrs: { id: 'reg-preference', required: 'true' } },
                    el('option', { attrs: { value: '' } }, 'Select a preference'),
                    el('option', { attrs: { value: 'womens' } }, 'Women'),
                    el('option', { attrs: { value: 'mens' } }, 'Men'),
                    el('option', { attrs: { value: 'kids' } }, 'Kids'),
                    el('option', { attrs: { value: 'all' } }, 'Shop everything')
                );
                const preferenceField = el('div', { class: 'field' },
                    el('label', { attrs: { for: 'reg-preference' } }, 'Shopping Preference*'),
                    preferenceSelect
                );

                const countrySelect = el('select', { attrs: { id: 'reg-country', required: 'true' } },
                    el('option', { attrs: { value: 'PH' } }, 'Philippines'),
                    el('option', { attrs: { value: 'US' } }, 'United States'),
                    el('option', { attrs: { value: 'CA' } }, 'Canada'),
                    el('option', { attrs: { value: 'AU' } }, 'Australia'),
                    el('option', { attrs: { value: 'JP' } }, 'Japan'),
                    el('option', { attrs: { value: 'DE' } }, 'Germany'),
                    el('option', { attrs: { value: 'FR' } }, 'France'),
                    el('option', { attrs: { value: 'ES' } }, 'Spain'),
                    el('option', { attrs: { value: 'IT' } }, 'Italy'),
                    el('option', { attrs: { value: 'NL' } }, 'Netherlands'),
                    el('option', { attrs: { value: 'OTHER' } }, 'Other / International')
                );
                if (state.customer?.country) countrySelect.value = state.customer.country;
                const countryField = el('div', { class: 'field' },
                    el('label', { attrs: { for: 'reg-country' } }, 'Country / Region*'),
                    countrySelect
                );

                const dayInput = el('input', { attrs: { id: 'reg-day', type: 'number', inputmode: 'numeric', min: '1', max: '31', placeholder: 'Day', required: 'true' } });
                const monthInput = el('input', { attrs: { id: 'reg-month', type: 'number', inputmode: 'numeric', min: '1', max: '12', placeholder: 'Month', required: 'true' } });
                const yearInput = el('input', { attrs: { id: 'reg-year', type: 'number', inputmode: 'numeric', min: '1900', max: new Date().getFullYear(), placeholder: 'Year', required: 'true' } });
                const dobLabel = el('label', { attrs: { for: 'reg-day' } }, 'Date of Birth*');
                const dobRow = el('div', { class: 'field-row triple' },
                    el('div', { class: 'field mini-field' }, dayInput),
                    el('div', { class: 'field mini-field' }, monthInput),
                    el('div', { class: 'field mini-field' }, yearInput)
                );
                const dobField = el('div', { class: 'field dob-field' },
                    dobLabel,
                    dobRow,
                    el('p', { class: 'field-note' }, 'Get a birthday reward as a member.')
                );

                const marketingInput = el('input', { attrs: { id: 'reg-marketing', type: 'checkbox' } });
                const marketingField = el('label', { class: 'checkbox-field', attrs: { for: 'reg-marketing' } },
                    marketingInput,
                    el('span', null, 'Sign up for emails to get product updates, offers, and member benefits.')
                );

                const termsInput = el('input', { attrs: { id: 'reg-terms', type: 'checkbox', required: 'true' } });
                const termsHighlight = el('span', null,
                    'I agree to the ',
                    el('a', { attrs: { href: '/privacy', target: '_blank', rel: 'noreferrer' } }, 'Privacy Policy'),
                    ' and ',
                    el('a', { attrs: { href: '/terms', target: '_blank', rel: 'noreferrer' } }, 'Terms of Use'),
                    '.'
                );
                const termsField = el('label', { class: 'checkbox-field', attrs: { for: 'reg-terms' } },
                    termsInput,
                    termsHighlight
                );

                const submitBtn = el('button', { class: 'auth-submit', attrs: { type: 'submit' } }, 'Create Account');
                const form = el('form', { class: 'auth-form signup-form', attrs: { autocomplete: 'on' } },
                    codeField,
                    nameRow,
                    emailField,
                    passField,
                    confirmField,
                    preferenceField,
                    countryField,
                    dobField,
                    marketingField,
                    termsField,
                    submitBtn
                );

                passwordToggle.addEventListener('click', () => {
                    const showing = passwordInput.getAttribute('type') === 'text';
                    passwordInput.setAttribute('type', showing ? 'password' : 'text');
                    passwordToggle.textContent = showing ? '👁' : '🙈';
                    passwordToggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
                });

                function updatePasswordHints(value) {
                    const rules = {
                        length: value.length >= 8,
                        uppercase: /[A-Z]/.test(value),
                        lowercase: /[a-z]/.test(value),
                        number: /\d/.test(value)
                    };
                    passwordHints.querySelectorAll('li').forEach(li => {
                        const rule = li.getAttribute('data-rule');
                        if (rule && rules[rule]) li.classList.add('met'); else li.classList.remove('met');
                    });
                }
                passwordInput.addEventListener('input', (evt) => updatePasswordHints(evt.target.value || ''));
                updatePasswordHints('');

                form.addEventListener('submit', async (evt) => {
                    evt.preventDefault();
                    if (submitting) return;
                    const code = codeInput.value.trim();
                    const firstName = firstInput.value.trim();
                    const surname = lastInput.value.trim();
                    const email = emailInput.value.trim();
                    const pass = passwordInput.value;
                    const confirm = confirmInput.value;
                    const preference = preferenceSelect.value;
                    const country = (countrySelect.value || 'PH').toUpperCase();
                    const day = dayInput.value.trim();
                    const month = monthInput.value.trim();
                    const year = yearInput.value.trim();
                    const marketingOptIn = marketingInput.checked;
                    const termsChecked = termsInput.checked;

                    updatePasswordHints(pass);

                    if (codeEmail && codeEmail !== email.toLowerCase()) {
                        status.textContent = 'Request a new verification code for the updated email.';
                        status.classList.add('error');
                        return;
                    }
                    if (!verificationId) {
                        status.textContent = 'Request a verification code for your email before creating an account.';
                        status.classList.add('error');
                        return;
                    }
                    if (!code || code.length < 4) {
                        status.textContent = 'Enter the verification code we sent you.';
                        status.classList.add('error');
                        return;
                    }
                    if (!firstName || !surname || !email) {
                        status.textContent = 'Please fill in all required fields.';
                        status.classList.add('error');
                        return;
                    }
                    const strongPassword = pass.length >= 8 && /[A-Z]/.test(pass) && /[a-z]/.test(pass) && /\d/.test(pass);
                    if (!strongPassword) {
                        status.textContent = 'Password must meet all requirements.';
                        status.classList.add('error');
                        return;
                    }
                    if (pass !== confirm) {
                        status.textContent = 'Passwords do not match.';
                        status.classList.add('error');
                        return;
                    }
                    if (!preference) {
                        status.textContent = 'Select your shopping preference.';
                        status.classList.add('error');
                        return;
                    }
                    if (!day || !month || !year) {
                        status.textContent = 'Enter your complete date of birth.';
                        status.classList.add('error');
                        return;
                    }
                    if (!termsChecked) {
                        status.textContent = 'You must agree to the terms to continue.';
                        status.classList.add('error');
                        return;
                    }

                    submitting = true;
                    status.classList.remove('error');
                    status.textContent = 'Creating your account…';
                    const name = `${firstName} ${surname}`.trim();
                    const addressMeta = {
                        shoppingPreference: preference,
                        dob: { day, month, year },
                        marketingOptIn,
                        termsAcceptedAt: new Date().toISOString()
                    };
                    try {
                        const res = await customerRegisterRequest({ name, email, password: pass, country, address: addressMeta, verificationCode: code, verificationId });
                        notify('Account ready. Welcome, ' + (res.user?.name || firstName) + '!', 'success', 2800);
                        if (resendTimer) {
                            clearInterval(resendTimer);
                            resendTimer = null;
                        }
                        close();
                    } catch (err) {
                        status.textContent = err.message || 'Registration failed.';
                        status.classList.add('error');
                    } finally {
                        submitting = false;
                    }
                });
                return form;
            }

            renderForm();
        });
    }
    function money(cents, opts = { showBase: false }) {
        const usdValue = cents / 100;
        const cur = CURRENCY_RATES[activeCurrency] || CURRENCY_RATES.USD;
        const converted = usdValue * cur.rate;
        const primary = cur.format(converted);
        if (!opts.showBase || activeCurrency === 'USD') return primary;
        return primary + ` (USD $${usdValue.toFixed(2)})`;
    }

    function renderStarRating(rating, count = null, opts = {}) {
        const size = opts.size || 'sm';
        const showValue = opts.showValue !== false;
        const wrap = el('div', { class: `star-rating ${size}` });
        const safeRating = typeof rating === 'number' ? Math.max(0, Math.min(5, rating)) : null;
        const rounded = safeRating != null ? Math.round(safeRating * 10) / 10 : null;
        for (let i = 1; i <= 5; i++) {
            const filled = safeRating != null && safeRating >= i - 0.25;
            wrap.appendChild(el('span', { class: 'star' + (filled ? ' filled' : '') }, filled ? '★' : '☆'));
        }
        if (rounded != null && showValue) {
            wrap.appendChild(el('span', { class: 'star-value' }, rounded.toFixed(1)));
        }
        if (count != null) {
            wrap.appendChild(el('span', { class: 'star-count' }, `(${count})`));
        }
        return wrap;
    }
    // ----------------------------
    // Favorites (Wishlist)
    // ----------------------------
    const FAV_KEY = 'favorites';
    function saveFavorites() { try { localStorage.setItem(FAV_KEY, JSON.stringify(state.favorites)); } catch {} }
    function isFavorite(productId) { return state.favorites.includes(String(productId)); }
    function toggleFavorite(productId) {
        const id = String(productId);
        const idx = state.favorites.indexOf(id);
        if (idx >= 0) { state.favorites.splice(idx, 1); notify('Removed from favorites', 'info', 1800); }
        else { state.favorites.push(id); notify('Added to favorites', 'success', 1800); }
        saveFavorites(); updateFavoriteIcons();
    }
    function sanitizeFavorites() {
        const before = state.favorites.length;
        state.favorites = state.favorites.filter(id => { const p = state.productsById.get(id); return !!p && !p.deletedAt; });
        if (state.favorites.length !== before) saveFavorites();
    }
    function updateFavoriteIcons(root) {
        const scope = root || document;
        try {
            scope.querySelectorAll('[data-fav]')?.forEach(btn => {
                const id = btn.getAttribute('data-fav');
                const active = isFavorite(id);
                btn.classList.toggle('active', !!active);
                btn.setAttribute('aria-pressed', active ? 'true' : 'false');
                btn.textContent = active ? '♥' : '♡';
                btn.title = active ? 'Remove from favorites' : 'Add to favorites';
            });
        } catch {}
    }
    function loadCartLegacy() { try { return JSON.parse(localStorage.getItem('cart') || '[]'); } catch { return []; } }
    function saveCart() {
        localStorage.setItem('cart', JSON.stringify(state.cart));
        updateCartBadge();
        // Live refresh mini-cart if open
        if (typeof updateMiniCartDrawer === 'function') {
            try { updateMiniCartDrawer(); } catch { }
        }
    }
    function findCartItem(id, variantId = null) { return state.cart.find(ci => ci.productId === id && (ci.variantId || null) === (variantId || null)); }
    function updateCartBadge() { const b = document.getElementById('cart-count'); if (b) b.textContent = String(state.cart.reduce((a, l) => a + l.quantity, 0)); }
    function sanitizeCart() {
        const before = state.cart.length;
        state.cart = state.cart.filter(ci => {
            const p = state.productsById.get(ci.productId);
            return p && !p.deletedAt; // drop missing or soft-deleted
        });
        if (state.cart.length !== before) {
            saveCart();
            notify(`Removed ${before - state.cart.length} unavailable item(s) from cart`, 'warn', 5000);
        }
    }
    function addToCart(productId, quantity, variantId = null) {
        const p = state.productsById.get(productId); if (!p) return;
        // Determine stock (variant specific if variant provided)
        let maxStock = productStock(p);
        if (variantId && p.variants) {
            const v = p.variants.find(v => v.id === variantId);
            if (v) maxStock = v.inventory;
        }
        if (maxStock <= 0) { notify('Out of stock', 'error'); return; }
        const existing = findCartItem(productId, variantId);
        if (existing) {
            const newQty = Math.min(existing.quantity + quantity, maxStock);
            if (newQty === existing.quantity) {
                notify('Reached stock limit (' + maxStock + ')', 'warn');
                return;
            }
            existing.quantity = newQty;
        } else {
            const addQty = Math.min(quantity, maxStock);
            state.cart.push({ productId, quantity: addQty, variantId: variantId || null });
            if (addQty < quantity) notify('Limited to available stock (' + maxStock + ')', 'warn');
        }
        saveCart();
        notify('Added to cart', 'success');
        // Auto open mini-cart for quick confirmation (desktop)
        if (MINI_CART_ENABLED && window.matchMedia && window.matchMedia('(pointer:fine)').matches) {
            openMiniCartDrawer(true);
        }
    }
    function setCartQuantity(productId, qty, variantId = null) {
        const item = findCartItem(productId, variantId);
        if (!item) return;
        if (qty <= 0) state.cart = state.cart.filter(ci => ci !== item); else item.quantity = qty;
        saveCart();
    }
    function removeFromCart(productId, variantId = null) {
        state.cart = state.cart.filter(ci => !(ci.productId === productId && (ci.variantId || null) === (variantId || null)));
        saveCart();
    }
    function cartSubtotalCents() {
        return state.cart.reduce((sum, line) => {
            const p = state.productsById.get(line.productId); if (!p) return sum;
            let unit = p.priceCents;
            if (line.variantId && Array.isArray(p.variants)) {
                const variant = p.variants.find(v => v.id === line.variantId);
                if (variant && variant.priceCents != null) unit = variant.priceCents;
            }
            return sum + unit * line.quantity;
        }, 0);
    }
    function showSpinner(show = true) {
        if (!spinnerRoot) return;
        if (show) {
            spinnerRoot.innerHTML = '';
            spinnerRoot.classList.remove('hidden');
            spinnerRoot.appendChild(el('div', { class: 'spinner' }));
        } else {
            spinnerRoot.classList.add('hidden');
            spinnerRoot.innerHTML = '';
        }
    }
    function notify(message, type = 'info', timeout = 3000, options = {}) {
        let root = document.getElementById('toast-root');
        if (!root) { root = el('div', { attrs: { id: 'toast-root' } }); document.body.appendChild(root); }
        root.classList.remove('hidden');
        root.style.position = 'fixed';
        root.style.bottom = '1rem';
        root.style.right = '1rem';
        root.style.display = 'flex';
        root.style.flexDirection = 'column-reverse';
        root.style.gap = '.5rem';
        root.style.zIndex = '999';
        const box = el('div', { class: `alert alert-${type}` });
        const msgSpan = el('span', {}, message);
        box.appendChild(msgSpan);
        if (options.actionText && typeof options.onAction === 'function') {
            const btn = el('button', { class: 'btn btn-xs btn-outline', attrs: { style: 'margin-left:.75rem' } }, options.actionText);
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                options.onAction();
                box.classList.add('fade-out');
                box.addEventListener('transitionend', () => box.remove(), { once: true });
            });
            box.appendChild(btn);
        }
        box.style.cursor = 'pointer';
        root.appendChild(box);
        // Limit stack size
        const max = 4;
        while (root.children.length > max) {
            root.firstElementChild?.classList.add('fade-out');
        }
        let remaining = timeout;
        let start = Date.now();
        let timer = setTimeout(fade, remaining);
        function fade() {
            box.classList.add('fade-out');
            box.addEventListener('transitionend', () => box.remove(), { once: true });
        }
        box.addEventListener('mouseenter', () => {
            clearTimeout(timer);
            remaining -= (Date.now() - start);
        });
        box.addEventListener('mouseleave', () => {
            start = Date.now();
            timer = setTimeout(fade, remaining);
        });
        box.addEventListener('click', fade);
    }
    /* ----------------------------
     * API Helpers
     * ---------------------------- */
    async function apiFetch(path, opts = {}) {
        const { suppressAuthNotify = false, headers: headersOverride, ...rest } = opts;
        const headers = { ...(headersOverride || {}) };
        if (state.admin.token && !headers['X-Admin-Token']) headers['X-Admin-Token'] = state.admin.token;
        if (state.customer?.sessionToken && !headers.Authorization && !headers.authorization) headers.Authorization = 'Bearer ' + state.customer.sessionToken;
        const res = await fetch(path, { ...rest, headers });
        const noContent = res.status === 204;
        const raw = noContent ? '' : await res.text();
        if (!res.ok) {
            let msg = `HTTP ${res.status}`;
            let body = null;
            if (raw) {
                try {
                    body = JSON.parse(raw);
                    msg = body.error || (Array.isArray(body.errors) ? body.errors.join(', ') : msg);
                } catch {
                    const trimmed = raw.trim();
                    if (trimmed) msg = trimmed.slice(0, 400);
                }
            }
            if (res.status === 401) {
                const isAdminPath = path.startsWith('/api/admin');
                if (isAdminPath) {
                    clearAdminAuth(false);
                    if (!suppressAuthNotify) notify('Admin sign-in required.', 'error', 4800);
                } else if (state.customer?.sessionToken) {
                    clearCustomerSession(false);
                    if (!suppressAuthNotify) notify('Please sign in to continue.', 'warn', 3200);
                }
            }
            const error = new Error(msg);
            error.status = res.status;
            error.body = body;
            throw error;
        }
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return raw; }
    }

    async function loadProducts(includeDeleted = false) {
        // If admin toggled showDeleted, force it regardless of caller param
        const wantDeleted = includeDeleted || state.admin.showDeleted;
        const qs = wantDeleted ? '?includeDeleted=1' : '';
        const data = await apiFetch('/api/products' + qs);
        const seen = new Set();
        state.products = data.products.filter(prod => {
            const key = String(prod.id);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        state.productsById = new Map(state.products.map(p => [p.id, p]));
        // Clean up favorites that reference missing/deleted products
        sanitizeFavorites();
    }

    async function loadMeta() {
        state.meta = await apiFetch('/api/meta');
    }

    async function fetchProductReviews(productId, { force = false, limit } = {}) {
        if (!force && state.reviewsByProduct.has(productId)) {
            return state.reviewsByProduct.get(productId);
        }
        const qs = limit ? `?limit=${encodeURIComponent(limit)}` : '';
        const data = await apiFetch(`/api/products/${productId}/reviews${qs}`);
        state.reviewsByProduct.set(productId, data);
        return data;
    }

    async function submitProductReview(productId, payload) {
        const res = await apiFetch(`/api/products/${productId}/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        // Force next read to refetch so summary stays accurate
        state.reviewsByProduct.delete(productId);
        return res;
    }

    async function loadAdminReviews(status = 'pending') {
        if (!state.admin.token || !state.admin.user) {
            state.admin.reviews = { status, items: [] };
            return;
        }
        const data = await apiFetch(`/api/admin/reviews?status=${encodeURIComponent(status)}`);
        state.admin.reviews = { status: data.status, items: data.reviews };
    }

    async function moderateReview(reviewId, action, notes) {
        if (!state.admin.token || !state.admin.user) throw new Error('Admin sign-in required');
        const endpoint = action === 'approve' ? 'approve' : 'reject';
        const body = notes ? JSON.stringify({ notes }) : '{}';
        const res = await apiFetch(`/api/admin/reviews/${reviewId}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
        });
        const productId = res?.review?.productId;
        const summary = res?.summary;
        if (productId && summary) {
            const entry = state.productsById.get(productId);
            if (entry) entry.reviewSummary = summary;
            const idx = state.products.findIndex(p => p.id === productId);
            if (idx >= 0) state.products[idx] = { ...state.products[idx], reviewSummary: summary };
            state.reviewsByProduct.delete(productId);
        }
        return res;
    }

    async function loadOrdersAdmin() {
        if (!state.admin.token || !state.admin.user) {
            state.admin.orders = [];
            return;
        }
        try {
            const data = await apiFetch('/api/orders');
            state.admin.orders = data.orders;
        } catch (e) {
            console.warn('Failed to load orders:', e.message);
            state.admin.orders = [];
        }
    }

    function getAdminOrders() {
        if (Array.isArray(state.admin.orders)) return state.admin.orders;
        if (Array.isArray(state.admin.orders?.items)) return state.admin.orders.items;
        return [];
    }

    const REFUND_STATUS_LABELS = {
        pending: 'Pending review',
        in_review: 'In review',
        approved: 'Approved',
        refunded: 'Refunded',
        declined: 'Declined'
    };

    function getRefundStatus(status) {
        const key = typeof status === 'string' ? status.toLowerCase().replace(/\s+/g, '_') : '';
        return REFUND_STATUS_LABELS[key] ? key : 'pending';
    }

    function formatRefundStatus(status) {
        const key = getRefundStatus(status);
        return REFUND_STATUS_LABELS[key] || 'Pending review';
    }

    function getRefundThreadStore(scope = 'admin') {
        if (scope === 'customer') {
            if (!state.customerRefundThreads || !(state.customerRefundThreads instanceof Map)) {
                state.customerRefundThreads = new Map();
            }
            return state.customerRefundThreads;
        }
        if (!state.admin.refundThreads || !(state.admin.refundThreads instanceof Map)) {
            state.admin.refundThreads = new Map();
        }
        return state.admin.refundThreads;
    }

    async function loadRefundMessages(orderId, { force, scope = 'admin' } = {}) {
        const normalizedId = String(orderId || '').trim();
        if (!normalizedId) throw new Error('Missing order id');
        const store = getRefundThreadStore(scope);
        const cache = store.get(normalizedId);
        if (cache && !force && !cache.loading && !cache.error) return cache.messages;
        store.set(normalizedId, { messages: cache?.messages || [], loading: true, error: null });
        try {
            const data = await apiFetch(`/api/orders/${encodeURIComponent(normalizedId)}/refund-messages`);
            const messages = Array.isArray(data?.messages) ? data.messages : [];
            store.set(normalizedId, { messages, loading: false, stale: false, error: null });
            return messages;
        } catch (err) {
            const friendly = err?.message || 'Unable to load';
            store.set(normalizedId, { messages: cache?.messages || [], loading: false, stale: true, error: friendly });
            err.orderId = normalizedId;
            throw err;
        }
    }

    async function postRefundMessage(orderId, message, { scope = 'admin' } = {}) {
        if (!orderId) throw new Error('Order ID required');
        const payload = { message };
        const data = await apiFetch(`/api/orders/${encodeURIComponent(orderId)}/refund-messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const store = getRefundThreadStore(scope);
        const cache = store.get(orderId);
        if (cache) {
            cache.messages = [...cache.messages, data.message];
            cache.loading = false;
        } else {
            store.set(orderId, { messages: [data.message], loading: false });
        }
        return data.message;
    }

    async function respondToRefund(orderId, payload) {
        const normalizedId = String(orderId || '').trim();
        if (!normalizedId) throw new Error('Order ID required');
        const data = await apiFetch(`/api/orders/${encodeURIComponent(normalizedId)}/refund-response`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (data?.message) {
            const store = getRefundThreadStore('admin');
            const cache = store.get(normalizedId);
            if (cache) {
                cache.messages = [...cache.messages, data.message];
                cache.loading = false;
            } else {
                store.set(normalizedId, { messages: [data.message], loading: false });
            }
        }
        return data;
    }

    function describeRefundUsage(order) {
        const requestedAt = order.returnRequestedAt ? new Date(order.returnRequestedAt) : null;
        const deliveredAt = order.completedAt ? new Date(order.completedAt) : (order.shippedAt ? new Date(order.shippedAt) : null);
        if (!requestedAt) return 'Awaiting customer request timestamp.';
        if (!deliveredAt) return 'Item was not confirmed delivered before this request.';
        const diffMs = requestedAt.getTime() - deliveredAt.getTime();
        if (diffMs <= 0) return 'Refund requested before delivery confirmation.';
        const days = Math.max(0, diffMs / (1000 * 60 * 60 * 24));
        if (days < 1) return 'Refund requested within 24 hours of delivery.';
        if (days < 7) return `Used for about ${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'} before requesting a refund.`;
        return `Used for roughly ${Math.round(days)} days before requesting a refund.`;
    }

    function renderRefundMessagesThread(orderId, { scope = 'admin', root } = {}) {
        const attr = scope === 'customer' ? 'data-customer-refund-messages' : 'data-refund-messages';
        const searchRoot = root || document;
        const container = searchRoot.querySelector(`[${attr}="${CSS.escape(orderId)}"]`);
        if (!container) return;
        const store = getRefundThreadStore(scope);
        const cache = store?.get(orderId);
        const messages = cache?.messages || [];
        container.innerHTML = '';
        if (cache?.error) {
            container.appendChild(el('p', { class: 'tiny alert' }, `Conversation unavailable (${cache.error}). Refresh orders and ensure the backend has the latest refund routes.`));
            return;
        }
        if (!messages.length) {
            container.appendChild(el('p', { class: 'tiny muted' }, 'No replies yet.'));
            return;
        }
        messages.forEach(entry => {
            const role = entry.authorRole || 'admin';
            container.appendChild(el('div', { class: 'refund-message refund-message--' + role },
                el('div', { class: 'refund-message-head' },
                    el('span', { class: 'refund-message-author' }, entry.authorName || (role === 'admin' ? 'Store team' : 'Customer')),
                    entry.createdAt ? el('span', { class: 'refund-message-date tiny muted' }, new Date(entry.createdAt).toLocaleString()) : null
                ),
                el('p', { class: 'refund-message-body' }, entry.body || '')
            ));
        });
    }

    async function loadDiscounts() {
        if (!state.admin.token || !state.admin.user) { state.admin.discounts = []; return; }
        try {
            const d = await apiFetch('/api/discounts');
            state.admin.discounts = d.discounts;
        } catch {
            state.admin.discounts = [];
        }
    }

    async function loadLowStock(threshold = 5) {
        if (!state.admin.token || !state.admin.user) { state.admin.lowStock = []; return; }
        try {
            const d = await apiFetch('/api/products/low-stock?threshold=' + threshold);
            state.admin.lowStock = d.products;
        } catch {
            state.admin.lowStock = [];
        }
    }

    async function createProduct(payload) {
        return apiFetch('/api/products', {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json' }
        });
    }

    async function updateProduct(id, payload) {
        return apiFetch(`/api/products/${id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json' }
        });
    }

    async function deleteProduct(id) {
        return apiFetch(`/api/products/${id}`, {
            method: 'DELETE'
        });
    }

    async function destroyProduct(id) {
        return apiFetch(`/api/products/${id}/permanent`, {
            method: 'DELETE'
        });
    }

    async function bulkDestroyProducts(ids) {
        return apiFetch('/api/products/bulk-permanent-delete', {
            method: 'POST',
            body: JSON.stringify({ ids }),
            headers: { 'Content-Type': 'application/json' }
        });
    }

    async function bulkDeleteProducts(ids) {
        return apiFetch('/api/products/bulk-delete', {
            method: 'POST',
            body: JSON.stringify({ ids }),
            headers: { 'Content-Type': 'application/json' }
        });
    }

    async function restoreProduct(id) { return apiFetch(`/api/products/${id}/restore`, { method: 'POST' }); }
    async function bulkRestoreProducts(ids) {
        return apiFetch('/api/products/bulk-restore', {
            method: 'POST',
            body: JSON.stringify({ ids }),
            headers: { 'Content-Type': 'application/json' }
        });
    }

    async function fulfillOrder(id) {
        return apiFetch(`/api/orders/${id}/fulfill`, {
            method: 'POST'
        });
    }
    async function payOrder(id) {
        return apiFetch(`/api/orders/${id}/pay`, {
            method: 'POST'
        });
    }
    async function shipOrder(id) {
        return apiFetch(`/api/orders/${id}/ship`, { method: 'POST' });
    }
    async function completeOrder(id, email) {
        if (!email) throw new Error('email required');
        return apiFetch(`/api/orders/${id}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
    }
    async function cancelOrder(id, reason) {
        const options = { method: 'POST' };
        if (reason) {
            options.headers = { 'Content-Type': 'application/json' };
            options.body = JSON.stringify({ reason });
        }
        return apiFetch(`/api/orders/${id}/cancel`, options);
    }

    async function createOrder(cartLines, customer, discountCode, shippingCode) {
        // Send direct items array (server supports items[] fallback without cartId)
        return apiFetch('/api/orders', {
            method: 'POST',
            body: JSON.stringify({ items: cartLines.map(l => ({ productId: l.productId, quantity: l.quantity, variantId: l.variantId || null })), customer, discountCode, shippingCode }),
            headers: { 'Content-Type': 'application/json' }
        });
    }

    async function startStripeCheckout(cartLines, customer, discountCode, shippingCode) {
        const payload = {
            items: cartLines.map(l => ({ productId: l.productId, quantity: l.quantity, variantId: l.variantId || null })),
            customer,
            discountCode,
            shippingCode
        };
        const response = await apiFetch('/api/checkout/stripe/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!window.Stripe) throw new Error('Stripe.js unavailable');
        const stripe = window.Stripe(response.publishableKey);
        const { error } = await stripe.redirectToCheckout({ sessionId: response.sessionId });
        if (error) throw new Error(error.message || 'Stripe redirect failed');
    }

    /* ----------------------------
     * Routing
     * ---------------------------- */

    async function verifyAdminToken() {
        if (!state.admin.token || !state.admin.user) {
            updateAdminNavVisibility();
            return false;
        }
        try {
            await apiFetch('/api/admin/verify', { suppressAuthNotify: true });
            updateAdminNavVisibility();
            return true;
        } catch (err) {
            clearAdminAuth(false);
            return false;
        }
    }

    function navigate(route, params = {}) {
        state.currentRoute = route;
        setBodyRoute(route);
        // Update active nav highlighting
        try {
            document.querySelectorAll('.nav-link').forEach(a => {
                const r = a.getAttribute('data-route');
                if (r === route) a.classList.add('active'); else a.classList.remove('active');
            });
        } catch { }
        if (route === 'catalog') {
            renderCatalog();
        } else if (route === 'product' && params.id) {
            showProductDetail(params.id);
        } else if (route === 'product-reviews' && params.id) {
            renderProductReviews(params.id);
        } else if (route === 'cart') {
            renderCart();
        } else if (route === 'favorites') {
            renderFavorites();
        } else if (route === 'my-orders') {
            renderMyOrders();
        } else if (route === 'admin') {
            // Protect admin: verify token before rendering
            (async () => {
                const ok = await verifyAdminToken();
                if (!ok) {
                    notify('Admin access denied. Please sign in first.', 'error', 5000);
                    navigate('home');
                    showAdminLoginModal();
                    return;
                }
                renderAdmin();
            })();
            return; // async handles render
        } else if (route === 'order-confirmation') {
            renderOrderConfirmation();
        } else {
            renderHome();
        }
    }

    document.body.addEventListener('click', (e) => {
        const link = e.target.closest('[data-route]');
        if (!link || link === document.body) return;
    const tag = link.tagName;
    const role = (link.getAttribute('role') || '').toLowerCase();
    const isInteractive = tag === 'A' || tag === 'BUTTON' || role === 'button' || role === 'link';
        if (!isInteractive) return;
        e.preventDefault();
        const route = link.getAttribute('data-route');
        const id = link.getAttribute('data-id');
        navigate(route, id ? { id } : {});
    });

    /* ----------------------------
     * RENDER: Home
     * ---------------------------- */

    function renderHome() {
        rootEl.innerHTML = '';
    const hero = el('section', { class: 'hero-section snap-section' },
            el('div', { class: 'hero-eyebrow' }, 'Original apparel'),
            el('h1', { class: 'hero-title' },
                el('span', { class: 'hero-gradient-text' }, 'Premium Tees'), ' Crafted with Simplicity.'
            ),
            el('p', { class: 'hero-copy' }, 'Browse a curated list of minimal, high‑quality shirts. Experiment with product management.'),
            el('div', { class: 'hero-actions' },
                el('button', { class: 'btn btn-primary hero-btn', attrs: { 'data-route': 'catalog' } }, 'Explore Catalog'),
                el('button', { class: 'btn btn-outline hero-btn', attrs: { 'data-route': 'cart' } }, 'View Cart'),
                el('button', { class: 'btn btn-outline hero-btn', attrs: { 'data-route': 'favorites' } }, 'Favorites')
            )
        );

        rootEl.appendChild(hero);

        const makeFeatureStat = (value, label) => el('div', { class: 'hero-feature-stat' },
            el('span', { class: 'stat-value' }, value),
            el('span', { class: 'stat-label' }, label)
        );
        const featureTags = ['Classic tees', 'Essential picks', 'Breathable cotton', 'New drops'];

    const heroFeature = el('section', { class: 'hero-feature-band mt-lg snap-section' },
            el('video', {
                class: 'hero-feature-video',
                attrs: {
                    autoplay: '',
                    muted: '',
                    loop: '',
                    playsinline: '',
                    preload: 'auto',
                    poster: '/uploads/6a0e3f98-67be-46ce-be31-cafb591885d5.avif',
                    'aria-hidden': 'true'
                }
            },
                el('source', {
                    attrs: {
                        src: '/uploads/videoplayback.mp4',
                        type: 'video/mp4'
                    }
                }),
                'Your browser does not support the video tag.'
            ),
            el('div', { class: 'hero-feature-overlay' },
                el('span', { class: 'feature-eyebrow' }, 'Season 07 · Daily Essentials'),
                el('h2', { class: 'feature-title' }, 'Refresh Your Everyday Rotation'),
                el('p', { class: 'feature-blurb' }, 'Discover breathable staples built to flex with your day. Explore balanced color stories and premium cotton blends curated by our merch team.'),
                el('div', { class: 'hero-feature-stats' },
                    makeFeatureStat('7+', 'Catalog entries'),
                    makeFeatureStat('7', 'New this month'),
                    makeFeatureStat('5.0★', 'Community score')
                ),
                el('div', { class: 'hero-feature-tags' },
                    featureTags.map((tag) => el('span', { class: 'hero-feature-tag' }, tag))
                )
            ),
            el('span', { class: 'hero-feature-badge' }, 'New drop every Friday')
        );

        rootEl.appendChild(heroFeature);
        const featureVideo = heroFeature.querySelector('.hero-feature-video');
        if (featureVideo) {
            const markFallback = () => heroFeature.classList.add('video-fallback');
            featureVideo.addEventListener('error', markFallback);
            featureVideo.addEventListener('emptied', markFallback);
            featureVideo.addEventListener('loadeddata', () => heroFeature.classList.remove('video-fallback'));
            try {
                featureVideo.muted = true;
                const playPromise = featureVideo.play();
                if (playPromise && typeof playPromise.then === 'function') {
                    playPromise.catch(() => {
                        featureVideo.setAttribute('data-autoplay-failed', 'true');
                        featureVideo.removeAttribute('autoplay');
                        featureVideo.setAttribute('controls', 'true');
                    });
                }
            } catch (err) {
                featureVideo.setAttribute('data-autoplay-failed', 'true');
                featureVideo.removeAttribute('autoplay');
                featureVideo.setAttribute('controls', 'true');
                markFallback();
            }
        }
        // Inline catalog preview appended on home (scroll down to view)
    let previewHeader = el('h2', { class: 'home-catalog-heading mt-lg' }, '');
    previewHeader = null;
    const previewWrap = el('div', { class: 'home-catalog-preview mt-md' });
        const topRow = el('div', { class: 'catalog-preview-top' });
        topRow.appendChild(
            el('div', { class: 'catalog-preview-summary' },
                el('p', { class: 'catalog-preview-subhead' }, 'One standout pick, a wallet-friendly option, and a fresh release—curated straight from the catalog.')
            )
        );

        previewWrap.appendChild(topRow);

        const previewProducts = state.products.filter(p => !p.deletedAt);
        const SECTION_LIMIT = 4;
        const usedAcrossSections = new Set();

        const toTimestamp = (val) => {
            if (!val) return 0;
            const time = new Date(val).getTime();
            return Number.isFinite(time) ? time : 0;
        };

        const bestPickSorter = (a, b) => {
            const qtyA = a.reviewSummary?.totalQuantity ?? 0;
            const qtyB = b.reviewSummary?.totalQuantity ?? 0;
            if (qtyB !== qtyA) return qtyB - qtyA;
            const ratingA = a.reviewSummary?.average ?? 0;
            const ratingB = b.reviewSummary?.average ?? 0;
            if (ratingB !== ratingA) return ratingB - ratingA;
            const countA = a.reviewSummary?.count ?? 0;
            const countB = b.reviewSummary?.count ?? 0;
            if (countB !== countA) return countB - countA;
            return toTimestamp(b.createdAt) - toTimestamp(a.createdAt);
        };

        const priceSorter = (a, b) => {
            const priceA = a.priceCents ?? Number.MAX_SAFE_INTEGER;
            const priceB = b.priceCents ?? Number.MAX_SAFE_INTEGER;
            if (priceA !== priceB) return priceA - priceB;
            return bestPickSorter(a, b);
        };

        const newestSorter = (a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt);

        const selectTop = (candidates, limit, avoidSet) => {
            const picks = [];
            const seen = new Set();
            const tryCollect = (skipAvoid) => {
                for (const product of candidates) {
                    if (!product || picks.length >= limit) break;
                    if (seen.has(product.id)) continue;
                    if (!skipAvoid && avoidSet?.has(product.id)) continue;
                    picks.push(product);
                    seen.add(product.id);
                }
            };
            tryCollect(false);
            if (picks.length < limit) tryCollect(true);
            return picks;
        };

        const bestCandidates = [...previewProducts].sort(bestPickSorter);
        const bestPickItems = selectTop(bestCandidates, SECTION_LIMIT, usedAcrossSections);
        bestPickItems.forEach(p => usedAcrossSections.add(p.id));

        const budgetCandidates = [...previewProducts].sort(priceSorter);
        const budgetItems = selectTop(budgetCandidates, SECTION_LIMIT, usedAcrossSections);
        budgetItems.forEach(p => usedAcrossSections.add(p.id));

        const nowMs = Date.now();
        const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
        const newReleaseFilter = (p) => {
            const created = toTimestamp(p.createdAt);
            return created && (nowMs - created) <= THIRTY_DAYS;
        };
        const newReleaseBase = (() => {
            const within = previewProducts.filter(newReleaseFilter);
            if (within.length) return within.sort(newestSorter);
            return [...previewProducts].sort(newestSorter);
        })();
        const newReleaseItems = selectTop(newReleaseBase, SECTION_LIMIT, usedAcrossSections);
        newReleaseItems.forEach(p => usedAcrossSections.add(p.id));

        const buildPreviewCard = (p) => {
            const card = el('article', { class: 'home-product-card', attrs: { 'data-product-id': p.id } });

            const imgWrap = el('div', { class: 'hpc-img-wrap' });
            const primaryImage = Array.isArray(p.images) && p.images.length ? p.images[0] : productPlaceholder(720);
            imgWrap.appendChild(el('img', { attrs: { src: primaryImage, alt: p.title || 'Product image', loading: 'lazy' } }));
            card.appendChild(imgWrap);

            const body = el('div', { class: 'hpc-body' });
            body.appendChild(el('h3', { class: 'hpc-title' }, p.title || 'Untitled product'));

            const meta = el('div', { class: 'hpc-meta' },
                el('span', { class: 'hpc-price price', attrs: { 'data-price-cents': p.priceCents || 0 } }, money(p.priceCents || 0))
            );

            const stockCount = productStock(p);
            const stockLabel = stockCount <= 0 ? 'Out of stock' : stockCount < 5 ? `Low stock (${stockCount})` : `${stockCount} in stock`;
            meta.appendChild(el('span', { class: 'hpc-stock' }, stockLabel));
            body.appendChild(meta);

            if (p.reviewSummary && p.reviewSummary.count > 0) {
                const rating = renderStarRating(p.reviewSummary.average, p.reviewSummary.count, { size: 'xs' });
                rating.classList.add('hpc-rating');
                body.appendChild(rating);
            }

            const favActive = isFavorite(p.id);
            const actions = el('div', { class: 'hpc-actions' },
                el('button', {
                    class: 'hpc-action hpc-view',
                    attrs: { type: 'button', 'data-view-id': p.id }
                }, 'View'),
                el('button', {
                    class: 'hpc-action hpc-add',
                    attrs: { type: 'button', 'data-add': p.id }
                }, 'Add'),
                el('button', {
                    class: 'hpc-heart' + (favActive ? ' active' : ''),
                    attrs: {
                        type: 'button',
                        'data-fav': p.id,
                        'aria-pressed': favActive ? 'true' : 'false',
                        'aria-label': favActive ? 'Remove from favorites' : 'Add to favorites'
                    }
                }, favActive ? '♥' : '♡')
            );

            body.appendChild(actions);
            card.appendChild(body);
            return card;
        };

        const sections = [
            {
                key: 'best',
                title: 'Best Pick',
                blurb: 'Most purchased with standout reviews.',
                products: bestPickItems
            },
            {
                key: 'budget',
                title: 'Budget Friendly',
                blurb: 'Lowest price without compromising on style.',
                products: budgetItems
            },
            {
                key: 'new',
                title: 'New Release',
                blurb: 'Fresh drop added within the last month.',
                products: newReleaseItems
            }
        ];

        const formatMetrics = (sectionKey, products) => {
            if (!products || !products.length) return null;
            const primary = products[0];
            const bits = [];
            if (sectionKey === 'best') {
                const sold = primary.reviewSummary?.totalQuantity ?? 0;
                if (sold > 0) bits.push(`${sold} bought`);
                const rating = primary.reviewSummary?.average;
                if (rating) bits.push(`${rating.toFixed(1)}★ rating`);
            }
            if (sectionKey === 'budget') {
                bits.push('From ' + money(primary.priceCents));
            }
            if (sectionKey === 'new') {
                const created = toTimestamp(primary.createdAt);
                if (created) bits.push('Added ' + new Date(created).toLocaleDateString());
            }
            if (!bits.length) return null;
            return el('div', { class: 'spotlight-meta' }, bits.join(' • '));
        };

        const spotlightSections = el('div', { class: 'spotlight-sections' });
        sections.forEach(section => {
            const container = el('section', { class: 'spotlight-section' });
            const header = el('div', { class: 'spotlight-header' },
                el('div', { class: 'spotlight-title-row' },
                    el('h3', { class: 'spotlight-title' }, section.title),
                    el('button', {
                        class: 'spotlight-more',
                        attrs: {
                            type: 'button',
                            'data-route': 'catalog',
                            'data-spotlight-section': section.key
                        }
                    }, 'More')
                ),
                el('p', { class: 'spotlight-desc' }, section.blurb)
            );
            const metrics = formatMetrics(section.key, section.products);
            if (metrics) header.appendChild(metrics);
            container.appendChild(header);

            if (section.products.length) {
                const grid = el('div', { class: 'home-catalog-grid spotlight-grid' });
                section.products.forEach(p => grid.appendChild(buildPreviewCard(p)));
                container.appendChild(grid);
            } else {
                container.appendChild(el('div', { class: 'spotlight-empty muted small' }, 'No qualifying product yet. Check back soon.'));
            }

            spotlightSections.appendChild(container);
        });

        previewWrap.appendChild(spotlightSections);
    const moreBtn = el('div', { class: 'mt-md' }, el('button', { class: 'btn btn-outline', attrs: { 'data-route': 'catalog' } }, 'View Full Catalog'));
    if (previewHeader) rootEl.appendChild(previewHeader);
        rootEl.appendChild(previewWrap);
        rootEl.appendChild(moreBtn);

        updateFavoriteIcons(previewWrap);
        previewWrap.addEventListener('click', e => {
            const favBtn = e.target.closest('[data-fav]');
            if (favBtn) { e.preventDefault(); toggleFavorite(favBtn.getAttribute('data-fav')); return; }
            const btnAdd = e.target.closest('[data-add]');
            if (btnAdd) { addToCart(btnAdd.getAttribute('data-add'), 1); return; }
            const btnView = e.target.closest('[data-view-id]');
            if (btnView) { navigate('product', { id: btnView.getAttribute('data-view-id') }); }
        });
    }

    /* ----------------------------
     * RENDER: Favorites
     * ---------------------------- */
    function renderFavorites() {
        setBodyRoute('favorites');
        rootEl.innerHTML = '';
        const layout = el('div', { class: 'favorites-layout' });

        const storeName = (state.meta?.storeName || '').trim();
        const shopperName = (localStorage.getItem('shopperName') || storeName || '').trim();
        const displayName = shopperName || 'Guest Shopper';

        const content = el('section', { class: 'favorites-content' });
        const header = el('div', { class: 'favorites-header' },
            el('div', { class: 'favorites-header-copy' },
                el('h1', { class: 'favorites-title' }, 'Favorites'),
                el('p', { class: 'favorites-subtitle' }, `Hey ${displayName}, here are the products you saved for later.`)
            )
        );
        const searchWrap = el('div', { class: 'favorites-search' },
            el('input', { class: 'favorites-search-input', attrs: { type: 'search', placeholder: 'Search favorites…', id: 'favorites-search' } })
        );
        header.appendChild(searchWrap);
        content.appendChild(header);

        const grid = el('div', { class: 'favorites-grid', attrs: { id: 'favorites-grid' } });
        content.appendChild(grid);

        layout.appendChild(content);
        rootEl.appendChild(layout);

        function currentFavorites() {
            return state.favorites
                .map(id => state.productsById.get(String(id)))
                .filter(p => !!p && !p.deletedAt);
        }

        function renderGrid(list) {
            grid.innerHTML = '';
            if (!list.length) {
                grid.appendChild(el('div', { class: 'favorites-empty' },
                    el('h3', {}, 'No favorites yet'),
                    el('p', { class: 'muted' }, 'Browse the catalog and tap the heart icon to save products you love.'),
                    el('button', { class: 'btn btn-outline', attrs: { 'data-route': 'catalog' } }, 'Back to Catalog')
                ));
                return;
            }
            list.forEach(p => {
                const card = el('article', { class: 'favorite-card', attrs: { 'data-id': p.id } },
                    el('div', { class: 'favorite-card-img' },
                        el('img', { attrs: { src: p.images[0] || productPlaceholder(640), alt: p.title, loading: 'lazy' } })
                    ),
                    el('button', { class: 'favorite-card-heart', attrs: { type: 'button', 'data-fav': p.id, 'aria-pressed': isFavorite(p.id) ? 'true' : 'false' } }, '♥'),
                    el('div', { class: 'favorite-card-body' },
                        el('h3', { class: 'favorite-card-title' }, p.title),
                        el('div', { class: 'favorite-card-meta' },
                            el('span', { class: 'favorite-card-price' }, money(p.priceCents)),
                            el('span', { class: 'favorite-card-stock' }, `Stock: ${productStock(p)}`)
                        ),
                        p.tags && p.tags.length ? el('div', { class: 'favorite-card-tags' }, ...p.tags.slice(0, 3).map(tag => el('span', { class: 'favorite-card-tag' }, tag))) : null,
                        el('div', { class: 'favorite-card-actions' },
                            el('button', { class: 'btn-fav-buy', attrs: { type: 'button', 'data-buy': p.id } }, 'Buy'),
                            el('button', { class: 'btn-fav-secondary', attrs: { type: 'button', 'data-view-id': p.id } }, 'View')
                        )
                    )
                );
                grid.appendChild(card);
            });
            updateFavoriteIcons(grid);
        }

        const searchInput = searchWrap.querySelector('input');
        function applyFilter() {
            const term = (searchInput.value || '').toLowerCase().trim();
            let list = currentFavorites();
            if (term) {
                list = list.filter(p => (
                    p.title.toLowerCase().includes(term) ||
                    (p.tags || []).some(tag => tag.toLowerCase().includes(term)) ||
                    (p.description || '').toLowerCase().includes(term)
                ));
            }
            renderGrid(list);
        }

        applyFilter();

        content.addEventListener('click', e => {
            const favBtn = e.target.closest('[data-fav]');
            if (favBtn) {
                e.preventDefault();
                toggleFavorite(favBtn.getAttribute('data-fav'));
                applyFilter();
                return;
            }
            const buyBtn = e.target.closest('[data-buy]');
            if (buyBtn) {
                addToCart(buyBtn.getAttribute('data-buy'), 1);
                return;
            }
            const viewBtn = e.target.closest('[data-view-id]');
            if (viewBtn) {
                navigate('product', { id: viewBtn.getAttribute('data-view-id') });
            }
        });

        content.addEventListener('input', e => {
            if (e.target === searchInput) {
                applyFilter();
            }
        });
    }

    function featureCard(icon, title, copy) {
        return el('div', { class: 'feature-card' },
            el('div', { class: 'feature-icon' }, icon),
            el('div', {},
                el('h4', {}, title),
                el('p', {}, copy)
            )
        );
    }

    /* ----------------------------
     * RENDER: Catalog
     * ---------------------------- */

    function renderCatalog() {
        rootEl.innerHTML = '';

        const availableProducts = state.products.filter(p => !p.deletedAt);
        const baseProducts = availableProducts.slice();
        const priceValues = baseProducts.map(p => p.priceCents || 0);
        const maxPrice = priceValues.length ? Math.max(...priceValues) : 0;
        const minPrice = 0;

        const page = el('section', { class: 'catalog-page' });
        const header = el('header', { class: 'catalog-page-header' },
            el('div', {},
                el('h1', { class: 'catalog-page-title' }, 'Product Catalog'),
                el('p', { class: 'catalog-page-subtitle muted' }, 'Discover our curated collection of modern furniture and decor')
            )
        );
        page.appendChild(header);

        const controlsBar = el('div', { class: 'catalog-controls' });
        const searchForm = el('form', { class: 'catalog-search-bar', attrs: { role: 'search' } },
            el('span', { class: 'catalog-search-icon' },
                el('img', {
                    attrs: {
                        src: 'https://img.icons8.com/ios/120/search--v1.png',
                        width: '18',
                        height: '18',
                        alt: 'Search icon'
                    }
                })
            ),
            el('label', { class: 'sr-only', attrs: { for: 'catalog-search-input' } }, 'Search products'),
            el('input', {
                class: 'catalog-search-input',
                attrs: {
                    id: 'catalog-search-input',
                    type: 'search',
                    placeholder: 'Search products…',
                    autocomplete: 'off'
                }
            })
        );
        controlsBar.appendChild(searchForm);

        const actionsGroup = el('div', { class: 'catalog-actions-group' },
            el('label', { class: 'catalog-sort-label', attrs: { for: 'catalog-sort-select' } }, 'Sort by'),
            el('select', { class: 'catalog-sort-select', attrs: { id: 'catalog-sort-select' } },
                el('option', { attrs: { value: 'recommended' } }, 'Recommended'),
                el('option', { attrs: { value: 'price-asc' } }, 'Price: Low to High'),
                el('option', { attrs: { value: 'price-desc' } }, 'Price: High to Low'),
                el('option', { attrs: { value: 'newest' } }, 'Newest Arrivals')
            )
        );
        controlsBar.appendChild(actionsGroup);
        page.appendChild(controlsBar);

        const metaRow = el('div', { class: 'catalog-meta-row' });
        const resultCountEl = el('span', { class: 'catalog-result-count muted' }, '');
        metaRow.appendChild(resultCountEl);
        page.appendChild(metaRow);

        const layout = el('div', { class: 'catalog-layout' });
        const aside = el('aside', { class: 'catalog-filters' });
        const filterHeader = el('div', { class: 'filters-header' },
            el('h2', {}, 'Filters'),
            el('button', { class: 'filters-clear', attrs: { type: 'button' } }, 'Clear All')
        );
        aside.appendChild(filterHeader);

        const filterContent = el('div', { class: 'filters-content' });

        const categoryGroup = el('div', { class: 'filter-group' });
        categoryGroup.appendChild(el('div', { class: 'filter-group-header' },
            el('span', { class: 'filter-title' }, 'Category')
        ));
        const categoryList = el('div', { class: 'filter-list' });
        const categoryMap = new Map();
        baseProducts.forEach(p => {
            (Array.isArray(p.tags) ? p.tags : []).forEach(tag => {
                const norm = (tag || '').toString().trim().toLowerCase();
                if (!norm) return;
                const label = norm.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                if (!categoryMap.has(norm)) categoryMap.set(norm, label);
            });
        });
        if (!categoryMap.size) {
            categoryMap.set('seating', 'Seating');
            categoryMap.set('lighting', 'Lighting');
        }
        const categoryCheckboxes = [];
        categoryMap.forEach((label, value) => {
            const checkbox = el('label', { class: 'filter-checkbox' },
                el('input', { attrs: { type: 'checkbox', value } }),
                el('span', {}, label)
            );
            categoryList.appendChild(checkbox);
            categoryCheckboxes.push(checkbox.querySelector('input'));
        });
        categoryGroup.appendChild(categoryList);
        filterContent.appendChild(categoryGroup);

        const priceGroup = el('div', { class: 'filter-group' },
            el('div', { class: 'filter-group-header' },
                el('span', { class: 'filter-title' }, 'Price Range')
            )
        );
        const sliderWrap = el('div', { class: 'price-slider' });
        const priceValueLabel = el('span', { class: 'price-value tiny muted' }, maxPrice ? `Up to ${money(maxPrice)}` : 'All prices');
        const priceSlider = el('input', {
            class: 'price-input',
            attrs: {
                type: 'range',
                min: String(minPrice),
                max: String(maxPrice || 0),
                value: String(maxPrice || 0),
                step: '1000'
            }
        });
        sliderWrap.appendChild(priceSlider);
        sliderWrap.appendChild(priceValueLabel);
        priceGroup.appendChild(sliderWrap);
        filterContent.appendChild(priceGroup);

        const ratingGroup = el('div', { class: 'filter-group' },
            el('div', { class: 'filter-group-header' },
                el('span', { class: 'filter-title' }, 'Minimum Rating')
            )
        );
        const ratingList = el('div', { class: 'filter-list rating-list' });
        const ratingButtons = [4, 3, 2, 1].map(star => {
            const btn = el('button', {
                class: 'rating-chip',
                attrs: { type: 'button', 'data-rating': String(star) }
            }, `${star}+ stars`);
            ratingList.appendChild(btn);
            return btn;
        });
        ratingGroup.appendChild(ratingList);
        filterContent.appendChild(ratingGroup);

        const availabilityGroup = el('div', { class: 'filter-group' },
            el('div', { class: 'filter-group-header' },
                el('span', { class: 'filter-title' }, 'Availability')
            )
        );
        const inStockToggle = el('label', { class: 'filter-checkbox' },
            el('input', { attrs: { type: 'checkbox', id: 'filter-in-stock' } }),
            el('span', {}, 'In stock only')
        );
        availabilityGroup.appendChild(inStockToggle);
        filterContent.appendChild(availabilityGroup);

        aside.appendChild(filterContent);
        layout.appendChild(aside);

        const productsWrap = el('section', { class: 'catalog-products' });
        const grid = el('div', { class: 'catalog-grid' });
        productsWrap.appendChild(grid);
        layout.appendChild(productsWrap);
        page.appendChild(layout);

        rootEl.appendChild(page);

        let productsShown = baseProducts.slice();
        const filtersState = {
            searchTerm: '',
            categories: new Set(),
            maxPrice: maxPrice || 0,
            minRating: 0,
            inStockOnly: false,
            sort: 'recommended'
        };

        function productCategoryLabel(product) {
            const tags = Array.isArray(product.tags) ? product.tags : [];
            if (tags.length) {
                return (tags[0] || '').toString().replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            }
            return 'Collection';
        }

        function productIsNew(product) {
            const createdDate = new Date(product.createdAt || '');
            if (!Number.isFinite(createdDate.getTime())) return false;
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
            return createdDate >= oneMonthAgo;
        }

        function productDiscount(product) {
            const compare = product.compareAtPriceCents;
            const price = product.priceCents;
            if (compare && compare > price) {
                const percent = Math.round(((compare - price) / compare) * 100);
                return percent > 0 ? percent : 0;
            }
            const match = (Array.isArray(product.tags) ? product.tags : [])
                .map(t => String(t))
                .find(t => /(\d+)%/.test(t));
            if (match) {
                const num = parseInt(match, 10);
                return Number.isFinite(num) ? num : 0;
            }
            return 0;
        }

        function buildCard(product) {
            const card = el('article', { class: 'catalog-card', attrs: { 'data-id': product.id } });
            const badges = el('div', { class: 'catalog-card-badges' });
            if (productIsNew(product)) badges.appendChild(el('span', { class: 'catalog-badge badge-new' }, 'New'));
            const discount = productDiscount(product);
            if (discount > 0) badges.appendChild(el('span', { class: 'catalog-badge badge-sale' }, `-${discount}%`));

            const favActive = isFavorite(product.id);
            const favButton = el('button', {
                class: 'catalog-card-fav' + (favActive ? ' active' : ''),
                attrs: {
                    type: 'button',
                    'data-fav': product.id,
                    'aria-pressed': favActive ? 'true' : 'false',
                    title: favActive ? 'Remove from favorites' : 'Add to favorites'
                }
            }, favActive ? '♥' : '♡');

            const media = el('div', { class: 'catalog-card-media' },
                el('img', {
                    attrs: {
                        src: (Array.isArray(product.images) && product.images[0]) || productPlaceholder(720),
                        alt: product.title || 'Product photo',
                        loading: 'lazy'
                    }
                }),
                badges,
                favButton
            );
            card.appendChild(media);

            const body = el('div', { class: 'catalog-card-body' });
            body.appendChild(el('span', { class: 'catalog-card-category tiny muted' }, productCategoryLabel(product)));
            body.appendChild(el('h3', { class: 'catalog-card-title' }, product.title || 'Product'));

            if (product.reviewSummary && product.reviewSummary.count > 0) {
                const rating = renderStarRating(product.reviewSummary.average, product.reviewSummary.count, { size: 'sm' });
                rating.classList.add('catalog-card-rating');
                body.appendChild(rating);
            }

            const priceWrap = el('div', { class: 'catalog-card-pricing' },
                el('span', { class: 'catalog-card-price', attrs: { 'data-price-cents': product.priceCents } }, money(product.priceCents))
            );
            if (product.compareAtPriceCents && product.compareAtPriceCents > product.priceCents) {
                priceWrap.appendChild(el('span', { class: 'catalog-card-price-compare' }, money(product.compareAtPriceCents)));
            }
            body.appendChild(priceWrap);

            const footer = el('div', { class: 'catalog-card-footer' },
                el('button', {
                    class: 'catalog-card-add',
                    attrs: { type: 'button', 'data-add': product.id }
                }, 'Add to Cart'),
                el('button', {
                    class: 'catalog-card-view',
                    attrs: { type: 'button', 'data-view-id': product.id }
                }, 'View Details')
            );
            body.appendChild(footer);

            card.appendChild(body);
            return card;
        }

        function renderItems() {
            grid.innerHTML = '';
            if (!productsShown.length) {
                grid.classList.add('is-empty');
                grid.appendChild(el('div', { class: 'catalog-empty-state' }, 'No products match your filters right now.'));
            } else {
                grid.classList.remove('is-empty');
                productsShown.forEach(p => grid.appendChild(buildCard(p)));
            }
            updateFavoriteIcons(page);
            const count = productsShown.length;
            resultCountEl.textContent = count === 1 ? '1 product found' : `${count} products found`;
        }

        function applyFilters() {
            const term = filtersState.searchTerm.toLowerCase();
            const activeCategories = filtersState.categories;
            const maxPriceCents = filtersState.maxPrice || maxPrice;
            const minRating = filtersState.minRating;
            const inStockOnly = filtersState.inStockOnly;

            let filtered = baseProducts.filter(product => {
                if (term) {
                    const title = (product.title || '').toLowerCase();
                    const desc = (product.description || '').toLowerCase();
                    const tags = Array.isArray(product.tags) ? product.tags : [];
                    if (!title.includes(term) && !desc.includes(term) && !tags.some(t => (t || '').toLowerCase().includes(term))) {
                        return false;
                    }
                }
                if (activeCategories.size) {
                    const tags = new Set((Array.isArray(product.tags) ? product.tags : []).map(t => (t || '').toLowerCase()));
                    if (!Array.from(activeCategories).some(cat => tags.has(cat))) return false;
                }
                if (maxPriceCents && product.priceCents != null && product.priceCents > maxPriceCents) return false;
                if (minRating > 0) {
                    const avg = product.reviewSummary && product.reviewSummary.count > 0 ? product.reviewSummary.average : 0;
                    if (!avg || avg < minRating) return false;
                }
                if (inStockOnly && productStock(product) <= 0) return false;
                return true;
            });

            const sortKey = filtersState.sort;
            const collator = new Intl.Collator('en');
            filtered.sort((a, b) => {
                if (sortKey === 'price-asc') return (a.priceCents || 0) - (b.priceCents || 0);
                if (sortKey === 'price-desc') return (b.priceCents || 0) - (a.priceCents || 0);
                if (sortKey === 'newest') {
                    const aDate = new Date(a.createdAt || 0).getTime();
                    const bDate = new Date(b.createdAt || 0).getTime();
                    return (Number.isFinite(bDate) ? bDate : 0) - (Number.isFinite(aDate) ? aDate : 0);
                }
                const aScore = (productIsNew(a) ? 1000 : 0) + ((a.reviewSummary?.average || 0) * 10);
                const bScore = (productIsNew(b) ? 1000 : 0) + ((b.reviewSummary?.average || 0) * 10);
                if (bScore !== aScore) return bScore - aScore;
                return collator.compare(a.title || '', b.title || '');
            });

            productsShown = filtered;
            renderItems();
        }

        grid.addEventListener('click', event => {
            const favBtn = event.target.closest('[data-fav]');
            if (favBtn) {
                event.preventDefault();
                toggleFavorite(favBtn.getAttribute('data-fav'));
                updateFavoriteIcons(page);
                return;
            }
            const addBtn = event.target.closest('[data-add]');
            if (addBtn) {
                addToCart(addBtn.getAttribute('data-add'), 1);
                return;
            }
            const viewBtn = event.target.closest('[data-view-id]');
            if (viewBtn) {
                navigate('product', { id: viewBtn.getAttribute('data-view-id') });
            }
        });

        const searchInput = searchForm.querySelector('input[type="search"]');
        searchForm.addEventListener('submit', event => {
            event.preventDefault();
            filtersState.searchTerm = searchInput.value || '';
            applyFilters();
        });
        searchInput.addEventListener('input', () => {
            filtersState.searchTerm = searchInput.value || '';
            if (!filtersState.searchTerm.trim()) applyFilters();
        });

        categoryCheckboxes.forEach(inputEl => {
            inputEl.addEventListener('change', () => {
                const value = (inputEl.value || '').toLowerCase();
                if (!value) return;
                if (inputEl.checked) filtersState.categories.add(value); else filtersState.categories.delete(value);
                applyFilters();
            });
        });

        if (maxPrice) {
            priceSlider.addEventListener('input', () => {
                const val = parseInt(priceSlider.value, 10);
                if (Number.isFinite(val)) {
                    filtersState.maxPrice = val;
                    priceValueLabel.textContent = `Up to ${money(val)}`;
                    applyFilters();
                }
            });
        } else {
            priceSlider.disabled = true;
            priceValueLabel.textContent = 'All prices';
        }

        ratingButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const rating = parseInt(btn.getAttribute('data-rating') || '0', 10) || 0;
                filtersState.minRating = filtersState.minRating === rating ? 0 : rating;
                ratingButtons.forEach(b => b.classList.toggle('active', parseInt(b.getAttribute('data-rating') || '0', 10) === filtersState.minRating));
                applyFilters();
            });
        });

        const inStockInput = inStockToggle.querySelector('input');
        inStockInput.addEventListener('change', () => {
            filtersState.inStockOnly = !!inStockInput.checked;
            applyFilters();
        });

        const sortSelect = actionsGroup.querySelector('select');
        sortSelect.addEventListener('change', () => {
            filtersState.sort = sortSelect.value;
            applyFilters();
        });

        filterHeader.querySelector('.filters-clear').addEventListener('click', () => {
            filtersState.searchTerm = '';
            filtersState.categories.clear();
            filtersState.maxPrice = maxPrice || 0;
            filtersState.minRating = 0;
            filtersState.inStockOnly = false;
            filtersState.sort = 'recommended';
            searchInput.value = '';
            categoryCheckboxes.forEach(cb => { cb.checked = false; });
            if (!priceSlider.disabled) priceSlider.value = String(maxPrice || 0);
            priceValueLabel.textContent = maxPrice ? `Up to ${money(maxPrice)}` : 'All prices';
            ratingButtons.forEach(b => b.classList.remove('active'));
            inStockInput.checked = false;
            sortSelect.value = 'recommended';
            applyFilters();
        });

        if (state.pendingCatalogSearchTerm) {
            const term = state.pendingCatalogSearchTerm;
            state.pendingCatalogSearchTerm = '';
            searchInput.value = term;
            filtersState.searchTerm = term;
        }

        applyFilters();
    }

    function productStock(p) {
        // Prefer totalInventory (computed on server) then baseInventory then fallback 0
        return (p.totalInventory != null ? p.totalInventory : (p.baseInventory != null ? p.baseInventory : 0));
    }
    function inventoryBadge(p) {
        const stock = productStock(p);
        let cls = 'inventory';
        if (stock <= 0) cls += ' out';
        else if (stock < 5) cls += ' low';
        return el('span', { class: cls }, stock <= 0 ? 'Out' : `Stock: ${stock}`);
    }

    /* ----------------------------
     * RENDER: Product Detail
     * ---------------------------- */

    function showProductDetail(id) {
        const prod = state.productsById.get(id);
        if (!prod) { notify('Product missing', 'error'); navigate('catalog'); return; }
        rootEl.innerHTML = '';
        let selectedVariant = null;
        // Gallery
    const images = (prod.images && prod.images.length ? prod.images : [productPlaceholder(1024)]);
    const hasMultipleImages = images.length > 1;
        let currentIdx = 0;
        const mainImg = el('img', { class: 'pd-main-img', attrs: { src: images[0], alt: prod.title, loading: 'eager' } });
        const mainWrap = el('div', { class: 'pd-main-wrap' });
        const prevBtn = el('button', { class: 'pd-gallery-nav pd-prev', attrs: { type: 'button', 'aria-label': 'Previous image' } }, '‹');
        const nextBtn = el('button', { class: 'pd-gallery-nav pd-next', attrs: { type: 'button', 'aria-label': 'Next image' } }, '›');
        mainWrap.appendChild(prevBtn);
        mainWrap.appendChild(mainImg);
        mainWrap.appendChild(nextBtn);
        if (!hasMultipleImages) {
            prevBtn.classList.add('disabled');
            nextBtn.classList.add('disabled');
            prevBtn.disabled = true;
            nextBtn.disabled = true;
        }

        const imageIndicator = hasMultipleImages ? el('div', { class: 'pd-gallery-indicator tiny muted' }, `Image 1 of ${images.length}`) : null;

        function selectImage(i) {
            if (i < 0 || i >= images.length) return;
            currentIdx = i;
            mainImg.src = images[i];
            if (imageIndicator) imageIndicator.textContent = `Image ${i + 1} of ${images.length}`;
        }

        if (hasMultipleImages) {
            const step = (delta) => {
                const nextIndex = (currentIdx + delta + images.length) % images.length;
                selectImage(nextIndex);
            };
            prevBtn.addEventListener('click', () => step(-1));
            nextBtn.addEventListener('click', () => step(1));
        }

        const galleryWrap = el('div', { class: 'pd-gallery pv-gallery-card', attrs: { tabIndex: '0' } }, mainWrap, imageIndicator);
        if (hasMultipleImages) {
            galleryWrap.addEventListener('keydown', e => {
                if (e.key === 'ArrowRight') { selectImage((currentIdx + 1) % images.length); e.preventDefault(); }
                else if (e.key === 'ArrowLeft') { selectImage((currentIdx - 1 + images.length) % images.length); e.preventDefault(); }
            });
        }
        // Variant grouping
        const variantsBox = (function buildVariants() {
            if (!prod.variants || !prod.variants.length) return el('div');
            const byOption = {};
            prod.variants.forEach(v => Object.entries(v.optionValues || {}).forEach(([k, val]) => { if (!byOption[k]) byOption[k] = new Set(); byOption[k].add(val); }));
            const selection = {};
            function renderGroup(name, values) {
                const wrap = el('div', { class: 'variant-group' }, el('div', { class: 'tiny muted' }, name));
                const row = el('div', { class: 'vg-row flex gap-sm flex-wrap' });
                values.forEach(val => { row.appendChild(el('button', { class: 'btn btn-xs btn-outline', attrs: { type: 'button', 'data-opt': name, 'data-val': val } }, val)); });
                row.addEventListener('click', e => {
                    const b = e.target.closest('[data-opt]'); if (!b) return; const opt = b.getAttribute('data-opt'); const val = b.getAttribute('data-val');
                    row.querySelectorAll('[data-opt="' + opt + '"]').forEach(x => x.classList.remove('active')); b.classList.add('active'); selection[opt] = val; computeVariant();
                });
                wrap.appendChild(row); return wrap;
            }
            function computeVariant() {
                const match = prod.variants.find(v => Object.entries(v.optionValues || {}).every(([k, val]) => selection[k] === val));
                selectedVariant = match ? match.id : null;
                const info = box.querySelector('.variant-info');
                if (selectedVariant) { const v = prod.variants.find(v => v.id === selectedVariant); info.textContent = v.inventory > 0 ? `In stock: ${v.inventory}` : 'Out of stock'; }
                else info.textContent = 'Select options';
            }
            const box = el('div', { class: 'variant-selector flex flex-col gap-sm' });
            Object.entries(byOption).forEach(([k, set]) => box.appendChild(renderGroup(k, Array.from(set))));
            box.appendChild(el('div', { class: 'variant-info tiny muted' }, 'Select options'));
            return box;
        })();
        variantsBox.classList.add('pv-variant-card');
        const stockAmount = productStock(prod);
        const stockSummary = stockAmount <= 0 ? 'Out of stock' : stockAmount < 5 ? `Only ${stockAmount} left` : `${stockAmount} ready to ship`;
        const stockChip = inventoryBadge(prod);
        stockChip.classList.add('pv-stock-chip');
        const ratingView = (prod.reviewSummary && prod.reviewSummary.count > 0)
            ? renderStarRating(prod.reviewSummary.average, prod.reviewSummary.count, { size: 'md' })
            : el('div', { class: 'tiny muted' }, 'No reviews yet');

        const tagRow = prod.tags && prod.tags.length
            ? el('div', { class: 'pv-tag-row' }, ...prod.tags.slice(0, 6).map(t => el('span', { class: 'pv-tag' }, t)))
            : null;

        const qtyInput = el('input', { attrs: { id: 'prod-qty', type: 'number', min: '1', value: '1' } });
        const qtyField = el('div', { class: 'pv-qty-field' },
            el('span', { class: 'pv-qty-label tiny muted' }, 'Qty'),
            qtyInput
        );
        const addBtn = el('button', { class: 'btn btn-success', attrs: { id: 'add-cart-btn', type: 'button' } }, 'Add to Cart');
        const backBtn = el('button', { class: 'btn btn-outline', attrs: { 'data-route': 'catalog', type: 'button' } }, 'Back');
        const ctaRow = el('div', { class: 'pv-cta-row' }, qtyField, el('div', { class: 'pv-cta-buttons' }, addBtn, backBtn));

        const assuranceItem = (title, copy) => el('div', { class: 'pv-assurance-item' },
            el('span', { class: 'pv-assurance-title' }, title),
            el('span', { class: 'tiny muted' }, copy)
        );
        const assuranceRow = el('div', { class: 'pv-assurance-row' },
            assuranceItem('Ships fast', 'Dispatches within 24 hours'),
            assuranceItem('Easy returns', 'Free exchanges within 30 days'),
            assuranceItem('Secure checkout', '256-bit SSL protection')
        );

        const derivedFeatures = (prod.tags && prod.tags.length
            ? prod.tags.slice(0, 4).map(tag => `- ${tag.replace(/[-_]/g, ' ')}`)
            : ['- Soft-touch premium fabric', '- Everyday relaxed fit', '- Breathable comfort', '- Easy to pair with staples']);
        const buildFeatureList = () => el('div', { class: 'pv-feature-list' }, ...derivedFeatures.map(text => el('span', {}, text.replace(/^-\s*/, ''))));

        const priceRow = el('div', { class: 'pv-price-row' },
            el('span', { class: 'pv-price', attrs: { 'data-price-cents': prod.priceCents } }, money(prod.priceCents)),
            stockChip,
            el('span', { class: 'pv-meta-chip' }, 'Ships in 24h')
        );

        const infoNodes = [
            el('span', { class: 'pv-status-pill tiny muted' }, 'Featured drop'),
            el('h1', { class: 'product-detail-title' }, prod.title),
            ratingView,
            priceRow,
            tagRow,
            el('p', { class: 'pv-description' }, prod.description || 'No description available.'),
            variantsBox,
            ctaRow,
            assuranceRow
        ].filter(Boolean);

        const infoCol = el('div', { class: 'pv-info-card pv-summary-card flex flex-col gap-md' }, ...infoNodes);

        const hero = el('section', { class: 'pv-stage' },
            el('div', { class: 'pv-hero' },
                el('div', { class: 'pv-media-card' }, galleryWrap),
                infoCol
            )
        );

        const reviewCount = prod.reviewSummary?.count || 0;
        const deliveryWindowLabel = '2-4 days';
        const deliveryWindowDetail = 'Priority handling';
        const insightCard = (label, value, detail) => el('div', { class: 'pv-insight-card' },
            el('span', { class: 'pv-insight-label' }, label),
            el('span', { class: 'pv-insight-value' }, value),
            detail ? el('span', { class: 'pv-insight-detail tiny muted' }, detail) : null
        );
        const insightGrid = el('section', { class: 'pv-insight-grid' },
            insightCard('Inventory', stockSummary, 'Live studio count'),
            insightCard('Arrives', deliveryWindowLabel, deliveryWindowDetail),
            insightCard('Reviews', reviewCount ? `${reviewCount} verified` : 'Be the first', reviewCount ? 'Loved by the community' : 'Collect the first story'),
            insightCard('Care', 'Easy upkeep', 'Machine wash cold')
        );

        const careSteps = [
            'Wash cold, gentle cycle',
            'Lay flat or tumble dry low',
            'Do not bleach',
            'Warm iron inside out if needed'
        ];
        const careList = el('ul', { class: 'pv-panel-list' }, ...careSteps.map(step => el('li', {}, step)));
        const styleTags = (prod.tags || []).slice(0, 4);
        const styleTagRow = styleTags.length ? el('div', { class: 'pv-tag-row' }, ...styleTags.map(t => el('span', { class: 'pv-tag' }, t))) : null;
        const reviewButton = el('button', { class: 'btn btn-small btn-outline', attrs: { 'data-route': 'product-reviews', 'data-id': prod.id } }, reviewCount ? 'Read reviews' : 'Start a review');

        const panel = (title, nodes) => el('article', { class: 'pv-panel' },
            el('h3', { class: 'pv-panel-title' }, title),
            ...nodes
        );
        const detailGrid = el('section', { class: 'pv-panel-grid' },
            panel('Fabric & Feel', [
                el('p', {}, 'Premium mid-weight cotton meant for all-day comfort.'),
                buildFeatureList()
            ]),
            panel('Care & Fit', [careList, styleTagRow].filter(Boolean)),
            panel('Story & Support', [
                el('p', {}, prod.description || 'Crafted in small batches to reduce waste and dyed with low-water techniques.'),
                el('div', { class: 'pv-panel-actions' }, reviewButton),
                el('span', { class: 'tiny muted' }, 'Need styling help? support@loomwear.shop')
            ])
        );

        const viewSections = [hero, insightGrid, detailGrid];
        // Related items
        const related = [];
        const seenProducts = new Set([prod.id]);
        if (Array.isArray(prod.tags) && prod.tags.length) {
            for (const candidate of state.products) {
                if (seenProducts.has(candidate.id) || candidate.deletedAt) continue;
                if (!candidate.tags || !candidate.tags.length) continue;
                if (!candidate.tags.some(tag => prod.tags.includes(tag))) continue;
                seenProducts.add(candidate.id);
                related.push(candidate);
                if (related.length >= 4) break;
            }
        }
        if (related.length) {
            const relGrid = el('div', { class: 'pv-related-grid' }, ...related.map(r => el('article', { class: 'pv-related-card', attrs: { 'data-rel-id': r.id } },
                el('div', { class: 'pv-related-media' },
                    el('img', { attrs: { src: (Array.isArray(r.images) && r.images.length ? r.images[0] : productPlaceholder(420)), alt: r.title || 'Related product', loading: 'lazy' } })
                ),
                el('div', { class: 'pv-related-body' },
                    el('span', { class: 'pv-related-chip tiny muted' }, 'Pairs well'),
                    el('p', { class: 'pv-related-name' }, r.title || 'Product'),
                    el('div', { class: 'pv-related-row flex align-center justify-between' },
                        el('span', { class: 'pv-related-price', attrs: { 'data-price-cents': r.priceCents } }, money(r.priceCents)),
                        el('span', { class: 'pv-related-link tiny' }, 'View')
                    )
                )
            )));
            const relWrap = el('section', { class: 'pv-related mt-lg' },
                el('div', { class: 'pv-related-head' },
                    el('div', {},
                        el('span', { class: 'pv-eyebrow tiny muted' }, 'Styled for you'),
                        el('h3', { class: 'pv-related-title' }, 'Related Items')
                    ),
                    el('button', { class: 'btn btn-small btn-outline', attrs: { 'data-route': 'catalog', type: 'button' } }, 'Shop catalog')
                ),
                relGrid
            );
            viewSections.push(relWrap);
            relWrap.addEventListener('click', e => { const c = e.target.closest('[data-rel-id]'); if (c) showProductDetail(c.getAttribute('data-rel-id')); });
        }
        // Recently viewed
        const RV_KEY = 'recentlyViewed';
        let rv = []; try { rv = JSON.parse(localStorage.getItem(RV_KEY) || '[]'); } catch { rv = []; }
        rv = rv.filter(x => x !== prod.id); rv.unshift(prod.id); if (rv.length > 20) rv = rv.slice(0, 20);
        localStorage.setItem(RV_KEY, JSON.stringify(rv));
        const recents = rv.filter(pid => pid !== prod.id).map(pid => state.productsById.get(pid)).filter(Boolean).slice(0, 6);
        if (recents.length) {
            const rvGrid = el('div', { class: 'pv-recent-grid' }, ...recents.map(r => el('div', { class: 'pv-recent-card', attrs: { 'data-rv-id': r.id } },
                el('div', { class: 'pv-recent-media' },
                    el('img', { attrs: { src: (r.images && r.images[0]) || productPlaceholder(320), alt: r.title, loading: 'lazy' } })
                ),
                el('div', { class: 'pv-recent-body' },
                    el('span', { class: 'pv-recent-chip tiny muted' }, 'Viewed'),
                    el('p', { class: 'pv-recent-name' }, r.title || 'Product'),
                    el('span', { class: 'pv-recent-price tiny', attrs: { 'data-price-cents': r.priceCents } }, money(r.priceCents))
                )
            )));
            const rvWrap = el('section', { class: 'pv-recently-viewed mt-lg' },
                el('div', { class: 'pv-recent-head' },
                    el('div', {},
                        el('span', { class: 'pv-eyebrow tiny muted' }, 'Keep browsing'),
                        el('h3', { class: 'pv-recent-title' }, 'Recently Viewed')
                    ),
                    el('button', { class: 'btn btn-small btn-outline', attrs: { 'data-route': 'catalog', type: 'button' } }, 'All products')
                ),
                rvGrid
            );
            viewSections.push(rvWrap);
            rvWrap.addEventListener('click', e => { const c = e.target.closest('[data-rv-id]'); if (c) showProductDetail(c.getAttribute('data-rv-id')); });
        }
        const reviewSummary = prod.reviewSummary || { count: 0, average: null, totalQuantity: 0 };
        const previewReviewCount = reviewSummary.count || 0;
        const summarySnippet = (() => {
            const safe = reviewSummary;
            const count = previewReviewCount;
            const wrap = el('div', { class: 'review-summary-preview flex flex-col gap-sm' });
            wrap.appendChild(el('div', { class: 'review-summary-main flex gap-sm align-center' },
                renderStarRating(safe.average ?? null, count || null, { size: 'lg' }),
                el('div', { class: 'flex flex-col' },
                    el('span', { class: 'summary-average' }, count ? `${(safe.average ?? 0).toFixed(1)} / 5` : 'No ratings yet'),
                    el('span', { class: 'summary-count tiny muted' }, count ? `${count} review${count === 1 ? '' : 's'}` : 'Be the first to review')
                )
            ));
            wrap.appendChild(el('div', { class: 'summary-total tiny muted' }, count
                ? `Verified units purchased: ${safe.totalQuantity || 0}`
                : 'Awaiting the first verified take.'));
            return wrap;
        })();
        summarySnippet.classList.add('prp-score-card');

        const teaserCopy = previewReviewCount
            ? 'See how the drop wears, fits, and ages from verified buyers.'
            : 'Be the first to leave a fit check for the community.';

        const statCard = (label, value, detail) => el('div', { class: 'prp-stat-card' },
            el('span', { class: 'prp-stat-label tiny muted' }, label),
            el('span', { class: 'prp-stat-value' }, value),
            detail ? el('span', { class: 'prp-stat-detail tiny muted' }, detail) : null
        );
        const sentimentLabel = (() => {
            if (!reviewCount) return 'New drop';
            const avg = reviewSummary.average ?? 0;
            if (avg >= 4.6) return 'Glowing';
            if (avg >= 4) return 'Warm';
            if (avg >= 3.4) return 'Balanced';
            return 'Mixed';
        })();
        const reviewStats = el('div', { class: 'prp-stats-grid' },
            statCard('Verified stories', previewReviewCount ? `${previewReviewCount}` : 'Soon', previewReviewCount ? 'Published reviews' : 'Collecting impressions'),
            statCard('Units loved', reviewSummary.totalQuantity ? `${reviewSummary.totalQuantity}` : '—', 'Orders tied to reviews'),
            statCard('Sentiment', sentimentLabel, previewReviewCount ? 'Community mood' : 'Awaiting first notes')
        );

        const reviewTeaser = el('section', { class: 'panel product-reviews-preview mt-lg' },
            el('div', { class: 'prp-head flex flex-col gap-xxs' },
                el('span', { class: 'pv-eyebrow tiny muted' }, 'Community voices'),
                el('h3', { class: 'prp-title' }, 'Reviews & stories')
            ),
            el('div', { class: 'prp-body' },
                el('div', { class: 'prp-left flex flex-col gap-sm' },
                    summarySnippet,
                    el('p', { class: 'prp-copy tiny muted' }, teaserCopy)
                ),
                el('div', { class: 'prp-right flex flex-col gap-md' },
                    reviewStats,
                    el('div', { class: 'prp-cta-card flex flex-col gap-sm' },
                        el('p', { class: 'prp-cta-text' }, previewReviewCount
                            ? 'Dive deeper into detailed fit notes, fabric impressions, and styling inspo.'
                            : 'Set the tone for this drop with the first review.'),
                        el('button', { class: 'btn btn-small btn-outline', attrs: { 'data-route': 'product-reviews', 'data-id': prod.id } }, previewReviewCount ? 'Read full reviews' : 'Open review hub')
                    )
                )
            )
        );

        viewSections.push(reviewTeaser);
        const shell = el('div', { class: 'product-view-shell container' }, ...viewSections);
        rootEl.appendChild(shell);

        document.getElementById('add-cart-btn').addEventListener('click', () => {
            const qty = Math.max(1, parseInt(document.getElementById('prod-qty').value, 10) || 1);
            if (prod.variants && prod.variants.length && !selectedVariant) { notify('Select a variant', 'warn'); return; }
            if (selectedVariant) { const v = prod.variants.find(v => v.id === selectedVariant); if (v && v.inventory < qty) { notify('Not enough variant stock', 'warn'); return; } }
            addToCart(prod.id, qty, selectedVariant);
        });
        setTimeout(() => galleryWrap.focus(), 30);
    }

    /* ----------------------------
     * RENDER: Cart (New Layout)
     * ---------------------------- */
    // (Removed earlier duplicate cart layout function)

    function renderCart() {
        rootEl.innerHTML = '';
        const panel = el('section', { class: 'cart-page container' });
        const uniqueLines = state.cart.length;
        const totalItems = state.cart.reduce((sum, line) => sum + line.quantity, 0);
        const hero = el('div', { class: 'cart-hero' },
            el('div', { class: 'cart-hero-copy' },
                el('p', { class: 'cart-eyebrow' }, 'Shopping Cart'),
                el('h1', {}, uniqueLines ? 'Review & checkout' : 'Your cart is empty'),
                el('p', { class: 'muted' }, uniqueLines
                    ? `You have ${totalItems} item${totalItems === 1 ? '' : 's'} ready for checkout.`
                    : 'Add some favorites to your bag and we will keep them safe for you.')
            ),
            el('div', { class: 'cart-hero-actions' },
                el('button', {
                    class: 'btn btn-outline',
                    attrs: { 'data-route': 'catalog' }
                }, uniqueLines ? 'Continue shopping' : 'Browse catalog')
            )
        );
        panel.appendChild(hero);

        if (!uniqueLines) {
            panel.appendChild(el('div', { class: 'cart-empty-card' },
                el('p', { class: 'muted' }, 'When you add products, detailed delivery estimates and a friendly summary will appear here.')
            ));
            rootEl.appendChild(panel);
            return;
        }

        const insights = el('div', { class: 'cart-insights' },
            el('div', { class: 'cart-insight' },
                el('span', { class: 'label' }, 'Items in bag'),
                el('strong', {}, totalItems)
            ),
            el('div', { class: 'cart-insight' },
                el('span', { class: 'label' }, 'Unique styles'),
                el('strong', {}, uniqueLines)
            ),
            el('div', { class: 'cart-insight' },
                el('span', { class: 'label' }, 'Cart value'),
                el('strong', {}, money(cartSubtotalCents()))
            )
        );
        panel.appendChild(insights);

        const layout = el('div', { class: 'cart-layout' });
        const itemsCard = el('div', { class: 'cart-items-card' });
        itemsCard.appendChild(el('div', { class: 'cart-items-heading' },
            el('div', {},
                el('p', { class: 'eyebrow' }, 'Items in your bag'),
                el('h2', {}, `${uniqueLines} style${uniqueLines === 1 ? '' : 's'}`)
            ),
            el('span', { class: 'cart-items-note' }, 'Adjust quantities or remove items below')
        ));
        const itemsList = el('div', { class: 'cart-items-list' });

        for (const line of state.cart) {
            const prod = state.productsById.get(line.productId);
            if (!prod) continue;
            const lineKey = line.productId + '::' + (line.variantId || '');
            const lt = prod.priceCents * line.quantity;
            const variantLabel = (line.variantId && prod.variants) ? (() => {
                const v = prod.variants.find(v => v.id === line.variantId);
                if (!v) return '';
                return Object.values(v.optionValues || {}).join(' / ') || v.sku || v.id.slice(0, 6);
            })() : '';
            const imageSrc = (Array.isArray(prod.images) && prod.images[0]) || productPlaceholder(480);
            const stock = productStock(prod);
            const stockLabel = stock <= 0 ? 'Out of stock' : stock <= 3 ? `Only ${stock} left` : 'In stock';
            const stockClass = stock <= 0 ? 'out' : stock <= 3 ? 'low' : 'ok';

            const qtyControl = el('div', { class: 'cart-qty-control' },
                el('button', {
                    class: 'cart-qty-btn',
                    attrs: { type: 'button', 'data-qty-delta': '-1', 'data-qty-key': lineKey, 'aria-label': 'Decrease quantity' }
                }, '−'),
                el('input', {
                    class: 'qty-input',
                    attrs: {
                        type: 'number',
                        min: '1',
                        value: String(line.quantity),
                        'data-qty-key': lineKey
                    }
                }),
                el('button', {
                    class: 'cart-qty-btn',
                    attrs: { type: 'button', 'data-qty-delta': '1', 'data-qty-key': lineKey, 'aria-label': 'Increase quantity' }
                }, '+')
            );

            const lineCard = el('article', { class: 'cart-line-card', attrs: { 'data-line-key': lineKey } },
                el('div', { class: 'cart-line-media' },
                    el('img', { attrs: { src: imageSrc, alt: prod.title, loading: 'lazy' } })
                ),
                el('div', { class: 'cart-line-info' },
                    el('div', { class: 'cart-line-head' },
                        el('div', { class: 'cart-line-title-wrap' },
                            el('h3', { class: 'cart-line-title' }, prod.title),
                            variantLabel ? el('span', { class: 'cart-line-variant' }, variantLabel) : null
                        ),
                        el('span', { class: 'cart-line-price' }, money(lt))
                    ),
                    el('div', { class: 'cart-line-meta' },
                        el('span', { class: 'cart-chip' }, 'Unit ' + money(prod.priceCents)),
                        el('span', { class: 'cart-chip inventory ' + stockClass }, stockLabel)
                    ),
                    el('div', { class: 'cart-line-controls' },
                        qtyControl,
                        el('div', { class: 'cart-line-actions' },
                            el('button', {
                                class: 'cart-remove-btn',
                                attrs: { type: 'button', 'data-remove-key': lineKey }
                            }, 'Remove'),
                            el('span', { class: 'cart-line-subtotal' }, `${line.quantity} x ${money(prod.priceCents)} each`)
                        )
                    )
                )
            );
            itemsList.appendChild(lineCard);
        }
        itemsCard.appendChild(itemsList);

        const summaryCard = el('aside', { class: 'cart-summary-card' });
        summaryCard.appendChild(el('div', { class: 'cart-summary-header' },
            el('p', { class: 'eyebrow' }, 'Order summary'),
            el('p', { class: 'muted tiny' }, 'All duties calculated at checkout')
        ));

        /* --- Discount & Shipping Estimator Section --- */
        const discountField = (function () {
            const wrap = el('div', { class: 'cart-form-field' });
            wrap.appendChild(el('label', { attrs: { for: 'cart-discount-code' } }, 'Discount code'));
            const input = el('input', { attrs: { id: 'cart-discount-code', type: 'text', value: state.cartPage.discountCode || '', placeholder: 'Enter code' } });
            const btn = el('button', { class: 'btn btn-small', attrs: { id: 'cart-discount-apply', type: 'button' } }, state.cartPage.discountApplied ? 'Applied' : 'Apply');
            if (state.cartPage.discountApplied) btn.classList.add('applied');
            wrap.appendChild(el('div', { class: 'cart-form-control' }, input, btn));
            return wrap;
        })();
        const shipField = (function () {
            const wrap = el('div', { class: 'cart-form-field' });
            wrap.appendChild(el('label', { attrs: { for: 'cart-ship-country' } }, 'Ship to'));
            const sel = el('select', { attrs: { id: 'cart-ship-country' } },
                el('option', { attrs: { value: 'PH' } }, 'Philippines'),
                el('option', { attrs: { value: 'US' } }, 'United States'),
                el('option', { attrs: { value: 'CA' } }, 'Canada'),
                el('option', { attrs: { value: 'DE' } }, 'Germany'),
                el('option', { attrs: { value: 'FR' } }, 'France'),
                el('option', { attrs: { value: 'ES' } }, 'Spain'),
                el('option', { attrs: { value: 'IT' } }, 'Italy'),
                el('option', { attrs: { value: 'JP' } }, 'Japan'),
                el('option', { attrs: { value: 'AU' } }, 'Australia'),
                el('option', { attrs: { value: 'OTHER' } }, 'Other / International')
            );
            sel.value = state.cartPage.shipCountry || 'PH';
            wrap.appendChild(el('div', { class: 'cart-form-control' }, sel));
            return wrap;
        })();
        const progressWrap = el('div', { class: 'free-ship-progress hidden' },
            el('div', { class: 'bar' }),
            el('div', { class: 'fs-label' })
        );
        const totalsBox = el('div', { class: 'cart-totals' });

        summaryCard.appendChild(discountField);
        summaryCard.appendChild(shipField);
        summaryCard.appendChild(progressWrap);
        summaryCard.appendChild(totalsBox);

        const checkoutBtn = el('button', { class: 'btn btn-primary cart-checkout-btn', attrs: { id: 'checkout-btn' } }, 'Checkout');
        summaryCard.appendChild(checkoutBtn);
        summaryCard.appendChild(el('p', { class: 'cart-secure-note' }, 'Secure payments • Free returns within 30 days'));

        layout.appendChild(itemsCard);
        layout.appendChild(summaryCard);
        panel.appendChild(layout);
        rootEl.appendChild(panel);

        const discountInput = discountField.querySelector('input');
        const discountApplyBtn = discountField.querySelector('button');
        const shipSelect = shipField.querySelector('select');

        // --- Logic for estimator ---
        const SHIP_RATES = { domestic: 200, near: 1200, intl: 2000, domesticFreeThreshold: 15000 };
        const DOMESTIC = new Set(['US', 'USA', 'PH', 'PHL', 'PHILIPPINES']);
        const NEAR = new Set(['CA', 'CANADA']);
        const EU = new Set(['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'SE', 'FI', 'DK', 'IE', 'PT', 'AT', 'PL', 'CZ', 'HU', 'SK', 'RO', 'BG', 'GR']);
        function classifyCountry(c) { if (!c) return 'INTL'; const up = String(c).trim().toUpperCase(); if (DOMESTIC.has(up)) return 'DOM'; if (NEAR.has(up) || EU.has(up)) return 'NEAR'; return 'INTL'; }
        function baseShip(sub, country) {
            const up = (country || '').toUpperCase();
            if (['PH', 'PHL', 'PHILIPPINES'].includes(up)) return 200; // Flat PH
            const zone = classifyCountry(country);
            if (zone === 'DOM') return sub >= SHIP_RATES.domesticFreeThreshold ? 0 : SHIP_RATES.domestic;
            if (zone === 'NEAR') return SHIP_RATES.near;
            return SHIP_RATES.intl;
        }
        function perItemShip(country) {
            const up = (country || '').toUpperCase();
            if (['PH', 'PHL', 'PHILIPPINES'].includes(up)) return 0;
            let t = 0; for (const line of state.cart) { const p = state.productsById.get(line.productId); if (!p) continue; t += (p.shippingFeeCents || 0) * line.quantity; } return t;
        }
        let estDiscount = 0; // recalculated when apply button used
        function recalcTotals() {
            if (!shipSelect) return;
            const subtotalCents = cartSubtotalCents();
            const country = shipSelect.value;
            state.cartPage.shipCountry = country;
            const shipping = baseShip(subtotalCents, country) + perItemShip(country);
            const tax = Math.round(subtotalCents * 0.075);
            const total = subtotalCents - estDiscount + shipping + tax;
            // Update DOM
            totalsBox.innerHTML = '';
            totalsBox.appendChild(el('div', {}, 'Subtotal: ' + money(subtotalCents)));
            if (estDiscount > 0) totalsBox.appendChild(el('div', { class: 'muted' }, 'Discount: -' + money(estDiscount)));
            totalsBox.appendChild(el('div', {}, 'Shipping: ' + money(shipping)));
            totalsBox.appendChild(el('div', {}, 'Tax: ' + money(tax)));
            totalsBox.appendChild(el('div', { class: 'bold' }, 'Est. Total: ' + money(total)));
            // Free shipping progress (DOM only, excluding PH flat special which uses threshold logic if considered DOM via PH? treat PH as DOM for threshold display)
            const zone = classifyCountry(country);
            if (zone === 'DOM') {
                const threshold = SHIP_RATES.domesticFreeThreshold;
                const progress = Math.min(1, subtotalCents / threshold);
                progressWrap.classList.remove('hidden');
                progressWrap.querySelector('.bar').style.setProperty('--pct', (progress * 100) + '%');
                progressWrap.querySelector('.bar').style.width = (progress * 100) + '%';
                const remaining = threshold - subtotalCents;
                if (remaining > 0) {
                    progressWrap.querySelector('.fs-label').textContent = 'Spend ' + money(remaining) + ' more for FREE domestic shipping';
                } else {
                    progressWrap.querySelector('.fs-label').textContent = 'Free domestic shipping unlocked!';
                }
            } else {
                progressWrap.classList.add('hidden');
            }
        }
        // Discount apply
        function evaluateDiscount() {
            if (!discountInput) return;
            const raw = discountInput.value.trim().toUpperCase();
            discountInput.value = raw;
            if (!raw) { estDiscount = 0; state.cartPage.discountApplied = false; state.cartPage.discountCode = ''; recalcTotals(); styleApply(false); return; }
            apiFetch('/api/discounts/' + encodeURIComponent(raw)).then(d => {
                const now = Date.now();
                const expired = d.expiresAt && new Date(d.expiresAt).getTime() <= now;
                if (d.type === 'ship' || expired) { notify('Discount not applicable', 'warn'); estDiscount = 0; state.cartPage.discountApplied = false; state.cartPage.discountCode = ''; recalcTotals(); styleApply(false); return; }
                const subtotalCents = cartSubtotalCents();
                if (subtotalCents < d.minSubtotalCents) { notify('Subtotal too low for code', 'warn'); estDiscount = 0; state.cartPage.discountApplied = false; state.cartPage.discountCode = ''; recalcTotals(); styleApply(false); return; }
                if (d.type === 'percent') estDiscount = Math.floor(subtotalCents * (d.value / 100));
                else if (d.type === 'fixed') estDiscount = Math.min(subtotalCents, d.value);
                else estDiscount = 0;
                state.cartPage.discountApplied = estDiscount > 0;
                state.cartPage.discountCode = state.cartPage.discountApplied ? raw : '';
                recalcTotals();
                styleApply(state.cartPage.discountApplied);
                if (state.cartPage.discountApplied) notify('Discount applied', 'success');
            }).catch(err => { notify('Invalid code', 'error'); estDiscount = 0; state.cartPage.discountApplied = false; state.cartPage.discountCode = ''; recalcTotals(); styleApply(false); });
        }
        function styleApply(applied) {
            if (!discountApplyBtn) return;
            if (applied) { discountApplyBtn.classList.add('applied'); discountApplyBtn.textContent = 'Applied'; }
            else { discountApplyBtn.classList.remove('applied'); discountApplyBtn.textContent = 'Apply'; }
        }
        if (discountApplyBtn) discountApplyBtn.addEventListener('click', evaluateDiscount);
        if (shipSelect) shipSelect.addEventListener('change', () => { recalcTotals(); });
        // Rehydrate previous discount if applied
        if (state.cartPage.discountApplied && state.cartPage.discountCode) {
            // Recompute discount value with current subtotal
            evaluateDiscount();
        } else {
            recalcTotals();
        }

        panel.addEventListener('change', e => {
            const inp = e.target.closest('input[data-qty-key]');
            if (inp) {
                const key = inp.getAttribute('data-qty-key');
                const [pid, variantIdRaw] = key.split('::');
                const variantId = variantIdRaw || null;
                let qty = parseInt(inp.value, 10);
                if (Number.isNaN(qty) || qty <= 0) qty = 1;
                const prod = state.productsById.get(pid);
                let max = prod ? productStock(prod) : 0;
                if (variantId && prod && prod.variants) {
                    const v = prod.variants.find(v => v.id === variantId); if (v) max = v.inventory;
                }
                if (qty > max) { qty = max; notify('Limited to stock (' + max + ')', 'warn'); }
                inp.value = String(qty);
                setCartQuantity(pid, qty, variantId);
                renderCart();
            }
        });

        panel.addEventListener('click', e => {
            const deltaBtn = e.target.closest('[data-qty-delta]');
            if (deltaBtn) {
                const key = deltaBtn.getAttribute('data-qty-key');
                const [pid, variantIdRaw] = key.split('::');
                const variantId = variantIdRaw || null;
                const delta = parseInt(deltaBtn.getAttribute('data-qty-delta'), 10) || 0;
                const line = state.cart.find(l => String(l.productId) === pid && String(l.variantId || '') === (variantId || ''));
                let qty = (line ? line.quantity : 1) + delta;
                if (qty < 1) qty = 1;
                const prod = state.productsById.get(pid);
                let max = prod ? productStock(prod) : 0;
                if (variantId && prod && prod.variants) {
                    const v = prod.variants.find(v => v.id === variantId);
                    if (v && typeof v.inventory === 'number') max = v.inventory;
                }
                if (qty > max) { qty = max; notify('Limited to stock (' + max + ')', 'warn'); }
                setCartQuantity(pid, qty, variantId);
                renderCart();
                return;
            }
            const btnRemove = e.target.closest('[data-remove-key]');
            if (btnRemove) {
                const key = btnRemove.getAttribute('data-remove-key');
                const [pid, variantIdRaw] = key.split('::');
                removeFromCart(pid, variantIdRaw || null);
                renderCart();
            }
        });

        // Direct listener + delegated fallback (in case another script replaces the button)
        checkoutBtn.addEventListener('click', (ev) => {
            console.debug('[checkout] button clicked');
            try { showCheckoutModal(); } catch (e) { console.error('Checkout modal error:', e); notify('Checkout failed to open: ' + e.message, 'error', 6000); }
        });
        if (!panel._checkoutDelegated) {
            panel._checkoutDelegated = true;
            panel.addEventListener('click', (e) => {
                const btn = e.target.closest('#checkout-btn');
                if (btn) {
                    console.debug('[checkout] delegated click');
                    try { showCheckoutModal(); } catch (err) { console.error('Checkout modal error (delegated):', err); notify('Checkout failed: ' + err.message, 'error', 6000); }
                }
            });
        }
    }

    /* ----------------------------
     * Mini-Cart Drawer (Persistent)
     * ---------------------------- */
    function ensureMiniCartContainer() {
        if (!MINI_CART_ENABLED) return null;
        let mc = document.getElementById('mini-cart-drawer');
        if (!mc) {
            mc = document.createElement('div');
            mc.id = 'mini-cart-drawer';
            mc.className = 'mini-cart-drawer';
            mc.setAttribute('role', 'dialog');
            mc.setAttribute('aria-label', 'Mini cart');
            document.body.appendChild(mc);
        }
        return mc;
    }
    function miniCartLineLabel(line) {
        const p = state.productsById.get(line.productId);
        if (!p) return 'Unknown';
        const variantLabel = (line.variantId && p.variants) ? (() => { const v = p.variants.find(v => v.id === line.variantId); if (!v) return ''; return ' (' + Object.values(v.optionValues || {}).join(' / ') + ')'; })() : '';
        return p.title + variantLabel;
    }
    function updateMiniCartDrawer() {
        if (!MINI_CART_ENABLED) return;
        const mc = document.getElementById('mini-cart-drawer');
        if (!mc) return;
        mc.innerHTML = '';
        const header = el('div', { class: 'mc-header' },
            el('span', { class: 'mc-title' }, 'Cart (' + state.cart.reduce((a, l) => a + l.quantity, 0) + ')'),
            el('button', { class: 'mc-close', attrs: { type: 'button', 'aria-label': 'Close mini cart' } }, '×')
        );
        mc.appendChild(header);
        if (!state.cart.length) {
            mc.appendChild(el('div', { class: 'mc-empty muted' }, 'Your cart is empty.'));
        } else {
            const list = el('div', { class: 'mc-lines' });
            for (const line of state.cart) {
                const p = state.productsById.get(line.productId); if (!p) continue;
                const price = p.priceCents * line.quantity;
                const lineKey = line.productId + '::' + (line.variantId || '');
                list.appendChild(el('div', { class: 'mc-line', attrs: { 'data-line-key': lineKey } },
                    el('div', { class: 'mc-line-title' }, miniCartLineLabel(line)),
                    el('div', { class: 'mc-line-controls' },
                        el('input', { class: 'mc-qty', attrs: { type: 'number', min: '1', value: String(line.quantity), 'data-qty-key': lineKey } }),
                        el('span', { class: 'mc-line-price' }, money(price)),
                        el('button', { class: 'mc-remove', attrs: { 'data-remove-key': lineKey, type: 'button', 'aria-label': 'Remove item' } }, '×')
                    )
                ));
            }
            mc.appendChild(list);
            const subtotal = cartSubtotalCents();
            mc.appendChild(el('div', { class: 'mc-subtotal' }, 'Subtotal: ' + money(subtotal)));
            mc.appendChild(el('div', { class: 'mc-actions' },
                el('button', { class: 'btn btn-small', attrs: { type: 'button', 'data-route': 'cart' } }, 'View Cart'),
                el('button', { class: 'btn btn-small btn-success', attrs: { type: 'button', id: 'mc-checkout' } }, 'Checkout')
            ));
        }
        // Events
        mc.querySelector('.mc-close')?.addEventListener('click', () => closeMiniCartDrawer());
        mc.addEventListener('change', e => {
            const inp = e.target.closest('.mc-qty[data-qty-key]');
            if (inp) {
                const key = inp.getAttribute('data-qty-key');
                const [pid, variantIdRaw] = key.split('::');
                let qty = parseInt(inp.value, 10); if (!qty || qty < 1) qty = 1;
                const prod = state.productsById.get(pid);
                let max = prod ? productStock(prod) : 0;
                if (variantIdRaw && prod && prod.variants) { const v = prod.variants.find(v => v.id === variantIdRaw); if (v) max = v.inventory; }
                if (qty > max) { qty = max; notify('Limited to stock (' + max + ')', 'warn'); }
                setCartQuantity(pid, qty, variantIdRaw || null);
                // updateMiniCartDrawer called by saveCart already
            }
        });
        mc.addEventListener('click', e => {
            const rm = e.target.closest('[data-remove-key]');
            if (rm) {
                const key = rm.getAttribute('data-remove-key');
                const [pid, variantIdRaw] = key.split('::');
                removeFromCart(pid, variantIdRaw || null);
            }
            const vc = e.target.closest('[data-route="cart"]');
            if (vc) { closeMiniCartDrawer(); navigate('cart'); }
            const chk = e.target.closest('#mc-checkout');
            if (chk) { closeMiniCartDrawer(); showCheckoutModal(); }
        });
    }
    let miniCartHoverTimer = null;
    // Simplified: keep open while cursor inside drawer; close only after leaving both button & drawer
    let miniCartPointerDown = false; // retained for potential future logic
    function openMiniCartDrawer(focus = false) {
        if (!MINI_CART_ENABLED) return;
        const mc = ensureMiniCartContainer();
        updateMiniCartDrawer();
        mc.classList.add('open');
        if (focus) mc.querySelector('.mc-title')?.focus?.();
    }
    function closeMiniCartDrawer() {
        if (!MINI_CART_ENABLED) return;
        const mc = document.getElementById('mini-cart-drawer');
        if (mc) mc.classList.remove('open');
    }
    function setupMiniCartTriggers() {
        if (!MINI_CART_ENABLED) return;
        const btn = document.querySelector('.cart-fab');
        if (!btn || btn._miniSetup) return; btn._miniSetup = true;
        btn.addEventListener('click', e => { e.preventDefault(); const mc = document.getElementById('mini-cart-drawer'); if (mc && mc.classList.contains('open')) closeMiniCartDrawer(); else openMiniCartDrawer(true); attachDrawerHover(); });
        if (window.matchMedia && window.matchMedia('(pointer:fine)').matches) {
            btn.addEventListener('mouseenter', () => { clearTimeout(miniCartHoverTimer); openMiniCartDrawer(); attachDrawerHover(); });
            btn.addEventListener('mouseleave', (ev) => {
                const mc = document.getElementById('mini-cart-drawer');
                if (!mc) return;
                // Use relatedTarget if available to detect move into drawer
                const rt = ev.relatedTarget;
                if (rt && (rt === mc || mc.contains(rt))) return; // headed into drawer
                // Last chance: small delay then check pointer position again; if inside drawer, keep open
                clearTimeout(miniCartHoverTimer);
                miniCartHoverTimer = setTimeout(() => {
                    const under = document.elementFromPoint?.(window.event?.clientX || 0, window.event?.clientY || 0);
                    if (under && (under === mc || mc.contains(under))) return; // pointer now inside
                    closeMiniCartDrawer();
                }, 500);
            });
        }
        function attachDrawerHover() {
            const mc = document.getElementById('mini-cart-drawer');
            if (!mc || mc._hoverSetup) return;
            mc._hoverSetup = true;
            mc.addEventListener('mouseenter', () => { clearTimeout(miniCartHoverTimer); });
            mc.addEventListener('mouseleave', (ev) => {
                if (miniCartPointerDown) return;
                const btn = document.querySelector('.cart-fab');
                const rt = ev.relatedTarget;
                if (btn && rt && (rt === btn || btn.contains(rt))) return; // going back to button
                clearTimeout(miniCartHoverTimer);
                miniCartHoverTimer = setTimeout(() => {
                    // If pointer re-entered drawer or button, abort closing
                    const under = document.elementFromPoint?.(window.event?.clientX || 0, window.event?.clientY || 0);
                    if (under && (under.closest('#mini-cart-drawer') || under.closest('.cart-fab'))) return;
                    closeMiniCartDrawer();
                }, 500);
            });
            mc.addEventListener('mousedown', e => { if (e.button === 0) { miniCartPointerDown = true; clearTimeout(miniCartHoverTimer); } });
            document.addEventListener('mouseup', e => { if (!miniCartPointerDown) return; miniCartPointerDown = false; const over = e.target.closest('#mini-cart-drawer') || e.target.closest('.cart-fab'); if (!over) miniCartHoverTimer = setTimeout(() => closeMiniCartDrawer(), 450); });
            document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') miniCartPointerDown = false; });
        }
    }
    if (MINI_CART_ENABLED) {
        document.addEventListener('DOMContentLoaded', setupMiniCartTriggers);
    }

    /* ----------------------------
     * Checkout Modal
     * ---------------------------- */

    function showCheckoutModal() {
        // Ensure cart only contains valid products
        sanitizeCart();
        if (!state.cart.length) { navigate('cart'); return; }
        const cartLines = state.cart.map(line => {
            const prod = state.productsById.get(line.productId);
            if (!prod) return null;
            const variant = line.variantId ? (Array.isArray(prod.variants) ? prod.variants.find(v => v.id === line.variantId) : null) : null;
            const variantLabel = variant ? (Object.values(variant.optionValues || {}).join(' / ') || variant.sku || variant.id.slice(0, 6)) : null;
            const unitPriceCents = variant && variant.priceCents != null ? variant.priceCents : prod.priceCents;
            return { productId: line.productId, quantity: line.quantity, title: prod.title, variantId: line.variantId || null, variantLabel, unitPriceCents };
        }).filter(Boolean);

        if (cartLines.length === 0) {
            notify('Cart is empty.', 'warn');
            return;
        }
        showModal(close => {
            let wrap;
            try {
                wrap = el('div', { class: 'modal', attrs: { tabindex: '-1', id: 'checkout-modal' } });
                wrap.appendChild(el('button', { class: 'modal-close', attrs: { type: 'button' } }, '×'));
                wrap.appendChild(el('h2', {}, 'Checkout'));
                wrap.appendChild(el('div', { class: 'muted', attrs: { id: 'checkout-loading' } }, 'Preparing checkout…'));
                if (!wrap.isConnected) modalRoot.appendChild(wrap);
                wrap.querySelector('.modal-close').addEventListener('click', close);
            } catch (e) {
                console.error('[checkout] init failure:', e); notify('Checkout init failed: ' + e.message, 'error', 6000); return;
            }

            // Schedule watchdog before heavy build
            setTimeout(() => {
                const existing = document.getElementById('checkout-modal');
                if (!existing) return;
                if (!existing.querySelector('#checkout-form') && !existing.querySelector('#checkout-fallback-form')) {
                    console.warn('[checkout] watchdog fallback injecting');
                    injectFallback(existing, close);
                }
            }, 400);

            function injectFallback(container, closeFn) {
                const fallbackEtaLabel = '2-4 days';
                const fallbackEtaDetail = 'Priority handling';
                container.innerHTML = '';
                container.appendChild(el('button', { class: 'modal-close', attrs: { type: 'button' } }, '×'));
                container.appendChild(el('h2', {}, 'Checkout (Fallback)'));
                container.appendChild(el('div', { class: 'small mb-sm muted' }, 'Fallback form shown due to script issue.'));
                container.appendChild(el('ul', { class: 'mb-sm', attrs: { style: 'font-size:.7rem;max-height:110px;overflow:auto;' } }, ...cartLines.map(l => el('li', {}, l.quantity + '× ' + l.title + (l.variantLabel ? ' (' + l.variantLabel + ')' : '')))));
                const fb = el('form', { class: 'flex flex-col gap-sm', attrs: { id: 'checkout-fallback-form' } },
                    el('input', { attrs: { id: 'fb-name', placeholder: 'Name', required: 'true' } }),
                    el('input', { attrs: { id: 'fb-email', placeholder: 'Email', required: 'true', type: 'email' } }),
                    el('input', { attrs: { id: 'fb-phone', placeholder: 'Phone number', required: 'true', type: 'tel' } }),
                    el('textarea', { attrs: { id: 'fb-address', placeholder: 'Address', required: 'true', style: 'min-height:60px;' } }),
                    el('select', { attrs: { id: 'fb-country' } }, el('option', { attrs: { value: 'US' } }, 'United States'), el('option', { attrs: { value: 'CA' } }, 'Canada'), el('option', { attrs: { value: 'DE' } }, 'Germany'), el('option', { attrs: { value: 'OTHER' } }, 'Other')),
                    el('div', {}, el('button', { class: 'btn btn-success', attrs: { type: 'submit' } }, 'Place Order'), ' ', el('button', { class: 'btn btn-outline', attrs: { type: 'button', id: 'fb-cancel' } }, 'Cancel'))
                );
                container.appendChild(fb);
                if (state.customer) {
                    const nameInput = fb.querySelector('#fb-name');
                    const emailInput = fb.querySelector('#fb-email');
                    const phoneInput = fb.querySelector('#fb-phone');
                    const addressInput = fb.querySelector('#fb-address');
                    const countrySelect = fb.querySelector('#fb-country');
                    if (nameInput && state.customer.name) nameInput.value = state.customer.name;
                    if (emailInput && state.customer.email) emailInput.value = state.customer.email;
                    if (phoneInput && state.customer.phone) phoneInput.value = state.customer.phone;
                    if (addressInput && state.customer.address) addressInput.value = state.customer.address;
                    if (countrySelect && state.customer.country) {
                        const desired = Array.from(countrySelect.options || []).some(opt => opt.value === state.customer.country)
                            ? state.customer.country
                            : 'OTHER';
                        countrySelect.value = desired;
                    }
                }
                container.querySelector('.modal-close').addEventListener('click', closeFn);
                fb.querySelector('#fb-cancel').addEventListener('click', closeFn);
                fb.addEventListener('submit', async ev => {
                    ev.preventDefault();
                    const customer = {
                        name: document.getElementById('fb-name').value.trim(),
                        email: document.getElementById('fb-email').value.trim(),
                        phone: document.getElementById('fb-phone').value.trim(),
                        address: document.getElementById('fb-address').value.trim(),
                        country: document.getElementById('fb-country').value
                    };
                    if (!customer.name || !customer.email || !customer.phone || !customer.address) { notify('Fill all fields', 'warn'); return; }
                    try {
                        showSpinner(true);
                        const payloadLines = cartLines.map(line => ({ productId: line.productId, quantity: line.quantity, variantId: line.variantId }));
                        const orderRes = await createOrder(payloadLines, customer);
                        state.cart = []; saveCart(); closeFn(); state.lastOrder = {
                            id: orderRes.id,
                            subtotalCents: orderRes.subtotalCents,
                            discountCents: orderRes.discountCents,
                            shippingCents: orderRes.shippingCents,
                            shippingDiscountCents: orderRes.shippingDiscountCents,
                            totalCents: orderRes.totalCents,
                            lines: cartLines,
                            customer,
                            etaLabel: fallbackEtaLabel,
                            etaDetail: fallbackEtaDetail
                        }; navigate('order-confirmation');
                    } catch (err) { notify('Fallback order failed: ' + err.message, 'error', 6000); }
                    finally { showSpinner(false); }
                });
            }

            // Main rich form build wrapped in try so fallback can still appear if it breaks
            try {
                const linePriceRefs = [];
                const lineup = el('div', { class: 'checkout-lineup' });
                for (const line of cartLines) {
                    const product = state.productsById.get(line.productId);
                    const imageSrc = (Array.isArray(product?.images) && product.images[0]) || productPlaceholder(360);
                    const priceNode = el('span', { class: 'checkout-line-price' }, money(line.unitPriceCents * line.quantity));
                    linePriceRefs.push({ node: priceNode, line });
                    lineup.appendChild(el('div', { class: 'checkout-line' },
                        el('div', { class: 'checkout-line-thumb' },
                            el('img', { attrs: { src: imageSrc, alt: line.title, loading: 'lazy' } })
                        ),
                        el('div', { class: 'checkout-line-info' },
                            el('div', { class: 'checkout-line-title-wrap' },
                                el('span', { class: 'checkout-line-qty-pill' }, line.quantity + '×'),
                                el('p', { class: 'checkout-line-title' }, line.title)
                            ),
                            line.variantLabel ? el('span', { class: 'checkout-line-variant' }, line.variantLabel) : null,
                            el('span', { class: 'checkout-line-unit' }, 'Unit ' + money(line.unitPriceCents))
                        ),
                        el('div', { class: 'checkout-line-price-wrap' }, priceNode)
                    ));
                }
                const estSubtotal = cartSubtotalCents();
                const estTax = Math.round(estSubtotal * 0.075);
                let estDiscount = 0, estShipping = 0, estShipDiscount = 0;
                let discountApplied = false, shipDiscountApplied = false; // new flags
                const SHIP_RATES = { domestic: 200, near: 1200, intl: 2000, domesticFreeThreshold: 15000 }; // domestic now $2 for US + PH
                const DOMESTIC = new Set(['US', 'USA', 'PH', 'PHL', 'PHILIPPINES']);
                const NEAR = new Set(['CA', 'CANADA']);
                const EU = new Set(['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'SE', 'FI', 'DK', 'IE', 'PT', 'AT', 'PL', 'CZ', 'HU', 'SK', 'RO', 'BG', 'GR']);
                function classifyCountry(c) { if (!c) return 'INTL'; const up = String(c).trim().toUpperCase(); if (DOMESTIC.has(up)) return 'DOM'; if (NEAR.has(up) || EU.has(up)) return 'NEAR'; return 'INTL'; }
                function baseShip(sub, country) {
                    const up = (country || '').toUpperCase();
                    if (['PH', 'PHL', 'PHILIPPINES'].includes(up)) return 200; // Flat $2 for Philippines
                    const zone = classifyCountry(country);
                    if (zone === 'DOM') return sub >= SHIP_RATES.domesticFreeThreshold ? 0 : SHIP_RATES.domestic;
                    if (zone === 'NEAR') return SHIP_RATES.near;
                    return SHIP_RATES.intl;
                }
                function perItemShip(country) {
                    const up = (country || '').toUpperCase();
                    if (['PH', 'PHL', 'PHILIPPINES'].includes(up)) return 0; // No per-item fees in PH flat model
                    let t = 0; for (const line of state.cart) { const p = state.productsById.get(line.productId); if (!p) continue; t += (p.shippingFeeCents || 0) * line.quantity; } return t;
                }
                const breakdownBox = el('div', { class: 'checkout-breakdown', attrs: { id: 'checkout-breakdown' } });
                const shippingProgress = el('div', { class: 'checkout-shipping-progress hidden' },
                    el('div', { class: 'checkout-progress-track' },
                        el('div', { class: 'checkout-progress-fill' })
                    ),
                    el('p', { class: 'checkout-progress-label' }, '')
                );
                const totalQuantity = cartLines.reduce((sum, line) => sum + line.quantity, 0);
                const deliveryWindowLabel = '2-4 days';
                const deliveryWindowDetail = 'Priority handling';
                const summaryPill = (label, value, detail) => el('div', { class: 'summary-pill' },
                    el('span', { class: 'pill-label' }, label),
                    el('span', { class: 'pill-value' }, value),
                    detail ? el('span', { class: 'pill-detail' }, detail) : null
                );
                const summaryPills = el('div', { class: 'checkout-summary-pills' },
                    summaryPill('Items', totalQuantity + (totalQuantity === 1 ? ' pc' : ' pcs')),
                    summaryPill('Tax est.', money(estTax)),
                    summaryPill('Delivery', deliveryWindowLabel, deliveryWindowDetail)
                );
                const editCartBtn = el('button', { class: 'checkout-edit-cart', attrs: { type: 'button' } }, 'Edit bag');
                editCartBtn.addEventListener('click', () => { close(); navigate('cart'); });
                const summaryCard = el('div', { class: 'checkout-summary-card' },
                    el('div', { class: 'checkout-summary-head' },
                        el('p', { class: 'checkout-eyebrow' }, 'Order overview'),
                        el('h2', { class: 'checkout-title' }, 'Ready to ship'),
                        el('p', { class: 'checkout-copy muted' }, 'Review every style, perk, and estimate before placing the order.')
                    ),
                    summaryPills,
                    lineup,
                    breakdownBox,
                    shippingProgress,
                    el('div', { class: 'checkout-security' },
                        el('span', {}, '256-bit secure checkout'),
                        el('span', {}, 'Free 30-day returns')
                    ),
                    el('div', { class: 'checkout-summary-footer' },
                        editCartBtn,
                        el('span', { class: 'checkout-support-hint' }, 'Need help? support@loomwear.shop')
                    )
                );
                const discountApplyBtn = el('button', { class: 'btn discount-apply-btn', attrs: { type: 'button', 'data-apply-kind': 'item' } }, 'Apply');
                const shippingApplyBtn = el('button', { class: 'btn discount-apply-btn', attrs: { type: 'button', 'data-apply-kind': 'ship' } }, 'Apply');
                const discountInput = el('input', { attrs: { type: 'text', id: 'discount-code', placeholder: 'e.g. THANKYOU', autocomplete: 'off' } });
                const shippingInput = el('input', { attrs: { type: 'text', id: 'shipping-code', placeholder: 'e.g. SHIPFREE', autocomplete: 'off' } });
                const discountField = el('div', { class: 'field code-field' },
                    el('label', { attrs: { for: 'discount-code' } }, 'Discount Code (items)'),
                    el('div', { class: 'code-field-controls' }, discountInput, discountApplyBtn)
                );
                const shippingField = el('div', { class: 'field code-field' },
                    el('label', { attrs: { for: 'shipping-code' } }, 'Shipping Code'),
                    el('div', { class: 'code-field-controls' }, shippingInput, shippingApplyBtn)
                );
                const nameField = fieldInput('Name', 'cust-name', 'text', true);
                const emailField = fieldInput('Email', 'cust-email', 'text', true);
                const phoneField = fieldInput('Phone number', 'cust-phone', 'tel', true);
                const addressField = fieldTextArea('Address', 'cust-address', true);
                const countryField = (function () {
                    const field = el('div', { class: 'field' });
                    field.appendChild(el('label', { attrs: { for: 'cust-country' } }, 'Country'));
                    const sel = el('select', { attrs: { id: 'cust-country', required: 'true' } },
                        el('option', { attrs: { value: 'PH' } }, 'Philippines'),
                        el('option', { attrs: { value: 'US' } }, 'United States'),
                        el('option', { attrs: { value: 'CA' } }, 'Canada'),
                        el('option', { attrs: { value: 'DE' } }, 'Germany'),
                        el('option', { attrs: { value: 'FR' } }, 'France'),
                        el('option', { attrs: { value: 'ES' } }, 'Spain'),
                        el('option', { attrs: { value: 'IT' } }, 'Italy'),
                        el('option', { attrs: { value: 'JP' } }, 'Japan'),
                        el('option', { attrs: { value: 'AU' } }, 'Australia'),
                        el('option', { attrs: { value: 'OTHER' } }, 'Other / International')
                    );
                    field.appendChild(sel);
                    return field;
                })();
                const contactSection = el('div', { class: 'form-section full-span' },
                    el('div', { class: 'form-section-head' },
                        el('p', { class: 'form-section-eyebrow' }, 'Contact'),
                        el('h4', { class: 'form-section-title' }, 'Who is receiving the order?')
                    ),
                    nameField,
                    emailField,
                    phoneField
                );
                const addressSection = el('div', { class: 'form-section full-span' },
                    el('div', { class: 'form-section-head' },
                        el('p', { class: 'form-section-eyebrow' }, 'Delivery details'),
                        el('h4', { class: 'form-section-title' }, 'Where should we send it?')
                    ),
                    addressField,
                    countryField
                );
                const codeSection = el('div', { class: 'form-section full-span' },
                    el('div', { class: 'form-section-head' },
                        el('p', { class: 'form-section-eyebrow' }, 'Perks'),
                        el('h4', { class: 'form-section-title' }, 'Have a discount or shipping code?')
                    ),
                    discountField,
                    shippingField
                );
                const actionsRow = el('div', { class: 'checkout-actions-row full-span' },
                    el('button', { class: 'btn btn-success', attrs: { type: 'submit' } }, 'Place Order'),
                    el('button', { class: 'btn btn-outline', attrs: { type: 'button', id: 'cancel-checkout' } }, 'Cancel'),
                    el('span', { class: 'checkout-secure-note' }, 'No payment captured until confirmation.')
                );
                const form = el('form', { class: 'checkout-form-grid', attrs: { id: 'checkout-form', autocomplete: 'off' } },
                    contactSection,
                    addressSection,
                    codeSection,
                    actionsRow
                );
                if (state.customer) {
                    const nameInput = form.querySelector('#cust-name');
                    const emailInput = form.querySelector('#cust-email');
                    const phoneInput = form.querySelector('#cust-phone');
                    const addressInput = form.querySelector('#cust-address');
                    const countrySelect = form.querySelector('#cust-country');
                    if (nameInput && state.customer.name) nameInput.value = state.customer.name;
                    if (emailInput && state.customer.email) emailInput.value = state.customer.email;
                    if (phoneInput && state.customer.phone) phoneInput.value = state.customer.phone;
                    if (addressInput && state.customer.address) addressInput.value = state.customer.address;
                    if (countrySelect && state.customer.country) {
                        const match = Array.from(countrySelect.options || []).some(opt => opt.value === state.customer.country);
                        countrySelect.value = match ? state.customer.country : 'OTHER';
                    }
                }
                wrap.classList.add('checkout-modal-surface');
                wrap.querySelector('#checkout-loading')?.remove();
                const heroTotalValue = el('span', { class: 'checkout-hero-total-amount' }, money(estSubtotal + estTax));
                const heroBadges = el('div', { class: 'checkout-hero-badges' },
                    el('span', { class: 'checkout-hero-badge' }, 'Ships in 24h'),
                    el('span', { class: 'checkout-hero-badge' }, 'Free exchanges'),
                    el('span', { class: 'checkout-hero-badge' }, totalQuantity + (totalQuantity === 1 ? ' item' : ' items') + ' in bag')
                );
                const hero = el('div', { class: 'checkout-hero' },
                    el('div', { class: 'checkout-hero-copy' },
                        el('p', { class: 'checkout-eyebrow' }, 'Secure checkout'),
                        el('h1', { class: 'checkout-hero-title' }, 'Almost there'),
                        heroBadges,
                        el('p', { class: 'muted' }, 'Complete your delivery details and we will dispatch the order right away.')
                    ),
                    el('div', { class: 'checkout-hero-total' },
                        el('span', { class: 'label' }, 'Est. total'),
                        heroTotalValue,
                        el('span', { class: 'sub-label' }, 'Tax & shipping included')
                    )
                );
                const formCard = el('div', { class: 'checkout-form-card' },
                    el('div', { class: 'checkout-form-head' },
                        el('p', { class: 'checkout-eyebrow' }, 'Delivery details'),
                        el('h3', { class: 'checkout-form-title' }, 'Where should we send it?'),
                        el('p', { class: 'muted' }, 'We encrypt every submission and never store payment information in-browser.')
                    ),
                    form
                );
                const layout = el('div', { class: 'checkout-layout' },
                    el('div', { class: 'checkout-column' }, summaryCard),
                    el('div', { class: 'checkout-column' }, formCard)
                );
                wrap.appendChild(hero);
                wrap.appendChild(layout);
                function renderBreakdown() {
                    breakdownBox.innerHTML = '';
                    const rows = el('div', { class: 'checkout-breakdown-rows' });
                    const addRow = (label, value, extra = '') => rows.appendChild(el('div', { class: 'checkout-breakdown-row ' + extra }, el('span', { class: 'label' }, label), el('span', { class: 'value' }, value)));
                    addRow('Subtotal', money(estSubtotal));
                    if (estDiscount > 0) addRow('Item discount', '-' + money(estDiscount), 'muted');
                    addRow('Shipping', money(estShipping));
                    if (estShipDiscount > 0) addRow('Shipping discount', '-' + money(estShipDiscount), 'muted');
                    addRow('Tax', money(estTax));
                    const totalValue = estSubtotal - estDiscount + estTax + estShipping - estShipDiscount;
                    addRow('Total', money(totalValue), 'total');
                    breakdownBox.appendChild(rows);
                    heroTotalValue.textContent = money(totalValue);
                }
                renderBreakdown();
                const progressFill = shippingProgress.querySelector('.checkout-progress-fill');
                const progressLabel = shippingProgress.querySelector('.checkout-progress-label');
                function recalcShipping() {
                    const cEl = form.querySelector('#cust-country');
                    const country = cEl ? cEl.value : 'OTHER';
                    // Map country -> currency choice
                    const up = (country || '').toUpperCase();
                    if (['PH', 'PHL', 'PHILIPPINES'].includes(up)) setActiveCurrency('PHP');
                    else if (['US', 'USA'].includes(up)) setActiveCurrency('USD');
                    else if (['CA', 'CANADA'].includes(up)) setActiveCurrency('CAD');
                    else if (['AU', 'AUS', 'AUSTRALIA'].includes(up)) setActiveCurrency('AUD');
                    else if (['JP', 'JPN', 'JAPAN'].includes(up)) setActiveCurrency('JPY');
                    else if (['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'SE', 'FI', 'DK', 'IE', 'PT', 'AT', 'PL', 'CZ', 'HU', 'SK', 'RO', 'BG', 'GR'].includes(up)) setActiveCurrency('EUR');
                    else setActiveCurrency('USD');
                    estShipping = baseShip(estSubtotal, country) + perItemShip(country);
                    // Re-render line price amounts with new currency
                    linePriceRefs.forEach(ref => {
                        ref.node.textContent = money(ref.line.unitPriceCents * ref.line.quantity);
                    });
                    renderBreakdown();
                    const zone = classifyCountry(country);
                    if (zone === 'DOM') {
                        const threshold = SHIP_RATES.domesticFreeThreshold;
                        const progress = Math.min(1, estSubtotal / threshold);
                        shippingProgress.classList.remove('hidden');
                        if (progressFill) progressFill.style.width = (progress * 100) + '%';
                        if (progressLabel) {
                            const remaining = threshold - estSubtotal;
                            progressLabel.textContent = remaining > 0 ? 'Spend ' + money(remaining) + ' more to unlock free domestic shipping' : 'Free domestic shipping unlocked';
                        }
                    } else {
                        shippingProgress.classList.add('hidden');
                    }
                }
                recalcShipping();
                form.addEventListener('change', e => { if (e.target && e.target.id === 'cust-country') recalcShipping(); });
                const dcInput = discountInput; const shipInput = shippingInput;
                const dcApplyBtn = discountApplyBtn; const shipApplyBtn = shippingApplyBtn;
                function styleApply(btn, applied) {
                    if (applied) {
                        btn.classList.add('applied');
                        btn.textContent = 'Applied';
                        btn.setAttribute('aria-pressed', 'true');
                    } else {
                        btn.classList.remove('applied');
                        btn.textContent = 'Apply';
                        btn.setAttribute('aria-pressed', 'false');
                    }
                }
                async function evaluateDiscount() {
                    const code = dcInput.value.trim().toUpperCase();
                    dcInput.value = code; // normalize
                    estDiscount = 0; discountApplied = false;
                    if (!code) { renderBreakdown(); return; }
                    try {
                        const d = await apiFetch('/api/discounts/' + encodeURIComponent(code));
                        const now = Date.now();
                        const expired = d.expiresAt && new Date(d.expiresAt).getTime() <= now;
                        // Skip shipping-only discounts in item code field
                        if (d.type === 'ship' || (/SHIP/i.test(d.code || '') && d.value === 100)) { renderBreakdown(); return; }
                        if (!expired && estSubtotal >= d.minSubtotalCents) {
                            if (d.type === 'percent') estDiscount = Math.floor(estSubtotal * (d.value / 100));
                            else if (d.type === 'fixed') estDiscount = Math.min(estSubtotal, d.value);
                            if (estDiscount > 0) discountApplied = true;
                        }
                    } catch { }
                    styleApply(dcApplyBtn, discountApplied && estDiscount > 0);
                    renderBreakdown();
                }
                async function evaluateShip() {
                    const code = shipInput.value.trim().toUpperCase();
                    shipInput.value = code; // normalize
                    estShipDiscount = 0; shipDiscountApplied = false;
                    if (!code) { renderBreakdown(); return; }
                    try {
                        const d = await apiFetch('/api/discounts/' + encodeURIComponent(code));
                        const now = Date.now();
                        const expired = d.expiresAt && new Date(d.expiresAt).getTime() <= now;
                        const qualifies = !expired && estShipping > 0 && estSubtotal >= d.minSubtotalCents;
                        const isShipStyle = d.type === 'ship' || (/SHIP/i.test(d.code || '') && d.type === 'percent' && d.value === 100);
                        if (qualifies && isShipStyle) {
                            if (dcInput.value.trim().toUpperCase() !== code.toUpperCase()) {
                                estShipDiscount = Math.min(estShipping, Math.floor(estShipping * (d.value / 100)));
                                if (estShipDiscount > 0) shipDiscountApplied = true;
                            }
                        }
                    } catch { }
                    styleApply(shipApplyBtn, shipDiscountApplied && estShipDiscount > 0);
                    renderBreakdown();
                }
                // Only apply when user clicks Apply, never automatically (even if stored)
                dcApplyBtn.addEventListener('click', () => evaluateDiscount());
                shipApplyBtn.addEventListener('click', () => evaluateShip());
                // If user edits code after applying, reset applied state to avoid confusion
                dcInput.addEventListener('input', () => { if (discountApplied) { discountApplied = false; estDiscount = 0; styleApply(dcApplyBtn, false); renderBreakdown(); } });
                shipInput.addEventListener('input', () => { if (shipDiscountApplied) { shipDiscountApplied = false; estShipDiscount = 0; styleApply(shipApplyBtn, false); renderBreakdown(); } });
                form.addEventListener('submit', async ev => {
                    ev.preventDefault();
                    const customer = {
                        name: form.querySelector('#cust-name').value.trim(),
                        email: form.querySelector('#cust-email').value.trim(),
                        phone: form.querySelector('#cust-phone').value.trim(),
                        address: form.querySelector('#cust-address').value.trim(),
                        country: form.querySelector('#cust-country').value.trim()
                    };
                    if (!customer.name || !customer.email || !customer.phone || !customer.address) { notify('Fill all customer info', 'warn'); return; }
                    const discountCode = discountApplied ? (dcInput.value.trim().toUpperCase()) : undefined;
                    const shippingCode = shipDiscountApplied ? (shipInput.value.trim().toUpperCase()) : undefined;
                    const stripeAvailable = Boolean(window.Stripe && state.meta && state.meta.stripePublishableKey);
                    let attemptedStripe = false;
                    const placeManualOrder = async () => {
                        const orderRes = await createOrder(cartLines, customer, discountCode, shippingCode);
                        state.cart = [];
                        saveCart();
                        if (state.admin.token) {
                            loadOrdersAdmin().then(() => { if (state.currentRoute === 'admin') refreshAdminTables(); });
                        }
                        close();
                        state.lastOrder = {
                            id: orderRes.id,
                            subtotalCents: orderRes.subtotalCents,
                            discountCents: orderRes.discountCents,
                            shippingCents: orderRes.shippingCents,
                            shippingDiscountCents: orderRes.shippingDiscountCents,
                            totalCents: orderRes.totalCents,
                            lines: cartLines,
                            customer,
                            etaLabel: deliveryWindowLabel,
                            etaDetail: deliveryWindowDetail
                        };
                        navigate('order-confirmation');
                    };
                    try {
                        showSpinner(true);
                        if (stripeAvailable) {
                            attemptedStripe = true;
                            notify('Redirecting to secure payment…', 'info', 4000);
                            close();
                            await startStripeCheckout(cartLines, customer, discountCode, shippingCode);
                            return;
                        }
                        await placeManualOrder();
                    } catch (err) {
                        if (attemptedStripe) {
                            notify('Stripe checkout unavailable: ' + err.message + '. Falling back to direct checkout.', 'warn', 6000);
                            try {
                                await placeManualOrder();
                            } catch (retryErr) {
                                notify('Checkout failed: ' + retryErr.message, 'error', 6000);
                            }
                        } else {
                            notify('Checkout failed: ' + err.message, 'error', 6000);
                        }
                    } finally {
                        showSpinner(false);
                    }
                });
                form.querySelector('#cancel-checkout').addEventListener('click', close);
                console.debug('[checkout] rich modal constructed');
            } catch (e) {
                console.error('[checkout] rich build failed, switching to fallback:', e); notify('Checkout form failed, using fallback', 'error', 6000); injectFallback(wrap, close);
            }
        });
    }

    function fieldInput(labelText, id, type = 'text', required = false) {
        return el('div', { class: 'field' },
            el('label', { attrs: { for: id } }, labelText),
            el('input', { attrs: { type, id, required: required ? 'true' : null } })
        );
    }

    function fieldTextArea(labelText, id, required = false) {
        return el('div', { class: 'field' },
            el('label', { attrs: { for: id } }, labelText),
            el('textarea', { attrs: { id, required: required ? 'true' : null } })
        );
    }

    /* ----------------------------
     * Modal System
     * ---------------------------- */

    function showModal(renderFn) {
        modalRoot.innerHTML = '';
        modalRoot.classList.remove('hidden');
        const close = () => {
            modalRoot.classList.add('hidden');
            modalRoot.innerHTML = '';
        };
        renderFn(close);
        modalRoot.addEventListener('click', (e) => {
            if (e.target === modalRoot) close();
        }, { once: true });
        // Basic focus trap loop
        const focusable = modalRoot.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
        if (focusable.length) {
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            first.focus();
            modalRoot.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    if (e.shiftKey && document.activeElement === first) {
                        e.preventDefault();
                        last.focus();
                    } else if (!e.shiftKey && document.activeElement === last) {
                        e.preventDefault();
                        first.focus();
                    }
                } else if (e.key === 'Escape') {
                    close();
                }
            });
        }
    }

    function renderOrderConfirmation() {
        setBodyRoute('order-confirmation');
        rootEl.innerHTML = '';
        const data = state.lastOrder;
        if (!data) { navigate('home'); return; }

        const subtotal = data.subtotalCents || 0;
        const discount = data.discountCents || 0;
        const shipping = data.shippingCents || 0;
        const shippingDiscount = data.shippingDiscountCents || 0;
        const total = data.totalCents || (subtotal - discount + shipping - shippingDiscount);
        const customerName = (data.customer && data.customer.name) || 'Friend';
        const customerEmail = (data.customer && data.customer.email) || 'No email provided';
        const customerPhone = (data.customer && data.customer.phone) || 'No phone on file';
        const itemCount = (Array.isArray(data.lines) ? data.lines : []).reduce((sum, line) => sum + (line.quantity || 0), 0) || data.lines?.length || 0;
        const etaLabel = data.etaLabel || '2-4 days';
        const etaDetail = data.etaDetail || 'Priority handling';

        const metaTile = (label, value, detail) => el('div', { class: 'oc-meta-tile' },
            el('span', { class: 'oc-meta-label' }, label),
            el('span', { class: 'oc-meta-value' }, value),
            detail ? el('span', { class: 'oc-meta-detail muted tiny' }, detail) : null
        );

        const hero = el('section', { class: 'oc-hero-card' },
            el('div', { class: 'oc-hero-chip' },
                el('span', { class: 'oc-hero-dot' }),
                'Order confirmed'
            ),
            el('h1', { class: 'oc-hero-title' }, `Thank you, ${customerName}!`),
            el('p', { class: 'oc-hero-copy muted' }, 'We sent a receipt and live tracking link to your inbox. You will receive SMS updates once the parcel ships.'),
            el('div', { class: 'oc-meta-grid' },
                metaTile('Order ID', data.id, 'Share this for support'),
                metaTile('Total paid', money(total), 'VAT inclusive'),
                metaTile('Email', customerEmail),
                metaTile('Phone', customerPhone)
            )
        );

        const quickStat = (label, value, detail) => el('div', { class: 'oc-quick-stat' },
            el('span', { class: 'oc-quick-label' }, label),
            el('span', { class: 'oc-quick-value' }, value),
            detail ? el('span', { class: 'oc-quick-detail muted tiny' }, detail) : null
        );

        const quickStats = el('section', { class: 'oc-quick-stats' },
            quickStat('Order', data.id, 'Placed just now'),
            quickStat('Arrives', etaLabel, etaDetail),
            quickStat('Total', money(total)),
            quickStat('Items', itemCount ? itemCount + (itemCount === 1 ? ' item' : ' items') : '0')
        );

        const lineItems = el('div', { class: 'oc-items-list' },
            ...data.lines.map(line => {
                const product = state.productsById.get(line.productId);
                const imageSrc = (product && Array.isArray(product.images) && product.images[0]) || productPlaceholder(280);
                const title = product ? product.title : (line.title || 'Item');
                const variant = line.variantLabel || (line.variantName || '');
                const qty = line.quantity || 1;
                const unit = typeof line.unitPriceCents === 'number' ? line.unitPriceCents : Math.round((line.totalCents || subtotal) / Math.max(qty, 1));
                const totalLine = unit * qty;
                return el('div', { class: 'oc-item' },
                    el('div', { class: 'oc-item-thumb' },
                        el('img', { attrs: { src: imageSrc, alt: title, loading: 'lazy' } })
                    ),
                    el('div', { class: 'oc-item-info' },
                        el('div', { class: 'oc-item-top' },
                            el('span', { class: 'oc-item-qty-pill' }, qty + '×'),
                            el('p', { class: 'oc-item-title' }, title)
                        ),
                        variant ? el('span', { class: 'oc-item-variant muted tiny' }, variant) : null,
                        el('span', { class: 'oc-item-unit muted tiny' }, 'Unit ' + money(unit))
                    ),
                    el('div', { class: 'oc-item-price' }, money(totalLine))
                );
            })
        );

        const totals = el('div', { class: 'oc-totals' },
            el('div', { class: 'oc-totals-row' }, el('span', {}, 'Subtotal'), el('span', {}, money(subtotal))),
            discount ? el('div', { class: 'oc-totals-row muted' }, el('span', {}, 'Item discount'), el('span', {}, '-' + money(discount))) : null,
            el('div', { class: 'oc-totals-row' }, el('span', {}, 'Shipping'), el('span', {}, money(shipping))),
            shippingDiscount ? el('div', { class: 'oc-totals-row muted' }, el('span', {}, 'Shipping discount'), el('span', {}, '-' + money(shippingDiscount))) : null,
            el('div', { class: 'oc-totals-row total' }, el('span', {}, 'Total paid'), el('span', {}, money(total)))
        );

        const steps = el('ol', { class: 'oc-steps' },
            el('li', {},
                el('span', { class: 'oc-step-label' }, 'Processing'),
                el('p', { class: 'tiny muted' }, 'We are packing your items and verifying the shipping address.')
            ),
            el('li', {},
                el('span', { class: 'oc-step-label' }, 'Shipping soon'),
                el('p', { class: 'tiny muted' }, 'Once the courier picks up the parcel, we will send tracking updates via email and SMS.')
            ),
            el('li', {},
                el('span', { class: 'oc-step-label' }, 'Delivery'),
                el('p', { class: 'tiny muted' }, 'Priority handling arrives within 2-4 days. Reach out if you need to adjust the delivery window.')
            )
        );

        const summaryGrid = el('div', { class: 'oc-summary-grid' },
            el('div', { class: 'oc-card oc-items-card' },
                el('div', { class: 'oc-card-head' },
                    el('span', { class: 'oc-card-eyebrow' }, 'Lineup'),
                    el('h2', { class: 'oc-card-title' }, 'What is on the way')
                ),
                lineItems
            ),
            el('div', { class: 'oc-card oc-breakdown-card' },
                el('div', { class: 'oc-card-head' },
                    el('span', { class: 'oc-card-eyebrow' }, 'Summary'),
                    el('h2', { class: 'oc-card-title' }, 'Charge breakdown')
                ),
                totals,
                el('div', { class: 'oc-card-divider' }),
                el('div', { class: 'oc-card-head' },
                    el('span', { class: 'oc-card-eyebrow' }, 'Next up'),
                    el('h3', { class: 'oc-card-title' }, 'Delivery timeline')
                ),
                steps
            )
        );

        const detailsWrap = el('section', { class: 'oc-details collapsed', attrs: { id: 'oc-details-panel' } }, summaryGrid);

        const toggleBtn = el('button', { class: 'oc-toggle-details', attrs: { type: 'button', 'aria-controls': 'oc-details-panel', 'aria-expanded': 'false' } }, 'View full receipt');

        const actions = el('div', { class: 'oc-actions' },
            el('button', { class: 'btn btn-success', attrs: { 'data-route': 'catalog' } }, 'Continue shopping'),
            el('button', { class: 'btn btn-outline', attrs: { 'data-route': 'home' } }, 'Return home'),
            el('button', { class: 'btn btn-outline', attrs: { type: 'button', id: 'oc-print' } }, 'Save receipt')
        );

        const shell = el('div', { class: 'order-confirmation-shell container' }, hero, quickStats, toggleBtn, detailsWrap, actions);
        rootEl.appendChild(shell);

        const printBtn = shell.querySelector('#oc-print');
        if (printBtn) {
            printBtn.addEventListener('click', () => {
                try {
                    window.print();
                } catch (err) {
                    notify('Unable to trigger print: ' + err.message, 'error', 4000);
                }
            });
        }

        toggleBtn.addEventListener('click', () => {
            const isCollapsed = detailsWrap.classList.toggle('collapsed');
            const expanded = !isCollapsed;
            toggleBtn.textContent = expanded ? 'Hide full receipt' : 'View full receipt';
            toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        });
    }

    async function maybeHandleStripeReturn() {
        try {
            const params = new URLSearchParams(window.location.search);
            const status = params.get('checkout');
            if (!status) return false;
            const orderId = params.get('orderId');
            const clearQuery = () => {
                if (window.history && window.history.replaceState) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            };
            if (status === 'success' && orderId) {
                showSpinner(true);
                try {
                    const track = await apiFetch('/api/orders/' + encodeURIComponent(orderId) + '/track');
                    const order = track.order;
                    const items = Array.isArray(track.items) ? track.items : [];
                    state.lastOrder = {
                        id: order.id,
                        subtotalCents: order.subtotalCents,
                        discountCents: order.discountCents,
                        shippingCents: order.shippingCents,
                        shippingDiscountCents: order.shippingDiscountCents,
                        totalCents: order.totalCents,
                        customer: {
                            name: order.customerName || 'Customer',
                            email: order.customerEmail || ''
                        },
                        lines: items.map(item => ({
                            productId: item.productId,
                            variantId: item.variantId || null,
                            quantity: item.quantity,
                            title: item.titleSnapshot,
                            unitPriceCents: item.unitPriceCents
                        })),
                        etaLabel: '2-4 days',
                        etaDetail: 'Priority handling'
                    };
                    state.cart = [];
                    saveCart();
                    updateCartBadge();
                    clearQuery();
                    navigate('order-confirmation');
                    return true;
                } catch (err) {
                    notify('Unable to load Stripe order: ' + err.message, 'error', 6000);
                    clearQuery();
                    return false;
                } finally {
                    showSpinner(false);
                }
            }
            if (status === 'cancelled') {
                notify('Stripe checkout cancelled.', 'info', 4000);
                clearQuery();
            }
            return false;
        } catch (err) {
            console.warn('[checkout] stripe return handler failed', err);
            return false;
        }
    }

    // ----------------------------
    // My Orders (customer view demo)
    // ----------------------------
    function deriveMyOrders() {
        return state.myOrders || [];
    }
    function orderBucket(o) {
        if (!o) return 'pending';
        if (o.cancelledAt) return 'cancelled';
        if (o.completedAt) return 'delivered';
        if (o.shippedAt) return 'shipped';
        if (o.paidAt) return 'processing';
        return 'pending';
    }
    function renderMyOrders() {
        setBodyRoute('my-orders');
        rootEl.innerHTML = '';
        if (!state.myOrdersDetailCache) state.myOrdersDetailCache = new Map();

        const sessionUser = state.customer;
        const signedIn = !!(sessionUser && sessionUser.sessionToken && sessionUser.email);
        let activeTab = 'all';
        let searchQuery = (state.myOrdersFilter && typeof state.myOrdersFilter.query === 'string') ? state.myOrdersFilter.query : '';

        const shell = el('div', { class: 'my-orders-shell container' });
        const header = el('header', { class: 'mo-header' },
            el('h1', { class: 'mo-heading' }, 'My Orders'),
            el('p', { class: 'mo-description' }, 'View and manage your order history')
        );
        shell.appendChild(header);

        if (!signedIn) {
            state.myOrders = [];
            state.myOrdersEmail = '';
            state.myOrdersDetailCache.clear();
            state.customerRefundThreads = new Map();
            const prompt = el('div', { class: 'mo-empty-state' },
                el('h3', {}, 'Sign in to view orders'),
                el('p', {}, 'Sign in with your account to see your order history.'),
                el('button', { class: 'mo-button mo-button--primary', attrs: { type: 'button', id: 'mo-signin-trigger' } }, 'Sign in')
            );
            prompt.querySelector('#mo-signin-trigger').addEventListener('click', () => showCustomerAuthModal('login'));
            shell.appendChild(prompt);
            rootEl.appendChild(shell);
            return;
        }

        const accountEmail = sessionUser.email || '';
        if (state.myOrdersEmail !== accountEmail) {
            state.myOrders = [];
            state.myOrdersDetailCache.clear();
            state.customerRefundThreads = new Map();
        }
        state.myOrdersEmail = accountEmail;

        const searchInput = el('input', {
            class: 'mo-search-input',
            attrs: {
                type: 'search',
                placeholder: 'Search orders by order number or product name...',
                value: searchQuery
            }
        });
        const searchIcon = el('span', { class: 'mo-search-icon', attrs: { 'aria-hidden': 'true' } },
            el('svg', { attrs: { viewBox: '0 0 20 20', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' } },
                el('path', {
                    attrs: {
                        d: 'M13.5 12.5L17.5 16.5',
                        stroke: 'currentColor',
                        'stroke-width': '1.6',
                        'stroke-linecap': 'round'
                    }
                }),
                el('circle', {
                    attrs: {
                        cx: '9',
                        cy: '9',
                        r: '5.5',
                        stroke: 'currentColor',
                        'stroke-width': '1.6'
                    }
                })
            )
        );
        const searchBar = el('div', { class: 'mo-search' }, searchIcon, searchInput);

        const tabsConfig = [
            ['all', 'All'],
            ['pending', 'Pending'],
            ['processing', 'Processing'],
            ['shipped', 'Shipped'],
            ['delivered', 'Delivered'],
            ['cancelled', 'Cancelled']
        ];
        const tabButtons = [];
        const tabBar = el('div', { class: 'mo-tabbar', attrs: { role: 'tablist', 'aria-label': 'Filter orders' } },
            ...tabsConfig.map(([key, label]) => {
                const btn = el('button', {
                    class: 'mo-tab',
                    attrs: { type: 'button', 'data-tab': key, role: 'tab', 'aria-selected': 'false' }
                },
                    el('span', { class: 'mo-tab-label' }, label),
                    el('span', { class: 'mo-tab-count', attrs: { 'data-tab-count': key } }, '0')
                );
                tabButtons.push(btn);
                return btn;
            })
        );

        const refundShortcutCount = el('span', { class: 'mo-tabbar-cta-count' }, '0');
        const refundShortcutBtn = el('button', {
            class: 'mo-button mo-button--ghost mo-button--compact mo-tabbar-cta',
            attrs: { type: 'button', 'data-refund-shortcut': '1' }
        },
            el('span', { class: 'mo-tabbar-cta-label' }, 'Refund status'),
            refundShortcutCount
        );
        refundShortcutBtn.hidden = true;
        refundShortcutCount.hidden = true;

        const tabSection = el('div', { class: 'mo-tabbar-row' }, tabBar, refundShortcutBtn);
        const content = el('div', { class: 'mo-orders', attrs: { id: 'my-orders-content' } });

        shell.appendChild(searchBar);
        shell.appendChild(tabSection);
        shell.appendChild(content);

        refundShortcutBtn.addEventListener('click', () => showRefundSummaryModal());
        rootEl.appendChild(shell);

        function ensureProductsLoaded() {
            if (!state.products || !state.products.length) {
                loadProducts().then(() => renderOrders()).catch(() => { /* ignore */ });
            }
        }

        function formatDate(value) {
            if (!value) return '—';
            const dt = new Date(value);
            if (Number.isNaN(dt.getTime())) return '—';
            return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        }

        function mergedOrder(order) {
            if (!order) return null;
            const detail = state.myOrdersDetailCache?.get(order.id);
            const merged = { ...order };
            if (detail?.order) Object.assign(merged, detail.order);
            merged.items = Array.isArray(detail?.items) ? detail.items.slice() : Array.isArray(order.items) ? order.items.slice() : [];
            merged.events = Array.isArray(detail?.events) ? detail.events.slice() : [];
            return merged;
        }

        function buildStatusMeta(order) {
            const bucket = orderBucket(order);
            const statusMap = {
                pending: { label: 'Pending', className: 'mo-status-chip--pending' },
                processing: { label: 'Processing', className: 'mo-status-chip--processing' },
                shipped: { label: 'Shipped', className: 'mo-status-chip--shipped' },
                delivered: { label: 'Delivered', className: 'mo-status-chip--delivered' },
                cancelled: { label: 'Cancelled', className: 'mo-status-chip--cancelled' }
            };
            return statusMap[bucket] || statusMap.pending;
        }

        function filterByQuery(order) {
            if (!searchQuery) return true;
            const parts = [order.id || '', order.customerName || '', order.customerEmail || ''];
            if (Array.isArray(order.items)) {
                order.items.forEach(item => {
                    if (item.titleSnapshot) parts.push(item.titleSnapshot);
                    if (item.quantity) parts.push(String(item.quantity));
                });
            }
            const haystack = parts.join(' ').toLowerCase();
            return haystack.includes(searchQuery.toLowerCase());
        }

        function enrichItem(item) {
            if (!item) return null;
            const productMap = state.productsById instanceof Map ? state.productsById : new Map();
            const product = item.productId ? productMap.get(item.productId) : null;
            const rawImages = product?.images;
            const images = Array.isArray(rawImages) ? rawImages : rawImages ? [rawImages] : [];
            const image = images.length ? images[0] : null;
            return {
                title: item.titleSnapshot || product?.title || 'Item',
                quantity: item.quantity || 0,
                unitPriceCents: item.unitPriceCents || 0,
                image,
                productId: item.productId || null,
                variantId: item.variantId || null
            };
        }

        function shouldShowRefundSection(order) {
            return !!(order && order.returnRequestedAt);
        }

        function buildRefundDetailSection(order) {
            if (!shouldShowRefundSection(order)) return null;
            const orderId = order.id || '';
            const statusKey = getRefundStatus(order.returnAdminStatus);
            const statusLabel = formatRefundStatus(statusKey);
            const requestedCopy = order.returnRequestedAt ? formatDateTimeStamp(order.returnRequestedAt) : '—';
            const lastUpdateCopy = order.returnAdminRespondedAt ? formatDateTimeStamp(order.returnAdminRespondedAt) : 'Awaiting response';
            const reasonText = (order.returnReason || '').trim() || 'You did not include extra notes with this request.';
            const usageCopy = describeRefundUsage(order);
            const messageFieldId = `refund-message-${orderId || Math.random().toString(36).slice(2)}`;
            return el('div', { class: 'mo-detail-section mo-refund-section', attrs: { 'data-refund-section': orderId } },
                el('div', { class: 'mo-refund-header' },
                    el('div', { class: 'mo-refund-title-stack' },
                        el('h4', { class: 'mo-detail-title' }, 'Refund updates'),
                        el('p', { class: 'mo-refund-subtitle' }, 'See the latest status and chat with our team.')
                    ),
                    el('span', { class: `admin-refund-status-chip status-${statusKey}` }, statusLabel)
                ),
                el('div', { class: 'mo-refund-meta' },
                    el('div', { class: 'mo-refund-meta-card' },
                        el('span', { class: 'tiny muted' }, 'Requested on'),
                        el('span', {}, requestedCopy)
                    ),
                    el('div', { class: 'mo-refund-meta-card' },
                        el('span', { class: 'tiny muted' }, 'Last update'),
                        el('span', {}, lastUpdateCopy)
                    )
                ),
                el('div', { class: 'mo-refund-reason-wrap' },
                    el('span', { class: 'tiny muted' }, 'Issue shared'),
                    el('p', { class: 'mo-refund-reason' }, reasonText)
                ),
                usageCopy ? el('p', { class: 'mo-refund-usage tiny muted' }, usageCopy) : null,
                el('div', { class: 'admin-refund-thread mo-refund-thread' },
                    el('div', { class: 'admin-refund-thread-messages mo-refund-thread-messages', attrs: { 'data-customer-refund-messages': orderId } },
                        el('p', { class: 'tiny muted' }, 'Conversation loads when you expand this order.')
                    ),
                    el('form', { class: 'admin-refund-reply mo-refund-reply', attrs: { 'data-customer-refund-form': orderId } },
                        el('label', { class: 'tiny muted', attrs: { for: messageFieldId } }, 'Message the store team'),
                        el('textarea', {
                            class: 'mo-refund-textarea',
                            attrs: {
                                id: messageFieldId,
                                placeholder: 'Share new details or ask a question…',
                                rows: '3',
                                maxlength: '2000',
                                required: 'true'
                            }
                        }),
                        el('div', { class: 'mo-refund-reply-actions' },
                            el('button', { class: 'mo-button mo-button--primary mo-button--compact', attrs: { type: 'submit' } }, 'Send')
                        )
                    )
                )
            );
        }

        function getRefundOrders() {
            return deriveMyOrders()
                .map(order => mergedOrder(order) || order)
                .filter(order => !!(order && order.returnRequestedAt));
        }

        function buildRefundOverviewCard(order) {
            if (!order) return el('div');
            const statusKey = getRefundStatus(order.returnAdminStatus);
            const statusLabel = formatRefundStatus(statusKey);
            const requestedCopy = order.returnRequestedAt ? formatDateTimeStamp(order.returnRequestedAt) : 'Awaiting submission';
            const lastUpdateCopy = order.returnAdminRespondedAt ? formatDateTimeStamp(order.returnAdminRespondedAt) : 'Awaiting response';
            const usageCopy = describeRefundUsage(order);
            const items = (order.items || []).map(enrichItem).filter(Boolean);
            const previewItems = items.slice(0, 2);
            const extraCount = Math.max(0, items.length - previewItems.length);
            return el('article', { class: 'refund-overview-card', attrs: { 'data-refund-order': order.id } },
                el('div', { class: 'refund-overview-head' },
                    el('div', { class: 'refund-overview-id' },
                        el('span', { class: 'tiny muted' }, 'Order'),
                        el('strong', {}, `#${String(order.id).slice(0, 10)}`)
                    ),
                    el('span', { class: `admin-refund-status-chip status-${statusKey}` }, statusLabel)
                ),
                el('div', { class: 'refund-overview-meta' },
                    el('div', { class: 'refund-overview-meta-entry' },
                        el('span', { class: 'tiny muted' }, 'Requested on'),
                        el('span', {}, requestedCopy)
                    ),
                    el('div', { class: 'refund-overview-meta-entry' },
                        el('span', { class: 'tiny muted' }, 'Last update'),
                        el('span', {}, lastUpdateCopy)
                    )
                ),
                el('div', { class: 'refund-overview-reason-wrap' },
                    el('span', { class: 'tiny muted' }, 'Issue shared'),
                    el('p', { class: 'refund-overview-reason' }, (order.returnReason || '').trim() || 'No reason provided.')
                ),
                usageCopy ? el('p', { class: 'refund-overview-usage tiny muted' }, usageCopy) : null,
                el('div', { class: 'refund-overview-products' },
                    previewItems.length
                        ? previewItems.map(item => el('div', { class: 'refund-overview-product' },
                            item.image ? el('img', { attrs: { src: item.image, alt: item.title || 'Product' } }) : el('span', { class: 'mo-thumb-placeholder refund-overview-thumb' }, item.title?.charAt(0) || '•'),
                            el('div', { class: 'refund-overview-product-info' },
                                el('span', { class: 'refund-overview-product-title' }, item.title || 'Item'),
                                el('span', { class: 'refund-overview-product-qty tiny muted' }, `Quantity: ${item.quantity || 1}`)
                            )
                        ))
                        : [el('p', { class: 'tiny muted' }, 'We will load items as soon as they are available.')]
                ),
                extraCount ? el('span', { class: 'refund-overview-more tiny muted' }, `+${extraCount} more item${extraCount === 1 ? '' : 's'}`) : null,
                el('div', { class: 'refund-overview-actions' },
                    el('button', {
                        class: 'mo-button mo-button--primary mo-button--compact',
                        attrs: { type: 'button', 'data-refund-overview-open': order.id }
                    }, 'Open conversation')
                )
            );
        }

        function buildOrderCard(order) {
            if (!order) return el('div');
            const status = buildStatusMeta(order);
            const card = el('article', { class: 'mo-order-card', attrs: { 'data-order-id': order.id } });
            card.setAttribute('data-has-refund', shouldShowRefundSection(order) ? '1' : '0');
            const head = el('div', { class: 'mo-order-head' },
                el('div', { class: 'mo-order-reference' },
                    el('span', { class: 'mo-order-number' }, `Order #${(order.id || '').toString().slice(0, 12)}`),
                    el('div', { class: 'mo-order-meta' },
                        el('span', {}, `Placed on ${formatDate(order.createdAt)}`),
                        el('span', {}, `Estimated delivery: ${formatDate(order.estimatedDeliveryAt)}`)
                    )
                ),
                el('div', { class: 'mo-order-status-group' },
                    el('span', { class: `mo-status-chip ${status.className}` }, status.label),
                    order.returnRequestedAt ? el('span', { class: 'mo-status-chip mo-status-chip--returns', attrs: { 'data-refund-status-chip': order.id } }, formatRefundStatus(order.returnAdminStatus)) : null
                )
            );

            const items = (order.items || [])
                .map(enrichItem)
                .filter(Boolean);

            const itemsList = el('div', { class: 'mo-order-items' },
                items.length
                    ? items.map(item => el('div', { class: 'mo-item' },
                        el('div', { class: 'mo-item-thumb' },
                            item.image ? el('img', { attrs: { src: item.image, alt: item.title } }) : el('span', { class: 'mo-thumb-placeholder' }, item.title.charAt(0) || '•')
                        ),
                        el('div', { class: 'mo-item-info' },
                            el('span', { class: 'mo-item-title' }, item.title),
                            el('span', { class: 'mo-item-qty' }, `Quantity: ${item.quantity || 1}`),
                            el('span', { class: 'mo-item-price' }, money((item.unitPriceCents || 0) * (item.quantity || 1), { showBase: false }))
                        )
                    ))
                    : [
                        el('div', { class: 'mo-item mo-item--empty' },
                            el('div', { class: 'mo-item-info' },
                                el('span', { class: 'mo-item-title' }, 'Order items will appear here once available.')
                            )
                        )
                    ]
            );

            const summary = el('div', { class: 'mo-order-summary' },
                el('span', { class: 'mo-order-total-label' }, 'Total'),
                el('span', { class: 'mo-order-total' }, money(order.totalCents || 0))
            );

            const actions = el('div', { class: 'mo-order-actions' },
                !order.paidAt && !order.cancelledAt ? el('button', { class: 'mo-button mo-button--primary mo-button--compact', attrs: { 'data-pay': order.id } }, 'Pay now') : null,
                order.shippedAt && !order.completedAt ? el('button', { class: 'mo-button mo-button--subtle mo-button--compact', attrs: { 'data-track': order.id } }, 'Track order') : null,
                order.shippedAt && !order.returnRequestedAt && !order.cancelledAt ? el('button', { class: 'mo-button mo-button--ghost mo-button--compact', attrs: { 'data-return': order.id } }, 'Return / Refund') : null,
                el('button', { class: 'mo-button mo-button--ghost mo-button--compact', attrs: { 'data-toggle-detail': order.id, 'aria-expanded': 'false' } }, 'View details')
            );

            const detailSections = [];
            const refundSection = buildRefundDetailSection(order);
            if (refundSection) detailSections.push(refundSection);
            if (order.events && order.events.length) {
                detailSections.push(
                    el('div', { class: 'mo-detail-section' },
                        el('h4', { class: 'mo-detail-title' }, 'Status updates'),
                        el('ul', { class: 'mo-event-list' },
                            ...order.events.map(ev => el('li', { class: 'mo-event' },
                                el('span', { class: 'mo-event-status' }, ev.status.replace(/_/g, ' ')),
                                el('time', { class: 'mo-event-time', attrs: { datetime: ev.at } }, formatDate(ev.at))
                            ))
                        )
                    )
                );
            }
            detailSections.push(
                el('div', { class: 'mo-detail-section' },
                    el('h4', { class: 'mo-detail-title' }, 'Payment breakdown'),
                    el('ul', { class: 'mo-breakdown' },
                        el('li', {}, el('span', {}, 'Subtotal'), el('span', {}, money(order.subtotalCents || 0))),
                        el('li', {}, el('span', {}, 'Shipping'), el('span', {}, money(order.shippingCents || 0))),
                        el('li', {}, el('span', {}, 'Discounts'), el('span', {}, order.discountCents ? '-' + money(order.discountCents, { showBase: false }) : money(0))),
                        el('li', { class: 'mo-breakdown-total' }, el('span', {}, 'Total paid'), el('span', {}, money(order.totalCents || 0)))
                    )
                )
            );

            const detail = el('div', { class: 'mo-order-detail hidden' }, ...detailSections);

            card.appendChild(head);
            card.appendChild(itemsList);
            card.appendChild(summary);
            card.appendChild(actions);
            card.appendChild(detail);
            return card;
        }

        function renderEmptyState(message) {
            content.innerHTML = '';
            content.appendChild(
                el('div', { class: 'mo-empty-state' },
                    el('h3', {}, 'No orders to show'),
                    el('p', {}, message || 'Recent purchases will appear here once they are ready.')
                )
            );
        }

        const TRACK_STATUS_META = {
            pending_payment: { label: 'Awaiting payment confirmation', location: 'Quezon City billing desk' },
            created: { label: 'Order placed', location: 'Quezon City fulfillment center' },
            paid: { label: 'Payment confirmed', location: 'Quezon City operations hub' },
            fulfilled: { label: 'Packed and ready to ship', location: 'Makati sorting facility' },
            shipped: { label: 'In transit to destination', location: 'Central Luzon logistics hub' },
            completed: { label: 'Delivered', location: 'Customer delivery address' },
            cancelled: { label: 'Cancelled', location: 'Support desk' },
            return_requested: { label: 'Return requested', location: 'Customer support desk' }
        };

        function trackingMeta(status) {
            const key = (status || '').toLowerCase();
            const base = TRACK_STATUS_META[key];
            if (base) return base;
            const nice = (status || 'Update').replace(/_/g, ' ');
            return { label: nice.charAt(0).toUpperCase() + nice.slice(1), location: 'Tracking update recorded' };
        }

        function formatDateTimeStamp(value) {
            if (!value) return 'Pending update';
            const dt = new Date(value);
            if (Number.isNaN(dt.getTime())) return value;
            return dt.toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        function fallbackEventsFromOrder(order) {
            if (!order) return [];
            const pairs = [
                ['created', order.createdAt],
                ['pending_payment', order.status === 'created' && !order.paidAt ? order.createdAt : null],
                ['paid', order.paidAt],
                ['fulfilled', order.fulfilledAt],
                ['shipped', order.shippedAt],
                ['completed', order.completedAt],
                ['cancelled', order.cancelledAt],
                ['return_requested', order.returnRequestedAt]
            ];
            return pairs
                .filter(([, at]) => !!at)
                .map(([status, at]) => ({ status, at }))
                .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
        }

        async function ensureOrderDetail(orderId) {
            if (!orderId) return null;
            let detail = state.myOrdersDetailCache.get(orderId);
            if (detail) return detail;
            const fetched = await apiFetch(`/api/orders/${encodeURIComponent(orderId)}/track`);
            state.myOrdersDetailCache.set(orderId, fetched);
            return fetched;
        }

        async function showOrderTrackingModal(orderId) {
            if (!orderId) return;
            const base = state.myOrders.find(o => o.id === orderId);
            if (!base) {
                notify('Order not found.', 'error');
                return;
            }
            let detail;
            try {
                detail = await ensureOrderDetail(orderId);
            } catch (err) {
                notify('Unable to load tracking information: ' + err.message, 'error');
                return;
            }
            const merged = mergedOrder(base) || base;
            const statusMeta = buildStatusMeta(merged);
            const eventsRaw = (detail && Array.isArray(detail.events) && detail.events.length ? detail.events : fallbackEventsFromOrder(merged)) || [];
            const events = eventsRaw.slice().sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
            const latestEvent = events[events.length - 1] || null;
            const latestMeta = latestEvent ? trackingMeta(latestEvent.status) : trackingMeta(orderBucket(merged));
            const shortId = orderId.slice(0, 8);
            showModal((close) => {
                const wrap = el('div', { class: 'modal order-track-modal', attrs: { role: 'dialog', 'aria-modal': 'true' } });
                const closeBtn = el('button', { class: 'modal-close', attrs: { type: 'button', 'aria-label': 'Close' } }, '×');
                closeBtn.addEventListener('click', close);
                const header = el('div', { class: 'track-modal-head' },
                    el('div', { class: 'track-modal-titles' },
                        el('h2', { class: 'track-modal-title' }, `Track order ${shortId}`),
                        el('p', { class: 'track-modal-subtitle' }, latestMeta.label)
                    ),
                    el('span', { class: `mo-status-chip ${statusMeta.className} track-modal-chip` }, statusMeta.label)
                );
                const summary = el('div', { class: 'track-modal-summary' },
                    el('span', {}, `Placed on ${formatDate(merged.createdAt)}`),
                    merged.estimatedDeliveryAt ? el('span', {}, `Estimated delivery: ${formatDate(merged.estimatedDeliveryAt)}`) : null,
                    latestEvent ? el('span', {}, `Last update: ${formatDateTimeStamp(latestEvent.at)}`) : null
                );
                const timeline = events.length ? el('ol', { class: 'track-timeline' },
                    ...events.map((ev, idx) => {
                        const meta = trackingMeta(ev.status);
                        const isActive = idx === events.length - 1;
                        return el('li', { class: 'track-step' + (isActive ? ' active' : '') },
                            el('div', { class: 'track-step-marker' },
                                el('span', { class: 'track-step-dot' }),
                                idx !== events.length - 1 ? el('span', { class: 'track-step-line' }) : null
                            ),
                            el('div', { class: 'track-step-body' },
                                el('div', { class: 'track-step-label' }, meta.label),
                                meta.location ? el('div', { class: 'track-step-location' }, meta.location) : null,
                                el('time', { class: 'track-step-time', attrs: { datetime: ev.at || '' } }, formatDateTimeStamp(ev.at))
                            )
                        );
                    })
                ) : el('div', { class: 'track-timeline-empty muted small' }, 'Tracking updates will appear once the courier scans your package.');
                const footer = el('div', { class: 'track-modal-foot' },
                    el('button', { class: 'mo-button mo-button--ghost', attrs: { type: 'button' } }, 'Close')
                );
                footer.querySelector('button').addEventListener('click', close);

                wrap.append(closeBtn, header, summary, timeline, footer);
                modalRoot.appendChild(wrap);
            });
        }

        function updateTabCounts() {
            const orders = deriveMyOrders();
            const counts = { all: 0, pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };
            for (const base of orders) {
                const merged = mergedOrder(base) || base;
                const bucket = orderBucket(merged);
                if (counts[bucket] != null) counts[bucket] += 1;
                counts.all += 1;
            }
            tabBar.querySelectorAll('[data-tab-count]').forEach(node => {
                const key = node.getAttribute('data-tab-count');
                node.textContent = counts[key] != null ? String(counts[key]) : '0';
            });
        }

        function setRefundShortcutState(orderList = []) {
            const refundCount = Array.isArray(orderList)
                ? orderList.reduce((sum, order) => sum + (order?.returnRequestedAt ? 1 : 0), 0)
                : 0;
            refundShortcutCount.textContent = String(refundCount);
            refundShortcutCount.hidden = refundCount === 0;
            refundShortcutBtn.hidden = refundCount === 0;
            refundShortcutBtn.disabled = refundCount === 0;
        }

        function renderOrders() {
            const orders = deriveMyOrders();
            const enriched = orders.map(o => mergedOrder(o)).filter(Boolean);
            setRefundShortcutState(enriched);
            updateTabCounts();
            const filtered = enriched.filter(order => {
                if (activeTab !== 'all' && orderBucket(order) !== activeTab) return false;
                return filterByQuery(order);
            });
            if (!orders.length) {
                renderEmptyState('This account does not have any orders yet.');
                return;
            }
            if (!filtered.length) {
                renderEmptyState('Try a different status tab or clear the search field.');
                return;
            }
            content.innerHTML = '';
            filtered.forEach(order => {
                content.appendChild(buildOrderCard(order));
            });
        }

        function ensureOrderDetailVisible(card, orderId, { focusSection } = {}) {
            if (!card) return null;
            const detail = card.querySelector('.mo-order-detail');
            if (!detail) return null;
            if (detail.classList.contains('hidden')) {
                detail.classList.remove('hidden');
                card.classList.add('expanded');
                const toggleBtn = card.querySelector('[data-toggle-detail]');
                if (toggleBtn) {
                    toggleBtn.setAttribute('aria-expanded', 'true');
                    toggleBtn.textContent = 'Hide details';
                }
            }
            if (focusSection === 'refund') {
                const section = card.querySelector(`[data-refund-section="${CSS.escape(orderId)}"]`);
                if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return detail;
        }

        async function ensureCustomerRefundThread(orderId, card, { force = false } = {}) {
            if (!orderId) return;
            const store = getRefundThreadStore('customer');
            const targetCard = card || content.querySelector(`.mo-order-card[data-order-id="${CSS.escape(orderId)}"]`);
            if (!targetCard) return;
            const container = targetCard.querySelector(`[data-customer-refund-messages="${CSS.escape(orderId)}"]`);
            if (!container) return;
            const cache = store.get(orderId);
            if (!cache || force || cache.error) {
                container.innerHTML = '<p class="tiny muted">Loading conversation…</p>';
                try {
                    await loadRefundMessages(orderId, { scope: 'customer', force });
                } catch (err) {
                    container.innerHTML = `<p class="tiny alert">Unable to load conversation: ${err.message}</p>`;
                    console.warn('[refund-thread] customer load failed for', orderId, err);
                    return;
                }
            }
            renderRefundMessagesThread(orderId, { scope: 'customer', root: targetCard });
            container.scrollTop = container.scrollHeight;
        }

        async function submitCustomerRefundForm(form, rootNode) {
            const orderId = form.getAttribute('data-customer-refund-form');
            if (!orderId) return;
            const textarea = form.querySelector('textarea');
            const value = textarea ? textarea.value.trim() : '';
            if (!value) {
                if (textarea) textarea.focus();
                return;
            }
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;
            try {
                await postRefundMessage(orderId, value, { scope: 'customer' });
                if (textarea) textarea.value = '';
                notify('Message sent', 'success', 2200);
                await ensureCustomerRefundThread(orderId, rootNode || form.closest('.mo-order-card'), { force: true });
            } catch (err) {
                notify(err.message || 'Unable to send message', 'error');
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        }

        function showRefundSummaryModal() {
            const refundOrders = getRefundOrders();
            showModal(close => {
                const wrap = el('div', { class: 'modal refund-summary-modal' });
                wrap.appendChild(el('button', { class: 'modal-close', attrs: { type: 'button' } }, '×'));
                wrap.appendChild(el('h2', { class: 'refund-summary-title' }, 'Refund requests'));
                wrap.appendChild(el('p', { class: 'refund-summary-subtitle muted' }, 'Track every return or refund conversation in one place.'));
                if (!refundOrders.length) {
                    wrap.appendChild(
                        el('div', { class: 'refund-overview-empty' },
                            el('p', {}, 'No refund requests yet.'),
                            el('span', { class: 'tiny muted' }, 'Return an item from the Orders list to see it appear here.')
                        )
                    );
                } else {
                    const list = el('div', { class: 'refund-overview-list' }, refundOrders.map(buildRefundOverviewCard));
                    wrap.appendChild(list);
                }
                modalRoot.appendChild(wrap);
                const closeBtn = wrap.querySelector('.modal-close');
                if (closeBtn) closeBtn.addEventListener('click', close);
                wrap.querySelectorAll('[data-refund-overview-open]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const targetId = btn.getAttribute('data-refund-overview-open');
                        close();
                        showRefundConversationModal(targetId);
                    });
                });
            });
        }

        function showRefundConversationModal(orderId) {
            if (!orderId) return;
            const base = deriveMyOrders().find(order => String(order?.id) === String(orderId));
            const order = mergedOrder(base) || base;
            if (!order) {
                notify('We could not find that refund request.', 'warn');
                return;
            }
            const statusKey = getRefundStatus(order.returnAdminStatus);
            const statusLabel = formatRefundStatus(statusKey);
            const requestedCopy = order.returnRequestedAt ? formatDateTimeStamp(order.returnRequestedAt) : 'Awaiting submission';
            const lastUpdateCopy = order.returnAdminRespondedAt ? formatDateTimeStamp(order.returnAdminRespondedAt) : 'Awaiting response';
            const messageFieldId = `refund-modal-message-${order.id}`;
            const items = (order.items || []).map(enrichItem).filter(Boolean);
            showModal(close => {
                const wrap = el('div', { class: 'modal refund-convo-modal', attrs: { 'data-refund-convo': order.id } });
                wrap.appendChild(el('button', { class: 'modal-close', attrs: { type: 'button' } }, '×'));
                wrap.appendChild(el('div', { class: 'refund-convo-header' },
                    el('div', { class: 'refund-convo-heading' },
                        el('span', { class: 'tiny muted' }, 'Order'),
                        el('h3', {}, `#${String(order.id).slice(0, 12)}`)
                    ),
                    el('div', { class: 'refund-convo-status' },
                        el('span', { class: `admin-refund-status-chip status-${statusKey}` }, statusLabel),
                        el('div', { class: 'refund-convo-meta' },
                            el('span', {}, `Requested ${requestedCopy}`),
                            el('span', { class: 'tiny muted' }, `Last update ${lastUpdateCopy}`)
                        )
                    )
                ));
                wrap.appendChild(el('div', { class: 'refund-convo-products' },
                    items.length
                        ? items.map(item => el('div', { class: 'refund-convo-product' },
                            item.image ? el('img', { attrs: { src: item.image, alt: item.title || 'Product' } }) : el('span', { class: 'mo-thumb-placeholder refund-overview-thumb' }, item.title?.charAt(0) || '•'),
                            el('div', { class: 'refund-convo-product-info' },
                                el('span', { class: 'refund-convo-product-title' }, item.title || 'Item'),
                                el('span', { class: 'tiny muted' }, `Quantity: ${item.quantity || 1}`)
                            )
                        ))
                        : el('p', { class: 'tiny muted' }, 'Products will appear here once loaded.')
                ));
                wrap.appendChild(el('div', { class: 'refund-convo-reason' },
                    el('span', { class: 'tiny muted' }, 'Issue shared'),
                    el('p', {}, (order.returnReason || '').trim() || 'No reason provided.')
                ));
                const thread = el('div', { class: 'admin-refund-thread mo-refund-thread refund-convo-thread' },
                    el('div', {
                        class: 'admin-refund-thread-messages mo-refund-thread-messages',
                        attrs: { 'data-customer-refund-messages': order.id }
                    },
                        el('p', { class: 'tiny muted' }, 'Conversation loads shortly...')
                    ),
                    el('form', {
                        class: 'admin-refund-reply mo-refund-reply',
                        attrs: { 'data-customer-refund-form': order.id }
                    },
                        el('label', { class: 'tiny muted', attrs: { for: messageFieldId } }, 'Message the store team'),
                        el('textarea', {
                            class: 'mo-refund-textarea',
                            attrs: {
                                id: messageFieldId,
                                rows: '3',
                                maxlength: '2000',
                                placeholder: 'Ask for an update or share new info…',
                                required: 'true'
                            }
                        }),
                        el('div', { class: 'mo-refund-reply-actions' },
                            el('button', { class: 'mo-button mo-button--primary mo-button--compact', attrs: { type: 'submit' } }, 'Send message')
                        )
                    )
                );
                wrap.appendChild(thread);
                modalRoot.appendChild(wrap);
                const closeBtn = wrap.querySelector('.modal-close');
                if (closeBtn) closeBtn.addEventListener('click', close);
                ensureCustomerRefundThread(order.id, wrap);
                const form = wrap.querySelector('[data-customer-refund-form]');
                if (form) {
                    form.addEventListener('submit', evt => {
                        evt.preventDefault();
                        submitCustomerRefundForm(form, wrap);
                    });
                }
            });
        }

        async function hydrateOrders(list) {
            if (!Array.isArray(list) || !list.length) return;
            const missing = list.filter(o => o && !state.myOrdersDetailCache.has(o.id));
            for (const order of missing) {
                try {
                    const detail = await apiFetch(`/api/orders/${encodeURIComponent(order.id)}/track`);
                    state.myOrdersDetailCache.set(order.id, detail);
                } catch (err) {
                    console.warn('Failed to hydrate order', order?.id, err);
                }
            }
        }

        async function loadOrdersForSession(opts = {}) {
            const showLoader = opts.showLoader !== false;
            if (showLoader) {
                content.innerHTML = '';
                content.appendChild(el('div', { class: 'mo-loading' }, 'Loading orders...'));
            }

            const fetchOrders = async (legacy = false) => {
                if (!legacy) return apiFetch('/api/my-orders');
                if (!accountEmail) throw new Error('Email unavailable');
                return apiFetch(`/api/my-orders?email=${encodeURIComponent(accountEmail)}`, { suppressAuthNotify: true });
            };

            try {
                let data;
                try {
                    data = await fetchOrders(false);
                } catch (err) {
                    const msg = (err && err.message ? err.message : '').toLowerCase();
                    const canFallback = !opts.disableLegacyFallback && (msg.includes('email required') || msg.includes('missing email') || msg.includes('http 400'));
                    if (canFallback) {
                        try {
                            data = await fetchOrders(true);
                            console.warn('My Orders: falling back to legacy email-based API because backend did not accept session call.');
                        } catch (legacyErr) {
                            throw legacyErr;
                        }
                    } else {
                        throw err;
                    }
                }

                state.myOrders = Array.isArray(data?.orders) ? data.orders : [];
                state.myOrdersDetailCache.clear();
                state.customerRefundThreads = new Map();
                renderOrders();
                await hydrateOrders(state.myOrders);
                renderOrders();
            } catch (err) {
                notify('Load failed: ' + err.message, 'error');
                state.myOrders = [];
                renderOrders();
            }
        }

        tabButtons.forEach(btn => {
            if (btn.getAttribute('data-tab') === activeTab) {
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
            }
        });

        tabBar.addEventListener('click', evt => {
            const btn = evt.target.closest('[data-tab]');
            if (!btn) return;
            const key = btn.getAttribute('data-tab');
            if (key === activeTab) return;
            tabButtons.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            activeTab = key;
            renderOrders();
        });

        searchInput.addEventListener('input', () => {
            searchQuery = searchInput.value.trim();
            if (state.myOrdersFilter) state.myOrdersFilter.query = searchQuery;
            renderOrders();
        });

        const RETURN_REASON_CHOICES = [
            { value: 'Broken item', label: 'Broken item' },
            { value: 'Wrong item', label: 'Wrong item' },
            { value: 'Package was dropped', label: 'Package was dropped' },
            { value: 'Wrong price', label: 'Wrong price' },
            { value: 'Missing parts', label: 'Missing parts' },
            { value: 'Other', label: 'Other (please describe)' }
        ];

        function showReturnRequestModal(orderId, email) {
            showModal(close => {
                const wrap = el('div', { class: 'modal return-modal' });
                wrap.appendChild(el('button', { class: 'modal-close' }, '×'));
                wrap.appendChild(el('h2', {}, 'Return or Refund'));
                wrap.appendChild(el('p', { class: 'muted small' }, 'Pick the option that best describes the issue.'));
                const form = el('form', { class: 'return-form' });
                const list = el('div', { class: 'return-reason-list' });
                const otherWrap = el('div', { class: 'field return-other-field hidden' },
                    el('label', { attrs: { for: 'return-other-text' } }, 'Describe the issue'),
                    el('textarea', { attrs: { id: 'return-other-text', rows: '3', placeholder: 'Share a few details…' } })
                );
                RETURN_REASON_CHOICES.forEach((choice, idx) => {
                    const inputId = `return-reason-${idx}`;
                    const radio = el('input', { attrs: { type: 'radio', name: 'return-reason', value: choice.value, id: inputId, required: 'true' } });
                    const option = el('label', { class: 'return-option', attrs: { for: inputId } },
                        radio,
                        el('span', {}, choice.label)
                    );
                    list.appendChild(option);
                });
                form.appendChild(list);
                form.appendChild(otherWrap);
                const buttonRow = el('div', { class: 'modal-actions' },
                    el('button', { class: 'btn', attrs: { type: 'submit' } }, 'Submit request'),
                    el('button', { class: 'btn btn-outline', attrs: { type: 'button', id: 'return-cancel-btn' } }, 'Cancel')
                );
                form.appendChild(buttonRow);
                wrap.appendChild(form);
                modalRoot.appendChild(wrap);

                const closeBtn = wrap.querySelector('.modal-close');
                if (closeBtn) closeBtn.addEventListener('click', close);
                const otherText = otherWrap.querySelector('textarea');
                form.addEventListener('change', evt => {
                    if (evt.target && evt.target.name === 'return-reason') {
                        const val = evt.target.value;
                        const showOther = val === 'Other';
                        otherWrap.classList.toggle('hidden', !showOther);
                        if (showOther) {
                            setTimeout(() => otherText.focus(), 0);
                        } else {
                            otherText.value = '';
                        }
                    }
                });

                const submitBtn = buttonRow.querySelector('button[type="submit"]');
                const cancelBtn = buttonRow.querySelector('#return-cancel-btn');
                cancelBtn.addEventListener('click', close);

                form.addEventListener('submit', async evt => {
                    evt.preventDefault();
                    const selected = form.querySelector('input[name="return-reason"]:checked');
                    if (!selected) return;
                    let reason = selected.value;
                    if (reason === 'Other') {
                        const custom = otherText.value.trim();
                        if (!custom) {
                            otherText.focus();
                            return;
                        }
                        reason = 'Other: ' + custom;
                    }
                    submitBtn.disabled = true;
                    cancelBtn.disabled = true;
                    try {
                        await apiFetch('/api/orders/' + orderId + '/return-request', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email, reason })
                        });
                        notify('Return requested', 'success');
                        close();
                        await loadOrdersForSession();
                    } catch (err) {
                        notify(err.message, 'error');
                    } finally {
                        submitBtn.disabled = false;
                        cancelBtn.disabled = false;
                    }
                });
            });
        }

        content.addEventListener('click', async evt => {
            const toggleBtn = evt.target.closest('[data-toggle-detail]');
            if (toggleBtn) {
                const orderId = toggleBtn.getAttribute('data-toggle-detail');
                const card = toggleBtn.closest('.mo-order-card');
                if (!card) return;
                const detail = card.querySelector('.mo-order-detail');
                if (!detail) return;
                const nowHidden = detail.classList.toggle('hidden');
                card.classList.toggle('expanded', !nowHidden);
                toggleBtn.setAttribute('aria-expanded', nowHidden ? 'false' : 'true');
                toggleBtn.textContent = nowHidden ? 'View details' : 'Hide details';
                if (!nowHidden && card.getAttribute('data-has-refund') === '1') {
                    ensureCustomerRefundThread(orderId, card);
                }
                return;
            }
            const trackBtn = evt.target.closest('[data-track]');
            if (trackBtn) {
                const orderId = trackBtn.getAttribute('data-track');
                await showOrderTrackingModal(orderId);
                return;
            }
            const payBtn = evt.target.closest('[data-pay]');
            const compBtn = evt.target.closest('[data-complete]');
            const retBtn = evt.target.closest('[data-return]');
            if (!payBtn && !compBtn && !retBtn) return;
            const email = accountEmail;
            if (!email) {
                notify('Please sign in again to continue.', 'warn');
                return;
            }
            try {
                if (payBtn) {
                    await apiFetch('/api/orders/' + payBtn.getAttribute('data-pay') + '/pay-customer', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email })
                    });
                    notify('Payment recorded', 'success');
                } else if (compBtn) {
                    await apiFetch('/api/orders/' + compBtn.getAttribute('data-complete') + '/complete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email })
                    });
                    notify('Order marked as received', 'success');
                } else if (retBtn) {
                    showReturnRequestModal(retBtn.getAttribute('data-return'), email);
                    return;
                }
                await loadOrdersForSession();
            } catch (err) {
                notify(err.message, 'error');
            }
        });

        content.addEventListener('submit', evt => {
            const form = evt.target.closest('[data-customer-refund-form]');
            if (!form) return;
            evt.preventDefault();
            submitCustomerRefundForm(form, form.closest('.mo-order-card'));
        });

        ensureProductsLoaded();
        if (state.myOrders && state.myOrders.length) {
            renderOrders();
            hydrateOrders(state.myOrders).then(() => renderOrders());
        }
        loadOrdersForSession({ showLoader: !(state.myOrders && state.myOrders.length) });
    }

    /* ----------------------------
     * Admin
     * ---------------------------- */

    function renderAdmin() {
        if (!state.admin.token || !state.admin.user) {
            clearAdminAuth(false);
            navigate('home');
            showAdminLoginModal();
            return;
        }
        rootEl.innerHTML = '';
        const sectionDefs = [
            { key: 'products', label: 'Products' },
            { key: 'orders', label: 'Orders' },
            { key: 'refunds', label: 'Refunds' },
            { key: 'reviews', label: 'Reviews Moderation' },
            { key: 'discounts', label: 'Discounts' },
            { key: 'low-stock', label: 'Low Stock' },
            { key: 'export', label: 'Export / Import' }
        ];
        if (!sectionDefs.some(def => def.key === state.admin.activePanel)) {
            state.admin.activePanel = 'products';
        }

        const panel = el('section', { class: 'panel' },
            el('div', { class: 'panel-header' },
                el('span', {}, 'Admin Panel'),
                el('div', { class: 'inline-fields admin-panel-head' },
                    el('span', { class: 'admin-email tiny muted' }, state.admin.user.email || 'Admin'),
                    el('button', { class: 'btn btn-small btn-outline', attrs: { id: 'admin-panel-signout' } }, 'Sign Out'),
                    el('button', { class: 'btn btn-small', attrs: { id: 'new-product' } }, 'New Product')
                )
            )
        );

        const filterBar = el('div', { class: 'admin-section-filter mt-sm', attrs: { role: 'tablist', 'aria-label': 'Admin sections' } });
        const sectionButtons = [];
        const sectionRefs = new Map();

        function syncAdminSectionFilter() {
            const fallback = sectionDefs[0]?.key || 'products';
            const activeKey = sectionDefs.some(def => def.key === state.admin.activePanel) ? state.admin.activePanel : fallback;
            state.admin.activePanel = activeKey;
            sectionButtons.forEach(btn => {
                const match = btn.getAttribute('data-section') === activeKey;
                btn.classList.toggle('active', match);
                btn.setAttribute('aria-pressed', match ? 'true' : 'false');
            });
            sectionRefs.forEach((node, key) => {
                if (!node) return;
                if (key === activeKey) node.classList.remove('hidden');
                else node.classList.add('hidden');
            });
        }

        sectionDefs.forEach(({ key, label }) => {
            const btn = el('button', {
                class: 'admin-section-btn',
                attrs: { type: 'button', 'data-section': key }
            }, label);
            btn.addEventListener('click', () => {
                if (state.admin.activePanel !== key) {
                    state.admin.activePanel = key;
                    syncAdminSectionFilter();
                }
            });
            filterBar.appendChild(btn);
            sectionButtons.push(btn);
        });
        panel.appendChild(filterBar);
        rootEl.appendChild(panel);
        syncAdminSectionFilter();

        const newBtn = panel.querySelector('#new-product');
        if (newBtn) {
            newBtn.addEventListener('click', () => showProductModal());
        }
        const signOutBtn = panel.querySelector('#admin-panel-signout');
        if (signOutBtn) {
            signOutBtn.addEventListener('click', () => {
                clearAdminAuth(true);
            });
        }
        const prodWrap = el('div', { class: 'panel mt-md', attrs: { 'data-admin-section': 'products' } },
            el('div', { class: 'panel-header' },
                el('span', {}, 'Products'),
                el('div', { class: 'inline-fields', attrs: { style: 'gap:.5rem;align-items:center;' } },
                    el('button', { class: 'btn btn-small btn-danger', attrs: { id: 'bulk-delete-btn', disabled: 'true' } }, 'Delete Selected'),
                    el('div', { class: 'flex gap-xs align-center', attrs: { style: 'font-size:.75rem;margin-left:.5rem;gap:.4rem;' } },
                        el('label', { class: 'flex gap-xs align-center', attrs: { for: 'toggle-show-deleted', style: 'gap:.3rem;cursor:pointer;' } },
                            el('input', { attrs: { type: 'checkbox', id: 'toggle-show-deleted' } }),
                            el('span', {}, 'Show Deleted')
                        ),
                        el('button', { class: 'btn btn-small btn-danger', attrs: { id: 'bulk-purge-btn', style: 'display:none;', disabled: 'true' } }, 'Delete Selected')
                    )
                )
            ),
            el('div', { class: 'admin-table-wrapper' }, el('table', { class: 'admin-table', attrs: { id: 'admin-products-table' } }))
        );
        rootEl.appendChild(prodWrap);
        sectionRefs.set('products', prodWrap);
        // Wire show deleted toggle (soft-deleted products)
        const showDeletedCb = prodWrap.querySelector('#toggle-show-deleted');
        if (showDeletedCb) {
            showDeletedCb.checked = !!state.admin.showDeleted;
            if (!showDeletedCb._wired) {
                showDeletedCb._wired = true;
                showDeletedCb.addEventListener('change', async () => {
                    state.admin.showDeleted = showDeletedCb.checked;
                    localStorage.setItem('adminShowDeleted', state.admin.showDeleted ? '1' : '0');
                    await refreshAdminData();
                    notify(showDeletedCb.checked ? 'Showing deleted products' : 'Hiding deleted products', 'info', 2500);
                });
            }
        }

        const ordersWrap = el('div', { class: 'panel admin-orders-panel mt-md', attrs: { 'data-admin-section': 'orders' } },
            el('div', { class: 'panel-header admin-orders-header' },
                el('div', { class: 'flex flex-col gap-xxs' },
                    el('span', { class: 'pv-eyebrow tiny muted' }, 'Operations'),
                    el('span', { class: 'admin-orders-title' }, 'Orders overview')
                ),
                el('div', { class: 'inline-fields' },
                    el('button', { class: 'btn btn-small btn-outline', attrs: { id: 'orders-refresh-btn' } }, 'Refresh')
                )
            ),
            el('div', { class: 'admin-orders-summary', attrs: { id: 'admin-orders-summary' } }),
            el('div', { class: 'admin-orders-board', attrs: { id: 'admin-orders-table' } })
        );
        rootEl.appendChild(ordersWrap);
        sectionRefs.set('orders', ordersWrap);

        const refundsPanel = el('div', { class: 'panel admin-refunds-panel mt-md', attrs: { 'data-admin-section': 'refunds' } },
            el('div', { class: 'panel-header admin-refunds-header' },
                el('div', { class: 'flex flex-col gap-xxs' },
                    el('span', { class: 'pv-eyebrow tiny muted' }, 'Support'),
                    el('span', { class: 'admin-refunds-title' }, 'Refund requests')
                ),
                el('div', { class: 'inline-fields' },
                    el('button', { class: 'btn btn-small btn-outline', attrs: { id: 'refunds-refresh-btn' } }, 'Refresh')
                )
            ),
            el('div', { class: 'admin-refunds-summary', attrs: { id: 'admin-refunds-summary' } }),
            el('div', { class: 'admin-refunds-list', attrs: { id: 'admin-refunds-list' } })
        );
        rootEl.appendChild(refundsPanel);
        sectionRefs.set('refunds', refundsPanel);

        const reviewsPanel = el('div', { class: 'panel mt-md', attrs: { 'data-admin-section': 'reviews' } },
            el('div', { class: 'panel-header' },
                el('span', {}, 'Reviews Moderation'),
                el('div', { class: 'inline-fields' },
                    el('select', { attrs: { id: 'admin-review-filter' } },
                        el('option', { attrs: { value: 'pending' } }, 'Pending'),
                        el('option', { attrs: { value: 'approved' } }, 'Approved'),
                        el('option', { attrs: { value: 'rejected' } }, 'Rejected')
                    ),
                    el('button', { class: 'btn btn-small btn-outline', attrs: { id: 'admin-reviews-refresh' } }, 'Refresh')
                )
            ),
            el('div', { class: 'admin-table-wrapper' }, el('table', { class: 'admin-table', attrs: { id: 'admin-reviews-table' } }))
        );
        rootEl.appendChild(reviewsPanel);
        sectionRefs.set('reviews', reviewsPanel);

        const reviewFilter = reviewsPanel.querySelector('#admin-review-filter');
        if (reviewFilter) {
            reviewFilter.value = state.admin.reviews.status || 'pending';
            if (!reviewFilter._wired) {
                reviewFilter._wired = true;
                reviewFilter.addEventListener('change', async () => {
                    state.admin.reviews.status = reviewFilter.value;
                    await loadAdminReviews(reviewFilter.value);
                    refreshAdminReviewsTable();
                });
            }
        }
        const reviewRefreshBtn = reviewsPanel.querySelector('#admin-reviews-refresh');
        if (reviewRefreshBtn && !reviewRefreshBtn._wired) {
            reviewRefreshBtn._wired = true;
            reviewRefreshBtn.addEventListener('click', async () => {
                await loadAdminReviews(state.admin.reviews.status || 'pending');
                refreshAdminReviewsTable();
                notify('Review queue refreshed', 'info', 2000);
            });
        }

        const discountPanel = el('div', { class: 'panel mt-md', attrs: { 'data-admin-section': 'discounts' } },
            el('div', { class: 'panel-header' }, el('span', {}, 'Discounts'), el('div', { class: 'inline-fields' }, el('button', { class: 'btn btn-small btn-outline', attrs: { id: 'new-discount-btn' } }, 'New'))),
            el('div', { class: 'admin-table-wrapper' }, el('table', { class: 'admin-table', attrs: { id: 'admin-discounts-table' } }))
        );
        rootEl.appendChild(discountPanel);
        sectionRefs.set('discounts', discountPanel);

        const lowStockPanel = el('div', { class: 'panel mt-md', attrs: { 'data-admin-section': 'low-stock' } },
            el('div', { class: 'panel-header' }, el('span', {}, 'Low Stock'), el('div', { class: 'inline-fields' }, el('input', { attrs: { id: 'low-stock-threshold', type: 'number', value: '5', min: '1', style: 'width:4rem;' } }), el('button', { class: 'btn btn-small', attrs: { id: 'low-stock-refresh' } }, 'Refresh'))),
            el('div', { class: 'admin-table-wrapper' }, el('table', { class: 'admin-table', attrs: { id: 'low-stock-table' } }))
        );
        rootEl.appendChild(lowStockPanel);
        sectionRefs.set('low-stock', lowStockPanel);
        const exportPanel = el('div', { class: 'panel mt-md', attrs: { 'data-admin-section': 'export' } },
            el('div', { class: 'panel-header' }, el('span', {}, 'Export / Import')),
            el('div', { class: 'flex flex-col gap-sm p-sm' },
                el('div', {}, el('a', { attrs: { href: '/api/export/products.csv', target: '_blank' } }, 'Download Products CSV'), ' | ', el('a', { attrs: { href: '/api/export/orders.csv', target: '_blank' } }, 'Download Orders CSV')),
                el('form', { attrs: { id: 'import-products-form', enctype: 'multipart/form-data' }, class: 'flex gap-sm align-center' },
                    el('input', { attrs: { type: 'file', id: 'import-products-file', accept: '.csv' } }),
                    el('button', { class: 'btn btn-small', attrs: { type: 'submit' } }, 'Import Products CSV')
                ),
                el('div', { class: 'muted small' }, 'Import CSV columns required: title,description,priceCents,baseInventory,images (| separated),tags (| separated)')
            )
        );
        rootEl.appendChild(exportPanel);
        sectionRefs.set('export', exportPanel);

        syncAdminSectionFilter();

        // Initial data load (products + orders) then tables
        (async () => { await refreshAdminData(); })();
    }

    // (Re)build product & orders tables (discount & low stock handled separately)
    function refreshAdminTables() {
        // Products table
        const pt = document.getElementById('admin-products-table');
        const buildProductActionsCell = (product, deletedView) => {
            const editBtn = el('button', { class: 'btn btn-compact btn-outline', attrs: { 'data-edit': product.id } }, 'Edit');
            const stackClass = deletedView ? 'admin-actions-stack admin-actions-stack--restore' : 'admin-actions-stack';
            const actions = [editBtn];
            if (deletedView) {
                actions.push(
                    el('button', { class: 'btn btn-compact btn-success', attrs: { 'data-restore': product.id } }, 'Restore'),
                    el('button', { class: 'btn btn-compact btn-danger', attrs: { 'data-destroy': product.id } }, 'Delete Forever')
                );
            } else {
                actions.push(el('button', { class: 'btn btn-compact btn-danger', attrs: { 'data-del': product.id } }, 'Delete'));
            }
            return el('td', { class: 'admin-actions-cell' },
                el('div', { class: stackClass }, ...actions)
            );
        };
        if (pt) {
            pt.innerHTML = `
                <thead>
                    <tr>
                        <th><input type="checkbox" id="select-all-products" /></th>
                        <th>Title</th>
                        <th>Price</th>
                        <th>Inv</th>
                        <th>Updated</th>
                        <th>Tags</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;
            const tbody = pt.querySelector('tbody');
            const showDeletedMode = !!state.admin.showDeleted;
            for (const p of state.products) {
                // When showDeletedMode is true, show only deleted products (history). Otherwise only active.
                if (showDeletedMode) { if (!p.deletedAt) continue; } else { if (p.deletedAt) continue; }
                const tr = el('tr', {},
                    el('td', {}, el('input', { attrs: { type: 'checkbox', 'data-select-id': p.id } })),
                    el('td', {}, p.title, (p.deletedAt ? [' ', el('span', { class: 'tag', attrs: { style: 'background:#722;' } }, 'deleted')] : [])),
                    el('td', {}, money(p.priceCents)),
                    el('td', {}, String(productStock(p))),
                    el('td', {}, new Date(p.updatedAt).toLocaleString()),
                    el('td', {}, p.tags.join(', ')),
                    buildProductActionsCell(p, showDeletedMode)
                );
                if (p.deletedAt) tr.style.opacity = showDeletedMode ? '' : '0.55';
                tbody.appendChild(tr);
            }
            const bulkBtn = document.getElementById('bulk-delete-btn');
            const purgeBtn = document.getElementById('bulk-purge-btn');
            const getTableBody = () => pt.querySelector('tbody');
            const getRowCheckboxes = () => Array.from(getTableBody()?.querySelectorAll('input[data-select-id]') || []);
            function updateSelectionButtons() {
                const selected = getRowCheckboxes().filter(cb => cb.checked).length;
                const label = selected > 0 ? `Delete Selected (${selected})` : 'Delete Selected';
                if (bulkBtn) {
                    bulkBtn.textContent = label;
                    if (!state.admin.showDeleted && selected > 0) bulkBtn.removeAttribute('disabled'); else bulkBtn.setAttribute('disabled', 'true');
                }
                if (purgeBtn) {
                    purgeBtn.textContent = label;
                    if (state.admin.showDeleted && selected > 0) purgeBtn.removeAttribute('disabled'); else purgeBtn.setAttribute('disabled', 'true');
                }
            }
            // Toggle button visibility depending on view mode
            if (bulkBtn) bulkBtn.style.display = state.admin.showDeleted ? 'none' : '';
            if (purgeBtn) purgeBtn.style.display = state.admin.showDeleted ? '' : 'none';
            if (!pt._wired) {
                pt._wired = true;
                pt.addEventListener('change', (e) => {
                    if (e.target.id === 'select-all-products') {
                        const checked = e.target.checked;
                        getRowCheckboxes().forEach(cb => cb.checked = checked);
                        updateSelectionButtons();
                    } else if (e.target.hasAttribute('data-select-id')) { updateSelectionButtons(); }
                });
                if (bulkBtn && !bulkBtn._bulkSoftWired) {
                    bulkBtn._bulkSoftWired = true;
                    bulkBtn.addEventListener('click', async () => {
                        const ids = getRowCheckboxes().filter(cb => cb.checked).map(cb => cb.getAttribute('data-select-id'));
                        if (!ids.length) return; if (!confirm(`Delete ${ids.length} product(s)?`)) return;
                        const now = new Date().toISOString();
                        const previous = ids.map(id => ({ id, prev: state.productsById.get(id)?.deletedAt || null }));
                        // Optimistic: mark deleted & re-render immediately
                        ids.forEach(id => { const p = state.productsById.get(id); if (p) p.deletedAt = now; });
                        // Store snapshots in deletedBuffer
                        ids.forEach(id => { const p = state.productsById.get(id); if (p) state.deletedBuffer.set(id, { ...p }); });
                        refreshAdminTables();
                        // Immediately refresh shop views so items disappear there too
                        if (['home', 'catalog'].includes(state.currentRoute)) {
                            if (state.currentRoute === 'home') renderHome(); else if (state.currentRoute === 'catalog') renderCatalog();
                            sanitizeCart();
                        }
                        try {
                            await bulkDeleteProducts(ids);
                            notify('Deleted ' + ids.length + ' products', 'success', 6000, {
                                actionText: 'Undo',
                                onAction: async () => {
                                    try { await bulkRestoreProducts(ids); ids.forEach(id => { const p = state.productsById.get(id); if (p) p.deletedAt = null; }); refreshAdminTables(); notify('Restored ' + ids.length, 'success'); await refreshAdminData(); }
                                    catch (e) { notify('Restore failed: ' + e.message, 'error'); }
                                }
                            });
                            refreshAdminData(); // background sync
                        } catch (err) {
                            // Revert optimistic change
                            previous.forEach(({ id, prev }) => { const p = state.productsById.get(id); if (p) p.deletedAt = prev; });
                            refreshAdminTables();
                            notify('Bulk delete failed: ' + err.message, 'error');
                        }
                    });
                }
                if (purgeBtn && !purgeBtn._bulkPurgeWired) {
                    purgeBtn._bulkPurgeWired = true;
                    purgeBtn.addEventListener('click', async () => {
                        const ids = getRowCheckboxes().filter(cb => cb.checked).map(cb => cb.getAttribute('data-select-id'));
                        if (!ids.length) return;
                        if (!confirm(`Permanently delete ${ids.length} product(s)? This cannot be undone.`)) return;
                        const originalText = purgeBtn.textContent;
                        purgeBtn.textContent = 'Deleting…';
                        purgeBtn.setAttribute('disabled', 'true');
                        const productsArray = Array.isArray(state.products) ? state.products : null;
                        const snapshots = new Map();
                        ids.forEach(id => {
                            const product = state.productsById.get(id) || state.deletedBuffer.get(id);
                            const index = productsArray ? productsArray.findIndex(p => p.id === id) : -1;
                            if (product) snapshots.set(id, { product: { ...product }, index });
                            if (productsArray && index >= 0) {
                                productsArray.splice(index, 1);
                            }
                            state.productsById.delete(id);
                            state.deletedBuffer.delete(id);
                        });
                        refreshAdminTables();
                        const restoreSnapshot = (id) => {
                            const snap = snapshots.get(id);
                            if (!snap) return;
                            const { product, index } = snap;
                            if (productsArray) {
                                const insertIdx = index >= 0 && index <= productsArray.length ? index : productsArray.length;
                                productsArray.splice(insertIdx, 0, product);
                            } else if (Array.isArray(state.products)) {
                                state.products.push(product);
                            } else {
                                state.products = [product];
                            }
                            state.productsById.set(id, product);
                            if (product.deletedAt) state.deletedBuffer.set(id, { ...product });
                        };
                        const sequentialFallback = async (targetIds) => {
                            const success = [];
                            const failed = [];
                            const failureMessages = [];
                            let missingRouteOnly = true;
                            for (const id of targetIds) {
                                try {
                                    await destroyProduct(id);
                                    success.push(id);
                                } catch (err) {
                                    const msg = err?.message || '';
                                    const isMissingRoute = err?.status === 404 && !/not found/i.test(msg);
                                    if (/not found/i.test(msg)) {
                                        success.push(id); // already gone server-side
                                    } else {
                                        failed.push(id);
                                        failureMessages.push(msg || 'Unknown error');
                                        if (!isMissingRoute) missingRouteOnly = false;
                                    }
                                }
                            }
                            if (failed.length === targetIds.length) {
                                const error = new Error(missingRouteOnly ? 'Server missing permanent delete endpoint. Restart backend to load latest routes.' : `Unable to permanently delete selected products (${failureMessages[0] || 'see console'})`);
                                if (missingRouteOnly) error.code = 'missing-perma-endpoint';
                                throw error;
                            }
                            return { ids: success, skipped: failed };
                        };
                        try {
                            let result;
                            let fallbackUsed = false;
                            try {
                                result = await bulkDestroyProducts(ids);
                            } catch (err) {
                                const isMissing = err?.status === 404 || /404/.test(err?.message || '');
                                if (isMissing) {
                                    fallbackUsed = true;
                                    result = await sequentialFallback(ids);
                                } else {
                                    throw err;
                                }
                            }
                            const deletedIds = new Set(result?.ids || []);
                            const skipped = Array.isArray(result?.skipped) ? result.skipped.filter(Boolean) : [];
                            if (skipped.length) {
                                skipped.forEach(restoreSnapshot);
                                refreshAdminTables();
                                notify(`Permanently deleted ${deletedIds.size} product(s). ${skipped.length} could not be purged.`, 'warn', 6000);
                            } else {
                                const count = deletedIds.size;
                                notify('Permanently removed ' + count + ' product' + (count === 1 ? '' : 's'), 'success', 5000);
                            }
                            if (fallbackUsed) {
                                notify('Bulk purge endpoint unavailable on server. Used per-item deletes instead. Restart backend (e.g., $env:ADMIN_TOKEN="changeme"; .\\node-portable\\node.exe .\\server.js) to enable the faster route.', 'info', 8000);
                            }
                            await refreshAdminData();
                        } catch (err) {
                            ids.forEach(restoreSnapshot);
                            refreshAdminTables();
                            if (err?.code === 'missing-perma-endpoint') {
                                notify('Permanent delete endpoints are missing on the server. Restart it with the latest code (e.g., $env:ADMIN_TOKEN="changeme"; .\\node-portable\\node.exe .\\server.js).', 'error', 8000);
                            } else {
                                notify('Permanent delete failed: ' + err.message, 'error');
                            }
                        } finally {
                            purgeBtn.textContent = originalText;
                            purgeBtn.removeAttribute('disabled');
                            updateSelectionButtons();
                        }
                    });
                }
                pt.addEventListener('click', async (e) => {
                    const btnEdit = e.target.closest('[data-edit]');
                    const btnDel = e.target.closest('[data-del]');
                    const btnRestore = e.target.closest('[data-restore]');
                    const btnDestroy = e.target.closest('[data-destroy]');
                    if (btnEdit) { showProductModal(state.productsById.get(btnEdit.getAttribute('data-edit'))); }
                    else if (btnDel) {
                        const id = btnDel.getAttribute('data-del');
                        if (confirm('Delete product?')) {
                            const prod = state.productsById.get(id);
                            const prevDeleted = prod ? prod.deletedAt : null;
                            if (prod) { prod.deletedAt = new Date().toISOString(); refreshAdminTables(); }
                            // Update shop immediately
                            if (['home', 'catalog'].includes(state.currentRoute)) {
                                if (state.currentRoute === 'home') renderHome(); else if (state.currentRoute === 'catalog') renderCatalog();
                                sanitizeCart();
                            }
                            try {
                                await deleteProduct(id);
                                if (prod) state.deletedBuffer.set(id, { ...prod });
                                notify('Deleted product', 'success', 6000, {
                                    actionText: 'Undo',
                                    onAction: async () => {
                                        try { await restoreProduct(id); const p2 = state.productsById.get(id); if (p2) p2.deletedAt = null; refreshAdminTables(); notify('Restored', 'success'); await refreshAdminData(); }
                                        catch (e2) { notify('Restore failed: ' + e2.message, 'error'); }
                                    }
                                });
                                refreshAdminData();
                            } catch (err) {
                                // revert
                                if (prod) { prod.deletedAt = prevDeleted; refreshAdminTables(); }
                                notify(err.message, 'error');
                                state.deletedBuffer.delete(id);
                                if (['home', 'catalog'].includes(state.currentRoute)) {
                                    if (state.currentRoute === 'home') renderHome(); else if (state.currentRoute === 'catalog') renderCatalog();
                                }
                            }
                        }
                    } else if (btnRestore) {
                        const id = btnRestore.getAttribute('data-restore');
                        const prod = state.productsById.get(id);
                        const prevDeleted = prod ? prod.deletedAt : null;
                        if (prod) prod.deletedAt = null; // optimistic restore
                        state.deletedBuffer.delete(id);
                        refreshAdminTables();
                        if (['home', 'catalog'].includes(state.currentRoute)) {
                            if (state.currentRoute === 'home') renderHome(); else if (state.currentRoute === 'catalog') renderCatalog();
                        }
                        try {
                            await restoreProduct(id);
                            notify('Restored product', 'success');
                            refreshAdminData();
                        } catch (err) {
                            if (prod) prod.deletedAt = prevDeleted; // revert
                            refreshAdminTables();
                            notify('Restore failed: ' + err.message, 'error');
                            if (prod && prod.deletedAt) state.deletedBuffer.set(id, { ...prod });
                            if (['home', 'catalog'].includes(state.currentRoute)) {
                                if (state.currentRoute === 'home') renderHome(); else if (state.currentRoute === 'catalog') renderCatalog();
                            }
                        }
                    } else if (btnDestroy) {
                        const id = btnDestroy.getAttribute('data-destroy');
                        if (!id) return;
                        if (!confirm('Permanently delete this product? This cannot be undone.')) return;
                        const productsArray = Array.isArray(state.products) ? state.products : null;
                        const prod = state.productsById.get(id);
                        const index = productsArray ? productsArray.findIndex(p => p.id === id) : -1;
                        const snapshot = prod ? { ...prod } : null;
                        if (productsArray && index >= 0) {
                            productsArray.splice(index, 1);
                        }
                        if (state.productsById?.delete) state.productsById.delete(id);
                        state.deletedBuffer.delete(id);
                        refreshAdminTables();
                        try {
                            await destroyProduct(id);
                            notify('Product permanently removed', 'success', 3500);
                            await refreshAdminData();
                        } catch (err) {
                            if (snapshot) {
                                if (productsArray) {
                                    const reinsertionIndex = index >= 0 ? index : productsArray.length;
                                    productsArray.splice(reinsertionIndex, 0, snapshot);
                                } else if (!Array.isArray(state.products)) {
                                    state.products = [snapshot];
                                }
                                if (state.productsById?.set) state.productsById.set(id, snapshot);
                                if (snapshot.deletedAt) state.deletedBuffer.set(id, { ...snapshot });
                            }
                            refreshAdminTables();
                            notify('Permanent delete failed: ' + err.message, 'error');
                        }
                    }
                });
            } else { updateSelectionButtons(); }
        }
        // When viewing deleted products, also inject any pending buffered deletions that might not be in state.products (rare race)
        if (state.admin.showDeleted) {
            const pt2 = document.getElementById('admin-products-table');
            const idsAlready = new Set(Array.from(pt2.querySelectorAll('tbody tr td:nth-child(2)')).map(td => td.textContent.trim()));
            state.deletedBuffer.forEach(bufProd => {
                // If product already listed or actually restored, skip
                if (!bufProd.deletedAt) return;
                if (Array.from(state.productsById.values()).some(p => p.id === bufProd.id && p.deletedAt)) return;
                if (idsAlready.has(bufProd.title)) return;
                const tbody = pt2.querySelector('tbody');
                if (!tbody) return;
                const tr = el('tr', {},
                    el('td', {}, el('input', { attrs: { type: 'checkbox', 'data-select-id': bufProd.id } })),
                    el('td', {}, bufProd.title, [' ', el('span', { class: 'tag', attrs: { style: 'background:#722;' } }, 'deleted (pending)')]),
                    el('td', {}, money(bufProd.priceCents)),
                    el('td', {}, String(productStock(bufProd))),
                    el('td', {}, new Date(bufProd.updatedAt).toLocaleString()),
                    el('td', {}, (bufProd.tags || []).join(', ')),
                    buildProductActionsCell(bufProd, true)
                );
                tbody.appendChild(tr);
            });
        }
        const ordersSummaryEl = document.getElementById('admin-orders-summary');
        const ot = document.getElementById('admin-orders-table');
        const orders = getAdminOrders();
        if (!state.admin.ordersFilter) state.admin.ordersFilter = 'all';
        const activeFilter = state.admin.ordersFilter;
        const productMap = state.productsById instanceof Map ? state.productsById : new Map();
        const lookupProduct = (id) => {
            if (id == null) return null;
            if (productMap.has(id)) return productMap.get(id);
            const str = String(id);
            if (productMap.has(str)) return productMap.get(str);
            const num = Number(id);
            if (!Number.isNaN(num) && productMap.has(num)) return productMap.get(num);
            return null;
        };
        const resolveItemImage = (item) => {
            if (!item) return productPlaceholder(360);
            const candidate = item.image || item.thumbnail || (Array.isArray(item.images) && item.images[0]) || item.imageUrl;
            if (candidate) return candidate;
            const product = lookupProduct(item.productId);
            const productImages = product?.images;
            if (Array.isArray(productImages) && productImages[0]) return productImages[0];
            if (typeof productImages === 'string') return productImages;
            return productPlaceholder(360);
        };

        if (ordersSummaryEl) {
            const stats = {};
            let revenueCents = 0;
            for (const order of orders) {
                const key = (order.status || 'created').toLowerCase();
                stats[key] = (stats[key] || 0) + 1;
                revenueCents += order.totalCents || 0;
            }
            const summaryData = [
                { label: 'Total orders', value: orders.length, key: 'all', interactive: true },
                { label: 'Awaiting payment', value: stats.created || 0, key: 'created', interactive: true },
                { label: 'Paid', value: stats.paid || 0, key: 'paid', interactive: true },
                { label: 'Fulfilled', value: stats.fulfilled || 0, key: 'fulfilled', interactive: true },
                { label: 'Shipped', value: stats.shipped || 0, key: 'shipped', interactive: true },
                { label: 'Delivered', value: stats.completed || 0, key: 'completed', interactive: true },
                { label: 'Cancelled', value: stats.cancelled || 0, key: 'cancelled', interactive: true },
                { label: 'Revenue', value: money(revenueCents), key: 'revenue', interactive: false }
            ];
            ordersSummaryEl.innerHTML = '';
            summaryData.forEach(stat => {
                const isActive = stat.key === activeFilter;
                const attrs = { type: 'button' };
                if (stat.interactive) {
                    attrs['data-order-filter'] = stat.key;
                    attrs['aria-pressed'] = isActive ? 'true' : 'false';
                } else {
                    attrs.disabled = 'true';
                }
                ordersSummaryEl.appendChild(
                    el('button', { class: 'admin-orders-summary-card' + (isActive && stat.interactive ? ' active' : ''), attrs },
                        el('span', { class: 'admin-orders-summary-label tiny muted' }, stat.label),
                        el('span', { class: 'admin-orders-summary-value' }, stat.value)
                    )
                );
            });
            if (!ordersSummaryEl._wired) {
                ordersSummaryEl._wired = true;
                ordersSummaryEl.addEventListener('click', (e) => {
                    const btn = e.target.closest('[data-order-filter]');
                    if (!btn) return;
                    const nextFilter = btn.getAttribute('data-order-filter') || 'all';
                    if (state.admin.ordersFilter === nextFilter) return;
                    state.admin.ordersFilter = nextFilter;
                    refreshAdminTables();
                });
            }
        }

        if (ot) {
            const buildItemCard = (item) => {
                const product = lookupProduct(item?.productId);
                const title = item?.titleSnapshot || product?.title || 'Product';
                const qty = item?.quantity || 1;
                const unitPrice = item?.unitPriceCents != null ? item.unitPriceCents : (product?.priceCents || 0);
                const imgSrc = resolveItemImage(item);
                return el('div', { class: 'admin-order-item' },
                    el('div', { class: 'admin-order-item-thumb' },
                        el('img', { attrs: { src: imgSrc, alt: title } })
                    ),
                    el('div', { class: 'admin-order-item-info' },
                        el('span', { class: 'admin-order-item-title' }, title),
                        el('span', { class: 'admin-order-item-meta tiny muted' }, `${qty}× ${money(unitPrice, { showBase: false })}`)
                    )
                );
            };

            const filteredOrders = activeFilter === 'all'
                ? orders
                : orders.filter(o => (o.status || 'created').toLowerCase() === activeFilter);
            ot.innerHTML = '';
            if (!filteredOrders.length) {
                const labelMap = {
                    created: 'awaiting payment',
                    paid: 'paid',
                    fulfilled: 'fulfilled',
                    shipped: 'shipped',
                    completed: 'delivered',
                    cancelled: 'cancelled'
                };
                const activeLabel = activeFilter === 'all' ? 'orders' : `${labelMap[activeFilter] || activeFilter} orders`;
                const emptyMsg = activeFilter === 'all'
                    ? 'No orders yet. Your latest orders will appear here.'
                    : `No ${activeLabel} right now.`;
                ot.appendChild(el('div', { class: 'admin-orders-empty muted' }, emptyMsg));
            } else {
                const frag = document.createDocumentFragment();
                filteredOrders.forEach(o => {
                    const items = Array.isArray(o.items) ? o.items : [];
                    const itemsGallery = el('div', { class: 'admin-order-items-grid' },
                        ...(items.length ? items.map(i => buildItemCard(i)) : [
                            el('div', { class: 'admin-order-item admin-order-item--empty muted tiny' }, 'Line items will appear once available.')
                        ])
                    );
                    const tsParts = [];
                    if (o.paidAt) tsParts.push('Paid ' + new Date(o.paidAt).toLocaleString());
                    if (o.fulfilledAt) tsParts.push('Fulfilled ' + new Date(o.fulfilledAt).toLocaleString());
                    if (o.shippedAt) tsParts.push('Shipped ' + new Date(o.shippedAt).toLocaleString());
                    if (o.completedAt) tsParts.push('Delivered ' + new Date(o.completedAt).toLocaleString());
                    if (o.cancelledAt) tsParts.push('Cancelled ' + new Date(o.cancelledAt).toLocaleString());
                    const codesLabel = [o.discountCode, o.shippingCode].filter(Boolean).join(' · ');

                    const metaCard = (label, value) => el('div', { class: 'admin-order-meta-card' },
                        el('span', { class: 'tiny muted' }, label),
                        el('span', { class: 'admin-order-meta-value' }, value)
                    );

                    const metaGrid = el('div', { class: 'admin-order-meta-grid' },
                        metaCard('Total', money(o.totalCents)),
                        metaCard('Subtotal', money(o.subtotalCents)),
                        metaCard('Shipping', money(o.shippingCents || 0)),
                        metaCard('Discounts', (o.discountCents || o.shippingDiscountCents)
                            ? '-' + money((o.discountCents || 0) + (o.shippingDiscountCents || 0))
                            : '—'),
                        metaCard('Codes', codesLabel || '—'),
                        metaCard('Updated', tsParts[0] || new Date(o.createdAt).toLocaleString())
                    );

                    const orderIdString = o.id || '';
                    const copyIcon = () => el('svg', {
                        class: 'admin-order-copy-icon',
                        attrs: {
                            viewBox: '0 0 24 24',
                            role: 'img',
                            'aria-label': 'Copy order ID'
                        }
                    },
                        el('path', {
                            attrs: {
                                d: 'M9 8h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3z',
                                fill: 'none',
                                stroke: 'currentColor',
                                'stroke-width': '1.8',
                                'stroke-linejoin': 'round'
                            }
                        }),
                        el('path', {
                            attrs: {
                                d: 'M6 15H5a3 3 0 0 1-3-3V4a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v1',
                                fill: 'none',
                                stroke: 'currentColor',
                                'stroke-width': '1.8',
                                'stroke-linecap': 'round',
                                'stroke-linejoin': 'round'
                            }
                        })
                    );
                    const card = el('article', { class: 'admin-order-card', attrs: { 'data-order-id': o.id } },
                        el('div', { class: 'admin-order-head' },
                            el('div', { class: 'admin-order-id-block' },
                                el('span', { class: 'tiny muted' }, 'Order'),
                                el('div', { class: 'admin-order-id-row' },
                                    el('span', { class: 'admin-order-id' }, orderIdString || '—'),
                                    orderIdString ? el('button', {
                                        class: 'admin-order-copy-btn',
                                        attrs: {
                                            type: 'button',
                                            'data-copy-order': orderIdString,
                                            'aria-label': 'Copy order ID'
                                        }
                                    }, copyIcon()) : null
                                )
                            ),
                            el('div', { class: 'admin-order-head-actions' },
                                el('button', { class: 'btn btn-xs btn-outline', attrs: { 'data-order-timeline': o.id } }, 'Timeline')
                            )
                        ),
                        el('div', { class: 'admin-order-details' },
                            el('div', { class: 'admin-order-detail-column' },
                                    el('span', { class: 'admin-order-section-title tiny muted' }, 'Customer'),
                                    (function () {
                                        const attrs = {
                                            type: 'button',
                                            'data-customer-inspect': (o.customerEmail || '').toLowerCase() || '',
                                            'data-customer-email': o.customerEmail || '',
                                            'data-customer-name': o.customerName || '',
                                            'data-customer-order': o.id || ''
                                        };
                                        if (!attrs['data-customer-inspect']) delete attrs['data-customer-inspect'];
                                        const btn = el('button', { class: 'admin-order-customer-btn', attrs },
                                            el('span', { class: 'admin-order-customer-name' }, o.customerName || o.customerEmail || '—'),
                                            o.customerEmail ? el('span', { class: 'admin-order-customer-email tiny muted' }, o.customerEmail) : null
                                        );
                                        return btn;
                                    })()
                                ),
                            el('div', { class: 'admin-order-detail-column' },
                                el('span', { class: 'admin-order-section-title tiny muted' }, 'Timeline'),
                                el('span', { class: 'admin-order-timestamps' }, tsParts.join(' · ') || new Date(o.createdAt).toLocaleString())
                            )
                        ),
                        el('div', { class: 'admin-order-section' },
                            el('span', { class: 'admin-order-section-title tiny muted' }, 'Items'),
                            itemsGallery
                        ),
                        metaGrid,
                        el('div', { class: 'admin-order-section admin-order-actions' },
                            el('span', { class: 'admin-order-section-title tiny muted' }, 'Actions'),
                            (function () {
                                const actionsWrap = el('div', { class: 'admin-order-actions-wrap' });
                                actionsWrap.appendChild(buildOrderActions(o, { includeTimeline: false }));
                                return actionsWrap;
                            })()
                        )
                    );
                    frag.appendChild(card);
                });
                ot.appendChild(frag);
            }

            if (!ot._wired) {
                ot._wired = true;
                ot.addEventListener('click', async (e) => {
                    const copyBtn = e.target.closest('[data-copy-order]');
                    if (copyBtn) {
                        const value = copyBtn.getAttribute('data-copy-order');
                        if (value) {
                            try {
                                await copyTextToClipboard(value);
                                notify('Order ID copied', 'success', 1600);
                            } catch (err) {
                                notify('Unable to copy ID', 'error', 2000);
                            }
                        }
                        return;
                    }
                    const customerBtn = e.target.closest('[data-customer-inspect], [data-customer-name][data-customer-order]');
                    if (customerBtn) {
                        const info = {
                            email: customerBtn.getAttribute('data-customer-inspect') || customerBtn.getAttribute('data-customer-email') || '',
                            name: customerBtn.getAttribute('data-customer-name') || '',
                            orderId: customerBtn.getAttribute('data-customer-order') || ''
                        };
                        showCustomerProfile(info);
                        return;
                    }
                    const tBtn = e.target.closest('[data-order-timeline]'); if (tBtn) { showOrderTimeline(tBtn.getAttribute('data-order-timeline')); return; }
                    const btn = e.target.closest('[data-order-action]'); if (!btn) return; const action = btn.getAttribute('data-order-action'); const id = btn.getAttribute('data-order-id');
                    try {
                        if (action === 'pay') await payOrder(id);
                        else if (action === 'fulfill') await fulfillOrder(id);
                        else if (action === 'ship') await shipOrder(id);
                        else if (action === 'complete') {
                            const email = btn.getAttribute('data-order-email') || '';
                            await completeOrder(id, email);
                        } else if (action === 'cancel') {
                            const orders = getAdminOrders();
                            const order = orders.find(o => String(o.id) === String(id));
                            const reason = await promptOrderCancellation(order);
                            if (!reason) return;
                            await cancelOrder(id, reason);
                        }
                        notify('Order ' + action + ' ok', 'success');
                        await loadOrdersAdmin();
                        refreshAdminTables();
                    } catch (err) { notify('Action failed: ' + err.message, 'error'); }
                });
                const refreshBtn = document.getElementById('orders-refresh-btn');
                if (refreshBtn && !refreshBtn._wired) {
                    refreshBtn._wired = true;
                    refreshBtn.addEventListener('click', async () => { await loadOrdersAdmin(); refreshAdminTables(); });
                }
            }
        }

        const refundsSummaryEl = document.getElementById('admin-refunds-summary');
        const refundsListEl = document.getElementById('admin-refunds-list');
        if (refundsSummaryEl || refundsListEl) {
            const refundOrders = orders.filter(order => order.returnRequestedAt);
            if (refundsSummaryEl) {
                const counts = { pending: 0, in_review: 0, approved: 0, refunded: 0, declined: 0 };
                let responseAccumulator = 0;
                let responseCount = 0;
                refundOrders.forEach(order => {
                    const key = getRefundStatus(order.returnAdminStatus);
                    counts[key] = (counts[key] || 0) + 1;
                    if (order.returnAdminRespondedAt && order.returnRequestedAt) {
                        responseAccumulator += (new Date(order.returnAdminRespondedAt).getTime() - new Date(order.returnRequestedAt).getTime());
                        responseCount += 1;
                    }
                });
                const openCount = counts.pending + counts.in_review;
                const resolvedCount = counts.approved + counts.refunded + counts.declined;
                const avgHours = responseCount ? Math.max(1, Math.round(responseAccumulator / responseCount / (1000 * 60 * 60))) : null;
                const summaryCards = [
                    { label: 'Open', value: openCount },
                    { label: 'Resolved', value: resolvedCount },
                    { label: 'Total', value: refundOrders.length },
                    { label: 'Avg response', value: avgHours ? `${avgHours}h` : '—' }
                ];
                refundsSummaryEl.innerHTML = '';
                summaryCards.forEach(card => {
                    refundsSummaryEl.appendChild(el('div', { class: 'admin-refunds-summary-card' },
                        el('span', { class: 'tiny muted' }, card.label),
                        el('span', { class: 'admin-refunds-summary-value' }, card.value)
                    ));
                });
            }
            if (refundsListEl) {
                refundsListEl.innerHTML = '';
                if (!refundOrders.length) {
                    refundsListEl.appendChild(el('div', { class: 'admin-refunds-empty muted' }, 'No refund requests yet.'));
                } else {
                    refundOrders.forEach(order => {
                        const items = Array.isArray(order.items) ? order.items : [];
                        const heroItem = items[0];
                        const heroImg = resolveItemImage(heroItem);
                        const extraItems = Math.max(0, items.length - 1);
                        const statusKey = getRefundStatus(order.returnAdminStatus);
                        const usageCopy = describeRefundUsage(order);
                        const reasonText = order.returnReason || 'Customer did not provide an explanation.';
                        const card = el('article', { class: 'admin-refund-card', attrs: { 'data-refund-order': order.id || '' } },
                            el('div', { class: 'admin-refund-card-head' },
                                el('div', { class: 'admin-refund-identity' },
                                    el('div', { class: 'admin-refund-thumb' },
                                        el('img', { attrs: { src: heroImg, alt: heroItem?.titleSnapshot || 'Product preview' } }),
                                        extraItems > 0 ? el('span', { class: 'admin-refund-thumb-count tiny' }, `+${extraItems}`) : null
                                    ),
                                    el('div', { class: 'admin-refund-basics' },
                                        el('span', { class: 'admin-refund-order-id' }, order.id || '—'),
                                        el('span', { class: 'admin-refund-customer tiny muted' }, order.customerName || order.customerEmail || 'Unknown customer')
                                    )
                                ),
                                el('span', { class: 'admin-refund-status-chip status-' + statusKey }, formatRefundStatus(statusKey))
                            ),
                            el('div', { class: 'admin-refund-overview' },
                                el('div', { class: 'admin-refund-overview-block' },
                                    el('span', { class: 'tiny muted' }, 'Requested'),
                                    el('span', { class: 'admin-refund-overview-value' }, order.returnRequestedAt ? new Date(order.returnRequestedAt).toLocaleString() : '—')
                                ),
                                el('div', { class: 'admin-refund-overview-block' },
                                    el('span', { class: 'tiny muted' }, 'Usage window'),
                                    el('span', { class: 'admin-refund-overview-value' }, usageCopy)
                                )
                            ),
                            el('div', { class: 'admin-refund-reason' },
                                el('span', { class: 'tiny muted' }, 'Customer explanation'),
                                el('p', {}, reasonText)
                            ),
                            order.returnAdminNotes ? el('div', { class: 'admin-refund-notes tiny muted' }, 'Internal notes: ', order.returnAdminNotes) : null,
                            order.returnUsageNotes ? el('div', { class: 'admin-refund-notes tiny muted' }, 'Usage notes: ', order.returnUsageNotes) : null,
                            el('div', { class: 'admin-refund-actions' },
                                el('button', { class: 'btn btn-xs btn-outline', attrs: { type: 'button', 'data-refund-toggle': order.id || '', 'aria-expanded': 'false' } }, 'Open conversation'),
                                el('button', { class: 'btn btn-xs btn-ghost', attrs: { type: 'button', 'data-refund-scroll-order': order.id || '' } }, 'View order card')
                            ),
                            el('div', { class: 'admin-refund-detail hidden', attrs: { 'data-refund-detail': order.id || '' } },
                                el('div', { class: 'admin-refund-timeline' },
                                    el('div', { class: 'admin-refund-timeline-row' },
                                        el('span', { class: 'tiny muted' }, 'Delivered'),
                                        el('span', {}, order.completedAt ? new Date(order.completedAt).toLocaleString() : '—')
                                    ),
                                    el('div', { class: 'admin-refund-timeline-row' },
                                        el('span', { class: 'tiny muted' }, 'Refund requested'),
                                        el('span', {}, order.returnRequestedAt ? new Date(order.returnRequestedAt).toLocaleString() : '—')
                                    ),
                                    el('div', { class: 'admin-refund-timeline-row' },
                                        el('span', { class: 'tiny muted' }, 'Last admin reply'),
                                        el('span', {}, order.returnAdminRespondedAt ? new Date(order.returnAdminRespondedAt).toLocaleString() : '—')
                                    )
                                ),
                                el('div', { class: 'admin-refund-thread' },
                                    el('div', { class: 'admin-refund-thread-messages', attrs: { 'data-refund-messages': order.id || '' } },
                                        el('p', { class: 'tiny muted' }, 'Conversation loads when opened.')
                                    ),
                                    el('form', { class: 'admin-refund-reply', attrs: { 'data-refund-form': order.id || '' } },
                                        el('label', {},
                                            el('span', { class: 'tiny muted' }, 'Status'),
                                            el('select', { attrs: { name: 'refund-status' } },
                                                Object.entries(REFUND_STATUS_LABELS).map(([value, label]) => el('option', { attrs: { value, selected: value === statusKey ? 'true' : null } }, label))
                                            )
                                        ),
                                        el('label', {},
                                            el('span', { class: 'tiny muted' }, 'Usage notes (internal)'),
                                            el('input', { attrs: { type: 'text', name: 'refund-usage', value: order.returnUsageNotes || '', placeholder: 'Ex: Signs of wear on collar' } })
                                        ),
                                        el('label', {},
                                            el('span', { class: 'tiny muted' }, 'Internal notes'),
                                            el('textarea', { attrs: { name: 'refund-notes', rows: '2', placeholder: 'Visible defects, next steps…' } }, order.returnAdminNotes || '')
                                        ),
                                        el('label', {},
                                            el('span', { class: 'tiny muted' }, 'Reply to customer'),
                                            el('textarea', { attrs: { name: 'refund-message', rows: '3', placeholder: 'Share updates or next steps (optional)' } })
                                        ),
                                        el('div', { class: 'admin-refund-reply-actions' },
                                            el('button', { class: 'btn btn-xs', attrs: { type: 'submit' } }, 'Update & send')
                                        )
                                    )
                                )
                            )
                        );
                        refundsListEl.appendChild(card);
                    });
                }
                if (!refundsListEl._wired) {
                    refundsListEl._wired = true;
                    refundsListEl.addEventListener('click', async (event) => {
                        const toggleBtn = event.target.closest('[data-refund-toggle]');
                        if (toggleBtn) {
                            const orderId = toggleBtn.getAttribute('data-refund-toggle');
                            const detail = refundsListEl.querySelector(`[data-refund-detail="${CSS.escape(orderId)}"]`);
                            if (!detail) return;
                            const nowHidden = detail.classList.toggle('hidden');
                            toggleBtn.setAttribute('aria-expanded', nowHidden ? 'false' : 'true');
                            if (!nowHidden) {
                                const container = detail.querySelector(`[data-refund-messages="${CSS.escape(orderId)}"]`);
                                if (container) container.innerHTML = '<p class="tiny muted">Loading conversation…</p>';
                                try {
                                    const hasCache = state.admin.refundThreads?.has(orderId);
                                    await loadRefundMessages(orderId, { force: !hasCache });
                                    renderRefundMessagesThread(orderId);
                                } catch (err) {
                                    const msg = err?.message?.includes('HTTP 404')
                                        ? 'Refund conversation endpoint not available on the server yet. Restart or redeploy the backend to pick up the latest routes.'
                                        : err?.message || 'Unknown error';
                                    if (container) container.innerHTML = '<p class="tiny alert">Unable to load thread: ' + msg + '</p>';
                                    console.warn('[refund-thread] load failed for', orderId, err);
                                }
                            }
                            return;
                        }
                        const viewBtn = event.target.closest('[data-refund-scroll-order]');
                        if (viewBtn) {
                            const orderId = viewBtn.getAttribute('data-refund-scroll-order');
                            if (orderId) {
                                const card = document.querySelector(`.admin-order-card[data-order-id="${CSS.escape(orderId)}"]`);
                                if (card) {
                                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    card.classList.add('admin-order-card--highlight');
                                    setTimeout(() => card.classList.remove('admin-order-card--highlight'), 2000);
                                } else {
                                    notify('Order card not visible in current filter.', 'warn');
                                }
                            }
                        }
                    });
                    refundsListEl.addEventListener('submit', async (event) => {
                        const form = event.target.closest('[data-refund-form]');
                        if (!form) return;
                        event.preventDefault();
                        const orderId = form.getAttribute('data-refund-form');
                        if (!orderId) return;
                        const status = form.querySelector('select[name="refund-status"]').value;
                        const usageNotes = form.querySelector('input[name="refund-usage"]').value;
                        const notes = form.querySelector('textarea[name="refund-notes"]').value;
                        const message = form.querySelector('textarea[name="refund-message"]').value;
                        const submitBtn = form.querySelector('button[type="submit"]');
                        submitBtn.disabled = true;
                        try {
                            const result = await respondToRefund(orderId, { status, usageNotes, notes, message });
                            form.querySelector('textarea[name="refund-notes"]').value = result.notes || '';
                            const msgBox = form.querySelector('textarea[name="refund-message"]');
                            if (message.trim()) msgBox.value = '';
                            const order = orders.find(o => String(o.id) === String(orderId));
                            if (order) {
                                order.returnAdminStatus = result.status;
                                order.returnAdminNotes = result.notes;
                                order.returnAdminRespondedAt = result.respondedAt;
                                order.returnUsageNotes = result.usageNotes;
                            }
                            renderRefundMessagesThread(orderId);
                            refreshAdminTables();
                            notify('Refund updated', 'success', 2000);
                        } catch (err) {
                            const msg = err?.message?.includes('HTTP 404')
                                ? 'HTTP 404 (route missing). Restart or redeploy the server so /api/orders/:id/refund-response is available, then refresh admin data.'
                                : err?.message || 'Unknown error';
                            notify('Unable to update refund: ' + msg, 'error');
                            console.warn('[refund-response] failed for', orderId, err);
                        } finally {
                            submitBtn.disabled = false;
                        }
                    });
                }
            }
            const refundsRefreshBtn = document.getElementById('refunds-refresh-btn');
            if (refundsRefreshBtn && !refundsRefreshBtn._wired) {
                refundsRefreshBtn._wired = true;
                refundsRefreshBtn.addEventListener('click', async () => {
                    await loadOrdersAdmin();
                    refreshAdminTables();
                });
            }
        }
        refreshAdminReviewsTable();
    }

    function refreshAdminReviewsTable() {
        const table = document.getElementById('admin-reviews-table');
        if (!table) return;
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Product</th>
                    <th>Rating</th>
                    <th>Review</th>
                    <th>Buyer</th>
                    <th>Qty</th>
                    <th>Status</th>
                    <th>Timestamps</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        const tbody = table.querySelector('tbody');
        const hasAuth = !!(state.admin.token && state.admin.user);
        const items = Array.isArray(state.admin.reviews?.items) ? state.admin.reviews.items : [];
        if (!hasAuth) {
            tbody.appendChild(el('tr', {},
                el('td', { attrs: { colspan: '8' } }, el('div', { class: 'muted small' }, 'Sign in as admin to load reviews'))
            ));
            return;
        }
        if (!items.length) {
            tbody.appendChild(el('tr', {},
                el('td', { attrs: { colspan: '8' } }, el('div', { class: 'muted small' }, 'No reviews for this filter'))
            ));
        }
        const statusColors = { pending: '#92400e', approved: '#065f46', rejected: '#991b1b' };
        function fmt(ts) {
            if (!ts) return '—';
            try { return new Date(ts).toLocaleString(); } catch { return ts; }
        }
        for (const review of items) {
            const product = state.productsById.get(review.productId);
            const productTitle = review.productTitle || product?.title || 'Unknown product';
            const productId = review.productId ? String(review.productId) : null;
            const productBits = [
                el('div', {}, el('strong', {}, productTitle))
            ];
            if (productId) {
                productBits.push(el('div', { class: 'tiny muted' }, productId.slice(0, 8) + '…'));
                productBits.push(el('div', { attrs: { style: 'margin-top:.35rem;' } },
                    el('button', { class: 'btn btn-xs btn-outline', attrs: { 'data-route': 'product', 'data-id': productId } }, 'View Product')
                ));
            }
            const productCell = el('td', {}, productBits);
            const ratingCell = el('td', {}, renderStarRating(review.rating, null, { size: 'xs' }));
            const reviewCell = el('td', {},
                review.title ? el('div', { class: 'small' }, el('strong', {}, review.title)) : null,
                el('div', { class: 'tiny muted' }, review.body || '—')
            );
            const buyerCell = el('td', {},
                el('div', {}, review.authorName || 'Anonymous'),
                el('div', { class: 'tiny muted' }, review.authorEmail || '—')
            );
            const qtyCell = el('td', {}, review.quantityPurchased != null ? String(review.quantityPurchased) : '—');
            const statusCell = el('td', {},
                el('span', { class: 'tag', attrs: { style: `background:${statusColors[review.status] || '#334155'};` } }, review.status),
                review.moderationNotes ? el('div', { class: 'tiny muted' }, review.moderationNotes) : null
            );
            const timeCell = el('td', {},
                el('div', {}, 'Created: ' + fmt(review.createdAt)),
                review.moderatedAt ? el('div', { class: 'tiny muted' }, 'Moderated: ' + fmt(review.moderatedAt)) : null
            );
            const actionsCell = el('td', {});
            if (review.status !== 'approved') {
                actionsCell.appendChild(el('button', { class: 'btn btn-xs btn-success', attrs: { 'data-review-approve': review.id } }, 'Approve'));
            }
            if (review.status !== 'rejected') {
                if (actionsCell.children.length) actionsCell.appendChild(document.createTextNode(' '));
                actionsCell.appendChild(el('button', { class: 'btn btn-xs btn-danger', attrs: { 'data-review-reject': review.id } }, 'Reject'));
            }
            if (!actionsCell.children.length) {
                actionsCell.appendChild(el('span', { class: 'tiny muted' }, '—'));
            }
            const row = el('tr', {}, productCell, ratingCell, reviewCell, buyerCell, qtyCell, statusCell, timeCell, actionsCell);
            tbody.appendChild(row);
        }
        if (!table._wired) {
            table._wired = true;
            table.addEventListener('click', async (e) => {
                const approveBtn = e.target.closest('[data-review-approve]');
                const rejectBtn = e.target.closest('[data-review-reject]');
                if (!approveBtn && !rejectBtn) return;
                const target = approveBtn || rejectBtn;
                const id = approveBtn ? approveBtn.getAttribute('data-review-approve') : rejectBtn.getAttribute('data-review-reject');
                if (!id) return;
                target.setAttribute('disabled', 'true');
                try {
                    if (approveBtn) {
                        await moderateReview(id, 'approve');
                        notify('Review approved', 'success', 2500);
                    } else {
                        if (!confirm('Reject this review?')) { target.removeAttribute('disabled'); return; }
                        const notesInput = prompt('Rejection notes (optional):', '');
                        const notes = notesInput && notesInput.trim() ? notesInput.trim() : undefined;
                        await moderateReview(id, 'reject', notes);
                        notify('Review rejected', 'warn', 2500);
                    }
                    await loadAdminReviews(state.admin.reviews.status || 'pending');
                    refreshAdminReviewsTable();
                } catch (err) {
                    notify(err.message, 'error', 4000);
                } finally {
                    target.removeAttribute('disabled');
                }
            });
        }
    }

    // Enhance refreshAdminData to also fetch discounts & low stock
    async function refreshAdminData() {
        if (!state.admin.token) return;
        await loadProducts(state.admin.showDeleted);
        // Prune deletedBuffer: remove entries now represented in canonical product list or restored
        try {
            for (const [id, snap] of state.deletedBuffer.entries()) {
                const live = state.productsById.get(id);
                if (!live) { // product gone (hard deleted or seed reset) -> drop snapshot
                    state.deletedBuffer.delete(id);
                    continue;
                }
                if (!live.deletedAt) { // restored
                    state.deletedBuffer.delete(id);
                    continue;
                }
                // If server copy has same deletedAt timestamp or newer, snapshot no longer needed
                if (live.deletedAt && (!snap.deletedAt || live.deletedAt >= snap.deletedAt)) {
                    state.deletedBuffer.delete(id);
                }
            }
        } catch { /* safe ignore */ }
        await Promise.all([
            loadOrdersAdmin(),
            loadDiscounts(),
            loadLowStock(parseInt(document.getElementById('low-stock-threshold')?.value, 10) || 5),
            loadAdminReviews(state.admin.reviews.status || 'pending')
        ]);
        if (state.currentRoute === 'admin') {
            refreshAdminTables();
            refreshDiscountTable();
            refreshLowStockTable();
        }
    }
    function refreshDiscountTable() {
        const dt = document.getElementById('admin-discounts-table'); if (!dt) return;
        dt.innerHTML = '<thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Min Subtotal</th><th>Expires</th><th>Usage</th><th>Status</th><th>Actions</th></tr></thead><tbody></tbody>';
        const tbody = dt.querySelector('tbody');
        state.admin.discounts.forEach(d => {
            const expired = d.expiresAt && new Date(d.expiresAt).getTime() <= Date.now();
            const actions = el('td', {});
            // Edit button (always allow editing even if disabled)
            actions.appendChild(el('button', { class: 'btn btn-xs btn-outline', attrs: { 'data-edit-discount': d.code } }, 'Edit'));
            actions.appendChild(document.createTextNode(' '));
            if (d.disabledAt) {
                actions.appendChild(el('button', { class: 'btn btn-xs btn-success', attrs: { 'data-enable-discount': d.code } }, 'Enable'));
            } else {
                actions.appendChild(el('button', { class: 'btn btn-xs btn-danger', attrs: { 'data-disable-discount': d.code } }, 'Disable'));
            }
            const tr = el('tr', {},
                el('td', {}, d.code),
                el('td', {}, d.type),
                el('td', {}, d.type === 'percent' ? d.value + '%' : money(d.value)),
                el('td', {}, money(d.minSubtotalCents)),
                el('td', {}, d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : '—'),
                el('td', {}, String(d.usageCount || 0)),
                el('td', {}, d.disabledAt ? 'Disabled' : (expired ? 'Expired' : 'Active')),
                actions
            );
            tbody.appendChild(tr);
        });
        if (!dt._wired) {
            dt._wired = true;
            dt.addEventListener('click', async e => {
                const disBtn = e.target.closest('[data-disable-discount]');
                const enBtn = e.target.closest('[data-enable-discount]');
                const editBtn = e.target.closest('[data-edit-discount]');
                if (disBtn) {
                    const code = disBtn.getAttribute('data-disable-discount');
                    try { await apiFetch('/api/discounts/' + code + '/disable', { method: 'POST' }); notify('Disabled ' + code, 'success'); await loadDiscounts(); refreshDiscountTable(); } catch (err) { notify(err.message, 'error'); }
                } else if (enBtn) {
                    const code = enBtn.getAttribute('data-enable-discount');
                    try { await apiFetch('/api/discounts/' + code + '/enable', { method: 'POST' }); notify('Enabled ' + code, 'success'); await loadDiscounts(); refreshDiscountTable(); } catch (err) { notify(err.message, 'error'); }
                } else if (editBtn) {
                    const code = editBtn.getAttribute('data-edit-discount');
                    const d = state.admin.discounts.find(x => x.code === code);
                    if (d) showDiscountModal(d);
                }
            });
            document.getElementById('new-discount-btn')?.addEventListener('click', () => showDiscountModal());
            document.getElementById('low-stock-refresh')?.addEventListener('click', async () => { await loadLowStock(parseInt(document.getElementById('low-stock-threshold').value, 10) || 5); refreshLowStockTable(); });
            document.getElementById('import-products-form')?.addEventListener('submit', async (e) => {
                e.preventDefault();
                const fileInput = document.getElementById('import-products-file');
                if (!fileInput.files.length) { notify('Select CSV file', 'warn'); return; }
                const fd = new FormData(); fd.append('file', fileInput.files[0]);
                try {
                    const res = await fetch('/api/import/products', { method: 'POST', headers: state.admin.token ? { 'X-Admin-Token': state.admin.token } : {}, body: fd });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Import failed');
                    notify(`Imported ${data.imported} products`, 'success', 6000);
                    if (data.errors && data.errors.length) console.warn('Import row errors', data.errors);
                    await refreshAdminData();
                } catch (err) { notify(err.message, 'error', 5000); }
            });
        }
    }
    function refreshLowStockTable() {
        const lt = document.getElementById('low-stock-table'); if (!lt) return;
        lt.innerHTML = '<thead><tr><th>Title</th><th>Inventory</th><th>Price</th></tr></thead><tbody></tbody>';
        const tbody = lt.querySelector('tbody');
        if (!state.admin.lowStock.length) {
            tbody.appendChild(el('tr', { class: 'muted' }, el('td', { attrs: { colspan: '3', style: 'text-align:center;padding:1.2rem;' } }, 'All products are above the threshold.')));
            return;
        }
        state.admin.lowStock.forEach(p => tbody.appendChild(el('tr', {}, el('td', {}, p.title), el('td', {}, String(p.totalInventory)), el('td', {}, money(p.priceCents)))));
    }
    function showDiscountModal(existing) {
        showModal(close => {
            const wrap = el('div', { class: 'modal' });
            wrap.appendChild(el('button', { class: 'modal-close' }, '×'));
            wrap.appendChild(el('h2', {}, existing ? 'Edit Discount' : 'New Discount'));
            const form = el('form', { class: 'form-grid', attrs: { id: 'discount-form', autocomplete: 'off' } },
                (function () {
                    const field = fieldInput('Code', 'd-code');
                    if (existing) field.querySelector('input').setAttribute('disabled', 'true');
                    return field;
                })(),
                (function () {
                    const field = el('div', { class: 'field' });
                    field.appendChild(el('label', { attrs: { for: 'd-type' } }, 'Type'));
                    const sel = el('select', { attrs: { id: 'd-type' } },
                        el('option', { attrs: { value: 'percent' } }, 'percent (percentage off)'),
                        el('option', { attrs: { value: 'fixed' } }, 'fixed (cents off)'),
                        el('option', { attrs: { value: 'ship' } }, 'ship (shipping % off)')
                    );
                    field.appendChild(sel); return field;
                })(),
                fieldInput('Value', 'd-value', 'number'),
                fieldInput('Min Subtotal (cents)', 'd-min', 'number'),
                fieldInput('Expires (date or ISO optional)', 'd-exp'),
                el('div', { class: 'field small muted', attrs: { style: 'grid-column:1/-1;' } }, 'Percent: 1-100. Fixed: value in cents. Date like 2027-08-10 or 8/10/2027.'),
                el('div', { class: 'field tiny muted', attrs: { id: 'discount-normalized-preview', style: 'grid-column:1/-1;display:none;' } }, ''),
                el('div', { class: 'field', attrs: { style: 'grid-column:1/-1;' } }, el('button', { class: 'btn btn-success', attrs: { type: 'submit' } }, existing ? 'Save Changes' : 'Create'), ' ', el('button', { class: 'btn btn-outline', attrs: { type: 'button', id: 'cancel-discount' } }, 'Cancel'))
            );
            const errorBox = el('div', { class: 'alert alert-error hidden', attrs: { id: 'discount-error' } });
            wrap.appendChild(errorBox);
            wrap.appendChild(form); modalRoot.appendChild(wrap);
            wrap.querySelector('.modal-close').addEventListener('click', close);
            form.querySelector('#cancel-discount').addEventListener('click', close);
            // Prefill if editing
            if (existing) {
                form.querySelector('#d-code input, #d-code').value = existing.code; // fallback attempt
                const codeInput = form.querySelector('#d-code input') || form.querySelector('#d-code');
                if (codeInput) codeInput.value = existing.code;
                form.querySelector('#d-type').value = existing.type;
                form.querySelector('#d-value').value = existing.value;
                form.querySelector('#d-min').value = existing.minSubtotalCents;
                if (existing.expiresAt) form.querySelector('#d-exp').value = existing.expiresAt.split('T')[0];
            }
            // Normalize discount code input live (uppercase, limited charset A-Z0-9-)
            try {
                const codeField = form.querySelector('#d-code input') || form.querySelector('#d-code');
                if (codeField && codeField.addEventListener) {
                    codeField.addEventListener('input', () => {
                        codeField.value = codeField.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
                    });
                }
            } catch { /* non-fatal */ }
            form.addEventListener('submit', async e => {
                e.preventDefault();
                const code = existing ? existing.code : form.querySelector('#d-code').value.trim().toUpperCase();
                let type = form.querySelector('#d-type').value.trim().toLowerCase();
                if (/^percent/.test(type) || /^perc/.test(type) || /^percentage/.test(type)) type = 'percent';
                else if (/^fixed/.test(type) || /^flat/.test(type) || /^amount/.test(type)) type = 'fixed';
                const value = parseInt(form.querySelector('#d-value').value, 10);
                const minSubtotalCents = parseInt(form.querySelector('#d-min').value, 10) || 0;
                const expiresRaw = form.querySelector('#d-exp').value.trim();
                let expiresAt = null;
                function showErr(msg) { errorBox.textContent = msg; errorBox.classList.remove('hidden'); }
                errorBox.classList.add('hidden'); errorBox.textContent = '';
                if (!code) return showErr('Code required');
                if (!['percent', 'fixed', 'ship'].includes(type)) return showErr('Type must be percent, fixed, or ship');
                if (!Number.isInteger(value) || value <= 0) return showErr('Value must be positive integer');
                if (type !== 'fixed' && (value < 1 || value > 100)) return showErr('Value must be 1-100 for percent/ship');
                if (!Number.isInteger(minSubtotalCents) || minSubtotalCents < 0) return showErr('Min subtotal invalid');
                if (expiresRaw) {
                    const parsed = Date.parse(expiresRaw);
                    if (Number.isNaN(parsed)) return showErr('Expires date invalid');
                    expiresAt = new Date(parsed).toISOString();
                }
                const payload = { code, type, value, minSubtotalCents, expiresAt };
                try {
                    if (existing) {
                        await apiFetch('/api/discounts/' + encodeURIComponent(code), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                        notify('Discount updated', 'success');
                    } else {
                        await apiFetch('/api/discounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                        notify('Discount created', 'success');
                    }
                    close(); await loadDiscounts(); refreshDiscountTable();
                } catch (err) { showErr(err.message); }
            });
            // Live normalized preview (in case UI extended later)
            const typeSel = form.querySelector('#d-type');
            const valueInput = form.querySelector('#d-value');
            const preview = form.querySelector('#discount-normalized-preview');
            function updatePreview() {
                let t = typeSel.value.trim().toLowerCase();
                if (/^percent/.test(t) || /^perc/.test(t) || /^percentage/.test(t)) t = 'percent';
                else if (/^fixed/.test(t) || /^flat/.test(t) || /^amount/.test(t)) t = 'fixed';
                else if (/ship/.test(t)) t = 'ship';
                preview.style.display = 'block';
                preview.textContent = 'Type: ' + t + ' | Value: ' + valueInput.value;
            }
            typeSel.addEventListener('change', updatePreview);
            valueInput.addEventListener('input', updatePreview); updatePreview();
        });
    }

    // Order timeline modal
    function showOrderTimeline(orderId) {
        const orders = getAdminOrders();
        const order = orders.find(o => String(o.id) === String(orderId));
        const summaryBits = order ? [
            { label: 'Status', value: (order.status || 'Unknown').replace(/_/g, ' ') },
            { label: 'Customer', value: order.customerName || order.customerEmail || '—' },
            { label: 'Total', value: money(order.totalCents || 0) },
            { label: 'Updated', value: order.updatedAt ? new Date(order.updatedAt).toLocaleString() : new Date(order.createdAt).toLocaleString() }
        ] : [];
        const timelineStages = order ? [
            { label: 'Created', at: order.createdAt },
            { label: 'Paid', at: order.paidAt },
            { label: 'Fulfilled', at: order.fulfilledAt },
            { label: 'Shipped', at: order.shippedAt },
            { label: 'Delivered', at: order.completedAt },
            { label: 'Cancelled', at: order.cancelledAt }
        ].filter(stage => stage.at) : [];
        showModal(async close => {
            const wrap = el('div', { class: 'modal order-timeline-modal' });
            wrap.appendChild(el('button', { class: 'modal-close' }, '×'));
            wrap.appendChild(el('h2', {}, 'Order Timeline'));
            const subtitle = el('p', { class: 'tiny muted' }, order ? `Order ${order.id}` : 'Order details not found in cache.');
            wrap.appendChild(subtitle);
            if (summaryBits.length) {
                const summaryGrid = el('div', { class: 'order-timeline-summary' },
                    ...summaryBits.map(bit => el('div', { class: 'order-timeline-summary-item' },
                        el('span', { class: 'order-timeline-summary-label' }, bit.label),
                        el('span', { class: 'order-timeline-summary-value' }, bit.value)
                    ))
                );
                wrap.appendChild(summaryGrid);
            }
            if (timelineStages.length) {
                wrap.appendChild(el('div', { class: 'order-timeline-stages' },
                    el('span', { class: 'tiny muted order-timeline-stages-label' }, 'Key milestones'),
                    ...timelineStages.map(stage => el('div', { class: 'order-timeline-stage tiny' },
                        el('span', { class: 'order-timeline-stage-label' }, stage.label),
                        el('span', { class: 'order-timeline-stage-date' }, new Date(stage.at).toLocaleString())
                    ))
                ));
            }
            const eventsList = el('ol', { class: 'order-timeline-events' },
                el('li', { class: 'order-timeline-loading tiny muted' }, 'Loading event history...')
            );
            wrap.appendChild(el('div', { class: 'order-timeline-events-wrap' },
                el('span', { class: 'tiny muted order-timeline-events-label' }, 'Event history'),
                eventsList
            ));
            modalRoot.appendChild(wrap);
            wrap.querySelector('.modal-close').addEventListener('click', close);
            try {
                const data = await apiFetch('/api/orders/' + orderId + '/events');
                const events = Array.isArray(data?.events) ? data.events.slice() : [];
                events.sort((a, b) => {
                    const aTime = new Date(a.at || 0).getTime();
                    const bTime = new Date(b.at || 0).getTime();
                    return aTime - bTime;
                });
                eventsList.innerHTML = '';
                if (!events.length) {
                    eventsList.appendChild(el('li', { class: 'order-timeline-empty tiny muted' }, 'No events yet.'));
                } else {
                    events.forEach(ev => {
                        const status = typeof ev.status === 'string' ? ev.status.replace(/_/g, ' ') : 'Event';
                        const timestamp = ev.at ? new Date(ev.at).toLocaleString() : '—';
                        const note = ev.note || ev.notes || ev.message || '';
                        const actor = ev.actor || ev.user || '';
                        eventsList.appendChild(el('li', { class: 'order-timeline-event' },
                            el('div', { class: 'order-timeline-event-head' },
                                el('span', { class: 'order-timeline-event-status' }, status),
                                el('span', { class: 'order-timeline-event-date tiny muted' }, timestamp)
                            ),
                            note ? el('p', { class: 'order-timeline-event-note tiny' }, note) : null,
                            actor ? el('p', { class: 'order-timeline-event-actor tiny muted' }, 'By ' + actor) : null
                        ));
                    });
                }
            } catch (err) {
                eventsList.innerHTML = '';
                eventsList.appendChild(el('li', { class: 'order-timeline-error tiny' }, 'Unable to load events: ' + err.message));
            }
        });
    }

    function showCustomerProfile(info = {}) {
        const orders = getAdminOrders();
        const emailKey = (info.email || '').trim().toLowerCase();
        const nameKey = (info.name || '').trim().toLowerCase();
        const matches = orders.filter(order => {
            const orderEmail = (order.customerEmail || '').trim().toLowerCase();
            if (emailKey && orderEmail) return orderEmail === emailKey;
            if (!emailKey && nameKey) {
                const orderName = (order.customerName || '').trim().toLowerCase();
                if (orderName) return orderName === nameKey;
            }
            return false;
        });
        let matchedOrders = matches;
        if (!matchedOrders.length && info.orderId) {
            const fallbackOrder = orders.find(o => String(o.id) === String(info.orderId));
            if (fallbackOrder) matchedOrders = [fallbackOrder];
        }

        const profileOrder = matchedOrders[0];
        const customerName = profileOrder?.customerName || info.name || 'Customer';
        const customerEmail = profileOrder?.customerEmail || info.email || '';

        const totals = matchedOrders.reduce((acc, order) => {
            const total = Number.isFinite(order.totalCents) ? order.totalCents : 0;
            const created = order.createdAt ? new Date(order.createdAt).getTime() : null;
            if (created != null && !Number.isNaN(created)) {
                acc.first = acc.first == null ? created : Math.min(acc.first, created);
                acc.last = acc.last == null ? created : Math.max(acc.last, created);
            }
            acc.spend += total;
            acc.count += 1;
            return acc;
        }, { spend: 0, count: 0, first: null, last: null });

        const recentOrders = matchedOrders
            .slice()
            .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
            .slice(0, 5);

        const rawProductMap = state.productsById instanceof Map ? state.productsById : new Map();
        const lookupProduct = (id) => {
            if (id == null) return null;
            if (rawProductMap.has(id)) return rawProductMap.get(id);
            const str = String(id);
            if (rawProductMap.has(str)) return rawProductMap.get(str);
            const num = Number(id);
            if (!Number.isNaN(num) && rawProductMap.has(num)) return rawProductMap.get(num);
            return null;
        };
        const resolveItemImage = (item) => {
            if (!item) return productPlaceholder(360);
            const candidate = item.image || item.thumbnail || (Array.isArray(item.images) && item.images[0]) || item.imageUrl;
            if (candidate) return candidate;
            const product = lookupProduct(item.productId);
            const productImages = product?.images;
            if (Array.isArray(productImages) && productImages[0]) return productImages[0];
            if (typeof productImages === 'string') return productImages;
            if (typeof product?.image === 'string') return product.image;
            return productPlaceholder(360);
        };
        const productStatsMap = new Map();
        matchedOrders.forEach(order => {
            const items = Array.isArray(order.items) ? order.items : [];
            const orderTimestamp = order.createdAt ? new Date(order.createdAt).getTime() : 0;
            items.forEach(item => {
                const qty = typeof item.quantity === 'number' ? item.quantity : (item.qty || 1);
                const price = Number.isFinite(item.unitPriceCents) ? item.unitPriceCents : 0;
                const productKey = item.productId || item.id || item.sku || item.title || 'unknown';
                if (!productStatsMap.has(productKey)) {
                    const product = lookupProduct(item.productId);
                    productStatsMap.set(productKey, {
                        key: productKey,
                        title: item.titleSnapshot || item.title || product?.title || `Product ${productKey}`,
                        qty: 0,
                        spend: 0,
                        image: resolveItemImage(item),
                        lastOrderedAt: orderTimestamp
                    });
                }
                const entry = productStatsMap.get(productKey);
                entry.qty += qty || 1;
                entry.spend += (qty || 1) * price;
                if (orderTimestamp) entry.lastOrderedAt = Math.max(entry.lastOrderedAt || 0, orderTimestamp);
                if (!entry.image) entry.image = resolveItemImage(item);
            });
        });
        const topProducts = Array.from(productStatsMap.values())
            .sort((a, b) => (b.qty - a.qty) || ((b.lastOrderedAt || 0) - (a.lastOrderedAt || 0)))
            .slice(0, 3);

        showModal(close => {
            const wrap = el('div', { class: 'modal customer-profile-modal' });
            wrap.appendChild(el('button', { class: 'modal-close', attrs: { 'aria-label': 'Close' } }, '×'));
            wrap.appendChild(el('h2', {}, 'Customer profile'));
            wrap.appendChild(el('p', { class: 'tiny muted' }, customerEmail ? `${customerName} · ${customerEmail}` : customerName));
            const body = el('div', { class: 'customer-profile-body' });
            wrap.appendChild(body);

            if (!matchedOrders.length) {
                body.appendChild(el('p', { class: 'alert alert-info' }, 'No additional orders found for this customer.')); 
            } else {
                const summaryGrid = el('div', { class: 'customer-profile-summary' },
                    el('div', { class: 'customer-profile-tile' },
                        el('span', { class: 'customer-profile-label tiny muted' }, 'Total orders'),
                        el('span', { class: 'customer-profile-value' }, String(totals.count))
                    ),
                    el('div', { class: 'customer-profile-tile' },
                        el('span', { class: 'customer-profile-label tiny muted' }, 'Total spent'),
                        el('span', { class: 'customer-profile-value' }, money(totals.spend))
                    ),
                    el('div', { class: 'customer-profile-tile' },
                        el('span', { class: 'customer-profile-label tiny muted' }, 'First order'),
                        el('span', { class: 'customer-profile-value' }, totals.first ? new Date(totals.first).toLocaleString() : '—')
                    ),
                    el('div', { class: 'customer-profile-tile' },
                        el('span', { class: 'customer-profile-label tiny muted' }, 'Last order'),
                        el('span', { class: 'customer-profile-value' }, totals.last ? new Date(totals.last).toLocaleString() : '—')
                    )
                );
                body.appendChild(summaryGrid);

                const panels = el('div', { class: 'customer-profile-panels' });

                if (topProducts.length) {
                    panels.appendChild(el('div', { class: 'customer-profile-section customer-profile-panel' },
                        el('span', { class: 'customer-profile-section-title tiny muted' }, 'Most purchased items'),
                        el('ul', { class: 'customer-profile-products' },
                            ...topProducts.map(product => {
                                const lastPurchase = product.lastOrderedAt
                                    ? new Date(product.lastOrderedAt).toLocaleDateString()
                                    : null;
                                return el('li', { class: 'customer-profile-product-card' },
                                    el('div', { class: 'customer-profile-product-thumb' },
                                        el('img', { attrs: { src: product.image, alt: product.title } })
                                    ),
                                    el('div', { class: 'customer-profile-product-info' },
                                        el('span', { class: 'customer-profile-product-title' }, product.title),
                                        el('span', { class: 'customer-profile-product-meta tiny muted' }, `${product.qty}× · ${money(product.spend)}`),
                                        lastPurchase ? el('span', { class: 'customer-profile-product-note tiny' }, 'Last on ' + lastPurchase) : null
                                    )
                                );
                            })
                        )
                    ));
                }

                const ordersSection = el('div', { class: 'customer-profile-section customer-profile-panel' },
                    el('span', { class: 'customer-profile-section-title tiny muted' }, 'Recent orders'),
                    recentOrders.length ? el('ul', { class: 'customer-profile-orders' },
                        ...recentOrders.map(order => {
                            const orderItems = Array.isArray(order.items) ? order.items : [];
                            const heroItem = orderItems[0];
                            const heroImage = resolveItemImage(heroItem);
                            const extraCount = orderItems.length > 1 ? orderItems.length - 1 : 0;
                            let linesPreview = orderItems.slice(0, 2)
                                .map(item => item?.titleSnapshot || item?.title || 'Item')
                                .filter(Boolean)
                                .join(', ');
                            if (extraCount > 0) linesPreview += ` +${extraCount} more`;
                            if (!linesPreview) linesPreview = 'Line items will appear once available.';
                            const statusLine = [
                                order.status ? order.status.replace(/_/g, ' ') : 'unknown',
                                order.createdAt ? new Date(order.createdAt).toLocaleString() : '—'
                            ].filter(Boolean).join(' · ');
                            return el('li', { class: 'customer-profile-order-card', attrs: { 'data-order-id': order.id || '' } },
                                el('div', { class: 'customer-profile-order-thumb' },
                                    el('img', { attrs: { src: heroImage, alt: heroItem?.title || 'Order preview' } }),
                                    extraCount > 0 ? el('span', { class: 'customer-profile-order-thumb-count tiny' }, `+${extraCount}`) : null
                                ),
                                el('div', { class: 'customer-profile-order-details' },
                                    el('div', { class: 'customer-profile-order-head' },
                                        el('span', { class: 'customer-profile-order-id' }, order.id || '—'),
                                        el('span', { class: 'customer-profile-order-total' }, money(order.totalCents || 0))
                                    ),
                                    el('div', { class: 'customer-profile-order-meta tiny muted' }, statusLine),
                                    el('p', { class: 'customer-profile-order-items tiny muted' }, linesPreview),
                                    el('div', { class: 'customer-profile-order-actions' },
                                        el('button', { class: 'btn btn-xs btn-outline', attrs: { type: 'button', 'data-go-order': order.id || '' } }, 'View order'),
                                        el('button', { class: 'btn btn-xs btn-danger', attrs: { type: 'button', 'data-refund-order': order.id || '' } }, 'Refund/Cancel')
                                    )
                                )
                            );
                        })
                    ) : el('p', { class: 'tiny muted' }, 'No recent orders logged yet.')
                );

                panels.appendChild(ordersSection);
                body.appendChild(panels);
            }

            modalRoot.appendChild(wrap);
            wrap.querySelector('.modal-close').addEventListener('click', close);

            wrap.addEventListener('click', async (event) => {
                const goBtn = event.target.closest('[data-go-order]');
                if (goBtn) {
                    const orderId = goBtn.getAttribute('data-go-order');
                    if (orderId) {
                        close();
                        requestAnimationFrame(() => {
                            const card = document.querySelector(`.admin-order-card[data-order-id="${CSS.escape(orderId)}"]`);
                            if (card) {
                                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                card.classList.add('admin-order-card--highlight');
                                setTimeout(() => card.classList.remove('admin-order-card--highlight'), 2000);
                            } else {
                                notify('Order not visible in current list.', 'warn', 2200);
                            }
                        });
                    }
                    return;
                }
                const refundBtn = event.target.closest('[data-refund-order]');
                if (refundBtn) {
                    const orderId = refundBtn.getAttribute('data-refund-order');
                    if (!orderId) return;
                    const order = orders.find(o => String(o.id) === String(orderId));
                    if (!order) {
                        notify('Order not found for refund.', 'error');
                        return;
                    }
                    try {
                        const reason = await promptOrderCancellation(order);
                        if (!reason) return;
                        await cancelOrder(orderId, reason);
                        notify('Order cancelled', 'success');
                        close();
                        await loadOrdersAdmin();
                        refreshAdminTables();
                    } catch (err) {
                        notify('Unable to cancel order: ' + err.message, 'error');
                    }
                }
            });
        });
    }

    function promptOrderCancellation(order) {
        return new Promise(resolve => {
            showModal(close => {
                const wrap = el('div', { class: 'modal cancel-order-modal' });
                const orderLabel = order ? `Order ${order.id}` : 'This order';
                wrap.appendChild(el('button', { class: 'modal-close', attrs: { 'aria-label': 'Close' } }, '×'));
                wrap.appendChild(el('h2', {}, 'Cancel order?'));
                wrap.appendChild(el('p', { class: 'small muted' }, `You are about to cancel ${orderLabel}. This will notify the customer and lock further fulfillment steps.`));
                if (order) {
                    const infoList = el('ul', { class: 'cancel-order-meta muted tiny' },
                        order.customerName ? el('li', {}, 'Customer: ', order.customerName) : null,
                        order.customerEmail ? el('li', {}, 'Email: ', order.customerEmail) : null,
                        Number.isFinite(order.totalCents) ? el('li', {}, 'Total: ', money(order.totalCents)) : null
                    );
                    wrap.appendChild(infoList);
                }
                const reasonWrap = el('div', { class: 'cancel-order-reason hidden' },
                    el('label', { class: 'tiny muted', attrs: { for: 'cancel-reason-input' } }, 'Reason for cancellation'),
                    el('textarea', {
                        class: 'cancel-order-reason-input',
                        attrs: { id: 'cancel-reason-input', rows: '3', placeholder: 'Example: Payment timeout, stock issue, duplicated order' }
                    }),
                    el('p', { class: 'cancel-order-reason-hint tiny muted' }, 'This reason is stored alongside the order history for auditing.')
                );
                wrap.appendChild(reasonWrap);
                const actions = el('div', { class: 'cancel-order-actions' });
                const keepBtn = el('button', { class: 'btn btn-xs' }, 'No, keep order');
                const confirmBtn = el('button', { class: 'btn btn-xs btn-danger' }, 'Yes, cancel order');
                actions.appendChild(keepBtn);
                actions.appendChild(confirmBtn);
                wrap.appendChild(actions);
                modalRoot.appendChild(wrap);
                const textarea = reasonWrap.querySelector('textarea');
                const closeAndResolve = (val) => { close(); resolve(val); };
                keepBtn.addEventListener('click', () => closeAndResolve(null));
                wrap.querySelector('.modal-close').addEventListener('click', () => closeAndResolve(null));
                let reasonVisible = false;
                confirmBtn.addEventListener('click', () => {
                    if (!reasonVisible) {
                        reasonVisible = true;
                        reasonWrap.classList.remove('hidden');
                        confirmBtn.textContent = 'Submit cancellation';
                        textarea.focus();
                        return;
                    }
                    const reason = textarea.value.trim();
                    if (!reason) {
                        textarea.classList.add('field-error');
                        textarea.focus();
                        return;
                    }
                    textarea.classList.remove('field-error');
                    closeAndResolve(reason);
                });
            });
        });
    }

    // Inject timeline trigger into order actions builder
    function buildOrderActions(o, opts = {}) {
        const frag = document.createDocumentFragment();
        const includeTimeline = opts.includeTimeline !== false;
        function act(label, action, disabled = false, extraAttrs = {}) {
            const attrs = Object.assign({ 'data-order-action': action, 'data-order-id': o.id }, extraAttrs);
            if (disabled) attrs.disabled = 'true';
            const b = el('button', { class: 'btn btn-xs' + (disabled ? ' btn-disabled' : ' btn-outline'), attrs }, label);
            frag.appendChild(b);
        }
        if (includeTimeline) {
            const timelineBtn = el('button', { class: 'btn btn-xs btn-outline', attrs: { 'data-order-timeline': o.id } }, 'Timeline');
            frag.appendChild(timelineBtn);
        }
        if (o.cancelledAt) { act('Cancelled', 'noop', true); return frag; }
        if (!o.paidAt) act('Pay', 'pay');
        if (o.paidAt && !o.fulfilledAt) act('Fulfill', 'fulfill');
        if (o.fulfilledAt && !o.shippedAt) act('Ship', 'ship');
        if (!o.shippedAt && !o.cancelledAt) act('Cancel', 'cancel');
            if (o.shippedAt) {
            act('Shipped', 'noop', true);
            if (o.completedAt) {
                act('Delivered', 'noop', true);
            } else {
                // admin needs to send customer's email so the public endpoint accepts the completion
                act('Delivered', 'complete', false, { 'data-order-email': o.customerEmail || '' });
            }
        }
        return frag;
    }

    /* ----------------------------
     * Initialization
     * ---------------------------- */

    async function init() {
        try {
            showSpinner(true);
            await verifyCustomerSession();
            await Promise.all([loadProducts(), loadMeta()]);
            sanitizeCart();
            updateCartBadge();
            // Optional: hide any admin-nav elements if token invalid
            verifyAdminToken().then(ok => {
                document.querySelectorAll('[data-route="admin"]').forEach(el => {
                    if (!ok) el.style.display = 'none'; else el.style.display = '';
                });
            });
            const handledStripe = await maybeHandleStripeReturn();
            if (!handledStripe) {
                navigate('home');
                // Set initial active link
                try { document.querySelector('.nav-link[data-route="home"]').classList.add('active'); } catch { }
            }
        } catch (err) {
            rootEl.innerHTML = '';
            rootEl.appendChild(el('p', { class: 'alert alert-error' }, 'Failed to load data: ' + err.message));
        } finally {
            showSpinner(false);
        }
    }

    init();

    function showProductModal(prod) {
        showModal(close => {
            const wrap = el('div', { class: 'modal' });
            wrap.appendChild(el('button', { class: 'modal-close' }, '×'));
            wrap.appendChild(el('h2', {}, prod ? `Edit: ${prod.title}` : 'New Product'));
            let imageList = Array.isArray(prod?.images) ? prod.images.filter(Boolean) : [];
            const imageField = (() => {
                const field = el('div', { class: 'field', attrs: { style: 'grid-column:1/-1;' } });
                field.appendChild(el('label', { attrs: { for: 'p-img-upload' } }, 'Images'));
                field.appendChild(el('div', { class: 'tiny muted' }, 'Upload product photos (first image becomes the primary display).'));
                const chipWrap = el('div', { class: 'image-chip-wrap' });
                const status = el('div', { class: 'tiny muted image-upload-status' });
                const uploadBtn = el('button', { class: 'btn btn-small', attrs: { type: 'button', id: 'p-img-trigger' } }, 'Add Images');
                const uploadActions = el('div', { class: 'image-upload-actions' }, uploadBtn, status);
                const fileInput = el('input', { class: 'image-upload-input', attrs: { id: 'p-img-upload', type: 'file', accept: 'image/*', multiple: 'multiple', style: 'display:none' } });
                field.appendChild(chipWrap);
                field.appendChild(uploadActions);
                field.appendChild(fileInput);
                const MAX_SIZE = 5 * 1024 * 1024;
                async function resizeForChip(file) {
                    if (!file || !/^image\//i.test(file.type)) return file;
                    const TARGET_SIZE = 626;
                    return await new Promise((resolve) => {
                        const img = new Image();
                        const objectUrl = URL.createObjectURL(file);
                        img.onload = () => {
                            URL.revokeObjectURL(objectUrl);
                            if (!Number.isFinite(img.width) || !Number.isFinite(img.height) || img.width <= 0 || img.height <= 0) {
                                resolve(file);
                                return;
                            }
                            const canvas = document.createElement('canvas');
                            canvas.width = TARGET_SIZE;
                            canvas.height = TARGET_SIZE;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) {
                                resolve(file);
                                return;
                            }
                            ctx.imageSmoothingQuality = 'high';
                            ctx.imageSmoothingEnabled = true;
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE);
                            const scale = Math.min(TARGET_SIZE / img.width, TARGET_SIZE / img.height);
                            const drawWidth = Math.round(img.width * scale);
                            const drawHeight = Math.round(img.height * scale);
                            const offsetX = Math.round((TARGET_SIZE - drawWidth) / 2);
                            const offsetY = Math.round((TARGET_SIZE - drawHeight) / 2);
                            ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
                            const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
                            const quality = mime === 'image/jpeg' ? 0.82 : undefined;
                            canvas.toBlob((blob) => {
                                if (!blob) {
                                    resolve(file);
                                    return;
                                }
                                const nameRoot = file.name.replace(/\.[^.]+$/, '');
                                const ext = mime === 'image/png' ? '.png' : '.jpg';
                                resolve(new File([blob], `${nameRoot}-626sq${ext}`, { type: mime, lastModified: Date.now() }));
                            }, mime, quality);
                        };
                        img.onerror = () => {
                            URL.revokeObjectURL(objectUrl);
                            resolve(file);
                        };
                        img.src = objectUrl;
                    });
                }
                function refreshImages() {
                    chipWrap.innerHTML = '';
                    if (!imageList.length) {
                        chipWrap.appendChild(el('div', { class: 'tiny muted image-chip-empty' }, 'No images yet. Upload to add one.'));
                        return;
                    }
                    imageList.forEach((url, idx) => {
                        const chip = el('div', { class: 'image-chip' });
                        const img = el('img', { attrs: { src: url, alt: `Product image ${idx + 1}` } });
                        const removeBtn = el('button', { class: 'image-chip-remove', attrs: { type: 'button', 'aria-label': 'Remove image' } }, '×');
                        removeBtn.addEventListener('click', () => {
                            imageList.splice(idx, 1);
                            refreshImages();
                        });
                        chip.appendChild(img);
                        chip.appendChild(removeBtn);
                        if (idx === 0) {
                            chip.appendChild(el('span', { class: 'image-chip-tag' }, 'Primary'));
                        }
                        chipWrap.appendChild(chip);
                    });
                }
                async function handleFiles(fileList) {
                    const files = Array.from(fileList || []).filter(f => f && /^image\//i.test(f.type));
                    if (!files.length) {
                        status.textContent = 'No image files selected.';
                        setTimeout(() => { status.textContent = ''; }, 2500);
                        return;
                    }
                    uploadBtn.disabled = true;
                    fileInput.disabled = true;
                    for (let i = 0; i < files.length; i++) {
                        const original = files[i];
                        status.textContent = `Uploading ${i + 1} of ${files.length}…`;
                        let file = original;
                        try {
                            file = await resizeForChip(original);
                        } catch (resizeErr) {
                            console.warn('resize failed, using original', resizeErr);
                            file = original;
                        }
                        if (file.size > MAX_SIZE) {
                            notify(`Skipped ${original.name}: still exceeds 5MB after resizing`, 'warn', 5000);
                            continue;
                        }
                        const formData = new FormData();
                        formData.append('image', file, file.name);
                        try {
                            const result = await apiFetch('/api/upload/image', { method: 'POST', body: formData });
                            if (result?.url && !imageList.includes(result.url)) {
                                imageList.push(result.url);
                            }
                        } catch (err) {
                            notify('Upload failed: ' + err.message, 'error', 6000);
                        }
                    }
                    refreshImages();
                    status.textContent = imageList.length ? 'Upload complete.' : '';
                    setTimeout(() => { status.textContent = ''; }, 2500);
                    uploadBtn.disabled = false;
                    fileInput.disabled = false;
                    fileInput.value = '';
                }
                uploadBtn.addEventListener('click', () => fileInput.click());
                fileInput.addEventListener('change', (evt) => handleFiles(evt.target.files));
                refreshImages();
                return field;
            })();
            const errorBox = el('div', { class: 'alert alert-error hidden', attrs: { id: 'prod-error' } }, '');
            const form = el('form', { class: 'form-grid', attrs: { id: 'prod-form' } },
                fieldInput('Title', 'p-title'),
                fieldTextArea('Description', 'p-desc'),
                fieldInput('Price (cents)', 'p-price', 'number'),
                fieldInput('Base Inventory', 'p-base-inv', 'number'),
                fieldInput('Per-Item Shipping (cents)', 'p-ship', 'number'),
                imageField,
                fieldInput('Tags (comma)', 'p-tags'),
                el('div', { class: 'field', attrs: { style: 'grid-column:1/-1;' } },
                    el('button', { class: 'btn btn-success', attrs: { type: 'submit' } }, prod ? 'Save Changes' : 'Create'), ' ',
                    el('button', { class: 'btn btn-outline', attrs: { type: 'button', id: 'cancel-prod' } }, 'Cancel')
                )
            );
            if (prod) {
                form.querySelector('#p-title').value = prod.title;
                form.querySelector('#p-desc').value = prod.description;
                form.querySelector('#p-price').value = String(prod.priceCents);
                form.querySelector('#p-base-inv').value = String(productStock(prod));
                form.querySelector('#p-ship').value = String(prod.shippingFeeCents || 0);
                form.querySelector('#p-tags').value = (prod.tags || []).join(', ');
            }
            wrap.appendChild(errorBox);
            wrap.appendChild(form);
            modalRoot.appendChild(wrap);
            wrap.querySelector('.modal-close').addEventListener('click', () => close());
            form.querySelector('#cancel-prod').addEventListener('click', () => close());
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const imagesClean = Array.from(new Set(imageList.filter(Boolean)));
                const payload = {
                    title: form.querySelector('#p-title').value.trim(),
                    description: form.querySelector('#p-desc').value.trim(),
                    priceCents: parseInt(form.querySelector('#p-price').value, 10),
                    baseInventory: parseInt(form.querySelector('#p-base-inv').value, 10),
                    shippingFeeCents: parseInt(form.querySelector('#p-ship').value, 10) || 0,
                    images: imagesClean,
                    tags: form.querySelector('#p-tags').value.split(',').map(s => s.trim()).filter(Boolean)
                };
                if (!payload.title) return showError('Title required');
                if (!Number.isInteger(payload.priceCents) || payload.priceCents < 0) return showError('Price invalid');
                if (!Number.isInteger(payload.baseInventory) || payload.baseInventory < 0) return showError('Inventory invalid');
                if (!Number.isInteger(payload.shippingFeeCents) || payload.shippingFeeCents < 0) return showError('Shipping fee invalid');
                try {
                    if (prod) await updateProduct(prod.id, payload); else await createProduct(payload);
                    notify(prod ? 'Product updated' : 'Product created', 'success');
                    close();
                    await refreshAdminData();
                } catch (err) { showError(err.message); }
            });
            function showError(msg) { errorBox.textContent = 'Error: ' + msg; errorBox.classList.remove('hidden'); }
        });
    }

})();