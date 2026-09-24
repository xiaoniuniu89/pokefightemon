/* Story mode content. Each chapter is a graph of scenes; story.js plays them.
 *
 * Scene shape:
 *   bg       backdrop class suffix (intro, bedroom, town, grass, house, lab, route, forest, camp, lake, night,
 *            cave, village, snow, beach, seacave, plant, volcano, hideout, depths)
 *   cast     characters shown in the picture (keys of STORY_CAST)
 *   panels   exposition lines: { who, text, mon?, cast?, bg? }, or (s) => panels
 *   give     items added on entering the scene, e.g. { potion: 1, pokeball: 5 }, or (s) => items. Keys:
 *            potion (+20 HP), superpotion (+50 HP), revive (a fainted Pokémon comes back at half HP),
 *            xattack (Attack and Sp. Atk +1), pokeball, greatball (catches 1.5x better). Say it in a panel
 *   set      flags set on entering the scene, or (s) => flags
 *   gift     a Pokémon that joins the team on entering the scene: { id, level, nickname? }, or
 *            (s) => gift | null. Skipped if the team is full (6). Counts as the latest catch for {caught}
 *   shard    a shard key added to s.shards on entering the scene, or (s) => key | null. Keys: glimmer,
 *            stone, frost, tide, spark, ember, shadow. After the panels the engine says "You got the
 *            Stone Shard! Now you have 2 of 7 shards." (nothing if it was already held)
 *   take     a shard key removed from s.shards (the Veil took it), or (s) => key | null. No line is
 *            shown, so the panels should say what happened
 *            give/set/shard/take/gift apply once per scene (not again on resume); `set` goes first, so
 *            shard/take functions can read the flags it sets
 *   evolve   'starter', 'team' (everyone but the starter) or (s) => list of team members: after the
 *            panels, each one that can evolves by one stage ("What? Ember is evolving!"). Once per scene.
 *            Pokémon evolve at story moments, never by level: ch5 glow (starter), ch8 spring (the
 *            rest of the team), ch10 ultra (starter again, after Necrozma, before the solo fight)
 *   (The first scene of each chapter also lets anyone more than 3 levels below the starter catch up.)
 *   prompt   what ends the scene (see below); scenes without one go to `next`
 *   next     scene id, or (s) => scene id
 *
 * Prompt kinds:
 *   choice   { question, speak, options: [{ text, next, set, give, after: panels, if(s) }] }  (keep it to 3;
 *            speak: true when the options are the player's spoken replies; `if` hides an option unless it holds)
 *   name     { field: 'player' | 'rival' | 'nickname' | 'caughtNickname', suggestions, next }
 *   look     { options: [sprite keys], next }
 *   starter  { options: [species ids], next }
 *   battle   { trainer, foe, level, team, foeMoveLevel, foeMods(s), ai, boss, solo, hero, name, win, lose, run, caught }
 *            solo: only the starter fights. hero: your Pokémon can't faint (it hangs on at 1 HP every time).
 *            allyMods: stat stages your Pokémon gets as it comes out (one golden-glow line).
 *            name: the foe's shown name (e.g. 'Ultra Necrozma' for a form).
 *            trainer: a cast key; leave it out for a wild Pokémon (you can run and throw Poké Balls;
 *            with a full team a ball says "Your team is full!" and isn't used, so hide catch
 *            options with `if: (s) => s.party.length < 5`)
 *            foe: species id, list of ids to pick from, or (s) => either; defaults to the rival's starter
 *            level: number, [min, max] or (s) => number
 *            team: [{ id, level }] or (s) => [...], a trainer's Pokémon sent out in order ("Stranger sent
 *            out Murkrow!"); each level is a number, [min, max] or (s) => number. With `team`, `foe` and
 *            `level` are ignored. You win when all of them faint; the foe never switches
 *            foeMoveLevel caps each foe's learnset below its level; foeMods returns starting stat
 *            stages and applies to every foe Pokémon as it comes out
 *            The player's whole team battles (lead first, switching uses a turn, a faint gives a free
 *            pick, you lose when all have fainted); everyone who battled and didn't faint levels up on a win
 *            ai: 'wild' (random moves), 'trainer' (best move, sometimes slips) or 'smart'; defaults to
 *            wild for wild Pokémon, smart for the rival, trainer otherwise
 *            boss: true (the final battle): no Run and no Poké Balls, even for a wild Pokémon (shown
 *            as just "Necrozma"), and every held shard's power applies: Glimmer boss accuracy -1,
 *            Stone team Defense +1, Frost boss Speed -1, Tide +2 Potions at the start, Spark team
 *            Speed +1, Ember team Attack and Sp. Atk +1, Shadow boss Attack and Sp. Atk -1. Team boosts
 *            apply to each of your Pokémon as it comes out. The engine only says "Your shards glow!"
 *            and one line per Pokémon, so the scene before can explain the powers
 *            run defaults to lose, caught to win; the outcome is stored in flags['<chapter>:<scene>']
 *   puzzle   { rooms: [{ puzzle, grid, text? }] or (s) => rooms, time, question, hint, hintAfter, skipAfter,
 *            set, give, after, next, skip }   (one room can also be written { puzzle, grid, ... } directly)
 *            Grid puzzles on the stage (puzzles.js, rules and grid characters per kind in puzzle-<kind>.js:
 *            ice, boulder, switch, memory, picture). Rooms are played in order ("Room 2 of 3"), each with
 *            its own `text` or else `question`. `time` is seconds for all rooms together: running out
 *            goes back to room 1 with a full clock ("Time's up!"). You can't lose: "Start again"
 *            restarts the room; `hint` (said with the lead Pokémon shown) comes after `hintAfter` tries
 *            (resets or time-ups, default 3), a Skip button after `skipAfter` (default 5). Solving applies
 *            `set`/`give` and plays `after` panels, then goes to `next`; skipping gives nothing and goes
 *            to `skip` (default `next`). The outcome is stored in flags['<chapter>:<scene>']:
 *            'solved' | 'skipped'. Keep grids small (at most 10 wide, 7 tall) so tiles stay big on phones
 *   end      chapter complete: { kind: 'end', final? }. With final: true (the last chapter) the end
 *            screen also shows the whole team (pictures, names, levels) and the shards found (N of 7)
 *
 * Text placeholders: {player} {rival} {mon} (the starter: nickname or species) {species}
 * {type} {rivalMon} {caught} {caughtSpecies} (latest catch or gift) {foe} (species of the last
 * opponent sent out) {team} (every team member in order, e.g. "Ember, Sparky and Rocky") {lead}
 * (the team leader's name) {shards} (how many shards you hold, e.g. "3"). Text may also be a
 * function of the story state (s.mon is the starter, s.party the rest of the team, s.order the
 * team order as indexes into [s.mon, ...s.party], s.shards the shard keys held, in the order found).
 * A panel's `mon` is a species id or one of 'player', 'rival', 'caught', 'foe', 'lead'.
 *
 * Chapter shape: { id, title, levelCap, subtitle, start, summary, scenes }; summary is shown on the end screen.
 * levelCap (optional): in this chapter, a Pokémon at or above it doesn't level up from a win (the engine says
 * "Ember is as strong as it can be for now!" once per battle), and camp catch-up never trains anyone past it.
 * Nothing is ever lowered. It only stops grinding in repeat-until-caught loops: a normal path stays below it.
 * Wild levels scale off the starter (belowPlayer); trainer and boss levels off your strongest Pokémon (bossLv /
 * lvPlus), at most its level + 2 and the team's average level + 1 (or its level - 1 if it is far ahead), except
 * Necrozma (strongest + GIANT_LV) and Ultra Necrozma (starter - 6, solo, boosted, unlosable).
 */
