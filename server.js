// Clean, rebuilt server below
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuid } = require('uuid');
const { PORT, ADMIN_TOKEN, STRIPE_SECRET, STRIPE_WEBHOOK_SECRET, STRIPE_PUBLISHABLE, PUBLIC_URL } = require('./src/config/env');
const { isAdmin, requireAdmin } = require('./src/middleware/admin');
const db = require('./src/db');
const { parseJSONField, validateProductInput, validateVariant, buildProductRow, computeCartTotals, getReviewSummary } = require('./src/utils');
const { v4: uuidv4 } = require('uuid');

const stripe = STRIPE_SECRET ? require('stripe')(STRIPE_SECRET, { apiVersion: '2023-10-16' }) : null;

const app = express();
// Disable default ETag so dynamic API responses (discount lookups) don't 304 and break client discount fetch logic
app.set('etag', false);
app.use(cors());
if (stripe && STRIPE_WEBHOOK_SECRET) {
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);
}
app.use(express.json());

// Prepared statements for reviews & moderation
const selectProductBasicStmt = db.prepare('SELECT id, title FROM products WHERE id = ?');
const selectApprovedReviewsStmt = db.prepare('SELECT id, productId, rating, title, body, authorName, quantityPurchased, COALESCE(moderatedAt, createdAt) AS publishedAt, createdAt FROM reviews WHERE productId = ? AND status = ? ORDER BY publishedAt DESC LIMIT ?');
const selectReviewsByStatusStmt = db.prepare('SELECT r.*, p.title AS productTitle FROM reviews r JOIN products p ON p.id = r.productId WHERE r.status = ? ORDER BY COALESCE(r.moderatedAt, r.createdAt) DESC LIMIT ?');
const selectReviewByIdStmt = db.prepare('SELECT * FROM reviews WHERE id = ?');
const checkDuplicateReviewStmt = db.prepare('SELECT id FROM reviews WHERE orderId = ? AND productId = ?');
const insertReviewStmt = db.prepare(`INSERT INTO reviews (id, productId, userId, orderId, variantId, rating, title, body, authorName, authorEmail, quantityPurchased, status, moderatedAt, moderatedBy, moderationNotes, createdAt, updatedAt)
  VALUES (@id, @productId, NULL, @orderId, @variantId, @rating, @title, @body, @authorName, @authorEmail, @quantityPurchased, @status, NULL, NULL, NULL, @createdAt, @updatedAt)`);
const updateReviewStatusStmt = db.prepare('UPDATE reviews SET status = @status, moderatedAt = @moderatedAt, moderatedBy = @moderatedBy, moderationNotes = @moderationNotes, updatedAt = @updatedAt WHERE id = @id');
const selectOrderForReviewStmt = db.prepare('SELECT id, status, customerEmail, paymentProvider, paidAt FROM orders WHERE id = ?');
const selectOrderItemsForReviewStmt = db.prepare('SELECT productId, variantId, quantity FROM order_items WHERE orderId = ? AND productId = ?');

// --- Lightweight one-time migrations (idempotent) ---
try { db.prepare("ALTER TABLE orders ADD COLUMN shippingCents INTEGER DEFAULT 0").run(); } catch { }
try { db.prepare("ALTER TABLE orders ADD COLUMN shippingDiscountCents INTEGER DEFAULT 0").run(); } catch { }
try { db.prepare("ALTER TABLE orders ADD COLUMN estimatedDeliveryAt TEXT").run(); } catch { }
try { db.prepare("ALTER TABLE products ADD COLUMN shippingFeeCents INTEGER DEFAULT 0").run(); } catch { }
try { db.prepare("ALTER TABLE orders ADD COLUMN shippingCountry TEXT").run(); } catch { }
try { db.prepare("ALTER TABLE orders ADD COLUMN shippingCode TEXT").run(); } catch { }
try { db.prepare("ALTER TABLE orders ADD COLUMN completedAt TEXT").run(); } catch { }
try { db.prepare("ALTER TABLE orders ADD COLUMN returnRequestedAt TEXT").run(); } catch { }
try { db.prepare("ALTER TABLE orders ADD COLUMN returnReason TEXT").run(); } catch { }

// Shipping zones & helpers (Adjusted for Philippines friendly pricing)
// All cents are USD cents. Domestic (US + PH) base shipping lowered to $2.00 (200 cents) to fit requirement.
const SHIPPING_RATES = { domestic: 200, near: 1200, intl: 2000, domesticFreeThreshold: 15000 };
const DOMESTIC = new Set(['US', 'USA', 'PH', 'PHL', 'PHILIPPINES']);
const NEAR = new Set(['CA', 'CANADA']);
const EU = new Set(['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'SE', 'FI', 'DK', 'IE', 'PT', 'AT', 'PL', 'CZ', 'HU', 'SK', 'RO', 'BG', 'GR']);
function classifyCountry(c) {
  if (!c) return 'INTL';
  const up = String(c).trim().toUpperCase();
  if (DOMESTIC.has(up)) return 'DOM';
  if (NEAR.has(up)) return 'NEAR';
  if (EU.has(up)) return 'NEAR'; // treat EU as near tier
  return 'INTL';
}
function baseShippingFor(subtotal, countryCode) {
  const zone = classifyCountry(countryCode);
  if (zone === 'DOM') return subtotal >= SHIPPING_RATES.domesticFreeThreshold ? 0 : SHIPPING_RATES.domestic;
  if (zone === 'NEAR') return SHIPPING_RATES.near;
  return SHIPPING_RATES.intl;
}

// --- One‑time auto seed (only if empty) to provide a realistic catalog preview ---
try {
  const countRow = db.prepare('SELECT COUNT(*) as c FROM products').get();
  if (countRow.c === 0) {
    const now = new Date().toISOString();
    const insert = db.prepare(`INSERT INTO products (id,title,description,priceCents,baseInventory,images,tags,createdAt,updatedAt,shippingFeeCents) VALUES (@id,@title,@description,@price,@inv,@images,@tags,@created,@updated,@ship)`);
    const seed = [
      { title: 'Classic White Tee', price: 1000, inv: 120, img: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=600&q=70', desc: 'Super‑soft ring‑spun cotton. Clean, minimal staple layer.' },
      { title: 'Midnight Black Tee', price: 1100, inv: 110, img: 'https://images.unsplash.com/photo-1603252110263-fb5113fc7550?auto=format&fit=crop&w=600&q=70', desc: 'Deep black dye, no side seams twist. Smooth handfeel.' },
      { title: 'Heather Gray Tee', price: 950, inv: 90, img: 'https://images.unsplash.com/photo-1585386959984-a4155222cd05?auto=format&fit=crop&w=600&q=70', desc: 'Athletic heather blend — breathable everyday comfort.' },
      { title: 'Ocean Blue Tee', price: 1200, inv: 80, img: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=600&q=70', desc: 'Rich ocean blue pigment, enzyme washed softness.' },
      { title: 'Forest Green Tee', price: 1200, inv: 85, img: 'https://images.unsplash.com/photo-1612423284934-2850a4ea4f87?auto=format&fit=crop&w=600&q=70', desc: 'Earthy green mid‑weight jersey ideal for layering.' },
      { title: 'Sunset Orange Tee', price: 1250, inv: 70, img: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=600&q=70', desc: 'Vibrant fade‑resistant reactive dye. Statement color.' },
      { title: 'Vintage Charcoal Tee', price: 1300, inv: 65, img: 'https://images.unsplash.com/photo-1624006542612-c2586b0d35d3?auto=format&fit=crop&w=600&q=70', desc: 'Washed charcoal effect — subtle texture, lived‑in look.' },
      { title: 'Deep Navy Tee', price: 1100, inv: 95, img: 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=600&q=70', desc: 'Core navy staple with reinforced collar.' }
    ];
    const tx = db.transaction(rows => {
      for (const p of rows) {
        insert.run({
          id: uuid(),
          title: p.title,
          description: p.desc,
          price: p.price,
          inv: p.inv,
          images: JSON.stringify([p.img]),
          tags: JSON.stringify(['tee', 'premium']),
          created: now,
          updated: now,
          ship: 0
        });
      }
    });
    tx(seed);
    console.log(`[auto-seed] Inserted ${seed.length} initial products.`);
  }
} catch (e) {
  console.warn('Auto seed skipped:', e.message);
}

// -------------------- In-memory metrics & rate limiting --------------------
const metrics = {
  requests: 0,
  errors: 0,
  productsCreated: 0,
  ordersCreated: 0,
  discountsCreated: 0,
  startTime: Date.now()
};
const rateBucket = new Map(); // key=> {count, reset}
const RATE_LIMIT = { windowMs: 60_000, max: 120, writeMax: 40 }; // per IP per minute

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  let b = rateBucket.get(ip);
  if (!b || b.reset < now) { b = { count: 0, write: 0, reset: now + RATE_LIMIT.windowMs }; rateBucket.set(ip, b); }
  b.count++;
  const isWrite = /^(POST|PUT|DELETE|PATCH)$/i.test(req.method);
  if (isWrite) b.write++;
  if (b.count > RATE_LIMIT.max || (isWrite && b.write > RATE_LIMIT.writeMax)) return res.status(429).json({ error: 'Rate limit exceeded' });
  next();
}
app.use(rateLimit);

// Simple request logger
app.use((req, res, next) => {
  const start = Date.now();
  metrics.requests++;
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (res.statusCode >= 500) metrics.errors++;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// Audit log helper
function audit(entity, entityId, action, beforeObj, afterObj) {
  try {
    db.prepare('INSERT INTO audit_log(id,entity,entityId,action,before,after,at) VALUES(?,?,?,?,?,?,?)')
      .run(uuidv4(), entity, entityId || null, action, beforeObj ? JSON.stringify(beforeObj) : null, afterObj ? JSON.stringify(afterObj) : null, new Date().toISOString());
  } catch (e) { /* swallow */ }
}

async function finalizeStripeOrder(session) {
  if (!session) return;
  const metadata = session.metadata || {};
  const orderId = metadata.orderId;
  const sessionId = session.id;
  if (!orderId && !sessionId) return;
  let order = null;
  if (orderId) {
    order = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
  }
  if (!order && sessionId) {
    order = db.prepare('SELECT * FROM orders WHERE stripeSessionId=?').get(sessionId);
  }
  if (!order) {
    console.warn('[stripe] order not found for session', sessionId);
    return;
  }
  if (order.paidAt) {
    // Already processed
    return;
  }
  const now = new Date().toISOString();
  const orderItems = db.prepare('SELECT productId, variantId, quantity FROM order_items WHERE orderId=?').all(order.id);
  const decrementVariant = db.prepare('UPDATE variants SET inventory = inventory - ? WHERE id=?');
  const decrementProduct = db.prepare('UPDATE products SET baseInventory = baseInventory - ?, updatedAt=? WHERE id=?');
  const updateOrder = db.prepare('UPDATE orders SET status=?, paidAt=?, stripePaymentIntentId=?, stripeSessionId=?, customerEmail=COALESCE(customerEmail, ?), paymentProvider=? WHERE id=?');
  const insertEvent = db.prepare('INSERT INTO order_events(id,orderId,status,at) VALUES(?,?,?,?)');
  const tx = db.transaction((items) => {
    for (const it of items) {
      if (it.variantId) {
        decrementVariant.run(it.quantity, it.variantId);
      } else if (it.productId) {
        decrementProduct.run(it.quantity, now, it.productId);
      }
    }
    updateOrder.run('paid', now, session.payment_intent || null, sessionId, session.customer_details?.email || null, 'stripe', order.id);
    insertEvent.run(uuidv4(), order.id, 'paid', now);
  });
  tx(orderItems);
  metrics.ordersCreated++;
  audit('order', order.id, 'stripe-paid', { status: order.status, paidAt: order.paidAt }, { status: 'paid', paidAt: now });
}

async function markStripeOrderExpired(session) {
  if (!session) return;
  const metadata = session.metadata || {};
  const orderId = metadata.orderId;
  const sessionId = session.id;
  let order = null;
  if (orderId) order = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
  if (!order && sessionId) order = db.prepare('SELECT * FROM orders WHERE stripeSessionId=?').get(sessionId);
  if (!order) return;
  if (order.paidAt || order.cancelledAt) return;
  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET status=?, cancelledAt=? WHERE id=?').run('cancelled', now, order.id);
  db.prepare('INSERT INTO order_events(id,orderId,status,at) VALUES(?,?,?,?)').run(uuidv4(), order.id, 'cancelled', now);
  audit('order', order.id, 'stripe-expired', { status: order.status }, { status: 'cancelled' });
}

async function handleStripeWebhook(req, res) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(501).send('Stripe disabled');
  }
  const signature = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe] webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await finalizeStripeOrder(event.data.object);
        break;
      case 'checkout.session.expired':
        await markStripeOrderExpired(event.data.object);
        break;
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[stripe] webhook handler error', err);
    res.status(500).send('Webhook handler error');
  }
}

// ETag cache for product list (very small naive implementation)
let lastProductsETag = null; let lastProductsPayload = null; let lastProductsKey = '';
function buildProductsETag(rows) {
  const key = rows.map(r => r.id + ':' + r.updatedAt + ':' + (r.deletedAt || '')).join('|');
  if (key === lastProductsKey && lastProductsETag) return lastProductsETag;
  const hash = require('crypto').createHash('sha1').update(key).digest('hex').slice(0, 16);
  lastProductsKey = key; lastProductsETag = 'W/"' + hash + '"';
  return lastProductsETag;
}

// --- Upload setup ---
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, uuid() + path.extname(file.originalname || '.bin'))
});
const upload = multer({ storage });
// Memory storage for CSV import (avoid keeping uploaded files)
const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Health route module
app.use('/api', require('./src/routes/health'));

