// Landmark dots and hover labels in the City view (src/hero/city.js).
// Spec v0.3: a dot is an HTML element (.site-dot[data-id] with a .sd-core) in the .city-dots layer, at the
// red marker's tip; a transparent circle.site-hit in a pointer-only g.site-tip carries click, tap and hover; a.site carries Tab.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openCity, frames, DESKTOP, PHONE } from './harness.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

const dots = (page) => page.evaluate(() => [...document.querySelectorAll('#view-3d a.site')].map((a) => {
  const el = document.querySelector(`#view-3d .city-dots .site-dot[data-id="${a.dataset.id}"]`), core = el?.querySelector('.sd-core');
  const hitEl = document.querySelector(`#view-3d .site-tip[data-id="${a.dataset.id}"] .site-hit`);
  if (!core || !hitEl) return { id: a.dataset.id, dot: null };
  const r = core.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const hit = document.elementsFromPoint(cx, cy);
  return { id: a.dataset.id, w: r.width, h: r.height, cx, cy, top: r.top, dot: true,
    inView: cx > 60 && cy > 60 && cx < innerWidth - 60 && cy < innerHeight - 60,
    topIsDot: hit[0] === hitEl, hitSite: hit.find((e) => e.closest?.('a.site, .site-tip'))?.closest('a.site, .site-tip').dataset.id };
}));
const label = (page) => page.evaluate(() => {
  const l = document.querySelector('.site-label');
  if (!l) return null;
  const r = l.getBoundingClientRect();
  return { show: l.classList.contains('show'), text: l.textContent, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
});
const dotOf = (page, id) => page.evaluate((id) => { const r = document.querySelector(`.city-dots .site-dot[data-id="${id}"] .sd-core`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top }; }, id);
const nameOf = (page, id) => page.evaluate((id) => document.querySelector(`a.site[data-id="${id}"]`).getAttribute('aria-label'), id);
const hiddenIds = (page) => page.evaluate(() => [...document.querySelectorAll('.city-dots .site-dot.is-hidden')].map((d) => d.dataset.id));
const activeSite = (page) => page.evaluate(() => document.activeElement?.closest?.('a.site')?.dataset.id ?? null);

for (const [name, opts] of [['desktop', DESKTOP], ['phone', PHONE]]) {
  test(`${name}: every site has a core dot of 9-14px whose hit circle is the topmost hit and belongs to its site`, async () => {
    const { context, page } = await openCity(browser, server.url, opts);
    const all = await dots(page);
    assert.ok(all.length >= 5);
    let n = 0;
    for (const d of all) {
      assert.ok(d.dot, `${d.id} has a dot`);
      assert.ok(d.w >= 9 && d.w <= 14, `${d.id} diameter ${d.w}`);
      if (!d.inView) continue;            // off-screen at the resting camera
      n++;
      assert.ok(d.topIsDot, `${d.id} dot is topmost at its centre`);
      assert.equal(d.hitSite, d.id);
    }
    assert.ok(n >= 2, 'some dots in view');
    assert.deepEqual(page.errors, []);
    await context.close();
  });
}

test('desktop: hover shows the label above the dot and it follows a pan; click on the dot opens the drawer', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  const t = (await dots(page)).find((d) => d.dot && d.inView);
  await page.mouse.move(t.cx, t.cy);
  await page.waitForTimeout(250);
  const l = await label(page);
  assert.ok(l.show, 'label shown on hover');
  assert.ok(l.bottom < t.top, `label bottom ${l.bottom} above dot top ${t.top}`);
  assert.ok(l.left >= 0 && l.right <= 1440 && l.top >= 0, 'inside viewport');
  const aria = await nameOf(page, t.id);
  assert.ok(aria.includes(l.text.trim()), `${l.text} in ${aria}`);
  await page.mouse.wheel(40, 30);
  await page.waitForTimeout(250);
  const after = await dotOf(page, t.id), l2 = await label(page);
  assert.ok(l2.show);
  const dx = after.x - t.cx, dy = after.y - t.cy;
  assert.ok(Math.abs(dx) > 5 || Math.abs(dy) > 5, 'pan moved');
  assert.ok(Math.abs((l2.left - l.left) - dx) <= 2 && Math.abs((l2.top - l.top) - dy) <= 2, 'label follows pan');
  await page.mouse.move(2, 450);
  await page.waitForTimeout(250);
  assert.equal((await label(page)).show, false);
  const p = await dotOf(page, t.id);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(600);
  assert.ok(await page.locator('.city-drawer').isVisible());
  assert.equal((await label(page)).show, false, 'label hidden with the drawer open');
  assert.deepEqual(await hiddenIds(page), [t.id]);
  assert.deepEqual(page.errors, []);
  await context.close();
});

