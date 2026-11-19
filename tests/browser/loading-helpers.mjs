// Helpers for the loading-screen tests: open the page without waiting for the City to be ready,
// and hold a request until the test lets it go.
import { newPage } from './harness.mjs';

export const WIDE = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 };

/** A gate: `await gate.wait` in a route handler; `gate.open()` releases every waiter. It opens
 * itself after 10 s so a failing test cannot leave the page (and the run) hanging; `gate.expired`
 * then says so, and a test that asserts "while loading" must check it is still false. A held hero
 * image also holds the page's `load` event (it is preloaded and in the DOM), so such a test opens
 * the page with `{ waitUntil: 'commit' }`, never the default 'load'. */
export function gate() {
  let open; const wait = new Promise((r) => { open = r; });
  const g = { wait, open: () => open(), expired: false };
  setTimeout(() => { g.expired = true; open(); }, 10000).unref();
  return g;
}

/** new page with errors collected (harness newPage); routes(context) may install route handlers first */
export const openRaw = (browser, opts, routes) => newPage(browser, opts, { setup: routes });

/** the on-screen box of an element, in CSS px */
export const box = (page, sel) => page.locator(sel).evaluate((e) => {
  const r = e.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});

export const near = (a, b, tol = 2) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) <= tol);
