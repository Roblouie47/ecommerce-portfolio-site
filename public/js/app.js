/**
 * Main Application Entry Point
 * E-commerce Portfolio Site
 * 
 * This file initializes the application and sets up routing.
 */

import { state, initState } from './state/index.js';
import { loadProducts, sanitizeCart, updateCartBadge } from './api/index.js';
import { verifyCustomerSession, mountCustomerHeaderControls } from './auth/customer.js';
import { initRouter, renderCurrentRoute, parseCurrentUrl, navigate } from './router/index.js';
import { updateFavoritesBadge } from './components/cart-favorites.js';
import { maybeHandlePayMongoReturn } from './pages/checkout.js';
import { verifyAdminToken, mountAdminHeaderControls } from './auth/admin.js';
import { showSpinner, notify } from './utils/helpers.js';
import { initCurrency } from './utils/currency.js';
import { mountCountrySelector } from './components/country-select.js';

// Make navigate globally available for inline handlers
/** @type {any} */ (window).navigate = navigate;

/**
 * Initialize the application
 */
async function initApp() {
    try {
        console.log('[App] Starting initialization...');
        showSpinner(true);
        
        // Initialize state from localStorage
        console.log('[App] Initializing state...');
        initState();
        initCurrency();
        
        // Set up router (handles URL parsing and popstate)
        console.log('[App] Setting up router...');
        initRouter();
        
        // Verify authentication tokens
        console.log('[App] Verifying auth tokens...');
        await Promise.all([
            verifyAdminToken().catch((e) => console.log('[App] Admin verify error:', e)),
            verifyCustomerSession().catch((e) => console.log('[App] Customer verify error:', e))
        ]);
        
        // Mount header controls
        console.log('[App] Mounting header controls...');
        mountAdminHeaderControls();
        mountCustomerHeaderControls();
        mountCountrySelector();
        
        // Load products
        console.log('[App] Loading products...');
        await loadProducts();
        console.log('[App] Products loaded:', state.products.length);
        
        // Sanitize cart (remove products no longer available)
        console.log('[App] Sanitizing cart...');
        await sanitizeCart();
        
        // Update UI badges
        console.log('[App] Updating badges...');
        updateCartBadge();
        updateFavoritesBadge();
        
        const { route, params } = parseCurrentUrl();
        console.log('[App] Current route:', route, 'params:', params);
        await maybeHandlePayMongoReturn();
        
        // Render current route
        console.log('[App] Rendering current route...');
        await renderCurrentRoute();
        console.log('[App] Initialization complete!');
        
        // Set up global error handler
        window.addEventListener('error', (e) => {
            console.error('Global error:', e.error);
        });
        
        window.addEventListener('unhandledrejection', (e) => {
            console.error('Unhandled rejection:', e.reason);
        });
        
    } catch (err) {
        console.error('App initialization failed:', err);
        notify('Failed to load application. Please refresh the page.', 'error');
    } finally {
        showSpinner(false);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Export for debugging
/** @type {any} */ (window).__APP_STATE__ = state;