// ---------- Product Endpoints ----------
app.get('/api/products', (req, res) => {
  const { search = '', tag, page = '1', pageSize = '20', sort = 'createdAt:desc' } = req.query;
  const [sortField, sortDirRaw] = sort.split(':');
  const allowedSort = new Set(['createdAt', 'priceCents', 'title']);
  const field = allowedSort.has(sortField) ? sortField : 'createdAt';
  const dir = (sortDirRaw || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const limit = Math.min(parseInt(pageSize, 10) || 20, 100);
  const offset = ((parseInt(page, 10) || 1) - 1) * limit;
  const where = [];
  const params = { limit, offset };
  if (search) { where.push('(title LIKE @s OR description LIKE @s)'); params.s = `%${search}%`; }
  if (tag) { where.push('tags LIKE @t'); params.t = `%${tag}%`; }
  const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const includeDeleted = isAdmin(req) && (req.query.includeDeleted === '1' || req.query.includeDeleted === 'true');
  const visibilityClause = includeDeleted ? '1=1' : 'deletedAt IS NULL';
  const finalWhere = whereSQL ? whereSQL + ' AND ' + visibilityClause : 'WHERE ' + visibilityClause;
  const rows = db.prepare(`SELECT * FROM products ${finalWhere} ORDER BY ${field} ${dir} LIMIT @limit OFFSET @offset`).all(params);
  const countRow = db.prepare(`SELECT COUNT(*) as c FROM products ${finalWhere}`).get(params);
  const products = rows.map(buildProductRow);
  const etag = buildProductsETag(rows);
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json({ page: parseInt(page, 10) || 1, pageSize: limit, total: countRow.c, products });
});

app.get('/api/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(buildProductRow(row));
});

app.get('/api/products/:id/reviews', (req, res) => {
  const product = selectProductBasicStmt.get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 50, 200));
  const rows = selectApprovedReviewsStmt.all(product.id, 'approved', limit);
  const reviews = rows.map(r => ({
    id: r.id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    authorName: r.authorName || 'Verified Buyer',
    quantityPurchased: r.quantityPurchased || 0,
    publishedAt: r.publishedAt || r.createdAt
  }));
  res.json({ productId: product.id, summary: getReviewSummary(product.id), reviews });
});

app.post('/api/products/:id/reviews', async (req, res) => {
  const product = selectProductBasicStmt.get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const { orderId, email, name, rating, title, body } = req.body || {};
  const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!orderId || !trimmedEmail) return res.status(400).json({ error: 'Order ID and email required for verification' });
  const ratingInt = parseInt(rating, 10);
  if (!Number.isInteger(ratingInt) || ratingInt < 1 || ratingInt > 5) return res.status(400).json({ error: 'Rating must be 1-5' });
  const bodyText = typeof body === 'string' ? body.trim() : '';
  if (!bodyText) return res.status(400).json({ error: 'Review text required' });
  if (bodyText.length > 2000) return res.status(400).json({ error: 'Review is too long (2000 char max)' });
  const order = selectOrderForReviewStmt.get(orderId);
  if (!order) return res.status(400).json({ error: 'Order not found' });
  const orderEmail = (order.customerEmail || '').trim().toLowerCase();
  if (!orderEmail || orderEmail !== trimmedEmail) return res.status(400).json({ error: 'Email does not match order' });
  const eligibleStatuses = new Set(['paid', 'fulfilled', 'completed', 'shipped']);
  const eligible = !!order.paidAt || eligibleStatuses.has(order.status) || order.paymentProvider === 'manual';
  if (!eligible) return res.status(400).json({ error: 'Order not yet paid or fulfilled' });
  const already = checkDuplicateReviewStmt.get(order.id, product.id);
  if (already) return res.status(409).json({ error: 'A review for this order was already submitted' });
  const items = selectOrderItemsForReviewStmt.all(order.id, product.id);
  if (!items.length) return res.status(400).json({ error: 'Product not found in order' });
  let quantityPurchased = 0;
  let variantId = null;
  for (const it of items) {
    quantityPurchased += it.quantity || 0;
    if (!variantId && it.variantId) variantId = it.variantId;
  }
  if (quantityPurchased <= 0) return res.status(400).json({ error: 'Invalid order quantity' });
  const now = new Date().toISOString();
  const payload = {
    id: uuidv4(),
    productId: product.id,
    orderId: order.id,
    variantId: variantId || null,
    rating: ratingInt,
    title: title ? String(title).trim().slice(0, 160) : null,
    body: bodyText,
    authorName: name ? String(name).trim().slice(0, 120) : null,
    authorEmail: trimmedEmail,
    quantityPurchased,
    status: 'pending',
    createdAt: now,
    updatedAt: now
  };
  insertReviewStmt.run(payload);
  audit('review', payload.id, 'create', null, { productId: product.id, rating: ratingInt, status: 'pending' });
  res.status(201).json({ submitted: true, status: 'pending', message: 'Review submitted for moderation' });
});

app.post('/api/products', requireAdmin, (req, res) => {
  const errors = validateProductInput(req.body);
  if (errors.length) return res.status(400).json({ errors });
  const { title, description = '', priceCents, baseInventory = 0, images = [], tags = [], variants = [], shippingFeeCents = 0 } = req.body;
  if (!Number.isInteger(shippingFeeCents) || shippingFeeCents < 0) return res.status(400).json({ error: 'shippingFeeCents invalid' });
  const variantErrors = [];
  variants.forEach((v, i) => { const ve = validateVariant(v); if (ve.length) variantErrors.push(`variant[${i}]: ${ve.join(', ')}`); });
  if (variantErrors.length) return res.status(400).json({ errors: variantErrors });
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO products(id,title,description,priceCents,baseInventory,images,tags,shippingFeeCents,createdAt,updatedAt) VALUES(@id,@title,@description,@price,@inv,@images,@tags,@ship,@created,@updated)')
    .run({ id, title, description, price: priceCents, inv: baseInventory, images: JSON.stringify(images), tags: JSON.stringify(tags), ship: shippingFeeCents, created: now, updated: now });
  const insertVariant = db.prepare('INSERT INTO variants(id,productId,sku,optionValues,priceCents,inventory) VALUES(@id,@productId,@sku,@optionValues,@price,@inventory)');
  for (const v of variants) insertVariant.run({ id: uuid(), productId: id, sku: v.sku || null, optionValues: JSON.stringify(v.optionValues || {}), price: v.priceCents != null ? v.priceCents : null, inventory: v.inventory ?? 0 });
  const fresh = buildProductRow(db.prepare('SELECT * FROM products WHERE id=?').get(id));
  metrics.productsCreated++;
  audit('product', id, 'create', null, fresh);
  res.status(201).json(fresh);
});

