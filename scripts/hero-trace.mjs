// Traces the object-ID passes into the hover regions of the City view.
//   node scripts/hero-trace.mjs <scene.json> <out.json> master=<id-master.png> portrait=<id-portrait.png>
// Each site is painted one flat colour in its ID pass (render/hero.py, id_pass), showing only its
// visible pixels, so occlusion is already handled. This script labels pixels by nearest colour,
// follows the outline of each site's pixels with marching squares, drops holes, simplifies with
// Douglas-Peucker, and writes polygons in image pixel coordinates. No dependencies: the PNG
// decoder below handles the 8-bit RGB/RGBA, non-interlaced files Blender writes.
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export function readPng(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path}: not a PNG`);
  let off = 8, width, height, depth, type, interlace;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const kind = buf.toString('latin1', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      depth = body[8]; type = body[9]; interlace = body[12];
    } else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    off += 12 + len;
  }
  const channels = { 2: 3, 6: 4, 0: 1, 4: 2 }[type];
  if (depth !== 8 || !channels || interlace) throw new Error(`${path}: unsupported PNG (depth ${depth}, type ${type})`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const data = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? data[dst + x - channels] : 0;
      const b = y ? data[dst - stride + x] : 0;
      const c = x >= channels && y ? data[dst - stride + x - channels] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      data[dst + x] = v & 255;
    }
  }
  return { width, height, channels, data };
}

/** Label every pixel with the index (1-based) of the nearest ID colour, or 0 for background. */
function label(img, colors) {
  const { width, height, channels, data } = img;
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < width * height; i++, p += channels) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    if (r + g + b < 90) continue;
    let best = 0, bd = 1e9;
    colors.forEach(([cr, cg, cb], k) => {
      const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
      if (d < bd) { bd = d; best = k + 1; }
    });
    if (bd < 60 * 60) out[i] = best;
  }
  return out;
}

// marching squares: segments between edge midpoints for each 2x2 case (tl, tr, br, bl bits)
const T = [0.5, 0], R = [1, 0.5], B = [0.5, 1], L = [0, 0.5];
const CASES = {
  1: [[L, B]], 2: [[B, R]], 3: [[L, R]], 4: [[T, R]], 5: [[L, T], [B, R]], 6: [[T, B]], 7: [[L, T]],
  8: [[T, L]], 9: [[T, B]], 10: [[T, R], [L, B]], 11: [[T, R]], 12: [[L, R]], 13: [[B, R]], 14: [[L, B]],
};

function loops(mask, w, h) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
  const adj = new Map();
  const key = (p) => `${p[0]},${p[1]}`;
  const link = (a, b) => {
    const ka = key(a), kb = key(b);
    if (!adj.has(ka)) adj.set(ka, { p: a, n: [] });
    if (!adj.has(kb)) adj.set(kb, { p: b, n: [] });
    adj.get(ka).n.push(kb); adj.get(kb).n.push(ka);
  };
  for (let y = -1; y < h; y++) {
    for (let x = -1; x < w; x++) {
      const c = at(x, y) * 8 + at(x + 1, y) * 4 + at(x + 1, y + 1) * 2 + at(x, y + 1);
      for (const [a, b] of CASES[c] ?? []) link([x + a[0], y + a[1]], [x + b[0], y + b[1]]);
    }
  }
  const seen = new Set(), out = [];
  for (const [k0] of adj) {
    if (seen.has(k0)) continue;
    const loop = [];
    let prev = null, cur = k0;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const node = adj.get(cur);
      loop.push(node.p);
      const next = node.n.find((k) => k !== prev && !seen.has(k));
      prev = cur; cur = next;
    }
    if (loop.length > 2) out.push(loop);
  }
  return out;
}

const area = (pts) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

function inside([x, y], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function simplify(pts, eps) {
  if (pts.length < 4) return pts;
  const d = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    if (!L2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  const dp = (s, e, keep) => {
    let m = 0, mi = -1;
    for (let i = s + 1; i < e; i++) { const v = d(pts[i], pts[s], pts[e]); if (v > m) { m = v; mi = i; } }
    if (m > eps) { keep[mi] = true; dp(s, mi, keep); dp(mi, e, keep); }
  };
  // split the closed loop at its farthest point from the start, so both halves are open chains
  let far = 0;
  pts.forEach((p, i) => { if (Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) > Math.hypot(pts[far][0] - pts[0][0], pts[far][1] - pts[0][1])) far = i; });
  const ring = [...pts, pts[0]];
  const keep = new Array(ring.length).fill(false);
  keep[0] = keep[far] = keep[ring.length - 1] = true;
  const saved = pts; pts = ring;
  dp(0, far, keep); dp(far, ring.length - 1, keep);
  pts = saved;
  return ring.filter((_, i) => keep[i]).slice(0, -1);
}

export function trace(pngPath, colors, ids, { minArea = 120, eps = 0.6 } = {}) {
  const img = readPng(pngPath);
  const { width, height } = img;
  const lab = label(img, colors);
  const sites = {};
  ids.forEach((id, k) => {
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (lab[y * width + x] === k + 1) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[y * w + x] = lab[(y + y0) * width + x + x0] === k + 1 ? 1 : 0;
    const all = loops(mask, w, h).filter((l) => area(l) >= minArea);
    const outer = all.filter((l) => !all.some((o) => o !== l && area(o) > area(l) && inside(l[0], o)));
    const polys = outer.map((l) => simplify(l, eps).map(([x, y]) => [Math.round((x + x0 + 0.5) * 2) / 2, Math.round((y + y0 + 0.5) * 2) / 2]));
    sites[id] = { bbox: [x0, y0, x1 + 1, y1 + 1], polys: polys.map((p) => p.flat()) };
  });
  return { width, height, sites };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [scenePath, outPath, ...frames] = process.argv.slice(2);
  const scene = JSON.parse(readFileSync(scenePath, 'utf8'));
  const ids = Object.keys(scene.idColors);
  const colors = ids.map((id) => scene.idColors[id]);
  const out = {};
  for (const f of frames) {
    const [name, png] = f.split('=');
    out[name] = trace(png, colors, ids);
    const n = Object.values(out[name].sites).reduce((s, v) => s + v.polys.reduce((t, p) => t + p.length / 2, 0), 0);
    console.log(`[trace] ${name}: ${Object.keys(out[name].sites).length} sites, ${n} points`);
  }
  writeFileSync(outPath, JSON.stringify(out) + '\n');
}
