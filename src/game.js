import {
  RUN_T, LINE_Y, DEFAULT_SAVE, UPGRADES, UNLOCKS, ENEMIES, WEAPONS, BOSS, HELPERS,
  cost, statsFor, huskHP, bossHP, bossReward, clearBonus, coinPerKill,
  packKind, packSize, packInterval, GATE_INTERVAL, gateStepFor, gateHalf, helpersFor,
  WHEEL, wheelStepFor, COLOSSUS, SURGE, hitGate, gateValue, applyGate, recordRun,
} from './balance.js';
import { createAudio } from './audio.js';
import { loadArt } from './art.js';

const W = 360, H = 640, LANE_L = 96, LANE_R = 326;
// The bay: a side platform left of the bridge, holding the valve wheel and the chained giant.
const BAY = { x0: 22, x1: 92, cx: 57, top: 150, wheelY: 372, giantY: 236 };
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const osReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = id => document.getElementById(id);

// Game pixels per Blender unit, per sprite family. The walker is drawn at a
// larger scale on purpose: it is meant to be monumental.
const PPU = { unit: 14, brute: 16, walker: 45, lamp: 11, sentinel: 17, frostlamp: 19, colossus: 22, wheel: 14 };
const FLANK = { l: LANE_L + 30, r: LANE_R - 30, y: LINE_Y + 44 };
let art = null;
loadArt().then(pack => { art = pack; document.body.classList.toggle('has-art', !!pack); });

// ---------- save ----------
const SAVE_KEY = 'bridgehold';
let save = load();
function fresh() { return { ...DEFAULT_SAVE, up: { ...DEFAULT_SAVE.up }, levels: {}, settings: { ...DEFAULT_SAVE.settings } }; }
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.up) {
      const out = { ...fresh(), ...s, up: { ...DEFAULT_SAVE.up, ...s.up }, levels: { ...(s.levels || {}) }, settings: { ...DEFAULT_SAVE.settings, ...(s.settings || {}) } };
      if (!out.selected || out.selected > out.level) out.selected = out.level;
      return out;
    }
  } catch (e) {}
  return fresh();
}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
const reduceMotion = () => osReduced || save.settings.motion === 'reduced';

const audio = createAudio(save.settings.sound);

// ---------- home screen ----------
function renderHome() {
  $('hLevel').textContent = save.level;
  $('hCoins').textContent = save.coins.toLocaleString();
  $('hBest').textContent = save.best;
  const st = statsFor(save);

  const strip = $('levels'); strip.innerHTML = '';
  for (let L = 1; L <= save.level; L++) {
    const b = document.createElement('button');
    const entry = save.levels[L];
    const front = L === save.level;
    b.className = 'lvl' + (L === save.selected ? ' sel' : '') + (front ? ' front' : ' done');
    b.innerHTML = `<b>${L}</b><span>${front ? 'next' : (entry && entry.best ? '▲ ' + entry.best : 'clear')}</span>`;
    b.setAttribute('aria-label', front ? 'Level ' + L + ', not yet cleared' : 'Level ' + L + ', cleared, best squad ' + (entry ? entry.best : 0));
    b.onclick = () => { save.selected = L; persist(); renderHome(); };
    strip.appendChild(b);
  }
  requestAnimationFrame(() => { const s = strip.querySelector('.sel'); if (s) s.scrollIntoView({ inline: 'center', block: 'nearest' }); });
  $('deploy').innerHTML = `Deploy <small>level ${save.selected}</small>`;

  const box = $('ups'); box.innerHTML = '';
  for (const u of UPGRADES) {
    const lv = save.up[u.k], maxed = lv >= u.max, c = cost(u, lv);
    const row = document.createElement('div'); row.className = 'up';
    const pips = Math.min(10, u.max), filled = Math.round(lv / u.max * pips);
    row.innerHTML = `<div class="up-text"><div class="up-head"><span class="n">${u.name}</span><span class="lv">${lv}<em>/${u.max}</em></span></div><div class="d">${u.desc}</div><div class="pips" aria-hidden="true">${Array.from({ length: pips }, (_, i) => `<i${i < filled ? ' class="on"' : ''}></i>`).join('')}</div></div>`;
    const b = document.createElement('button'); b.className = 'buy';
    b.innerHTML = maxed ? 'MAX' : `<span class="coin"></span>${c.toLocaleString()}`;
    b.disabled = maxed || save.coins < c;
    b.setAttribute('aria-label', maxed ? u.name + ' is at max rank' : 'Buy ' + u.name + ' rank ' + (lv + 1) + ' for ' + c + ' coins');
    b.onclick = () => { if (save.coins >= c && !maxed) { save.coins -= c; save.up[u.k]++; persist(); audio.unlock(); audio.gateGood(); renderHome(); } };
    row.appendChild(b); box.appendChild(row);
  }
  const ub = $('unlocks'); ub.innerHTML = '';
  for (const u of UNLOCKS) {
    const on = st[u.k];
    const row = document.createElement('div'); row.className = 'unl' + (on ? ' on' : '');
    row.innerHTML = `<div class="unl-mark" aria-hidden="true">${on ? '✓' : u.clear}</div><div><div class="n">${u.name}</div><div class="d">${u.desc} ${on ? 'Earned.' : 'Clear level ' + u.clear + '.'}</div></div>`;
    ub.appendChild(row);
  }
  const hb = $('helpers'); hb.innerHTML = '';
  const have = helpersFor(save).map(h => h.k);
  for (const h of HELPERS) {
    const on = have.includes(h.k);
    const row = document.createElement('div'); row.className = 'unl ally' + (on ? ' on' : '');
    row.innerHTML = `<div class="unl-mark" aria-hidden="true">${on ? '✓' : h.clear}</div><div><div class="n">${h.name}</div><div class="d">${h.desc} ${on ? 'Deployed on every run.' : 'Clear level ' + h.clear + '.'}</div></div>`;
    hb.appendChild(row);
  }
  $('sound').textContent = 'Sound ' + (save.settings.sound ? 'on' : 'off');
  $('sound').setAttribute('aria-pressed', String(save.settings.sound));
  $('motion').textContent = 'Motion ' + (save.settings.motion === 'reduced' ? 'reduced' : 'full');
  $('motion').setAttribute('aria-pressed', String(save.settings.motion === 'reduced'));
}
$('sound').onclick = () => { save.settings.sound = !save.settings.sound; audio.setOn(save.settings.sound); if (save.settings.sound) audio.ping(4); persist(); renderHome(); };
$('motion').onclick = () => { save.settings.motion = save.settings.motion === 'reduced' ? 'full' : 'reduced'; persist(); renderHome(); };
$('reset').onclick = () => { if (confirm('Wipe camp progress and coins?')) { const s = save.settings; save = fresh(); save.settings = s; persist(); renderHome(); } };
$('deploy').onclick = () => startRun();
$('again').onclick = () => startRun();
$('toCamp').onclick = () => { showScreen('home'); renderHome(); };

function showScreen(id) {
  for (const s of ['home', 'end']) $(s).hidden = s !== id;
  if (id) { const el = $(id); el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); el.scrollTop = 0; }
}

// ---------- run state ----------
let G = null;
let last = 0, paused = false, stripe = 0;
const keys = {};
let pointerX = null;

function startRun() {
  audio.unlock();
  const st = statsFor(save);
  const level = Math.min(save.selected, save.level);
  G = {
    t: 0, level, st, weapon: 'rifle',
    cx: W / 2, tx: W / 2, count: st.squad, peak: st.squad,
    fireT: 0, packT: 2.6, gateT: 2.4, muzzleT: 0, banner: 1.6,
    bullets: [], husks: [], gates: [], boss: null, floats: [], parts: [],
    kills: 0, coins: 0, shake: 0, over: 0, won: false, endT: 0, flash: 0, wpnT: 0,
    bossDmg: 0, bossDmgT: 0, tagPulse: 0,
    helpers: helpersFor(save), shells: [], shellT: 0.9,
    wheel: { need: WHEEL.turns, left: WHEEL.turns, spin: 0, hitT: 0, rearmT: 0, releases: 0 },
    colossus: null, surge: 0, surgeBanner: 0,
  };
  G.frost = G.helpers.find(h => h.k === 'frost') || null;
  showScreen(null);
  paused = false; last = performance.now();
}

