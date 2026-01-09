import { state } from '../state/index.js';
import { setBodyRoute } from '../utils/dom.js';
import { showSpinner } from '../utils/helpers.js';

// Route definitions
const routes = {
    home: { render: null },
    catalog: { render: null },
    product: { render: null },
    cart: { render: null },
    favorites: { render: null },
    'my-orders': { render: null },
    'order-confirmation': { render: null },
    admin: { render: null },
    'admin-login': { render: null }
};

// Lazy load page renderers
async function getRenderer(route) {
    switch (route) {
                case 'product-reviews': {
                    // Fallback: show a modal or notification since no product-reviews page exists
                    return async function showProductReviewsFallback() {
                        const { notify } = await import('../utils/helpers.js');
                        notify('The review hub is not implemented yet.', 'info');
                    };
                }
        case 'home': {
            const { renderHome } = await import('../pages/home.js');
            return renderHome;
        }
        case 'catalog': {
            const { renderCatalog } = await import('../pages/catalog.js');
            return renderCatalog;
        }
        case 'product': {
            const { showProductDetail } = await import('../pages/product-detail.js');
            return showProductDetail;
        }
        case 'cart': {
            const { renderCart } = await import('../pages/cart.js');
            return renderCart;
        }
        case 'favorites': {
            const { renderFavorites } = await import('../pages/favorites.js');
            return renderFavorites;
        }
        case 'my-orders': {
            const { renderMyOrders } = await import('../pages/my-orders.js');
            return renderMyOrders;
        }
        case 'order-confirmation': {
            const { renderOrderConfirmation } = await import('../pages/checkout.js');
            return renderOrderConfirmation;
        }
        case 'admin': {
            const { renderAdmin } = await import('../pages/admin.js');
            return renderAdmin;
        }
        case 'admin-login': {
            const [{ renderHome }, { showAdminLoginModal }] = await Promise.all([
                import('../pages/home.js'),
                import('../pages/admin.js')
            ]);
            return async () => {
                await renderHome();
                showAdminLoginModal();
            };
        }
        default:
            return null;
    }
}

/**
 * Navigates to a route
 * @param {string} route - Route name
 * @param {Object} [params={}] - Route parameters
 * @param {Object} [options={}] - Navigation options
 */
export async function navigate(route, params = {}, options = {}) {
    console.log('[Router] navigate called:', route, params);
    const { replace = false } = options;
    
    // Validate route
    if (!routes[route]) {
        console.warn('[Router] Unknown route:', route);
        route = 'home';
    }
    
    // Update state
    state.currentRoute = route;
    state.routeParams = params;
    
    // Update body data-route attribute
    setBodyRoute(route);
    
    // Update active nav highlighting
    try {
        document.querySelectorAll('.nav-link').forEach(a => {
            const r = a.getAttribute('data-route');
            if (r === route) a.classList.add('active'); 
            else a.classList.remove('active');
        });
    } catch { /* ignore */ }
    
    // Update URL
    const url = buildUrl(route, params);
    if (replace) {
        window.history.replaceState({ route, params }, '', url);
    } else {
        window.history.pushState({ route, params }, '', url);
    }
    
    // Render
    await renderCurrentRoute();
}

/**
 * Renders the current route
 */
export async function renderCurrentRoute() {
    const route = state.currentRoute || 'home';
    
    try {
        showSpinner(true);
        const renderer = await getRenderer(route);
        if (renderer) {
            await renderer();
        }
    } catch (err) {
        console.error('Failed to render route:', route, err);
    } finally {
        showSpinner(false);
    }
}

/**
 * Builds URL for a route
 * @param {string} route - Route name
 * @param {Object} params - Route parameters
 * @returns {string}
 */
function buildUrl(route, params = {}) {
    let url;
    if (route === 'home') {
        url = '/';
    } else if (route === 'admin-login') {
        url = '/admin/login';
    } else {
        url = `/${route}`;
    }
    
    if (route === 'product' && params.id) {
        url = `/product/${params.id}`;
    }
    
    // Add query params if any (excluding id for product)
    const queryParams = { ...params };
    if (route === 'product') delete queryParams.id;
    
    const queryString = Object.entries(queryParams)
        .filter(([_, v]) => v != null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    
    if (queryString) {
        url += '?' + queryString;
    }
    
    return url;
}

/**
 * Parses the current URL to determine route and params
 * @returns {{ route: string, params: Object }}
 */
export function parseCurrentUrl() {
    const path = window.location.pathname;
    const params = Object.fromEntries(new URLSearchParams(window.location.search));
    
    // Root
    if (path === '/' || path === '') {
        return { route: 'home', params };
    }
    
    // Remove leading slash and split
    const parts = path.slice(1).split('/').filter(Boolean);
    
    // Product detail: /product/:id
    if (parts[0] === 'product' && parts[1]) {
        return { route: 'product', params: { ...params, id: parts[1] } };
    }
    
    // Admin login shortcut: /admin/login
    if (parts[0] === 'admin' && parts[1] === 'login') {
        return { route: 'admin-login', params };
    }
    
    // Standard routes
    const routeName = parts[0];
    if (routes[routeName]) {
        return { route: routeName, params };
    }
    
    // Default to home
    return { route: 'home', params };
}

/**
 * Initializes the router
 */
export function initRouter() {
    // Handle browser back/forward
    window.addEventListener('popstate', (event) => {
        if (event.state?.route) {
            state.currentRoute = event.state.route;
            state.routeParams = event.state.params || {};
        } else {
            const { route, params } = parseCurrentUrl();
            state.currentRoute = route;
            state.routeParams = params;
        }
        renderCurrentRoute();
    });
    
    // Handle link clicks with data-route
    document.body.addEventListener('click', (e) => {
        const link = /** @type {HTMLElement} */ (e.target).closest('[data-route]');
        if (!link || link === document.body) return;
        
        const tag = link.tagName;
        const role = (link.getAttribute('role') || '').toLowerCase();
        const isInteractive = tag === 'A' || tag === 'BUTTON' || role === 'button' || role === 'link';
        if (!isInteractive) return;
        
        e.preventDefault();
        const route = link.getAttribute('data-route');
        if (!route) return;
        
        const id = link.getAttribute('data-id');
        const category = link.getAttribute('data-category');
        
        const params = {};
        if (id) params.id = id;
        if (category) params.category = category;
        
        navigate(route, params);
    });
    
    // Parse initial URL
    const { route, params } = parseCurrentUrl();
    state.currentRoute = route;
    state.routeParams = params;
}

/**
 * Gets the current route name
 * @returns {string}
 */
export function getCurrentRoute() {
    return state.currentRoute || 'home';
}

/**
 * Gets current route parameters
 * @returns {Object}
 */
export function getRouteParams() {
    return state.routeParams || {};
}
