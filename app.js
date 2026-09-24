/* Searchable Pokédex powered by PokéAPI (https://pokeapi.co/docs/v2) */
(() => {
  'use strict';

  const API = 'https://pokeapi.co/api/v2';
  const ART = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';
  const PAGE_SIZE = 48;
  const MAX_STAT = 255;

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const grid = $('#grid');
  const statusEl = $('#status');
  const searchEl = $('#search');
  const typeEl = $('#type-filter');
  const genEl = $('#gen-filter');
  const loadMoreBtn = $('#load-more');
  const modal = $('#modal');
  const modalContent = $('#modal-content');

  // ---------- State ----------
  /** @type {{id:number, name:string}[]} */
  let allSpecies = [];
  let filtered = [];
  let shown = 0;
  const detailCache = new Map();   // url -> Promise<json>
  const typeMembers = new Map();   // type name -> Set<pokemon name>
  const genMembers = new Map();    // generation name -> Set<species name>

  // ---------- Helpers ----------
  const idFromUrl = (url) => Number(url.replace(/\/+$/, '').split('/').pop());
  const pad = (n) => String(n).padStart(4, '0');
  const cap = (s) => s.replace(/-/g, ' ');
  const artUrl = (id) => `${ART}/${id}.png`;

  function fetchJson(url) {
    if (!detailCache.has(url)) {
      const p = fetch(url).then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
        return r.json();
      });
      p.catch(() => detailCache.delete(url)); // allow retry after failure
      detailCache.set(url, p);
    }
    return detailCache.get(url);
  }

  function setStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle('error', isError);
    statusEl.hidden = !msg;
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  const romanGen = { i: 'I', ii: 'II', iii: 'III', iv: 'IV', v: 'V', vi: 'VI', vii: 'VII', viii: 'VIII', ix: 'IX', x: 'X' };
  const genLabel = (name) => `Generation ${romanGen[name.replace('generation-', '')] || name}`;

  // ---------- Bootstrap ----------
  async function init() {
    try {
      const [species, types, gens] = await Promise.all([
        fetchJson(`${API}/pokemon-species?limit=2000`),
        fetchJson(`${API}/type?limit=50`),
        fetchJson(`${API}/generation?limit=50`),
      ]);

      allSpecies = species.results
        .map((s) => ({ id: idFromUrl(s.url), name: s.name }))
        .sort((a, b) => a.id - b.id);

      for (const t of types.results) {
        if (t.name === 'unknown' || t.name === 'shadow') continue;
        typeEl.append(new Option(cap(t.name), t.name));
      }
      for (const g of gens.results) {
        genEl.append(new Option(genLabel(g.name), g.name));
      }

      setStatus('');
      applyFilters();
    } catch (err) {
      console.error(err);
      setStatus(`Could not load the Pokédex: ${err.message}`, true);
    }
  }

  // ---------- Filtering ----------
  async function getTypeMembers(type) {
    if (!typeMembers.has(type)) {
      const data = await fetchJson(`${API}/type/${type}`);
      typeMembers.set(type, new Set(data.pokemon.map((p) => p.pokemon.name)));
    }
    return typeMembers.get(type);
  }

  async function getGenMembers(gen) {
    if (!genMembers.has(gen)) {
      const data = await fetchJson(`${API}/generation/${gen}`);
      genMembers.set(gen, new Set(data.pokemon_species.map((s) => s.name)));
    }
    return genMembers.get(gen);
  }

  let filterToken = 0;
  async function applyFilters() {
    const token = ++filterToken;
    const q = searchEl.value.trim().toLowerCase();
    const type = typeEl.value;
    const gen = genEl.value;

    let list = allSpecies;

    if (q) {
      const numeric = /^#?\d+$/.test(q) ? Number(q.replace('#', '')) : null;
      list = list.filter((p) =>
        p.name.includes(q) || (numeric !== null && p.id === numeric)
      );
    }

    if (type || gen) {
      setStatus('Filtering…');
      try {
        const [tSet, gSet] = await Promise.all([
          type ? getTypeMembers(type) : null,
          gen ? getGenMembers(gen) : null,
        ]);
        if (token !== filterToken) return; // stale
        list = list.filter((p) => (!tSet || tSet.has(p.name)) && (!gSet || gSet.has(p.name)));
      } catch (err) {
        if (token !== filterToken) return;
        setStatus(`Filter failed: ${err.message}`, true);
        return;
      }
    }

    filtered = list;
    shown = 0;
    grid.innerHTML = '';
    setStatus(filtered.length ? `${filtered.length} Pokémon` : 'No Pokémon match your search.');
    renderMore();
  }

  // ---------- Rendering ----------
  const observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      observer.unobserve(e.target);
      hydrateCard(e.target);
    }
  }, { rootMargin: '200px' });

  function renderMore() {
    const slice = filtered.slice(shown, shown + PAGE_SIZE);
    const frag = document.createDocumentFragment();
    for (const p of slice) frag.append(makeCard(p));
    grid.append(frag);
    shown += slice.length;
    loadMoreBtn.hidden = shown >= filtered.length;
  }

  function makeCard(p) {
    const card = document.createElement('article');
    card.className = 'card';
    card.tabIndex = 0;
    card.dataset.id = p.id;
    card.dataset.name = p.name;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${cap(p.name)}, number ${p.id}`);
    card.innerHTML = `
      <div class="num">#${pad(p.id)}</div>
      <img src="${artUrl(p.id)}" alt="" loading="lazy" width="96" height="96"
           onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png'" />
      <div class="name">${cap(p.name)}</div>
      <div class="types"></div>`;
    card.addEventListener('click', () => openDetail(p.id));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(p.id); }
    });
    observer.observe(card);
    return card;
  }

  async function hydrateCard(card) {
    try {
      const data = await fetchJson(`${API}/pokemon/${card.dataset.id}`);
      card.querySelector('.types').innerHTML = typeBadges(data.types);
    } catch { /* leave types empty */ }
  }

  const typeBadges = (types) =>
    types.map((t) => `<span class="type type-${t.type.name}">${t.type.name}</span>`).join('');

  // ---------- Detail modal ----------
  async function openDetail(id) {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modalContent.innerHTML = '<p class="status">Loading…</p>';
    try {
      const [pokemon, species] = await Promise.all([
        fetchJson(`${API}/pokemon/${id}`),
        fetchJson(`${API}/pokemon-species/${id}`),
      ]);
      const evo = species.evolution_chain ? await fetchJson(species.evolution_chain.url).catch(() => null) : null;
      modalContent.innerHTML = detailHtml(pokemon, species, evo);
      modalContent.querySelectorAll('.evo-item').forEach((btn) =>
        btn.addEventListener('click', () => openDetail(Number(btn.dataset.id)))
      );
      modal.querySelector('.modal-close').focus();
    } catch (err) {
      modalContent.innerHTML = `<p class="status error">Could not load details: ${err.message}</p>`;
    }
  }

  function closeDetail() {
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  function detailHtml(p, s, evo) {
    const english = (arr, key) => arr.find((x) => x.language.name === 'en')?.[key] || '';
    const flavor = english(s.flavor_text_entries, 'flavor_text').replace(/[\n\f\r]+/g, ' ');
    const genus = english(s.genera, 'genus');
    const abilities = p.abilities
      .map((a) => cap(a.ability.name) + (a.is_hidden ? ' (hidden)' : ''))
      .join(', ');
    const total = p.stats.reduce((sum, st) => sum + st.base_stat, 0);

    const stats = p.stats.map((st) => `
      <div class="stat">
        <span class="k">${cap(st.stat.name).replace('special', 'sp.')}</span>
        <span class="v">${st.base_stat}</span>
        <div class="bar"><span style="width:${(st.base_stat / MAX_STAT) * 100}%"></span></div>
      </div>`).join('');

    return `
      <div class="detail-head">
        <img src="${p.sprites.other?.['official-artwork']?.front_default || artUrl(p.id)}" alt="${p.name}" />
        <div>
          <div class="num">#${pad(p.id)}</div>
          <h2 id="modal-title">${cap(p.name)}</h2>
          <div class="genus">${genus}</div>
          <div class="types">${typeBadges(p.types)}</div>
        </div>
      </div>
      ${flavor ? `<p class="flavor">${flavor}</p>` : ''}
      <div class="facts">
        <div class="fact"><div class="k">Height</div><div class="v">${(p.height / 10).toFixed(1)} m</div></div>
        <div class="fact"><div class="k">Weight</div><div class="v">${(p.weight / 10).toFixed(1)} kg</div></div>
        <div class="fact"><div class="k">Base exp</div><div class="v">${p.base_experience ?? '—'}</div></div>
        <div class="fact"><div class="k">Habitat</div><div class="v">${s.habitat ? cap(s.habitat.name) : '—'}</div></div>
        <div class="fact" style="grid-column:1/-1"><div class="k">Abilities</div><div class="v">${abilities}</div></div>
      </div>
      <div class="stats">
        ${stats}
        <div class="stat"><span class="k">Total</span><span class="v">${total}</span><span></span></div>
      </div>
      ${evo ? evoHtml(evo.chain, p.id) : ''}`;
  }

  function evoHtml(chain, currentId) {
    // Flatten the chain into ordered stages (branching evolutions are shown side by side).
    const stages = [];
    let level = [chain];
    while (level.length) {
      stages.push(level.map((n) => ({ id: idFromUrl(n.species.url), name: n.species.name })));
      level = level.flatMap((n) => n.evolves_to);
    }
    if (stages.length < 2) return '';
    const items = stages.map((stage) =>
      stage.map((sp) => `
        <button class="evo-item ${sp.id === currentId ? 'current' : ''}" data-id="${sp.id}">
          <img src="${artUrl(sp.id)}" alt="" loading="lazy" />
          <span>${cap(sp.name)}</span>
        </button>`).join('')
    ).join('<span class="evo-arrow">→</span>');
    return `<div class="evo"><h3>Evolution chain</h3><div class="evo-chain">${items}</div></div>`;
  }

  // ---------- Events ----------
  searchEl.addEventListener('input', debounce(applyFilters, 200));
  typeEl.addEventListener('change', applyFilters);
  genEl.addEventListener('change', applyFilters);
  loadMoreBtn.addEventListener('click', renderMore);
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeDetail(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeDetail(); });

  init();
})();
