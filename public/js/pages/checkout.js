import { el } from '../utils/dom.js';
import { state, persistCart } from '../state/index.js';
import { getModalRoot, notify, productPlaceholder, showSpinner, fieldInput, fieldTextArea } from '../utils/helpers.js';
import { money, setSelectedCurrency } from '../utils/currency.js';
import { showModal, showLegalModal, clearCart } from '../components/index.js';
import { apiFetch, sanitizeCart, loadOrdersAdmin } from '../api/index.js';
import { navigate } from '../router/index.js';

/**
 * Creates an order
 * @param {Array} cartLines - Cart line items
 * @param {Object} customer - Customer info
 * @param {string} [discountCode] - Optional discount code
 * @param {string} [shippingCode] - Optional shipping code
 * @returns {Promise<Object>}
 */
async function createOrder(cartLines, customer, discountCode, shippingCode) {
    const payload = {
        items: cartLines.map(line => ({
            productId: line.productId,
            quantity: line.quantity,
            variantId: line.variantId
        })),
        customer,
        discountCode,
        shippingCode
    };
    return apiFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

/**
 * Starts Stripe checkout
 * @param {Array} cartLines - Cart line items
 * @param {Object} customer - Customer info
 * @param {string} [discountCode] - Optional discount code
 * @param {string} [shippingCode] - Optional shipping code
 */
async function startStripeCheckout(cartLines, customer, discountCode, shippingCode) {
    const payload = {
        items: cartLines.map(line => ({
            productId: line.productId,
            quantity: line.quantity,
            variantId: line.variantId
        })),
        customer,
        discountCode,
        shippingCode,
        successUrl: window.location.origin + '/?success=true&session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: window.location.origin + '/?canceled=true'
    };
    
    const session = await apiFetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    
    if (session.url) {
        window.location.href = session.url;
    } else if (session.sessionId) {
        const stripe = /** @type {any} */ (window).Stripe?.(session.publishableKey || state.meta?.stripePublishableKey);
        if (stripe) {
            await stripe.redirectToCheckout({ sessionId: session.sessionId });
        } else {
            throw new Error('Stripe not loaded');
        }
    } else {
        throw new Error('Invalid checkout response');
    }
}

/**
 * Helper to set active currency based on country
 * @param {string} code - Currency code
 */
function setActiveCurrency(code) {
    setSelectedCurrency(code);
}

/**
 * Helper to save cart state
 */
function saveCart() {
    persistCart();
}

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
 * Refreshes admin tables (placeholder, can be imported if needed)
 */
function refreshAdminTables() {
    // Will be called if admin is viewing admin panel
    console.debug('[checkout] refreshAdminTables called');
}

function buildEtaCopy(estimatedDeliveryAt, fallbackLabel = '2-4 days', fallbackDetail = 'Priority handling') {
    if (estimatedDeliveryAt) {
        const dt = new Date(estimatedDeliveryAt);
        if (!Number.isNaN(dt.getTime())) {
            const label = dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
            return {
                label,
                detail: 'Fulfillment ETA set by admin'
            };
        }
    }
    return { label: fallbackLabel, detail: fallbackDetail };
}

/**
 * Shows the checkout modal
 */
export function showCheckoutModal() {
    const modalRoot = getModalRoot();
    
    // Ensure cart only contains valid products
    sanitizeCart();
    if (!state.cart.length) { 
        navigate('cart'); 
        return; 
    }
    
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
            console.error('[checkout] init failure:', e);
            notify('Checkout init failed: ' + e.message, 'error', 6000);
            return;
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
                el('select', { attrs: { id: 'fb-country' } }, 
                    el('option', { attrs: { value: 'US' } }, 'United States'), 
                    el('option', { attrs: { value: 'CA' } }, 'Canada'), 
                    el('option', { attrs: { value: 'DE' } }, 'Germany'), 
                    el('option', { attrs: { value: 'OTHER' } }, 'Other')
                ),
                el('div', {}, 
                    el('button', { class: 'btn btn-success', attrs: { type: 'submit' } }, 'Place Order'), 
                    ' ', 
                    el('button', { class: 'btn btn-outline', attrs: { type: 'button', id: 'fb-cancel' } }, 'Cancel')
                )
            );
            container.appendChild(fb);
            
            if (state.customer) {
                const nameInput = /** @type {HTMLInputElement} */ (fb.querySelector('#fb-name'));
                const emailInput = /** @type {HTMLInputElement} */ (fb.querySelector('#fb-email'));
                const phoneInput = /** @type {HTMLInputElement} */ (fb.querySelector('#fb-phone'));
                const addressInput = /** @type {HTMLTextAreaElement} */ (fb.querySelector('#fb-address'));
                const countrySelect = /** @type {HTMLSelectElement} */ (fb.querySelector('#fb-country'));
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
                    name: /** @type {HTMLInputElement} */ (document.getElementById('fb-name')).value.trim(),
                    email: /** @type {HTMLInputElement} */ (document.getElementById('fb-email')).value.trim(),
                    phone: /** @type {HTMLInputElement} */ (document.getElementById('fb-phone')).value.trim(),
                    address: /** @type {HTMLTextAreaElement} */ (document.getElementById('fb-address')).value.trim(),
                    country: /** @type {HTMLSelectElement} */ (document.getElementById('fb-country')).value
                };
                if (!customer.name || !customer.email || !customer.phone || !customer.address) { 
                    notify('Fill all fields', 'warn'); 
                    return; 
                }
                try {
                    showSpinner(true);
                    const paymongoCart = cartLines.map(line => ({
                        productId: line.productId,
                        priceCents: line.unitPriceCents,
                        qty: line.quantity,
                        variantId: line.variantId || undefined
                    }));
                    const res = await apiFetch('/api/paymongo-intent', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            cart: paymongoCart,
                            customer,
                            paymentMethod: 'gcash'
                        })
                    });
                    if (res.next_action && res.next_action.redirect && res.next_action.redirect.url) {
                        window.location.href = res.next_action.redirect.url;
                        return;
                    }
                    notify('Payment could not be started. Try again.', 'error');
                } catch (err) { 
                    notify('PayMongo error: ' + err.message, 'error', 6000); 
                } finally { 
                    showSpinner(false); 
                }
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
            let discountApplied = false, shipDiscountApplied = false;
            
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
                if (['PH', 'PHL', 'PHILIPPINES'].includes(up)) return 200; // Flat $2 for Philippines
                const zone = classifyCountry(country);
                if (zone === 'DOM') return sub >= SHIP_RATES.domesticFreeThreshold ? 0 : SHIP_RATES.domestic;
                if (zone === 'NEAR') return SHIP_RATES.near;
                return SHIP_RATES.intl;
            }
            
            function perItemShip(country) {
                const up = (country || '').toUpperCase();
                if (['PH', 'PHL', 'PHILIPPINES'].includes(up)) return 0; // No per-item fees in PH flat model
                let t = 0; 
                for (const line of state.cart) { 
                    const p = state.productsById.get(line.productId); 
                    if (!p) continue; 
                    t += (p.shippingFeeCents || 0) * line.quantity; 
                } 
                return t;
            }
            
            const breakdownBox = el('div', { class: 'checkout-breakdown', attrs: { id: 'checkout-breakdown' } });
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
                    el('h2', { class: 'checkout-title' }, 'Ready to ship')
                ),
                summaryPills,
                lineup,
                breakdownBox,
                el('div', { class: 'checkout-security' }
                ),
                el('div', { class: 'checkout-summary-footer' },
                    editCartBtn,
                    el('span', { class: 'checkout-support-hint' }, 'Need help? roblouie47@gmail.com')
                )
            );
            
            const discountApplyBtn = el('button', { class: 'btn discount-apply-btn', attrs: { type: 'button', 'data-apply-kind': 'item' } }, 'Apply');
            const shippingApplyBtn = el('button', { class: 'btn discount-apply-btn', attrs: { type: 'button', 'data-apply-kind': 'ship' } }, 'Apply');
            const discountInput = el('input', { attrs: { type: 'text', id: 'discount-code', autocomplete: 'off' } });
            const shippingInput = el('input', { attrs: { type: 'text', id: 'shipping-code', autocomplete: 'off' } });
            
            const discountField = el('div', { class: 'field code-field' },
                el('label', { attrs: { for: 'discount-code' } }, 'Discount Code (items)'),
                el('div', { class: 'code-field-controls' }, discountInput, discountApplyBtn)
            );
            
            const shippingField = el('div', { class: 'field code-field' },
                el('label', { attrs: { for: 'shipping-code' } }, 'Shipping Code'),
                el('div', { class: 'code-field-controls' }, shippingInput, shippingApplyBtn)
            );
            
            const nameField = fieldInput('Name', 'cust-name', 'text');
            const emailField = fieldInput('Email', 'cust-email', 'text');
            const phoneField = fieldInput('Phone number', 'cust-phone', 'tel');
            const addressField = fieldTextArea('Address', 'cust-address');
            
            // Mark required fields
            nameField.querySelector('input')?.setAttribute('required', 'true');
            emailField.querySelector('input')?.setAttribute('required', 'true');
            phoneField.querySelector('input')?.setAttribute('required', 'true');
            addressField.querySelector('textarea')?.setAttribute('required', 'true');
            
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
            

            // Payment method selection
            const paymentField = el('div', { class: 'field full-span' },
                el('label', {}, 'Payment Method'),
                el('div', { class: 'payment-method-options' },
                    el('label', { class: 'payment-method-label' },
                        el('input', { attrs: { type: 'radio', name: 'payment_method', value: 'gcash', checked: true } }),
                        ' GCash (e-wallet)'
                    ),
                    el('label', { class: 'payment-method-label' },
                        el('input', { attrs: { type: 'radio', name: 'payment_method', value: 'card' } }),
                        ' Debit/Credit Card'
                    )
                )
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
                paymentField,
                actionsRow
            );
            
            // Pre-fill customer info
            if (state.customer) {
                const nameInput = /** @type {HTMLInputElement} */ (form.querySelector('#cust-name'));
                const emailInput = /** @type {HTMLInputElement} */ (form.querySelector('#cust-email'));
                const phoneInput = /** @type {HTMLInputElement} */ (form.querySelector('#cust-phone'));
                const addressInput = /** @type {HTMLTextAreaElement} */ (form.querySelector('#cust-address'));
                const countrySelect = /** @type {HTMLSelectElement} */ (form.querySelector('#cust-country'));
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
                el('span', { class: 'checkout-hero-badge' }, totalQuantity + (totalQuantity === 1 ? ' item' : ' items') + ' in bag')
            );
            
            const hero = el('div', { class: 'checkout-hero' },
                el('div', { class: 'checkout-hero-copy' },
                    el('p', { class: 'checkout-eyebrow' }, 'Secure checkout'),
                    heroBadges,
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
            
            function recalcShipping() {
                const cEl = /** @type {HTMLSelectElement} */ (form.querySelector('#cust-country'));
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
            }
            recalcShipping();
            
            form.addEventListener('change', e => { 
                if (/** @type {HTMLElement} */ (e.target) && /** @type {HTMLElement} */ (e.target).id === 'cust-country') recalcShipping(); 
            });
            
            const dcInput = /** @type {HTMLInputElement} */ (discountInput); 
            const shipInput = /** @type {HTMLInputElement} */ (shippingInput);
            const dcApplyBtn = discountApplyBtn; 
            const shipApplyBtn = shippingApplyBtn;
            
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
                estDiscount = 0; 
                discountApplied = false;
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
                estShipDiscount = 0; 
                shipDiscountApplied = false;
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
            
            // Only apply when user clicks Apply, never automatically
            dcApplyBtn.addEventListener('click', () => evaluateDiscount());
            shipApplyBtn.addEventListener('click', () => evaluateShip());
            
            // If user edits code after applying, reset applied state
            dcInput.addEventListener('input', () => { 
                if (discountApplied) { 
                    discountApplied = false; 
                    estDiscount = 0; 
                    styleApply(dcApplyBtn, false); 
                    renderBreakdown(); 
                } 
            });
            shipInput.addEventListener('input', () => { 
                if (shipDiscountApplied) { 
                    shipDiscountApplied = false; 
                    estShipDiscount = 0; 
                    styleApply(shipApplyBtn, false); 
                    renderBreakdown(); 
                } 
            });
            
            form.addEventListener('submit', async ev => {
                ev.preventDefault();
                const customer = {
                    name: /** @type {HTMLInputElement} */ (form.querySelector('#cust-name')).value.trim(),
                    email: /** @type {HTMLInputElement} */ (form.querySelector('#cust-email')).value.trim(),
                    phone: /** @type {HTMLInputElement} */ (form.querySelector('#cust-phone')).value.trim(),
                    address: /** @type {HTMLTextAreaElement} */ (form.querySelector('#cust-address')).value.trim(),
                    country: /** @type {HTMLSelectElement} */ (form.querySelector('#cust-country')).value.trim()
                };
                if (!customer.name || !customer.email || !customer.phone || !customer.address) { 
                    notify('Fill all customer info', 'warn'); 
                    return; 
                }
                const discountCode = discountApplied ? (dcInput.value.trim().toUpperCase()) : undefined;
                const shippingCode = shipDiscountApplied ? (shipInput.value.trim().toUpperCase()) : undefined;
                // Get selected payment method
                const paymentMethod = /** @type {HTMLInputElement|null} */(form.querySelector('input[name="payment_method"]:checked'))?.value || 'gcash';
                // Prepare cart for PayMongo (with priceCents and qty)
                const paymongoCart = cartLines.map(line => ({
                    productId: line.productId,
                    priceCents: line.unitPriceCents,
                    qty: line.quantity,
                    variantId: line.variantId || undefined
                }));
                try {
                    showSpinner(true);
                    // Call backend to create PayMongo payment intent
                    const res = await apiFetch('/api/paymongo-intent', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            cart: paymongoCart,
                            customer,
                            discountCode,
                            shippingCode,
                            paymentMethod
                        })
                    });
                    if (res.next_action && res.next_action.redirect && res.next_action.redirect.url) {
                        window.location.href = res.next_action.redirect.url;
                        return;
                    } else if (res.status === 'succeeded') {
                        if (res.orderId) {
                            try {
                                const track = await apiFetch(`/api/orders/${res.orderId}/track`);
                                const order = track?.order;
                                const items = Array.isArray(track?.items) ? track.items : [];
                                if (order && order.paidAt) {
                                    const etaCopy = buildEtaCopy(order.estimatedDeliveryAt, deliveryWindowLabel, deliveryWindowDetail);
                                    state.lastOrder = {
                                        id: order.id,
                                        subtotalCents: order.subtotalCents || 0,
                                        discountCents: order.discountCents || 0,
                                        shippingCents: order.shippingCents || 0,
                                        shippingDiscountCents: order.shippingDiscountCents || 0,
                                        totalCents: order.totalCents || 0,
                                        lines: items.map(item => ({
                                            productId: item.productId,
                                            variantId: item.variantId || null,
                                            quantity: item.quantity,
                                            unitPriceCents: item.unitPriceCents
                                        })),
                                        customer,
                                        etaLabel: etaCopy.label,
                                        etaDetail: etaCopy.detail,
                                        estimatedDeliveryAt: order.estimatedDeliveryAt || null
                                    };
                                    notify('Payment successful!', 'success');
                                    close();
                                    navigate('order-confirmation');
                                } else {
                                    notify('Payment processing. Please wait for confirmation.', 'warn');
                                }
                            } catch (trackErr) {
                                notify('Payment received. Order confirmation pending.', 'warn');
                            }
                        } else {
                            notify('Payment successful! Order confirmation pending.', 'success');
                        }
                        return;
                    } else {
                        notify('Payment could not be started. Try again.', 'error');
                    }
                } catch (err) {
                    // Do not create a manual order when PayMongo fails
                    const message = err?.message ? `PayMongo error: ${err.message}` : 'PayMongo error: payment could not be started.';
                    notify(message, 'error', 6000);
                } finally {
                    showSpinner(false);
                }
            });
            
            form.querySelector('#cancel-checkout').addEventListener('click', close);
            console.debug('[checkout] rich modal constructed');
        } catch (e) {
            console.error('[checkout] rich build failed, switching to fallback:', e); 
            notify('Checkout form failed, using fallback', 'error', 6000); 
            injectFallback(wrap, close);
        }
    });
}

