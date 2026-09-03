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
- **Runners** (from level 2) come in fast strings and die to a single hit. Steering
  matters against them.
- **Brutes** (from level 3) walk slowly, park at the line, and chew one soldier a second
  until killed. Their purple tag is their remaining health. Focus fire matters.
- **Gates.** Gates come in pairs. Bullets pass through them, and the damage they carry
  nudges the half they crossed toward you: a `−6` becomes `−5`, then `−4`, and with
  enough fire a `+2` before you cross it. Each step costs about a third of a second of the
  squad's fire on that half, whatever its size, so turning a gate is always a steering
  decision measured in seconds. Multipliers step up every eight steps, and a multiplier never adds more than eighty
  soldiers. Which half you cross is decided by where the
  squad's centre is. The half you cross shatters and the bonus lands at the line, with a
  caption saying what it did.
- **Weapon gates** (from level 2) swap the squad's weapon for the rest of the run. The
  shotgun fires three pellets in a spread and shreds packs up close. The rail fires
  slowly, hits a little harder, and passes through everything in its line.
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
and that the level-1 walker dies to a forty-soldier squad before it reaches the line.

The squad holds its ground. The bridge does not move and the squad does not walk; every
pack, gate and walker comes down the lane to the line, and steering only decides where
on the line the squad stands.

Two weapons are earned by play and cannot be bought:

- **Piercing rounds** after clearing level 3. Each shot passes through one husk.
- **Frag rounds** after clearing level 6. Hits splash nearby husks for half damage.

**The bay.** Left of the bridge is a stone platform with a valve wheel and a chained
giant. Steer the squad all the way left and it steps off the lane into the bay, where its
fire goes into the wheel instead of the horde. The wheel takes about four and a half
seconds of the squad's fire to open, at any squad size, and every one of those seconds
the lane is uncovered. When it opens, the colossus is unchained and walks up the lane
stomping everything within reach, and the horde answers: for sixteen seconds packs come
twice as big and twice as often. The wheel seals for twenty-five seconds after, then
re-arms at double the count.

Two allies take the flanks of the line once earned, and are deployed on every run after:

- **Sentinel** after clearing level 4. A walker of your own on the left flank that lobs a
  shell worth eight soldier shots into the thickest pack every 1.4 seconds, splashed, and
  into the walker once it is on screen.
- **Frost lantern** after clearing level 8. A cold lamp on the right flank; everything in
  the last 150 pixels of the bridge walks at two thirds speed.

Cleared levels stay open on the home screen with your best squad on each, so an old
level is worth replaying. Only clearing the frontier level opens the next one.

Sound is procedural WebAudio, no files, and can be turned off on the home screen along
with a reduced-motion option that also honours the OS setting.

Progress saves in the browser under the `bridgehold` key.

## Art

Every sprite is rendered from procedural Blender geometry by
`tools/blender/build_sprites.py`, the same way FUN TD builds its towers: primitives, one
night lighting rig (cold moon key, warm lantern fill), a tilted orthographic camera, and
Cycles with a transparent film. The output is one PNG per part plus `manifest.json`.

```bash
npm run sprites            # Blender installed as the Python module: pip install bpy
npm run sprites:blender    # a full Blender install on the PATH
```

The runtime loads the pack from the manifest and installs it only if every image loads;
otherwise it keeps drawing its vector fallbacks, so the game never depends on the renders
to be playable. A test asserts the manifest, the files on disk, the pipeline's part list
and the parts the runtime asks for all agree.

## Repository layout

```text
index.html        the launch path
styles.css        all presentation
src/balance.js    every number that decides fairness, with no canvas or DOM
src/audio.js      procedural sound cues, built on demand from oscillators and noise
src/art.js        the sprite pack loader, with vector fallback when it cannot install
assets/sprites/   rendered PNGs and manifest.json, generated, committed
tools/blender/    the sprite pipeline; never shipped and never required to run the game
src/game.js       runtime: spawning, steering, bullets, gates, the walker, rendering
tests/            node --test suite over src/balance.js
docs/DESIGN.md    the design brief and what comes next
```

```bash
npm test
```

## License

MIT. See `LICENSE`.
