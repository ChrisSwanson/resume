// Measure the City view's compute cost (dev-only; needs Playwright). Prints JSON.
//   node scripts/perf.mjs [--throttle 4]
// idle: main-thread ms/s while the city animates; pan: canvas work per wheel-pan frame.
import { startServer, launch, openCity, DESKTOP, resetPerf, readPerf, wheelPan, mainThreadLoad } from '../tests/browser/harness.mjs';

const i = process.argv.indexOf('--throttle');
const throttle = i > -1 ? Number(process.argv[i + 1]) : 1;
const server = await startServer();
const browser = await launch();
try {
  const { context, page } = await openCity(browser, server.url, DESKTOP, { instrument: true });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await resetPerf(page);
  const idle = await mainThreadLoad(page, 4000);
  const idlePerf = await readPerf(page);
  await resetPerf(page);
  const N = 60;
  const pan = await mainThreadLoad(page, 0, () => wheelPan(page, N));
  const panPerf = await readPerf(page);
  const per = (o, n) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +(v / n).toFixed(2)]));
  console.log(JSON.stringify({
    throttle, viewport: '1440x900@2x',
    canvases: await page.evaluate(() => [...document.querySelectorAll('#view-3d canvas')].map((c) => `${c.width}x${c.height}`)),
    idle: { taskMsPerSec: Math.round(idle.taskMsPerSec), scriptMsPerSec: Math.round(idle.scriptMsPerSec), fps: +(idlePerf.frames / 4).toFixed(0), drawImagesPerFrame: +(idlePerf.drawImages / idlePerf.frames).toFixed(1) },
    pan: { taskMsPerSec: Math.round(pan.taskMsPerSec), perPanEvent: per(panPerf, N) },
  }, null, 2));
  await context.close();
} finally {
  await browser.close();
  server.stop();
}
