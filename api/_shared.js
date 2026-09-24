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

module.exports = { INVITE_HASH, SAVE_ID, MAX_BODY, MAX_SAVES, playerKey, whoIsAsking };
