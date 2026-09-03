import {
  RUN_T, LINE_Y, DEFAULT_SAVE, UPGRADES, UNLOCKS, ENEMIES, WEAPONS, BOSS,
  cost, statsFor, huskHP, bossHP, bossReward, clearBonus, coinPerKill,
  packKind, packSize, packInterval, GATE_INTERVAL, gateHalf, hitGate, gateValue, applyGate, recordRun,
} from './balance.js';
import { createAudio } from './audio.js';

const W = 360, H = 640, LANE_L = 34, LANE_R = 326;
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const osReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = id => document.getElementById(id);

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
    b.className = 'lvl' + (L === save.selected ? ' sel' : '') + (L === save.level ? ' front' : '');
    b.innerHTML = `<b>${L}</b><span>${entry && entry.best ? entry.best : (L === save.level ? 'next' : '—')}</span>`;
    b.title = L === save.level ? 'Level ' + L + ', not yet cleared' : 'Level ' + L + ', best squad ' + (entry ? entry.best : 0);
    b.onclick = () => { save.selected = L; persist(); renderHome(); };
    strip.appendChild(b);
  }
  requestAnimationFrame(() => { const s = strip.querySelector('.sel'); if (s) s.scrollIntoView({ inline: 'center', block: 'nearest' }); });
  $('deploy').textContent = 'Deploy to level ' + save.selected;

  const box = $('ups'); box.innerHTML = '';
  for (const u of UPGRADES) {
    const lv = save.up[u.k], maxed = lv >= u.max, c = cost(u, lv);
    const row = document.createElement('div'); row.className = 'up';
    row.innerHTML = `<div><span class="n">${u.name}</span><span class="lv">${lv}/${u.max}</span><div class="d">${u.desc}</div></div>`;
    const b = document.createElement('button'); b.className = 'buy';
    b.textContent = maxed ? 'MAX' : c.toLocaleString() + ' ¢';
    b.disabled = maxed || save.coins < c;
    b.onclick = () => { if (save.coins >= c && !maxed) { save.coins -= c; save.up[u.k]++; persist(); audio.unlock(); audio.gateGood(); renderHome(); } };
    row.appendChild(b); box.appendChild(row);
  }
  const ub = $('unlocks'); ub.innerHTML = '';
  for (const u of UNLOCKS) {
    const on = st[u.k];
    const row = document.createElement('div'); row.className = 'unl';
    row.innerHTML = `<div><div class="n">${u.name}</div><div class="d">${u.desc} Clear level ${u.clear}.</div></div><span class="pill${on ? ' on' : ''}">${on ? 'Unlocked' : 'Locked'}</span>`;
    ub.appendChild(row);
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
$('toCamp').onclick = () => { $('end').hidden = true; $('home').hidden = false; renderHome(); };

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
    fireT: 0, packT: 1.2, gateT: 2.0,
    bullets: [], husks: [], gates: [], boss: null, floats: [], parts: [],
    kills: 0, coins: 0, shake: 0, over: 0, won: false, endT: 0, flash: 0, wpnT: 0,
  };
  $('home').hidden = true; $('end').hidden = true;
  paused = false; last = performance.now();
}

// ---------- spawning ----------
const rnd = (a, b) => a + Math.random() * (b - a);
function spawnPack() {
  const kind = packKind(G.level, Math.random()), E = ENEMIES[kind];
  const size = packSize(kind, G.level, Math.random());
  const hp = huskHP(G.level, G.t) * E.hp, spd = (rnd(52, 76) + G.level * 2.5) * E.speed;
  const pack = { units: [], kind };
  const unit = (x, y) => ({ x, y, hp, max: hp, vy: spd * rnd(0.92, 1.08), wob: rnd(0, 6.28), pack, kind, r: E.r, chewT: 0, parked: false });
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
function float(x, y, txt, color, size) { G.floats.push({ x, y, txt, color, size: size || 18, t: 0 }); }
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
      G.bullets.push({ x: pts[i].x, y: pts[i].y - 10, vx: Math.sin(a) * 560, vy: -Math.cos(a) * 560, dmg, pierce, w: G.weapon });
    }
  }
  audio.tick();
}

