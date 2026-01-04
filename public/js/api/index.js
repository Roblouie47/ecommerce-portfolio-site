import { state, getRefundThreadStore, ensureAnalyticsState, persistCart } from '../state/index.js';
import { clearAdminAuth } from '../auth/admin.js';
import { notify } from '../utils/helpers.js';

/**
 * Base API fetch wrapper with authentication
 * @param {string} url - API endpoint URL
 * @param {Object} options - Fetch options
 * @returns {Promise<any>}
 */
export async function apiFetch(url, options = {}) {
    const headers = { ...options.headers };
    
    // Add admin token if available
        if (state.admin.token && !headers['X-Admin-Token']) {
        headers['X-Admin-Token'] = state.admin.token;
    }
    
    // Add customer token if available
    if (state.customer?.sessionToken) {
        headers['Authorization'] = `Bearer ${state.customer.sessionToken}`;
    }
    
    const response = await fetch(url, { ...options, headers });
    
    if (!response.ok) {
            if (response.status === 401 && state.admin.token) {
                notify('Admin session expired. Please sign in again.', 'warn', 4000);
                clearAdminAuth();
            }
        const data = await response.json().catch(() => ({}));
        const error = Object.assign(
            new Error(data.error || `HTTP ${response.status}`),
            { status: response.status }
        );
        throw error;
    }
    
    return response.json();
}

// ============================================
// Products API
// ============================================

/**
 * Loads all products from the server
 * @param {boolean} [includeDeleted=false] - Whether to include soft-deleted products
 */
export async function loadProducts(includeDeleted = false, options = {}) {
    const { forceFresh = false } = options;
    const params = new URLSearchParams();
    if (includeDeleted) params.set('includeDeleted', 'true');
    if (forceFresh) params.set('_', Date.now().toString());
    const query = params.toString();
    const endpoint = query ? `/api/products?${query}` : '/api/products';
    const fetchOptions = forceFresh ? { cache: 'no-store' } : {};
    const response = await apiFetch(endpoint, fetchOptions);
    
    // API returns paginated response { page, pageSize, total, products }
    const products = Array.isArray(response) ? response : (response.products || response.data || []);
    
    state.products = products;
    state.productsById = new Map();
    
    for (const p of products) {
        state.productsById.set(p.id, p);
        state.productsById.set(String(p.id), p);
    }
}

/**
 * Creates a new product
 * @param {Object} payload - Product data
 * @returns {Promise<Object>}
 */
export async function createProduct(payload) {
    return apiFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

/**
 * Updates an existing product
 * @param {string} id - Product ID
 * @param {Object} payload - Updated product data
 * @returns {Promise<Object>}
 */
export async function updateProduct(id, payload) {
    return apiFetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

/**
 * Soft deletes a product
 * @param {string} id - Product ID
 * @returns {Promise<Object>}
 */
export async function deleteProduct(id) {
    return apiFetch(`/api/products/${id}`, { method: 'DELETE' });
}

/**
 * Restores a soft-deleted product
 * @param {string} id - Product ID
 * @returns {Promise<Object>}
 */
export async function restoreProduct(id) {
    return apiFetch(`/api/products/${id}/restore`, { method: 'POST' });
}

/**
 * Permanently destroys a product
 * @param {string} id - Product ID
 * @returns {Promise<Object>}
 */
export async function destroyProduct(id) {
    return apiFetch(`/api/products/${id}/permanent`, { method: 'DELETE' });
}

/**
 * Bulk soft delete products
 * @param {string[]} ids - Array of product IDs
 * @returns {Promise<Object>}
 */
export async function bulkDeleteProducts(ids) {
    return apiFetch('/api/products/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
    });
}

/**
 * Bulk restore soft-deleted products
 * @param {string[]} ids - Array of product IDs
 * @returns {Promise<Object>}
 */
export async function bulkRestoreProducts(ids) {
    return apiFetch('/api/products/bulk-restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
    });
}

/**
 * Bulk permanently destroy products
 * @param {string[]} ids - Array of product IDs
 * @returns {Promise<Object>}
 */
export async function bulkDestroyProducts(ids) {
    return apiFetch('/api/products/bulk-permanent-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
    });
}

// ============================================
// Meta/Store API
// ============================================

