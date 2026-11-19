// Things that move over the still: traffic on the street, freeway and ramp lanes, planes with
// contrails, a helicopter hopping between the employer buildings, and hot-air balloons. They are
// 3D models pre-rendered with the city's own camera, sun and colour management
// (`npm run sprites`, render/sprites.py) into atlases indexed by assets/hero/sprites/sprites.json.
//
// Drawing: four canvases (ground shadows, street cars, freeway cars, air), each the size of the
// visible part of the image, placed inside the panning world, so they move with the city at no
// cost. The street and freeway canvases carry the render's road masks (CSS mask-image), so cars
// pass behind whatever stands in front of a road. Only the rectangles drawn last frame are
// cleared. A sprite shows the atlas heading whose projected axis best matches its projected 3D
// direction of travel (with a little hysteresis); images are never rotated, except a balloon's sway.
//
// Motion is random and loops forever on one requestAnimationFrame clock, which runs only while the
// City view is shown. The simulation steps every frame but the canvases repaint at 30 Hz (pacing.js),
// plus once, at once, whenever the camera moves. Cars follow the car ahead with a gap and change lanes (ramps) only into a
// gap, at exact stations, easing out any offset. With prefers-reduced-motion one still is drawn.
import { projection } from './projection.js';
import { createPacer } from './pacing.js';

