# Bridgehold design brief

## The genre, and what we keep

The mobile "can you last 60 seconds?" ads sell a hybrid-casual crowd runner: a lane, a
squad that fires by itself, gates that grow or shrink it, hordes with their HP printed on
them, and a boss with a number so big you want to watch it drain. That loop is genuinely
fun. What makes the real apps miserable is everything bolted on to monetise it: a
progression wall tuned so that around level 20 you either grind, watch ads, or pay;
rewarded-ad revives; gacha chests; idle timers; and, often, a bait-and-switch where the
ad's mini-game is a sliver of a base-building strategy app.

Bridgehold keeps the loop and drops the rest.

## Rules we hold ourselves to

1. **No wall.** Upgrade costs, coins per kill, the walker's reward and the clear bonus
   all ride the same ×1.35 curve, so income never falls behind the price list. A cleared
   level must always pay for at least two upgrades at that level, out to level 20
   (asserted in `tests/balance.test.js`). The first draft had linear income against
   geometric costs and the test failed at level 8: exactly the wall the genre sells
   its way past. Husk health grows a little slower, ×1.32, so a patient player gains
   ground and a skilled one outruns the camp on gate play.
2. **Losing pays.** A broken line keeps every coin the run earned. The only thing a loss
   costs is the clear bonus.
3. **Unlocks are milestones.** Piercing rounds after level 3, frag rounds after level 6.
   A maxed camp with no clears has neither (asserted).
4. **No interruption points.** No revive prompt, no double-coins prompt, no chest to
   open. The end screen has two buttons: Camp, Deploy.
5. **Numbers are honest.** The red number over a pack is exactly how many soldiers it
   will cost. The walker's number is exactly its remaining health.

## The run

- 60 seconds. Packs every 2.4 seconds at the start, tightening to 1.3 seconds.
- Gates every 5 seconds. Rolls: 42% add (+2 to +6), 38% subtract (−2 to −8), 9% ×2,
  3% ×3, 8% weapon from level 2. A multiplier never adds more than 80 soldiers, so it
  is a true ×2 or ×3 for a small squad and a large flat gain for a big one; the squad
  caps at 200.
- Husk packs of 6 to 44, growing with level, the first one arriving after 2.6 seconds.
  A husk reaching the line takes one soldier.
- The walker: 12,000 HP at level 1, ×1.35 per level, descends at 21 px/s and takes about
  25 seconds to reach the line. A forty-soldier squad with no camp kills it with ten
  seconds to spare; a hundred and twenty watch the number fall for five. At the line it crushes 6% of the squad every 0.3 s.
- Damage per volley is `damage × squad`, split over at most twelve tracers, so a
  two-hundred-soldier squad is not two hundred sprites and two hundred bullets.

## Tuning sheet

| Level | Husk HP at 0 s | Walker HP | Clear bonus | Coins per kill |
| --- | --- | --- | --- | --- |
| 1 | 14 | 12,000 | 60 | 1 |
| 2 | 18 | 16,200 | 81 | 2 |
| 3 | 24 | 21,870 | 109 | 2 |
| 5 | 43 | 39,858 | 199 | 4 |
| 8 | 98 | 98,066 | 490 | 9 |
| 12 | 297 | 325,726 | 1,629 | 28 |

Base squad DPS before upgrades is 100. These are first guesses; the tests pin the shape
of the curve, and play will move the constants.

## Pass 2, shipped

- **Sound.** Procedural WebAudio in `src/audio.js`: tracer ticks, a ping per gate hit
  pitched to the gate's value, a two-note chime for a good gate, a thud for a bad one, a
  crack per walker hit, a shatter and a four-note arpeggio when the line holds. Every
  cue is throttled so a volley does not become a buzz.
- **Walker feedback.** Cracks spread across the ice at every ten percent of health
  lost, chips fly per hit, and the number bounces on each volley.
- **Runners and brutes.** Runners from level 2, brutes from level 3, both as multipliers
  of the husk baseline in `ENEMIES`. A brute parks at the line and chews one soldier a
  second, so it is the first enemy that punishes ignoring it rather than touching it.
- **Weapon gates.** From level 2, a weapon gate replaces the ×3 roll about seven percent
  of the time. Shotgun: three pellets, 1.7× rifle DPS if every pellet lands, useless at
  range. Rail: 1.16× rifle single-target, pierces everything. A test pins both ratios so
  neither becomes a free upgrade.
- **Level select.** The home screen shows every open level with its best squad. Only
  clearing the frontier opens the next level; replaying old ones still pays.
- **Settings.** Sound and reduced motion, saved with the game. Tap the clock to pause.

## Pass 3, shipped: the look

- **Rendered sprites.** Soldiers, husks, runners, brutes, the walker, a muzzle flash
  and a rail lamp, all built from primitives in `tools/blender/build_sprites.py` and
  rendered with Cycles under one night rig. Two walk frames per figure. The runtime
  scales each family by its own pixels-per-unit so the walker stays monumental.
- **The bridge.** A painted sky with a moon, two rows of drowned towers with lit
  windows, water on both sides, an asphalt grain that scrolls, lamp posts every
  hundred and sixty pixels with warm pools on the deck, a vignette over everything.
- **Gates as glass.** A lit top edge, a floor glow that brightens as the gate nears
  the line, chevrons for direction, and a flash on every step.
- **Bullets pass through gates.** The first draft let gates swallow bullets, and because
  a gate spans the lane, every pack above it was shielded for most of the run. Bullets
  now pass through and pay their damage into the gate. A step costs 0.35 seconds of the
  squad's own fire, so a -8 takes about three seconds on its half at any squad size and
  a gate cannot be driven from -8 to +14 inside its descent. The first version of this
  charged husk health per step, and a hundred-soldier squad maxed every gate on sight
  and hit the cap by level 3. Tested.
- **Crossing a gate.** The half you cross flashes white, swells and dissolves into glass
  shards in its colour while the other half drops away; nothing scrolls on past the
  squad. The bonus lands large at the line with a caption that says what it did, and
  the count tag pulses as it lands.
- **HUD.** A clock in a pill with a progress ring, level and coin pills, a weapon badge,
  an opening "HOLD THE LINE" card, and walker damage tallies four times a second.
- **Home and end screens.** A hero with the rendered key art, rank pips on every
  upgrade, unlock rows with an earned mark, a sticky Deploy that names the level, and
  tallies that count up on the result screen. Reduced motion turns all of it off.

## What comes next

- **A shield husk** that only pierce or frag hurts efficiently, so the unlocks change
  how a pack is read rather than only adding damage.
- **A daily seed.** Same gate rolls for everyone that day, a local best to beat. Social
  without a server.
- **The curve past level 8.** Headless bots now clear levels 1 and 3 with a fair margin;
  the same bots should be run every few levels out to 12 once the enemy roster grows.
- **Left-handed layout** and a settings sheet once there are more than two toggles.