// ---------- update ----------
function update(dt) {
  if (!G) return;
  G.t += dt;
  stripe = (stripe + 120 * dt) % 40;
  if (G.flash > 0) G.flash -= dt;
  if (G.wpnT > 0) G.wpnT -= dt;
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
    if (!dead) for (const g of G.gates) {
      if (g.applied || Math.abs(b.y - g.y) > 16) continue;
      const half = b.x < W / 2 ? g.l : g.r;
      if (half.kind !== 'weapon') { hitGate(half); audio.ping(gateValue(half, G.st.gate)); }
      dead = true; break;
    }
    if (!dead && G.boss && G.boss.hp > 0 && Math.abs(b.x - G.boss.x) < G.boss.w / 2 && Math.abs(b.y - G.boss.y) < G.boss.h / 2) {
      const bs = G.boss;
      bs.hp -= b.dmg; bs.hitT = 0.08; dead = true;
      burst(b.x, bs.y + bs.h / 2, '#dff7ff', 2, 120);
      audio.crack();
      while (bs.hp > 0 && bs.hp / bs.max < bs.nextCrack) { addCrack(bs); bs.nextCrack -= 0.1; }
      if (bs.hp <= 0) {
        bs.hp = 0; burst(bs.x, bs.y, '#bdf3ff', 70, 260); G.shake = 10;
        G.coins += bossReward(G.level) + clearBonus(G.level); G.kills++;
        float(W / 2, 200, 'LINE HELD', '#5ee39a', 34);
        audio.shatter(); audio.held();
        G.over = 1; G.won = true; G.endT = 0;
      }
    }
    if (!dead) for (let hi = G.husks.length - 1; hi >= 0; hi--) {
      const h = G.husks[hi];
      const dx = b.x - h.x, dy = b.y - h.y, rr = (h.r + 3) * (h.r + 3);
      if (dx * dx + dy * dy > rr) continue;
      h.hp -= b.dmg;
      if (G.st.splash) for (const o of G.husks) {
        if (o === h) continue;
        const ox = o.x - h.x, oy = o.y - h.y;
        if (ox * ox + oy * oy < 24 * 24) o.hp -= b.dmg * 0.5;
      }
      if (h.hp <= 0) killHusk(h, hi);
      if (b.pierce > 0) { b.pierce--; continue; }
      dead = true; break;
    }
    if (dead) G.bullets.splice(bi, 1);
  }
  if (G.st.splash) for (let hi = G.husks.length - 1; hi >= 0; hi--) if (G.husks[hi].hp <= 0) killHusk(G.husks[hi], hi);

  // enemies
  for (let hi = G.husks.length - 1; hi >= 0; hi--) {
    const h = G.husks[hi];
    h.wob += dt * (h.kind === 'runner' ? 12 : 6);
    if (h.parked) {
      if (G.over === 0) { h.chewT += dt; if (h.chewT >= 1) { h.chewT -= 1; loseSoldiers(ENEMIES.brute.chew); G.shake = Math.max(G.shake, 3); } }
      continue;
    }
    h.y += h.vy * dt;
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
    if (!g.applied && g.y + 16 >= LINE_Y && G.over === 0) {
      g.applied = true;
      const r = applyGate(G.count, G.cx < W / 2 ? g.l : g.r, G.st.gate);
      G.count = r.count;
      if (r.weapon) { G.weapon = r.weapon; G.wpnT = 1.6; audio.weapon(); }
      else if (r.good) audio.gateGood();
      else { G.flash = 0.25; audio.gateBad(); }
      float(G.cx, LINE_Y - 30, r.text, r.weapon ? '#ffb640' : r.good ? '#4da3ff' : '#ff4d5e', 26);
      if (G.count <= 0) breakLine();
    }
    if (g.y > H + 40) G.gates.splice(gi, 1);
  }
  G.peak = Math.max(G.peak, G.count);

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

  for (let i = G.floats.length - 1; i >= 0; i--) { const f = G.floats[i]; f.t += dt; f.y -= 28 * dt; if (f.t > 1.1) G.floats.splice(i, 1); }
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 180 * dt;
    if (p.t > p.life) G.parts.splice(i, 1);
  }

  if (G.over) { G.endT += dt; if (G.endT > 1.4) finishRun(); }
}

function finishRun() {
  const won = G.won, level = G.level, wasFrontier = level === save.level;
  recordRun(save, level, won, G.peak, G.coins);
  persist();
  $('eSub').textContent = 'Level ' + level + (won ? ' cleared' : '');
  $('eTitle').textContent = won ? 'LINE HELD' : 'LINE BROKEN';
  $('eTitle').style.color = won ? 'var(--green)' : 'var(--red)';
  $('eLede').textContent = won
    ? (wasFrontier ? 'The walker went down. Level ' + (level + 1) + ' is open, and every coin goes to camp.' : 'The walker went down again. Best squad on this level: ' + save.levels[level].best + '.')
    : 'The bridge fell at ' + Math.min(RUN_T, Math.floor(G.t)) + ' seconds. The coins are still yours.';
  $('eCoins').textContent = G.coins.toLocaleString();
  $('eKills').textContent = G.kills;
  $('ePeak').textContent = G.peak;
  $('again').textContent = won && wasFrontier ? 'Deploy to level ' + save.selected : 'Deploy again';
  $('end').hidden = false;
  G = null;
}

