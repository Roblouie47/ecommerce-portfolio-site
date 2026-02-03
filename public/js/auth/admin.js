import { state } from '../state/index.js';
import { apiFetch } from '../api/index.js';
import { notify } from '../utils/helpers.js';
import { el } from '../utils/dom.js';

/**
 * Normalizes admin profile data
 * @param {Object} profile - Raw profile data
 * @returns {Object|null}
 */
export function normalizeAdminProfile(profile) {
    if (!profile || typeof profile !== 'object') return null;
    return {
        id: profile.id || profile.adminId || '',
        email: profile.email || profile.adminEmail || '',
        name: profile.name || profile.adminName || profile.displayName || '',
        role: profile.role || 'admin'
    };
}

/**
 * Updates admin navigation visibility based on auth state
 */
export function updateAdminNavVisibility() {
    const visible = !!state.admin.user;
    try {
        document.querySelectorAll('[data-route="admin"]').forEach(link => {
            /** @type {HTMLElement} */ (link).style.display = visible ? '' : 'none';
        });
    } catch { /* no-op */ }
    if (document.body && document.body.classList) {
        document.body.classList.toggle('admin-authenticated', visible);
    }
}

/**
 * Sets admin authentication
 * @param {Object} auth - Auth object with token and user
 */
let expiryTimer = null;

function scheduleAdminTokenExpiryCheck() {
    if (expiryTimer) {
        clearTimeout(expiryTimer);
        expiryTimer = null;
    }
    if (!state.admin.expiresAt) return;
    const expiresAtMs = Date.parse(state.admin.expiresAt);
    if (Number.isNaN(expiresAtMs)) return;
    const delay = Math.max(0, expiresAtMs - Date.now());
    expiryTimer = setTimeout(() => {
        clearAdminAuth(true);
        notify('Admin session expired. Please sign in again.', 'warn', 4000);
    }, delay);
}

// Run once on module eval to respect persisted expiration
setTimeout(() => scheduleAdminTokenExpiryCheck(), 0);

export function setAdminAuth(auth) {
    const profile = normalizeAdminProfile(auth?.user);
    const expiresAt = auth && typeof auth.expiresAt === 'string' ? auth.expiresAt : null;
    state.admin.user = profile;
    state.admin.expiresAt = expiresAt;
    try {
        if (profile) localStorage.setItem('adminProfile', JSON.stringify(profile));
        else localStorage.removeItem('adminProfile');
        if (expiresAt) localStorage.setItem('adminTokenExpiresAt', expiresAt);
        else localStorage.removeItem('adminTokenExpiresAt');
    } catch { /* ignore storage issues */ }
    scheduleAdminTokenExpiryCheck();
    updateAdminNavVisibility();
    mountAdminHeaderControls();
}

/**
 * Clears admin authentication
 * @param {boolean} [notifyUser=false] - Whether to show notification
 */
export function clearAdminAuth(notifyUser = false) {
    try {
        if (expiryTimer) {
            clearTimeout(expiryTimer);
            expiryTimer = null;
        }
        state.admin.token = '';
        state.admin.user = null;
        state.admin.expiresAt = null;
        state.admin.orders = [];
        state.admin.discounts = [];
        state.admin.lowStock = [];
        state.admin.reviews = { status: 'pending', items: [] };
        try {
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminProfile');
            localStorage.removeItem('adminTokenExpiresAt');
        } catch { /* ignore */ }
        updateAdminNavVisibility();
        mountAdminHeaderControls();
        if (notifyUser) notify('Admin signed out.', 'info', 2400);
    } catch (err) {
        console.error('Failed to clear admin auth state:', err);
    }
}

/**
 * Verifies the current admin token is valid
 * @returns {Promise<boolean>}
 */
export async function verifyAdminToken() {
    if (!state.admin.user) return false;
    if (state.admin.expiresAt) {
        const expiresAtMs = Date.parse(state.admin.expiresAt);
        if (!Number.isNaN(expiresAtMs) && expiresAtMs <= Date.now()) {
            clearAdminAuth(false);
            return false;
        }
    }
    
    try {
        const data = await apiFetch('/api/admin/verify');
        if (data.ok && data.user) {
            state.admin.user = normalizeAdminProfile(data.user);
            localStorage.setItem('adminProfile', JSON.stringify(state.admin.user));
            if (data.expiresAt) {
                state.admin.expiresAt = data.expiresAt;
                localStorage.setItem('adminTokenExpiresAt', data.expiresAt);
            }
            return true;
        }
        clearAdminAuth();
        return false;
    } catch {
        clearAdminAuth();
        return false;
    }
}

/**
 * Admin login request
 * @param {string} email - Admin email
 * @param {string} password - Admin password
 * @returns {Promise<Object>}
 */
export async function adminLoginRequest(email, password) {
    const data = await apiFetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    
    if (data.user) {
        setAdminAuth({ user: data.user, expiresAt: data.expiresAt });
    }
    
    return data;
}

/**
 * Mounts admin header controls
 */
export function mountAdminHeaderControls() {
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
    const isAuthed = !!state.admin.user;
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