app.put('/api/products/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { title = existing.title, description = existing.description, priceCents = existing.priceCents, baseInventory = existing.baseInventory, images, tags, shippingFeeCents = existing.shippingFeeCents ?? 0 } = req.body;
  if (priceCents == null || !Number.isInteger(priceCents) || priceCents < 0) return res.status(400).json({ error: 'priceCents invalid' });
  if (!Number.isInteger(shippingFeeCents) || shippingFeeCents < 0) return res.status(400).json({ error: 'shippingFeeCents invalid' });
  const now = new Date().toISOString();
  db.prepare('UPDATE products SET title=@title, description=@description, priceCents=@price, baseInventory=@inv, images=@images, tags=@tags, shippingFeeCents=@ship, updatedAt=@updated WHERE id=@id')
    .run({ id: existing.id, title, description, price: priceCents, inv: baseInventory, images: JSON.stringify(images ?? JSON.parse(existing.images)), tags: JSON.stringify(tags ?? JSON.parse(existing.tags)), ship: shippingFeeCents, updated: now });
  const updatedRow = db.prepare('SELECT * FROM products WHERE id=?').get(existing.id);
  audit('product', existing.id, 'update', existing, updatedRow);
  res.json(buildProductRow(updatedRow));
});

app.delete('/api/products/:id', requireAdmin, (req, res) => {
  const now = new Date().toISOString();
  const info = db.prepare('UPDATE products SET deletedAt=? WHERE id=? AND deletedAt IS NULL').run(now, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found or already deleted' });
  audit('product', req.params.id, 'soft-delete', null, { deletedAt: now });
  res.json({ deleted: true, at: now });
});

app.post('/api/products/:id/restore', requireAdmin, (req, res) => {
  const info = db.prepare('UPDATE products SET deletedAt=NULL WHERE id=? AND deletedAt IS NOT NULL').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found or not deleted' });
  audit('product', req.params.id, 'restore', null, { restored: true });
  res.json({ restored: true });
});

// Bulk delete products
app.post('/api/products/bulk-delete', requireAdmin, (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids[] required' });
  // Deduplicate & basic validation
  const unique = [...new Set(ids.filter(id => typeof id === 'string' && id.length <= 64))];
  if (!unique.length) return res.status(400).json({ error: 'No valid ids provided' });
  const now = new Date().toISOString();
  const del = db.prepare('UPDATE products SET deletedAt=? WHERE id=? AND deletedAt IS NULL');
  const deleted = [];
  const tx = db.transaction((list) => {
    for (const id of list) {
      const info = del.run(now, id);
      if (info.changes) deleted.push(id);
    }
  });
  tx(unique);
  res.json({ deleted: deleted.length, ids: deleted, at: now });
});

app.post('/api/products/bulk-restore', requireAdmin, (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids[] required' });
  const unique = [...new Set(ids.filter(id => typeof id === 'string' && id.length <= 64))];
  if (!unique.length) return res.status(400).json({ error: 'No valid ids provided' });
  const restore = db.prepare('UPDATE products SET deletedAt=NULL WHERE id=? AND deletedAt IS NOT NULL');
  let restored = 0;
  const tx = db.transaction(list => { for (const id of list) { const info = restore.run(id); if (info.changes) restored++; } });
  tx(unique);
  res.json({ restored, ids: unique });
});

app.post('/api/products/:id/variants', requireAdmin, (req, res) => {
  const product = db.prepare('SELECT id FROM products WHERE id=?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const errs = validateVariant(req.body);
  if (errs.length) return res.status(400).json({ errors: errs });
  const id = uuid();
  db.prepare('INSERT INTO variants(id,productId,sku,optionValues,priceCents,inventory) VALUES(@id,@productId,@sku,@optionValues,@price,@inventory)')
    .run({ id, productId: product.id, sku: req.body.sku || null, optionValues: JSON.stringify(req.body.optionValues || {}), price: req.body.priceCents != null ? req.body.priceCents : null, inventory: req.body.inventory });
  res.status(201).json({ id });
});

app.put('/api/variants/:id', requireAdmin, (req, res) => {
  const variant = db.prepare('SELECT * FROM variants WHERE id=?').get(req.params.id);
  if (!variant) return res.status(404).json({ error: 'Variant not found' });
  const { sku = variant.sku, optionValues = parseJSONField(variant.optionValues, {}), priceCents = variant.priceCents, inventory = variant.inventory } = req.body;
  if (priceCents != null && (!Number.isInteger(priceCents) || priceCents < 0)) return res.status(400).json({ error: 'priceCents invalid' });
  if (!Number.isInteger(inventory) || inventory < 0) return res.status(400).json({ error: 'inventory invalid' });
  db.prepare('UPDATE variants SET sku=@sku, optionValues=@optionValues, priceCents=@price, inventory=@inv WHERE id=@id')
    .run({ id: variant.id, sku, optionValues: JSON.stringify(optionValues), price: priceCents != null ? priceCents : null, inv: inventory });
  res.json({ updated: true });
});

app.delete('/api/variants/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM variants WHERE id=?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Variant not found' });
  res.json({ deleted: true });
});

// ---------- Cart Endpoints ----------
app.post('/api/carts', (_req, res) => {
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO carts (id,createdAt,updatedAt) VALUES (?,?,?)').run(id, now, now);
  res.status(201).json({ id });
});

app.get('/api/carts/:id', (req, res) => {
  const cart = db.prepare('SELECT * FROM carts WHERE id=?').get(req.params.id);
  if (!cart) return res.status(404).json({ error: 'Cart not found' });
  const items = db.prepare('SELECT ci.*, p.title, p.priceCents as basePrice, v.priceCents as variantPrice, v.optionValues FROM cart_items ci JOIN products p ON p.id = ci.productId LEFT JOIN variants v ON v.id = ci.variantId WHERE ci.cartId = ?').all(cart.id).map(r => ({
    id: r.id, productId: r.productId, variantId: r.variantId, quantity: r.quantity, title: r.title,
    unitPriceCents: r.variantPrice != null ? r.variantPrice : r.basePrice,
    optionValues: r.optionValues ? parseJSONField(r.optionValues, {}) : null,
    lineTotalCents: (r.variantPrice != null ? r.variantPrice : r.basePrice) * r.quantity
  }));
  res.json({ id: cart.id, items });
});

app.post('/api/carts/:id/items', (req, res) => {
  const { productId, variantId = null, quantity } = req.body;
  if (!productId || !Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ error: 'productId and positive quantity required' });
  const cart = db.prepare('SELECT id FROM carts WHERE id=?').get(req.params.id);
  if (!cart) return res.status(404).json({ error: 'Cart not found' });
  const product = db.prepare('SELECT * FROM products WHERE id=?').get(productId);
  if (!product) return res.status(400).json({ error: 'Invalid productId' });
  if (variantId) {
    const variant = db.prepare('SELECT * FROM variants WHERE id=? AND productId=?').get(variantId, productId);
    if (!variant) return res.status(400).json({ error: 'Invalid variantId for product' });
    if (variant.inventory < quantity) return res.status(400).json({ error: 'Insufficient variant inventory' });
  } else {
    const hasVariants = db.prepare('SELECT 1 FROM variants WHERE productId=? LIMIT 1').get(productId);
    if (hasVariants) return res.status(400).json({ error: 'Variant required for this product' });
    if (product.baseInventory < quantity) return res.status(400).json({ error: 'Insufficient inventory' });
  }
  const existing = db.prepare('SELECT * FROM cart_items WHERE cartId=? AND productId=? AND (variantId IS ? OR variantId = ?)').get(cart.id, productId, variantId, variantId);
  if (existing) {
    db.prepare('UPDATE cart_items SET quantity=? WHERE id=?').run(quantity, existing.id);
    db.prepare('UPDATE carts SET updatedAt=? WHERE id=?').run(new Date().toISOString(), cart.id);
    return res.json({ updated: true, id: existing.id });
  }
  const id = uuid();
  db.prepare('INSERT INTO cart_items (id,cartId,productId,variantId,quantity) VALUES (?,?,?,?,?)').run(id, cart.id, productId, variantId, quantity);
  db.prepare('UPDATE carts SET updatedAt=? WHERE id=?').run(new Date().toISOString(), cart.id);
  res.status(201).json({ created: true, id });
});

