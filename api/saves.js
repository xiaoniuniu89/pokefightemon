// Vercel function for story saves, backed by Upstash Redis over its REST API (plain fetch, no packages).
// Same API as server.js:
//   GET    /api/saves        -> [{ id, updated, owner, state }] for this player, newest first
//   GET    /api/saves/:id    -> { id, updated, owner, state }
//   PUT    /api/saves/:id    body: story state JSON -> { id, updated }
//   DELETE /api/saves/:id    -> 204
// vercel.json rewrites /api/saves/:id to /api/saves?id=:id.
// Each player's saves live in one Redis hash, "saves:<player>", so the Upstash data browser
// shows which kid owns which saves.
const { SAVE_ID, MAX_BODY, MAX_SAVES, whoIsAsking } = require('./_shared');

// Set by the Upstash integration in Vercel (older setups use the KV_ names).
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(...command) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error || `Redis ${r.status}`);
  return data.result;
}

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  if (body === undefined) return res.status(status).end();
  return res.status(status).json(body);
}

module.exports = async (req, res) => {
  if (!REDIS_URL || !REDIS_TOKEN) return send(res, 500, { error: 'Save database is not set up' });
  const who = whoIsAsking(req.headers);
  if (who.error) return send(res, who.status, { error: who.error });
  const key = `saves:${who.owner}`;
  const id = typeof req.query.id === 'string' ? req.query.id : '';

  try {
    if (!id) {
      if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
      const flat = (await redis('HGETALL', key)) || [];
      const list = [];
      for (let i = 1; i < flat.length; i += 2) list.push(JSON.parse(flat[i]));
      list.sort((a, b) => b.updated.localeCompare(a.updated));
      return send(res, 200, list);
    }
    if (!SAVE_ID.test(id)) return send(res, 400, { error: 'Bad save id' });

    if (req.method === 'GET') {
      const raw = await redis('HGET', key, id);
      return raw ? send(res, 200, JSON.parse(raw)) : send(res, 404, { error: 'No such save' });
    }
    if (req.method === 'PUT') {
      const state = req.body;
      if (!state || typeof state !== 'object' || Array.isArray(state)) {
        return send(res, 400, { error: 'Save must be a JSON object' });
      }
      const updated = new Date().toISOString();
      const entry = JSON.stringify({ id, updated, owner: who.owner, state });
      if (entry.length > MAX_BODY) return send(res, 413, { error: 'Save too large' });
      if (!(await redis('HEXISTS', key, id)) && (await redis('HLEN', key)) >= MAX_SAVES) {
        return send(res, 409, { error: `Save limit (${MAX_SAVES}) reached, delete one first` });
      }
      await redis('HSET', key, id, entry);
      return send(res, 200, { id, updated });
    }
    if (req.method === 'DELETE') {
      await redis('HDEL', key, id);
      return send(res, 204);
    }
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: 'Server error' });
  }
};
