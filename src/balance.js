/* Every number that decides whether a run is fair lives here, with no canvas
 * and no DOM, so the tests and any future tuning script read the same rules
 * the game does. */

export const RUN_T = 60;          // seconds before the walker arrives
export const LINE_Y = 548;        // the squad's line, in the 360x640 world
export const SQUAD_CAP = 300;

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
export const huskHP = (level, t) => 18 * Math.pow(1.32, level - 1) * (1 + t / 100);
export const bossHP = level => Math.round(6000 * levelScale(level));
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
export function packSize(kind, level, r) {
  if (kind === 'brute') return level >= 6 ? 2 : 1;
  if (kind === 'runner') return Math.min(24, 6 + Math.floor(r * 6) + level);
  return Math.min(44, 6 + Math.floor(r * 8) + level * 2);
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
export const BOSS = Object.freeze({ w: 226, h: 160, startY: -110, vy: 21 });
export const bossTimeToLine = () => (LINE_Y - 14 - (BOSS.startY + BOSS.h / 2)) / BOSS.vy;

export const squadDps = (stats, count) => stats.dmg * count / stats.interval;

/* Gate halves. `r` is a roll in [0,1) so tests can pin the outcome. Weapon
   gates only roll from level 2, so the first level teaches the rifle. */
export function gateHalf(r, level = 1) {
  if (r < 0.42) return { kind: 'add', v: 2 + Math.floor((r / 0.42) * 5) };
  if (r < 0.80) return { kind: 'add', v: -(2 + Math.floor(((r - 0.42) / 0.38) * 7)) };
  if (r < 0.90) return { kind: 'mul', v: 2, hits: 0 };
  if (r < 0.93 || level < 2) return { kind: 'mul', v: 3, hits: 0 };
  return { kind: 'weapon', v: r < 0.965 ? 'shotgun' : 'rail' };
}

/* A bullet hit nudges the gate toward the player. Adds climb one per hit;
   multipliers climb one step per eight hits; weapon gates do not change. */
export function hitGate(half) {
  if (half.kind === 'add') half.v = Math.min(14, half.v + 1);
  else if (half.kind === 'mul') { half.hits++; if (half.hits % 8 === 0) half.v = Math.min(5, half.v + 1); }
  return half;
}

export const gateValue = (half, gateBoost) => half.kind === 'add' ? half.v + gateBoost : half.v;

export function applyGate(count, half, gateBoost) {
  if (half.kind === 'weapon') {
    return { count, text: WEAPONS[half.v].name, good: true, weapon: half.v };
  }
  if (half.kind === 'mul') {
    return { count: Math.min(SQUAD_CAP, Math.floor(count * half.v)), text: '×' + half.v, good: true };
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
