const crypto = require('crypto');
const { ADMIN_ALLOWED_IPS } = require('../config/env');

const ADMIN_SESSION_COOKIE_NAME = process.env.ADMIN_SESSION_COOKIE_NAME || 'admin_session';

const allowedIps = Array.isArray(ADMIN_ALLOWED_IPS) ? ADMIN_ALLOWED_IPS : [];
const allowedIpSet = new Set(allowedIps.map(ip => ip.toLowerCase()));

const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const adminSessions = new Map();

function pruneExpiredSessions() {
    const now = Date.now();
    for (const [token, session] of adminSessions.entries()) {
        if (session.expiresAt <= now) adminSessions.delete(token);
    }
}

const cleanupTimer = setInterval(pruneExpiredSessions, 1000 * 60 * 10);
if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();

function parseCookieHeader(header) {
    const result = {};
    if (!header || typeof header !== 'string') return result;
    header.split(';').forEach(part => {
        const idx = part.indexOf('=');
        if (idx === -1) return;
        const key = part.slice(0, idx).trim();
        const val = part.slice(idx + 1).trim();
        if (!key) return;
        result[key] = decodeURIComponent(val);
    });
    return result;
}

function extractAdminToken(req) {
    const header = req.header('X-Admin-Token');
    if (typeof header === 'string' && header.trim()) return header.trim();
    const cookies = parseCookieHeader(req?.headers?.cookie);
    const cookieToken = cookies[ADMIN_SESSION_COOKIE_NAME];
    return typeof cookieToken === 'string' ? cookieToken.trim() : '';
}

function requestMatchesIpAllowList(req) {
    if (!allowedIpSet.size) return true;
    const candidates = [];
    if (Array.isArray(req.ips) && req.ips.length) candidates.push(...req.ips);
    if (req.ip) candidates.push(req.ip);
    return candidates
        .map(ip => ip.toLowerCase())
        .some(ip => allowedIpSet.has(ip));
}

function getAdminSession(token) {
    pruneExpiredSessions();
    if (!token) return null;
    const session = adminSessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
        adminSessions.delete(token);
        return null;
    }
    session.expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
    adminSessions.set(token, session);
    return session;
}

function isAdmin(req) {
    const token = extractAdminToken(req);
    if (!token) return false;
    const session = getAdminSession(token);
    if (!session) return false;
    if (!requestMatchesIpAllowList(req)) return false;
    req.adminSession = session;
    return true;
}

function requireAdmin(req, res, next) {
    const token = extractAdminToken(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const session = getAdminSession(token);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    if (!requestMatchesIpAllowList(req)) {
        return res.status(403).json({ error: 'Admin access blocked from this IP' });
    }
    req.adminSession = session;
    next();
}

function issueAdminSession(user = {}, req) {
    pruneExpiredSessions();
    const token = crypto.randomBytes(48).toString('hex');
    const issuedAt = Date.now();
    const expiresAt = issuedAt + ADMIN_SESSION_TTL_MS;
    const session = {
        token,
        userId: user.userId || user.id || null,
        email: user.email || null,
        role: 'admin',
        issuedAt,
        expiresAt,
        ip: req?.ip || null,
        userAgent: req?.headers?.['user-agent'] || null
    };
    adminSessions.set(token, session);
    return { token, expiresAt: new Date(expiresAt).toISOString() };
}

function revokeAdminSession(token) {
    if (!token) return false;
    return adminSessions.delete(token);
}

module.exports = { isAdmin, requireAdmin, issueAdminSession, revokeAdminSession, ADMIN_SESSION_COOKIE_NAME };
