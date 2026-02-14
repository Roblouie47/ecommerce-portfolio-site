/**
 * Global application state
 * Central store for all application data
 */
export const state = {
    products: [],
    productsById: new Map(),
    deletedBuffer: new Map(), // Holds snapshots of soft-deleted products
    reviewsByProduct: new Map(), // Caches reviews by product ID
    cart: [],
    favorites: [], // Array of product IDs
    selectedCurrency: 'USD',
    currentRoute: 'home',
    routeParams: {},
    pendingCatalogSearchTerm: '', // Search term to apply when navigating to catalog
    lastOrder: null,
    meta: {
        storeName: 'E-Shop',
        tagline: '',
        heroImage: '',
        aboutText: ''
    },
    admin: {
        token: null,
        user: null,
        orders: [],
        reviews: { items: [], status: 'pending' },
        discounts: [],
        discountFilter: 'all',
        lowStock: [],
        showDeleted: false,
        ordersFilter: 'all',
        showClosedRefunds: false,
        refundSearchQuery: '',
        refundsSort: 'newest',
        closedRefundsSort: 'closed-newest',
        openRefundDetails: new Set(),
        refundThreads: new Map(),
        analytics: null
    },
    customer: {
        id: '',
        name: '',
        email: '',
        avatarUrl: '',
        country: '',
        address: '',
        sessionToken: '',
        hasSession: false,
        orders: []
    },
    customerRefundThreads: new Map(),
    cartPage: { discountCode: '', discountApplied: false, shipCountry: 'PH' }
};

function sanitizeStoredAddress(value) {
    if (value == null) return '';
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('{') && trimmed.includes('shoppingPreference')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed && typeof parsed === 'object') return '';
            } catch { /* keep trimmed text if parsing fails */ }
        }
        return trimmed;
    }
    if (typeof value === 'object') return '';
    return String(value).trim();
}

// Catalog preview filter options
export const CATALOG_PREVIEW_FILTERS = ['All', 'New', 'Featured', 'Best-Seller'];

// Mini cart feature flag
export const MINI_CART_ENABLED = false;

// Refund status labels
export const REFUND_STATUS_LABELS = {
    pending: 'Pending',
    in_review: 'In Review',
    approved: 'Approved',
    refunded: 'Refunded',
    declined: 'Declined'
};

// Return reason choices for customers
export const RETURN_REASON_CHOICES = [
    { value: 'defective', label: 'Product is defective or damaged' },
    { value: 'not_as_described', label: 'Product not as described' },
    { value: 'wrong_item', label: 'Received wrong item' },
    { value: 'changed_mind', label: 'Changed my mind' },
    { value: 'size_fit', label: 'Size/fit issue' },
    { value: 'other', label: 'Other reason' }
];

/**
 * Gets the normalized refund status key
 * @param {string} status - Raw status string
 * @returns {string}
 */
export function getRefundStatus(status) {
    if (!status) return 'pending';
    const lower = status.toLowerCase().replace(/[\s-]/g, '_');
    if (lower === 'in_review' || lower === 'inreview' || lower === 'reviewing') return 'in_review';
    if (lower === 'approved') return 'approved';
    if (lower === 'refunded') return 'refunded';
    if (lower === 'declined' || lower === 'rejected') return 'declined';
    return 'pending';
}

/**
 * Formats refund status for display
 * @param {string} statusKey - Normalized status key
 * @returns {string}
 */
export function formatRefundStatus(statusKey) {
    return REFUND_STATUS_LABELS[statusKey] || 'Pending';
}

/**
 * Describes the refund usage window
 * @param {Object} order - Order object with timestamps
 * @returns {string}
 */
export function describeRefundUsage(order) {
    if (!order.completedAt || !order.returnRequestedAt) return '—';
    const delivered = new Date(order.completedAt).getTime();
    const requested = new Date(order.returnRequestedAt).getTime();
    const diffMs = requested - delivered;
    if (diffMs <= 0) return 'Same day';
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Less than a day';
    if (days === 1) return '1 day';
    return `${days} days`;
}

/**
 * Gets the refund thread store for a role
 * @param {'admin'|'customer'} role - User role
 * @returns {Map}
 */
export function getRefundThreadStore(role) {
    if (role === 'admin') {
        if (!state.admin.refundThreads) state.admin.refundThreads = new Map();
        return state.admin.refundThreads;
    }
    // Customer threads could be stored elsewhere if needed
    return new Map();
}

/**
 * Gets admin orders array
 * @returns {Array}
 */
export function getAdminOrders() {
    return Array.isArray(state.admin.orders) ? state.admin.orders : [];
}

/**
 * Ensures analytics state exists
 * @returns {Object}
 */
export function ensureAnalyticsState() {
    if (!state.admin.analytics) {
        state.admin.analytics = {
            merch: null,
            promos: null,
            loading: { merch: false, promos: false },
            errors: { merch: null, promos: null }
        };
    }
    return state.admin.analytics;
}

/**
 * Initializes state from localStorage
 */
export function initState() {
    // Restore cart
    try {
        const savedCart = localStorage.getItem('cart');
        if (savedCart) {
            state.cart = JSON.parse(savedCart);
        }
    } catch { /* ignore */ }
    
    // Restore favorites
    try {
        const savedFavorites = localStorage.getItem('favorites');
        if (savedFavorites) {
            state.favorites = JSON.parse(savedFavorites);
        }
    } catch { /* ignore */ }
    
    // Restore admin profile
    try {
        const adminUser = localStorage.getItem('adminProfile');
        if (adminUser) state.admin.user = JSON.parse(adminUser);
        const adminExpires = localStorage.getItem('adminTokenExpiresAt');
        if (adminExpires) state.admin.expiresAt = adminExpires;
    } catch { /* ignore */ }
    
    // Restore customer profile (session token is cookie-based by default)
    try {
        const customerProfile = localStorage.getItem('customerProfile');
        if (customerProfile) {
            const profile = JSON.parse(customerProfile);
            state.customer.id = profile.id || '';
            state.customer.name = profile.name || '';
            state.customer.email = profile.email || '';
            state.customer.avatarUrl = profile.avatarUrl || '';
            state.customer.country = profile.country || '';
            state.customer.address = sanitizeStoredAddress(profile.address);
        }
        const storedToken = localStorage.getItem('customerSessionToken');
        if (storedToken) state.customer.sessionToken = storedToken;
    } catch { /* ignore */ }

    // Restore preferred shipping/country selection
    try {
        const storedCountry = localStorage.getItem('globalCountry');
        if (storedCountry) {
            state.cartPage.shipCountry = storedCountry.toString().trim().toUpperCase();
        }
    } catch { /* ignore */ }
}

/**
 * Persists cart to localStorage
 */
export function persistCart() {
    try {
        localStorage.setItem('cart', JSON.stringify(state.cart));
    } catch { /* ignore */ }
}

/**
 * Persists favorites to localStorage
 */
export function persistFavorites() {
    try {
        localStorage.setItem('favorites', JSON.stringify(state.favorites));
    } catch { /* ignore */ }
}
