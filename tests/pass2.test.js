/* Pass 2: enemy kinds, weapon gates, and the level ledger. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SAVE, ENEMIES, WEAPONS, SQUAD_CAP,
  packKind, packSize, weaponDps, gateHalf, hitGate, applyGate, recordRun,
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
  for (let r = 0.93; r < 1; r += 0.005) assert.equal(gateHalf(r, 1).kind, 'mul', 'level 1 rolls ×3 instead');
  const seen = new Set();
  for (let r = 0.93; r < 1; r += 0.005) { const h = gateHalf(r, 2); assert.equal(h.kind, 'weapon'); seen.add(h.v); }
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

test('the squad cap holds through a weapon gate', () => {
  assert.equal(applyGate(SQUAD_CAP, { kind: 'weapon', v: 'shotgun' }, 0).count, SQUAD_CAP);
});
