/* Pass 2: enemy kinds, weapon gates, and the level ledger. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SAVE, ENEMIES, WEAPONS, SQUAD_CAP, MUL_GAIN_CAP, HELPERS, helpersFor, UPGRADES,
  packKind, packSize, weaponDps, gateHalf, hitGate, applyGate, recordRun, gateStepFor, GATE_STEP_SECONDS, statsFor,
  WHEEL, wheelStepFor, COLOSSUS, SURGE,
} from '../src/balance.js';

const fresh = () => ({ ...DEFAULT_SAVE, up: { ...DEFAULT_SAVE.up }, levels: {}, settings: { ...DEFAULT_SAVE.settings } });

test('level 1 is husks only; runners and brutes arrive on schedule', () => {
  for (let r = 0; r < 1; r += 0.01) assert.equal(packKind(1, r), 'husk');
  const kinds = L => new Set(Array.from({ length: 100 }, (_, i) => packKind(L, i / 100)));
  assert.deepEqual([...kinds(2)].sort(), ['husk', 'runner']);
  assert.deepEqual([...kinds(3)].sort(), ['brute', 'husk', 'runner']);
  assert.equal(packKind(5, 0.5), 'husk', 'husks stay the bulk');
});

test('enemy kinds are shaped as designed', () => {
  assert.ok(ENEMIES.runner.speed > 2 * ENEMIES.husk.speed);
  assert.ok(ENEMIES.runner.hp < 0.5);
  assert.ok(ENEMIES.brute.hp >= 5 && ENEMIES.brute.speed < 0.6);
  assert.equal(ENEMIES.brute.touch, 0, 'a brute parks instead of costing on touch');
  assert.equal(ENEMIES.brute.chew, 1);
  assert.ok(ENEMIES.brute.reward > ENEMIES.husk.reward);
  assert.equal(packSize('brute', 3, 0.9), 1);
  assert.equal(packSize('brute', 6, 0.9), 2);
  assert.ok(packSize('runner', 4, 0.99) <= 24);
});

test('weapons: shotgun out-damages the rifle up close, the rail pierces everything', () => {
  const rifle = weaponDps(WEAPONS.rifle), shotgun = weaponDps(WEAPONS.shotgun), rail = weaponDps(WEAPONS.rail);
  assert.equal(rifle, 1);
  assert.ok(shotgun > rifle && shotgun < 2 * rifle, 'shotgun is a pack tool, not a free upgrade');
  assert.ok(rail > rifle && rail < 1.3 * rifle, 'rail is only slightly ahead single-target');
  assert.ok(WEAPONS.rail.pierce >= 20);
  assert.equal(WEAPONS.shotgun.pellets, 3);
});

test('weapon gates roll only from level 2 and never react to bullets', () => {
  for (let r = 0.92; r < 1; r += 0.005) assert.equal(gateHalf(r, 1).kind, 'mul', 'level 1 rolls ×3 instead');
  const seen = new Set();
  for (let r = 0.92; r < 1; r += 0.005) { const h = gateHalf(r, 2); assert.equal(h.kind, 'weapon'); seen.add(h.v); }
  assert.deepEqual([...seen].sort(), ['rail', 'shotgun']);
  const h = { kind: 'weapon', v: 'rail' };
  for (let i = 0; i < 20; i++) hitGate(h);
  assert.equal(h.v, 'rail');
  assert.deepEqual(applyGate(12, h, 3), { count: 12, text: 'RAIL', good: true, weapon: 'rail' });
});

test('every roll at every level is a valid half', () => {
  for (const L of [1, 2, 5]) for (let r = 0; r < 1; r += 0.01) {
    const h = gateHalf(r, L);
    assert.ok(['add', 'mul', 'weapon'].includes(h.kind));
    if (h.kind === 'mul') assert.ok(h.v === 2 || h.v === 3);
    if (h.kind === 'weapon') assert.ok(h.v in WEAPONS);
  }
});

test('the ledger: the frontier only moves when the frontier is cleared', () => {
  const s = fresh();
  recordRun(s, 1, false, 9, 40);
  assert.equal(s.level, 1); assert.equal(s.coins, 40); assert.equal(s.levels[1].best, 9); assert.equal(s.levels[1].cleared, false);
  recordRun(s, 1, true, 30, 200);
  assert.equal(s.level, 2); assert.equal(s.selected, 2); assert.equal(s.levels[1].cleared, true); assert.equal(s.levels[1].best, 30);
  recordRun(s, 2, true, 50, 300);
  assert.equal(s.level, 3);
  s.selected = 1;
  recordRun(s, 1, true, 12, 100);
  assert.equal(s.level, 3, 'replaying an old level does not move the frontier');
  assert.equal(s.selected, 1, 'nor the selection');
  assert.equal(s.levels[1].best, 30, 'best is a high-water mark');
  assert.equal(s.best, 50);
  assert.equal(s.coins, 640, 'every run pays, won or lost');
});

test('gate nudges are paid in damage, not bullets', () => {
  const h = { kind: 'add', v: -6 };
  hitGate(h, 10, 40);
  assert.equal(h.v, -6, 'a quarter step does nothing yet');
  hitGate(h, 30, 40);
  assert.equal(h.v, -5, 'the step completes across hits');
  hitGate(h, 200, 40);
  assert.equal(h.v, 0, 'a big hit moves several steps');
  const m = { kind: 'mul', v: 2 };
  hitGate(m, 40 * 8, 40);
  assert.equal(m.v, 3, 'eight steps move a multiplier');
  const w = { kind: 'weapon', v: 'rail' };
  hitGate(w, 1000, 1);
  assert.equal(w.v, 'rail');
});

test('a gate step is a slice of the squad\'s fire, whatever its size', () => {
  const st = statsFor(fresh());
  for (const count of [5, 50, 300]) {
    const dps = st.dmg * count / st.interval;
    const step = gateStepFor(st, WEAPONS.rifle, count);
    assert.ok(Math.abs(step / dps - GATE_STEP_SECONDS) < 1e-9, 'step is ' + GATE_STEP_SECONDS + 's of fire at squad ' + count);
  }
  // a -8 gate needs eight steps: under three seconds of fire, over two
  assert.ok(8 * GATE_STEP_SECONDS < 3 && 8 * GATE_STEP_SECONDS > 2);
  // and -8 to +14 cannot happen inside a gate's descent (about 6 seconds)
  assert.ok(22 * GATE_STEP_SECONDS > 6);
  assert.ok(gateStepFor(st, WEAPONS.shotgun, 10) > gateStepFor(st, WEAPONS.rifle, 10), 'a stronger weapon pays a bigger step, so it does not turn gates faster');
});

test('a multiplier is true when small and bounded when big', () => {
  assert.equal(applyGate(10, { kind: 'mul', v: 3 }, 0).count, 30);
  assert.equal(applyGate(30, { kind: 'mul', v: 2 }, 0).count, 60);
  const big = applyGate(150, { kind: 'mul', v: 3 }, 0);
  assert.equal(big.gain, MUL_GAIN_CAP);
  assert.equal(big.count, SQUAD_CAP, 'and the cap still holds');
  assert.equal(applyGate(100, { kind: 'mul', v: 2 }, 0).count, 100 + MUL_GAIN_CAP);
});

test('the squad cap holds through a weapon gate', () => {
  assert.equal(applyGate(SQUAD_CAP, { kind: 'weapon', v: 'shotgun' }, 0).count, SQUAD_CAP);
});

test('allies are earned by clearing levels and never by rank', () => {
  const s = fresh();
  assert.deepEqual(helpersFor(s), []);
  for (const u of UPGRADES) s.up[u.k] = u.max;
  assert.deepEqual(helpersFor(s), [], 'a maxed camp buys no ally');
  s.level = HELPERS[0].clear + 1;
  assert.deepEqual(helpersFor(s).map(h => h.k), ['sentinel']);
  s.level = HELPERS[1].clear + 1;
  assert.deepEqual(helpersFor(s).map(h => h.k), ['sentinel', 'frost']);
  assert.notEqual(HELPERS[0].side, HELPERS[1].side, 'each ally takes its own flank');
  assert.ok(HELPERS[0].clear < HELPERS[1].clear);
});

test('the wheel takes about four and a half seconds of fire at any squad size', () => {
  const st = statsFor(fresh());
  for (const count of [5, 40, 200]) {
    const dps = st.dmg * count / st.interval;
    const total = wheelStepFor(st, WEAPONS.rifle, count) * WHEEL.turns;
    assert.ok(Math.abs(total / dps - WHEEL.seconds) < 1e-9, 'squad ' + count);
  }
  assert.equal(WHEEL.turns, 152);
  assert.ok(WHEEL.rearmMul > 1 && WHEEL.rearmAfter > SURGE.duration, 'the wheel re-arms after the surge has passed');
});

test('the surge doubles packs under a cap, and the colossus outlasts it on the lane', () => {
  assert.equal(packSize('husk', 3, 0.5, true), packSize('husk', 3, 0.5) * SURGE.sizeMul);
  assert.equal(packSize('husk', 30, 0.99, true), SURGE.sizeCap);
  assert.ok(SURGE.intervalMul < 0.5);
  const laneTime = (548 + 160) / COLOSSUS.speed;
  assert.ok(laneTime > SURGE.duration * 0.8, 'the giant is on the lane for most of the surge');
  assert.ok(COLOSSUS.dmg * 1 >= 20, 'a stomp is worth at least twenty soldier shots');
});