// ---------- spawning ----------
const rnd = (a, b) => a + Math.random() * (b - a);
function spawnPack() {
  const kind = packKind(G.level, Math.random()), E = ENEMIES[kind];
  const size = packSize(kind, G.level, Math.random(), G.surge > 0);
  const hp = huskHP(G.level, G.t) * E.hp, spd = (rnd(52, 76) + G.level * 2.5) * E.speed;
  const pack = { units: [], kind };
  const unit = (x, y) => ({ x, y, hp, max: hp, vy: spd * rnd(0.92, 1.08), wob: rnd(0, 6.28), pack, kind, r: E.r, chewT: 0, parked: false, hurt: 0 });
  if (kind === 'runner') {
    const cx = rnd(LANE_L + 24, LANE_R - 24);
    for (let i = 0; i < size; i++) pack.units.push(unit(cx + rnd(-14, 14), -230 - i * 16 - rnd(0, 6)));
  } else if (kind === 'brute') {
    for (let i = 0; i < size; i++) pack.units.push(unit(rnd(LANE_L + 40, LANE_R - 40), -240 - i * 60));
  } else {
    const rad = Math.min(58, 12 + size * 1.5);
    const cx = rnd(LANE_L + rad, LANE_R - rad), cy = -230 - rnd(0, 80);
    for (let i = 0; i < size; i++) {
      const a = rnd(0, Math.PI * 2), r = Math.sqrt(Math.random()) * rad;
      pack.units.push(unit(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8));
    }
  }
  G.husks.push(...pack.units);
}
function spawnGate() {
  G.gates.push({ y: -230, l: gateHalf(Math.random(), G.level), r: gateHalf(Math.random(), G.level), applied: false });
}
function spawnBoss() {
  const hp = bossHP(G.level);
  G.boss = { x: W / 2, y: BOSS.startY, w: BOSS.w, h: BOSS.h, hp, max: hp, vy: BOSS.vy, atLine: false, hitT: 0, wob: 0, crushT: 0, cracks: [], nextCrack: 0.9 };
  float(W / 2, 140, 'THE WALKER', '#bdf3ff', 30);
}
function addCrack(b) {
  const side = Math.floor(rnd(0, 4)), pts = [];
  let x = side === 0 ? rnd(-1, 1) * b.w / 2 : side === 1 ? b.w / 2 : side === 2 ? rnd(-1, 1) * b.w / 2 : -b.w / 2;
  let y = side === 0 ? -b.h / 2 : side === 1 ? rnd(-1, 1) * b.h / 2 : side === 2 ? b.h / 2 : rnd(-1, 1) * b.h / 2;
  pts.push([x, y]);
  const steps = 3 + Math.floor(rnd(0, 3));
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    x = x * (1 - f) + rnd(-20, 20) * (1 - f) + rnd(-b.w / 6, b.w / 6) * f;
    y = y * (1 - f) + rnd(-20, 20) * (1 - f) + rnd(-b.h / 6, b.h / 6) * f;
    pts.push([x, y]);
  }
  b.cracks.push(pts);
}

// ---------- helpers ----------
const GATE_FADE = 0.42;
function float(x, y, txt, color, size, opts = {}) { G.floats.push({ x, y, txt, color, size: size || 18, t: 0, pop: !!opts.pop, caption: opts.caption || null, life: opts.pop ? 1.5 : 1.1 }); }
/* Glass shards from a broken gate half: thin rotated slivers in its colour. */
function shards(x0, x1, y, color, n) {
  for (let i = 0; i < n; i++) {
    const x = rnd(x0, x1), up = rnd(-260, -60);
    G.parts.push({ x, y: y + rnd(-14, 14), vx: rnd(-90, 90), vy: up, t: 0, life: rnd(0.45, 0.8), color, shard: true, len: rnd(5, 14), rot: rnd(0, 6.28), vr: rnd(-9, 9) });
  }
  if (G.parts.length > 400) G.parts.splice(0, G.parts.length - 400);
}
function burst(x, y, color, n, speed = 160) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, 6.28), s = rnd(40, speed);
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, t: 0, life: rnd(0.3, 0.7), color });
  }
  if (G.parts.length > 400) G.parts.splice(0, G.parts.length - 400);
}
const inBay = cx => cx < LANE_L - 4;
function formation(count, cx) {
  const bay = inBay(cx), n = Math.min(count, bay ? 16 : 24), per = bay ? 4 : 6, gap = bay ? 16 : 20, pts = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / per), inRow = Math.min(per, n - row * per), col = i - row * per;
    pts.push({ x: cx + (col - (inRow - 1) / 2) * gap, y: LINE_Y + row * 13 });
  }
  return pts;
}
function killHusk(h, idx) {
  G.husks.splice(idx, 1);
  G.kills++; G.coins += coinPerKill(G.level) * ENEMIES[h.kind].reward;
  burst(h.x, h.y, h.kind === 'brute' ? '#c9a0ff' : '#a9c9a6', h.kind === 'brute' ? 14 : 4);
  audio.pop();
}
function loseSoldiers(n) {
  if (n <= 0 || G.over) return;
  G.count = Math.max(0, G.count - n);
  G.flash = 0.25;
  float(G.cx, LINE_Y - 24, '-' + n, '#ff4d5e', 20);
  audio.lost();
  if (G.count <= 0) breakLine();
}
function walkerDown() {
  const bs = G.boss; if (G.over) return;
  bs.hp = 0; burst(bs.x, bs.y, '#bdf3ff', 70, 260); G.shake = 10;
  G.coins += bossReward(G.level) + clearBonus(G.level); G.kills++;
  float(W / 2, 200, 'LINE HELD', '#5ee39a', 34);
  audio.shatter(); audio.held();
  G.over = 1; G.won = true; G.endT = 0;
}
/* Where the Sentinel aims: the walker if it is on screen, else the centre of
   the pack with the most health on the deck, else nothing. */
function shellTarget() {
  if (G.boss && G.boss.hp > 0 && G.boss.y > 40) return { x: G.boss.x, y: G.boss.y };
  const packs = new Map();
  for (const h of G.husks) {
    if (h.y < -160) continue;
    const p = packs.get(h.pack) || { hp: 0, sx: 0, sy: 0, n: 0 };
    p.hp += h.hp; p.sx += h.x; p.sy += h.y; p.n++; packs.set(h.pack, p);
  }
  let best = null;
  for (const p of packs.values()) if (!best || p.hp > best.hp) best = p;
  return best ? { x: best.sx / best.n, y: best.sy / best.n } : null;
}
/* The wheel opens: the giant rises out of the bay, and the horde answers. */
function unchain() {
  const w = G.wheel; w.releases++; w.rearmT = WHEEL.rearmAfter;
  G.colossus = { x: BAY.cx, y: BAY.giantY, t: 0, wob: 0, phase: 'rise', stompT: 0, foot: 0 };
  G.surge = SURGE.duration; G.surgeBanner = 2.2;
  burst(BAY.cx, BAY.giantY - 40, '#9aa3b4', 30, 240); G.shake = 8;
  float(W / 2, 150, 'UNCHAINED', '#bdf3ff', 34);
  audio.shatter(); audio.thump();
}
function breakLine() {
  if (G.over) return;
  G.over = 1; G.won = false; G.endT = 0; G.shake = 8;
  audio.broken();
}
function fire() {
  const wp = WEAPONS[G.weapon];
  const pts = formation(G.count, G.cx), shooters = Math.min(pts.length, wp.tracers);
  const dmg = G.st.dmg * wp.dmg * G.count / shooters;
  const pierce = wp.pierce + (G.st.pierce ? 1 : 0);
  for (let i = 0; i < shooters; i++) {
    for (let k = 0; k < wp.pellets; k++) {
      const a = wp.pellets > 1 ? (k - (wp.pellets - 1) / 2) * wp.spread : 0;
      G.bullets.push({ x: pts[i].x + 3, y: pts[i].y - 14, vx: Math.sin(a) * 560, vy: -Math.cos(a) * 560, dmg, pierce, w: G.weapon });
    }
  }
  G.muzzleT = 0.06;
  audio.tick();
}