app.post('/api/checkout/stripe/session', async (req, res) => {
  if (!stripe || !STRIPE_SECRET || !STRIPE_PUBLISHABLE) {
    return res.status(501).json({ error: 'Stripe not configured' });
  }
  let { items, customer, discountCode, shippingCode } = req.body || {};
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'items[] required' });
  }
  if (discountCode && typeof discountCode === 'string') discountCode = discountCode.trim().toUpperCase(); else discountCode = undefined;
  if (shippingCode && typeof shippingCode === 'string') shippingCode = shippingCode.trim().toUpperCase(); else shippingCode = undefined;
  const normalized = [];
  let subtotal = 0;
  for (const [idx, line] of items.entries()) {
    if (!line || typeof line !== 'object') return res.status(400).json({ error: `items[${idx}] invalid` });
    const { productId, quantity, variantId = null } = line;
    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ error: `items[${idx}] productId and positive quantity required` });
    }
    const product = db.prepare('SELECT * FROM products WHERE id=?').get(productId);
    if (!product) return res.status(400).json({ error: `items[${idx}] product not found` });
    let unitPrice = product.priceCents;
    let resolvedVariantId = null;
    if (variantId) {
      const variant = db.prepare('SELECT * FROM variants WHERE id=? AND productId=?').get(variantId, productId);
      if (!variant) return res.status(400).json({ error: `items[${idx}] variant not found for product` });
      if (variant.inventory < quantity) return res.status(400).json({ error: `items[${idx}] insufficient inventory` });
      unitPrice = variant.priceCents != null ? variant.priceCents : product.priceCents;
      resolvedVariantId = variant.id;
    } else {
      const hasVariants = db.prepare('SELECT 1 FROM variants WHERE productId=? LIMIT 1').get(productId);
      if (hasVariants) return res.status(400).json({ error: `items[${idx}] variantId required for product with variants` });
      if (product.baseInventory < quantity) return res.status(400).json({ error: `items[${idx}] insufficient inventory` });
    }
    subtotal += unitPrice * quantity;
    normalized.push({
      productId,
      quantity,
      variantId: resolvedVariantId,
      title: product.title,
      unitPriceCents: unitPrice,
      shippingFeeCents: product.shippingFeeCents || 0
    });
  }
  let discountCents = 0;
  if (discountCode) {
    const d = db.prepare('SELECT * FROM discounts WHERE code=?').get(discountCode);
    if (d) {
      const nowMs = Date.now();
      const isShipOnly = d.type === 'ship' || (/SHIP/i.test(d.code || '') && d.value === 100);
      if (!isShipOnly && (!d.expiresAt || new Date(d.expiresAt).getTime() > nowMs)) {
        if (subtotal >= d.minSubtotalCents) {
          if (d.type === 'percent') {
            const pct = Math.min(100, Math.max(0, d.value));
            discountCents = Math.floor(subtotal * (pct / 100));
          } else if (d.type === 'fixed') {
            discountCents = Math.min(subtotal, d.value);
          }
        }
      }
    }
  }
  // Shipping
  const customerCountry = customer?.country || null;
  let perItemShipping = 0;
  for (const line of normalized) {
    perItemShipping += line.shippingFeeCents * line.quantity;
  }
  let shippingCents;
  const isPH = ['PH', 'PHL', 'PHILIPPINES'].includes((customerCountry || '').toUpperCase());
  if (isPH) {
    shippingCents = 200;
  } else {
    shippingCents = baseShippingFor(subtotal, customerCountry) + perItemShipping;
  }
  let shippingDiscountCents = 0;
  if (shippingCode) {
    const sd = db.prepare('SELECT * FROM discounts WHERE code=?').get(shippingCode);
    if (sd && !sd.disabledAt && (!sd.expiresAt || new Date(sd.expiresAt).getTime() > Date.now()) && (sd.type === 'ship' || (/SHIP/i.test(sd.code || '') && sd.type === 'percent' && sd.value === 100))) {
      if (!discountCode || discountCode !== shippingCode) {
        if (subtotal >= sd.minSubtotalCents) {
          const pct = Math.min(100, Math.max(0, sd.value));
          shippingDiscountCents = Math.min(shippingCents, Math.floor(shippingCents * (pct / 100)));
        }
      }
    }
  }
  const netShipping = Math.max(0, shippingCents - shippingDiscountCents);
  const totalCents = subtotal - discountCents + netShipping;
  const orderId = uuid();
  const nowIso = new Date().toISOString();
  const etaDays = netShipping === 0 ? 2 : 5;
  const estimatedDeliveryAt = new Date(Date.now() + etaDays * 24 * 60 * 60 * 1000).toISOString();
  try {
    const insertOrder = db.prepare(`INSERT INTO orders(id,cartId,status,subtotalCents,discountCents,totalCents,shippingCents,shippingDiscountCents,customerName,customerEmail,customerAddress,shippingCountry,discountCode,shippingCode,estimatedDeliveryAt,paymentProvider,createdAt)
      VALUES(@id,NULL,@status,@sub,@disc,@total,@ship,@shipDisc,@name,@email,@addr,@country,@discountCode,@shipCode,@eta,@provider,@created)`);
    insertOrder.run({
      id: orderId,
      status: 'pending_payment',
      sub: subtotal,
      disc: discountCents,
      total: totalCents,
      ship: shippingCents,
      shipDisc: shippingDiscountCents,
      name: customer?.name || null,
      email: customer?.email || null,
      addr: customer?.address || null,
      country: customerCountry,
      discountCode: discountCode || null,
      shipCode: shippingCode || null,
      eta: estimatedDeliveryAt,
      provider: 'stripe',
      created: nowIso
    });
    db.prepare('INSERT INTO order_events(id,orderId,status,at) VALUES(?,?,?,?)').run(uuidv4(), orderId, 'pending_payment', nowIso);
    const insertItem = db.prepare('INSERT INTO order_items(id,orderId,productId,variantId,titleSnapshot,quantity,unitPriceCents) VALUES(?,?,?,?,?,?,?)');
    for (const line of normalized) {
      insertItem.run(uuid(), orderId, line.productId, line.variantId, line.title, line.quantity, line.unitPriceCents);
    }
    let couponId = null;
    if (discountCents > 0) {
      const coupon = await stripe.coupons.create({ amount_off: discountCents, currency: 'usd', duration: 'once', name: discountCode ? `Discount ${discountCode}` : 'Order Discount' });
      couponId = coupon.id;
    }
    const lineItems = normalized.map(line => ({
      price_data: {
        currency: 'usd',
        unit_amount: line.unitPriceCents,
        product_data: { name: line.title.slice(0, 120) }
      },
      quantity: line.quantity
    }));
    if (netShipping > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          unit_amount: netShipping,
          product_data: { name: 'Shipping' }
        },
        quantity: 1
      });
    }
    const baseUrl = (PUBLIC_URL || '').replace(/\/$/, '');
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customer?.email || undefined,
      payment_method_types: ['card'],
      line_items: lineItems,
      discounts: couponId ? [{ coupon: couponId }] : undefined,
      success_url: `${baseUrl || 'http://localhost:' + PORT}/?checkout=success&orderId=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl || 'http://localhost:' + PORT}/?checkout=cancelled&orderId=${orderId}`,
      metadata: {
        orderId,
        discountCode: discountCode || '',
        shippingCode: shippingCode || ''
      }
    });
    db.prepare('UPDATE orders SET stripeSessionId=? WHERE id=?').run(session.id, orderId);
    res.json({ sessionId: session.id, orderId, publishableKey: STRIPE_PUBLISHABLE });
  } catch (err) {
    console.error('[stripe] session creation failed', err);
    try {
      db.prepare('DELETE FROM order_items WHERE orderId=?').run(orderId);
      db.prepare('DELETE FROM order_events WHERE orderId=?').run(orderId);
      db.prepare('DELETE FROM orders WHERE id=?').run(orderId);
    } catch { }
    res.status(500).json({ error: 'Stripe session failed: ' + err.message });
  }
});

