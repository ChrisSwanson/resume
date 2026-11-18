// Legibility check for the signs: measures the narrowest strokes and counters of each employer's
// mark as delivered, in CSS pixels at a 1440-wide viewport (where the 2400-wide master shows 1:1).
//   node scripts/hero-strokes.mjs <logos-pass.png> <scene.json> [frame] [scale=4]
// The logo pass (render/hero.py --pass logos) paints every logo shape in its flat SVG colour and
// everything else magenta, rendered at `scale` x the master (the pipeline uses 4, i.e. 9600 wide, for quarter-pixel precision).
// For each sign: the logo's pixels inside its box; for each colour, a Euclidean distance transform
// and from it the local thickness of every pixel (the largest inscribed disc covering it).
// Counters are the enclosed non-logo holes (inside letters) of at least 4 CSS px², measured the
// same way. Reported over pixels: the 10th percentile ("narrowest": a stroke's tapered tip is a
// few pixels, not its width) and the median, after dividing by `scale`.
import { readPng } from './hero-trace.mjs';
import { readFileSync } from 'node:fs';

const INF = 1e20;
function edt1(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) {
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      if (s <= z[k]) { k--; continue; }
      break;
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}
/** squared distance from each `inside` pixel to the nearest outside pixel (outside of the box counts) */
function edt(inside, w, h) {
  const W = w + 2, H = h + 2, g = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ix = x - 1, iy = y - 1;
    g[y * W + x] = ix >= 0 && iy >= 0 && ix < w && iy < h && inside[iy * w + ix] ? INF : 0;
  }
  const n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = g[y * W + x];
    edt1(f, H, d, v, z);
    for (let y = 0; y < H; y++) g[y * W + x] = d[y];
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = g[y * W + x];
    edt1(f, W, d, v, z);
    for (let x = 0; x < W; x++) g[y * W + x] = d[x];
  }
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(g[(y + 1) * W + x + 1]);
  return out;
}
/** local thickness (pixels) of every mask pixel: the diameter of the largest disc inside the mask
 * that covers it (Hildebrand & Rüegsegger), so stair-stepped edges take their stroke's width */
function widths(mask, w, h) {
  const d = edt(mask, w, h), t = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, r = d[i];
    if (!mask[i]) continue;
    let top = true;
    for (let dy = -1; dy <= 1 && top; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if ((dx || dy) && xx >= 0 && yy >= 0 && xx < w && yy < h && d[yy * w + xx] > r) { top = false; break; }
    }
    if (!top) continue;
    const ri = Math.floor(r - 1e-9), dia = 2 * r - 0.5, r2 = (r - 0.5) * (r - 0.5);
    for (let yy = Math.max(0, y - ri); yy <= Math.min(h - 1, y + ri); yy++) {
      for (let xx = Math.max(0, x - ri); xx <= Math.min(w - 1, x + ri); xx++) {
        const j = yy * w + xx;
        if ((xx - x) ** 2 + (yy - y) ** 2 <= Math.max(r2, 0) && t[j] < dia) t[j] = dia;
      }
    }
    if (t[i] < dia) t[i] = dia;
  }
  const out = [];
  for (let i = 0; i < t.length; i++) if (mask[i] && t[i] > 0) out.push(t[i]);
  return out.sort((a, b) => a - b);
}
const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN);

/** boxes: {siteId: [x0, y0, x1, y1]} in master pixels (scene.json signBoxes) */
export function measure(pngPath, boxes, scale = 4) {
  const img = readPng(pngPath);
  const { width: W, channels: c, data } = img;
  const res = {};
  for (const [id, box] of Object.entries(boxes)) {
    const [bx0, by0, bx1, by1] = box.map((v, i) => Math.max(0, Math.round(v * scale + (i < 2 ? -2 : 2))));
    // colours to 6 bits a channel, so float rounding (#ff5300 vs #ff5301) does not split a shape
    const key = (x, y) => { const p = (y * W + x) * c; return ((data[p] & 0xfc) << 16) | ((data[p + 1] & 0xfc) << 8) | (data[p + 2] & 0xfc); };
    const BG = 0xfc00fc;
    // the logo's tight box inside the site's region box
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
      if (key(x, y) !== BG) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    if (x1 < 0) { res[id] = null; continue; }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const labels = new Int32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) labels[y * w + x] = key(x0 + x, y0 + y);
    const strokes = [], colours = {};
    for (const L of new Set(labels)) {
      if (L === BG) continue;
      const m = new Uint8Array(w * h);
      for (let i = 0; i < m.length; i++) m[i] = labels[i] === L;
      const ws = widths(m, w, h);
      if (ws.length > 50) colours['#' + L.toString(16).padStart(6, '0')] = +(pct(ws, 0.1) / scale).toFixed(2);
      for (const v of ws) strokes.push(v);
    }
    // counters: background holes not connected to the box edge
    const bg = new Uint8Array(w * h), seen = new Uint8Array(w * h), stack = [];
    for (let i = 0; i < bg.length; i++) bg[i] = labels[i] === BG;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && bg[y * w + x] && !seen[y * w + x]) { seen[y * w + x] = 1; stack.push(y * w + x); }
    }
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy, j = yy * w + xx;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && bg[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    const holes = new Uint8Array(w * h), minArea = 4 * scale * scale;
    for (let i = 0; i < holes.length; i++) {
      if (!bg[i] || seen[i]) continue;
      const comp = [i]; seen[i] = 1;
      for (let k = 0; k < comp.length; k++) {
        const j = comp[k], x = j % w, y = (j - x) / w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy, q = yy * w + xx;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && bg[q] && !seen[q]) { seen[q] = 1; comp.push(q); }
        }
      }
      if (comp.length >= minArea) for (const j of comp) holes[j] = 1;
    }
    const counters = widths(holes, w, h);
    strokes.sort((a, b) => a - b);
    res[id] = {
      widthCss: +(w / scale).toFixed(1), heightCss: +(h / scale).toFixed(1),
      strokeP10: +(pct(strokes, 0.1) / scale).toFixed(2), strokeMedian: +(pct(strokes, 0.5) / scale).toFixed(2),
      counterP10: +(pct(counters, 0.1) / scale).toFixed(2), counterMedian: +(pct(counters, 0.5) / scale).toFixed(2),
      strokeP10ByColour: colours,
    };
  }
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [png, scenePath, frame = 'master', scale = '4'] = process.argv.slice(2);
  const scene = JSON.parse(readFileSync(scenePath, 'utf8'));
  const r = measure(png, scene.signBoxes[frame], +scale);
  console.log('site          width x height (CSS px)   stroke p10 / median  counter p10 / median');
  for (const [id, m] of Object.entries(r)) {
    if (!m) { console.log(id.padEnd(13), 'no logo pixels'); continue; }
    const ok = m.strokeP10 >= 2 && (Number.isNaN(m.counterP10) || m.counterP10 >= 2) ? 'ok' : 'BELOW 2 px';
    console.log(id.padEnd(13), `${m.widthCss} x ${m.heightCss}`.padEnd(26), `${m.strokeP10} / ${m.strokeMedian}`.padEnd(20), `${m.counterP10} / ${m.counterMedian}`.padEnd(20), ok,
      Object.entries(m.strokeP10ByColour).map(([k, v]) => `${k}:${v}`).join(' '));
  }
}
