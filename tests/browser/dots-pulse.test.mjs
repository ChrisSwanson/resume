// The dot pulse (compositor-only), its stagger, reduced motion, hidden-view behaviour, and that the dot
// sits exactly at the red marker's tip.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openCity, frames, DESKTOP, PHONE } from './harness.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

const ringStyles = (page) => page.evaluate(() => [...document.querySelectorAll('.city-dots .site-dot .sd-ring')].map((r) => {
  const cs = getComputedStyle(r);
  return { name: cs.animationName, delay: cs.animationDelay, dur: cs.animationDuration, iter: cs.animationIterationCount, ease: cs.animationTimingFunction };
}));
const running = (page) => page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('sd-ring') && a.playState === 'running').length);

test('pulse: every ring runs a 2.4s infinite decelerating animation, with a different delay per site', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  const rings = await ringStyles(page);
  assert.ok(rings.length >= 5);
  for (const r of rings) {
    assert.notEqual(r.name, 'none');
    assert.equal(r.dur, '2.4s');
    assert.equal(r.iter, 'infinite');
    assert.equal(r.ease, 'cubic-bezier(0.2, 0.6, 0.4, 1)', 'decelerating curve that keeps the ring visible as it grows');
  }
  assert.equal(new Set(rings.map((r) => r.delay)).size, rings.length, `delays differ: ${rings.map((r) => r.delay)}`);
  await context.close();
});

test('pulse: animates only transform and opacity, and is genuinely running', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  const props = await page.evaluate(() => {
    const out = new Set();
    for (const a of document.getAnimations()) {
      if (!a.effect?.target?.classList?.contains('sd-ring')) continue;
      for (const kf of a.effect.getKeyframes()) for (const k of Object.keys(kf)) if (!['offset', 'computedOffset', 'easing', 'composite'].includes(k)) out.add(k);
    }
    return [...out].sort();
  });
  assert.deepEqual(props, ['opacity', 'transform']);
  assert.ok(await running(page) >= 5, 'rings running');
  await context.close();
});

test('pulse: no SVG animation on the dots; the core is static', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  assert.equal(await page.locator('#view-3d .city-regions animate, #view-3d .city-regions animateTransform').count(), 0);
  assert.equal(await page.locator('.city-dots .sd-core').first().evaluate((el) => getComputedStyle(el).animationName), 'none');
  await context.close();
});

test('reduced motion: no pulse, the glow stays', async () => {
  const { context, page } = await openCity(browser, server.url, { ...DESKTOP, reducedMotion: 'reduce' });
  await frames(page, 2);
  const rings = await ringStyles(page);
  assert.ok(rings.length >= 5);
  for (const r of rings) assert.equal(r.name, 'none');
  assert.equal(await running(page), 0);
  assert.notEqual(await page.locator('.city-dots .sd-core').first().evaluate((el) => getComputedStyle(el).boxShadow), 'none');
  await context.close();
});

test('pulse: not running while the City view is hidden', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  assert.ok(await running(page) >= 5);
  await page.evaluate(() => { document.querySelector('#view-3d').hidden = true; });
  await frames(page, 2);
  assert.equal(await running(page), 0);
  await page.evaluate(() => { document.querySelector('#view-3d').hidden = false; });
  await frames(page, 2);
  assert.ok(await running(page) >= 5);
  await context.close();
});

for (const [name, opts] of [['desktop', DESKTOP], ['phone', PHONE]]) {
  test(`${name}: each site's dot centre equals the red marker's tip when that site is selected (within 1px)`, async () => {
    const { context, page } = await openCity(browser, server.url, opts);
    await page.waitForFunction(() => document.querySelector('.city-marker')?.classList.contains('sprite'), null, { timeout: 8000 }).catch(() => {});
    const ids = await page.evaluate(() => [...document.querySelectorAll('#view-3d a.site')].map((a) => a.dataset.id));
    assert.ok(ids.length >= 5);
    for (const id of ids) {
      await page.evaluate((id) => document.querySelector(`#view-3d a.site[data-id="${id}"]`).focus(), id);
      await page.waitForTimeout(250);
      const m = await page.evaluate((id) => {
        const dot = document.querySelector(`.city-dots .site-dot[data-id="${id}"]`), marker = document.querySelector('.city-marker');
        const wasHidden = dot.classList.contains('is-hidden');
        dot.classList.remove('is-hidden');
        const c = dot.querySelector('.sd-core').getBoundingClientRect(), r = marker.getBoundingClientRect();
        const sprite = marker.classList.contains('sprite'), d = marker.dataset;
        const fx = sprite ? +d.ax / +d.w : 0.5, fy = sprite ? +d.ay / +d.h : 1;
        dot.classList.toggle('is-hidden', wasHidden);
        return { wasHidden, markerHidden: marker.hidden, dx: c.left + c.width / 2, dy: c.top + c.height / 2, tx: r.left + fx * r.width, ty: r.top + fy * r.height };
      }, id);
      assert.equal(m.wasHidden, true, `${id}: dot hidden while selected`);
      assert.equal(m.markerHidden, false);
      assert.ok(Math.abs(m.dx - m.tx) <= 1 && Math.abs(m.dy - m.ty) <= 1, `${id}: dot (${m.dx},${m.dy}) vs tip (${m.tx},${m.ty})`);
    }
    assert.deepEqual(page.errors, []);
    await context.close();
  });
}

test('label: a hovered site that is also selected gets its pill below the tip, clear of the marker', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  await page.keyboard.press('1');
  await page.waitForTimeout(700);
  const id = await page.evaluate(() => document.querySelector('.city-dots .site-dot.is-hidden')?.dataset.id);
  assert.ok(id, 'a site is selected');
  const hit = await page.locator(`#view-3d .site-tip[data-id="${id}"] .site-hit`).boundingBox();
  await page.mouse.move(hit.x + hit.width / 2, hit.y + hit.height / 2);
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const el = document.querySelector('.site-label'), l = el.getBoundingClientRect(), m = document.querySelector('.city-marker').getBoundingClientRect();
    return { show: el.classList.contains('show'), l: [l.left, l.top, l.right, l.bottom], m: [m.left, m.top, m.right, m.bottom] };
  });
  assert.ok(r.show, 'label shown');
  const overlap = r.l[0] < r.m[2] && r.l[2] > r.m[0] && r.l[1] < r.m[3] && r.l[3] > r.m[1];
  assert.equal(overlap, false, `label ${r.l} overlaps marker ${r.m}`);
  await context.close();
});
