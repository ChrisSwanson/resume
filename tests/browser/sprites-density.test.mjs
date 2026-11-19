// Sprite canvases are capped at 1.5 device px per CSS px (the background image is not affected).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openCity, DESKTOP } from './harness.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

const sizes = (page) => page.evaluate(() => [...document.querySelectorAll('#view-3d canvas')].map((c) => `${c.width}x${c.height}`));
const atlasFiles = async (opts) => {
  const { context, page } = await openCity(browser, server.url, opts);
  const urls = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((u) => /sprites\/.*\.(png|webp)/.test(u)).map((u) => u.split('/sprites/')[1]).sort());
  await context.close();
  return urls;
};

test('DPR 2 at 1440x900: sprite canvases are 2160x1350', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  assert.deepEqual(await sizes(page), Array(4).fill('2160x1350'));
  await context.close();
});

test('DPR 1 at 1440x900: sprite canvases are 1440x900', async () => {
  const { context, page } = await openCity(browser, server.url, { ...DESKTOP, deviceScaleFactor: 1 });
  assert.deepEqual(await sizes(page), Array(4).fill('1440x900'));
  await context.close();
});

test('DPR 1.25 is below the cap and used as is', async () => {
  const { context, page } = await openCity(browser, server.url, { ...DESKTOP, deviceScaleFactor: 1.25 });
  assert.deepEqual(await sizes(page), Array(4).fill('1800x1125'));
  await context.close();
});

test('the atlas is chosen for the capped density, and sprites stay aligned with the canvas', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  const d = await page.evaluate(() => {
    const air = document.querySelector('canvas.sprites-air');
    const { view } = air.spriteState();
    return { D: view.D, cssScale: view.s, w: air.width, span: view.x1 - view.x0 };
  });
  // canvas px per image px is the capped density times CSS px per image px
  assert.ok(Math.abs(d.D - 1.5 * d.cssScale) < 0.01, `D=${d.D}, expected ${1.5 * d.cssScale}`);
  assert.ok(Math.abs(d.w - d.D * d.span) < 1);
  await context.close();
});

test('atlas files at DPR 2 are the ones chosen for DPR 1.5', async () => {
  const a = await atlasFiles(DESKTOP), b = await atlasFiles({ ...DESKTOP, deviceScaleFactor: 1.5 });
  assert.ok(a.length > 0);
  assert.deepEqual(a, b);
});
