// The City view boots at both required viewports with no console errors, and the Text view renders.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openCity, DESKTOP, PHONE } from './harness.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

for (const [name, opts] of [['desktop 1440x900', DESKTOP], ['phone 390x844', PHONE]]) {
  test(`City view boots without errors (${name})`, async () => {
    const { context, page } = await openCity(browser, server.url, opts);
    assert.ok(await page.locator('#view-3d a.site').count() >= 5, 'sites are drawn');
    assert.deepEqual(page.errors, []);
    await context.close();
  });
}

test('Text view renders the resume', async () => {
  const context = await browser.newContext(DESKTOP);
  const page = await context.newPage();
  await page.goto(server.url + '?view=text');
  await page.waitForSelector('#doc-body h3');
  assert.ok(await page.locator('#doc-body h3').count() >= 8);
  await context.close();
});
