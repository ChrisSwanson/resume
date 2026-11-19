// Shared helpers for browser tests (node:test + Playwright). Dev-only: the site ships no deps.
//   npm run test:browser
// Each test file starts its own static server on a free port and its own browser.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const freePort = () => new Promise((resolve, reject) => {
  const s = createServer();
  s.unref();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

/** Start scripts/serve.mjs on a free localhost port. Returns { url, stop }. */
export async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, [join(root, 'scripts/serve.mjs'), '--port', String(port), '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    child.on('exit', (code) => reject(new Error(`server exited (${code})`)));
    child.stdout.on('data', (d) => { if (String(d).includes('serving')) resolve(); });
  });
  return { url: `http://127.0.0.1:${port}/`, stop: () => child.kill() };
}

/** Launch Chromium once per file. */
export const launch = () => chromium.launch();

// The two viewports AGENTS.md requires checking.
export const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
export const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

/**
 * Open the City view and wait until the image, regions and sprites are up.
 * opts: Playwright context options (DESKTOP, PHONE, plus e.g. reducedMotion: 'reduce').
 * instrument: install window.__perf; setup(context): runs before the page opens.
 * Returns { context, page }.
 */
export async function openCity(browser, baseUrl, opts = DESKTOP, { instrument = false, setup } = {}) {
  const context = await browser.newContext(opts);
  if (instrument) await context.addInitScript(INSTRUMENT);
  await setup?.(context);                               // e.g. context.route() before the page loads
  const page = await context.newPage();
  // page.errors: uncaught exceptions and console errors since the page opened
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(baseUrl);
  await page.waitForSelector('#view-3d a.site', { state: 'attached' });
  await page.waitForFunction(() => {
    const img = document.querySelector('.city-world img');
    return img?.complete && img.naturalWidth > 0 && document.querySelector('canvas.sprites-air');
  });
  // the sprite index, atlases and road masks load after boot: wait for them (no request for
  // 500 ms), not a fixed time, which a loaded machine overruns; then a frame paints with them
  await page.waitForLoadState('networkidle');
  await frames(page, 2);
  return { context, page };
}

/**
 * Counters for canvas work, installed before page scripts run (openCity(..., { instrument: true })).
 * window.__perf: canvasResizes (any canvas width/height assignment, which reallocates even at the
 * same size), filterSets (ctx.filter assignments: shadow blur rebuilds), maskCuts (drawImage of a
 * road-mask image), drawImages, and frames (rAF callbacks seen by the page).
 * resetPerf(page) zeroes them; readPerf(page) returns a copy.
 */
const INSTRUMENT = `(() => {
  const P = window.__perf = { canvasResizes: 0, filterSets: 0, maskCuts: 0, drawImages: 0, frames: 0 };
  for (const k of ['width', 'height']) {
    const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, k);
    Object.defineProperty(HTMLCanvasElement.prototype, k, { configurable: true, get: d.get,
      set(v) { if (k === 'width') P.canvasResizes++; d.set.call(this, v); } });
  }
  const f = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'filter');
  Object.defineProperty(CanvasRenderingContext2D.prototype, 'filter', { configurable: true, get: f.get,
    set(v) { P.filterSets++; f.set.call(this, v); } });
  const di = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
    P.drawImages++;
    if (img instanceof HTMLImageElement && /roads-/.test(img.src)) P.maskCuts++;
    return di.call(this, img, ...rest);
  };
  const raf = window.requestAnimationFrame.bind(window);
  (function count() { P.frames++; raf(count); })();
})();`;
export const resetPerf = (page) => page.evaluate(() => { for (const k in window.__perf) window.__perf[k] = 0; });
export const readPerf = (page) => page.evaluate(() => ({ ...window.__perf }));

/** Trackpad-style pan: n wheel events, one per animation frame, moving (dx, dy) CSS px each. */
export async function wheelPan(page, n = 60, dx = 6, dy = 3) {
  await page.mouse.move(720, 450);
  for (let i = 0; i < n; i++) {
    await page.mouse.wheel(dx, dy);
    await frames(page, 1);
  }
}

/** Wait for n animation frames in the page. */
export const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { const f = (i) => (i ? requestAnimationFrame(() => f(i - 1)) : r()); f(n); }), n);

/** Main-thread busy time (ms per second) over `ms`, from CDP Performance metrics. */
export async function mainThreadLoad(page, ms, during = () => page.waitForTimeout(ms)) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const get = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const a = await get(), t0 = Date.now();
  await during();
  const b = await get(), secs = (Date.now() - t0) / 1000;
  return { taskMsPerSec: ((b.TaskDuration - a.TaskDuration) * 1000) / secs, scriptMsPerSec: ((b.ScriptDuration - a.ScriptDuration) * 1000) / secs };
}