// ---------- update ----------
function update(dt) {
  if (!G) return;
  G.t += dt;
  if (G.flash > 0) G.flash -= dt;
  if (G.wpnT > 0) G.wpnT -= dt;
  if (G.muzzleT > 0) G.muzzleT -= dt;
  if (G.banner > 0) G.banner -= dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - 30 * dt);

  // steering
  if (G.over === 0) {
    if (pointerX !== null) G.tx = pointerX;
    const k = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
    if (k) { G.tx += k * 320 * dt; pointerX = null; }
    const half = (Math.min(G.count, 6) - 1) / 2 * 20 + 10, edge = LANE_L + half;
    G.tx = Math.max(BAY.cx, Math.min(LANE_R - half, G.tx));
    // the lane, or the bay: the squad cannot stand in the gap, so a target in
    // it resolves to whichever side is nearer and the squad crosses in one move
    const goal = G.tx < edge ? (G.tx < (BAY.cx + edge) / 2 ? BAY.cx : edge) : G.tx;
    G.cx += (goal - G.cx) * Math.min(1, dt * (inBay(goal) !== inBay(G.cx) ? 6 : 14));
  }

  // spawns
  if (G.over === 0 && !G.boss) {
    if (G.t < RUN_T) {
      G.packT -= dt;
      if (G.packT <= 0) { spawnPack(); G.packT = packInterval(G.t) * (G.surge > 0 ? SURGE.intervalMul : 1); }
      G.gateT -= dt;
      if (G.gateT <= 0) { spawnGate(); G.gateT = GATE_INTERVAL; }
    } else spawnBoss();
  }

  // firing
  if (G.over === 0 && G.count > 0) {
    G.fireT -= dt;
    if (G.fireT <= 0) { G.fireT += G.st.interval * WEAPONS[G.weapon].interval; fire(); }
  }

  // bullets
  for (let bi = G.bullets.length - 1; bi >= 0; bi--) {
    const b = G.bullets[bi];
    b.x += b.vx * dt; b.y += b.vy * dt;
    const bayShot = b.x < LANE_L - 4;
    let dead = b.y < -420 || b.x < BAY.x0 - 6 || b.x > LANE_R + 6 || (bayShot && b.y < BAY.top - 10);
    // the wheel: a shot in the bay column turns it
    if (!dead && bayShot && G.wheel.left > 0 && G.wheel.rearmT <= 0 && Math.abs(b.y - BAY.wheelY) < 22 && Math.abs(b.x - BAY.cx) < 24) {
      const w = G.wheel, step = wheelStepFor(G.st, WEAPONS[G.weapon], Math.max(1, G.count));
      w.acc = (w.acc || 0) + b.dmg;
      while (w.acc >= step && w.left > 0) { w.acc -= step; w.left--; w.spin += 0.35; }
      w.hitT = 0.1; dead = true;
      audio.ping(w.left % 10);
      if (w.left <= 0) unchain();
    }
    // gates: the bullet passes through and nudges the half it crossed, once
    if (!dead) for (const g of G.gates) {
      if (g.applied || b.gate === g || Math.abs(b.y - g.y) > 16) continue;
      b.gate = g;
      const half = b.x < W / 2 ? g.l : g.r;
      if (half.kind !== 'weapon') {
        const before = half.v;
        hitGate(half, b.dmg, gateStepFor(G.st, WEAPONS[G.weapon], Math.max(1, G.count)));
        half.hitT = 0.1;
        if (half.v !== before) audio.ping(gateValue(half, G.st.gate));
      }
      break;
    }
    if (!dead && G.boss && G.boss.hp > 0 && Math.abs(b.x - G.boss.x) < G.boss.w / 2 && Math.abs(b.y - G.boss.y) < G.boss.h / 2) {
      const bs = G.boss;
      bs.hp -= b.dmg; bs.hitT = 0.08; dead = true;
      G.bossDmg += b.dmg;
      burst(b.x, bs.y + bs.h / 2, '#dff7ff', 2, 120);
      audio.crack();
      while (bs.hp > 0 && bs.hp / bs.max < bs.nextCrack) { addCrack(bs); bs.nextCrack -= 0.1; }
      if (bs.hp <= 0) walkerDown();
    }
    if (!dead) for (let hi = G.husks.length - 1; hi >= 0; hi--) {
      const h = G.husks[hi];
      const dx = b.x - h.x, dy = b.y - h.y, rr = (h.r + 3) * (h.r + 3);
      if (dx * dx + dy * dy > rr) continue;
      h.hp -= b.dmg; h.hurt = 0.07;
      if (G.st.splash) for (const o of G.husks) {
        if (o === h) continue;
        const ox = o.x - h.x, oy = o.y - h.y;
        if (ox * ox + oy * oy < 24 * 24) { o.hp -= b.dmg * 0.5; o.hurt = 0.07; }
      }
      if (h.hp <= 0) killHusk(h, hi);
      if (b.pierce > 0) { b.pierce--; continue; }
      dead = true; break;
    }
    if (dead) G.bullets.splice(bi, 1);
  }
  if (G.st.splash) for (let hi = G.husks.length - 1; hi >= 0; hi--) if (G.husks[hi].hp <= 0) killHusk(G.husks[hi], hi);

  // walker damage tally, shown as a float four times a second
  if (G.boss) {
    G.bossDmgT += dt;
    if (G.bossDmgT >= 0.25) {
      G.bossDmgT = 0;
      if (G.bossDmg > 0) { float(G.boss.x + rnd(-50, 50), G.boss.y - 20, '-' + Math.round(G.bossDmg).toLocaleString(), '#dff7ff', 22); G.bossDmg = 0; }
    }
  }

  // enemies
  for (let hi = G.husks.length - 1; hi >= 0; hi--) {
    const h = G.husks[hi];
    h.wob += dt * (h.kind === 'runner' ? 12 : 6);
    if (h.hurt > 0) h.hurt -= dt;
    if (h.parked) {
      if (G.over === 0) { h.chewT += dt; if (h.chewT >= 1) { h.chewT -= 1; loseSoldiers(ENEMIES.brute.chew); G.shake = Math.max(G.shake, 3); } }
      continue;
    }
    const frost = G.frost && h.y > LINE_Y - G.frost.band ? G.frost.slow : 1;
    h.y += h.vy * dt * frost;
    if (h.y >= LINE_Y - 6 - (h.kind === 'brute' ? 10 : 0)) {
      if (h.kind === 'brute') { h.parked = true; h.y = LINE_Y - 16; G.shake = Math.max(G.shake, 5); audio.gateBad(); continue; }
      G.husks.splice(hi, 1);
      burst(h.x, h.y, '#ff4d5e', 5);
      loseSoldiers(ENEMIES[h.kind].touch);
    }
  }

  // gates
  for (let gi = G.gates.length - 1; gi >= 0; gi--) {
    const g = G.gates[gi];
    g.y += 100 * dt;
    if (g.l.hitT > 0) g.l.hitT -= dt;
    if (g.r.hitT > 0) g.r.hitT -= dt;
    if (g.applied) { g.fade -= dt; if (g.fade <= 0) G.gates.splice(gi, 1); continue; }
    if (g.y + 16 >= LINE_Y && G.over === 0) {
      g.applied = true; g.fade = GATE_FADE; g.side = G.cx < W / 2 ? 'l' : 'r';
      const before = G.count;
      const r = applyGate(G.count, g[g.side], G.st.gate);
      G.count = r.count;
      const color = r.weapon ? '#ffb640' : r.good ? '#4da3ff' : '#ff4d5e';
      if (r.weapon) { G.weapon = r.weapon; G.wpnT = 1.6; audio.weapon(); }
      else if (r.good) audio.gateGood();
      else { G.flash = 0.25; audio.gateBad(); }
      // the crossed half shatters; the bonus pops up where the squad is
      const x0 = g.side === 'l' ? LANE_L + 2 : W / 2 + 3, x1 = g.side === 'l' ? W / 2 - 3 : LANE_R - 2;
      shards(x0, x1, g.y, color, 22);
      const delta = G.count - before;
      const caption = r.weapon ? 'new weapon' : delta === 0 ? 'no change' : (delta > 0 ? '+' : '') + delta + (Math.abs(delta) === 1 ? ' soldier' : ' soldiers');
      float(G.cx, LINE_Y - 54, r.text, color, 38, { pop: true, caption });
      G.tagPulse = 0.35;
      if (G.count <= 0) breakLine();
    }
    if (g.y > H + 40) G.gates.splice(gi, 1);
  }
  G.peak = Math.max(G.peak, G.count);

  // allies
  if (G.over === 0) {
    const sentinel = G.helpers.find(h => h.k === 'sentinel');
    if (sentinel) {
      G.shellT -= dt;
      if (G.shellT <= 0) {
        G.shellT = sentinel.interval;
        const target = shellTarget();
        if (target) {
          G.shells.push({ x0: FLANK.l, y0: FLANK.y - 26, tx: target.x, ty: target.y, t: 0, dur: 0.75, dmg: G.st.dmg * sentinel.dmg, radius: sentinel.radius });
          audio.thump();
        }
      }
    }
  }
  for (let i = G.shells.length - 1; i >= 0; i--) {
    const sh = G.shells[i]; sh.t += dt;
    if (sh.t >= sh.dur) {
      G.shells.splice(i, 1);
      burst(sh.tx, sh.ty, '#ffb640', 16, 220); G.shake = Math.max(G.shake, 2.5);
      float(sh.tx, sh.ty - 18, 'BOOM', '#ffb640', 14);
      if (G.boss && G.boss.hp > 0 && Math.abs(sh.tx - G.boss.x) < G.boss.w / 2 + 20 && Math.abs(sh.ty - G.boss.y) < G.boss.h / 2 + 20) {
        G.boss.hp = Math.max(0, G.boss.hp - sh.dmg); G.boss.hitT = 0.1; G.bossDmg += sh.dmg;
        while (G.boss.hp > 0 && G.boss.hp / G.boss.max < G.boss.nextCrack) { addCrack(G.boss); G.boss.nextCrack -= 0.1; }
        if (G.boss.hp <= 0) walkerDown();
      }
      for (let hi = G.husks.length - 1; hi >= 0; hi--) {
        const h = G.husks[hi], dx = h.x - sh.tx, dy = h.y - sh.ty;
        if (dx * dx + dy * dy > sh.radius * sh.radius) continue;
        h.hp -= sh.dmg; h.hurt = 0.1;
        if (h.hp <= 0) killHusk(h, hi);
      }
    }
  }

  // the colossus and the surge
  if (G.surge > 0) G.surge -= dt;
  if (G.surgeBanner > 0) G.surgeBanner -= dt;
  if (G.wheel.rearmT > 0) { G.wheel.rearmT -= dt; if (G.wheel.rearmT <= 0) { G.wheel.need = Math.round(G.wheel.need * WHEEL.rearmMul); G.wheel.left = G.wheel.need; G.wheel.acc = 0; float(BAY.cx, BAY.wheelY - 30, 'REARMED', '#ffb640', 14); } }
  if (G.colossus) {
    const c = G.colossus; c.t += dt; c.wob += dt;
    if (c.phase === 'rise') {
      const k = Math.min(1, c.t / COLOSSUS.riseTime);
      c.x = BAY.cx + (W / 2 - BAY.cx) * (1 - Math.pow(1 - k, 2));
      if (k >= 1) { c.phase = 'walk'; c.stompT = 0.2; }
    } else {
      c.y -= COLOSSUS.speed * dt;
      c.stompT -= dt;
      if (c.stompT <= 0) {
        c.stompT = COLOSSUS.stomp; c.foot = 1 - c.foot;
        const fx = c.x + (c.foot ? -26 : 26), fy = c.y - 10, dmg = G.st.dmg * COLOSSUS.dmg, r2 = COLOSSUS.radius * COLOSSUS.radius;
        burst(fx, fy, '#9aa3b4', 18, 200); G.shake = Math.max(G.shake, 4); audio.thump();
        for (let hi = G.husks.length - 1; hi >= 0; hi--) {
          const h = G.husks[hi], dx = h.x - fx, dy = h.y - fy;
          if (dx * dx + dy * dy > r2) continue;
          h.hp -= dmg; h.hurt = 0.1; if (h.hp <= 0) killHusk(h, hi);
        }
        if (G.boss && G.boss.hp > 0 && Math.abs(fx - G.boss.x) < G.boss.w / 2 + 30 && Math.abs(fy - G.boss.y) < G.boss.h / 2 + 30) {
          G.boss.hp = Math.max(0, G.boss.hp - dmg); G.boss.hitT = 0.1; G.bossDmg += dmg;
          while (G.boss.hp > 0 && G.boss.hp / G.boss.max < G.boss.nextCrack) { addCrack(G.boss); G.boss.nextCrack -= 0.1; }
          if (G.boss.hp <= 0) walkerDown();
        }
      }
      if (c.y < -180) G.colossus = null;
    }
  }

  // the walker
  if (G.boss && G.boss.hp > 0) {
    const b = G.boss; b.wob += dt; if (b.hitT > 0) b.hitT -= dt;
    if (!b.atLine) {
      b.y += b.vy * dt;
      if (b.y + b.h / 2 >= LINE_Y - 14) { b.atLine = true; b.crushT = 0; G.shake = 6; audio.gateBad(); }
    } else if (G.over === 0) {
      b.crushT += dt;
      if (b.crushT >= 0.3) { b.crushT -= 0.3; loseSoldiers(Math.max(1, Math.floor(G.count * 0.06))); }
    }
  }

  if (G.tagPulse > 0) G.tagPulse -= dt;
  for (let i = G.floats.length - 1; i >= 0; i--) { const f = G.floats[i]; f.t += dt; f.y -= (f.pop ? 16 : 28) * dt; if (f.t > f.life) G.floats.splice(i, 1); }
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.shard ? 420 : 180) * dt;
    if (p.shard) p.rot += p.vr * dt;
    if (p.t > p.life) G.parts.splice(i, 1);
  }

  if (G.over) { G.endT += dt; if (G.endT > 1.4) finishRun(); }
}

