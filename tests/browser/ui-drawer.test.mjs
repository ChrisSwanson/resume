// Drawer is about a third of the screen on desktop; popovers move with their buttons; phone stays a bottom sheet.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openCity, PHONE } from './harness.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

const desktop = (width, height = 900) => ({ viewport: { width, height }, deviceScaleFactor: 1 });
const box = (page, sel) => page.locator(sel).boundingBox();
const openFirst = async (page) => {
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.city-drawer:not([hidden])');
  // the slide-in animation offsets the box until it ends (a fixed wait overran under load)
  await page.locator('.city-drawer').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
};

for (const [vw, expected] of [[1280, 1280 * 0.33], [1440, 1440 * 0.33], [2560, 640], [900, 320]]) {
  test(`drawer is ${Math.round(expected)}px wide at ${vw}px`, async () => {
    const { context, page } = await openCity(browser, server.url, desktop(vw));
    await openFirst(page);
    const b = await box(page, '.city-drawer');
    assert.ok(Math.abs(b.width - expected) <= 2, `width ${b.width}, wanted ${expected}`);
    assert.ok(Math.abs(b.x + b.width - vw) <= 1, 'flush right');
    await context.close();
  });
}

test('tools sit left of the drawer', async () => {
  const { context, page } = await openCity(browser, server.url, desktop(1440));
  await openFirst(page);
  const d = await box(page, '.city-drawer'), t = await box(page, '.city-tools');
  assert.ok(t.x + t.width <= d.x, `tools right edge ${t.x + t.width} vs drawer ${d.x}`);
  await context.close();
});

for (const [label, btn, panel] of [['Sites list', '.sites-btn', '.city-sites'], ['Keys', '.keys-btn', '.city-keys']]) {
  test(`${label} popover clears the open drawer`, async () => {
    const { context, page } = await openCity(browser, server.url, desktop(1440));
    await openFirst(page);
    await page.locator(btn).click();
    await page.waitForSelector(`${panel}:not([hidden])`);
    const d = await box(page, '.city-drawer'), p = await box(page, panel);
    assert.ok(p.x + p.width <= d.x, `${label} right edge ${p.x + p.width} overlaps drawer at ${d.x}`);
    assert.ok(p.x >= 0);
    await context.close();
  });
}

test('phone: drawer is a full-width bottom sheet', async () => {
  const { context, page } = await openCity(browser, server.url, PHONE);
  await openFirst(page);
  const b = await box(page, '.city-drawer');
  assert.equal(Math.round(b.width), 390);
  assert.equal(Math.round(b.x), 0);
  assert.ok(Math.abs(b.y + b.height - 844) <= 1, 'anchored to the bottom');
  assert.ok(b.height < 844 * 0.9);
  await context.close();
});

test('drawer text is capped near 65ch', async () => {
  const { context, page } = await openCity(browser, server.url, desktop(2560));
  await openFirst(page);
  const mw = await page.locator('.city-drawer .cc-body').evaluate((el) => getComputedStyle(el).maxWidth);
  assert.match(mw, /px$/, `cc-body max-width is ${mw}`);
  await context.close();
});
