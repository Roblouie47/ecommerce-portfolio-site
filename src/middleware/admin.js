const crypto = require('crypto');
const db = require('../db');
const { ADMIN_ALLOWED_IPS } = require('../config/env');

const ADMIN_SESSION_COOKIE_NAME = process.env.ADMIN_SESSION_COOKIE_NAME || 'admin_session';
const ADMIN_CSRF_COOKIE_NAME = process.env.ADMIN_CSRF_COOKIE_NAME || 'admin_csrf';

const allowedIps = Array.isArray(ADMIN_ALLOWED_IPS) ? ADMIN_ALLOWED_IPS : [];
const allowedIpSet = new Set(allowedIps.map(ip => ip.toLowerCase()));

const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

const selectAdminSessionStmt = db.prepare(`
    SELECT s.id, s.userId, s.token, s.csrfToken, s.createdAt, s.expiresAt, s.ip, s.userAgent, u.email
    FROM admin_sessions s
    LEFT JOIN users u ON u.id = s.userId
    WHERE s.token = ?
`);
const insertAdminSessionStmt = db.prepare(`
    INSERT INTO admin_sessions (id, userId, token, csrfToken, createdAt, expiresAt, ip, userAgent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const deleteAdminSessionStmt = db.prepare('DELETE FROM admin_sessions WHERE token = ?');
const deleteExpiredAdminSessionsStmt = db.prepare('DELETE FROM admin_sessions WHERE expiresAt <= ?');
const updateAdminSessionExpiryStmt = db.prepare('UPDATE admin_sessions SET expiresAt = ? WHERE token = ?');

function pruneExpiredSessions() {
    try {
        deleteExpiredAdminSessionsStmt.run(new Date().toISOString());
    } catch {
        // ignore cleanup errors
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

function extractAdminCsrfToken(req) {
    const header = req.header('X-CSRF-Token') || req.header('X-Admin-CSRF');
    if (typeof header === 'string' && header.trim()) return header.trim();
    return '';
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
    const row = selectAdminSessionStmt.get(token);
    if (!row) return null;
    const expiresAtMs = Date.parse(row.expiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
        deleteAdminSessionStmt.run(token);
        return null;
    }
    const newExpiry = new Date(Date.now() + ADMIN_SESSION_TTL_MS).toISOString();
    updateAdminSessionExpiryStmt.run(newExpiry, token);
    return {
        token: row.token,
        userId: row.userId,
        email: row.email || null,
        role: 'admin',
        csrfToken: row.csrfToken,
        issuedAt: row.createdAt,
        expiresAt: newExpiry,
        ip: row.ip || null,
        userAgent: row.userAgent || null
    };
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
    const method = (req.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const cookies = parseCookieHeader(req?.headers?.cookie);
        const csrfCookie = cookies[ADMIN_CSRF_COOKIE_NAME];
        const csrfHeader = extractAdminCsrfToken(req);
        if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie || csrfHeader !== session.csrfToken) {
            return res.status(403).json({ error: 'Invalid CSRF token' });
        }
    }
    req.adminSession = session;
    next();
}

function issueAdminSession(user = {}, req) {
    pruneExpiredSessions();
    const token = crypto.randomBytes(48).toString('hex');
    const csrfToken = crypto.randomBytes(32).toString('hex');
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + ADMIN_SESSION_TTL_MS);
    const sessionId = crypto.randomBytes(16).toString('hex');
    insertAdminSessionStmt.run(
        sessionId,
        user.userId || user.id || null,
        token,
        csrfToken,
        issuedAt.toISOString(),
        expiresAt.toISOString(),
        req?.ip || null,
        req?.headers?.['user-agent'] || null
    );
    return { token, csrfToken, expiresAt: expiresAt.toISOString() };
}

function revokeAdminSession(token) {
    if (!token) return false;
    return deleteAdminSessionStmt.run(token).changes > 0;
}

module.exports = { isAdmin, requireAdmin, issueAdminSession, revokeAdminSession, ADMIN_SESSION_COOKIE_NAME, ADMIN_CSRF_COOKIE_NAME };
