# CLAUDE.md

Searchable Pokédex built on [PokéAPI v2](https://pokeapi.co/docs/v2). Vanilla
JavaScript, HTML and CSS. No build step, no runtime dependencies, no framework.

## Run

```bash
npm start              # node server.js, serves on http://localhost:8080
node server.js 3000    # custom port (or PORT env var)
node --check app.js    # syntax check; there is no test suite
```

The app must be served over HTTP because it uses `fetch`. Opening `index.html`
from `file://` will not work.

## Layout

| File | Purpose |
|------|---------|
| `index.html` | Page shell: header with search/type/generation controls, card grid, modal |
| `app.js` | All client logic in one IIFE: API client, filtering, rendering, detail modal |
| `styles.css` | Layout, card grid, modal, type colours, dark mode via `prefers-color-scheme` |
| `fight.html` | Fight page shell: two fighter slots, Fight/Next buttons, result panel |
| `fight.js` | Fight page logic: picks two random species, simulates a battle from base stats and type effectiveness |
| `story.html` | Story page shell: title screen, stage (picture), dialogue box, choices, battle layer |
| `story.js` | Story engine: scene runner, dialogue/typewriter, prompts, save/load, turn-based battle |
| `music.js` | Story music: chiptune loops per backdrop and battle kind, plus jingles, synthesised with Web Audio (`window.StoryMusic`) |
| `puzzles.js` | Grid puzzle core (`window.StoryPuzzles`): board, d-pad/keys/swipes, reset/skip, a BFS `solve()` that runs in Node |
| `puzzle-<kind>.js` | One puzzle kind each (rules only, no DOM): ice slide, boulder push, colour switch gates, memory path, copy the picture |
| `puzzles.html` | Dev page, localhost only (redirects to `story.html` elsewhere): plays every puzzle scene from `chapters.js` directly |
| `chapters.js` | Story content only: cast, looks and chapters as scene graphs (`window.STORY_CHAPTERS`) |
| `STORY_PLAN.md` | Plan for the 10-chapter story: shards, team of 4-6, switching, chapter outlines, build order. Read it before story work |
| `server.js` | Zero-dependency static file server (MIME map, path-traversal guard) plus the `/api/saves` JSON save database, for local dev |
| `api/saves.js` | Same save API as a Vercel function, stored in Upstash Redis via its REST API (plain `fetch`) |
| `api/_shared.js` | Invite hash, player-name normalising and limits, used by both save backends |
| `api/scores.js` | Puzzle high scores as a Vercel function (Redis hash `scores:<ch>:<scene>`, a field per player) |
| `api/_redis.js` | Upstash REST helper (`redis`, `hgetallJson`, `send`) shared by the two Vercel functions |
| `vercel.json` | Rewrites `/api/saves/:id` to `/api/saves?id=:id` |
| `data/saves.json` | Local story save slots (`{ players: { <name>: { <id>: save } } }`) and puzzle scores (`scores: { <ch>:<scene>: { <name>: { moves, ms } } }`), created on first save. Gitignored, not served, safe to delete |

## How `app.js` works

- **Data source**: `pokemon-species?limit=2000` is the master list (1025 species,
  ids 1..1025). Species ids are used rather than `pokemon` ids so alternate forms
  (ids > 10000) do not appear in the grid.
- **Caching**: `fetchJson` memoises every URL in a `Map` of promises. Failed
  requests are evicted so they can be retried.
- **Filters**: search is client-side on name and id. Type and generation filters
  fetch `type/{name}` and `generation/{name}` once each and cache the member
  name sets in `typeMembers` and `genMembers`. `filterToken` discards stale
  async filter results when the user types quickly.
- **Rendering**: grid is paged (`PAGE_SIZE = 48`) with a "Load more" button.
  Cards use the official artwork URL derived from the id, so no request is
  needed to show a card. Type badges are hydrated lazily by an
  `IntersectionObserver` that fetches `pokemon/{id}` when a card scrolls near
  the viewport.
- **Modal**: `openDetail(id)` fetches `pokemon/{id}`, `pokemon-species/{id}`
  and the evolution chain, then renders via `detailHtml`. Evolution stages are
  buttons that call `openDetail` again.

## How `fight.js` works

- Picks two distinct random ids in 1..1025 and fetches `pokemon/{id}` for each,
  plus `type/{name}` for every type involved (cached in `typeCharts`).
- **Balancing**: `balance` scales every stat of the Pokémon with the higher base
  stat total (BST) by `weakerBST / strongerBST`, so both bring the same total
  power. The card shows "N% power" on the scaled side. Battle HP is scaled
  base HP + 50.
- `simulate(a, b, scales)` runs a turn-based fight: the faster side hits
  first, damage is `10 x offence / defence` (offence is the better of
  attack/sp. attack, defence is the matching one), times the best type
  multiplier and an 85-115% roll. Capped at 50 rounds, then decided on
  remaining HP share.
- `simulate` returns structured `events` (`balance`, `start`, `hit`, `timeout`, `faint`),
  each with a `text` line; the battle log is derived from those texts.
- Clicking Fight plays the events out in the arena before the result panel
  appears: cards swap to battle sprites (Showdown gif, then `front_default`,
  then artwork) and the card boxes disappear, attacker lunges, defender shakes and flashes, an HP bar drains,
  damage and effectiveness pop-ups float up, and the loser faints. Fight
  becomes "Skip" during playback. `prefers-reduced-motion` shortens waits and
  disables the movement animations.
- Result panel shows the winner and a round-by-round log; "Next fight" reloads.

## How `story.js` works

- **Content vs engine**: `chapters.js` holds all story data; `story.js` never
  hard-codes plot. Add a chapter by appending to `STORY_CHAPTERS`. The scene and
  prompt shapes are documented at the top of `chapters.js`. Chapters: 1 (Oak,
  starter, rival), 2 (delivery through Whisperwood, wild and trainer battles),
  3 (catching at Glimmer Lake, then a night battle against the Veil stranger;
  winning saves the Glimmer Shard, `flags['ch3:duel']` plus `shard: 'glimmer'`
  on `afterDuel`, and the ending text changes to match), 4-8 (one shard
  mission each), 9 (the Veil's hideout: win back shards), 10 (Master Nox, then
  Necrozma as a `boss: true` battle; `end` has `final: true`). Flags
  carry across chapters (e.g. `peeked` from ch2 changes ch3 dialogue).
- **Scenes**: each has a backdrop (`bg` -> `.bg-<name>` gradient in
  `styles.css`), a `cast` (trainer sprites from Pokémon Showdown), exposition
  `panels`, then a `prompt`: `choice` (max 3 options), `name`, `look`,
  `starter`, `battle` or `end`. Choice options can have an `if(s)` guard. Text
  uses `{player}`, `{rival}`, `{mon}`, `{caught}`, `{foe}` etc. and is always
  written with `textContent`, so player-typed names are safe.
  Backdrops: intro, bedroom, town, grass, house, lab, route, forest, camp,
  lake, night, battle, cave, village, snow, beach, seacave, plant, volcano,
  hideout, depths (dark ones get light name tags). Backdrops move: `.stage-fx`
  (over the picture, no clicks) gets per-backdrop CSS layers (falling snow,
  leaves, clouds, fireflies, mist, bubbles, embers, sparks, glows); each layer
  moves a whole number of tiles per loop so it never jumps. People breathe and
  the Pokémon picture floats. All off under `prefers-reduced-motion`.
- **Music** (`music.js`): each scene plays the theme for its `bg` (`BACKDROPS`
  map), battles play `wild`, `trainer` or `boss`; win/catch/shard/evolution/
  chapter end play jingles over it. Themes are data (tempo, scale, chords, a
  melody string of scale degrees). Sound starts on the first click or key
  (browser rule), pauses when the tab is hidden, and the ♪ button mutes it
  (`localStorage` `pokefightadex-music`). story.js works without music.js.
  Cries: `music.cry(id, name, { faint })` plays a Pokémon's cry (PokéAPI
  `.ogg` by id, Showdown `.mp3` by species name where Ogg can't play, or on
  error) and dips the music under it. It plays on send-out, wild/foe appearing,
  faint (slower and lower), starter preview and evolution. It is muted with the
  music.
