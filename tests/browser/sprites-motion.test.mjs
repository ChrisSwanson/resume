// prefers-reduced-motion: a still frame, live switching in both directions, no clock jump.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openCity, DESKTOP, resetPerf, readPerf } from './harness.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

const snapshot = (page) => page.evaluate(() => [...document.querySelectorAll('#view-3d canvas.sprites-air, #view-3d canvas.sprites-street, #view-3d canvas.sprites-freeway, #view-3d canvas.sprites-ground')]
  .map((c) => c.toDataURL()).join('|'));

test('reduced motion at load: canvases do not change over a second', async () => {
  const { context, page } = await openCity(browser, server.url, { ...DESKTOP, reducedMotion: 'reduce' }, { instrument: true });
  const a = await snapshot(page);
  assert.ok(a.length > 1000);
  await resetPerf(page);
  await page.waitForTimeout(1000);
  assert.equal(await snapshot(page), a, 'canvases changed');
  assert.equal((await readPerf(page)).drawImages, 0, 'sprites drew while reduced');
  await context.close();
});

test('live switch to reduced motion stops the loop and keeps a still; switching back resumes', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP, { instrument: true });
  await resetPerf(page);
  await page.waitForTimeout(400);
  assert.ok((await readPerf(page)).drawImages > 50, 'animating before the switch');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(200);
  const still = await snapshot(page);
  assert.ok(still.length > 1000, 'a frame is left behind');
  await resetPerf(page);
  await page.waitForTimeout(700);
  assert.equal((await readPerf(page)).drawImages, 0, 'loop still running after switching to reduce');
  assert.equal(await snapshot(page), still, 'still frame changed');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(500);
  assert.ok((await readPerf(page)).drawImages > 50, 'loop resumes');
  assert.notEqual(await snapshot(page), still);
  await context.close();
});

test('resuming after a switch does not jump the clock', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP, { instrument: true });
  // spriteState() redraws but does not step, so it reads the simulation without advancing it
  const cars = () => page.evaluate(() => document.querySelector('canvas.sprites-air').spriteState().cars.map((c) => [c.lane, c.s]));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  const before = await cars();
  await page.waitForTimeout(2000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(60);
  const after = await cars();
  // a car is the nearest one ahead (or at) its old station on its lane; cars may leave or merge, so
  // most should be within a few metres (27 m/s * 60 ms), where a 2 s jump would be 18-54 m
  const near = before.filter(([lane, s]) => after.some(([l, t]) => l === lane && t >= s - 0.01 && t - s < 4)).length;
  assert.ok(before.length > 5);
  assert.ok(near / before.length >= 0.75, `${near} of ${before.length} cars within 4 m after resuming`);
  await context.close();
});
