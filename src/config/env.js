const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

function parseBoolean(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function parseTrustProxy(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim();
    if (!normalized) return fallback;
    if (['1', 'true', 'yes', 'on'].includes(normalized.toLowerCase())) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized.toLowerCase())) return false;
    if (normalized.includes(',')) return normalized.split(',').map(v => v.trim()).filter(Boolean);
    return normalized;
}

function parseNumber(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCsvList(value) {
    if (typeof value !== 'string') return [];
    return value
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);
}

const NODE_ENV = process.env.NODE_ENV || 'development';

module.exports = {
    NODE_ENV,
    PORT: parseNumber(process.env.PORT, 3000),
    ADMIN_TOKEN: process.env.ADMIN_TOKEN || '1408801338Rob12345',
    ADMIN_TOKEN_ENABLED: parseBoolean(process.env.ADMIN_TOKEN_ENABLED, NODE_ENV !== 'production'),
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
    ADMIN_NAME: process.env.ADMIN_NAME || '',
    ADMIN_ALLOWED_IPS: parseCsvList(process.env.ADMIN_ALLOWED_IPS),
    SESSION_SECRET: process.env.SESSION_SECRET || 'dev-session-secret',
    JWT_SECRET: process.env.JWT_SECRET || 'dev-jwt-secret',
    SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME || 'customer_session',
    SESSION_COOKIE_ONLY: parseBoolean(process.env.SESSION_COOKIE_ONLY, true),
    SESSION_COOKIE_SECURE: parseBoolean(process.env.SESSION_COOKIE_SECURE, NODE_ENV === 'production'),
    SESSION_COOKIE_SAMESITE: process.env.SESSION_COOKIE_SAMESITE || (NODE_ENV === 'production' ? 'strict' : 'lax'),
    TRUST_PROXY: parseTrustProxy(process.env.TRUST_PROXY, false),
    CORS_ORIGINS: parseCsvList(process.env.CORS_ORIGINS),
    PUBLIC_URL: process.env.PUBLIC_URL || 'http://localhost:' + (parseNumber(process.env.PORT, 3000)),
    SMTP_HOST: process.env.SMTP_HOST || '',
    SMTP_PORT: parseNumber(process.env.SMTP_PORT, 587),
    SMTP_USER: process.env.SMTP_USER || '',
    SMTP_PASS: process.env.SMTP_PASS || '',
    SMTP_SECURE: parseBoolean(process.env.SMTP_SECURE, false),
    EMAIL_FROM: process.env.EMAIL_FROM || process.env.SMTP_USER || '',
    EMAIL_DEV_MODE: parseBoolean(process.env.EMAIL_DEV_MODE, NODE_ENV !== 'production'),
    EMAIL_DEV_RECIPIENT: process.env.EMAIL_DEV_RECIPIENT || '',
    MAILBOXLAYER_API_KEY: process.env.MAILBOXLAYER_API_KEY || '',
    MAILBOXLAYER_BASE_URL: process.env.MAILBOXLAYER_BASE_URL || 'http://apilayer.net/api/check',
    MAILBOXLAYER_TIMEOUT_MS: parseNumber(process.env.MAILBOXLAYER_TIMEOUT_MS, 6000),
    MAILBOXLAYER_STRICT: parseBoolean(process.env.MAILBOXLAYER_STRICT, true)
};
