/* Picture puzzle (StoryPuzzles kind 'picture'): copy the picture, on power-plant floor panels.
 * Every panel is off (dark) or on (lit). The player walks one tile per move, and stepping ONTO a panel
 * flips it (off to on, on to off). Walls block. The goal pattern is shown small beside the board
 * ("Make this!"). Solved when every panel matches the goal, and, if the grid has an exit, the player is
 * standing on it. Since each step flips a panel, the route matters: a panel you cross twice ends up
 * the way it started.
 *
 * Each panel's character holds both how it starts and how it must end, so the grid stays one board:
 *   #  wall     .  floor     P  start (floor)     E  exit (optional)
 *   o  panel, off, stays off          x  panel, on, stays on
 *   +  panel, off, must be turned on  -  panel, on, must be turned off
 * Example (walk right along the top panels to light them; the bottom row must stay as it is):
 *   [
 *     '#####',
 *     'P+++#',
 *     '#oxo#',
 *     '#####',
 *   ]
 *
 * Tile names for styles.css (under .pz-kind-picture): wall, floor, exit, panel-off, panel-on. The
 * picture uses the same names for the smallest box around the panels (walls and floor inside it too).
 */
(() => {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;
  const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const TILES = { '#': 'wall', '.': 'floor', o: 'panel', x: 'panel', '+': 'panel', '-': 'panel', P: 'floor', E: 'exit' };
  const PANELS = { o: [false, false], x: [true, true], '+': [false, true], '-': [true, false] };   // [now, goal]

  function parse(rows) {
    if (!rows.length || rows.some((row) => row.length !== rows[0].length)) throw new Error('Picture puzzle rows must all be the same length');
    let player = null;
    let exit = false;
    const panels = [];          // [{ r, c }] in reading order; `on` and `goal` are lists in that order
    const on = [];
    const goal = [];
    const index = rows.map((row) => Array(row.length).fill(-1));
    const grid = rows.map((row, r) => [...row].map((ch, c) => {
      if (!(ch in TILES)) throw new Error(`Picture puzzle: unknown tile "${ch}"`);
      if (ch in PANELS) {
        index[r][c] = panels.length;
        panels.push({ r, c });
        on.push(PANELS[ch][0]);
        goal.push(PANELS[ch][1]);
      }
      if (ch === 'P') {
        if (player) throw new Error('Picture puzzle needs exactly one P');
        player = { r, c };
      }
      if (ch === 'E') exit = true;
      return TILES[ch];
    }));
    if (!player) throw new Error('Picture puzzle needs a P');
    if (!panels.length) throw new Error('Picture puzzle needs panels');
    if (on.every((v, i) => v === goal[i])) throw new Error('Picture puzzle: nothing to change (use + or -)');
    return { grid, index, panels, goal, exit, player, on };
  }

  function move(state, dir) {
    const [dr, dc] = DIRS[dir];
    const r = state.player.r + dr;
    const c = state.player.c + dc;
    const tile = state.grid[r] && state.grid[r][c];
    if (!tile || tile === 'wall') return null;
    let on = state.on;
    const i = state.index[r][c];
    if (i >= 0) {
      on = on.slice();
      on[i] = !on[i];
    }
    return { ...state, player: { r, c }, on };
  }

  function solved(state) {
    if (state.exit && state.grid[state.player.r][state.player.c] !== 'exit') return false;
    return state.on.every((v, i) => v === state.goal[i]);
  }

  /** Tile names for a board, with each panel lit or dark from `bits`. */
  function tilesFor(state, bits) {
    return state.grid.map((row, r) => row.map((tile, c) => {
      const i = state.index[r][c];
      if (i < 0) return tile;
      return bits[i] ? 'panel-on' : 'panel-off';
    }));
  }

  function view(state) {
    const rs = state.panels.map((p) => p.r);
    const cs = state.panels.map((p) => p.c);
    const [r0, r1, c0, c1] = [Math.min(...rs), Math.max(...rs), Math.min(...cs), Math.max(...cs)];
    const picture = tilesFor(state, state.goal).slice(r0, r1 + 1).map((row) => row.slice(c0, c1 + 1));
    return { tiles: tilesFor(state, state.on), actors: [], picture };
  }

  function key(state) {
    return `${state.player.r},${state.player.c},${state.on.map((v) => (v ? 1 : 0)).join('')}`;
  }

  root.StoryPuzzles.register('picture', { parse, move, solved, view, key });
})();
