// The two frames of the rendered city, shared by the City view (city.js), the head boot script
// and the loading placeholder (boot.js, written into index.html by scripts/build.mjs).
// res is the 1x frame in image px (tests check it against assets/hero/scene.json).
export const BASE = 'assets/hero/';
export const PORTRAIT_QUERY = '(max-aspect-ratio: 3/4)';
export const FRAMES = {
  // the resting view of the master is its centre 1440x960; the portrait is shown whole (plus a
  // little overscan so it can still pan)
  // images: the WebPs by width (1x and 2x of the frame), then the JPEG fallback (1x only)
  master: { res: [2400, 1600], view: [1440, 960], over: 1, images: [['master-2400', 2400], ['master-4800', 4800]], jpeg: 'master-2400' },
  portrait: { res: [780, 1688], view: [780, 1688], over: 1.08, images: [['portrait-780', 780], ['portrait-1560', 1560]], jpeg: 'portrait-780' },
};

/** CSS px per image px for a viewport of vw x vh: the resting view covers it, and so does the image */
export function frameScale(frame, vw, vh) {
  const s = Math.max(vw / frame.view[0], vh / frame.view[1]) * frame.over;
  return Math.max(s, vw / frame.res[0], vh / frame.res[1]);
}

/** the frame's WebPs as a srcset: the <picture> source, and the boot preload's imagesrcset (they must match) */
export const srcsetOf = (frame) => frame.images.map(([n, w]) => `${BASE}${n}.webp ${w}w`).join(', ');
