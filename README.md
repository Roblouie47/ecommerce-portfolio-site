# T-Shirt Shop Demo

Run steps (Windows PowerShell):

```powershell
# 1. Install deps (already done once)
npm install

# 2. (Optional) create .env to override defaults
@"
ADMIN_TOKEN=changeme
PORT=3000
"@ | Out-File -Encoding UTF8 .env

# 3. Start
npm start

# If global `node` not on PATH, call portable:
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
