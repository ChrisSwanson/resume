"""The moving things of the City view as pre-rendered 3D sprites: road vehicles, planes, a
helicopter and hot-air balloons, each at 16 headings (balloons 4), in colour variants, under the
hero's own camera orientation, sun, sky and view transform (lib.py). Packed into atlases with a
JSON index for src/hero/sprites.js. `npm run sprites` runs it (scripts/sprites.mjs).

    blender -b --factory-startup -P render/sprites.py -- [--samples 192] [--only cars,air,marker,shadows]
        [--out assets/hero/sprites] [--raw render/out/sprites] [--sheet render/previews/sprites-sheet.jpg]

How: every frame of every model is placed in one scene per atlas, at the world point that the
orthographic camera projects onto its cell's anchor, so one render makes a whole atlas. Because
the projection is affine, a model can slide along the view axis without moving on screen: each
cell is pushed back in proportion to how far it lies toward the sun on screen, so no model can
shade another, and each atlas still renders once.

Atlases (coordinates in the JSON are in the largest file's pixels):
- cars:    road vehicles with their contact shadows baked in (a shadow catcher per cell);
           4.8 px/m (2x the 2400 px master), plus a half-size 1x copy.
- air:     planes (the propeller in 4 phases), helicopter bodies, rotor (8 phases), balloons and
           contrail puffs (soft volumes, 4 variants).
- marker:  the red "player select" pointer for city.js (anchor at its tip), on its own.
- shadows: each flyer's shadow alone, on the ground, 2.4 px/m; the page offsets it along the sun by
           the altitude and blurs it with height.
Heading k means a yaw of k * 360 / headings degrees, counter-clockwise from +X (the reading
direction of the name). Road vehicles have more columns after those: `extraYaws` (degrees), a
5.625 degree step inside every 22.5 degree sector the freeway or its ramps run through
(scene.json), so a car on the curve or the grade is never shown more than about 2.4 degrees off
its path on screen. The anchor is the projection of the model's origin (for shadows: of the
point where the origin's shadow falls).
"""
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402
from mathutils import Vector  # noqa: E402

import lib  # noqa: E402
import palette  # noqa: E402
import sprites_models as M  # noqa: E402

PX = 4.8              # px per metre in the 2x atlases: the 4800 px master is 1000 m wide
SHADOW_PX = 2.4       # shadows are soft; 1x is enough
HS = 4.0              # flyers float this far over their shadow catcher in the shadow atlas
PAD = 4               # px of clear space around every frame (2x)
CARS = [c for c in palette.CARS if c != '#f2f0ea']

A, E = math.radians(lib.CAM_AZ), math.radians(lib.CAM_ELEV)
CA, SA, SE, CE = math.cos(A), math.sin(A), math.sin(E), math.cos(E)
SUN_AZ, SUN_EL = math.radians(lib.SUN_SHADOW_AZ), math.radians(lib.SUN_ELEV)
SD = (math.cos(SUN_AZ) / math.tan(SUN_EL), math.sin(SUN_AZ) / math.tan(SUN_EL))   # shadow run per m of height
LOOK = Vector((-SA * CE, CA * CE, -SE))           # the camera's view axis (lib.camera)


def screen(x, y, z, k):
    """Offset in px (right, down) of a world offset, at k px per metre (README projection)."""
    sx = x * CA + y * SA
    sy = -x * SA * SE + y * CA * SE + z * CE
    return sx * k, -sy * k


def ground(px, py, z, k, W, H):
    """Inverse of the projection (camera on the origin) at height z: image px -> world (x, y)."""
    sx = (px - W / 2) / k
    sy = (H / 2 - py) / k - z * CE
    return (sx * CA * SE - SA * sy) / SE, (CA * sy + sx * SA * SE) / SE


def toward_sun_px():
    """Unit screen direction (px axes, y down) in which the sun lies."""
    s = Vector((-math.cos(SUN_AZ) * math.cos(SUN_EL), -math.sin(SUN_AZ) * math.cos(SUN_EL), math.sin(SUN_EL)))
    dx, dy = screen(s.x, s.y, s.z, 1.0)
    n = math.hypot(dx, dy)
    return dx / n, dy / n


