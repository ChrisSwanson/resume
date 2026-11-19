// The loading screen: a blurred stand-in, framed like the real image, in place from the first
// paint; the real image fades in over it once decoded; no flash of the Text view.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, DESKTOP, PHONE, frames } from './harness.mjs';
import { WIDE, gate, openRaw, box, near } from './loading-helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

const HERO = '**/assets/hero/{master,portrait}-*.{webp,jpg}';
const visible = (page, sel) => page.locator(sel).first().evaluate((e) => {
  const cs = getComputedStyle(e), r = e.getBoundingClientRect();
  return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0 && r.width > 0 && r.height > 0;
});

test('no flash of the Text view: while app.js is still loading, the placeholder shows and the text does not', async () => {
  const hold = gate();
  const { context, page } = await openRaw(browser, DESKTOP, (c) => c.route('**/src/app.js', async (r) => { await hold.wait; r.continue(); }));
  await page.goto(server.url, { waitUntil: 'commit' });
  await page.waitForSelector('.city-ph', { state: 'attached' });
  await frames(page, 2);
  assert.equal(await visible(page, '#view-text'), false, 'the static Text view is hidden for the City boot');
  assert.equal(await visible(page, '.city-ph-img'), true, 'the placeholder is painted');
  hold.open();
  await context.close();
});

test('without JavaScript the Text view still shows, and the placeholder does not', async () => {
  const { context, page } = await openRaw(browser, { ...DESKTOP, javaScriptEnabled: false });
  await page.goto(server.url);
  assert.equal(await visible(page, '#view-text'), true);
  assert.equal(await visible(page, '#view-3d'), false);
  await context.close();
});

