// Where a site's landmark dot goes. Pure geometry, no DOM, deterministic.
// A site is { bbox:[x0,y0,x1,y1], polys:[[x,y,x,y,...],...] } (regions.json); the optional sign is [x0,y0,x1,y1].
// The dot must sit inside the silhouette, at least `margin` px from every polygon edge, off the sign,
// and as close to the top of the building (and, with a sign, to the sign's column) as that allows.

const SIGN_PAD = 4;       // px kept clear around the sign so the dot never touches the logo
const STEP = 2;           // candidate grid spacing in image px

/** Even-odd point-in-polygon over a flat [x,y,...] ring. */
function inRing([px, py], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when the point is inside any polygon. */
export const pointInPolys = (pt, polys) => polys.some((r) => inRing(pt, r));

/** Distance from the point to the nearest polygon edge (all polygons). */
export function edgeClearance([px, py], polys) {
  let best = Infinity;
  for (const r of polys) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const ax = r[j], ay = r[j + 1], dx = r[i] - ax, dy = r[i + 1] - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
    }
  }
  return best;
}

/**
 * Image-px point [x, y] for a site's dot, or null when no point has `margin` clearance.
 * Cost = distance below the top of the silhouette + half the horizontal offset from the sign's
 * column (the bbox centre when there is no sign); the lowest-cost valid grid point wins, ties by scan order.
 */
export function landmarkPoint(site, sign = null, margin = 10) {
  const [x0, y0, x1, y1] = site.bbox;
  const cx = sign ? (sign[0] + sign[2]) / 2 : (x0 + x1) / 2;
  const [sx0, sy0, sx1, sy1] = sign ? [sign[0] - SIGN_PAD, sign[1] - SIGN_PAD, sign[2] + SIGN_PAD, sign[3] + SIGN_PAD] : [1, 1, 0, 0];
  let best = null, bestCost = Infinity;
  for (let y = y0 + margin; y <= y1 - margin; y += STEP) {
    if (y - y0 >= bestCost) break;                              // cost only grows with y
    for (let x = x0 + margin; x <= x1 - margin; x += STEP) {
      const cost = (y - y0) + 0.5 * Math.abs(x - cx);
      if (cost >= bestCost) continue;
      if (x >= sx0 && x <= sx1 && y >= sy0 && y <= sy1) continue;
      const pt = [x, y];
      if (!pointInPolys(pt, site.polys) || edgeClearance(pt, site.polys) < margin) continue;
      best = pt; bestCost = cost;
    }
  }
  return best;
}
