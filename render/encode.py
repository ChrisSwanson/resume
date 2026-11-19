"""Encode a rendered (lossless) PNG into the web images, once each: WebP at some widths, a JPEG
fallback at others.

    blender -b --factory-startup -P render/encode.py -- --in render/out/master.png \
        --out assets/hero/master --webp-widths 4800,2400 --jpeg-widths 2400 [--webp 88] [--jpeg 84]

writes assets/hero/master-4800.webp, master-2400.webp and master-2400.jpg and prints each size.
Also, with `--placeholder-out assets/hero/placeholder-master.webp [--placeholder-width 48] [--placeholder-q 55]`,
a tiny pre-blurred WebP of the same frame (index.html inlines it as a data URI so the city is
framed before the real image arrives). With no --webp-widths/--jpeg-widths that is all it writes,
and the input may be any image Blender reads, e.g. the shipped assets/hero/master-2400.webp, so
the placeholders can be remade without a render (`npm run hero -- --placeholders`). The downscale
halves repeatedly (a box average): one bilinear step from 2400 px to 48 px would alias, not blur.
Every file is encoded straight from the PNG (downscaled first where needed), never re-encoded.
Blender is the encoder because it is already required for the renders (no PIL or cwebp here).
The PNG is already display-referred, so the Standard view transform passes it through unchanged.
"""
import os
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = {argv[i][2:]: argv[i + 1] for i in range(0, len(argv) - 1, 2) if argv[i].startswith('--')}
src, out = opt['in'], opt.get('out', '')
webp_widths = [int(w) for w in opt.get('webp-widths', '0').split(',') if w.strip()]
jpeg_widths = [int(w) for w in opt.get('jpeg-widths', '0').split(',') if w.strip() and w != 'none']
q_webp, q_jpeg = int(opt.get('webp', 88)), int(opt.get('jpeg', 84))

scene = bpy.context.scene
vs = scene.view_settings
vs.view_transform, vs.look, vs.exposure, vs.gamma = 'Standard', 'None', 0.0, 1.0
s = scene.render.image_settings
os.makedirs(os.path.dirname(os.path.abspath(out or opt['placeholder-out'])), exist_ok=True)

base = bpy.data.images.load(os.path.abspath(src))
W, H = base.size
if 'placeholder-out' in opt:
    tw = int(opt.get('placeholder-width', 48))
    th = max(1, round(H * tw / W))
    ph = base.copy()
    cw, ch = W, H
    while cw > tw * 2:
        cw, ch = max(tw, cw // 2), max(th, ch // 2)
        ph.scale(cw, ch)
    ph.scale(tw, th)
    s.file_format, s.color_mode, s.quality = 'WEBP', 'RGB', int(opt.get('placeholder-q', 55))
    ph_path = os.path.abspath(opt['placeholder-out'])
    ph.save_render(ph_path, scene=scene)
    print(f'[encode] {opt["placeholder-out"]} {tw}x{th} {os.path.getsize(ph_path)} bytes', flush=True)
    bpy.data.images.remove(ph)
    if 'webp-widths' not in opt and 'jpeg-widths' not in opt:
        sys.exit(0)
for w in sorted({w or W for w in webp_widths + jpeg_widths}, reverse=True):
    img = base.copy()
    if w != W:
        img.scale(w, round(H * w / W))
    for fmt, ext, q, ws in (('WEBP', 'webp', q_webp, webp_widths), ('JPEG', 'jpg', q_jpeg, jpeg_widths)):
        if w not in [x or W for x in ws]:
            continue
        s.file_format, s.color_mode, s.quality = fmt, 'RGB', q
        path = f'{out}-{w}.{ext}'
        img.save_render(os.path.abspath(path), scene=scene)
        print(f'[encode] {path} {os.path.getsize(path) // 1024} KB', flush=True)
    bpy.data.images.remove(img)
