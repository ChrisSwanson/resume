// The camera follows the drawer's laid-out width, not a constant: with a 600 px drawer an opened
// site is centred in the space left of it, and the image's right edge can reach the drawer.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openCity, frames, DESKTOP } from './harness.mjs';

let server, browser, scene;
before(async () => {
  server = await startServer(); browser = await launch();
  scene = await (await fetch(server.url + 'assets/hero/scene.json')).json();
});
after(async () => { await browser?.close(); server?.stop(); });

const DRAWER = 600, VW = 1440;
const open = (page, id) => page.evaluate((id) => document.querySelector(`a.site[data-id="${id}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })), id);
const world = (page) => page.evaluate(() => { const r = document.querySelector('.city-world').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; });

async function openWide(drawerCss) {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  if (drawerCss) await page.addStyleTag({ content: drawerCss });
  return { context, page };
}

for (const [name, css, w] of [['shipped CSS: 33vw', '', Math.round(VW * 0.33)], ['a 600px drawer', `.city-drawer{width:${DRAWER}px!important}`, DRAWER]]) {
  test(`an opened site is centred beside the drawer (${name})`, async () => {
    const { context, page } = await openWide(css);
    const [W, H] = scene.frames.master.res;
    const left = VW - w;
    for (const id of Object.keys(scene.signBoxes.master)) {
      await open(page, id);
      await page.waitForTimeout(600);
      assert.equal(await page.evaluate(() => document.querySelector('.city-drawer').offsetWidth), w, 'drawer width as styled');
      const b = scene.signBoxes.master[id], fx = (b[0] + b[2]) / 2, fy = (b[1] + b[3]) / 2;
      const r = await world(page), k = r.width / W;
      // what the camera may do: centre the sign beside the drawer, clamped to the image
      const hw = VW / 2 / k, hh = 900 / 2 / k;
      const cx = Math.min(Math.max(fx + w / 2 / k, hw), W - hw + w / k), cy = Math.min(Math.max(fy, hh), H - hh);
      const wantX = VW / 2 + (fx - cx) * k, wantY = 450 + (fy - cy) * k;
      const gotX = r.left + fx * k, gotY = r.top + fy * k;
      assert.ok(Math.abs(gotX - wantX) < 3, `${id}: x ${gotX.toFixed(1)} vs ${wantX.toFixed(1)}`);
      assert.ok(Math.abs(gotY - wantY) < 3, `${id}: y ${gotY.toFixed(1)} vs ${wantY.toFixed(1)}`);
      if (Math.abs(cx - (fx + w / 2 / k)) < 1e-6) assert.ok(Math.abs(gotX - left / 2) < 3, `${id} centred in the ${left}px left of the drawer`);
      await page.keyboard.press('Escape');
    }
    await context.close();
  });
}

test('the image\'s right edge can reach the drawer', async () => {
  const { context, page } = await openWide(`.city-drawer{width:${DRAWER}px!important}`);
  await open(page, 'wellsfargo');
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('.city-viewport').dispatchEvent(new WheelEvent('wheel', { deltaX: 9000, bubbles: true, cancelable: true })));
  await frames(page, 3);
  const r = await world(page);
  assert.ok(Math.abs(r.left + r.width - (VW - DRAWER)) < 2, `image right edge at ${r.left + r.width}, drawer starts at ${VW - DRAWER}`);
  await context.close();
});

test('resizing the drawer while open re-centres on the new width', async () => {
  const { context, page } = await openWide('');
  await open(page, 'twitch');
  await page.waitForTimeout(600);
  await page.addStyleTag({ content: `.city-drawer{width:${DRAWER}px!important}` });
  await page.setViewportSize({ width: 1439, height: 900 });         // a resize re-measures the drawer
  await frames(page, 3);
  await page.evaluate(() => document.querySelector('.city-viewport').dispatchEvent(new WheelEvent('wheel', { deltaX: 9000, bubbles: true, cancelable: true })));
  await frames(page, 3);
  const r = await world(page);
  assert.ok(Math.abs(r.left + r.width - (1439 - DRAWER)) < 2, `right edge ${r.left + r.width}`);
  await context.close();
});