- **Evolution**: at story moments, not levels. A scene's `evolve` ('starter',
  'team' or a function) runs after its panels (`evolveScene`, once per scene via
  `flags['evolve:<ch>:<scene>']`): one stage along the PokéAPI evolution chain
  (first branch), glow animation, then `id`/`species`/`types` change; nickname
  and level stay. Beats: ch5 `glow` (starter), ch8 `afterDrill` (the rest,
  except a Pokémon just caught there), ch10 `shine` (starter, before Necrozma).
- **Console layout**: choices and battle menus always sit under the text,
  full width. Plain choices are one row side by side (up to 3), on phones
  (<=499px) 2 across with a 3rd spanning the row; buttons are >=44px and text
  wraps inside them. The number badge hides on phones. While a menu shows the
  text box shrinks to fit. Exceptions: `.choices-cards` (looks, starters)
  overlay the picture; `.choices-name` sits under the text too (3 suggestions
  in a row, then the type-a-name field).
  The console must fit without scrolling at 360px wide and 1280x720; keep
  option text under ~40 characters.
- **State** (`s`): save `slot` id, names, look, starter (`mon`, with nickname
  and level; `{mon}` always means the starter), rival's starter, `party` (the
  rest of the team: catches and `gift`s, same shape as `mon`), `order` (team
  order as indexes into `[s.mon, ...s.party]`, lead first), `lastFoe` (last foe
  sent out), `flags` set by choices and battle outcomes
  (`flags['ch2:ambush'] = 'win'|'lose'|'run'|'caught'`), and `bag` (keys of
  `ITEMS` in `story.js`: potion, superpotion, revive, xattack, pokeball,
  greatball), and `shards` (keys held, in the order found, no repeats).
  `applied` stops scene effects (`set`, `give`, `shard`, `take`, `gift`, all
  in `applyScene`, `set` first) repeating on resume. `revive` loads any save:
  it fills `order` (old saves: starter first, then catches), reshapes party
  entries, and cleans `shards`; a save from before shards (no `shards` field)
  with `ch3:duel === 'win'` gets `glimmer`.
