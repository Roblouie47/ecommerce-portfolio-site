const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

function parseBoolean(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function parseNumber(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

module.exports = {
    PORT: parseNumber(process.env.PORT, 3000),
    ADMIN_TOKEN: process.env.ADMIN_TOKEN || 'changeme',
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
    ADMIN_NAME: process.env.ADMIN_NAME || '',
    STRIPE_SECRET: process.env.STRIPE_SECRET || null,
    STRIPE_PUBLISHABLE: process.env.STRIPE_PUBLISHABLE || null,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || null,
    PUBLIC_URL: process.env.PUBLIC_URL || 'http://localhost:' + (parseNumber(process.env.PORT, 3000)),
    SMTP_HOST: process.env.SMTP_HOST || '',
    SMTP_PORT: parseNumber(process.env.SMTP_PORT, 587),
    SMTP_USER: process.env.SMTP_USER || '',
    SMTP_PASS: process.env.SMTP_PASS || '',
    SMTP_SECURE: parseBoolean(process.env.SMTP_SECURE, false),
    EMAIL_FROM: process.env.EMAIL_FROM || process.env.SMTP_USER || ''
};
