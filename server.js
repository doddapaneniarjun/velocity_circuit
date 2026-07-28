// Velocity Circuit — tiny accounts backend
//
// Replaces the Supabase REST + Realtime calls the game used to make with a
// small self-hosted server: plain REST endpoints backed by a JSON file, plus
// a WebSocket that pushes every account change out to connected clients
// (this is what makes owner commands like +coins/rename/delete arrive
// instantly instead of only at next login).
//
// Run locally:
//   npm install
//   npm start
//
// Env vars (all optional):
//   PORT           - defaults to 3000
//   API_KEY        - if set, every write (POST) must include header
//                     'x-api-key: <value>'. Reads stay public either way,
//                     same as the old Supabase publishable key setup.
//   ALLOWED_ORIGIN - CORS origin to allow (defaults to '*')

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const DB_PATH = path.join(__dirname, 'accounts.json');

/* ---------- tiny JSON "database" ----------
   One row per account, keyed by lowercase username (name_key), mirroring the
   shape the game already expects:
     { name_key, display, hash, is_owner, coins, rating, deleted, pending_cmds }
   Good enough for a small multiplayer game. If this ever needs to survive
   heavier concurrent writes, swap loadDB/saveDB for a real embedded DB
   (e.g. better-sqlite3) without touching any of the routes below. */
function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    return {};
  }
}
function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
let db = loadDB(); // { [name_key]: row }

// ---------- app ----------
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function requireKey(req, res, next) {
  if (!API_KEY) return next(); // no key configured — writes are open
  if (req.get('x-api-key') !== API_KEY) {
    return res.status(401).json({ error: 'invalid or missing x-api-key' });
  }
  next();
}

// All accounts (used by "Manage Players").
app.get('/api/accounts', (req, res) => {
  res.json(Object.values(db));
});

// One account by name_key, or 404 if it doesn't exist yet.
app.get('/api/accounts/:nameKey', (req, res) => {
  const row = db[req.params.nameKey];
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

// Upsert: merges the posted fields into the existing row (or creates one).
// Broadcasts the resulting row to every connected client over the WebSocket.
app.post('/api/accounts/:nameKey', requireKey, (req, res) => {
  const nameKey = req.params.nameKey;
  const existing = db[nameKey] || { name_key: nameKey };
  const updated = Object.assign({}, existing, req.body, {
    name_key: nameKey,
    updated_at: Date.now(),
  });
  db[nameKey] = updated;
  saveDB(db);
  broadcast({ type: 'account_update', row: updated });
  res.json(updated);
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });
}

// Clients only ever listen — there's no inbound message protocol to handle.
wss.on('connection', () => {});

server.listen(PORT, () => {
  console.log('Velocity Circuit backend listening on port ' + PORT);
});