# ── what gets rendered ──────────────────────────────────────────────────────

def specs(title):
    """Every model: its atlas, builder, variants, headings and phases. `len` (m) lets the page
    space traffic; `alt` is the page's altitude range for flyers."""
    return [
        dict(id='sedan', atlas='cars', fine=True, variants=[(c,) for c in CARS], len=4.4,
             make=lambda v, p: M.sedan('sedan', *v)),
        dict(id='truck', atlas='cars', fine=True, len=6.6,
             variants=[('#c23b32', '#f2f0ea'), ('#2f5d8a', '#e9e6df'), ('#d6a531', '#e2d9c6'), ('#3f6b4f', '#f2f0ea')],
             make=lambda v, p: M.truck('truck', *v)),
        dict(id='bus', atlas='cars', fine=True, len=11.4, variants=[('#c23b32',), ('#2f5d8a',), ('#d6a531',), ('#3f6b4f',)],
             make=lambda v, p: M.bus('bus', *v)),
        dict(id='prop', atlas='air', phases=4, phase_step=45.0, shadow=True, len=12.0,
             variants=[(palette.C['white'], '#c23b32'), (palette.C['white'], '#2f5d8a'), ('#d6a531', '#2b2d31')],
             make=lambda v, p: M.prop_plane('prop', *v, phase=p)),
        dict(id='jet', atlas='air', shadow=True, len=31.0,
             variants=[(palette.C['white'], title), (palette.C['white'], '#c23b32'), ('#c9c3b7', '#3f6b4f')],
             make=lambda v, p: M.jet('jet', *v)),
        dict(id='heli', atlas='air', shadow=True, len=10.0,
             variants=[('#c23b32', palette.C['white']), ('#2f5d8a', palette.C['white']), ('#d6a531', '#2b2d31')],
             make=lambda v, p: M.heli('heli', *v)),
        dict(id='rotor', atlas='air', headings=1, phases=8, phase_step=15.0, variants=[()],
             make=lambda v, p: M.rotor('rotor', phase=p)),
        dict(id='puff', atlas='air', headings=1, variants=[(0,), (1,), (2,), (3,)],
             make=lambda v, p: M.puff('puff', v[0])),
        dict(id='marker', atlas='marker', headings=1, variants=[()], make=lambda v, p: M.marker('marker', cam_az=lib.CAM_AZ, cam_el=lib.CAM_ELEV)),
        dict(id='balloon', atlas='air', headings=4, heading_step=11.25, shadow=True, shadow_headings=1,
             variants=[(title, palette.C['white']), ('#c23b32', '#e0b13a'), ('#3f7a52',), ('#8a4f9a', '#d9663a')],
             extra=[{}, {}, {'bands': ((12.0, 14.6, '#e9e6df'), (17.6, 19.6, '#d9663a'))}, {'crown': '#e9e6df'}],
             make=None),
    ]


def build(spec, vi, phase):
    v = spec['variants'][vi]
    if spec['id'] == 'balloon':
        return M.balloon('balloon', v, **spec['extra'][vi])
    return spec['make'](v, phase)


def meshes(root):
    return [o for o in [root] + list(root.children_recursive) if o.type == 'MESH']


def local_points(root):
    """Bounding-box corners of every part, in the root's frame (root at the origin)."""
    bpy.context.view_layer.update()
    inv = root.matrix_world.inverted()
    return [inv @ (o.matrix_world @ Vector(c)) for o in meshes(root) for c in o.bound_box]


def extent(points, yaws, k, shadow=None, ground_shadow=False):
    """Pixel box (x0, y0, x1, y1) around the anchor covering the model at every yaw. With
    `shadow`, the points are dropped to the ground along the sun first (shadow atlas); with
    `ground_shadow`, the model's own shadow on its ground is included (cars)."""
    xs, ys = [], []
    for yaw in yaws:
        c, s = math.cos(yaw), math.sin(yaw)
        for p in points:
            x, y = p.x * c - p.y * s, p.x * s + p.y * c
            if shadow:
                pts = [(x + SD[0] * p.z, y + SD[1] * p.z, 0.0)]
            else:
                pts = [(x, y, p.z)]
                if ground_shadow:
                    pts.append((x + SD[0] * max(p.z, 0), y + SD[1] * max(p.z, 0), 0.0))
            for q in pts:
                dx, dy = screen(*q, k)
                xs.append(dx)
                ys.append(dy)
    return min(xs), min(ys), max(xs), max(ys)


