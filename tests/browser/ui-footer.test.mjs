// The trademark notice lives in the Text view, not as a City view overlay.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openCity, DESKTOP, PHONE } from './harness.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

for (const [name, opts] of [['desktop', DESKTOP], ['phone', PHONE]]) {
  test(`City view has no footer overlay (${name})`, async () => {
    const { context, page } = await openCity(browser, server.url, opts);
    assert.equal(await page.locator('.city-foot').count(), 0);
    assert.equal(await page.locator('#view-3d').getByText('Logos and trademarks').count(), 0);
    await context.close();
  });
}

test('Text view still shows the trademark notice', async () => {
  const context = await browser.newContext(DESKTOP);
  const page = await context.newPage();
  await page.goto(server.url + '?view=text');
  await page.waitForSelector('#doc-body h3');
  assert.equal(await page.locator('.doc-legal:visible').count(), 1);
  assert.match(await page.locator('.doc-legal').innerText(), /Logos and trademarks belong/);
  await context.close();
});
