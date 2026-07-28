# Velocity Circuit backend

A tiny replacement for the Supabase table the game used to talk to. It's one
Node file: an Express REST API for accounts, backed by a JSON file
(`accounts.json`, created automatically), plus a WebSocket that pushes every
account change out to connected browsers so owner commands still arrive
instantly.

## Run it locally

```bash
npm install
npm start
```

This starts the server on `http://localhost:3000` (REST) and
`ws://localhost:3000/ws` (WebSocket). `accounts.json` is created next to
`server.js` the first time someone logs in or an account is written.

## API

- `GET /api/accounts` — every account row (used by "Manage Players")
- `GET /api/accounts/:nameKey` — one account, 404 if it doesn't exist
- `POST /api/accounts/:nameKey` — merge-upsert; body is a partial row, e.g.
  `{ "coins": 500, "rating": 3 }`. Broadcasts the updated row to every
  connected WebSocket client.
- `GET /api/health` — returns `{ ok: true }`, useful for uptime checks

## Deploying it somewhere public

The game is a static HTML file, so it needs this server reachable over the
internet (plain `http://localhost` only works while you're testing on your
own machine). Any small Node host works — for example:

- **Render** (render.com) — "New Web Service", point it at this folder,
  build command `npm install`, start command `npm start`. Free tier is fine
  for a small game.
- **Railway** (railway.app) — similar one-click deploy from a repo or folder.
- **Fly.io** — `fly launch` in this folder, it detects the Node app.
- Any VPS you already have — `npm install && npm start` behind a reverse
  proxy (e.g. Caddy or nginx) for HTTPS.

Whichever you pick, once it's deployed you'll get a public URL like
`https://your-app.onrender.com`. You'll need:

- `https://your-app.onrender.com` as `API_BASE` in the game
- `wss://your-app.onrender.com/ws` as `WS_URL` in the game (note `wss://`,
  not `ws://`, once you're on HTTPS)

## Optional: a write key

By default anyone who can reach the server can write account data — the
same trust model the old Supabase *publishable* key had (it was public in
the client too). If you want a light gate on writes, set an `API_KEY`
environment variable on the host, and put the same value in the game's
`API_KEY` constant — it gets sent as the `x-api-key` header on every write.
It's still visible to anyone who opens the browser dev tools (same caveat as
before), so treat it as a speed bump, not real security.

## Persistence note

`accounts.json` is a flat file — simple and fine for a small game with a
handful of players. It is NOT safe for heavy concurrent writes from many
processes. If this ever needs to scale up, swap `loadDB`/`saveDB` in
`server.js` for a real embedded database (`better-sqlite3` is a drop-in
choice) without touching any of the routes.

**Back it up** if the data matters to you — most hosts' free tiers use
ephemeral disks, meaning `accounts.json` can be wiped on redeploy. If you
stay on a free tier long-term, consider mounting a persistent volume (Render
and Railway both offer this) or periodically downloading `accounts.json`.
