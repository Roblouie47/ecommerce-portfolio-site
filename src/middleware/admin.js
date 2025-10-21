const { ADMIN_TOKEN } = require('../config/env');

function isAdmin(req) {
    return req.header('X-Admin-Token') === ADMIN_TOKEN;
}

function requireAdmin(req, res, next) {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

module.exports = { isAdmin, requireAdmin };
