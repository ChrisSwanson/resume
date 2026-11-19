// Panning the City view must not reallocate canvases, rebuild shadow blurs, or cut road masks
// more than once per road layer per paint; and cars must stay masked to the road after a pan.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openCity, DESKTOP, resetPerf, readPerf, wheelPan } from './harness.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

// With motion frozen only the pan itself can cause canvas work, so the pan's cost is exactly zero.
test('wheel pan (still scene): no canvas reallocation, no shadow re-blur, at most one mask cut per road layer', async () => {
  const { context, page } = await openCity(browser, server.url, { ...DESKTOP, reducedMotion: 'reduce' }, { instrument: true });
  await resetPerf(page);
  const N = 60;
  await wheelPan(page, N);
  const p = await readPerf(page);
  assert.equal(p.canvasResizes / N, 0, `canvasResizes per pan event: ${p.canvasResizes / N}`);
  assert.equal(p.filterSets / N, 0, `filterSets per pan event: ${p.filterSets / N}`);
  assert.ok(p.maskCuts / N <= 2, `maskCuts per pan event: ${p.maskCuts / N}`);
  await context.close();
});

// Animated: the flyers' shadows are re-blurred when a flyer's height crosses a blur step, which
// is animation, not panning (baseline: ~6 resizes and ~5 filter sets per pan event).
test('wheel pan (animated): canvas and filter work is only the occasional flyer-shadow rebuild', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP, { instrument: true });
  await resetPerf(page);
  const N = 60;
  await wheelPan(page, N);
  const p = await readPerf(page);
  assert.ok(p.canvasResizes / N <= 0.25, `canvasResizes per pan event: ${p.canvasResizes / N}`);
  assert.ok(p.filterSets / N <= 0.25, `filterSets per pan event: ${p.filterSets / N}`);
  assert.ok(p.maskCuts / N <= 2, `maskCuts per pan event: ${p.maskCuts / N}`);
  await context.close();
});

// every drawn car pixel on the street and freeway canvases lies on road in the render's mask,
// summed over `samples` paints a few frames apart (a leak at a car's edge shows in a few % of them)
async function unmaskedPixels(page, samples = 1) {
  return page.evaluate(async (samples) => {
    const res = (await (await fetch('assets/hero/scene.json')).json()).frames.master.res;
    const masks = {};
    for (const kind of ['street', 'freeway']) {
      masks[kind] = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = `assets/hero/roads-master-${kind}.png`; });
    }
    const out = { street: { drawn: 0, bad: 0 }, freeway: { drawn: 0, bad: 0 } };
    for (let k = 0; k < samples; k++) {
      if (k) await new Promise((r) => { let n = 4; const f = () => (--n ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); });
      const { view } = document.querySelector('canvas.sprites-air').spriteState();   // paints now
      for (const kind of ['street', 'freeway']) {
        const cv = document.querySelector(`canvas.sprites-${kind}`);
        const m = document.createElement('canvas'); m.width = cv.width; m.height = cv.height;
        const g = m.getContext('2d', { willReadFrequently: true });
        const D = cv.width / (view.x1 - view.x0);
        g.setTransform(D, 0, 0, D, -view.x0 * D, -view.y0 * D);
        g.drawImage(masks[kind], 0, 0, res[0], res[1]);
        const a = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        const b = g.getImageData(0, 0, cv.width, cv.height).data;
        for (let i = 3; i < a.length; i += 4) if (a[i] > 16) { out[kind].drawn++; if (b[i] === 0) out[kind].bad++; }
      }
    }
    return out;
  }, samples);
}

// A road mask that arrives after the cars started (a slow network, a loaded machine) must still
// cut the cars in, with no pan to force a new cut.
test('road masks that load late still show the cars', async () => {
  const late = (route) => setTimeout(() => route.continue(), 1500);
  const { context, page } = await openCity(browser, server.url, DESKTOP, { setup: (c) => c.route(/roads-master-(street|freeway)\.png/, late) });
  await page.waitForFunction(() => performance.getEntriesByType('resource').filter((e) => /roads-master-(street|freeway)\.png/.test(e.name)).length === 2);
  await page.waitForTimeout(300);
  const drawn = await page.evaluate(() => ['street', 'freeway'].reduce((n, kind) => {
    const cv = document.querySelector(`canvas.sprites-${kind}`);
    const a = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data;
    for (let i = 3; i < a.length; i += 4) if (a[i] > 16) n++;
    return n;
  }, 0));
  assert.ok(drawn > 0, 'cars are drawn once the masks arrive');
  assert.deepEqual(page.errors, []);
  await context.close();
});

test('after a pan, cars are still clipped to the road mask', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP, { instrument: true });
  await wheelPan(page, 60);
  const r = await unmaskedPixels(page, 40);
  assert.ok(r.street.drawn + r.freeway.drawn > 0, 'cars are drawn');
  assert.equal(r.street.bad, 0, `street pixels off the road: ${r.street.bad}`);
  assert.equal(r.freeway.bad, 0, `freeway pixels off the road: ${r.freeway.bad}`);
  await context.close();
});
