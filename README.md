# T-Shirt Shop Demo

An e-commerce portfolio project for a modern T-shirt shop. This project demonstrates a full-stack web application using vanilla JavaScript, Node.js, and SQLite. It features a modular, maintainable codebase suitable for both learning and production use.

## Features

- Product catalog with images, tags, and inventory
- Shopping cart and favorites
- Customer registration and order history
- Admin dashboard for product and order management
- PayMongo payments integration
- Country and currency selector
- Responsive, accessible UI
- Modular vanilla JS frontend (no frameworks)
- RESTful API backend with Node.js and Express
- SQLite database (using better-sqlite3)

## Tech Stack

- **Frontend:** HTML, CSS, Vanilla JavaScript (ES Modules)
- **Backend:** Node.js, Express.js
- **Database:** SQLite (better-sqlite3)
- **Payments:** PayMongo

## Folder Structure

```
├── public/           # Frontend assets (HTML, CSS, JS, images)
│   ├── js/           # Modular JS (api, auth, components, pages, router, state, utils)
│   └── ...
├── src/              # Backend source (config, db, middleware, routes, utils)
├── data/             # SQLite database file
├── scripts/          # Utility scripts
├── node-portable/    # Bundled Node.js for portable deployment
├── server.js         # Main server entry point
├── package.json      # NPM dependencies and scripts
└── README.md         # Project documentation
```

## Getting Started

Run steps (Windows PowerShell):

```powershell
# 1. Install deps (already done once)
npm install

# 2. (Optional) copy .env.example to .env for local-only overrides
Copy-Item .env.example .env

# 3. Start (regular Node)
npm start

# 3b. Start with bundled portable Node (Windows)
npm run server:portable
# or manually, if you need to pass env vars inline:
$env:ADMIN_EMAIL="admin@example.com"; $env:ADMIN_PASSWORD="your-strong-password"; .\node-portable\node.exe .\server.js
```

Open http://localhost:3000/ then hard refresh (Ctrl+F5) if assets cached.

## API Endpoints

Important endpoints:

- GET /api/health
- GET /api/meta
- GET /api/products

Admin calls require an authenticated admin session (use `/api/admin/login`). Sessions are cookie-based.

## Troubleshooting

1. If 404 on /api/meta ensure server restarted after latest code (see console banner).
2. If `better-sqlite3` load error, remove `node_modules` and reinstall with the SAME Node version, then `npm rebuild better-sqlite3` only if needed.
3. Confirm DB file created at `data/shop.db`.

Logs show a banner with DB path and counts at startup.

## Environment Configuration & Secrets

- `.env` is git-ignored; never commit local secrets. Copy `.env.example` when you need local overrides.
- On Render.com, set every secret in the **Environment** tab instead of baking them into files. Required keys: `ADMIN_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `SESSION_SECRET`, `JWT_SECRET`, `SMTP_*`, `EMAIL_*`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, `PUBLIC_URL`, and any optional `ADMIN_ALLOWED_IPS` list.
- Rotate `ADMIN_TOKEN`, `SESSION_SECRET`, and `JWT_SECRET` if the repo was shared previously.
- Prefer Render's Secret Files only when a multiline credential is required; otherwise plain env vars keep deployments simple.
- To restrict admin APIs by IP, set `ADMIN_ALLOWED_IPS` to a comma-separated list (e.g., `203.0.113.10,198.51.100.2`). Configure `TRUST_PROXY` only when running behind a trusted reverse proxy.
- Admin login issues short-lived, httpOnly cookie sessions; the client does not store tokens locally.
- `/api/admin/login` is rate-limited in-memory (5 attempts per 5 minutes per email/IP, 10-minute lockout) to slow credential stuffing; you can lift the lock by restarting the server if needed during dev.

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -am 'Add new feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a pull request

## License

This project is for portfolio and educational use. For commercial use, please contact the author.

Run steps (Windows PowerShell):

```powershell
# 1. Install deps (already done once)
npm install

# 2. (Optional) copy .env.example to .env for local-only overrides
Copy-Item .env.example .env

# 3. Start (regular Node)
npm start

# 3b. Start with bundled portable Node (Windows)
npm run server:portable
# or manually, if you need to pass env vars inline:
$env:ADMIN_EMAIL="admin@example.com"; $env:ADMIN_PASSWORD="your-strong-password"; .\node-portable\node.exe .\server.js
```

Open http://localhost:3000/ then hard refresh (Ctrl+F5) if assets cached.

Important endpoints:

- GET /api/health
- GET /api/meta
- GET /api/products

Admin calls require an authenticated admin session (use `/api/admin/login`). Sessions are cookie-based.

Troubleshooting:

1. If 404 on /api/meta ensure server restarted after latest code (see console banner).
2. If `better-sqlite3` load error, remove `node_modules` and reinstall with the SAME Node version, then `npm rebuild better-sqlite3` only if needed.
3. Confirm DB file created at `data/shop.db`.

Logs show a banner with DB path and counts at startup.

## Environment configuration & secrets

- `.env` is git-ignored; never commit local secrets. Copy `.env.example` when you need local overrides.
- On Render.com, set every secret in the **Environment** tab instead of baking them into files. Required keys: `ADMIN_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `SESSION_SECRET`, `JWT_SECRET`, `SMTP_*`, `EMAIL_*`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, `PUBLIC_URL`, and any optional `ADMIN_ALLOWED_IPS` list.
- Rotate `ADMIN_TOKEN`, `SESSION_SECRET`, and `JWT_SECRET` if the repo was shared previously.
- Prefer Render's Secret Files only when a multiline credential is required; otherwise plain env vars keep deployments simple.
- To restrict admin APIs by IP, set `ADMIN_ALLOWED_IPS` to a comma-separated list (e.g., `203.0.113.10,198.51.100.2`). Configure `TRUST_PROXY` only when running behind a trusted reverse proxy.
- Admin login issues short-lived, httpOnly cookie sessions; the client does not store tokens locally.
- `/api/admin/login` is rate-limited in-memory (5 attempts per 5 minutes per email/IP, 10-minute lockout) to slow credential stuffing; you can lift the lock by restarting the server if needed during dev.
