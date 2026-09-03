/* Every number that decides whether a run is fair lives here, with no canvas
 * and no DOM, so the tests and any future tuning script read the same rules
 * the game does. */

export const RUN_T = 60;          // seconds before the walker arrives
export const LINE_Y = 548;        // the squad's line, in the 360x640 world
export const SQUAD_CAP = 200;
/* A multiplier gate multiplies, but never adds more than this. Early it is a
   true x2 or x3; late it is a large flat gain, so a big squad cannot snowball
   from one lucky gate to the cap. */
export const MUL_GAIN_CAP = 80;

export const DEFAULT_SAVE = Object.freeze({
  level: 1,                       // the frontier: highest level open to play
  selected: 1,                    // the level the next deploy plays
  coins: 0, best: 0,
  up: Object.freeze({ dmg: 0, rate: 0, squad: 0, gate: 0 }),
  levels: Object.freeze({}),      // per-level { best, cleared }
  settings: Object.freeze({ sound: true, motion: 'full' }),
});

export const UPGRADES = [
  { k: 'dmg',   name: 'Rounds',        desc: '+15% damage per shot',    base: 60,  max: 30 },
  { k: 'rate',  name: 'Trigger',       desc: '+8% fire rate',           base: 80,  max: 25 },
  { k: 'squad', name: 'Reserves',      desc: '+2 soldiers at deploy',   base: 70,  max: 40 },
  { k: 'gate',  name: 'Quartermaster', desc: 'Every gate is +1 kinder', base: 150, max: 15 },
];

export const UNLOCKS = [
  { k: 'pierce', name: 'Piercing rounds', desc: 'Each shot passes through one husk.', clear: 3 },
  { k: 'splash', name: 'Frag rounds',     desc: 'Hits splash nearby husks for half.', clear: 6 },
];

/* Allies. Big helpers that take a flank of the line once a level is cleared.
   They are earned, never bought, and always deployed once earned. `dmg` is
   in soldier shots; the Sentinel's shell is worth eight of them, splashed. */
export const HELPERS = [
  { k: 'sentinel', name: 'Sentinel', desc: 'A walker of your own on the left flank. Lobs a shell into the thickest pack every 1.4 seconds.', clear: 4, side: 'l', interval: 1.4, dmg: 8, radius: 36 },
  { k: 'frost',    name: 'Frost lantern', desc: 'A cold lamp on the right flank. Everything in the last stretch of the bridge walks at two thirds speed.', clear: 8, side: 'r', slow: 0.65, band: 150 },
];
export const helpersFor = save => HELPERS.filter(h => save.level > h.clear);

/* The bay: a side platform on the left of the bridge with a valve wheel.
   The squad can step into it and shoot the wheel; every turn costs a slice
   of the squad's fire, like a gate step, so the whole wheel takes about
   WHEEL_SECONDS of fire at any squad size. Every second in the bay is a
   second the lane is not covered. When the wheel opens, the colossus is
   unchained and walks up the lane, and the horde answers with a surge. */
export const WHEEL = Object.freeze({ turns: 152, seconds: 4.5, rearmAfter: 25, rearmMul: 2 });
export const wheelStepFor = (stats, weapon, count) =>
  gateStepFor(stats, weapon, count) * (WHEEL.seconds / WHEEL.turns) / GATE_STEP_SECONDS;
export const COLOSSUS = Object.freeze({ speed: 42, stomp: 0.7, dmg: 30, radius: 72, riseTime: 1.2 });
export const SURGE = Object.freeze({ duration: 16, intervalMul: 0.45, sizeMul: 2, sizeCap: 64 });

export const cost = (u, rank) => Math.round(u.base * Math.pow(1.35, rank));

export function statsFor(save) {
  const up = save.up;
  return {
    dmg: 10 * Math.pow(1.15, up.dmg),
    interval: 0.5 / Math.pow(1.08, up.rate),
    squad: 5 + 2 * up.squad,
    gate: up.gate,
    pierce: save.level > UNLOCKS[0].clear,
    splash: save.level > UNLOCKS[1].clear,
  };
}

/* Income and upgrade costs ride the same 1.35 curve, so the ratio between a
   cleared level's pay and the next rank's price is the same at level 12 as at
   level 1. Husk health rides a slightly gentler curve; the walker rides the
   same one, and squad growth from gate play is what makes it fall faster. */
export const levelScale = level => Math.pow(1.35, level - 1);
export const huskHP = (level, t) => 14 * Math.pow(1.32, level - 1) * (1 + t / 100);
export const bossHP = level => Math.round(12000 * levelScale(level));
export const bossReward = level => Math.round(40 * levelScale(level));
export const clearBonus = level => Math.round(60 * levelScale(level));
export const coinPerKill = level => Math.ceil(levelScale(level));

/* Enemy kinds, as multipliers of the husk baseline. `touch` is the soldiers
   lost when one reaches the line; a brute instead stops there and chews. */
export const ENEMIES = Object.freeze({
  husk:   Object.freeze({ hp: 1,    speed: 1,    r: 7,  touch: 1, chew: 0, reward: 1, from: 1 }),
  runner: Object.freeze({ hp: 0.35, speed: 2.2,  r: 5,  touch: 1, chew: 0, reward: 1, from: 2 }),
  brute:  Object.freeze({ hp: 7,    speed: 0.5,  r: 12, touch: 0, chew: 1, reward: 6, from: 3 }),
});

