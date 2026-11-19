// The head boot script and the placeholder CSS (src/hero/boot.js, written into index.html by
// scripts/build.mjs): the boot view comes from ?view=, the City view preloads the hero image
// the <picture> will choose, and the placeholder is framed from the same constants as layout().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { FRAMES, frameScale } from '../../src/hero/frames.js';
import { bootScript, placeholderCss } from '../../src/hero/boot.js';

const scene = JSON.parse(readFileSync(new URL('../../assets/hero/scene.json', import.meta.url), 'utf8'));

/** run the boot script against a stub page; returns the root element and the appended <link>s */
function boot({ search = '', portrait = false, w = 1440, h = 900 } = {}) {
  const links = [];
  const root = { dataset: {}, clientWidth: w };
  const doc = {
    documentElement: root,
    head: { appendChild: (l) => links.push(l) },
    createElement: () => ({ setAttribute(k, v) { this[k] = v; } }),
  };
  vm.runInNewContext(bootScript(), {
    document: doc, location: { search }, innerWidth: w, innerHeight: h,
    URLSearchParams, Math, matchMedia: (q) => ({ matches: portrait && /max-aspect-ratio/.test(q) }),
  });
  return { root, links };
}

test('the frame constants in frames.js are the render\'s frame sizes', () => {
  for (const [name, f] of Object.entries(FRAMES)) assert.deepEqual(f.res, scene.frames[name].res, name);
});

test('frameScale is the City view\'s scale: covers the resting view and never less than the image fills', () => {
  assert.equal(frameScale(FRAMES.master, 1440, 900), 1);                       // 1440/1440 over 900/960
  assert.equal(frameScale(FRAMES.master, 2880, 900), 2);
  assert.equal(frameScale(FRAMES.portrait, 390, 844), Math.max(390 / 780, 844 / 1688) * 1.08);
});

test('?view=text and ?view=agent boot without the City preloads', () => {
  for (const v of ['text', 'agent']) {
    const { root, links } = boot({ search: `?view=${v}` });
    assert.equal(root.dataset.boot, v);
    assert.deepEqual(links, [], `${v} requests nothing`);
  }
});

test('no ?view= (and an unknown one) boots the City view', () => {
  assert.equal(boot().root.dataset.boot, '3d');
  assert.equal(boot({ search: '?view=nonsense' }).root.dataset.boot, '3d');
});

test('the City boot preloads the hero image the <picture> will choose, with its sizes', () => {
  for (const [name, opts] of [['master', { w: 1440, h: 900 }], ['portrait', { w: 390, h: 844, portrait: true }]]) {
    const { links } = boot(opts);
    const hero = links.find((l) => l.as === 'image');
    assert.ok(hero, `${name}: an image preload`);
    const f = FRAMES[name];
    assert.equal(hero.rel, 'preload');
    assert.equal(hero.imagesrcset, f.images.map(([n, w]) => `assets/hero/${n}.webp ${w}w`).join(', '));
    assert.equal(hero.imagesizes, `${Math.round(f.res[0] * frameScale(f, opts.w, opts.h))}px`);
    assert.equal(hero.type, 'image/webp');
    assert.equal(hero.fetchpriority, 'high');
  }
});

test('the City boot also preloads the two data files the city needs before it can lay out', () => {
  const hrefs = boot().links.filter((l) => l.as === 'fetch').map((l) => l.href);
  assert.deepEqual(hrefs, ['assets/hero/scene.json', 'assets/hero/regions.json']);
});

test('placeholderCss inlines both images and the frame constants for each orientation', () => {
  const css = placeholderCss({ master: 'data:image/webp;base64,AAAA', portrait: 'data:image/webp;base64,BBBB' });
  assert.match(css, /AAAA/);
  assert.match(css, /BBBB/);
  assert.match(css, /--ph-w: 2400/);
  assert.match(css, /--ph-w: 780/);
  assert.match(css, /@media \(max-aspect-ratio: 3\/4\)/);
});
