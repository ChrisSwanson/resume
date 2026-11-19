// The pulse must cost (almost) nothing on the main thread: it animates transform and opacity only, so the
// compositor runs it. Compare idle main-thread load with the pulse running against the same page with the
// pulse switched off by an injected stylesheet.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openCity, frames, mainThreadLoad, DESKTOP } from './harness.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

// Idle load is ~190 ms/s with run-to-run noise of ~10 ms/s (the sprites draw every frame). A pulse that
// touched layout or paint each frame would add tens of ms/s (60 fps x ~10 rings); 25 ms/s (~13%) is above
// the noise and well below that. The best of three samples per arm drops one-off scheduler spikes.
const BUDGET_MS_PER_SEC = 25;

test('idle main-thread load with the pulse running is within budget of the same page with animation: none', async () => {
  const { context, page } = await openCity(browser, server.url, DESKTOP);
  assert.ok((await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('sd-ring')).length)) >= 5, 'pulse is running');
  const off = await page.addStyleTag({ content: '.sd-ring { animation: none !important; }' });
  const setOff = (v) => off.evaluate((el, v) => { el.disabled = v; }, v);
  const sample = async () => { await frames(page, 5); return (await mainThreadLoad(page, 2500)).taskMsPerSec; };
  const on = [], none = [];
  for (let i = 0; i < 3; i++) {
    await setOff(false); none.push(await sample());
    await setOff(true); on.push(await sample());
  }
  const a = Math.min(...on), b = Math.min(...none);
  console.log(`pulse on ${on.map(Math.round)} ms/s, off ${none.map(Math.round)} ms/s`);
  assert.ok(a <= b + BUDGET_MS_PER_SEC, `pulse on ${a.toFixed(1)} vs off ${b.toFixed(1)} ms/s (budget +${BUDGET_MS_PER_SEC})`);
  await context.close();
});
