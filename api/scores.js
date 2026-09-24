// Vercel function for puzzle high scores, in Upstash Redis. Same API as server.js:
//   GET  /api/scores?puzzle=ch4:rockfall   -> { moves: [{ name, moves }], time: [{ name, ms }], mine }
//   POST /api/scores  body { puzzle, moves, ms } -> the same, plus { newMoves, newTime }
// Each puzzle is one Redis hash, "scores:<puzzle>", with a field per player holding their best.
const { MAX_BODY, PUZZLE_ID, whoIsAsking, checkScore, mergeBest, leaderboard } = require('./_shared');
const { redis, hgetallJson, send, configured } = require('./_redis');

module.exports = async (req, res) => {
  if (!configured) return send(res, 500, { error: 'Save database is not set up' });
  const who = whoIsAsking(req.headers);
  if (who.error) return send(res, who.status, { error: who.error });

  try {
    if (req.method === 'GET') {
      const puzzle = typeof req.query.puzzle === 'string' ? req.query.puzzle : '';
      if (!PUZZLE_ID.test(puzzle)) return send(res, 400, { error: 'Bad puzzle id' });
      return send(res, 200, leaderboard(await hgetallJson(`scores:${puzzle}`), who.owner));
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      if (JSON.stringify(body).length > MAX_BODY) return send(res, 413, { error: 'Too large' });
      if (!PUZZLE_ID.test(body.puzzle || '')) return send(res, 400, { error: 'Bad puzzle id' });
      const score = checkScore(body);
      if (score.error) return send(res, 400, { error: score.error });
      const key = `scores:${body.puzzle}`;
      const raw = await redis('HGET', key, who.owner);
      const { best, newMoves, newTime } = mergeBest(raw ? JSON.parse(raw) : null, score);
      if (newMoves || newTime) await redis('HSET', key, who.owner, JSON.stringify(best));
      const all = await hgetallJson(key);
      return send(res, 200, { ...leaderboard(all, who.owner), newMoves, newTime });
    }
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: 'Server error' });
  }
};
