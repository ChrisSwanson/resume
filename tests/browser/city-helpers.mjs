// Helpers shared by the City camera browser tests (not a test file itself).

/** Count every write to the world's inline transform, and tally them per animation frame.
 * Returns nothing; read with worldWrites(page). Install after the City view has booted. */
export function watchWorldWrites(page) {
  return page.evaluate(() => {
    const world = document.querySelector('.city-world');
    const W = (window.__world = { writes: 0, frame: 0, perFrame: new Map() });
    // style props are not accessors in Chromium, so intercept at the element: city.js looks up
    // world.style on every write, and gets a proxy that counts transform assignments
    const style = world.style;
    const proxy = new Proxy(style, {
      set(t, k, v) {
        if (k === 'transform') { W.writes++; W.perFrame.set(W.frame, (W.perFrame.get(W.frame) ?? 0) + 1); }
        t[k] = v; return true;
      },
      get(t, k) { const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; },
    });
    Object.defineProperty(world, 'style', { configurable: true, get: () => proxy });
    const tick = () => { W.frame++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}
export const worldWrites = (page) => page.evaluate(() => ({ writes: window.__world.writes, maxPerFrame: Math.max(0, ...window.__world.perFrame.values()) }));
export const resetWorldWrites = (page) => page.evaluate(() => { window.__world.writes = 0; window.__world.perFrame.clear(); });
export const worldTransform = (page) => page.evaluate(() => document.querySelector('.city-world').style.transform);
