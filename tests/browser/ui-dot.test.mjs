// Styles of the landmark dots and their name label, checked on the real elements city.js builds.
// (Placement and behaviour live in city-dots.test.mjs.)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openCity, DESKTOP } from './harness.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

const DOT = '#view-3d a.site .site-dot';
const firstDot = (page) => page.locator(DOT).first();
const style = (loc, props) => loc.evaluate((el, ps) => {
  const cs = getComputedStyle(el); return Object.fromEntries(ps.map((p) => [p, cs.getPropertyValue(p)]));
}, props);

test('dot: white fill, 2px brand ring, no animation, pointer-friendly', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  const s = await style(firstDot(page), ['fill', 'stroke-width', 'vector-effect', 'animation-name', 'stroke']);
  assert.equal(s.fill, 'rgb(255, 255, 255)');
  assert.equal(s['stroke-width'], '2px');
  assert.equal(s['vector-effect'], 'non-scaling-stroke');
  assert.equal(s['animation-name'], 'none');
  assert.notEqual(s.stroke, 'none');
  await context.close();
});

test('dot: ring uses the site brand colour', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  await page.evaluate(() => document.querySelector('#view-3d a.site').style.setProperty('--brand', 'rgb(1, 2, 3)'));
  assert.equal((await style(firstDot(page), ['stroke'])).stroke, 'rgb(1, 2, 3)');
  await context.close();
});

test('dot: .is-hidden hides it', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  await firstDot(page).evaluate((el) => el.classList.add('is-hidden'));
  assert.equal((await style(firstDot(page), ['display'])).display, 'none');
  await context.close();
});

test('dot grows and the ring brightens on hover', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  const dot = firstDot(page);
  const rest = await style(dot, ['transform', 'filter']);
  await dot.hover();
  await page.waitForTimeout(250);
  const hover = await style(dot, ['transform', 'filter']);
  assert.notEqual(hover.transform, rest.transform, 'grows on hover');
  assert.notEqual(hover.filter, rest.filter, 'ring brightens on hover');
  await context.close();
});

test('keyboard focus: the red marker replaces the focused site\'s dot', async () => {
  // focusing a site selects it (city.js), so the marker, not a grown dot, shows keyboard focus
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  await page.keyboard.press('Tab');
  let id = null;
  for (let i = 0; i < 20 && !id; i++) {
    id = await page.evaluate(() => document.activeElement?.closest?.('#view-3d a.site')?.dataset.id ?? null);
    if (!id) await page.keyboard.press('Tab');
  }
  assert.ok(id, 'Tab reaches a site');
  const hidden = await page.locator(`#view-3d a.site[data-id="${id}"] .site-dot`).evaluate((el) => getComputedStyle(el).display);
  assert.equal(hidden, 'none', 'focused site shows the marker instead of its dot');
  await context.close();
});

test('label: dark pill with a coloured dot, hidden until a site is hovered', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  const label = page.locator('.site-label');
  const s = await style(label, ['position', 'border-radius', 'background-color', 'pointer-events', 'white-space']);
  assert.equal(s.position, 'fixed');
  assert.notEqual(s['border-radius'], '0px');
  assert.match(s['background-color'], /^rgba?\((\d{1,2}|1\d\d), (\d{1,2}|1\d\d), (\d{1,2}|1\d\d)/, 'dark');
  assert.equal(s['pointer-events'], 'none');
  assert.equal(await label.evaluate((el) => getComputedStyle(el).opacity), '0');
  await firstDot(page).hover();
  await page.waitForTimeout(300);
  assert.equal(await label.evaluate((el) => getComputedStyle(el).opacity), '1');
  assert.deepEqual(page.errors, []);
  await context.close();
});

test('reduced motion: no transitions on the dot or label', async () => {
  const { context, page } = await openCity(browser, server.url, { ...DESKTOP, reducedMotion: 'reduce' });
  const d = await style(firstDot(page), ['transition-duration', 'animation-name']);
  const l = await style(page.locator('.site-label'), ['transition-duration']);
  assert.equal(d['transition-duration'], '0s');
  assert.equal(d['animation-name'], 'none');
  assert.equal(l['transition-duration'], '0s');
  await context.close();
});
