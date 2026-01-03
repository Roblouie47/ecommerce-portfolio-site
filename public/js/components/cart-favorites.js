import { el } from '../utils/dom.js';
import { state, persistCart, persistFavorites } from '../state/index.js';
import { notify, lookupProduct } from '../utils/helpers.js';
import { updateCartBadge } from '../api/index.js';

// ============================================
// Cart Functions
// ============================================

/**
 * Gets the current cart array
 * @returns {Array}
 */
export function getCart() {
    return state.cart;
}

/**
 * Adds a product to the cart
 * @param {string} productId - Product ID
 * @param {number} [quantity=1] - Quantity to add
 */
export function addToCart(productId, quantity = 1) {
    const product = state.productsById.get(productId) || state.productsById.get(String(productId));
    if (!product) {
        notify('Product not found', 'error');
        return;
    }
    
    if (product.deletedAt) {
        notify('This product is no longer available', 'error');
        return;
    }
    
    const existingIndex = state.cart.findIndex(item => 
        String(item.productId) === String(productId)
    );
    
    if (existingIndex >= 0) {
        state.cart[existingIndex].quantity += quantity;
    } else {
        state.cart.push({
            productId: String(productId),
            quantity
        });
    }
    
    persistCart();
    updateCartBadge();
    notify('Added to cart', 'success', 1500);
}

/**
 * Removes a product from the cart
 * @param {string} productId - Product ID
 * @param {string|null} [variantId] - Variant ID
 */
export function removeFromCart(productId, variantId = null) {
    state.cart = state.cart.filter(item => 
        !(String(item.productId) === String(productId) && 
          String(item.variantId || '') === String(variantId || ''))
    );
    persistCart();
    updateCartBadge();
}

/**
 * Updates cart item quantity
 * @param {string} productId - Product ID
 * @param {number} quantity - New quantity
 */
export function updateCartQuantity(productId, quantity) {
    if (quantity <= 0) {
        removeFromCart(productId);
        return;
    }
    
    const item = state.cart.find(item => 
        String(item.productId) === String(productId)
    );
    
    if (item) {
        item.quantity = quantity;
        persistCart();
        updateCartBadge();
    }
}

/**
 * Sets cart item quantity with variant support
 * @param {string} productId - Product ID
 * @param {number} qty - New quantity
 * @param {string|null} [variantId] - Variant ID
 */
export function setCartQuantity(productId, qty, variantId = null) {
    const item = state.cart.find(ci => 
        String(ci.productId) === String(productId) && 
        String(ci.variantId || '') === String(variantId || '')
    );
    if (!item) return;
    if (qty <= 0) {
        state.cart = state.cart.filter(ci => ci !== item);
    } else {
        item.quantity = qty;
    }
    persistCart();
    updateCartBadge();
}

/**
 * Clears the entire cart
 */
export function clearCart() {
    state.cart = [];
    persistCart();
    updateCartBadge();
}

/**
 * Calculates cart totals
 * @returns {Object} - subtotal, itemCount, items with product data
 */
export function calculateCartTotals() {
    let subtotal = 0;
    let itemCount = 0;
    const items = [];
    
    for (const cartItem of state.cart) {
        const product = state.productsById.get(cartItem.productId) || 
                        state.productsById.get(String(cartItem.productId));
        if (!product || product.deletedAt) continue;
        
        const qty = cartItem.quantity || 1;
        const price = product.priceCents || 0;
        
        subtotal += price * qty;
        itemCount += qty;
        items.push({
            ...cartItem,
            product,
            lineTotal: price * qty
        });
    }
    
    return { subtotal, itemCount, items };
}

// ============================================
// Favorites Functions
// ============================================

/**
 * Gets the current favorites array
 * @returns {Array}
 */
export function getFavorites() {
    return state.favorites;
}

/**
 * Checks if a product is in favorites
 * @param {string} productId - Product ID
 * @returns {boolean}
 */
export function isFavorite(productId) {
    return state.favorites.includes(String(productId));
}

/**
 * Toggles a product in favorites
 * @param {string} productId - Product ID
 * @returns {boolean} - New favorite state
 */
export function toggleFavorite(productId) {
    const id = String(productId);
    const index = state.favorites.indexOf(id);
    
    if (index >= 0) {
        state.favorites.splice(index, 1);
        persistFavorites();
        notify('Removed from favorites', 'info', 1500);
        return false;
    } else {
        state.favorites.push(id);
        persistFavorites();
        notify('Added to favorites', 'success', 1500);
        return true;
    }
}

/**
 * Adds a product to favorites
 * @param {string} productId - Product ID
 */
export function addToFavorites(productId) {
    const id = String(productId);
    if (!state.favorites.includes(id)) {
        state.favorites.push(id);
        persistFavorites();
        notify('Added to favorites', 'success', 1500);
    }
}

/**
 * Removes a product from favorites
 * @param {string} productId - Product ID
 */
export function removeFromFavorites(productId) {
    const id = String(productId);
    const index = state.favorites.indexOf(id);
    if (index >= 0) {
        state.favorites.splice(index, 1);
        persistFavorites();
        notify('Removed from favorites', 'info', 1500);
    }
}

/**
 * Updates favorites badge count in the UI
 */
export function updateFavoritesBadge() {
    const count = state.favorites.length;
    const badge = document.querySelector('.favorites-badge');
    if (badge) {
        badge.textContent = count > 0 ? String(count) : '';
        badge.classList.toggle('hidden', count === 0);
    }
}

/**
 * Updates all favorite icons within a root element
 * @param {Element|Document} [root] - Root element to search within (defaults to document)
 */
export function updateFavoriteIcons(root) {
    const scope = root || document;
    try {
        scope.querySelectorAll('[data-fav]')?.forEach(btn => {
            const id = btn.getAttribute('data-fav');
            const active = isFavorite(id);
            btn.classList.toggle('active', !!active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            btn.textContent = active ? '♥' : '♡';
            /** @type {HTMLElement} */ (btn).title = active ? 'Remove from favorites' : 'Add to favorites';
        });
    } catch {}
}

// ============================================
// Favorite Button Component
// ============================================

/**
 * Creates a favorite/heart button element
 * @param {string} productId - Product ID
 * @param {Object} [options] - Button options
 * @returns {HTMLElement}
 */
export function createFavoriteButton(productId, options = {}) {
    const { size = 'md' } = options;
    const isFav = isFavorite(productId);
    
    const btn = el('button', {
        class: `favorite-btn favorite-btn-${size} ${isFav ? 'is-favorite' : ''}`,
        attrs: {
            type: 'button',
            'aria-label': isFav ? 'Remove from favorites' : 'Add to favorites',
            'data-product-id': productId
        }
    },
        el('svg', {
            class: 'favorite-icon',
            attrs: {
                viewBox: '0 0 24 24',
                fill: isFav ? 'currentColor' : 'none',
                stroke: 'currentColor',
                'stroke-width': '2'
            }
        },
            el('path', {
                attrs: {
                    d: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z'
                }
            })
        )
    );
    
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const newState = toggleFavorite(productId);
        btn.classList.toggle('is-favorite', newState);
        btn.setAttribute('aria-label', newState ? 'Remove from favorites' : 'Add to favorites');
        btn.querySelector('svg').setAttribute('fill', newState ? 'currentColor' : 'none');
        updateFavoritesBadge();
    });
    
    return btn;
}
