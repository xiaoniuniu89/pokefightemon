/* Pokédex Story: chapter-based RPG with multiple-choice scenes and turn-based battles.
 * Content lives in chapters.js; this file is the engine. Powered by PokéAPI. */
(() => {
  'use strict';

  const API = 'https://pokeapi.co/api/v2';
  const ART = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';
  const LEGACY_SAVE_KEY = 'pokefightadex-story';  // the old single save, migrated into a slot on load
  const SLOTS_KEY = 'pokefightadex-saves';        // browser fallback when the server has no save API
  const SAVES_API = 'api/saves';
  const PLAYER_KEY = 'pokefightadex-player';      // { name, invite } once the invite questions are answered
  // SHA-256 of "pokefightemon:<who made it>:<his kid>", answers lowercased, letters only.
  // Must match INVITE_HASH in api/_shared.js. Kept as a hash so the answers aren't in the page source.
  const INVITE_HASH = 'dac1a698916a962b46c633bcc77f8b0aba2bd7fc10a26689c0ce7e98b84072c2';
  const IV = 15;               // flat individual value for every stat, keeps battles predictable
  // Bag items. `heal` restores HP, `ball` is a catch bonus (Poké Ball 1). Chapters hand them out with `give`.
  const ITEMS = {
    potion: { name: 'Potion', heal: 20, about: '+20 HP' },
    superpotion: { name: 'Super Potion', heal: 50, about: '+50 HP' },
    revive: { name: 'Revive', about: 'Wakes up a fainted friend' },
    xattack: { name: 'X Attack', about: 'Attack and Sp. Atk up' },
    pokeball: { name: 'Poké Ball', ball: 1, about: 'Catch a wild Pokémon' },
    greatball: { name: 'Great Ball', ball: 1.5, about: 'Catches better' },
  };
  const ITEM_KEYS = Object.keys(ITEMS);
  // Balls are weaker than in the games (playtesters caught things without trying), so a Pokémon
  // needs weakening first: a Poké Ball at full HP works about 1 time in 5, near 0 HP about 3 in 5.
  const CATCH_BONUS = 0.6;
  const LAST_STAND_HEAL = 0.2;   // share of max HP your partner gets back when it refuses to faint
  const TRAINER_SLIP = 0.3;      // chance a (non-rival) trainer picks a random move instead of the best one
  const NAME_MAX = 12;
  const TEAM_MAX = 6;            // starter + 5; chapters stop offering catches once the team is full
  const CATCH_UP_GAP = 3;        // at chapter start, anyone more than this many levels below the starter…
  const CATCH_UP_TO = 2;
  const SHARD_BOSS_LEVELS = 2;   // levels for winning a battle marked `shardBoss: true` (others give 1)         // …trains up to this many levels below it
  const LEVEL_MAX = 100;
  const SLOW_LOAD_MS = 400;      // show a "getting ready" line if building a combatant takes longer than this
  // Newest first: the learnset of the first version group a Pokémon has data for is used.
  const VERSION_GROUPS = [
    'scarlet-violet', 'sword-shield', 'ultra-sun-ultra-moon', 'sun-moon', 'omega-ruby-alpha-sapphire',
    'x-y', 'black-2-white-2', 'black-white', 'heartgold-soulsilver', 'platinum', 'diamond-pearl',
    'emerald', 'firered-leafgreen', 'ruby-sapphire', 'crystal', 'gold-silver', 'yellow', 'red-blue',
  ];
  const STAT_LABEL = {
    attack: 'Attack', defense: 'Defense', 'special-attack': 'Sp. Atk', 'special-defense': 'Sp. Def',
    speed: 'Speed', accuracy: 'accuracy', evasion: 'evasiveness',
  };
  // The seven shards, in story order. `cls` picks the crystal colour in styles.css (.shard-<key>).
  // `team` and `boss` are the stat stages each one gives in a `boss: true` battle; `potions` are
  // added to the bag when that battle starts.
  const SHARDS = {
    glimmer: { name: 'Glimmer Shard', boss: { accuracy: -1 } },
    stone: { name: 'Stone Shard', team: { defense: 1 } },
    frost: { name: 'Frost Shard', boss: { speed: -1 } },
    tide: { name: 'Tide Shard', potions: 2 },
    spark: { name: 'Spark Shard', team: { speed: 1 } },
    ember: { name: 'Ember Shard', team: { attack: 1, 'special-attack': 1 } },
    shadow: { name: 'Shadow Shard', boss: { attack: -1, 'special-attack': -1 } },
  };
  const SHARD_KEYS = Object.keys(SHARDS);

  const CHAPTERS = window.STORY_CHAPTERS;
  const CAST = window.STORY_CAST;
  const LOOKS = window.STORY_LOOKS;

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const statusEl = $('#status');
  const titleEl = $('#title-screen');
  const gateEl = $('#gate');
  const loadBtn = $('#load-btn');
  const newBtn = $('#new-btn');
  const saveListEl = $('#save-list');
  const saveWhereEl = $('#save-where');
  const saveSlotsEl = $('#save-slots');
  const menuNoteEl = $('#menu-note');
  const storyEl = $('#story');
  const chapterTag = $('#chapter-tag');
  const menuEl = $('#story-menu');
  const menuBtn = $('#menu-btn');
  const NEW_GAME_FLAG = 'pokedex-story-new';
  const stageEl = $('#stage');
  const castEl = $('#stage-cast');
  const monEl = $('#stage-mon');
  const battleEl = $('#battle');
  const foeHud = $('#foe-hud');
  const allyHud = $('#ally-hud');
  const foeSprite = $('#foe-sprite');
  const allySprite = $('#ally-sprite');
  const foeBall = $('#foe-ball');
  const dialogueEl = $('#dialogue');
  const speakerEl = $('#speaker');
  const lineEl = $('#line');
  const moreEl = $('#more');
  const choicesEl = $('#choices');
  const menuMainEl = $('#menu-main');
  const teamBoxEl = $('#team-box');
  const teamNoteEl = $('#team-note');
  const teamListEl = $('#team-list');
  const teamShardsEl = $('#team-shards');
  const finalEl = $('#stage-final');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Music (music.js; the game still works without it) ----------
  const music = window.StoryMusic || { play() {}, stop() {}, jingle() {}, setMuted() {}, muted: true };
  const musicBtn = $('#music-btn');
  function showMusicState() {
    musicBtn.textContent = music.muted ? '♪ Music off' : '♪ Music on';
    musicBtn.setAttribute('aria-pressed', String(!music.muted));
  }
  musicBtn.addEventListener('click', () => {
    music.setMuted(!music.muted);
    showMusicState();
  });
  showMusicState();

  // ---------- Helpers ----------
  const cache = new Map();       // url -> Promise<json>
  const typeCharts = new Map();  // type name -> damage_relations

  const title = (s) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const artUrl = (id) => `${ART}/${id}.png`;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, reducedMotion ? Math.min(ms, 150) : ms));

  function fetchJson(url) {
    if (!cache.has(url)) {
      const p = fetch(url).then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
        return r.json();
      });
      p.catch(() => cache.delete(url));
      cache.set(url, p);
    }
    return cache.get(url);
  }

  function setStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle('error', isError);
    statusEl.hidden = !msg;
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function flash(node, cls, ms) {
    node.classList.remove(cls);
    // Force a reflow so re-adding the class restarts the animation.
    void node.offsetWidth;
    node.classList.add(cls);
    setTimeout(() => node.classList.remove(cls), ms);
  }

  // ---------- Story state ----------
  const newSlotId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const freshState = () => ({
    slot: newSlotId(), // save slot this game writes to
    chapter: 0,
    scene: null,
    applied: null,   // scene whose `give`/`set` effects were already applied (avoids repeats on resume)
    look: 'red',
    player: '',
    rival: '',
    mon: null,       // { id, species, types, nickname, level }
    rivalMon: null,
    party: [],       // the rest of the team (catches and gifts), same shape as `mon`; they battle and level up too
    order: [],       // team order, as indexes into [mon, ...party]; the first one leads in battle
    lastFoe: null,   // { id, species, level } of the most recent battle opponent
    flags: {},
    bag: Object.fromEntries(ITEM_KEYS.map((k) => [k, 0])),
    shards: [],      // shard keys held (see SHARDS), no repeats; scenes add them with `shard` and remove them with `take`
  });
  let s = freshState();

  // ---------- Team ----------
  const members = (st) => [st.mon, ...(st.party || [])];

  /** A valid team order for `st`: its saved order with bad or repeated indexes dropped, then
   * anyone missing appended in catch order. Old saves (no `order`) get starter first, then catches. */
  function normalizeOrder(st) {
    const all = members(st);
    const seen = new Set();
    const out = (Array.isArray(st.order) ? st.order : [])
      .filter((i) => Number.isInteger(i) && all[i] && !seen.has(i) && seen.add(i));
    all.forEach((m, i) => { if (m && !seen.has(i)) out.push(i); });
    return out;
  }

  const teamOf = (st) => { const all = members(st); return normalizeOrder(st).map((i) => all[i]); };
  /** The current team in order (lead first). Also repairs `s.order` if something slipped. */
  function team() {
    s.order = normalizeOrder(s);
    const all = members(s);
    return s.order.map((i) => all[i]);
  }
  const teamFull = () => team().length >= TEAM_MAX;

  /** Add a Pokémon to the end of the team. Returns false (and adds nothing) when the team is full. */
  function addToTeam(mon) {
    if (teamFull()) return false;
    s.party.push(mon);
    s.order.push(s.party.length); // its index in [mon, ...party]
    return true;
  }

  /** Bring a saved Pokémon up to the current shape: { id, species, types, nickname, level }. */
  const shapeMon = (m, fallbackLevel = 5) => ({
    ...m,
    species: m.species || `Pokémon #${m.id}`,
    types: Array.isArray(m.types) ? m.types : [],
    nickname: m.nickname || null,
    level: Number.isFinite(m.level) ? m.level : fallbackLevel,
  });

  /** Load any save, old or new: missing fields get defaults, party entries are reshaped, and
   * `order` is filled in (saves from before teams get starter first, then catches). Saves from
   * before shards get the Glimmer Shard if they won the chapter 3 duel. */
  function revive(state) {
    const st = { ...freshState(), ...state, bag: { ...freshState().bag, ...state.bag }, flags: { ...state.flags } };
    if (st.mon) st.mon = shapeMon(st.mon);
    st.party = (Array.isArray(st.party) ? st.party : [])
      .filter((m) => m && m.id)
      .map((m) => shapeMon(m, st.mon ? st.mon.level : 5));
    st.order = normalizeOrder(st);
    const hadShards = Array.isArray(state.shards);
    st.shards = normalizeShards(hadShards ? state.shards : []);
    if (!hadShards && st.flags['ch3:duel'] === 'win' && !st.shards.includes('glimmer')) st.shards.unshift('glimmer');
    return st;
  }

  // ---------- Shards ----------
  /** Known keys only, each once, in the order they were found. */
  const normalizeShards = (list) => (Array.isArray(list) ? list : [])
    .filter((k, i, a) => SHARDS[k] && a.indexOf(k) === i);
  /** Held shards in story order (for showing them). */
  const heldShards = () => SHARD_KEYS.filter((k) => s.shards.includes(k));

  /** A scene's `shard` / `take` field: a key, or a function of the state returning a key or null. */
  function shardField(v) {
    const key = typeof v === 'function' ? v(s) : v;
    if (key && !SHARDS[key]) console.warn('Unknown shard', key);
    return key && SHARDS[key] ? key : null;
  }

  /** Add a shard. Returns false when it was already held. */
  function addShard(key) {
    if (s.shards.includes(key)) return false;
    s.shards.push(key);
    return true;
  }

  function removeShard(key) {
    s.shards = s.shards.filter((k) => k !== key);
  }

  /** A small coloured crystal. With `label`, the shard's name is shown beside it. */
  function crystalNode(key, { label = false, big = false } = {}) {
    const wrap = el('span', `shard-item${big ? ' shard-item-big' : ''}`);
    const gem = el('span', `shard shard-${key}`);
    gem.setAttribute('aria-hidden', 'true');
    wrap.append(gem);
    if (label) wrap.append(el('span', 'shard-name', SHARDS[key].name));
    else wrap.title = SHARDS[key].name;
    return wrap;
  }

  /** "3 of 7 shards" heading plus a crystal per held shard, for the Team screen and the final end screen. */
  function shardBox(heading) {
    const box = el('div', 'shard-box');
    const held = heldShards();
    box.append(el('p', 'shard-count', heading(held.length, SHARD_KEYS.length)));
    if (held.length) {
      const row = el('div', 'shard-row');
      row.append(...held.map((k) => crystalNode(k, { label: true })));
      box.append(row);
    }
    return box;
  }

  /** After a scene's panels: "You got the Stone Shard!" with the crystal on the stage. */
  async function announceShard(scene, key) {
    renderStage({ bg: scene.bg, cast: [] });
    monEl.hidden = false;
    monEl.replaceChildren(crystalNode(key, { big: true }));
    const n = s.shards.length;
    music.jingle('shard');
    await say('narrator', `You got the ${SHARDS[key].name}! Now you have ${n} of ${SHARD_KEYS.length} shards.`);
  }

  /** Fill in species names and types for team members that are missing them (very old or hand-edited saves). */
  async function hydrateTeam() {
    let changed = false;
    for (const m of team()) {
      if (m.types.length) continue;
      const info = await speciesInfo(m.id);
      m.types = info.types;
      if (m.species.startsWith('Pokémon #')) m.species = info.species;
      changed = true;
    }
    if (changed) save();
  }

  /** At the start of a chapter, anyone far below the starter catches up, so no one gets left behind. */
  async function catchUp(scene) {
    if (!s.mon) return;
    // Never above the chapter's level cap, and never lower than anyone already is.
    const target = Math.min(Math.max(1, s.mon.level - CATCH_UP_TO), levelCap());
    for (const m of team()) {
      if (m === s.mon || m.level >= s.mon.level - CATCH_UP_GAP || m.level >= target) continue;
      m.level = target;
      renderStage({ bg: scene.bg, cast: [], mon: m.id });
      await say('narrator', `${monName(m)} trained hard at camp! Now it is Lv. ${m.level}, ready to keep up with ${monName(s.mon)}.`);
    }
  }

  /** A Pokémon given by a scene joins the team. Skipped when the team is full. */
  async function giveMon(gift) {
    if (teamFull()) {
      console.info('Team is full, gift skipped', gift);
      return;
    }
    const info = await retrying(() => speciesInfo(gift.id));
    if (teamFull()) return;
    addToTeam({ id: gift.id, species: info.species, types: info.types, nickname: gift.nickname || null, level: pickLevel(gift.level) });
  }

  // ---------- Evolution ----------
  // Pokémon evolve at story moments, not by level: a scene's `evolve` ('starter', 'team' for everyone
  // but the starter, or (s) => list of team members) evolves each one that can by one stage, after
  // the scene's panels. It happens once per scene (flags['evolve:<chapter>:<scene>']).

  /** What `m` evolves into (the first branch, e.g. Eevee picks Vaporeon), or null if it can't. */
  async function nextStage(m) {
    const sp = await fetchJson(`${API}/pokemon-species/${m.id}`);
    const chain = await fetchJson(sp.evolution_chain.url);
    const find = (node) => (node.species.name === sp.name ? node : node.evolves_to.map(find).find(Boolean));
    const next = find(chain.chain)?.evolves_to[0];
    if (!next) return null;
    return speciesInfo(Number(next.species.url.match(/\/(\d+)\/?$/)[1]));
  }

  async function evolveScene(scene, id) {
    if (!scene.evolve) return;
    const key = `evolve:${chapter().id}:${id}`;
    if (s.flags[key]) return;
    const who = typeof scene.evolve === 'function' ? scene.evolve(s)
      : scene.evolve === 'starter' ? [s.mon]
        : team().filter((m) => m !== s.mon);
    const plans = [];
    for (const m of (who || []).filter(Boolean)) {
      const next = await retrying(() => nextStage(m));
      if (next) plans.push([m, next]);
    }
    for (const [m, next] of plans) await evolveMon(scene, m, next);
    // Set with the changes and saved together, so a reload mid-way replays the whole thing.
    s.flags[key] = true;
    save();
  }

  /** "What? Ember is evolving!": a glow, the new picture, then the Pokémon changes species.
   * Its nickname and level stay; its moves come from the new species in the next battle. */
  async function evolveMon(scene, m, next) {
    const before = monName(m);
    new Image().src = artUrl(next.id); // load the new picture while the old one glows
    renderStage({ bg: scene.bg, cast: [], mon: m.id });
    await say('narrator', `What? ${before} is evolving!`);
    monEl.classList.add('evolving');
    music.jingle('evolve');
    await sleep(2400);
    Object.assign(m, { id: next.id, species: next.species, types: next.types });
    monEl.querySelector('img').src = artUrl(next.id);
    monEl.classList.remove('evolving');
    flash(monEl, 'evolved', 900);
    await say('narrator', `Congratulations! ${before} evolved into ${next.species}!`);
  }

  // ---------- Save slots ----------
  // Slots live in the server's JSON database (data/saves.json, via /api/saves). When the page
  // is served by something without that API, they fall back to this browser's localStorage.
  let remoteSaves = false;

  function localSlots() {
    try { return JSON.parse(localStorage.getItem(SLOTS_KEY)) || {}; } catch { return {}; }
  }
  function writeLocalSlots(slots) {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
  }

  // ---------- Player (invite questions) ----------
  let player = null;   // { name, invite }

  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const answer = (v) => v.toLowerCase().replace(/[^a-z]/g, '');

  function storedPlayer() {
    try {
      const p = JSON.parse(localStorage.getItem(PLAYER_KEY));
      return p && p.invite === INVITE_HASH && p.name ? p : null;
    } catch { return null; }
  }

  /** Resolves with the player once the invite questions are answered (asked once per device). */
  function askInvite() {
    const known = storedPlayer();
    if (known) return Promise.resolve(known);
    const form = $('#gate-form');
    const errEl = $('#gate-error');
    gateEl.hidden = false;
    $('#gate-name').focus();
    return new Promise((resolve) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = $('#gate-name').value.trim().replace(/\s+/g, ' ').slice(0, 20);
        let invite = '';
        try {
          invite = await sha256(`pokefightemon:${answer($('#gate-maker').value)}:${answer($('#gate-kid').value)}`);
        } catch { /* no crypto.subtle (plain http): can't check, so it stays locked */ }
        if (!name || invite !== INVITE_HASH) {
          errEl.textContent = !name ? 'Type your name first!' : "Hmm, that's not right. Ask a grown-up!";
          errEl.hidden = false;
          return;
        }
        const p = { name, invite };
        try { localStorage.setItem(PLAYER_KEY, JSON.stringify(p)); } catch { /* asked again next visit */ }
        gateEl.hidden = true;
        resolve(p);
      });
    });
  }

  function playerHeaders() {
    return { 'X-Invite': player.invite, 'X-Player': encodeURIComponent(player.name) };
  }

  async function api(path, opts = {}) {
    const r = await fetch(`${SAVES_API}${path}`, {
      cache: 'no-store', ...opts, headers: { ...opts.headers, ...playerHeaders() },
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `${r.status} ${r.statusText}`);
    }
    return r.status === 204 ? null : r.json();
  }

  async function initSaves() {
    try {
      const r = await fetch(SAVES_API, { cache: 'no-store', headers: playerHeaders() });
      remoteSaves = r.ok && (r.headers.get('content-type') || '').includes('json');
    } catch {
      remoteSaves = false;
    }
    // Carry an old single-slot save over into the slot list.
    try {
      const legacy = localStorage.getItem(LEGACY_SAVE_KEY);
      if (legacy) {
        const state = revive(JSON.parse(legacy));
        await putSave(state);
        localStorage.removeItem(LEGACY_SAVE_KEY);
      }
    } catch (err) {
      console.warn('Could not migrate the old save', err);
    }
    // Slots made in the browser while the save database was unreachable move into it once it's back.
    if (remoteSaves) {
      const slots = localSlots();
      for (const x of Object.values(slots)) {
        try {
          await putSave(revive(x.state));
          delete slots[x.id];
        } catch (err) {
          console.warn('Could not move a browser save to the database', err);
        }
      }
      try { writeLocalSlots(slots); } catch { /* storage unavailable */ }
    }
  }

  /** All slots, newest first: [{ id, updated, state }]. */
  async function listSaves() {
    const list = remoteSaves ? await api('') : Object.values(localSlots());
    return list
      .filter((x) => x && x.state && CHAPTERS[x.state.chapter])
      .sort((a, b) => b.updated.localeCompare(a.updated))
      .map((x) => ({ ...x, state: revive(x.state) }));
  }

  async function putSave(state) {
    if (remoteSaves) {
      await api(`/${state.slot}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
    } else {
      const slots = localSlots();
      slots[state.slot] = { id: state.slot, updated: new Date().toISOString(), state };
      writeLocalSlots(slots);
    }
  }

  async function deleteSave(id) {
    if (remoteSaves) await api(`/${id}`, { method: 'DELETE' });
    else {
      const slots = localSlots();
      delete slots[id];
      writeLocalSlots(slots);
    }
  }

  // Saves are queued so an older snapshot never lands after a newer one.
  let saving = Promise.resolve();
  let saveFailed = false;
  function save() {
    const snapshot = JSON.parse(JSON.stringify(s));
    saving = saving
      .then(() => putSave(snapshot))
      .then(() => {
        if (saveFailed) setStatus('');
        saveFailed = false;
      })
      .catch((err) => {
        saveFailed = true;
        setStatus(`Couldn't save your progress: ${err.message}`, true);
      });
    return saving;
  }

  const monName = (m) => (m ? m.nickname || m.species : '');
  const lastCaught = () => s.party[s.party.length - 1] || null;
  /** "Ember", "Ember and Sparky", "Ember, Sparky and Rocky". */
  const joinNames = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

  /** Resolve a text template (string or function of state) and fill its placeholders. */
  function fill(text) {
    const raw = typeof text === 'function' ? text(s) : text;
    const vars = {
      player: s.player || 'you',
      rival: s.rival || 'your rival',
      mon: monName(s.mon),
      species: s.mon?.species || '',
      type: s.mon ? title(s.mon.types[0]) : '',
      rivalMon: s.rivalMon?.species || '',
      caught: monName(lastCaught()),
      caughtSpecies: lastCaught()?.species || '',
      foe: s.lastFoe?.species || '',
      team: joinNames(team().map(monName)),
      lead: monName(team()[0]),
      shards: String(s.shards.length),
    };
    return String(raw).replace(/\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m));
  }

  // ---------- Dialogue and input ----------
  let typing = null;           // { finish } while the typewriter runs
  let advance = null;          // resolver while waiting for the player to continue

  function typeLine(text) {
    return new Promise((resolve) => {
      if (typing) typing.finish();
      if (reducedMotion) {
        lineEl.textContent = text;
        resolve();
        return;
      }
      let i = 0;
      lineEl.textContent = '';
      const timer = setInterval(() => {
        i += 2;
        lineEl.textContent = text.slice(0, i);
        if (i >= text.length) finish();
      }, 16);
      const finish = () => {
        clearInterval(timer);
        lineEl.textContent = text;
        typing = null;
        resolve();
      };
      typing = { finish };
    });
  }

  function setSpeaker(who) {
    const c = CAST[who];
    const name = c && c.name ? fill(c.name) : '';
    speakerEl.textContent = name;
    speakerEl.hidden = !name;
  }

  /** Wait for a click / Enter / Space, or for `ms` to pass when given. */
  function waitAdvance(ms) {
    moreEl.hidden = false;
    return new Promise((resolve) => {
      let timer = null;
      advance = () => {
        clearTimeout(timer);
        advance = null;
        moreEl.hidden = true;
        resolve();
      };
      if (ms) timer = setTimeout(advance, reducedMotion ? Math.min(ms, 400) : ms);
    });
  }

  async function say(who, text, autoMs) {
    setSpeaker(who);
    await typeLine(fill(text));
    await waitAdvance(autoMs);
  }

  /** Show a line without waiting (the question above a set of choices). */
  async function show(who, text) {
    setSpeaker(who);
    await typeLine(fill(text));
  }

  function onAdvance() {
    if (typing) typing.finish();
    else if (advance) advance();
  }

  dialogueEl.addEventListener('click', onAdvance);
  document.addEventListener('keydown', (e) => {
    if (storyEl.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      toggleMenu(menuEl.hidden);
      return;
    }
    if (!menuEl.hidden || e.target.closest('input, textarea')) return;
    if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button, a')) {
      e.preventDefault();
      onAdvance();
    } else if (/^[1-9]$/.test(e.key)) {
      const btn = choicesEl.querySelectorAll('button:not(:disabled)')[Number(e.key) - 1];
      if (btn) btn.click();
    }
  });

  function clearChoices() {
    choicesEl.replaceChildren();
    choicesEl.className = 'choices';
  }

  /** Render buttons and resolve with the index of the one clicked. */
  function choose(labels, { cls = '', build } = {}) {
    clearChoices();
    if (cls) choicesEl.classList.add(...cls.split(/\s+/).filter(Boolean));
    return new Promise((resolve) => {
      labels.forEach((label, i) => {
        const btn = el('button', 'choice');
        if (build) build(btn, i);
        else {
          btn.append(el('span', 'choice-key', String(i + 1)), el('span', 'choice-text', fill(label)));
        }
        btn.addEventListener('click', () => {
          clearChoices();
          resolve(i);
        });
        choicesEl.append(btn);
      });
      choicesEl.querySelector('button')?.focus();
    });
  }

  // ---------- Stage (the "picture") ----------
  function actorNode(key, speaking) {
    const c = CAST[key];
    const fig = el('figure', `actor${speaking ? ' speaking' : ''}${c.silhouette ? ' silhouette' : ''}`);
    const src = typeof c.sprite === 'function' ? c.sprite(s) : c.sprite;
    const name = fill(c.name);
    if (src) {
      const img = el('img');
      img.src = src;
      img.alt = name;
      img.addEventListener('error', () => img.replaceWith(el('span', 'actor-fallback', name.charAt(0) || '?')));
      fig.append(img);
    }
    fig.append(el('figcaption', '', name));
    return fig;
  }

  function monId(ref) {
    if (ref === 'player') return s.mon?.id;
    if (ref === 'rival') return s.rivalMon?.id;
    if (ref === 'caught') return lastCaught()?.id;
    if (ref === 'foe') return s.lastFoe?.id;
    if (ref === 'lead') return team()[0]?.id;
    return ref;
  }

  function renderStage({ bg, cast = [], who, mon }) {
    stageEl.className = `stage bg-${bg || 'intro'}`;
    finalEl.hidden = true;
    castEl.replaceChildren(...cast.filter((k) => CAST[k]).map((k) => actorNode(k, k === who)));
    castEl.classList.toggle('has-speaker', cast.includes(who));
    const id = monId(mon);
    monEl.hidden = !id;
    if (id) {
      const img = el('img');
      img.src = artUrl(id);
      img.alt = '';
      monEl.replaceChildren(img);
    }
  }

  // ---------- Scene runner ----------
  const chapter = () => CHAPTERS[s.chapter];

  /** `set` and `give` are objects, or functions of the story state that return one. */
  function applyEffects(obj) {
    const set = typeof obj.set === 'function' ? obj.set(s) : obj.set;
    const give = typeof obj.give === 'function' ? obj.give(s) : obj.give;
    if (set) Object.assign(s.flags, set);
    if (give) for (const [item, n] of Object.entries(give)) s.bag[item] = (s.bag[item] || 0) + n;
  }

  /** Everything a scene does on entry, once (guarded by `s.applied`): `set`, `give`, `shard`,
   * `take`, `gift`. `set` goes first, so `shard`/`take` functions can read the flags it sets.
   * The gift's fetch retries by itself, so an error never applies the others twice.
   * Returns the shard gained (announced after the scene's panels), or null. */
  async function applyScene(scene) {
    const gift = typeof scene.gift === 'function' ? scene.gift(s) : scene.gift;
    applyEffects(scene);
    const got = shardField(scene.shard);
    const lost = shardField(scene.take);
    const gained = got && addShard(got) ? got : null;
    // The Veil took it: the chapter text says so, so no extra line here.
    if (lost) removeShard(lost);
    if (gift) await giveMon(gift);
    return gained;
  }

  async function playPanels(panels, scene) {
    const list = typeof panels === 'function' ? panels(s) : panels || [];
    for (const p of list) {
      renderStage({ bg: p.bg || scene.bg, cast: p.cast || scene.cast, who: p.who, mon: p.mon });
      await say(p.who, p.text);
    }
  }

  async function playFrom(sceneId) {
    let id = sceneId;
    while (id) {
      const scene = chapter().scenes[id];
      if (!scene) throw new Error(`Unknown scene "${id}"`);
      chapterTag.textContent = `${chapter().title} · ${chapter().subtitle}`;
      s.scene = id;
      music.play(scene.bg);
      let gained = null;
      if (s.applied !== id) {
        if (id === chapter().start) await catchUp(scene);
        gained = await applyScene(scene);
        s.applied = id;
      }
      save();
      await playPanels(scene.panels, scene);
      if (gained) await announceShard(scene, gained);
      await evolveScene(scene, id);
      id = await runPrompt(scene);
    }
  }

  const resolveNext = (next) => (typeof next === 'function' ? next(s) : next);

  /** Run `fn`, offering "Try again" on errors (usually the network) until it works. */
  async function retrying(fn) {
    for (;;) {
      try {
        setStatus('');
        return await fn();
      } catch (err) {
        console.error(err);
        setStatus(`Something went wrong: ${err.message}`, true);
        await choose(['Try again']);
      }
    }
  }

  /** Run the scene's prompt, retrying on network errors. Returns the next scene id. */
  const runPrompt = (scene) => retrying(() => promptOnce(scene));

  async function promptOnce(scene) {
    const pr = scene.prompt;
    if (!pr) return resolveNext(scene.next);
    switch (pr.kind) {
      case 'choice': return promptChoice(pr, scene);
      case 'name': return promptName(pr);
      case 'look': return promptLook(pr);
      case 'starter': return promptStarter(pr, scene);
      case 'battle': return promptBattle(pr, scene);
      case 'end': return promptEnd();
      default: throw new Error(`Unknown prompt "${pr.kind}"`);
    }
  }

  async function promptChoice(pr, scene) {
    if (pr.question) await show('narrator', pr.question);
    // Options with an `if` only appear when it holds, e.g. owning up to something you did earlier.
    const options = pr.options.filter((o) => !o.if || o.if(s));
    const i = await choose(options.map((o) => o.text));
    const opt = options[i];
    // Replies to a character are spoken by the player; actions (where to go) are not.
    if (pr.speak) {
      renderStage({ bg: scene.bg, cast: [...scene.cast.filter((k) => k !== 'player'), 'player'], who: 'player' });
      await say('player', opt.text, 1400);
    }
    applyEffects(opt);
    await playPanels(opt.after, scene);
    return resolveNext(opt.next);
  }

  async function promptLook(pr) {
    const i = await choose(pr.options, {
      cls: 'choices-cards',
      build: (btn, n) => {
        const look = LOOKS[pr.options[n]];
        const img = el('img');
        img.src = look.sprite;
        img.alt = '';
        btn.classList.add('card-choice');
        btn.append(img, el('span', 'choice-text', look.label));
      },
    });
    s.look = pr.options[i];
    return resolveNext(pr.next);
  }

  /** Three suggestions plus a free-text field. Nicknames also offer keeping the species name.
   * `nickname` names the starter, `caughtNickname` the most recently caught Pokémon. */
  function promptName(pr) {
    const suggestions = typeof pr.suggestions === 'function' ? pr.suggestions(s) : pr.suggestions;
    const target = pr.field === 'nickname' ? s.mon : pr.field === 'caughtNickname' ? lastCaught() : null;
    clearChoices();
    choicesEl.classList.add('choices-name');
    return new Promise((resolve) => {
      const done = (value) => {
        const name = (value || '').trim().slice(0, NAME_MAX);
        if (target) target.nickname = name || null;
        else if (!name) return;
        else s[pr.field] = name;
        clearChoices();
        save();
        resolve(resolveNext(pr.next));
      };
      suggestions.forEach((name, i) => {
        const btn = el('button', 'choice');
        btn.append(el('span', 'choice-key', String(i + 1)), el('span', 'choice-text', name));
        btn.addEventListener('click', () => done(name));
        choicesEl.append(btn);
      });
      const form = el('form', 'name-form');
      const input = el('input');
      input.maxLength = NAME_MAX;
      input.placeholder = 'Or type a name…';
      input.setAttribute('aria-label', 'Name');
      const ok = el('button', 'btn', 'OK');
      ok.type = 'submit';
      form.append(input, ok);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        done(input.value);
      });
      choicesEl.append(form);
      if (target) {
        const keep = el('button', 'choice choice-plain', `No nickname, keep ${target.species}`);
        keep.addEventListener('click', () => done(''));
        choicesEl.append(keep);
      }
      choicesEl.querySelector('button')?.focus();
    });
  }

  // ---------- Starters ----------
  async function speciesInfo(id) {
    const p = await fetchJson(`${API}/pokemon/${id}`);
    return { id, species: title(p.name), types: p.types.map((t) => t.type.name), p };
  }

  async function promptStarter(pr, scene) {
    setStatus('Opening the Poké Balls…');
    const options = await Promise.all(pr.options.map(speciesInfo));
    await Promise.all([...new Set(options.flatMap((o) => o.types))].map(getTypeChart));
    setStatus('');

    for (;;) {
      await show('oak', 'Choose your partner!');
      const i = await choose(options, {
        cls: 'choices-cards',
        build: (btn, n) => {
          const o = options[n];
          const img = el('img');
          img.src = artUrl(o.id);
          img.alt = '';
          const types = el('span', 'types');
          for (const t of o.types) types.append(el('span', `type type-${t}`, t));
          btn.classList.add('card-choice');
          btn.append(img, el('span', 'choice-text', o.species), types);
        },
      });
      const pick = options[i];
      renderStage({ bg: scene.bg, cast: ['oak'], who: 'oak', mon: pick.id });
      await show('oak', `So! You want ${pick.species}, the ${title(pick.types[0])}-type Pokémon?`);
      if ((await choose(['Yes, this one!', 'Let me look again'])) === 0) {
        const rival = rivalPick(pick, options.filter((o) => o !== pick));
        s.mon = { id: pick.id, species: pick.species, types: pick.types, nickname: null, level: 5 };
        s.rivalMon = { id: rival.id, species: rival.species, types: rival.types, level: 5 };
        s.order = normalizeOrder(s);
        save();
        return resolveNext(pr.next);
      }
      renderStage({ bg: scene.bg, cast: scene.cast, who: 'oak' });
    }
  }

  /** The rival always takes the starter with the best type matchup against yours. */
  function rivalPick(player, rest) {
    const score = (o) => Math.max(...o.types.map((t) => effectiveness(t, player.types)));
    const best = Math.max(...rest.map(score));
    const top = rest.filter((o) => score(o) === best);
    return top[Math.floor(Math.random() * top.length)];
  }

  // ---------- Chapter end ----------
  async function promptEnd() {
    s.scene = '__end';
    save();
    await showEnd();
    return null;
  }

  /** The last chapter's `end` prompt has `final: true` (looked up from the chapter, so it also works
   * when a finished save is loaded). */
  const isFinal = (ch) => Object.values(ch.scenes).some((sc) => sc.prompt && sc.prompt.kind === 'end' && sc.prompt.final);

  /** The final end screen's board: the whole team (sprite, name, level) and the shards found. */
  function renderFinalBoard() {
    const row = el('ul', 'final-team');
    row.setAttribute('aria-label', 'Your team');
    row.append(...team().map((m) => {
      const li = el('li', 'final-mon');
      const img = el('img');
      img.src = artUrl(m.id);
      img.alt = '';
      li.append(img, el('strong', '', monName(m)), el('span', 'muted', `Lv ${m.level}`));
      return li;
    }));
    finalEl.replaceChildren(row, shardBox((n, all) => `You found ${n} of ${all} shards`));
    finalEl.hidden = false;
    castEl.replaceChildren();
    monEl.hidden = true;
  }

  async function showEnd() {
    const ch = chapter();
    const next = CHAPTERS[s.chapter + 1];
    const finished = isFinal(ch);
    music.play('home');
    music.jingle('victory');
    renderStage({ bg: 'intro', cast: ['player'], who: 'player', mon: 'player' });
    if (finished) renderFinalBoard();
    chapterTag.textContent = `${ch.title} · ${ch.subtitle}`;
    setSpeaker('narrator');
    lineEl.textContent = `${ch.title} complete! ` +
      (ch.summary ? fill(ch.summary) : `${s.player} and ${monName(s.mon)} (Lv. ${s.mon.level}) press on.`) +
      (finished ? ` You found ${s.shards.length} of ${SHARD_KEYS.length} shards.` : '');
    const labels = [next ? `Start ${next.title}` : finished ? 'You finished the story!' : 'More chapters coming soon', 'Save and exit', 'Open the Pokédex'];
    const i = await choose(labels, {
      build: (btn, n) => {
        btn.append(el('span', 'choice-key', String(n + 1)), el('span', 'choice-text', labels[n]));
        if (n === 0 && !next) btn.disabled = true;
      },
    });
    if (i === 0) {
      s.chapter += 1;
      s.applied = null;
      playFrom(chapter().start).catch(fatal);
    } else if (i === 1) {
      save();
      reloadTo();
    } else {
      location.href = 'index.html';
    }
  }

  // ---------- Type effectiveness ----------
  async function getTypeChart(type) {
    if (!typeCharts.has(type)) {
      const data = await fetchJson(`${API}/type/${type}`);
      typeCharts.set(type, data.damage_relations);
    }
    return typeCharts.get(type);
  }

  function effectiveness(attackType, defenderTypes) {
    const rel = typeCharts.get(attackType);
    if (!rel) return 1;
    let mult = 1;
    for (const t of defenderTypes) {
      if (rel.no_damage_to.some((x) => x.name === t)) mult *= 0;
      else if (rel.double_damage_to.some((x) => x.name === t)) mult *= 2;
      else if (rel.half_damage_to.some((x) => x.name === t)) mult *= 0.5;
    }
    return mult;
  }

  // ---------- Battle: building combatants ----------
  /** Level-up moves known at `level`, as in the games: the four most recently learned. */
  async function learnset(p, level) {
    const byGroup = new Map();
    for (const m of p.moves) {
      for (const v of m.version_group_details) {
        if (v.move_learn_method.name !== 'level-up') continue;
        const g = v.version_group.name;
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g).push({ name: m.move.name, level: v.level_learned_at });
      }
    }
    const group = VERSION_GROUPS.find((g) => byGroup.has(g)) || byGroup.keys().next().value;
    const entries = (byGroup.get(group) || [])
      .filter((e) => e.level <= level)
      .sort((a, b) => a.level - b.level);
    const details = await Promise.all(entries.map((e) => fetchJson(`${API}/move/${e.name}`)));
    // Only moves the engine can resolve: damaging moves with a fixed power, or pure stat changers.
    const usable = details
      .map((d, i) => ({ d, level: entries[i].level }))
      .filter(({ d }) => (d.damage_class.name !== 'status' && d.power) || (d.damage_class.name === 'status' && d.stat_changes.length));
    const seen = new Set();
    const unique = usable.filter(({ d }) => !seen.has(d.name) && seen.add(d.name));
    const known = unique.slice(-4);
    if (!known.length) known.push({ d: await fetchJson(`${API}/move/tackle`), level: 1 });
    return known.map(({ d, level: learnedAt }) => toMove(d, learnedAt));
  }

  function toMove(d, learnedAt) {
    const self = d.target.name === 'user' || d.target.name === 'user-and-allies';
    const damaging = d.damage_class.name !== 'status';
    return {
      name: d.name,
      label: title(d.name),
      type: d.type.name,
      cls: d.damage_class.name,
      power: d.power || 0,
      accuracy: d.accuracy,
      priority: d.priority || 0,
      pp: d.pp,
      maxPp: d.pp,
      self,
      statChanges: d.stat_changes.map((c) => ({ stat: c.stat.name, change: c.change })),
      // A damaging move's stat change is a side effect: it only sometimes happens (Acid: 10%), and
      // some of them change the user's own stats (Metal Claw, Flame Charge, Close Combat).
      statSelf: self || (damaging && d.meta?.category?.name === 'damage-raise'),
      statChance: damaging ? d.meta?.stat_chance || 100 : 100,
      learnedAt,
    };
  }

  const STRUGGLE = {
    name: 'struggle', label: 'Struggle', type: 'typeless', cls: 'physical', power: 50, accuracy: null,
    priority: 0, pp: Infinity, maxPp: Infinity, self: false, statChanges: [], statSelf: false, statChance: 100,
  };

  function calcStats(p, level) {
    const base = Object.fromEntries(p.stats.map((x) => [x.stat.name, x.base_stat]));
    const other = (b) => Math.floor(((2 * b + IV) * level) / 100) + 5;
    return {
      hp: Math.floor(((2 * base.hp + IV) * level) / 100) + level + 10,
      attack: other(base.attack),
      defense: other(base.defense),
      'special-attack': other(base['special-attack']),
      'special-defense': other(base['special-defense']),
      speed: other(base.speed),
    };
  }

  async function combatant(mon, level, label, moveLevel = level) {
    const p = await fetchJson(`${API}/pokemon/${mon.id}`);
    const moves = await learnset(p, moveLevel);
    const types = p.types.map((t) => t.type.name);
    await Promise.all([...new Set([...types, ...moves.map((m) => m.type)])].map(getTypeChart));
    const stats = calcStats(p, level);
    return {
      p, label, level, types, moves, stats,
      species: title(p.name),
      hp: stats.hp,
      maxHp: stats.hp,
      stages: { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0 },
    };
  }

  const staged = (c, stat) => {
    const st = c.stages[stat];
    return c.stats[stat] * (st >= 0 ? (2 + st) / 2 : 2 / (2 - st));
  };

  // ---------- Battle: UI ----------
  /** HUD for one side. `slots` (that side's team) adds a row of Poké Ball icons when there is more than one. */
  function hudNode(c, showNumbers, slots) {
    const frag = document.createDocumentFragment();
    const head = el('div', 'hud-head');
    head.append(el('span', 'hud-name', c.label), el('span', 'hud-level', `Lv${c.level}`));
    const track = el('div', 'hp-track');
    const fill = el('span', 'hp-fill');
    track.append(fill);
    const row = el('div', 'hud-hp');
    row.append(el('span', 'hud-hp-label', 'HP'), track);
    frag.append(head, row);
    if (showNumbers) frag.append(el('div', 'hp-text'));
    if (slots && slots.length > 1) {
      const balls = el('div', 'hud-balls');
      balls.append(...slots.map(() => el('span', 'hud-ball')));
      frag.append(balls);
    }
    return frag;
  }

  function updateHud(hud, c, slots) {
    const fill = hud.querySelector('.hp-fill');
    const pct = (c.hp / c.maxHp) * 100;
    fill.style.width = `${pct}%`;
    fill.classList.toggle('low', pct <= 20);
    fill.classList.toggle('mid', pct > 20 && pct <= 50);
    const text = hud.querySelector('.hp-text');
    if (text) text.textContent = `${c.hp} / ${c.maxHp}`;
    const balls = hud.querySelector('.hud-balls');
    if (balls && slots) {
      const left = slots.filter((sl) => !sl.fainted).length;
      balls.setAttribute('aria-label', `${left} of ${slots.length} Pokémon left`);
      balls.title = balls.getAttribute('aria-label');
      [...balls.children].forEach((b, i) => b.classList.toggle('out', !!slots[i].fainted));
    }
  }

  function setSprite(img, p, back) {
    const sp = p.sprites;
    const candidates = back
      ? [sp.other?.showdown?.back_default, sp.back_default]
      : [sp.other?.showdown?.front_default, sp.front_default];
    const list = [...candidates.filter(Boolean), artUrl(p.id)];
    let i = 0;
    img.onerror = () => {
      i += 1;
      if (i < list.length) img.src = list[i];
      else img.onerror = null;
    };
    img.src = list[0];
    img.classList.toggle('art-fallback', !candidates.some(Boolean));
  }

  /** Put a combatant on one side of the field: HUD, sprite, alt text. */
  function showCombatant(isAlly, c, slots) {
    const hud = isAlly ? allyHud : foeHud;
    const img = isAlly ? allySprite : foeSprite;
    hud.replaceChildren(hudNode(c, isAlly, slots));
    updateHud(hud, c, slots);
    setSprite(img, c.p, isAlly);
    img.alt = c.label;
    img.classList.remove('faint', 'hidden', 'captured');
  }

  function enterBattle(bt) {
    stageEl.className = 'stage bg-battle';
    castEl.replaceChildren();
    monEl.hidden = true;
    battleEl.hidden = false;
    showCombatant(false, bt.foe.c, bt.foe.balls);
    showCombatant(true, bt.ally.c, bt.ally.slots);
    allySprite.classList.add('hidden');
    foeBall.hidden = true;
  }

  function leaveBattle() {
    battleEl.hidden = true;
  }

  // ---------- Battle: rules ----------
  async function useMove(att, def, move, sides) {
    const attImg = sides.imgOf(att);
    const defImg = sides.imgOf(def);
    if (move.pp !== Infinity) move.pp -= 1;
    await say(null, `${att.label} used ${move.label}!`, 900);

    // Accuracy check, adjusted by the attacker's accuracy and defender's evasion stages.
    if (move.accuracy != null && !move.self) {
      const st = Math.max(-6, Math.min(6, att.stages.accuracy - def.stages.evasion));
      const mult = st >= 0 ? (3 + st) / 3 : 3 / (3 - st);
      if (Math.random() * 100 >= move.accuracy * mult) {
        await say(null, `${att.label}'s attack missed!`, 1000);
        return;
      }
    }

    flash(attImg, sides.isAlly(att) ? 'lunge-ally' : 'lunge-foe', 450);
    await sleep(250);

    if (move.cls !== 'status') {
      const mult = move.type === 'typeless' ? 1 : effectiveness(move.type, def.types);
      if (mult === 0) {
        await say(null, `It doesn't affect ${def.label}…`, 1100);
        return;
      }
      const physical = move.cls === 'physical';
      const a = staged(att, physical ? 'attack' : 'special-attack');
      const d = staged(def, physical ? 'defense' : 'special-defense');
      const crit = Math.random() < 1 / 24;
      const stab = att.types.includes(move.type) ? 1.5 : 1;
      const roll = 0.85 + Math.random() * 0.15;
      const base = Math.floor(Math.floor((Math.floor((2 * att.level) / 5 + 2) * move.power * a) / d) / 50) + 2;
      const dmg = Math.max(1, Math.floor(base * stab * mult * (crit ? 1.5 : 1) * roll));
      def.hp = Math.max(0, def.hp - dmg);
      // Hero moment: once per chapter, your partner survives a knockout blow.
      const lastStand = def.hp === 0 && sides.isAlly(def) && sides.claimLastStand();
      if (lastStand) def.hp = 1;
      flash(defImg, 'hurt', 500);
      if (mult > 1) flash(stageEl, 'shake', 400);
      sides.update();
      await sleep(500);
      if (crit) await say(null, 'A critical hit!', 900);
      if (mult > 1) await say(null, 'It\'s super effective!', 1000);
      else if (mult < 1) await say(null, 'It\'s not very effective…', 1000);
      if (lastStand) {
        await say(null, `${def.label} hung on! ${def.label} refused to give up on ${s.player}!`, 1600);
        const healed = Math.min(def.maxHp - def.hp, Math.ceil(def.maxHp * LAST_STAND_HEAL));
        def.hp += healed;
        sides.update();
        flash(defImg, 'buff', 700);
        await say(null, `${def.label} recovered ${healed} HP!`, 1200);
      }
    }

    if (move.statChance < 100 && Math.random() * 100 >= move.statChance) return;
    for (const { stat, change } of move.statChanges) {
      const target = move.statSelf ? att : def;
      const before = target.stages[stat];
      target.stages[stat] = Math.max(-6, Math.min(6, before + change));
      const moved = target.stages[stat] - before;
      const what = `${target.label}'s ${STAT_LABEL[stat] || stat}`;
      if (!moved) await say(null, `${what} won't go any ${change > 0 ? 'higher' : 'lower'}!`, 1000);
      else {
        flash(sides.imgOf(target), change > 0 ? 'buff' : 'debuff', 700);
        await say(null, `${what} ${Math.abs(moved) > 1 ? 'sharply ' : ''}${moved > 0 ? 'rose' : 'fell'}!`, 1000);
      }
    }
  }

  /** Foe AI. 'wild' picks any move at random, like the games. 'trainer' plays the best move but
   * sometimes slips up. 'smart' (the rival) always favours damage by expected value, with a dash of randomness. */
  function foeMove(foe, ally, style) {
    const usable = foe.moves.filter((m) => m.pp > 0);
    if (!usable.length) return STRUGGLE;
    const pickAny = () => usable[Math.floor(Math.random() * usable.length)];
    if (style === 'wild' || (style === 'trainer' && Math.random() < TRAINER_SLIP)) return pickAny();
    const score = (m) => {
      if (m.cls === 'status') {
        const target = m.self ? foe : ally;
        const worth = m.statChanges.some(({ stat, change }) =>
          change > 0 ? target.stages[stat] < 2 : target.stages[stat] > -2);
        return worth ? 30 : 0;
      }
      const stab = foe.types.includes(m.type) ? 1.5 : 1;
      return m.power * stab * effectiveness(m.type, ally.types) * ((m.accuracy || 100) / 100);
    };
    let best = usable[0];
    let bestScore = -1;
    for (const m of usable) {
      const sc = score(m) * (0.6 + Math.random() * 0.8);
      if (sc > bestScore) { best = m; bestScore = sc; }
    }
    return best;
  }

  /** Player's turn menu. Resolves to { kind: 'move', move }, { kind: 'item', key, slot? },
   * { kind: 'ball', key }, { kind: 'switch', slot } or { kind: 'run' }. The bottom row is Bag, Team
   * and, in wild battles only, Run (it can't be used against trainers or a boss, so it isn't shown). */
  async function playerAction(bt) {
    const ally = bt.ally.c;
    const foe = bt.foe.c;
    for (;;) {
      await show(null, `What will ${ally.label} do?`);
      const usable = ally.moves.filter((m) => m.pp > 0);
      const moves = usable.length ? ally.moves : [STRUGGLE];
      const items = [...moves.map((m) => ({ kind: 'move', move: m })), { kind: 'bag' }, { kind: 'team' },
        ...(bt.canRun ? [{ kind: 'run' }] : [])];
      const canSwap = bt.ally.slots.some((sl) => !sl.fainted && sl !== bt.ally.slot);
      const count = (...keys) => keys.reduce((n, k) => n + (s.bag[k] || 0), 0);
      const i = await choose(items, {
        cls: `choices-moves choices-battle${bt.canRun ? '' : ' no-run'}`,
        build: (btn, n) => {
          const it = items[n];
          if (it.kind === 'move') {
            const m = it.move;
            btn.classList.add('move', `type-${m.type}`);
            btn.disabled = m.pp <= 0;
            const eff = m.cls === 'status' ? '' : effectiveness(m.type, foe.types);
            btn.append(
              el('span', 'move-name', m.label),
              el('span', 'move-meta',
                `${title(m.type)} · ${m.cls === 'status' ? 'Status' : `Pow ${m.power}`}` +
                `${m.pp === Infinity ? '' : ` · PP ${m.pp}/${m.maxPp}`}`),
            );
            if (eff !== '' && eff !== 1) btn.append(el('span', 'move-hint', eff > 1 ? 'Super effective' : eff === 0 ? 'No effect' : 'Not very effective'));
          } else if (it.kind === 'bag') {
            btn.classList.add('move', 'move-bag', 'move-extra');
            btn.disabled = !count(...ITEM_KEYS);
            btn.append(el('span', 'move-name', 'Bag'),
              el('span', 'move-meta', `Heal ×${count('potion', 'superpotion')} · Ball ×${count('pokeball', 'greatball')}`));
          } else if (it.kind === 'team') {
            btn.classList.add('move', 'move-team', 'move-extra');
            btn.disabled = !canSwap;
            btn.append(el('span', 'move-name', 'Team'),
              el('span', 'move-meta', canSwap ? 'Swap Pokémon' : 'No one to swap in'));
          } else {
            btn.classList.add('move', 'move-run', 'move-extra');
            btn.append(el('span', 'move-name', 'Run'), el('span', 'move-meta', 'Escape the battle'));
          }
        },
      });
      const pick = items[i];
      if (pick.kind === 'bag') {
        const item = await bagMenu(bt);
        if (item) return item;
        continue;
      }
      if (pick.kind === 'team') {
        const slot = await teamMenu(bt, true);
        if (slot) return { kind: 'switch', slot };
        continue;
      }
      return pick;
    }
  }

  /** Team submenu: every Pokémon with its HP; fainted ones and the one already out are greyed.
   * With `canGoBack` (a switch on your turn) there is a Back button and null means "go back".
   * Without it (your Pokémon fainted) you must pick someone. */
  async function teamMenu(bt, canGoBack) {
    const slots = bt.ally.slots;
    await show(null, canGoBack ? 'Who do you want to send out?' : 'Who will you send out next?');
    const items = [...slots, ...(canGoBack ? [null] : [])];
    const i = await choose(items, {
      cls: 'choices-moves choices-team',
      build: (btn, n) => {
        const sl = items[n];
        if (!sl) {
          btn.classList.add('move', 'move-run');
          btn.append(el('span', 'move-name', 'Back'), el('span', 'move-meta', 'Return to moves'));
          return;
        }
        const out = sl === bt.ally.slot && !sl.fainted;
        const hp = sl.c ? sl.c.hp : null;
        const maxHp = sl.c ? sl.c.maxHp : null;
        btn.classList.add('move', 'move-member');
        btn.disabled = sl.fainted || out;
        const track = el('span', 'hp-track');
        const bar = el('span', 'hp-fill');
        const pct = sl.c ? (hp / maxHp) * 100 : 100;
        bar.style.width = `${pct}%`;
        bar.classList.toggle('low', pct <= 20);
        bar.classList.toggle('mid', pct > 20 && pct <= 50);
        track.append(bar);
        const state = sl.fainted ? 'Fainted' : out ? 'In battle' : sl.c ? `HP ${hp}/${maxHp}` : 'HP full';
        btn.append(
          el('span', 'move-name', monName(sl.mon)),
          el('span', 'move-meta', `Lv${sl.mon.level} · ${state}`),
          track,
        );
      },
    });
    return items[i];
  }

  /** Bag submenu: Potion and Poké Ball always, other items once you have some, then Back.
   * Resolves to an action, or null to go back to the move menu. */
  async function bagMenu(bt) {
    const ally = bt.ally.c;
    const fainted = bt.ally.slots.filter((sl) => sl.fainted);
    const why = (k) => {
      if (ITEMS[k].ball && bt.boss) return 'This one can\'t be caught';
      if (k === 'revive' && !fainted.length) return 'No one has fainted';
      return null;
    };
    const keys = ITEM_KEYS.filter((k) => k === 'potion' || k === 'pokeball' || s.bag[k] > 0);
    const items = [...keys, 'back'];
    await show(null, 'Use which item?');
    const i = await choose(items, {
      cls: 'choices-moves',
      build: (btn, n) => {
        const k = items[n];
        if (k === 'back') {
          btn.classList.add('move', 'move-run');
          btn.append(el('span', 'move-name', 'Back'), el('span', 'move-meta', 'Return to moves'));
          return;
        }
        btn.classList.add('move', 'move-bag');
        btn.disabled = !!why(k) || !s.bag[k];
        btn.append(el('span', 'move-name', ITEMS[k].name), el('span', 'move-meta', why(k) || `×${s.bag[k] || 0} · ${ITEMS[k].about}`));
      },
    });
    const key = items[i];
    if (key === 'back') return null;
    const it = ITEMS[key];
    if (it.heal) {
      if (ally.hp === ally.maxHp) {
        await say(null, 'It won\'t have any effect.', 1200);
        return null;
      }
      return { kind: 'item', key };
    }
    if (key === 'xattack') {
      if (ally.stages.attack >= 6 && ally.stages['special-attack'] >= 6) {
        await say(null, 'It won\'t have any effect.', 1200);
        return null;
      }
      return { kind: 'item', key };
    }
    if (key === 'revive') {
      const slot = fainted.length === 1 ? fainted[0] : await reviveMenu(fainted);
      return slot ? { kind: 'item', key, slot } : null;
    }
    if (!bt.canCatch) {
      await say(null, bt.boss ? `${bt.foe.c.species} is too strong to catch! Battle it instead!` : 'The trainer blocked the Ball! Don\'t be a thief!', 1400);
      return null;
    }
    if (teamFull()) {
      await say(null, `Your team is full! You can have ${TEAM_MAX} Pokémon at most.`, 1500);
      return null;
    }
    return { kind: 'ball', key };
  }

  /** Who gets the Revive: the fainted team members, then Back (null). */
  async function reviveMenu(fainted) {
    await show(null, 'Who should wake up?');
    const items = [...fainted, null];
    const i = await choose(items, {
      cls: 'choices-moves choices-team',
      build: (btn, n) => {
        const sl = items[n];
        btn.classList.add('move', sl ? 'move-member' : 'move-run');
        if (sl) btn.append(el('span', 'move-name', monName(sl.mon)), el('span', 'move-meta', `Lv${sl.mon.level} · Fainted`));
        else btn.append(el('span', 'move-name', 'Back'), el('span', 'move-meta', 'Return to the bag'));
      },
    });
    return items[i];
  }

  /** Using an item takes your turn. */
  async function useItem(bt, att, act) {
    const it = ITEMS[act.key];
    s.bag[act.key] -= 1;
    if (it.heal) {
      const healed = Math.min(it.heal, att.maxHp - att.hp);
      att.hp += healed;
      bt.update();
      flash(allySprite, 'buff', 700);
      await say(null, `${s.player} used a ${it.name}! ${att.label} recovered ${healed} HP.`, 1300);
    } else if (act.key === 'revive') {
      const c = act.slot.c;
      act.slot.fainted = false;
      c.hp = Math.max(1, Math.floor(c.maxHp / 2));
      bt.update();
      await say(null, `${s.player} used a Revive! ${c.label} woke up and can battle again!`, 1500);
    } else if (act.key === 'xattack') {
      for (const st of ['attack', 'special-attack']) att.stages[st] = Math.min(6, att.stages[st] + 1);
      flash(allySprite, 'buff', 700);
      await say(null, `${s.player} used an X Attack! ${att.label}'s Attack and Sp. Atk rose!`, 1400);
    }
  }

  /** Faster Pokémon always get away; slower ones have an even chance each try. */
  async function tryRun(ally, foe) {
    const ok = staged(ally, 'speed') >= staged(foe, 'speed') || Math.random() < 0.5;
    await say(null, ok ? 'Got away safely!' : 'Can\'t escape!', 1100);
    return ok;
  }

  const BREAK_FREE = ['Oh no! The Pokémon broke free!', 'Aww! It appeared to be caught!', 'Aargh! Almost had it!', 'Shoot! It was so close, too!'];

  /** Gen III capture formula: lower HP and a higher species capture rate mean more shakes.
   * CATCH_BONUS makes every ball weaker than in the games; a Great Ball is 1.5 times better. */
  async function throwBall(bt, foe, key) {
    const ball = ITEMS[key];
    s.bag[key] -= 1;
    await say(null, `${s.player} threw a ${ball.name}!`, 800);
    const bonus = CATCH_BONUS * ball.ball;
    const a = Math.floor(((3 * foe.maxHp - 2 * foe.hp) * foe.captureRate * bonus) / (3 * foe.maxHp));
    const shakeOdds = a >= 255 ? 1 : 1048560 / Math.sqrt(Math.sqrt(16711680 / Math.max(1, a))) / 65536;
    let shakes = 0;
    while (shakes < 4 && Math.random() < shakeOdds) shakes += 1;

    foeSprite.classList.add('captured');
    foeBall.hidden = false;
    flash(foeBall, 'ball-drop', 500);
    await sleep(700);
    for (let n = 0; n < Math.min(shakes, 3); n += 1) {
      flash(foeBall, 'ball-wobble', 600);
      await sleep(900);
    }
    if (shakes === 4) {
      flash(foeBall, 'ball-lock', 700);
      await say(null, `Gotcha! ${foe.species} was caught!`, 1600);
      return true;
    }
    foeBall.hidden = true;
    foeSprite.classList.remove('captured');
    flash(foeSprite, 'enter', 500);
    await say(null, BREAK_FREE[shakes], 1300);
    // Once per battle, a reminder of how catching works.
    if (!bt.catchTip && foe.hp > foe.maxHp / 2) {
      bt.catchTip = true;
      await say(null, `${foe.species} still has lots of energy. Make it weaker first, then throw!`, 1600);
    }
    return false;
  }

  /** The opponent: the rival's starter unless `pr.foe` names a species id, a list to pick from, or a function. */
  function pickFoe(pr) {
    if (!pr.foe) return { id: s.rivalMon.id };
    let id = typeof pr.foe === 'function' ? pr.foe(s) : pr.foe;
    if (Array.isArray(id)) id = id[Math.floor(Math.random() * id.length)];
    return { id };
  }

  /** `level` is a number, a [min, max] range, or a function of the story state. */
  function pickLevel(level) {
    const lv = typeof level === 'function' ? level(s) : level;
    if (!Array.isArray(lv)) return lv;
    return lv[0] + Math.floor(Math.random() * (lv[1] - lv[0] + 1));
  }

  /** The foe's side as [{ id, level }]: `pr.team` in order (trainers with several Pokémon),
   * else the single Pokémon from `pr.foe` / `pr.level`. */
  function foeTeam(pr) {
    if (pr.team) {
      const list = typeof pr.team === 'function' ? pr.team(s) : pr.team;
      if (!list || !list.length) throw new Error('Battle `team` is empty');
      return list.map((t) => ({ id: t.id, level: pickLevel(t.level) }));
    }
    return [{ id: pickFoe(pr).id, level: pickLevel(pr.level) }];
  }

  let battleOn = false; // true while a battle runs (the Team screen says changes wait for the next one)

  /** Set up the battle: both sides as lists of slots. Combatants are built lazily on first send-out. */
  function newBattle(pr) {
    const wild = !pr.trainer;
    const trainer = wild ? '' : fill(CAST[pr.trainer].name);
    const foeSlots = foeTeam(pr).map((f) => ({ id: f.id, level: f.level, c: null, fainted: false, battled: false }));
    const allySlots = team().map((mon) => ({ mon, c: null, fainted: false, battled: false }));
    if (!allySlots.length) throw new Error('No Pokémon to battle with');
    const side = (slots) => ({ slots, slot: null, get c() { return this.slot && this.slot.c; } });
    const boss = !!pr.boss;
    const bt = {
      pr, wild, trainer, boss,
      canRun: wild && !boss, // bosses: no running, no Poké Balls, and shard powers apply
      canCatch: wild && !boss,
      started: false, // after the intro, slow builds show a "getting ready" line
      firstOut: true, // the first Pokémon you send out gets the comeback boost
      ai: pr.ai || (wild ? 'wild' : pr.trainer === 'rival' ? 'smart' : 'trainer'),
      foeMods: pr.foeMods ? pr.foeMods(s) : null,
      ally: side(allySlots),
      foe: side(foeSlots),
      // The interface useMove needs.
      isAlly: (c) => c === bt.ally.c,
      imgOf: (c) => (c === bt.ally.c ? allySprite : foeSprite),
      update: () => { updateHud(allyHud, bt.ally.c, bt.ally.slots); updateHud(foeHud, bt.foe.c, bt.foe.balls); },
      claimLastStand: () => {
        const key = `${chapter().id}:lastStand`;
        if (s.flags[key]) return false;
        s.flags[key] = true;
        return true;
      },
    };
    bt.foe.balls = wild ? null : foeSlots; // wild Pokémon don't show a team row
    return bt;
  }

  async function makeCombatant(bt, slot, isAlly) {
    if (isAlly) return combatant(slot.mon, slot.mon.level, monName(slot.mon));
    const fml = bt.pr.foeMoveLevel;
    const c = await combatant({ id: slot.id }, slot.level, '', fml != null ? Math.min(fml, slot.level) : slot.level);
    c.label = bt.boss && bt.wild ? c.species : bt.wild ? `Wild ${c.species}` : `${bt.trainer}'s ${c.species}`;
    if (bt.wild) c.captureRate = (await fetchJson(`${API}/pokemon-species/${slot.id}`)).capture_rate;
    return c;
  }

  /** Build a slot's combatant the first time it is needed. Mid-battle, a slow fetch shows a line,
   * and a failed one offers "Try again" instead of restarting the battle. */
  async function buildSlot(bt, slot, isAlly) {
    while (!slot.c) {
      const name = isAlly ? monName(slot.mon) : `${bt.trainer || 'The wild'}'s next Pokémon`;
      const timer = bt.started ? setTimeout(() => setStatus(`Getting ${name} ready…`), SLOW_LOAD_MS) : null;
      try {
        slot.c = await makeCombatant(bt, slot, isAlly);
      } catch (err) {
        if (!bt.started) throw err;
        clearTimeout(timer);
        console.error(err);
        setStatus(`Something went wrong: ${err.message}`, true);
        await choose(['Try again']);
      } finally {
        clearTimeout(timer);
        if (bt.started) setStatus('');
      }
    }
    return slot.c;
  }

  /** Stat stages a Pokémon starts with each time it comes out. This is the one place battle-start
   * boosts live: story choices (`foeMods`) for every foe, and the comeback boost for the first
   * Pokémon you send out. Each entry is { mods: { stat: change }, line? }; with a `line`, that one
   * line is said for the whole entry, otherwise one line per stat. In a `boss` battle, shard
   * powers are added too: team boosts for each of your Pokémon every time it comes out (stages
   * reset on a switch, so they come back), boss drops for the foe. */
  function entryBoosts(bt, isAlly) {
    const list = [];
    if (!isAlly && bt.foeMods) list.push({ mods: bt.foeMods });
    if (bt.boss) {
      const mods = shardMods(isAlly ? 'team' : 'boss');
      const names = Object.keys(mods).map((k) => STAT_LABEL[k]);
      if (names.length) {
        list.push({
          mods,
          line: (c) => `The shards shine on ${c.label}! Its ${joinNames(names)} ${isAlly ? 'rose' : 'fell'}!`,
          down: !isAlly,
        });
      }
    }
    if (isAlly && bt.firstOut) {
      bt.firstOut = false;
      // Comeback: losing a battle fires your first Pokémon up for the next one.
      if (s.flags.comeback) {
        delete s.flags.comeback;
        list.push({
          mods: { attack: 1, 'special-attack': 1 },
          line: (c) => `${c.label} is fired up after last time! Its Attack and Sp. Atk rose!`,
        });
      }
    }
    return list;
  }

  async function applyEntry(bt, isAlly) {
    const c = isAlly ? bt.ally.c : bt.foe.c;
    const img = isAlly ? allySprite : foeSprite;
    for (const { mods, line, down } of entryBoosts(bt, isAlly)) {
      const entries = Object.entries(mods || {}).filter(([, change]) => change);
      for (const [stat, change] of entries) c.stages[stat] = Math.max(-6, Math.min(6, c.stages[stat] + change));
      if (line) {
        flash(img, down ? 'debuff' : 'buff', 700);
        await say(null, line(c), 1500);
      } else {
        for (const [stat, change] of entries) {
          flash(img, change > 0 ? 'buff' : 'debuff', 700);
          await say(null, `${c.label}'s ${STAT_LABEL[stat] || stat} ${change > 0 ? 'rose' : 'fell'}!`, 1100);
        }
      }
    }
  }

  /** Summed stat stages from every held shard for one side: 'team' or 'boss'. */
  function shardMods(side) {
    const mods = {};
    for (const k of heldShards()) {
      for (const [stat, change] of Object.entries(SHARDS[k][side] || {})) mods[stat] = (mods[stat] || 0) + change;
    }
    return mods;
  }

  /** Boss battle start: the shards glow, and the Tide Shard adds its Potions (once per battle). */
  async function shardStart(bt) {
    if (!bt.boss || !s.shards.length || bt.shardsDone) return;
    bt.shardsDone = true;
    await say(null, s.shards.length === 1 ? 'Your shard glows!' : 'Your shards glow!', 1200);
    // Tide Potions come once per boss (the first try), so retries can't pile them up.
    const tideKey = `${chapter().id}:${s.scene}:tide`;
    const potions = s.flags[tideKey] ? 0 : heldShards().reduce((n, k) => n + (SHARDS[k].potions || 0), 0);
    if (potions) {
      s.flags[tideKey] = true;
      s.bag.potion = (s.bag.potion || 0) + potions;
      await say(null, `The Tide Shard gave you ${potions} Potions!`, 1400);
    }
  }

  const resetStages = (c) => { for (const k of Object.keys(c.stages)) c.stages[k] = 0; };

  /** Send one of your Pokémon out: "Go! Sparky!", then its entry boosts. */
  async function sendAlly(bt, slot) {
    const c = await buildSlot(bt, slot, true);
    bt.ally.slot = slot;
    slot.battled = true;
    showCombatant(true, c, bt.ally.slots);
    flash(allySprite, 'enter', 500);
    await say(null, `Go! ${c.label}!`, 1000);
    await applyEntry(bt, true);
  }

  /** The trainer sends out their next Pokémon, in order. */
  async function sendFoe(bt, slot, announce = true) {
    const c = await buildSlot(bt, slot, false);
    bt.foe.slot = slot;
    slot.battled = true;
    s.lastFoe = { id: slot.id, species: c.species, level: slot.level };
    if (announce) {
      showCombatant(false, c, bt.foe.balls);
      flash(foeSprite, 'enter', 500);
      await say(null, bt.wild ? `Another wild ${c.species} appeared!` : `${bt.trainer} sent out ${c.species}!`, 1200);
    }
    await applyEntry(bt, false);
  }

  /** Your turn spent on a switch. Stat changes wear off when a Pokémon comes back; its HP stays. */
  async function switchAlly(bt, slot) {
    const old = bt.ally.c;
    await say(null, `${old.label}, come back!`, 900);
    resetStages(old);
    allySprite.classList.add('hidden');
    await sleep(300);
    await sendAlly(bt, slot);
  }

  /** After each turn: fainted Pokémon leave, the next ones come out. Returns 'win', 'lose' or null. */
  async function afterTurn(bt) {
    if (bt.foe.c.hp <= 0) {
      bt.foe.slot.fainted = true;
      foeSprite.classList.add('faint');
      bt.update();
      await say(null, `${bt.foe.c.label} fainted!`, 1200);
      const next = bt.foe.slots.find((sl) => !sl.fainted);
      if (!next) return 'win';
      await sendFoe(bt, next);
    }
    if (bt.ally.c.hp <= 0) {
      bt.ally.slot.fainted = true;
      resetStages(bt.ally.c);
      allySprite.classList.add('faint');
      bt.update();
      await say(null, `${bt.ally.c.label} fainted!`, 1200);
      const left = bt.ally.slots.filter((sl) => !sl.fainted);
      if (!left.length) return 'lose';
      // A free switch: it doesn't use up your turn.
      const pick = left.length === 1 ? left[0] : await teamMenu(bt, false);
      await sendAlly(bt, pick);
    }
    return null;
  }

  async function promptBattle(pr) {
    // No trainer means a wild Pokémon: you can run, and throw Poké Balls.
    const bt = newBattle(pr);
    const { wild, trainer } = bt;
    setStatus(wild ? 'Something rustles nearby…' : 'Getting ready to battle…');
    music.play(bt.boss ? 'boss' : wild ? 'wild' : 'trainer');
    battleOn = true;
    try {
      bt.ally.slot = bt.ally.slots[0];
      bt.foe.slot = bt.foe.slots[0];
      await buildSlot(bt, bt.ally.slot, true);
      await buildSlot(bt, bt.foe.slot, false);
      s.lastFoe = { id: bt.foe.slot.id, species: bt.foe.c.species, level: bt.foe.slot.level };
      setStatus('');

      enterBattle(bt);
      if (bt.boss && wild) {
        await say(null, `${bt.foe.c.species} appeared! This is the big one!`, 1400);
      } else if (wild) {
        await say(null, `A wild ${bt.foe.c.species} appeared!`, 1400);
      } else {
        await say(null, `${trainer} wants to battle!`, 1400);
        await say(null, `${trainer} sent out ${bt.foe.c.species}!`, 1200);
      }
      await shardStart(bt);
      // Story choices (and shards, in a boss battle) can leave the foe starting with stat stages raised or lowered.
      await sendFoe(bt, bt.foe.slot, false);
      await sendAlly(bt, bt.ally.slot);
      bt.started = true;

      const outcome = await battleLoop(bt);

      // Keyed by scene, so a chapter can look back at any of its battles (ch1:battle, ch2:ambush…).
      s.flags[`${chapter().id}:${s.scene}`] = outcome;

      // The battle music stops; the next scene starts its own.
      music.stop();
      if (outcome === 'win' || outcome === 'caught') music.jingle(outcome === 'win' ? 'victory' : 'caught');
      if (outcome === 'caught') {
        const f = bt.foe;
        addToTeam({ id: f.slot.id, species: f.c.species, types: f.c.types, nickname: null, level: f.slot.level });
      } else if (outcome === 'win') {
        if (!wild) await say(null, `${s.player} defeated ${trainer}!`, 1400);
        // Everyone who battled grows (fainted ones too): 1 level, or SHARD_BOSS_LEVELS after a
        // shard boss (`shardBoss: true`), never past the chapter's cap.
        const gain = (typeof pr.shardBoss === 'function' ? pr.shardBoss(s) : pr.shardBoss) ? SHARD_BOSS_LEVELS : 1;
        const held = [];
        for (const sl of bt.ally.slots) if (sl.battled && !(await levelUp(sl, gain))) held.push(sl);
        if (held.length) {
          const names = joinNames(held.map((sl) => sl.c.label));
          await say(null, held.length === 1 ? `${names} is as strong as it can be for now!` : `${names} are as strong as they can be for now!`, 1400);
        }
      } else if (outcome === 'lose') {
        s.flags.comeback = true;
        const who = bt.ally.slots.length > 1 ? 'the team' : bt.ally.c.label;
        await say(null, wild ? `${s.player} scooped up ${who} and hurried away…` : `${s.player} lost to ${trainer}…`, 1400);
      }
      // Everyone is fully healed after each battle: combatants are rebuilt fresh next time.
      save();
      leaveBattle();
      const next = { win: pr.win, lose: pr.lose, run: pr.run ?? pr.lose, caught: pr.caught ?? pr.win }[outcome];
      return resolveNext(next);
    } finally {
      battleOn = false;
    }
  }

  /** Turns until someone wins, the player runs or a catch works. */
  async function battleLoop(bt) {
    for (;;) {
      const ally = bt.ally.c;
      const foe = bt.foe.c;
      const action = await playerAction(bt);
      // The foe picks its move against the Pokémon it can see now, even if you switch.
      const foeAct = { kind: 'move', move: foeMove(foe, ally, bt.ai) };

      // Items, switches, Poké Balls and running go first, then higher priority, then higher speed; ties are a coin flip.
      const order = (act) => (act.kind === 'move' ? act.move.priority : 10);
      const allyFirst = order(action) !== order(foeAct)
        ? order(action) > order(foeAct)
        : staged(ally, 'speed') !== staged(foe, 'speed')
          ? staged(ally, 'speed') > staged(foe, 'speed')
          : Math.random() < 0.5;
      const turns = allyFirst ? [[true, action], [false, foeAct]] : [[false, foeAct], [true, action]];

      for (const [isAlly, act] of turns) {
        // Looked up each time: a switch changes who the foe's attack hits.
        const att = isAlly ? bt.ally.c : bt.foe.c;
        const def = isAlly ? bt.foe.c : bt.ally.c;
        if (att.hp <= 0 || def.hp <= 0) break;
        if (act.kind === 'item') {
          await useItem(bt, att, act);
        } else if (act.kind === 'ball') {
          if (await throwBall(bt, def, act.key)) return 'caught';
        } else if (act.kind === 'run') {
          if (await tryRun(att, def)) return 'run';
        } else if (act.kind === 'switch') {
          await switchAlly(bt, act.slot);
        } else {
          await useMove(att, def, act.move, bt);
        }
      }
      const result = await afterTurn(bt);
      if (result) return result;
    }
  }

  /** The current chapter's `levelCap`: wins stop levelling at it (no cap: LEVEL_MAX). */
  const levelCap = () => Math.min(LEVEL_MAX, chapter()?.levelCap || LEVEL_MAX);

  /** One team member grows `gain` levels after a win, and may learn new moves. Returns false when the
   * chapter's level cap held any of it back (nothing is lowered, even for an old save above it). */
  async function levelUp(slot, gain = 1) {
    const c = slot.c;
    if (slot.mon.level >= LEVEL_MAX) return true;
    const n = Math.min(gain, levelCap() - slot.mon.level);
    if (n <= 0) return false;
    const before = new Set(c.moves.map((m) => m.name));
    slot.mon.level += n;
    await say(null, n === 1 ? `${c.label} grew to Lv. ${slot.mon.level}!` : `${c.label} grew ${n} levels! Now Lv. ${slot.mon.level}.`, 1400);
    const after = await learnset(c.p, slot.mon.level);
    for (const m of after) {
      if (!before.has(m.name)) await say(null, `${c.label} learned ${m.label}!`, 1400);
    }
    return n === gain;
  }

  // ---------- In-game menu ----------
  let menuReturnFocus = null;
  function toggleMenu(open) {
    showTeamScreen(false);
    if (open) {
      menuReturnFocus = document.activeElement;
      menuNoteEl.textContent = `Progress saves automatically at every scene, ${remoteSaves ? 'to the save database' : 'in this browser'}.`;
      menuEl.hidden = false;
      $('#resume-btn').focus();
    } else {
      menuEl.hidden = true;
      (menuReturnFocus && menuReturnFocus.isConnected ? menuReturnFocus : dialogueEl).focus();
    }
  }
  menuBtn.addEventListener('click', () => toggleMenu(true));

  // ---------- Team screen (in the menu) ----------
  function showTeamScreen(open) {
    menuMainEl.hidden = open;
    teamBoxEl.hidden = !open;
    if (open) {
      renderTeam();
      (teamListEl.querySelector('button') || $('#team-back-btn')).focus();
    }
  }

  function renderTeam(focusPos, focusWhat) {
    const list = team();
    teamNoteEl.textContent = !list.length
      ? 'No Pokémon yet.'
      : battleOn
        ? 'Changes start in your next battle.'
        : 'The leader goes first in every battle.';
    teamListEl.replaceChildren(...list.map((m, pos) => teamRow(m, pos)));
    // Shards appear once the story has shown them (chapter 3), or as soon as you hold one.
    const showShards = s.chapter >= 2 || s.shards.length > 0;
    teamShardsEl.hidden = !showShards;
    teamShardsEl.replaceChildren(...(showShards
      ? [shardBox((n, all) => (n ? `Shards: ${n} of ${all}` : `Shards: none yet (there are ${all} to find)`))]
      : []));
    if (focusPos != null) teamListEl.children[focusPos]?.querySelector(focusWhat || 'button')?.focus();
  }

  function teamRow(m, pos) {
    const li = el('li', 'team-row');
    const art = el('img');
    art.src = artUrl(m.id);
    art.alt = '';
    const info = el('div', 'team-info');
    const types = el('span', 'types');
    for (const t of m.types) types.append(el('span', `type type-${t}`, t));
    info.append(el('strong', '', monName(m)), el('span', 'muted', `Lv ${m.level} · ${m.species}`), types);
    const actions = el('div', 'team-actions');
    if (pos === 0) actions.append(el('span', 'team-lead', 'Leader'));
    else {
      const lead = el('button', 'btn btn-ghost', 'Make leader');
      lead.setAttribute('aria-label', `Make ${monName(m)} the leader`);
      lead.addEventListener('click', () => {
        const [idx] = s.order.splice(pos, 1);
        s.order.unshift(idx);
        save();
        renderTeam(0, '.team-rename');
      });
      actions.append(lead);
    }
    const rename = el('button', 'btn btn-ghost team-rename', 'Rename');
    rename.setAttribute('aria-label', `Rename ${monName(m)}`);
    rename.addEventListener('click', () => renameForm(li, actions, m, pos));
    actions.append(rename);
    li.append(art, info, actions);
    return li;
  }

  /** Swap the row's buttons for a small name form. An empty name goes back to the species name. */
  function renameForm(li, actions, m, pos) {
    const form = el('form', 'name-form team-name-form');
    const input = el('input');
    input.maxLength = NAME_MAX;
    input.value = m.nickname || '';
    input.placeholder = m.species;
    input.setAttribute('aria-label', `New name for ${monName(m)}`);
    const ok = el('button', 'btn', 'OK');
    ok.type = 'submit';
    const cancel = el('button', 'btn btn-ghost', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => renderTeam(pos, '.team-rename'));
    form.append(input, ok, cancel);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      m.nickname = input.value.trim().slice(0, NAME_MAX) || null;
      save();
      renderTeam(pos, '.team-rename');
    });
    actions.replaceWith(form);
    input.focus();
  }

  $('#team-btn').addEventListener('click', () => showTeamScreen(true));
  $('#team-back-btn').addEventListener('click', () => {
    showTeamScreen(false);
    $('#team-btn').focus();
  });
  $('#resume-btn').addEventListener('click', () => toggleMenu(false));
  menuEl.addEventListener('click', (e) => { if (e.target === menuEl) toggleMenu(false); });
  // A snapshot in a new slot, so you can come back and try the other choices. Play carries on in this slot.
  $('#copy-btn').addEventListener('click', async () => {
    try {
      await saving;
      await putSave({ ...JSON.parse(JSON.stringify(s)), slot: newSlotId() });
      menuNoteEl.textContent = 'Saved a copy. Find it under Load game on the title screen.';
    } catch (err) {
      menuNoteEl.textContent = `Couldn't save a copy: ${err.message}`;
    }
  });
  // The scene runner can't be cancelled mid-await, so leaving the game reloads the page.
  async function reloadTo(flag) {
    await saving;
    try { if (flag) sessionStorage.setItem(NEW_GAME_FLAG, flag); } catch { /* storage unavailable */ }
    location.reload();
  }
  $('#menu-load-btn').addEventListener('click', () => reloadTo('load'));
  $('#menu-new-btn').addEventListener('click', () => {
    if (!window.confirm('Start a new game? This game stays in its save slot.')) return;
    reloadTo('new');
  });

  // ---------- Title screen ----------
  function startStory() {
    titleEl.hidden = true;
    storyEl.hidden = false;
    dialogueEl.focus();
  }

  function newGame() {
    s = freshState();
    save();
    startStory();
    playFrom(chapter().start).catch(fatal);
  }

  const isPlayable = (st) => st.scene === '__end' || !!CHAPTERS[st.chapter].scenes[st.scene];

  function continueGame(saved) {
    s = revive(saved);
    hydrateTeam().catch((err) => console.warn('Could not fill in team details', err));
    startStory();
    if (s.scene === '__end') showEnd();
    else playFrom(s.scene).catch(fatal);
  }

  function fatal(err) {
    console.error(err);
    setStatus(`The story hit a snag: ${err.message}`, true);
  }

  function describe(st) {
    const ch = CHAPTERS[st.chapter];
    const who = st.player || 'New trainer';
    const team = teamOf(st).map((m) => `${monName(m)} Lv${m.level}`).join(', ');
    return { who: team ? `${who} · ${team}` : who, where: `${ch.title}: ${ch.subtitle}${st.scene === '__end' ? ' (complete)' : ''}` };
  }

  function ago(iso) {
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
    return new Date(iso).toLocaleDateString();
  }

  async function renderSaveList() {
    saveWhereEl.textContent = remoteSaves
      ? `${player.name}'s games, saved online.`
      : 'Saved in this browser only.';
    let saves;
    try {
      saves = (await listSaves()).filter((x) => isPlayable(x.state));
    } catch (err) {
      saveSlotsEl.replaceChildren(el('li', 'muted', `Couldn't load saves: ${err.message}`));
      return [];
    }
    if (!saves.length) saveSlotsEl.replaceChildren(el('li', 'muted', 'No saved games yet.'));
    else {
      saveSlotsEl.replaceChildren(...saves.map((x) => {
        const d = describe(x.state);
        const li = el('li', 'save-slot');
        const art = el('img');
        art.alt = '';
        if (x.state.mon) art.src = artUrl(x.state.mon.id);
        else art.hidden = true;
        const info = el('div', 'save-info');
        info.append(el('strong', '', d.who), el('span', 'muted', `${d.where} · ${ago(x.updated)}`));
        const load = el('button', 'btn', 'Load');
        load.addEventListener('click', () => continueGame(x.state));
        const del = el('button', 'btn btn-ghost', 'Delete');
        del.setAttribute('aria-label', `Delete save: ${d.who}`);
        del.addEventListener('click', async () => {
          if (!window.confirm(`Delete this save? ${d.who}, ${d.where}. This can't be undone.`)) return;
          try {
            await deleteSave(x.id);
          } catch (err) {
            setStatus(`Couldn't delete that save: ${err.message}`, true);
            return;
          }
          const left = await renderSaveList();
          updateTitle(left);
        });
        li.append(art, info, load, del);
        return li;
      }));
    }
    return saves;
  }

  function updateTitle(saves) {
    loadBtn.hidden = !saves.length;
    if (!saves.length) saveListEl.hidden = true;
  }

  function toggleSaveList(open) {
    saveListEl.hidden = !open;
    loadBtn.setAttribute('aria-expanded', String(open));
    if (open) saveSlotsEl.querySelector('button')?.focus();
  }

  async function initTitle() {
    let flag = null;
    try {
      flag = sessionStorage.getItem(NEW_GAME_FLAG);
      sessionStorage.removeItem(NEW_GAME_FLAG);
    } catch { /* storage unavailable */ }
    newBtn.addEventListener('click', newGame);
    loadBtn.addEventListener('click', () => toggleSaveList(saveListEl.hidden));
    $('#not-me-btn').addEventListener('click', () => {
      try { localStorage.removeItem(PLAYER_KEY); } catch { /* storage unavailable */ }
      location.reload();
    });

    player = await askInvite();
    $('#player-name').textContent = player.name;
    $('#player-line').hidden = false;
    titleEl.hidden = false;
    await initSaves();
    if (flag === 'new') {
      newGame();
      return;
    }
    const saves = await renderSaveList();
    updateTitle(saves);
    if (flag === 'load' && saves.length) toggleSaveList(true);
    else (saves.length ? loadBtn : newBtn).focus();
  }

  initTitle().catch(fatal);
})();
