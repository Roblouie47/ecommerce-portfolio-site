const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuid } = require('uuid');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'shop.db');
if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.exec(`PRAGMA foreign_keys = ON;`);

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  priceCents INTEGER NOT NULL,
  baseInventory INTEGER NOT NULL DEFAULT 0,
  images TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT
);
CREATE TABLE IF NOT EXISTS variants (
  id TEXT PRIMARY KEY,
  productId TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT,
  optionValues TEXT NOT NULL DEFAULT '{}',
  priceCents INTEGER,
  inventory INTEGER NOT NULL DEFAULT 0,
  UNIQUE(productId, sku)
);
CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY,
  cartId TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  productId TEXT NOT NULL REFERENCES products(id),
  variantId TEXT REFERENCES variants(id),
  quantity INTEGER NOT NULL,
  UNIQUE(cartId, productId, variantId)
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  cartId TEXT,
  status TEXT NOT NULL,
  subtotalCents INTEGER NOT NULL,
  discountCents INTEGER NOT NULL,
  totalCents INTEGER NOT NULL,
  shippingCents INTEGER NOT NULL DEFAULT 0,
  shippingDiscountCents INTEGER NOT NULL DEFAULT 0,
  customerName TEXT,
  customerEmail TEXT,
  customerAddress TEXT,
  shippingCountry TEXT,
  discountCode TEXT,
  shippingCode TEXT,
  estimatedDeliveryAt TEXT,
  paidAt TEXT,
  fulfilledAt TEXT,
  cancelledAt TEXT,
  shippedAt TEXT,
  completedAt TEXT,
  returnRequestedAt TEXT,
  returnReason TEXT,
  returnAdminStatus TEXT NOT NULL DEFAULT 'pending',
  returnAdminNotes TEXT,
  returnAdminRespondedAt TEXT,
  returnUsageNotes TEXT,
  returnClosedAt TEXT,
  stripeSessionId TEXT,
  stripePaymentIntentId TEXT,
  paymentProvider TEXT,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS discounts (
  code TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  value INTEGER NOT NULL,
  minSubtotalCents INTEGER NOT NULL DEFAULT 0,
  expiresAt TEXT,
  createdAt TEXT NOT NULL,
  disabledAt TEXT,
  usageCount INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  orderId TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  productId TEXT,
  variantId TEXT,
  titleSnapshot TEXT,
  quantity INTEGER NOT NULL,
  unitPriceCents INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS refund_messages (
  id TEXT PRIMARY KEY,
  orderId TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  authorRole TEXT NOT NULL,
  authorName TEXT,
  authorEmail TEXT,
  body TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
-- Accounts & Auth
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,
  name TEXT,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT,
  line1 TEXT,
  city TEXT,
  region TEXT,
  postal TEXT,
  country TEXT,
  createdAt TEXT NOT NULL
);
-- Reviews & moderation
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  productId TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  userId TEXT REFERENCES users(id) ON DELETE SET NULL,
  orderId TEXT REFERENCES orders(id) ON DELETE SET NULL,
  variantId TEXT REFERENCES variants(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL,
  title TEXT,
  body TEXT,
  authorName TEXT,
  authorEmail TEXT,
  quantityPurchased INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  moderatedAt TEXT,
  moderatedBy TEXT,
  moderationNotes TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
-- Back-in-stock watch list
CREATE TABLE IF NOT EXISTS inventory_watches (
  id TEXT PRIMARY KEY,
  productId TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  UNIQUE(productId,email)
);
-- Bundles
CREATE TABLE IF NOT EXISTS bundles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  priceCents INTEGER NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bundle_items (
  id TEXT PRIMARY KEY,
  bundleId TEXT NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  productId TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  UNIQUE(bundleId, productId)
);
`);

// Lightweight migration: add deletedAt if missing
try {
  const cols = /** @type {Array<{name: string}>} */ (db.prepare("PRAGMA table_info(products)").all());
  if (!cols.some(c => c.name === 'deletedAt')) {
    db.exec('ALTER TABLE products ADD COLUMN deletedAt TEXT');
  }
} catch (e) {
  console.warn('Migration check failed', e.message);
}

// Order status columns migration
try {
  const ocols = /** @type {Array<{name: string}>} */ (db.prepare("PRAGMA table_info(orders)").all());
  const need = (name) => !ocols.some(c => c.name === name);
  if (need('shippingCents')) db.exec('ALTER TABLE orders ADD COLUMN shippingCents INTEGER NOT NULL DEFAULT 0');
  if (need('shippingDiscountCents')) db.exec('ALTER TABLE orders ADD COLUMN shippingDiscountCents INTEGER NOT NULL DEFAULT 0');
  if (need('shippingCountry')) db.exec('ALTER TABLE orders ADD COLUMN shippingCountry TEXT');
  if (need('shippingCode')) db.exec('ALTER TABLE orders ADD COLUMN shippingCode TEXT');
  if (need('estimatedDeliveryAt')) db.exec('ALTER TABLE orders ADD COLUMN estimatedDeliveryAt TEXT');
  if (need('paidAt')) db.exec('ALTER TABLE orders ADD COLUMN paidAt TEXT');
  if (need('fulfilledAt')) db.exec('ALTER TABLE orders ADD COLUMN fulfilledAt TEXT');
  if (need('cancelledAt')) db.exec('ALTER TABLE orders ADD COLUMN cancelledAt TEXT');
  if (need('shippedAt')) db.exec('ALTER TABLE orders ADD COLUMN shippedAt TEXT');
  if (need('completedAt')) db.exec('ALTER TABLE orders ADD COLUMN completedAt TEXT');
  if (need('returnRequestedAt')) db.exec('ALTER TABLE orders ADD COLUMN returnRequestedAt TEXT');
  if (need('returnReason')) db.exec('ALTER TABLE orders ADD COLUMN returnReason TEXT');
  if (need('returnAdminStatus')) db.exec("ALTER TABLE orders ADD COLUMN returnAdminStatus TEXT DEFAULT 'pending'");
  if (need('returnAdminNotes')) db.exec('ALTER TABLE orders ADD COLUMN returnAdminNotes TEXT');
  if (need('returnAdminRespondedAt')) db.exec('ALTER TABLE orders ADD COLUMN returnAdminRespondedAt TEXT');
  if (need('returnUsageNotes')) db.exec('ALTER TABLE orders ADD COLUMN returnUsageNotes TEXT');
  if (need('returnClosedAt')) db.exec('ALTER TABLE orders ADD COLUMN returnClosedAt TEXT');
  if (need('stripeSessionId')) db.exec('ALTER TABLE orders ADD COLUMN stripeSessionId TEXT');
  if (need('stripePaymentIntentId')) db.exec('ALTER TABLE orders ADD COLUMN stripePaymentIntentId TEXT');
  if (need('paymentProvider')) db.exec('ALTER TABLE orders ADD COLUMN paymentProvider TEXT');
} catch (e) {
  console.warn('Order migration failed', e.message);
}

// Order items variant column migration
try {
  const oicols = /** @type {Array<{name: string}>} */ (db.prepare('PRAGMA table_info(order_items)').all());
  if (!oicols.some(c => c.name === 'variantId')) {
    db.exec('ALTER TABLE order_items ADD COLUMN variantId TEXT');
  }
} catch (e) {
  console.warn('Order items migration failed', e.message);
}

// Order events timeline table migration
try {
  db.exec(`CREATE TABLE IF NOT EXISTS order_events (
    id TEXT PRIMARY KEY,
    orderId TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    at TEXT NOT NULL
  );`);
} catch (e) {
  console.warn('Order events migration failed', e.message);
}

// Audit log table
try {
  db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    entity TEXT NOT NULL,
    entityId TEXT,
    action TEXT NOT NULL,
    before TEXT,
    after TEXT,
    at TEXT NOT NULL
  );`);
} catch (e) {
  console.warn('Audit log migration failed', e.message);
}

