/* Story puzzles: small grid puzzles that break up the battles (window.StoryPuzzles).
 * This file is the shared core: rooms, the timer, board drawing, controls (buttons, arrow keys, swipes),
 * reset, hints and skip. Each puzzle kind lives in its own file (puzzle-ice.js, puzzle-boulder.js, …) and
 * calls StoryPuzzles.register(name, kind). story.js runs a scene's `puzzle` prompt through run().
 *
 * A kind is plain logic, no DOM:
 *   parse(rows)      rows is a list of equal-length strings (one character per tile). Returns the start
 *                    state, which must have `player: { r, c }`. Throw on a bad grid.
 *   move(state, dir) dir is 'up' | 'down' | 'left' | 'right'. Returns the next state (a new object, never
 *                    changing `state`), or null when nothing happens (walking into a wall)
 *   solved(state)    true when the room is done
 *   view(state)      { tiles, actors, picture }: tiles is rows of tile names (drawn as `.pz-tile.pz-<name>`,
 *                    style them under `.pz-kind-<kind>`), actors is a list of { key, r, c, cls } for things
 *                    that move (boulders); the same key in the next state slides smoothly. The player is
 *                    drawn by the core, don't list it. `picture` (optional) is rows of tile names shown small
 *                    beside the board with "Make this!" (for copy-the-picture puzzles)
 *   key(state)       optional, a string that identifies a state for solve() (defaults to JSON). Leave
 *                    `flash` out of it
 *   Jumps: a state from move may carry `jump: true` to put the player on its tile at once instead of
 *   sliding there (sent back to the start). Leave it out of `key` too.
 *   Flashes: a state (from parse or move) may carry `flash: [{ cells: [{ r, c }], cls, ms }]`. The core
 *   plays the frames in order after drawing that state (adding `cls` to those tiles for `ms`, input
 *   locked, the timer paused), then drops `flash`. Use it to show a pattern to remember.
 *
 * A puzzle is a list of rooms, [{ puzzle: kind, grid: rows, text? }], played in order. `time` (seconds,
 * optional) covers all the rooms: when it runs out you go back to room 1 with a full clock.
 * "Start again" restarts the room you're in (the clock keeps going).
 *
 * Works in Node too (no DOM needed for register/solve), so levels can be checked with a script:
 *   globalThis.window = globalThis; require('./puzzles.js'); require('./puzzle-ice.js');
 *   StoryPuzzles.solve('ice', rows)  // fewest moves, or -1 when it can't be solved
 */
