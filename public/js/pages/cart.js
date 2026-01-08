import { el, setBodyRoute } from '../utils/dom.js';
import { state } from '../state/index.js';
import { productPlaceholder, getRootEl, notify, productStock } from '../utils/helpers.js';
import { money } from '../utils/currency.js';
import { 
    removeFromCart, 
    setCartQuantity
} from '../components/index.js';
import { apiFetch } from '../api/index.js';
import { showCheckoutModal } from './checkout.js';

/**
 * Calculates cart subtotal in cents
 * @returns {number}
 */
function cartSubtotalCents() {
    return state.cart.reduce((sum, line) => {
        const p = state.productsById.get(line.productId);
        if (!p) return sum;
        let unit = p.priceCents;
        if (line.variantId && Array.isArray(p.variants)) {
            const variant = p.variants.find(v => v.id === line.variantId);
            if (variant && variant.priceCents != null) unit = variant.priceCents;
        }
        return sum + unit * line.quantity;
    }, 0);
}

/**
 * Renders the cart page
 */
export function renderCart() {
    const rootEl = getRootEl();
    if (!rootEl) return;
    
    setBodyRoute('cart');
    state.currentRoute = 'cart';
    rootEl.innerHTML = '';

    // Initialize cartPage state if needed
    if (!state.cartPage) {
        state.cartPage = { discountCode: '', discountApplied: false, shipCountry: 'PH' };
    }

    const panel = el('section', { class: 'cart-page container' });
    const uniqueLines = state.cart.length;
    const totalItems = state.cart.reduce((sum, line) => sum + line.quantity, 0);

    // Hero section
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

    // Empty cart state
    if (!uniqueLines) {
        panel.appendChild(el('div', { class: 'cart-empty-card' },
            el('p', { class: 'muted' }, 'When you add products, detailed delivery estimates and a friendly summary will appear here.')
        ));
        rootEl.appendChild(panel);
        return;
    }

    // Insights bar
    const insights = el('div', { class: 'cart-insights' },
        el('div', { class: 'cart-insight' },
            el('span', { class: 'label' }, 'Items in bag'),
            el('strong', {}, String(totalItems))
        ),
        el('div', { class: 'cart-insight' },
            el('span', { class: 'label' }, 'Unique styles'),
            el('strong', {}, String(uniqueLines))
        ),
        el('div', { class: 'cart-insight' },
            el('span', { class: 'label' }, 'Cart value'),
            el('strong', {}, money(cartSubtotalCents()))
        )
    );
    panel.appendChild(insights);

    // Main layout
    const layout = el('div', { class: 'cart-layout' });

    // Items card
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
        
        // Variant label
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

    // Summary card
    const summaryCard = el('aside', { class: 'cart-summary-card' });
    summaryCard.appendChild(el('div', { class: 'cart-summary-header' },
        el('p', { class: 'eyebrow' }, 'Order summary'),
        el('p', { class: 'muted tiny' }, 'All duties calculated at checkout')
    ));

    // Totals box
    const totalsBox = el('div', { class: 'cart-totals' });

    summaryCard.appendChild(totalsBox);

    const checkoutBtn = el('button', { class: 'btn btn-primary cart-checkout-btn', attrs: { id: 'checkout-btn' } }, 'Checkout');
    summaryCard.appendChild(checkoutBtn);
    summaryCard.appendChild(el('p', { class: 'cart-secure-note' }, 'Secure payments • Free returns within 30 days'));

    layout.appendChild(itemsCard);
    layout.appendChild(summaryCard);
    panel.appendChild(layout);
    rootEl.appendChild(panel);

    // --- Shipping & Discount Logic ---
    const SHIP_RATES = { domestic: 200, near: 1200, intl: 2000, domesticFreeThreshold: 15000 };
    const DOMESTIC = new Set(['US', 'USA', 'PH', 'PHL', 'PHILIPPINES']);
    const NEAR = new Set(['CA', 'CANADA']);
    const EU = new Set(['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'SE', 'FI', 'DK', 'IE', 'PT', 'AT', 'PL', 'CZ', 'HU', 'SK', 'RO', 'BG', 'GR']);

    function classifyCountry(c) {
        if (!c) return 'INTL';
        const up = String(c).trim().toUpperCase();
        if (DOMESTIC.has(up)) return 'DOM';
        if (NEAR.has(up) || EU.has(up)) return 'NEAR';
        return 'INTL';
    }

    function baseShip(sub, country) {
        const up = (country || '').toUpperCase();
        if (['PH', 'PHL', 'PHILIPPINES'].includes(up)) return 200;
        const zone = classifyCountry(country);
        if (zone === 'DOM') return sub >= SHIP_RATES.domesticFreeThreshold ? 0 : SHIP_RATES.domestic;
        if (zone === 'NEAR') return SHIP_RATES.near;
        return SHIP_RATES.intl;
    }

    function perItemShip(country) {
        const up = (country || '').toUpperCase();
        if (['PH', 'PHL', 'PHILIPPINES'].includes(up)) return 0;
        let t = 0;
        for (const line of state.cart) {
            const p = state.productsById.get(line.productId);
            if (!p) continue;
            t += (p.shippingFeeCents || 0) * line.quantity;
        }
        return t;
    }

    function recalcTotals() {
        const subtotalCents = cartSubtotalCents();
        // Shipping and country selection removed
        const shipping = 0;
        const tax = Math.round(subtotalCents * 0.075);
        const total = subtotalCents + shipping + tax;

        // Update totals display
        totalsBox.innerHTML = '';
        totalsBox.appendChild(el('div', {}, 'Subtotal: ' + money(subtotalCents)));
        totalsBox.appendChild(el('div', {}, 'Shipping: ' + money(shipping)));
        totalsBox.appendChild(el('div', {}, 'Tax: ' + money(tax)));
        totalsBox.appendChild(el('div', { class: 'bold' }, 'Est. Total: ' + money(total)));
    }

    recalcTotals();

    // --- Event Handlers ---
    panel.addEventListener('change', e => {
        const inp = /** @type {HTMLElement} */ (e.target).closest('input[data-qty-key]');
        if (inp) {
            const key = inp.getAttribute('data-qty-key');
            const [pid, variantIdRaw] = key.split('::');
            const variantId = variantIdRaw || null;
            let qty = parseInt(/** @type {HTMLInputElement} */ (inp).value, 10);
            if (Number.isNaN(qty) || qty <= 0) qty = 1;
            const prod = state.productsById.get(pid);
            let max = prod ? productStock(prod) : 0;
            if (variantId && prod && prod.variants) {
                const v = prod.variants.find(v => v.id === variantId);
                if (v) max = v.inventory;
            }
            if (qty > max) {
                qty = max;
                notify('Limited to stock (' + max + ')', 'warn');
            }
            /** @type {HTMLInputElement} */ (inp).value = String(qty);
            setCartQuantity(pid, qty, variantId);
            renderCart();
        }
    });

    panel.addEventListener('click', e => {
        const target = /** @type {HTMLElement} */ (e.target);
        
        // Quantity delta buttons
        const deltaBtn = target.closest('[data-qty-delta]');
        if (deltaBtn) {
            const key = deltaBtn.getAttribute('data-qty-key');
            const [pid, variantIdRaw] = key.split('::');
            const variantId = variantIdRaw || null;
            const delta = parseInt(deltaBtn.getAttribute('data-qty-delta') || '0', 10);
            const line = state.cart.find(l => String(l.productId) === pid && String(l.variantId || '') === (variantId || ''));
            let qty = (line ? line.quantity : 1) + delta;
            if (qty < 1) qty = 1;
            const prod = state.productsById.get(pid);
            let max = prod ? productStock(prod) : 0;
            if (variantId && prod && prod.variants) {
                const v = prod.variants.find(v => v.id === variantId);
                if (v && typeof v.inventory === 'number') max = v.inventory;
            }
            if (qty > max) {
                qty = max;
                notify('Limited to stock (' + max + ')', 'warn');
            }
            setCartQuantity(pid, qty, variantId);
            renderCart();
            return;
        }

        // Remove button
        const btnRemove = target.closest('[data-remove-key]');
        if (btnRemove) {
            const key = btnRemove.getAttribute('data-remove-key');
            const [pid, variantIdRaw] = key.split('::');
            removeFromCart(pid, variantIdRaw || null);
            renderCart();
            return;
        }
    });

    // Checkout button
    checkoutBtn.addEventListener('click', () => {
        console.debug('[checkout] button clicked');
        try {
            showCheckoutModal();
        } catch (e) {
            console.error('Checkout modal error:', e);
            notify('Checkout failed to open: ' + e.message, 'error', 6000);
        }
    });

    // Delegated fallback for checkout
    panel.addEventListener('click', e => {
        const btn = /** @type {HTMLElement} */ (e.target).closest('#checkout-btn');
        if (btn && btn !== checkoutBtn) {
            console.debug('[checkout] delegated click');
            try {
                showCheckoutModal();
            } catch (err) {
                console.error('Checkout modal error (delegated):', err);
                notify('Checkout failed: ' + err.message, 'error', 6000);
            }
        }
    });
}
