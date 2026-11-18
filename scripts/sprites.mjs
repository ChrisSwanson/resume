// Regenerates the City view's moving sprites from the 3D models in render/sprites_models.py:
//   npm run sprites                     # full: about a minute on the CPU
//   npm run sprites -- --samples 48     # quick draft
//   npm run sprites -- --skip-render    # re-pack and re-encode render/out/sprites/*.png
// Uses the official Blender 4.2 LTS (with OpenImageDenoise) when it is installed at
// ~/.local/opt/blender-4.2.23, else `blender` on PATH; BLENDER=/path/to/blender overrides both.
// Outputs assets/hero/sprites/{cars,air}-{1x,2x}.webp, shadows.webp and sprites.json, and the
// contact sheet render/previews/sprites-sheet.jpg. See render/README.md, "Moving sprites".
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : dflt; };
const lts = join(homedir(), '.local/opt/blender-4.2.23/blender');
const blender = process.env.BLENDER || (existsSync(lts) ? lts : 'blender');
const args = ['-b', '--factory-startup', '-P', 'render/sprites.py', '--',
  '--samples', arg('samples', '192'), '--quality', arg('quality', '88'),
  '--sheet', 'render/previews/sprites-sheet.jpg'];
if (process.argv.includes('--skip-render')) args.push('--only', 'none');

const t0 = Date.now();
const r = spawnSync(blender, args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
for (const l of `${r.stdout}\n${r.stderr}`.split('\n')) {
  if (/^\[(render|sprites|encode)\]|Error|Traceback|assert/i.test(l) && !/EGL Error/.test(l)) console.log('  ' + l);
}
if (r.status !== 0) { console.error(`${blender} failed (${r.status})`); process.exit(1); }
const dest = join(root, 'assets/hero/sprites');
let total = 0;
for (const f of readdirSync(dest)) total += statSync(join(dest, f)).size;
console.log(`  sprites: ${(total / 1024).toFixed(0)} KB in assets/hero/sprites (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