(() => {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;
  const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
  };
  const STEP_MS = 90;          // slide time per tile
  const TICK = 100;
  const kinds = {};
  let active = null;           // finish() of the room in play, so a new one can cancel it

  function register(name, kind) {
    kinds[name] = kind;
  }

  /** Fewest moves to solve, or -1 when it can't be done within `limit` states (breadth-first). */
  function solve(name, rows, limit = 200000) {
    const kind = kinds[name];
    const key = kind.key || JSON.stringify;
    const start = kind.parse(rows);
    if (kind.solved(start)) return 0;
    const seen = new Set([key(start)]);
    let frontier = [start];
    for (let depth = 1; frontier.length && seen.size < limit; depth++) {
      const next = [];
      for (const st of frontier) {
        for (const dir of Object.keys(DIRS)) {
          const to = kind.move(st, dir);
          if (!to) continue;
          const k = key(to);
          if (seen.has(k)) continue;
          if (kind.solved(to)) return depth;
          seen.add(k);
          next.push(to);
        }
      }
      frontier = next;
    }
    return -1;
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Clock for the whole puzzle: counts `used` (for scores) and, with `seconds`, counts down to zero.
   * It only runs while a room is in play, not paused and the tab is visible. */
  function makeClock(seconds, paused, onZero) {
    const total = seconds ? seconds * 1000 : Infinity;
    const clock = { total, left: total, used: 0, limited: Boolean(seconds), hold: true, node: null, timer: null };
    clock.draw = () => {
      if (!clock.node || !clock.limited) return;
      const secs = Math.ceil(clock.left / 1000);
      clock.node.textContent = `⏱ ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      clock.node.classList.toggle('low', clock.left <= 10000);
    };
    clock.timer = setInterval(() => {
      if (clock.hold || paused() || document.hidden || clock.left <= 0) return;
      clock.used += TICK;
      clock.left = Math.max(0, clock.left - TICK);
      clock.draw();
      if (clock.left === 0) onZero();
    }, TICK);
    clock.refill = () => {
      clock.left = clock.total;
      clock.used = 0;
      clock.draw();
    };
    clock.stop = () => clearInterval(clock.timer);
    return clock;
  }

  /**
   * Play one room. Resolves { result, moves }: result is 'solved', 'reset' (Start again), 'skip' (only
   * offered when `canSkip`), 'timeup' (the clock ran out) or 'cancel' (another room started). `board` is the stage overlay,
   * `controls` the choices box (both are cleared first). `paused()` true stops input.
   */
  function playRoom({ kind: name, rows, board, controls, sprite, canSkip = false, paused = () => false,
    clock = null, label = '' }) {
    const kind = kinds[name];
    if (!kind) throw new Error(`Unknown puzzle "${name}"`);
    const reduced = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let state = kind.parse(rows);
    let moves = 0;
    let busy = false;
    const rowsN = rows.length;
    const colsN = rows[0].length;
    const first = kind.view(state);

    board.className = `puzzle pz-kind-${name}`;
    const hud = el('div', 'pz-hud');
    const roomEl = el('span', 'pz-pill', label);
    roomEl.hidden = !label;
    const counter = el('span', 'pz-pill');
    hud.append(roomEl, counter);
    if (clock && clock.limited) {
      clock.node = el('span', 'pz-pill pz-timer');
      clock.node.setAttribute('role', 'timer');
      hud.append(clock.node);
      clock.draw();
    }

    const grid = el('div', 'pz-grid');
    grid.style.setProperty('--cols', colsN);
    grid.style.setProperty('--rows', rowsN);
    const tileEls = [];
    for (let r = 0; r < rowsN; r++) {
      for (let c = 0; c < colsN; c++) {
        const t = el('div', 'pz-tile');
        tileEls.push(t);
        grid.append(t);
      }
    }
    const actorLayer = el('div', 'pz-actors');
    grid.append(actorLayer);

    // Copy-the-picture puzzles show the goal small, beside the board.
    const main = el('div', 'pz-main');
    let pictureEls = null;
    let picCols = 0;
    if (first.picture) {
      picCols = first.picture[0].length;
      const pic = el('div', 'pz-picture');
      const pgrid = el('div', 'pz-grid pz-picture-grid');
      pgrid.style.setProperty('--cols', picCols);
      pgrid.style.setProperty('--rows', first.picture.length);
      pictureEls = first.picture.flat().map(() => {
        const t = el('div', 'pz-tile');
        pgrid.append(t);
        return t;
      });
      pic.append(el('span', 'pz-picture-label', 'Make this!'), pgrid);
      main.append(pic);
    }
    main.append(grid);
    board.replaceChildren(hud, main);

    const player = el('div', 'pz-actor pz-player');
    if (sprite) {
      const img = el('img');
      img.src = sprite;
      img.alt = 'You';
      player.append(img);
    }
    const actorEls = new Map([['player', player]]);
    actorLayer.append(player);

    /** Tile size from the room on the stage, so the board (and picture) always fit. */
    function fit() {
      const across = colsN + (picCols ? picCols * 0.45 + 0.6 : 0);
      const w = board.clientWidth * 0.96;
      const h = (board.clientHeight - hud.offsetHeight) * 0.92;
      const size = Math.max(16, Math.floor(Math.min(w / across, h / rowsN)));
      board.style.setProperty('--tile', `${size}px`);
      board.style.setProperty('--pic-tile', `${Math.max(8, Math.floor(size * 0.45))}px`);
    }

    function place(node, r, c, dist, jump = false) {
      node.style.transitionDuration = reduced || jump ? '0ms' : `${Math.max(1, dist) * STEP_MS}ms`;
      node.style.transform = `translate(calc(${c} * var(--tile)), calc(${r} * var(--tile)))`;
    }

    /** Tiles change once the slide is over, so a pad lights up (or ice breaks) as you arrive. */
    function drawTiles() {
      const { tiles, picture } = kind.view(state);
      tiles.forEach((row, r) => row.forEach((tile, c) => {
        tileEls[r * colsN + c].className = `pz-tile pz-${tile}`;
      }));
      if (pictureEls && picture) {
        picture.flat().forEach((tile, i) => { pictureEls[i].className = `pz-tile pz-${tile}`; });
      }
    }

    /** Move the player and actors; returns how long the slowest slide takes. */
    function draw(prev) {
      const { actors = [] } = kind.view(state);
      if (!prev) drawTiles();
      let longest = 0;
      const all = [{ key: 'player', r: state.player.r, c: state.player.c, cls: '' }, ...actors];
      const live = new Set();
      for (const a of all) {
        live.add(a.key);
        let node = actorEls.get(a.key);
        if (!node) {
          node = el('div', 'pz-actor');
          actorEls.set(a.key, node);
          actorLayer.append(node);
        }
        if (a.key !== 'player') node.className = `pz-actor ${a.cls || ''}`;
        const before = prev && prev.get(a.key);
        const jump = a.key === 'player' && state.jump;
        const dist = before && !jump ? Math.abs(before.r - a.r) + Math.abs(before.c - a.c) : 0;
        longest = Math.max(longest, dist);
        place(node, a.r, a.c, dist, jump);
      }
      for (const [key, node] of actorEls) {
        if (!live.has(key)) {
          node.remove();
          actorEls.delete(key);
        }
      }
      counter.textContent = `Moves: ${moves}`;
      return reduced ? 0 : longest * STEP_MS;
    }

    function positions() {
      const { actors = [] } = kind.view(state);
      const map = new Map([['player', state.player]]);
      for (const a of actors) map.set(a.key, a);
      return map;
    }

    /** Play the state's flash frames (a pattern to remember), then drop them. */
    async function playFlash() {
      const frames = state.flash;
      state = { ...state, flash: null };
      if (!frames || !frames.length) return;
      if (clock) clock.hold = true;
      for (const f of frames) {
        const nodes = f.cells.map(({ r, c }) => tileEls[r * colsN + c]);
        nodes.forEach((n) => n.classList.add(f.cls || 'pz-flash'));
        await wait(f.ms || 500);
        nodes.forEach((n) => n.classList.remove(f.cls || 'pz-flash'));
        await wait(150);
      }
      if (clock) clock.hold = false;
    }

    return new Promise((resolve) => {
      let done = false;
      function finish(result) {
        if (done) return;
        done = true;
        if (active === finish) active = null;
        if (clock) clock.hold = true;
        document.removeEventListener('keydown', onKey);
        root.removeEventListener('resize', fit);
        resolve({ result, moves });
      }

      async function go(dir) {
        if (done || busy || paused()) return;
        const next = kind.move(state, dir);
        if (!next) {
          player.classList.remove('pz-bump');
          void player.offsetWidth; // restart the bump animation
          player.classList.add('pz-bump');
          return;
        }
        const prev = positions();
        state = next;
        moves += 1;
        busy = true;
        const slide = draw(prev);
        await wait(slide + 20);
        if (done) return;
        drawTiles();
        if (kind.solved(state)) {
          board.classList.add('pz-solved');
          controls.replaceChildren();
          if (clock) clock.hold = true;
          setTimeout(() => finish('solved'), reduced ? 200 : 700);
          return;
        }
        await playFlash();
        if (!done) draw(null);
        busy = false;
      }

      function onKey(e) {
        const dir = KEYS[e.key] || KEYS[e.key.toLowerCase()];
        if (!dir || e.target.closest?.('input, textarea')) return;
        e.preventDefault();
        go(dir);
      }

      // Swipe on the board (touch or mouse drag).
      let start = null;
      board.onpointerdown = (e) => { start = { x: e.clientX, y: e.clientY }; };
      board.onpointerup = (e) => {
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        start = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      };

      // Controls: a d-pad, then Start again (and Skip after a few tries).
      controls.replaceChildren();
      controls.className = 'choices choices-puzzle';
      const pad = el('div', 'pz-pad');
      const arrows = { up: '▲', left: '◀', down: '▼', right: '▶' };
      for (const [dir, arrow] of Object.entries(arrows)) {
        const btn = el('button', `choice pz-dir pz-${dir}`, arrow);
        btn.setAttribute('aria-label', `Move ${dir}`);
        btn.addEventListener('click', () => go(dir));
        pad.append(btn);
      }
      const side = el('div', 'pz-side');
      const reset = el('button', 'choice choice-plain', 'Start again');
      reset.addEventListener('click', () => { if (!busy) finish('reset'); });
      side.append(reset);
      if (canSkip) {
        const skip = el('button', 'choice choice-plain', 'Skip this puzzle');
        skip.addEventListener('click', () => { if (!busy) finish('skip'); });
        side.append(skip);
      }
      controls.append(pad, side);

      if (active) active('cancel');
      active = finish;
      if (clock) clock.onZero = () => finish('timeup');
      document.addEventListener('keydown', onKey);
      root.addEventListener('resize', fit);
      fit();
      draw(null);
      pad.querySelector('button').focus();
      // A room can open by showing its pattern.
      busy = true;
      playFlash().then(() => {
        if (done) return;
        draw(null);
        busy = false;
        if (clock) clock.hold = false;
      });
    });
  }

  /**
   * Play a whole puzzle: every room in order, under one clock. Resolves { result, moves, ms }: result is
   * 'solved', 'skipped' or 'cancel'; for 'solved', moves adds up each room's winning try and ms is the
   * clock time since room 1 was last started fresh (restarting a room costs time, not moves).
   *   rooms       [{ puzzle, grid, text? }]
   *   time        seconds for all the rooms (optional); running out sends you back to room 1
   *   question    said as each room starts (a room's own `text` wins)
   *   say(text)   async, shows a line and waits for the player (hints, "Time's up!")
   *   show(text)  async, shows a line without waiting (above the d-pad)
   *   hide()      called before `say`, so the stage can show the lead Pokémon instead of the board
   *   hint, hintAfter (3), skipAfter (5): the hint comes after that many tries (resets or time-ups),
   *   Skip after skipAfter
   */
  async function run({ rooms, time, question = '', hint, hintAfter = 3, skipAfter = 5, board, controls, sprite,
    paused = () => false, say, show, hide = () => {} }) {
    let tries = 0;
    let room = 0;
    let fresh = true;          // the room was just entered (not a restart)
    let moves = 0;             // winning tries of the rooms done so far
    const onZero = () => clock.onZero && clock.onZero();
    const clock = makeClock(time, paused, onZero);
    try {
      for (;;) {
        board.hidden = false;
        const r = rooms[room];
        const label = rooms.length > 1 ? `Room ${room + 1} of ${rooms.length}` : '';
        const line = fresh ? r.text || question : 'Try again! You can do it.';
        show(line);
        const { result, moves: roomMoves } = await playRoom({
          kind: r.puzzle, rows: r.grid, board, controls, sprite, paused, clock, label,
          canSkip: tries >= skipAfter,
        });
        controls.replaceChildren();
        controls.className = 'choices';
        if (result === 'cancel') return { result: 'cancel' };
        if (result === 'skip') return { result: 'skipped' };
        if (result === 'solved') {
          room += 1;
          moves += roomMoves;
          fresh = true;
          if (room === rooms.length) return { result: 'solved', moves, ms: clock.used };
          continue;
        }
        tries += 1;
        fresh = false;
        if (result === 'timeup') {
          room = 0;
          moves = 0;
          fresh = true;
          clock.refill();
          hide();
          await say(rooms.length > 1 ? "Time's up! Back to the first room." : "Time's up! Let's try that again.");
        }
        if (tries === hintAfter && hint) {
          hide();
          await say(hint);
        }
      }
    } finally {
      clock.stop();
      board.hidden = true;
    }
  }

  // play() is one room with no clock, kept for simple callers.
  const play = (opts) => playRoom(opts).then((r) => r.result);

  root.StoryPuzzles = { register, solve, play, run, kinds, DIRS };
})();
