// The idle sprite loop paints at about 30 Hz whatever the display rate; camera paints are immediate
// and at most one per animation frame.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openCity, DESKTOP, resetPerf, readPerf, wheelPan } from './harness.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

const paints = (page) => page.evaluate(() => document.querySelector('canvas.sprites-air').spritePaints());

test('idle: about 30 paints per second', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP, { instrument: true });
  await resetPerf(page);
  const p0 = await paints(page);
  await page.waitForTimeout(4000);
  const n = (await paints(page)) - p0, frames = (await readPerf(page)).frames;
  assert.ok(frames > 4 * 40, `the page ran ${frames / 4} frames/s, too slow to judge`);
  assert.ok(n / 4 >= 25 && n / 4 <= 35, `${n / 4} paints/s over ${frames / 4} frames/s`);
  await context.close();
});

test('panning: at most one paint per animation frame, and every pan event paints', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP, { instrument: true });
  await resetPerf(page);
  const p0 = await paints(page);
  const N = 60;
  await wheelPan(page, N);
  const n = (await paints(page)) - p0, frames = (await readPerf(page)).frames;
  assert.ok(n <= frames, `${n} paints in ${frames} frames`);
  assert.ok(n >= N * 0.9, `${n} paints for ${N} pan events`);
  await context.close();
});
