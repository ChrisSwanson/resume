// The City view: the rendered still (assets/hero, made by `npm run hero`) in a viewport that pans,
// an SVG overlay of each site's region traced from the render's ID pass, a hover preview and a
// side drawer per site, a Sites list, a selection marker, keyboard movement, and small sprites
// moving over the image. Text comes from content.js at runtime.
//
// Camera: (cx, cy) is the image point at the viewport centre, s the CSS px per image px. All
// writes go through apply(), which only writes (viewport size is cached on resize), so panning
// never forces a layout in the middle of a frame.
import { fillPreview, fillDrawer } from './card.js';
import { createSprites } from './sprites.js';
import { BASE, FRAMES, PORTRAIT_QUERY, frameScale, srcsetOf } from './frames.js';

const NS = 'http://www.w3.org/2000/svg';
const portraitQuery = matchMedia(PORTRAIT_QUERY);
const phoneQuery = matchMedia('(max-width: 640px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const SNAP_MS = 350;
const DOT_PX = 11;                       // a landmark dot's on-screen diameter, CSS px, at every zoom
const MARKER_LIFT = 6;                  // image px the marker's tip (and so the dot) floats above the sign's top centre
const HIT_PAD = 5;                      // CSS px of transparent hit area around a dot
// held-key movement, in CSS px/s: top speed, and how fast velocity approaches its target (1/s)
const MOVE = { speed: 900, accel: 9, friction: 7 };
const MOVE_KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  a: 'left', d: 'right', w: 'up', s: 'down', A: 'left', D: 'right', W: 'up', S: 'down',
};

