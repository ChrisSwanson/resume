// Paint cadence for the sprite loop: a target rate (30 Hz) on a display that runs at any rate.
// A deadline moves on by exactly one period per paint, so the remainder is carried and a 60, 120
// or 144 Hz display averages the target with no drift. Pure: it only sees timestamps.

/**
 * @param {number} hz  target paints per second
 * @param {{tolerance?: number}} opts  ms a frame may arrive before its deadline and still paint
 *   (timestamp jitter; keep it well under half a frame at the fastest display)
 */
export function createPacer(hz = 30, { tolerance = 1.5 } = {}) {
  const period = 1000 / hz;
  let next = -Infinity;                  // the time of the next paint
  let last = -Infinity;                  // the last timestamp that painted
  return {
    /** Call once per animation frame with its timestamp (ms); true means paint this frame. */
    frame(now) {
      if (now <= last || now < next - tolerance) return false;
      // on time: keep the phase; more than a period late (a stall): start over from now
      next = next === -Infinity || now - next >= period ? now + period : next + period;
      last = now;
      return true;
    },
    /** A paint happened outside the pacer (the camera moved) at `now`: the next one is a period away. */
    painted(now) { next = now + period; last = Math.max(last, now); },
    reset() { next = last = -Infinity; },
  };
}
