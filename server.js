// Minimal static file server for the Pokédex, plus a tiny JSON save database. No dependencies.
// Usage: node server.js [port]   (default 8080, or PORT env var)
//
// Save API (story mode save slots, stored in data/saves.json):
//   GET    /api/saves        -> [{ id, updated, state }], newest first
//   GET    /api/saves/:id    -> { id, updated, state }
//   PUT    /api/saves/:id    body: story state JSON -> { id, updated }
//   DELETE /api/saves/:id    -> 204
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const DB_FILE = path.join(ROOT, 'data', 'saves.json');
const MAX_BODY = 64 * 1024;      // a story state is ~1 KB; anything this big is not a save
const MAX_SAVES = 50;
const SAVE_ID = /^[a-z0-9-]{1,40}$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

// ---------- JSON database ----------
// The whole file is held in memory and rewritten on every change. Writes go to a temp
// file first and are renamed into place, so a crash mid-write never corrupts the file.
let db = null;
let writing = Promise.resolve();

function loadDb() {
  if (db) return db;
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db = parsed && typeof parsed.saves === 'object' ? parsed : { saves: {} };
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`Could not read ${DB_FILE}, starting empty: ${err.message}`);
    db = { saves: {} };
  }
  return db;
}

function persist() {
  const snapshot = JSON.stringify(db, null, 2);
  writing = writing.then(async () => {
    await fs.promises.mkdir(path.dirname(DB_FILE), { recursive: true });
    const tmp = `${DB_FILE}.tmp`;
    await fs.promises.writeFile(tmp, snapshot);
    await fs.promises.rename(tmp, DB_FILE);
  }).catch((err) => console.error(`Failed to write ${DB_FILE}: ${err.message}`));
  return writing;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    // Past the limit the rest is read and discarded, so the client still gets a 413 reply.
    req.on('data', (c) => {
      size += c.length;
      if (size <= MAX_BODY) chunks.push(c);
    });
    req.on('end', () => {
      if (size > MAX_BODY) reject(Object.assign(new Error('Save too large'), { status: 413 }));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, urlPath) {
  const saves = loadDb().saves;
  const id = urlPath.slice('/api/saves'.length).replace(/^\//, '');

  if (!id) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
    const list = Object.values(saves).sort((a, b) => b.updated.localeCompare(a.updated));
    return sendJson(res, 200, list);
  }
  if (!SAVE_ID.test(id)) return sendJson(res, 400, { error: 'Bad save id' });

  if (req.method === 'GET') {
    return saves[id] ? sendJson(res, 200, saves[id]) : sendJson(res, 404, { error: 'No such save' });
  }
  if (req.method === 'PUT') {
    if (!saves[id] && Object.keys(saves).length >= MAX_SAVES) {
      return sendJson(res, 409, { error: `Save limit (${MAX_SAVES}) reached, delete one first` });
    }
    let state;
    try {
      state = JSON.parse(await readBody(req));
    } catch (err) {
      return sendJson(res, err.status || 400, { error: err.status ? err.message : 'Body must be JSON' });
    }
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return sendJson(res, 400, { error: 'Save must be a JSON object' });
    }
    const updated = new Date().toISOString();
    saves[id] = { id, updated, state };
    await persist();
    return sendJson(res, 200, { id, updated });
  }
  if (req.method === 'DELETE') {
    if (saves[id]) {
      delete saves[id];
      await persist();
    }
    return sendJson(res, 204);
  }
  return sendJson(res, 405, { error: 'Method not allowed' });
}

// ---------- Static files ----------
function serveStatic(req, res, urlPath) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(ROOT, safePath === '/' ? 'index.html' : safePath);

  // Prevent escaping the project root, and keep the save database private to the API.
  if (!filePath.startsWith(ROOT) || filePath.startsWith(path.dirname(DB_FILE) + path.sep)) {
    res.writeHead(403); return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not found');
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  });
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400); return res.end('Bad request');
  }
  if (urlPath === '/api/saves' || urlPath.startsWith('/api/saves/')) {
    handleApi(req, res, urlPath).catch((err) => {
      console.error(err);
      sendJson(res, 500, { error: 'Server error' });
    });
    return;
  }
  serveStatic(req, res, urlPath);
});

server.listen(PORT, () => {
  console.log(`Pokédex running at http://localhost:${PORT}`);
});
