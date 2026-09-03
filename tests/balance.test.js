/* The fairness rules, pinned. A run is meant to be winnable on skill and
 * gate play alone, and the camp is meant to be a nudge rather than a wall. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RUN_T, DEFAULT_SAVE, UPGRADES, UNLOCKS, SQUAD_CAP,
  cost, statsFor, huskHP, bossHP, clearBonus, bossReward, coinPerKill,
  packSize, packInterval, bossTimeToLine, squadDps,
  gateHalf, hitGate, gateValue, applyGate,
} from '../src/balance.js';

const fresh = () => ({ ...DEFAULT_SAVE, up: { ...DEFAULT_SAVE.up } });

test('a fresh account has no unlocks and the base squad', () => {
  const st = statsFor(fresh());
  assert.equal(st.squad, 5);
  assert.equal(st.pierce, false);
  assert.equal(st.splash, false);
  assert.equal(Math.round(squadDps(st, st.squad)), 100);
});

test('unlocks are earned by clearing levels, never by rank', () => {
  const maxed = fresh();
  for (const u of UPGRADES) maxed.up[u.k] = u.max;
  assert.equal(statsFor(maxed).pierce, false, 'maxed camp does not unlock pierce');
  const cleared = fresh(); cleared.level = UNLOCKS[0].clear + 1;
  assert.equal(statsFor(cleared).pierce, true);
  assert.equal(statsFor(cleared).splash, false);
  cleared.level = UNLOCKS[1].clear + 1;
  assert.equal(statsFor(cleared).splash, true);
});

test('upgrade costs climb gently and every upgrade has a ceiling', () => {
  for (const u of UPGRADES) {
    assert.ok(u.max > 0);
    let prev = 0;
    for (let r = 0; r < u.max; r++) {
      const c = cost(u, r);
      assert.ok(c > prev, `${u.k} rank ${r} costs more than the last`);
      assert.ok(c <= prev * 1.36 + 1 || prev === 0, `${u.k} rank ${r} never jumps more than 35%`);
      prev = c;
    }
  }
});

test('enemy health grows with the level and within a run', () => {
  assert.ok(huskHP(2, 0) > huskHP(1, 0));
  assert.ok(huskHP(1, RUN_T) > huskHP(1, 0));
  assert.ok(bossHP(5) > bossHP(4));
  assert.equal(bossHP(1), 12000);
  assert.equal(coinPerKill(1), 1);
  assert.ok(coinPerKill(8) > coinPerKill(4));
});

test('the walker takes about twenty-five seconds to reach the line', () => {
  assert.ok(bossTimeToLine() > 23 && bossTimeToLine() < 28, bossTimeToLine().toFixed(1) + ' seconds');
});

test('the walker is beatable on level 1 with a forty-soldier squad, and a set piece for a big one', () => {
  const st = statsFor(fresh());
  const timeToKill = bossHP(1) / squadDps(st, 40);
  assert.ok(bossHP(1) / squadDps(st, 120) > 4, 'even a large squad watches the number fall for seconds');
  assert.ok(timeToKill < bossTimeToLine(), `kill in ${timeToKill.toFixed(1)}s before ${bossTimeToLine().toFixed(1)}s`);
});

test('a cleared level pays for at least two upgrades at that level', () => {
  for (let L = 1; L <= 20; L++) {
    const kills = 120;
    const earned = kills * coinPerKill(L) + bossReward(L) + clearBonus(L);
    const twoUpgrades = cost(UPGRADES[0], L) + cost(UPGRADES[1], L);
    assert.ok(earned >= twoUpgrades, `level ${L}: ${earned} covers ${twoUpgrades}`);
  }
});

test('packs get denser as the clock runs down', () => {
  assert.ok(packInterval(RUN_T) < packInterval(0));
  assert.ok(packSize('husk', 3, 0.5) > packSize('husk', 1, 0.5));
  assert.ok(packSize('husk', 30, 0.99) <= 44);
});

test('every gate roll is a valid half', () => {
  for (let r = 0; r < 1; r += 0.01) {
    const h = gateHalf(r);
    assert.ok(h.kind === 'add' || h.kind === 'mul');
    if (h.kind === 'mul') assert.ok(h.v === 2 || h.v === 3);
    else assert.ok(h.v >= -8 && h.v <= 6 && h.v !== 0 && h.v !== 1 && h.v !== -1);
  }
});

test('shooting a bad gate turns it kind', () => {
  const h = { kind: 'add', v: -4 };
  for (let i = 0; i < 6; i++) hitGate(h);
  assert.equal(h.v, 2);
  for (let i = 0; i < 100; i++) hitGate(h);
  assert.equal(h.v, 14, 'adds cap');
  const m = { kind: 'mul', v: 2, hits: 0 };
  for (let i = 0; i < 8; i++) hitGate(m);
  assert.equal(m.v, 3, 'eight hits step a multiplier');
  for (let i = 0; i < 100; i++) hitGate(m);
  assert.equal(m.v, 5, 'multipliers cap');
});

test('the quartermaster softens every add gate', () => {
  assert.equal(gateValue({ kind: 'add', v: -3 }, 2), -1);
  assert.equal(gateValue({ kind: 'mul', v: 2 }, 2), 2);
  const r = applyGate(10, { kind: 'add', v: -3 }, 3);
  assert.deepEqual(r, { count: 10, text: '+0', good: true });
});

test('gates apply, clamp at the cap, and never go below zero', () => {
  assert.deepEqual(applyGate(10, { kind: 'mul', v: 3 }, 0), { count: 30, text: '×3', good: true, gain: 20 });
  assert.equal(applyGate(SQUAD_CAP, { kind: 'mul', v: 3 }, 0).count, SQUAD_CAP);
  assert.deepEqual(applyGate(3, { kind: 'add', v: -8 }, 0), { count: 0, text: '-8', good: false });
});
