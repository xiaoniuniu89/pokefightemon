/* Puzzle kind "boulder": push Strength boulders onto the pads (a gentle Sokoban). See puzzles.js for the contract.
 *
 * Grid characters:
 *   #  rock wall
 *   .  cave floor
 *   O  boulder on floor
 *   x  pad (empty)
 *   X  boulder already on a pad
 *   P  where the player starts (floor)
 *   p  player starting on a pad
 *
 * Rules: the player walks one tile per move. Walking into a boulder pushes it one tile when the tile
 * beyond is floor or a pad with no boulder; otherwise nothing happens. Boulders can't be pulled.
 * Solved as soon as every pad has a boulder on it (there must be at least as many boulders as pads).
 */
(() => {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;
  const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

  /** Static map shared by every state of one puzzle: walls and pads never change. */
  function parse(rows) {
    const walls = [];
    const pads = [];
    const boulders = [];
    let player = null;
    rows.forEach((row, r) => {
      if (row.length !== rows[0].length) throw new Error('Boulder puzzle rows must all be the same length');
      walls.push([...row].map((ch, c) => {
        if (!'#.OxXPp'.includes(ch)) throw new Error(`Boulder puzzle: unknown tile "${ch}"`);
        if (ch === 'x' || ch === 'X' || ch === 'p') pads.push({ r, c });
        if (ch === 'O' || ch === 'X') boulders.push({ r, c });
        if (ch === 'P' || ch === 'p') {
          if (player) throw new Error('Boulder puzzle needs exactly one P');
          player = { r, c };
        }
        return ch === '#';
      }));
    });
    if (!player) throw new Error('Boulder puzzle needs a P');
    if (!pads.length || boulders.length < pads.length) throw new Error('Boulder puzzle needs pads and enough boulders');
    const padSet = new Set(pads.map((p) => `${p.r},${p.c}`));
    const map = { walls, pads, padSet, rows: rows.length, cols: rows[0].length };
    return { map, player, boulders };
  }

  function isWall(map, r, c) {
    return r < 0 || c < 0 || r >= map.rows || c >= map.cols || map.walls[r][c];
  }

  function boulderAt(state, r, c) {
    return state.boulders.findIndex((b) => b.r === r && b.c === c);
  }

  function move(state, dir) {
    const [dr, dc] = DIRS[dir];
    const r = state.player.r + dr;
    const c = state.player.c + dc;
    if (isWall(state.map, r, c)) return null;
    const hit = boulderAt(state, r, c);
    if (hit < 0) return { ...state, player: { r, c } };
    const br = r + dr;
    const bc = c + dc;
    if (isWall(state.map, br, bc) || boulderAt(state, br, bc) >= 0) return null;
    const boulders = state.boulders.map((b, i) => (i === hit ? { r: br, c: bc } : b));
    return { ...state, player: { r, c }, boulders };
  }

  function solved(state) {
    return state.map.pads.every((p) => boulderAt(state, p.r, p.c) >= 0);
  }

  function view(state) {
    const { map } = state;
    const tiles = map.walls.map((row, r) => row.map((wall, c) => {
      if (wall) return 'wall';
      if (!map.padSet.has(`${r},${c}`)) return 'floor';
      return boulderAt(state, r, c) >= 0 ? 'pad-on' : 'pad';
    }));
    const actors = state.boulders.map((b, i) => ({
      key: `b${i}`,
      r: b.r,
      c: b.c,
      cls: map.padSet.has(`${b.r},${b.c}`) ? 'pz-boulder pz-boulder-on' : 'pz-boulder',
    }));
    return { tiles, actors };
  }

  /** Boulders are interchangeable for solving, so sort them. */
  function key(state) {
    const b = state.boulders.map((p) => p.r * 100 + p.c).sort((x, y) => x - y);
    return `${state.player.r},${state.player.c}|${b.join(',')}`;
  }

  root.StoryPuzzles.register('boulder', { parse, move, solved, view, key });
})();
