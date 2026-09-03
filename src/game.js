import {
  RUN_T, LINE_Y, DEFAULT_SAVE, UPGRADES, UNLOCKS, ENEMIES, WEAPONS, BOSS, HELPERS,
  cost, statsFor, huskHP, bossHP, bossReward, clearBonus, coinPerKill,
  packKind, packSize, packInterval, GATE_INTERVAL, gateStepFor, gateHalf, helpersFor, hitGate, gateValue, applyGate, recordRun,
} from './balance.js';
import { createAudio } from './audio.js';
import { loadArt } from './art.js';

const W = 360, H = 640, LANE_L = 34, LANE_R = 326;
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const osReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = id => document.getElementById(id);

// Game pixels per Blender unit, per sprite family. The walker is drawn at a
// larger scale on purpose: it is meant to be monumental.
const PPU = { unit: 14, brute: 16, walker: 45, lamp: 11, sentinel: 17, frostlamp: 19 };
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
  };
  G.frost = G.helpers.find(h => h.k === 'frost') || null;
  showScreen(null);
  paused = false; last = performance.now();
}

// ---------- spawning ----------
const rnd = (a, b) => a + Math.random() * (b - a);
function spawnPack() {
  const kind = packKind(G.level, Math.random()), E = ENEMIES[kind];
  const size = packSize(kind, G.level, Math.random());
  const hp = huskHP(G.level, G.t) * E.hp, spd = (rnd(52, 76) + G.level * 2.5) * E.speed;
  const pack = { units: [], kind };
  const unit = (x, y) => ({ x, y, hp, max: hp, vy: spd * rnd(0.92, 1.08), wob: rnd(0, 6.28), pack, kind, r: E.r, chewT: 0, parked: false, hurt: 0 });
  if (kind === 'runner') {
    const cx = rnd(LANE_L + 24, LANE_R - 24);
    for (let i = 0; i < size; i++) pack.units.push(unit(cx + rnd(-14, 14), -30 - i * 16 - rnd(0, 6)));
  } else if (kind === 'brute') {
    for (let i = 0; i < size; i++) pack.units.push(unit(rnd(LANE_L + 40, LANE_R - 40), -40 - i * 60));
  } else {
    const rad = Math.min(58, 12 + size * 1.5);
    const cx = rnd(LANE_L + rad, LANE_R - rad), cy = -40 - rnd(0, 50);
    for (let i = 0; i < size; i++) {
      const a = rnd(0, Math.PI * 2), r = Math.sqrt(Math.random()) * rad;
      pack.units.push(unit(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8));
    }
  }
  G.husks.push(...pack.units);
}
function spawnGate() {
  G.gates.push({ y: -30, l: gateHalf(Math.random(), G.level), r: gateHalf(Math.random(), G.level), applied: false });
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
function formation(count, cx) {
  const n = Math.min(count, 24), per = 6, pts = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / per), inRow = Math.min(per, n - row * per), col = i - row * per;
    pts.push({ x: cx + (col - (inRow - 1) / 2) * 20, y: LINE_Y + row * 17 });
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
    if (h.y < 20) continue;
    const p = packs.get(h.pack) || { hp: 0, sx: 0, sy: 0, n: 0 };
    p.hp += h.hp; p.sx += h.x; p.sy += h.y; p.n++; packs.set(h.pack, p);
  }
  let best = null;
  for (const p of packs.values()) if (!best || p.hp > best.hp) best = p;
  return best ? { x: best.sx / best.n, y: best.sy / best.n } : null;
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
    if (k) { G.tx = G.cx + k * 320 * dt; pointerX = null; }
    const half = (Math.min(G.count, 6) - 1) / 2 * 20 + 10;
    G.tx = Math.max(LANE_L + half, Math.min(LANE_R - half, G.tx));
    G.cx += (G.tx - G.cx) * Math.min(1, dt * 14);
  }

  // spawns
  if (G.over === 0 && !G.boss) {
    if (G.t < RUN_T) {
      G.packT -= dt;
      if (G.packT <= 0) { spawnPack(); G.packT = packInterval(G.t); }
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
    let dead = b.y < -20 || b.x < LANE_L - 6 || b.x > LANE_R + 6;
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
const F = (w, s) => `${w} ${s}px "Chakra Petch", Impact, sans-serif`;
function strokeText(txt, x, y, size, color, weight, stroke) {
  ctx.font = F(weight || 700, size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, size / 7); ctx.lineJoin = 'round'; ctx.strokeStyle = stroke || 'rgba(6,10,20,.9)';
  ctx.strokeText(txt, x, y); ctx.fillStyle = color; ctx.fillText(txt, x, y);
}
function pill(x, y, w, h, fill, r = h / 2) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
}

// Static layers are painted once to offscreen canvases: the drowned city and
// water behind the bridge, the asphalt grain, and the vignette.
const layers = {};
function makeLayer(name, w, h, paint) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h); layers[name] = c; return c;
}
function buildLayers() {
  makeLayer('sky', W, H, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#070d1c'); sky.addColorStop(0.55, '#0c1730'); sky.addColorStop(1, '#0a1428');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    // moon and haze
    const moon = g.createRadialGradient(292, 70, 4, 292, 70, 90);
    moon.addColorStop(0, 'rgba(210,228,255,.55)'); moon.addColorStop(0.18, 'rgba(180,205,255,.18)'); moon.addColorStop(1, 'rgba(120,160,255,0)');
    g.fillStyle = moon; g.fillRect(180, 0, 180, 200);
    g.fillStyle = '#d9e6ff'; g.beginPath(); g.arc(292, 70, 12, 0, 6.28); g.fill();
    g.fillStyle = '#0c1730'; g.beginPath(); g.arc(297, 66, 11, 0, 6.28); g.fill();
    // two rows of drowned towers
    const towers = (seed, base, hmin, hmax, col) => {
      g.fillStyle = col;
      for (let i = 0; i < 14; i++) {
        const x = (i * 29 + seed) % (w + 30) - 15, th = hmin + ((i * 53 + seed) % (hmax - hmin));
        g.fillRect(x, base - th, 18 + (i % 3) * 5, th + 40);
      }
    };
    towers(7, 330, 60, 180, '#0b1327');
    towers(19, 360, 30, 120, '#101b34');
    // lit windows
    for (let i = 0; i < 90; i++) {
      const x = (i * 71 + 5) % w, y = 200 + (i * 37) % 150;
      g.fillStyle = i % 4 === 0 ? 'rgba(255,196,110,.45)' : 'rgba(255,214,150,.22)';
      g.fillRect(x, y, 2, 3);
    }
    // water under the bridge, both sides
    const water = g.createLinearGradient(0, 360, 0, h);
    water.addColorStop(0, '#0a1a33'); water.addColorStop(1, '#050b18');
    g.fillStyle = water; g.fillRect(0, 360, w, h - 360);
    for (let i = 0; i < 80; i++) {
      const y = 372 + (i * 13) % (h - 380), x = (i * 97) % w, len = 8 + (i * 7) % 22;
      g.fillStyle = `rgba(150,190,255,${0.05 + (i % 5) * 0.02})`; g.fillRect(x, y, len, 1);
    }
    for (let i = 0; i < 12; i++) {
      const x = (i * 131 + 40) % w;
      const glow = g.createLinearGradient(0, 380, 0, 520);
      glow.addColorStop(0, 'rgba(255,190,110,.10)'); glow.addColorStop(1, 'rgba(255,190,110,0)');
      g.fillStyle = glow; g.fillRect(x, 380, 3, 140);
    }
  });
  makeLayer('grain', 64, 64, (g, w, h) => {
    g.fillStyle = '#3a4252'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      const v = 46 + Math.floor(Math.random() * 24);
      g.fillStyle = `rgba(${v},${v + 6},${v + 16},${0.35 + Math.random() * 0.4})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
  });
  makeLayer('vignette', W, H, (g, w, h) => {
    const v = g.createRadialGradient(w / 2, h * 0.5, h * 0.35, w / 2, h * 0.5, h * 0.8);
    v.addColorStop(0, 'rgba(5,8,18,0)'); v.addColorStop(1, 'rgba(5,8,18,.55)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
  });
  layers.grainPattern = ctx.createPattern(layers.grain, 'repeat');
}

function drawBridge() {
  ctx.drawImage(layers.sky, 0, 0);
  // deck shadow onto the water, girders, deck
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(LANE_L - 22, 0, LANE_R - LANE_L + 44, H);
  ctx.fillStyle = '#242b39'; ctx.fillRect(LANE_L - 16, 0, LANE_R - LANE_L + 32, H);
  ctx.save();
  ctx.translate(0, stripe % 64);
  ctx.fillStyle = layers.grainPattern; ctx.fillRect(LANE_L, -64, LANE_R - LANE_L, H + 64);
  ctx.restore();
  // lane markings
  ctx.fillStyle = 'rgba(255,255,255,.10)';
  for (let y = -40 + (stripe % 40); y < H; y += 40) ctx.fillRect(W / 2 - 2, y, 4, 22);
  ctx.fillStyle = 'rgba(255,214,120,.16)'; ctx.fillRect(LANE_L + 6, 0, 2, H); ctx.fillRect(LANE_R - 8, 0, 2, H);
  // expansion joints
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  for (let y = -160 + stripe; y < H; y += 160) ctx.fillRect(LANE_L, y, LANE_R - LANE_L, 2);
  // lamp pools on the deck
  for (let y = -160 + stripe + 30; y < H + 60; y += 160) {
    for (const x of [LANE_L - 4, LANE_R + 4]) {
      const pool = ctx.createRadialGradient(x, y, 4, x, y, 110);
      pool.addColorStop(0, 'rgba(255,196,110,.16)'); pool.addColorStop(1, 'rgba(255,196,110,0)');
      ctx.fillStyle = pool; ctx.fillRect(x - 110, y - 110, 220, 220);
    }
  }
  // rails and posts
  ctx.fillStyle = '#4c5568'; ctx.fillRect(LANE_L - 14, 0, 6, H); ctx.fillRect(LANE_R + 8, 0, 6, H);
  ctx.fillStyle = '#6b7590'; ctx.fillRect(LANE_L - 14, 0, 6, 1);
  ctx.fillStyle = '#7a8498';
  for (let y = -20 + (stripe % 60); y < H; y += 60) { ctx.fillRect(LANE_L - 16, y, 10, 4); ctx.fillRect(LANE_R + 6, y, 10, 4); }
  // lamps
  for (let y = -160 + stripe + 30; y < H + 60; y += 160) {
    for (const [x, flip] of [[LANE_L - 11, false], [LANE_R + 11, true]]) {
      if (!(art && art.draw(ctx, 'lamp', x, y, PPU.lamp, { flip }))) {
        ctx.fillStyle = '#5a6376'; ctx.fillRect(x - 1.5, y - 30, 3, 30);
        ctx.fillStyle = '#ffd9a0'; ctx.beginPath(); ctx.arc(x + (flip ? -6 : 6), y - 28, 3, 0, 6.28); ctx.fill();
      }
      const halo = ctx.createRadialGradient(x, y - 28, 1, x, y - 28, 22);
      halo.addColorStop(0, 'rgba(255,210,140,.45)'); halo.addColorStop(1, 'rgba(255,210,140,0)');
      ctx.fillStyle = halo; ctx.fillRect(x - 22, y - 50, 44, 44);
    }
  }
  // the line
  const lg = ctx.createLinearGradient(LANE_L, 0, LANE_R, 0);
  lg.addColorStop(0, 'rgba(255,182,64,0)'); lg.addColorStop(0.5, 'rgba(255,182,64,.7)'); lg.addColorStop(1, 'rgba(255,182,64,0)');
  ctx.fillStyle = lg; ctx.fillRect(LANE_L, LINE_Y - 1, LANE_R - LANE_L, 2);
}
function drawGate(g) {
  const near = Math.max(0, 1 - Math.abs(LINE_Y - g.y) / 140);
  const halves = [[g.l, LANE_L + 2, W / 2 - 3, 'l'], [g.r, W / 2 + 3, LANE_R - 2, 'r']];
  for (const [h, x0, x1, side] of halves) {
    if (g.applied) {
      // the crossed half flashes white, swells and dissolves; the other half drops away
      const f = Math.max(0, g.fade / GATE_FADE), gone = 1 - f;
      ctx.save();
      const cx = (x0 + x1) / 2;
      if (side === g.side) {
        const sc = reduceMotion() ? 1 : 1 + gone * 0.22;
        ctx.globalAlpha = f * f;
        ctx.translate(cx, g.y); ctx.scale(sc, sc); ctx.translate(-cx, -g.y);
        const isW = h.kind === 'weapon', eff = isW ? 0 : gateValue(h, G.st.gate), good = isW || h.kind === 'mul' || eff >= 0;
        const rgb = isW ? '255,182,64' : good ? '77,163,255' : '255,77,94';
        ctx.fillStyle = `rgba(${rgb},.55)`; ctx.beginPath(); ctx.roundRect(x0, g.y - 18, x1 - x0, 36, 5); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.85 * f})`; ctx.beginPath(); ctx.roundRect(x0, g.y - 18, x1 - x0, 36, 5); ctx.fill();
      } else {
        ctx.globalAlpha = f * 0.6;
        ctx.translate(0, reduceMotion() ? 0 : gone * 26);
        ctx.fillStyle = 'rgba(120,140,180,.35)'; ctx.beginPath(); ctx.roundRect(x0, g.y - 18, x1 - x0, 36, 5); ctx.fill();
      }
      ctx.restore();
      continue;
    }
    const isW = h.kind === 'weapon';
    const eff = isW ? 0 : gateValue(h, G.st.gate);
    const good = isW || h.kind === 'mul' || eff >= 0;
    const rgb = isW ? '255,182,64' : good ? '77,163,255' : '255,77,94';
    const flash = h.hitT > 0 ? 0.25 : 0;
    // glass panel with a lit top edge and a floor glow
    const grad = ctx.createLinearGradient(0, g.y - 18, 0, g.y + 18);
    grad.addColorStop(0, `rgba(${rgb},${0.55 + flash})`); grad.addColorStop(1, `rgba(${rgb},${0.18 + flash})`);
    ctx.fillStyle = grad; ctx.beginPath(); ctx.roundRect(x0, g.y - 18, x1 - x0, 36, 5); ctx.fill();
    ctx.fillStyle = `rgba(${rgb},${0.9})`; ctx.fillRect(x0, g.y - 19, x1 - x0, 2.5);
    ctx.fillStyle = `rgba(${rgb},${0.12 + near * 0.15})`; ctx.fillRect(x0, g.y + 18, x1 - x0, 10 + near * 10);
    if (near > 0 && !g.applied) { ctx.strokeStyle = `rgba(255,255,255,${near * 0.7})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(x0 + 1, g.y - 17, x1 - x0 - 2, 34, 4); ctx.stroke(); }
    // chevrons for direction of change
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    const cx = (x0 + x1) / 2;
    if (!isW) for (const dx of [-52, 52]) {
      ctx.beginPath();
      if (good) { ctx.moveTo(cx + dx - 7, g.y + 5); ctx.lineTo(cx + dx, g.y - 4); ctx.lineTo(cx + dx + 7, g.y + 5); ctx.lineTo(cx + dx, g.y + 1); }
      else { ctx.moveTo(cx + dx - 7, g.y - 5); ctx.lineTo(cx + dx, g.y + 4); ctx.lineTo(cx + dx + 7, g.y - 5); ctx.lineTo(cx + dx, g.y - 1); }
      ctx.closePath(); ctx.fill();
    }
    const txt = isW ? WEAPONS[h.v].name : h.kind === 'mul' ? '×' + h.v : (eff >= 0 ? '+' + eff : String(eff));
    strokeText(txt, cx, g.y + 1, isW ? 17 : 25, '#fff');
  }
}
function drawEnemies() {
  const sorted = G.husks.slice().sort((a, b) => a.y - b.y);
  const packs = new Map();
  for (const h of sorted) {
    const sway = Math.sin(h.wob) * (h.kind === 'runner' ? 2.5 : 1.5), x = h.x + sway, y = h.y, r = h.r;
    const frame = Math.floor(h.wob / 3.14) % 2;
    const drawn = art && art.draw(ctx, h.kind + '_' + frame, x, y, h.kind === 'brute' ? PPU.brute : PPU.unit);
    if (!drawn) drawEnemyVector(h, x, y, r);
    if (h.hurt > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - r * 0.6, r * 0.9, 0, 6.28); ctx.fill(); ctx.restore();
    }
    if (h.parked) { ctx.fillStyle = 'rgba(255,77,94,.4)'; ctx.fillRect(x - r - 4, y + r * 0.6, r * 2 + 8, 3); }
    const p = packs.get(h.pack) || { n: 0, sx: 0, top: 1e9, hp: 0, kind: h.kind };
    p.n++; p.sx += h.x; p.top = Math.min(p.top, h.y - h.r * 2.4); p.hp += h.hp; packs.set(h.pack, p);
  }
  for (const p of packs.values()) {
    const x = p.sx / p.n, y = p.top - 14;
    if (p.kind === 'brute') {
      const txt = String(Math.ceil(p.hp)), w = Math.max(48, txt.length * 12 + 16);
      pill(x - w / 2, y - 12, w, 24, '#8b5cf6', 6);
      strokeText(txt, x, y + 1, 18, '#fff');
    } else {
      pill(x - 24, y - 12, 48, 24, '#ff4d5e', 6);
      strokeText('-' + p.n, x, y + 1, 18, '#fff');
    }
  }
}
function drawEnemyVector(h, x, y, r) {
  const hurt = h.hp < h.max * 0.5;
  ctx.fillStyle = '#1c2a22'; ctx.beginPath(); ctx.ellipse(x, y + r - 1, r, r * 0.45, 0, 0, 6.28); ctx.fill();
  if (h.kind === 'brute') {
    ctx.fillStyle = hurt ? '#9a86b8' : '#7a6299';
    ctx.fillRect(x - r, y - r * 0.4, r * 2, r * 1.3);
    ctx.beginPath(); ctx.arc(x, y - r * 0.3, r * 0.9, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#2f2440'; ctx.fillRect(x - r * 0.9, y + r * 0.2, r * 1.8, r * 0.6);
    ctx.fillStyle = '#ff6a7a'; ctx.fillRect(x - 5, y - r * 0.5, 3, 3); ctx.fillRect(x + 2, y - r * 0.5, 3, 3);
  } else if (h.kind === 'runner') {
    ctx.fillStyle = hurt ? '#d7c8a8' : '#c2ad85';
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.3, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#e94b5a'; ctx.fillRect(x - 2, y - 2, 1.5, 1.5); ctx.fillRect(x + 1, y - 2, 1.5, 1.5);
  } else {
    ctx.fillStyle = hurt ? '#b8c7b0' : '#97ab95';
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#e94b5a'; ctx.fillRect(x - 3, y - 2, 2, 2); ctx.fillRect(x + 1, y - 2, 2, 2);
  }
}
function drawSquad() {
  const pts = formation(G.count, G.cx), bobOn = !reduceMotion();
  const now = performance.now();
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    const frame = Math.floor(now / 160 + i) % 2;
    const drawn = art && art.draw(ctx, 'soldier_' + frame, p.x, p.y, PPU.unit);
    if (!drawn) {
      const bob = bobOn ? Math.sin(now / 120 + i) : 0;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 14, 7, 3, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#2f5fb5'; ctx.fillRect(p.x - 5, p.y - 2 + bob, 10, 14);
      ctx.fillStyle = '#c98a3a'; ctx.fillRect(p.x - 4, p.y - 1 + bob, 8, 6);
      ctx.fillStyle = '#ffd9a8'; ctx.beginPath(); ctx.arc(p.x, p.y - 7 + bob, 4.5, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#243a6b'; ctx.fillRect(p.x - 5, p.y - 12 + bob, 10, 4);
      ctx.fillStyle = '#1b1f2a'; ctx.fillRect(p.x + 3, p.y - 10 + bob, 3, 14);
    }
    if (G.muzzleT > 0 && i < WEAPONS[G.weapon].tracers) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (!(art && art.draw(ctx, 'muzzle', p.x + 3, p.y - 20, PPU.unit, { alpha: 0.9 }))) {
        ctx.fillStyle = 'rgba(255,220,140,.8)'; ctx.beginPath(); ctx.arc(p.x + 3, p.y - 18, 4, 0, 6.28); ctx.fill();
      }
      ctx.restore();
    }
  }
  // lantern glow under the line
  const glow = ctx.createRadialGradient(G.cx, LINE_Y + 10, 6, G.cx, LINE_Y + 10, 70);
  glow.addColorStop(0, 'rgba(255,190,100,.16)'); glow.addColorStop(1, 'rgba(255,190,100,0)');
  ctx.fillStyle = glow; ctx.fillRect(G.cx - 70, LINE_Y - 60, 140, 140);
  const y = LINE_Y + Math.ceil(Math.min(G.count, 24) / 6) * 17 + 12;
  const pulse = G.tagPulse > 0 && !reduceMotion() ? 1 + Math.sin((G.tagPulse / 0.35) * Math.PI) * 0.22 : 1;
  ctx.save(); ctx.translate(G.cx, y); ctx.scale(pulse, pulse);
  pill(-32, -13, 64, 26, G.flash > 0 ? '#ff4d5e' : '#ffb640', 8);
  strokeText(String(G.count), 0, 1, 20, '#1a1200', 700, 'rgba(0,0,0,0)');
  ctx.restore();
}
function drawBullets() {
  for (const b of G.bullets) {
    if (b.w === 'rail') {
      ctx.fillStyle = 'rgba(189,243,255,.30)'; ctx.fillRect(b.x - 3, b.y, 6, 44);
      ctx.fillStyle = '#e8fbff'; ctx.fillRect(b.x - 1, b.y, 2, 44);
    } else if (b.w === 'shotgun') {
      ctx.fillStyle = 'rgba(255,210,122,.4)'; ctx.fillRect(b.x - 2.5, b.y - 2.5, 5, 5);
      ctx.fillStyle = '#fff1c8'; ctx.fillRect(b.x - 1, b.y - 1, 2, 2);
    } else {
      ctx.fillStyle = 'rgba(255,210,122,.28)'; ctx.fillRect(b.x - 2.5, b.y - 1, 5, 15);
      ctx.fillStyle = '#fff1c8'; ctx.fillRect(b.x - 1, b.y, 2, 12);
      ctx.fillStyle = 'rgba(255,182,64,.30)'; ctx.fillRect(b.x - 0.5, b.y + 12, 1, 18);
    }
  }
}
function drawAllies() {
  if (G.frost) {
    const band = ctx.createLinearGradient(0, LINE_Y - G.frost.band, 0, LINE_Y);
    band.addColorStop(0, 'rgba(189,243,255,0)'); band.addColorStop(1, 'rgba(189,243,255,.14)');
    ctx.fillStyle = band; ctx.fillRect(LANE_L, LINE_Y - G.frost.band, LANE_R - LANE_L, G.frost.band);
    ctx.fillStyle = 'rgba(189,243,255,.35)'; ctx.fillRect(LANE_L, LINE_Y - G.frost.band, LANE_R - LANE_L, 1);
  }
  for (const h of G.helpers) {
    const x = FLANK[h.side], y = FLANK.y;
    if (h.k === 'sentinel') {
      const recoil = !reduceMotion() && G.shellT > h.interval - 0.12 ? 3 : 0;
      if (!(art && art.draw(ctx, 'sentinel', x, y + recoil, PPU.sentinel))) {
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 8, 22, 8, 0, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#2a4d8f'; ctx.fillRect(x - 18, y - 22 + recoil, 36, 26);
        ctx.fillStyle = '#17294f'; ctx.fillRect(x - 4, y - 40 + recoil, 8, 22);
      }
      const glow = ctx.createRadialGradient(x, y, 4, x, y, 40);
      glow.addColorStop(0, 'rgba(255,190,100,.14)'); glow.addColorStop(1, 'rgba(255,190,100,0)');
      ctx.fillStyle = glow; ctx.fillRect(x - 40, y - 40, 80, 80);
    } else if (h.k === 'frost') {
      if (!(art && art.draw(ctx, 'frostlamp', x, y, PPU.frostlamp))) {
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 4, 16, 6, 0, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#2b3140'; ctx.fillRect(x - 12, y - 6, 24, 8); ctx.fillRect(x - 4, y - 24, 8, 18);
        ctx.fillStyle = 'rgba(189,243,255,.7)'; ctx.fillRect(x - 10, y - 46, 20, 22);
        ctx.fillStyle = '#2b3140'; ctx.fillRect(x - 12, y - 52, 24, 6);
      }
      const p = reduceMotion() ? 1 : 1 + Math.sin(performance.now() / 300) * 0.15;
      const halo = ctx.createRadialGradient(x, y - 36, 2, x, y - 36, 44 * p);
      halo.addColorStop(0, 'rgba(189,243,255,.5)'); halo.addColorStop(1, 'rgba(189,243,255,0)');
      ctx.fillStyle = halo; ctx.fillRect(x - 40, y - 80, 80, 80);
    }
  }
}
function drawShells() {
  for (const sh of G.shells) {
    const k = sh.t / sh.dur, x = sh.x0 + (sh.tx - sh.x0) * k, yGround = sh.y0 + (sh.ty - sh.y0) * k, lift = Math.sin(k * Math.PI) * 120;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, yGround, 6, 3, 0, 0, 6.28); ctx.fill();
    const y = yGround - lift;
    const g = ctx.createRadialGradient(x, y, 1, x, y, 9);
    g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.5, 'rgba(255,182,64,.9)'); g.addColorStop(1, 'rgba(255,140,30,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.28); ctx.fill();
  }
  // landing marker while a shell is in the air
  for (const sh of G.shells) {
    ctx.strokeStyle = `rgba(255,182,64,${0.25 + 0.4 * (sh.t / sh.dur)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sh.tx, sh.ty, sh.radius * (0.6 + 0.4 * sh.t / sh.dur), 0, 6.28); ctx.stroke();
  }
}
function drawBoss() {
  const b = G.boss; if (!b || b.hp <= 0) return;
  const bob = reduceMotion() ? 0 : Math.sin(b.wob * 2) * 1.5;
  const x = b.x - b.w / 2, y = b.y - b.h / 2 + bob;
  const drawn = art && art.draw(ctx, 'walker', b.x, b.y + 36 + bob, PPU.walker);
  if (drawn && b.hitT > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35;
    art.draw(ctx, 'walker', b.x, b.y + 36 + bob, PPU.walker); ctx.restore();
  }
  if (!drawn) {
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x + 6, y + b.h - 4, b.w - 12, 10);
    const ice = ctx.createLinearGradient(x, y, x + b.w, y + b.h);
    ice.addColorStop(0, 'rgba(210,246,255,.78)'); ice.addColorStop(0.5, 'rgba(160,225,245,.62)'); ice.addColorStop(1, 'rgba(120,200,235,.72)');
    ctx.fillStyle = b.hitT > 0 ? 'rgba(255,255,255,.9)' : ice;
    ctx.fillRect(x, y, b.w, b.h);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, b.w - 3, b.h - 3);
    ctx.fillStyle = 'rgba(70,84,60,.85)';
    ctx.fillRect(b.x - 46, y + 24, 92, 44);
    ctx.beginPath(); ctx.arc(b.x, y + 46, 30, 0, 6.28); ctx.fill();
    ctx.fillStyle = 'rgba(50,60,44,.9)'; ctx.fillRect(b.x - 7, y + 40, 14, 62);
  }
  // cracks spread as the health drains
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
  const cy = y + b.h / 2;
  for (const c of b.cracks) {
    ctx.beginPath(); ctx.moveTo(b.x + c[0][0], cy + c[0][1]);
    for (let i = 1; i < c.length; i++) ctx.lineTo(b.x + c[i][0], cy + c[i][1]);
    ctx.stroke();
  }
  // health
  const frac = b.hp / b.max;
  pill(x + 12, y + b.h - 12, b.w - 24, 7, 'rgba(0,0,0,.4)', 3);
  pill(x + 12, y + b.h - 12, Math.max(6, (b.w - 24) * frac), 7, frac > 0.35 ? '#bdf3ff' : '#ffb640', 3);
  const bounce = reduceMotion() ? 1 : 1 + Math.max(0, b.hitT) * 2.5;
  ctx.save(); ctx.translate(b.x, y + b.h - 44); ctx.scale(bounce, bounce);
  strokeText(Math.ceil(b.hp).toLocaleString(), 0, 0, 40, '#fff');
  ctx.restore();
}
function drawHUD() {
  ctx.textBaseline = 'middle';
  // level
  pill(12, 14, 74, 34, 'rgba(8,12,24,.65)', 10);
  ctx.font = F(600, 10); ctx.textAlign = 'left'; ctx.fillStyle = '#93a0ba'; ctx.fillText('LEVEL', 22, 24);
  ctx.font = F(700, 18); ctx.fillStyle = '#e9eef7'; ctx.fillText(String(G.level), 22, 39);
  // clock with a progress ring
  const left = Math.max(0, RUN_T - G.t), f = Math.min(1, G.t / RUN_T);
  pill(W / 2 - 52, 10, 104, 42, 'rgba(8,12,24,.7)', 21);
  ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W / 2 - 31, 31, 13, 0, 6.28); ctx.stroke();
  ctx.strokeStyle = G.boss ? '#bdf3ff' : left < 10 ? '#ffb640' : '#4da3ff'; ctx.beginPath(); ctx.arc(W / 2 - 31, 31, 13, -Math.PI / 2, -Math.PI / 2 + f * 6.283); ctx.stroke();
  if (G.boss) strokeText('WALKER', W / 2 + 12, 31, 17, '#bdf3ff', 700, 'rgba(0,0,0,0)');
  else strokeText('0:' + String(Math.ceil(left)).padStart(2, '0'), W / 2 + 12, 32, 24, left < 10 ? '#ffb640' : '#e9eef7', 700, 'rgba(0,0,0,0)');
  if (G.weapon !== 'rifle') {
    const pulse = G.wpnT > 0 && !reduceMotion() ? 1 + Math.sin(G.wpnT * 12) * 0.08 : 1;
    ctx.save(); ctx.translate(W / 2, 66); ctx.scale(pulse, pulse);
    pill(-34, -9, 68, 18, 'rgba(255,182,64,.18)', 9);
    strokeText(WEAPONS[G.weapon].name, 0, 1, 11, '#ffb640', 600, 'rgba(0,0,0,0)');
    ctx.restore();
  }
  // coins
  pill(W - 108, 14, 96, 34, 'rgba(8,12,24,.65)', 10);
  ctx.fillStyle = '#ffb640'; ctx.beginPath(); ctx.arc(W - 94, 31, 6, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#b57a1c'; ctx.beginPath(); ctx.arc(W - 94, 31, 3, 0, 6.28); ctx.fill();
  ctx.font = F(700, 18); ctx.textAlign = 'right'; ctx.fillStyle = '#ffb640'; ctx.fillText(G.coins.toLocaleString(), W - 20, 32);
  // opening banner
  if (G.banner > 0) {
    const a = Math.min(1, G.banner / 0.4), rise = reduceMotion() ? 0 : (1 - Math.min(1, (1.6 - G.banner) / 0.3)) * 12;
    ctx.globalAlpha = a;
    pill(W / 2 - 120, 222 + rise, 240, 70, 'rgba(8,12,24,.75)', 12);
    strokeText('HOLD THE LINE', W / 2, 246 + rise, 26, '#ffb640', 700, 'rgba(0,0,0,0)');
    ctx.font = 'italic 500 13px Barlow, sans-serif'; ctx.fillStyle = '#93a0ba'; ctx.textAlign = 'center';
    ctx.fillText('sixty seconds, then the walker', W / 2, 272 + rise);
    ctx.globalAlpha = 1;
  }
  if (paused) {
    ctx.fillStyle = 'rgba(10,16,32,.7)'; ctx.fillRect(0, 0, W, H);
    strokeText('PAUSED', W / 2, H / 2 - 10, 36, '#fff');
    ctx.font = 'italic 500 14px Barlow, sans-serif'; ctx.fillStyle = '#93a0ba'; ctx.textAlign = 'center';
    ctx.fillText('tap the clock or press P to continue', W / 2, H / 2 + 22);
  }
}
function draw() {
  ctx.save();
  if (G && G.shake > 0 && !reduceMotion()) ctx.translate(rnd(-G.shake, G.shake), rnd(-G.shake, G.shake));
  drawBridge();
  if (G) {
    for (const g of G.gates) drawGate(g);
    drawEnemies();
    drawBoss();
    drawAllies();
    drawBullets();
    drawShells();
    for (const p of G.parts) {
      ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = p.color;
      if (p.shard) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.len / 2, -1.5, p.len, 3); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(-p.len / 2, -1.5, p.len, 1); ctx.restore(); }
      else ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    drawSquad();
    for (const f of G.floats) {
      ctx.globalAlpha = 1 - Math.max(0, f.t - (f.life - 0.5)) / 0.5;
      if (f.pop) {
        // lands big, settles, then drifts: scale 1.7 -> 1 over the first 0.18 s
        const k = Math.min(1, f.t / 0.18), sc = reduceMotion() ? 1 : 1.7 - 0.7 * (1 - Math.pow(1 - k, 3));
        ctx.save(); ctx.translate(f.x, f.y); ctx.scale(sc, sc);
        pill(-f.size * 1.6, -f.size * 0.75, f.size * 3.2, f.size * 1.5, 'rgba(8,12,24,.55)', f.size * 0.4);
        strokeText(f.txt, 0, 0, f.size, f.color);
        ctx.restore();
        if (f.caption) { ctx.font = '600 12px Barlow, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#e9eef7'; ctx.fillText(f.caption.toUpperCase(), f.x, f.y + f.size * 0.95); }
      } else strokeText(f.txt, f.x, f.y, f.size, f.color);
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
if (location.search.includes('debug')) window.bridgehold = { get run() { return G; }, get save() { return save; }, W, LINE_Y };
if (document.fonts && document.fonts.load) {
  Promise.all([document.fonts.load('700 40px "Chakra Petch"'), document.fonts.load('600 14px "Chakra Petch"')]).catch(() => {});
}
last = performance.now();
requestAnimationFrame(frame);