const RAD = Math.PI / 180;
const PAINT_HZ = 30;                       // idle repaint rate; the simulation still steps every frame
let modelNo = 0;                           // numbers models for cache keys
function seeded(seed) {                    // mulberry32, for the reduced-motion still
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const indexes = new Map();
/** sprites.json for a base URL, loaded once */
function loadIndex(base) {
  if (!indexes.has(base)) {
    indexes.set(base, fetch(`${base}sprites/sprites.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((ix) => {
      if (ix) for (const [id, m] of Object.entries(ix.models)) m.id = id;
      return ix;
    }));
  }
  return indexes.get(base);
}
const images = new Map();
function image(url, onload) {
  let im = images.get(url);
  if (!im) {
    im = new Image();
    im.decoding = 'async';
    im.src = url;
    images.set(url, im);
  }
  if (onload && !im.complete) im.addEventListener('load', onload, { once: true });
  return im;
}
const loaded = (im) => im && im.complete && im.naturalWidth > 0;
/** the smallest file of an atlas with at least `need` px per metre */
function fileFor(atlas, need) {
  const keys = Object.keys(atlas.files).map(Number).sort((a, b) => a - b), top = keys.at(-1);
  for (const r of keys) if (atlas.pxPerM * r / top >= need / 1.15) return [r, top];
  return [top, top];
}

/** A polyline of [x, y] or [x, y, z] points (lengths measured in plan). at(s) fills one reused
 *  object with position, tangent (tz is the grade, or the exported 3D tangent at the nearer
 *  vertex when `tans` is given) and segment index. */
function path(pts, z0 = 0, tans = null) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const out = { x: 0, y: 0, z: z0, tx: 1, ty: 0, tz: 0, i: 1 };
  let i = 1;
  return {
    pts, cum, length: cum.at(-1),
    at(s) {
      if (i >= cum.length || cum[i - 1] > s) i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const a = pts[i - 1], b = pts[i];
      const seg = cum[i] - cum[i - 1] || 1, t = (s - cum[i - 1]) / seg;
      out.x = a[0] + (b[0] - a[0]) * t; out.y = a[1] + (b[1] - a[1]) * t;
      if (a.length > 2) { out.z = a[2] + (b[2] - a[2]) * t; out.tz = (b[2] - a[2]) / seg; }
      out.tx = (b[0] - a[0]) / seg; out.ty = (b[1] - a[1]) / seg; out.i = i;
      const T = tans?.[t < 0.5 ? i - 1 : i];
      if (T) { out.tx = T[0]; out.ty = T[1]; out.tz = T[2]; out.i = 2 * i + (t < 0.5 ? 0 : 1); }
      return out;
    },
    /** the station and distance of the point nearest (x, y), with its tangent */
    nearest(x, y) {
      let best = { s: 0, d: Infinity, tx: 1, ty: 0 };
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k], dx = b[0] - a[0], dy = b[1] - a[1], L = cum[k] - cum[k - 1] || 1;
        const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy) / (L * L)));
        const d = Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y);
        if (d < best.d) best = { s: cum[k - 1] + L * t, d, tx: dx / L, ty: dy / L };
      }
      return best;
    },
  };
}
/** the part of a path between two stations, keeping its own vertices */
function slice(p, s0, s1) {
  const pick = (s) => { const q = p.at(s); return p.pts[0].length > 2 ? [q.x, q.y, q.z] : [q.x, q.y]; };
  const out = [pick(s0)];
  for (let k = 0; k < p.pts.length; k++) if (p.cum[k] > s0 + 0.01 && p.cum[k] < s1 - 0.01) out.push(p.pts[k]);
  out.push(pick(s1));
  return out;
}

/**
 * @param {{ground: SVGSVGElement, street: SVGSVGElement, freeway: SVGSVGElement, air: SVGSVGElement}} layers
 *   the City view's sprite layers; a canvas is placed after each (the SVGs stay empty)
 * @param {object} scene  assets/hero/scene.json
 * @param {'master'|'portrait'} frameName
 * @param {{titleColor?: string}} theme
 * @param {{avoid?: number[][], base?: string}} opts  avoid: sign boxes [x0,y0,x1,y1] in image px
 */
export function createSprites(layers, scene, frameName, theme, { avoid = [], base = 'assets/hero/' } = {}) {
  const P = projection(scene, frameName);
  const W = P.width, H = P.height;
  // the projection's affine coefficients, so the hot loop projects without allocating
  const [ox, oy] = P.at(0, 0, 0), [x1, y1] = P.at(1, 0, 0), [x2, y2] = P.at(0, 1, 0), [x3, y3] = P.at(0, 0, 1);
  const AX = x1 - ox, AY = y1 - oy, BX = x2 - ox, BY = y2 - oy, CX = x3 - ox, CY = y3 - oy;
  let qx = 0, qy = 0;
  const proj = (x, y, z) => { qx = ox + AX * x + BX * y + CX * z; qy = oy + AY * x + BY * y + CY * z; };

  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motionQuery.matches;
  const rnd = reduced ? seeded(7) : Math.random;
  const range = (a, b) => a + (b - a) * rnd();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const dir = `${base}sprites/`;

  const sunAz = scene.sun.shadowAzimuth * RAD, sunCot = 1 / Math.tan(scene.sun.elevation * RAD);
  const sdx = Math.cos(sunAz) * sunCot, sdy = Math.sin(sunAz) * sunCot;

  // ── canvases ─────────────────────────────────────────────────────────────
  const L = {};
  for (const kind of ['ground', 'street', 'freeway', 'air']) {
    const svg = layers[kind];
    svg.replaceChildren();
    svg.style.maskImage = svg.style.webkitMaskImage = 'none';
    svg.parentNode.querySelector(`canvas.sprites-${kind}`)?.remove();
    const canvas = document.createElement('canvas');
    canvas.className = `sprites-${kind}`;
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none', transformOrigin: '0 0' });
    svg.after(canvas);
    // the car layers are masked by the road pass inside the canvas (a CSS mask on a canvas that
    // changes every frame is slow in Firefox)
    const mask = kind === 'street' || kind === 'freeway' ? image(`${base}roads-${frameName}-${kind}.png`, () => redraw()) : null;
    L[kind] = { canvas, ctx: canvas.getContext('2d'), rects: new Float32Array(4 * 512), n: 0, full: true, mask, cut: null, cutOk: false };
  }
  const canFilter = typeof L.ground.ctx.filter === 'string';
  // soft shadows are blurred once per (sprite, heading, blur, zoom) into a small canvas and reused:
  // a canvas filter per frame is slow in Chromium
  const soft = new Map();

  // the part of the image the viewer can see (image px), kept current by the City view;
  // g scales flyers up when the view is small (the phone frame) so they stay legible
  // Device pixels per CSS pixel for the canvases, the view's D and the atlas choice, capped: past
  // 1.5 the extra pixels cost fill and memory but the sprites are small, moving and soft.
  const DENSITY_CAP = 1.5;
  const density = () => Math.min(window.devicePixelRatio || 1, DENSITY_CAP);
  let laidOutAt = 0;                                          // the density the canvases were last sized for (0: no view yet)
  const view = { x0: 0, y0: 0, x1: W, y1: H, s: 1, g: 1, D: 1 };
  const inView = (px, py, m) => px > view.x0 - m && px < view.x1 + m && py > view.y0 - m && py < view.y1 + m;
  function layout() {
    const dpr = density();
    const cw = (view.x1 - view.x0) * view.s, ch = (view.y1 - view.y0) * view.s;
    laidOutAt = dpr;
    const bw = Math.max(1, Math.round(cw * dpr)), bh = Math.max(1, Math.round(ch * dpr));
    view.D = bw / Math.max(1e-6, view.x1 - view.x0);         // canvas px per image px
    for (const l of Object.values(L)) {
      const c = l.canvas;
      if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }   // assigning reallocates, even to the same size
      c.style.width = `${cw}px`; c.style.height = `${ch}px`;
      c.style.transform = `translate(${view.x0 * view.s}px, ${view.y0 * view.s}px)`;
      l.full = true;                                    // the drawn rectangles are in the old origin's pixels
      l.cutOk = false;                                  // and the road cut in the old origin and scale
    }
    if (S) chooseFiles();
  }

  // ── atlases ──────────────────────────────────────────────────────────────
  let S = null;                                               // sprites.json
  const atl = {};                                             // name -> { meta, img, f, u }
  function chooseFiles() {
    const dpr = density();
    for (const [name, meta] of Object.entries(S.atlases)) {
      const scale = name === 'air' ? view.g : 1;
      const [r, top] = fileFor(meta, P.k * view.s * dpr * scale);
      const a = atl[name] ??= { meta, img: null, f: 1, u: P.k / meta.pxPerM, want: '' };
      const url = dir + meta.files[r];
      if (url === a.want) continue;
      a.want = url;
      const im = image(url, () => { if (a.want === url) { a.img = im; a.f = r / top; soft.clear(); redraw(); } });
      if (loaded(im) || !a.img) { a.img = im; a.f = r / top; soft.clear(); }   // shadows are blurred from this atlas
    }
  }
  // the screen axis of each atlas column, per model, for choosing a heading from a projected
  // direction: the uniform headings, then any extraYaws (road vehicles, near the freeway's yaws)
  function axes(m) {
    if (m.axes) return m.axes;
    const ex = m.extraYaws ?? [], n = m.headings + ex.length, A = new Float32Array(2 * n);
    for (let h = 0; h < n; h++) {
      const a = (h < m.headings ? h * m.headingStep : ex[h - m.headings]) * RAD;
      const vx = AX * Math.cos(a) + BX * Math.sin(a), vy = AY * Math.cos(a) + BY * Math.sin(a), l = Math.hypot(vx, vy) || 1;
      A[2 * h] = vx / l; A[2 * h + 1] = vy / l;
    }
    return (m.axes = A);
  }
  const KEEP = Math.cos(0.5 * RAD);                            // hysteresis: 0.5 degree on screen
  /** the column whose projected axis best matches the projected 3D direction; keeps `cur`
   *  unless another is better by more than half a degree, so a sprite does not flicker */
  function headingFor(m, tx, ty, tz, cur) {
    const A = axes(m), vx = AX * tx + BX * ty + CX * tz, vy = AY * tx + BY * ty + CY * tz, n = Math.hypot(vx, vy) || 1;
    let best = 0, bd = -2, cd = -2;
    for (let h = 0; h < A.length / 2; h++) {
      const d = (A[2 * h] * vx + A[2 * h + 1] * vy) / n;
      if (d > bd) { bd = d; best = h; }
      if (h === cur) cd = d;
    }
    // cos(angle to cur) >= cos(angle to best + 0.5 deg), by the angle-sum identity
    return cur >= 0 && cd >= bd * KEEP - Math.sqrt(Math.max(0, 1 - bd * bd)) * Math.sqrt(1 - KEEP * KEEP) ? cur : best;
  }
  /** draw frame (h, v, p) of model m with its anchor at image px (x, y) */
  function blit(l, m, h, v, p, x, y, scale = 1, alpha = 1, rot = 0, pivot = 0) {
    const a = atl[m.atlas];
    if (!a || !loaded(a.img) || alpha <= 0.003) return;
    const f = a.f, k = a.u * scale, cw = m.cell[0], ch = m.cell[1];
    const dx = x - m.anchor[0] * k, dy = y - m.anchor[1] * k, dw = cw * k, dh = ch * k;
    if (dx > view.x1 || dy > view.y1 || dx + dw < view.x0 || dy + dh < view.y0) return;
    const ctx = l.ctx;
    ctx.globalAlpha = alpha;
    const sx = (m.origin[0] + h * cw) * f, sy = (m.origin[1] + (v * m.phases + p) * ch) * f;
    if (rot) {
      ctx.save();
      ctx.translate(x, y + pivot); ctx.rotate(rot); ctx.translate(-x, -y - pivot);
      ctx.drawImage(a.img, sx, sy, cw * f, ch * f, dx, dy, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(a.img, sx, sy, cw * f, ch * f, dx, dy, dw, dh);
    }
    const mg = rot ? dw * 0.1 : 0;
    mark(l, dx - mg, dy - mg, dw + 2 * mg, dh + 2 * mg);
  }
  function mark(l, x, y, w, h) {
    if (l.n * 4 >= l.rects.length) { const r = new Float32Array(l.rects.length * 2); r.set(l.rects); l.rects = r; }
    const r = l.rects, i = l.n++ * 4;
    r[i] = x; r[i + 1] = y; r[i + 2] = w; r[i + 3] = h;
  }
  function begin(l) {
    const ctx = l.ctx, D = view.D;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (l.full) { ctx.clearRect(0, 0, l.canvas.width, l.canvas.height); l.full = false; }
    else {
      const r = l.rects, m = 2 / D;
      ctx.setTransform(D, 0, 0, D, -view.x0 * D, -view.y0 * D);
      for (let i = 0; i < l.n * 4; i += 4) ctx.clearRect(r[i] - m, r[i + 1] - m, r[i + 2] + 2 * m, r[i + 3] + 2 * m);
    }
    l.n = 0;
    ctx.setTransform(D, 0, 0, D, -view.x0 * D, -view.y0 * D);
  }

  // ── shadows of flyers: on the ground canvas, offset along the sun, blurred with height ──
  function drawShadow(m, h, x, y, z, scale, alpha = 1) {
    const sm = S.models[m.shadow], a = sm && atl[sm.atlas];
    if (!a || !loaded(a.img)) return;
    h = Math.min(h, sm.headings - 1);
    proj(x + sdx * z, y + sdy * z, 0);
    alpha *= Math.min(0.9, Math.max(0.35, 1 - z / 900));
    if (!canFilter) { blit(L.ground, sm, h, 0, 0, qx, qy, scale, alpha * 0.7); return; }
    // canvas px: the sprite's scale and the blur, softer the higher it flies, both quantised
    const D = view.D, k = Math.round(a.u * scale * D * 16) / 16, sg = Math.round((0.3 + z * 0.006) * P.k * D * 2) / 2;
    const key = (((sm.n ??= ++modelNo) * 64 + h) * 512 + sg * 2) * 4096 + k * 16;
    let c = soft.get(key);
    if (!c) {
      if (soft.size > 48) soft.clear();
      const cw = sm.cell[0], ch = sm.cell[1], f = a.f, pad = Math.ceil(sg * 3);
      c = document.createElement('canvas');
      c.width = Math.ceil(cw * k) + 2 * pad; c.height = Math.ceil(ch * k) + 2 * pad;
      const g = c.getContext('2d');
      g.filter = `blur(${sg}px)`;
      g.drawImage(a.img, (sm.origin[0] + h * cw) * f, sm.origin[1] * f, cw * f, ch * f, pad, pad, cw * k, ch * k);
      c.pad = pad;
      soft.set(key, c);
    }
    const dx = qx - (sm.anchor[0] * k + c.pad) / D, dy = qy - (sm.anchor[1] * k + c.pad) / D, dw = c.width / D, dh = c.height / D;
    if (dx > view.x1 || dy > view.y1 || dx + dw < view.x0 || dy + dh < view.y0) return;
    const ctx = L.ground.ctx;
    ctx.globalAlpha = alpha;
    ctx.drawImage(c, dx, dy, dw, dh);
    mark(L.ground, dx, dy, dw, dh);
  }


  // ── cars ────────────────────────────────────────────────────────────────
  // Lanes are cut to the part that projects into the image (keeping their vertices) and fed by a
  // random spawner. A car never closes within a gap of the car ahead. Ramp lanes
  // (scene.rampLanes, [x, y, z] points) are fed by the lane their start lies on and hand their
  // cars to the lane at their end, each only into a gap.
  const lanes = [];
  const carPool = [];
  function laneOf(road, pts, z, opts, tans = null) {
    const fw = road === 'freeway';
    const p = path(pts, z, tans), mid = p.at(p.length / 2);
    proj(mid.x, mid.y, mid.z);
    return {
      path: p, layer: fw ? L.freeway : L.street, depth: qy,
      speed: [18, 27], spacing: 55, mix: fw ? [0.68, 0.94] : [0.78, 0.94],   // sedan below mix[0], truck below mix[1], else bus
      diverts: [], exit: null, fed: false, cars: [], next: 0, ...opts,
    };
  }
  function buildLanes() {
    for (const l of scene.lanes ?? []) {
      const full = path(l.pts, l.z ?? 0);
      let first = -1, last = -1;
      for (let s = 0; s <= full.length; s += 8) {
        const q = full.at(s);
        proj(q.x, q.y, q.z);
        if (qx > -80 && qx < W + 80 && qy > -80 && qy < H + 80) { if (first < 0) first = s; last = s; }
      }
      if (first < 0) continue;
      const s0 = Math.max(0, first - 16), s1 = Math.min(full.length, last + 16);
      const fw = l.road === 'freeway';
      const y0 = l.pts[0][1];
      const wide = !fw && scene.streets.some(([a, b]) => b - a >= 18 && y0 > a && y0 < b);
      lanes.push(laneOf(l.road, slice(full, s0, s1), l.z ?? 0, {
        speed: fw ? [18, 27] : wide ? [9, 14] : [7, 11],
        spacing: fw ? 55 : wide ? 110 : 230,                  // mean metres between cars
      }));
    }
    const near = (x, y, tx, ty) => {
      let best = null;
      for (const lane of lanes) {
        if (lane.ramp) continue;
        const n = lane.path.nearest(x, y);
        if (n.d < 6 && n.tx * tx + n.ty * ty > 0.6 && (!best || n.d < best.d)) best = { lane, s: n.s, d: n.d };
      }
      return best;
    };
    for (const r of scene.rampLanes ?? []) {
      if (!r.pts?.length) continue;
      const tans = r.tangents ?? r.tans ?? null;             // unit 3D tangents, one per point, if exported
      const lane = laneOf('freeway', r.pts, 0, { ramp: r.kind, speed: [11, 16], spacing: 140 }, tans?.length === r.pts.length ? tans : null);
      lanes.push(lane);
      const a = lane.path.at(0), from = near(a.x, a.y, a.tx, a.ty);
      if (from) { from.lane.diverts.push({ s: from.s, to: lane, p: r.kind === 'off' ? 0.35 : 0.3 }); lane.fed = true; }
      const b = lane.path.at(lane.path.length);
      lane.exit = near(b.x, b.y, b.tx, b.ty);
    }
    lanes.sort((a, b) => a.depth - b.depth);
  }
  const GAP = 3;                                               // metres between bumpers
  function newCar(lane, s, speed) {
    const r = rnd();
    const model = S.models[r < lane.mix[0] ? 'sedan' : r < lane.mix[1] ? 'truck' : 'bus'];
    const c = carPool.pop() ?? {};
    c.model = model; c.v = Math.floor(rnd() * model.variants); c.len = model.len ?? 5;
    c.s = s; c.speed = speed; c.h = -1; c.seg = -1; c.lane = lane;
    c.ox = c.oy = c.oz = 0; c.blend = 0; c.x = c.y = 0;
    return c;
  }
  /** is there room for a car of length len centred at station s? */
  function room(lane, s, len) {
    for (const o of lane.cars) if (Math.abs(o.s - s) < (o.len + len) / 2 + GAP + 2) return false;
    return true;
  }
  /** put car c on `lane` at station s, in order; the move from its old position eases out */
  function transfer(c, lane, s) {
    const q = c.lane.path.at(Math.min(c.s, c.lane.path.length));
    const px = q.x + c.ox * c.blend, py = q.y + c.oy * c.blend, pz = q.z + c.oz * c.blend;
    const n = lane.path.at(s);
    c.ox = px - n.x; c.oy = py - n.y; c.oz = pz - n.z; c.blend = 1;
    c.s = s; c.lane = lane; c.seg = -1;
    c.speed = Math.max(lane.speed[0], Math.min(c.speed, lane.speed[1]));
    let i = 0;
    while (i < lane.cars.length && lane.cars[i].s > s) i++;
    lane.cars.splice(i, 0, c);
  }
  const gap = (lane) => -Math.log(1 - rnd() * 0.95) * lane.spacing * 0.8 + lane.spacing * 0.2;
  function seedCars() {
    for (const lane of lanes) {                                // start with traffic already flowing
      if (lane.fed) continue;
      let s = gap(lane) * rnd();
      const seeds = [];
      while (s < lane.path.length) { seeds.push(s); s += gap(lane) + 14; }
      for (let k = seeds.length - 1; k >= 0; k--) lane.cars.push(newCar(lane, seeds[k], range(...lane.speed)));
      lane.next = gap(lane) / lane.speed[1];
    }
  }
  const moves = [];                                            // [car, from, to, s], reused
  let nMoves = 0;
  const queue = (c, from, to, s) => { const m = moves[nMoves++] ??= []; m[0] = c; m[1] = from; m[2] = to; m[3] = s; };
  function stepCars(dt) {
    nMoves = 0;
    for (const lane of lanes) {
      const Ln = lane.path.length, cars = lane.cars;
      lane.next -= dt;
      if (lane.next <= 0 && !lane.fed) {
        const last = cars.at(-1);
        if (!last || last.s - last.len / 2 > 7 + GAP) { cars.push(newCar(lane, 0, range(...lane.speed))); lane.next = gap(lane) / lane.speed[1]; }
        else lane.next = 0.5;
      }
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i], s0 = c.s;
        let s = c.s + c.speed * dt;
        const lead = cars[i - 1];
        if (lead) s = Math.min(s, Math.max(c.s, lead.s - (lead.len + c.len) / 2 - GAP));
        if (lane.exit && s > Ln) {                             // merge at the end, or wait for a gap
          const t = lane.exit.s + (s - Ln);
          if (i === 0 && room(lane.exit.lane, t, c.len)) { c.s = s; queue(c, lane, lane.exit.lane, t); continue; }
          s = Math.min(s, Ln);
        }
        c.s = s;
        if (c.blend > 0) c.blend = Math.max(0, c.blend - (s - s0) / 18);
        for (const d of lane.diverts) {
          if (s0 < d.s && s >= d.s && rnd() < d.p && room(d.to, s - d.s, c.len)) queue(c, lane, d.to, s - d.s);
        }
      }
      while (cars.length && !lane.exit && cars[0].s > Ln) carPool.push(cars.shift());
    }
    for (let k = 0; k < nMoves; k++) {
      const m = moves[k], c = m[0], from = m[1];
      const i = from.cars.indexOf(c);
      if (i < 0) continue;
      from.cars.splice(i, 1);
      transfer(c, m[2], m[3]);
    }
  }
  function drawCars() {
    if (!loaded(L.street.mask) || !loaded(L.freeway.mask)) return;   // never unmasked
    for (const lane of lanes) {
      const Ln = lane.path.length;
      for (const c of lane.cars) {
        const q = lane.path.at(Math.min(c.s, Ln));
        const b = c.blend;
        proj(q.x + c.ox * b, q.y + c.oy * b, q.z + c.oz * b);
        if (!inView(qx, qy, 40)) continue;
        if (q.i !== c.seg) { c.seg = q.i; c.h = headingFor(c.model, q.tx, q.ty, q.tz, c.h); }
        // fade in and out only where a lane starts or ends in the open, not where it joins another
        const fade = Math.min(1, lane.fed ? 1 : c.s / 10, lane.exit ? 1 : (Ln - c.s) / 10);
        blit(lane.layer, c.model, c.h, c.v, 0, qx, qy, 1, Math.max(0, fade));
      }
    }
    // keep only what is on visible road: the road pass, cut to the view once per view change and
    // composited over just the boxes drawn
    for (const l of [L.street, L.freeway]) {
      if (!l.n) continue;
      const ctx = l.ctx, r = l.rects, cv = l.canvas;
      if (!l.cutOk) {                                          // once per layout: the cut depends on the view's origin and scale
        const cut = l.cut ??= document.createElement('canvas');
        if (cut.width !== cv.width || cut.height !== cv.height) { cut.width = cv.width; cut.height = cv.height; }
        const g = cut.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, cut.width, cut.height);
        g.setTransform(view.D, 0, 0, view.D, -view.x0 * view.D, -view.y0 * view.D);
        g.drawImage(l.mask, 0, 0, W, H);
        l.cutOk = true;
      }
      // clip to the boxes rounded out to whole canvas pixels: an antialiased clip edge would only
      // partly apply the mask there, leaving a faint pixel of car off the road
      const D = view.D, ox = view.x0, oy = view.y0;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      for (let i = 0; i < l.n * 4; i += 4) {
        const x = Math.floor((r[i] - ox) * D), y = Math.floor((r[i + 1] - oy) * D);
        ctx.rect(x, y, Math.ceil((r[i] + r[i + 2] - ox) * D) - x, Math.ceil((r[i + 1] + r[i + 3] - oy) * D) - y);
      }
      ctx.clip();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(l.cut, 0, 0);
      ctx.restore();
    }

  }

  // ── planes: straight passes at a random heading, height and time, some with contrails ─────
  const planes = [];
  const TRAILS = {
    // spacing (m, alternating engines) under the puff's size (x 7 m), so the puffs overlap into a trail
    jet: { at: [-3.2, 5.2, -1.75], twin: true, spacing: [2.5, 4.5], size: [0.55, 0.75, 1.3, 2.0], alpha: [0.5, 0.8], life: [1.8, 3.2] },
    prop: { at: [-7.0, 0, 0.6], twin: false, spacing: [3, 5], size: [0.3, 0.4, 0.6, 0.9], alpha: [0.18, 0.3], life: [1, 1.8] },
  };
  function launchPlane(p) {
    const jet = rnd() < 0.5;
    p.model = S.models[jet ? 'jet' : 'prop'];
    p.variant = Math.floor(rnd() * p.model.variants);
    p.h = Math.floor(rnd() * p.model.headings);             // fly exactly along a rendered heading
    const a = p.h * p.model.headingStep * RAD;
    p.ux = Math.cos(a); p.uy = Math.sin(a);
    p.z = jet ? range(260, 400) : range(140, 240);
    p.speed = jet ? range(70, 95) : range(40, 55);
    [p.cx, p.cy] = P.ground(range(view.x0, view.x1), range(view.y0, view.y1), p.z);   // it crosses the view
    // start and end just outside the view (at most 1.5 km out), so little of a pass is unseen
    const [ax, ay] = P.ground(view.x0, view.y0, p.z), [bx, by] = P.ground(view.x1, view.y1, p.z);
    p.half = Math.min(1500, Math.hypot(bx - ax, by - ay) + 150);
    p.s = -p.half; p.live = true;
    // most jets leave a trail, a prop plane sometimes a faint one
    p.trail = reduced ? null : jet ? (rnd() < 0.8 ? TRAILS.jet : null) : (rnd() < 0.5 ? TRAILS.prop : null);
    p.dist = 0; p.next = 0; p.side = 1;
  }
  function stepPlanes(dt) {
    for (const p of planes) {
      if (!p.live) { p.wait -= dt; if (p.wait <= 0) launchPlane(p); continue; }
      p.s += p.speed * dt;
      if (p.s > p.half) { p.live = false; p.wait = range(6, 24); continue; }
      p.x = p.cx + p.ux * p.s; p.y = p.cy + p.uy * p.s;
      proj(p.x, p.y, p.z);
      if (p.trail && inView(qx, qy, 400)) {
        p.dist += p.speed * dt;
        const T = p.trail, g = view.g, [fx, fy, fz] = T.at;
        while (p.dist >= p.next) {
          // the exhaust, at the plane's position when it passed this spot; jets alternate engines
          const back = p.dist - p.next, side = T.twin ? (p.side = -p.side) : 0;
          puff(p.x - p.ux * back + (p.ux * fx - p.uy * fy * side) * g,
            p.y - p.uy * back + (p.uy * fx + p.ux * fy * side) * g, p.z + fz * g, T);
          p.dist -= p.next;
          p.next = range(...T.spacing);
        }
      }
    }
  }
  function drawPlanes(t) {
    for (const p of planes) {
      if (!p.live || p.x === undefined) continue;
      proj(p.x, p.y, p.z);
      const phase = p.model.phases > 1 ? Math.floor(t * 24 + p.h) % p.model.phases : 0;
      blit(L.air, p.model, p.h, p.variant, phase, qx, qy, view.g);
      drawShadow(p.model, p.h, p.x, p.y, p.z, view.g);
    }
  }

  // ── contrails: soft volumetric puffs (pre-rendered) that grow, drift and fade ──────────────
  const puffs = [];
  const freePuffs = [];
  const wind0 = range(0, 2 * Math.PI), pwx = Math.cos(wind0) * 1.5, pwy = Math.sin(wind0) * 1.5;
  function makePuffs() {
    if (reduced || !S.models.puff) return;
    for (let i = 0; i < 128; i++) {
      puffs.push({ live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, age: 0, life: 1, s0: 1, s1: 1, a: 1, v: 0 });
      freePuffs.push(i);
    }
  }
  function puff(x, y, z, T) {
    if (!freePuffs.length) return;
    const q = puffs[freePuffs.pop()];
    q.live = true; q.x = x; q.y = y; q.z = z; q.age = 0;
    q.vx = pwx + range(-0.6, 0.6); q.vy = pwy + range(-0.6, 0.6);
    q.life = range(...T.life); q.a = range(...T.alpha);
    q.s0 = range(T.size[0], T.size[1]); q.s1 = range(T.size[2], T.size[3]);
    q.v = Math.floor(rnd() * S.models.puff.variants);
  }
  function stepPuffs(dt) {
    for (let i = 0; i < puffs.length; i++) {
      const q = puffs[i];
      if (!q.live) continue;
      q.age += dt;
      if (q.age >= q.life) { q.live = false; freePuffs.push(i); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += 0.4 * dt;
    }
  }
  function drawPuffs() {
    const m = S.models.puff;
    for (const q of puffs) {
      if (!q.live) continue;
      const k = q.age / q.life, grow = 1 - (1 - k) * (1 - k);
      proj(q.x, q.y, q.z);
      blit(L.air, m, 0, q.v, 0, qx, qy, view.g * (q.s0 + (q.s1 - q.s0) * grow), q.a * Math.min(1, q.age / 0.08) * (1 - k) ** 1.5);
    }
  }

  // ── helicopter: circles one employer building, then hops to another ─────
  const pads = Object.values(scene.sites ?? {}).map((s) => ({ x: s.x, y: s.y, z: s.top + 55 }));
  let heli = null;
  function makeHeli() {
    if (!pads.length || !S.models.heli) return;
    const m = S.models.heli, at = pick(pads);
    heli = { model: m, variant: Math.floor(rnd() * m.variants), h: -1, from: at, to: at, mode: 'circle', t: 0, dur: range(8, 14),
      ang: range(0, 6.3), x: at.x + 45, y: at.y, z: at.z, ux: 0, uy: 1, fx: 0, fy: 0, fz: 0 };
  }
  function stepHeli(dt, t) {
    const h = heli;
    if (!h) return;
    h.t += dt;
    if (h.mode === 'circle') {
      h.ang += dt * 0.35;
      const r = 45;
      h.x = h.to.x + Math.cos(h.ang) * r; h.y = h.to.y + Math.sin(h.ang) * r; h.z = h.to.z + Math.sin(t * 0.8) * 1.5;
      h.ux = -Math.sin(h.ang); h.uy = Math.cos(h.ang);
      if (h.t > h.dur && pads.length > 1) {
        let next = h.to;
        while (next === h.to) next = pick(pads);
        h.fx = h.x; h.fy = h.y; h.fz = h.z; h.to = next; h.mode = 'hop'; h.t = 0;
        h.dur = Math.max(6, Math.hypot(next.x - h.x, next.y - h.y) / 28);
      }
    } else {
      const k = Math.min(1, h.t / h.dur), e = k * k * (3 - 2 * k);
      const tx = h.to.x + Math.cos(h.ang) * 45, ty = h.to.y + Math.sin(h.ang) * 45;
      const dx = tx - h.fx, dy = ty - h.fy, d = Math.hypot(dx, dy) || 1;
      h.x = h.fx + dx * e; h.y = h.fy + dy * e;
      h.z = h.fz + (h.to.z - h.fz) * e + Math.sin(Math.PI * k) * 25;
      h.ux = dx / d; h.uy = dy / d;
      if (k >= 1) { h.mode = 'circle'; h.t = 0; h.dur = range(8, 16); }
    }
    h.h = headingFor(h.model, h.ux, h.uy, 0, h.h);
  }
  function drawHeli(t) {
    const h = heli;
    if (!h || h.h < 0) return;
    proj(h.x, h.y, h.z);
    blit(L.air, h.model, h.h, h.variant, 0, qx, qy, view.g);
    const rm = S.models.rotor;
    if (rm) blit(L.air, rm, 0, 0, Math.floor(t * 30) % rm.phases, qx, qy, view.g);
    drawShadow(h.model, h.h, h.x, h.y, h.z, view.g);
  }

  // ── balloons: drift on one wind, bob and sway; respawn clear of signs and the name ──────────
  const balloons = [];
  const wind = range(0, 2 * Math.PI);
  let self = null;
  const box = new Float64Array(4);
  /** the balloon's sprite box (image px) around its anchor */
  const boxOf = (b) => {
    const m = b.model, u = P.k * view.g / S.atlases[m.atlas].pxPerM;
    box[0] = -m.anchor[0] * u; box[1] = -m.anchor[1] * u; box[2] = (m.cell[0] - m.anchor[0]) * u; box[3] = (m.cell[1] - m.anchor[1]) * u;
    return box;
  };
  const clear = (px, py, m) => {
    const [l, t, r, btm] = boxOf(self);
    return !avoid.some(([x0, y0, x1, y1]) => px + r + m > x0 && px + l - m < x1 && py + btm + m > y0 && py + t - m < y1) &&
      !balloons.some((o) => o !== self && o.px !== undefined && Math.abs(o.px - px) < (r - l) * 1.6 && Math.abs(o.py - py) < (btm - t) * 1.3);
  };
  function placeBalloon(b, fadeIn = true) {
    // a random spot in the view, clear of the signs and the other balloons, and of the page's
    // own bars: about 80 CSS px at the top and 100 at the bottom
    self = b;
    const [l, t, r, btm] = boxOf(b);
    const x0 = view.x0 - l + 4, x1 = view.x1 - r - 4, y0 = view.y0 + 80 / view.s - t, y1 = view.y1 - 100 / view.s - btm;
    let px = 0, py = 0;
    for (let k = 0; k < 80; k++) {
      px = range(x0, Math.max(x0, x1)); py = range(y0, Math.max(y0, y1));
      if (clear(px, py, 6)) break;
    }
    b.z = range(120, 180);
    [b.x, b.y] = P.ground(px, py, b.z);
    const sp = range(1.5, 3), d = wind + range(-0.4, 0.4);
    b.vx = Math.cos(d) * sp; b.vy = Math.sin(d) * sp;
    b.h = Math.floor(rnd() * b.model.headings);
    b.age = fadeIn ? 0 : 99; b.px = px; b.py = py; b.zz = b.z;
  }
  function makeBalloons() {
    const m = S.models.balloon;
    if (!m) return;
    // the first variant is in THEME.titleColor; always fly it, with two others
    const rest = Array.from({ length: m.variants - 1 }, (_, i) => i + 1).sort(() => rnd() - 0.5);
    for (const v of [0, ...rest].slice(0, 3)) balloons.push({ model: m, variant: v, phase: rnd() * 6.3, age: 99 });
  }
  function stepBalloon(b, dt, t) {
    b.age += dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.zz = b.z + Math.sin(t * 0.5 + b.phase) * 4;
    proj(b.x, b.y, b.zz);
    b.px = qx; b.py = qy;
    const bx = boxOf(b);
    if (qx + bx[2] < 0 || qx + bx[0] > W || qy + bx[3] < 0 || qy + bx[1] > H) placeBalloon(b);
  }
  function drawBalloon(b, t) {
    if (b.px === undefined) return;
    const fade = Math.min(1, b.age / 2.5);
    // a slow sway about the middle of the envelope
    const pivot = -15 * Math.cos(scene.camera.elevation * RAD) * P.k * view.g;
    blit(L.air, b.model, b.h, b.variant, 0, b.px, b.py, view.g, fade, Math.sin(t * 0.7 + b.phase) * 1.5 * RAD, pivot);
    drawShadow(b.model, 0, b.x, b.y, b.zz, view.g, fade);
  }

  // ── clock and drawing ───────────────────────────────────────────────────
  let raf = 0, last = 0, t = 0, dtS = 1 / 60, running = false, wanted = false, placed = false;
  function simulate(dt) {
    t += dt;
    stepCars(dt);
    stepPlanes(dt);
    if (puffs.length) stepPuffs(dt);
    stepHeli(dt, t);
    for (const b of balloons) stepBalloon(b, dt, t);
  }
  let paints = 0;
  function draw() {
    if (!S) return;
    paints++;
    for (const l of Object.values(L)) begin(l);
    drawCars();
    drawPuffs();
    drawPlanes(t);
    drawHeli(t);
    for (const b of balloons) drawBalloon(b, t);
    for (const l of Object.values(L)) l.ctx.globalAlpha = 1;
  }
  function redraw() { if (wanted && !running) draw(); }     // a still scene repaints late loads; a stopped one ignores them
  const pacer = createPacer(PAINT_HZ);
  const tick = (now) => {
    // a stalled tab does not jump ahead, and frame-to-frame jitter is smoothed
    const raw = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    dtS += (raw - dtS) * 0.3;
    simulate(dtS);
    // simulate every frame, paint at the pacer's rate (a setView paint this frame moved its deadline on)
    if (pacer.frame(now)) draw();
    raf = requestAnimationFrame(tick);
  };
  function first() {
    if (placed || !S) return;
    placed = true;
    for (const b of balloons) placeBalloon(b, false);
    if (reduced) { launchPlane(planes[0]); planes[0].s = -60; }    // a still: one plane, mid-crossing
    simulate(0);
    draw();
  }
  function run() {
    first();
    if (!S || running || reduced || !wanted) return;
    running = true; last = performance.now(); pacer.reset();
    raf = requestAnimationFrame(tick);
  }
  // a change of device pixel ratio (zoom, another monitor) resizes the canvases even if the view did not move
  let dprQuery = null;
  function densityChanged() {
    watchDensity();
    if (laidOutAt && density() !== laidOutAt) { layout(); if (placed) draw(); }
  }
  function watchDensity() {
    dprQuery?.removeEventListener('change', densityChanged);
    dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    dprQuery.addEventListener('change', densityChanged);
  }
  function halt() { running = false; cancelAnimationFrame(raf); raf = 0; }
  function motionChanged() {
    reduced = motionQuery.matches;
    if (reduced) { halt(); if (placed) draw(); }             // leave a still frame
    else run();                                              // resumes on a fresh clock
  }
  loadIndex(base).then((index) => {
    if (!index) return;
    S = index;
    chooseFiles();
    buildLanes();
    seedCars();
    makePuffs();
    for (let i = 0; i < 2; i++) planes.push({ live: false, wait: i ? range(10, 22) : range(1, 5) });
    makeHeli();
    makeBalloons();
    if (wanted) run();
  });
  // for tests and debugging: where everything is (image px), on the air canvas element
  L.air.canvas.spritePaints = () => paints;
  L.air.canvas.spriteState = () => (draw(), {                 // as on screen now
    cars: lanes.flatMap((lane, li) => lane.cars.map((c) => {
      const q = lane.path.at(Math.min(c.s, lane.path.length));
      proj(q.x, q.y, q.z);
      const x = qx, y = qy, A = axes(c.model), vx = AX * q.tx + BX * q.ty + CX * q.tz, vy = AY * q.tx + BY * q.ty + CY * q.tz, n = Math.hypot(vx, vy);
      let best = -1;
      for (let h = 0; h < A.length / 2; h++) best = Math.max(best, (A[2 * h] * vx + A[2 * h + 1] * vy) / n);
      // fit: how well the shown heading's screen axis matches the projected 3D direction (1 = exactly)
      const fit = c.h < 0 ? null : (A[2 * c.h] * vx + A[2 * c.h + 1] * vy) / n;
      return { lane: li, fw: lane.layer === L.freeway, ramp: lane.ramp ?? null, s: c.s, len: c.len, h: c.h, model: c.model.id, x, y, tz: q.tz, fit, best };
    })),
    planes: planes.filter((p) => p.live).map((p) => { proj(p.x, p.y, p.z); return { model: p.model.id, x: qx, y: qy }; }),
    puffs: puffs.filter((q) => q.live).map((q) => { proj(q.x, q.y, q.z); return { x: qx, y: qy }; }),
    ramps: lanes.filter((l) => l.ramp).map((l) => ({ kind: l.ramp, linked: l.fed && !!l.exit, cars: l.cars.length })),
    view: { ...view },
  });
  return {
    /** The visible part of the image (image px) and the current CSS px per image px. */
    setView(x0, y0, x1, y1, s) {
      if (density() === laidOutAt && x0 === view.x0 && y0 === view.y0 && x1 === view.x1 && y1 === view.y1 && s === view.s) return;
      Object.assign(view, { x0, y0, x1, y1, s, g: Math.max(1, 1.5 / (P.k * s)) });
      layout();
      if (placed) {                                           // in step with the pan, before paint
        draw();
        if (running) pacer.painted(performance.now());   // later than this frame's timestamp: its tick skips
      }
    },
    start() {
      wanted = true;
      motionQuery.addEventListener('change', motionChanged);
      watchDensity();
      reduced = motionQuery.matches;
      run();
    },
    stop() {
      wanted = false;
      motionQuery.removeEventListener('change', motionChanged);
      dprQuery?.removeEventListener('change', densityChanged); dprQuery = null;
      halt();
    },
  };
}

/**
 * The red "player select" marker for pointing at a site: a 3D-rendered sprite (sprites.json
 * model `marker`, anchored at its tip) with a gentle bob (still under reduced motion).
 * @param {SVGSVGElement} layer  an SVG whose viewBox is the frame's image px (it is re-attached
 *   to this layer on show() if the layer was emptied)
 * @param {{scene?: object, frame?: string, base?: string, scale?: number}} opts
 *   scene + frame give the frame's px per metre (default 2.4); scale enlarges it (default 1.6)
 * @returns {{show: (x: number, y: number) => void, hide: () => void}}  x, y: image px of the tip
 */
export function createMarker(layer, { scene, frame = 'master', base = 'assets/hero/', scale = 1.6 } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const k = scene ? projection(scene, frame).k : 2.4;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const img = document.createElementNS(NS, 'image');
  img.setAttribute('class', 'sprite-marker');
  img.setAttribute('pointer-events', 'none');
  img.style.display = 'none';
  let m = null, shown = false, x = 0, y = 0, raf = 0, t0 = 0;
  const place = (bob) => {
    if (!m) return;
    const u = k * scale / m.pxPerM;
    img.setAttribute('x', (x - m.anchor[0] * u).toFixed(2));
    img.setAttribute('y', (y - m.anchor[1] * u + bob).toFixed(2));
  };
  const tick = (now) => {
    place(-Math.abs(Math.sin((now - t0) / 1000 * 2.4)) * 4 * k * scale / 2.4);   // hops up off the tip
    raf = requestAnimationFrame(tick);
  };
  loadIndex(base).then((ix) => {
    const model = ix?.models.marker, atlas = model && ix.atlases[model.atlas];
    if (!atlas) return;
    const keys = Object.keys(atlas.files).map(Number), top = Math.max(...keys);
    m = { anchor: model.anchor, pxPerM: atlas.pxPerM };
    const u = k * scale / atlas.pxPerM;
    img.setAttribute('href', `${base}sprites/${atlas.files[top]}`);
    img.setAttribute('width', (model.cell[0] * u).toFixed(2));
    img.setAttribute('height', (model.cell[1] * u).toFixed(2));
    if (shown) place(0);
  });
  return {
    show(nx, ny) {
      x = nx; y = ny;
      if (!img.isConnected) layer.append(img);
      img.style.display = '';
      shown = true;
      place(0);
      if (!reduced && !raf) { t0 = performance.now(); raf = requestAnimationFrame(tick); }
    },
    hide() {
      shown = false;
      img.style.display = 'none';
      cancelAnimationFrame(raf); raf = 0;
    },
  };
}
