// Turns the road pass (render/hero.py, road_pass) into the City view's car masks: one alpha PNG
// for street traffic (red in the pass) and one for freeway traffic (green). The page uses them as
// CSS mask-images on its car layers, so a car is drawn only where its road is visible and passes
// behind buildings, trees and the freeway deck. Each mask is grown upward by `lift` pixels, about a
// bus's height on screen, so vehicles are not clipped flat at the far kerb. With the depth pass
// (hero.py --pass depth) the growth only covers pixels at least as far away as a vehicle roof on
// that road (`roofM` metres nearer the camera than the road), so a sprite never shows over a tree,
// person or anything else standing in front of it.
import { writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { readPng } from './hero-trace.mjs';

function png(width, height, alpha) {
  // 8-bit grey + alpha (colour type 4), grey 0; filter 0 on every row
  const raw = Buffer.alloc(height * (width * 2 + 1));
  for (let y = 0; y < height; y++) {
    const o = y * (width * 2 + 1);
    for (let x = 0; x < width; x++) raw[o + 2 + x * 2] = alpha[y * width + x];
  }
  const chunk = (kind, body) => {
    const b = Buffer.alloc(12 + body.length);
    b.writeUInt32BE(body.length, 0);
    b.write(kind, 4, 'latin1');
    body.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, 8 + body.length)), 8 + body.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 4;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Writes `${outBase}-street.png` and `${outBase}-freeway.png`; returns their byte sizes. */
export function roadMasks(passPng, outBase, lift, depthPng = null, roofM = 2.4) {
  const img = readPng(passPng);
  const { width: w, height: h, channels: c, data } = img;
  let depth = null;
  if (depthPng) {
    const dp = readPng(depthPng);
    depth = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) depth[i] = (dp.data[i * dp.channels] * 256 + dp.data[i * dp.channels + 1]) / 4;
  }
  let blocked = 0;
  const sizes = {};
  for (const [name, ch] of [['street', 0], ['freeway', 1]]) {
    const a = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const p = i * c;
      if (data[p + ch] > 127 && data[p + (1 - ch)] < 128 && data[p + 2] < 128) a[i] = 255;
    }
    for (let y = 0; y < h; y++) {               // grow upward: a pixel is on if one below it within `lift` is
      for (let x = 0; x < w; x++) {
        if (a[y * w + x]) continue;
        for (let k = 1; k <= lift && y + k < h; k++) {
          if (a[(y + k) * w + x] === 255) {
            if (depth && depth[y * w + x] < depth[(y + k) * w + x] - roofM) { blocked++; break; }   // in front
            a[y * w + x] = 254; break;
          }
        }
      }
    }
    const buf = png(w, h, a.map((v) => (v ? 255 : 0)));
    writeFileSync(`${outBase}-${name}.png`, buf);
    sizes[name] = buf.length;
  }
  sizes.blocked = blocked;
  return sizes;
}