for (const v of ['text', 'agent']) {
  test(`?view=${v} shows no placeholder and requests no hero image`, async () => {
    const { context, page } = await openRaw(browser, DESKTOP);
    const urls = [];
    page.on('request', (r) => urls.push(r.url()));
    await page.goto(`${server.url}?view=${v}`);
    await page.waitForLoadState('networkidle');
    assert.equal(await visible(page, '#view-3d'), false);
    assert.equal(await visible(page, '.city-ph'), false);
    assert.deepEqual(urls.filter((u) => /assets\/hero\//.test(u)), []);
    await context.close();
  });
}

test('the hero image request starts before scene.json has been delivered', async () => {
  const { context, page } = await openRaw(browser, DESKTOP, (c) => c.route('**/assets/hero/scene.json', async (r) => {
    await new Promise((res) => setTimeout(res, 700)); r.continue();
  }));
  const t = {};
  page.on('request', (r) => { if (/hero\/master-\d+\.webp/.test(r.url())) t.hero ??= Date.now(); });
  page.on('requestfinished', (r) => { if (/scene\.json/.test(r.url())) t.scene ??= Date.now(); });
  await page.goto(server.url);
  await page.waitForFunction(() => document.querySelector('#view-3d:not(.loading) a.site'), null, { timeout: 15000 });
  assert.ok(t.hero && t.scene, 'both were requested');
  assert.ok(t.hero < t.scene, `hero requested ${t.scene - t.hero} ms before scene.json finished`);
  await context.close();
});

test('no sprite atlas is requested before the hero image has arrived', async () => {
  const { context, page } = await openRaw(browser, DESKTOP, (c) => c.route(HERO, async (r) => {
    await new Promise((res) => setTimeout(res, 900)); r.continue();
  }));
  const t = { sprites: [] };
  page.on('request', (r) => { if (/sprites\/.*\.webp/.test(r.url())) t.sprites.push(Date.now()); });
  page.on('requestfinished', (r) => { if (/hero\/(master|portrait)-\d+\.webp/.test(r.url())) t.hero ??= Date.now(); });
  await page.goto(server.url);
  await page.waitForFunction(() => document.querySelector('canvas.sprites-air'), null, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  assert.ok(t.hero, 'the hero image finished');
  assert.ok(t.sprites.length > 0, 'the atlases load afterwards');
  assert.ok(Math.min(...t.sprites) >= t.hero, `first atlas request ${t.hero - Math.min(...t.sprites)} ms before the hero image finished`);
  await context.close();
});

for (const [name, opts] of [['1440x900', DESKTOP], ['1280x800', WIDE], ['phone 390x844', PHONE]]) {
  test(`the placeholder is framed exactly like the real image (${name})`, async () => {
    const hold = gate();
    const { context, page } = await openRaw(browser, opts, (c) => c.route(HERO, async (r) => { await hold.wait; r.continue(); }));
    await page.goto(server.url, { waitUntil: 'commit' });   // a held hero image holds 'load' too
    await page.waitForSelector('.city-world img', { state: 'attached' });
    await frames(page, 2);
    assert.equal(await page.locator('#view-3d.loading').count(), 1, 'still loading');
    const ph = await box(page, '.city-ph-img'), real = await box(page, '.city-world img');
    assert.ok(near(ph, real), `placeholder ${JSON.stringify(ph)} vs image ${JSON.stringify(real)}`);
    assert.equal(hold.expired, false, 'the hero image was still held for the checks above');
    hold.open();
    await context.close();
  });
}

test('while loading: a polite "Loading the city" pill; dots, sprites and tools are hidden; brand and view switch stay', async () => {
  const hold = gate();
  const { context, page } = await openRaw(browser, DESKTOP, (c) => c.route(HERO, async (r) => { await hold.wait; r.continue(); }));
  await page.goto(server.url, { waitUntil: 'commit' });
  await page.waitForSelector('#view-3d a.site', { state: 'attached' });
  await frames(page, 2);
  const pill = page.locator('.city-loading');
  assert.match(await pill.textContent(), /Loading the city/);
  assert.equal(await pill.getAttribute('aria-live'), 'polite');
  assert.equal(await visible(page, '.city-loading'), true);
  for (const sel of ['.site-dot', '.city-tools', '.city-hint', '.city-world']) {
    assert.equal(await visible(page, sel), false, `${sel} is hidden while loading`);
  }
  assert.equal(await visible(page, '.brand'), true, 'brand chip');
  assert.equal(await visible(page, '.view-switch'), true, 'view switch');
  assert.equal(hold.expired, false, 'the hero image was still held for the checks above');
  hold.open();
  await context.close();
});

test('once decoded the real image fades in over the placeholder, which is then removed', async () => {
  const hold = gate();
  const { context, page } = await openRaw(browser, DESKTOP, (c) => c.route(HERO, async (r) => { await hold.wait; r.continue(); }));
  await page.goto(server.url, { waitUntil: 'commit' });
  await page.waitForSelector('.city-world img', { state: 'attached' });
  await page.evaluate(() => {
    window.__op = [];
    const w = document.querySelector('.city-world');
    (function sample() { window.__op.push(+getComputedStyle(w).opacity); requestAnimationFrame(sample); })();
  });
  assert.equal(hold.expired, false, 'the hero image was still held for the checks above');
  hold.open();
  await page.waitForFunction(() => document.querySelector('#view-3d:not(.loading)'), null, { timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('.city-ph'), null, { timeout: 5000 });
  const op = await page.evaluate(() => window.__op);
  assert.equal(op.at(-1), 1);
  assert.ok(op.some((o) => o > 0.02 && o < 0.98), `an intermediate opacity was painted (${op.filter((o, i) => i % 8 === 0).map((o) => o.toFixed(2)).join(' ')})`);
  assert.deepEqual(page.errors, []);
  await context.close();
});

test('reduced motion: the real image replaces the placeholder at once, with no animation', async () => {
  const hold = gate();
  const { context, page } = await openRaw(browser, { ...DESKTOP, reducedMotion: 'reduce' }, (c) => c.route(HERO, async (r) => { await hold.wait; r.continue(); }));
  await page.goto(server.url, { waitUntil: 'commit' });
  await page.waitForSelector('.city-world img', { state: 'attached' });
  assert.deepEqual(await page.locator('.city-ph-img, .city-loading').evaluateAll((es) => es.flatMap((e) => e.getAnimations().map((a) => a.animationName))), [], 'no shimmer while loading');
  assert.equal(hold.expired, false, 'the hero image was still held for the checks above');
  hold.open();
  await page.waitForFunction(() => document.querySelector('#view-3d:not(.loading)'), null, { timeout: 15000 });
  await frames(page, 1);
  assert.equal(await page.locator('.city-ph').count(), 0);
  assert.equal(await page.locator('.city-world').evaluate((e) => e.getAnimations().length), 0);
  assert.equal(await page.locator('.city-world').evaluate((e) => getComputedStyle(e).opacity), '1');
  await context.close();
});

test('a hero image that fails to load falls back to the Text view', async () => {
  const { context, page } = await openRaw(browser, DESKTOP, (c) => c.route(HERO, (r) => r.abort()));
  await page.goto(server.url);
  await page.waitForFunction(() => document.body.dataset.view === 'text', null, { timeout: 15000 });
  assert.equal(await visible(page, '#view-text'), true);
  await context.close();
});

test('before app.js runs, the view switch already shows City as the pressed view', async () => {
  const hold = gate();
  const { context, page } = await openRaw(browser, DESKTOP, (c) => c.route('**/src/app.js', async (r) => { await hold.wait; r.continue(); }));
  await page.goto(server.url, { waitUntil: 'commit' });
  await page.waitForSelector('.view-switch', { state: 'attached' });
  await frames(page, 2);
  const state = await page.locator('.view-switch button').evaluateAll((bs) => bs.map((b) => [b.dataset.view, b.getAttribute('aria-pressed'), getComputedStyle(b).backgroundColor]));
  assert.equal(hold.expired, false, 'app.js was still held');
  const [city, ...rest] = state;
  assert.deepEqual([city[0], city[1]], ['3d', 'true'], `City is pressed: ${JSON.stringify(state)}`);
  for (const b of rest) assert.equal(b[1], 'false', `${b[0]} is not pressed`);
  assert.notEqual(city[2], rest[0][2], 'and looks pressed');
  hold.open();
  await context.close();
});

test('an orientation change while the hero loads: the city waits for the new frame\'s image', async () => {
  const portrait = gate(), master = gate();
  const { context, page } = await openRaw(browser, PHONE, (c) => c.route(HERO, async (r) => {
    await (/portrait-/.test(r.request().url()) ? portrait : master).wait; r.continue();
  }));
  await page.goto(server.url, { waitUntil: 'commit' });
  await page.waitForSelector('.city-world img[src*="portrait"]', { state: 'attached' });
  await page.setViewportSize({ width: 844, height: 390 });                 // turned to landscape: the master frame
  await page.waitForSelector('.city-world img[src*="master"]', { state: 'attached' });
  portrait.open();                                                          // the old frame's image arrives first
  await page.waitForTimeout(1500);
  assert.equal(master.expired, false);
  assert.equal(await page.locator('#view-3d.loading').count(), 1, 'still loading: the master image has not arrived');
  master.open();
  await page.waitForFunction(() => document.querySelector('#view-3d:not(.loading)'), null, { timeout: 15000 });
  assert.ok(await page.evaluate(() => { const i = document.querySelector('.city-world img'); return i.complete && i.naturalWidth > 0 && /master/.test(i.currentSrc); }));
  assert.deepEqual(page.errors, []);
  await context.close();
});