/* Which kind of pack the next roll produces. Runners appear from level 2,
   brutes from level 3; husks stay the bulk of every level. */
export function packKind(level, r) {
  if (level >= ENEMIES.brute.from && r < 0.14) return 'brute';
  if (level >= ENEMIES.runner.from && r < 0.38) return 'runner';
  return 'husk';
}
export function packSize(kind, level, r, surge = false) {
  let n;
  if (kind === 'brute') n = level >= 6 ? 2 : 1;
  else if (kind === 'runner') n = Math.min(24, 6 + Math.floor(r * 6) + level);
  else n = Math.min(44, 4 + Math.floor(r * 5) + level * 2);
  return surge ? Math.min(SURGE.sizeCap, n * SURGE.sizeMul) : n;
}
export const packInterval = t => 2.4 - 1.1 * Math.min(1, t / RUN_T);
export const GATE_INTERVAL = 5;

/* Weapons. A weapon gate swaps the squad's weapon for the rest of the run.
   `dmg` and `interval` scale the camp stats; `pellets` is bullets per
   shooter; `tracers` caps how many soldiers visibly fire per volley. */
export const WEAPONS = Object.freeze({
  rifle:   Object.freeze({ name: 'RIFLE',   dmg: 1,    interval: 1,   pellets: 1, spread: 0,    pierce: 0,  tracers: 12 }),
  shotgun: Object.freeze({ name: 'SHOTGUN', dmg: 0.45, interval: 0.8, pellets: 3, spread: 0.22, pierce: 0,  tracers: 8 }),
  rail:    Object.freeze({ name: 'RAIL',    dmg: 2.2,  interval: 1.9, pellets: 1, spread: 0,    pierce: 99, tracers: 4 }),
});
export const weaponDps = w => w.dmg * w.pellets / w.interval;

/* The walker's descent. It starts above the screen and stops at the line. */
export const BOSS = Object.freeze({ w: 226, h: 160, startY: -300, vy: 29 });
export const bossTimeToLine = () => (LINE_Y - 14 - (BOSS.startY + BOSS.h / 2)) / BOSS.vy;

export const squadDps = (stats, count) => stats.dmg * count / stats.interval;

/* Gate halves. `r` is a roll in [0,1) so tests can pin the outcome. Weapon
   gates only roll from level 2, so the first level teaches the rifle. */
export function gateHalf(r, level = 1) {
  if (r < 0.42) return { kind: 'add', v: 2 + Math.floor((r / 0.42) * 5) };
  if (r < 0.80) return { kind: 'add', v: -(2 + Math.floor(((r - 0.42) / 0.38) * 7)) };
  if (r < 0.89) return { kind: 'mul', v: 2, hits: 0 };
  if (r < 0.92 || level < 2) return { kind: 'mul', v: 3, hits: 0 };
  return { kind: 'weapon', v: r < 0.96 ? 'shotgun' : 'rail' };
}

/* Bullets pass through gates and nudge them toward the player as they go.
   `dmg` accumulates against `step`; every full step moves an add gate by
   one, and every eight steps move a multiplier by one. Weapon gates do not
   change. With the defaults a hit is a step, which is what the tests pin.

   The runtime's step is GATE_STEP_SECONDS of the squad's current fire, so a
   gate is always a steering decision measured in seconds: a -8 needs about
   three seconds of fire on its half to reach zero, however big the squad,
   and a gate cannot be driven from -8 to +14 inside its descent. */
export const GATE_STEP_SECONDS = 0.35;
export const gateStepFor = (stats, weapon, count) =>
  stats.dmg * weapon.dmg * weapon.pellets / (stats.interval * weapon.interval) * count * GATE_STEP_SECONDS;
export function hitGate(half, dmg = 1, step = 1) {
  if (half.kind === 'weapon') return half;
  half.acc = (half.acc || 0) + dmg;
  while (half.acc >= step) {
    half.acc -= step;
    if (half.kind === 'add') half.v = Math.min(14, half.v + 1);
    else { half.hits = (half.hits || 0) + 1; if (half.hits % 8 === 0) half.v = Math.min(5, half.v + 1); }
  }
  return half;
}

export const gateValue = (half, gateBoost) => half.kind === 'add' ? half.v + gateBoost : half.v;

export function applyGate(count, half, gateBoost) {
  if (half.kind === 'weapon') {
    return { count, text: WEAPONS[half.v].name, good: true, weapon: half.v };
  }
  if (half.kind === 'mul') {
    const gain = Math.min(MUL_GAIN_CAP, Math.floor(count * (half.v - 1)));
    return { count: Math.min(SQUAD_CAP, count + gain), text: '×' + half.v, good: true, gain };
  }
  const v = gateValue(half, gateBoost);
  if (v >= 0) return { count: Math.min(SQUAD_CAP, count + v), text: '+' + v, good: true };
  return { count: Math.max(0, count + v), text: String(v), good: false };
}

/* Record a finished run. Returns the save mutated; the frontier only moves
   when the frontier level itself is cleared. */
export function recordRun(save, level, won, peak, coins) {
  save.coins += coins;
  save.best = Math.max(save.best, peak);
  const entry = { ...(save.levels[level] || { best: 0, cleared: false }) };
  entry.best = Math.max(entry.best, peak);
  if (won) entry.cleared = true;
  save.levels = { ...save.levels, [level]: entry };
  if (won && level === save.level) { save.level++; save.selected = save.level; }
  return save;
}
