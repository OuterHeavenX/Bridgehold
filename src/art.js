/* The rendered sprite pack. `loadArt` reads assets/sprites/manifest.json and
 * every image it names; if the manifest or any image fails, it resolves to
 * null and the runtime keeps drawing its vector fallbacks, so the game never
 * depends on the renders to be playable.
 *
 * Every sprite is square and its subject's ground point sits at the image
 * centre, so `draw` centres the image on the unit's position. `ppu` is the
 * game pixels per Blender unit the caller wants; the pack scales from the
 * manifest's pixelsPerUnit to that. */

export function loadArt(base = 'assets/sprites/') {
  return fetch(base + 'manifest.json')
    .then(r => (r.ok ? r.json() : Promise.reject(new Error('no manifest'))))
    .then(manifest => {
      const names = Object.keys(manifest.parts);
      return Promise.all(names.map(name => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve([name, { img, ppu: manifest.parts[name].pixelsPerUnit, size: manifest.parts[name].size }]);
        img.onerror = () => reject(new Error('missing sprite ' + name));
        img.src = base + manifest.parts[name].file;
      }))).then(entries => makePack(Object.fromEntries(entries)));
    })
    .catch(err => { console.warn('sprite pack not installed:', err.message); return null; });
}

function makePack(parts) {
  return {
    parts,
    has(name) { return name in parts; },
    /* Draw `name` centred at (x, y), at `ppu` game pixels per unit, with an
       optional horizontal flip and alpha. */
    draw(ctx, name, x, y, ppu, opts = {}) {
      const p = parts[name]; if (!p) return false;
      const s = (ppu / p.ppu) * p.size, half = s / 2;
      const flip = opts.flip ? -1 : 1;
      if (opts.alpha !== undefined || opts.flip || opts.scale) {
        ctx.save();
        if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
        ctx.translate(x, y);
        ctx.scale(flip * (opts.scale || 1), opts.scale || 1);
        ctx.drawImage(p.img, -half, -half, s, s);
        ctx.restore();
      } else {
        ctx.drawImage(p.img, x - half, y - half, s, s);
      }
      return true;
    },
  };
}
