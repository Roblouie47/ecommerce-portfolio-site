const express = require('express');
const router = express.Router();

// TODO: Replace with your actual PayMongo secret key
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY || 'sk_test_xxx';
const fetch = require('node-fetch');

// Helper to create PayMongo payment intent
async function createPayMongoIntent({ amount, currency, paymentMethod, customer, description }) {
  const url = 'https://api.paymongo.com/v1/payment_intents';
  const paymentMethodTypes = paymentMethod === 'gcash' ? ['gcash'] : ['card'];
  const payload = {
    data: {
      attributes: {
        amount: amount, // in cents
        payment_method_allowed: paymentMethodTypes,
        payment_method_options: {},
        currency: currency,
        description: description || 'Order Payment',
        statement_descriptor: 'EcommerceSite',
        capture_type: 'automatic',
        metadata: {
          customer_name: customer.name,
          customer_email: customer.email,
          customer_phone: customer.phone
        }
      }
    }
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64'),
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.errors?.[0]?.detail || 'PayMongo error');
  return data.data;
}

// POST /api/paymongo-intent
router.post('/paymongo-intent', async (req, res) => {
  try {
    const { cart, customer, discountCode, shippingCode, paymentMethod } = req.body;
    // Calculate total amount (replace with your own logic)
    let amount = 0;
    for (const item of cart) {
      amount += (item.priceCents || 0) * (item.qty || 1);
    }
    // TODO: Apply discounts, shipping, etc.
    const currency = 'PHP';
    const description = `Order for ${customer.name}`;
    const intent = await createPayMongoIntent({
      amount,
      currency,
      paymentMethod,
      customer,
      description
    });
    // If payment is required, redirect to PayMongo payment page
    if (intent.attributes.status === 'awaiting_payment' && intent.attributes.next_action?.redirect?.url) {
      return res.json({ next_action: intent.attributes.next_action, status: intent.attributes.status });
    }
    // If payment is already succeeded (rare, but possible)
    if (intent.attributes.status === 'succeeded') {
      return res.json({ status: 'succeeded' });
    }
    // Otherwise, payment was not started
    return res.status(400).json({ error: 'Payment could not be started. Please try again.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
