// Upstash Redis over its REST API (plain fetch, no packages), shared by api/saves.js and api/scores.js.
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

/** HGETALL as an object of parsed JSON values. */
async function hgetallJson(key) {
  const flat = (await redis('HGETALL', key)) || [];
  const out = {};
  for (let i = 0; i < flat.length; i += 2) out[flat[i]] = JSON.parse(flat[i + 1]);
  return out;
}

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  if (body === undefined) return res.status(status).end();
  return res.status(status).json(body);
}

module.exports = { redis, hgetallJson, send, configured: Boolean(REDIS_URL && REDIS_TOKEN) };