// ---------- Order Endpoints ----------
app.post('/api/orders', (req, res) => {
  let { cartId, customer, discountCode, shippingCode, items: directItems } = req.body;
  // Normalize codes early for consistent lookups (DB codes stored uppercased)
  if (discountCode && typeof discountCode === 'string') discountCode = discountCode.trim().toUpperCase(); else discountCode = undefined;
  if (shippingCode && typeof shippingCode === 'string') shippingCode = shippingCode.trim().toUpperCase(); else shippingCode = undefined;
  const now = new Date().toISOString();
  if (cartId) {
    const cart = db.prepare('SELECT * FROM carts WHERE id=?').get(cartId);
    if (!cart) return res.status(404).json({ error: 'Cart not found' });
    const items = db.prepare('SELECT * FROM cart_items WHERE cartId=?').all(cartId);
    if (!items.length) return res.status(400).json({ error: 'Cart empty' });
    for (const it of items) {
      if (it.variantId) {
        const variant = db.prepare('SELECT inventory FROM variants WHERE id=?').get(it.variantId);
        if (!variant || variant.inventory < it.quantity) return res.status(400).json({ error: 'Insufficient inventory' });
      } else {
        const product = db.prepare('SELECT baseInventory FROM products WHERE id=?').get(it.productId);
        const hasVariants = db.prepare('SELECT 1 FROM variants WHERE productId=? LIMIT 1').get(it.productId);
        if (!hasVariants && product.baseInventory < it.quantity) return res.status(400).json({ error: 'Insufficient inventory' });
      }
    }
    const { subtotalCents, discountCents, totalCents } = computeCartTotals(cartId, discountCode);
    // Sum per-item shipping fees
    const cartItemRows = db.prepare('SELECT ci.quantity, p.shippingFeeCents FROM cart_items ci JOIN products p ON p.id = ci.productId WHERE ci.cartId=?').all(cartId);
    let perItemShipping = 0; for (const r of cartItemRows) perItemShipping += (r.shippingFeeCents || 0) * r.quantity;
    const customerCountry = customer?.country || null;
    let shippingCents;
    const isPH = ['PH', 'PHL', 'PHILIPPINES'].includes((customerCountry || '').toUpperCase());
    if (isPH) {
      // Flat $2 shipping for Philippines (ignore per-item fees & free threshold)
      shippingCents = 200;
    } else {
      shippingCents = baseShippingFor(subtotalCents, customerCountry) + perItemShipping;
    }
    let shippingDiscountCents = 0;
    if (shippingCode) {
      const sd = db.prepare('SELECT * FROM discounts WHERE code=?').get(shippingCode);
      if (sd && !sd.disabledAt && (!sd.expiresAt || new Date(sd.expiresAt).getTime() > Date.now()) && (sd.type === 'ship' || (/SHIP/i.test(sd.code || '') && sd.type === 'percent' && sd.value === 100))) {
        // Can't reuse same code as item discount
        if (!discountCode || discountCode !== shippingCode) {
          if (subtotalCents >= sd.minSubtotalCents) {
            // value for ship type interpreted as percent off shipping (100 = free ship). Clamp 0-100.
            const pct = Math.min(100, Math.max(0, sd.value));
            shippingDiscountCents = Math.min(shippingCents, Math.floor(shippingCents * (pct / 100)));
          }
        }
      }
    }
    const finalTotal = totalCents + (shippingCents - shippingDiscountCents);
    for (const it of items) {
      if (it.variantId) db.prepare('UPDATE variants SET inventory = inventory - ? WHERE id=?').run(it.quantity, it.variantId);
      else db.prepare('UPDATE products SET baseInventory = baseInventory - ?, updatedAt=? WHERE id=?').run(it.quantity, now, it.productId);
    }
    const orderId = uuid();
    const etaDays = shippingCents === 0 ? 2 : 5;
    const estimatedDeliveryAt = new Date(Date.now() + etaDays * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO orders(id,cartId,status,subtotalCents,discountCents,totalCents,shippingCents,shippingDiscountCents,customerName,customerEmail,customerAddress,shippingCountry,discountCode,shippingCode,paymentProvider,createdAt,estimatedDeliveryAt) VALUES(@id,@cartId,\'created\',@sub,@disc,@tot,@ship,@shipDisc,@name,@email,@addr,@country,@code,@shipCode,@provider,@created,@eta)')
      .run({ id: orderId, cartId, sub: subtotalCents, disc: discountCents, tot: finalTotal, ship: shippingCents, shipDisc: shippingDiscountCents, name: customer?.name || null, email: customer?.email || null, addr: customer?.address || null, country: customerCountry, code: discountCode || null, shipCode: shippingCode || null, provider: 'manual', created: now, eta: estimatedDeliveryAt });
    db.prepare('INSERT INTO order_events(id,orderId,status,at) VALUES(?,?,?,?)').run(uuidv4(), orderId, 'created', now);
    const insertOrderItem = db.prepare('INSERT INTO order_items(id,orderId,productId,variantId,titleSnapshot,quantity,unitPriceCents) VALUES(?,?,?,?,?,?,?)');
    for (const it of items) {
      const prod = db.prepare('SELECT title, priceCents FROM products WHERE id=?').get(it.productId);
      let unitPrice = prod ? prod.priceCents : 0;
      if (it.variantId) { const v = db.prepare('SELECT priceCents FROM variants WHERE id=?').get(it.variantId); if (v && v.priceCents != null) unitPrice = v.priceCents; }
      insertOrderItem.run(uuid(), orderId, it.productId, it.variantId || null, prod ? prod.title : 'Unknown', it.quantity, unitPrice);
    }
    if (discountCode) db.prepare('UPDATE discounts SET usageCount = usageCount + 1 WHERE code=?').run(discountCode);
    metrics.ordersCreated++;
    audit('order', orderId, 'create', null, { subtotalCents, discountCents, totalCents });
    return res.status(201).json({ id: orderId, status: 'created', subtotalCents, discountCents, shippingCents, shippingDiscountCents, totalCents: finalTotal, discountCode: discountCode || null, shippingCode: shippingCode || null });
  }
  if (!Array.isArray(directItems) || !directItems.length) return res.status(400).json({ error: 'cartId or non-empty items array required' });
  let subtotal = 0;
  for (const [i, line] of directItems.entries()) {
    if (!line || typeof line !== 'object') return res.status(400).json({ error: `items[${i}] invalid` });
    const { productId, quantity, variantId } = line;
    if (!productId || !Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ error: `items[${i}] productId and positive quantity required` });
    const product = db.prepare('SELECT * FROM products WHERE id=?').get(productId);
    if (!product) return res.status(400).json({ error: `items[${i}] product not found` });
    if (variantId) {
      const variant = db.prepare('SELECT * FROM variants WHERE id=? AND productId=?').get(variantId, productId);
      if (!variant) return res.status(400).json({ error: `items[${i}] variant not found for product` });
      if (variant.inventory < quantity) return res.status(400).json({ error: `items[${i}] insufficient inventory` });
      subtotal += (variant.priceCents != null ? variant.priceCents : product.priceCents) * quantity;
      line._variantId = variant.id;
    } else {
      const hasVariants = db.prepare('SELECT 1 FROM variants WHERE productId=? LIMIT 1').get(productId);
      if (hasVariants) return res.status(400).json({ error: `items[${i}] variantId required for product with variants` });
      if (product.baseInventory < quantity) return res.status(400).json({ error: `items[${i}] insufficient inventory` });
      subtotal += product.priceCents * quantity;
    }
  }
  let discountCents = 0;
  if (discountCode) {
    const d = db.prepare('SELECT * FROM discounts WHERE code=?').get(discountCode);
    if (d) {
      const nowMs = Date.now();
      const isShipOnly = d.type === 'ship' || (/SHIP/i.test(d.code || '') && d.value === 100);
      if (!isShipOnly) {
        if (!d.expiresAt || new Date(d.expiresAt).getTime() > nowMs) {
          if (subtotal >= d.minSubtotalCents) {
            if (d.type === 'percent') {
              const pct = Math.min(100, Math.max(0, d.value));
              discountCents = Math.floor(subtotal * (pct / 100));
            }
            else if (d.type === 'fixed') discountCents = Math.min(subtotal, d.value);
          }
        }
      }
    }
  }
  // Shipping logic for direct items (country-based + per-item fees)
  const customerCountry = customer?.country || null;
  let perItemShipping = 0;
  for (const line of directItems) {
    const pShip = db.prepare('SELECT shippingFeeCents FROM products WHERE id=?').get(line.productId).shippingFeeCents || 0;
    perItemShipping += pShip * line.quantity;
  }
  let shippingCents;
  const isPH2 = ['PH', 'PHL', 'PHILIPPINES'].includes((customerCountry || '').toUpperCase());
  if (isPH2) {
    shippingCents = 200; // Flat Philippines shipping
  } else {
    shippingCents = baseShippingFor(subtotal, customerCountry) + perItemShipping;
  }
  let shippingDiscountCents = 0;
  if (shippingCode) {
    const sd = db.prepare('SELECT * FROM discounts WHERE code=?').get(shippingCode);
    if (sd && !sd.disabledAt && (!sd.expiresAt || new Date(sd.expiresAt).getTime() > Date.now()) && (sd.type === 'ship' || (/SHIP/i.test(sd.code || '') && sd.type === 'percent' && sd.value === 100))) {
      if (!discountCode || discountCode !== shippingCode) {
        if (subtotal >= sd.minSubtotalCents) {
          const pct = Math.min(100, Math.max(0, sd.value));
          shippingDiscountCents = Math.min(shippingCents, Math.floor(shippingCents * (pct / 100)));
        }
      }
    }
  }
  const totalCents = subtotal - discountCents + (shippingCents - shippingDiscountCents);
  for (const line of directItems) {
    if (line._variantId) db.prepare('UPDATE variants SET inventory = inventory - ? WHERE id=?').run(line.quantity, line._variantId);
    else db.prepare('UPDATE products SET baseInventory = baseInventory - ?, updatedAt=? WHERE id=?').run(line.quantity, now, line.productId);
  }
  const orderId = uuid();
  const etaDays = shippingCents === 0 ? 2 : 5;
  const estimatedDeliveryAt = new Date(Date.now() + etaDays * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO orders(id,cartId,status,subtotalCents,discountCents,totalCents,shippingCents,shippingDiscountCents,customerName,customerEmail,customerAddress,shippingCountry,discountCode,shippingCode,paymentProvider,createdAt,estimatedDeliveryAt) VALUES(@id,NULL,\'created\',@sub,@disc,@tot,@ship,@shipDisc,@name,@email,@addr,@country,@code,@shipCode,@provider,@created,@eta)')
    .run({ id: orderId, sub: subtotal, disc: discountCents, tot: totalCents, ship: shippingCents, shipDisc: shippingDiscountCents, name: customer?.name || null, email: customer?.email || null, addr: customer?.address || null, country: customerCountry, code: discountCode || null, shipCode: shippingCode || null, provider: 'manual', created: now, eta: estimatedDeliveryAt });
  db.prepare('INSERT INTO order_events(id,orderId,status,at) VALUES(?,?,?,?)').run(uuidv4(), orderId, 'created', now);
  const insertOrderItem = db.prepare('INSERT INTO order_items(id,orderId,productId,variantId,titleSnapshot,quantity,unitPriceCents) VALUES(?,?,?,?,?,?,?)');
  for (const line of directItems) {
    const prod = db.prepare('SELECT title, priceCents FROM products WHERE id=?').get(line.productId);
    let unitPrice = prod ? prod.priceCents : 0;
    if (line._variantId) { const v = db.prepare('SELECT priceCents FROM variants WHERE id=?').get(line._variantId); if (v && v.priceCents != null) unitPrice = v.priceCents; }
    insertOrderItem.run(uuid(), orderId, line.productId, line._variantId || null, prod ? prod.title : 'Unknown', line.quantity, unitPrice);
  }
  if (discountCode) db.prepare('UPDATE discounts SET usageCount = usageCount + 1 WHERE code=?').run(discountCode);
  metrics.ordersCreated++;
  audit('order', orderId, 'create', null, { subtotalCents: subtotal, discountCents, totalCents });
  res.status(201).json({ id: orderId, status: 'created', subtotalCents: subtotal, discountCents, shippingCents, shippingDiscountCents, totalCents, discountCode: discountCode || null, shippingCode: shippingCode || null });
});

app.get('/api/orders', requireAdmin, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const rows = db.prepare('SELECT * FROM orders ORDER BY createdAt DESC LIMIT ? OFFSET ?').all(limit, offset);
  const itemsStmt = db.prepare('SELECT productId, titleSnapshot, quantity, unitPriceCents FROM order_items WHERE orderId=?');
  const orders = rows.map(r => { const items = itemsStmt.all(r.id); return { ...r, items, itemCount: items.reduce((a, b) => a + b.quantity, 0) }; });
  res.json({ orders, limit, offset });
});

app.get('/api/orders/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// Order status transitions
app.post('/api/orders/:id/pay', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  if (order.cancelledAt) return res.status(400).json({ error: 'Order cancelled' });
  if (order.paidAt) return res.status(400).json({ error: 'Already paid' });
  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET paidAt=? , status=? WHERE id=?').run(now, 'paid', order.id);
  db.prepare('INSERT INTO order_events(id,orderId,status,at) VALUES(?,?,?,?)').run(uuidv4(), order.id, 'paid', now);
  audit('order', order.id, 'pay', order, { paidAt: now });
  res.json({ paid: true, at: now });
});

app.post('/api/orders/:id/fulfill', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  if (order.cancelledAt) return res.status(400).json({ error: 'Order cancelled' });
  if (!order.paidAt) return res.status(400).json({ error: 'Must be paid first' });
  if (order.fulfilledAt) return res.status(400).json({ error: 'Already fulfilled' });
  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET fulfilledAt=?, status=? WHERE id=?').run(now, 'fulfilled', order.id);
  db.prepare('INSERT INTO order_events(id,orderId,status,at) VALUES(?,?,?,?)').run(uuidv4(), order.id, 'fulfilled', now);
  audit('order', order.id, 'fulfill', order, { fulfilledAt: now });
  res.json({ fulfilled: true, at: now });
});

app.post('/api/orders/:id/cancel', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  if (order.fulfilledAt) return res.status(400).json({ error: 'Already fulfilled' });
  if (order.cancelledAt) return res.status(400).json({ error: 'Already cancelled' });
  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET cancelledAt=?, status=? WHERE id=?').run(now, 'cancelled', order.id);
  db.prepare('INSERT INTO order_events(id,orderId,status,at) VALUES(?,?,?,?)').run(uuidv4(), order.id, 'cancelled', now);
  audit('order', order.id, 'cancel', order, { cancelledAt: now });
  res.json({ cancelled: true, at: now });
});

