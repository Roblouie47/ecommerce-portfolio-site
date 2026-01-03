import { el } from '../utils/dom.js';
import { state } from '../state/index.js';
import { money, setCurrencyFromCountry } from '../utils/currency.js';
import { renderCurrentRoute } from '../router/index.js';

const DEFAULT_COUNTRY = 'US';
const COUNTRY_CHOICES = [
    ['PH', 'Philippines'],
    ['US', 'USA'],
    ['CA', 'Canada'],
    ['AU', 'Australia'],
    ['JP', 'Japan'],
    ['DE', 'Germany'],
    ['FR', 'France'],
    ['ES', 'Spain'],
    ['IT', 'Italy'],
    ['NL', 'Netherlands'],
    ['BE', 'Belgium'],
    ['SE', 'Sweden'],
    ['FI', 'Finland'],
    ['DK', 'Denmark'],
    ['IE', 'Ireland'],
    ['PT', 'Portugal'],
    ['AT', 'Austria'],
    ['PL', 'Poland'],
    ['CZ', 'Czech Republic'],
    ['HU', 'Hungary'],
    ['SK', 'Slovakia'],
    ['RO', 'Romania'],
    ['BG', 'Bulgaria'],
    ['GR', 'Greece'],
    ['OTHER', 'Other / International']
];
const COUNTRY_SYNONYMS = {
    PHL: 'PH',
    PHILIPPINES: 'PH',
    USA: 'US',
    UNITED_STATES: 'US',
    CANADA: 'CA',
    AUS: 'AU',
    AUSTRALIA: 'AU',
    JPN: 'JP',
    JAPAN: 'JP',
    GERMANY: 'DE',
    FRANCE: 'FR',
    SPAIN: 'ES',
    ITALY: 'IT',
    NETHERLANDS: 'NL',
    BELGIUM: 'BE',
    SWEDEN: 'SE',
    FINLAND: 'FI',
    DENMARK: 'DK',
    IRELAND: 'IE',
    PORTUGAL: 'PT',
    AUSTRIA: 'AT',
    POLAND: 'PL',
    CZECH: 'CZ',
    CZECHIA: 'CZ',
    HUNGARY: 'HU',
    SLOVAKIA: 'SK',
    ROMANIA: 'RO',
    BULGARIA: 'BG',
    GREECE: 'GR'
};
const SUPPORTED_CODES = new Set(COUNTRY_CHOICES.map(([code]) => code));
let activeCountryCode = null;

function normalizeCountryCode(raw) {
    const up = (raw || '').toString().trim().toUpperCase().replace(/\s+/g, '_');
    if (!up) return DEFAULT_COUNTRY;
    if (COUNTRY_SYNONYMS[up]) return COUNTRY_SYNONYMS[up];
    if (SUPPORTED_CODES.has(up)) return up;
    return 'OTHER';
}

function detectInitialCountry() {
    try {
        const stored = localStorage.getItem('globalCountry');
        if (stored) return normalizeCountryCode(stored);
    } catch { /* ignore */ }
    if (state.customer?.country) return normalizeCountryCode(state.customer.country);
    if (state.cartPage?.shipCountry) return normalizeCountryCode(state.cartPage.shipCountry);
    return DEFAULT_COUNTRY;
}

function buildOptionsHtml() {
    return COUNTRY_CHOICES.map(([code, label]) => `<option value="${code}">${label}</option>`).join('');
}

function syncSelectValue(code) {
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('global-country-select'));
    if (!select) return;
    const exists = Array.from(select.options).some(opt => opt.value === code);
    select.value = exists ? code : 'OTHER';
}

function refreshInlinePrices() {
    document.querySelectorAll('[data-price-cents]').forEach(node => {
        const cents = Number(node.getAttribute('data-price-cents'));
        if (!Number.isNaN(cents)) {
            node.textContent = money(cents);
        }
    });
}

export async function applyCountrySelection(countryCode, options = {}) {
    const { persist = true, rerender = true, updateUI = true, preserveScroll = true } = options;
    const normalized = normalizeCountryCode(countryCode || activeCountryCode || detectInitialCountry());
    const changed = normalized !== activeCountryCode;
    activeCountryCode = normalized;
    if (persist) {
        try { localStorage.setItem('globalCountry', normalized); } catch { /* ignore */ }
    }
    if (state.cartPage) state.cartPage.shipCountry = normalized;
    const currency = setCurrencyFromCountry(normalized);
    if (updateUI) syncSelectValue(normalized);
    refreshInlinePrices();
    if (rerender && changed) {
        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        try {
            await renderCurrentRoute();
        } catch (err) {
            console.error('[country-select] Failed to rerender route after country change', err);
        } finally {
            if (preserveScroll) window.scrollTo(0, scrollY);
        }
    }
    return { country: normalized, currency };
}

export function mountCountrySelector() {
    const header = document.querySelector('.site-header');
    if (!header) return;
    const headerActions = header.querySelector('.header-actions') || header;
    let wrap = headerActions.querySelector('.country-select-wrap');
    let select = /** @type {HTMLSelectElement | null} */ (document.getElementById('global-country-select'));
    if (!wrap) {
        wrap = el('div', { class: 'country-select-wrap' });
    } else {
        wrap.innerHTML = '';
    }
    const label = el('label', { class: 'country-select-label', attrs: { for: 'global-country-select' } }, 'Country');
    if (!select) {
        select = /** @type {HTMLSelectElement} */ (el('select', { class: 'header-country-select', attrs: { id: 'global-country-select' } }));
    }
    select.style.zIndex = '500';
    select.innerHTML = buildOptionsHtml();
    wrap.appendChild(label);
    wrap.appendChild(select);
    if (!wrap.isConnected) {
        const cartAnchor = headerActions.querySelector('.cart-fab');
        if (cartAnchor) headerActions.insertBefore(wrap, cartAnchor);
        else headerActions.appendChild(wrap);
    }
    const initialCountry = activeCountryCode || detectInitialCountry();
    if (select) {
        select.value = initialCountry;
    } else {
        console.warn('[country-select] Select element missing during mount');
        return;
    }
    if (!select.dataset.bound) {
        select.addEventListener('change', (evt) => {
            const value = /** @type {HTMLSelectElement} */ (evt.target).value;
            applyCountrySelection(value, { rerender: true });
        });
        select.dataset.bound = 'true';
    }
    applyCountrySelection(initialCountry, { rerender: false });
}

export function getActiveCountryCode() {
    return activeCountryCode || detectInitialCountry();
}

export const AVAILABLE_COUNTRIES = COUNTRY_CHOICES.map(([code, label]) => ({ code, label }));
