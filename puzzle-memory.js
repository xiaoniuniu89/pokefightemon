/* Puzzle kind "memory": a memory path. Some floor stones light up one at a time when the room starts;
 * step on them in the same order. See puzzles.js for the kind contract.
 *
 * Grid characters:
 *   #    rock wall
 *   .    cave floor (free to walk on)
 *   1-9  pattern stones, stepped on in this order (use 1..n with no gaps)
 *   o    decoy stone: looks the same, but it is never in the pattern
 *   P    where the player starts (floor)
 *
 * Rules: the player walks one tile per move. All stones look the same until they are found. Stepping on
 * the next stone in the pattern lights it for good ("done"); done stones are safe to walk on again.
 * Stepping on any other stone (a decoy, or a pattern stone out of order) sends the player back to P,
 * clears the progress and shows the pattern again (the returned state carries `flash`).
 * Solved when every pattern stone is done.
 *
 * Tile names for styles.css (under .pz-kind-memory): wall, floor, start, stone, stone-done. Flash frames
 * add `pz-mem-flash` to one stone at a time.
 */
(() => {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;
  const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const FLASH_MS = 650;

  /** Flash frames that light the pattern stones one at a time, in order. */
  function pattern(map) {
    return map.order.map((cell) => ({ cells: [cell], cls: 'pz-mem-flash', ms: FLASH_MS }));
  }

  /** Static map shared by every state: walls, stones (0 = decoy, n = nth in the pattern), start. */
  function parse(rows) {
    if (!rows.length || rows.some((row) => row.length !== rows[0].length)) {
      throw new Error('Memory puzzle rows must all be the same length');
    }
    let start = null;
    const found = [];
    const stones = rows.map((row, r) => [...row].map((ch, c) => {
      if (!'#.oP123456789'.includes(ch)) throw new Error(`Memory puzzle: unknown tile "${ch}" at ${r},${c}`);
      if (ch === 'P') {
        if (start) throw new Error('Memory puzzle needs exactly one P');
        start = { r, c };
      }
      if (ch >= '1' && ch <= '9') {
        const n = Number(ch);
        if (found[n - 1]) throw new Error(`Memory puzzle: stone ${n} appears twice`);
        found[n - 1] = { r, c };
        return n;
      }
      if (ch === 'o') return 0;
      return ch === '#' ? -1 : null;
    }));
    if (!start) throw new Error('Memory puzzle needs a P');
    if (!found.length) throw new Error('Memory puzzle needs pattern stones');
    for (let i = 0; i < found.length; i++) {
      if (!found[i]) throw new Error(`Memory puzzle: stone ${i + 1} is missing`);
    }
    const map = { stones, order: found, start, rows: rows.length, cols: rows[0].length };
    return { map, player: start, done: 0, flash: pattern(map) };
  }

  /** -1 wall (or off the grid), null floor, 0 decoy, n pattern stone. */
  function cell(map, r, c) {
    if (r < 0 || c < 0 || r >= map.rows || c >= map.cols) return -1;
    return map.stones[r][c];
  }

  function move(state, dir) {
    const [dr, dc] = DIRS[dir];
    const r = state.player.r + dr;
    const c = state.player.c + dc;
    const here = cell(state.map, r, c);
    if (here === -1) return null;
    const base = { map: state.map, player: { r, c }, done: state.done, flash: null };
    if (here === null || (here > 0 && here <= state.done)) return base;
    if (here === state.done + 1) return { ...base, done: state.done + 1 };
    // Wrong stone: back to the start, progress cleared, watch the pattern again.
    // jump: the player appears back at the start instead of sliding there through the walls.
    return { map: state.map, player: state.map.start, done: 0, flash: pattern(state.map), jump: true };
  }

  function solved(state) {
    return state.done === state.map.order.length;
  }

  function view(state) {
    const { map } = state;
    const tiles = map.stones.map((row, r) => row.map((v, c) => {
      if (v === -1) return 'wall';
      if (v === null) return r === map.start.r && c === map.start.c ? 'start' : 'floor';
      return v > 0 && v <= state.done ? 'stone-done' : 'stone';
    }));
    return { tiles, actors: [] };
  }

  function key(state) {
    return `${state.player.r},${state.player.c}|${state.done}`;
  }

  root.StoryPuzzles.register('memory', { parse, move, solved, view, key });
})();