def even(v):
    return int(math.ceil(v / 2.0)) * 2


# ── layout ──────────────────────────────────────────────────────────────────

def layout(blocks, align=2):
    """Shelf-pack blocks {w, h} (tallest first) into a width of the widest block. Sets x, y."""
    width = max(b['w'] for b in blocks)
    x = y = shelf = 0
    for b in sorted(blocks, key=lambda b: -b['h']):
        if x + b['w'] > width:
            x, y, shelf = 0, y + shelf, 0
        b['x'], b['y'] = x, y
        x += b['w']
        shelf = max(shelf, b['h'])
    return even(width), even(y + shelf)


def fine_yaws():
    """Extra yaws (degrees) for road vehicles: 3 between each pair of the 16 headings, in each
    sector that a freeway or ramp segment's yaw lies within 3 degrees of (the grade bends the
    projected direction by up to about 3 degrees)."""
    path = os.path.join(lib.REPO, 'assets/hero/scene.json')
    if not os.path.exists(path):
        return []
    with open(path) as f:
        sc = json.load(f)
    lines = [l['pts'] for l in sc.get('lanes', []) if l.get('road') == 'freeway'] + \
            [r['pts'] for r in sc.get('rampLanes', [])]
    sectors = set()
    for p in lines:
        for a, b in zip(p, p[1:]):
            if a[0] == b[0] and a[1] == b[1]:
                continue
            y = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
            for d in (-3.0, 3.0):
                sectors.add(math.floor((y + d) / 22.5) % 16)
    return [s * 22.5 + j * 5.625 for s in sorted(sectors) for j in (1, 2, 3)]


def plan(spec_list, atlas, k, mode):
    """Measure every model of one atlas and lay out its cells. mode: 'body' or 'shadow'."""
    blocks = []
    for sp in spec_list:
        heads = sp.get('shadow_headings', sp.get('headings', 16)) if mode == 'shadow' else sp.get('headings', 16)
        phases = 1 if mode == 'shadow' else sp.get('phases', 1)
        rows = 1 if mode == 'shadow' else len(sp['variants']) * phases
        step = math.radians(sp.get('heading_step', 360.0 / sp.get('headings', 16)))
        extra = fine_yaws() if sp.get('fine') and mode == 'body' else []
        yaws = [h * step for h in range(heads)] + [math.radians(y) for y in extra]
        probe = build(sp, 0, 0.0)
        pts = local_points(probe)
        for o in [probe] + list(probe.children_recursive):
            bpy.data.objects.remove(o, do_unlink=True)
        x0, y0, x1, y1 = extent(pts, yaws, k, shadow=mode == 'shadow',
                                ground_shadow=atlas == 'cars')
        pad = PAD if mode == 'body' else PAD + 3
        ax, ay = math.ceil(pad - x0), math.ceil(pad - y0)
        cw, ch = even(ax + x1 + pad), even(ay + y1 + pad)
        blocks.append(dict(spec=sp, cols=len(yaws), heads=heads, yaws=yaws, extra=extra, rows=rows,
                           phases=phases, step=step, cw=cw, ch=ch, ax=ax, ay=ay, w=len(yaws) * cw, h=rows * ch))
    W, H = layout(blocks)
    return blocks, W, H


# ── rendering ───────────────────────────────────────────────────────────────