app.post('/api/orders/:id/ship', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  if (order.cancelledAt) return res.status(400).json({ error: 'Order cancelled' });
  if (!order.fulfilledAt) return res.status(400).json({ error: 'Must be fulfilled before shipping' });
  if (order.shippedAt) return res.status(400).json({ error: 'Already shipped' });
  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET shippedAt=?, status=? WHERE id=?').run(now, 'shipped', order.id);
  db.prepare('INSERT INTO order_events(id,orderId,status,at) VALUES(?,?,?,?)').run(uuidv4(), order.id, 'shipped', now);
  audit('order', order.id, 'ship', order, { shippedAt: now });
  res.json({ shipped: true, at: now });
});

// Order events retrieval
app.get('/api/orders/:id/events', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT id FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  const events = db.prepare('SELECT status, at FROM order_events WHERE orderId=? ORDER BY at ASC').all(order.id);
  res.json({ events });
});

// -------- Public order tracking (no admin token) --------
app.get('/api/orders/:id/track', (req, res) => {
  const row = db.prepare('SELECT id,status,createdAt,paidAt,fulfilledAt,shippedAt,cancelledAt,estimatedDeliveryAt,subtotalCents,discountCents,totalCents,shippingCents,shippingDiscountCents,customerName,completedAt,returnRequestedAt,returnReason FROM orders WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const events = db.prepare('SELECT status, at FROM order_events WHERE orderId=? ORDER BY at ASC').all(req.params.id);
  const items = db.prepare('SELECT productId, variantId, titleSnapshot, quantity, unitPriceCents FROM order_items WHERE orderId=?').all(req.params.id);
  res.json({ order: row, items, events });
});

// Customer-initiated cancel (requires email match, only before shipped)
app.post('/api/orders/:id/cancel-customer', (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  if ((order.customerEmail || '').toLowerCase() !== String(email).toLowerCase()) return res.status(403).json({ error: 'email mismatch' });
  if (order.cancelledAt) return res.status(400).json({ error: 'Already cancelled' });
  if (order.shippedAt) return res.status(400).json({ error: 'Already shipped' });
  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET cancelledAt=?, status=? WHERE id=?').run(now, 'cancelled', order.id);
  db.prepare('INSERT INTO order_events(id,orderId,status,at) VALUES(?,?,?,?)').run(uuidv4(), order.id, 'cancelled', now);
  audit('order', order.id, 'customer-cancel', order, { cancelledAt: now });
  res.json({ cancelled: true, at: now });
});

// Customer marks order as received (complete)
app.post('/api/orders/:id/complete', (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  if ((order.customerEmail || '').toLowerCase() !== String(email).toLowerCase()) return res.status(403).json({ error: 'email mismatch' });
  if (order.cancelledAt) return res.status(400).json({ error: 'Order cancelled' });
  if (!order.shippedAt) return res.status(400).json({ error: 'Order not shipped yet' });
  if (order.completedAt) return res.status(400).json({ error: 'Already completed' });
  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET completedAt=?, status=? WHERE id=?').run(now, 'completed', order.id);
  db.prepare('INSERT INTO order_events(id,orderId,status,at) VALUES(?,?,?,?)').run(uuidv4(), order.id, 'completed', now);
  audit('order', order.id, 'complete', order, { completedAt: now });
  res.json({ completed: true, at: now });
});

// Customer marks order as paid (pay-customer) - allows moving from created -> paid without admin token
app.post('/api/orders/:id/pay-customer', (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  if ((order.customerEmail || '').toLowerCase() !== String(email).toLowerCase()) return res.status(403).json({ error: 'email mismatch' });
  if (order.cancelledAt) return res.status(400).json({ error: 'Order cancelled' });
  if (order.paidAt) return res.status(400).json({ error: 'Already paid' });
  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET paidAt=?, status=? WHERE id=?').run(now, 'paid', order.id);
  db.prepare('INSERT INTO order_events(id,orderId,status,at) VALUES(?,?,?,?)').run(uuidv4(), order.id, 'paid', now);
  audit('order', order.id, 'pay-customer', order, { paidAt: now });
  res.json({ paid: true, at: now });
});

// Customer requests return / refund
app.post('/api/orders/:id/return-request', (req, res) => {
  const { email, reason = '' } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  if ((order.customerEmail || '').toLowerCase() !== String(email).toLowerCase()) return res.status(403).json({ error: 'email mismatch' });
  if (order.cancelledAt) return res.status(400).json({ error: 'Order cancelled' });
  if (!order.shippedAt) return res.status(400).json({ error: 'Not shipped yet' });
  if (order.returnRequestedAt) return res.status(400).json({ error: 'Return already requested' });
  const now = new Date().toISOString();
  db.prepare('UPDATE orders SET returnRequestedAt=?, returnReason=? WHERE id=?').run(now, reason.slice(0, 500), order.id);
  db.prepare('INSERT INTO order_events(id,orderId,status,at) VALUES(?,?,?,?)').run(uuidv4(), order.id, 'return_requested', now);
  audit('order', order.id, 'return-request', order, { returnRequestedAt: now });
  res.json({ returnRequested: true, at: now });
});

// ---------- Review Moderation (Admin) ----------
app.get('/api/admin/reviews', requireAdmin, (req, res) => {
  const statusRaw = typeof req.query.status === 'string' ? req.query.status.toLowerCase() : 'pending';
  const allowed = new Set(['pending', 'approved', 'rejected']);
  const status = allowed.has(statusRaw) ? statusRaw : 'pending';
  const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 100, 500));
  const rows = selectReviewsByStatusStmt.all(status, limit);
  const reviews = rows.map(r => ({
    id: r.id,
    productId: r.productId,
    productTitle: r.productTitle,
    rating: r.rating,
    title: r.title,
    body: r.body,
    authorName: r.authorName,
    authorEmail: r.authorEmail,
    quantityPurchased: r.quantityPurchased,
    status: r.status,
    createdAt: r.createdAt,
    moderatedAt: r.moderatedAt,
    moderationNotes: r.moderationNotes
  }));
  res.json({ status, reviews });
});

app.post('/api/admin/reviews/:id/approve', requireAdmin, (req, res) => {
  const review = selectReviewByIdStmt.get(req.params.id);
  if (!review) return res.status(404).json({ error: 'Review not found' });
  const before = { status: review.status, moderatedAt: review.moderatedAt, moderationNotes: review.moderationNotes };
  if (review.status === 'approved') {
    return res.json({ approved: true, review, summary: getReviewSummary(review.productId) });
  }
  const now = new Date().toISOString();
  const notes = req.body && typeof req.body.notes === 'string' ? req.body.notes.trim().slice(0, 400) : null;
  updateReviewStatusStmt.run({
    id: review.id,
    status: 'approved',
    moderatedAt: now,
  moderatedBy: 'admin',
    moderationNotes: notes,
    updatedAt: now
  });
  const updated = selectReviewByIdStmt.get(review.id);
  audit('review', review.id, 'approve', before, { status: updated.status, moderatedAt: updated.moderatedAt, moderationNotes: updated.moderationNotes });
  res.json({ approved: true, review: updated, summary: getReviewSummary(updated.productId) });
});

app.post('/api/admin/reviews/:id/reject', requireAdmin, (req, res) => {
  const review = selectReviewByIdStmt.get(req.params.id);
  if (!review) return res.status(404).json({ error: 'Review not found' });
  const now = new Date().toISOString();
  const notes = req.body && typeof req.body.notes === 'string' ? req.body.notes.trim().slice(0, 400) : null;
  const before = { status: review.status, moderatedAt: review.moderatedAt, moderationNotes: review.moderationNotes };
  updateReviewStatusStmt.run({
    id: review.id,
    status: 'rejected',
    moderatedAt: now,
  moderatedBy: 'admin',
    moderationNotes: notes,
    updatedAt: now
  });
  const updated = selectReviewByIdStmt.get(review.id);
  audit('review', review.id, 'reject', before, { status: updated.status, moderatedAt: updated.moderatedAt, moderationNotes: updated.moderationNotes });
  res.json({ rejected: true, review: updated, summary: getReviewSummary(updated.productId) });
});

// Public list of customer's own orders by email (case-insensitive)
app.get('/api/my-orders', (req, res) => {
  const email = (req.query.email || '').toString().trim();
  if (!email) return res.status(400).json({ error: 'email required' });
  const rows = db.prepare('SELECT id,status,createdAt,paidAt,fulfilledAt,shippedAt,cancelledAt,completedAt,returnRequestedAt,returnReason,subtotalCents,discountCents,totalCents,shippingCents,shippingDiscountCents,discountCode,shippingCode FROM orders WHERE LOWER(customerEmail)=LOWER(?) ORDER BY createdAt DESC LIMIT 200').all(email);
  res.json({ orders: rows });
});

