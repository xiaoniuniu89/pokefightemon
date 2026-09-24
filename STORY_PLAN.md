# Story mode plan: 10 chapters

Plan for finishing story mode. Build it over several sessions, one step per session
(see [Build order](#build-order)). Tick steps off here as they land, and update
`CLAUDE.md` when the engine changes.

All story text is for 7-12 year olds: short sentences, everyday words, plain type tips
("Water beats Fire"). See the Conventions section in `CLAUDE.md`.

## The big idea

- **7 shards** fell from the mountain. Each one is a coloured crystal with a bit of power.
- **The Veil** (the bad guys, marked with a closed eye) want all 7 shards, so they can
  wake the giant Pokémon sleeping under the mountains and control it.
- **You and Dr. Quill** race to find the shards first. Most chapters are **one shard
  mission**.
- **Every shard you hold makes the final battle easier.** You can win with none, but
  it's hard. You get a special ending if you hold all 7.
- By the end you have a **team of 4-6 Pokémon** and can **switch** between them in battle.

## Where the story is now (chapters 1-3)

| Ch | Title | Battles | New Pokémon | Ends with |
|----|-------|---------|-------------|-----------|
| 1 | A World of Pokémon | Rival (Lv 5, basic moves only) | Starter (Bulbasaur, Charmander or Squirtle) | Rival leaves, you get the Pokédex |
| 2 | Special Delivery | Wild in grass (optional), Youngster Tobi (optional), wild ambush in Whisperwood | Maybe 1 (catches aren't used for anything yet) | Case delivered to Quill, 5 Poké Balls |
| 3 | Mist on Glimmer Lake | Wild catch (repeats until you catch one), the Stranger's Poochyena | 1 catch (shore, woods or hill) | Shard saved (win) or stolen (lose), THE VEIL REMEMBERS card, head north |

**Team after chapter 3:** starter (about Lv 7-9) plus 1 caught Pokémon. Since steps 1-3
the caught Pokémon battles, switches and levels up too.

**Shard count after chapter 3:** 7 in total. The Veil already had 1 (the Shadow Shard).
The Glimmer Shard is either yours (`ch3:duel` = win) or theirs. 5 are still hidden.

**Story threads to pick up later:**

| Flag / thread | Set in | Use later |
|---------------|--------|-----------|
| `fence: 'declined'` | ch2 | Tobi said "you owe me a rematch", so he turns up and battles you |
| `tone` (confident / kind / taunt) | ch1 | How the rival treats you when he comes back |
| `deal` (eager / curious / bargain) | ch2 | Barlow comes back, and his reward depends on this |
| `peeked` | ch2 | The shards react to you (your starter's eyes flash purple) |
| `bond` | ch2 | Your starter trusts you, e.g. it won't get scared in the final battle |
| `told: 'lie'` | ch2 | Quill trusts you a little less at first |
| `vow` (in / own / wary) | ch3 | How chapter 4 opens |
| Quill's missing teacher | ch3 | Rescued in chapter 9 |
| "Something under the mountain opens its eyes" | ch3 | The final boss in chapter 10 |
| The Stranger | ch3 | Keeps coming back, starts to doubt the Veil, and helps you in chapter 9 |

## Engine work needed

### 0. Choices under the text, side by side

Right now dialogue choices sit in one column to the **right** of the text on wide screens,
and stack in one column **under** it on phones. With 3 long options (plus the move menu,
which will soon grow a Team button) the player can end up scrolling to see every answer.

- Always put choices **under** the dialogue text, like the battle move menu already does
  (`.choices-moves` in `styles.css`).
- Lay them out **side by side** in a row: up to 3 across on wide screens, and 2 across on
  phones with the 3rd one taking the full width. Never one tall column.
- Keep the buttons big enough for small fingers (at least 44px tall). Long option text
  wraps inside its button instead of making the button wider.
- The whole console (text and choices) must fit on screen without scrolling at phone
  width (360px) and on a laptop (1280×720). Check this with the longest option texts in
  chapters 1-3.
- Picture choices (looks, starters: `.choices-cards`) and the name form stay as they are.

### 1. Team (party) model

Right now `s.mon` is the starter, `s.party` holds catches, and only `s.mon` battles.

- Keep `s.mon` as the starter (all `{mon}` text still means the starter). Add
  `s.order`: the team order, as indexes into `[s.mon, ...s.party]`. The first one leads
  in battle.
- **Team limit is 6** (starter + 5). With a full team, throwing a Poké Ball says "Your
  team is full!" and doesn't use up the ball. Chapters just stop offering catches once
  the team is full, so we never need a PC box.
- **Everyone levels up:** each Pokémon that battled and didn't faint goes up a level
  when you win. At the start of each chapter, any Pokémon more than 3 levels below the
  starter catches up ("{caught} trained hard at camp!"). This way no one gets left behind.
- **Level cap per chapter** (`levelCap` on each chapter, added in step 12): a Pokémon at
  or above it doesn't level from a win ("Ember is as strong as it can be for now!",
  once per battle), and catch-up never trains past it. Nothing is lowered, so old saves
  above it keep their levels. It only stops grinding in repeat-until-caught loops.
- Old saves: `revive` fills in `s.order` from what's already there, so saves from
  chapters 1-3 still load.
- **Team screen** in the in-game menu: shows each Pokémon's sprite, name, level and
  types. You can change which one leads and rename them.
- Placeholders: add `{team}` (for example "Ember, Sparky and Rocky") and `{lead}`.

### 2. Switching in battle

- The move menu gets a **Team** button next to Bag and Run, so the bottom row is Bag,
  Team, Run. The Team menu shows each Pokémon with its HP bar and greys out fainted ones.
- **Switching uses your turn.** The foe's attack hits the Pokémon that comes in.
- **When your Pokémon faints**, you pick who goes next. That switch is free. You only
  lose when every Pokémon has fainted. With one Pokémon, nothing changes from now.
- HP stays the same for each Pokémon until the battle ends. Stat changes reset when a
  Pokémon switches out, like in the games. Everyone is fully healed after each battle
  (it's kinder for kids, and it's how things work now).
- Build combatants on first switch-in (they're `combatant(...)` calls that fetch data),
  and show a loading line if the fetch is slow.
- Pokéball icons on the HUD show how many Pokémon each side has left.
- Last stand still happens once per chapter. It works on whichever Pokémon is out.
- Comeback (+1 Atk/Sp. Atk after a loss) goes to the first Pokémon sent out.

### 3. Trainers with more than one Pokémon

- New battle prompt field `team: [{ id, level }]`, or a function of `s`, for trainers.
  (`foe` already means "pick one of these at random", so it keeps that meaning.)
- A trainer sends out their next Pokémon when one faints: "Stranger sent out Murkrow!"
  The foe AI doesn't switch.
- `foeMods` applies to every foe Pokémon.
- Suggested team sizes: 2 from chapter 4, 3 from chapter 6, 4 for the chapter 10 boss.

### 4. Shards

- `s.shards`: a list of shard keys you hold, like `['glimmer', 'stone']`. When an old
  save loads, `ch3:duel === 'win'` adds `glimmer`.
- Scenes can give and take shards (`shard: 'stone'` on a scene, or a `take` field). The
  bag or menu shows your shards as coloured crystals.
- Placeholder `{shards}` gives the number you hold.
- **Shard powers** only work in the final battle. Each shard gives one boost to your
  whole team or the boss, using stat stages the engine already has:

| Shard | Colour | Found in | Final-battle power |
|-------|--------|----------|--------------------|
| Glimmer | Purple | Ch 3 | Boss accuracy -1 |
| Stone | Brown | Ch 4 | Your team: Defense +1 |
| Frost | Blue | Ch 5 | Boss Speed -1 |
| Tide | Teal | Ch 6 | +2 Potions before the battle |
| Spark | Yellow | Ch 7 | Your team: Speed +1 |
| Ember | Red | Ch 8 | Your team: Attack and Sp. Atk +1 |
| Shadow | Black | Ch 9 (won back from the Veil) | Boss Attack and Sp. Atk -1 |

- **All 7:** the shards join up into one crystal, the giant calms down, and you get the
  special ending (see chapter 10).
- **Tuning rule:** the final boss must be beatable with 0 shards and an average team.
  Last stand is a safety net.

## Chapter outline (4-10)

Each chapter is about 12-14 scenes, like chapters 1-3. Each has 2-4 battles, at least
one choice that changes something later, and one clear goal that a kid could explain.
Where a chapter has a catch, the wild Pokémon pool follows the balance rule: never all
super effective against one starter type.

The standard shard mission goes: arrive, meet someone who needs help, explore, catch a
new Pokémon, find the shard, then battle a Veil member for it. **Win and you keep the
shard. Lose and the Veil takes it** (the same as chapter 3). Chapter 9 gives you a
chance to win lost shards back.

### Ch 4: Stonebrook Caves (Stone Shard)
- Opens differently depending on `vow`. You and Quill head north to the mining village
  of Stonebrook.
- **Teaches switching:** Quill explains that two Pokémon are better than one. Your
  caught Pokémon from chapter 3 battles for the first time. This is the first battle
  where you can switch Pokémon.
- The caves have Zubat, Geodude, Paras and Onix. **Catch #3** (team of 3).
- Tobi rematch if `fence: 'declined'`. Otherwise Tobi just waves.
- Boss: Veil Grunt with 2 Pokémon (first trainer with a team). The prize is the Stone Shard.

### Ch 5: Frost Peak (Frost Shard)
- A snowy mountain path. A lost Pokémon (Snorunt or Swinub) needs help getting home.
  Help it and you can catch it later.
- **Catch #4** (team of 4).
- The rival comes back with 2 Pokémon. What he says depends on `tone`. A friendly battle.
- Boss: the Stranger again. She wins or loses the shard, and starts to doubt the Veil
  ("They told me the shards would help Pokémon…").

### Ch 6: Tidewater Cove (Tide Shard)
- A seaside village. Old Hollis and Barlow come back. Barlow's reward depends on `deal`.
- **Gift Pokémon #5**: Hollis gives you a Pokémon he rescued (e.g. Horsea or Shellder).
  So a kid who struggles to catch still gets to 5.
- A sea cave with tides: a choice about when to go in (wait or rush) changes the wild battle.
- Boss: Veil Admin with 3 Pokémon.

### Ch 7: Spark Town (Spark Shard)
- An old power plant that has stopped working because the Veil is draining it.
- **Catch #6** (team of 6, the most you can have). There's also a small puzzle choice
  (pick the right switches).
- A tag-team feel: the rival helps by battling a grunt himself in the story text, and
  you battle the other one.
- Boss: Veil Grunt duo, two battles back to back.

### Ch 8: Ember Mountain (Ember Shard)
- A volcano. Hot, with Fire-type wild Pokémon, but Quill gives a type tip.
- No new catch (the team is full). The focus is on training your team. The catch-up
  levelling helps here.
- Boss: Veil Admin with 3-4 Pokémon.
- Big clue: a letter from Quill's teacher, **Professor Sable**. The Veil is keeping her
  at their hideout.

### Ch 9: The Veil's Hideout (win back the Shadow Shard, plus any lost shards)
- Sneak into the hideout. The Stranger helps you in, and the choices you made about her
  pay off.
- Rescue Professor Sable. She explains the giant and why the shards matter.
- A few battles in a row. Each win takes back one shard the Veil is holding (the Shadow
  Shard, and any you lost in chapters 3-8). This is the "second chance" chapter.
- **The Stranger's name is revealed** just before you leave for the mountain. She takes
  off her hood, tells you her real name, and says she's on your side now. Pick a
  kid-friendly name when writing the chapter.
- Ends with the Veil leader running off into the mountain with whatever shards they still have.

### Ch 10: Beneath the Mountain (final boss)
- Everyone who helped you shows up: Quill, Sable, the rival, the Stranger, maybe Tobi.
  Who comes depends on your flags.
- Battle 1: **the Veil leader**, 4 Pokémon.
- Battle 2: **the giant**, a legendary with glowing purple eyes. Your shards light up
  one by one before it starts, and each shard's power is applied.
  The giant is **Necrozma** (the "Prism Pokémon", made of light and crystal, which fits
  the shards). It can't be caught.
- Endings:
  - **All 7 shards:** the crystal is whole, and Necrozma calms down. It becomes your
    friend and visits you in the ending, but it doesn't join your team.
  - **Fewer than 7, and you won:** the giant goes back to sleep, and the missing shards
    are lost under the mountain.
  - **Retry:** losing to Necrozma asks "Try again!" (back into the battle, fully healed,
    and the comeback boost fires up your first Pokémon) or "Let your friends help" (the
    loss ending below). Tide Potions only come on the first try; last stand stays used
    up for the chapter. Losing to Master Nox needs no retry: the rival grabs him and the
    story goes on to Necrozma either way.
  - **You lost:** your team and friends hold it back just long enough, and it sinks back
    to sleep. It's still a happy ending, but a quieter one. It's never a "game over"
    for kids.
- The end screen shows your team and your shard count.

## Build order

One step per session. Every step ends with `node --check story.js chapters.js`, a
playthrough of the changed parts in the browser, and an update to `CLAUDE.md`.

- [x] **0. Choice layout:** choices under the text, side by side, no scrolling (small
      CSS job, and a good warm-up. Do it first so later chapters are checked with it).
- [x] **1. Team model:** `s.order`, team limit, everyone levels, catch-up, loading old
      saves, Team screen in the menu, `{team}`/`{lead}`.
- [x] **2. Switching:** Team button, switching on faint, HP kept during a battle, HUD balls.
- [x] **3. Trainer teams:** `team` battle field and trainers sending out their next Pokémon.
      Could be done together with step 2 if it's going well.
- [x] **4. Shards:** `s.shards`, give/take in scenes, show them in the menu, turn
      `ch3:duel` into a shard, shard powers (used in ch 10).
- [x] **5. Chapter 4** (uses steps 1-4: teaches switching, first trainer with a team).
- [x] **6. Chapter 5**
- [x] **7. Chapter 6**
- [x] **8. Chapter 7**
- [x] **9. Chapter 8**
- [x] **10. Chapter 9**
- [x] **11. Chapter 10** plus shard powers in the final battle, endings, and the final end screen.
      Engine part done with step 4: `boss: true` (no Run or Poké Balls, shard powers applied),
      Tide Potions, and the `final: true` end screen with the team and shard crystals.
- [x] **12. Balance pass:** play through ch 1-10 and adjust levels so a 7-year-old can finish.
      Done by simulation plus a per-chapter `levelCap` (see [Balance notes](#balance-notes)).

Steps 5-12 pass `node --check`, a static scene check and a simulated playthrough of every
path, but are **not browser-tested** yet.

## Balance notes

Step 12 used a simulation (not part of the repo) that walks every chapter's scenes with
random choices and plays each battle with a faithful copy of the `story.js` rules and real
PokéAPI data. The simulated player is a naive kid: it picks the move with the highest power
(skipping "No effect"), uses a Potion below 30% HP, throws Poké Balls at a wanted wild
Pokémon once it's at 60% HP or less, and only switches when a Pokémon faints. 2000 runs
per starter. Targets: trainers 70%+, shard bosses 55-80%, Master Nox 50%+, Necrozma 40%+
with no shards and 85%+ with all 7.

**Win rates after tuning** (Bulbasaur / Charmander / Squirtle):

| Battle | Win % | Battle | Win % |
|--------|-------|--------|-------|
| ch3 Stranger (shard) | 96 / 82 / 88 | ch7 gate grunt | 100 / 100 / 100 |
| ch4 Veil Grunt (shard) | 83 / 84 / 97 | ch7 Grunt Dot | 100 / 100 / 99 |
| ch5 rival | 81 / 84 / 90 | ch7 Grunt Dash (shard) | 72 / 81 / 77 |
| ch5 Stranger (shard) | 57 / 86 / 61 | ch8 Admin Rook (shard) | 60 / 71 / 75 |
| ch6 Admin Rook (shard) | 67 / 81 / 69 | ch9 hideout rounds | 80 / 95 / 76 |
| ch10 Master Nox | 63 / 67 / 69 | | |

**Necrozma** (first try; the ending was retuned to be harder, and it has a retry):

| Shards held | 0 | 3 | 4 | 5 | 7 |
|-------------|---|---|---|---|---|
| Before | 55 / 65 / 64 | 96 / 95 / 97 | 99 / 99 / 99 | 100 | 100 |
| After | 2 / 3 / 2 | 15 / 16 / 20 | 21 / 28 / 35 | 34 / 43 / 48 | 66 / 77 / 80 |

With real shard counts (most players have all 7), 56 / 73 / 69% win on the first try and
63 / 80 / 79% win in the end with retries. The goal was about 30-40% with no shards and
50-60% with 3-4, but a single Necrozma can't get there: the seven shard powers together make
the battle about four times easier, so any Necrozma that is 70-80% with all 7 is almost
unbeatable with none. Players with few shards still get the gentle loss ending, and
very few players end with fewer than 5 shards. Options if that matters: make Necrozma a
little weaker for each missing shard, or make each retry easier (friends help more).

Before tuning: ch5 rival 29-40%, ch6 Rook 10% for Charmander, ch8 Rook 31-49%, Nox 12-44%
(then 77 / 98 / 78 after the first pass),
while ch3-4 bosses were 98-100%. Most players end with all 7 shards thanks to chapter 9.

**How levels grow:** a win only levels Pokémon that battled and didn't faint, so the
starter grows slower than first planned. Typical starter level at chapter start:
ch4 8, ch5 8-9, ch6 8-9, ch7 9-10, ch8 9-10, ch9 11-12, ch10 12-13 (players who win
almost everything reach about 16-18 by the end). Every foe scales off the starter, so this
is fine. Players who lose a lot aren't stuck: foes scale down with them, party members
catch up at camp, and the comeback boost and last stand help. There are no fixed-level
foes after Tobi's Lv 4 Rattata in chapter 2.

**Level caps** (`levelCap`): ch1 6, ch2 8, ch3 9, ch4 10, ch5 11, ch6 12, ch7 13, ch8 15,
ch9 17, ch10 19: about where a player who wins everything is. They used to be much higher
(ch8 26, ch10 32), which let one Pokémon that led every fight run far ahead of the team and
steamroll chapters 8-10 (playtest). Foes now also scale off the strongest Pokémon, not the
starter. With the strongest at the cap, no trainer foe goes above cap + 2, except Necrozma
(cap + 6). Not re-simulated after this change.

**Tuning knobs used:** `bossLv(d, nudge)` in `chapters.js` (starter level + d, plus a
small per-starter nudge where type matchups made one starter's battle much easier or
harder, capped at +2). Known leftovers: Squirtle's ch4 grunt stays easy (Water beats
Ground, and the +2 cap stops it going higher). In
ch3 the shore is all Water types, and in ch7 the generators and the roof are all Electric
types. Both are areas you pick, and a tip warns about them. The ch4 lesson Pokémon is
meant to be strong against your starter, so it teaches switching.

## Decisions

1. **The giant** is Necrozma.
2. **It can't be caught.** With all 7 shards it becomes a friend in the ending.
3. **Losing a shard battle** means the Veil takes that shard. Chapter 9 lets you win
   shards back.
4. **The Stranger's name** is revealed in chapter 9, before the final boss.

**After playtesting (not re-simulated):** starters now evolve in ch5 and ch10 and the rest of
the team in ch8, there are Super Potions, Revives and X Attacks, and balls are weaker
(`CATCH_BONUS` 0.6). Evolution makes chapters 6-10 easier than the win rates above; re-run
the sim with evolved species if those battles start feeling too easy.