/**
 * Loads store metadata
 */
export async function loadMeta() {
    try {
        const meta = await apiFetch('/api/meta');
        Object.assign(state.meta, meta);
    } catch { /* use defaults */ }
}

// ============================================
// Reviews API
// ============================================

/**
 * Fetches product reviews
 * @param {string} productId - Product ID
 * @returns {Promise<Object>}
 */
export async function fetchProductReviews(productId) {
    return apiFetch(`/api/products/${productId}/reviews`);
}

/**
 * Submits a product review
 * @param {string} productId - Product ID
 * @param {Object} reviewData - Review data
 * @returns {Promise<Object>}
 */
export async function submitReview(productId, reviewData) {
    return apiFetch(`/api/products/${productId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewData)
    });
}

/**
 * Loads admin reviews for moderation
 * @param {string} [status='pending'] - Status filter
 */
export async function loadAdminReviews(status = 'pending') {
    const data = await apiFetch(`/api/admin/reviews?status=${status}`);
    state.admin.reviews = { items: data.reviews || [], status };
}

/**
 * Moderates a review (approve/reject)
 * @param {string} reviewId - Review ID
 * @param {string} action - 'approve' or 'reject'
 * @param {string} [notes] - Optional moderation notes
 * @returns {Promise<Object>}
 */
export async function moderateReview(reviewId, action, notes) {
    return apiFetch(`/api/admin/reviews/${reviewId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
    });
}

// ============================================
// Orders API
// ============================================

/**
 * Loads admin orders
 */
export async function loadOrdersAdmin() {
    const data = await apiFetch('/api/orders');
    state.admin.orders = Array.isArray(data) ? data : (data.orders || []);
}

/**
 * Loads customer orders
 */
export async function loadCustomerOrders() {
    const data = await apiFetch('/api/my-orders');
    state.customer.orders = Array.isArray(data) ? data : (data.orders || []);
}

/**
 * Marks an order as paid
 * @param {string} orderId - Order ID
 * @returns {Promise<Object>}
 */
export async function payOrder(orderId) {
    return apiFetch(`/api/orders/${orderId}/pay`, { method: 'POST' });
}

/**
 * Marks an order as fulfilled
 * @param {string} orderId - Order ID
 * @returns {Promise<Object>}
 */
export async function fulfillOrder(orderId) {
    return apiFetch(`/api/orders/${orderId}/fulfill`, { method: 'POST' });
}

/**
 * Marks an order as shipped
 * @param {string} orderId - Order ID
 * @returns {Promise<Object>}
 */
export async function shipOrder(orderId) {
    return apiFetch(`/api/orders/${orderId}/ship`, { method: 'POST' });
}

/**
 * Marks an order as completed/delivered
 * @param {string} orderId - Order ID
 * @param {string} [customerEmail] - Customer email for verification
 * @returns {Promise<Object>}
 */
export async function completeOrder(orderId, customerEmail) {
    return apiFetch(`/api/orders/${orderId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: customerEmail })
    });
}

/**
 * Cancels an order
 * @param {string} orderId - Order ID
 * @param {string} reason - Cancellation reason
 * @returns {Promise<Object>}
 */
export async function cancelOrder(orderId, reason) {
    return apiFetch(`/api/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
    });
}

// ============================================
// Refunds API
// ============================================

/**
 * Requests a return/refund
 * @param {string} orderId - Order ID
 * @param {Object} data - Return request data
 * @returns {Promise<Object>}
 */
export async function requestReturn(orderId, data) {
    return apiFetch(`/api/orders/${orderId}/return-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
}

/**
 * Loads refund conversation messages
 * @param {string} orderId - Order ID
 * @param {Object} [options] - Options
 */
export async function loadRefundMessages(orderId, options = {}) {
    const { force = false } = options;
    const store = getRefundThreadStore('admin');
    
    if (!force && store.has(orderId)) return;
    
    const data = await apiFetch(`/api/orders/${orderId}/refund-messages`);
    store.set(orderId, { messages: data.messages || [] });
}

/**
 * Responds to a refund request (admin)
 * @param {string} orderId - Order ID
 * @param {Object} payload - Response data
 * @returns {Promise<Object>}
 */
export async function respondToRefund(orderId, payload) {
    return apiFetch(`/api/orders/${orderId}/refund-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

/**
 * Closes a refund case
 * @param {string} orderId - Order ID
 * @param {Object} payload - Close data
 * @returns {Promise<Object>}
 */
export async function closeRefundCase(orderId, payload) {
    return apiFetch(`/api/orders/${orderId}/refund-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(payload || {}), closeCase: true })
    });
}

/**
 * Reopens a refund case
 * @param {string} orderId - Order ID
 * @param {Object} payload - Reopen data
 * @returns {Promise<Object>}
 */
export async function reopenRefundCase(orderId, payload) {
    return apiFetch(`/api/orders/${orderId}/refund-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(payload || {}), reopenCase: true })
    });
}

