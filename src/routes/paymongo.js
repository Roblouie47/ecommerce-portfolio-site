const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { v4: defaultUuid } = require('uuid');

function normalizeCustomer(raw, fallback) {
	const source = raw && typeof raw === 'object' ? raw : {};
	const base = fallback && typeof fallback === 'object' ? fallback : {};
	const pick = (key) => {
		const value = source[key];
		if (typeof value === 'string') {
			const trimmed = value.trim();
			if (trimmed) return trimmed;
		}
		const alt = base[key];
		if (typeof alt === 'string') {
			const trimmed = alt.trim();
			if (trimmed) return trimmed;
		}
		return '';
	};
	return {
		name: pick('name'),
		email: pick('email'),
		phone: pick('phone'),
		address: pick('address'),
		country: pick('country')
	};
}

function normalizeCode(value) {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim().toUpperCase();
	return trimmed ? trimmed : undefined;
}

function isShipOnlyDiscount(row) {
	if (!row) return false;
	if (row.type === 'ship') return true;
	if (/SHIP/i.test(row.code || '') && row.type === 'percent' && row.value === 100) return true;
	return false;
}

function discountActive(row) {
	if (!row || row.disabledAt) return false;
	if (!row.expiresAt) return true;
	const expiresAt = new Date(row.expiresAt).getTime();
	return Number.isFinite(expiresAt) ? expiresAt > Date.now() : true;
}

function allowDiscount(row, subtotal) {
	if (!discountActive(row)) return false;
	if (isShipOnlyDiscount(row)) return false;
	return subtotal >= (row.minSubtotalCents || 0);
}

function calculateDiscount(row, subtotal) {
	if (!row) return 0;
	if (row.type === 'percent') {
		const pct = Math.min(100, Math.max(0, row.value || 0));
		return Math.floor(subtotal * (pct / 100));
	}
	if (row.type === 'fixed') {
		return Math.min(subtotal, row.value || 0);
	}
	return 0;
}

function allowShippingDiscount(row, subtotal, shippingCents, discountCode, shippingCode) {
	if (!discountActive(row)) return false;
	if (!isShipOnlyDiscount(row)) return false;
	if (shippingCents <= 0) return false;
	if (subtotal < (row.minSubtotalCents || 0)) return false;
	if (discountCode && shippingCode && discountCode === shippingCode) return false;
	return true;
}

function sanitizeMetadataValues(meta) {
	const out = {};
	if (!meta || typeof meta !== 'object') return out;
	for (const [key, value] of Object.entries(meta)) {
		if (!key) continue;
		const str = value == null ? '' : String(value);
		out[key] = str.slice(0, 255);
	}
	return out;
}

/**
 * @template T
 * @param {string} message
 * @param {T} payload
 * @returns {Error & { paymongo?: T }}
 */
function createPaymongoError(message, payload) {
	const err = new Error(message);
	return Object.assign(err, { paymongo: payload });
}

function buildIntentMetadata(orderId, discountCode, shippingCode, customer) {
	return sanitizeMetadataValues({
		order_id: orderId,
		order_reference: orderId,
		discount_code: discountCode || '',
		shipping_code: shippingCode || '',
		customer_email: customer.email || '',
		customer_name: customer.name || ''
	});
}

