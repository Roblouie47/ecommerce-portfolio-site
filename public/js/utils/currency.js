import { state } from '../state/index.js';

const DEFAULT_CURRENCY = 'USD';

/**
 * Currency exchange and formatting metadata relative to USD.
 */
export const CURRENCY_RATES = {
    USD: { rate: 1, symbol: '$', format: (v) => '$' + v.toFixed(2), minorUnits: 2 },
    PHP: {
        rate: 56,
        symbol: '₱',
        format: (v) => '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        minorUnits: 2
    },
    EUR: { rate: 0.92, symbol: '€', format: (v) => '€' + v.toFixed(2), minorUnits: 2 },
    JPY: { rate: 155, symbol: '¥', format: (v) => '¥' + Math.round(v).toLocaleString('ja-JP'), minorUnits: 0 },
    AUD: { rate: 1.5, symbol: 'A$', format: (v) => 'A$' + v.toFixed(2), minorUnits: 2 },
    CAD: { rate: 1.35, symbol: 'C$', format: (v) => 'C$' + v.toFixed(2), minorUnits: 2 }
};

const COUNTRY_TO_CURRENCY = {
    PH: 'PHP',
    PHL: 'PHP',
    PHILIPPINES: 'PHP',
    US: 'USD',
    USA: 'USD',
    CA: 'CAD',
    CANADA: 'CAD',
    AU: 'AUD',
    AUS: 'AUD',
    AUSTRALIA: 'AUD',
    JP: 'JPY',
    JPN: 'JPY',
    JAPAN: 'JPY',
    DE: 'EUR',
    FR: 'EUR',
    ES: 'EUR',
    IT: 'EUR',
    NL: 'EUR',
    BE: 'EUR',
    SE: 'EUR',
    FI: 'EUR',
    DK: 'EUR',
    IE: 'EUR',
    PT: 'EUR',
    AT: 'EUR',
    PL: 'EUR',
    CZ: 'EUR',
    HU: 'EUR',
    SK: 'EUR',
    RO: 'EUR',
    BG: 'EUR',
    GR: 'EUR'
};

function normalizeCurrency(code) {
    if (!code || typeof code !== 'string') return DEFAULT_CURRENCY;
    const up = code.trim().toUpperCase();
    return CURRENCY_RATES[up] ? up : DEFAULT_CURRENCY;
}

function getCurrencyMeta(code) {
    const normalized = normalizeCurrency(code);
    return CURRENCY_RATES[normalized] || CURRENCY_RATES[DEFAULT_CURRENCY];
}

/**
 * Gets the current selected currency code.
 * @returns {string}
 */
export function getSelectedCurrency() {
    const stored = state.selectedCurrency || (typeof localStorage !== 'undefined' ? localStorage.getItem('selectedCurrency') : '') || DEFAULT_CURRENCY;
    const normalized = normalizeCurrency(stored);
    state.selectedCurrency = normalized;
    return normalized;
}

/**
 * Sets the selected currency and persists it.
 * @param {string} code - Currency code (USD, PHP, EUR, etc.)
 * @returns {string} - The normalized currency code that was set
 */
export function setSelectedCurrency(code) {
    const normalized = normalizeCurrency(code);
    state.selectedCurrency = normalized;
    try {
        localStorage.setItem('selectedCurrency', normalized);
    } catch { /* ignore */ }
    return normalized;
}

/**
 * Converts USD cents to the requested currency minor units (e.g., cents).
 * @param {number} cents - Amount in USD cents
 * @param {string} [targetCurrency] - Target currency code
 * @returns {number}
 */
export function convertCurrency(cents, targetCurrency) {
    const cfg = getCurrencyMeta(targetCurrency || getSelectedCurrency());
    const usdValue = typeof cents === 'number' ? cents / 100 : 0;
    const converted = usdValue * cfg.rate;
    const multiplier = Math.pow(10, cfg.minorUnits ?? 2);
    return Math.round(converted * multiplier);
}

/**
 * Formats a cent amount as a money string in the selected currency.
 * @param {number} cents - Amount in USD cents (base currency)
 * @param {Object} [options]
 * @param {boolean} [options.showBase=false] - Whether to append USD equivalent
 * @param {string} [options.currency] - Override currency code
 * @returns {string}
 */
export function money(cents, options = {}) {
    const { showBase = false, currency } = options;
    const code = normalizeCurrency(currency || getSelectedCurrency());
    const cfg = getCurrencyMeta(code);
    const usdValue = typeof cents === 'number' ? cents / 100 : 0;
    const converted = usdValue * cfg.rate;
    const primary = cfg.format(converted);
    if (!showBase || code === DEFAULT_CURRENCY) {
        return primary;
    }
    return primary + ` (USD $${usdValue.toFixed(2)})`;
}

/**
 * Maps a country/region code to a currency code.
 * @param {string} countryCode
 * @returns {string}
 */
export function countryToCurrency(countryCode) {
    const up = (countryCode || '').trim().toUpperCase();
    return COUNTRY_TO_CURRENCY[up] || DEFAULT_CURRENCY;
}

/**
 * Convenience helper to set currency based on a country code.
 * @param {string} countryCode
 * @returns {string}
 */
export function setCurrencyFromCountry(countryCode) {
    return setSelectedCurrency(countryToCurrency(countryCode));
}

/**
 * Initialize currency selection from localStorage or customer profile.
 */
export function initCurrency() {
    try {
        const saved = localStorage.getItem('selectedCurrency');
        if (saved && CURRENCY_RATES[saved]) {
            state.selectedCurrency = saved;
            return;
        }
        const storedCountry = localStorage.getItem('globalCountry');
        if (storedCountry) {
            state.selectedCurrency = countryToCurrency(storedCountry);
            return;
        }
    } catch { /* ignore */ }

    if (state.customer?.country) {
        state.selectedCurrency = countryToCurrency(state.customer.country);
    } else if (!state.selectedCurrency || !CURRENCY_RATES[state.selectedCurrency]) {
        state.selectedCurrency = DEFAULT_CURRENCY;
    }
}
