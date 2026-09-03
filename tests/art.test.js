/* The sprite pack on disk matches its manifest, and the runtime never asks
 * for a part the pipeline does not render. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SPRITES = path.join(ROOT, 'assets', 'sprites');
const manifest = JSON.parse(fs.readFileSync(path.join(SPRITES, 'manifest.json'), 'utf8'));

function pngSize(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.toString('ascii', 1, 4), 'PNG', file + ' is a PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test('every manifest part exists on disk, square, at its declared size', () => {
  const names = Object.keys(manifest.parts);
  assert.ok(names.length >= 10, 'the set has at least ten parts');
  for (const name of names) {
    const part = manifest.parts[name];
    const file = path.join(SPRITES, part.file);
    assert.ok(fs.existsSync(file), name + ' is rendered');
    const { w, h } = pngSize(file);
    assert.equal(w, part.size, name + ' width');
    assert.equal(h, part.size, name + ' height');
    assert.ok(part.pixelsPerUnit > 0);
  }
});

test('the pipeline declares exactly the parts the manifest carries', () => {
  const py = fs.readFileSync(path.join(ROOT, 'tools', 'blender', 'build_sprites.py'), 'utf8');
  const declared = [...py.matchAll(/^\s+"([a-z_0-9]+)":\s+\(/gm)].map(m => m[1]).sort();
  assert.deepEqual(Object.keys(manifest.parts).sort(), declared);
});

test('the runtime only draws parts that exist', () => {
  const js = fs.readFileSync(path.join(ROOT, 'src', 'game.js'), 'utf8');
  const literal = [...js.matchAll(/art\.draw\(ctx, '([a-z_0-9]+)'[,)]/g)].map(m => m[1]);
  for (const name of literal) assert.ok(name in manifest.parts, name + ' is in the manifest');
  for (const name of ['sentinel', 'frostlamp', 'walker', 'lamp', 'muzzle', 'wheel']) assert.ok(literal.includes(name), name + ' is drawn by the runtime');
  // families built as kind + '_' + frame
  for (const kind of ['husk', 'runner', 'brute', 'soldier', 'colossus']) for (const f of [0, 1]) {
    assert.ok(`${kind}_${f}` in manifest.parts, `${kind}_${f} is in the manifest`);
  }
});