function finishRun() {
  const won = G.won, level = G.level, wasFrontier = level === save.level;
  const held = Math.min(RUN_T, Math.floor(G.t));
  recordRun(save, level, won, G.peak, G.coins);
  persist();
  $('eSub').textContent = 'Level ' + level + (won ? ' cleared' : '');
  $('eTitle').textContent = won ? 'LINE HELD' : 'LINE BROKEN';
  $('end').classList.toggle('won', won);
  $('eLede').textContent = won
    ? (wasFrontier ? 'The walker went down. Level ' + (level + 1) + ' is open, and every coin goes to camp.' : 'The walker went down again. Best squad on this level: ' + save.levels[level].best + '.')
    : 'The bridge fell at ' + held + ' seconds. The coins are still yours.';
  countUp($('eCoins'), G.coins); countUp($('eKills'), G.kills); countUp($('ePeak'), G.peak);
  $('again').innerHTML = won && wasFrontier ? `Deploy <small>level ${save.selected}</small>` : 'Deploy again';
  showScreen('end');
  G = null;
}
function countUp(el, value) {
  if (reduceMotion() || value < 10) { el.textContent = value.toLocaleString(); return; }
  const start = performance.now(), dur = 700;
  const step = now => {
    const f = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - f, 3);
    el.textContent = Math.round(value * e).toLocaleString();
    if (f < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- drawing ----------
// The simulation runs in a flat lane: x across, y down, LINE_Y the squad's
// line. Drawing projects that lane onto a road seen from behind the squad:
// depth z is the distance up the road from the line, everything scales by
// k(z) = D / (D + z), and screen y closes on the horizon as z grows. Rows
// below the line have negative z and draw larger, so the squad is close.
const P = { D: 380, VH: 470, VPX: (LANE_L + LANE_R) / 2 };
const HORIZON = LINE_Y - P.VH;
function proj(x, y) {
  const z = LINE_Y - y, k = P.D / (P.D + z);
  return { x: P.VPX + (x - P.VPX) * k, y: LINE_Y - P.VH * z / (P.D + z), k };
}
function poly(pts, fill, stroke, lw) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
}
/* A quad on the deck between world x0..x1 and y0..y1, projected. */
const quad = (x0, x1, y0, y1) => [proj(x0, y0), proj(x1, y0), proj(x1, y1), proj(x0, y1)];
const F = (w, s) => `${w} ${s}px "Chakra Petch", Impact, sans-serif`;
function strokeText(txt, x, y, size, color, weight, stroke) {
  ctx.font = F(weight || 700, size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, size / 7); ctx.lineJoin = 'round'; ctx.strokeStyle = stroke || 'rgba(6,10,20,.9)';
  ctx.strokeText(txt, x, y); ctx.fillStyle = color; ctx.fillText(txt, x, y);
}
function pill(x, y, w, h, fill, r = h / 2) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
}
const tagK = k => Math.max(0.6, Math.min(1.15, k));

// Static layers are painted once: the sky, the sea and the far shore.
const layers = {};
function makeLayer(name, w, h, paint) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h); layers[name] = c; return c;
}
function buildLayers() {
  makeLayer('sky', W, H, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, HORIZON + 10);
    sky.addColorStop(0, '#6fb0e6'); sky.addColorStop(0.7, '#b9dcf3'); sky.addColorStop(1, '#e6f1f9');
    g.fillStyle = sky; g.fillRect(0, 0, w, HORIZON + 10);
    // sun glare, top right
    const sun = g.createRadialGradient(300, 18, 4, 300, 18, 160);
    sun.addColorStop(0, 'rgba(255,250,230,.95)'); sun.addColorStop(0.12, 'rgba(255,245,215,.5)'); sun.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = sun; g.fillRect(120, -60, 260, 220);
    // thin clouds
    g.fillStyle = 'rgba(255,255,255,.55)';
    for (const [x, y, rw, rh] of [[40, 30, 60, 6], [120, 48, 90, 5], [230, 40, 70, 5], [10, 62, 50, 4], [290, 60, 60, 4]]) {
      g.beginPath(); g.ellipse(x, y, rw, rh, 0, 0, 6.28); g.fill();
    }
    // far shore: a hazy skyline on the horizon
    g.fillStyle = 'rgba(120,150,180,.35)';
    for (let i = 0; i < 26; i++) { const x = (i * 17 + 3) % (w + 10) - 5, th = 6 + (i * 37) % 22; g.fillRect(x, HORIZON - th, 9 + (i % 3) * 4, th); }
    g.fillStyle = 'rgba(150,175,200,.45)';
    for (let i = 0; i < 40; i++) { const x = (i * 11 + 7) % (w + 10) - 5, th = 3 + (i * 23) % 9; g.fillRect(x, HORIZON - th, 6, th); }
    // the sea, from the horizon down
    const sea = g.createLinearGradient(0, HORIZON, 0, h);
    sea.addColorStop(0, '#a9d3ea'); sea.addColorStop(0.12, '#5da6d6'); sea.addColorStop(0.5, '#3a86bd'); sea.addColorStop(1, '#2c6c9e');
    g.fillStyle = sea; g.fillRect(0, HORIZON, w, h - HORIZON);
    for (let i = 0; i < 160; i++) {
      const t = (i * 7919) % 1000 / 1000, y = HORIZON + 4 + t * t * (h - HORIZON), x = (i * 97) % w, len = 3 + t * 24;
      g.fillStyle = `rgba(255,255,255,${0.10 + (i % 5) * 0.05})`; g.fillRect(x, y, len, 1 + t);
    }
  });
  makeLayer('vignette', W, H, (g, w, h) => {
    const v = g.createRadialGradient(w / 2, h * 0.5, h * 0.4, w / 2, h * 0.5, h * 0.85);
    v.addColorStop(0, 'rgba(20,30,50,0)'); v.addColorStop(1, 'rgba(20,30,50,.28)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
  });
}

