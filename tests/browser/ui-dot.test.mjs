// Styles of the landmark dots (HTML, in .city-dots) and their name label, checked on the real elements city.js builds.
// (Placement and behaviour live in city-dots.test.mjs and dots-*.test.mjs.)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openCity, DESKTOP } from './harness.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

const DOT = '#view-3d .city-dots .site-dot';
const firstDot = (page) => page.locator(DOT).first();
const core = (page) => page.locator(`${DOT} .sd-core`).first();
const style = (loc, props) => loc.evaluate((el, ps) => {
  const cs = getComputedStyle(el); return Object.fromEntries(ps.map((p) => [p, cs.getPropertyValue(p)]));
}, props);
const overHit = async (page) => {
  const box = await page.locator('#view-3d .site-tip .site-hit').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
};

test('dot: a ~11px solid brand-colour core with a 2px white ring and a static glow, not an SVG shape', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  const s = await style(core(page), ['width', 'border-top-width', 'border-top-color', 'background-color', 'box-shadow', 'animation-name', 'border-radius']);
  assert.equal(await firstDot(page).evaluate((el) => el instanceof HTMLElement && !(el instanceof SVGElement)), true);
  assert.equal(s['border-top-width'], '2px');
  assert.equal(s['border-top-color'], 'rgb(255, 255, 255)');
  const w = parseFloat(s.width);
  assert.ok(w >= 10 && w <= 12, `core ${w}px`);
  assert.notEqual(s['background-color'], 'rgba(0, 0, 0, 0)', 'solid fill');
  assert.notEqual(s['box-shadow'], 'none', 'glow');
  assert.equal(s['animation-name'], 'none', 'the core itself never animates');
  assert.equal(s['border-radius'], '50%');
  await context.close();
});

test('dot: fill and glow use the site brand colour', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  const before = await style(core(page), ['box-shadow']);
  await firstDot(page).evaluate((el) => el.style.setProperty('--brand', 'rgb(1, 2, 3)'));
  const s = await style(core(page), ['background-color', 'box-shadow']);
  assert.equal(s['background-color'], 'rgb(1, 2, 3)');
  assert.notEqual(s['box-shadow'], before['box-shadow'], 'the glow follows the brand colour');
  await context.close();
});

test('dot: carries the same brand colour as its site link', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  const same = await page.evaluate(() => [...document.querySelectorAll('#view-3d a.site')].every((a) => {
    const d = document.querySelector(`.city-dots .site-dot[data-id="${a.dataset.id}"]`);
    return d && d.style.getPropertyValue('--brand') === a.style.getPropertyValue('--brand');
  }));
  assert.ok(same);
  await context.close();
});

test('dot: the layer and dots never take pointer events; the SVG hit circle is transparent but hittable', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  assert.equal(await page.locator('.city-dots').evaluate((el) => getComputedStyle(el).pointerEvents), 'none');
  assert.equal(await firstDot(page).evaluate((el) => getComputedStyle(el).pointerEvents), 'none');
  const h = await style(page.locator('#view-3d .site-tip .site-hit').first(), ['fill', 'pointer-events']);
  assert.match(h.fill, /^rgba\(0, 0, 0, 0\)$|^transparent$/);
  assert.notEqual(h['pointer-events'], 'none');
  await context.close();
});

test('dot: .is-hidden hides it', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  await firstDot(page).evaluate((el) => el.classList.add('is-hidden'));
  assert.equal((await style(firstDot(page), ['display'])).display, 'none');
  await context.close();
});

test('dot grows on hover (through the hit circle, which drives .is-on)', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  const rest = await style(core(page), ['transform']);
  await overHit(page);
  assert.equal(await firstDot(page).evaluate((el) => el.classList.contains('is-on')), true);
  assert.notEqual((await style(core(page), ['transform'])).transform, rest.transform, 'grows on hover');
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
  const hidden = await page.locator(`${DOT}[data-id="${id}"]`).evaluate((el) => getComputedStyle(el).display);
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
  await overHit(page);
  assert.equal(await label.evaluate((el) => getComputedStyle(el).opacity), '1');
  assert.deepEqual(page.errors, []);
  await context.close();
});

test('reduced motion: no transitions on the dot core or label', async () => {
  const { context, page } = await openCity(browser, server.url, { ...DESKTOP, reducedMotion: 'reduce' });
  const d = await style(core(page), ['transition-duration', 'animation-name']);
  const l = await style(page.locator('.site-label'), ['transition-duration']);
  assert.equal(d['transition-duration'], '0s');
  assert.equal(d['animation-name'], 'none');
  assert.equal(l['transition-duration'], '0s');
  await context.close();
});