// ---------- Discounts ----------
app.post('/api/discounts', requireAdmin, (req, res) => {
  let { code, type, value, minSubtotalCents = 0, expiresAt = null } = req.body;
  if (typeof code === 'string') code = code.trim();
  if (typeof type === 'string') {
    type = type.trim().toLowerCase();
    // Flexible normalization for common user inputs
    if (/^percent/.test(type) || /^perc/.test(type) || /^percentage/.test(type)) type = 'percent';
    else if (/^fixed/.test(type) || /^flat/.test(type) || /^amount/.test(type)) type = 'fixed';
    else if (/^\d+%$/.test(type)) { // User mistakenly put percent value in type field (e.g. "10%")
      const salvage = parseInt(type.replace('%', ''), 10);
      if (Number.isInteger(salvage) && salvage > 0 && salvage <= 100) {
        if (!Number.isInteger(value) || value <= 0) value = salvage; // adopt as percent value if missing/invalid
        type = 'percent';
      }
    } else if (/^\d+$/.test(type)) { // numeric only -> assume percent
      const salvage = parseInt(type, 10);
      if (Number.isInteger(salvage) && salvage > 0 && salvage <= 100) {
        if (!Number.isInteger(value) || value <= 0) value = salvage;
        type = 'percent';
      }
    }
  }
  // Debug log (can be removed later)
  try { console.log('[discount:create] incoming', { rawType: req.body.type, normalizedType: type, value, code }); } catch { }
  if (!code || !/^[A-Z0-9_-]+$/i.test(code)) return res.status(400).json({ error: 'Invalid code' });
  if (type === 'ship' || type === 'shipping' || type === 'freeship' || type === 'free-ship') type = 'ship';
  if (!['percent', 'fixed', 'ship'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (!Number.isInteger(value) || value <= 0) return res.status(400).json({ error: 'Invalid value' });
  if (!Number.isInteger(minSubtotalCents) || minSubtotalCents < 0) return res.status(400).json({ error: 'Invalid minSubtotalCents' });
  db.prepare('INSERT INTO discounts(code,type,value,minSubtotalCents,expiresAt,createdAt) VALUES(?,?,?,?,?,?)').run(code.toUpperCase(), type, value, minSubtotalCents, expiresAt, new Date().toISOString());
  metrics.discountsCreated++;
  audit('discount', code.toUpperCase(), 'create', null, { code: code.toUpperCase(), type, value });
  res.status(201).json({ code: code.toUpperCase() });
});

app.get('/api/discounts', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM discounts ORDER BY createdAt DESC').all();
  // Prevent 304 so frontend always receives body
  res.set('Cache-Control', 'no-store');
  res.set('ETag', Date.now().toString());
  res.json({ discounts: rows });
});

app.post('/api/discounts/:code/disable', requireAdmin, (req, res) => {
  const code = req.params.code.toUpperCase();
  const d = db.prepare('SELECT * FROM discounts WHERE code=?').get(code);
  if (!d) return res.status(404).json({ error: 'Not found' });
  if (d.disabledAt) return res.status(400).json({ error: 'Already disabled' });
  const now = new Date().toISOString();
  db.prepare('UPDATE discounts SET disabledAt=? WHERE code=?').run(now, code);
  audit('discount', code, 'disable', d, { disabledAt: now });
  res.json({ disabled: true, at: now });
});

// Enable a previously disabled discount
app.post('/api/discounts/:code/enable', requireAdmin, (req, res) => {
  const code = req.params.code.toUpperCase();
  const d = db.prepare('SELECT * FROM discounts WHERE code=?').get(code);
  if (!d) return res.status(404).json({ error: 'Not found' });
  if (!d.disabledAt) return res.status(400).json({ error: 'Already enabled' });
  db.prepare('UPDATE discounts SET disabledAt=NULL WHERE code=?').run(code);
  audit('discount', code, 'enable', d, { reEnabled: true });
  res.json({ enabled: true });
});

// Update editable fields of a discount (type, value, minSubtotalCents, expiresAt)
app.put('/api/discounts/:code', requireAdmin, (req, res) => {
  const code = req.params.code.toUpperCase();
  const existing = db.prepare('SELECT * FROM discounts WHERE code=?').get(code);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  let { type = existing.type, value = existing.value, minSubtotalCents = existing.minSubtotalCents, expiresAt = existing.expiresAt } = req.body || {};
  if (typeof type === 'string') {
    type = type.trim().toLowerCase();
    if (/^percent/.test(type) || /^perc/.test(type) || /^percentage/.test(type)) type = 'percent';
    else if (/^fixed/.test(type) || /^flat/.test(type) || /^amount/.test(type)) type = 'fixed';
    else if (/ship/.test(type)) type = 'ship';
  }
  if (!['percent', 'fixed', 'ship'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (!Number.isInteger(value) || value <= 0) return res.status(400).json({ error: 'Invalid value' });
  if (!Number.isInteger(minSubtotalCents) || minSubtotalCents < 0) return res.status(400).json({ error: 'Invalid minSubtotalCents' });
  if (expiresAt && isNaN(Date.parse(expiresAt))) return res.status(400).json({ error: 'Invalid expiresAt' });
  db.prepare('UPDATE discounts SET type=?, value=?, minSubtotalCents=?, expiresAt=? WHERE code=?')
    .run(type, value, minSubtotalCents, expiresAt, code);
  const updated = db.prepare('SELECT * FROM discounts WHERE code=?').get(code);
  audit('discount', code, 'update', existing, updated);
  res.json({ updated: true, discount: updated });
});

app.get('/api/discounts/:code', (req, res) => {
  const d = db.prepare('SELECT * FROM discounts WHERE code=?').get(req.params.code.toUpperCase());
  if (!d || d.disabledAt) return res.status(404).json({ error: 'Not found' });
  res.set('Cache-Control', 'no-store');
  res.set('ETag', Date.now().toString()); // unique each call -> always 200
  res.json(d);
});

// ---------- Low Stock & CSV Export/Import ----------
app.get('/api/products/low-stock', requireAdmin, (req, res) => {
  const threshold = Math.max(0, Math.min(parseInt(req.query.threshold, 10) || 5, 10_000));
  const rows = db.prepare('SELECT * FROM products WHERE deletedAt IS NULL').all();
  const low = [];
  for (const r of rows) {
    const totalInv = db.prepare('SELECT SUM(inventory) as sum FROM variants WHERE productId=?').get(r.id).sum;
    const inv = (totalInv !== null ? totalInv : r.baseInventory);
    if (inv < threshold) low.push({ id: r.id, title: r.title, totalInventory: inv, priceCents: r.priceCents });
  }
  res.json({ threshold, products: low });
});

function toCSVRow(fields) {
  return fields.map(f => {
    if (f == null) return '';
    const s = String(f);
    if (/[,"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }).join(',');
}

app.get('/api/export/products.csv', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM products').all();
  const out = [];
  out.push(toCSVRow(['id', 'title', 'description', 'priceCents', 'baseInventory', 'totalInventory', 'tags', 'images', 'createdAt', 'updatedAt', 'deletedAt']));
  for (const r of rows) {
    const totalInv = db.prepare('SELECT SUM(inventory) as sum FROM variants WHERE productId=?').get(r.id).sum;
    const tags = r.tags || '[]';
    const images = r.images || '[]';
    out.push(toCSVRow([r.id, r.title, r.description, r.priceCents, r.baseInventory, totalInv !== null ? totalInv : r.baseInventory, tags, images, r.createdAt, r.updatedAt, r.deletedAt || '']));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
  res.send(out.join('\n'));
});

app.get('/api/export/orders.csv', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY createdAt DESC').all();
  const out = [];
  out.push(toCSVRow(['id', 'status', 'subtotalCents', 'discountCents', 'totalCents', 'createdAt', 'paidAt', 'fulfilledAt', 'shippedAt', 'cancelledAt']));
  for (const r of rows) out.push(toCSVRow([r.id, r.status, r.subtotalCents, r.discountCents, r.totalCents, r.createdAt, r.paidAt || '', r.fulfilledAt || '', r.shippedAt || '', r.cancelledAt || '']));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
  res.send(out.join('\n'));
});

app.post('/api/import/products', requireAdmin, uploadMemory.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const text = req.file.buffer.toString('utf8');
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return res.status(400).json({ error: 'empty file' });
  const header = lines.shift().split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const expected = ['title', 'description', 'priceCents', 'baseInventory', 'images', 'tags'];
  for (const h of expected) if (!header.includes(h)) return res.status(400).json({ error: 'missing column ' + h });
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const insert = db.prepare('INSERT INTO products(id,title,description,priceCents,baseInventory,images,tags,createdAt,updatedAt) VALUES(@id,@title,@description,@price,@baseInv,@images,@tags,@created,@updated)');
  const now = new Date().toISOString();
  let created = 0; const errors = [];
  const tx = db.transaction(rows => {
    for (const raw of rows) {
      const cols = raw.match(/((?:"(?:[^"]|"")*"|[^,]*))(?:,|$)/g); // basic CSV split preserving quotes
      if (!cols) continue;
      const norm = cols.map(c => c.replace(/,$/, '').trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
      function val(c) { const i = idx[c]; return i != null ? norm[i] : ''; }
      const title = val('title');
      if (!title) { errors.push('title missing'); continue; }
      const price = parseInt(val('priceCents'), 10); if (!Number.isInteger(price) || price < 0) { errors.push('price invalid for ' + title); continue; }
      const baseInv = parseInt(val('baseInventory'), 10); if (!Number.isInteger(baseInv) || baseInv < 0) { errors.push('inv invalid for ' + title); continue; }
      const desc = val('description');
      const imagesRaw = val('images');
      const tagsRaw = val('tags');
      const images = imagesRaw ? JSON.stringify(imagesRaw.split('|').map(s => s.trim()).filter(Boolean)) : '[]';
      const tags = tagsRaw ? JSON.stringify(tagsRaw.split('|').map(s => s.trim()).filter(Boolean)) : '[]';
      const id = uuidv4();
      insert.run({ id, title, description: desc, price, baseInv, images, tags, created: now, updated: now });
      created++;
      audit('product', id, 'import-create', null, { title });
    }
  });
  tx(lines);
  res.json({ imported: created, errors });
});

// ---------- Meta & Upload & Debug ----------
app.get('/api/meta', (_req, res) => {
  try {
    const pCount = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
    const oCount = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
    res.json({ productCount: pCount, orderCount: oCount, serverTime: new Date().toISOString(), version: '1.0.0', stripePublishableKey: STRIPE_PUBLISHABLE || null });
  } catch { res.status(500).json({ error: 'meta unavailable' }); }
});

// Metrics endpoint
app.get('/api/metrics', requireAdmin, (req, res) => {
  res.json({
    uptimeSeconds: Math.round((Date.now() - metrics.startTime) / 1000),
    ...metrics
  });
});

app.post('/api/upload/image', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.status(201).json({ url: '/uploads/' + req.file.filename });
});

app.get('/api/debug/admin-status', (req, res) => {
  const provided = req.header('X-Admin-Token');
  res.json({ isAdmin: isAdmin(req), providedPresent: !!provided, providedPreview: provided ? provided.slice(0, 4) + '...' : null, expectedPreview: ADMIN_TOKEN.slice(0, 4) + '...' });
});

// Static legacy public (assets, uploads) & React build if present
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, {
  setHeaders(res, filePath) {
    if (/\.(?:js|css|png|jpg|jpeg|gif|svg|webp)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=600');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=60');
    }
  }
}));
// --- React build (client/dist) integration (single unified block) ---
(() => {
  const reactDist = path.join(__dirname, 'client', 'dist');
  if (!fs.existsSync(reactDist)) {
    console.log('[frontend] No React build at client/dist');
    console.log('[frontend] Run: cd client && npm install && npm run build');
    console.log('[frontend] Serving legacy /public assets only.');
    return;
  }
  console.log('[frontend] React build found. Mounting client/dist');
  app.use(express.static(reactDist, {
    setHeaders(res, filePath) {
      if (/\.(?:js|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?)$/i.test(filePath)) {
        if (/\.[A-Fa-f0-9]{8,}\.[\w]+$/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }
      }
    }
  }));
  // SPA fallback (exclude API & uploads)
  app.get(/^(?!\/api\/)(?!\/uploads\/).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    const accept = req.headers.accept || '';
    if (!accept.includes('text/html')) return next();
    return res.sendFile(path.join(reactDist, 'index.html'));
  });
})();

// Admin verify endpoint (simple token check)
app.get('/api/admin/verify', requireAdmin, (req, res) => {
  res.json({ ok: true, serverTime: new Date().toISOString() });
});

// Admin: replace all products with curated seed set of 10 tees
app.post('/api/admin/seed-products', requireAdmin, (req, res) => {
  try {
    const now = new Date().toISOString();
    const del = db.prepare('DELETE FROM products');
    del.run();
    const insert = db.prepare(`INSERT INTO products (id,title,description,priceCents,baseInventory,images,tags,createdAt,updatedAt,shippingFeeCents) VALUES (@id,@title,@description,@price,@inv,@images,@tags,@created,@updated,@ship)`);
    const tees = [
      { title: 'Essential White Tee', desc: 'Ultra‑soft ring-spun cotton in crisp white. Pre‑shrunk, side‑seamed for durability.', price: 1999, inv: 120, color: 'white', img: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=600&q=60' },
      { title: 'Jet Black Tee', desc: 'Deep black pigment dye with smooth handfeel and minimal neck label.', price: 2099, inv: 110, color: 'black', img: 'https://images.unsplash.com/photo-1603252110263-fb5113fc7550?auto=format&fit=crop&w=600&q=60' },
      { title: 'Heather Gray Tee', desc: 'Athletic heather blend — breathable & resilient for everyday wear.', price: 1899, inv: 90, color: 'gray', img: 'https://images.unsplash.com/photo-1585386959984-a4155222cd05?auto=format&fit=crop&w=600&q=60' },
      { title: 'Ocean Blue Tee', desc: 'Rich ocean blue dye, enzyme washed for lived‑in softness.', price: 2199, inv: 75, color: 'blue', img: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=600&q=60' },
      { title: 'Sunset Orange Tee', desc: 'Vibrant sunset orange, fade‑resistant reactive dye.', price: 2299, inv: 70, color: 'orange', img: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=600&q=60' },
      { title: 'Forest Green Tee', desc: 'Earthy forest green, mid‑weight 5.3oz jersey ideal for layering.', price: 2199, inv: 80, color: 'green', img: 'https://images.unsplash.com/photo-1612423284934-2850a4ea4f87?auto=format&fit=crop&w=600&q=60' },
      { title: 'Maroon Premium Tee', desc: 'Premium combed cotton in a deep maroon tone. Tapered modern fit.', price: 2499, inv: 60, color: 'maroon', img: 'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=600&q=60' },
      { title: 'Charcoal Vintage Tee', desc: 'Charcoal washed effect — each piece uniquely textured.', price: 2399, inv: 65, color: 'charcoal', img: 'https://images.unsplash.com/photo-1624006542612-c2586b0d35d3?auto=format&fit=crop&w=600&q=60' },
      { title: 'Pastel Lavender Tee', desc: 'Soft pastel lavender tone, lightweight breathable knit.', price: 2299, inv: 85, color: 'lavender', img: 'https://images.unsplash.com/photo-1617957772128-9f3d48b2a8d1?auto=format&fit=crop&w=600&q=60' },
      { title: 'Deep Navy Tee', desc: 'Classic deep navy core staple with reinforced collar.', price: 2099, inv: 95, color: 'navy', img: 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=600&q=60' }
    ];
    const tx = db.transaction(arr => {
      for (const t of arr) {
        insert.run({
          id: require('uuid').v4(),
          title: t.title,
          description: t.desc,
          price: t.price,
          inv: t.inv,
          images: JSON.stringify([t.img]),
          tags: JSON.stringify(['tee', t.color, 'premium']),
          created: now,
          updated: now,
          ship: 0
        });
      }
    });
    tx(tees);
    // Reset product ETag cache
    lastProductsETag = null; lastProductsKey = ''; lastProductsPayload = null;
    audit('product', null, 'seed-replace', null, { count: tees.length });
    res.json({ replaced: tees.length });
  } catch (e) {
    console.error('Seed products error', e);
    res.status(500).json({ error: 'Seed failed' });
  }
});

// Admin: diversified seed (tees, hoodies, caps, etc.) with multiple images & refined tags
app.post('/api/admin/seed-diverse', requireAdmin, (req, res) => {
  try {
    const now = new Date().toISOString();
    db.prepare('DELETE FROM products').run();
    const insert = db.prepare(`INSERT INTO products (id,title,description,priceCents,baseInventory,images,tags,createdAt,updatedAt,shippingFeeCents) VALUES (@id,@title,@description,@price,@inv,@images,@tags,@created,@updated,@ship)`);
    const items = [
      { title: 'Minimal Logo Hoodie', category: 'hoodie', price: 4599, inv: 55, ship: 300, imgs: ['https://images.unsplash.com/photo-1520970014086-2208d157c9e2?auto=format&fit=crop&w=640&q=70', 'https://images.unsplash.com/photo-1617957796155-e1d57c42154b?auto=format&fit=crop&w=640&q=70'], desc: 'Mid‑weight fleece hoodie with subtle chest logo and brushed interior.' },
      { title: 'Performance Tech Hoodie', category: 'hoodie', price: 5299, inv: 40, ship: 400, imgs: ['https://images.unsplash.com/photo-1600180758890-c3d4b0b5c4d6?auto=format&fit=crop&w=640&q=70', 'https://images.unsplash.com/photo-1536520002442-39764a41e987?auto=format&fit=crop&w=640&q=70'], desc: 'Moisture‑wicking technical knit, articulated sleeves, matte zipper.' },
      { title: 'Classic Dad Cap', category: 'cap', price: 1899, inv: 140, ship: 150, imgs: ['https://images.unsplash.com/photo-1617137968428-85924c800a22?auto=format&fit=crop&w=640&q=70', 'https://images.unsplash.com/photo-1607346256330-dee7f5f73c86?auto=format&fit=crop&w=640&q=70'], desc: 'Unstructured cotton twill cap with adjustable metal buckle strap.' },
      { title: 'Athletic Mesh Cap', category: 'cap', price: 2199, inv: 120, ship: 150, imgs: ['https://images.unsplash.com/photo-1600180758890-c3d4b0b5c4d6?auto=format&fit=crop&w=640&q=70', 'https://images.unsplash.com/photo-1605521969943-3b4a3c31f7e6?auto=format&fit=crop&w=640&q=70'], desc: 'Breathable mesh panels, curved bill, moisture band interior.' },
      { title: 'Essential Crew Tee', category: 'tee', price: 2099, inv: 160, ship: 0, imgs: ['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=640&q=70', 'https://images.unsplash.com/photo-1603252110263-fb5113fc7550?auto=format&fit=crop&w=640&q=70'], desc: 'Soft ring‑spun cotton everyday crew neck staple.' },
      { title: 'Organic Cotton Tee', category: 'tee', price: 2399, inv: 100, ship: 0, imgs: ['https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=640&q=70', 'https://images.unsplash.com/photo-1585386959984-a4155222cd05?auto=format&fit=crop&w=640&q=70'], desc: 'GOTS certified organic cotton with low‑impact dye process.' },
      { title: 'Flex Training Shorts', category: 'shorts', price: 3199, inv: 85, ship: 250, imgs: ['https://images.unsplash.com/photo-1599058918240-d6b1f98d69b0?auto=format&fit=crop&w=640&q=70', 'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=640&q=70'], desc: '4‑way stretch, laser‑cut vents, moisture control waistband.' },
      { title: 'Everyday Jogger Pants', category: 'pants', price: 4499, inv: 70, ship: 300, imgs: ['https://images.unsplash.com/photo-1624006542612-c2586b0d35d3?auto=format&fit=crop&w=640&q=70', 'https://images.unsplash.com/photo-1617957772128-9f3d48b2a8d1?auto=format&fit=crop&w=640&q=70'], desc: 'Tapered jogger with rib cuffs, brushed interior for warmth.' },
      { title: 'Thermal Baselayer Top', category: 'top', price: 3899, inv: 60, ship: 250, imgs: ['https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=640&q=70', 'https://images.unsplash.com/photo-1612423284934-2850a4ea4f87?auto=format&fit=crop&w=640&q=70'], desc: 'Lightweight grid fleece for insulation + breathability.' },
      { title: 'Ultra‑Light Windbreaker', category: 'jacket', price: 5799, inv: 50, ship: 400, imgs: ['https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=640&q=70', 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=640&q=70'], desc: 'Packable DWR windbreaker with reflective accents.' }
    ];
    const tx = db.transaction(arr => {
      for (const it of arr) {
        insert.run({
          id: uuid(),
          title: it.title,
          description: it.desc,
          price: it.price,
          inv: it.inv,
          images: JSON.stringify(it.imgs),
          tags: JSON.stringify([it.category, 'apparel', ...(it.price > 4000 ? ['premium'] : [])]),
          created: now,
          updated: now,
          ship: it.ship || 0
        });
      }
    });
    tx(items);
    lastProductsETag = null; lastProductsKey = ''; lastProductsPayload = null;
    audit('product', null, 'seed-diverse', null, { count: items.length });
    res.json({ inserted: items.length });
  } catch (e) {
    console.error('Diverse seed error', e);
    res.status(500).json({ error: 'Diverse seed failed' });
  }
});

// Error handler
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Server error' }); });

app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`Server running http://localhost:${PORT}`);
  console.log('Admin token first 4:', ADMIN_TOKEN.slice(0, 4) + '...');
  console.log('Endpoints ready.');
  console.log('='.repeat(60));
});