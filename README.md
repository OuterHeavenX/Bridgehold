# Bridgehold

Hold the line for sixty seconds.

Bridgehold is a zero-build, Canvas 2D lane-runner: a squad crosses a night bridge, husk
packs pour down the lane, gates change the squad's size, and at sixty seconds a frozen
walker arrives with a very large number on it. It is the honest core of the "can you last
60 seconds?" mobile ads, with everything that was there to sell you something removed.

**No ads. No revives. No gacha. No timers. No purchases.** A lost run keeps every coin it
earned, and weapon unlocks are milestones you clear, not things you buy.

## Play

Serve the folder and open it in a browser. The game is ES modules, so it needs a server
rather than `file://`:

```bash
npm run serve
```

Or any static host, including GitHub Pages.

Drag on the bridge, or use `←` `→` / `A` `D`, to steer. The squad fires by itself.
`P` pauses.

## How a run works

- **Packs.** Husk packs come down the lane. The red number above a pack is how many
  soldiers it will cost if it reaches the line. Every husk that touches the line takes
  one soldier.
- **Gates.** Gates come in pairs. Every bullet that hits a gate nudges its number toward
  you: a `−6` becomes `−5`, then `−4`, and with enough fire a `+2` before you cross it.
  Multipliers step up every eight hits. Which half you cross is decided by where the
  squad's centre is.
- **The walker.** At sixty seconds the packs stop and the frozen walker descends. Drain
  its number before it reaches the line and the level is cleared. If it reaches the line
  it crushes six percent of the squad every third of a second until one of you is gone.

## Progression

Coins come from kills, the walker, and a clear bonus. They buy four camp upgrades:

| Upgrade | Effect per rank | Base cost | Ranks |
| --- | --- | --- | --- |
| Rounds | +15% damage per shot | 60 | 30 |
| Trigger | +8% fire rate | 80 | 25 |
| Reserves | +2 soldiers at deploy | 70 | 40 |
| Quartermaster | Every add gate is +1 kinder | 150 | 15 |

Costs climb ×1.35 per rank, and so do coins per kill, the walker's reward and the clear
bonus, so a cleared level buys the same share of the camp at level 20 as at level 1. Husk
health climbs ×1.32 per level and 1% per second inside a run; the walker's climbs ×1.35.
A test asserts that a cleared level always pays for at least two upgrades at that level,
and that the level-1 walker dies to a twenty-soldier squad before it reaches the line.

Two weapons are earned by play and cannot be bought:

- **Piercing rounds** after clearing level 3. Each shot passes through one husk.
- **Frag rounds** after clearing level 6. Hits splash nearby husks for half damage.

Progress saves in the browser under the `bridgehold` key.

## Repository layout

```text
index.html        the launch path
styles.css        all presentation
src/balance.js    every number that decides fairness, with no canvas or DOM
src/game.js       runtime: spawning, steering, bullets, gates, the walker, rendering
tests/            node --test suite over src/balance.js
docs/DESIGN.md    the design brief and what comes next
```

```bash
npm test
```

## License

MIT. See `LICENSE`.
