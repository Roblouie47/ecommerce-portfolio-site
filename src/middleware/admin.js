const crypto = require('crypto');
const { ADMIN_TOKEN, ADMIN_ALLOWED_IPS } = require('../config/env');

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

function extractAdminToken(req) {
    const header = req.header('X-Admin-Token');
    return typeof header === 'string' ? header.trim() : '';
}

function requestMatchesIpAllowList(req) {
    if (!allowedIpSet.size) return true;
    const candidates = [];
    if (Array.isArray(req.ips) && req.ips.length) candidates.push(...req.ips);
    if (req.ip) candidates.push(req.ip);
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        forwarded.split(',').forEach(ip => {
            const trimmed = ip.trim();
            if (trimmed) candidates.push(trimmed);
        });
    }
    return candidates
        .map(ip => ip.toLowerCase())
        .some(ip => allowedIpSet.has(ip));
}

function hasStaticAdminToken(token) {
    return !!token && token === ADMIN_TOKEN;
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
    if (hasStaticAdminToken(token)) {
        if (!requestMatchesIpAllowList(req)) return false;
        req.adminSession = req.adminSession || { token: ADMIN_TOKEN, role: 'admin', source: 'static' };
        return true;
    }
    const session = getAdminSession(token);
    if (!session) return false;
    if (!requestMatchesIpAllowList(req)) return false;
    req.adminSession = session;
    return true;
}

function requireAdmin(req, res, next) {
    const token = extractAdminToken(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    if (hasStaticAdminToken(token)) {
        if (!requestMatchesIpAllowList(req)) {
            return res.status(403).json({ error: 'Admin access blocked from this IP' });
        }
        req.adminSession = req.adminSession || { token: ADMIN_TOKEN, role: 'admin', source: 'static' };
        return next();
    }

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

module.exports = { isAdmin, requireAdmin, issueAdminSession };