const FAR = -7000;       // the road is drawn to the horizon, far past every spawn
function drawBridge() {
  ctx.drawImage(layers.sky, 0, 0);
  // the deck's shadow on the water, then the deck itself, near end widest
  const near = H + 20;
  poly(quad(LANE_L - 22, LANE_R + 22, FAR, near), 'rgba(10,30,60,.30)');
  const deck = ctx.createLinearGradient(0, HORIZON, 0, H);
  deck.addColorStop(0, '#c7d1da'); deck.addColorStop(0.25, '#cfcbbf'); deck.addColorStop(1, '#ddd6c6');
  poly(quad(LANE_L - 16, LANE_R + 16, FAR, near), deck);
  // expansion joints and a faint wear track down each side
  for (let y = LINE_Y + 80; y > -2400; y -= 80) {
    const a = proj(LANE_L, y), b = proj(LANE_R, y);
    ctx.strokeStyle = `rgba(60,70,90,${0.10 * a.k})`; ctx.lineWidth = Math.max(0.5, 1.5 * a.k);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  poly(quad(LANE_L + 34, LANE_L + 70, FAR, near), 'rgba(90,90,80,.05)');
  poly(quad(LANE_R - 70, LANE_R - 34, FAR, near), 'rgba(90,90,80,.05)');
  // lane edge lines and centre dashes
  poly(quad(LANE_L + 6, LANE_L + 9, FAR, near), 'rgba(170,120,40,.45)');
  poly(quad(LANE_R - 9, LANE_R - 6, FAR, near), 'rgba(170,120,40,.45)');
  for (let y = LINE_Y + 60; y > -3000; y -= 44) poly(quad(P.VPX - 2.5, P.VPX + 2.5, y, y - 22), 'rgba(255,255,255,.55)');
  // concrete barriers along both edges: top face lifted by their height
  for (const [x0, x1] of [[LANE_L - 16, LANE_L - 2], [LANE_R + 2, LANE_R + 16]]) {
    const base = quad(x0, x1, FAR, near);
    const lift = base.map(p => ({ x: p.x, y: p.y - 12 * p.k }));
    poly([base[3], base[2], lift[2], lift[3]], '#b8b3a6');                   // near face
    poly([base[0], base[1], base[2], base[3]], '#a39e91');                   // inner face
    poly(lift, '#e8e3d6');                                                    // top
    poly([lift[0], lift[3], base[3], base[0]].map(p => p), 'rgba(0,0,0,0)'); // (edge)
  }
  // barrier shadows onto the deck, sun from the upper right
  poly(quad(LANE_L - 2, LANE_L + 8, FAR, near), 'rgba(40,50,70,.10)');
  // light poles every 160 up the road
  for (let y = LINE_Y + 40; y > -2400; y -= 160) {
    for (const [x, flip] of [[LANE_L - 9, false], [LANE_R + 9, true]]) {
      const p = proj(x, y);
      if (!(art && art.draw(ctx, 'lamp', p.x, p.y - 6 * p.k, PPU.lamp * p.k, { flip }))) {
        ctx.fillStyle = '#7a8090'; ctx.fillRect(p.x - 1.5 * p.k, p.y - 34 * p.k, 3 * p.k, 34 * p.k);
      }
    }
  }
  // the line
  const a = proj(LANE_L, LINE_Y), b = proj(LANE_R, LINE_Y);
  const lg = ctx.createLinearGradient(a.x, 0, b.x, 0);
  lg.addColorStop(0, 'rgba(255,170,40,0)'); lg.addColorStop(0.5, 'rgba(255,170,40,.85)'); lg.addColorStop(1, 'rgba(255,170,40,0)');
  ctx.fillStyle = lg; ctx.fillRect(a.x, a.y - 1.5, b.x - a.x, 3);
}
/* A standing glass slab across world x0..x1 at world y, `hgt` tall, in a colour. */
function slab(x0, x1, y, hgt, rgb, alpha, edgeAlpha) {
  const b0 = proj(x0, y), b1 = proj(x1, y), h = hgt * b0.k;
  const face = ctx.createLinearGradient(0, b0.y - h, 0, b0.y);
  face.addColorStop(0, `rgba(${rgb},${alpha})`); face.addColorStop(1, `rgba(${rgb},${alpha * 0.45})`);
  poly([{ x: b0.x, y: b0.y - h }, { x: b1.x, y: b1.y - h }, b1, b0], face);
  ctx.fillStyle = `rgba(255,255,255,${edgeAlpha})`; ctx.fillRect(b0.x, b0.y - h - 1.5 * b0.k, b1.x - b0.x, 2.5 * b0.k);
  // the slab's shadow on the deck, cast to the lower left
  poly([b0, b1, proj(x1 - 6, y + 14), proj(x0 - 6, y + 14)], `rgba(20,40,80,${0.12 * alpha})`);
  return { b0, b1, h, k: b0.k };
}
function drawGate(g) {
  const near = Math.max(0, 1 - Math.abs(LINE_Y - g.y) / 140);
  const halves = [[g.l, LANE_L + 2, W / 2 - 3, 'l'], [g.r, W / 2 + 3, LANE_R - 2, 'r']];
  for (const [h, x0, x1, side] of halves) {
    const isW = h.kind === 'weapon';
    const eff = isW ? 0 : gateValue(h, G.st.gate);
    const good = isW || h.kind === 'mul' || eff >= 0;
    const rgb = isW ? '255,182,64' : good ? '77,163,255' : '255,77,94';
    if (g.applied) {
      // the crossed half flashes white and dissolves; the other half sinks into the deck
      const f = Math.max(0, g.fade / GATE_FADE), gone = 1 - f;
      ctx.save();
      if (side === g.side) {
        ctx.globalAlpha = f * f;
        const s = slab(x0, x1, g.y, 36 * (reduceMotion() ? 1 : 1 + gone * 0.3), rgb, 0.6, 0.9);
        ctx.fillStyle = `rgba(255,255,255,${0.8 * f})`;
        poly([{ x: s.b0.x, y: s.b0.y - s.h }, { x: s.b1.x, y: s.b1.y - s.h }, s.b1, s.b0], `rgba(255,255,255,${0.8 * f})`);
      } else {
        ctx.globalAlpha = f * 0.7;
        slab(x0, x1, g.y, 36 * (reduceMotion() ? 1 : f), '150,165,190', 0.4, 0.3);
      }
      ctx.restore();
      continue;
    }
    const flash = h.hitT > 0 ? 0.25 : 0;
    const s = slab(x0, x1, g.y, 36, rgb, 0.62 + flash, 0.85);
    if (near > 0) { ctx.strokeStyle = `rgba(255,255,255,${near * 0.8})`; ctx.lineWidth = 1.5; poly([{ x: s.b0.x, y: s.b0.y - s.h }, { x: s.b1.x, y: s.b1.y - s.h }, s.b1, s.b0], null, `rgba(255,255,255,${near * 0.8})`, 1.5); }
    const cx = (s.b0.x + s.b1.x) / 2, cy = s.b0.y - s.h / 2, k = s.k;
    // chevrons for direction of change
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    if (!isW) for (const dx of [-52 * k, 52 * k]) {
      const u = 7 * k;
      ctx.beginPath();
      if (good) { ctx.moveTo(cx + dx - u, cy + u * 0.7); ctx.lineTo(cx + dx, cy - u * 0.6); ctx.lineTo(cx + dx + u, cy + u * 0.7); ctx.lineTo(cx + dx, cy + u * 0.15); }
      else { ctx.moveTo(cx + dx - u, cy - u * 0.7); ctx.lineTo(cx + dx, cy + u * 0.6); ctx.lineTo(cx + dx + u, cy - u * 0.7); ctx.lineTo(cx + dx, cy - u * 0.15); }
      ctx.closePath(); ctx.fill();
    }
    const txt = isW ? WEAPONS[h.v].name : h.kind === 'mul' ? '×' + h.v : (eff >= 0 ? '+' + eff : String(eff));
    strokeText(txt, cx, cy + 1, (isW ? 17 : 25) * Math.max(0.5, k), '#fff');
  }
}
function drawEnemies() {
  const sorted = G.husks.slice().sort((a, b) => a.y - b.y);
  const packs = new Map();
  for (const h of sorted) {
    const sway = Math.sin(h.wob) * (h.kind === 'runner' ? 2.5 : 1.5);
    const p = proj(h.x + sway, h.y), r = h.r * p.k;
    const frame = Math.floor(h.wob / 3.14) % 2;
    const drawn = art && art.draw(ctx, h.kind + '_' + frame, p.x, p.y, (h.kind === 'brute' ? PPU.brute : PPU.unit) * p.k);
    if (!drawn) drawEnemyVector(h, p.x, p.y, r);
    if (h.hurt > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y - r * 0.6, r * 0.9, 0, 6.28); ctx.fill(); ctx.restore();
    }
    if (h.parked) { ctx.fillStyle = 'rgba(255,77,94,.4)'; ctx.fillRect(p.x - r - 4, p.y + r * 0.6, r * 2 + 8, 3); }
    const t = packs.get(h.pack) || { n: 0, sx: 0, top: 1e9, hp: 0, kind: h.kind };
    t.n++; t.sx += h.x; t.top = Math.min(t.top, h.y - h.r * 2.4); t.hp += h.hp; packs.set(h.pack, t);
  }
  for (const t of packs.values()) {
    const p = proj(t.sx / t.n, t.top), k = tagK(p.k), y = p.y - 14 * k;
    if (t.kind === 'brute') {
      const txt = String(Math.ceil(t.hp)), w = Math.max(48, txt.length * 12 + 16) * k;
      pill(p.x - w / 2, y - 12 * k, w, 24 * k, '#8b5cf6', 6 * k);
      strokeText(txt, p.x, y + 1, 18 * k, '#fff');
    } else {
      pill(p.x - 24 * k, y - 12 * k, 48 * k, 24 * k, '#ff4d5e', 6 * k);
      strokeText('-' + t.n, p.x, y + 1, 18 * k, '#fff');
    }
  }
}
function drawEnemyVector(h, x, y, r) {
  const hurt = h.hp < h.max * 0.5;
  ctx.fillStyle = 'rgba(20,30,40,.35)'; ctx.beginPath(); ctx.ellipse(x - r * 0.4, y + r - 1, r, r * 0.45, 0, 0, 6.28); ctx.fill();
  if (h.kind === 'brute') {
    ctx.fillStyle = hurt ? '#9a86b8' : '#7a6299';
    ctx.fillRect(x - r, y - r * 0.4, r * 2, r * 1.3);
    ctx.beginPath(); ctx.arc(x, y - r * 0.3, r * 0.9, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#2f2440'; ctx.fillRect(x - r * 0.9, y + r * 0.2, r * 1.8, r * 0.6);
  } else if (h.kind === 'runner') {
    ctx.fillStyle = hurt ? '#d7c8a8' : '#c2ad85';
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.3, 0, 0, 6.28); ctx.fill();
  } else {
    ctx.fillStyle = hurt ? '#b8c7b0' : '#97ab95';
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
  }
  ctx.fillStyle = '#e94b5a'; ctx.fillRect(x - 3, y - 2, 2, 2); ctx.fillRect(x + 1, y - 2, 2, 2);
}
function drawSquad() {
  const pts = formation(G.count, G.cx), bobOn = !reduceMotion();
  const now = performance.now();
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = proj(pts[i].x, pts[i].y);
    const frame = Math.floor(now / 160 + i) % 2;
    const drawn = art && art.draw(ctx, 'soldier_' + frame, p.x, p.y, PPU.unit * p.k);
    if (!drawn) {
      const bob = bobOn ? Math.sin(now / 120 + i) : 0, k = p.k;
      ctx.fillStyle = 'rgba(20,30,40,.3)'; ctx.beginPath(); ctx.ellipse(p.x - 3 * k, p.y + 14 * k, 7 * k, 3 * k, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#2f5fb5'; ctx.fillRect(p.x - 5 * k, p.y + (-2 + bob) * k, 10 * k, 14 * k);
      ctx.fillStyle = '#c98a3a'; ctx.fillRect(p.x - 4 * k, p.y + (-1 + bob) * k, 8 * k, 6 * k);
      ctx.fillStyle = '#ffd9a8'; ctx.beginPath(); ctx.arc(p.x, p.y + (-7 + bob) * k, 4.5 * k, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#243a6b'; ctx.fillRect(p.x - 5 * k, p.y + (-12 + bob) * k, 10 * k, 4 * k);
    }
    if (G.muzzleT > 0 && i < WEAPONS[G.weapon].tracers) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (!(art && art.draw(ctx, 'muzzle', p.x + 3 * p.k, p.y - 20 * p.k, PPU.unit * p.k, { alpha: 0.9 }))) {
        ctx.fillStyle = 'rgba(255,220,140,.8)'; ctx.beginPath(); ctx.arc(p.x + 3 * p.k, p.y - 18 * p.k, 4 * p.k, 0, 6.28); ctx.fill();
      }
      ctx.restore();
    }
  }
  const rows = Math.ceil(Math.min(G.count, 24) / (inBay(G.cx) ? 4 : 6));
  const p = proj(G.cx, LINE_Y + rows * 13 + 10), k = Math.min(1.25, p.k);
  const pulse = G.tagPulse > 0 && !reduceMotion() ? 1 + Math.sin((G.tagPulse / 0.35) * Math.PI) * 0.22 : 1;
  ctx.save(); ctx.translate(Math.max(44, p.x), Math.min(H - 16, p.y)); ctx.scale(pulse * k, pulse * k);
  pill(-32, -13, 64, 26, G.flash > 0 ? '#ff4d5e' : '#ffb640', 8);
  strokeText(String(G.count), 0, 1, 20, '#1a1200', 700, 'rgba(0,0,0,0)');
  ctx.restore();
}
function drawBullets() {
  for (const b of G.bullets) {
    const p = proj(b.x, b.y), k = p.k;
    if (b.w === 'rail') {
      ctx.fillStyle = 'rgba(120,200,255,.35)'; ctx.fillRect(p.x - 3 * k, p.y, 6 * k, 44 * k);
      ctx.fillStyle = '#eafcff'; ctx.fillRect(p.x - k, p.y, 2 * k, 44 * k);
    } else if (b.w === 'shotgun') {
      ctx.fillStyle = 'rgba(255,200,90,.5)'; ctx.fillRect(p.x - 2.5 * k, p.y - 2.5 * k, 5 * k, 5 * k);
      ctx.fillStyle = '#fff4d0'; ctx.fillRect(p.x - k, p.y - k, 2 * k, 2 * k);
    } else {
      ctx.fillStyle = 'rgba(255,190,80,.35)'; ctx.fillRect(p.x - 2.5 * k, p.y - k, 5 * k, 15 * k);
      ctx.fillStyle = '#fff4d0'; ctx.fillRect(p.x - k, p.y, 2 * k, 12 * k);
      ctx.fillStyle = 'rgba(255,160,40,.35)'; ctx.fillRect(p.x - 0.5 * k, p.y + 12 * k, k, 18 * k);
    }
  }
}
function drawBay() {
  // a stone platform beside the road, with a parapet, a walkway into the lane and chains
  const near = H + 40;
  poly(quad(BAY.x0 - 6, BAY.x1 + 6, BAY.top + 8, near), 'rgba(10,30,60,.28)');
  poly(quad(BAY.x0 - 4, BAY.x1 + 4, BAY.top, near), '#9f9a90');
  const stone = ctx.createLinearGradient(0, proj(0, BAY.top).y, 0, H);
  stone.addColorStop(0, '#b9b3a6'); stone.addColorStop(1, '#cfc8b8');
  poly(quad(BAY.x0, BAY.x1, BAY.top + 6, near), stone);
  for (let y = BAY.top + 30; y < near; y += 26) { const a = proj(BAY.x0, y), b = proj(BAY.x1, y); ctx.strokeStyle = `rgba(40,40,50,${0.12 * a.k})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  for (let x = BAY.x0 + 24; x < BAY.x1; x += 26) poly(quad(x, x + 1, BAY.top + 6, near), 'rgba(40,40,50,.10)');
  // the walkway across the gap at line height
  poly(quad(BAY.x1, LANE_L, LINE_Y - 30, LINE_Y + 80), '#c4bdae');
  poly(quad(BAY.x1, LANE_L, LINE_Y - 30, LINE_Y - 27), 'rgba(255,255,255,.35)');
  // parapet on the outer edge and the far end
  { const base = quad(BAY.x0 - 4, BAY.x0 + 3, BAY.top, near), lift = base.map(p => ({ x: p.x, y: p.y - 10 * p.k }));
    poly(base, '#8f8a7e'); poly(lift, '#d9d3c5'); }
  { const base = quad(BAY.x0 - 4, BAY.x1 + 4, BAY.top, BAY.top + 6), lift = base.map(p => ({ x: p.x, y: p.y - 10 * p.k }));
    poly(base, '#8f8a7e'); poly(lift, '#d9d3c5'); }
  // the wheel on its stem, the count, and the chained giant
  const w = G.wheel, armed = w.rearmT <= 0 && w.left > 0;
  const wp = proj(BAY.cx, BAY.wheelY), wk = wp.k;
  ctx.fillStyle = 'rgba(20,30,40,.3)'; ctx.beginPath(); ctx.ellipse(wp.x - 6 * wk, wp.y + 4 * wk, 16 * wk, 6 * wk, 0, 0, 6.28); ctx.fill();
  ctx.save(); ctx.translate(wp.x, wp.y); ctx.rotate(w.spin);
  if (!(art && art.draw(ctx, 'wheel', 0, 0, PPU.wheel * wk))) {
    ctx.strokeStyle = '#8b2a26'; ctx.lineWidth = 4 * wk; ctx.beginPath(); ctx.arc(0, 0, 16 * wk, 0, 6.28); ctx.stroke();
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(i * 1.047) * 16 * wk, Math.sin(i * 1.047) * 16 * wk); ctx.stroke(); }
  }
  ctx.restore();
  if (w.hitT > 0) { w.hitT -= 0.016; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(wp.x, wp.y, 20 * wk, 0, 6.28); ctx.fill(); ctx.restore(); }
  const label = armed ? String(w.left) : w.rearmT > 0 ? Math.ceil(w.rearmT) + 's' : '0';
  const lk = Math.max(0.8, wk);
  pill(wp.x - 26 * lk, wp.y + 24 * lk, 52 * lk, 24 * lk, armed ? '#d8302c' : 'rgba(30,40,60,.6)', 6 * lk);
  strokeText(label, wp.x, wp.y + 37 * lk, 18 * lk, armed ? '#fff' : '#dfe6ee');
  ctx.font = `600 ${9 * lk}px Barlow, sans-serif`; ctx.fillStyle = '#3a4656'; ctx.textAlign = 'center';
  ctx.fillText(armed ? 'SHOOT TO OPEN' : 'SEALED', wp.x, wp.y + 58 * lk);
  if (!G.colossus && w.releases === 0) drawGiant(BAY.cx, BAY.giantY, 0, 0.9, true);
}
function drawGiant(wx, wy, frame, alpha, chained) {
  const p = proj(wx, wy), k = p.k;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(20,30,40,.4)'; ctx.beginPath(); ctx.ellipse(p.x - 14 * k, p.y + 6 * k, 34 * k, 12 * k, 0, 0, 6.28); ctx.fill();
  if (!(art && art.draw(ctx, 'colossus_' + frame, p.x, p.y, PPU.colossus * k))) {
    ctx.fillStyle = '#6b7080'; ctx.fillRect(p.x - 24 * k, p.y - 110 * k, 48 * k, 100 * k);
    ctx.fillStyle = '#bdf3ff'; ctx.fillRect(p.x - 2 * k, p.y - 100 * k, 4 * k, 60 * k);
  }
  if (chained) {
    ctx.strokeStyle = 'rgba(70,75,90,.6)'; ctx.lineWidth = 2.5 * k;
    for (const [ax, ay, bx, by] of [[wx - 30, wy - 70, BAY.x0 + 2, wy - 120], [wx + 30, wy - 70, BAY.x1 - 2, wy - 120], [wx - 20, wy - 20, BAY.x0 + 2, wy + 10], [wx + 20, wy - 20, BAY.x1 - 2, wy + 10]]) {
      const a = proj(ax, ay), b = proj(bx, by);
      ctx.beginPath(); ctx.moveTo(p.x + (a.x - p.x), a.y - (wy - ay) * k + (wy - ay) * k * 0 - 0); ctx.lineTo(b.x, b.y - (wy - by) * k * 0.4); ctx.stroke();
    }
  }
  ctx.restore();
}
function drawColossus() {
  const c = G.colossus; if (!c) return;
  const frame = c.phase === 'walk' ? Math.floor(c.wob * 1.4) % 2 : 0;
  const bob = c.phase === 'walk' && !reduceMotion() ? Math.abs(Math.sin(c.wob * 4.4)) * 4 : 0;
  drawGiant(c.x, c.y - bob, frame, 1, false);
  if (c.phase === 'walk' && c.stompT > COLOSSUS.stomp - 0.25) {
    const kk = (COLOSSUS.stomp - c.stompT) / 0.25, fp = proj(c.x + (c.foot ? -26 : 26), c.y - 10);
    ctx.strokeStyle = `rgba(90,100,120,${0.6 * (1 - kk)})`; ctx.lineWidth = 3 * fp.k;
    ctx.beginPath(); ctx.ellipse(fp.x, fp.y, COLOSSUS.radius * (0.3 + 0.7 * kk) * fp.k, COLOSSUS.radius * (0.3 + 0.7 * kk) * fp.k * 0.6, 0, 0, 6.28); ctx.stroke();
  }
}
function drawAllies() {
  if (G.frost) {
    const top = proj(LANE_L, LINE_Y - G.frost.band).y, bot = proj(LANE_L, LINE_Y).y;
    const band = ctx.createLinearGradient(0, top, 0, bot);
    band.addColorStop(0, 'rgba(120,210,255,0)'); band.addColorStop(1, 'rgba(120,210,255,.22)');
    poly(quad(LANE_L, LANE_R, LINE_Y - G.frost.band, LINE_Y), band);
    poly(quad(LANE_L, LANE_R, LINE_Y - G.frost.band, LINE_Y - G.frost.band + 2), 'rgba(120,210,255,.5)');
  }
  for (const h of G.helpers) {
    const p = proj(FLANK[h.side], FLANK.y), x = p.x, y = p.y, k = p.k;
    if (h.k === 'sentinel') {
      const recoil = !reduceMotion() && G.shellT > h.interval - 0.12 ? 3 * k : 0;
      if (!(art && art.draw(ctx, 'sentinel', x, y + recoil, PPU.sentinel * k))) {
        ctx.fillStyle = 'rgba(20,30,40,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 8 * k, 22 * k, 8 * k, 0, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#2a4d8f'; ctx.fillRect(x - 18 * k, y - 22 * k + recoil, 36 * k, 26 * k);
      }
    } else if (h.k === 'frost') {
      if (!(art && art.draw(ctx, 'frostlamp', x, y, PPU.frostlamp * k))) {
        ctx.fillStyle = '#2b3140'; ctx.fillRect(x - 12 * k, y - 6 * k, 24 * k, 8 * k); ctx.fillRect(x - 4 * k, y - 24 * k, 8 * k, 18 * k);
        ctx.fillStyle = 'rgba(120,210,255,.7)'; ctx.fillRect(x - 10 * k, y - 46 * k, 20 * k, 22 * k);
      }
      const pu = reduceMotion() ? 1 : 1 + Math.sin(performance.now() / 300) * 0.15;
      const halo = ctx.createRadialGradient(x, y - 36 * k, 2, x, y - 36 * k, 44 * k * pu);
      halo.addColorStop(0, 'rgba(140,220,255,.45)'); halo.addColorStop(1, 'rgba(140,220,255,0)');
      ctx.fillStyle = halo; ctx.fillRect(x - 50 * k, y - 90 * k, 100 * k, 100 * k);
    }
  }
}
function drawShells() {
  for (const sh of G.shells) {
    const t = sh.t / sh.dur, wx = sh.x0 + (sh.tx - sh.x0) * t, wy = sh.y0 + (sh.ty - sh.y0) * t;
    const g0 = proj(wx, wy), lift = Math.sin(t * Math.PI) * 120 * g0.k;
    ctx.fillStyle = 'rgba(20,30,40,.25)'; ctx.beginPath(); ctx.ellipse(g0.x, g0.y, 6 * g0.k, 3 * g0.k, 0, 0, 6.28); ctx.fill();
    const y = g0.y - lift, r = 9 * Math.max(0.6, g0.k);
    const g = ctx.createRadialGradient(g0.x, y, 1, g0.x, y, r);
    g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.5, 'rgba(255,182,64,.9)'); g.addColorStop(1, 'rgba(255,140,30,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(g0.x, y, r, 0, 6.28); ctx.fill();
  }
  for (const sh of G.shells) {
    const tp = proj(sh.tx, sh.ty), rr = sh.radius * (0.6 + 0.4 * sh.t / sh.dur) * tp.k;
    ctx.strokeStyle = `rgba(255,150,40,${0.3 + 0.4 * (sh.t / sh.dur)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(tp.x, tp.y, rr, rr * 0.6, 0, 0, 6.28); ctx.stroke();
  }
}
function drawBoss() {
  const b = G.boss; if (!b || b.hp <= 0) return;
  const bob = reduceMotion() ? 0 : Math.sin(b.wob * 2) * 1.5;
  const p = proj(b.x, b.y + 36 + bob), k = p.k;
  const drawn = art && art.draw(ctx, 'walker', p.x, p.y, PPU.walker * k);
  if (drawn && b.hitT > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35;
    art.draw(ctx, 'walker', p.x, p.y, PPU.walker * k); ctx.restore();
  }
  // the block's screen box, for the cracks, bar and number
  const w = b.w * k, h = b.h * k, x = p.x - w / 2, y = p.y - 36 * k - h / 2;
  if (!drawn) {
    const ice = ctx.createLinearGradient(x, y, x + w, y + h);
    ice.addColorStop(0, 'rgba(210,246,255,.85)'); ice.addColorStop(1, 'rgba(120,200,235,.8)');
    ctx.fillStyle = b.hitT > 0 ? 'rgba(255,255,255,.9)' : ice; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(70,84,60,.85)'; ctx.fillRect(p.x - 46 * k, y + 24 * k, 92 * k, 44 * k);
  }
  ctx.save(); ctx.translate(p.x, y + h / 2); ctx.scale(k, k);
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5 / k; ctx.lineJoin = 'round';
  for (const c of b.cracks) { ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (let i = 1; i < c.length; i++) ctx.lineTo(c[i][0], c[i][1]); ctx.stroke(); }
  ctx.restore();
  const frac = b.hp / b.max, bk = Math.max(0.55, k);
  pill(x + 12 * k, y + h - 12 * k, w - 24 * k, 7 * bk, 'rgba(0,0,0,.4)', 3);
  pill(x + 12 * k, y + h - 12 * k, Math.max(6, (w - 24 * k) * frac), 7 * bk, frac > 0.35 ? '#bdf3ff' : '#ffb640', 3);
  const bounce = reduceMotion() ? 1 : 1 + Math.max(0, b.hitT) * 2.5;
  ctx.save(); ctx.translate(p.x, y + h - 44 * k); ctx.scale(bounce * bk, bounce * bk);
  strokeText(Math.ceil(b.hp).toLocaleString(), 0, 0, 40, '#fff');
  ctx.restore();
}
function drawHUD() {
  ctx.textBaseline = 'middle';
  pill(12, 14, 74, 34, 'rgba(12,20,36,.72)', 10);
  ctx.font = F(600, 10); ctx.textAlign = 'left'; ctx.fillStyle = '#b7c3d6'; ctx.fillText('LEVEL', 22, 24);
  ctx.font = F(700, 18); ctx.fillStyle = '#ffffff'; ctx.fillText(String(G.level), 22, 39);
  const left = Math.max(0, RUN_T - G.t), f = Math.min(1, G.t / RUN_T);
  pill(W / 2 - 52, 10, 104, 42, 'rgba(12,20,36,.78)', 21);
  ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W / 2 - 31, 31, 13, 0, 6.28); ctx.stroke();
  ctx.strokeStyle = G.boss ? '#bdf3ff' : left < 10 ? '#ffb640' : '#5db2ff'; ctx.beginPath(); ctx.arc(W / 2 - 31, 31, 13, -Math.PI / 2, -Math.PI / 2 + f * 6.283); ctx.stroke();
  if (G.boss) strokeText('WALKER', W / 2 + 12, 31, 17, '#bdf3ff', 700, 'rgba(0,0,0,0)');
  else strokeText('0:' + String(Math.ceil(left)).padStart(2, '0'), W / 2 + 12, 32, 24, left < 10 ? '#ffb640' : '#ffffff', 700, 'rgba(0,0,0,0)');
  if (G.weapon !== 'rifle') {
    const pulse = G.wpnT > 0 && !reduceMotion() ? 1 + Math.sin(G.wpnT * 12) * 0.08 : 1;
    ctx.save(); ctx.translate(W / 2, 66); ctx.scale(pulse, pulse);
    pill(-34, -9, 68, 18, 'rgba(12,20,36,.7)', 9);
    strokeText(WEAPONS[G.weapon].name, 0, 1, 11, '#ffb640', 600, 'rgba(0,0,0,0)');
    ctx.restore();
  }
  pill(W - 108, 14, 96, 34, 'rgba(12,20,36,.72)', 10);
  ctx.fillStyle = '#ffb640'; ctx.beginPath(); ctx.arc(W - 94, 31, 6, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#b57a1c'; ctx.beginPath(); ctx.arc(W - 94, 31, 3, 0, 6.28); ctx.fill();
  ctx.font = F(700, 18); ctx.textAlign = 'right'; ctx.fillStyle = '#ffb640'; ctx.fillText(G.coins.toLocaleString(), W - 20, 32);
  if (G.surge > 0) {
    const pulse = reduceMotion() ? 0.5 : 0.5 + Math.sin(performance.now() / 160) * 0.5;
    ctx.fillStyle = `rgba(255,60,80,${0.05 + pulse * 0.07})`; ctx.fillRect(0, 0, W, H);
    pill(W / 2 - 44, 82, 88, 20, 'rgba(200,30,50,.8)', 10);
    strokeText('SURGE ' + Math.ceil(G.surge), W / 2, 93, 12, '#fff', 700, 'rgba(0,0,0,0)');
  }
  if (G.surgeBanner > 0) {
    ctx.globalAlpha = Math.min(1, G.surgeBanner / 0.4);
    pill(W / 2 - 130, 296, 260, 54, 'rgba(12,20,36,.85)', 12);
    strokeText('THE HORDE ANSWERS', W / 2, 316, 22, '#ff4d5e', 700, 'rgba(0,0,0,0)');
    ctx.font = 'italic 500 12px Barlow, sans-serif'; ctx.fillStyle = '#b7c3d6'; ctx.textAlign = 'center';
    ctx.fillText('twice the packs, twice as often, for ' + SURGE.duration + ' seconds', W / 2, 338);
    ctx.globalAlpha = 1;
  }
  if (G.banner > 0) {
    const a = Math.min(1, G.banner / 0.4), rise = reduceMotion() ? 0 : (1 - Math.min(1, (1.6 - G.banner) / 0.3)) * 12;
    ctx.globalAlpha = a;
    pill(W / 2 - 120, 222 + rise, 240, 70, 'rgba(12,20,36,.82)', 12);
    strokeText('HOLD THE LINE', W / 2, 246 + rise, 26, '#ffb640', 700, 'rgba(0,0,0,0)');
    ctx.font = 'italic 500 13px Barlow, sans-serif'; ctx.fillStyle = '#b7c3d6'; ctx.textAlign = 'center';
    ctx.fillText('sixty seconds, then the walker', W / 2, 272 + rise);
    ctx.globalAlpha = 1;
  }
  if (paused) {
    ctx.fillStyle = 'rgba(12,20,36,.7)'; ctx.fillRect(0, 0, W, H);
    strokeText('PAUSED', W / 2, H / 2 - 10, 36, '#fff');
    ctx.font = 'italic 500 14px Barlow, sans-serif'; ctx.fillStyle = '#b7c3d6'; ctx.textAlign = 'center';
    ctx.fillText('tap the clock or press P to continue', W / 2, H / 2 + 22);
  }
}
function draw() {
  ctx.save();
  if (G && G.shake > 0 && !reduceMotion()) ctx.translate(rnd(-G.shake, G.shake), rnd(-G.shake, G.shake));
  drawBridge();
  if (G) {
    drawBay();
    for (const g of G.gates.slice().sort((a, b) => a.y - b.y)) drawGate(g);
    drawEnemies();
    drawBoss();
    drawAllies();
    drawColossus();
    drawBullets();
    drawShells();
    for (const q of G.parts) {
      const p = proj(q.x, q.y), k = p.k;
      ctx.globalAlpha = 1 - q.t / q.life; ctx.fillStyle = q.color;
      if (q.shard) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(q.rot); ctx.scale(k, k); ctx.fillRect(-q.len / 2, -1.5, q.len, 3); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(-q.len / 2, -1.5, q.len, 1); ctx.restore(); }
      else ctx.fillRect(p.x - 2 * k, p.y - 2 * k, 4 * k, 4 * k);
    }
    ctx.globalAlpha = 1;
    drawSquad();
    for (const f of G.floats) {
      const p = proj(f.x, f.y), k = tagK(p.k);
      ctx.globalAlpha = 1 - Math.max(0, f.t - (f.life - 0.5)) / 0.5;
      if (f.pop) {
        const kk = Math.min(1, f.t / 0.18), sc = (reduceMotion() ? 1 : 1.7 - 0.7 * (1 - Math.pow(1 - kk, 3))) * k;
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sc, sc);
        pill(-f.size * 1.6, -f.size * 0.75, f.size * 3.2, f.size * 1.5, 'rgba(12,20,36,.6)', f.size * 0.4);
        strokeText(f.txt, 0, 0, f.size, f.color);
        ctx.restore();
        if (f.caption) { ctx.font = `600 ${12 * k}px Barlow, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(12,20,36,.8)'; ctx.lineWidth = 3; ctx.strokeText(f.caption.toUpperCase(), p.x, p.y + f.size * 0.95 * k); ctx.fillText(f.caption.toUpperCase(), p.x, p.y + f.size * 0.95 * k); }
      } else strokeText(f.txt, p.x, p.y, f.size * k, f.color);
    }
    ctx.globalAlpha = 1;
    if (G.flash > 0) { ctx.fillStyle = `rgba(255,77,94,${G.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
  }
  ctx.drawImage(layers.vignette, 0, 0);
  if (G) drawHUD();
  ctx.restore();
}

// ---------- loop & input ----------
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  if (!paused) update(dt);
  draw();
  requestAnimationFrame(frame);
}
function setup() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const toXY = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
cv.addEventListener('pointerdown', e => {
  const p = toXY(e);
  if (G && p.y < 70 && Math.abs(p.x - W / 2) < 70) { paused = !paused; return; }
  if (paused) return;
  pointerX = p.x; cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', e => { if (!paused && (e.buttons || e.pointerType === 'touch')) pointerX = toXY(e).x; });
cv.addEventListener('pointerup', () => { pointerX = null; });
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyP' && G) paused = !paused;
  if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden && G) paused = true; });
window.addEventListener('resize', setup);

setup(); buildLayers(); renderHome(); showScreen('home');
// ?debug exposes the live run for tuning scripts and headless bots.
if (location.search.includes('debug')) window.bridgehold = { get run() { return G; }, get save() { return save; }, W, LINE_Y, LANE_L, BAY };
if (document.fonts && document.fonts.load) {
  Promise.all([document.fonts.load('700 40px "Chakra Petch"'), document.fonts.load('600 14px "Chakra Petch"')]).catch(() => {});
}
last = performance.now();
requestAnimationFrame(frame);