function extractRawBody(req) {
	if (!req) return '';
	if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
	if (typeof req.body === 'string') return req.body;
	if (req.rawBody && Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8');
	if (req.rawBody && typeof req.rawBody === 'string') return req.rawBody;
	if (!req.body) return '';
	try {
		return JSON.stringify(req.body);
	} catch {
		return '';
	}
}

function verifyPayMongoSignature(req, secret) {
	const signatureHeader = req.headers ? req.headers['paymongo-signature'] : undefined;
	if (!signatureHeader || !secret) return false;
	const rawBody = extractRawBody(req);
	const parsed = {};
	for (const entry of String(signatureHeader).split(',')) {
		const trimmed = entry.trim();
		const eqIndex = trimmed.indexOf('=');
		if (eqIndex <= 0) continue;
		const key = trimmed.slice(0, eqIndex).trim();
		const value = trimmed.slice(eqIndex + 1).trim();
		if (key && value) parsed[key] = value;
	}
	const timestamp = parsed.t || parsed.ts || '';
	const payload = timestamp ? `${timestamp}.${rawBody}` : rawBody;
	const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
	const expectedBuf = Buffer.from(expected, 'utf8');
	const candidates = [parsed.v1, parsed.v0, parsed.sig, parsed.s, signatureHeader].filter(Boolean);
	for (const candidate of candidates) {
		try {
			const candidateBuf = Buffer.from(candidate, 'utf8');
			if (candidateBuf.length === expectedBuf.length && crypto.timingSafeEqual(candidateBuf, expectedBuf)) {
				return true;
			}
		} catch {
			continue;
		}
	}
	return candidates.includes(expected);
}

async function createPayMongoIntent({ amount, currency, paymentMethod, customer, description, metadata, secretKey }) {
	if (!secretKey) throw new Error('PayMongo secret key missing');
	const url = 'https://api.paymongo.com/v1/payment_intents';
	const methodTypes = paymentMethod === 'card' ? ['card'] : ['gcash'];
	const payload = {
		data: {
			attributes: {
				amount,
				payment_method_allowed: methodTypes,
				payment_method_options: {},
				currency,
				description: description || 'Order Payment',
				statement_descriptor: 'EcommerceSite',
				capture_type: 'automatic',
				metadata,
				customer: {
					name: customer.name || '',
					email: customer.email || '',
					phone: customer.phone || ''
				}
			}
		}
	};
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			Authorization: 'Basic ' + Buffer.from(secretKey + ':').toString('base64'),
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: JSON.stringify(payload)
	});
	const data = await res.json();
	if (!res.ok) {
		const detail = data && data.errors && data.errors[0] && data.errors[0].detail;
		throw createPaymongoError(detail || 'PayMongo error', data);
	}
	return data.data;
}

async function createPayMongoPaymentMethod({ customer, secretKey }) {
	if (!secretKey) throw new Error('PayMongo secret key missing');
	const url = 'https://api.paymongo.com/v1/payment_methods';
	const payload = {
		data: {
			attributes: {
				type: 'gcash',
				billing: {
					name: customer.name || '',
					email: customer.email || '',
					phone: customer.phone || ''
				}
			}
		}
	};
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			Authorization: 'Basic ' + Buffer.from(secretKey + ':').toString('base64'),
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: JSON.stringify(payload)
	});
	const data = await res.json();
	if (!res.ok) {
		const detail = data && data.errors && data.errors[0] && data.errors[0].detail;
		throw createPaymongoError(detail || 'PayMongo payment method error', data);
	}
	return data.data;
}

async function attachPayMongoPaymentMethod({ intentId, clientKey, paymentMethodId, secretKey }) {
	if (!secretKey) throw new Error('PayMongo secret key missing');
	const url = `https://api.paymongo.com/v1/payment_intents/${encodeURIComponent(intentId)}/attach`;
	const payload = {
		data: {
			attributes: {
				payment_method: paymentMethodId,
				client_key: clientKey
			}
		}
	};
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			Authorization: 'Basic ' + Buffer.from(secretKey + ':').toString('base64'),
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: JSON.stringify(payload)
	});
	const data = await res.json();
	if (!res.ok) {
		const detail = data && data.errors && data.errors[0] && data.errors[0].detail;
		throw createPaymongoError(detail || 'PayMongo attach error', data);
	}
	return data.data;
}

