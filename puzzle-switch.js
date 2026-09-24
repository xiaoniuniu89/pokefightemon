/* Switch puzzle (StoryPuzzles kind 'switch'): colour switches and gates, like in a Zelda dungeon.
 * The player walks one tile per move. There are red gates and blue gates, and only one colour is open
 * at a time (red starts open). Stepping ONTO a switch swaps which colour is open. Closed gates block
 * like walls. Only switches swap the gates and a switch is never a gate, so a gate never closes on the
 * player. Reaching the exit solves it.
 *
 * Grid characters:
 *   #  wall            .  floor
 *   r  red gate        b  blue gate       (red is open at the start, blue is closed)
 *   S  switch          P  start (floor)   E  exit
 *
 * Tile names for styles.css (under .pz-kind-switch): wall, floor, exit, red-open, red-closed,
 * blue-open, blue-closed, switch-red (red is open now), switch-blue (blue is open now).
 */
(() => {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;
  const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const TILES = { '#': 'wall', '.': 'floor', r: 'red', b: 'blue', S: 'switch', P: 'floor', E: 'exit' };

  function parse(rows) {
    if (!rows.length || rows.some((row) => row.length !== rows[0].length)) throw new Error('Switch puzzle rows must all be the same length');
    let player = null;
    let exits = 0;
    const grid = rows.map((row, r) => [...row].map((ch, c) => {
      if (!(ch in TILES)) throw new Error(`Switch puzzle: unknown tile "${ch}"`);
      if (ch === 'P') {
        if (player) throw new Error('Switch puzzle needs exactly one P');
        player = { r, c };
      }
      if (ch === 'E') exits += 1;
      return TILES[ch];
    }));
    if (!player) throw new Error('Switch puzzle needs a P');
    if (!exits) throw new Error('Switch puzzle needs an E');
    return { grid, player, redOpen: true };
  }

  /** Can the player stand on this tile right now? */
  function open(state, tile) {
    if (tile === 'wall' || tile == null) return false;
    if (tile === 'red') return state.redOpen;
    if (tile === 'blue') return !state.redOpen;
    return true;
  }

  function move(state, dir) {
    const [dr, dc] = DIRS[dir];
    const r = state.player.r + dr;
    const c = state.player.c + dc;
    const tile = state.grid[r] && state.grid[r][c];
    if (!open(state, tile)) return null;
    return {
      grid: state.grid,
      player: { r, c },
      redOpen: tile === 'switch' ? !state.redOpen : state.redOpen,
    };
  }

  function solved(state) {
    return state.grid[state.player.r][state.player.c] === 'exit';
  }

  function view(state) {
    const now = state.redOpen ? 'red' : 'blue';
    const tiles = state.grid.map((row) => row.map((tile) => {
      if (tile === 'red') return state.redOpen ? 'red-open' : 'red-closed';
      if (tile === 'blue') return state.redOpen ? 'blue-closed' : 'blue-open';
      if (tile === 'switch') return `switch-${now}`;
      return tile;
    }));
    return { tiles, actors: [] };
  }

  function key(state) {
    return `${state.player.r},${state.player.c},${state.redOpen ? 'r' : 'b'}`;
  }

  root.StoryPuzzles.register('switch', { parse, move, solved, view, key });
})();
