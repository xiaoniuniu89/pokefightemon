/* Pokédex Fight: two random Pokémon, one winner. Powered by PokéAPI. */
(() => {
  'use strict';

  const API = 'https://pokeapi.co/api/v2';
  const ART = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';
  const MAX_SPECIES = 1025;
  const MAX_STAT = 255;
  const MAX_ROUNDS = 50;

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const statusEl = $('#status');
  const slotA = $('#fighter-a');
  const slotB = $('#fighter-b');
  const fightBtn = $('#fight-btn');
  const nextBtn = $('#next-btn');
  const resultEl = $('#result');
  const resultTitle = $('#result-title');
  const resultSummary = $('#result-summary');
  const logEl = $('#battle-log');

  // ---------- State ----------
  const cache = new Map();       // url -> Promise<json>
  const typeCharts = new Map();  // type name -> damage_relations
  let fighters = null;           // [pokemonA, pokemonB]
  let scales = null;             // [scaleA, scaleB], stat multipliers that even out base stat totals

  // ---------- Helpers ----------
  const pad = (n) => String(n).padStart(4, '0');
  const cap = (s) => s.replace(/-/g, ' ');
  const artUrl = (id) => `${ART}/${id}.png`;
  const randomId = () => 1 + Math.floor(Math.random() * MAX_SPECIES);

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

  const typeBadges = (types) =>
    types.map((t) => `<span class="type type-${t.type.name}">${t.type.name}</span>`).join('');

  const stat = (p, name) => p.stats.find((s) => s.stat.name === name)?.base_stat ?? 50;
  const bst = (p) => p.stats.reduce((sum, s) => sum + s.base_stat, 0);

  // ---------- Balancing ----------
  /**
   * The stronger Pokémon (higher base stat total) has every stat scaled down so its total
   * matches the weaker one. Both then bring the same total power; the spread still differs.
   */
  function balance(a, b) {
    const low = Math.min(bst(a), bst(b));
    return [a, b].map((p) => low / bst(p));
  }

  const pct = (scale) => Math.round(scale * 100);
  const scaled = (p, name, scale) => Math.max(1, Math.round(stat(p, name) * scale));
  /** Battle HP: scaled base HP plus a flat 50 so frail Pokémon survive more than one hit. */
  const battleHp = (p, scale) => scaled(p, 'hp', scale) + 50;

  // ---------- Type effectiveness ----------
  async function getTypeChart(type) {
    if (!typeCharts.has(type)) {
      const data = await fetchJson(`${API}/type/${type}`);
      typeCharts.set(type, data.damage_relations);
    }
    return typeCharts.get(type);
  }

  /** Multiplier for an attack of `attackType` hitting a defender with `defenderTypes`. */
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

  /** Best multiplier the attacker can achieve using any of its own types. */
  function bestEffectiveness(attacker, defender) {
    const defTypes = defender.types.map((t) => t.type.name);
    let best = { type: attacker.types[0].type.name, mult: 0 };
    for (const t of attacker.types) {
      const mult = effectiveness(t.type.name, defTypes);
      if (mult > best.mult) best = { type: t.type.name, mult };
    }
    // Every Pokémon can still land a neutral (non-typed) hit if all its types are walled.
    if (best.mult === 0) best = { type: 'normal', mult: 0.5 };
    return best;
  }

  // ---------- Battle simulation ----------
  function simulate(a, b, [scaleA, scaleB]) {
    const mk = (p, foe, scale) => {
      const s = (name) => scaled(p, name, scale);
      const physical = s('attack') >= s('special-attack');
      const maxHp = battleHp(p, scale);
      return {
        p,
        scale,
        name: cap(p.name),
        hp: maxHp,
        maxHp,
        speed: s('speed'),
        offence: physical ? s('attack') : s('special-attack'),
        defence: { physical: s('defense'), special: s('special-defense') },
        physical,
        eff: bestEffectiveness(p, foe),
      };
    };
    const A = mk(a, b, scaleA);
    const B = mk(b, a, scaleB);

    // Faster Pokémon moves first; speed ties are a coin flip.
    let [first, second] = A.speed > B.speed || (A.speed === B.speed && Math.random() < 0.5) ? [A, B] : [B, A];
    // Every event carries a `text` line for the log plus the data the animator needs.
    const events = [];
    const strong = A.scale < B.scale ? A : B.scale < A.scale ? B : null;
    events.push({
      kind: 'balance', strong,
      text: strong
        ? `${strong.name} is stronger on paper, so it fights at ${pct(strong.scale)}% power to keep it fair.`
        : `Both have the same base stat total; it's an even fight.`,
    });
    events.push({
      kind: 'start',
      first,
      text: first.speed !== second.speed
        ? `${first.name} is faster (${first.speed} vs ${second.speed}) and strikes first.`
        : `Both have speed ${first.speed}; ${first.name} wins the coin flip and strikes first.`,
    });

    const hit = (att, def, round) => {
      const roll = 0.85 + Math.random() * 0.3; // 85%–115%
      const guard = att.physical ? def.defence.physical : def.defence.special;
      const dmg = Math.max(1, Math.round((10 * att.offence / guard) * att.eff.mult * roll));
      def.hp = Math.max(0, def.hp - dmg);
      const note = att.eff.mult > 1 ? ' It\'s super effective!' : att.eff.mult < 1 ? ' It\'s not very effective…' : '';
      events.push({
        kind: 'hit', round, att, def, dmg, mult: att.eff.mult, type: att.eff.type, hpAfter: def.hp,
        text: `Round ${round}: ${att.name} uses a ${att.eff.type} attack for ${dmg} damage.${note} ${def.name} has ${def.hp} HP left.`,
      });
    };

    let round = 0;
    while (A.hp > 0 && B.hp > 0 && round < MAX_ROUNDS) {
      round += 1;
      hit(first, second, round);
      if (second.hp <= 0) break;
      hit(second, first, round);
    }

    let winner, loser;
    if (A.hp <= 0 || B.hp <= 0) {
      winner = A.hp > 0 ? A : B;
      loser = winner === A ? B : A;
    } else {
      // Timed out: whoever kept the larger share of HP wins.
      winner = A.hp / A.maxHp >= B.hp / B.maxHp ? A : B;
      loser = winner === A ? B : A;
      events.push({ kind: 'timeout', text: 'The judges call it on remaining HP.' });
    }
    events.push({ kind: 'faint', loser, text: `${loser.name} fainted!` });
    return { winner, loser, rounds: round, events, log: events.map((e) => e.text) };
  }

  // ---------- Rendering ----------
  function fighterHtml(p, scale) {
    const shown = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];
    const stats = p.stats
      .filter((s) => shown.includes(s.stat.name))
      .map((s) => `
        <div class="stat">
          <span class="k">${cap(s.stat.name).replace('special', 'sp.')}</span>
          <span class="v">${s.base_stat}</span>
          <div class="bar"><span style="width:${(s.base_stat / MAX_STAT) * 100}%"></span></div>
        </div>`).join('');
    return `
      <div class="num">#${pad(p.id)}</div>
      <img src="${p.sprites.other?.['official-artwork']?.front_default || artUrl(p.id)}" alt="${p.name}"
           onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png'" />
      <h2 class="name">${cap(p.name)}${scale < 1 ? ` <span class="power">${pct(scale)}% power</span>` : ''}</h2>
      <div class="hp" aria-hidden="true">
        <div class="hp-track"><span class="hp-fill" style="width:100%"></span></div>
        <span class="hp-text">${battleHp(p, scale)} / ${battleHp(p, scale)} HP</span>
      </div>
      <div class="types">${typeBadges(p.types)}</div>
      <div class="stats">${stats}
        <div class="stat"><span class="k">Base total</span><span class="v">${bst(p)}</span><span></span></div>
      </div>`;
  }

  function placeholderHtml() {
    return `<div class="fighter-placeholder"><span class="pokeball spin" aria-hidden="true"></span></div>`;
  }

  async function loadFighters() {
    fighters = null;
    scales = null;
    fightBtn.disabled = true;
    nextBtn.hidden = true;
    resultEl.hidden = true;
    slotA.classList.remove('winner', 'loser', 'faint');
    slotB.classList.remove('winner', 'loser', 'faint');
    arenaEl.classList.remove('battle');
    say('');
    fightBtn.textContent = 'Fight!';
    slotA.innerHTML = placeholderHtml();
    slotB.innerHTML = placeholderHtml();
    setStatus('Choosing fighters…');

    try {
      let idA = randomId();
      let idB = randomId();
      while (idB === idA) idB = randomId();

      const [a, b] = await Promise.all([
        fetchJson(`${API}/pokemon/${idA}`),
        fetchJson(`${API}/pokemon/${idB}`),
      ]);
      // Preload the type charts needed for effectiveness.
      const typeNames = new Set([...a.types, ...b.types].map((t) => t.type.name));
      await Promise.all([...typeNames].map(getTypeChart));

      fighters = [a, b];
      scales = balance(a, b);
      slotA.innerHTML = fighterHtml(a, scales[0]);
      slotB.innerHTML = fighterHtml(b, scales[1]);
      setStatus('');
      fightBtn.disabled = false;
      fightBtn.focus();
    } catch (err) {
      console.error(err);
      setStatus(`Could not load fighters: ${err.message}`, true);
      nextBtn.hidden = false;
      nextBtn.textContent = 'Try again';
    }
  }

  // ---------- Battle playback ----------
  const arenaEl = $('.arena');
  const commentaryEl = $('#commentary');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let playing = false;
  let skipRequested = false;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  /** Wait unless the user asked to skip; reduced-motion users get a much faster playback. */
  const wait = (ms) => (skipRequested ? Promise.resolve() : sleep(reducedMotion ? Math.min(ms, 120) : ms));

  /** Best in-battle sprite: animated Showdown gif, then classic pixel sprite, then artwork. */
  function battleSprite(p) {
    return p.sprites.other?.showdown?.front_default || p.sprites.front_default || artUrl(p.id);
  }

  function slotOf(fighter) {
    return fighter.p === fighters[0] ? slotA : slotB;
  }

  function setHp(slot, hp, maxHp) {
    const fill = slot.querySelector('.hp-fill');
    const text = slot.querySelector('.hp-text');
    if (!fill) return;
    const pct = (hp / maxHp) * 100;
    fill.style.width = `${pct}%`;
    fill.classList.toggle('low', pct <= 20);
    fill.classList.toggle('mid', pct > 20 && pct <= 50);
    text.textContent = `${hp} / ${maxHp} HP`;
  }

  /** Swap the card art for a battle sprite (or back) without re-rendering the card. */
  function setBattleMode(on) {
    arenaEl.classList.toggle('battle', on);
    fighters.forEach((p, i) => {
      const img = (i === 0 ? slotA : slotB).querySelector('img');
      if (!img) return;
      if (on) {
        img.dataset.art = img.src;
        img.src = battleSprite(p);
      } else if (img.dataset.art) {
        img.src = img.dataset.art;
      }
    });
  }

  function popup(slot, text, cls) {
    const el = document.createElement('span');
    el.className = `popup ${cls || ''}`;
    el.textContent = text;
    slot.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  function flash(el, cls, ms) {
    el.classList.remove(cls);
    // Force a reflow so re-adding the class restarts the animation.
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  function say(text) {
    commentaryEl.textContent = text;
    commentaryEl.hidden = !text;
  }

  async function playHit(ev) {
    const attSlot = slotOf(ev.att);
    const defSlot = slotOf(ev.def);
    say(`Round ${ev.round}: ${ev.att.name} uses a ${ev.type} attack!`);
    flash(attSlot, attSlot === slotA ? 'lunge-right' : 'lunge-left', 450);
    await wait(260);

    const impact = ev.mult > 1 ? 'crit' : ev.mult < 1 ? 'weak' : '';
    flash(defSlot, 'hurt', 500);
    popup(defSlot, `-${ev.dmg}`, `dmg ${impact}`);
    setHp(defSlot, ev.hpAfter, ev.def.maxHp);
    if (ev.mult > 1) {
      flash(arenaEl, 'shake', 400);
      popup(defSlot, 'Super effective!', 'note crit');
    } else if (ev.mult < 1) {
      popup(defSlot, 'Not very effective…', 'note weak');
    }
    await wait(ev.mult > 1 ? 900 : 700);
  }

  async function playEvents(events) {
    for (const ev of events) {
      switch (ev.kind) {
        case 'balance':
          say(ev.text);
          if (ev.strong) popup(slotOf(ev.strong), `${pct(ev.strong.scale)}% power`, 'note lvl');
          await wait(1400);
          break;
        case 'start':
          say(ev.text);
          flash(slotOf(ev.first), 'ready', 700);
          await wait(1100);
          break;
        case 'hit':
          await playHit(ev);
          break;
        case 'timeout':
          say(ev.text);
          await wait(900);
          break;
        case 'faint': {
          const slot = slotOf(ev.loser);
          say(ev.text);
          slot.classList.add('faint');
          await wait(900);
          break;
        }
      }
    }
  }

  async function fight() {
    if (!fighters) return;
    const [a, b] = fighters;
    const { winner, loser, rounds, events, log } = simulate(a, b, scales);

    // Enter playback: Fight becomes Skip, Next is hidden until the fight resolves.
    playing = true;
    skipRequested = false;
    fightBtn.textContent = 'Skip ⏭';
    fightBtn.disabled = false;
    nextBtn.hidden = true;
    resultEl.hidden = true;
    setBattleMode(true);
    for (const f of [winner, loser]) setHp(slotOf(f), f.maxHp, f.maxHp);

    await playEvents(events);

    // Make sure the final state is exact even if playback was skipped mid-way.
    setHp(slotOf(winner), winner.hp, winner.maxHp);
    setHp(slotOf(loser), loser.hp, loser.maxHp);
    slotOf(loser).classList.add('faint');

    const winnerSlot = slotOf(winner);
    const loserSlot = slotOf(loser);
    winnerSlot.classList.add('winner');
    loserSlot.classList.add('loser');
    say('');

    resultTitle.textContent = `${winner.name} wins!`;
    resultSummary.textContent =
      `${winner.name} defeated ${loser.name} in ${rounds} round${rounds === 1 ? '' : 's'} ` +
      `with ${winner.hp} of ${winner.maxHp} HP remaining.`;
    logEl.innerHTML = log.map((line) => `<li>${line}</li>`).join('');
    resultEl.hidden = false;

    playing = false;
    fightBtn.textContent = 'Fight!';
    fightBtn.disabled = true;
    nextBtn.textContent = 'Next fight';
    nextBtn.hidden = false;
    nextBtn.focus();
  }

  // ---------- Events ----------
  fightBtn.addEventListener('click', () => {
    if (playing) skipRequested = true;
    else fight();
  });
  nextBtn.addEventListener('click', loadFighters);

  loadFighters();
})();
