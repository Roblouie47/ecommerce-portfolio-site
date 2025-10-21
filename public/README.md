# T-Shirt Shop Demo (Original Code)

A single-file-per-layer demo e-commerce site (Shopify-inspired but **not copied**) with:

Features
- Product listing (title, description, price, inventory, images, tags)
- Product detail
- Search filter (client-side)
- Cart (localStorage)
- Checkout -> creates order + decrements inventory
- Tax calculation (simple 7.5%)
- Admin panel (token-based) for:
  - Create / edit / delete products
  - View orders
  - Mark orders as paid or fulfilled
- In-memory store (resets on restart)
- Responsive layout
- REST API + Frontend SPA

## Quick Start

```bash
npm init -y
npm install express cors uuid
node server.js
```

Open: http://localhost:3000

Admin token default: `changeme` (set `ADMIN_TOKEN` env var to override).

Example (Unix):
```bash
ADMIN_TOKEN=mysecret node server.js
```

## API Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/products | public | List products |
| GET | /api/products/:id | public | Product detail |
| POST | /api/products | admin | Create product |
| PUT | /api/products/:id | admin | Update product |
| DELETE | /api/products/:id | admin | Delete product |
| POST | /api/orders | public | Create order (checkout) |
| GET | /api/orders | admin | List orders |
| GET | /api/orders/:id | public/admin | Order detail (admin sees full) |
| PUT | /api/orders/:id/pay | public (demo) | Mark paid (simulated) |
| PUT | /api/orders/:id/fulfill | admin | Fulfill order |
| GET | /api/meta | public | Site metadata |

## Future Enhancements

- Real database (MongoDB/PostgreSQL)
- Authenticated customers & order history
- Payment integration (Stripe)
- Pagination, sorting
- Image uploads
- Rate limiting & logging

## License

You are free to use and modify this demo code. No affiliation with Shopify; purely educational.
