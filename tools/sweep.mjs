/* Sweep the campaign with a headless bot.
 *
 *   node tools/sweep.mjs [from] [to] [--camp fair|fresh|strong]
 *
 * Serves the repo, runs every level in the range with a gate-aware bot on a
 * camp of the given strength, and prints one row per level: result, seconds
 * held, coins, kills, peak squad, best streak, boss damage. The "fair" camp is
 * the balance module's fairCamp(level), the ranks the economy pays for by
 * that level; "fresh" is no ranks at all; "strong" is fair plus four.
 * Needs the same Playwright the rest of the tooling uses. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const from = +args[0] || 1, to = +args[1] || 20;
const camp = args.includes('--camp') ? args[args.indexOf('--camp') + 1] : 'fair';
const { fairCamp } = await import(path.join(ROOT, 'src', 'balance.js'));

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  const { execSync } = await import('node:child_process');
  const root = execSync('npm root -g').toString().trim();
  ({ chromium } = await import(path.join(root, 'playwright', 'index.mjs')));
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(data); });
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch();
const rows = [];
for (let L = from; L <= to; L++) {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${port}/index.html?debug`);
  const up = camp === 'fresh' ? { dmg: 0, rate: 0, squad: 0, gate: 0 } : fairCamp(L);
  if (camp === 'strong') for (const k of Object.keys(up)) up[k] += 4;
  const levels = {}; for (let i = 1; i < L; i++) levels[i] = { best: 50, cleared: true };
  await page.evaluate(s => localStorage.setItem('bridgehold', s), JSON.stringify({ level: L, selected: L, coins: 0, best: 0, up, levels, settings: { sound: false, motion: 'reduced' }, tutorial: true }));
  await page.reload(); await page.waitForTimeout(500);
  await page.click('#deploy');
  let last = null;
  for (let i = 0; i < 2400; i++) {
    const st = await page.evaluate(() => {
      const G = window.bridgehold.run; if (!G) return null; const W = window.bridgehold.W;
      const g = G.gates.filter(g => !g.applied).sort((a, b) => b.y - a.y)[0]; let target = W / 2;
      if (g) { const val = h => h.kind === 'weapon' ? G.count * 0.6 : h.kind === 'mul' ? G.count * (h.v - 1) : h.v + G.st.gate; target = val(g.l) >= val(g.r) ? 150 : 270; }
      else if (G.husks.length) { let best = null, hp = 0; const m = new Map(); for (const h of G.husks) m.set(h.pack, (m.get(h.pack) || 0) + h.hp); for (const [pk, v] of m) if (v > hp) { hp = v; best = pk; } const xs = G.husks.filter(h => h.pack === best).map(h => h.x); target = xs.reduce((a, b) => a + b, 0) / xs.length; }
      return { t: G.t, cx: G.cx, target, over: G.over, won: G.won, coins: G.coins, kills: G.kills, peak: G.peak, streak: G.bestStreak, boss: G.bossDmgTotal };
    });
    if (!st) break;
    last = st;
    const dir = st.target < st.cx - 6 ? 'ArrowLeft' : st.target > st.cx + 6 ? 'ArrowRight' : null;
    if (dir) { await page.keyboard.down(dir); await page.waitForTimeout(40); await page.keyboard.up(dir); } else await page.waitForTimeout(40);
  }
  await page.waitForTimeout(400);
  const end = await page.evaluate(() => ({ title: document.getElementById('eTitle').textContent, held: document.getElementById('eHeld').textContent }));
  rows.push({ level: L, result: end.title === 'LINE HELD' ? 'clear' : 'break', held: end.held, coins: last ? last.coins : 0, kills: last ? last.kills : 0, peak: last ? last.peak : 0, streak: last ? last.streak : 0, boss: last ? Math.round(last.boss) : 0, errors: errs.length });
  process.stderr.write(`level ${L}: ${rows[rows.length - 1].result} ${end.held}\n`);
  await page.close();
}
await browser.close(); server.close();
console.log(`\ncamp: ${camp}\n`);
console.log('level  result  held   coins   kills  peak  streak  bossdmg  errors');
for (const r of rows) console.log(String(r.level).padStart(5), r.result.padStart(7), r.held.padStart(5), String(r.coins).padStart(7), String(r.kills).padStart(7), String(r.peak).padStart(5), String(r.streak).padStart(7), String(r.boss).padStart(8), String(r.errors).padStart(7));
const clears = rows.filter(r => r.result === 'clear').length;
console.log(`\n${clears}/${rows.length} cleared`);
