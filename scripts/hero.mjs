// Regenerates everything the City view ships, from the Blender scene in render/:
//   npm run hero                       # full: renders, passes, encode, trace, sign check, sprites
//   npm run hero -- --samples 64       # faster draft renders
//   npm run hero -- --skip-render      # reuse render/out/*.png (re-encode and re-trace only)
//   npm run hero -- --no-sprites       # leave the moving sprites (npm run sprites) alone
// Uses the official Blender 4.2 LTS (with OpenImageDenoise) when it is installed at
// ~/.local/opt/blender-4.2.23, else `blender` on PATH; BLENDER=/path/to/blender overrides both.
// Intermediates go to render/out/ (git-ignored); outputs go to assets/hero/:
//   master-{4800,2400}.webp + master-2400.jpg      the 4800x3200 master, for DPR 2 and 1
//   portrait-{1560,780}.webp + portrait-780.jpg    the portrait, the same way
// Image coordinates everywhere (regions, scene.json, masks) are the 1x frame: 2400x1600, 780x1688.
//   regions.json   hover polygons per site, in image pixels, for each frame
//   scene.json     camera, frames, traffic lanes, site positions, palette (for the sprites)
//   roads-<frame>-{street,freeway}.png   car masks from the road pass (cars hide behind buildings)
//   logos/<id>.svg the official logos (render/logos, see SOURCES.md) for the cards
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { measure } from './hero-strokes.mjs';
import { fileURLToPath } from 'node:url';
import { trace } from './hero-trace.mjs';
import { roadMasks } from './hero-mask.mjs';
import { projection } from '../src/hero/projection.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'render/out');
const dest = join(root, 'assets/hero');
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : dflt; };
const samples = arg('samples', '512');
const skipRender = process.argv.includes('--skip-render');
const lts = join(homedir(), '.local/opt/blender-4.2.23/blender');
const blender = process.env.BLENDER || (existsSync(lts) ? lts : 'blender');
const SCALE = 200;           // the beauty renders are mastered at 2x the frame
const SIGN_SCALE = 400;      // the logo pass, for quarter-pixel stroke measurements
mkdirSync(out, { recursive: true });
mkdirSync(join(dest, 'logos'), { recursive: true });

function run(cmd, args) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
  const lines = `${r.stdout}\n${r.stderr}`.split('\n').filter((l) => /^\[(render|export|encode|trace|ramp)\]|Error|Traceback/.test(l) && !/EGL Error/.test(l));
  for (const l of lines) console.log('  ' + l);
  if (r.status !== 0) { console.error(`${cmd} failed (${r.status})`); process.exit(1); }
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
const hero = (...a) => run(blender, ['-b', '--factory-startup', '-P', 'render/hero.py', '--', ...a]);

for (const frame of ['master', 'portrait']) {
  console.log(`scene facts ${frame}`);
  hero('--mode', 'key', '--frame', frame, '--export', `render/out/scene-${frame}.json`, '--export-only');
  if (skipRender) continue;
  console.log(`render ${frame} at ${SCALE}%`);
  hero('--mode', 'key', '--frame', frame, '--samples', samples, '--scale', String(SCALE), '--out', `render/out/${frame}.png`);
  for (const pass of ['id', 'roads']) {
    console.log(`${pass} pass ${frame}`);
    hero('--mode', 'key', '--frame', frame, '--pass', pass, '--out', `render/out/${pass}-${frame}.png`);
  }
  console.log(`depth pass ${frame}`);
  hero('--mode', 'key', '--frame', frame, '--pass', 'depth', '--out', `render/out/depth-${frame}.png`);
  console.log(`logo pass ${frame} at ${SIGN_SCALE}%`);
  hero('--mode', 'key', '--frame', frame, '--pass', 'logos', '--scale', String(SIGN_SCALE), '--out', `render/out/logos-${frame}.png`);
}

console.log('encode');
const encode = (name, webp, jpeg, q = 88) => run(blender, ['-b', '--factory-startup', '-P', 'render/encode.py', '--',
  '--in', `render/out/${name}.png`, '--out', `assets/hero/${name}`, '--webp-widths', webp, '--jpeg-widths', jpeg,
  '--webp', String(q), '--jpeg', '84']);
encode('master', '4800', 'none', 80);      // the 2x master at q80 keeps it near 1.5 MB (q88 is 2.1 MB)
encode('master', '2400', '2400');
encode('portrait', '1560,780', '780');

