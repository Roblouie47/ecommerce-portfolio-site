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
        const pendingNotice = el('div', { class: 'alert alert-info hidden', attrs: { id: 'review-pending-note' } }, 'Thanks! Your review is pending moderation. Approved reviews appear below once moderated.');
        panel.appendChild(pendingNotice);
        panel.appendChild(reviewList);

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

        async function hydrateReviews(force = false) {
            try {
                renderSummary(data.summary);
                renderReviews(data.reviews);
                const entry = state.productsById.get(prod.id);
                if (entry) entry.reviewSummary = data.summary;
                prod.reviewSummary = data.summary;
                const idx = state.products.findIndex(p => p.id === prod.id);
                if (idx >= 0) state.products[idx] = { ...state.products[idx], reviewSummary: data.summary };
            } catch (err) {
                reviewList.innerHTML = '';
                reviewList.appendChild(el('div', { class: 'alert alert-error' }, 'Failed to load reviews: ' + err.message));
            }
        }

        function buildReviewForm() {
            const form = el('form', { class: 'review-form flex flex-col gap-sm', attrs: { id: 'product-review-form' } },
                el('h4', {}, 'Share your experience'),
                fieldInput('Display name (optional)', 'review-name'),
                fieldInput('Email used at checkout', 'review-email', 'email', true),
                fieldInput('Order ID', 'review-order', 'text', true),
                (function () {
                    const field = el('div', { class: 'field' });
                    field.appendChild(el('label', { attrs: { for: 'review-rating' } }, 'Rating'));
                    const sel = el('select', { attrs: { id: 'review-rating', required: 'true' } },
                        ...[5, 4, 3, 2, 1].map(v => el('option', { attrs: { value: String(v) } }, `${v} – ${['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][5 - v] || ''}`))
                    );
                    field.appendChild(sel);
                    return field;
                })(),
                fieldInput('Review title (optional)', 'review-title'),
                (function () {
                    const field = el('div', { class: 'field' });
                    field.appendChild(el('label', { attrs: { for: 'review-body' } }, 'Review'));
                    field.appendChild(el('textarea', { attrs: { id: 'review-body', rows: '4', required: 'true', placeholder: 'Tell other shoppers what stood out.' } }));
                    return field;
                })(),
                el('div', { class: 'form-actions flex gap-sm' },
                    el('button', { class: 'btn btn-success', attrs: { type: 'submit' } }, 'Submit Review'),
                    el('button', { class: 'btn btn-outline', attrs: { type: 'button', id: 'refresh-reviews' } }, 'Refresh')
                ),
                el('div', { class: 'tiny muted', attrs: { id: 'review-form-status' } }, '')
            );

            const defaultEmail = localStorage.getItem('customerEmail') || state.lastOrder?.customer?.email || '';
            if (defaultEmail) form.querySelector('#review-email').value = defaultEmail;

            const defaultName = state.lastOrder?.customer?.name || '';
            if (defaultName) form.querySelector('#review-name').value = defaultName;

            const defaultOrderId = (() => {
                const last = state.lastOrder;
                if (last && last.id && Array.isArray(last.lines) && last.lines.some(line => line.productId === prod.id)) {
                    return last.id;
                }
                const urlOrder = new URLSearchParams(location.search).get('orderId');
                return urlOrder && urlOrder.length > 6 ? urlOrder : '';
            })();
            if (defaultOrderId) form.querySelector('#review-order').value = defaultOrderId;

            form.querySelector('#review-rating').value = '5';

            let submitting = false;
            const statusBox = form.querySelector('#review-form-status');

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (submitting) return;
                const payload = {
                    name: form.querySelector('#review-name').value.trim() || undefined,
                    email: form.querySelector('#review-email').value.trim(),
                    orderId: form.querySelector('#review-order').value.trim(),
                    rating: parseInt(form.querySelector('#review-rating').value, 10),
                    title: form.querySelector('#review-title').value.trim() || undefined,
                    body: form.querySelector('#review-body').value.trim()
                };
                if (!payload.email || !payload.orderId || !payload.body) {
                    statusBox.textContent = 'Email, order ID, and review text are required.';
                    return;
                }
                submitting = true;
                statusBox.textContent = 'Submitting review…';
                try {
                    await submitProductReview(prod.id, payload);
                    pendingNotice.classList.remove('hidden');
                    statusBox.textContent = 'Thanks! Your review was submitted for moderation.';
                    notify('Review submitted for moderation', 'success', 4000);
                    localStorage.setItem('customerEmail', payload.email);
                    form.reset();
                    form.querySelector('#review-rating').value = '5';
                    hydrateReviews(true);
                } catch (err) {
                    statusBox.textContent = err.message || 'Submission failed';
                    notify('Review submission failed: ' + err.message, 'error', 6000);
                } finally {
                    submitting = false;
                }
            });

            form.querySelector('#refresh-reviews').addEventListener('click', async () => {
                statusBox.textContent = 'Refreshing…';
                await hydrateReviews(true);
                statusBox.textContent = '';
            });

            return form;
        }

        const reviewForm = buildReviewForm();
        panel.appendChild(reviewForm);
        rootEl.appendChild(panel);

        renderSummary(prod.reviewSummary);
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
            reviews: { status: 'pending', items: [] }
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
                    address: typeof data.address === 'string' ? data.address : ''
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
            address: formattedAddress
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
                const resendBtn = el('button', { class: 'resend-btn', attrs: { type: 'button', 'aria-label': 'Resend code' } }, '↻');
                const resendLabel = el('span', { class: 'resend-label help-text' }, 'Resend code in 30s');
                const codeField = el('div', { class: 'field verification-field' },
                    el('label', { attrs: { for: 'reg-code' } }, 'Code*'),
                    el('div', { class: 'input-inline' },
                        codeInput,
                        resendBtn
                    ),
                    resendLabel
                );

                let resendTimer = null;
                let resendRemaining = 30;
                function updateResendLabel() {
                    if (resendRemaining > 0) {
                        resendLabel.textContent = `Resend code in ${resendRemaining}s`;
                        resendBtn.disabled = true;
                    } else {
                        resendLabel.textContent = '';
                        resendBtn.disabled = false;
                    }
                }
                function startResendCountdown() {
                    if (resendTimer) clearInterval(resendTimer);
                    updateResendLabel();
                    if (resendRemaining <= 0) return;
                    resendTimer = setInterval(() => {
                        resendRemaining -= 1;
                        updateResendLabel();
                        if (resendRemaining <= 0 && resendTimer) {
                            clearInterval(resendTimer);
                            resendTimer = null;
                        }
                    }, 1000);
                }
                startResendCountdown();
                resendBtn.addEventListener('click', () => {
                    notify('Verification code resent.', 'info', 2600);
                    resendRemaining = 30;
                    startResendCountdown();
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
                        verificationCode: code,
                        shoppingPreference: preference,
                        dob: { day, month, year },
                        marketingOptIn,
                        termsAcceptedAt: new Date().toISOString()
                    };
                    try {
                        const res = await customerRegisterRequest({ name, email, password: pass, country, address: addressMeta });
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
        if (!res.ok) {
            let msg = `HTTP ${res.status}`;
            try { const j = await res.json(); msg = j.error || j.errors?.join(', ') || msg; } catch { }
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
            throw new Error(msg);
        }
        if (res.status === 204) return null; // no content
        return await res.json();
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
    async function cancelOrder(id) {
        return apiFetch(`/api/orders/${id}/cancel`, { method: 'POST' });
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

    const ensureCatalogPageStyles = (() => {
        let injected = false;
        return () => {
            if (injected) return;
            injected = true;
            const style = document.createElement('style');
            style.id = 'catalog-hero-style';
            style.textContent = `
.catalog-hero {
    max-width: min(1120px, 92vw);
    margin: 0 auto 2.75rem;
    padding: clamp(2.6rem, 2rem + 4vw, 3.6rem);
    border-radius: 32px;
    position: relative;
    overflow: hidden;
    color: #f8fafc;
    background: radial-gradient(circle at 12% 88%, rgba(244, 114, 182, 0.22), transparent 55%), radial-gradient(circle at 85% 12%, rgba(56, 189, 248, 0.25), transparent 45%), linear-gradient(135deg, #0f172a 0%, #1d4ed8 58%, #6366f1 100%);
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
    gap: clamp(2rem, 3vw, 3.5rem);
    box-shadow: 0 40px 90px -60px rgba(15, 23, 42, 0.72);
}
.catalog-hero::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 25% 20%, rgba(255, 255, 255, 0.12), transparent 52%);
    pointer-events: none;
    mix-blend-mode: screen;
    opacity: 0.7;
}
.catalog-hero-content {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 1.4rem;
    z-index: 1;
}
.catalog-hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.45rem 0.75rem;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.4);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}
.catalog-hero-title {
    font-size: clamp(2.5rem, 1.8rem + 2vw, 3.2rem);
    font-weight: 700;
    line-height: 1.05;
    letter-spacing: -0.03em;
    margin: 0;
}
.catalog-hero-copy {
    margin: 0;
    font-size: 1rem;
    line-height: 1.6;
    color: rgba(241, 245, 249, 0.88);
    max-width: 520px;
}
.catalog-hero-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 1.25rem;
}
.catalog-hero-stat {
    min-width: 140px;
    padding: 0.75rem 1rem;
    border-radius: 16px;
    background: rgba(15, 23, 42, 0.48);
    backdrop-filter: blur(14px);
    box-shadow: 0 18px 38px -28px rgba(15, 23, 42, 0.65);
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
}
.catalog-hero-stat .stat-value {
    font-size: 1.45rem;
    font-weight: 700;
    color: #f8fafc;
}
.catalog-hero-stat .stat-label {
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(241, 245, 249, 0.7);
}
.catalog-hero-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin-top: 0.2rem;
}
.catalog-hero-filter {
    border: 1px solid rgba(248, 250, 252, 0.35);
    background: rgba(15, 23, 42, 0.4);
    color: #f8fafc;
    padding: 0.55rem 0.85rem;
    border-radius: 12px;
    font-size: 0.78rem;
    font-weight: 600;
    transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}
.catalog-hero-filter:hover,
.catalog-hero-filter:focus-visible,
.catalog-hero-filter.active {
    outline: none;
    border-color: rgba(248, 250, 252, 0.8);
    background: rgba(248, 250, 252, 0.12);
    transform: translateY(-1px);
}
.catalog-hero-media {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
}
.catalog-hero-frame {
    position: relative;
    border-radius: 26px;
    padding: 0.65rem;
    background: linear-gradient(160deg, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0.05));
    box-shadow: 0 42px 90px -55px rgba(15, 23, 42, 0.7);
    backdrop-filter: blur(12px);
}
.catalog-hero-frame img {
    display: block;
    width: min(100%, 420px);
    border-radius: 20px;
    object-fit: cover;
}
.catalog-hero-tag {
    position: absolute;
    bottom: 6%;
    right: 8%;
    padding: 0.5rem 1rem;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.65);
    color: #f8fafc;
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    box-shadow: 0 16px 32px -28px rgba(15, 23, 42, 0.7);
}
@media (max-width: 960px) {
    .catalog-hero {
        grid-template-columns: 1fr;
        padding: clamp(2.3rem, 5vw, 3rem);
        gap: 2.4rem;
    }
    .catalog-hero-media {
        justify-content: flex-start;
    }
    .catalog-hero-frame img {
        width: 100%;
        max-width: 480px;
    }
    .catalog-hero-tag {
        bottom: auto;
        top: 8%;
        right: 6%;
    }
}
@media (max-width: 640px) {
    .catalog-hero {
        border-radius: 24px;
    }
    .catalog-hero-stats {
        gap: 0.85rem;
    }
    .catalog-hero-stat {
        min-width: calc(50% - 0.5rem);
    }
    .catalog-hero-tag {
        position: static;
        align-self: flex-start;
        margin-top: 1rem;
    }
}
`;
            document.head?.appendChild(style);
        };
    })();

    function renderCatalog() {
        ensureCatalogPageStyles();
        rootEl.innerHTML = '';

        const availableProducts = state.products.filter(p => !p.deletedAt);
        const baseProducts = availableProducts.slice();
        const weightedRating = availableProducts.reduce((acc, product) => {
            const summary = product.reviewSummary;
            if (summary && summary.count > 0 && typeof summary.average === 'number') {
                acc.sum += summary.average * summary.count;
                acc.count += summary.count;
            }
            return acc;
        }, { sum: 0, count: 0 });
        const averageRating = weightedRating.count ? weightedRating.sum / weightedRating.count : null;
        const averageRatingLabel = averageRating ? `${averageRating.toFixed(1)}★` : 'First look';
        const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
        const now = Date.now();
        const newDropCount = availableProducts.filter(product => {
            const created = new Date(product.createdAt || '').getTime();
            return Number.isFinite(created) && (now - created) <= THIRTY_DAYS;
        }).length;

        const quickFilterConfig = [
            { label: 'Classic tees', term: 'classic' },
            { label: 'Essential picks', term: 'essential' },
            { label: 'Breathable cotton', term: 'cotton' },
            { label: 'New drops', term: 'new' }
        ];

        const heroSection = el('section', { class: 'catalog-hero' },
            el('div', { class: 'catalog-hero-content' },
                el('span', { class: 'catalog-hero-badge' }, 'Season 07 · Daily Essentials'),
                el('h1', { class: 'catalog-hero-title' }, 'Refresh Your Everyday Rotation'),
                el('p', { class: 'catalog-hero-copy' }, 'Discover breathable staples built to flex with your day. Explore balanced color stories and premium cotton blends curated by our merch team.'),
                el('div', { class: 'catalog-hero-stats' },
                    el('div', { class: 'catalog-hero-stat' },
                        el('span', { class: 'stat-value' }, `${availableProducts.length}+`),
                        el('span', { class: 'stat-label' }, 'Catalog entries')
                    ),
                    el('div', { class: 'catalog-hero-stat' },
                        el('span', { class: 'stat-value' }, newDropCount ? `${newDropCount}` : 'Fresh'),
                        el('span', { class: 'stat-label' }, newDropCount ? 'New this month' : 'Weekly refresh')
                    ),
                    el('div', { class: 'catalog-hero-stat' },
                        el('span', { class: 'stat-value' }, averageRatingLabel),
                        el('span', { class: 'stat-label' }, 'Community score')
                    )
                ),
                el('div', { class: 'catalog-hero-filters' },
                    ...quickFilterConfig.map(filter => el('button', {
                        class: 'catalog-hero-filter',
                        attrs: { type: 'button', 'data-term': filter.term }
                    }, filter.label))
                )
            ),
            el('div', { class: 'catalog-hero-media' },
                el('div', { class: 'catalog-hero-frame' },
                    el('img', {
                        attrs: {
                            src: productPlaceholder(1080),
                            alt: 'Folded cotton tees in gradient tones',
                            loading: 'lazy'
                        }
                    })
                ),
                el('div', { class: 'catalog-hero-tag' }, 'New drop every Friday')
            )
        );
        rootEl.appendChild(heroSection);

        const heroFilters = Array.from(heroSection.querySelectorAll('.catalog-hero-filter[data-term]'));
        const syncHeroFilters = (normalizedTerm) => {
            const activeTerm = (normalizedTerm || '').trim();
            heroFilters.forEach(btn => {
                const btnTerm = (btn.getAttribute('data-term') || '').toLowerCase();
                btn.classList.toggle('active', !!activeTerm && activeTerm === btnTerm);
            });
        };

        const panel = el('section', { class: 'panel catalog-panel' });
        const panelBody = el('div', { class: 'catalog-panel-body' });
        const header = el('div', { class: 'catalog-header' },
            el('div', { class: 'catalog-heading' },
                el('h2', { class: 'catalog-title' }, 'Catalog')
            ),
            el('form', { class: 'catalog-search', attrs: { id: 'catalog-search-form', role: 'search' } },
                el('label', { class: 'sr-only', attrs: { for: 'catalog-search-input' } }, 'Search catalog'),
                el('input', {
                    class: 'catalog-search-input',
                    attrs: {
                        id: 'catalog-search-input',
                        type: 'search',
                        placeholder: 'Search...',
                        autocomplete: 'off'
                    }
                }),
                el('button', { class: 'btn btn-small catalog-search-btn', attrs: { type: 'submit' } }, 'Search')
            )
        );
        panelBody.appendChild(header);
        panel.appendChild(panelBody);
        rootEl.appendChild(panel);

        const searchForm = header.querySelector('#catalog-search-form');
        const searchInput = header.querySelector('#catalog-search-input');

        const grid = el('div', { class: 'catalog-grid' });
        panelBody.appendChild(grid);

        let productsShown = baseProducts.slice();

        function buildCard(p) {
            const card = el('article', { class: 'product-card catalog-card', attrs: { 'data-id': p.id } });

            const media = el('div', { class: 'catalog-card-media' },
                el('img', {
                    attrs: {
                        src: p.images && p.images[0] ? p.images[0] : productPlaceholder(640),
                        alt: p.title,
                        loading: 'lazy'
                    }
                })
            );
            card.appendChild(media);

            card.appendChild(el('h3', { class: 'product-title catalog-card-title' }, p.title));

            const priceLine = el('div', { class: 'catalog-card-meta' },
                el('span', { class: 'price catalog-card-price', attrs: { 'data-price-cents': p.priceCents } }, money(p.priceCents)),
                inventoryBadge(p)
            );
            card.appendChild(priceLine);

            if (p.reviewSummary && p.reviewSummary.count > 0) {
                const rating = renderStarRating(p.reviewSummary.average, p.reviewSummary.count, { size: 'xs' });
                rating.classList.add('catalog-card-rating');
                card.appendChild(rating);
            }

            const favActive = isFavorite(p.id);
            const actions = el('div', { class: 'catalog-card-actions' },
                el('button', { class: 'btn btn-small catalog-action-view', attrs: { 'data-view-id': p.id, type: 'button' } }, 'View'),
                el('button', { class: 'btn btn-small btn-outline catalog-action-add', attrs: { 'data-add': p.id, type: 'button' } }, 'Add'),
                el('button', {
                    class: 'catalog-fav-btn' + (favActive ? ' active' : ''),
                    attrs: {
                        'data-fav': p.id,
                        'aria-pressed': favActive ? 'true' : 'false',
                        type: 'button',
                        title: favActive ? 'Remove from favorites' : 'Add to favorites'
                    }
                }, favActive ? '♥' : '♡')
            );
            card.appendChild(actions);

            return card;
        }

        function renderItems() {
            grid.innerHTML = '';
            if (!productsShown.length) {
                grid.classList.add('is-empty');
                grid.appendChild(el('div', { class: 'catalog-empty-state' }, 'No products match your search right now.'));
                updateFavoriteIcons(panel);
                return;
            }
            grid.classList.remove('is-empty');
            productsShown.forEach(p => grid.appendChild(buildCard(p)));
            updateFavoriteIcons(panel);
        }

        grid.addEventListener('click', (e) => {
            const favBtn = e.target.closest('[data-fav]');
            if (favBtn) {
                e.preventDefault();
                toggleFavorite(favBtn.getAttribute('data-fav'));
                updateFavoriteIcons(panel);
                return;
            }
            const addBtn = e.target.closest('[data-add]');
            if (addBtn) {
                addToCart(addBtn.getAttribute('data-add'), 1);
                return;
            }
            const viewBtn = e.target.closest('[data-view-id]');
            if (viewBtn) {
                navigate('product', { id: viewBtn.getAttribute('data-view-id') });
            }
        });

        const runSearch = () => {
            const normalizedTerm = (searchInput?.value || '').trim().toLowerCase();
            if (!normalizedTerm) {
                productsShown = baseProducts.slice();
            } else {
                productsShown = baseProducts.filter(p => {
                    const title = (p.title || '').toLowerCase();
                    const desc = (p.description || '').toLowerCase();
                    const tags = Array.isArray(p.tags) ? p.tags : [];
                    return title.includes(normalizedTerm) || desc.includes(normalizedTerm) || tags.some(t => (t || '').toLowerCase().includes(normalizedTerm));
                });
            }
            renderItems();
            syncHeroFilters(normalizedTerm);
        };

        heroFilters.forEach(btn => {
            btn.addEventListener('click', () => {
                const term = btn.getAttribute('data-term') || '';
                if (searchInput) {
                    searchInput.value = term;
                    runSearch();
                    try { searchInput.focus(); } catch { /* no-op */ }
                } else {
                    state.pendingCatalogSearchTerm = term;
                }
                if (typeof panel.scrollIntoView === 'function') {
                    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });

        searchForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            runSearch();
        });

        searchInput?.addEventListener('input', () => {
            if (!(searchInput.value || '').trim()) runSearch();
        });

        // Initial render
        renderItems();
        syncHeroFilters((searchInput?.value || '').trim().toLowerCase());
        if (state.pendingCatalogSearchTerm) {
            const term = state.pendingCatalogSearchTerm;
            state.pendingCatalogSearchTerm = '';
            if (searchInput) {
                searchInput.value = term;
                runSearch();
                try { searchInput.focus(); } catch { /* no-op */ }
            }
        }
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

        const galleryWrap = el('div', { class: 'pd-gallery', attrs: { tabIndex: '0' } }, mainWrap, imageIndicator);
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
        const infoCol = el('div', { class: 'product-detail-info flex flex-col gap-md' },
            el('h1', { class: 'product-detail-title' }, prod.title),
            el('div', { class: 'flex gap-sm align-center' }, el('span', { class: 'price big-price', attrs: { 'data-price-cents': prod.priceCents } }, money(prod.priceCents)), inventoryBadge(prod)),
            (prod.reviewSummary && prod.reviewSummary.count > 0 ? renderStarRating(prod.reviewSummary.average, prod.reviewSummary.count, { size: 'md' }) : el('div', { class: 'tiny muted' }, 'No reviews yet')),
            prod.tags && prod.tags.length ? el('div', { class: 'tag-list' }, ...prod.tags.map(t => el('span', { class: 'tag' }, t))) : null,
            el('p', { class: 'product-detail-desc' }, prod.description || 'No description.'),
            variantsBox,
            el('label', { class: 'inline-fields' }, 'Qty', el('input', { attrs: { id: 'prod-qty', type: 'number', min: '1', value: '1', style: 'width:70px' } })),
            el('div', { class: 'flex gap-sm' },
                el('button', { class: 'btn btn-success', attrs: { id: 'add-cart-btn', type: 'button' } }, 'Add to Cart'),
                el('button', { class: 'btn btn-outline', attrs: { 'data-route': 'catalog', type: 'button' } }, 'Back')
            )
        );
        const layout = el('section', { class: 'product-detail enhanced' }, galleryWrap, infoCol);
        rootEl.appendChild(layout);
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
            const relWrap = el('div', { class: 'related mt-lg' }, el('h3', { class: 'h5' }, 'Related Items'),
                el('div', { class: 'related-grid' }, ...related.map(r => el('div', { class: 'related-card', attrs: { 'data-rel-id': r.id } },
                    el('img', { attrs: { src: (Array.isArray(r.images) && r.images.length ? r.images[0] : productPlaceholder(360)), alt: r.title, loading: 'lazy' } }),
                    el('div', { class: 'rc-body' }, el('div', { class: 'rc-title tiny' }, r.title), el('div', { class: 'rc-price tiny', attrs: { 'data-price-cents': r.priceCents } }, money(r.priceCents)))
                ))));
            rootEl.appendChild(relWrap);
            relWrap.addEventListener('click', e => { const c = e.target.closest('[data-rel-id]'); if (c) showProductDetail(c.getAttribute('data-rel-id')); });
        }
        // Recently viewed
        const RV_KEY = 'recentlyViewed';
        let rv = []; try { rv = JSON.parse(localStorage.getItem(RV_KEY) || '[]'); } catch { rv = []; }
        rv = rv.filter(x => x !== prod.id); rv.unshift(prod.id); if (rv.length > 20) rv = rv.slice(0, 20);
        localStorage.setItem(RV_KEY, JSON.stringify(rv));
        const recents = rv.filter(pid => pid !== prod.id).map(pid => state.productsById.get(pid)).filter(Boolean).slice(0, 6);
        if (recents.length) {
            const rvWrap = el('div', { class: 'recently-viewed mt-lg' }, el('h3', { class: 'h5' }, 'Recently Viewed'),
                el('div', { class: 'rv-grid' }, ...recents.map(r => el('div', { class: 'rv-item', attrs: { 'data-rv-id': r.id } },
                    el('img', { attrs: { src: (r.images && r.images[0]) || productPlaceholder(320), alt: r.title, loading: 'lazy' } })
                ))));
            rootEl.appendChild(rvWrap);
            rvWrap.addEventListener('click', e => { const c = e.target.closest('[data-rv-id]'); if (c) showProductDetail(c.getAttribute('data-rv-id')); });
        }

        const summarySnippet = (() => {
            const safe = prod.reviewSummary || { count: 0, average: null, totalQuantity: 0 };
            const count = safe.count || 0;
            const wrap = el('div', { class: 'review-summary-preview flex flex-col gap-xs' });
            wrap.appendChild(el('div', { class: 'review-summary-main flex gap-sm align-center' },
                renderStarRating(safe.average ?? null, count || null, { size: 'md' }),
                el('div', { class: 'flex flex-col' },
                    el('span', { class: 'summary-average' }, count ? `${(safe.average ?? 0).toFixed(1)} / 5` : 'No ratings yet'),
                    el('span', { class: 'summary-count tiny muted' }, count ? `${count} review${count === 1 ? '' : 's'}` : 'Be the first to review')
                )
            ));
            if (count) {
                wrap.appendChild(el('div', { class: 'summary-total tiny muted' }, `Verified units purchased: ${safe.totalQuantity || 0}`));
            }
            return wrap;
        })();

        const teaserCopy = (prod.reviewSummary?.count || 0)
            ? 'Read what other buyers are saying or share your experience.'
            : 'Be the first to review this product.';

        const reviewTeaser = el('section', { class: 'panel product-reviews-preview mt-lg' },
            el('div', { class: 'panel-header flex align-center justify-between gap-sm flex-wrap' },
                el('span', {}, 'Product Reviews'),
                el('button', { class: 'btn btn-small btn-outline', attrs: { 'data-route': 'product-reviews', 'data-id': prod.id } }, 'View Reviews')
            ),
            summarySnippet,
            el('p', { class: 'tiny muted mt-sm' }, teaserCopy)
        );
        rootEl.appendChild(reviewTeaser);

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
        const panel = el('section', { class: 'panel' },
            el('div', { class: 'panel-header' },
                el('span', {}, 'Your Cart'),
                el('button', {
                    class: 'btn btn-small btn-outline',
                    attrs: { 'data-route': 'catalog' }
                }, 'Back to Catalog')
            )
        );

        if (state.cart.length === 0) {
            panel.appendChild(el('p', { class: 'muted' }, 'Your cart is empty.'));
            rootEl.appendChild(panel);
            return;
        }

        const tableWrap = el('div', { class: 'cart-table-wrapper' });
        const table = el('table', { class: 'cart' });
        table.innerHTML = `
      <thead>
        <tr>
          <th>Product</th>
          <th>Unit</th>
          <th>Qty</th>
          <th>Line Total</th>
          <th></th>
        </tr>
      </thead>
      <tbody></tbody>
      <tfoot></tfoot>
    `;
        const tbody = table.querySelector('tbody');
        let subtotal = 0;
        for (const line of state.cart) {
            const prod = state.productsById.get(line.productId);
            if (!prod) continue;
            const lt = prod.priceCents * line.quantity;
            subtotal += lt;
            const variantLabel = (line.variantId && prod.variants) ? (() => { const v = prod.variants.find(v => v.id === line.variantId); if (!v) return ''; const lab = Object.values(v.optionValues || {}).join(' / ') || v.sku || v.id.slice(0, 6); return ' (' + lab + ')'; })() : '';
            const lineKey = line.productId + '::' + (line.variantId || '');
            const tr = el('tr', { attrs: { 'data-line-key': lineKey } },
                el('td', {}, prod.title + variantLabel),
                el('td', {}, money(prod.priceCents)),
                el('td', {},
                    el('input', {
                        class: 'qty-input',
                        attrs: {
                            type: 'number',
                            value: String(line.quantity),
                            min: '1',
                            'data-qty-key': lineKey
                        }
                    })
                ),
                el('td', {}, money(lt)),
                el('td', {},
                    el('button', {
                        class: 'btn btn-small btn-danger',
                        attrs: { 'data-remove-key': lineKey }
                    }, 'Remove')
                )
            );
            tbody.appendChild(tr);
        }

        const tfoot = table.querySelector('tfoot');
        const tax = Math.round(subtotal * 0.075);
        const total = subtotal + tax;

        tfoot.appendChild(el('tr', {},
            el('td', { attrs: { colspan: '3' } }, 'Subtotal'),
            el('td', {}, money(subtotal)),
            el('td')
        ));
        tfoot.appendChild(el('tr', {},
            el('td', { attrs: { colspan: '3' } }, 'Tax (7.5%)'),
            el('td', {}, money(tax)),
            el('td')
        ));
        tfoot.appendChild(el('tr', {},
            el('td', { attrs: { colspan: '3' }, class: 'bold' }, 'Total'),
            el('td', { class: 'bold' }, money(total)),
            el('td')
        ));

        tableWrap.appendChild(table);
        panel.appendChild(tableWrap);

        /* --- Discount & Shipping Estimator Section --- */
        const estBox = el('div', { class: 'cart-estimator mt-lg' });
        const summaryBox = el('div', { class: 'cart-summary-box' });
        const discountField = (function () {
            const wrap = el('div', { class: 'cart-discount-field' });
            wrap.appendChild(el('label', { attrs: { for: 'cart-discount-code' } }, 'Discount Code'));
            const input = el('input', { attrs: { id: 'cart-discount-code', type: 'text', value: state.cartPage.discountCode || '' } });
            const btn = el('button', { class: 'btn btn-small', attrs: { id: 'cart-discount-apply', type: 'button' } }, state.cartPage.discountApplied ? 'Applied' : 'Apply');
            if (state.cartPage.discountApplied) btn.classList.add('applied');
            wrap.appendChild(el('div', { class: 'cart-discount-row' }, input, btn));
            return wrap;
        })();
        const shipField = (function () {
            const wrap = el('div', { class: 'cart-ship-field' });
            wrap.appendChild(el('label', { attrs: { for: 'cart-ship-country' } }, 'Ship To'));
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
            wrap.appendChild(sel);
            return wrap;
        })();
        const progressWrap = el('div', { class: 'free-ship-progress hidden' },
            el('div', { class: 'bar' }),
            el('div', { class: 'fs-label' })
        );
        const totalsBox = el('div', { class: 'cart-totals' });
        summaryBox.appendChild(discountField);
        summaryBox.appendChild(shipField);
        summaryBox.appendChild(progressWrap);
        summaryBox.appendChild(totalsBox);
        estBox.appendChild(summaryBox);
        panel.appendChild(estBox);

        const checkoutBtn = el('button', { class: 'btn mt-md', attrs: { id: 'checkout-btn' } }, 'Checkout');
        panel.appendChild(checkoutBtn);

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
            const inp = e.target.closest('[data-qty-key]');
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
                container.innerHTML = '';
                container.appendChild(el('button', { class: 'modal-close', attrs: { type: 'button' } }, '×'));
                container.appendChild(el('h2', {}, 'Checkout (Fallback)'));
                container.appendChild(el('div', { class: 'small mb-sm muted' }, 'Fallback form shown due to script issue.'));
                container.appendChild(el('ul', { class: 'mb-sm', attrs: { style: 'font-size:.7rem;max-height:110px;overflow:auto;' } }, ...cartLines.map(l => el('li', {}, l.quantity + '× ' + l.title + (l.variantLabel ? ' (' + l.variantLabel + ')' : '')))));
                const fb = el('form', { class: 'flex flex-col gap-sm', attrs: { id: 'checkout-fallback-form' } },
                    el('input', { attrs: { id: 'fb-name', placeholder: 'Name', required: 'true' } }),
                    el('input', { attrs: { id: 'fb-email', placeholder: 'Email', required: 'true', type: 'email' } }),
                    el('textarea', { attrs: { id: 'fb-address', placeholder: 'Address', required: 'true', style: 'min-height:60px;' } }),
                    el('select', { attrs: { id: 'fb-country' } }, el('option', { attrs: { value: 'US' } }, 'United States'), el('option', { attrs: { value: 'CA' } }, 'Canada'), el('option', { attrs: { value: 'DE' } }, 'Germany'), el('option', { attrs: { value: 'OTHER' } }, 'Other')),
                    el('div', {}, el('button', { class: 'btn btn-success', attrs: { type: 'submit' } }, 'Place Order'), ' ', el('button', { class: 'btn btn-outline', attrs: { type: 'button', id: 'fb-cancel' } }, 'Cancel'))
                );
                container.appendChild(fb);
                if (state.customer) {
                    const nameInput = fb.querySelector('#fb-name');
                    const emailInput = fb.querySelector('#fb-email');
                    const addressInput = fb.querySelector('#fb-address');
                    const countrySelect = fb.querySelector('#fb-country');
                    if (nameInput && state.customer.name) nameInput.value = state.customer.name;
                    if (emailInput && state.customer.email) emailInput.value = state.customer.email;
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
                    const customer = { name: document.getElementById('fb-name').value.trim(), email: document.getElementById('fb-email').value.trim(), address: document.getElementById('fb-address').value.trim(), country: document.getElementById('fb-country').value };
                    if (!customer.name || !customer.email || !customer.address) { notify('Fill all fields', 'warn'); return; }
                    try {
                        showSpinner(true);
                        const payloadLines = cartLines.map(line => ({ productId: line.productId, quantity: line.quantity, variantId: line.variantId }));
                        const orderRes = await createOrder(payloadLines, customer);
                        state.cart = []; saveCart(); closeFn(); state.lastOrder = { id: orderRes.id, subtotalCents: orderRes.subtotalCents, discountCents: orderRes.discountCents, shippingCents: orderRes.shippingCents, shippingDiscountCents: orderRes.shippingDiscountCents, totalCents: orderRes.totalCents, lines: cartLines, customer }; navigate('order-confirmation');
                    } catch (err) { notify('Fallback order failed: ' + err.message, 'error', 6000); }
                    finally { showSpinner(false); }
                });
            }

            // Main rich form build wrapped in try so fallback can still appear if it breaks
            try {
                const summary = el('div', { class: 'mb-md' });
                for (const line of cartLines) {
                    const displayTitle = line.title + (line.variantLabel ? ' (' + line.variantLabel + ')' : '');
                    summary.appendChild(el('div', { class: 'flex gap-sm' }, el('span', { class: 'bold' }, line.quantity + '×'), el('span', {}, displayTitle), el('span', { class: 'muted' }, money(line.unitPriceCents * line.quantity))));
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
                const breakdownBox = el('div', { class: 'mt-md', attrs: { id: 'checkout-breakdown' } });
                function renderBreakdown() {
                    breakdownBox.innerHTML = '';
                    breakdownBox.appendChild(el('div', {}, 'Subtotal: ' + money(estSubtotal)));
                    if (estDiscount > 0) breakdownBox.appendChild(el('div', { class: 'muted' }, 'Item Discount: -' + money(estDiscount)));
                    breakdownBox.appendChild(el('div', {}, 'Shipping: ' + money(estShipping)));
                    if (estShipDiscount > 0) breakdownBox.appendChild(el('div', { class: 'muted' }, 'Shipping Discount: -' + money(estShipDiscount)));
                    breakdownBox.appendChild(el('div', {}, 'Tax: ' + money(estTax)));
                    breakdownBox.appendChild(el('div', { class: 'bold' }, 'Total: ' + money(estSubtotal - estDiscount + estTax + estShipping - estShipDiscount)));
                }
                renderBreakdown();
                summary.appendChild(breakdownBox);
                const form = el('form', { class: 'form-grid mt-md', attrs: { id: 'checkout-form', autocomplete: 'off' } },
                    fieldInput('Name', 'cust-name', 'text', true),
                    fieldInput('Email', 'cust-email', 'text', true),
                    fieldTextArea('Address', 'cust-address', true),
                    (function () { const field = el('div', { class: 'field' }); field.appendChild(el('label', { attrs: { for: 'cust-country' } }, 'Country')); const sel = el('select', { attrs: { id: 'cust-country', required: 'true' } }, el('option', { attrs: { value: 'PH' } }, 'Philippines'), el('option', { attrs: { value: 'US' } }, 'United States'), el('option', { attrs: { value: 'CA' } }, 'Canada'), el('option', { attrs: { value: 'DE' } }, 'Germany'), el('option', { attrs: { value: 'FR' } }, 'France'), el('option', { attrs: { value: 'ES' } }, 'Spain'), el('option', { attrs: { value: 'IT' } }, 'Italy'), el('option', { attrs: { value: 'JP' } }, 'Japan'), el('option', { attrs: { value: 'AU' } }, 'Australia'), el('option', { attrs: { value: 'OTHER' } }, 'Other / International')); field.appendChild(sel); return field; })(),
                    fieldInput('Discount Code (items)', 'discount-code', 'text', false),
                    fieldInput('Shipping Code', 'shipping-code', 'text', false),
                    el('div', { class: 'field', attrs: { style: 'grid-column:1/-1;' } }, el('button', { class: 'btn btn-success', attrs: { type: 'submit' } }, 'Place Order'), ' ', el('button', { class: 'btn btn-outline', attrs: { type: 'button', id: 'cancel-checkout' } }, 'Cancel'))
                );
                if (state.customer) {
                    const nameInput = form.querySelector('#cust-name');
                    const emailInput = form.querySelector('#cust-email');
                    const addressInput = form.querySelector('#cust-address');
                    const countrySelect = form.querySelector('#cust-country');
                    if (nameInput && state.customer.name) nameInput.value = state.customer.name;
                    if (emailInput && state.customer.email) emailInput.value = state.customer.email;
                    if (addressInput && state.customer.address) addressInput.value = state.customer.address;
                    if (countrySelect && state.customer.country) {
                        const match = Array.from(countrySelect.options || []).some(opt => opt.value === state.customer.country);
                        countrySelect.value = match ? state.customer.country : 'OTHER';
                    }
                }
                wrap.querySelector('#checkout-loading')?.remove();
                wrap.appendChild(summary);
                wrap.appendChild(form);
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
                    summary.querySelectorAll('.flex.gap-sm span.muted').forEach((priceSpan, idx) => {
                        const line = cartLines[idx];
                        if (!line) return;
                        const prod = state.productsById.get(line.productId);
                        if (!prod) return;
                        priceSpan.textContent = money(prod.priceCents * line.quantity);
                    });
                    renderBreakdown();
                }
                recalcShipping();
                form.addEventListener('change', e => { if (e.target && e.target.id === 'cust-country') recalcShipping(); });
                const dcInput = form.querySelector('#discount-code'); const shipInput = form.querySelector('#shipping-code');
                // Removed localStorage prefill so user must manually type codes each checkout.
                // Inject Apply buttons so discounts are not auto applied
                const dcField = dcInput.parentElement; const shipField = shipInput.parentElement;
                dcField.classList.add('code-field'); shipField.classList.add('code-field');
                const dcApplyBtn = el('button', { class: 'btn discount-apply-btn', attrs: { type: 'button', 'data-apply-kind': 'item' } }, 'Apply');
                const shipApplyBtn = el('button', { class: 'btn discount-apply-btn', attrs: { type: 'button', 'data-apply-kind': 'ship' } }, 'Apply');
                dcField.appendChild(dcApplyBtn); shipField.appendChild(shipApplyBtn);
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
                        address: form.querySelector('#cust-address').value.trim(),
                        country: form.querySelector('#cust-country').value.trim()
                    };
                    if (!customer.name || !customer.email || !customer.address) { notify('Fill all customer info', 'warn'); return; }
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
                            customer
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
        rootEl.innerHTML = '';
        const data = state.lastOrder;
        if (!data) { navigate('home'); return; }
        const panel = el('section', { class: 'panel' },
            el('div', { class: 'panel-header' }, el('span', {}, 'Order Confirmation')),
            el('div', { class: 'mt-md' },
                el('p', {}, 'Thank you, ', el('strong', {}, data.customer.name), '! Your order has been placed.'),
                el('p', {}, 'Order ID: ', el('code', {}, data.id)),
                el('div', { class: 'mt-sm' },
                    el('h3', {}, 'Items'),
                    el('ul', {}, ...data.lines.map(l => {
                        const prod = state.productsById.get(l.productId);
                        return el('li', {}, l.quantity + '× ' + (prod ? prod.title : l.title));
                    }))
                ),
                el('div', { class: 'mt-sm' },
                    el('div', {}, 'Subtotal: ' + money(data.subtotalCents)),
                    data.discountCents ? el('div', { class: 'muted' }, 'Item Discount: -' + money(data.discountCents)) : null,
                    el('div', {}, 'Shipping: ' + money(data.shippingCents || 0)),
                    data.shippingDiscountCents ? el('div', { class: 'muted' }, 'Shipping Discount: -' + money(data.shippingDiscountCents)) : null,
                    el('div', { class: 'bold' }, 'Total: ' + money(data.totalCents))
                ),
                el('div', { class: 'mt-md' },
                    el('button', { class: 'btn', attrs: { 'data-route': 'catalog' } }, 'Continue Shopping'),
                    ' ',
                    el('button', { class: 'btn btn-outline', attrs: { 'data-route': 'home' } }, 'Home')
                )
            )
        );
        rootEl.appendChild(panel);
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
                        }))
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

        const content = el('div', { class: 'mo-orders', attrs: { id: 'my-orders-content' } });

        shell.appendChild(searchBar);
        shell.appendChild(tabBar);
        shell.appendChild(content);
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

        function buildOrderCard(order) {
            if (!order) return el('div');
            const status = buildStatusMeta(order);
            const card = el('article', { class: 'mo-order-card', attrs: { 'data-order-id': order.id } });
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
                    order.returnRequestedAt ? el('span', { class: 'mo-status-chip mo-status-chip--returns' }, 'Return Requested') : null
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
                order.completedAt && !order.returnRequestedAt ? el('button', { class: 'mo-button mo-button--ghost mo-button--compact', attrs: { 'data-return': order.id } }, 'Return / Refund') : null,
                el('button', { class: 'mo-button mo-button--ghost mo-button--compact', attrs: { 'data-toggle-detail': order.id, 'aria-expanded': 'false' } }, 'View details')
            );

            const detailSections = [];
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

        function renderOrders() {
            const orders = deriveMyOrders();
            const enriched = orders.map(o => mergedOrder(o)).filter(Boolean);
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
                el('div', { class: 'inline-fields' },
                    el('button', { class: 'btn btn-small btn-danger', attrs: { id: 'bulk-delete-btn', disabled: 'true' } }, 'Delete Selected')
                    , el('label', { class: 'flex gap-xs align-center', attrs: { style: 'font-size:.75rem;margin-left:.5rem;' } },
                        el('input', { attrs: { type: 'checkbox', id: 'toggle-show-deleted' } }),
                        el('span', {}, 'Show Deleted')
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

        const ordersWrap = el('div', { class: 'panel mt-md', attrs: { 'data-admin-section': 'orders' } },
            el('div', { class: 'panel-header' },
                el('span', {}, 'Orders'),
                el('div', { class: 'inline-fields' },
                    el('button', { class: 'btn btn-small btn-outline', attrs: { id: 'orders-refresh-btn' } }, 'Refresh')
                )
            ),
            el('div', { class: 'admin-table-wrapper' }, el('table', { class: 'admin-table', attrs: { id: 'admin-orders-table' } }))
        );
        rootEl.appendChild(ordersWrap);
        sectionRefs.set('orders', ordersWrap);

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
            const secondaryBtn = deletedView
                ? el('button', { class: 'btn btn-compact btn-success', attrs: { 'data-restore': product.id } }, 'Restore')
                : el('button', { class: 'btn btn-compact btn-danger', attrs: { 'data-del': product.id } }, 'Delete');
            const stackClass = deletedView ? 'admin-actions-stack admin-actions-stack--restore' : 'admin-actions-stack';
            return el('td', { class: 'admin-actions-cell' },
                el('div', { class: stackClass }, editBtn, secondaryBtn)
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
            function updateBulkButton() {
                const selected = tbody.querySelectorAll('input[data-select-id]:checked').length;
                if (selected > 0) { bulkBtn.removeAttribute('disabled'); bulkBtn.textContent = `Delete Selected (${selected})`; }
                else { bulkBtn.setAttribute('disabled', 'true'); bulkBtn.textContent = 'Delete Selected'; }
            }
            // Hide bulk delete controls when viewing deleted history
            if (state.admin.showDeleted) {
                bulkBtn.style.display = 'none';
            } else {
                bulkBtn.style.display = '';
            }
            if (!pt._wired) {
                pt._wired = true;
                pt.addEventListener('change', (e) => {
                    if (e.target.id === 'select-all-products') {
                        const checked = e.target.checked; tbody.querySelectorAll('input[data-select-id]').forEach(cb => cb.checked = checked); updateBulkButton();
                    } else if (e.target.hasAttribute('data-select-id')) { updateBulkButton(); }
                });
                bulkBtn.addEventListener('click', async () => {
                    const ids = Array.from(tbody.querySelectorAll('input[data-select-id]:checked')).map(cb => cb.getAttribute('data-select-id'));
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
                pt.addEventListener('click', async (e) => {
                    const btnEdit = e.target.closest('[data-edit]');
                    const btnDel = e.target.closest('[data-del]');
                    const btnRestore = e.target.closest('[data-restore]');
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
                    }
                });
            } else { updateBulkButton(); }
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
        // Orders table
        const ot = document.getElementById('admin-orders-table');
        if (ot) {
            ot.innerHTML = `
            <thead><tr><th>ID</th><th>Items</th><th>Subtotal</th><th>Item Disc</th><th>Ship</th><th>Ship Disc</th><th>Total</th><th>Codes</th><th>Status</th><th>Timestamps</th><th>Customer</th><th>Actions</th></tr></thead><tbody></tbody>`;
            const tbody = ot.querySelector('tbody');
            for (const o of state.admin.orders) {
                const customerLabel = o.customerName || o.customerEmail || '—';
                const itemsText = o.items && o.items.length ? o.items.map(i => `${i.quantity}×${i.titleSnapshot}`).join('; ') : '—';
                const tsParts = [];
                if (o.paidAt) tsParts.push('Paid:' + new Date(o.paidAt).toLocaleString());
                if (o.fulfilledAt) tsParts.push('Fulfilled:' + new Date(o.fulfilledAt).toLocaleString());
                if (o.shippedAt) tsParts.push('Shipped:' + new Date(o.shippedAt).toLocaleString());
                if (o.completedAt) tsParts.push('Delivered:' + new Date(o.completedAt).toLocaleString());
                if (o.cancelledAt) tsParts.push('Cancelled:' + new Date(o.cancelledAt).toLocaleString());
                const statusValue = typeof o.status === 'string' ? o.status : 'unknown';
                const normalizedStatus = statusValue.toLowerCase();
                const statusClassMap = {
                    cancelled: 'cancelled',
                    created: 'created',
                    paid: 'paid',
                    completed: 'completed',
                    approved: 'approved',
                    rejected: 'not-approved'
                };
                const statusClass = statusClassMap[normalizedStatus] || '';
                const statusLabel = statusValue.replace(/_/g, ' ');
                const statusPill = el('span', { class: `status-chip${statusClass ? ' ' + statusClass : ''}` }, statusLabel);
                const tr = el('tr', {},
                    el('td', {}, o.id.slice(0, 8) + '…'),
                    el('td', {}, itemsText),
                    el('td', {}, money(o.subtotalCents)),
                    el('td', {}, o.discountCents ? '-' + money(o.discountCents, { showBase: false }) : '—'),
                    el('td', {}, money(o.shippingCents || 0)),
                    el('td', {}, o.shippingDiscountCents ? '-' + money(o.shippingDiscountCents, { showBase: false }) : '—'),
                    el('td', {}, money(o.totalCents)),
                    el('td', {}, [o.discountCode, o.shippingCode].filter(Boolean).join(' | ') || '—'),
                    el('td', {}, statusPill),
                    el('td', {}, tsParts.join(' | ') || new Date(o.createdAt).toLocaleString()),
                    el('td', {}, customerLabel),
                    el('td', {}, buildOrderActions(o))
                );
                tbody.appendChild(tr);
            }
            if (!ot._wired) {
                ot._wired = true;
                ot.addEventListener('click', async (e) => {
                    const tBtn = e.target.closest('[data-order-timeline]'); if (tBtn) { showOrderTimeline(tBtn.getAttribute('data-order-timeline')); return; }
                    const btn = e.target.closest('[data-order-action]'); if (!btn) return; const action = btn.getAttribute('data-order-action'); const id = btn.getAttribute('data-order-id');
                    try {
                        if (action === 'pay') await payOrder(id);
                        else if (action === 'fulfill') await fulfillOrder(id);
                        else if (action === 'ship') await shipOrder(id);
                        else if (action === 'complete') {
                            const email = btn.getAttribute('data-order-email') || '';
                            await completeOrder(id, email);
                        } else if (action === 'cancel') { if (!confirm('Cancel order?')) return; await cancelOrder(id); }
                        notify('Order ' + action + ' ok', 'success');
                        await loadOrdersAdmin();
                        refreshAdminTables();
                    } catch (err) { notify('Action failed: ' + err.message, 'error'); }
                });
                const refreshBtn = document.getElementById('orders-refresh-btn'); if (refreshBtn) refreshBtn.addEventListener('click', async () => { await loadOrdersAdmin(); refreshAdminTables(); });
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
        showModal(async close => {
            const wrap = el('div', { class: 'modal' });
            wrap.appendChild(el('button', { class: 'modal-close' }, '×'));
            wrap.appendChild(el('h2', {}, 'Order Timeline'));
            const list = el('ul', { class: 'timeline', attrs: { id: 'timeline-list' } }, el('li', {}, 'Loading events...'));
            wrap.appendChild(list); modalRoot.appendChild(wrap);
            wrap.querySelector('.modal-close').addEventListener('click', close);
            try {
                const data = await apiFetch('/api/orders/' + orderId + '/events');
                list.innerHTML = '';
                data.events.forEach(ev => list.appendChild(el('li', {}, el('strong', {}, ev.status), ' – ', new Date(ev.at).toLocaleString())));
            } catch (err) { list.innerHTML = ''; list.appendChild(el('li', { class: 'alert alert-error' }, 'Failed: ' + err.message)); }
        });
    }

    // Inject timeline trigger into order actions builder
    function buildOrderActions(o) {
        const frag = document.createDocumentFragment();
        function act(label, action, disabled = false, extraAttrs = {}) {
            const attrs = Object.assign({ 'data-order-action': action, 'data-order-id': o.id }, extraAttrs);
            if (disabled) attrs.disabled = 'true';
            const b = el('button', { class: 'btn btn-xs' + (disabled ? ' btn-disabled' : ' btn-outline'), attrs }, label);
            frag.appendChild(b); frag.appendChild(document.createTextNode(' '));
        }
        // Timeline button always first
        const timelineBtn = el('button', { class: 'btn btn-xs btn-outline', attrs: { 'data-order-timeline': o.id } }, 'Timeline');
        frag.appendChild(timelineBtn); frag.appendChild(document.createTextNode(' '));
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