export function createCity(root, { profile, companies, theme }) {
  const viewport = root.querySelector('.city-viewport');
  const world = root.querySelector('.city-world');
  const picture = world.querySelector('picture');
  const layers = {
    ground: world.querySelector('.city-ground'), street: world.querySelector('.city-cars-street'),
    freeway: world.querySelector('.city-cars-freeway'), air: world.querySelector('.city-air'),
  };
  const regionsSvg = world.querySelector('.city-regions');
  const preview = root.querySelector('.city-card');
  const drawer = root.querySelector('.city-drawer');
  const scroller = drawer.querySelector('.cd-scroll');
  const handle = drawer.querySelector('.cd-handle');
  const sitesBtn = root.querySelector('.sites-btn');
  const sitesBox = root.querySelector('.city-sites');
  const sitesList = sitesBox.querySelector('ol');
  const keysBtn = root.querySelector('.keys-btn');
  const keysBox = root.querySelector('.city-keys');
  const label = document.createElement('div');          // the hover/focus name pill, one for all sites
  label.className = 'site-label';
  label.setAttribute('aria-hidden', 'true');
  label.innerHTML = '<i></i><span></span>';
  root.append(label);
  const marker = document.createElement('div');
  marker.className = 'city-marker';
  marker.hidden = true;
  marker.setAttribute('aria-hidden', 'true');
  marker.innerHTML = '<span class="cm-bob"></span>';
  const dotsLayer = document.createElement('div');       // the visible dots: HTML, so the pulse is compositor-only
  dotsLayer.className = 'city-dots';
  dotsLayer.setAttribute('aria-hidden', 'true');
  world.append(dotsLayer, marker);

  const records = new Map();
  for (const c of companies) records.set(c.id, { kind: 'company', data: c });
  for (const e of profile.education ?? []) if (e.campus) records.set(e.id, { kind: 'education', data: e });
  // the resume's order (newest first), then education; only ids with a traced region become sites
  const order = [...companies].reverse().map((c) => c.id)
    .concat((profile.education ?? []).filter((e) => e.campus).map((e) => e.id));
  let sites = [];                        // ids in list order (number keys 1-9)

  let scene, regions, frameName, frame, sprites;
  let revealed = false, heroDecoded = null;   // revealed: the hero image has decoded and the loading screen is gone
  let s = 1, cx = 0, cy = 0, vw = 0, vh = 0;
  let active = false, hovered = null, listed = null, selected = null, opened = null;

  const ready = Promise.all([
    fetch(BASE + 'scene.json').then((r) => r.json()),
    fetch(BASE + 'regions.json').then((r) => r.json()),
  ]).then(([sc, rg]) => {
    scene = sc; regions = rg;
    for (const [id, r] of records) r.logo = `${BASE}logos/${id}.svg`;
    if (scene.palette) root.style.setProperty('--chip-bg', scene.palette.signPanel);   // render/palette.py CHROME
    root.style.setProperty('--title', theme?.titleColor ?? '#2b59c3');
    setFrame(portraitQuery.matches ? 'portrait' : 'master');
    return heroReady();                      // rejects if the image fails: the app falls back to the Text view
  }).then(reveal);

  // the loading screen (index.html, styles.css): a blurred placeholder framed like the image, under
  // the hidden city. Once the hero image has decoded, the sprites and the marker start loading (not
  // before: they would compete with it for bandwidth) and the city fades in over the placeholder.
  function reveal() {
    revealed = true;
    makeSprites();
    loadMarker();
    apply(true);                             // hands the sprites the current view (setFrame laid it out)
    const placeholder = root.querySelector('.city-ph');
    let timer;
    const done = () => { clearTimeout(timer); root.classList.remove('revealing'); placeholder?.remove(); };
    if (!reducedMotion.matches) {
      root.classList.add('revealing');
      world.addEventListener('animationend', (e) => { if (e.target === world) done(); }, { once: true });
      timer = setTimeout(done, 1000);        // no animation runs while the view is hidden
    } else done();
    root.classList.remove('loading');
  }
  // the current frame's image: after a frame switch before it decoded (a phone turned while loading),
  // wait for the new frame's image, not the replaced one (whether that one loaded or failed)
  const heroReady = () => { const p = heroDecoded, next = () => (p === heroDecoded ? p : heroReady()); return p.then(next, next); };
  const whenDecoded = (img) => new Promise((resolve, reject) => {
    const decode = () => img.decode().then(resolve, reject);
    img.addEventListener('load', decode, { once: true });
    img.addEventListener('error', () => reject(new Error('hero image failed to load')), { once: true });
  });

  // the 3D marker is a rendered sprite (render/sprites.py, assets/hero/sprites/marker.*); until
  // it exists the marker is a CSS shape
  function loadMarker() {
    fetch(BASE + 'sprites/sprites.json').then((r) => (r.ok ? r.json() : null)).then((idx) => {
      const m = idx?.models?.marker, a = m && idx.atlases?.[m.atlas];
      if (!a) return;
      const k = 2.4 / a.pxPerM;            // atlas px -> frame px (the frame is 2.4 px per metre)
      const img = document.createElement('img');
      img.alt = ''; img.decoding = 'async'; img.draggable = false;
      img.src = BASE + 'sprites/' + a.files['1'];
      img.srcset = Object.entries(a.files).map(([d, f]) => `${BASE}sprites/${f} ${d}x`).join(', ');
      img.addEventListener('load', () => {
        marker.dataset.w = m.cell[0] * k; marker.dataset.h = m.cell[1] * k;
        marker.dataset.ax = m.anchor[0] * k; marker.dataset.ay = m.anchor[1] * k;
        marker.classList.add('sprite');
        marker.firstChild.replaceChildren(img);
        placeMarker();
      });
    }).catch(() => {});
  }

  // ── frame: image, regions, sprites ────────────────────────────────────────
  function setFrame(name) {
    if (name === frameName) return;
    frameName = name;
    frame = FRAMES[name];
    const [W, H] = scene.frames[name].res;
    picture.replaceChildren();
    const src = document.createElement('source');
    src.type = 'image/webp';
    src.srcset = srcsetOf(frame);
    const img = document.createElement('img');
    img.src = `${BASE}${frame.jpeg}.jpg`;
    img.alt = `A miniature city in which the name ${profile.name} stands as two lines of buildings, with the buildings of each employer carrying its logo.`;
    img.width = W; img.height = H; img.decoding = 'async'; img.draggable = false;
    img.fetchPriority = 'high';
    picture.append(src, img);
    if (!revealed) heroDecoded = whenDecoded(img);
    buildRegions(W, H);
    buildList();
    if (revealed) makeSprites();
    cx = W / 2; cy = H / 2; pdx = pdy = 0;
    closeDrawer(false);
    showPreview(null);
    layout();
  }

  function makeSprites() {
    sprites?.stop();
    sprites = createSprites(layers, scene, frameName, theme, { avoid: [...Object.values(regions[frameName].sites).map((r) => r.bbox), ...(scene.titleBoxes?.[frameName] ?? [])], base: BASE });
    if (active) sprites.start();
  }

  function buildRegions(W, H) {
    regionsSvg.replaceChildren();
    dotsLayer.replaceChildren();
    regionsSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const traced = regions[frameName].sites;
    const signs = scene.signBoxes?.[frameName] ?? {};
    sites = [];
    const tips = [];
    for (const id of order) {
      const reg = traced[id], rec = records.get(id);
      if (!reg || !rec) continue;
      sites.push(id);
      const a = document.createElementNS(NS, 'a');
      a.setAttribute('href', `?view=text#${id}`);
      a.setAttribute('class', 'site');
      a.setAttribute('role', 'button');
      a.dataset.id = id;
      const d = rec.data;
      if (d.accent) a.style.setProperty('--brand', d.accent);
      a.setAttribute('aria-label', `${sites.length}. ${d.name}: ${[rec.kind === 'education' ? d.degree : d.role, d.dates].filter(Boolean).join(', ')}`);
      const sb = signs[id];
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', reg.polys.map((p) => 'M' + p.join(' ').replace(/(\S+ \S+) /g, '$1 L') + 'Z').join(''));
      a.append(path);
      // the marker and snaps aim at the sign (the top centre of the logo), else the region's top
      rec.anchor = sb ? [(sb[0] + sb[2]) / 2, sb[1]] : [(reg.bbox[0] + reg.bbox[2]) / 2, reg.bbox[1]];
      rec.tip = tipOf(rec);
      // a pointer-only twin, drawn after every building, carries a transparent hit circle at the dot, so a dot
      // that lies over a neighbour's silhouette still opens its own site. A plain group, not a link: it is
      // aria-hidden, so it must never take focus; the building link is the one in the Tab order
      const tip = document.createElementNS(NS, 'g');
      tip.setAttribute('class', 'site-tip');
      tip.setAttribute('aria-hidden', 'true');
      tip.dataset.id = id;
      const hit = document.createElementNS(NS, 'circle');
      hit.setAttribute('class', 'site-hit');
      hit.setAttribute('cx', rec.tip[0]); hit.setAttribute('cy', rec.tip[1]);
      tip.append(hit);
      tips.push(tip);
      const el = document.createElement('i');
      el.className = 'site-dot';
      el.dataset.id = id;
      el.style.setProperty('--i', sites.length - 1);
      if (d.accent) el.style.setProperty('--brand', d.accent);
      el.classList.toggle('is-hidden', id === selected);
      el.innerHTML = '<span class="sd-ring"></span><span class="sd-core"></span>';
      dotsLayer.append(rec.dotEl = el);
      regionsSvg.append(a);
      rec.bbox = reg.bbox;
      rec.focus = sb ? [(sb[0] + sb[2]) / 2, (sb[1] + sb[3]) / 2] : [(reg.bbox[0] + reg.bbox[2]) / 2, (reg.bbox[1] + reg.bbox[3]) / 2];
    }
    regionsSvg.append(...tips);
  }

  function buildList() {
    sitesList.replaceChildren();
    sites.forEach((id, i) => {
      const d = records.get(id).data;
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.id = id;
      b.innerHTML = '<kbd></kbd><span class="sl-name"></span><span class="sl-role"></span>';
      b.querySelector('kbd').textContent = String(i + 1);
      b.querySelector('.sl-name').textContent = d.name;
      b.querySelector('.sl-role').textContent = records.get(id).kind === 'education' ? d.degree ?? '' : d.role ?? '';
      li.append(b);
      sitesList.append(li);
    });
  }

  // ── camera ────────────────────────────────────────────────────────────────
  function layout() {
    if (!frame) return;
    const [W, H] = scene.frames[frameName].res;
    vw = viewport.clientWidth; vh = viewport.clientHeight;          // the only layout reads
    setInsets();
    s = frameScale(frame, vw, vh);
    world.style.width = `${W * s}px`;
    world.style.height = `${H * s}px`;
    // sizes in CSS px: the browser takes the 2x WebP on DPR 2 screens
    const sizes = `${Math.round(W * s)}px`;
    world.querySelector('img').sizes = sizes;
    const source = world.querySelector('source');
    if (source) source.sizes = sizes;
    placeMarker();
    const r = ((DOT_PX / 2 + HIT_PAD) / s).toFixed(2);   // constant on-screen size whatever the world scale
    for (const c of regionsSvg.querySelectorAll('.site-hit')) c.setAttribute('r', r);
    for (const rec of records.values()) if (rec.dotEl) rec.dotEl.style.transform = `translate3d(${(rec.tip[0] * s).toFixed(1)}px, ${(rec.tip[1] * s).toFixed(1)}px, 0)`;
    apply(true);                            // the viewport or scale may have changed under the same camera
  }
  /** clamp a camera centre so the image covers what is visible (the drawer may cover the image's
   * far edge, so a site near it can still be centred beside the drawer); returns
   * [x, y, clampedX, clampedY] */
  let drawerW = 0;                      // the open drawer's laid-out width (CSS owns it)
  let insetR = 0, insetB = 0;           // CSS px covered by the open drawer (right) or sheet (bottom)
  function clamp(x, y) {
    const [W, H] = scene.frames[frameName].res;
    const hw = vw / 2 / s, hh = vh / 2 / s;
    const nx = Math.min(Math.max(x, hw), W - hw + insetR / s), ny = Math.min(Math.max(y, hh), H - hh + insetB / s);
    return [nx, ny, nx !== x, ny !== y];
  }
  function setInsets() {
    if (opened) drawerW = drawer.offsetWidth;
    insetR = opened && !phoneQuery.matches ? drawerW : 0;
    insetB = opened && phoneQuery.matches ? sheetHeight() : 0;
  }
  // writes only when the clamped camera moved (a wheel against an edge changes nothing)
  let lx = NaN, ly = NaN, ls = NaN;
  function apply(force = false) {
    [cx, cy] = clamp(cx, cy);
    if (!force && cx === lx && cy === ly && s === ls) return;
    lx = cx; ly = cy; ls = s;
    const tx = vw / 2 - cx * s, ty = vh / 2 - cy * s;
    world.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`;
    const hw = vw / 2 / s, hh = vh / 2 / s;
    sprites?.setView(cx - hw, cy - hh, cx + hw, cy + hh, s);
    placePreview();
    placeLabel();
  }
  const toScreen = (x, y) => [vw / 2 + (x - cx) * s, vh / 2 + (y - cy) * s];

  // One frame loop drives everything that moves the camera: pointer and wheel deltas (summed as
  // they arrive), a running snap, and held-key movement. Each frame applies the camera once.
  let raf = 0, last = 0, pdx = 0, pdy = 0;
  let snap = null;                       // { x0, y0, x, y, t0, ms, done }
  const held = new Set();
  let vx = 0, vy = 0, moving = false;
  const wake = () => { if (!raf) raf = requestAnimationFrame(frameTick); };
  function frameTick(now) {
    raf = 0;
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));      // capped, so a stall is not one big jump
    last = now;
    cx += pdx; cy += pdy; pdx = pdy = 0;
    if (snap) stepSnap(now);
    if (moving) stepMove(dt);
    apply();
    if (snap || moving) wake();
  }

  // snaps: an eased pan that anything else (drag, wheel, keys, a newer snap) interrupts
  function stopSnap() {
    const done = snap?.done;
    snap = null;
    done?.();
  }
  function stepSnap(now) {
    const { x0, y0, x, y, t0, ms, done } = snap;
    const t = Math.min(1, Math.max(0, (now - t0) / ms)), e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    cx = x0 + (x - x0) * e; cy = y0 + (y - y0) * e;
    if (t >= 1) { snap = null; done(); }
  }
  // turning on reduced motion mid-snap finishes it now
  reducedMotion.addEventListener?.('change', () => {
    if (!reducedMotion.matches || !snap) return;
    const { x, y } = snap;
    stopSnap();
    cx = x; cy = y; apply();
  });
  function panTo(x, y, ms = SNAP_MS) {
    stopSnap();
    [x, y] = clamp(x, y);
    if (reducedMotion.matches || ms <= 0) { cx = x; cy = y; apply(); return Promise.resolve(); }
    return new Promise((done) => {
      snap = { x0: cx, y0: cy, x, y, t0: performance.now(), ms, done };
      wake();
    });
  }
  /** the image point to centre so `p` sits in the middle of what the drawer leaves visible */
  function centreFor(p) {
    if (!opened) return p;
    if (phoneQuery.matches) return [p[0], p[1] + sheetHeight() / 2 / s];
    return [p[0] + drawerW / 2 / s, p[1]];
  }
  const sheetHeight = () => vh * (drawer.classList.contains('expanded') ? 0.85 : 0.5);
  function snapTo(id, ms = SNAP_MS) {
    const rec = records.get(id);
    if (!rec?.focus) return Promise.resolve();
    return panTo(...centreFor(rec.focus), ms);
  }

  // held-key movement: velocity approaches the held direction
  function stepMove(dt) {
    let ix = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    let iy = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0);
    if (ix && iy) { ix *= Math.SQRT1_2; iy *= Math.SQRT1_2; }
    const tx = ix * MOVE.speed, ty = iy * MOVE.speed;
    if (reducedMotion.matches) { vx = tx; vy = ty; }                 // no easing, no coasting
    else {
      const k = 1 - Math.exp(-dt * (ix || iy ? MOVE.accel : MOVE.friction));
      vx += (tx - vx) * k; vy += (ty - vy) * k;
    }
    const [nx, ny, hitX, hitY] = clamp(cx + (vx * dt) / s, cy + (vy * dt) / s);
    if (hitX) vx = 0;
    if (hitY) vy = 0;
    cx = nx; cy = ny;
    if (!held.size && Math.hypot(vx, vy) <= 4) { moving = false; vx = vy = 0; }
  }
  function startMove() {
    stopSnap();
    if (!moving) { moving = true; last = performance.now(); }
    wake();
  }
  function clearKeys() {
    held.clear(); vx = vy = 0; moving = false;
  }
  addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearKeys(); });

  // ── pointer: drag and wheel ───────────────────────────────────────────────
  let drag = null, dragged = false;
  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    dragged = false;
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) { drag.moved = true; stopSnap(); viewport.setPointerCapture(e.pointerId); viewport.classList.add('dragging'); hover(null); }
    drag.x = e.clientX; drag.y = e.clientY;
    pdx -= dx / s; pdy -= dy / s; wake();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    dragged = drag.moved;
    drag = null;
    viewport.classList.remove('dragging');
  };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    stopSnap();
    const k = e.deltaMode === 1 ? 16 : 1;
    let dx = e.deltaX * k, dy = e.deltaY * k;
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    pdx += dx / s; pdy += dy / s; wake();
  }, { passive: false });

  // the hint goes after the first interaction, and stays gone for this visitor
  const hint = root.querySelector('.city-hint');
  const HINT_KEY = 'city-hint-seen';
  try { if (localStorage.getItem(HINT_KEY)) hint?.remove(); } catch {}
  const dismissHint = () => {
    if (!hint?.isConnected || hint.classList.contains('gone')) return;
    hint.classList.add('gone');
    setTimeout(() => hint.remove(), reducedMotion.matches ? 0 : 400);
    try { localStorage.setItem(HINT_KEY, '1'); } catch {}
  };
  for (const type of ['pointerdown', 'wheel', 'keydown']) root.addEventListener(type, dismissHint, { passive: true });

  // ── keyboard ──────────────────────────────────────────────────────────────
  const typing = (t) => t instanceof Element && (t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
  const inPanel = (t) => t instanceof Element && t.closest('.city-drawer, .city-sites, .city-keys');
  document.addEventListener('keydown', (e) => {
    if (!active || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target !== document.body && !root.contains(e.target)) return;
    if (typing(e.target)) return;
    if (e.key === 'Escape') {
      if (!keysBox.hidden) { toggleKeys(false); keysBtn.focus(); }
      else if (!sitesBox.hidden) { toggleList(false); sitesBtn.focus(); }
      else if (opened) closeDrawer(true);
      else if (hovered) hover(null);
      else return;
      e.preventDefault();
      return;
    }
    if (e.key === '?') { e.preventDefault(); toggleKeys(); return; }
    if (inPanel(e.target)) return;                                   // lists and the drawer keep their keys
    const dir = MOVE_KEYS[e.key];
    if (dir) {
      e.preventDefault();
      if (e.repeat) return;
      held.add(dir);
      startMove();
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      const id = sites[+e.key - 1];
      // the site also takes (quiet) focus, so Enter opens it and Tab continues from it
      if (id) { e.preventDefault(); select(id); focusSite(id); snapTo(id); }
      return;
    }
    if (e.key === 'Enter' && selected && !e.target.closest('button, a')) {
      e.preventDefault();
      openDrawer(selected);
    }
  });
  document.addEventListener('keyup', (e) => {
    const dir = MOVE_KEYS[e.key];
    if (dir) held.delete(dir);
    // a held W released after Shift went down arrives as 'W': drop both cases
    if (e.key.length === 1) held.delete(MOVE_KEYS[e.key.toLowerCase()]);
  });

  // ── regions: hover, focus, click ─────────────────────────────────────────
  const siteOf = (el) => el?.closest?.('a.site, .site-tip');
  regionsSvg.addEventListener('pointerover', (e) => {
    const a = siteOf(e.target);
    if (a && e.pointerType !== 'touch' && !drag?.moved) hover(a.dataset.id);
  });
  regionsSvg.addEventListener('pointerout', (e) => {
    const a = siteOf(e.target);
    if (a && siteOf(e.relatedTarget)?.dataset.id !== a.dataset.id) hover(null);   // building link to its own dot is no exit
  });
  let quietFocus = false;                 // focus handed back to a site by closing the drawer: no preview
  const focusSite = (id) => { quietFocus = true; regionsSvg.querySelector(`a.site[data-id="${id}"]`)?.focus({ preventScroll: true }); quietFocus = false; };
  regionsSvg.addEventListener('focusin', (e) => {
    const a = siteOf(e.target);
    if (!a || quietFocus) return;
    select(a.dataset.id);
    // keyboard focus brings the site into view and previews it; focus from a tap or click does not
    if (a.matches(':focus-visible')) { revealSite(a.dataset.id); hover(a.dataset.id); }
  });
  regionsSvg.addEventListener('focusout', () => hover(null));
  regionsSvg.addEventListener('keydown', (e) => {          // SVG links do not activate on Enter/Space by themselves
    const a = siteOf(e.target);
    if (a && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDrawer(a.dataset.id); }
  });
  regionsSvg.addEventListener('click', (e) => {
    const a = siteOf(e.target);
    if (!a) return;
    e.preventDefault();
    if (dragged) { dragged = false; return; }
    openDrawer(a.dataset.id);
  });
  viewport.addEventListener('click', () => { dragged = false; });

  function revealSite(id) {
    const b = records.get(id)?.bbox;
    if (!b) return;
    const [x0, y0] = toScreen(b[0], b[1]), [x1, y1] = toScreen(b[2], b[3]), m = 40;
    const right = opened && !phoneQuery.matches ? vw - drawerW : vw;
    if (x0 >= m && x1 <= right - m && y0 >= m && y1 <= vh - m) return;
    snapTo(id, 450);
  }

  function mark() {
    for (const a of regionsSvg.querySelectorAll('a.site')) {
      const id = a.dataset.id;
      const on = id === hovered || id === listed || id === opened;
      a.classList.toggle('on', on);
      records.get(id)?.dotEl?.classList.toggle('is-on', on);
    }
    showLabel(opened ? null : hovered);
  }
  // ── landmark label: a name pill just above the hovered or focused site's dot (below it when the marker is there) ──
  let labelId = null, lw = 0, lh = 0;
  function showLabel(id) {
    const rec = id && records.get(id);
    if (!rec?.tip) { labelId = null; label.classList.remove('show'); return; }
    if (id !== labelId) {
      labelId = id;
      label.querySelector('span').textContent = rec.data.name;
      if (rec.data.accent) label.style.setProperty('--brand', rec.data.accent); else label.style.removeProperty('--brand');
      lw = label.offsetWidth; lh = label.offsetHeight;
    }
    label.classList.add('show');
    placeLabel();
  }
  function placeLabel() {
    const rec = labelId && records.get(labelId);
    if (!rec?.tip) return;
    const [dx, dy] = toScreen(rec.tip[0], rec.tip[1]);
    // above the (hover-grown) dot, or below it where the top edge leaves no room or the red marker stands there
    const m = 8, gap = DOT_PX / 2 * 1.3 + 6, x = Math.min(Math.max(dx - lw / 2, m), vw - lw - m);
    const up = dy - gap - lh, y = Math.min(up >= m && labelId !== selected ? up : dy + gap, vh - lh - m);
    label.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }
  const setDotHidden = (id, on) => records.get(id)?.dotEl?.classList.toggle('is-hidden', on);
  function hover(id) {
    if (id === hovered) return;
    hovered = id;
    mark();
    showPreview(opened || phoneQuery.matches ? null : id);
  }

  // ── preview card ──────────────────────────────────────────────────────────
  let pw = 0, ph = 0;                     // its size, measured once when filled (before any transform write)
  function showPreview(id) {
    if (!id) { preview.hidden = true; return; }
    fillPreview(preview, records.get(id));
    preview.hidden = false;
    pw = preview.offsetWidth; ph = preview.offsetHeight;
    placePreview();
  }
  function placePreview() {
    if (!hovered || preview.hidden) return;
    const b = records.get(hovered)?.bbox;
    if (!b) return;
    const [x0, y0] = toScreen(b[0], b[1]), [x1, y1] = toScreen(b[2], b[3]);
    const m = 12, gap = 12, top0 = 64;
    let x, y = y0;
    if (x1 + gap + pw <= vw - m) x = x1 + gap;
    else if (x0 - gap - pw >= m) x = x0 - gap - pw;
    else {
      x = (x0 + x1) / 2 - pw / 2;
      y = y1 + gap + ph <= vh - m ? y1 + gap : y0 - gap - ph;      // below or above
    }
    x = Math.min(Math.max(x, m), vw - pw - m);
    y = Math.min(Math.max(y, top0), vh - ph - m);
    preview.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }

  // ── selection marker ──────────────────────────────────────────────────────
  function select(id) {
    if (id === selected) return;
    if (selected) setDotHidden(selected, false);       // the red marker leaves, the dot returns
    selected = id;
    if (id) setDotHidden(id, true);
    marker.hidden = !id;
    for (const b of sitesList.querySelectorAll('button')) b.classList.toggle('selected', b.dataset.id === id);
    placeMarker();
  }
  /** where the red marker's tip points, and so where the site's dot sits (image px) */
  function tipOf(rec) { return [rec.anchor[0], rec.anchor[1] - MARKER_LIFT]; }
  function placeMarker() {
    const rec = selected && records.get(selected);
    if (!rec?.anchor) return;
    const sprite = marker.classList.contains('sprite');
    const w = sprite ? +marker.dataset.w : 20, h = sprite ? +marker.dataset.h : 24;
    const ax = sprite ? +marker.dataset.ax : 10, ay = sprite ? +marker.dataset.ay : 24;
    // the sprite's tip sits at the site's tip, in frame px scaled to CSS px
    const left = (rec.tip[0] - ax) * s, top = (rec.tip[1] - ay) * s;
    marker.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
    marker.style.width = `${(w * s).toFixed(1)}px`;
    marker.style.height = `${(h * s).toFixed(1)}px`;
  }

  // ── drawer ────────────────────────────────────────────────────────────────
  function openDrawer(id) {
    const rec = records.get(id);
    if (!rec) return;
    select(id);
    hover(null);
    const wasOpen = !!opened;
    opened = id;
    mark();
    const { close, nameId } = fillDrawer(scroller, rec, { onClose: () => closeDrawer(true) });
    drawer.setAttribute('aria-labelledby', nameId);
    scroller.scrollTop = 0;
    if (!wasOpen) drawer.classList.remove('expanded');
    drawer.hidden = false;
    root.classList.add('drawer-open');
    setInsets();                            // measures the drawer, laid out now
    snapTo(id);
    close.focus({ preventScroll: true });
  }
  function closeDrawer(returnFocus) {
    if (!opened) { drawer.hidden = true; return; }
    const id = opened;
    opened = null;
    stopSnap();                             // it was heading for a spot beside the drawer
    drawer.hidden = true;
    drawer.style.removeProperty('--sheet-h');
    root.classList.remove('drawer-open');
    setInsets();
    apply();                                // back inside the image
    mark();
    if (returnFocus) focusSite(id);
  }
  // the phone sheet: drag the handle to resize, release to snap to half or 85%, or close it
  let sheetDrag = null;
  handle.addEventListener('pointerdown', (e) => {
    sheetDrag = { y: e.clientY, h: drawer.getBoundingClientRect().height, moved: false };
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!sheetDrag) return;
    const dy = e.clientY - sheetDrag.y;
    if (Math.abs(dy) > 4) sheetDrag.moved = true;
    const h = Math.min(innerHeight * 0.85, Math.max(60, sheetDrag.h - dy));
    drawer.style.setProperty('--sheet-h', `${h}px`);
  });
  const endSheet = (e) => {
    if (!sheetDrag) return;
    const { moved, h: h0, y } = sheetDrag;
    sheetDrag = null;
    drawer.style.removeProperty('--sheet-h');
    const h = moved ? h0 - (e.clientY - y) : null;
    if (!moved) { drawer.classList.toggle('expanded'); setInsets(); }
    else if (h < innerHeight * 0.3) { closeDrawer(true); return; }
    else drawer.classList.toggle('expanded', h > innerHeight * 0.67);
    setInsets();
  };
  handle.addEventListener('pointerup', endSheet);
  handle.addEventListener('pointercancel', endSheet);
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drawer.classList.toggle('expanded'); setInsets(); }
  });

  // ── Sites list and the hotkey overlay ─────────────────────────────────────
  function toggleList(on = sitesBox.hidden) {
    sitesBox.hidden = !on;
    sitesBtn.setAttribute('aria-expanded', String(on));
    if (on) { toggleKeys(false); sitesList.querySelector('button.selected, button')?.focus(); }
    else { listed = null; mark(); }
  }
  function toggleKeys(on = keysBox.hidden) {
    keysBox.hidden = !on;
    keysBtn.setAttribute('aria-expanded', String(on));
    if (on) toggleList(false);
  }
  sitesBtn.addEventListener('click', () => toggleList());
  keysBtn.addEventListener('click', () => toggleKeys());
  const listId = (e) => e.target.closest?.('button[data-id]')?.dataset.id ?? null;
  const showListed = (id) => { listed = id; mark(); };
  sitesList.addEventListener('pointerover', (e) => showListed(listId(e)));
  sitesList.addEventListener('pointerleave', () => showListed(null));
  sitesList.addEventListener('focusin', (e) => showListed(listId(e)));
  sitesList.addEventListener('click', (e) => {
    const id = listId(e);
    if (!id) return;
    toggleList(false);
    select(id);
    focusSite(id);
    snapTo(id);
  });
  sitesList.addEventListener('keydown', (e) => {                      // arrows move within the list
    const items = [...sitesList.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (/^[1-9]$/.test(e.key)) {
      items[+e.key - 1]?.click();
    }
  });
  document.addEventListener('pointerdown', (e) => {                    // a click elsewhere closes the popovers
    if (!sitesBox.hidden && !sitesBox.contains(e.target) && e.target !== sitesBtn) toggleList(false);
    if (!keysBox.hidden && !keysBox.contains(e.target) && e.target !== keysBtn) toggleKeys(false);
  });

  addEventListener('resize', () => {
    if (!scene) return;
    const want = portraitQuery.matches ? 'portrait' : 'master';
    if (want !== frameName) setFrame(want); else layout();
  });

  return {
    ready,
    setActive(on) {
      active = on;
      clearKeys();
      if (!on) { stopSnap(); pdx = pdy = 0; drag = null; viewport.classList.remove('dragging'); }
      if (!sprites) return;
      if (on) { layout(); sprites.start(); } else { sprites.stop(); closeDrawer(false); showPreview(null); toggleList(false); toggleKeys(false); }
    },
    /** Pan to a site and open it in the drawer (WebMCP show_company). */
    async showSite(id) {
      await ready;
      if (!records.get(id)?.bbox) return false;
      openDrawer(id);
      return true;
    },
  };
}
