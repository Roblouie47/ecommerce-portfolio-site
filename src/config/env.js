const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

module.exports = {
    PORT: parseInt(process.env.PORT, 10) || 3000,
    ADMIN_TOKEN: process.env.ADMIN_TOKEN || 'changeme',
    STRIPE_SECRET: process.env.STRIPE_SECRET || null,
    STRIPE_PUBLISHABLE: process.env.STRIPE_PUBLISHABLE || null,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || null,
    PUBLIC_URL: process.env.PUBLIC_URL || 'http://localhost:' + (parseInt(process.env.PORT, 10) || 3000)
};