// ---------- drawing ----------
const F = (w, s) => `${w} ${s}px "Chakra Petch", Impact, sans-serif`;
function strokeText(txt, x, y, size, color, weight, stroke) {
  ctx.font = F(weight || 700, size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, size / 7); ctx.lineJoin = 'round'; ctx.strokeStyle = stroke || 'rgba(6,10,20,.9)';
  ctx.strokeText(txt, x, y); ctx.fillStyle = color; ctx.fillText(txt, x, y);
}
function drawBridge() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0b1426'); sky.addColorStop(1, '#101a32');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0e1730';
  for (let i = 0; i < 9; i++) { const x = (i * 43) % W, h = 60 + (i * 37) % 90; ctx.fillRect(x - 6, H - h - 40, 22, h + 60); }
  ctx.fillStyle = 'rgba(255,182,64,.18)';
  for (let i = 0; i < 40; i++) { const x = (i * 97 + 13) % W, y = 420 + (i * 53) % 200; if (x < LANE_L - 8 || x > LANE_R + 8) ctx.fillRect(x, y, 2, 2); }
  ctx.fillStyle = '#2a3140'; ctx.fillRect(LANE_L - 12, 0, LANE_R - LANE_L + 24, H);
  ctx.fillStyle = '#3b4353'; ctx.fillRect(LANE_L, 0, LANE_R - LANE_L, H);
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  for (let y = -40 + stripe; y < H; y += 40) ctx.fillRect(W / 2 - 2, y, 4, 22);
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  for (let y = -40 + stripe * 2; y < H; y += 80) ctx.fillRect(LANE_L, y, LANE_R - LANE_L, 1);
  ctx.fillStyle = '#5a6376'; ctx.fillRect(LANE_L - 12, 0, 6, H); ctx.fillRect(LANE_R + 6, 0, 6, H);
  ctx.fillStyle = '#7a8498';
  for (let y = -20 + stripe * 1.5; y < H; y += 60) { ctx.fillRect(LANE_L - 14, y, 10, 4); ctx.fillRect(LANE_R + 4, y, 10, 4); }
  ctx.fillStyle = 'rgba(255,182,64,.35)'; ctx.fillRect(LANE_L, LINE_Y - 2, LANE_R - LANE_L, 2);
}
function drawGate(g) {
  const halves = [[g.l, LANE_L, W / 2 - 2], [g.r, W / 2 + 2, LANE_R]];
  for (const [h, x0, x1] of halves) {
    if (h.kind === 'weapon') {
      ctx.fillStyle = 'rgba(255,182,64,.30)'; ctx.fillRect(x0, g.y - 16, x1 - x0, 32);
      ctx.fillStyle = '#ffb640'; ctx.fillRect(x0, g.y - 18, x1 - x0, 3); ctx.fillRect(x0, g.y + 15, x1 - x0, 3);
      strokeText(WEAPONS[h.v].name, (x0 + x1) / 2, g.y, 18, '#fff');
      continue;
    }
    const eff = gateValue(h, G.st.gate);
    const good = h.kind === 'mul' || eff >= 0;
    ctx.fillStyle = good ? 'rgba(77,163,255,.32)' : 'rgba(255,77,94,.32)';
    ctx.fillRect(x0, g.y - 16, x1 - x0, 32);
    ctx.fillStyle = good ? '#4da3ff' : '#ff4d5e';
    ctx.fillRect(x0, g.y - 18, x1 - x0, 3); ctx.fillRect(x0, g.y + 15, x1 - x0, 3);
    const txt = h.kind === 'mul' ? '×' + h.v : (eff >= 0 ? '+' + eff : String(eff));
    strokeText(txt, (x0 + x1) / 2, g.y, 24, '#fff');
  }
}
function drawEnemies() {
  const packs = new Map();
  for (const h of G.husks) {
    const sway = Math.sin(h.wob) * (h.kind === 'runner' ? 2.5 : 1.5), x = h.x + sway, y = h.y, r = h.r;
    const hurt = h.hp < h.max * 0.5;
    ctx.fillStyle = '#1c2a22'; ctx.beginPath(); ctx.ellipse(x, y + r - 1, r, r * 0.45, 0, 0, 6.28); ctx.fill();
    if (h.kind === 'brute') {
      ctx.fillStyle = hurt ? '#9a86b8' : '#7a6299';
      ctx.fillRect(x - r, y - r * 0.4, r * 2, r * 1.3);
      ctx.beginPath(); ctx.arc(x, y - r * 0.3, r * 0.9, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#2f2440'; ctx.fillRect(x - r * 0.9, y + r * 0.2, r * 1.8, r * 0.6);
      ctx.fillStyle = '#ff6a7a'; ctx.fillRect(x - 5, y - r * 0.5, 3, 3); ctx.fillRect(x + 2, y - r * 0.5, 3, 3);
      if (h.parked) { ctx.fillStyle = 'rgba(255,77,94,.35)'; ctx.fillRect(x - r - 4, y + r, r * 2 + 8, 3); }
    } else if (h.kind === 'runner') {
      ctx.fillStyle = hurt ? '#d7c8a8' : '#c2ad85';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.3, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#4c3a44'; ctx.fillRect(x - 3, y + 2, 6, 5);
      ctx.fillStyle = '#e94b5a'; ctx.fillRect(x - 2, y - 2, 1.5, 1.5); ctx.fillRect(x + 1, y - 2, 1.5, 1.5);
    } else {
      ctx.fillStyle = hurt ? '#b8c7b0' : '#97ab95';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#4c3a44'; ctx.fillRect(x - 4, y + 3, 8, 7);
      ctx.fillStyle = '#e94b5a'; ctx.fillRect(x - 3, y - 2, 2, 2); ctx.fillRect(x + 1, y - 2, 2, 2);
    }
    const p = packs.get(h.pack) || { n: 0, sx: 0, top: 1e9, hp: 0, kind: h.kind };
    p.n++; p.sx += h.x; p.top = Math.min(p.top, h.y - h.r); p.hp += h.hp; packs.set(h.pack, p);
  }
  for (const p of packs.values()) {
    const x = p.sx / p.n, y = p.top - 18;
    if (p.kind === 'brute') {
      const txt = String(Math.ceil(p.hp)), w = Math.max(48, txt.length * 12 + 16);
      ctx.fillStyle = '#8b5cf6'; ctx.fillRect(x - w / 2, y - 12, w, 24);
      strokeText(txt, x, y + 1, 18, '#fff');
    } else {
      ctx.fillStyle = '#ff4d5e'; ctx.fillRect(x - 24, y - 12, 48, 24);
      strokeText('-' + p.n, x, y + 1, 18, '#fff');
    }
  }
}
function drawSquad() {
  const pts = formation(G.count, G.cx), bobOn = !reduceMotion();
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i], bob = bobOn ? Math.sin(performance.now() / 120 + i) : 0;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 14, 7, 3, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#2f5fb5'; ctx.fillRect(p.x - 5, p.y - 2 + bob, 10, 14);
    ctx.fillStyle = '#c98a3a'; ctx.fillRect(p.x - 4, p.y - 1 + bob, 8, 6);
    ctx.fillStyle = '#ffd9a8'; ctx.beginPath(); ctx.arc(p.x, p.y - 7 + bob, 4.5, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#243a6b'; ctx.fillRect(p.x - 5, p.y - 12 + bob, 10, 4);
    ctx.fillStyle = '#1b1f2a'; ctx.fillRect(p.x + 3, p.y - 10 + bob, 3, 14);
  }
  const y = LINE_Y + Math.ceil(Math.min(G.count, 24) / 6) * 17 + 12;
  ctx.fillStyle = G.flash > 0 ? '#ff4d5e' : '#ffb640';
  ctx.fillRect(G.cx - 30, y - 13, 60, 26);
  strokeText(String(G.count), G.cx, y + 1, 20, '#1a1200', 700, 'rgba(0,0,0,0)');
}
function drawBullets() {
  for (const b of G.bullets) {
    if (b.w === 'rail') {
      ctx.fillStyle = 'rgba(189,243,255,.35)'; ctx.fillRect(b.x - 2.5, b.y, 5, 40);
      ctx.fillStyle = '#e8fbff'; ctx.fillRect(b.x - 1, b.y, 2, 40);
    } else if (b.w === 'shotgun') {
      ctx.fillStyle = '#ffd27a'; ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
    } else {
      ctx.fillStyle = '#ffd27a'; ctx.fillRect(b.x - 1.5, b.y, 3, 12);
      ctx.fillStyle = 'rgba(255,182,64,.35)'; ctx.fillRect(b.x - 0.5, b.y + 12, 1, 16);
    }
  }
}
function drawBoss() {
  const b = G.boss; if (!b || b.hp <= 0) return;
  const x = b.x - b.w / 2, y = b.y - b.h / 2 + (reduceMotion() ? 0 : Math.sin(b.wob * 2) * 1.5);
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x + 6, y + b.h - 4, b.w - 12, 10);
  const ice = ctx.createLinearGradient(x, y, x + b.w, y + b.h);
  ice.addColorStop(0, 'rgba(210,246,255,.78)'); ice.addColorStop(0.5, 'rgba(160,225,245,.62)'); ice.addColorStop(1, 'rgba(120,200,235,.72)');
  ctx.fillStyle = b.hitT > 0 ? 'rgba(255,255,255,.9)' : ice;
  ctx.fillRect(x, y, b.w, b.h);
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, b.w - 3, b.h - 3);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 20, y + 10); ctx.lineTo(x + 60, y + 60); ctx.lineTo(x + 40, y + 100); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + b.w - 30, y + 20); ctx.lineTo(x + b.w - 70, y + 80); ctx.stroke();
  // the walker inside
  ctx.fillStyle = 'rgba(70,84,60,.85)';
  ctx.fillRect(b.x - 46, y + 24, 92, 44);
  ctx.beginPath(); ctx.arc(b.x, y + 46, 30, 0, 6.28); ctx.fill();
  ctx.fillStyle = 'rgba(50,60,44,.9)'; ctx.fillRect(b.x - 7, y + 40, 14, 62);
  ctx.fillStyle = 'rgba(70,84,60,.7)'; ctx.fillRect(b.x - 62, y + 60, 16, 50); ctx.fillRect(b.x + 46, y + 60, 16, 50);
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
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x + 12, y + b.h - 16, b.w - 24, 6);
  ctx.fillStyle = frac > 0.35 ? '#bdf3ff' : '#ffb640'; ctx.fillRect(x + 12, y + b.h - 16, (b.w - 24) * frac, 6);
  const bounce = reduceMotion() ? 1 : 1 + Math.max(0, b.hitT) * 2.5;
  ctx.save(); ctx.translate(b.x, y + b.h - 44); ctx.scale(bounce, bounce);
  strokeText(Math.ceil(b.hp).toLocaleString(), 0, 0, 40, '#fff');
  ctx.restore();
}
function drawHUD() {
  ctx.textBaseline = 'middle';
  ctx.font = F(600, 13); ctx.textAlign = 'left'; ctx.fillStyle = '#93a0ba'; ctx.fillText('LEVEL', 16, 22);
  ctx.font = F(700, 22); ctx.fillStyle = '#e9eef7'; ctx.fillText(String(G.level), 16, 44);
  const left = Math.max(0, RUN_T - G.t);
  if (G.boss) strokeText('WALKER', W / 2, 34, 22, '#bdf3ff');
  else strokeText('0:' + String(Math.ceil(left)).padStart(2, '0'), W / 2, 34, 34, left < 10 ? '#ffb640' : '#e9eef7');
  if (G.weapon !== 'rifle') {
    const pulse = G.wpnT > 0 && !reduceMotion() ? 1 + Math.sin(G.wpnT * 12) * 0.08 : 1;
    ctx.save(); ctx.translate(W / 2, 62); ctx.scale(pulse, pulse);
    strokeText(WEAPONS[G.weapon].name, 0, 0, 13, '#ffb640', 600);
    ctx.restore();
  }
  ctx.font = F(600, 13); ctx.textAlign = 'right'; ctx.fillStyle = '#93a0ba'; ctx.fillText('COINS', W - 16, 22);
  ctx.font = F(700, 22); ctx.fillStyle = '#ffb640'; ctx.fillText(G.coins.toLocaleString(), W - 16, 44);
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
    drawBullets();
    for (const p of G.parts) { ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
    ctx.globalAlpha = 1;
    drawSquad();
    for (const f of G.floats) { ctx.globalAlpha = 1 - Math.max(0, f.t - 0.6) / 0.5; strokeText(f.txt, f.x, f.y, f.size, f.color); }
    ctx.globalAlpha = 1;
    if (G.flash > 0) { ctx.fillStyle = `rgba(255,77,94,${G.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
    drawHUD();
  }
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

setup(); renderHome();
if (document.fonts && document.fonts.load) {
  Promise.all([document.fonts.load('700 40px "Chakra Petch"'), document.fonts.load('600 14px "Chakra Petch"')]).catch(() => {});
}
last = performance.now();
requestAnimationFrame(frame);
