/* Story puzzle kind 'ice': the slippery ice floor from the Pokémon ice gyms (see puzzles.js for the kind contract).
 * A move slides you in that direction until the next tile is a rock or a hole (or the edge of the grid). Snow
 * is not slippery: landing on snow stops you, so on snow you walk one tile at a time. Reach the exit to solve it.
 * Cracked ice is slippery like ice, but it breaks once you leave it: slide over it, or stop on it and then
 * move off, and it turns into a hole. A hole blocks like a rock, so the order you cross the pond matters.
 *
 * Grid characters:
 *   #  rock (you can't go there; stops a slide)
 *   .  ice (you keep sliding)
 *   *  cracked ice (you keep sliding; it breaks into a hole when you leave it)
 *   _  snow (you stop on it)
 *   P  where you start (ice under your feet)
 *   E  the exit (you stop on it, and it solves the puzzle)
 *
 * The state is { player: { r, c }, grid, broken }; `grid` is the parsed tile rows, shared by every state (it
 * never changes), and `broken` is a sorted list of "r,c" strings for cracked tiles that are now holes.
 */
(() => {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;
  const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const TILES = { '#': 'rock', '.': 'ice', '*': 'cracked', _: 'snow', P: 'ice', E: 'exit' };
  const SLIPPERY = new Set(['ice', 'cracked']);

  function parse(rows) {
    let player = null;
    const grid = rows.map((row, r) => [...row].map((ch, c) => {
      if (!TILES[ch]) throw new Error(`Ice puzzle: unknown tile "${ch}" at ${r},${c}`);
      if (ch === 'P') {
        if (player) throw new Error('Ice puzzle: more than one start (P)');
        player = { r, c };
      }
      return TILES[ch];
    }));
    if (!player) throw new Error('Ice puzzle: no start (P)');
    if (!grid.some((row) => row.includes('exit'))) throw new Error('Ice puzzle: no exit (E)');
    if (grid.some((row) => row.length !== grid[0].length)) throw new Error('Ice puzzle: rows must be the same length');
    return { player, grid, broken: [] };
  }

  /** The tile at r, c as it is now: broken cracked ice is a hole, anything off the grid is rock. */
  function tileAt(state, r, c) {
    const t = (state.grid[r] && state.grid[r][c]) || 'rock';
    return t === 'cracked' && state.broken.includes(`${r},${c}`) ? 'hole' : t;
  }

  const blocks = (t) => t === 'rock' || t === 'hole';

  function move(state, dir) {
    const [dr, dc] = DIRS[dir];
    let { r, c } = state.player;
    const left = [];           // tiles stepped off during this move
    // Step until the next tile blocks, or we land on something that isn't slippery.
    while (!blocks(tileAt(state, r + dr, c + dc))) {
      left.push([r, c]);
      r += dr;
      c += dc;
      if (!SLIPPERY.has(tileAt(state, r, c))) break;
    }
    if (!left.length) return null;
    const cracked = left.filter(([lr, lc]) => state.grid[lr][lc] === 'cracked').map(([lr, lc]) => `${lr},${lc}`);
    const broken = cracked.length ? [...new Set([...state.broken, ...cracked])].sort() : state.broken;
    return { player: { r, c }, grid: state.grid, broken };
  }

  function solved(state) {
    return state.grid[state.player.r][state.player.c] === 'exit';
  }

  function view(state) {
    return { tiles: state.grid.map((row, r) => row.map((_, c) => tileAt(state, r, c))), actors: [] };
  }

  function key(state) {
    return `${state.player.r},${state.player.c}|${state.broken.join(';')}`;
  }

  root.StoryPuzzles.register('ice', { parse, move, solved, view, key });
})();