- **Shards**: `SHARDS` in `story.js` lists the 7 keys (glimmer, stone, frost,
  tide, spark, ember, shadow) with names and final-battle powers. A scene's
  `shard` (key or `(s) => key|null`) adds one and, after the scene's panels,
  says "You got the Stone Shard! Now you have 2 of 7 shards." with a big
  crystal on the stage; `take` removes one silently (the chapter text says the
  Veil took it). `{shards}` is the number held. Crystals (`.shard-<key>`,
  colours in the `/* Shards */` block of `styles.css`) show on the Team screen
  (from chapter 3 on, "Shards: 3 of 7" with names) and the final end screen.
- **Team**: up to `TEAM_MAX` (6). Use `team()` for the ordered list (it also
  repairs `s.order`) and `addToTeam` to add (refuses when full). A ball with a
  full team says "Your team is full!" and isn't used. On entering a chapter's
  `start` scene, `catchUp` raises anyone more than 3 levels below the starter
  to starter - 2 (never above the chapter's `levelCap`, never lowering anyone)
  with a "trained hard at camp" line. Placeholders `{team}`
  ("Ember, Sparky and Rocky") and `{lead}`; panel `mon: 'lead'`. The in-game
  menu has a Team screen (sprite, name, level, types, Make leader, Rename).
- **Puzzles**: a `puzzle` prompt holds `rooms` (`[{ puzzle: kind, grid, text? }]`, played in order,
  "Room 2 of 3") and an optional `time` in seconds for all rooms together (a pill on the board; running
  out goes back to room 1 with a full clock). Kinds: ice, boulder, switch, memory, picture; each
  `puzzle-<kind>.js` lists its grid characters at the top. The board covers the stage; the d-pad goes
  in the choices (`.choices-puzzle`), plus arrow keys/WASD and swipes. You can't lose: "Start again"
  restarts the room, `hint` after 3 tries (resets or time-ups), Skip after 5 (no reward). Solving
  applies the prompt's `set`/`give` and plays `after`; `flags['<ch>:<scene>']` is 'solved' or
  'skipped'. Placed at ch4 `rockfall`, ch5 `icePond` and ch7 `gateYard`. The kind contract
  (parse/move/solved/view/key, `flash` frames for patterns to remember, `view().picture` for a goal
  shown beside the board) is in `puzzles.js`'s header; `StoryPuzzles.run` plays a whole puzzle.
  CSS per kind in its `/* Puzzle: <kind> */` block. Check grids in Node: `globalThis.window =
  globalThis`, require `puzzles.js` and the kinds, then `StoryPuzzles.solve(kind, rows)` (-1 =
  unsolvable). Play them directly on `puzzles.html`. Grids at most 10x7.
- **Puzzle scores**: each solve posts `{ puzzle: '<ch>:<scene>', moves, ms }` to `/api/scores`
  (both backends; checks in `api/_shared.js`: `checkScore`, `mergeBest`, `leaderboard`). Moves add
  up each room's winning try; time is clock time since room 1 last started fresh (restarts cost
  time, not moves). Each player keeps a best for each, separately. `showScores` puts a records card on
  the stage (`#stage-scores`: this try, "New best!", top 5 by moves and by time, shared by every
  invited player), then "Keep going" / "Try again for a better score" (the reward and `after` only
  come the first time). Without the API, bests stay in `localStorage` `pokefightadex-scores`.
