const db = require('../db');

const reviewSummaryStmt = db.prepare('SELECT COUNT(*) AS count, AVG(rating) AS avgRating, SUM(quantityPurchased) AS totalQty FROM reviews WHERE productId = ? AND status = ?');
const reviewDistributionStmt = db.prepare('SELECT rating, COUNT(*) AS count FROM reviews WHERE productId = ? AND status = ? GROUP BY rating');

function parseJSONField(val, fallback) { try { return JSON.parse(val); } catch { return fallback; } }

function computeProductInventory(productId) {
    const variantSum = db.prepare('SELECT SUM(inventory) as sum FROM variants WHERE productId = ?').get(productId).sum;
    if (variantSum !== null) return variantSum;
    const prod = db.prepare('SELECT baseInventory as inv FROM products WHERE id=?').get(productId);
    return prod ? prod.inv : 0;
}

function validateProductInput(body) {
    const errors = [];
    if (!body.title || typeof body.title !== 'string') errors.push('title required');
    if (body.priceCents == null || !Number.isInteger(body.priceCents) || body.priceCents < 0) errors.push('priceCents invalid');
    if (body.baseInventory != null && (!Number.isInteger(body.baseInventory) || body.baseInventory < 0)) errors.push('baseInventory invalid');
    if (body.variants && !Array.isArray(body.variants)) errors.push('variants must be array');
    return errors;
}

function validateVariant(v) {
    const errs = [];
    if (!v || typeof v !== 'object') { errs.push('variant object required'); return errs; }
    if (v.priceCents != null && (!Number.isInteger(v.priceCents) || v.priceCents < 0)) errs.push('variant priceCents invalid');
    if (v.inventory == null || !Number.isInteger(v.inventory) || v.inventory < 0) errs.push('variant inventory invalid');
    if (v.optionValues && typeof v.optionValues !== 'object') errs.push('optionValues must be object');
    return errs;
}

function buildProductRow(row) {
    if (!row) return null;
    const reviewSummary = getReviewSummary(row.id);
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        priceCents: row.priceCents,
        images: parseJSONField(row.images, []),
        tags: parseJSONField(row.tags, []),
        baseInventory: row.baseInventory,
        shippingFeeCents: row.shippingFeeCents || 0,
        variants: db.prepare('SELECT * FROM variants WHERE productId = ?').all(row.id).map(v => ({
            id: v.id,
            sku: v.sku,
            optionValues: parseJSONField(v.optionValues, {}),
            priceCents: v.priceCents,
            inventory: v.inventory
        })),
        totalInventory: computeProductInventory(row.id),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt || null,
        reviewSummary
    };
}

function getReviewSummary(productId) {
    const base = reviewSummaryStmt.get(productId, 'approved') || { count: 0, avgRating: null, totalQty: 0 };
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of reviewDistributionStmt.all(productId, 'approved')) {
        const rating = Number(row.rating);
        if (rating >= 1 && rating <= 5) distribution[rating] = row.count;
    }
    const count = base.count || 0;
    const average = count ? Number((base.avgRating ?? 0).toFixed(2)) : null;
    return {
        count,
        average,
        totalQuantity: base.totalQty || 0,
        distribution
    };
}

function computeCartTotals(cartId, discountCode) {
    if (discountCode && typeof discountCode === 'string') discountCode = discountCode.trim().toUpperCase(); else discountCode = undefined;
    const items = db.prepare(`SELECT ci.quantity, p.priceCents as basePrice, v.priceCents as variantPrice FROM cart_items ci JOIN products p ON p.id = ci.productId LEFT JOIN variants v ON v.id = ci.variantId WHERE ci.cartId = ?`).all(cartId);
    let subtotal = 0;
    for (const it of items) {
        const unit = it.variantPrice != null ? it.variantPrice : it.basePrice;
        subtotal += unit * it.quantity;
    }
    let discount = 0;
    if (discountCode) {
        const d = db.prepare('SELECT * FROM discounts WHERE code=?').get(discountCode);
        try { console.log('[computeCartTotals] code lookup', discountCode, 'found?', !!d); } catch { }
        if (d) {
            const now = Date.now();
            // Treat explicit ship type (or heuristic FREESHIP style) as shipping-only: skip here
            const isShipOnly = d.type === 'ship' || (/SHIP/i.test(d.code || '') && d.value === 100);
            if (isShipOnly) { try { console.log('[computeCartTotals] code', discountCode, 'is ship-only; skipping item discount'); } catch { } }
            if (!isShipOnly) {
                if (!d.expiresAt || new Date(d.expiresAt).getTime() > now) {
                    if (subtotal >= d.minSubtotalCents) {
                        if (d.type === 'percent') {
                            const pct = Math.min(100, Math.max(0, d.value));
                            discount = Math.floor(subtotal * (pct / 100));
                            try { console.log('[computeCartTotals] percent discount applied', discount); } catch { }
                        }
                        else if (d.type === 'fixed') discount = Math.min(subtotal, d.value);
                    }
                }
            }
        }
    }
    return { subtotalCents: subtotal, discountCents: discount, totalCents: subtotal - discount };
}

// Password hashing (graceful fallback if bcryptjs not installed yet)
let bcrypt;
try { bcrypt = require('bcryptjs'); } catch {
    console.warn('[auth] bcryptjs not installed; using insecure SHA256 fallback. Install with npm i bcryptjs for production security.');
}
const crypto = require('crypto');
function sha256(str) { return crypto.createHash('sha256').update(String(str)).digest('hex'); }
function hashPassword(pw) {
    if (bcrypt) return bcrypt.hashSync(pw, 10);
    return 'sha256$' + sha256(pw);
}
function verifyPassword(pw, hash) {
    if (!hash) return false;
    if (bcrypt && !hash.startsWith('sha256$')) { try { return bcrypt.compareSync(pw, hash); } catch { return false; } }
    if (hash.startsWith('sha256$')) return ('sha256$' + sha256(pw)) === hash;
    return false;
}
function newToken() { return Buffer.from(crypto.randomUUID ? crypto.randomUUID() : require('crypto').randomBytes(16).toString('hex')).toString('hex'); }
module.exports = { parseJSONField, computeProductInventory, validateProductInput, validateVariant, buildProductRow, computeCartTotals, hashPassword, verifyPassword, newToken, getReviewSummary };