test('phone: tapping a dot opens the sheet', async () => {
  const { context, page } = await openCity(browser, server.url, PHONE);
  const t = (await dots(page)).find((d) => d.dot && d.inView);
  await page.touchscreen.tap(t.cx, t.cy);
  await page.waitForTimeout(600);
  assert.ok(await page.locator('.city-drawer').isVisible());
  assert.deepEqual(await hiddenIds(page), [t.id]);
  await context.close();
});

test('keyboard: Tab shows the label; the selected site\'s dot is hidden and the hidden state moves with selection', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  let tries = 0;
  do { await page.keyboard.press('Tab'); } while (!(await activeSite(page)) && tries++ < 12);
  const first = await activeSite(page);
  assert.ok(first, 'tabbed to a site');
  await page.waitForTimeout(600);
  const l = await label(page);
  assert.ok(l.show, 'label on keyboard focus');
  assert.ok(l.left >= 0 && l.right <= 1440 && l.top >= 0 && l.bottom <= 900);
  assert.deepEqual(await hiddenIds(page), [first], 'selected site dot hidden, others not');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  assert.equal((await label(page)).show, false, 'label hidden while the drawer is open');
  assert.deepEqual(await hiddenIds(page), [first]);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('2');
  await page.waitForTimeout(600);
  const hid = await hiddenIds(page);
  assert.equal(hid.length, 1);
  assert.notEqual(hid[0], first, 'hidden state moved to the newly selected site');
  await context.close();
});

test('frame switch on resize rebuilds the dots', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  const after = await dots(page);
  assert.ok(after.length >= 5);
  for (const d of after) { assert.ok(d.dot, `${d.id} has a dot`); assert.ok(d.w >= 9 && d.w <= 14, `${d.id} ${d.w}`); }
  assert.deepEqual(page.errors, []);
  await context.close();
});

test('reduced motion: dots still present, no transitions', async () => {
  const { context, page } = await openCity(browser, server.url, { ...DESKTOP, reducedMotion: 'reduce' });
  await frames(page, 2);
  const all = await dots(page);
  assert.ok(all.length >= 5 && all.every((d) => d.dot));
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.site-dot .sd-core')).transitionDuration), '0s');
  await context.close();
});

// A dot too close to the top for the label to fit above it gets the label below it, never on it.
test('desktop: a dot near the top edge gets its label below, not on top of it', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  const t = (await dots(page)).filter((d) => d.dot && d.cx > 60 && d.cx < 1380 && d.cy > 0).sort((a, b) => a.cy - b.cy)[0];
  assert.ok(t.top < 30, `a dot near the top at the resting camera (${t.id} at ${t.top})`);
  await page.mouse.move(t.cx, t.cy);
  await page.waitForTimeout(250);
  const l = await label(page), d = await dotOf(page, t.id);
  assert.ok(l.show, 'label shown on hover');
  assert.ok(l.top >= 0 && l.bottom <= 900, 'inside viewport');
  const dotBottom = d.y + (d.y - d.top);
  assert.ok(l.bottom <= d.top || l.top >= dotBottom, `label ${l.top}-${l.bottom} clear of dot ${d.top}-${dotBottom}`);
  await context.close();
});

// The hit circles are aria-hidden duplicates of the building links: pointer targets only. Focus on an
// aria-hidden element is announced as nothing, so they must never take it (Tab, click or script).
test('desktop: a dot\'s hit target takes no focus, from a click or from script, and is not a link', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  const t = (await dots(page)).find((d) => d.dot && d.inView && d.topIsDot);
  const tip = page.locator(`.site-tip[data-id="${t.id}"]`);
  assert.equal(await tip.evaluate((el) => { el.focus(); return document.activeElement === el; }), false, 'script focus');
  assert.equal(await tip.evaluate((el) => el.matches('a, [href], [tabindex]')), false, 'not a link and no tabindex');
  await page.mouse.click(t.cx, t.cy);
  await page.waitForTimeout(600);
  assert.ok(await page.locator('.city-drawer').isVisible(), 'the click still opens the drawer');
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest?.('.site-tip')), false, 'click focus');
  assert.deepEqual(page.errors, []);
  await context.close();
});

test('desktop: the pointer leaving the page from a site clears its hover, without an error', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  const t = (await dots(page)).find((d) => d.dot && d.inView);
  await page.mouse.move(t.cx, t.cy);
  await page.waitForTimeout(250);
  assert.ok((await label(page)).show);
  // what a browser sends when the pointer leaves the window: pointerout with no relatedTarget
  await page.locator(`.site-tip[data-id="${t.id}"] .site-hit`).dispatchEvent('pointerout', { bubbles: true, relatedTarget: null, pointerType: 'mouse' });
  await page.waitForTimeout(250);
  assert.deepEqual(page.errors, []);
  assert.equal((await label(page)).show, false);
  await context.close();
});