(() => {
  'use strict';

  const TRAINERS = 'https://play.pokemonshowdown.com/sprites/trainers';

  window.STORY_CAST = {
    narrator: { name: '' },
    player: { name: '{player}', sprite: (s) => `${TRAINERS}/${s.look || 'red'}.png` },
    mom: { name: 'Mom', sprite: `${TRAINERS}/lady.png` },
    oak: { name: 'Prof. Oak', sprite: `${TRAINERS}/oak.png` },
    rival: { name: '{rival}', sprite: `${TRAINERS}/blue.png` },
    daisy: { name: 'Daisy', sprite: `${TRAINERS}/daisy.png` },
    courier: { name: 'Barlow', sprite: `${TRAINERS}/courier.png` },
    youngster: { name: 'Youngster Tobi', sprite: `${TRAINERS}/youngster.png` },
    fisher: { name: 'Old Hollis', sprite: `${TRAINERS}/fisherman.png` },
    quill: { name: 'Dr. Quill', sprite: `${TRAINERS}/scientistf.png` },
    veil: { name: 'Stranger', sprite: `${TRAINERS}/psychicf.png`, silhouette: true },
    grunt: { name: 'Veil Grunt', sprite: `${TRAINERS}/plasmagrunt.png` },
    dell: { name: 'Foreman Dell', sprite: `${TRAINERS}/hiker.png` },
    admin: { name: 'Admin Rook', sprite: `${TRAINERS}/archer.png` },
    bo: { name: 'Engineer Bo', sprite: `${TRAINERS}/worker.png` },
    gruntdot: { name: 'Grunt Dot', sprite: `${TRAINERS}/plasmagruntf.png` },
    gruntdash: { name: 'Grunt Dash', sprite: `${TRAINERS}/galacticgrunt.png` },
    leader: { name: 'Master Nox', sprite: `${TRAINERS}/ghetsis.png` },
    sable: { name: 'Prof. Sable', sprite: `${TRAINERS}/magnolia.png` },
    wren: { name: 'Wren', sprite: `${TRAINERS}/psychicf.png` },
  };

  window.STORY_LOOKS = {
    red: { label: 'Cap and jacket', sprite: `${TRAINERS}/red.png` },
    lyra: { label: 'Overalls and hat', sprite: `${TRAINERS}/lyra.png` },
    brendan: { label: 'Headband and pack', sprite: `${TRAINERS}/brendan.png` },
  };

  const NICKNAMES = {
    1: ['Sprout', 'Bulby', 'Clover'],
    4: ['Ember', 'Blaze', 'Cinder'],
    7: ['Shelly', 'Splash', 'Torrent'],
  };

  const chapter1 = {
    id: 'ch1',
    title: 'Chapter 1',
    levelCap: 6, // wins stop levelling here (only grinding reaches it)
    subtitle: 'A World of Pokémon',
    start: 'intro',
    summary: (s) => {
      const result = s.flags['ch1:battle'];
      return `{player} set out with {mon} (Lv. ${s.mon.level})` +
        (result ? `, having ${result === 'win' ? 'beaten' : 'lost to'} {rival} in their first battle.` : '.');
    },
    scenes: {
      intro: {
        bg: 'intro',
        cast: ['oak'],
        panels: [
          { who: 'oak', text: 'Hello there! Welcome to the world of Pokémon!' },
          { who: 'oak', text: 'My name is Oak. People call me the Pokémon Prof!' },
          { who: 'oak', mon: 33, text: 'This world is full of creatures called Pokémon. Some people keep Pokémon as pets. Others battle with them.' },
          { who: 'oak', mon: 33, text: 'Me? I study Pokémon. It\'s my job!' },
          { who: 'oak', text: 'But first, tell me a little about yourself. Which of these looks like you?' },
        ],
        prompt: { kind: 'look', options: ['red', 'lyra', 'brendan'], next: 'playerName' },
      },

      playerName: {
        bg: 'intro',
        cast: ['player'],
        panels: [{ who: 'oak', text: 'Right! And what is your name?' }],
        prompt: { kind: 'name', field: 'player', suggestions: ['Red', 'Leaf', 'Ash'], next: 'rivalName' },
      },

      rivalName: {
        bg: 'intro',
        cast: ['rival'],
        panels: [
          { who: 'oak', cast: ['player'], text: 'Right! So your name is {player}!' },
          { who: 'oak', text: 'This is my grandson. He\'s been your rival since you were both babies.' },
          { who: 'oak', text: '…Erm, what was his name again?' },
        ],
        prompt: { kind: 'name', field: 'rival', suggestions: ['Gary', 'Blue', 'Green'], next: 'bedroom' },
      },

      bedroom: {
        bg: 'bedroom',
        cast: ['mom'],
        panels: [
          { who: 'oak', bg: 'intro', cast: ['rival'], text: 'That\'s right! I remember now! His name is {rival}!' },
          { who: 'oak', bg: 'intro', cast: ['player'], text: '{player}! Your very own Pokémon adventure is about to begin!' },
          { who: 'narrator', cast: [], text: 'Pallet Town. It\'s a quiet morning, and it\'s the day you\'ve waited years for.' },
          { who: 'mom', text: '{player}! You\'re finally up! Professor Oak called. He wants you at his lab today.' },
          { who: 'mom', text: 'Your big day, and you slept through the alarm. Are you ready?' },
        ],
        prompt: {
          kind: 'choice',
          speak: true,
          options: [
            {
              text: 'Ready as I\'ll ever be!',
              set: { mood: 'eager' },
              after: [{ who: 'mom', text: 'That\'s the spirit! Go on, the Professor is waiting.' }],
              next: 'town',
            },
            {
              text: 'Five more minutes…',
              set: { mood: 'sleepy' },
              after: [
                { who: 'mom', text: 'No way! {rival} left for the lab an hour ago!' },
                { who: 'narrator', text: 'You drag yourself out of bed and pull on your shoes.' },
              ],
              next: 'town',
            },
            {
              text: 'Can I have breakfast first?',
              set: { mood: 'hungry' },
              give: { potion: 1 },
              after: [
                { who: 'mom', text: 'Take this toast for the road. Oh, and a Potion, just in case.' },
                { who: 'narrator', text: 'You got a Potion! It heals 20 HP in battle.' },
              ],
              next: 'town',
            },
          ],
        },
      },

      town: {
        bg: 'town',
        cast: [],
        panels: [
          { who: 'narrator', text: 'Outside, Pallet Town is calm and sunny. At the edge of town, the tall grass of Route 1 waves in the wind.' },
          { who: 'narrator', text: 'Professor Oak\'s lab is just down the path. Where do you go?' },
        ],
        prompt: {
          kind: 'choice',
          options: [
            { text: 'Head straight to the lab', next: 'lab' },
            { text: 'Explore the tall grass', next: 'grass' },
            { text: 'Knock on {rival}\'s door', next: 'daisy' },
          ],
        },
      },

      grass: {
        bg: 'grass',
        cast: [],
        set: { grass: true },
        panels: [
          { who: 'narrator', text: 'You step into the tall grass. Something rustles close by…' },
          { who: 'oak', cast: ['oak'], text: 'Hey! Wait! Don\'t go in there! It\'s not safe!' },
          { who: 'oak', cast: ['oak'], text: 'Wild Pokémon live in tall grass! You need your own Pokémon to keep you safe. Come with me!' },
        ],
        next: 'lab',
      },

      daisy: {
        bg: 'house',
        cast: ['daisy'],
        give: { potion: 1 },
        set: { daisy: true },
        panels: [
          { who: 'daisy', text: 'Oh, hi {player}! {rival} already ran off to Grandpa\'s lab. He was SO show-offy about it.' },
          { who: 'daisy', text: 'Here, take this Potion. Somebody needs to beat my little brother, just once.' },
          { who: 'narrator', text: 'You got a Potion! It heals 20 HP in battle.' },
        ],
        next: 'lab',
      },

      lab: {
        bg: 'lab',
        cast: ['rival', 'oak'],
        panels: (s) => [
          s.flags.grass
            ? { who: 'oak', text: 'Look who I found wandering into the tall grass, {rival}.' }
            : { who: 'rival', text: '{player}?! Took you long enough.' },
          { who: 'rival', text: 'Gramps! I\'m fed up with waiting!' },
          { who: 'oak', text: '{rival}? Let me think… Oh, that\'s right, I told you to come! Just wait!' },
          { who: 'oak', text: 'Here, {player}. There are three Pokémon here. They are inside the Poké Balls.' },
          { who: 'oak', text: 'When I was young, I was a Pokémon trainer too. Now I only have these three left. You can have one. Choose!' },
          { who: 'rival', text: 'Hey! Gramps! What about me?' },
          { who: 'oak', text: 'Be patient, {rival}. You can have one too.' },
        ],
        prompt: { kind: 'starter', options: [1, 4, 7], next: 'chosen' },
      },

      chosen: {
        bg: 'lab',
        cast: ['oak'],
        panels: [
          { who: 'oak', mon: 'player', text: '{species} it is! This {type}-type Pokémon will be a great partner.' },
          { who: 'oak', mon: 'player', text: 'Would you like to give your {species} a nickname?' },
        ],
        prompt: {
          kind: 'name',
          field: 'nickname',
          suggestions: (s) => NICKNAMES[s.mon.id] || ['Buddy', 'Champ', 'Sparky'],
          next: 'rivalPick',
        },
      },

      rivalPick: {
        bg: 'lab',
        cast: ['rival'],
        panels: [
          { who: 'narrator', mon: 'player', text: '{player} received {mon}!' },
          { who: 'rival', text: 'Hmph. Then I\'ll take THIS one!' },
          { who: 'narrator', mon: 'rival', text: '{rival} received a {rivalMon}!' },
          { who: 'rival', mon: 'rival', text: 'My {rivalMon} looks a lot tougher than yours.' },
        ],
        prompt: {
          kind: 'choice',
          question: 'How do you answer {rival}?',
          speak: true,
          options: [
            {
              text: 'We\'ll see about that.',
              set: { tone: 'confident' },
              after: [{ who: 'rival', text: 'Oh yeah? Wait, {player}! Let\'s check out our Pokémon. Come on, I\'ll take you on!' }],
              next: 'battle',
            },
            {
              text: 'Good luck. I mean it.',
              set: { tone: 'kind' },
              after: [
                { who: 'rival', text: '…Ugh. Don\'t be nice, it\'s weird. Just battle me already!' },
                { who: 'narrator', text: '{rival} goes red in the face. His {rivalMon} seems less sure of itself.' },
              ],
              next: 'battle',
            },
            {
              text: 'Yours looks like it needs a nap.',
              set: { tone: 'taunt' },
              after: [
                { who: 'rival', text: 'WHAT did you just say?! {rivalMon}, let\'s crush them!' },
                { who: 'narrator', text: '{rival}\'s {rivalMon} looks fired up!' },
              ],
              next: 'battle',
            },
          ],
        },
      },

      battle: {
        bg: 'lab',
        cast: ['rival'],
        panels: [],
        prompt: {
          kind: 'battle',
          trainer: 'rival',
          level: 5,
          // Like the originals, the rival's starter only knows its basic moves in this first fight.
          foeMoveLevel: 1,
          // Your reply to the rival changes how his Pokémon starts the fight.
          foeMods: (s) => {
            const n = s.flags.tone === 'taunt' ? 1 : s.flags.tone === 'kind' ? -1 : 0;
            return n ? { attack: n, 'special-attack': n } : {};
          },
          win: 'won',
          lose: 'lost',
        },
      },

      won: {
        bg: 'lab',
        cast: ['rival', 'oak'],
        panels: [
          { who: 'rival', text: 'WHAT? Unbelievable! I picked the wrong Pokémon!' },
          { who: 'oak', text: 'Wonderful, {player}! You and {mon} make a great team already.' },
          { who: 'rival', text: 'Okay! I\'ll train my Pokémon until it\'s super strong! {player}! Gramps! Smell ya later!' },
        ],
        next: 'farewell',
      },

      lost: {
        bg: 'lab',
        cast: ['rival', 'oak'],
        panels: [
          { who: 'rival', text: 'Yeah! Am I great or what?' },
          { who: 'oak', text: 'Don\'t be sad, {player}. Every great trainer loses sometimes. Here, let me heal {mon}.' },
          { who: 'narrator', mon: 'player', text: '{mon} is all better now!' },
          { who: 'rival', text: 'Smell ya later, {player}!' },
        ],
        next: 'farewell',
      },

      farewell: {
        bg: 'lab',
        cast: ['oak'],
        panels: [
          { who: 'oak', text: '{player}, one more thing. This is the Pokédex. It keeps notes on every Pokémon you meet.' },
          { who: 'oak', text: 'Filling it up has always been my dream. Take it with you!' },
          { who: 'oak', text: 'A world of Pokémon adventures is waiting for you! Let\'s go!' },
        ],
        prompt: { kind: 'end' },
      },
    },
  };

  // ---------- Chapter 2: a delivery north, with wild Pokémon on the way ----------
  const ROUTE_WILDS = [16, 19, 21, 10, 13];      // Pidgey, Rattata, Spearow, Caterpie, Weedle
  // Whisperwood is grass and bug country, which would flatten a Water starter, so it meets bugs
  // and birds instead of Grass types. Keyed by the starter's first type.
  const WOODS_WILDS = {
    water: [48, 10, 13, 16],                     // Venonat, Caterpie, Weedle, Pidgey
    default: [43, 69, 46, 48],                   // Oddish, Bellsprout, Paras, Venonat
  };
  // Wild Pokémon are scaled to your partner, a level or two below it, so a lost battle
  // earlier on doesn't snowball.
  const belowPlayer = (lo, hi) => (s) => [Math.max(2, s.mon.level - lo), Math.max(2, s.mon.level - hi)];
  // Boss levels: your strongest Pokémon's level + d, plus a small per-starter nudge (keyed by the
  // starter's first type) where the type matchups made one starter's battle much easier or harder
  // than the others'. The nudges come from the balance pass (see "Balance notes" in STORY_PLAN.md).
  // Strongest, not starter: a team led by a Pokémon that outgrew the starter would otherwise steamroll.
  // Never more than 2 above the strongest (the story bible's limit for bosses), and never more than
  // 1 above the team's average level, so a team of newer, lower-level Pokémon isn't knocked out in one hit,
  // unless one Pokémon is far ahead: then up to 1 below it.
  const teamAvg = (s) => {
    const all = [s.mon, ...(s.party || [])];
    return all.reduce((sum, m) => sum + m.level, 0) / all.length;
  };
  const topLv = (s) => Math.max(s.mon.level, ...(s.party || []).map((m) => m.level));
  const bossLv = (d, nudge = {}) => (s) => Math.max(2, Math.min(
    topLv(s) + 2,
    Math.max(Math.round(teamAvg(s)) + 1, topLv(s) - 1),
    topLv(s) + d + (nudge[s.mon.types[0]] || 0),
  ));

  const chapter2 = {
    id: 'ch2',
    title: 'Chapter 2',
    levelCap: 8, // wins stop levelling here (only grinding reaches it)
    subtitle: 'Special Delivery',
    start: 'morning',
    summary: (s) => `{player} carried the humming case through Whisperwood and gave it to Dr. Quill at Glimmer Lake. ` +
      `{mon} is now Lv. ${s.mon.level}, and the bag holds ${s.bag.pokeball} Poké Balls.`,
    scenes: {
      morning: {
        bg: 'town',
        cast: ['courier'],
        panels: [
          { who: 'narrator', cast: [], text: 'The next morning, Pallet Town is busy. A delivery cart is stuck outside the post office, with one wheel in a ditch.' },
          { who: 'courier', text: 'Ow, ow, ow… Hey! You\'re the new trainer, right? {player}? My name\'s Barlow. I take parcels to the villages up north.' },
          { who: 'courier', text: 'I hurt my ankle pulling that cart out. And I\'ve got one delivery that can\'t wait.' },
          { who: 'courier', text: 'It has to reach Dr. Quill. She\'s a scientist camping at Glimmer Lake, past Whisperwood. It has to get there tonight.' },
          { who: 'narrator', text: 'He holds up a small metal case. It says DO NOT OPEN on the top. It feels cold, and it hums very quietly.' },
        ],
        prompt: {
          kind: 'choice',
          speak: true,
          options: [
            {
              text: 'Leave it to me and {mon}!',
              set: { deal: 'eager' },
              after: [{ who: 'courier', text: 'Ha! That\'s the spirit. Quill pays in Poké Balls, and trust me, you\'ll want those.' }],
              next: 'route',
            },
            {
              text: 'Why is it humming?',
              set: { deal: 'curious' },
              after: [
                { who: 'courier', text: 'No idea. It was found under some fallen rocks near Mt. Moon, and Quill wanted it right away.' },
                { who: 'courier', text: 'Whatever you do, don\'t open it. She was very clear on that.' },
              ],
              next: 'route',
            },
            {
              text: 'What\'s in it for me?',
              set: { deal: 'bargain' },
              give: { potion: 1 },
              after: [
                { who: 'courier', text: 'Ha, you want a reward? Here, have a Potion now. Quill pays the rest in Poké Balls.' },
                { who: 'narrator', text: 'You got a Potion!' },
              ],
              next: 'route',
            },
          ],
        },
      },

      route: {
        bg: 'route',
        cast: [],
        panels: [
          { who: 'narrator', text: 'With the case tucked in your bag, you and {mon} head north. {mon} keeps glancing back at the bag.' },
          { who: 'narrator', text: 'Where the road bends, it splits three ways.' },
        ],
        prompt: {
          kind: 'choice',
          question: 'Which way do you go?',
          options: [
            { text: 'The riverside path, long but calm', next: 'river' },
            { text: 'Straight through the tall grass', next: 'grass' },
            { text: 'The old fence line, where kids train', next: 'fence' },
          ],
        },
      },

      river: {
        bg: 'route',
        cast: ['fisher'],
        give: { potion: 1 },
        set: { river: true },
        panels: [
          { who: 'fisher', text: 'Going to Glimmer Lake, are you? Watch out for the mist. It\'s come every night this week, thick as soup.' },
          { who: 'fisher', text: 'When it comes, the fish won\'t bite. They all just face north, like they\'re listening for something.' },
          { who: 'fisher', text: 'Here, take a Potion. Lake people help each other out.' },
          { who: 'narrator', text: 'You got a Potion!' },
        ],
        next: 'woods',
      },

      grass: {
        bg: 'grass',
        cast: [],
        panels: [{ who: 'narrator', text: 'You wade into the tall grass. Almost at once, something bursts out of it!' }],
        prompt: { kind: 'battle', foe: ROUTE_WILDS, level: belowPlayer(2, 1), win: 'afterGrass', lose: 'afterGrass', run: 'afterGrass' },
      },

      afterGrass: {
        bg: 'grass',
        cast: [],
        panels: (s) => ({
          win: [{ who: 'narrator', mon: 'player', text: 'The grass goes quiet. {mon} looks very pleased with itself.' }],
          lose: [
            { who: 'narrator', text: 'You stagger out the far side of the grass. At least the case is in one piece.' },
            { who: 'narrator', mon: 'player', text: '{mon} shakes it off. It\'s tougher than it looks.' },
          ],
          run: [{ who: 'narrator', text: 'You sprint the rest of the way through the grass, the case bouncing in your bag.' }],
          caught: [{ who: 'narrator', mon: 'caught', text: 'You got a {caughtSpecies}! Not a bad detour.' }],
        })[s.flags['ch2:grass']] || [],
        next: 'woods',
      },

      fence: {
        bg: 'route',
        cast: ['youngster'],
        panels: [
          { who: 'youngster', text: 'Hey! You! When trainers lock eyes, they have to battle. It\'s the rule!' },
          { who: 'youngster', text: 'I\'ve been training my Rattata all week. Its fangs are the sharpest on the whole route!' },
        ],
        prompt: {
          kind: 'choice',
          speak: true,
          options: [
            { text: 'You\'re on!', set: { fence: 'battle' }, next: 'fenceBattle' },
            {
              text: 'Sorry, I\'m on a delivery.',
              set: { fence: 'declined' },
              after: [{ who: 'youngster', text: 'A delivery? Aw, you\'re no fun. Fine, but you owe me a rematch!' }],
              next: 'woods',
            },
          ],
        },
      },

      fenceBattle: {
        bg: 'route',
        cast: ['youngster'],
        panels: [],
        prompt: { kind: 'battle', trainer: 'youngster', foe: 19, level: 4, win: 'fenceWon', lose: 'fenceLost' },
      },

      fenceWon: {
        bg: 'route',
        cast: ['youngster'],
        give: { potion: 1 },
        panels: [
          { who: 'youngster', text: 'No way! My Rattata! All that training!' },
          { who: 'youngster', text: 'Okay, okay, you earned this. It\'s my last Potion. Don\'t tell my mom.' },
          { who: 'narrator', text: 'You got a Potion!' },
        ],
        next: 'woods',
      },

      fenceLost: {
        bg: 'route',
        cast: ['youngster'],
        give: { potion: 1 },
        panels: [
          { who: 'youngster', text: 'Yes! Undefeated on the fence line!' },
          { who: 'youngster', text: 'Your {mon} looks beat, though. Here, have my spare Potion. Rematch me some time!' },
          { who: 'narrator', text: 'You got a Potion!' },
        ],
        next: 'woods',
      },

      woods: {
        bg: 'forest',
        cast: [],
        panels: [
          { who: 'narrator', text: 'The trees of Whisperwood are tall and close together. It\'s quiet. Too quiet.' },
          { who: 'narrator', text: 'Then the case in your bag begins to hum, louder than before. A thin purple light shines out through the cracks.' },
          { who: 'narrator', mon: 'player', text: '{mon} stands still and growls at your bag.' },
        ],
        prompt: {
          kind: 'choice',
          question: 'What do you do?',
          options: [
            {
              text: 'Peek inside the case',
              set: { peeked: true },
              after: [
                { who: 'narrator', text: 'You open the lid, just a tiny bit.' },
                { who: 'narrator', text: 'Inside, on soft grey foam, is a piece of purple crystal. It glows on and off, slowly, like a heartbeat.' },
                { who: 'narrator', text: 'For a moment, it seems to beat at the same time as your heart. You snap the lid shut.' },
              ],
              next: 'ambush',
            },
            {
              text: 'Keep it shut. A promise is a promise.',
              set: { peeked: false },
              after: [{ who: 'narrator', text: 'You keep the lid shut tight and keep walking. The humming follows you like a shadow.' }],
              next: 'ambush',
            },
            {
              text: 'Kneel down and calm {mon}',
              set: { bond: true },
              after: [
                { who: 'narrator', mon: 'player', text: 'You kneel and rest a hand on {mon}. Slowly, it stops growling.' },
                { who: 'narrator', mon: 'player', text: '{mon} leans against you. Whatever that case is, you\'ll face it together.' },
              ],
              next: 'ambush',
            },
          ],
        },
      },

      ambush: {
        bg: 'forest',
        cast: [],
        panels: [{ who: 'narrator', text: 'Crash! Something jumps out of the bushes, with glowing purple eyes. The light made it come!' }],
        prompt: {
          kind: 'battle',
          foe: (s) => WOODS_WILDS[s.mon.types[0]] || WOODS_WILDS.default,
          // Grass/Poison foes shrug off a Grass starter's best moves, so they come a level lower for it.
          level: (s) => (s.mon.types[0] === 'grass' ? belowPlayer(2, 1) : belowPlayer(1, 0))(s),
          // Opening the case riles up whatever it draws in (it's quicker); a calm partner keeps its nerve.
          foeMods: (s) => (s.flags.peeked ? { speed: 1 } : s.flags.bond ? { speed: -1 } : {}),
          win: 'afterAmbush',
          lose: 'afterAmbush',
          run: 'afterAmbush',
        },
      },

      afterAmbush: {
        bg: 'forest',
        cast: [],
        panels: (s) => [
          ...({
            win: [{ who: 'narrator', mon: 'foe', text: 'The {foe} blinks and shakes its head. The purple glow leaves its eyes, and it runs off, confused.' }],
            caught: [{ who: 'narrator', mon: 'caught', text: 'The Poké Ball goes still. When you peek at {caughtSpecies} inside, the purple glow in its eyes has gone.' }],
          }[s.flags['ch2:ambush']] || [
            { who: 'narrator', text: 'You run until the trees thin out, the case clutched to your chest.' },
            { who: 'narrator', text: 'Behind you, two purple eyes glow in the dark, then disappear.' },
          ]),
          { who: 'narrator', text: 'Up ahead, past the last trees, you can see Glimmer Lake shining silver.' },
        ],
        next: 'camp',
      },

      camp: {
        bg: 'camp',
        cast: ['quill'],
        panels: (s) => [
          { who: 'quill', text: 'Is that…? Barlow must have sent you! I\'m Dr. Quill. Please tell me that\'s my case.' },
          { who: 'narrator', text: 'You hand it over. She checks the lid very carefully.' },
          s.flags.peeked
            ? { who: 'quill', text: 'Someone opened this. Hmm.' }
            : { who: 'quill', text: 'Still shut tight. Good. Very good.' },
          { who: 'quill', text: 'Did anything… strange happen on the way?' },
        ],
        prompt: {
          kind: 'choice',
          speak: true,
          options: [
            {
              text: 'It hummed, and a wild Pokémon went wild!',
              set: { told: 'truth' },
              after: [{ who: 'quill', text: 'Its light pulls Pokémon in. I was worried about that. Well done for getting here safely.' }],
              next: 'reward',
            },
            {
              text: 'I peeked inside. Sorry.',
              if: (s) => s.flags.peeked,
              set: { told: 'confess' },
              after: [
                { who: 'quill', text: 'Thank you for telling the truth. I like that.' },
                { who: 'quill', text: 'Then you felt it too, didn\'t you? The heartbeat. Let\'s keep that our secret for now.' },
              ],
              next: 'reward',
            },
            {
              text: 'Nothing at all. Easy delivery.',
              set: { told: 'lie' },
              after: [
                { who: 'quill', text: '…I see.' },
                { who: 'narrator', text: 'She looks at the scratches on your bag, then at {mon}, but she doesn\'t say anything.' },
              ],
              next: 'reward',
            },
          ],
        },
      },

      reward: {
        bg: 'camp',
        cast: ['quill'],
        give: { pokeball: 5 },
        panels: [
          { who: 'quill', text: 'A deal\'s a deal. Barlow told you I pay in Poké Balls? Here are five.' },
          { who: 'narrator', text: 'You got 5 Poké Balls!' },
          { who: 'quill', text: 'This is a Glimmer Shard. Old stories say they only fall when something wakes up deep under the mountains.' },
          { who: 'quill', text: 'Since it got here, lots of Pokémon have been coming to the lake. Dozens of them, every morning, in the mist.' },
          { who: 'quill', text: 'Stay at our camp tonight. In the morning, I\'ll need a trainer\'s help, and a few of those Poké Balls.' },
        ],
        prompt: { kind: 'end' },
      },
    },
  };

  // ---------- Chapter 3: catching a new partner, and a mystery ----------
  const AREAS = {
    shore: {
      mons: [54, 60, 399], // Psyduck, Poliwag, Bidoof (Normal, so the shore isn't all Water for a Fire starter)
      panels: [
        { who: 'narrator', bg: 'lake', text: 'You walk through the tall reeds. The water splashes your shoes, and something splashes back!' },
      ],
    },
    woods: {
      mons: [25, 43, 52], // Pikachu, Oddish, Meowth
      panels: [
        { who: 'narrator', bg: 'forest', text: 'The moss is soft under your feet. Between the trees, a small shape is hiding and watching you.' },
      ],
    },
    ridge: {
      mons: [74, 27, 37], // Geodude, Sandshrew, Vulpix
      panels: [
        { who: 'narrator', bg: 'route', text: 'You climb the rocky hill above the lake. A little stone rolls down past you. Then another one.' },
      ],
    },
  };

  const RISKY_AREA = {
    fire: 'A tip: the shore has lots of Water types. Water beats Fire, so be careful with {mon}.',
    water: 'A tip: there\'s a Pikachu and an Oddish in the woods. Electric and Grass beat Water, so be careful with {mon}.',
    grass: 'A tip: I\'ve seen a Vulpix up on the hill. Fire beats Grass, so be careful with {mon}.',
  };

  const CATCH_NICKNAMES = {
    25: ['Sparky', 'Volt', 'Pip'], 27: ['Dusty', 'Pebble', 'Burrow'], 37: ['Ember', 'Kit', 'Foxglove'],
    43: ['Sprig', 'Radish', 'Leafy'], 52: ['Coin', 'Whiskers', 'Charm'], 54: ['Ducky', 'Noodle', 'Puddle'],
    60: ['Swirl', 'Bubbles', 'Tad'], 74: ['Rocky', 'Boulder', 'Grit'], 399: ['Buck', 'Nibbles', 'Chomper'],
  };

  // The stranger's partner. Poochyena is Dark, which is neutral against all three starters.
  const STRANGER_MON = 261;
  const shardSaved = (s) => s.flags['ch3:duel'] === 'win';

  const chapter3 = {
    id: 'ch3',
    title: 'Chapter 3',
    levelCap: 9, // wins stop levelling here (about where a player who wins everything is)
    subtitle: 'Mist on Glimmer Lake',
    start: 'dawn',
    summary: (s) => (shardSaved(s)
      ? '{player} caught {caught} at Glimmer Lake, then beat a stranger from the Veil and saved the Glimmer Shard! '
      : '{player} caught {caught} at Glimmer Lake, but a stranger from the Veil took the Glimmer Shard in the night. ') +
      'Five more shards are out there, somewhere to the north. To be continued…',
    scenes: {
      dawn: {
        bg: 'lake',
        cast: ['quill'],
        panels: [
          { who: 'narrator', cast: [], text: 'Morning. A thick white mist covers Glimmer Lake. You can hardly see the other side.' },
          { who: 'quill', text: 'Good morning, {player}! Listen. Can you hear them? Pokémon all around the lake. More come every day since the shard got here.' },
          { who: 'quill', text: 'I need to study one up close, to see what the shard is doing to them. That\'s where you and {mon} come in.' },
          { who: 'quill', text: 'Here\'s how to catch one. First, battle it to make it tired, but don\'t knock it out. Then throw a Poké Ball from your bag.' },
          { who: 'quill', text: 'The less HP it has left, the better your chances. Some Pokémon break free, so keep trying!' },
          { who: 'narrator', text: (s) => `You check your bag: ${s.bag.pokeball} Poké Balls and ${s.bag.potion} Potions.` },
        ],
        next: 'pickArea',
      },

      pickArea: {
        bg: 'lake',
        cast: ['quill'],
        // Every area is catchable, but one is a bad type matchup; Quill says which, so the choice is informed.
        panels: (s) => [{ who: 'quill', text: RISKY_AREA[s.mon.types[0]] || 'Every spot has different Pokémon. Pick the one you like!' }],
        prompt: {
          kind: 'choice',
          question: 'Where do you look?',
          options: [
            { text: 'The reedy shore', set: { area: 'shore' }, next: 'search' },
            { text: 'The mossy woods', set: { area: 'woods' }, next: 'search' },
            { text: 'The rocky hill', set: { area: 'ridge' }, next: 'search' },
          ],
        },
      },

      search: {
        bg: 'lake',
        cast: [],
        panels: (s) => AREAS[s.flags.area].panels,
        prompt: {
          kind: 'battle',
          foe: (s) => AREAS[s.flags.area].mons,
          level: belowPlayer(2, 0),
          caught: 'caught',
          win: 'missed',
          lose: 'missed',
          run: 'missed',
        },
      },

      missed: {
        bg: 'lake',
        cast: ['quill'],
        // Never leave the player unable to finish: top the bag back up to three Poké Balls.
        give: (s) => (s.bag.pokeball < 3 ? { pokeball: 3 - s.bag.pokeball } : {}),
        panels: (s) => [
          ({
            win: { who: 'quill', text: 'Oh, you knocked it out! It will be fine, but it can\'t come with us now. Remember: make it tired, but don\'t knock it out.' },
            lose: { who: 'quill', text: 'Oof. That one was tough! Let me help {mon} feel better.' },
          })[s.flags['ch3:search']] || { who: 'quill', text: 'It got away? That happens to everyone. The mist makes them jumpy.' },
          { who: 'quill', text: 'I put a few more Poké Balls in your bag. Let\'s try again!' },
        ],
        next: 'pickArea',
      },

      caught: {
        bg: 'lake',
        cast: ['quill'],
        panels: [
          { who: 'narrator', mon: 'caught', text: '{caughtSpecies} joined your team!' },
          { who: 'quill', mon: 'caught', text: 'You did it! A healthy {caughtSpecies}. And look at its eyes. See that little purple ring? I think the shard did that.' },
          { who: 'quill', mon: 'caught', text: 'It\'s yours to keep. Do you want to give it a nickname?' },
        ],
        prompt: {
          kind: 'name',
          field: 'caughtNickname',
          suggestions: (s) => CATCH_NICKNAMES[s.party[s.party.length - 1].id] || ['Scout', 'Misty', 'Echo'],
          next: 'dusk',
        },
      },

      dusk: {
        bg: 'camp',
        cast: ['quill'],
        panels: [
          { who: 'narrator', cast: [], text: 'The rest of the day flies by. Dr. Quill writes lots of notes, and {caught} and {mon} play by the water.' },
          { who: 'quill', text: 'More work on the shard tomorrow. Get some sleep, {player}. You\'ve earned it.' },
          { who: 'narrator', cast: [], text: 'In the middle of the night, a strange light wakes you up. The whole camp is glowing purple.' },
        ],
        next: 'night',
      },

      night: {
        bg: 'night',
        cast: [],
        panels: [
          { who: 'narrator', mon: 'caught', text: '{caught} is standing at the tent door, very still, looking north at the mountains.' },
          { who: 'narrator', mon: 'player', text: '{mon} is right next to it, looking the same way.' },
          { who: 'narrator', text: 'Down by the water, the case is open. And someone you have never seen before is standing over it!' },
        ],
        prompt: {
          kind: 'choice',
          question: 'What do you do?',
          options: [
            { text: 'Sneak closer to get a better look', set: { night: 'sneak' }, next: 'figure' },
            { text: 'Wake up Dr. Quill', set: { night: 'wake' }, next: 'figure' },
            { text: 'Shout "Hey! That\'s not yours!"', set: { night: 'shout' }, next: 'figure' },
          ],
        },
      },

      figure: {
        bg: 'night',
        cast: ['veil'],
        panels: (s) => {
          const both = ['quill', 'veil'];
          const opening = {
            sneak: { who: 'narrator', text: 'You creep down to the water, staying low. Snap! You step on a twig. The stranger turns around.' },
            wake: { who: 'narrator', cast: both, text: 'You shake Dr. Quill awake. When she comes out of the tent, the stranger turns to look at you both.' },
            shout: { who: 'narrator', text: 'Your shout echoes across the lake. The stranger turns around slowly. They don\'t look scared at all.' },
          }[s.flags.night];
          const cast = s.flags.night === 'wake' ? both : ['veil'];
          return [
            opening,
            { who: 'veil', cast, text: 'So you\'re the one who carried the shard here.' },
            s.flags.peeked
              ? { who: 'veil', cast, text: 'You opened the case, didn\'t you? I can tell. The shard remembers you.' }
              : { who: 'veil', cast, text: 'You never even opened the case? How boring.' },
            { who: 'veil', cast, text: 'Seven shards fell from the mountain. With this one, we will have two.' },
            { who: 'veil', cast, text: 'You want it back? Then you\'ll have to battle me for it!' },
          ];
        },
        prompt: {
          kind: 'choice',
          speak: true,
          options: [
            {
              text: 'Let\'s go, {mon}!',
              after: [{ who: 'narrator', mon: 'player', text: '{mon} jumps in front of you, ready to battle.' }],
              next: 'duel',
            },
            {
              text: 'You can\'t just take things!',
              after: [{ who: 'veil', text: 'I can if I win. Let\'s see if you can stop me.' }],
              next: 'duel',
            },
          ],
        },
      },

      duel: {
        bg: 'night',
        cast: ['veil'],
        panels: (s) => (s.flags.night === 'wake'
          ? [{ who: 'quill', cast: ['quill', 'veil'], text: 'I\'ll shine my torch in its eyes, {player}. That will make it harder for it to hit you!' }]
          : []),
        prompt: {
          kind: 'battle',
          trainer: 'veil',
          foe: STRANGER_MON,
          shardBoss: true, // a win gives 2 levels
          level: bossLv(2),
          // Waking Quill pays off: her torch in Poochyena's eyes makes it easier to dodge.
          foeMods: (s) => (s.flags.night === 'wake' ? { accuracy: -1 } : {}),
          win: 'afterDuel',
          lose: 'afterDuel',
        },
      },

      afterDuel: {
        bg: 'night',
        cast: ['veil'],
        shard: (s) => (shardSaved(s) ? 'glimmer' : null),
        panels: (s) => (shardSaved(s)
          ? [
            { who: 'narrator', mon: STRANGER_MON, text: 'Poochyena shakes its head. The purple glow in its eyes fades away.' },
            { who: 'veil', text: 'What?! A brand new trainer beat me?' },
            { who: 'narrator', text: 'The stranger is so surprised that the shard slips out of their hand. It rolls across the sand and stops right at your feet!' },
            { who: 'narrator', mon: 'player', text: 'You grab it. The stranger reaches for it, but {mon} jumps in the way.' },
            { who: 'veil', text: 'Fine. Keep it for now. We will meet again, {player}.' },
            { who: 'narrator', cast: [], text: 'Thick mist rises up from the lake. When it clears, the stranger is gone. But the shard is safe in your hands!' },
          ]
          : [
            { who: 'veil', text: 'Just as I thought. You are not ready yet.' },
            { who: 'veil', mon: 'caught', text: 'Look after your {caughtSpecies}. The shard\'s light has touched it. We will see it again.' },
            { who: 'narrator', cast: [], text: 'Thick mist rises up from the lake. When it clears, the stranger is gone. And so is the shard.' },
          ]),
        next: 'hook',
      },

      hook: {
        bg: 'camp',
        cast: ['quill'],
        panels: (s) => [
          shardSaved(s)
            ? { who: 'quill', text: 'You got it back! {player}, that was amazing. And so brave!' }
            : { who: 'quill', text: 'Gone! Just like that. They walked right into our camp and took it.' },
          { who: 'narrator', cast: [], text: 'Where the stranger stood, you find a black card in the mud. On it is a picture of a closed eye, and three words:' },
          { who: 'narrator', cast: [], text: 'THE VEIL REMEMBERS.' },
          { who: 'quill', text: 'The Veil… My old teacher used to talk about them. Then one day she went looking for the shards, and she never came back.' },
          ...(s.flags.told === 'lie'
            ? [{ who: 'quill', text: 'And, {player}? Next time something strange happens, please tell me. Even if it seems small.' }]
            : []),
          shardSaved(s)
            ? { who: 'quill', text: 'They already have one shard, and we have this one. That leaves five more out there, and I can\'t find them alone.' }
            : { who: 'quill', text: 'They have two shards now. That leaves five more out there, and I can\'t find them alone.' },
          ...(s.flags.peeked
            ? [{ who: 'narrator', cast: [], mon: 'player', text: '{mon}\'s eyes flash purple for a second. Then it blinks, and it\'s just {mon} again.' }]
            : []),
          ...(s.flags.bond
            ? [{ who: 'narrator', cast: [], mon: 'player', text: '{mon} leans against your leg, warm and strong. Whatever happens next, you\'ll face it together.' }]
            : []),
          { who: 'quill', text: 'Will you help me find the shards before the Veil does?' },
        ],
        prompt: {
          kind: 'choice',
          speak: true,
          options: [
            {
              text: 'I\'m in! Let\'s find them first.',
              set: { vow: 'in' },
              after: [{ who: 'quill', text: 'Then we leave in the morning. Pack everything!' }],
              next: 'north',
            },
            {
              text: 'Okay, but I get to help plan.',
              set: { vow: 'own' },
              after: [{ who: 'quill', text: 'Ha! Barlow said you were tough. Deal. You help plan, and I\'ll bring the maps.' }],
              next: 'north',
            },
            {
              text: 'First, tell me who they are.',
              set: { vow: 'wary' },
              after: [
                { who: 'quill', text: 'I wish I knew. All I have is my teacher\'s notebook, and half of it is in secret code.' },
                { who: 'quill', text: 'But I know where she was going when she went missing. North.' },
              ],
              next: 'north',
            },
          ],
        },
      },

      north: {
        bg: 'night',
        cast: [],
        panels: [
          { who: 'narrator', text: 'Far to the north, deep under the mountains, something that has been asleep for a very long time opens its eyes.' },
          { who: 'narrator', text: 'To be continued…' },
        ],
        prompt: { kind: 'end' },
      },
    },
  };

  // ---------- Shared helpers for chapters 4-5 ----------
  // Shards the player holds, and how many the Veil holds out of the ones found so far.
  const CH45_held = (s) => (s.shards || []).length;
  const CH45_has = (s, key) => (s.shards || []).includes(key);
  const CH45_shardWord = (n) => (n === 1 ? '1 shard' : `${n} shards`);
  const CH45_countLine = (s, found) => {
    const mine = CH45_held(s);
    const theirs = found - mine;
    return `We have ${CH45_shardWord(mine)} now, and the Veil has ${CH45_shardWord(theirs)}. That leaves ${7 - found} more out there.`;
  };
  const CH45_NICKNAMES = {
    19: ['Nibbles', 'Whiskers', 'Zoom'], 21: ['Beaky', 'Swoop', 'Pecky'], 69: ['Noodle', 'Twig', 'Bell'],
    41: ['Echo', 'Flap', 'Squeak'], 46: ['Shroom', 'Button', 'Nibbles'], 95: ['Rumble', 'Tunnel', 'Pebbles'],
    361: ['Frosty', 'Snowcap', 'Chilly'], 220: ['Truffle', 'Snuffles', 'Mocha'],
    66: ['Champ', 'Punch', 'Mo'], 215: ['Claw', 'Shade', 'Icicle'], 363: ['Roly', 'Snowball', 'Pudding'],
  };
  const CH45_nick = (s) => {
    const id = s.party[s.party.length - 1]?.id;
    return CH45_NICKNAMES[id] || CATCH_NICKNAMES[id] || ['Scout', 'Misty', 'Echo'];
  };
  // Top the bag back up to three Poké Balls so a catch can always be finished.
  const CH45_topUpBalls = (s) => (s.bag.pokeball < 3 ? { pokeball: 3 - s.bag.pokeball } : {});
  const CH45_canCatch = (s) => s.party.length < 5;

  // ---------- Chapter 4: Stonebrook Caves (Stone Shard) ----------
  // The first battle where switching matters: a wild Pokémon that is strong against the starter.
  const CH4_LESSON = {
    fire: { id: 74, name: 'Geodude', tip: 'Rock beats Fire' },
    water: { id: 69, name: 'Bellsprout', tip: 'Grass beats Water' },
    grass: { id: 21, name: 'Spearow', tip: 'Flying beats Grass' },
    default: { id: 19, name: 'Rattata', tip: '' },
  };
  const CH4_lesson = (s) => CH4_LESSON[s.mon.types[0]] || CH4_LESSON.default;

  // Every cave area mixes one Pokémon that is risky for a starter with one that isn't, so no
  // area is all super effective against Fire, Water or Grass.
  //   Fire:  Geodude/Onix risky, Zubat/Paras fine.  Water: Paras risky, the rest fine.
  //   Grass: Zubat/Paras risky, Geodude/Onix fine.
  const CAVE_AREAS = {
    tunnel: {
      mons: [41, 74], // Zubat, Geodude
      panels: [{ who: 'narrator', text: 'Squeak! Squeak! Something flaps right past your head in the dark!' }],
    },
    grove: {
      mons: [46, 74], // Paras, Geodude
      panels: [{ who: 'narrator', text: 'Tiny mushrooms glow on the walls. One of them just moved!' }],
    },
    hall: {
      mons: [95, 41], // Onix, Zubat
      panels: [{ who: 'narrator', text: 'The ground shakes. Something big is moving between the boulders!' }],
    },
  };
  const CAVE_TIP = {
    fire: 'A tip: Geodude and Onix are Rock types. Rock beats Fire, so be careful with {mon}.',
    water: 'A tip: Paras lives with the glowing mushrooms. It\'s part Grass, and Grass beats Water, so be careful with {mon}.',
    grass: 'A tip: Zubat can fly, and Flying beats Grass. Paras is a Bug, and Bug beats Grass too. Be careful with {mon}.',
  };
  const CH4_NUDGE = { fire: 1, water: 2 };
  const CH4_GRUNT_TEAM = (s) => [
    { id: 41, level: bossLv(0, CH4_NUDGE)(s) },     // Zubat
    { id: 27, level: bossLv(2)(s) },                // Sandshrew
  ];
  const ch4Won = (s) => s.flags['ch4:boss'] === 'win';

  const chapter4 = {
    id: 'ch4',
    title: 'Chapter 4',
    levelCap: 10, // wins stop levelling here (about where a player who wins everything is)
    subtitle: 'Stonebrook Caves',
    start: 'road',
    summary: (s) => {
      const caught = s.flags['ch4:search'] === 'caught' || s.flags['ch4:lesson'] === 'caught';
      return '{player} and Dr. Quill reached the mining village of Stonebrook' +
        (caught ? ', and {caught} joined the team. ' : '. ') +
        (ch4Won(s)
          ? 'Deep in the caves, {player} beat a Veil Grunt and won the Stone Shard! '
          : 'Deep in the caves, a Veil Grunt got away with the Stone Shard. ') +
        'Next stop: Frost Peak.';
    },
    scenes: {
      road: {
        bg: 'route',
        cast: ['quill'],
        panels: (s) => [
          ...({
            own: [
              { who: 'quill', text: 'Good morning, planner! You wanted to help plan, so here\'s the map.' },
              { who: 'narrator', text: 'You look at the map together. You point at a little village high in the mountains: Stonebrook.' },
              { who: 'quill', text: 'Stonebrook it is! The miners there dig very deep. If a shard fell nearby, they might have seen it.' },
            ],
            wary: [
              { who: 'quill', text: 'You asked who the Veil are. So I stayed up all night with my teacher\'s notebook.' },
              { who: 'quill', text: 'I cracked one line of the secret code. It says: "Stone Shard. Stonebrook. Deep down."' },
              { who: 'quill', text: 'So that\'s where we go. North, to the mining village of Stonebrook.' },
            ],
          }[s.flags.vow] || [
            { who: 'narrator', cast: [], text: 'Morning comes. True to your word, you are packed before the sun is up.' },
            { who: 'quill', text: 'You said you\'re in, so let\'s go! We\'re heading north to Stonebrook. It\'s a mining village in the mountains.' },
          ]),
          ...(s.flags.told === 'lie'
            ? [{ who: 'narrator', text: 'Dr. Quill keeps the map in her own pocket. Maybe she still remembers your "easy delivery".' }]
            : []),
          { who: 'quill', text: 'Before we go, let\'s talk about your team. You have {mon} and {caught} now. Two Pokémon are better than one!' },
          { who: 'quill', text: 'In a battle, press Team to swap in a different Pokémon. That\'s called switching.' },
          { who: 'quill', text: 'Switching uses up your turn, so the other Pokémon gets to hit the one coming in. Pick the right moment!' },
          { who: 'quill', text: 'And if one of your Pokémon faints, don\'t worry. You just pick who goes next. You only lose if they all faint.' },
        ],
        next: 'lesson',
      },

      lesson: {
        bg: 'route',
        cast: ['quill'],
        panels: (s) => {
          const l = CH4_lesson(s);
          return [
            { who: 'narrator', cast: [], mon: l.id, text: `Halfway up the mountain road, a wild ${l.name} jumps out of the bushes!` },
            l.tip
              ? { who: 'quill', mon: l.id, text: `${l.tip}, so that ${l.name} is strong against {mon}. Try switching to {caught}!` }
              : { who: 'quill', mon: l.id, text: 'Here\'s your chance to practise. Try switching to {caught}!' },
          ];
        },
        prompt: {
          kind: 'battle',
          foe: (s) => CH4_lesson(s).id,
          level: belowPlayer(2, 1),
          win: 'village',
          lose: 'village',
          run: 'village',
          caught: 'caught',
        },
      },

      village: {
        bg: 'village',
        cast: ['dell'],
        give: { pokeball: 3 },
        panels: (s) => [
          ({
            win: { who: 'quill', bg: 'route', cast: ['quill'], text: 'See? That\'s teamwork! {mon} and {caught} make a great pair.' },
            lose: { who: 'quill', bg: 'route', cast: ['quill'], text: 'That was a tough one. Switching takes practice! Let me help your team feel better.' },
            run: { who: 'quill', bg: 'route', cast: ['quill'], text: 'Running away is smart sometimes. But next time, try switching!' },
            caught: { who: 'quill', bg: 'route', cast: ['quill'], text: 'Now we have three Pokémon! Come on, the village is just ahead.' },
          })[s.flags['ch4:lesson']] || { who: 'quill', bg: 'route', cast: ['quill'], text: 'Come on, the village is just ahead.' },
          { who: 'narrator', cast: [], text: 'At last, you reach Stonebrook. Little stone houses sit on the side of the mountain. The mine carts are not moving.' },
          { who: 'dell', text: 'Visitors? Way up here? Hello! I\'m Dell. I\'m in charge of the mine.' },
          { who: 'dell', text: 'We had to stop digging. Three days ago, a brown light started glowing deep in the caves.' },
          { who: 'dell', text: 'Now the cave Pokémon are grumpy, and they won\'t let anyone in.' },
          { who: 'dell', text: 'And yesterday, someone in a dark hood went in. They had a closed eye on their coat.' },
          { who: 'quill', cast: ['quill', 'dell'], text: 'The Veil! They\'re after the shard. {player}, we have to get there first!' },
          { who: 'dell', text: 'Then take these Poké Balls. And pick one thing from my shed. It\'s dark and twisty in those caves.' },
          { who: 'narrator', text: 'You got 3 Poké Balls!' },
        ],
        prompt: {
          kind: 'choice',
          question: 'What do you take from the shed?',
          options: [
            {
              text: 'A bright lamp',
              set: { gear: 'lamp' },
              after: [{ who: 'dell', text: 'Good pick! Shine it in a Pokémon\'s eyes, and it will have a hard time hitting you.' }],
              next: 'square',
            },
            {
              text: 'An old map of the caves',
              set: { gear: 'map' },
              after: [{ who: 'dell', text: 'My grandpa drew that. It shows a secret side tunnel. You might sneak up on that hooded person!' }],
              next: 'square',
            },
            {
              text: 'A box of snacks',
              set: { gear: 'snacks' },
              give: { potion: 2 },
              after: [
                { who: 'dell', text: 'Ha! Hungry Pokémon can\'t win battles. There are two Potions in there too.' },
                { who: 'narrator', text: 'You got 2 Potions!' },
              ],
              next: 'square',
            },
          ],
        },
      },

      square: {
        bg: 'village',
        cast: ['youngster'],
        panels: (s) => ({
          declined: [
            { who: 'youngster', text: 'Hey! I know you! You\'re the trainer from the fence line!' },
            { who: 'youngster', text: 'You said you were on a delivery. Well, now you\'re not! You owe me a rematch!' },
            { who: 'youngster', text: 'And guess what? I have TWO Pokémon now. My Rattata made a friend!' },
          ],
          battle: [
            { who: 'youngster', text: 'Hey, it\'s you! My Rattata still talks about our battle. Well, it squeaks about it.' },
            { who: 'youngster', text: 'My grandma lives here. Good luck in the caves! Watch out for the grumpy Onix!' },
          ],
        })[s.flags.fence] || [
          { who: 'youngster', text: 'Hi! I\'m Tobi. My grandma lives here. Are you going into the caves? Cool!' },
          { who: 'youngster', text: 'Watch out for the grumpy Onix. It\'s as long as a bus!' },
        ],
        next: (s) => (s.flags.fence === 'declined' ? 'tobiBattle' : 'caveMouth'),
      },

      tobiBattle: {
        bg: 'village',
        cast: ['youngster'],
        panels: [],
        prompt: {
          kind: 'battle',
          trainer: 'youngster',
          team: (s) => [
            { id: 19, level: Math.max(3, s.mon.level - 2) }, // Rattata
            { id: 27, level: Math.max(3, s.mon.level - 2) }, // Sandshrew
          ],
          win: 'tobiAfter',
          lose: 'tobiAfter',
        },
      },

      tobiAfter: {
        bg: 'village',
        cast: ['youngster'],
        give: { potion: 1 },
        panels: (s) => [
          ...(s.flags['ch4:tobiBattle'] === 'win'
            ? [
              { who: 'youngster', text: 'No way! Beaten by my own rematch! Okay, okay, we\'re even now.' },
              { who: 'youngster', text: 'Here, have a Potion. You\'ll need it more than me in those caves.' },
            ]
            : [
              { who: 'youngster', text: 'Yes! I knew all that training would pay off!' },
              { who: 'youngster', text: 'Your team looks tired, though. Here, take a Potion. Good luck in the caves!' },
            ]),
          { who: 'narrator', text: 'You got a Potion!' },
        ],
        next: 'caveMouth',
      },

      caveMouth: {
        bg: 'cave',
        cast: ['quill'],
        panels: (s) => [
          { who: 'narrator', cast: [], text: 'The cave is cold and dark. Water drips from the ceiling. Far away, something glows brown.' },
          {
            lamp: { who: 'narrator', cast: [], text: 'You switch on Dell\'s lamp. The rocky walls sparkle all around you.' },
            map: { who: 'narrator', cast: [], text: 'You unfold Dell\'s map. A dotted line shows a tiny secret tunnel near the bottom.' },
            snacks: { who: 'narrator', cast: [], mon: 'player', text: 'Your bag smells like berries. {mon} keeps sniffing at it.' },
          }[s.flags.gear] || { who: 'narrator', cast: [], text: 'You feel your way along the wall.' },
          ...(s.flags.bond
            ? [{ who: 'narrator', cast: [], mon: 'player', text: '{mon} stays close to you. It isn\'t scared of the dark. Not with you here.' }]
            : []),
          CH45_canCatch(s) && s.flags['ch4:lesson'] !== 'caught'
            ? { who: 'quill', text: 'These tunnels go on forever. A Pokémon that lives here could help us find the way. Let\'s catch one!' }
            : { who: 'quill', mon: 'caught', text: '{caught} seems to know the way. Let\'s follow it!' },
        ],
        next: (s) => (CH45_canCatch(s) && s.flags['ch4:lesson'] !== 'caught' ? 'pickArea' : 'rockfall'),
      },

      pickArea: {
        bg: 'cave',
        cast: ['quill'],
        panels: (s) => [
          { who: 'quill', text: CAVE_TIP[s.mon.types[0]] || 'Every tunnel has different Pokémon. Pick the one you like!' },
          { who: 'quill', text: 'And remember, if a battle gets tough, you can switch!' },
        ],
        prompt: {
          kind: 'choice',
          question: 'Where do you look?',
          options: [
            { text: 'The dark, flappy tunnel', if: CH45_canCatch, set: { caveArea: 'tunnel' }, next: 'search' },
            { text: 'The glowing mushrooms', if: CH45_canCatch, set: { caveArea: 'grove' }, next: 'search' },
            { text: 'The hall of big boulders', if: CH45_canCatch, set: { caveArea: 'hall' }, next: 'search' },
          ],
        },
      },

      search: {
        bg: 'cave',
        cast: [],
        panels: (s) => (CAVE_AREAS[s.flags.caveArea] || CAVE_AREAS.tunnel).panels,
        prompt: {
          kind: 'battle',
          foe: (s) => (CAVE_AREAS[s.flags.caveArea] || CAVE_AREAS.tunnel).mons,
          level: belowPlayer(2, 0),
          caught: 'caught',
          win: 'missed',
          lose: 'missed',
          run: 'missed',
        },
      },

      missed: {
        bg: 'cave',
        cast: ['quill'],
        give: CH45_topUpBalls,
        panels: (s) => [
          ({
            win: { who: 'quill', text: 'Oh, it fainted! It will be fine after a rest. Remember: make it tired, but don\'t knock it out.' },
            lose: { who: 'quill', text: 'Phew, that one was tough! Let me help your team feel better.' },
          })[s.flags['ch4:search']] || { who: 'quill', text: 'It ran off into the dark! That happens. Cave Pokémon are fast.' },
          { who: 'quill', text: 'I put a few more Poké Balls in your bag. Let\'s try again!' },
        ],
        next: 'pickArea',
      },

      caught: {
        bg: 'cave',
        cast: ['quill'],
        panels: (s) => {
          const early = s.flags['ch4:lesson'] === 'caught' && !s.flags.gear;
          return [
            { who: 'narrator', bg: early ? 'route' : 'cave', mon: 'caught', text: '{caughtSpecies} joined your team!' },
            early
              ? { who: 'quill', bg: 'route', mon: 'caught', text: 'You caught it! Well, that\'s one way to learn about teams!' }
              : { who: 'quill', mon: 'caught', text: 'Welcome to the team, {caughtSpecies}! It knows these caves much better than we do.' },
            { who: 'narrator', bg: early ? 'route' : 'cave', text: 'Your team: {team}.' },
            { who: 'quill', bg: early ? 'route' : 'cave', mon: 'caught', text: 'Do you want to give it a nickname?' },
          ];
        },
        prompt: {
          kind: 'name',
          field: 'caughtNickname',
          suggestions: CH45_nick,
          // Caught on the road (before the village): go on to Stonebrook; caught in the cave: go deeper.
          next: (s) => (s.flags.gear ? 'rockfall' : 'village'),
        },
      },

      // The first puzzle in the game: three rooms under one clock, 18 + 29 + 26 = 73 moves at best.
      // Room 1 (puzzle-boulder.js): push the far boulder right first, then down past the wall block and back
      // left along the bottom (about 3 in 4 of the places you can reach can still be solved).
      // Room 2 (puzzle-memory.js): 6 stones in order, 3 decoys; decoys and later stones block the short
      // ways, so the walk between stones is a small maze. Room 3: 3 boulders (also about 3 in 4 solvable).
      // time: 2.5 x 73 moves + 15 s per room = 227.5, rounded up to 230 (the stone show pauses the clock).
      rockfall: {
        bg: 'cave',
        cast: ['quill'],
        panels: [
          { who: 'narrator', cast: [], text: 'Rumble! Rocks roll down and block the tunnel. The brown light is on the other side.' },
          { who: 'quill', text: 'This cave has three rooms to get through. And the rocks are still moving. We have to be quick!' },
          { who: 'quill', text: 'Some rooms have round marks that glow. Push the boulders onto them. You can\'t pull a boulder back!' },
          { who: 'quill', text: 'One room has magic stones. They light up one at a time. Step on them in the same order. The wrong stone sends you back!' },
          { who: 'narrator', mon: 'lead', text: '{lead} is ready to help. Let\'s go!' },
        ],
        prompt: {
          kind: 'puzzle',
          rooms: [
            {
              puzzle: 'boulder',
              text: 'Push the rocks onto the glowing marks!',
              grid: [
                '##########',
                '#x.......#',
                '#....O...#',
                '#O..##...#',
                '#P..##...#',
                '#x.......#',
                '##########',
              ],
            },
            {
              puzzle: 'memory',
              text: 'Watch the stones light up. Then step on them in the same order!',
              grid: [
                '#########',
                '#P..#.o3#',
                '#6#1..#.#',
                '#.o.#2..#',
                '#4...#o.#',
                '#.#5....#',
                '#########',
              ],
            },
            {
              puzzle: 'boulder',
              text: 'Three rocks this time! Think before you push.',
              grid: [
                '#########',
                '#x......#',
                '#..O....#',
                '#..#O...#',
                '#...O...#',
                '#x....Px#',
                '#########',
              ],
            },
          ],
          time: 230,
          question: 'Push the rocks onto the glowing marks!',
          hint: 'Tips! A rock in a corner is stuck, so press Start again. Sometimes you must walk around a rock and push it from the other side. For the stones, say the order out loud as they light up. Stones you already found stay green and are safe to step on.',
          give: { potion: 2 },
          after: [
            { who: 'narrator', mon: 'lead', text: 'Click! Clunk! The boulders sink into the marks, and a stone door slides open.' },
            { who: 'quill', text: 'Great teamwork! And look, someone left a bag here. There are two Potions inside!' },
            { who: 'narrator', text: 'You got 2 Potions!' },
          ],
          next: 'deeper',
        },
      },

      deeper: {
        bg: 'cave',
        cast: ['grunt'],
        panels: (s) => [
          { who: 'narrator', cast: [], mon: 'caught', text: '{caught} leads the way. The tunnel gets wider, and the brown light gets brighter.' },
          s.flags.gear === 'map'
            ? { who: 'narrator', text: 'You take the secret tunnel from Dell\'s map. It comes out right behind a person in a dark hood!' }
            : { who: 'narrator', text: 'You turn a corner. Someone in a dark hood is standing in front of a glowing wall.' },
          { who: 'narrator', text: 'In the rock is a brown crystal, shining like warm honey. It\'s the Stone Shard!' },
          ...(s.flags.peeked
            ? [{ who: 'narrator', mon: 'player', text: 'The shard glows brighter as you get close. {mon}\'s eyes flash purple for a second.' }]
            : []),
          { who: 'grunt', text: 'Huh? Who are you? Oh! You must be that kid the Stranger told us about.' },
          { who: 'grunt', text: 'The Stranger said you were tough. But I have TWO Pokémon. The Veil gave them to me!' },
          { who: 'quill', cast: ['quill', 'grunt'], text: 'Two Pokémon? {player} has a whole team! {team}, all ready to go.' },
          { who: 'grunt', text: 'This shard is going to the Veil. Try and stop me!' },
        ],
        next: 'boss',
      },

      boss: {
        bg: 'cave',
        cast: ['grunt'],
        panels: (s) => [
          ...({
            lamp: [{ who: 'narrator', text: 'You hold up Dell\'s lamp. The bright light shines right in the Grunt\'s eyes!' }],
            map: [{ who: 'narrator', text: 'You surprised him! His Pokémon are still rubbing their sleepy eyes.' }],
            snacks: [{ who: 'narrator', mon: 'player', text: '{mon} munches one last snack. It\'s ready!' }],
          }[s.flags.gear] || []),
          ...(s.flags['ch3:duel'] === 'win'
            ? []
            : [{ who: 'quill', cast: ['quill', 'grunt'], text: 'The Veil took the Glimmer Shard at the lake. Let\'s not let them take this one too!' }]),
        ],
        prompt: {
          kind: 'battle',
          trainer: 'grunt',
          team: CH4_GRUNT_TEAM,
          shardBoss: true, // a win gives 2 levels
          // Dell's gear pays off: the lamp dazzles his Pokémon, the map lets you catch them napping.
          foeMods: (s) => ({ lamp: { accuracy: -1 }, map: { speed: -1 } })[s.flags.gear] || {},
          win: 'afterBoss',
          lose: 'afterBoss',
        },
      },

      afterBoss: {
        bg: 'cave',
        cast: ['grunt'],
        shard: (s) => (ch4Won(s) ? 'stone' : null),
        panels: (s) => [
          ...(ch4Won(s)
            ? [
              { who: 'narrator', mon: 27, text: 'Sandshrew shakes its head. The purple glow in its eyes fades away.' },
              { who: 'grunt', text: 'No! I lost to a kid? My boss is going to be so mad!' },
              { who: 'narrator', text: 'You pull the Stone Shard out of the wall. It feels warm, like a pebble left in the sun.' },
              { who: 'grunt', text: 'Fine! Keep it! There are lots more shards out there.' },
              { who: 'narrator', cast: [], text: 'The Grunt runs off down a tunnel. His footsteps echo away into the dark.' },
            ]
            : [
              { who: 'grunt', text: 'Ha! The Veil wins again!' },
              { who: 'narrator', text: 'The Grunt pulls the Stone Shard out of the wall and runs off down a tunnel.' },
              { who: 'quill', cast: ['quill'], text: '{player}, are you okay? Let\'s get your team out of here. We\'ll get that shard back one day. I promise.' },
            ]),
          { who: 'narrator', bg: 'village', cast: [], text: 'Back in Stonebrook, the cave Pokémon are calm again. The mine carts start to roll, and the miners cheer.' },
          ch4Won(s)
            ? { who: 'dell', bg: 'village', cast: ['dell'], text: 'You beat that hooded thief? Stonebrook owes you one, {player}!' }
            : { who: 'dell', bg: 'village', cast: ['dell'], text: 'You tried your best, and you kept everyone safe. That\'s what matters most.' },
          {
            lamp: { who: 'dell', bg: 'village', cast: ['dell'], text: 'Keep the lamp. It\'s a gift.' },
            map: { who: 'dell', bg: 'village', cast: ['dell'], text: 'Keep Grandpa\'s map too. He would like that.' },
            snacks: { who: 'dell', bg: 'village', cast: ['dell'], text: 'And here, more snacks for the road!' },
          }[s.flags.gear] || { who: 'dell', bg: 'village', cast: ['dell'], text: 'Come back and visit any time.' },
          ...(s.flags.told === 'lie'
            ? [{ who: 'quill', bg: 'village', cast: ['quill'], text: 'Here, {player}. You should carry the map from now on. I trust you.' }]
            : []),
          { who: 'quill', bg: 'village', cast: ['quill'], text: CH45_countLine(s, 3) },
          { who: 'quill', bg: 'village', cast: ['quill'], text: 'Dell says a blue light was seen on Frost Peak, high above the village. That must be the next shard!' },
          { who: 'narrator', bg: 'village', cast: [], text: 'Frost Peak is covered in snow all year long. Better pack a scarf!' },
        ],
        prompt: { kind: 'end' },
      },
    },
  };

  // ---------- Chapter 5: Frost Peak (Frost Shard) ----------
  // The lost baby Pokémon. Snorunt for a Fire starter (Fire beats Ice), Swinub for the others
  // (Water and Grass both beat Ground). Its grown-up family helps later.
  const CH5_LOST = {
    361: { name: 'Snorunt', family: 362, familyName: 'Glalie' },
    220: { name: 'Swinub', family: 221, familyName: 'Piloswine' },
  };
  const CH5_lostId = (s) => (s.mon.types[0] === 'fire' ? 361 : 220);
  const CH5_lost = (s) => CH5_LOST[CH5_lostId(s)];
  const CH5_helped = (s) => s.flags.lost === 'helped';
  // If you left the lost Pokémon, you catch a wild one instead. Balance: Machop is neutral to all
  // three starters, Spheal is risky for Fire, Sneasel and Spheal for Grass, nothing for Water.
  const PEAK_WILDS = [66, 363, 215]; // Machop, Spheal, Sneasel
  const PEAK_TIP = {
    fire: 'A tip: Spheal is part Water, and Water beats Fire. Be careful with {mon}.',
    water: 'A tip: Ice moves don\'t hurt Water types much. {mon} will do fine up here!',
    grass: 'A tip: Ice beats Grass, so watch out for Sneasel and Spheal. Maybe send out a different team member first!',
  };
  const LOST_TIP = {
    fire: 'It\'s an Ice type, and Fire beats Ice. Go easy on it! We want to catch it, not knock it out.',
    water: 'It\'s part Ground type, and Water beats Ground. Go easy on it! We want to catch it, not knock it out.',
    grass: 'It\'s part Ice type, and Ice beats Grass, so be careful with {mon}. Maybe start with a different team member.',
  };
  const CH5_RIVAL_NUDGE = { fire: -1, grass: -1 };
  const CH5_STRANGER_NUDGE = { fire: 2, water: -1, grass: -1 };
  const CH5_RIVAL_TEAM = (s) => [
    { id: 16, level: Math.max(3, bossLv(-2, CH5_RIVAL_NUDGE)(s)) }, // Pidgey
    { id: s.rivalMon.id, level: bossLv(-1, CH5_RIVAL_NUDGE)(s) },   // his starter
  ];
  const CH5_STRANGER_TEAM = (s) => [
    { id: 261, level: bossLv(-1, CH5_STRANGER_NUDGE)(s) }, // Poochyena
    { id: 198, level: bossLv(1, CH5_STRANGER_NUDGE)(s) },  // Murkrow
  ];
  const ch5Won = (s) => s.flags['ch5:duel'] === 'win';
  const ch5JoinedLost = (s) => CH5_helped(s) && s.flags['ch5:catch'] === 'caught';

  const chapter5 = {
    id: 'ch5',
    title: 'Chapter 5',
    levelCap: 11, // wins stop levelling here (about where a player who wins everything is)
    subtitle: 'Frost Peak',
    start: 'climb',
    summary: (s) => {
      const lost = CH5_lost(s);
      const parts = ['{player} climbed Frost Peak'];
      if (CH5_helped(s)) parts.push(`, helped a lost ${lost.name} find its family`);
      parts.push(s.flags['ch5:rivalBattle'] === 'win' ? ', and beat {rival} in a friendly battle. ' : ', and had a friendly battle with {rival}. ');
      if (s.flags['ch5:catch'] === 'caught') parts.push(ch5JoinedLost(s) ? '{caught} chose to join the team. ' : '{caught} joined the team. ');
      parts.push(ch5Won(s)
        ? 'At the top, {player} beat the Stranger and won the Frost Shard! '
        : 'At the top, the Stranger took the Frost Shard. ');
      parts.push('But the Stranger is starting to wonder if the Veil tells the truth.');
      return parts.join('');
    },
    scenes: {
      climb: {
        bg: 'snow',
        cast: ['quill'],
        panels: (s) => [
          { who: 'narrator', cast: [], text: 'The path up Frost Peak is steep and white. Snow crunches under your feet. Your breath makes little clouds.' },
          CH45_has(s, 'stone')
            ? { who: 'quill', text: 'Can you feel it, {player}? The Stone Shard is warm in your bag. It\'s like it wants to find its friends.' }
            : { who: 'quill', text: 'I keep thinking about the Stone Shard. We won\'t let the Veil get this one. Not this time!' },
          { who: 'quill', text: 'Dell said a blue light was seen at the very top. That\'s the Frost Shard, I\'m sure of it.' },
          { who: 'quill', text: 'Lots of Ice types live up here. Fire beats Ice, so Fire moves are great on this mountain.' },
          { who: 'narrator', cast: [], text: 'Then you hear it. A tiny, sad cry, somewhere in the snow.' },
        ],
        next: 'lost',
      },

      lost: {
        bg: 'snow',
        cast: ['quill'],
        panels: (s) => {
          const l = CH5_lost(s);
          const id = CH5_lostId(s);
          return [
            { who: 'narrator', cast: [], mon: id, text: `A little ${l.name} is sitting all alone in the snow. It keeps looking around and crying.` },
            { who: 'quill', mon: id, text: `It's a baby ${l.name}. It must have got lost from its family in last night's snowstorm.` },
            { who: 'quill', text: 'Poor little thing. But the Veil might already be at the top…' },
          ];
        },
        prompt: {
          kind: 'choice',
          question: 'What do you do?',
          options: [
            {
              text: 'Help it find its family',
              set: { lost: 'helped' },
              after: [{ who: 'narrator', text: 'You kneel down in the snow. The little Pokémon stops crying and sniffs your hand.' }],
              next: 'path',
            },
            {
              text: 'Ask {mon} to cheer it up',
              set: { lost: 'helped', cheered: true },
              after: [
                { who: 'narrator', mon: 'player', text: '{mon} does a silly little dance in the snow.' },
                { who: 'narrator', text: 'The little Pokémon giggles and stops crying! Now it wants to follow you everywhere.' },
              ],
              next: 'path',
            },
            {
              text: 'Keep climbing. The shard comes first.',
              set: { lost: 'left' },
              after: [{ who: 'narrator', text: 'You walk on. When you look back, the little Pokémon is watching you go.' }],
              next: 'path',
            },
          ],
        },
      },

      path: {
        bg: 'snow',
        cast: [],
        panels: (s) => {
          const l = CH5_lost(s);
          return CH5_helped(s)
            ? [
              { who: 'narrator', text: 'You follow tiny footprints through the snow. They lead to a snowy hollow under a big rock.' },
              { who: 'narrator', mon: l.family, text: `A big ${l.familyName} comes rushing out. It's the baby's family!` },
              { who: 'narrator', mon: l.family, text: `The ${l.familyName} gives a happy roar. Then it points its nose up the mountain, at a path you would never have found.` },
              { who: 'quill', cast: ['quill'], text: 'A shortcut to the top! Thank you!' },
            ]
            : [
              { who: 'narrator', text: 'You climb on. The wind gets colder. You keep thinking about that little Pokémon.' },
              { who: 'quill', cast: ['quill'], text: 'It will be okay, {player}. Its family can\'t be far. Pokémon are tougher than they look.' },
              { who: 'narrator', text: 'The path winds up and up, slow and slippery.' },
            ];
        },
        next: 'icePond',
      },

      // Ice slide puzzle (puzzle-ice.js), three rooms under one clock: 10 + 13 + 17 = 40 moves at best.
      // Room 1 is plain ice and snow. Room 2 brings in cracked ice (no way to get stuck): break the one in the
      // middle to make a hole, then use the hole to stop on the snow under the gap. Room 3 uses the same trick
      // with more cracked ice (about 1 in 7 of the places you can reach are stuck, so Start again).
      // time: 2.5 x 40 moves + 15 s per room = 145, rounded up to 150.
      icePond: {
        bg: 'snow',
        cast: ['quill'],
        panels: [
          { who: 'narrator', cast: [], text: 'The path stops at a big frozen pond. It has three icy parts. The way up is on the other side.' },
          { who: 'quill', text: 'Careful! Once you start sliding on ice, you can\'t stop until you bump into a rock.' },
          { who: 'quill', text: 'But the white snow patches aren\'t slippery. If you land on snow, you stop right there.' },
          { who: 'quill', text: 'Look, some ice has cracks in it! You can slide over cracked ice, but only once.' },
          { who: 'quill', text: 'When you leave it, it breaks. Then there\'s a hole of cold water. You can\'t go in a hole. It stops you, just like a rock!' },
          { who: 'quill', text: 'So think before you slide. And be quick. We need to cross all three parts before the clock runs out!' },
        ],
        prompt: {
          kind: 'puzzle',
          rooms: [
            {
              puzzle: 'ice',
              text: 'Slide across the ice to the gap!',
              grid: [
                '######E##',
                '##......#',
                '#.#.....#',
                '#_.....##',
                '#_....#.#',
                '#..#...P#',
                '#########',
              ],
            },
            {
              puzzle: 'ice',
              text: 'Cracked ice breaks after you cross it once!',
              grid: [
                '#####E###',
                '#.#.....#',
                '#.*.#_*.#',
                '#._.*..##',
                '#.*.##..#',
                '#....P.##',
                '#########',
              ],
            },
            {
              puzzle: 'ice',
              text: 'Lots of cracks! Think before you slide.',
              grid: [
                '####E#####',
                '#.....####',
                '#..*....##',
                '#_#.*...##',
                '#..#.****#',
                '#*P.#....#',
                '##########',
              ],
            },
          ],
          time: 150,
          question: 'Slide across the ice to the gap!',
          hint: 'Here\'s a tip: a hole stops you, just like a rock. So break cracked ice on purpose to make a new place to stop! Stuck? Press Start again.',
          give: { superpotion: 1 },
          after: [
            { who: 'narrator', text: 'You made it across! Something shiny is frozen in the snow by the gap.' },
            { who: 'narrator', text: 'You got a Super Potion!' },
          ],
          next: 'rival',
        },
      },

      rival: {
        bg: 'snow',
        cast: ['rival'],
        panels: (s) => [
          { who: 'narrator', cast: [], text: 'Someone is coming down the mountain. Fast!' },
          ...({
            kind: [
              { who: 'rival', text: 'Oh. Hey, {player}. Gramps told me about the Veil stuff. He\'s worried about you.' },
              { who: 'rival', text: 'Not that I\'m worried. Okay, maybe a tiny bit.' },
            ],
            taunt: [
              { who: 'rival', text: '{player}! My {rivalMon} hasn\'t had a single nap since you said that. It\'s been training nonstop!' },
            ],
          }[s.flags.tone] || [
            { who: 'rival', text: '{player}! Do you still think we\'ll "see about that"? Well, I\'ve been training. Let\'s see about it right now!' },
          ]),
          { who: 'rival', mon: 16, text: 'I\'ve got a new team member too. Meet my Pidgey! It\'s fast and brave, just like me.' },
          s.flags['ch1:battle'] === 'win'
            ? { who: 'rival', text: 'You beat me back at the lab. I haven\'t forgotten!' }
            : { who: 'rival', text: 'I beat you back at the lab. Let\'s see if you got any better!' },
          { who: 'rival', text: 'I have two Pokémon. You bring your whole team, {team}. Just a friendly battle. Let\'s go!' },
        ],
        next: 'rivalBattle',
      },

      rivalBattle: {
        bg: 'snow',
        cast: ['rival'],
        panels: [],
        prompt: {
          kind: 'battle',
          trainer: 'rival',
          team: CH5_RIVAL_TEAM,
          win: 'rivalAfter',
          lose: 'rivalAfter',
        },
      },

      rivalAfter: {
        bg: 'snow',
        cast: ['rival'],
        give: { potion: 2, pokeball: 3, greatball: 2 },
        panels: (s) => {
          const l = CH5_lost(s);
          const lines = [
            s.flags['ch5:rivalBattle'] === 'win'
              ? { who: 'rival', text: 'Argh! Your team is really good, {player}. You switched at just the right time.' }
              : { who: 'rival', text: 'Ha! Still the best! But you made me work for it.' },
            s.flags.tone === 'kind'
              ? { who: 'rival', text: 'Here. Gramps said to give you these. It was his idea, not mine.' }
              : { who: 'rival', text: 'Here, take these. I don\'t want you losing to anyone except me.' },
            { who: 'narrator', text: 'You got 2 Potions, 3 Poké Balls and 2 Great Balls!' },
            { who: 'rival', text: 'Great Balls catch better than Poké Balls. But you still have to make a Pokémon tired first!' },
            { who: 'rival', text: 'Oh, and one more thing. I saw someone at the top in a dark hood. They had a Poochyena and a Murkrow.' },
            { who: 'quill', cast: ['rival', 'quill'], text: 'The Stranger!' },
            { who: 'rival', text: 'The who? Whatever. Be careful up there. Smell ya later!' },
            { who: 'narrator', cast: [], text: '{rival} slides down the snowy slope on his feet, like a snowboard with no board.' },
          ];
          if (!CH45_canCatch(s)) return lines;
          return lines.concat(CH5_helped(s)
            ? [
              { who: 'narrator', cast: [], text: 'Just then, a snowball hits you on the back of the head. Plop!' },
              { who: 'narrator', cast: [], mon: CH5_lostId(s), text: `It's the little ${l.name}! It followed you all the way up here.` },
              { who: 'quill', cast: ['quill'], mon: CH5_lostId(s), text: 'I think it wants to join your team! Show it how strong you are, then throw a Poké Ball.' },
            ]
            : [
              { who: 'narrator', cast: [], text: 'Just then, something moves behind a snowy rock.' },
              { who: 'quill', cast: ['quill'], text: 'A Pokémon that likes the cold could really help us up here. Let\'s try to catch one!' },
            ]);
        },
        next: (s) => (CH45_canCatch(s) ? 'catch' : 'summit'),
      },

      catch: {
        bg: 'snow',
        cast: [],
        panels: (s) => (CH5_helped(s)
          ? [{ who: 'quill', cast: ['quill'], mon: CH5_lostId(s), text: LOST_TIP[s.mon.types[0]] || 'Go easy on it! We want to catch it, not knock it out.' }]
          : [
            { who: 'quill', cast: ['quill'], text: PEAK_TIP[s.mon.types[0]] || 'Every Pokémon up here is different. Good luck!' },
            { who: 'narrator', text: 'Something jumps out of the snow!' },
          ]),
        prompt: {
          kind: 'battle',
          foe: (s) => (CH5_helped(s) ? CH5_lostId(s) : PEAK_WILDS),
          level: (s) => (CH5_helped(s) ? Math.max(3, s.mon.level - 2) : [Math.max(2, s.mon.level - 2), s.mon.level]),
          // The little one is only playing, so it doesn't hit hard.
          foeMods: (s) => (CH5_helped(s) ? { attack: -1, 'special-attack': -1 } : {}),
          caught: 'joined',
          win: 'missed',
          lose: 'missed',
          run: 'missed',
        },
      },

      missed: {
        bg: 'snow',
        cast: ['quill'],
        give: CH45_topUpBalls,
        panels: (s) => {
          const l = CH5_lost(s);
          const outcome = s.flags['ch5:catch'];
          const first = CH5_helped(s)
            ? ({
              win: { who: 'quill', mon: CH5_lostId(s), text: `Oops, it fainted! Don't worry, it's just tired. Look, the ${l.name} is getting back up. It still wants to come!` },
              lose: { who: 'quill', mon: CH5_lostId(s), text: `Your team needs a rest. The ${l.name} brings you a snowball. I think that means "try again"!` },
            })[outcome] || { who: 'quill', mon: CH5_lostId(s), text: `You ran off, but the ${l.name} is still following us! Let's try again.` }
            : ({
              win: { who: 'quill', text: 'Oh, you knocked it out! It will be fine after a rest. Remember: make it tired, but don\'t knock it out.' },
              lose: { who: 'quill', text: 'Brr, that one was tough! Let me help your team feel better.' },
            })[outcome] || { who: 'quill', text: 'It got away in the snow! That happens. Let\'s look again.' };
          return [first, { who: 'quill', text: 'I put a few more Poké Balls in your bag. Let\'s try again!' }];
        },
        next: (s) => (CH45_canCatch(s) ? 'catch' : 'summit'),
      },

      joined: {
        bg: 'snow',
        cast: ['quill'],
        panels: (s) => [
          { who: 'narrator', mon: 'caught', text: '{caughtSpecies} joined your team!' },
          ch5JoinedLost(s)
            ? { who: 'quill', mon: 'caught', text: 'It picked you, {player}! I think its family would be proud.' }
            : { who: 'quill', mon: 'caught', text: 'A new friend for the snowy road! Welcome to the team.' },
          { who: 'narrator', text: 'Your team: {team}.' },
          { who: 'quill', mon: 'caught', text: 'Do you want to give it a nickname?' },
        ],
        prompt: { kind: 'name', field: 'caughtNickname', suggestions: CH45_nick, next: 'summit' },
      },

      summit: {
        bg: 'snow',
        cast: ['veil'],
        panels: (s) => {
          const l = CH5_lost(s);
          return [
            CH5_helped(s)
              ? { who: 'narrator', cast: [], text: `The ${l.familyName}'s secret path takes you right to the top of Frost Peak.` }
              : { who: 'narrator', cast: [], text: 'At last, you reach the top of Frost Peak. The wind is loud and cold.' },
            { who: 'narrator', cast: [], text: 'In the middle of the snow stands a tall pillar of ice. Inside it, something glows bright blue. The Frost Shard!' },
            { who: 'narrator', text: 'And in front of it stands a person in a dark hood, with a Poochyena and a Murkrow.' },
            s.flags['ch3:duel'] === 'win'
              ? { who: 'veil', text: 'You again. You beat me at the lake. That won\'t happen twice.' }
              : { who: 'veil', text: 'The kid from the lake. I won that battle, remember?' },
            ch4Won(s)
              ? { who: 'veil', text: 'And you beat our Grunt in the caves. He is still grumpy about it.' }
              : { who: 'veil', text: 'Our Grunt says you almost beat him in the caves. Almost.' },
            { who: 'veil', text: 'This shard belongs to the Veil. They say the shards will help all Pokémon.' },
            { who: 'narrator', mon: 261, text: 'But the Stranger\'s Poochyena has glowing purple eyes. It looks very tired, like it hasn\'t slept in days.' },
            { who: 'quill', cast: ['quill', 'veil'], text: 'Those shards aren\'t helping! Look at your Pokémon!' },
            { who: 'veil', text: 'Quiet! Battle me, {player}. My two against your whole team.' },
          ];
        },
        prompt: {
          kind: 'choice',
          speak: true,
          options: [
            {
              text: 'Let\'s go, team!',
              after: [{ who: 'narrator', mon: 'player', text: '{mon} stamps its feet in the snow, ready to battle.' }],
              next: 'duel',
            },
            {
              text: 'Your Poochyena looks so tired!',
              set: { noticed: true },
              after: [
                { who: 'veil', text: '…It\'s fine. It\'s just the cold.' },
                { who: 'narrator', text: 'But the Stranger looks down at Poochyena for a long moment.' },
              ],
              next: 'duel',
            },
          ],
        },
      },

      duel: {
        bg: 'snow',
        cast: ['veil'],
        panels: (s) => {
          const l = CH5_lost(s);
          return CH5_helped(s)
            ? [{ who: 'narrator', mon: l.family, text: `Far below, the ${l.familyName} gives a mighty roar. A wall of snow blows across the peak, right into the Stranger's team!` }]
            : [];
        },
        prompt: {
          kind: 'battle',
          trainer: 'veil',
          team: CH5_STRANGER_TEAM,
          shardBoss: true, // a win gives 2 levels
          // Helping the lost Pokémon pays off: its family's snowstorm makes the Stranger's team miss more.
          foeMods: (s) => (CH5_helped(s) ? { accuracy: -1 } : {}),
          win: 'afterDuel',
          lose: 'afterDuel',
        },
      },

      afterDuel: {
        bg: 'snow',
        cast: ['veil'],
        shard: (s) => (ch5Won(s) ? 'frost' : null),
        panels: (s) => [
          ...(ch5Won(s)
            ? [
              { who: 'narrator', mon: 198, text: 'Murkrow flutters down into the snow. The purple glow in its eyes fades away.' },
              { who: 'narrator', text: 'The ice pillar cracks, and the Frost Shard drops into your hands. It\'s cold, like a snowflake that never melts.' },
              { who: 'veil', text: 'I lost… again.' },
            ]
            : [
              { who: 'veil', text: 'It\'s over. The shard is mine.' },
              { who: 'narrator', text: 'The Stranger taps the ice pillar. It cracks, and the Frost Shard drops into the Stranger\'s glove.' },
            ]),
          { who: 'narrator', mon: 261, text: 'Then the Stranger looks down at Poochyena. It\'s shivering, and its eyes are still a little purple.' },
          { who: 'veil', text: 'They told me the shards would help Pokémon…' },
          { who: 'veil', text: 'But Poochyena hasn\'t been the same since it touched one. And now Murkrow is the same.' },
          ...(s.flags.noticed ? [{ who: 'veil', text: 'You saw it too, didn\'t you? Even before we battled.' }] : []),
          { who: 'veil', text: 'I… I need to think.' },
        ],
        prompt: {
          kind: 'choice',
          question: 'What do you say to the Stranger?',
          speak: true,
          options: [
            {
              text: 'Come with us. We can help your Pokémon.',
              set: { stranger: 'invite' },
              after: [
                { who: 'veil', text: '…With you? No. Not yet.' },
                { who: 'narrator', text: 'But the Stranger doesn\'t say no right away. That\'s something.' },
              ],
              next: 'glow',
            },
            {
              text: 'I think the Veil is fooling you.',
              set: { stranger: 'truth' },
              after: [
                { who: 'veil', text: 'Maybe. Or maybe you are.' },
                { who: 'narrator', text: 'The Stranger looks at the shard for a long, long time.' },
              ],
              next: 'glow',
            },
            {
              text: 'Just go, and leave the shards alone!',
              set: { stranger: 'cold' },
              after: [{ who: 'veil', text: 'Fine. But this isn\'t over, {player}.' }],
              next: 'glow',
            },
          ],
        },
      },

      // A big story moment: after the climb and the battle at the top, the starter evolves.
      glow: {
        bg: 'snow',
        cast: [],
        evolve: 'starter',
        panels: [
          { who: 'narrator', mon: 'player', text: '{mon} stands tall in the snow, next to you. It climbed the whole mountain and battled so hard today.' },
          { who: 'narrator', mon: 'player', text: 'Then {mon} starts to glow, bright as the snow!' },
        ],
        next: 'down',
      },

      down: {
        bg: 'snow',
        cast: ['quill'],
        panels: (s) => [
          ch5Won(s)
            ? { who: 'narrator', cast: [], text: 'Murkrow flaps its wings. Snow swirls up everywhere. When it clears, the Stranger is gone.' }
            : { who: 'narrator', cast: [], text: 'Murkrow flaps its wings. Snow swirls up everywhere. When it clears, the Stranger is gone, and so is the Frost Shard.' },
          ch5Won(s)
            ? { who: 'quill', text: 'The Frost Shard! {player}, you did it!' }
            : { who: 'quill', text: 'They got it. But did you hear what the Stranger said? Maybe even someone in the Veil can change.' },
          { who: 'quill', text: CH45_countLine(s, 4) },
          ...(ch5JoinedLost(s)
            ? [{ who: 'narrator', mon: 'caught', text: '{caught} looks back down the mountain, where its family lives. Then it jumps into your arms.' }]
            : []),
          { who: 'quill', text: 'My teacher\'s notebook has a picture of a wave next to the word "Tide". I think the next shard is by the sea.' },
          s.flags.river
            ? { who: 'quill', text: 'There\'s a fishing village called Tidewater Cove. Wait, you met Old Hollis by the river? That\'s his home town!' }
            : { who: 'quill', text: 'There\'s a fishing village called Tidewater Cove. An old friend of mine lives there. He can help us.' },
          { who: 'narrator', cast: [], text: 'You wave goodbye to the snowy peak and head down the mountain, toward the sea.' },
        ],
        prompt: { kind: 'end' },
      },
    },
  };

  // ---------- Chapter 6: Tidewater Cove (Tide Shard) ----------
  const COVE_GIFTS = { 116: 'Horsea', 90: 'Shellder' };
  const COVE_GIFT_NICKNAMES = { 116: ['Squirt', 'Coral', 'Bubbles'], 90: ['Pearl', 'Clam', 'Shelby'] };
  // Rushing in means the tide is high: swimmers, a little tougher and quicker. Waiting means low
  // tide: rock-pool Pokémon, a bit weaker. Keyed by the starter's first type so a Fire starter is
  // not stuck with a pool that is all Water (it gets a Zubat and a harmless Magikarp in the mix).
  const COVE_WILDS = {
    rush: { fire: [41, 72, 129], default: [72, 98, 120] }, // Zubat, Tentacool, Magikarp / Tentacool, Krabby, Staryu
    wait: { fire: [41, 98, 129], default: [98, 79, 41] },  // Zubat, Krabby, Magikarp / Krabby, Slowpoke, Zubat
  };
  // Admin Rook: Carvanha (Water/Dark), Mankey (Fighting, neutral to every starter), Qwilfish
  // (Water/Poison). A Fire starter sees two Water types, a Grass starter one Poison, Water none.
  const ROOK_NUDGE = { fire: -1, grass: 1, water: -1 };
  const ROOK_TEAM = [
    { id: 318, level: bossLv(-1, ROOK_NUDGE) },
    { id: 56, level: bossLv(-1, ROOK_NUDGE) },
    { id: 211, level: bossLv(0, { ...ROOK_NUDGE, grass: 0 }) },
  ];
  const coveShardSaved = (s) => s.flags['ch6:rookBattle'] === 'win';
  const coveShards = (s) => (s.shards || []).length;
  const coveGiftName = (s) => COVE_GIFTS[s.flags.hollisGift] || 'Pokémon';

  const chapter6 = {
    id: 'ch6',
    title: 'Chapter 6',
    levelCap: 12, // wins stop levelling here (about where a player who wins everything is)
    subtitle: 'Tidewater Cove',
    start: 'arrive',
    summary: (s) => `Old Hollis gave {player} a ${coveGiftName(s)} at Tidewater Cove. ` +
      (coveShardSaved(s)
        ? 'Then {player} beat Admin Rook in the sea cave and saved the Tide Shard! '
        : 'Admin Rook won the battle in the sea cave, and the Veil took the Tide Shard. ') +
      `{player} now holds ${coveShards(s)} shard${coveShards(s) === 1 ? '' : 's'}. Next stop: Spark Town.`,
    scenes: {
      arrive: {
        bg: 'beach',
        cast: ['quill'],
        panels: (s) => [
          { who: 'narrator', cast: [], text: 'The path goes down, down, down, and then there it is: the sea! Little houses sit on the sand, and boats bob in the water.' },
          { who: 'quill', text: 'Welcome to Tidewater Cove, {player}! My map says a shard fell somewhere near here.' },
          coveShards(s) > 0
            ? { who: 'quill', text: `We have ${coveShards(s)} shard${coveShards(s) === 1 ? '' : 's'} so far. Let\'s make it one more before the Veil gets here.` }
            : { who: 'quill', text: 'The Veil beat us to the last ones. This time we have to be faster!' },
          { who: 'narrator', cast: ['fisher'], text: 'Down on the dock, a man in a floppy hat waves at you. You know that hat!' },
          { who: 'fisher', cast: ['fisher', 'quill'], text: 'Well, well! The trainer from the river path! I came down here to fish. The fish up north stopped biting.' },
        ],
        next: 'barlow',
      },

      barlow: {
        bg: 'beach',
        cast: ['courier', 'fisher'],
        // What Barlow brings depends on how you took the job back in chapter 2.
        give: (s) => ({
          superpotion: 1,
          ...(({ eager: { pokeball: 3 }, curious: { potion: 1 }, bargain: { potion: 2, pokeball: 1 } })[s.flags.deal] || { pokeball: 2 }),
        }),
        set: (s) => (s.flags.deal === 'curious' ? { coveMap: true } : {}),
        panels: (s) => [
          { who: 'narrator', cast: ['courier'], text: 'Rattle, rattle, bump! A delivery cart rolls along the sand. The driver jumps down. It\'s Barlow!' },
          { who: 'courier', text: '{player}! Look at you now! And look, my ankle is all better.' },
          { who: 'courier', text: 'You took that case all the way to Quill for me. I never said a proper thank you. So, here!' },
          { who: 'courier', text: 'First, a Super Potion. It heals way more than a normal Potion!' },
          { who: 'narrator', text: 'You got a Super Potion!' },
          { who: 'courier', text: 'And I have one more present for you…' },
          ...(({
            eager: [
              { who: 'courier', text: 'You jumped right in to help me, so I brought you something to jump in with. Three Poké Balls!' },
              { who: 'narrator', text: 'You got 3 Poké Balls!' },
            ],
            curious: [
              { who: 'courier', text: 'You always ask good questions. So here is a Potion, and something better: an old map of the sea cave.' },
              { who: 'courier', text: 'See this little X? It\'s a secret rock shelf. You can hide there and nobody sees you.' },
              { who: 'narrator', text: 'You got a Potion and the Sea Cave Map!' },
            ],
            bargain: [
              { who: 'courier', text: 'I know you like a good deal. So: two Potions, AND a Poké Ball for free. Don\'t tell my boss!' },
              { who: 'narrator', text: 'You got 2 Potions and a Poké Ball!' },
            ],
          })[s.flags.deal] || [
            { who: 'courier', text: 'Two Poké Balls, fresh from the shop!' },
            { who: 'narrator', text: 'You got 2 Poké Balls!' },
          ]),
          { who: 'narrator', text: 'You say thank you, and Barlow gives you a big thumbs up.' },
        ],
        next: 'hollis',
      },

      hollis: {
        bg: 'beach',
        cast: ['fisher'],
        panels: [
          { who: 'fisher', text: 'Now then. I\'ve got a surprise too. Last week, I found an old net in the water. It had a closed eye painted on it.' },
          { who: 'fisher', text: 'Two little Pokémon were stuck in it. I got them out and looked after them. They are well again now.' },
          { who: 'fisher', mon: 116, text: 'This is Horsea. It\'s small, but it can shoot water like a hose!' },
          { who: 'fisher', mon: 90, text: 'And this is Shellder. It hides in its shell, and it is very, very tough.' },
          { who: 'fisher', text: 'I\'m too old to go on an adventure. But one of them wants to go with you. Which one will you take?' },
        ],
        prompt: {
          kind: 'choice',
          question: 'Who will join your team?',
          options: [
            {
              text: 'Horsea, the quick one',
              set: { hollisGift: 116 },
              after: [{ who: 'fisher', mon: 116, text: 'Horsea does a happy little flip. Shellder can stay here and help me catch fish!' }],
              next: 'gift',
            },
            {
              text: 'Shellder, the tough one',
              set: { hollisGift: 90 },
              after: [{ who: 'fisher', mon: 90, text: 'Shellder claps its shell. Horsea can stay here and help me catch fish!' }],
              next: 'gift',
            },
          ],
        },
      },

      gift: {
        bg: 'beach',
        cast: ['fisher', 'quill'],
        gift: (s) => ({ id: s.flags.hollisGift || 116, level: Math.max(5, s.mon.level - 1) }),
        panels: (s) => [
          { who: 'narrator', mon: 'caught', text: `${coveGiftName(s)} joined your team!` },
          { who: 'quill', mon: 'caught', text: 'A Water type! Water beats Fire, and it beats Rock too. That will help us a lot.' },
          { who: 'fisher', mon: 'caught', text: 'Look after it, {player}. And do you want to give it a name?' },
        ],
        // The gift is skipped if the team is somehow full, so only offer a nickname when it joined.
        next: (s) => {
          const last = s.party[s.party.length - 1];
          return last && last.id === s.flags.hollisGift ? 'giftName' : 'tide';
        },
      },

      giftName: {
        bg: 'beach',
        cast: ['fisher'],
        panels: [],
        prompt: {
          kind: 'name',
          field: 'caughtNickname',
          suggestions: (s) => COVE_GIFT_NICKNAMES[s.flags.hollisGift] || ['Wave', 'Splash', 'Sandy'],
          next: 'tide',
        },
      },

      tide: {
        bg: 'beach',
        cast: ['fisher', 'quill'],
        panels: (s) => [
          { who: 'fisher', text: 'Now, about that shard. Every night, a blue-green light shines out of the sea cave, over by those rocks.' },
          { who: 'quill', text: 'That must be it! The Tide Shard!' },
          { who: 'fisher', text: 'Careful. The tide is coming in. When it is high, the cave fills with water, and the swimming Pokémon come in.' },
          { who: 'fisher', text: 'If you wait for low tide, the cave is calm. But it takes a long time, and I saw a strange boat out there this morning…' },
          ...(s.flags.coveMap ? [{ who: 'quill', text: 'Barlow\'s map shows the secret shelf. We can use it either way!' }] : []),
        ],
        prompt: {
          kind: 'choice',
          question: 'When do you go into the cave?',
          options: [
            {
              text: 'Rush in now, before the Veil',
              set: { tide: 'rush' },
              after: [{ who: 'narrator', text: 'You run across the wet sand. The waves splash your knees. Hurry!' }],
              next: 'cave',
            },
            {
              text: 'Wait for low tide',
              set: { tide: 'wait' },
              after: [{ who: 'narrator', text: 'You sit on the dock and wait. Slowly, slowly, the sea goes out. Then you walk in on dry sand.' }],
              next: 'cave',
            },
          ],
        },
      },

      cave: {
        bg: 'seacave',
        cast: [],
        panels: (s) => (s.flags.tide === 'rush'
          ? [
            { who: 'narrator', text: 'Inside the cave, the water is up to your waist. Blue-green light dances on the walls.' },
            { who: 'narrator', text: 'Splash! Something zooms at you through the water. It\'s fast!' },
          ]
          : [
            { who: 'narrator', text: 'The cave is quiet now. Little pools of water sit between the rocks, full of shells.' },
            { who: 'narrator', text: 'One of the "rocks" moves. It\'s a sleepy wild Pokémon, and you woke it up!' },
          ]),
        prompt: {
          kind: 'battle',
          foe: (s) => {
            const pool = COVE_WILDS[s.flags.tide === 'rush' ? 'rush' : 'wait'];
            return pool[s.mon.types[0]] || pool.default;
          },
          // High tide: its home turf, so it's a level up and quicker. Low tide: it's half asleep.
          level: (s) => (s.flags.tide === 'rush' ? s.mon.level : Math.max(2, s.mon.level - 2)),
          foeMods: (s) => (s.flags.tide === 'rush' ? { speed: 1 } : {}),
          win: 'afterCave',
          lose: 'afterCave',
          run: 'afterCave',
        },
      },

      afterCave: {
        bg: 'seacave',
        cast: [],
        panels: (s) => [
          ({
            win: { who: 'narrator', mon: 'foe', text: 'The {foe} swims away. The way is clear!' },
            lose: { who: 'narrator', mon: 'player', text: 'Ouch! {mon} gets knocked back, but the {foe} just swims off. It was only playing.' },
            run: { who: 'narrator', text: 'You slip past the {foe} and go deeper into the cave.' },
            caught: { who: 'narrator', mon: 'caught', text: 'You caught a {caughtSpecies}! It must like the light too.' },
          })[s.flags['ch6:cave']] || { who: 'narrator', text: 'You go deeper into the cave.' },
          { who: 'narrator', text: 'At the very back, a crystal sits on a flat rock. It glows blue-green, like the sea on a sunny day. The Tide Shard!' },
          s.flags.tide === 'rush'
            ? { who: 'narrator', text: 'You reach out for it. Then you hear a motor. A black boat with a closed eye on it pulls into the cave!' }
            : { who: 'narrator', text: 'But someone is already standing next to it. A tall man in a black coat, with a closed eye on his badge.' },
        ],
        next: 'rook',
      },

      rook: {
        bg: 'seacave',
        cast: ['admin'],
        panels: (s) => [
          { who: 'admin', text: 'So you\'re {player}. I\'m Rook, an Admin of the Veil. I\'m much more important than the others you met.' },
          s.flags['ch3:duel'] === 'win'
            ? { who: 'admin', text: 'I heard you beat our Stranger at Glimmer Lake. She has been acting very strange ever since.' }
            : { who: 'admin', text: 'Our Stranger took your Glimmer Shard, didn\'t she? Easy. This will be easy too.' },
          { who: 'admin', text: 'The Veil will wake the giant under the mountain. With all the shards, it will do what we say.' },
          ...(s.flags.peeked
            ? [{ who: 'admin', mon: 'player', text: 'Hm? Your {mon}\'s eyes just flashed purple. The shards know you. How annoying.' }]
            : []),
        ],
        prompt: {
          kind: 'choice',
          speak: true,
          options: [
            {
              text: 'Pokémon aren\'t there to obey you!',
              after: [{ who: 'admin', text: 'Big words for a little trainer. Let\'s see if your team agrees.' }],
              next: 'rookBattle',
            },
            {
              text: 'That shard belongs to the cove!',
              after: [{ who: 'admin', text: 'It belongs to whoever wins. And that will be me.' }],
              next: 'rookBattle',
            },
          ],
        },
      },

      rookBattle: {
        bg: 'seacave',
        cast: ['admin'],
        panels: (s) => [
          ...(s.flags.tide === 'rush'
            ? [{ who: 'narrator', text: 'You got here first, so Rook\'s Pokémon are still sleepy from the boat ride. They will be a bit slow!' }]
            : []),
          ...(s.flags.coveMap
            ? [{ who: 'narrator', text: 'You jump onto the secret shelf from Barlow\'s map. From up here, Rook\'s Pokémon will find it hard to hit you!' }]
            : []),
          { who: 'admin', text: 'Three Pokémon against your team. Let\'s go!' },
        ],
        prompt: {
          kind: 'battle',
          trainer: 'admin',
          team: ROOK_TEAM,
          shardBoss: true, // a win gives 2 levels
          // Rushing in catches Rook off guard; Barlow's map (from asking questions in ch2) gives cover.
          foeMods: (s) => ({
            ...(s.flags.tide === 'rush' ? { speed: -1 } : {}),
            ...(s.flags.coveMap ? { accuracy: -1 } : {}),
          }),
          win: 'afterRook',
          lose: 'afterRook',
        },
      },

      afterRook: {
        bg: 'seacave',
        cast: ['admin'],
        shard: (s) => (coveShardSaved(s) ? 'tide' : null),
        panels: (s) => (coveShardSaved(s)
          ? [
            { who: 'admin', text: 'No! My whole team, beaten by a kid?' },
            { who: 'narrator', mon: 'player', text: '{mon} jumps up onto the rock and stands in front of the shard. Rook takes a step back.' },
            { who: 'admin', text: 'Keep it, then. The Veil has more shards than you think. We will win in the end!' },
            { who: 'narrator', cast: [], text: 'Rook jumps into his boat and zooms out of the cave. You pick up the Tide Shard. It feels cool, like sea water.' },
          ]
          : [
            { who: 'admin', text: 'Ha! Just as I said. Too easy.' },
            { who: 'narrator', text: 'Rook grabs the Tide Shard and jumps into his boat.' },
            { who: 'admin', text: 'Go home, little trainer. The sea is no place for you.' },
            { who: 'narrator', cast: [], text: 'The boat zooms out of the cave. The blue-green light goes with it. {mon} looks at you and gives a brave little nod. You\'ll get it back one day.' },
          ]),
        next: 'sunset',
      },

      sunset: {
        bg: 'beach',
        cast: ['quill', 'fisher', 'courier'],
        panels: (s) => [
          { who: 'narrator', cast: [], text: 'The sun goes down over the sea. Everyone meets on the dock.' },
          coveShardSaved(s)
            ? { who: 'quill', text: 'The Tide Shard! You did it! That\'s the whole cove cheering for you, you know.' }
            : { who: 'quill', text: 'Don\'t be sad, {player}. You were so brave. The Veil can\'t keep the shards forever.' },
          { who: 'fisher', mon: 'caught', text: 'And look at {caught}! It already follows you everywhere.' },
          ...(s.flags.told === 'lie'
            ? [{ who: 'quill', text: 'You told me everything today, {player}. Thank you. We make a good team now.' }]
            : []),
          { who: 'courier', text: 'Oh! I nearly forgot. Someone left this in my cart. No name on it.' },
          { who: 'narrator', cast: [], text: 'It\'s a black feather, tied to a small note. It says: "Spark Town is next. The Veil is already there. Hurry. - A friend."' },
          { who: 'quill', text: 'A Murkrow feather… Could this be from the Stranger? Is she trying to help us now?' },
          { who: 'quill', text: 'Either way, we go to Spark Town in the morning. Get some sleep, {player}!' },
        ],
        prompt: { kind: 'end' },
      },
    },
  };

  // ---------- Chapter 7: Spark Town (Spark Shard) ----------
  // Three places to look for catch #6 in the plant. Electric beats Water, and Aron is part Rock
  // (Rock beats Fire), so every starter has one riskier spot and Quill says which one.
  const PLANT_AREAS = {
    generators: {
      mons: [81, 100, 19], // Magnemite, Voltorb, Rattata (chewing the wires; Normal, so not all Electric)
      panels: [
        { who: 'narrator', bg: 'plant', text: 'The big generators hum and crackle. Tiny sparks jump between them. Something is hiding in the wires!' },
      ],
    },
    scrap: {
      mons: [304, 81, 599], // Aron, Magnemite, Klink
      panels: [
        { who: 'narrator', bg: 'plant', text: 'The scrap yard is full of old pipes and bolts. Clang! Something is chewing on a metal pipe.' },
      ],
    },
    roof: {
      mons: [309, 52, 25], // Electrike, Meowth (a roof cat; Normal), Pikachu
      panels: [
        { who: 'narrator', bg: 'plant', text: 'Up on the roof, the wind blows. The power lines buzz. A little yellow light zips along a wire!' },
      ],
    },
  };
  const PLANT_TIPS = {
    water: 'A tip: the generators and the roof have lots of Electric types. Electric beats Water, so the scrap yard is safer for {mon}.',
    fire: 'A tip: the Aron in the scrap yard is part Rock. Rock beats Fire, so be careful there with {mon}.',
    grass: 'Good news: Grass isn\'t hurt much by Electric moves. {mon} can look anywhere!',
  };
  const PLANT_NICKNAMES = {
    25: ['Sparky', 'Zippy', 'Pip'], 81: ['Magnet', 'Bolt', 'Screw'], 100: ['Bouncer', 'Zap', 'Pokey'],
    19: ['Nibbles', 'Chewy', 'Squeak'], 304: ['Clank', 'Tin', 'Chomp'], 599: ['Gears', 'Cog', 'Tick'],
    309: ['Flash', 'Dash', 'Zoom'], 52: ['Coin', 'Whiskers', 'Purr'],
  };
  // Gate Grunt: Zubat and Koffing. The duo: Dot (Voltorb, Houndour) then Dash (Magnemite, Machop).
  const GATE_TEAM = [
    { id: 41, level: (s) => Math.max(2, s.mon.level - 1) },
    { id: 109, level: (s) => Math.max(2, s.mon.level - 1) },
  ];
  const DOT_TEAM = [
    { id: 100, level: (s) => s.mon.level },
    { id: 228, level: (s) => s.mon.level },
  ];
  const DASH_TEAM = [
    { id: 81, level: bossLv(-1, { grass: 1 }) },
    { id: 66, level: bossLv(1, { grass: 1 }) },
  ];
  const sparkShardSaved = (s) => s.flags['ch7:duo2'] === 'win';
  const plantShards = (s) => (s.shards || []).length;
  const teamFull = (s) => s.party.length >= 5;
  const rivalLine = (s, lines) => lines[s.flags.tone] || lines.confident;

  const chapter7 = {
    id: 'ch7',
    title: 'Chapter 7',
    levelCap: 13, // wins stop levelling here (about where a player who wins everything is)
    subtitle: 'Spark Town',
    start: 'arrive',
    summary: (s) => {
      const caught = s.flags['ch7:catchSearch'] === 'caught';
      return (s.flags.teamup === 'together' ? '{player} teamed up with {rival} to stop the Veil in Spark Town. ' : '{player} and {rival} each beat a Veil guard to get into the Spark Town power plant. ') +
        (caught ? 'Inside, {caught} joined the team. ' : '') +
        (sparkShardSaved(s)
          ? 'Grunts Dot and Dash lost, and the Spark Shard is safe! '
          : 'Grunts Dot and Dash got away with the Spark Shard, but the lights are back on. ') +
        `{player} now holds ${plantShards(s)} shard${plantShards(s) === 1 ? '' : 's'}.`;
    },
    scenes: {
      arrive: {
        bg: 'town',
        cast: ['quill'],
        panels: [
          { who: 'narrator', cast: [], text: 'Spark Town is famous for its lights. But tonight, every window is dark. The street lamps are off. Even the Pokémon Center is closed.' },
          { who: 'quill', text: 'Oh no. It\'s like the whole town ran out of power.' },
          { who: 'narrator', cast: ['bo'], text: 'A man in a hard hat runs up to you. He is holding a torch.' },
          { who: 'bo', cast: ['bo', 'quill'], text: 'Are you trainers? I\'m Bo. I work at the power plant up the hill. Please help!' },
          { who: 'bo', cast: ['bo', 'quill'], text: 'People in black hoods took over the plant. They plugged a big machine into our generator, and now it\'s eating all the power!' },
          { who: 'quill', cast: ['bo', 'quill'], text: 'The Veil! They must be using the power to pull a shard out of something. Come on, {player}!' },
        ],
        next: 'rival',
      },

      rival: {
        bg: 'town',
        cast: ['rival'],
        panels: (s) => [
          { who: 'narrator', cast: [], text: 'On the hill up to the plant, someone is waiting in the dark. His {rivalMon} is next to him.' },
          { who: 'rival', text: rivalLine(s, {
            confident: '{player}! I knew you would turn up. I\'ve been watching the Veil guards at the gate.',
            kind: 'Oh, hi {player}. I, um, wasn\'t waiting for you or anything. But the Veil is here.',
            taunt: 'Well, look who it is. Came to watch me beat the Veil all by myself?',
          }) },
          { who: 'rival', text: 'There are two guards at the gate. I could take one. You could take the other.' },
        ],
        prompt: {
          kind: 'choice',
          speak: true,
          options: [
            {
              text: 'Let\'s do it together!',
              set: { teamup: 'together' },
              after: [{ who: 'rival', text: 'Ha! Fine. Just this once. But don\'t slow me down!' }],
              next: 'gate',
            },
            {
              text: 'You take one, I take one. That\'s it.',
              set: { teamup: 'solo' },
              after: [{ who: 'rival', text: 'Suits me. Try to keep up, {player}.' }],
              next: 'gate',
            },
          ],
        },
      },

      gate: {
        bg: 'plant',
        cast: ['grunt', 'rival'],
        panels: [
          { who: 'narrator', cast: ['grunt'], text: 'Two Veil Grunts stand at the plant gate. They wear black hoods with a closed eye on the front.' },
          { who: 'grunt', text: 'Hey! Kids aren\'t allowed in here. Go home!' },
          { who: 'rival', text: 'Go, {rivalMon}! You there, on the left. You\'re battling me!' },
          { who: 'narrator', cast: ['rival'], text: '{rival}\'s {rivalMon} jumps at the first grunt. They start battling by the fence. Bang! Crash!' },
          { who: 'grunt', text: 'Fine. Then I\'ll deal with YOU.' },
        ],
        prompt: {
          kind: 'battle',
          trainer: 'grunt',
          team: GATE_TEAM,
          win: 'afterGate',
          lose: 'afterGate',
        },
      },

      afterGate: {
        bg: 'plant',
        cast: ['rival'],
        panels: (s) => [
          s.flags['ch7:gate'] === 'win'
            ? { who: 'narrator', cast: ['grunt'], text: 'The grunt\'s Pokémon are worn out. The grunt runs off into the dark, yelling "Not fair!"' }
            : { who: 'narrator', cast: ['grunt'], text: 'The grunt laughs and runs inside to tell the others. At least the gate is open now!' },
          { who: 'narrator', mon: 'rival', text: 'Over by the fence, {rivalMon} lands one last big hit. The other grunt runs away too!' },
          { who: 'rival', text: s.flags.teamup === 'together'
            ? 'That\'s one for me! Go on in, {player}. I\'ll guard the gate so nobody sneaks up on you.'
            : 'Easy. Go on in. I\'ll stay out here and stop anyone who comes back.' },
        ],
        next: 'gateYard',
      },

      // Three rooms, one clock. 1: switch (puzzle-switch.js), 19 moves at best, 4 switch steps.
      // 2: copy the picture (puzzle-picture.js), a lightning bolt on a 4x4 panel floor, 10 moves at best
      // (you must cross one panel twice). 3: switch, 27 moves at best, 6 switch steps. No room can get
      // stuck. time = 2.5 x 56 best moves + 15 s a room = 185, rounded up to 190.
      gateYard: {
        bg: 'plant',
        cast: ['bo', 'quill'],
        panels: [
          { who: 'narrator', cast: [], text: 'Past the gate is the plant yard. It has three parts, with fences and red and blue gates everywhere.' },
          { who: 'bo', text: 'Oh no! The Veil turned on the safety gates. Only one colour can be open at a time.' },
          { who: 'bo', text: 'Step on a round switch to swap which gates are open. Red gates have stripes. Blue gates have dots.' },
          { who: 'bo', text: 'The middle part has light panels on the floor. Step on one and it turns on or off. Make them match the picture!' },
          { who: 'quill', text: 'There\'s a timer, too. If it runs out, the gates reset and we start again. Let\'s be quick!' },
        ],
        prompt: {
          kind: 'puzzle',
          rooms: [
            {
              puzzle: 'switch',
              text: 'Swap the gates and get to the door!',
              grid: [
                '#########',
                '#.PS#E#.#',
                '#..##r..#',
                '#.#..#S.#',
                '#...#rb##',
                '###b.S.##',
                '#########',
              ],
            },
            {
              puzzle: 'picture',
              text: 'Make the floor match the picture!',
              grid: [
                '#######',
                '#P....#',
                '#.oo+o#',
                '#.o++o#',
                '#.o++o#',
                '#.o+oo#',
                '#######',
              ],
            },
            {
              puzzle: 'switch',
              text: 'The last part! Get to the plant door!',
              grid: [
                '#E########',
                '#r.S...r.#',
                '#.#####..#',
                '##S..#...#',
                '#..#.#S#.#',
                '#P.#..rb.#',
                '##########',
              ],
            },
          ],
          time: 190,
          question: 'Get to the plant door!',
          hint: 'Two tricks! Step off a switch and back on to swap the gates again. Step on a panel twice and it goes back.',
          give: { xattack: 1 },
          after: [
            { who: 'bo', text: 'You did it! The door is open. Oh, look. One of the workers dropped this.' },
            { who: 'narrator', text: 'You got an X Attack! It makes your Pokémon hit harder in a battle.' },
          ],
          next: 'switches',
        },
      },

      switches: {
        bg: 'plant',
        cast: ['bo', 'quill'],
        panels: (s) => (s.flags.switchTries
          ? [{ who: 'bo', text: 'Let\'s try again! Remember: the power goes to the one that Electric beats.' }]
          : [
            { who: 'narrator', cast: [], text: 'Inside, it\'s dark. Bo shines his torch on a wall with three big switches: a red one, a blue one and a green one.' },
            { who: 'bo', text: 'These turn the lights back on. But I can\'t remember which one is first! There\'s a note from my boss.' },
            { who: 'narrator', text: 'The note says: "Red is Fire. Blue is Water. Green is Grass. Send the power to the one that Electric beats!"' },
          ]),
        prompt: {
          kind: 'choice',
          question: 'Which switch do you pull?',
          options: [
            {
              text: 'The red switch (Fire)',
              if: (s) => !s.flags.triedRed,
              set: (s) => ({ triedRed: true, switchTries: (s.flags.switchTries || 0) + 1 }),
              next: 'switchWrong',
            },
            {
              text: 'The blue switch (Water)',
              set: (s) => ({ switchFirst: !s.flags.switchTries }),
              next: 'switchRight',
            },
            {
              text: 'The green switch (Grass)',
              if: (s) => !s.flags.triedGreen,
              set: (s) => ({ triedGreen: true, switchTries: (s.flags.switchTries || 0) + 1 }),
              next: 'switchWrong',
            },
          ],
        },
      },

      switchWrong: {
        bg: 'plant',
        cast: ['bo', 'quill'],
        panels: [
          { who: 'narrator', text: 'Click! A little light blinks on… then off again. Fizz. Nothing bad happens. It just didn\'t work.' },
          { who: 'quill', text: 'Hmm. Electric attacks are super good against Water Pokémon. Which switch is Water?' },
        ],
        next: 'switches',
      },

      switchRight: {
        bg: 'plant',
        cast: ['bo', 'quill'],
        panels: (s) => [
          { who: 'narrator', text: 'Click! Hummmm… One by one, the lights in the hall flicker on!' },
          s.flags.switchFirst
            ? { who: 'bo', text: 'First try! Electric beats Water, of course! Now the big lights in the core room will come on too. That will dazzle those grunts!' }
            : { who: 'bo', text: 'You got it! Electric beats Water. Nice thinking!' },
          { who: 'quill', text: 'Listen! The lights woke up the Pokémon that live in the plant. They like the power.' },
          teamFull(s)
            ? { who: 'quill', text: 'Your team is already full, {player}. Six is the most a trainer can carry. Let\'s just say hello to them on the way.' }
            : { who: 'quill', text: 'You have room for one more on your team. Want to find a new friend before we face the Veil?' },
        ],
        next: (s) => (teamFull(s) ? 'fullTeam' : 'catchPick'),
      },

      catchPick: {
        bg: 'plant',
        cast: ['quill'],
        panels: (s) => [{ who: 'quill', text: PLANT_TIPS[s.mon.types[0]] || 'Every spot has different Pokémon. Pick the one you like!' }],
        prompt: {
          kind: 'choice',
          question: 'Where do you look?',
          options: [
            { text: 'The humming generators', if: (s) => s.party.length < 5, set: { plantArea: 'generators' }, next: 'catchSearch' },
            { text: 'The scrap yard', if: (s) => s.party.length < 5, set: { plantArea: 'scrap' }, next: 'catchSearch' },
            { text: 'The windy roof', if: (s) => s.party.length < 5, set: { plantArea: 'roof' }, next: 'catchSearch' },
          ],
        },
      },

      catchSearch: {
        bg: 'plant',
        cast: [],
        panels: (s) => (PLANT_AREAS[s.flags.plantArea] || PLANT_AREAS.generators).panels,
        prompt: {
          kind: 'battle',
          foe: (s) => (PLANT_AREAS[s.flags.plantArea] || PLANT_AREAS.generators).mons,
          level: belowPlayer(2, 0),
          caught: 'catchName',
          win: 'catchMissed',
          lose: 'catchMissed',
          run: 'catchMissed',
        },
      },

      catchMissed: {
        bg: 'plant',
        cast: ['quill'],
        // Never leave the player stuck: top the bag back up to three Poké Balls.
        give: (s) => (s.bag.pokeball < 3 ? { pokeball: 3 - s.bag.pokeball } : {}),
        panels: (s) => [
          ({
            win: { who: 'quill', text: 'Oops, it fainted! It will be fine after a rest. Remember: make it tired, but don\'t knock it out.' },
            lose: { who: 'quill', text: 'That one had a lot of zap! Let me help your team feel better.' },
          })[s.flags['ch7:catchSearch']] || { who: 'quill', text: 'It zipped away! Electric Pokémon are fast. That happens to everyone.' },
          { who: 'quill', text: 'I put a few more Poké Balls in your bag. Let\'s try again!' },
        ],
        next: (s) => (teamFull(s) ? 'fullTeam' : 'catchPick'),
      },

      catchName: {
        bg: 'plant',
        cast: ['quill'],
        panels: [
          { who: 'narrator', mon: 'caught', text: '{caughtSpecies} joined your team!' },
          { who: 'quill', mon: 'caught', text: (s) => (s.party.length >= 5
            ? 'That makes six! A full team. Look at them all, {player}: {team}!'
            : 'Welcome to the team! Look at them all, {player}: {team}!') },
          { who: 'quill', mon: 'caught', text: 'Do you want to give {caughtSpecies} a nickname?' },
        ],
        prompt: {
          kind: 'name',
          field: 'caughtNickname',
          suggestions: (s) => PLANT_NICKNAMES[s.party[s.party.length - 1].id] || ['Volt', 'Buzz', 'Glow'],
          next: 'core',
        },
      },

      fullTeam: {
        bg: 'plant',
        cast: ['quill'],
        give: { superpotion: 1, revive: 1 },
        panels: [
          { who: 'narrator', mon: 25, text: 'A wild Pikachu peeks out from behind a pipe. It waves its tail at your team, then zips away.' },
          { who: 'bo', cast: ['bo', 'quill'], text: 'The plant Pokémon say thank you! And so do I. Here, take these from our first aid box.' },
          { who: 'narrator', text: 'You got a Super Potion and a Revive! A Revive wakes up a Pokémon that fainted.' },
        ],
        next: 'core',
      },

      core: {
        bg: 'plant',
        cast: ['gruntdot', 'gruntdash'],
        panels: (s) => [
          { who: 'narrator', cast: [], text: 'In the middle of the plant is the core room. A big machine with a closed eye on it is plugged into the generator.' },
          { who: 'narrator', cast: [], text: 'In the middle of the machine, a yellow crystal is glowing. It crackles like a tiny storm. The Spark Shard!' },
          { who: 'gruntdot', text: 'Hey, Dash! Some kid got past the gate!' },
          { who: 'gruntdash', text: 'No problem, Dot. We\'re the best team in the whole Veil. First you battle Dot, then you battle me!' },
          ...(s.flags.switchFirst
            ? [{ who: 'narrator', text: 'Then the big lights in the core room switch on, all at once. The grunts cover their eyes. Too bright!' }]
            : []),
        ],
        prompt: {
          kind: 'battle',
          trainer: 'gruntdot',
          team: DOT_TEAM,
          // Getting the switches right first time turns the big lights on and dazzles the grunts.
          foeMods: (s) => (s.flags.switchFirst ? { accuracy: -1 } : {}),
          win: 'duo2',
          lose: 'duo2',
        },
      },

      duo2: {
        bg: 'plant',
        cast: ['gruntdash'],
        panels: (s) => [
          s.flags['ch7:core'] === 'win'
            ? { who: 'gruntdot', cast: ['gruntdot', 'gruntdash'], text: 'Waah! Dash, they beat me! Your turn!' }
            : { who: 'gruntdot', cast: ['gruntdot', 'gruntdash'], text: 'Ha! Did you see that, Dash? Now finish them off!' },
          ...(s.flags.teamup === 'together'
            ? [{ who: 'rival', cast: ['rival', 'gruntdash'], text: '{player}! The gate is safe. I came to cheer you on. Don\'t you dare lose now!' }]
            : []),
          { who: 'gruntdash', text: 'No rest for you, kid. My Pokémon are fresh and ready. Let\'s go!' },
          { who: 'narrator', cast: [], text: 'Your team is all healed and ready too. Here comes battle number two!' },
        ],
        prompt: {
          kind: 'battle',
          trainer: 'gruntdash',
          team: DASH_TEAM,
          shardBoss: true, // a win gives 2 levels
          // Teaming up with the rival pays off: he cheers from the door and Dash gets nervous.
          foeMods: (s) => (s.flags.teamup === 'together' ? { defense: -1, 'special-defense': -1 } : {}),
          win: 'afterDuo',
          lose: 'afterDuo',
        },
      },

      afterDuo: {
        bg: 'plant',
        cast: ['gruntdot', 'gruntdash'],
        shard: (s) => (sparkShardSaved(s) ? 'spark' : null),
        panels: (s) => (sparkShardSaved(s)
          ? [
            { who: 'gruntdash', text: 'What?! We lost? Both of us?' },
            { who: 'gruntdot', text: 'Run, Dash! Rook is going to be so cross!' },
            { who: 'narrator', cast: [], text: 'The grunts run out the back door. Bo pulls the plug on the big machine. It stops with a sad little beep.' },
            { who: 'narrator', cast: [], mon: 'player', text: 'The Spark Shard drops out of the machine. {mon} catches it! It tickles, like a tiny bit of lightning.' },
          ]
          : [
            { who: 'gruntdash', text: 'Yes! The best team in the Veil wins again!' },
            { who: 'narrator', text: 'Dash pulls the Spark Shard out of the machine. Dot grabs it, and they run out the back door.' },
            { who: 'narrator', cast: [], text: 'Without the shard, the machine stops with a sad little beep. Bo pulls the plug for good.' },
            { who: 'quill', cast: ['quill'], text: 'They got the shard. But look, {player}. You still saved the plant!' },
          ]),
        next: 'lights',
      },

      lights: {
        bg: 'town',
        cast: ['rival', 'quill'],
        panels: (s) => [
          { who: 'narrator', cast: [], text: 'All over Spark Town, the lights come back on. Windows glow. Street lamps shine. People come out and cheer!' },
          { who: 'bo', cast: ['bo'], text: 'You saved our town! Thank you, {player}. Spark Town will never forget this.' },
          { who: 'rival', text: rivalLine(s, {
            confident: 'Not bad, {player}. Not bad at all. But next time we battle, I\'m winning.',
            kind: 'You were really good in there. Um. I mean it. Don\'t tell anyone I said that.',
            taunt: 'Okay, okay. You were pretty good. Maybe even almost as good as me.',
          }) },
          sparkShardSaved(s)
            ? { who: 'quill', text: `Another shard for us! That makes ${plantShards(s)}. Every one we have makes the Veil weaker.` }
            : { who: 'quill', text: `The Veil has more shards now. But we still have ${plantShards(s)}, and we have a full team. We won't give up!` },
          ...(s.flags.bond
            ? [{ who: 'narrator', cast: [], mon: 'player', text: '{mon} sits down next to you and looks up at the bright town. It isn\'t scared of the Veil at all. Not with you there.' }]
            : []),
          { who: 'narrator', cast: [], text: 'Far away, past the town, a mountain glows red against the night sky. Smoke curls up from the top.' },
          { who: 'quill', text: 'Ember Mountain. That\'s where the next shard is. And I bet that\'s where the Veil is going too.' },
        ],
        prompt: { kind: 'end' },
      },
    },
  };

  // ---------- Shared helpers for chapters 8-10 ----------
  // Shard keys in the order they are found. The Veil holds every key you don't.
  const SHARD_KEYS = ['glimmer', 'stone', 'frost', 'tide', 'spark', 'ember', 'shadow'];
  const SHARD_NAMES = {
    glimmer: 'Glimmer Shard', stone: 'Stone Shard', frost: 'Frost Shard', tide: 'Tide Shard',
    spark: 'Spark Shard', ember: 'Ember Shard', shadow: 'Shadow Shard',
  };
  // What each shard does in the final battle, said the way a kid would explain it.
  const SHARD_GLOW = {
    glimmer: 'The Glimmer Shard glows purple. The light gets in the giant\'s eyes. It will miss more often!',
    stone: 'The Stone Shard glows brown. Your team feels as tough as rock. Their Defense goes up!',
    frost: 'The Frost Shard glows blue. Ice grows around the giant\'s feet. It slows down!',
    tide: 'The Tide Shard glows sea green. Two extra Potions appear in your bag!',
    spark: 'The Spark Shard crackles yellow. Your team feels zippy and fast. Their Speed goes up!',
    ember: 'The Ember Shard burns red. Your team feels fired up. Their Attack goes up!',
    shadow: 'The Shadow Shard glows black. The giant\'s big attacks get weaker!',
  };
  const heldShards = (s) => SHARD_KEYS.filter((k) => (s.shards || []).includes(k));
  const veilHeld = (s) => SHARD_KEYS.filter((k) => !(s.shards || []).includes(k));
  const allShards = (s) => heldShards(s).length === SHARD_KEYS.length;
  // The whole team, starter first. Never assume a size: it can be 1 to 6.
  const teamAll = (s) => [s.mon, ...(s.party || [])].filter(Boolean);
  const nameOf = (m) => m.nickname || m.species;
  // Foe levels follow your starter. Bosses stay at most 2 above it.
  const lvPlus = (d) => (s) => Math.max(2, topLv(s) + d);
  const shardCount = (n) => (n === 1 ? 'one shard' : `${n} shards`);
  const shardList = (keys) => {
    const names = keys.map((k) => SHARD_NAMES[k]);
    return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  };

  // ---------- Chapter 8: Ember Mountain (Ember Shard, and Sable's letter) ----------
  // Fire country. Fire beats Grass, so a Grass starter meets rock and ground types too.
  const EMBER_WILDS = {
    grass: [74, 322, 77],                        // Geodude, Numel, Ponyta
    default: [77, 58, 218, 322],                 // Ponyta, Growlithe, Slugma, Numel
  };
  const EMBER_VENT = {
    grass: [74, 218, 322],                       // Geodude, Slugma, Numel
    default: [218, 240, 58],                     // Slugma, Magby, Growlithe
  };
  const EMBER_GOOD = ['water', 'rock', 'ground'];
  const emberHelper = (s) => teamAll(s).find((m) => (m.types || []).some((t) => EMBER_GOOD.includes(t)));
  const EMBER_TIP = {
    fire: 'Fire moves don\'t hurt Fire Pokémon much. So let your other friends help {mon} here.',
    grass: 'Fire beats Grass, so keep {mon} safe. Let a friend go first.',
    water: 'Water beats Fire. {mon} is going to love this place!',
  };
  // Admin Rook: three Pokémon, four if your team has at least four, five if it has at least five.
  // By now the whole team has evolved, so his Pokémon sit near your starter's level.
  const rookTeam = (s) => {
    const nudge = { fire: 1, grass: -1, water: -1 };
    const team = [{ id: 110, level: bossLv(-1, nudge) }, { id: 228, level: bossLv(0, nudge) }, { id: 126, level: bossLv(1, nudge) }];  // Weezing, Houndour, Magmar
    if (teamAll(s).length >= 4) team.splice(2, 0, { id: 322, level: bossLv(0, nudge) });                                     // + Numel
    if (teamAll(s).length >= 5) team.splice(1, 0, { id: 219, level: bossLv(-1, nudge) });                                    // + Magcargo
    return team;
  };
  const emberWon = (s) => s.flags['ch8:rook'] === 'win';
  const teamLine = (s) => {
    const n = teamAll(s).length;
    return n >= 6
      ? 'Your team is full: six Pokémon! No catching today. Today is all about training.'
      : `Your team has ${n} Pokémon. Today is all about training them.`;
  };

  const chapter8 = {
    id: 'ch8',
    title: 'Chapter 8',
    levelCap: 15, // wins stop levelling here (about where a player who wins everything is)
    subtitle: 'Ember Mountain',
    start: 'foot',
    summary: (s) => (emberWon(s)
      ? '{player} and {team} climbed Ember Mountain, beat Admin Rook and saved the Ember Shard! '
      : '{player} and {team} climbed Ember Mountain, but Admin Rook got away with the Ember Shard. ') +
      'Best of all, they found a letter from Professor Sable. She is trapped in the Veil\'s hideout, and tomorrow they go to save her.',
    scenes: {
      foot: {
        bg: 'volcano',
        cast: ['quill'],
        panels: (s) => [
          { who: 'narrator', cast: [], text: 'Ember Mountain is huge and black. Smoke curls out of the top, and the ground is warm under your shoes.' },
          { who: 'quill', text: 'Phew! It\'s like standing next to an oven. Drink lots of water, {player}.' },
          { who: 'quill', text: 'The Ember Shard is up in the crater, right at the top. I can feel it humming from here.' },
          { who: 'narrator', cast: [], text: teamLine(s) },
          { who: 'quill', text: (st) => `You have ${shardCount(heldShards(st).length)} so far. Let's make it one more!` },
        ],
        next: 'tip',
      },

      tip: {
        bg: 'volcano',
        cast: ['quill'],
        panels: (s) => {
          const helper = emberHelper(s);
          return [
            { who: 'quill', text: 'A tip before we climb. Lots of Fire Pokémon live here.' },
            { who: 'quill', text: 'Water, Rock and Ground beat Fire. Grass, Bug and Ice types should be careful.' },
            { who: 'quill', mon: 'player', text: EMBER_TIP[s.mon.types[0]] || 'Pick the friend who beats Fire, and let it go first.' },
            ...(helper && helper !== s.mon
              ? [{ who: 'quill', text: `And ${nameOf(helper)} would be great here. You can put it first on the Team screen.` }]
              : []),
            { who: 'quill', text: 'We have time to train on the way up. How do you want to practise?' },
          ];
        },
        prompt: {
          kind: 'choice',
          question: 'How does your team train today?',
          options: [
            {
              text: 'Race up the hill',
              set: { 'ch8:style': 'speed' },
              after: [{ who: 'narrator', text: 'You race up the path, again and again. {team} get quicker every time!' }],
              next: 'drill',
            },
            {
              text: 'Smash the big rocks',
              set: { 'ch8:style': 'power' },
              after: [{ who: 'narrator', text: 'Crack! Boom! {team} smash rocks into little pebbles. Their hits feel stronger!' }],
              next: 'drill',
            },
            {
              text: 'Dodge the falling ash',
              set: { 'ch8:style': 'guard' },
              after: [{ who: 'narrator', text: 'Grey ash drifts down like snow. {team} duck and jump out of the way. Nothing hits them!' }],
              next: 'drill',
            },
          ],
        },
      },

      drill: {
        bg: 'volcano',
        cast: [],
        panels: [{ who: 'narrator', text: 'The training noise brings a wild Pokémon out from behind a hot rock. It wants to join in!' }],
        prompt: {
          kind: 'battle',
          foe: (s) => EMBER_WILDS[s.mon.types[0]] || EMBER_WILDS.default,
          level: belowPlayer(2, 0),
          caught: 'drillCaught',
          win: 'afterDrill',
          lose: 'afterDrill',
          run: 'afterDrill',
        },
      },

      drillCaught: {
        bg: 'volcano',
        cast: ['quill'],
        panels: [
          { who: 'narrator', mon: 'caught', text: '{caughtSpecies} joined your team!' },
          { who: 'quill', mon: 'caught', text: 'A new friend! It knows this mountain, so it can show us the way.' },
        ],
        next: 'afterDrill',
      },

      afterDrill: {
        bg: 'volcano',
        cast: ['quill'],
        panels: (s) => [
          ({
            win: { who: 'quill', text: 'Great work! The {foe} looks happy. I think it just wanted to play.' },
            lose: { who: 'quill', text: 'That was a hot one! Don\'t worry. Every battle makes your team stronger.' },
            run: { who: 'quill', text: 'Smart. No need to fight every Pokémon on the mountain.' },
            caught: { who: 'quill', text: 'Let\'s keep going. We\'re halfway up!' },
          })[s.flags['ch8:drill']] || { who: 'quill', text: 'Let\'s keep going. We\'re halfway up!' },
          ({
            speed: { who: 'quill', text: 'All that racing paid off. Your team is really quick now.' },
            power: { who: 'quill', text: 'All that rock smashing paid off. Your team hits really hard now.' },
            guard: { who: 'quill', text: 'All that dodging paid off. Your team is really hard to hit now.' },
          })[s.flags['ch8:style']] || { who: 'quill', text: 'Your team is getting stronger every day.' },
        ],
        next: (s) => (s.party.length ? 'spring' : 'path'),
      },

      // The training pays off: resting in the shard-warmed spring, the rest of the team evolves (the
      // starter did in chapter 5), except a Pokémon that only just joined in the drill.
      spring: {
        bg: 'volcano',
        cast: ['quill'],
        // Saves from when this happened in afterDrill have already evolved.
        evolve: (s) => (s.flags['evolve:ch8:afterDrill'] ? []
          : s.party.filter((m, i) => !(s.flags['ch8:drill'] === 'caught' && i === s.party.length - 1))),
        panels: [
          { who: 'narrator', cast: [], text: 'Halfway up, you find a warm spring. Steam rises from the water. Everyone sits down for a rest.' },
          { who: 'quill', text: 'Feel that? The water is warm because the Ember Shard is right above us. Its power soaks into everything here.' },
          { who: 'quill', text: 'Your team trained so hard today. Hard work plus shard power can help Pokémon grow up.' },
          { who: 'narrator', cast: [], text: '{team} splash in the warm water. The steam starts to sparkle around them…' },
        ],
        next: 'path',
      },

      path: {
        bg: 'volcano',
        cast: ['quill'],
        panels: [
          { who: 'narrator', cast: [], text: 'Higher up, the path is lined with black rock that is still cooling down.' },
          { who: 'narrator', cast: [], mon: 218, text: 'A little Slugma is stuck! Its tail is caught in a crack between two rocks, and it is crying.' },
          { who: 'quill', text: 'Poor thing. But we should hurry. The Veil could reach the shard first.' },
        ],
        prompt: {
          kind: 'choice',
          question: 'What do you do?',
          options: [
            {
              text: 'Stop and help the Slugma',
              set: { 'ch8:helped': true },
              give: { superpotion: 1 },
              after: [
                { who: 'narrator', mon: 218, text: 'You and {lead} push the rock together. Pop! The Slugma slides free.' },
                { who: 'narrator', mon: 218, text: 'It gives a happy squeak, then rolls a Super Potion out from under a rock. A present for you!' },
                { who: 'narrator', text: 'You got a Super Potion! The Slugma follows you up the path.' },
              ],
              next: 'vent',
            },
            {
              text: 'Hurry on to the top',
              set: { 'ch8:helped': false },
              after: [
                { who: 'quill', text: 'I\'ll leave some water by the crack. It will cool the rock, and Slugma can wiggle out.' },
                { who: 'narrator', text: 'You hurry on. Behind you, you hear a small pop and a happy squeak.' },
              ],
              next: 'vent',
            },
          ],
        },
      },

      vent: {
        bg: 'volcano',
        cast: [],
        panels: [
          { who: 'narrator', text: 'Whoosh! Hot steam shoots out of the ground right in front of you.' },
          { who: 'narrator', text: 'A wild Pokémon jumps out of the steam. Its eyes glow purple, just like in Whisperwood. The shard is close!' },
        ],
        prompt: {
          kind: 'battle',
          foe: (s) => EMBER_VENT[s.mon.types[0]] || EMBER_VENT.default,
          level: belowPlayer(1, 0),
          caught: 'hut',
          win: 'hut',
          lose: 'hut',
          run: 'hut',
        },
      },

      hut: {
        bg: 'volcano',
        cast: ['quill'],
        give: { revive: 1, xattack: 1 },
        panels: (s) => [
          (s.flags['ch8:vent'] === 'caught'
            ? { who: 'narrator', mon: 'caught', text: 'You caught {caughtSpecies}! The purple glow fades from its eyes inside the ball.' }
            : { who: 'narrator', mon: 'foe', text: 'The {foe} blinks. The purple glow fades, and it runs back into the steam.' }),
          { who: 'narrator', cast: [], text: 'Next to the path is a little stone hut. There is a closed eye painted on the door.' },
          { who: 'quill', text: 'The Veil\'s sign! They must stay here when they come up the mountain. Let\'s look inside. Quietly.' },
          { who: 'narrator', cast: [], text: 'Inside there is a table, some old maps and a pile of books. Nobody is home.' },
          { who: 'narrator', cast: [], text: 'On the table are a Revive and an X Attack. You got them! An X Attack makes your Pokémon hit harder in a battle.' },
          ...(s.flags['ch8:helped']
            ? [{ who: 'narrator', cast: [], mon: 218, text: 'The Slugma wiggles under the table and squeaks. It found something! An envelope, hidden under a loose stone.' }]
            : [{ who: 'narrator', cast: [], text: 'One stone in the floor wobbles under your foot. You lift it up. Under it is an envelope!' }]),
          { who: 'quill', text: 'This handwriting… I know it. It\'s from my teacher. It\'s from Professor Sable!' },
        ],
        next: 'letter',
      },

      letter: {
        bg: 'volcano',
        cast: ['quill'],
        panels: [
          { who: 'narrator', text: 'Dr. Quill\'s hands shake a little as she reads it out loud.' },
          { who: 'quill', text: '"To whoever finds this: my name is Professor Sable. The Veil caught me while I was looking for the shards."' },
          { who: 'quill', text: '"They keep me in their hideout, inside the next mountain. Look for a big stone door with a closed eye on it."' },
          { who: 'quill', text: '"Their leader is called Master Nox. He wants all seven shards, to wake the giant Pokémon sleeping under the mountains."' },
          { who: 'quill', text: '"Please do not let him get the Ember Shard. And if you know my student, Quill, tell her I am okay."' },
          { who: 'quill', text: 'She\'s okay! She\'s been okay all this time! Oh, {player}…' },
        ],
        prompt: {
          kind: 'choice',
          speak: true,
          options: [
            {
              text: 'Then let\'s go and save her!',
              set: { 'ch8:letter': 'rescue' },
              after: [{ who: 'quill', text: 'Yes! But first the shard. We can\'t let Master Nox have it.' }],
              next: 'crater',
            },
            {
              text: 'Could it be a trick?',
              set: { 'ch8:letter': 'careful' },
              after: [
                { who: 'quill', text: 'Good thinking. But look, she drew a little Pidgey at the end. She always did that. It\'s really her.' },
                { who: 'quill', text: 'And this is the key to her secret code! Now I can read her notebook.' },
              ],
              next: 'crater',
            },
            {
              text: 'We\'ll get the shard, then her.',
              set: { 'ch8:letter': 'shard' },
              after: [{ who: 'quill', text: 'You\'re right. One thing at a time. The crater first!' }],
              next: 'crater',
            },
          ],
        },
      },

      crater: {
        bg: 'volcano',
        cast: ['admin'],
        panels: [
          { who: 'narrator', cast: [], text: 'At the top, the crater is full of glowing orange lava, far below. The air shimmers with heat.' },
          { who: 'narrator', cast: [], text: 'On a rock ledge, a red crystal sparkles like a tiny fire. The Ember Shard!' },
          { who: 'narrator', text: 'But someone is already reaching for it. It\'s Admin Rook from the Veil!' },
          { who: 'admin', text: 'You again? You kids keep turning up like a bad smell.' },
          { who: 'admin', text: 'Master Nox wants this shard, and Master Nox always gets what he wants.' },
        ],
        prompt: {
          kind: 'choice',
          speak: true,
          options: [
            {
              text: 'That shard isn\'t yours!',
              after: [{ who: 'admin', text: 'It will be when I win. Come on, then!' }],
              next: 'rook',
            },
            {
              text: 'Let Professor Sable go!',
              after: [
                { who: 'admin', text: 'How do you know about… Never mind! Nobody leaves the hideout. Not her, and not you!' },
                { who: 'narrator', text: 'Rook looks worried. He didn\'t know you had found the letter.' },
              ],
              next: 'rook',
            },
            {
              text: 'Why does Nox want the giant?',
              after: [
                { who: 'admin', text: 'So every Pokémon in the world will do what he says. Imagine that!' },
                { who: 'quill', cast: ['quill', 'admin'], text: 'That\'s terrible! Pokémon are our friends, not our servants!' },
              ],
              next: 'rook',
            },
          ],
        },
      },

      rook: {
        bg: 'volcano',
        cast: ['admin'],
        panels: (s) => (s.flags['ch8:helped']
          ? [{ who: 'narrator', mon: 218, text: 'The little Slugma rolls up next to you and puffs out a cloud of smoke. Rook\'s team can\'t see well!' }]
          : []),
        prompt: {
          kind: 'battle',
          trainer: 'admin',
          team: rookTeam,
          shardBoss: true, // a win gives 2 levels
          // Training pays off, and the Slugma you helped gets in the way of Rook's team.
          foeMods: (s) => {
            const mods = ({ speed: { speed: -1 }, power: { defense: -1 }, guard: { attack: -1 } })[s.flags['ch8:style']] || {};
            return s.flags['ch8:helped'] ? { ...mods, accuracy: -1 } : mods;
          },
          win: 'afterRook',
          lose: 'afterRook',
        },
      },

      afterRook: {
        bg: 'volcano',
        cast: ['admin'],
        shard: (s) => (emberWon(s) ? 'ember' : null),
        panels: (s) => (emberWon(s)
          ? [
            { who: 'admin', text: 'No, no, NO! Beaten by a kid, again!' },
            { who: 'narrator', mon: 'player', text: 'While Rook stamps his feet, {mon} jumps onto the ledge and grabs the Ember Shard. It\'s warm, like a cup of cocoa.' },
            { who: 'admin', text: 'Keep it, then! Master Nox will come for it himself. You\'ll see!' },
            { who: 'narrator', cast: [], text: 'Rook runs down the far side of the mountain. The Ember Shard is yours!' },
          ]
          : [
            { who: 'admin', text: 'Ha! Too slow, too weak, too bad!' },
            { who: 'narrator', text: 'Rook grabs the Ember Shard and holds it up. It glows red in his hand.' },
            { who: 'admin', text: 'Master Nox will be so pleased. Bye-bye!' },
            { who: 'narrator', cast: [], text: 'He runs down the far side of the mountain. The Veil has the Ember Shard now.' },
            { who: 'quill', cast: ['quill'], text: 'Don\'t be sad, {player}. It\'s going to the hideout. And that\'s just where we\'re going too.' },
          ]),
        next: 'camp',
      },

      camp: {
        bg: 'camp',
        cast: ['quill'],
        panels: (s) => [
          { who: 'narrator', cast: [], text: 'That night you camp on the cool side of the mountain. The stars are very bright up here.' },
          { who: 'narrator', cast: [], text: '{team} curl up around the campfire. They trained so hard today.' },
          { who: 'quill', text: (st) => `We have ${shardCount(heldShards(st).length)} now. The Veil has ${shardCount(veilHeld(st).length)}.` },
          s.flags['ch8:letter'] === 'careful'
            ? { who: 'quill', text: 'With the code from the letter, I read Sable\'s notebook. She says the shards are pieces of the giant itself!' }
            : { who: 'quill', text: 'I keep reading the letter again and again. She\'s alive. She\'s really alive.' },
          { who: 'quill', text: 'Tomorrow we find the stone door with the closed eye. We save Professor Sable, and we take back the Veil\'s shards.' },
          { who: 'quill', text: 'Thank you, {player}. I couldn\'t do this without you.' },
          { who: 'narrator', cast: [], text: 'Far below, deep in the mountain, something big moves in its sleep. The ground shakes, just a little.' },
        ],
        prompt: { kind: 'end' },
      },
    },
  };

  // ---------- Chapter 9: The Veil's Hideout (rescue Sable, win shards back) ----------
  // Each vault battle wins back one shard the Veil holds: the Shadow Shard first, then any you lost.
  // At most four vault battles, so a player who lost every shard isn't stuck here for ages.
  const HIDEOUT_MAX_ROUNDS = 4;
  // Two Pokémon each at your starter's level, plus a third when your team has four or more.
  const HIDEOUT_ROUNDS = [
    [{ id: 262, level: lvPlus(0) }, { id: 42, level: lvPlus(1) }, { id: 198, level: lvPlus(0) }],   // Mightyena, Golbat, Murkrow
    [{ id: 109, level: lvPlus(0) }, { id: 215, level: lvPlus(1) }, { id: 97, level: lvPlus(0) }],   // Koffing, Sneasel, Hypno
    [{ id: 88, level: lvPlus(0) }, { id: 228, level: lvPlus(1) }, { id: 24, level: lvPlus(0) }],    // Grimer, Houndour, Arbok
    [{ id: 200, level: lvPlus(0) }, { id: 110, level: lvPlus(1) }, { id: 262, level: lvPlus(0) }],  // Misdreavus, Weezing, Mightyena
  ];
  const hideoutTeam = (s) => {
    const team = HIDEOUT_ROUNDS[(Math.max(1, hideoutRound(s)) - 1) % HIDEOUT_ROUNDS.length];
    return teamAll(s).length >= 4 ? team : team.slice(0, 2);
  };
  const hideoutRound = (s) => s.flags['ch9:round'] || 0;
  const hideoutTarget = (s) => {
    const held = veilHeld(s);
    return held.includes('shadow') ? 'shadow' : held[0] || null;
  };
  const glimmerSaved = (s) => s.flags['ch3:duel'] === 'win';

  const chapter9 = {
    id: 'ch9',
    title: 'Chapter 9',
    levelCap: 17, // wins stop levelling here (about where a player who wins everything is)
    subtitle: 'The Veil\'s Hideout',
    start: 'door',
    summary: (s) => {
      const got = s.flags['ch9:regained'] || 0;
      return `{player} snuck into the Veil's hideout and saved Professor Sable! ` +
        (got ? `{team} won back ${got === 1 ? 'a shard' : `${got} shards`}, so now {player} holds ${heldShards(s).length} of the 7. `
          : `The Veil kept its shards this time, but {player} still holds ${heldShards(s).length}. `) +
        'The Stranger turned out to be Wren, a new friend. But Master Nox ran deep into the mountain, to wake the giant…';
    },
    scenes: {
      door: {
        bg: 'cave',
        cast: ['quill'],
        panels: [
          { who: 'narrator', cast: [], text: 'The next mountain is quiet and grey. You walk around it all morning.' },
          { who: 'narrator', cast: [], text: 'Then you see it: a huge stone door in the rock. A closed eye is carved on it.' },
          { who: 'quill', text: 'The Veil\'s hideout. Sable is somewhere in there.' },
          { who: 'quill', text: 'Two guards at the door. We can\'t just walk in. We need a plan.' },
          { who: 'narrator', cast: [], text: 'Then a voice whispers from behind a rock. "Psst. Over here."' },
        ],
        next: 'stranger',
      },

      stranger: {
        bg: 'cave',
        cast: ['veil'],
        panels: (s) => [
          { who: 'narrator', text: 'It\'s the Stranger! The one with the hood, from Glimmer Lake.' },
          glimmerSaved(s)
            ? { who: 'veil', text: 'Don\'t shout. I\'m not here to fight. You beat me at the lake, remember? I haven\'t stopped thinking about it.' }
            : { who: 'veil', text: 'Don\'t shout. I\'m not here to fight. I took the Glimmer Shard from you at the lake. I\'m sorry. I really am.' },
          ({
            invite: { who: 'veil', text: 'At Frost Peak you asked me to come with you. I said no. Now I\'m saying yes.' },
            truth: { who: 'veil', text: 'At Frost Peak you told me the truth about the Veil. I didn\'t want to hear it. But you were right.' },
            cold: { who: 'veil', text: 'At Frost Peak you didn\'t believe me. I don\'t blame you. But I mean it now.' },
          })[s.flags.stranger] || { who: 'veil', text: 'The Veil told me the shards would help Pokémon. I believed them. But I saw what they really want.' },
          { who: 'veil', mon: 198, text: 'Did Barlow bring you a note from "a friend", with a Murkrow feather? That was me.' },
          heldShards(s).length >= 4
            ? { who: 'veil', text: 'You kept winning, again and again. And your Pokémon always looked happy. Ours never did.' }
            : { who: 'veil', text: 'You never gave up, even when you lost. Your Pokémon stood by you every time. Ours never did.' },
          { who: 'veil', text: 'I know a secret way in. Let me help you.' },
        ],
        prompt: {
          kind: 'choice',
          speak: true,
          options: [
            {
              text: 'Okay. Show us the way.',
              set: { 'ch9:trust': 'yes' },
              after: [{ who: 'veil', text: 'Thank you. Stay close, and stay quiet.' }],
              next: 'sneak',
            },
            {
              text: 'Why should we believe you?',
              set: { 'ch9:trust': 'asked' },
              after: [
                { who: 'veil', text: 'You shouldn\'t, not yet. But Master Nox wants to make every Pokémon obey him. Even mine.' },
                { who: 'veil', text: 'I won\'t let that happen. Come on. I\'ll show you.' },
              ],
              next: 'sneak',
            },
            {
              text: 'No thanks. We\'ll find our own way.',
              set: { 'ch9:trust': 'no' },
              after: [
                { who: 'veil', text: 'Fine. The side door is round to the left. Be careful. There\'s always a guard.' },
                { who: 'narrator', cast: [], text: 'The Stranger slips away into the shadows.' },
              ],
              next: 'guard',
            },
          ],
        },
      },

      guard: {
        bg: 'cave',
        cast: ['grunt'],
        panels: [
          { who: 'narrator', text: 'You find the side door. But a Veil Grunt is sitting right in front of it, eating a sandwich.' },
          { who: 'grunt', text: 'Hey! Who are you? Kids aren\'t allowed in here!' },
        ],
        prompt: {
          kind: 'battle',
          trainer: 'grunt',
          team: [{ id: 41, level: lvPlus(0) }, { id: 109, level: lvPlus(0) }], // Zubat, Koffing
          win: 'sneak',
          lose: 'sneak',
        },
      },

      sneak: {
        bg: 'hideout',
        cast: ['quill'],
        panels: (s) => {
          const trust = s.flags['ch9:trust'];
          if (trust === 'no') {
            return [
              s.flags['ch9:guard'] === 'win'
                ? { who: 'narrator', cast: ['grunt'], text: 'The grunt runs off, still holding half a sandwich. The side door is open!' }
                : { who: 'narrator', cast: ['grunt'], text: 'The grunt laughs and goes to get help. While he\'s gone, you slip in through the side door.' },
              { who: 'narrator', cast: [], text: 'Inside, the halls are dark and purple. Closed eyes are painted on every wall.' },
              { who: 'narrator', cast: ['veil'], text: 'A hooded shape waves at you from a corner. The Stranger! She points down a hall: "The cells are that way."' },
            ];
          }
          return [
            { who: 'narrator', cast: ['veil'], text: 'The Stranger leads you through a crack in the rock, behind a curtain of ivy.' },
            { who: 'narrator', cast: [], text: 'Inside, the halls are dark and purple. Closed eyes are painted on every wall.' },
            { who: 'veil', cast: ['veil'], text: 'Wait here.' },
            { who: 'narrator', cast: ['veil'], text: 'She walks up to two grunts. "Master Nox wants you both. Now!" They hurry off.' },
            ...(trust === 'yes'
              ? [{ who: 'veil', cast: ['veil'], text: 'Here. I took these from the store room. You\'ll need them.' },
                { who: 'narrator', cast: [], text: 'She gives you two Potions and an X Attack!' }]
              : [{ who: 'quill', text: 'She really is helping us, {player}.' }]),
            { who: 'veil', cast: ['veil'], text: 'The cells are down that hall. I\'ll keep watch.' },
          ];
        },
        give: (s) => (s.flags['ch9:trust'] === 'yes' ? { potion: 2, xattack: 1 } : {}),
        next: 'jailer',
      },

      jailer: {
        bg: 'hideout',
        cast: ['grunt'],
        panels: [
          { who: 'narrator', cast: [], text: 'At the end of the hall is a door with bars. Someone is sitting inside, reading a book by candle light.' },
          { who: 'grunt', text: 'Stop right there! I\'m the jailer, and nobody gets past me. Nobody!' },
        ],
        prompt: {
          kind: 'battle',
          trainer: 'grunt',
          team: [{ id: 96, level: lvPlus(0) }, { id: 20, level: lvPlus(1) }], // Drowzee, Raticate
          win: 'cells',
          lose: 'cells',
        },
      },

      cells: {
        bg: 'hideout',
        cast: ['sable', 'quill'],
        panels: (s) => [
          s.flags['ch9:jailer'] === 'win'
            ? { who: 'narrator', cast: ['grunt'], text: 'The jailer drops his keys and runs. You grab them and open the door!' }
            : { who: 'narrator', cast: ['grunt'], text: 'The jailer cheers, and drops his keys. {lead} grabs them before he can pick them up. The door opens!' },
          { who: 'sable', text: 'Well, well. Visitors! And is that… Quill? Is that really you?' },
          { who: 'quill', text: 'Professor Sable! We found your letter!' },
          { who: 'narrator', text: 'Dr. Quill runs in and hugs her teacher very tight.' },
          { who: 'sable', text: 'You did it, my clever girl. And you must be {player}. Thank you for coming for an old lady.' },
        ],
        next: 'sable',
      },

      sable: {
        bg: 'hideout',
        cast: ['sable'],
        set: (s) => ({ 'ch9:rounds': Math.min(veilHeld(s).length, HIDEOUT_MAX_ROUNDS), 'ch9:round': 0 }),
        panels: (s) => [
          { who: 'sable', text: 'Now listen carefully, because this is important.' },
          { who: 'sable', mon: 800, text: 'The giant under the mountains is a Pokémon called Necrozma. It\'s made of light and crystal.' },
          { who: 'sable', mon: 800, text: 'Long ago it broke into pieces and fell asleep. Those pieces are the seven shards.' },
          { who: 'sable', text: 'Now it\'s waking up, and it wants its pieces back. When it gets them, it will be very strong.' },
          { who: 'sable', text: 'But the shards like you, {player}. They\'ll help you if you ask them to. With all seven, you might even calm it down.' },
          { who: 'sable', text: `You have ${shardCount(heldShards(s).length)}. The Veil keeps the other ${shardCount(veilHeld(s).length)} in a vault, just up those stairs.` },
        ],
        prompt: {
          kind: 'choice',
          question: 'What do you do?',
          options: [
            {
              text: 'Go to the vault!',
              set: { 'ch9:ask': 'vault' },
              after: [{ who: 'sable', text: 'That\'s the spirit! I\'ll come too. Nobody locks me up and gets away with it.' }],
              next: (s) => (s.flags['ch9:rounds'] > 0 ? 'vault' : 'nox'),
            },
            {
              text: 'Ask how to calm the giant',
              set: { 'ch9:ask': 'calm' },
              after: [
                { who: 'sable', text: 'Don\'t be scared of it, and don\'t let your Pokémon be scared either. Stay calm and brave, together.' },
                { who: 'sable', text: 'A giant that feels safe will go back to sleep. Now, the vault!' },
              ],
              next: (s) => (s.flags['ch9:rounds'] > 0 ? 'vault' : 'nox'),
            },
          ],
        },
      },

      // Visited once per vault battle. Picks the round and which shard it is for.
      vault: {
        bg: 'hideout',
        cast: ['grunt'],
        set: (s) => ({ 'ch9:round': hideoutRound(s) + 1, 'ch9:target': hideoutTarget(s) }),
        panels: (s) => {
          const shard = SHARD_NAMES[s.flags['ch9:target']];
          const round = hideoutRound(s);
          return [
            round === 1
              ? { who: 'narrator', cast: [], text: 'Up the stairs is a round room. The Veil\'s shards sit in glass boxes, glowing in the dark.' }
              : { who: 'narrator', cast: [], text: 'The alarm is still ringing. Another Veil Grunt runs into the vault!' },
            s.flags['ch9:target'] === 'shadow'
              ? { who: 'narrator', cast: [], text: 'In the middle is a black crystal that seems to drink the light. The Shadow Shard. The Veil had it before anyone.' }
              : { who: 'narrator', cast: [], text: `Next up is the ${shard}. It was yours once. Time to win it back!` },
            { who: 'grunt', text: `Hands off the ${shard}! You want it? Beat me first!` },
          ];
        },
        next: 'duel',
      },

      duel: {
        bg: 'hideout',
        cast: ['grunt'],
        panels: [],
        prompt: {
          kind: 'battle',
          trainer: 'grunt',
          team: hideoutTeam,
          // The Shadow Shard round is this chapter's shard boss (2 levels); winning back a lost one gives 1.
          shardBoss: (s) => s.flags['ch9:target'] === 'shadow',
          win: 'claim',
          lose: 'claim',
        },
      },

      claim: {
        bg: 'hideout',
        cast: ['sable', 'quill'],
        shard: (s) => (s.flags['ch9:duel'] === 'win' ? s.flags['ch9:target'] : null),
        set: (s) => (s.flags['ch9:duel'] === 'win' ? { 'ch9:regained': (s.flags['ch9:regained'] || 0) + 1 } : {}),
        panels: (s) => {
          const shard = SHARD_NAMES[s.flags['ch9:target']];
          const more = hideoutRound(s) < (s.flags['ch9:rounds'] || 0) && veilHeld(s).length > 0;
          return [
            s.flags['ch9:duel'] === 'win'
              ? { who: 'narrator', cast: [], text: `The grunt runs away. You open the glass box and take the ${shard}. It\'s back with you, where it belongs!` }
              : { who: 'narrator', cast: ['grunt'], text: `The grunt grabs the ${shard} and holds it tight. Oh no! But you can still try again.` },
            more
              ? { who: 'sable', text: 'More grunts are coming! Get ready, {player}!' }
              : { who: 'quill', text: 'That\'s the last one who can fight. Wait… someone else is coming up the stairs.' },
          ];
        },
        next: (s) => (hideoutRound(s) < (s.flags['ch9:rounds'] || 0) && veilHeld(s).length > 0 ? 'vault' : 'nox'),
      },

      nox: {
        bg: 'hideout',
        cast: ['leader'],
        panels: (s) => {
          const left = veilHeld(s);
          return [
            { who: 'narrator', text: 'A tall man in a long dark robe walks in. His grunts step out of his way.' },
            { who: 'leader', text: 'So. You are the child who keeps getting in my way. I am Master Nox.' },
            left.length
              ? { who: 'leader', text: `You were clever. But I still have ${shardCount(left.length)}: the ${shardList(left)}. That is enough.` }
              : { who: 'leader', text: 'You took every shard I had. Clever. But I don\'t need them. The giant is awake enough already.' },
            { who: 'leader', text: 'Tonight I go down under the mountain. And when the giant wakes, every Pokémon will listen to me.' },
          ];
        },
        prompt: {
          kind: 'choice',
          speak: true,
          options: [
            {
              text: 'We won\'t let you!',
              set: { 'ch9:word': 'brave' },
              after: [
                { who: 'leader', text: 'Brave words. Your knees are shaking, child.' },
                { who: 'narrator', mon: 'player', text: '{mon} steps in front of you and growls. Master Nox takes one step back.' },
              ],
              next: 'escape',
            },
            {
              text: 'Pokémon aren\'t yours to boss!',
              set: { 'ch9:word': 'kind' },
              after: [
                { who: 'leader', text: 'Pokémon are strong, and people are weak. I will fix that.' },
                { who: 'sable', cast: ['leader', 'sable'], text: 'You\'ve got it all wrong, Nox. Pokémon and people make each other strong. Together.' },
              ],
              next: 'escape',
            },
            {
              text: 'Say nothing, and get ready',
              set: { 'ch9:word': 'ready' },
              after: [{ who: 'narrator', text: 'You don\'t say a word. You just look at Nox, and {team} stand ready beside you.' }],
              next: 'escape',
            },
          ],
        },
      },

      escape: {
        bg: 'hideout',
        cast: ['leader'],
        panels: (s) => [
          { who: 'leader', text: 'No time to play. Goodbye, child.' },
          veilHeld(s).length
            ? { who: 'narrator', text: 'He sweeps up his shards and pulls a lever. The floor opens, and a lift carries him down into the dark.' }
            : { who: 'narrator', text: 'He pulls a lever. The floor opens, and a lift carries him down into the dark.' },
          { who: 'narrator', cast: [], text: 'Rumble! The whole hideout starts to shake. Rocks fall from the roof!' },
          { who: 'narrator', cast: ['veil'], text: 'The Stranger runs in. "This way! Everybody out!"' },
          { who: 'narrator', cast: [], text: 'You all run down the halls, past the empty cells, and out into the cool night air.' },
        ],
        next: 'unmask',
      },

      unmask: {
        bg: 'night',
        cast: ['veil'],
        panels: (s) => [
          { who: 'narrator', cast: [], text: 'Outside, everyone sits down on the grass, puffing and panting. You made it!' },
          { who: 'veil', text: 'Before you go after him, there\'s something I have to do.' },
          { who: 'narrator', cast: ['wren'], text: 'The Stranger takes off her hood. She\'s a girl, not much older than you, with a kind face.' },
          { who: 'wren', cast: ['wren'], text: 'My name is Wren. I\'m not the Veil\'s any more. I\'m on your side now, {player}.' },
          { who: 'wren', cast: ['wren'], mon: 198, text: 'My Murkrow and Poochyena never liked the Veil either. They\'re glad we left.' },
          s.flags['ch9:trust'] === 'no'
            ? { who: 'wren', cast: ['wren'], text: 'You didn\'t trust me at the door. That\'s okay. I wouldn\'t have trusted me either.' }
            : { who: 'wren', cast: ['wren'], text: 'You trusted me at the door. Nobody has trusted me in a long time. Thank you.' },
        ],
        prompt: {
          kind: 'choice',
          speak: true,
          options: [
            {
              text: 'Welcome to the team, Wren!',
              set: { wren: 'friend' },
              after: [{ who: 'wren', cast: ['wren'], text: 'The team? Really? …I\'d like that. A lot.' }],
              next: 'plan',
            },
            {
              text: 'Why did you join the Veil?',
              set: { wren: 'why' },
              after: [
                { who: 'wren', cast: ['wren'], text: 'I was alone, and they said they\'d help Pokémon. I wanted to help Pokémon too.' },
                { who: 'wren', cast: ['wren'], text: 'Now I know the right way to do it. Your way.' },
              ],
              next: 'plan',
            },
            {
              text: 'Nice to meet you, Wren.',
              set: { wren: 'hello' },
              after: [{ who: 'wren', cast: ['wren'], text: 'Nice to meet you too, {player}. For real, this time.' }],
              next: 'plan',
            },
          ],
        },
      },

      plan: {
        bg: 'camp',
        cast: ['sable', 'quill', 'wren'],
        panels: (s) => [
          { who: 'sable', text: 'Nox has gone deep under the mountain, to where Necrozma sleeps.' },
          allShards(s)
            ? { who: 'sable', text: 'But you have all seven shards, {player}! All of them! Nox has none. That gives us a real chance.' }
            : { who: 'sable', text: (st) => `You hold ${shardCount(heldShards(st).length)}. Nox has ${shardCount(veilHeld(st).length)}. Every shard you hold will help you down there.` },
          { who: 'wren', text: 'I know the tunnels. I can take us down to the giant\'s cave.' },
          { who: 'quill', text: 'Then we go at first light. All of us, together.' },
          { who: 'narrator', cast: [], text: 'That night, {team} sleep in a big warm pile. Tomorrow is the biggest day of all.' },
        ],
        prompt: { kind: 'end' },
      },
    },
  };

  // ---------- Chapter 10: Beneath the Mountain (the finale) ----------
  const NECROZMA = 800;
  const ULTRA = 10157;         // Ultra Necrozma (a form: PokéAPI has no species page for it)
  const GIANT_LV = 6;          // Necrozma: starter level + this
  const GIANT_MOVE_LEVEL = 30; // its learnset stops here
  // Master Nox: four Pokémon, five if your team has at least five, top one at most 2 levels above
  // your starter. Charmander walls his Fire and Dark moves, so his team comes higher for it.
  const NOX_NUDGE = { fire: 1, grass: -1, water: -1 };
  const NOX_TEAM = (s) => [
    { id: 302, level: bossLv(0, NOX_NUDGE) },  // Sableye
    { id: 110, level: bossLv(-1, NOX_NUDGE) }, // Weezing
    ...(teamAll(s).length >= 5 ? [{ id: 169, level: bossLv(0, NOX_NUDGE) }] : []), // Crobat
    { id: 229, level: bossLv(1, NOX_NUDGE) },  // Houndoom
    { id: 359, level: bossLv(1, NOX_NUDGE) },  // Absol
  ];
  const giantResult = (s) => s.flags['ch10:giant'];
  const noxBeaten = (s) => s.flags['ch10:nox'] === 'win';
  const tobiHere = (s) => s.flags.fence === 'declined';

  const chapter10 = {
    id: 'ch10',
    title: 'Chapter 10',
    levelCap: 19, // wins stop levelling here (about where a player who wins everything is)
    subtitle: 'Beneath the Mountain',
    start: 'down',
    summary: (s) => {
      const n = heldShards(s).length;
      if (giantResult(s) === 'win' && allShards(s)) {
        return '{player} and {team} went deep under the mountain, stopped Master Nox, and joined all 7 shards into one crystal. ' +
          'Necrozma woke up calm and happy, and now it is their friend. The End!';
      }
      if (giantResult(s) === 'win') {
        return `{player} and {team} went deep under the mountain, stopped Master Nox, and beat the giant Necrozma with ${n} ${n === 1 ? 'shard' : 'shards'}. ` +
          'It went back to sleep, and the lost shards sank into the dark. The world is safe. The End!';
      }
      return '{player}, {team} and all their friends held back the giant Necrozma together until it sank back to sleep. ' +
        'It wasn\'t easy, but everyone got home safe. The End!';
    },
    scenes: {
      down: {
        bg: 'depths',
        cast: ['wren', 'quill', 'sable'],
        panels: (s) => [
          { who: 'narrator', cast: [], text: 'The tunnel goes down, and down, and down. The walls are covered in glowing purple crystals.' },
          { who: 'wren', text: 'Not far now. Stay close. The path gets narrow here.' },
          { who: 'sable', text: 'Look at the crystals! They glow brighter when you walk past, {player}.' },
          heldShards(s).length
            ? { who: 'narrator', cast: [], text: (st) => `In your bag, your ${heldShards(st).length === 1 ? 'shard hums' : `${heldShards(st).length} shards hum`}, like they know they are going home.` }
            : { who: 'narrator', cast: [], text: 'You have no shards with you. But you have {team}. That is plenty.' },
          ...(s.flags.bond
            ? [{ who: 'narrator', cast: [], mon: 'player', text: '{mon} walks right beside you. It isn\'t scared at all. It never is, when you\'re together.' }]
            : []),
          { who: 'narrator', cast: [], text: 'Then you hear footsteps behind you. Someone is running down the tunnel!' },
        ],
        next: 'friends',
      },

      friends: {
        bg: 'depths',
        cast: ['rival'],
        panels: (s) => [
          ({
            confident: { who: 'rival', text: 'Did you think I\'d miss the biggest battle ever? Move over, {player}.' },
            kind: { who: 'rival', text: 'You were nice to me on our very first day. So… I\'m here to help. Don\'t make it weird.' },
            taunt: { who: 'rival', text: 'Somebody has to come and save you. Kidding! …Mostly. Let\'s do this together.' },
          })[s.flags.tone] || { who: 'rival', text: 'I heard the ground shaking all the way from the road. I knew you\'d be here.' },
          ...(s.flags.teamup === 'together'
            ? [{ who: 'rival', text: 'We made a great team at Spark Town. Let\'s do it one more time!' }]
            : []),
          { who: 'rival', mon: 'rival', text: 'Me and {rivalMon} will keep the Veil Grunts busy. You go get their boss.' },
          ...(tobiHere(s)
            ? [
              { who: 'youngster', cast: ['rival', 'youngster'], text: 'Wait for me! Hey, {player}! You still owe me a rematch, remember?' },
              { who: 'youngster', cast: ['rival', 'youngster'], text: 'So you\'d better win today! Me and my Rattata will help {rival} with the grunts.' },
            ]
            : []),
          { who: 'quill', cast: ['quill', 'sable', 'wren'], text: 'Look at all of us. The Veil doesn\'t stand a chance!' },
        ],
        prompt: {
          kind: 'choice',
          question: 'Before the big cave, what do you do?',
          options: [
            {
              text: 'Ask Wren about Nox\'s team',
              set: { 'ch10:plan': 'tips' },
              after: [
                { who: 'wren', cast: ['wren'], text: 'His Pokémon are strong, but slow to get going. Hit them fast, before they warm up!' },
                { who: 'narrator', cast: [], text: 'Now you know what to expect. Master Nox\'s team will be a bit slower.' },
              ],
              next: 'chamber',
            },
            {
              text: 'Share out everyone\'s Potions',
              set: { 'ch10:plan': 'potions' },
              give: { potion: 3 },
              after: [
                { who: 'quill', cast: ['quill', 'sable'], text: 'Good idea! Here, take ours. We won\'t be battling.' },
                { who: 'narrator', cast: [], text: 'You got 3 Potions!' },
              ],
              next: 'chamber',
            },
            {
              text: 'Give {team} a big pep talk',
              set: { 'ch10:plan': 'cheer' },
              after: [
                { who: 'narrator', cast: [], text: 'You kneel down with {team}. "We\'ve come so far. Whatever happens, I\'m proud of you."' },
                { who: 'narrator', cast: [], mon: 'player', text: '{mon} cheers, and the whole team cheers with it. Nobody is scared now!' },
              ],
              next: 'chamber',
            },
          ],
        },
      },

      chamber: {
        bg: 'depths',
        cast: ['leader'],
        panels: (s) => {
          const left = veilHeld(s);
          return [
            { who: 'narrator', cast: [], text: 'The tunnel opens into a giant cave. In the middle is a huge crystal, as big as a house.' },
            { who: 'narrator', cast: [], mon: NECROZMA, text: 'Inside the crystal, something dark is curled up, asleep. Its eyes flicker purple. Necrozma!' },
            { who: 'narrator', text: 'And in front of it stands Master Nox.' },
            left.length
              ? { who: 'leader', text: `You came. Good. Watch as I give the giant its ${left.length === 1 ? 'shard' : 'shards'}, and it wakes up for ME!` }
              : { who: 'leader', text: 'You came. Good. I have no shards, but I don\'t need them. My voice alone will wake it!' },
            ({
              brave: { who: 'leader', text: 'Your little Pokémon growled at me. Nobody growls at Master Nox!' },
              kind: { who: 'leader', text: 'Your friend Sable says people and Pokémon are strong together. Let\'s test that.' },
            })[s.flags['ch9:word']] || { who: 'leader', text: 'You said nothing to me before. Say nothing now, and step aside.' },
          ];
        },
        prompt: {
          kind: 'choice',
          speak: true,
          options: [
            {
              text: 'Never! Let\'s battle!',
              after: [{ who: 'leader', text: 'Then you will lose everything!' }],
              next: 'nox',
            },
            {
              text: 'Leave the giant alone!',
              after: [{ who: 'leader', text: 'Leave it asleep? When it could be MINE? Never!' }],
              next: 'nox',
            },
          ],
        },
      },

      nox: {
        bg: 'depths',
        cast: ['leader'],
        panels: (s) => (s.flags['ch9:word'] === 'brave'
          ? [{ who: 'narrator', mon: 'player', text: '{mon} growls again. Master Nox flinches. He\'s still a bit shaken from last time!' }]
          : []),
        prompt: {
          kind: 'battle',
          trainer: 'leader',
          team: NOX_TEAM,
          shardBoss: true, // a win gives 2 levels
          ai: 'trainer',
          foeMods: (s) => {
            const mods = {};
            if (s.flags['ch10:plan'] === 'tips') mods.speed = -1;
            if (s.flags['ch9:word'] === 'brave') mods.accuracy = -1;
            return mods;
          },
          win: 'afterNox',
          lose: 'afterNox',
        },
      },

      afterNox: {
        bg: 'depths',
        cast: ['leader'],
        panels: (s) => {
          const left = veilHeld(s);
          return [
            ...(noxBeaten(s)
              ? [
                { who: 'leader', text: 'No… Beaten? By a child and a bunch of Pokémon?' },
                { who: 'narrator', text: 'Master Nox falls to his knees.' },
              ]
              : [
                { who: 'leader', text: 'Ha! As I said. Now step aside!' },
                { who: 'narrator', cast: ['leader', 'rival'], text: '{rival} runs in and grabs Nox\'s arm. "Not so fast!"' },
              ]),
            left.length
              ? { who: 'narrator', cast: [], text: `But it\'s too late! ${left.length === 1 ? 'His shard flies' : 'His shards fly'} out of his robe and into the big crystal!` }
              : { who: 'narrator', cast: [], text: 'But the noise of the battle is too loud. The big crystal starts to crack!' },
            { who: 'narrator', cast: [], text: 'CRACK! The crystal breaks open. Bright light fills the whole cave.' },
            { who: 'narrator', cast: ['wren', 'leader'], text: 'Wren and her Murkrow block the tunnel, so Nox can\'t run away. "You\'re not going anywhere."' },
          ];
        },
        next: 'wake',
      },

      wake: {
        bg: 'depths',
        cast: [],
        panels: (s) => [
          { who: 'narrator', mon: NECROZMA, text: 'Necrozma rises up out of the broken crystal. It is huge and dark and sparkly, like the night sky.' },
          { who: 'narrator', mon: NECROZMA, text: 'Its eyes glow purple. It is not angry. It is confused, and a bit scared. It has been asleep for so long.' },
          { who: 'sable', cast: ['sable', 'quill'], text: 'It doesn\'t know where it is! It might lash out. {player}, you\'re the only one who can reach it!' },
          { who: 'quill', cast: ['sable', 'quill'], text: 'We\'ll shine our lamps to guide it. You and {team} keep it busy!' },
          { who: 'rival', cast: ['rival'], text: 'I\'ll be right here, {player}. Don\'t you dare give up.' },
          ...(tobiHere(s)
            ? [{ who: 'youngster', cast: ['youngster'], text: 'Go, go, go, {player}! You\'re the best trainer I know. After me!' }]
            : []),
          ({
            friend: { who: 'wren', cast: ['wren'], text: 'You said I\'m on the team. So I\'m cheering for my team! You can do it!' },
            why: { who: 'wren', cast: ['wren'], text: 'This is how you really help Pokémon. Go and show it, {player}!' },
          })[s.flags.wren] || { who: 'wren', cast: ['wren'], text: 'I believe in you, {player}. Go on!' },
          ...(s.flags['ch9:ask'] === 'calm'
            ? [{ who: 'narrator', cast: [], text: 'You remember what Professor Sable said: stay calm and brave, together.' }]
            : []),
        ],
        next: 'shine',
      },

      // The shards light up one by one. The engine applies each held shard's power in the boss battle.
      shine: {
        bg: 'depths',
        cast: [],
        panels: (s) => {
          const held = heldShards(s);
          if (!held.length) {
            return [
              { who: 'narrator', text: 'You don\'t have any shards. But that\'s okay.' },
              { who: 'narrator', mon: 'player', text: 'You have {team}, and friends all around you. That is its own kind of power!' },
            ];
          }
          return [
            { who: 'narrator', text: 'Your bag starts to glow. The shards are waking up!' },
            ...held.map((k) => ({ who: 'narrator', text: SHARD_GLOW[k] })),
            allShards(s)
              ? { who: 'narrator', text: 'All seven shards float up and spin around you in a circle of light. They\'re trying to join together!' }
              : { who: 'narrator', text: (st) => `${heldShards(st).length === 1 ? 'One shard glows' : `${heldShards(st).length} shards glow`} around you. ${heldShards(st).length === 1 ? 'It is' : 'Every one of them is'} on your side!` },
            ...(s.flags.peeked
              ? [{ who: 'narrator', mon: 'player', text: '{mon}\'s eyes flash purple. It can hear the shards singing. It isn\'t scared. It feels ready.' }]
              : []),
          ];
        },
        next: 'giant',
      },

      giant: {
        bg: 'depths',
        cast: [],
        panels: [{ who: 'narrator', mon: NECROZMA, text: 'Necrozma lets out a huge cry that shakes the whole cave. Here it comes!' }],
        prompt: {
          kind: 'battle',
          foe: NECROZMA,
          // Tuned with the balance sim (see "Balance notes" in STORY_PLAN.md). Each retry makes it
          // easier: your friends' lights lower its accuracy by 1 (at most -3).
          level: lvPlus(GIANT_LV),
          foeMoveLevel: GIANT_MOVE_LEVEL,
          ai: 'trainer',
          boss: true,
          foeMods: (s) => ({
            ...(s.flags['ch10:plan'] === 'cheer' ? { attack: -1 } : {}),
            accuracy: -Math.min(3, s.flags['ch10:retries'] || 0),
          }),
          win: 'ultra',
          lose: 'retry',
        },
      },

      // Necrozma drinks in all the light and turns into Ultra Necrozma. Your starter answers by
      // evolving one last time, and the two of them finish it alone.
      ultra: {
        bg: 'depths',
        cast: [],
        panels: [
          { who: 'narrator', mon: NECROZMA, text: 'Necrozma falls down. Everyone cheers! But wait… something is wrong.' },
          { who: 'narrator', mon: NECROZMA, text: 'Necrozma starts to pull in all the light in the cave. The lamps go dim. It gets brighter and brighter!' },
          { who: 'narrator', mon: ULTRA, text: 'FLASH! Necrozma turns into Ultra Necrozma! It shines like a golden star!' },
          { who: 'sable', cast: ['sable', 'quill'], text: 'Ultra Necrozma! I only ever read about it in old books!' },
          { who: 'narrator', mon: 'lead', text: 'Your team is so tired. They can\'t fight any more. Only {mon} steps forward.' },
          { who: 'narrator', mon: 'player', text: '{mon} looks back at you. You nod. The light of the shards wraps around {mon}!' },
        ],
        // The biggest moment of the story: the starter evolves one last time (saves from before
        // this scene existed did it in `shine`).
        evolve: (s) => (s.flags['evolve:ch10:shine'] ? [] : [s.mon]),
        next: 'final',
      },

      final: {
        bg: 'depths',
        cast: [],
        panels: [
          { who: 'narrator', mon: 'player', text: 'It\'s just you and {mon} now. Everyone you know is cheering behind you.' },
          { who: 'rival', cast: ['rival'], text: 'This is it, {player}! Show it what you two can do!' },
        ],
        prompt: {
          kind: 'battle',
          foe: ULTRA,
          name: 'Ultra Necrozma',
          // Not a serious fight: a victory lap for the freshly evolved starter. It fights alone, is
          // boosted a lot, and Ultra Necrozma is far below its level, so it goes down in a hit or two.
          // `hero` is a safety net: the starter can't faint even on an unlucky crit.
          solo: true,
          hero: true,
          boss: true,
          level: (s) => Math.max(2, s.mon.level - 6),
          allyMods: { attack: 3, 'special-attack': 3, speed: 3, defense: 2, 'special-defense': 2 },
          ai: 'trainer',
          win: 'ending',
          lose: 'ending',
        },
      },

      // Losing to Necrozma: try again (fully healed, and fired up by the comeback boost), or let
      // everyone help (the gentle loss ending). Tide Potions only come on the first try.
      retry: {
        bg: 'depths',
        cast: ['rival', 'quill'],
        panels: [
          { who: 'narrator', mon: NECROZMA, text: 'Necrozma is still glowing. But it is tired too. It is breathing slowly.' },
          { who: 'quill', text: 'Quick, let\'s heal your team! {player}, do you want to try again? Or should we all help you?' },
        ],
        prompt: {
          kind: 'choice',
          speak: true,
          options: [
            {
              text: 'Try again!',
              next: 'giant',
              set: (s) => ({ 'ch10:retries': (s.flags['ch10:retries'] || 0) + 1 }),
              after: (s) => [(s.flags['ch10:retries'] || 0) <= 3
                ? { who: 'quill', cast: ['quill', 'sable'], text: 'Your friends shine their lights at Necrozma! It\'s harder for it to aim now.' }
                : { who: 'quill', cast: ['quill', 'sable'], text: 'Our lights are as bright as they can be! You can do it!' }],
            },
            { text: 'Let your friends help', next: 'ending' },
          ],
        },
      },

      ending: {
        bg: 'depths',
        cast: [],
        panels: (s) => {
          const fade = s.flags['ch10:final'] === 'win'
            ? [{ who: 'narrator', mon: ULTRA, text: 'Ultra Necrozma lets out one last cry. Its golden light fades away…' }]
            : [];
          if (giantResult(s) === 'win' && allShards(s)) {
            return [...fade,
              { who: 'narrator', mon: NECROZMA, text: 'Necrozma stops. It looks at you. It looks at the seven shards, spinning in the air.' },
              { who: 'narrator', text: 'Click, click, click! The shards join up, one by one, into a single shining crystal!' },
              { who: 'narrator', mon: NECROZMA, text: 'The crystal floats over to Necrozma. It glows warm and bright, like sunshine.' },
              { who: 'narrator', mon: NECROZMA, text: 'The purple fades from its eyes. It isn\'t scared any more. It makes a soft, happy sound, like a bell.' },
              { who: 'narrator', mon: NECROZMA, text: 'Then Necrozma lowers its big head, and gently touches your hand. It\'s saying thank you.' },
              { who: 'sable', cast: ['sable'], text: 'In all my years… It trusts you, {player}. You\'ve made a friend of a legend!' },
            ];
          }
          if (giantResult(s) === 'win') {
            return [...fade,
              { who: 'narrator', mon: NECROZMA, text: 'Necrozma slows down. It looks tired. Its purple eyes blink slowly.' },
              { who: 'narrator', mon: NECROZMA, text: 'It curls up, and new crystal grows around it like a warm blanket. It\'s going back to sleep.' },
              { who: 'narrator', text: (st) => `The ${veilHeld(st).length === 1 ? 'missing shard sinks' : 'missing shards sink'} deep into the rock, where nobody can ever find ${veilHeld(st).length === 1 ? 'it' : 'them'} again.` },
              { who: 'sable', cast: ['sable'], text: 'You did it, {player}. It\'s safe, and so is everyone else. Let it sleep now.' },
            ];
          }
          return [
            { who: 'narrator', mon: NECROZMA, text: 'Necrozma is so strong! Your team is tired out. But nobody runs away.' },
            { who: 'narrator', cast: ['rival', 'wren'], text: '{rival} and Wren jump in with their Pokémon. Quill and Sable shine their lamps. Everyone holds it back, together!' },
            { who: 'narrator', mon: NECROZMA, text: 'Slowly, Necrozma gets sleepy. It yawns a huge yawn, and sinks back down into the crystal.' },
            { who: 'narrator', mon: 'player', text: '{mon} gives you a tired smile. You didn\'t beat it, but you kept everyone safe. That\'s what matters.' },
          ];
        },
        next: 'home',
      },

      home: {
        bg: 'town',
        cast: ['mom'],
        panels: (s) => [
          { who: 'narrator', cast: [], text: 'The Veil is finished. Master Nox is taken away by the police, still grumbling.' },
          { who: 'narrator', cast: [], text: 'A few days later, you walk back into Pallet Town. It feels like forever since you left.' },
          { who: 'mom', text: '{player}! You\'re home! Look at you, and look at all your Pokémon!' },
          { who: 'oak', cast: ['oak'], text: 'I\'ve heard all about it, {player}. Quill says you\'re the bravest trainer she has ever met.' },
        ],
        next: 'goodbyes',
      },

      goodbyes: {
        bg: 'town',
        cast: ['quill', 'sable'],
        panels: (s) => [
          { who: 'narrator', cast: [], text: 'The next day, all your friends come to Pallet Town to say goodbye.' },
          { who: 'quill', cast: ['quill', 'sable'], text: 'Sable and I are going to study the mountain together. Come and visit us any time!' },
          ({
            friend: { who: 'wren', cast: ['wren'], text: 'I\'m going to travel and help Pokémon. The right way, this time. See you around, teammate!' },
          })[s.flags.wren] || { who: 'wren', cast: ['wren'], text: 'I\'m going to travel and help Pokémon. The right way, this time. See you around, {player}!' },
          { who: 'rival', cast: ['rival'], text: 'Don\'t get too comfy, {player}. Next time, I\'m winning. Smell ya later!' },
          ...(tobiHere(s)
            ? [{ who: 'youngster', cast: ['youngster'], text: 'And don\'t forget: you still owe me that rematch!' }]
            : []),
          ...(giantResult(s) === 'win' && allShards(s)
            ? [
              { who: 'narrator', cast: [], mon: NECROZMA, text: 'That night, the sky over Pallet Town fills with gentle rainbow light.' },
              { who: 'narrator', cast: [], mon: NECROZMA, text: 'Necrozma floats down into your garden to say hello. It comes back to visit every full moon.' },
            ]
            : [{ who: 'narrator', cast: [], text: 'That night, far to the north, deep under the mountain, a giant Pokémon sleeps peacefully.' }]),
        ],
        next: 'last',
      },

      last: {
        bg: 'bedroom',
        cast: ['player'],
        panels: [
          { who: 'narrator', mon: 'player', text: '{mon} climbs onto your bed, just like the very first night. {team} squeeze in too. It\'s a bit crowded.' },
          { who: 'narrator', cast: [], text: 'Your adventure is over. But there are so many more Pokémon out there to meet.' },
          { who: 'narrator', cast: [], text: 'The End. Thank you for playing!' },
        ],
        prompt: { kind: 'end', final: true },
      },
    },
  };

  window.STORY_CHAPTERS = [chapter1, chapter2, chapter3, chapter4, chapter5, chapter6, chapter7, chapter8, chapter9, chapter10];
})();