/**
 * Renders the order confirmation page
 * @param {Object} [orderData] - Order data (optional, uses state.lastOrder if not provided)
 */
export function renderOrderConfirmation(orderData) {
    const rootEl = document.getElementById('app-root') || document.getElementById('app');
    if (!rootEl) return;
    
    const data = orderData || state.lastOrder;
    if (!data) {
        navigate('home');
        return;
    }

    // Set body route attribute
    document.body.setAttribute('data-route', 'order-confirmation');
    rootEl.innerHTML = '';

    const subtotal = data.subtotalCents || 0;
    const discount = data.discountCents || 0;
    const shipping = data.shippingCents || 0;
    const shippingDiscount = data.shippingDiscountCents || 0;
    const total = data.totalCents || (subtotal - discount + shipping - shippingDiscount);
    const customerName = (data.customer && data.customer.name) || 'Friend';
    const customerEmail = (data.customer && data.customer.email) || 'No email provided';
    const customerPhone = (data.customer && data.customer.phone) || 'No phone on file';
    const itemCount = (Array.isArray(data.lines) ? data.lines : []).reduce((sum, line) => sum + (line.quantity || 0), 0) || data.lines?.length || 0;
    const etaCopy = buildEtaCopy(data.estimatedDeliveryAt, data.etaLabel || '2-4 days', data.etaDetail || 'Priority handling');
    const etaLabel = etaCopy.label;
    const etaDetail = etaCopy.detail;

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
        ...(data.lines || []).map(line => {
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

    // Clear the last order from state
    state.lastOrder = null;

    // Print button
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

    // Toggle receipt details
    toggleBtn.addEventListener('click', () => {
        const isCollapsed = detailsWrap.classList.toggle('collapsed');
        const expanded = !isCollapsed;
        toggleBtn.textContent = expanded ? 'Hide full receipt' : 'View full receipt';
        toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    });

    // Wire up route buttons
    shell.querySelectorAll('[data-route]').forEach(btn => {
        btn.addEventListener('click', () => {
            const route = btn.getAttribute('data-route');
            navigate(route);
        });
    });
}

/**
 * Handles Stripe return after checkout
 * @returns {Promise<boolean>} - Whether Stripe return was handled
 */
export async function maybeHandleStripeReturn() {
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
                const etaCopy = buildEtaCopy(order.estimatedDeliveryAt, '2-4 days', 'Priority handling');
                
                state.lastOrder = {
                    id: order.id,
                    subtotalCents: order.subtotalCents,
                    discountCents: order.discountCents,
                    shippingCents: order.shippingCents,
                    shippingDiscountCents: order.shippingDiscountCents,
                    totalCents: order.totalCents,
                    customer: {
                        name: order.customerName || 'Customer',
                        email: order.customerEmail || '',
                        phone: order.customerPhone || ''
                    },
                    lines: items.map(item => ({
                        productId: item.productId,
                        variantId: item.variantId || null,
                        quantity: item.quantity,
                        title: item.titleSnapshot,
                        unitPriceCents: item.unitPriceCents
                    })),
                    etaLabel: etaCopy.label,
                    etaDetail: etaCopy.detail,
                    estimatedDeliveryAt: order.estimatedDeliveryAt || null
                };
                
                state.cart = [];
                saveCart();
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
