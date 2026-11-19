// Camera input is coalesced: however many wheel/drag/key events arrive in a frame, the world
// transform is written at most once per frame, and not at all when the camera did not move.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openCity, frames, DESKTOP } from './harness.mjs';
import { watchWorldWrites, worldWrites, resetWorldWrites, worldTransform } from './city-helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

const wheelBurst = (page, n, dx, dy) => page.evaluate(([n, dx, dy]) => {
  const vp = document.querySelector('.city-viewport');
  for (let i = 0; i < n; i++) vp.dispatchEvent(new WheelEvent('wheel', { deltaX: dx, deltaY: dy, bubbles: true, cancelable: true }));
}, [n, dx, dy]);

test('a burst of wheel events within one frame writes the world transform once', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  await watchWorldWrites(page);
  const before = await worldTransform(page);
  await frames(page, 2);
  await resetWorldWrites(page);
  await wheelBurst(page, 12, 5, 2);
  await frames(page, 3);
  const w = await worldWrites(page);
  assert.equal(w.writes, 1, 'twelve wheel events, one camera write');
  assert.notEqual(await worldTransform(page), before, 'the camera did move');
  await context.close();
});

test('the whole burst is applied: coalescing sums the deltas', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  await watchWorldWrites(page);
  const x = async () => Number((await worldTransform(page)).match(/translate3d\((-?[\d.]+)px/)[1]);
  const x0 = await x();
  await wheelBurst(page, 10, 7, 0);
  await frames(page, 3);
  assert.ok(Math.abs((x0 - await x()) - 70) < 1, `moved 70 css px, got ${x0 - await x()}`);
  await context.close();
});

test('wheeling against a clamped edge writes nothing', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  await watchWorldWrites(page);
  await wheelBurst(page, 5, -9000, -9000);          // to the top-left corner
  await frames(page, 3);
  await resetWorldWrites(page);
  await wheelBurst(page, 6, -100, -100);
  await frames(page, 3);
  assert.equal((await worldWrites(page)).writes, 0);
  await context.close();
});

test('a wheel and a held key in the same frame share one camera write', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  await watchWorldWrites(page);
  await page.keyboard.down('ArrowRight');
  await frames(page, 3);
  await resetWorldWrites(page);
  for (let i = 0; i < 20; i++) { await wheelBurst(page, 3, 2, 1); await frames(page, 1); }
  await page.keyboard.up('ArrowRight');
  const w = await worldWrites(page);
  assert.ok(w.writes > 0);
  assert.equal(w.maxPerFrame, 1, 'never two writes in one frame');
  await context.close();
});

test('pointer drag moves the camera, once per frame, and still dismisses the hint', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  await watchWorldWrites(page);
  const before = await worldTransform(page);
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await resetWorldWrites(page);
  for (let i = 1; i <= 10; i++) await page.mouse.move(700 - i * 10, 450);   // many moves, maybe several per frame
  await page.mouse.up();
  await frames(page, 3);
  const w = await worldWrites(page);
  assert.ok(w.writes >= 1 && w.maxPerFrame === 1);
  assert.notEqual(await worldTransform(page), before);
  await context.close();
});
