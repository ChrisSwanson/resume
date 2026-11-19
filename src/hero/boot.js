// What index.html carries so the City view is framed before any module loads (scripts/build.mjs
// writes both into marked blocks):
//   bootScript()      a tiny inline <head> script: the boot view from ?view= goes on <html> as
//                     data-boot (CSS hides the static Text view for the City and Agent boots,
//                     while without JavaScript it stays), and the City boot starts the hero
//                     image (and the two data files) now, not after app.js and scene.json.
//   placeholderCss()  the blurred placeholder's image and frame constants as CSS custom
//                     properties; styles.css frames it exactly as layout() frames the image.
import { BASE, FRAMES, PORTRAIT_QUERY, frameScale, srcsetOf } from './frames.js';

const geom = (f) => ({ res: f.res, view: f.view, over: f.over, srcset: srcsetOf(f) });

export function bootScript() {
  const G = { master: geom(FRAMES.master), portrait: geom(FRAMES.portrait) };
  return `(function () {
  var d = document.documentElement;
  var v = new URLSearchParams(location.search).get('view');
  v = v === 'text' || v === 'agent' ? v : '3d';
  d.dataset.boot = v;
  if (v !== '3d') return;
  var G = ${JSON.stringify(G)};
  var g = matchMedia(${JSON.stringify(PORTRAIT_QUERY)}).matches ? G.portrait : G.master;
  var vw = d.clientWidth || innerWidth, vh = innerHeight;
  var s = (${frameScale})(g, vw, vh);       // frames.js, inlined: the scale layout() will use
  function link(a) {
    var l = document.createElement('link');
    l.setAttribute('rel', 'preload');
    for (var k in a) l.setAttribute(k, a[k]);
    document.head.appendChild(l);
  }
  link({ as: 'image', type: 'image/webp', imagesrcset: g.srcset, imagesizes: Math.round(g.res[0] * s) + 'px', fetchpriority: 'high' });
  link({ as: 'fetch', crossorigin: '', href: ${JSON.stringify(BASE + 'scene.json')} });
  link({ as: 'fetch', crossorigin: '', href: ${JSON.stringify(BASE + 'regions.json')} });
})();`;
}

const vars = (f, img) => `--ph-w: ${f.res[0]}; --ph-h: ${f.res[1]}; --ph-vx: ${f.view[0]}; --ph-vy: ${f.view[1]}; --ph-over: ${f.over}; --ph-img: url(${img});`;

/** uris: { master, portrait } data URIs */
export function placeholderCss(uris) {
  return `  .city-ph { ${vars(FRAMES.master, uris.master)} }
  @media ${PORTRAIT_QUERY} { .city-ph { ${vars(FRAMES.portrait, uris.portrait)} } }`;
}
