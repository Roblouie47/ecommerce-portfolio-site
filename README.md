# T-Shirt Shop Demo

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
$env:ADMIN_TOKEN="changeme"; .\node-portable\node.exe .\server.js
```

Open http://localhost:3000/ then hard refresh (Ctrl+F5) if assets cached.

Important endpoints:

- GET /api/health
- GET /api/meta
- GET /api/products

Admin calls require header `X-Admin-Token: <token>` matching ADMIN_TOKEN.

Troubleshooting:

1. If 404 on /api/meta ensure server restarted after latest code (see console banner).
2. If `better-sqlite3` load error, remove `node_modules` and reinstall with the SAME Node version, then `npm rebuild better-sqlite3` only if needed.
3. Confirm DB file created at `data/shop.db`.

Logs show a banner with DB path and counts at startup.

## Environment configuration & secrets

- `.env` is git-ignored; never commit local secrets. Copy `.env.example` when you need local overrides.
- On Render.com, set every secret in the **Environment** tab instead of baking them into files. Required keys: `ADMIN_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `SESSION_SECRET`, `JWT_SECRET`, `SMTP_*`, `EMAIL_*`, `STRIPE_*`, `PUBLIC_URL`, and any optional `ADMIN_ALLOWED_IPS` list.
- Rotate `ADMIN_TOKEN`, `SESSION_SECRET`, and `JWT_SECRET` if the repo was shared previously.
- Prefer Render's Secret Files only when a multiline credential is required; otherwise plain env vars keep deployments simple.
- To restrict admin APIs by IP, set `ADMIN_ALLOWED_IPS` to a comma-separated list (e.g., `203.0.113.10,198.51.100.2`). The server trusts Render's proxy headers via `app.set('trust proxy', true)`.
- Admin login now issues short-lived session tokens. The client still sends them via the `X-Admin-Token` header, but the value is unique per login and expires automatically; keeping `ADMIN_TOKEN` configured allows a break-glass static token if needed.
- `/api/admin/login` is rate-limited in-memory (5 attempts per 5 minutes per email/IP, 10-minute lockout) to slow credential stuffing; you can lift the lock by restarting the server if needed during dev.
- Admin browser sessions persist via localStorage but also track expiry timestamps; when the backend rotates tokens (12h TTL), the UI auto-removes the token on expiry or on HTTP 401 responses.
