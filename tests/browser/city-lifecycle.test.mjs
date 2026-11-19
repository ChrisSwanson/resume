// Nothing moves the camera after the City view is left, the drawer is closed mid-snap, or the
// visitor turns on reduced motion mid-snap.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openCity, frames, DESKTOP } from './harness.mjs';
import { worldTransform } from './city-helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

const key = (page, k) => page.evaluate((k) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })), k);
const switchTo = (page, view) => page.evaluate((v) => document.querySelector(`.view-switch button[data-view="${v}"]`).click(), view);   // no round trip: the snap is only 350 ms
const settled = async (page, ms = 700) => { await page.waitForTimeout(ms); return worldTransform(page); };

test('leaving the City view mid-snap stops the snap', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  const start = await worldTransform(page);
  await key(page, '1');                                             // snap to the first site
  await page.waitForTimeout(80);
  await switchTo(page, 'text');
  const left = await worldTransform(page);
  assert.notEqual(left, start, 'the snap had started');
  assert.equal(await settled(page), left, 'no camera move after leaving');
  await context.close();
});

test('leaving the City view while a key is held stops the movement', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(150);
  await switchTo(page, 'text');
  const left = await worldTransform(page);
  assert.equal(await settled(page), left);
  await page.keyboard.up('ArrowRight');
  await context.close();
});

test('returning to the City view starts still', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  await key(page, '1');
  await page.waitForTimeout(80);
  await switchTo(page, 'text');
  await switchTo(page, '3d');
  const back = await worldTransform(page);
  assert.equal(await settled(page), back);
  await context.close();
});

test('closing the drawer mid-snap cancels the snap', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  const closed = await page.evaluate(async () => {
    const t = () => document.querySelector('.city-world').style.transform;
    const t0 = t();
    const a = [...document.querySelectorAll('a.site')].at(-1);       // a site far from the centre
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 80));
    const mid = t();
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return { t0, mid, after: t(), open: !document.querySelector('.city-drawer').hidden };
  });
  assert.notEqual(closed.mid, closed.t0, 'the snap had started');
  assert.equal(closed.open, false, 'the drawer closed');
  assert.equal(await settled(page), closed.after, 'camera stays where it was when the drawer closed');
  await context.close();
});

test('switching to reduced motion mid-snap finishes the snap at once', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  await key(page, '1');
  await page.waitForTimeout(60);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await frames(page, 2);
  const soon = await worldTransform(page);
  assert.equal(await settled(page), soon, 'already at the target within a couple of frames');
  await context.close();
});