// one scene.json: the facts are the same for both frames except the projection checks
const scene = JSON.parse(readFileSync(join(out, 'scene-master.json'), 'utf8'));
const portrait = JSON.parse(readFileSync(join(out, 'scene-portrait.json'), 'utf8'));
scene.checks.portrait = portrait.checks.portrait;
scene.titleBoxes.portrait = portrait.titleBoxes.portrait;
scene.signBoxes.portrait = portrait.signBoxes.portrait;
// the page projects sprites with src/hero/projection.js: it must agree with Blender's camera
for (const [frame, checks] of Object.entries(scene.checks)) {
  const P = projection(scene, frame);
  for (const [x, y, z, px, py] of checks) {
    const [qx, qy] = P.at(x, y, z);
    if (Math.hypot(qx - px, qy - py) > 0.75) {
      console.error(`projection mismatch (${frame}) at ${x},${y},${z}: page ${qx.toFixed(2)},${qy.toFixed(2)} vs Blender ${px},${py}`);
      process.exit(1);
    }
  }
}
console.log('  [check] page projection matches Blender for both frames');

console.log('road masks');
for (const frame of ['master', 'portrait']) {
  const lift = Math.ceil(3.2 * Math.cos(scene.camera.elevation * Math.PI / 180) * projection(scene, frame).k);
  const depth = join(out, `depth-${frame}.png`);
  const sz = roadMasks(join(out, `roads-${frame}.png`), join(dest, `roads-${frame}`), lift, existsSync(depth) ? depth : null);
  console.log(`  [mask] ${frame}: street ${(sz.street / 1024).toFixed(0)} KB, freeway ${(sz.freeway / 1024).toFixed(0)} KB, ` +
    `${sz.blocked} px kept out of the growth (in front of the road)`);
}

console.log('trace');
const ids = Object.keys(scene.idColors);
const regions = {};
for (const frame of ['master', 'portrait']) {
  regions[frame] = trace(join(out, `id-${frame}.png`), ids.map((id) => scene.idColors[id]), ids);
  console.log(`  [trace] ${frame}: ${Object.keys(regions[frame].sites).join(', ')}`);
}
writeFileSync(join(dest, 'regions.json'), JSON.stringify(regions) + '\n');
const { idColors, ...pub } = scene;
writeFileSync(join(dest, 'scene.json'), JSON.stringify(pub) + '\n');

// logos for the cards: the same official files the renders use
const files = { wellsfargo: 'wellsfargo-wordmark.svg', twitch: 'twitch-wordmark.svg' };
for (const id of ids) {
  const src = join(root, 'render/logos', files[id] ?? `${id}.svg`);
  if (existsSync(src)) copyFileSync(src, join(dest, 'logos', `${id}.svg`));
}
// sign legibility: the narrowest strokes and counters of each logo in CSS px (frame px at 1x)
console.log('sign strokes');
const strokes = {};
for (const frame of ['master', 'portrait']) {
  const png = join(out, `logos-${frame}.png`);
  if (!existsSync(png)) continue;
  strokes[frame] = measure(png, scene.signBoxes[frame], SIGN_SCALE / 100);
  for (const [id, m] of Object.entries(strokes[frame])) {
    if (!m) { console.log(`  [strokes] ${frame} ${id}: not in view`); continue; }
    // the floor applies to the master at 1440 wide (1 frame px = 1 CSS px); the portrait's frame px
    // are about device px on a 390-wide phone at DPR 2, reported for information
    const ok = frame !== 'master' ? '(device px on a phone)'
      : m.strokeP10 >= 2 && (Number.isNaN(m.counterP10) || m.counterP10 >= 2) ? 'ok' : 'BELOW the 2 px floor';
    console.log(`  [strokes] ${frame} ${id.padEnd(12)} ${m.widthCss}x${m.heightCss} px  stroke p10 ${m.strokeP10} median ${m.strokeMedian}  counter p10 ${m.counterP10}  ${ok}`);
  }
}
writeFileSync(join(out, 'strokes.json'), JSON.stringify(strokes, null, 1) + '\n');

// the moving sprites are their own pipeline (npm run sprites); run it last so one command
// rebuilds everything
if (!process.argv.includes('--no-sprites') && existsSync(join(root, 'scripts/sprites.mjs'))) {
  console.log('sprites');
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [join(root, 'scripts/sprites.mjs')], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`sprites failed (${r.status})`); process.exit(1); }
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
console.log(`done: ${dest}`);