def catcher(name, corners, z):
    """A shadow-catcher quad through four ground points at height z."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x, y, z) for x, y in corners], [], [(0, 1, 2, 3)])
    me.materials.append(lib.material('sp_catch', palette.C['asphalt'], rough=0.95))
    o = bpy.data.objects.new(name, me)
    lib.coll('catchers').objects.link(o)
    o.is_shadow_catcher = True
    return o


def render_atlas(name, blocks, W, H, k, mode, samples, raw):
    scene = lib.reset()
    lib._COLL.clear()
    lib.setup_render(scene, W, H, samples=samples)
    scene.render.film_transparent = True
    scene.cycles.volume_bounces = 8           # the contrail puffs are white because light scatters through them
    lib.world(scene, strength=1.0)          # as hero.py: --sky 1.0 and lib.sun() defaults
    lib.sun()
    cam = lib.camera((0.0, 0.0, 0.0), W / k, aspect=W / H, ortho=True)
    tsx, tsy = toward_sun_px()
    n = 0
    t0 = time.time()
    for b in blocks:
        sp = b['spec']
        for row in range(b['rows']):
            vi, pi = divmod(row, b['phases'])
            for col in range(b['cols']):
                cx, cy = b['x'] + col * b['cw'], b['y'] + row * b['ch']
                axp, ayp = cx + b['ax'], cy + b['ay']
                # depth: farther back the further toward the sun the cell lies on screen (module doc)
                depth = 1.2 * (tsx * (cx + b['cw'] / 2 - W / 2) + tsy * (cy + b['ch'] / 2 - H / 2)) * (PX / k)
                shift = LOOK * depth
                root = build(sp, vi, pi * sp.get('phase_step', 0.0))
                root.rotation_euler = (0, 0, b['yaws'][col])
                gx, gy = ground(axp, ayp, 0.0, k, W, H)
                if mode == 'shadow':
                    root.location = Vector((gx - SD[0] * HS, gy - SD[1] * HS, HS)) + shift
                    for o in meshes(root):
                        o.visible_camera = False
                else:
                    root.location = Vector((gx, gy, 0.0)) + shift
                if mode == 'shadow' or name == 'cars':
                    m = 1.0
                    quad = [ground(px, py, 0.0, k, W, H) for px, py in
                            ((cx + m, cy + m), (cx + b['cw'] - m, cy + m),
                             (cx + b['cw'] - m, cy + b['ch'] - m), (cx + m, cy + b['ch'] - m))]
                    o = catcher(f'catch{n}', quad, 0.0)
                    o.location = shift
                n += 1
    bpy.context.view_layer.update()
    # the cell anchors must land where the page will put them
    b = blocks[0]
    probe = Vector((*ground(b['x'] + b['ax'], b['y'] + b['ay'], 0.0, k, W, H), 0.0)) + LOOK * 37.0
    v = world_to_camera_view(scene, cam, probe)
    err = math.hypot(v.x * W - (b['x'] + b['ax']), (1 - v.y) * H - (b['y'] + b['ay']))
    print(f'[sprites] {name}: {n} frames in {W}x{H}, anchor check {err:.3f} px, built in {time.time() - t0:.1f}s',
          flush=True)
    assert err < 0.05, 'cell anchors do not match the camera'
    os.makedirs(raw, exist_ok=True)
    path = os.path.join(raw, f'{name}.png')
    t0 = time.time()
    bpy.ops.render.render(write_still=False)
    s = scene.render.image_settings
    s.file_format, s.color_mode, s.color_depth, s.compression = 'PNG', 'RGBA', '8', 15
    bpy.data.images['Render Result'].save_render(path, scene=scene)
    print(f'[render] {name} {W}x{H} samples={samples} time={time.time() - t0:.1f}s -> {path}', flush=True)
    return path


# ── pixels (numpy, rows top-down, straight alpha, sRGB-encoded floats) ──────

def load(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)[::-1].copy()


def save(arr, path, quality):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=True)
    img.pixels.foreach_set(np.ascontiguousarray(arr[::-1]).ravel())
    img.file_format = 'WEBP' if path.endswith('.webp') else 'JPEG' if path.endswith('.jpg') else 'PNG'
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    img.save(filepath=os.path.abspath(path), quality=quality)
    bpy.data.images.remove(img)
    return os.path.getsize(path)


def to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def half(arr):
    """2x2 box filter in linear light with premultiplied alpha."""
    h, w = arr.shape[:2]
    a = arr[..., 3:4]
    pre = to_lin(arr[..., :3]) * a
    q = lambda x: x.reshape(h // 2, 2, w // 2, 2, -1).mean(axis=(1, 3))  # noqa: E731
    pa, pc = q(a), q(pre)
    rgb = np.where(pa > 1e-4, pc / np.maximum(pa, 1e-4), 0)
    return np.concatenate([to_srgb(rgb), pa], axis=-1).astype(np.float32)


def clean(arr, shadow_rgb=None):
    """Clear near-invisible noise; shadow atlases keep only alpha over one shade."""
    a = arr[..., 3]
    a[a < 0.015] = 0
    if shadow_rgb is not None:
        arr[..., :3] = shadow_rgb
    arr[a == 0, :3] = 0 if shadow_rgb is None else shadow_rgb
    return arr


# ── contact sheet ───────────────────────────────────────────────────────────

def over(dst, src, x, y):
    h, w = src.shape[:2]
    d = dst[y:y + h, x:x + w]
    a = src[..., 3:4]
    d[..., :3] = src[..., :3] * a + d[..., :3] * (1 - a)


def sheet(atlases, index, path):
    bg = np.array(lib.hexcol('#d9d4c8')[:3]) ** (1 / 2.2)
    rows = []
    for mid, m in index['models'].items():
        if mid in ('rotor', 'puff', 'marker') or mid.endswith('-shadow'):
            continue
        arr = atlases[m['atlas']]
        cw, ch = m['cell']
        heads = list(range(0, m['headings'], max(1, m['headings'] // 8)))
        zoom = max(1, round(90 / ch))
        for v in range(m['variants']):
            cells = []
            for h in heads:
                x, y = m['origin'][0] + h * cw, m['origin'][1] + v * m['phases'] * ch
                c = arr[y:y + ch, x:x + cw].copy()
                if mid == 'heli':
                    r = index['models']['rotor']
                    rc = atlases['air'][r['origin'][1]:r['origin'][1] + r['cell'][1], r['origin'][0]:r['origin'][0] + r['cell'][0]]
                    ox, oy = m['anchor'][0] - r['anchor'][0], m['anchor'][1] - r['anchor'][1]
                    big = np.zeros((ch + 200, cw + 200, 4), np.float32)
                    big[100:100 + ch, 100:100 + cw] = c
                    sub = big[100 + oy:100 + oy + rc.shape[0], 100 + ox:100 + ox + rc.shape[1]]
                    a = rc[..., 3:4]
                    sub[..., :3] = rc[..., :3] * a + sub[..., :3] * (1 - a)
                    sub[..., 3:4] = a + sub[..., 3:4] * (1 - a)
                    c = big[100:100 + ch, 100:100 + cw]
                cells.append(np.repeat(np.repeat(c, zoom, 0), zoom, 1))
            rows.append(cells)
        if m.get('shadow'):
            s = index['models'][m['shadow']]
            sa = atlases['shadows']
            cells = []
            zoom2 = max(1, round(90 / s['cell'][1]))
            for h in range(0, s['headings'], max(1, s['headings'] // 8)):
                x, y = s['origin'][0] + h * s['cell'][0], s['origin'][1]
                c = sa[y:y + s['cell'][1], x:x + s['cell'][0]]
                cells.append(np.repeat(np.repeat(c, zoom2, 0), zoom2, 1))
            rows.append(cells)
    if 'puff' in index['models']:
        m = index['models']['puff']
        cw, ch = m['cell']
        rows.append([atlases['air'][m['origin'][1] + v * ch:m['origin'][1] + (v + 1) * ch, m['origin'][0]:m['origin'][0] + cw]
                     .repeat(2, 0).repeat(2, 1) for v in range(m['variants'])])
    gap = 8
    W = max(sum(c.shape[1] + gap for c in r) for r in rows) + gap
    H = sum(max(c.shape[0] for c in r) + gap for r in rows) + gap
    out = np.ones((H, W, 4), np.float32)
    out[..., :3] = bg
    y = gap
    for r in rows:
        x = gap
        for c in r:
            over(out, c, x, y)
            x += c.shape[1] + gap
        y += max(c.shape[0] for c in r) + gap
    # keep the preview small
    while out.shape[1] > 1800:
        out = half(out[:out.shape[0] // 2 * 2, :out.shape[1] // 2 * 2])
        out[..., 3] = 1
    size = save(out, path, 82)
    print(f'[sprites] contact sheet {out.shape[1]}x{out.shape[0]} {size // 1024} KB -> {path}', flush=True)


# ── main ────────────────────────────────────────────────────────────────────

def main():
    a = lib.args()
    out = os.path.abspath(a.get('out', os.path.join(lib.REPO, 'assets/hero/sprites')))
    raw = os.path.abspath(a.get('raw', os.path.join(lib.REPO, 'render/out/sprites')))
    samples = int(a.get('samples', 192))
    only = set(a['only'].split(',')) if a.get('only') else {'cars', 'air', 'marker', 'shadows'}
    q = int(a.get('quality', 88))
    title = lib.content().get('titleColor', '#2b59c3')
    lib.reset()
    allspecs = specs(title)
    index = {'version': 1, 'about': 'render/sprites.py; coordinates in the largest file of each atlas',
             'atlases': {}, 'models': {}}
    atlases = {}
    for name, k, mode in (('cars', PX, 'body'), ('air', PX, 'body'), ('marker', PX, 'body'),
                          ('shadows', SHADOW_PX, 'shadow')):
        group = [s for s in allspecs if (s['atlas'] == name if mode == 'body' else s.get('shadow'))]
        lib.reset()
        lib._COLL.clear()
        blocks, W, H = plan(group, name, k, mode)
        png = os.path.join(raw, f'{name}.png')
        if name in only or not os.path.exists(png):
            png = render_atlas(name, blocks, W, H, k, mode, samples if mode == 'body' else max(64, samples // 2), raw)
        arr = load(png)
        assert arr.shape[:2] == (H, W), f'{png} is {arr.shape[1]}x{arr.shape[0]}, expected {W}x{H}'
        files = {}
        if mode == 'shadow':
            arr = clean(arr, shadow_rgb=np.array(lib.hexcol('#141824')[:3]) ** (1 / 2.2))
            size = save(arr, os.path.join(out, f'{name}.webp'), q)
            files['1'] = f'{name}.webp'
            print(f'[encode] {name}.webp {W}x{H} {size // 1024} KB', flush=True)
        else:
            arr = clean(arr)
            sep = '.' if name == 'marker' else '-'         # marker.2x.webp, as city.js names it
            files = {'1': f'{name}{sep}1x.webp', '2': f'{name}{sep}2x.webp'}
            size = save(arr, os.path.join(out, files['2']), q)
            print(f'[encode] {files["2"]} {W}x{H} {size // 1024} KB', flush=True)
            size = save(half(arr), os.path.join(out, files['1']), q)
            print(f'[encode] {files["1"]} {W // 2}x{H // 2} {size // 1024} KB', flush=True)
        atlases[name] = arr
        index['atlases'][name] = {'pxPerM': k, 'size': [W, H], 'files': files}
        for b in blocks:
            sp = b['spec']
            mid = sp['id'] if mode == 'body' else f"{sp['id']}-shadow"
            m = {'atlas': name, 'origin': [b['x'], b['y']], 'cell': [b['cw'], b['ch']],
                 'anchor': [b['ax'], b['ay']], 'headings': b['heads'], 'headingStep': round(math.degrees(b['step']), 4),
                 'variants': 1 if mode == 'shadow' else len(sp['variants']), 'phases': b['phases']}
            if b['extra']:
                m['extraYaws'] = [round(y, 4) for y in b['extra']]
            if mode == 'body':
                if 'len' in sp:
                    m['len'] = sp['len']
                if sp.get('shadow'):
                    m['shadow'] = f"{sp['id']}-shadow"
                if sp['id'] == 'heli':
                    m['rotor'] = 'rotor'
            index['models'][mid] = m
    with open(os.path.join(out, 'sprites.json'), 'w') as f:
        json.dump(index, f, indent=1)
    print(f'[sprites] {os.path.join(out, "sprites.json")}', flush=True)
    if a.get('sheet'):
        sheet(atlases, index, os.path.abspath(a['sheet']))


main()