module.exports = function createPayMongoRouter(options = {}) {
	const router = express.Router();
	const {
		db = require('../db'),
		uuid = defaultUuid,
		uuidv4 = defaultUuid,
		baseShippingFor = () => 0,
		audit = () => {},
		metrics,
		getCustomerSession = () => null,
		logger = console,
		secretKey,
		webhookSecret
	} = options;

	const PAYMONGO_SECRET_KEY = secretKey || process.env.PAYMONGO_SECRET_KEY || '';
	const WEBHOOK_SECRET = webhookSecret || process.env.PAYMONGO_WEBHOOK_SECRET || '';
	const warn = typeof logger.warn === 'function' ? logger.warn.bind(logger) : console.warn;
	const error = typeof logger.error === 'function' ? logger.error.bind(logger) : console.error;

	const selectProduct = db.prepare('SELECT * FROM products WHERE id=?');
	const selectVariant = db.prepare('SELECT * FROM variants WHERE id=? AND productId=?');
	const productHasVariants = db.prepare('SELECT 1 FROM variants WHERE productId=? LIMIT 1');
	const selectDiscount = db.prepare('SELECT * FROM discounts WHERE code=?');
	const insertOrder = db.prepare(`INSERT INTO orders(id,cartId,status,subtotalCents,discountCents,totalCents,shippingCents,shippingDiscountCents,customerName,customerEmail,customerAddress,shippingCountry,discountCode,shippingCode,estimatedDeliveryAt,paymentProvider,createdAt)
		VALUES(@id,NULL,@status,@sub,@disc,@total,@ship,@shipDisc,@name,@email,@addr,@country,@discountCode,@shipCode,@eta,@provider,@created)`);
	const insertOrderItem = db.prepare('INSERT INTO order_items(id,orderId,productId,variantId,titleSnapshot,quantity,unitPriceCents) VALUES(?,?,?,?,?,?,?)');
	const updateOrderIntent = db.prepare('UPDATE orders SET paymongoIntentId=?, paymongoClientKey=? WHERE id=?');
	const getOrderById = db.prepare('SELECT * FROM orders WHERE id=?');
	const getOrderByIntent = db.prepare('SELECT * FROM orders WHERE paymongoIntentId=?');
	const updateOrderPaid = db.prepare('UPDATE orders SET status=?, paidAt=?, paymongoIntentId=?, paymongoPaymentId=? WHERE id=?');
	const insertOrderEvent = db.prepare('INSERT INTO order_events(id,orderId,status,at) VALUES(?,?,?,?)');

	const jsonParser = express.json();

	router.post('/paymongo-intent', jsonParser, async (req, res) => {
		if (!PAYMONGO_SECRET_KEY) {
			return res.status(501).json({ error: 'PayMongo not configured' });
		}
		const session = getCustomerSession(req);
		if (!session) {
			return res.status(401).json({ error: 'Login required' });
		}
		const body = req.body || {};
		const cart = Array.isArray(body.cart) ? body.cart : [];
		if (!cart.length) {
			return res.status(400).json({ error: 'cart must contain at least one item' });
		}
		const paymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod.trim().toLowerCase() : 'gcash';
		if (!['gcash', 'card'].includes(paymentMethod)) {
			return res.status(400).json({ error: 'Unsupported payment method' });
		}
		if (paymentMethod === 'card') {
			return res.status(400).json({ error: 'Card payments require a secure card form. Please choose GCash for now.' });
		}
		const discountCode = normalizeCode(body.discountCode);
		const shippingCode = normalizeCode(body.shippingCode);
		const sessionUser = session.user || {};
		const customer = normalizeCustomer(body.customer, sessionUser);
		if (!customer.email) {
			return res.status(400).json({ error: 'Customer email required' });
		}

		const normalized = [];
		let subtotal = 0;
		let perItemShipping = 0;
		for (const [index, rawLine] of cart.entries()) {
			if (!rawLine || typeof rawLine !== 'object') {
				return res.status(400).json({ error: `cart[${index}] invalid` });
			}
			const productId = rawLine.productId;
			const qty = Number.isInteger(rawLine.qty) ? rawLine.qty : Number.isInteger(rawLine.quantity) ? rawLine.quantity : null;
			const variantId = rawLine.variantId || null;
			if (!productId || !qty || qty <= 0) {
				return res.status(400).json({ error: `cart[${index}] requires productId and positive qty` });
			}
			const product = selectProduct.get(productId);
			if (!product) {
				return res.status(400).json({ error: `cart[${index}] product not found` });
			}
			let unitPrice = product.priceCents;
			let resolvedVariantId = null;
			if (variantId) {
				const variant = selectVariant.get(variantId, productId);
				if (!variant) {
					return res.status(400).json({ error: `cart[${index}] variant not found for product` });
				}
				if (variant.inventory < qty) {
					return res.status(400).json({ error: `cart[${index}] insufficient inventory` });
				}
				unitPrice = variant.priceCents != null ? variant.priceCents : product.priceCents;
				resolvedVariantId = variant.id;
			} else {
				const hasVariants = productHasVariants.get(productId);
				if (hasVariants) {
					return res.status(400).json({ error: `cart[${index}] variant required for this product` });
				}
				if (product.baseInventory < qty) {
					return res.status(400).json({ error: `cart[${index}] insufficient inventory` });
				}
			}
			const shippingFee = product.shippingFeeCents || 0;
			perItemShipping += shippingFee * qty;
			subtotal += unitPrice * qty;
			normalized.push({
				productId,
				variantId: resolvedVariantId,
				quantity: qty,
				unitPriceCents: unitPrice,
				title: product.title,
				shippingFeeCents: shippingFee
			});
		}

		let discountCents = 0;
		if (discountCode) {
			const discountRow = selectDiscount.get(discountCode);
			if (discountRow && allowDiscount(discountRow, subtotal)) {
				discountCents = calculateDiscount(discountRow, subtotal);
			}
		}

		const customerCountry = customer.country || '';
		let shippingCents;
		const countryUpper = customerCountry.toUpperCase();
		const isPH = countryUpper === 'PH' || countryUpper === 'PHL' || countryUpper === 'PHILIPPINES';
		if (isPH) {
			shippingCents = 200;
		} else {
			shippingCents = baseShippingFor(subtotal, customerCountry) + perItemShipping;
		}

		let shippingDiscountCents = 0;
		if (shippingCode) {
			const shipRow = selectDiscount.get(shippingCode);
			if (shipRow && allowShippingDiscount(shipRow, subtotal, shippingCents, discountCode, shippingCode)) {
				const pct = Math.min(100, Math.max(0, shipRow.value || 0));
				shippingDiscountCents = Math.min(shippingCents, Math.floor(shippingCents * (pct / 100)));
			}
		}

		const netShipping = Math.max(0, shippingCents - shippingDiscountCents);
		const totalCents = subtotal - discountCents + netShipping;
		if (!Number.isInteger(totalCents) || totalCents <= 0) {
			return res.status(400).json({ error: 'Order total must be greater than zero' });
		}

		const orderId = uuid();
		const nowIso = new Date().toISOString();
		const etaDays = netShipping === 0 ? 2 : 5;
		const estimatedDeliveryAt = new Date(Date.now() + etaDays * 24 * 60 * 60 * 1000).toISOString();
		insertOrder.run({
			id: orderId,
			status: 'pending_payment',
			sub: subtotal,
			disc: discountCents,
			total: totalCents,
			ship: shippingCents,
			shipDisc: shippingDiscountCents,
			name: customer.name || null,
			email: customer.email || null,
			addr: customer.address || null,
			country: customer.country || null,
			discountCode: discountCode || null,
			shipCode: shippingCode || null,
			eta: estimatedDeliveryAt,
			provider: 'paymongo',
			created: nowIso
		});
		insertOrderEvent.run(uuidv4(), orderId, 'pending_payment', nowIso);
		for (const line of normalized) {
			insertOrderItem.run(uuid(), orderId, line.productId, line.variantId || null, line.title, line.quantity, line.unitPriceCents);
		}
		if (metrics && typeof metrics === 'object' && Object.prototype.hasOwnProperty.call(metrics, 'ordersCreated')) {
			metrics.ordersCreated += 1;
		}
		audit('order', orderId, 'create-paymongo', null, { subtotalCents: subtotal, discountCents, totalCents });

		const metadata = buildIntentMetadata(orderId, discountCode, shippingCode, customer);
		let intent;
		try {
			intent = await createPayMongoIntent({
				amount: totalCents,
				currency: 'PHP',
				paymentMethod,
				customer,
				description: `Order ${orderId}`,
				metadata,
				secretKey: PAYMONGO_SECRET_KEY
			});
		} catch (err) {
			warn('[paymongo] intent creation failed', err.message, err.paymongo?.errors?.[0] || err.paymongo || '');
			return res.status(400).json({
				error: err.message || 'PayMongo error',
				paymongo: err.paymongo?.errors?.[0] || null
			});
		}

		const attr = intent.attributes || {};
		const intentId = intent.id || null;
		const clientKey = attr.client_key || null;
		updateOrderIntent.run(intentId, clientKey, orderId);

		if (attr.status === 'succeeded') {
			const orderRow = getOrderById.get(orderId);
			await markOrderPaid(orderRow, {
				intentId: intentId,
				paymentId: Array.isArray(attr.payments) && attr.payments.length ? attr.payments[0] && attr.payments[0].id : null,
				amount: attr.amount,
				currency: attr.currency
			});
			return res.json({ orderId, status: 'succeeded' });
		}

		// For GCash, create a payment method and attach to get redirect URL
		let attachResult = null;
		try {
			const pm = await createPayMongoPaymentMethod({ customer, secretKey: PAYMONGO_SECRET_KEY });
			attachResult = await attachPayMongoPaymentMethod({
				intentId,
				clientKey,
				paymentMethodId: pm.id,
				secretKey: PAYMONGO_SECRET_KEY
			});
		} catch (err) {
			warn('[paymongo] attach failed', err.message, err.paymongo?.errors?.[0] || err.paymongo || '');
			return res.status(400).json({
				error: err.message || 'Payment could not be started. Please try again.',
				paymongo: err.paymongo?.errors?.[0] || null
			});
		}

		const attachedAttr = attachResult?.attributes || {};
		if (attachedAttr.next_action && attachedAttr.next_action.redirect && attachedAttr.next_action.redirect.url) {
			return res.json({
				orderId,
				status: attachedAttr.status || 'awaiting_payment',
				next_action: attachedAttr.next_action,
				client_key: clientKey || null
			});
		}

		return res.status(400).json({ error: 'Payment could not be started. Please try again.' });
	});

	router.post('/paymongo-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
		if (!WEBHOOK_SECRET) {
			return res.status(501).json({ error: 'PayMongo webhook not configured' });
		}
		if (!verifyPayMongoSignature(req, WEBHOOK_SECRET)) {
			return res.status(401).json({ error: 'Invalid webhook signature' });
		}
		let event;
		try {
			event = JSON.parse(extractRawBody(req));
		} catch {
			return res.status(400).json({ error: 'Invalid webhook payload' });
		}
		try {
			await handleWebhookEvent(event);
			res.json({ received: true });
		} catch (err) {
			error('[paymongo] webhook handler error', err);
			res.status(500).json({ error: 'Webhook handler error' });
		}
	});

	async function handleWebhookEvent(event) {
		if (!event || typeof event !== 'object') return;
		if (event.type !== 'payment_intent.payment_succeeded') return;
		const data = event.data || {};
		const attributes = data.attributes || {};
		const metadata = attributes.metadata || {};
		const intentId = data.id || attributes.id || null;
		const orderId = metadata.order_id || metadata.orderId || metadata.order_reference || null;
		let order = null;
		if (orderId) {
			order = getOrderById.get(orderId);
		}
		if (!order && intentId) {
			order = getOrderByIntent.get(intentId);
		}
		if (!order) {
			warn('[paymongo] order not found for intent', intentId || orderId || 'unknown');
			return;
		}
		const amount = Number.isFinite(attributes.amount) ? attributes.amount : null;
		const currency = typeof attributes.currency === 'string' ? attributes.currency.toUpperCase() : '';
		if (amount != null && order.totalCents != null && Number(order.totalCents) !== Number(amount)) {
			warn('[paymongo] amount mismatch for order', order.id, 'expected', order.totalCents, 'got', amount);
			return;
		}
		if (currency && currency !== 'PHP') {
			warn('[paymongo] currency mismatch for order', order.id, 'currency', currency);
			return;
		}
		updateOrderIntent.run(intentId || order.paymongoIntentId || null, attributes.client_key || order.paymongoClientKey || null, order.id);
		await markOrderPaid(order, {
			intentId: intentId || order.paymongoIntentId || null,
			paymentId: Array.isArray(attributes.payments) && attributes.payments.length ? attributes.payments[0] && attributes.payments[0].id : null,
			amount: attributes.amount,
			currency: attributes.currency
		});
	}

	async function markOrderPaid(order, context) {
		if (!order) return;
		if (order.paidAt || order.cancelledAt) {
			if (!order.paymongoIntentId && context && context.intentId) {
				updateOrderIntent.run(context.intentId, order.paymongoClientKey || null, order.id);
			}
			return;
		}
		const nowIso = new Date().toISOString();
		const intentId = context && context.intentId ? context.intentId : order.paymongoIntentId || null;
		const paymentId = context && context.paymentId ? context.paymentId : order.paymongoPaymentId || null;
		updateOrderPaid.run('paid', nowIso, intentId, paymentId, order.id);
		insertOrderEvent.run(uuidv4(), order.id, 'paid', nowIso);
		audit('order', order.id, 'paymongo-paid', { status: order.status, paidAt: order.paidAt }, { status: 'paid', paidAt: nowIso, paymongoIntentId: intentId, paymongoPaymentId: paymentId });
	}

	return router;
};