- **Puzzle practice**: the title screen's Puzzles button (after the invite questions) lists the
  puzzles any of the player's saves has reached (`unlockedPuzzles`: flag set, a later chapter, or
  that chapter finished), with their best. Play borrows the newest such save's state (names, look)
  but never saves: the menu is off (`practicing`), and leaving reloads the page. Scores post as usual.
- **Deploy**: Vercel (static files + `api/saves.js`), Upstash Redis added from
  the Vercel Storage tab (`UPSTASH_REDIS_REST_*` or `KV_REST_API_*` env vars).
  GitHub Pages still serves the static site but has no save API.
- **Invite questions**: before the title screen, `askInvite` asks the kid's
  name, "Who made this game?" and "What is his kid's name?". Answers are
  lowercased, letters only, and checked as a SHA-256 hash (`INVITE_HASH` in
  `story.js` and `api/_shared.js`, must match), so the answers aren't in the
  source. Stored per device in `localStorage` `pokefightadex-player`; "Not
  you?" on the title screen clears it. Every save request sends `X-Invite`
  (the hash) and `X-Player`; both backends reject a wrong hash and keep saves
  per player (lowercased name, Redis hash `saves:<name>`, max 20 each).
  A friendly keep-out, not real security.
- **Saves**: auto-saved on each scene to its slot. `server.js` exposes
  `GET/PUT/DELETE /api/saves[/:id]` backed by `data/saves.json` (in-memory,
  written via temp file + rename, 64 KB body cap, 20 slots per player). If the API is
  missing (another static server), slots fall back to `localStorage`
  (`pokefightadex-saves`) and move into the database once it is reachable. The
  title screen has Load game (slot list with delete) and New game; the in-game
  menu has Team, Save a copy, Load game and New game. Leaving the game reloads the
  page because the scene runner can't be cancelled mid-await.
- **Battle**: real-ish mechanics, unlike `fight.js`. Stats use the game formula
  at the given level (IV 15, no EVs); moves are the four most recent level-up
  moves from the newest version group with data, filtered to ones the engine
  can resolve (fixed-power damage, or pure stat changes). Damage uses the
  standard formula with STAB, type effectiveness, 1/24 crits and 85-100% roll;
  stat stages and accuracy/evasion follow the game multipliers. The player
  picks a move, the Bag or Team each turn (bottom row of the move menu is
  Bag, Team and, in wild battles only, Run: `.choices-battle`, `.no-run`
  otherwise; items use your turn, see `useItem`); the rival AI scores moves by expected
  damage. Turn clock: `playerAction` starts a `TURN_MS` (6 s) clock, shown as a pill
  and bar on the text box; opening the Bag adds `BAG_BONUS_MS` (4 s) once per turn.
  It only counts while a menu waits (paused with the game menu open or the tab
  hidden). On time up `choose` rejects with `TIME_UP` and a random usable move is
  used. Forced picks after a faint are not timed. `foeMoveLevel` caps each foe's learnset. A damaging move's stat
  change is a side effect: it happens with the move's `meta.stat_chance`
  (`statChance`), and `damage-raise` moves (Metal Claw, Flame Charge, Close
  Combat) change the user's stats (`statSelf`). Status moves always apply.
- **Battle sides**: `newBattle(pr)` makes `bt` with `bt.ally` / `bt.foe`, each
  a list of slots (`{ mon | id+level, c, fainted, battled }`) plus the active
  `slot`. Combatants are built lazily by `buildSlot` on first send-out (a slow
  fetch shows "Getting X ready…", a failed one offers Try again mid-battle).
  Switching (`switchAlly`) uses your turn and the foe's attack hits the
  newcomer; stat stages reset on switch-out, HP is kept for the battle, and
  everyone is healed after (combatants are rebuilt each battle). A faint gives
  a free pick (`teamMenu` without Back; automatic if only one is left); you
  lose when all have fainted. `afterTurn` handles faints and send-outs.
  Trainers use `team: [{ id, level }]` (or a function), sent out in order by
  `sendFoe` ("Stranger sent out Murkrow!"); the foe never switches. HUDs show
  Poké Ball icons when a side has more than one Pokémon (not for wild). On a
  win, everyone who battled and didn't faint levels up (`levelUp(slot)`),
  unless it is at the chapter's `levelCap` (then one "X is as strong as it
  can be for now!" line per battle; old saves above the cap keep their levels).
  With one Pokémon a side, it plays exactly as before.
- **Battle-start boosts**: `entryBoosts(bt, isAlly)` is the one place stat
  stages are added as a Pokémon comes out: `foeMods` for every foe, comeback
  for your first one out, and shard powers in a boss battle.
