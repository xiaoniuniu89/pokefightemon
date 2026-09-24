// Shared by the Vercel function (api/saves.js) and the local server (server.js).
// Files starting with "_" in api/ are not deployed as their own endpoints.
//
// Every save request carries two headers, set by story.js after the invite questions:
//   X-Invite: SHA-256 of "pokefightemon:<who made it>:<his kid>" (answers lowercased, letters only)
//   X-Player: the kid's name, URI-encoded. Saves are stored and listed per player.
// This is a friendly keep-out for the street, not real security: the hash is in story.js too.

const INVITE_HASH = 'dac1a698916a962b46c633bcc77f8b0aba2bd7fc10a26689c0ce7e98b84072c2';
const SAVE_ID = /^[a-z0-9-]{1,40}$/;
const MAX_BODY = 64 * 1024;   // a story state is ~1 KB; anything this big is not a save
const MAX_SAVES = 20;         // per player

/** "  Isaac  " -> "isaac". Letters, digits, spaces and dashes only, max 20 characters. */
function playerKey(raw) {
  let name = '';
  try { name = decodeURIComponent(raw || ''); } catch { /* bad encoding */ }
  return name.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20);
}

/** Checks the two headers. Returns { owner, name } or { status, error }. */
function whoIsAsking(headers) {
  if (headers['x-invite'] !== INVITE_HASH) return { status: 401, error: 'Not invited' };
  const owner = playerKey(headers['x-player']);
  if (!owner) return { status: 400, error: 'Missing player name' };
  return { owner };
}

// ---------- Puzzle high scores ----------
// Each player keeps a best per puzzle: fewest moves and fastest time, tracked separately.
// Scores are shared: everyone who got past the invite questions sees the top names.
const PUZZLE_ID = /^[a-z0-9-]{1,20}:[a-zA-Z0-9-]{1,40}$/;   // "<chapter id>:<scene id>", e.g. "ch4:rockfall"
const TOP = 5;

/** Checks a posted score. Returns { moves, ms } or { error }. A move takes at least ~90 ms to play. */
function checkScore(body) {
  const moves = body && body.moves;
  const ms = body && body.ms;
  if (!Number.isInteger(moves) || moves < 1 || moves > 5000) return { error: 'Bad move count' };
  if (!Number.isInteger(ms) || ms < moves * 80 || ms > 60 * 60 * 1000) return { error: 'Bad time' };
  return { moves, ms };
}

/** Keeps the better of each. Returns { best, newMoves, newTime }. */
function mergeBest(old, score) {
  const newMoves = !old || score.moves < old.moves;
  const newTime = !old || score.ms < old.ms;
  const best = {
    moves: newMoves ? score.moves : old.moves,
    ms: newTime ? score.ms : old.ms,
    at: new Date().toISOString(),
  };
  return { best, newMoves, newTime };
}

/** { owner: best } -> the top names for moves and time, plus the asker's own best. */
function leaderboard(all, owner) {
  const rows = Object.entries(all).map(([name, b]) => ({ name, moves: b.moves, ms: b.ms }));
  return {
    moves: [...rows].sort((a, b) => a.moves - b.moves || a.ms - b.ms).slice(0, TOP).map(({ name, moves }) => ({ name, moves })),
    time: [...rows].sort((a, b) => a.ms - b.ms || a.moves - b.moves).slice(0, TOP).map(({ name, ms }) => ({ name, ms })),
    mine: all[owner] ? { moves: all[owner].moves, ms: all[owner].ms } : null,
  };
}

module.exports = {
  INVITE_HASH, SAVE_ID, MAX_BODY, MAX_SAVES, PUZZLE_ID, playerKey, whoIsAsking, checkScore, mergeBest, leaderboard,
};