/**
 * Sends a customer message in refund thread
 * @param {string} orderId - Order ID
 * @param {string} message - Message text
 * @returns {Promise<Object>}
 */
export async function sendCustomerRefundMessage(orderId, message) {
    return apiFetch(`/api/orders/${orderId}/refund-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
    });
}

// ============================================
// Discounts API
// ============================================

/**
 * Loads all discounts (admin)
 */
export async function loadDiscounts() {
    const data = await apiFetch('/api/discounts');
    state.admin.discounts = Array.isArray(data) ? data : (data.discounts || []);
}

/**
 * Validates a discount code
 * @param {string} code - Discount code
 * @param {number} subtotalCents - Cart subtotal in cents
 * @returns {Promise<Object>}
 */
export async function validateDiscount(code, subtotalCents) {
    return apiFetch('/api/discounts/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotalCents })
    });
}

// ============================================
// Analytics API
// ============================================

/**
 * Loads merchandising analytics
 * @param {number} [days=30] - Number of days to analyze
 */
export async function loadMerchAnalytics(days = 30) {
    const analyticsState = ensureAnalyticsState();
    analyticsState.loading.merch = true;
    analyticsState.errors.merch = null;
    
    try {
        const data = await apiFetch(`/api/admin/analytics/merch?days=${days}`);
        analyticsState.merch = data;
    } catch (err) {
        analyticsState.errors.merch = err.message;
    } finally {
        analyticsState.loading.merch = false;
    }
}

/**
 * Loads promotional analytics
 * @param {number} [days=30] - Number of days to analyze
 */
export async function loadPromoAnalytics(days = 30) {
    const analyticsState = ensureAnalyticsState();
    analyticsState.loading.promos = true;
    analyticsState.errors.promos = null;
    
    try {
        const data = await apiFetch(`/api/admin/analytics/promos?days=${days}`);
        analyticsState.promos = data;
    } catch (err) {
        analyticsState.errors.promos = err.message;
    } finally {
        analyticsState.loading.promos = false;
    }
}

// ============================================
// Low Stock API
// ============================================

/**
 * Loads low stock products
 * @param {number} [threshold=5] - Stock threshold
 */
export async function loadLowStock(threshold = 5) {
    const data = await apiFetch(`/api/products/low-stock?threshold=${threshold}`);
    state.admin.lowStock = Array.isArray(data) ? data : (data.products || []);
}

// ============================================
// Checkout API
// ============================================

/**
 * Creates a Stripe checkout session
 * @param {Object} payload - Checkout data
 * @returns {Promise<Object>}
 */
export async function createCheckoutSession(payload) {
    return apiFetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

/**
 * Retrieves checkout session details
 * @param {string} sessionId - Stripe session ID
 * @returns {Promise<Object>}
 */
export async function getCheckoutSession(sessionId) {
    return apiFetch(`/api/checkout/session/${sessionId}`);
}

// ============================================
// Cart helpers (not API but related)
// ============================================

/**
 * Sanitizes cart items against current products
 */
export function sanitizeCart() {
    state.cart = state.cart.filter(item => {
        const product = state.productsById.get(item.productId) || 
                        state.productsById.get(String(item.productId));
        return product && !product.deletedAt;
    });
    persistCart();
}

/**
 * Updates the cart badge count in the UI
 */
export function updateCartBadge() {
    const totalItems = state.cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const badge = document.querySelector('.cart-badge');
    if (badge) {
        badge.textContent = totalItems > 0 ? String(totalItems) : '';
        badge.classList.toggle('hidden', totalItems === 0);
    }
}
