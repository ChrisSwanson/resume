import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { landmarkPoint, pointInPolys, edgeClearance } from '../../src/hero/landmarks.js';

const rect = (x0, y0, x1, y1) => [x0, y0, x1, y0, x1, y1, x0, y1];
const site = (polys) => {
  const xs = polys.flatMap((p) => p.filter((_, i) => i % 2 === 0)), ys = polys.flatMap((p) => p.filter((_, i) => i % 2 === 1));
  return { bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], polys };
};
const inBox = ([x, y], [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const ok = (s, pt, margin, sign) => {
  assert.ok(pt && pt.length === 2, 'a point');
  assert.ok(pointInPolys(pt, s.polys), `inside: ${pt}`);
  assert.ok(edgeClearance(pt, s.polys) >= margin - 1e-9, `clearance ${edgeClearance(pt, s.polys)} >= ${margin}`);
  if (sign) assert.ok(!inBox(pt, sign), 'not on the sign');
};

test('convex: lands inside, near the top, clear of the edge', () => {
  const s = site([rect(0, 0, 100, 200)]);
  const pt = landmarkPoint(s, null, 10);
  ok(s, pt, 10);
  assert.ok(pt[1] < 50, `near the top: ${pt}`);
  assert.ok(Math.abs(pt[0] - 50) <= 10, 'roughly centred');
});

test('concave L shape: the bbox top-centre is outside, the result is inside', () => {
  const L = [0, 0, 40, 0, 40, 160, 120, 160, 120, 200, 0, 200];     // tall left bar, foot to the right at the bottom
  const s = site([L]);
  assert.ok(!pointInPolys([60, 0], s.polys), 'precondition: bbox top-centre is outside');
  ok(s, landmarkPoint(s, null, 8), 8);
});

test('multi-polygon: picks a point inside one of the parts', () => {
  const s = site([rect(0, 100, 60, 200), rect(100, 0, 160, 200)]);
  ok(s, landmarkPoint(s, null, 10), 10);
});

test('sign box: the dot stays off it, near it', () => {
  const s = site([rect(0, 0, 100, 200)]);
  const sign = [30, 20, 70, 50];
  const pt = landmarkPoint(s, sign, 10);
  ok(s, pt, 10, sign);
  assert.ok(Math.hypot(pt[0] - 50, pt[1] - 35) < 80, `near the sign: ${pt}`);
});

test('sign box that fills the top: the dot goes beside or below it', () => {
  const s = site([rect(0, 0, 100, 200)]);
  const sign = [0, 0, 100, 60];
  ok(s, landmarkPoint(s, sign, 10), 10, sign);
});

test('deterministic', () => {
  const s = site([rect(0, 0, 100, 200)]);
  assert.deepEqual(landmarkPoint(s, [30, 20, 70, 50], 10), landmarkPoint(s, [30, 20, 70, 50], 10));
});

test('real regions: every site in both frames', () => {
  const regions = JSON.parse(readFileSync(new URL('../../assets/hero/regions.json', import.meta.url)));
  const scene = JSON.parse(readFileSync(new URL('../../assets/hero/scene.json', import.meta.url)));
  const margin = 10;
  let n = 0;
  for (const frame of ['master', 'portrait']) {
    for (const [id, s] of Object.entries(regions[frame].sites)) {
      const sign = scene.signBoxes?.[frame]?.[id];
      const pt = landmarkPoint(s, sign, margin);
      assert.ok(pt, `${frame}/${id}: a point`);
      assert.ok(pointInPolys(pt, s.polys), `${frame}/${id}: inside ${pt}`);
      const c = edgeClearance(pt, s.polys);
      assert.ok(c >= margin, `${frame}/${id}: clearance ${c.toFixed(1)} >= ${margin}`);
      if (sign) assert.ok(!inBox(pt, sign), `${frame}/${id}: off the sign`);
      n++;
    }
  }
  assert.equal(n, 18);
});
