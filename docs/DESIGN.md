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
- Gates every 5 seconds. Rolls: 42% add (+2 to +6), 38% subtract (−2 to −8), 15% ×2,
  5% ×3. Every bullet that hits an add gate moves it +1; eight hits step a multiplier.
- Husk packs of 6 to 44, growing with level. A husk reaching the line takes one soldier.
- The walker: 6,000 HP at level 1, ×1.35 per level, descends at 21 px/s and takes about
  25 seconds to reach the line. At the line it crushes 6% of the squad every 0.3 s.
- Damage per volley is `damage × squad`, split over at most twelve tracers, so a
  two-hundred-soldier squad is not two hundred sprites and two hundred bullets.

## Tuning sheet

| Level | Husk HP at 0 s | Walker HP | Clear bonus | Coins per kill |
| --- | --- | --- | --- | --- |
| 1 | 18 | 6,000 | 60 | 1 |
| 2 | 24 | 8,100 | 81 | 2 |
| 3 | 31 | 10,935 | 109 | 2 |
| 5 | 55 | 19,929 | 199 | 4 |
| 8 | 126 | 49,033 | 490 | 9 |
| 12 | 382 | 162,863 | 1,629 | 28 |

Base squad DPS before upgrades is 100. These are first guesses; the tests pin the shape
of the curve, and play will move the constants.

## What comes next

- **Sound.** Tracer ticks, gate chimes, a low crack when the ice takes a hit.
- **Enemy variety.** A fast runner that takes one soldier and dies; a brute that stops
  at the line and chews; a shield husk that only pierce or frag can hurt efficiently.
- **Weapon gates.** Gates that swap the squad's weapon for the rest of the run: a shotgun
  spread for packs, a rail for the walker.
- **A level select** with a per-level best squad, so an old level is worth replaying.
- **A daily seed.** Same gate rolls for everyone that day, a local best to beat. Social
  without a server.
- **Pause and settings.** Mute, reduced motion, left-handed layout.
