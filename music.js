/* Story music: little chiptune loops made with the Web Audio API, so there are no audio files.
 * story.js calls StoryMusic.play(themeOrBackdrop), .stop(), .jingle(name) and .cry(id, name)
 * (a Pokémon's cry, the one sound that is a file). Browsers only
 * allow sound after a click or key press, so nothing plays until the player has pressed something.
 *
 * A theme: bpm, root (MIDI note of degree 1), scale, lead wave, chords (one scale degree per bar),
 * bass ('beat' quarter notes, 'pulse' eighth notes, 'long' one note per bar), arp (quiet chord
 * notes), drums, and a melody: one token per eighth note, a scale degree (1-14), '-' holds the
 * last note, '.' is a rest. '|' between bars is only for reading. */
(() => {
  'use strict';

  const STORE_KEY = 'pokefightadex-music';
  const VOLUME = 0.2;
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    harm: [0, 2, 3, 5, 7, 8, 11], // harmonic minor: spooky and dramatic
  };
  // Square and saw waves sound much louder than triangle and sine, so each gets its own level.
  const WAVE_GAIN = { square: 0.05, sawtooth: 0.045, triangle: 0.16, sine: 0.18 };

  const THEMES = {
    home: {
      bpm: 100, root: 72, scale: 'major', wave: 'square', chords: [1, 4, 5, 1], bass: 'beat',
      melody: '5 - 3 5 8 - 7 - | 6 - 4 6 8 - 6 - | 7 - 5 7 9 - 8 7 | 8 - - 5 3 - . .',
    },
    route: {
      bpm: 132, root: 67, scale: 'major', wave: 'square', chords: [1, 5, 6, 4], bass: 'beat', arp: true,
      melody: '1 3 5 8 - 5 3 5 | 7 - 5 7 9 - 7 5 | 6 - 8 6 5 - 3 5 | 4 6 8 10 9 - 8 7',
    },
    forest: {
      bpm: 92, root: 69, scale: 'major', wave: 'triangle', chords: [1, 4, 1, 5], bass: 'beat', arp: true,
      melody: '5 . 6 5 3 - . 2 | 4 . 6 8 6 - . . | 5 . 3 5 8 - 7 6 | 5 - - . 2 - 1 .',
    },
    sea: {
      bpm: 84, root: 65, scale: 'major', wave: 'triangle', chords: [1, 6, 4, 5], bass: 'long', arp: true,
      melody: '3 - 5 - 8 - 7 5 | 6 - - - 3 - 5 - | 4 - 6 - 8 - 6 4 | 5 - - - 7 - 5 .',
    },
    night: {
      bpm: 72, root: 69, scale: 'minor', wave: 'triangle', chords: [1, 6, 4, 5], bass: 'long', arp: true,
      melody: '5 - - 3 1 - . . | 3 - - 1 6 - . . | 4 - 6 - 8 - 7 6 | 5 - - - . . . .',
    },
    cave: {
      bpm: 80, root: 62, scale: 'minor', wave: 'triangle', chords: [1, 1, 6, 5], bass: 'long',
      melody: '1 . . 3 . . 5 . | 4 . 3 . . . . . | 1 . . 3 . . 6 . | 5 . 7 . 5 - . .',
    },
    snow: {
      bpm: 76, root: 79, scale: 'major', wave: 'sine', chords: [1, 6, 4, 5], bass: 'long', arp: true,
      melody: '8 . 5 . 3 . 5 . | 6 . 3 . 1 . 3 . | 4 . 6 . 8 . 9 . | 7 . 5 . 2 . . .',
    },
    plant: {
      bpm: 138, root: 64, scale: 'minor', wave: 'square', chords: [1, 1, 6, 7], bass: 'pulse', drums: true,
      melody: '1 3 5 8 5 3 1 3 | 1 3 5 8 7 5 3 5 | 6 8 10 8 6 5 3 5 | 7 9 11 9 7 5 4 2',
    },
    volcano: {
      bpm: 116, root: 62, scale: 'harm', wave: 'sawtooth', chords: [1, 6, 4, 5], bass: 'pulse', drums: true,
      melody: '1 - 3 - 5 - 6 5 | 3 - 1 - 6 - 5 - | 4 - 6 - 8 - 7 6 | 7 - 5 - 7 - . .',
    },
    hideout: {
      bpm: 96, root: 64, scale: 'harm', wave: 'square', chords: [1, 6, 4, 5], bass: 'beat',
      melody: '1 . 3 . 2 . 1 . | 6 . 5 . 3 - . . | 4 . 6 . 5 . 4 . | 7 - - . 5 . . .',
    },
    depths: {
      bpm: 84, root: 62, scale: 'harm', wave: 'triangle', chords: [1, 6, 2, 5], bass: 'long', arp: true,
      melody: '8 - 7 - 6 - 5 - | 6 - 5 - 3 - . . | 4 - 5 - 6 - 8 - | 7 - - - 5 - . .',
    },
    wild: {
      bpm: 160, root: 69, scale: 'minor', wave: 'square', chords: [1, 1, 6, 7], bass: 'pulse', drums: true,
      melody: '1 . 1 3 . 1 5 . | 4 . 3 . 1 - 7 . | 6 . 6 8 . 6 5 . | 7 . 5 . 7 . 9 8',
    },
    trainer: {
      bpm: 168, root: 64, scale: 'harm', wave: 'square', chords: [1, 6, 4, 5], bass: 'pulse', drums: true,
      melody: '1 3 5 3 8 - 7 - | 6 - 5 - 3 - 1 - | 4 6 8 6 10 - 9 - | 7 - 5 - 7 9 8 7',
    },
    boss: {
      bpm: 176, root: 62, scale: 'harm', wave: 'sawtooth', chords: [1, 1, 6, 5], bass: 'pulse', drums: true,
      melody: '1 - 1 - 3 - 1 - | 8 - 7 - 6 - 5 - | 6 - 6 - 8 - 6 - | 7 - - - 5 - 7 -',
    },
  };

  // Which theme each story backdrop (the `bg` of a scene) plays.
  const BACKDROPS = {
    intro: 'home', bedroom: 'home', town: 'home', house: 'home', lab: 'home', village: 'home',
    grass: 'route', route: 'route', battle: 'route',
    forest: 'forest', camp: 'forest',
    lake: 'sea', beach: 'sea',
    night: 'night',
    cave: 'cave', seacave: 'cave',
    snow: 'snow', plant: 'plant', volcano: 'volcano', hideout: 'hideout', depths: 'depths',
  };

  // Short tunes over the top of the theme: [semitones above C5, beats] at 140 bpm.
  const JINGLES = {
    victory: [[0, 0.5], [4, 0.5], [7, 0.5], [12, 1], [7, 0.5], [12, 2]],
    caught: [[7, 0.25], [12, 0.25], [16, 0.25], [19, 1.25]],
    evolve: [[0, 0.25], [4, 0.25], [7, 0.25], [12, 0.25], [16, 0.25], [19, 0.25], [24, 1.5]],
    shard: [[12, 0.25], [19, 0.25], [24, 0.25], [28, 1.5]],
  };

  const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);

  /** Semitones above the root for a scale degree (1 = root, 8 = an octave up). */
  function degree(scale, d) {
    const steps = SCALES[scale];
    const i = d - 1;
    return steps[((i % 7) + 7) % 7] + 12 * Math.floor(i / 7);
  }

  /** The melody as [{ step, degree, len }] notes; holds ('-') make the previous note longer. */
  function parseMelody(text) {
    const tokens = text.split(/\s+/).filter((t) => t && t !== '|');
    const notes = [];
    tokens.forEach((t, step) => {
      if (t === '-') {
        if (notes.length) notes[notes.length - 1].len += 1;
      } else if (t !== '.') notes.push({ step, degree: Number(t), len: 1 });
    });
    return { notes, steps: tokens.length };
  }
  for (const th of Object.values(THEMES)) Object.assign(th, parseMelody(th.melody));

  let ctx = null;
  let master = null;
  let noise = null;
  let current = null;   // the playing theme: { name, out, timer, step, next }
  let wanted = null;    // the theme story.js asked for (played once sound is allowed)
  let muted = false;
  try { muted = localStorage.getItem(STORE_KEY) === 'off'; } catch { /* storage unavailable */ }

  function ensureContext() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = VOLUME;
    master.connect(ctx.destination);
    // One second of white noise, reused for the drums.
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function tone(out, wave, midi, t, dur, gain) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq(midi);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function drum(out, t, kind) {
    if (kind === 'kick') {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.16);
      return;
    }
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = noise;
    filter.type = kind === 'hat' ? 'highpass' : 'bandpass';
    filter.frequency.value = kind === 'hat' ? 7000 : 1800;
    const len = kind === 'hat' ? 0.04 : 0.12;
    g.gain.setValueAtTime(kind === 'hat' ? 0.08 : 0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(filter).connect(g).connect(out);
    src.start(t);
    src.stop(t + len + 0.01);
  }

  /** Everything that sounds on one eighth-note step of a theme. */
  function playStep(th, out, step, t) {
    const beat = 60 / th.bpm / 2; // one eighth note
    const bar = Math.floor(step / 8) % th.chords.length;
    const inBar = step % 8;
    const chord = th.chords[bar];
    for (const n of th.notes) {
      if (n.step === step) tone(out, th.wave, th.root + degree(th.scale, n.degree), t, n.len * beat * 0.95, WAVE_GAIN[th.wave]);
    }
    const bassNote = th.root - 24 + degree(th.scale, chord);
    if (th.bass === 'pulse') tone(out, 'triangle', bassNote, t, beat * 0.8, 0.16);
    else if (th.bass === 'beat' && inBar % 2 === 0) tone(out, 'triangle', bassNote, t, beat * 1.8, 0.16);
    else if (th.bass === 'long' && inBar === 0) tone(out, 'triangle', bassNote, t, beat * 7.5, 0.14);
    if (th.arp) {
      const d = chord + [0, 2, 4, 7][inBar % 4];
      tone(out, 'triangle', th.root - 12 + degree(th.scale, d), t, beat * 0.9, 0.045);
    }
    if (th.drums) {
      if (inBar === 0 || inBar === 4) drum(out, t, 'kick');
      if (inBar === 2 || inBar === 6) drum(out, t, 'snare');
      if (inBar % 2 === 1) drum(out, t, 'hat');
    }
  }

  function startTheme(name) {
    const th = THEMES[name];
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, ctx.currentTime);
    out.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.6);
    out.connect(master);
    const player = { name, out, step: 0, next: ctx.currentTime + 0.05, timer: null };
    const beat = 60 / th.bpm / 2;
    // Schedule a little ahead of time, so timer hiccups never make the music stumble.
    player.timer = setInterval(() => {
      while (player.next < ctx.currentTime + 0.2) {
        playStep(th, out, player.step, player.next);
        player.next += beat;
        player.step = (player.step + 1) % th.steps;
      }
    }, 50);
    return player;
  }

  function stopTheme(player) {
    if (!player) return;
    clearInterval(player.timer);
    const t = ctx.currentTime;
    player.out.gain.cancelScheduledValues(t);
    player.out.gain.setValueAtTime(player.out.gain.value, t);
    player.out.gain.linearRampToValueAtTime(0, t + 0.6);
    setTimeout(() => player.out.disconnect(), 800);
  }

  const resolve = (name) => (THEMES[name] ? name : BACKDROPS[name] || null);

  /** Play a theme (by name, or by the backdrop it belongs to). The same theme keeps playing. */
  function play(name) {
    const theme = resolve(name);
    if (!theme) return;
    wanted = theme;
    if (muted || !ctx || ctx.state !== 'running') return;
    if (current && current.name === theme) return;
    stopTheme(current);
    current = startTheme(theme);
  }

  function stop() {
    wanted = null;
    if (ctx) stopTheme(current);
    current = null;
  }

  /** A short tune on top; the theme goes quiet while it plays. */
  function jingle(name) {
    const notes = JINGLES[name];
    if (!notes || muted || !ctx || ctx.state !== 'running') return;
    const beat = 60 / 140;
    let t = ctx.currentTime + 0.05;
    const start = t;
    for (const [semi, beats] of notes) {
      tone(master, 'square', 72 + semi, t, beats * beat * 0.95, 0.07);
      tone(master, 'triangle', 60 + semi, t, beats * beat * 0.95, 0.1);
      t += beats * beat;
    }
    if (current) {
      const g = current.out.gain;
      g.cancelScheduledValues(start);
      g.setValueAtTime(g.value, start);
      g.linearRampToValueAtTime(0.15, start + 0.1);
      g.setValueAtTime(0.15, t);
      g.linearRampToValueAtTime(1, t + 0.8);
    }
  }

  // ---------- Cries ----------
  // PokéAPI's cries are .ogg, which some Safari versions can't play, so those get Showdown's .mp3.
  const CRY_OGG = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest';
  const CRY_MP3 = 'https://play.pokemonshowdown.com/audio/cries';
  const CRY_VOLUME = 0.15;
  const canOgg = !!document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"');

  /** A Pokémon's cry, by species id and name. `faint` plays it slower and lower, like the games.
   * The music dips under it. Muted with the music, and silent until the player has pressed something. */
  function cry(id, name, { faint = false } = {}) {
    if (muted || !ctx || ctx.state !== 'running') return;
    const mp3 = `${CRY_MP3}/${String(name).toLowerCase().replace(/[^a-z0-9]/g, '')}.mp3`;
    const list = canOgg ? [`${CRY_OGG}/${id}.ogg`, mp3] : [mp3];
    const audio = new Audio();
    audio.volume = CRY_VOLUME;
    if (faint) {
      audio.preservesPitch = false;
      audio.playbackRate = 0.75;
    }
    let i = 0;
    audio.onerror = () => {
      i += 1;
      if (i < list.length) { audio.src = list[i]; audio.play().catch(() => {}); }
    };
    audio.src = list[0];
    audio.play().catch(() => {});
    if (current) {
      const g = current.out.gain;
      const t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.6, t + 0.08);
      g.setValueAtTime(0.6, t + 1.4);
      g.linearRampToValueAtTime(1, t + 2);
    }
  }

  function setMuted(off) {
    muted = off;
    try { localStorage.setItem(STORE_KEY, off ? 'off' : 'on'); } catch { /* storage unavailable */ }
    if (off) {
      if (ctx) stopTheme(current);
      current = null;
    } else if (wanted) {
      unlock();
    }
  }

  /** Sound can only start after a click or key press. */
  function unlock() {
    if (muted || !ensureContext()) return;
    const go = () => { if (wanted) play(wanted); };
    if (ctx.state === 'suspended') ctx.resume().then(go).catch(() => {});
    else go();
  }
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
  // Pause while the tab is hidden (timers slow down there and would make the music stutter).
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (!muted) ctx.resume();
  });

  window.StoryMusic = { play, stop, jingle, cry, setMuted, get muted() { return muted; } };
})();