// Add new columns to existing discounts table if missing
try {
  const dcols = /** @type {Array<{name: string}>} */ (db.prepare('PRAGMA table_info(discounts)').all());
  const need = (n) => !dcols.some(c => c.name === n);
  if (need('disabledAt')) db.exec('ALTER TABLE discounts ADD COLUMN disabledAt TEXT');
  if (need('usageCount')) db.exec('ALTER TABLE discounts ADD COLUMN usageCount INTEGER NOT NULL DEFAULT 0');
} catch (e) {
  console.warn('Discounts migration failed', e.message);
}

// Reviews table migration for moderation fields
try {
  const rcols = /** @type {Array<{name: string}>} */ (db.prepare('PRAGMA table_info(reviews)').all());
  const need = (n) => !rcols.some(c => c.name === n);
  if (need('orderId')) db.exec('ALTER TABLE reviews ADD COLUMN orderId TEXT REFERENCES orders(id) ON DELETE SET NULL');
  if (need('variantId')) db.exec('ALTER TABLE reviews ADD COLUMN variantId TEXT REFERENCES variants(id) ON DELETE SET NULL');
  if (need('title')) db.exec('ALTER TABLE reviews ADD COLUMN title TEXT');
  if (need('authorName')) db.exec('ALTER TABLE reviews ADD COLUMN authorName TEXT');
  if (need('authorEmail')) db.exec('ALTER TABLE reviews ADD COLUMN authorEmail TEXT');
  if (need('quantityPurchased')) db.exec('ALTER TABLE reviews ADD COLUMN quantityPurchased INTEGER NOT NULL DEFAULT 0');
  if (need('moderatedAt')) db.exec('ALTER TABLE reviews ADD COLUMN moderatedAt TEXT');
  if (need('moderatedBy')) db.exec('ALTER TABLE reviews ADD COLUMN moderatedBy TEXT');
  if (need('moderationNotes')) db.exec('ALTER TABLE reviews ADD COLUMN moderationNotes TEXT');
} catch (e) {
  console.warn('Reviews migration failed', e.message);
}

// Seed if empty
const cRow = /** @type {{ c: number }} */ (db.prepare('SELECT COUNT(*) as c FROM products').get());
const c = cRow.c;
if (c === 0) {
  const now = new Date().toISOString();
  const pid = uuid();
  db.prepare(`INSERT INTO products (id,title,description,priceCents,baseInventory,images,tags,createdAt,updatedAt)
              VALUES (@id,@title,@description,@price,@inv,@images,@tags,@created,@updated)`).run({
    id: pid,
    title: 'Classic White Tee',
    description: 'Soft cotton white t-shirt',
    price: 1999,
    inv: 100,
    images: JSON.stringify(['https://via.placeholder.com/400?text=White+Tee']),
    tags: JSON.stringify(['classic', 'white']),
    created: now,
    updated: now
  });
}

module.exports = db;