- **Boss battles** (`boss: true`, Necrozma in ch10): `bt.canRun` and
  `bt.canCatch` are off even though it is wild (Run and the Ball are greyed
  out), the foe is labelled just "Necrozma", and held shards apply
  (`shardMods`): team Defense/Speed/Attack+Sp. Atk +1 from Stone/Spark/Ember
  on each of your Pokémon every time it comes out (stages reset on a switch,
  so they come back), boss accuracy/Speed/Attack+Sp. Atk -1 from
  Glimmer/Frost/Shadow, and `shardStart` says "Your shards glow!" and adds
  the Tide Shard's 2 Potions once per boss scene (`flags['<ch>:<scene>:tide']`,
  so retries don't pile them up). The chapter explains each power
  in text beforehand, so the engine keeps its lines short.
- **End screen**: `showEnd` shows the chapter summary and Start next / Save
  and exit (back to the title screen) / Pokédex. For a chapter whose `end` prompt has `final: true`
  (`isFinal`, so it also works when a finished save is loaded), `#stage-final`
  covers the stage with the whole team (picture, name, level) and "You found
  N of 7 shards" with the crystals, and the line adds the count.
- **Wild battles**: a battle prompt without `trainer` is wild. `foe` is a
  species id, list or function; `level` a number, range or function (chapters
  scale wild levels to the starter). Wild battles allow Run (always works if
  faster, else 50%) and Poké Balls (Gen III capture formula using the
  species' `capture_rate`, times `CATCH_BONUS` 0.6 so a Pokémon must be
  weakened first: about 20% at full HP, 60% near 0 HP; a Great Ball is x1.5;
  one "make it weaker first" tip per battle). The Bag submenu always lists
  Potion and Poké Ball, other items once held, then Back; Revive picks a
  fainted team member (back at half HP), X Attack is +1 Attack/Sp. Atk.
- **Battle sprites** stand on a grass patch (`.platform::before`) in a square
  box with `object-position: bottom`, so every sprite's feet touch the ground.
- **Helping the player**: foe AI style is `wild` (random move), `trainer`
  (best move, 30% slip) or `smart` (rival only). Last stand: once per chapter
  (`flags['<ch>:lastStand']`) a knockout on whichever Pokémon is out leaves it
  at 1 HP and heals 20%. Comeback: a loss sets `flags.comeback`, giving +1
  Attack/Sp. Atk to the first Pokémon sent out in the next battle.
- **Balance**: keep wild pools from being all super effective against one
  starter type (see `WOODS_WILDS`, `RISKY_AREA` in `chapters.js`). Boss and
  trainer levels use `bossLv(d, nudge)`: starter level + d, plus a per-starter
  nudge keyed by the starter's first type, capped at starter + 2 and at the
  team's average level + 1 (`teamAvg`) (Necrozma is
  the exception: starter + 10 with Attack -4 and Sp. Atk -5 foeMods, so it is
  long and tough but rarely knocks out a full-HP Pokémon in one hit). Losing to
  Necrozma goes to the ch10 `retry` scene: "Try again!" replays the battle
  (healed, comeback +1, last stand already used), "Let your friends help" goes
  to the gentle loss ending. The numbers
  come from a simulated naive player (see "Balance notes" in `STORY_PLAN.md`);
  re-check win rates after changing a team. Levels grow slowly (a win only
  levels Pokémon that didn't faint), so the starter is about Lv 12-14 in
  chapter 10, and each chapter's `levelCap` sits well above the normal path.

## Conventions

- **Story text is for 7-12 year olds.** Every line in `chapters.js` (dialogue,
  choices, summaries) and the player-facing battle messages in `story.js` use
  slightly easier language: short sentences, everyday words (e.g. "purple" not
  "violet", "teacher" not "mentor"), no tricky words or long descriptions.
  Keep the plot easy to follow, and explain type matchups plainly ("Water
  beats Fire"). Be exciting, but never too scary.

- Keep it dependency-free. Do not add npm packages, bundlers or frameworks.
- Type colours live in `styles.css` as `.type-<name>` classes. PokéAPI type
  names map directly to these class names.
- Use `fetchJson` for every API call so caching stays consistent.
- `unknown` and `shadow` types are deliberately excluded from the type filter.
- Heights and weights from the API are in decimetres and hectograms; the modal
  converts them to metres and kilograms.

## Gotchas

- PokéAPI has no rate limit but asks for fair use; the lazy hydration and
  caching exist to keep request volume low. Do not fetch all 1025 details up
  front.
- Type membership from `type/{name}` lists `pokemon` names, while the master
  list holds `pokemon-species` names. These match for default forms, which is
  what the grid shows.
- Flavor text contains `\n` and `\f` characters; `detailHtml` strips them.
