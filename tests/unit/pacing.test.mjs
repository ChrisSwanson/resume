import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPacer } from '../../src/hero/pacing.js';

/** rAF timestamps for `seconds` at `hz`, each shifted by jitter(i) ms; returns paint times */
function run(pacer, hz, seconds, jitter = () => 0, start = 1000) {
  const out = [];
  for (let i = 0, n = Math.round(hz * seconds); i < n; i++) {
    const t = start + (i * 1000) / hz + jitter(i);
    if (pacer.frame(t)) out.push(t);
  }
  return out;
}
const gaps = (ts) => ts.slice(1).map((t, i) => t - ts[i]);

for (const hz of [30, 50, 60, 75, 90, 120, 144, 165, 240]) {
  test(`${hz} Hz display: about 30 paints per second, evenly spaced, no drift`, () => {
    const p = run(createPacer(30), hz, 20);
    assert.ok(Math.abs(p.length / 20 - 30) <= 0.5, `${p.length / 20} paints/s`);
    // a late paint is made up for by the next, so a gap is within one frame of the period
    const frame = 1000 / hz, period = 1000 / 30;
    for (const g of gaps(p)) assert.ok(g >= period - frame - 0.01 && g <= period + frame + 0.01, `gap ${g}`);
    // the average gap over the last ten seconds equals the first ten (the remainder is carried)
    const mid = p.findIndex((t) => t >= 1000 + 10000);
    const a = (p[mid] - p[0]) / mid, b = (p.at(-1) - p[mid]) / (p.length - 1 - mid);
    assert.ok(Math.abs(a - b) < 0.5, `${a} vs ${b}`);
  });
}

test('a 60 Hz display paints every second frame', () => {
  const p = run(createPacer(30), 60, 2);
  assert.ok(gaps(p).every((g) => Math.abs(g - 100 / 3) < 0.5), gaps(p).join(' '));
});

test('timestamp jitter (+-2 ms) still gives 30 paints per second and never paints in consecutive frames at 60 Hz', () => {
  let s = 1;
  const jitter = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 4;
  const pacer = createPacer(30);
  const times = [];
  let prevPainted = false, consecutive = 0;
  for (let i = 0; i < 1200; i++) {
    const t = 1000 + (i * 1000) / 60 + jitter();
    const paint = pacer.frame(t);
    if (paint && prevPainted) consecutive++;
    prevPainted = paint;
    if (paint) times.push(t);
  }
  assert.equal(consecutive, 0);
  assert.ok(Math.abs(times.length / 20 - 30) <= 0.6, `${times.length / 20} paints/s`);
});

test('the first frame paints', () => {
  assert.equal(createPacer(30).frame(123456), true);
});

test('a stall resumes at once and resynchronises instead of bursting to catch up', () => {
  const pacer = createPacer(30);
  const before = run(pacer, 60, 1);
  const resume = 1000 + 1000 + 5000;                          // five seconds with no frames
  const after = [];
  for (let i = 0; i < 60; i++) { const t = resume + (i * 1000) / 60; if (pacer.frame(t)) after.push(t); }
  assert.ok(before.length > 0);
  assert.equal(after[0], resume, 'paints on the first frame back');
  assert.ok(gaps(after).every((g) => g > 30), `no burst: ${gaps(after).join(' ')}`);
  assert.ok(Math.abs(after.length - 30) <= 1);
});

test('never paints twice at the same timestamp, or at a timestamp that goes backwards', () => {
  const pacer = createPacer(30);
  assert.equal(pacer.frame(1000), true);
  assert.equal(pacer.frame(1000), false);
  assert.equal(pacer.frame(990), false);
  assert.equal(pacer.frame(1000.5), false);
});

test('a paint made outside the pacer (the camera) consumes the deadline', () => {
  const pacer = createPacer(30);
  assert.equal(pacer.frame(1000), true);
  pacer.painted(1030);                                        // setView painted just before the next deadline
  assert.equal(pacer.frame(1033.4), false, 'the idle paint is not due again yet');
  assert.equal(pacer.frame(1050), false);
  assert.equal(pacer.frame(1064), true, 'a full period after the camera paint');
});

test('after reset the next frame paints', () => {
  const pacer = createPacer(30);
  pacer.frame(1000);
  pacer.reset();
  assert.equal(pacer.frame(1001), true);
});

test('other targets work: 15 Hz', () => {
  const p = run(createPacer(15), 60, 10);
  assert.ok(Math.abs(p.length / 10 - 15) <= 0.5);
});
