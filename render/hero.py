"""The hero composition (layout B, third pass): the name as two lines of letter buildings,
CHRIS above SWANSON, in a packed city; the eight employers and Norwich University as simplified
models of their real buildings, each carrying its logo on a lit rooftop billboard. An elevated
freeway sweeps across the grid; parks, a sports field, a warehouse row and a parking deck break
up the blocks. Materials and colours come from palette.py.

The master is a wide orthographic frame (2400x1600) so the page can pan; its centre 1440x960
crop is the resting view and holds the name and most logos.

    blender -b --factory-startup -P render/hero.py -- [--mode clay|key] [--frame master|crop|portrait]
        [--samples 512] [--scale 100] --out <png> [--preview <jpg>]

--mode clay: one matte clay for everything (the composition gate).
--mode key:  full materials: the title in THEME.titleColor, facades, parks, roads, signs.
"""
import math
import os
import random
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402
from mathutils import Vector  # noqa: E402

import hq  # noqa: E402
import kit  # noqa: E402
import lib  # noqa: E402
import logos  # noqa: E402
import palette  # noqa: E402

F = lib.FLOOR
W = 1100                    # half-extent of the built world along X

# ── frames ──────────────────────────────────────────────────────────────────
VIEW_W = 600.0              # metres across the resting 1440x960 view
TARGET = (-34.0, 28.0, 0.0)  # local point at the centre of every frame
FRAMES = {
    'master': dict(res=(2400, 1600), width=VIEW_W * 2400 / 1440),
    'crop': dict(res=(2400, 1600), width=VIEW_W * 2400 / 1440, border=(0.2, 0.8, 0.2, 0.8)),
    'portrait': dict(res=(780, 1688), width=580.0, target=(-40.0, 30.0, 0.0)),
    # close-up check of the freeway ramps (not shipped)
    'ramps': dict(res=(1600, 1000), width=330.0, target=(-150.0, 300.0, 0.0)),
}

# ── the title ───────────────────────────────────────────────────────────────
# Local frame: X runs along the lines of the name (screen: down-right, shallow), Y across them
# (screen: up-right, steep). The camera sits toward +X/-Y: low Y is foreground.
CAP = 46.0                      # cap height of the letter footprints, metres
SPACING = 1.06                  # alleys between letter buildings
LINE_Y = (92.0, 0.0)            # baselines of CHRIS (back line) and SWANSON (front line)
INDENT = 14.0                   # CHRIS starts this far right of SWANSON, measured on screen
HEIGHTS = ([11, 10, 11, 10, 11],        # storeys per letter, CHRIS
           [9, 10, 9, 10, 9, 10, 9])      # SWANSON (lower, so CHRIS shows above it)

# ── streets and blocks ──────────────────────────────────────────────────────
# Bands of blocks between E-W streets. Each band has its own cross-street offset (pitch 110 m),
# so cross streets jog from band to band instead of forming one grid. Recipes are hand-written
# per band and read left to right from x = -W.
#   kind letter + storeys [+ '*' weight], lots split along X with '|'; '.x' reserved; 'G' grove
#   S slab  L L-block  U U-block  C courtyard  D drum  T terraces  W tower on podium
#   P parking deck  Z sawtooth  R rounded slab  H low shed  K chamfered block
#   parks: G grove on grass  Q lawn with paths  F fountain plaza  B sports field  O arena
# CANAL replaces the street between two bands with water, quays and bridges.
# Street widths come from the gaps between bands: 12 m streets, 22 m avenues with a median.
PITCH, STREET = 110.0, 12.0
BANDS = [
    # name, (y0, y1), cross-street offset, recipes
    ('T9', (970, 1060), 25, 'W30 K26|S22 C28 W34 L26|D24 T28 K30|W36 S24 C26 L28|K24 W32 T26|D22 C28 S26|W30 K28 L26 T28|S24 W34 C26 K28|D24 W30'),
    ('T8', (868, 958), -5, 'K28 W32 T30|S20 C26 W36 L28 K30|D24 W30 T26 S26|K22 W34 C24 L30 K28 W32 T26 C26 S24|D22 W30 K28'),
    ('T7', (766, 856), 40, 'W30 K24|S18 T28 C22|D24 W34 L26|H6 S24|W28 K30 T26|S16 W32 C24 L28 K26|D20 W30 T28 C24 S22|K26 L24'),
    ('T6', (664, 754), -20, 'C22 S20|H6 W28 K22|D18 T24 L20|S14 W32 L22 D20|S18 K24 W26 T22|H5 S20*2|D16 C18 W26 K24 L22 T20 S22|K18 W24'),
    ('T5', (562, 652), 15, 'L20 K18|S12 T22 W26 S18|D16 C20 R16|D18 W24 K20 T18|H4 L16 W22 C18 S18|K16 K20 L18|S10 T22 W24 L20 C18'),
    ('T4', (460, 550), -35, 'S16|K12 W22 L14 C16 K18|H4 R14|H4 T20 W24 L16|S10 D14|S12 Q K14 T18 C14 W20 L16|D12 S14*2|H4 K16 L14 T16'),
    ('T3', (368, 448), 30, 'S14|D12 C12 T16 K12|H4 W20 L12 S12|K10 P7 K16 R12|D12 T14 W18 C12 L14|H3 K12 S12|T10 T12 S14|D10 C12 W16'),
    ('T2', (256, 346), -10, 'K12 L10|H3 S10|D9 C10 R10|H4 W16 T12 K10|S8 C9 C12 .slot1 T12 W18 L12|H3 C10 S10|K8 W14 K12 L10 C12 S10|D8'),
    ('T1', (154, 244), 50, 'L7 S6|D6 C6 K7|H3 S5|L6 T7 W9 C6 L6|H3 S6|K5 P4|S5 .slot2 K6 S5|D5 L6 C6 T7 W9 K6|S4 S6|D6 L7'),
    ('C', (72, 142), -25, 'K6 S5|H3 C5 L5|S4 T5 K5|H2 S4|D4 C4 .nameC .nameC .nameC .slot3 T6 G K6 S5|D5 C6 K6|S4 L5 S6'),
    ('S', (-10, 58), -8, 'S5|D4 L5 K5|H2 C4 S4|K5 T5 L4|H3 .slot8 .nameS .nameS .nameS .nameS .slot4 S5|H3 K5 C5 T6 L5|S4 K5 S5|D5'),
    ('F1', (-112, -32), 20, 'H3|S4 C4 S4|D3 Z4 P3|S4 H2|D3 L4 C4 S4|K3 B L4 Q H3|S4 .slot5 S5|H3 K4 C4 T5 L4|S3 C5 S4|D4 K5'),
    ('F2', (-212, -124), -40, 'K5 L5|S3 C5 S4|H2 K6 T6 P4|S3 C5 .norwich .norwich .slot7 .slot6 Z3|Z3|H2 L5 O S5 T6 S4|K5 C6 L5'),
    ('F3', (-312, -224), -40, 'C6 S6|D5 L6|H3 K6 D5|S6 T6|S4 T7 K6 .norwich .norwich C7 S6|K5 K7 L6|H3 S6|D5 T6 C6 S7|H3 K6 L7'),
    ('F4', (-412, -340), 45, 'L7 T7 S6|D5 C7 K7 S6|H3 G L7 W9 S7|K6 G K8 T7 L7|S5 S6|D6 C7 S7|K6 K6 T8 L7'),
    ('F5', (-512, -424), -30, 'K7 C7 L7|H3 S6|D6 T8 S7|K6 C7 K8 S7|H3 Q T7 C7 W10 K7 S8|D6 S7|K6 L7 C8 T7 K8'),
    ('F6', (-612, -524), 20, 'S8|K6 K8 T8 C7 S8|D6 L8 W12 K8 C8 S7|H4 G T8 L8 K7 C8 S7|D6 S8|K6 T7 K8 L8'),
    ('F7', (-712, -624), -45, 'C8 L7 S8|D6 K8 T9 U8 C8 S7|K6 L8 W11 K8 T8 C7 S8|H3 L8 K8 C8 T8 S7|D6 K8'),
    ('F8', (-812, -724), 35, 'S8 K7|D6 C8 L7|H3 T8 S7|K8 C7 W10 L8|S7 H3|D6 K8 C8|T7 S8 L7|K6 C8 S7|D7 W11 K8 L7 C8 S7|H3 K7'),
    ('F9', (-912, -824), -15, 'K8 C7|S7 L8 D6|T8 K7 S6|C8 H3|W10 L7 K8|S7 C8 T7|D6 K8 L7 S8|C7 K6 W11|T8 S7 L8 C7 K8 S6|D7 L8'),
    ('F10', (-1012, -924), 40, 'C8 S7|K8 L7 T8|D6 S8 C7|H3 K8 W10|L7 S7 C8|T7 K6 D7|S8 L8 C7 K8|W11 S7|T8 C8 K7 L7 S8 D6'),
]
# lots in the leftovers of the title blocks: (name, recipe, x0, x1, y0, y1)
EXTRA_LOTS = [('cx', 'F', 14, 79, 72, 142)]

CANAL = (-340.0, -312.0)

# ── the elevated freeway ────────────────────────────────────────────────────
# Control points of its centreline (x, y), smoothed with a Catmull-Rom spline. It enters at the
# lower left of the master, crosses the upper-left corner of the resting view, and leaves at the
# top right, clear of the name and every employer site. Buildings in its corridor are left out.
FREEWAY = [(-900, -640), (-760, -430), (-640, -250), (-505, -75), (-395, 40), (-300, 150),
           (-205, 272), (-110, 390), (20, 520), (220, 640), (520, 720), (900, 760)]
FWY_Z, FWY_W = 11.0, 26.0       # deck top height and width, metres
# Ramps between the freeway and the avenue at y 346..368 (a half interchange). Each starts in an
# avenue half at street level, runs along it, turns, climbs at a steady grade (eased at both ends)
# to deck height alongside the freeway, and merges into the outer lane over a taper.
#   side: +1 north-west of the freeway (the right side of south-west-bound traffic), -1 south-east
#   kind: 'on' (traffic from the street onto the freeway) or 'off'
#   mouth: (x, y, heading) of the street end, heading pointing away from the ramp
#   join_y: where the turn meets the line alongside the freeway
RAMPS = [
    # mouths sit exactly on the avenue's inner lane centres (lanes(): a + 8 eastbound, b - 8 westbound)
    dict(name='off_ne', kind='off', side=-1, mouth=(-10.0, 346.0 + 8.0, 0.0), run=40.0, join_y=250.0),
    dict(name='on_sw', kind='on', side=+1, mouth=(-170.0, 368.0 - 8.0, 0.0), run=30.0, join_y=260.0),
]
RAMP_W, RAMP_GAP, RAMP_GRADE = 7.0, 1.5, 0.08     # deck width, gap to the freeway, max grade
RAMP_TAPER, RAMP_LEVEL = 72.0, 30.0              # taper length; level run alongside before it

# which company sits in which slot (free choice, for composition); a slot is the block(s) marked
# '.slotN' in BANDS
PLACES = {
    'slot1': 'wellsfargo', 'slot2': 'twitch', 'slot3': 'chainalysis', 'slot4': 'marqeta',
    'slot5': 'idme', 'slot6': 'palantir', 'slot7': 'tivo', 'slot8': 'wework',
    'norwich': 'norwich',
}


def band_blocks():
    """Yield (band, i, code, x0, x1, y0, y1) for every block."""
    for name, (y0, y1), off, recipes in BANDS:
        k0 = math.floor((-W - off) / PITCH)
        for i, code in enumerate(recipes.split()):
            xa = off + (k0 + i) * PITCH
            yield name, i, code, xa + STREET / 2, xa + PITCH - STREET / 2, y0, y1


def title(mat, text):
    """Two lines of letter buildings; returns [(obj, bounds)] for both lines."""
    words = text.split()
    assert len(words) == 2, 'the title layout expects a first and a last name'
    size = CAP / 0.5817
    ext = [lib.text_extent(w, size)[0] * SPACING for w in words]
    left2 = -ext[1] / 2                     # SWANSON centred on x = 0
    shift = (LINE_Y[0] - LINE_Y[1]) * math.tan(math.radians(lib.CAM_AZ))   # same screen x
    left1 = left2 - shift + INDENT / math.cos(math.radians(lib.CAM_AZ))
    out = []
    for w, (x, y), hs in zip(words, ((left1 + ext[0] / 2, LINE_Y[0]), (0.0, LINE_Y[1])), HEIGHTS):
        out += lib.text_letters(w, size, mat, x, y, [h * F for h in hs], spacing=SPACING, resolution=16, bevel=0.6,
                                collection='title')
    return out


def lots(recipe, x0, x1, gap=8.0):
    parts = recipe.split('|')
    weights = [float(p.split('*')[1]) if '*' in p else 1.0 for p in parts]
    width = (x1 - x0) - gap * (len(parts) - 1)
    x = x0
    for p, wgt in zip(parts, weights):
        w = width * wgt / sum(weights)
        yield p.split('*')[0], x, x + w
        x += w + gap


PARKS = {'G': 'grove', 'Q': 'lawn_park', 'F': 'fountain_plaza', 'B': 'ball_field', 'O': 'arena'}


def build_lot(name, code, x0, x1, y0, y1, pal, set_back=5.0):
    kind = code[0]
    fl = int(code[1:]) if code[1:].isdigit() else 0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    w, d = (x1 - x0) - 2 * set_back, (y1 - y0) - 2 * set_back
    m = min(w, d)
    if kind == '.':
        return
    seed = zlib.crc32(name.encode())
    if kind == 'G':
        lib.box(name + '.grass', cx, cy, w + 4, d + 4, 0.35, pal.flat('grass'), bevel=0.1, collection='parks')
        kit.grove(name, cx, cy, int(w * d / 140), m * 0.48, None, seed=seed)
        return
    if kind == 'A':
        parking_lot(name, cx, cy, w + 6, d + 6, pal, seed)
        return
    if kind == 'Y':
        lib.box(name + '.lawn', cx, cy, w + 6, d + 6, 0.32, pal.flat('grass2'), bevel=0.1, collection='parks')
        rng = random.Random(seed)
        kinds = kit.trees()
        for tx in range(int(x0 + 6), int(x1 - 4), 9):
            for ty in range(int(y0 + 6), int(y1 - 4), 9):
                px, py = tx + rng.uniform(-3, 3), ty + rng.uniform(-3, 3)
                if rng.random() < 0.45 and not near_corridor(px, px, py, py, 6):
                    kit.instance(kinds[rng.randrange(4)], f'{name}.t{tx}_{ty}', px, py, 0, None, 'trees',
                                 scale=rng.uniform(0.9, 1.3)).location.z = 0.3
        return
    if kind in PARKS:
        kit.build(name, PARKS[kind], cx, cy, 0, pal.clay, collection='parks', w=w + 4, d=d + 4)
        return
    args = {
        'S': ('slab', dict(w=w, d=d, fl=fl)),
        'L': ('lshape', dict(w=w, d=d, wing=m * 0.42, fl=fl, fl2=fl + 2)),
        'U': ('ushape', dict(w=w, d=d, t=m * 0.32, fl=fl)),
        'C': ('courtyard', dict(w=w, d=d, t=m * 0.26, fl=fl, gate=False)),
        'D': ('drum', dict(r=m / 2 - 2, fl=fl)),
        'T': ('stepped', dict(w=w, d=d, fl=fl, steps=3)),
        'W': ('tower', dict(w=w * 0.48, d=d * 0.52, fl=fl, pod=(w, d, 3), setbacks=((0.78, 0.72),))),
        'P': ('deck', dict(w=w - 18, d=d, levels=fl)),
        'Z': ('sawtooth', dict(w=w, d=d, fl=fl, teeth=max(3, int(w / 16)))),
        'R': ('stadium', dict(w=w, d=d, fl=fl, ends=2)),   # never one rounded end: it reads as a D
        'H': ('shed', dict(w=w, d=d, fl=fl, vents=max(2, int(w / 24)))),
        'K': ('chamfer', dict(w=w, d=d, fl=fl, c=m * 0.3)),
    }[kind]
    kit.build(name, args[0], cx, cy, 0, pal.filler(kind, seed), **args[1])


def parking_lot(name, cx, cy, w, d, pal, seed):
    """Surface parking: asphalt with painted stalls in rows, about half of them taken."""
    lib.box(name + '.lot', cx, cy, w, d, 0.26, pal.flat('asphalt'), bevel=0.05, collection='ground')
    rng = random.Random(seed)
    paint, cars = pal.flat('paint'), MESHES['cars']
    rows = int((d - 4) / 12)
    for r in range(rows):
        y = cy - d / 2 + 4 + r * 12 + 3
        for k in range(int((w - 4) / 2.8)):
            x = cx - w / 2 + 3 + k * 2.8
            lib.box(f'{name}.ln{r}_{k}', x, y, 0.15, 5.2, 0.28, paint, bevel=0, collection='ground')
            if rng.random() < 0.5:
                o = kit.instance(cars[rng.randrange(len(cars))], f'{name}.c{r}_{k}', x + 1.4, y, 90, None, 'cars')
                o.location.z = 0.26


# ── the freeway ─────────────────────────────────────────────────────────────

def catmull(pts, step=6.0):
    """Sample a Catmull-Rom spline through pts (tuples of 2 or 3 floats) about every `step` m."""
    P = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = (Vector(P[j] if len(P[j]) == 3 else (*P[j], 0.0)) for j in range(i - 1, i + 3))
        n = max(2, int((p2 - p1).length / step))
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
    out.append(Vector(P[-2] if len(P[-2]) == 3 else (*P[-2], 0.0)))
    return out


def frames(pts):
    """Unit left-normals (in the ground plane) along a polyline."""
    out = []
    for i in range(len(pts)):
        a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
        t = Vector((b.x - a.x, b.y - a.y, 0)).normalized()
        out.append(Vector((-t.y, t.x, 0)))
    return out


def sweep(name, pts, boxes, mat, collection='freeway', z_of=None, spans=None):
    """One mesh: each (off0, off1, z0, z1) in `boxes` swept along pts as a closed tube, offsets
    across (left normal) and heights relative to each point's z. `spans` limits the sweep to
    index ranges (for dashed lines)."""
    import bmesh
    nrm = frames(pts)
    bm = bmesh.new()
    for (o0, o1, z0, z1) in boxes:
        for (i0, i1) in (spans or [(0, len(pts) - 1)]):
            rings = []
            for i in range(i0, i1 + 1):
                p, n = pts[i], nrm[i]
                ring = [bm.verts.new(p + n * o + Vector((0, 0, z))) for o, z in
                        ((o0, z0), (o1, z0), (o1, z1), (o0, z1))]
                rings.append(ring)
            for r0, r1 in zip(rings, rings[1:]):
                for k in range(4):
                    bm.faces.new((r0[k], r0[(k + 1) % 4], r1[(k + 1) % 4], r1[k]))
            bm.faces.new(rings[0][::-1])
            bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    lib.coll(collection).objects.link(o)
    me.materials.append(mat)
    for f in me.polygons:
        f.use_smooth = False
    return o


def freeway(pal, cars):
    """The elevated freeway: deck, parapets, median barrier, lane paint, pillars with cap beams,
    two ramps, and a few cars. Returns the sampled centreline (for clearing the corridor)."""
    pts = [p + Vector((0, 0, FWY_Z)) for p in catmull(FREEWAY)]
    h = FWY_W / 2
    concrete, paint = pal.flat('barrier'), pal.flat('paint')
    sweep('fwy.deck', pts, [(-h, h, -1.4, 0.0)], pal.flat('asphalt'))
    sweep('fwy.walls', pts, [(-0.4, 0.4, 0.0, 0.8), (-h - 0.3, h + 0.3, -2.4, -1.4)], concrete)
    edges = [(-1.4, -1.2, 0.0, 0.03), (1.2, 1.4, 0.0, 0.03)]
    sweep('fwy.edges', pts, edges, paint)
    spans = [(i, i + 1) for i in range(0, len(pts) - 2, 2)]          # dashes: 6 m on, 6 m off
    lanes = [(-(h + 1.3) / 2 - 0.1, -(h + 1.3) / 2 + 0.1, 0.0, 0.03), ((h + 1.3) / 2 - 0.1, (h + 1.3) / 2 + 0.1, 0.0, 0.03)]
    sweep('fwy.lanes', pts, lanes, paint, spans=spans)
    nrm = frames(pts)
    pil = pal.flat('pillar')
    for i in range(0, len(pts), 5):
        p, n = pts[i], nrm[i]
        rot = math.degrees(math.atan2(n.y, n.x))
        lib.box(f'fwy.cap{i}', p.x, p.y, FWY_W - 4, 2.2, 1.4, pil, z=FWY_Z - 3.8, rot=rot, bevel=0.15,
                collection='freeway')
        for side in (-1, 1):
            q = p + n * side * (h - 5)
            lib.cyl(f'fwy.pil{i}{side}', q.x, q.y, 1.1, FWY_Z - 3.8, pil, seg=12, bevel=0.1,
                    collection='freeway')
    MESHES['ramps'] = [ramp(r, pts, nrm, pal) for r in RAMPS]
    # the freeway's own parapet and edge line stop where a ramp's taper widens the deck
    cut = {+1: [], -1: []}
    for r in MESHES['ramps']:
        cut[r['side']].append(r['taper'])
    concrete = pal.flat('barrier')
    for side, (o0, o1) in ((-1, (-h, -h + 0.6)), (+1, (h - 0.6, h))):
        sweep(f'fwy.wall{side:+d}', pts, [(o0, o1, 0.0, 1.1)], concrete, spans=keep_spans(len(pts), cut[side]))
        e = (-h + 1.4, -h + 1.6) if side < 0 else (h - 1.6, h - 1.4)
        sweep(f'fwy.edge{side:+d}', pts, [(e[0], e[1], 0.0, 0.03)], paint, spans=keep_spans(len(pts), cut[side]))
    # no baked cars on the deck: the page's traffic sprites drive these lanes
    return [p.to_2d() for p in pts]


def keep_spans(n, cuts):
    """Index spans of 0..n-1 that avoid each (i0, i1) cut."""
    spans, i = [], 0
    for c0, c1 in sorted(cuts):
        if c0 - 1 > i:
            spans.append((i, c0 - 1))
        i = max(i, c1 + 1)
    if i < n - 1:
        spans.append((i, n - 1))
    return spans


def ramp(r, pts, nrm, pal):
    """Build one ramp (see RAMPS) beside the freeway polyline pts (deck height, left normals nrm).
    Returns its facts: the 2D centreline (for clearing the corridor), the lane in driving order
    with heights, its side and the freeway index span its taper covers."""
    from mathutils import Vector as V
    side, h = r['side'], FWY_W / 2
    off = h + RAMP_GAP + RAMP_W / 2
    # stations (cumulative length) along the freeway
    st = [0.0]
    for a, b in zip(pts, pts[1:]):
        st.append(st[-1] + (b - a).to_2d().length)

    def at(s):                              # point on the freeway centreline and its frame, by station
        i = max(1, min(len(st) - 1, next((k for k, v in enumerate(st) if v >= s), len(st) - 1)))
        t = (s - st[i - 1]) / ((st[i] - st[i - 1]) or 1)
        p = pts[i - 1].lerp(pts[i], t)
        tg = (pts[i] - pts[i - 1]).to_2d().normalized()
        return V((p.x, p.y)), tg, V((-tg.y, tg.x)), i
    # the join: where the line alongside the freeway reaches join_y
    sj = min(st, key=lambda s: abs((at(s)[0] + at(s)[2] * side * off).y - r['join_y']))
    # the ramp runs from the join toward lower stations (south-west), then the taper. The gore and
    # the taper's end sit on freeway vertices, so the ramp lane meets the exported outer lane at
    # one of its own points (no lateral jump at the handoff)
    ig = min(range(len(st)), key=lambda i: abs(st[i] - (sj - RAMP_LEVEL)))
    ie = min(range(len(st)), key=lambda i: abs(st[i] - (st[ig] - RAMP_TAPER)))
    s_gore, s_end = st[ig], st[ie]
    taper_len = s_gore - s_end
    mx, my, hd = r['mouth']
    d0 = V((math.cos(math.radians(hd)), math.sin(math.radians(hd))))
    path = []                               # 2D, from the mouth toward the freeway
    for k in range(int(r['run'] / 3) + 1):
        path.append(V((mx, my)) - d0 * (k * 3.0))
    p0 = path[-1]
    pj, tj, nj, _ = at(sj)
    p3 = pj + nj * side * off
    d3 = -tj                                # heading away from the mouth: down the stations
    k = (p3 - p0).length * 0.42
    c1, c2 = p0 - d0 * k, p3 - d3 * k
    n = max(8, int((p3 - p0).length / 3))
    for j in range(1, n + 1):
        u = j / n
        path.append(p0 * (1 - u) ** 3 + c1 * 3 * u * (1 - u) ** 2 + c2 * 3 * u * u * (1 - u) + p3 * u ** 3)
    s = sj
    while s > s_gore + 1.5:
        s = max(s_gore, s - 3.0)
        p, tg, nm, _ = at(s)
        path.append(p + nm * side * off)
    path.append(pts[ig].to_2d() + nrm[ig].to_2d() * side * off)        # the gore, on a vertex
    # heights: level at the mouth, a vertical curve, the steady grade, a curve, then deck level
    L = [0.0]
    for a, b in zip(path, path[1:]):
        L.append(L[-1] + (b - a).length)
    z0, climb, ease = 0.08, FWY_Z - 0.08, 20.0
    run_len = climb / RAMP_GRADE

    def height(x):
        if x <= 0:
            return z0
        if x < ease:
            return z0 + RAMP_GRADE * x * x / (2 * ease)
        if x < run_len:
            return z0 + RAMP_GRADE * (x - ease / 2)
        if x < run_len + ease:
            y = x - run_len
            return z0 + RAMP_GRADE * (run_len - ease / 2) + RAMP_GRADE * (y - y * y / (2 * ease))
        return FWY_Z
    start = r['run'] * 0.35                 # the first part of the run lies flat in the street
    path3 = [V((p.x, p.y, min(FWY_Z, height(l - start)))) for p, l in zip(path, L)]
    asphalt, concrete, pil = pal.flat('asphalt'), pal.flat('barrier'), pal.flat('pillar')
    hw = RAMP_W / 2
    sweep(f'ramp_{r["name"]}.deck', path3, [(-hw, hw, -1.0, 0.0)], asphalt)
    sweep(f'ramp_{r["name"]}.walls', path3, [(-hw, -hw + 0.5, 0.0, 0.9), (hw - 0.5, hw, 0.0, 0.9)], concrete)
    for i in range(4, len(path3), 5):
        q = path3[i]
        if q.z > 3.2:
            lib.cyl(f'ramp_{r["name"]}.pil{i}', q.x, q.y, 0.8, q.z - 1.0, pil, seg=12, bevel=0.1,
                    collection='freeway')
    # the taper: the deck widens beside the freeway edge, from the ramp's full width at the gore
    # to nothing, so the ramp lane becomes the freeway's outer lane
    tp = []
    for i in range(ig, ie - 1, -1):                                    # freeway vertices, gore to end
        u = (s_gore - st[i]) / taper_len
        e = (RAMP_GAP + RAMP_W) * (1 - (3 * u * u - 2 * u ** 3))
        tp.append((V((pts[i].x, pts[i].y, FWY_Z)), nrm[i].to_2d().normalized(), e, i))
    import bmesh
    for nm_, boxes in ((f'ramp_{r["name"]}.taper', [(0.0, 1.0, -1.0, 0.0)]),
                       (f'ramp_{r["name"]}.taperwall', [(1.0, 1.0, 0.0, 0.9)])):
        bm = bmesh.new()
        rings = []
        for p, nmv, e, _ in tp:
            if nm_.endswith('wall'):
                a_, b_ = h + max(e, 0.0) - 0.5 + 0.5 * (e <= 0.0), h + max(e, 0.0)
                a_ = h + e - 0.5 if e > 0.5 else h - 0.5
                b_ = h + e if e > 0.5 else h
                zz = (0.0, 0.9)
            else:
                a_, b_, zz = h - 0.05, h + e, (-1.0, 0.0)
            ring = [bm.verts.new(V((p.x, p.y, p.z + z)) + V((nmv.x, nmv.y, 0)) * side * o)
                    for o, z in ((a_, zz[0]), (b_, zz[0]), (b_, zz[1]), (a_, zz[1]))]
            rings.append(ring)
        for r0, r1 in zip(rings, rings[1:]):
            for k_ in range(4):
                bm.faces.new((r0[k_], r0[(k_ + 1) % 4], r1[(k_ + 1) % 4], r1[k_]))
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        me = bpy.data.meshes.new(nm_)
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(nm_, me)
        lib.coll('freeway').objects.link(o)
        me.materials.append(concrete if nm_.endswith('wall') else asphalt)
    i0, i1 = tp[-1][3], tp[0][3]
    # the lane in driving order: on-ramps from the mouth to the taper end, off-ramps the reverse
    lane = [list(map(lambda v: round(v, 2), q)) for q in path3]
    for p, nmv, e, i in tp[1:]:
        u = 1 - e / (RAMP_GAP + RAMP_W)
        o = off + (9.4 - off) * u
        if i == ie:                        # exactly the exported outer-lane vertex (same rounding)
            n2 = nrm[i]
            lane.append([round(pts[i].x + n2.x * side * 9.4, 1), round(pts[i].y + n2.y * side * 9.4, 1), FWY_Z])
            continue
        q = p + V((nmv.x, nmv.y, 0)) * side * o
        lane.append([round(q.x, 2), round(q.y, 2), FWY_Z])
    if r['kind'] == 'off':
        lane = lane[::-1]
    # unit 3D tangents in driving order (z included), so the page can pick a sprite heading from
    # the projected slope rather than the flat yaw
    tangents = []
    for k in range(len(lane)):
        a_, b_ = V(lane[max(0, k - 1)]), V(lane[min(len(lane) - 1, k + 1)])
        t_ = (b_ - a_).normalized()
        tangents.append([round(t_.x, 4), round(t_.y, 4), round(t_.z, 4)])
    gap = min(min((q.to_2d() - p.to_2d()).length for p in pts) for q in path3[:-int(RAMP_LEVEL / 3)])
    print(f'[ramp] {r["name"]}: {L[-1]:.0f} m to the gore, max grade {RAMP_GRADE:.0%}, taper {RAMP_TAPER:.0f} m, '
          f'closest approach to the freeway centreline before the level run {gap:.1f} m', flush=True)
    return {'name': r['name'], 'kind': r['kind'], 'side': side, 'line': [p.to_2d() for p in path3],
            'lane': lane, 'tangents': tangents, 'taper': (min(i0, i1), max(i0, i1))}


def near_corridor(x0, x1, y0, y1, clear):
    """Is the rectangle within `clear` metres of the freeway deck edge or a ramp's edge?"""
    if near_freeway(MESHES['fwy'], x0, x1, y0, y1, FWY_W / 2 + clear):
        return True
    return any(near_freeway(r['line'], x0, x1, y0, y1, RAMP_W / 2 + clear) for r in MESHES.get('ramps', []))


def near_freeway(fwy, x0, x1, y0, y1, clear):
    """Does the rectangle come within `clear` metres of the freeway centreline?"""
    for p in fwy:
        dx = max(x0 - p.x, 0, p.x - x1)
        dy = max(y0 - p.y, 0, p.y - y1)
        if dx * dx + dy * dy < clear * clear:
            return True
    return False


def visible(cam, scene, x0, x1, y0, y1, margin=0.08, h=60.0):
    """Does the box (x0..x1, y0..y1, 0..h) touch the frame (plus a margin)?"""
    us, vs = [], []
    for x in (x0, x1):
        for y in (y0, y1):
            for z in (0.0, h):
                v = world_to_camera_view(scene, cam, Vector((x, y, z)))
                us.append(v.x)
                vs.append(v.y)
    return max(us) > -margin and min(us) < 1 + margin and max(vs) > -margin and min(vs) < 1 + margin


def ew_streets():
    """E-W streets: the gaps between consecutive bands, plus one above and below. (y0, y1)."""
    ys = sorted(yy for _, yy, *_ in BANDS)
    out = [(ys[0][0] - STREET, ys[0][0])]
    out += [(a[1], b[0]) for a, b in zip(ys, ys[1:])]
    out.append((ys[-1][1], ys[-1][1] + STREET))
    return out


def streets(pal, superblocks, no_cross):
    """Road surfaces with lane paint: E-W streets (cut around superblocks; the wide ones get a
    planted median) and each band's cross streets. Returns the E-W street extents."""
    ew = ew_streets()
    for i, (a, b) in enumerate(ew):
        if (a, b) == CANAL:
            canal(pal, a, b)
            continue
        cuts = sorted((sx0, sx1) for sx0, sx1, sy0, sy1 in superblocks if sy0 < (a + b) / 2 < sy1)
        x = -W - PITCH
        for sx0, sx1 in cuts + [(W + PITCH, W + PITCH)]:
            if sx0 > x:
                lib.box(f'ew{i}_{x:.0f}', (x + sx0) / 2, (a + b) / 2, sx0 - x, b - a, 0.03, pal.road(b - a),
                        bevel=0, collection='roads')
                if b - a >= 18:
                    lib.box(f'median{i}_{x:.0f}', (x + sx0) / 2, (a + b) / 2, sx0 - x, 2.2, 0.35,
                            pal.flat('grass'), bevel=0.1, collection='roads')
            x = max(x, sx1)
    k = 0
    for name, (y0, y1), off, recipes in BANDS:
        k0 = math.floor((-W - off) / PITCH)
        for i in range(len(recipes.split()) + 1):
            xc = off + (k0 + i) * PITCH
            if any(sx0 < xc < sx1 and sy0 < (y0 + y1) / 2 < sy1 for sx0, sx1, sy0, sy1 in no_cross):
                continue
            k += 1
            lib.box(f'ns_{name}_{i}', xc, (y0 + y1) / 2, STREET, y1 - y0, 0.03, pal.road_ns(),
                    bevel=0, collection='roads')
    return ew


def canal(pal, a, b):
    """Water between stone quays, bridged wherever a cross street meets it."""
    lib.box('canal', 0, (a + b) / 2, 2 * W + 2 * PITCH, b - a, 0.05, pal.water(), z=-0.02, bevel=0,
            collection='water')
    for y in (a + 0.6, b - 0.6):
        lib.box(f'quay{y:.0f}', 0, y, 2 * W + 2 * PITCH, 1.2, 0.5, pal.flat('stone'), bevel=0.1,
                collection='water')
    xs = set()
    for name, (y0, y1), off, recipes in BANDS:
        if abs(y0 - b) < 0.1 or abs(y1 - a) < 0.1:
            k0 = math.floor((-W - off) / PITCH)
            xs |= {round(off + (k0 + j) * PITCH, 1) for j in range(len(recipes.split()) + 1)}
    for xc in xs:
        lib.box(f'bridge{xc}', xc, (a + b) / 2, STREET + 2, b - a + 2, 0.5, pal.road_ns(), z=0.05, bevel=0.1,
                collection='roads')
        for sx in (-1, 1):
            lib.box(f'rail{xc}{sx}', xc + sx * (STREET / 2 + 0.6), (a + b) / 2, 0.6, b - a + 2, 1.0,
                    pal.flat('stone'), z=0.55, bevel=0.1, collection='roads')


def plinths(pal, blocks):
    """Raised pavements (kerbs) for every block: the ground between them is asphalt."""
    kerb, walk = pal.flat('kerb'), pal.flat('sidewalk')
    for i, (x0, x1, y0, y1) in enumerate(blocks):
        # a kerb stone 0.4 m wide stands 0.24 m above the road; the paving inside it is flush
        lib.box(f'plinth{i}', (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, 0.24, kerb,
                bevel=0.08, collection='ground')
        lib.box(f'plinth{i}.walk', (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0 - 0.8, y1 - y0 - 0.8, 0.245, walk,
                bevel=0.0, collection='ground')


def zebra_mesh(name, width, mat):
    """Crosswalk bars across a street `width` m wide (bars along X, spaced across Y)."""
    import bmesh
    bm = bmesh.new()
    n = int((width - 2) / 1.2)
    for j in range(n):
        y = -width / 2 + 1.0 + j * 1.2 + 0.3
        r = bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(3.2, 0.6, 0.04), verts=r['verts'])
        bmesh.ops.translate(bm, vec=(0, y, 0.04), verts=r['verts'])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    return me


def crosswalks(cam, scene, pal, ew, no_cross):
    """Zebra crossings over each E-W street beside every cross street that meets it."""
    cache = {}
    paint = pal.flat('paint')
    for i, (a, b) in enumerate(ew):
        if (a, b) == CANAL:
            continue
        xs = set()
        for name, (y0, y1), off, recipes in BANDS:
            if abs(y0 - b) > 0.1 and abs(y1 - a) > 0.1:
                continue
            k0 = math.floor((-W - off) / PITCH)
            for j in range(len(recipes.split()) + 1):
                xc = off + (k0 + j) * PITCH
                if any(sx0 < xc < sx1 and sy0 < (y0 + y1) / 2 < sy1 for sx0, sx1, sy0, sy1 in no_cross):
                    continue
                xs.add(round(xc, 1))
        wd = round(b - a)
        if wd not in cache:
            cache[wd] = zebra_mesh(f'zebra{wd}', b - a, paint)
        for xc in xs:
            for side in (-1, 1):
                x = xc + side * (STREET / 2 + 2.4)
                if visible(cam, scene, x - 2, x + 2, a, b, margin=0.02, h=1):
                    kit.instance(cache[wd], f'zb{i}_{xc}_{side}', x, (a + b) / 2, 0, None, 'roads')


def street_life(cam, scene, ew, pal, superblocks, fwy):
    """Street trees on both pavements (and on wide medians), cars parked at the kerbs in a few
    colours, and people on the pavements. Travel lanes stay clear for animated traffic."""
    every = kit.trees()
    cars = MESHES['cars']
    rng = random.Random(41)

    def in_superblock(x0, x1, y0, y1, m=1.0):
        """Does the rectangle touch a superblock (a campus where streets were removed)?"""
        return any(x1 > sx0 - m and x0 < sx1 + m and y1 > sy0 - m and y0 < sy1 + m
                   for sx0, sx1, sy0, sy1 in superblocks)
    for i, (a, b) in enumerate(ew):
        # each street is planted with one species: round crowns, plane trees or poplars
        kinds = [every[:3], every[5:6], every[4:5]][i % 3]
        rows = [(0, a - 2.4), (1, b + 2.4)] + ([(2, (a + b) / 2)] if b - a >= 18 else [])
        for x in range(-int(W), int(W), 14):
            for side, y in rows:
                if not visible(cam, scene, x, x + 1, y, y + 1, margin=0.02, h=10):
                    continue
                if any(sx0 - 6 < x < sx1 + 6 and sy0 - 6 < y < sy1 + 6 for sx0, sx1, sy0, sy1 in superblocks):
                    continue
                if (x + 1100 + 37 * i) % PITCH < 22 or near_corridor(x, x, y, y, 3):
                    continue
                kit.instance(kinds[rng.randrange(len(kinds))], f'st{i}_{side}_{x}', x + rng.uniform(-2, 2), y,
                             rng.uniform(0, 360), None, 'trees', scale=rng.uniform(0.85, 1.0))
        lanes = [] if (a, b) == CANAL else [(0, a + 1.6, 0), (1, b - 1.6, 180)]
        for x in range(-int(W), int(W), 6):
            for side, y, rot in lanes:
                if rng.random() > 0.42 or not visible(cam, scene, x, x + 1, y, y + 1, margin=0.02, h=5):
                    continue
                if (x + 1100 + 37 * i) % PITCH < 26 or near_corridor(x - 2.5, x + 2.5, y, y, 1.5):
                    continue
                if in_superblock(x - 2.4, x + 2.4, y - 1.1, y + 1.1):          # the whole car footprint
                    continue
                kit.instance(cars[rng.randrange(len(cars))], f'car{i}_{side}_{x}', x, y, rot, None, 'cars')
        for x in range(-int(W), int(W), 18):                        # people on the pavements, in small groups
            for y in (a - 4.0, b + 4.0):
                if rng.random() > 0.2 or not visible(cam, scene, x, x + 1, y, y + 1, margin=0.02, h=3):
                    continue
                if near_corridor(x, x, y, y, 1.0) or in_superblock(x - 6, x + 6, y - 1.5, y + 1.5):
                    continue
                cx = x + rng.uniform(-4, 4)
                pts = [(cx + rng.uniform(-1.4, 1.4), y + rng.uniform(-0.9, 0.9)) for _ in range(rng.choice((1, 2, 2, 3, 4)))]
                for o in kit.people(f'pp{i}_{x}_{y:.0f}', pts, rng.random()):
                    o.location.z = 0.22


MESHES = {}


def main():
    a = lib.args()
    mode = a.get('mode', 'clay')
    frame = FRAMES[a.get('frame', 'master')]
    w, h = frame['res']
    scene = lib.reset()
    lib.setup_render(scene, w, h, samples=int(a.get('samples', 512)))
    scene.render.resolution_percentage = int(a.get('scale', 100))
    if 'border' in frame:
        r = scene.render
        r.use_border, r.use_crop_to_border = True, True
        r.border_min_x, r.border_max_x, r.border_min_y, r.border_max_y = frame['border']
    lib.world(scene, strength=float(a.get('sky', 1.0)))
    lib.sun()
    data = lib.content()
    cam = lib.camera(frame.get('target', TARGET), frame['width'], aspect=w / h, ortho=True)
    bpy.context.view_layer.update()

    pal = palette.Palette(mode == 'clay', data['titleColor'])
    for k in ('plant', 'tank', 'trunk', 'grass', 'plaza', 'stone', 'paint', 'track', 'field', 'roofred'):
        kit.MATS[k] = pal.flat(k)
    for k in ('foliage', 'foliage2', 'foliage3'):
        kit.MATS[k] = pal.flat(k, rough=0.9)
    kit.MATS['skylight'] = pal.flat('skylight', rough=0.2, spec=0.6)
    kit.MATS['water'] = pal.water()
    kit.MATS['spray'] = pal.flat('spray', rough=0.3)
    kit.MATS['coping'] = pal.flat('coping')
    kit.MATS['doorway'] = pal.flat('doorway', rough=0.4)
    kit.MATS['lobby'] = pal.flat('lobby', rough=0.15, spec=0.6)
    kit.MATS['seat'] = pal.flat('seat')
    kit.MATS['seat2'] = pal.flat('seat2')
    kit.MATS['people'] = [kit.person_mesh(f'person{i}', m) for i, m in enumerate(pal.clothes())]
    MESHES['cars'] = [kit.car_mesh(f'car{i}', m) for i, m in enumerate(pal.cars())]
    lib.box('ground', 0, 0, 4 * W, 4 * W, 0.2, pal.flat('asphalt', rough=0.95), z=-0.2, bevel=0,
            collection='ground')

    letters = title(pal.title(), data['title'])

    # employer slots and the Norwich superblock come from the '.name' entries in BANDS
    slots, superblocks, blocks = {}, [], []
    for band, i, code, x0, x1, y0, y1 in band_blocks():
        if code.startswith('.') and len(code) > 1:
            s = slots.get(code[1:])
            slots[code[1:]] = (x0, x1, y0, y1) if s is None else \
                (min(s[0], x0), max(s[1], x1), min(s[2], y0), max(s[3], y1))
        elif visible(cam, scene, x0, x1, y0, y1):
            blocks.append((x0, x1, y0, y1))
    blocks += list(slots.values())
    if 'norwich' in slots:
        x0, x1, y0, y1 = slots['norwich']
        superblocks.append((x0 - 1, x1 + 1, y0 - 1, y1 + 1))
    no_cross = superblocks + [(s[0] - 7, s[1] + 7, s[2], s[3]) for k, s in slots.items() if k.startswith('name')]
    plinths(pal, blocks)
    ew = streets(pal, superblocks, no_cross)
    crosswalks(cam, scene, pal, ew, no_cross)
    fwy = MESHES['fwy'] = freeway(pal, MESHES['cars'])

    companies = {c['id']: c for c in data['companies'] + data.get('education', [])}
    sites = {}
    for slot, cid in PLACES.items():
        if cid is None or slot not in slots:
            continue
        x0, x1, y0, y1 = slots[slot]
        site = hq.build(cid, (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, pal)
        sites[cid] = site
        logos.place(cid, site, mode, clay=pal.clay, name=companies[cid]['name'], pal=pal)

    for band, i, code, x0, x1, y0, y1 in band_blocks():
        if code.startswith('.') or not visible(cam, scene, x0, x1, y0, y1):
            continue
        for j, (c, lx0, lx1) in enumerate(lots(code, x0, x1)):
            if near_corridor(lx0, lx1, y0, y1, 4):
                # under the freeway: surface parking or a strip of lawn, alternating
                c = 'Y' if zlib.crc32(f'{band}{i}{j}'.encode()) % 3 else 'A'
            build_lot(f'{band}{i}{j}', c, lx0, lx1, y0, y1, pal)
    for name, code, x0, x1, y0, y1 in EXTRA_LOTS:
        for j, (c, lx0, lx1) in enumerate(lots(code, x0, x1)):
            build_lot(f'{name}{j}', c, lx0, lx1, y0, y1, pal)
    street_life(cam, scene, ew, pal, superblocks, fwy)
    bpy.context.view_layer.update()
    for cid, s in sites.items():
        loc = s.root.location
        v0 = world_to_camera_view(scene, cam, Vector((loc.x, loc.y, 0)))
        v1 = world_to_camera_view(scene, cam, Vector((loc.x, loc.y, s.top)))
        print(f'[site] {cid:12s} base=({v0.x:.2f},{v0.y:.2f}) top=({v1.x:.2f},{v1.y:.2f})', flush=True)
    for o, b in (letters[0], letters[-1]):
        v = world_to_camera_view(scene, cam, Vector((b[0], b[2], 0)))
        print(f'[title] {o.name} at ({v.x:.2f},{v.y:.2f})', flush=True)
    if a.get('find'):              # debug: name the objects drawn at frame point u,v
        fu, fv = (float(t) for t in a['find'].split(','))
        for o in bpy.data.objects:
            if o.type != 'MESH':
                continue
            pts = [world_to_camera_view(scene, cam, o.matrix_world @ Vector(c)) for c in o.bound_box]
            if min(p.x for p in pts) < fu < max(p.x for p in pts) and min(p.y for p in pts) < fv < max(p.y for p in pts):
                print('[find]', o.name, o.parent.name if o.parent else '', tuple(round(c) for c in o.matrix_world.translation))
        return
    if a.get('export'):
        export_scene(a['export'], sites, ew, superblocks, scene, cam, a.get('frame', 'master'), letters)
        if a.get('export-only'):
            return
    if a.get('pass') == 'id':
        id_pass(scene, sites)
    elif a.get('pass') == 'roads':
        road_pass(scene)
    elif a.get('pass') == 'logos':
        logo_pass(scene)
    elif a.get('pass') == 'depth':
        depth_pass(scene)
    lib.save(scene, a['out'], a.get('preview'))


# ── outputs for the web page ────────────────────────────────────────────────
# Flat colours of the object-ID pass, one per site (sRGB 0-255 after the Standard transform).
ID_COLORS = [(1, 0, 0), (0, 1, 0), (0, 0, 1), (1, 1, 0), (1, 0, 1), (0, 1, 1), (1, 1, 1),
             (1, 0.5, 0), (0.5, 0, 1)]


def id_colors(sites):
    def srgb(c):
        return round(255 * (12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055))
    return {cid: [srgb(c) for c in ID_COLORS[i]] for i, cid in enumerate(sites)}


def id_pass(scene, sites):
    """Object-ID pass: each site (building, plaza, sign and everything parented to it) in one flat
    colour, everything else black. Same camera and geometry as the beauty render, so it lines up
    pixel for pixel and shows only the visible part of each site."""
    flat_pass(scene)
    for i, (cid, s) in enumerate(sites.items()):
        for o in [s.root] + list(s.root.children_recursive):
            o.color = (*ID_COLORS[i], 1)


def flat_pass(scene):
    """Workbench set up for exact flat colours (no anti-aliasing, lighting or colour management)."""
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.dither_intensity = 0.0           # exact colours, no dither noise
    scene.display.render_aa = 'OFF'
    sh = scene.display.shading
    sh.light, sh.color_type = 'FLAT', 'OBJECT'
    sh.show_object_outline = sh.show_cavity = sh.show_shadows = False
    sh.show_specular_highlight = sh.show_xray = False
    scene.world.color = (0, 0, 0)
    vs = scene.view_settings
    vs.view_transform, vs.look, vs.exposure, vs.gamma = 'Standard', 'None', 0.0, 1.0
    for o in scene.objects:
        o.color = (0, 0, 0, 1)


def logo_pass(scene):
    """Logo pass for the legibility check (scripts/hero-strokes.mjs): every logo shape in its own
    flat SVG colour, everything else magenta, so strokes and counters can be measured per colour."""
    flat_pass(scene)
    scene.world.color = (1, 0, 1)
    for o in scene.objects:
        o.color = (1, 0, 1, 1)
        if o.name.startswith('logo_') and o.type == 'CURVE' and o.material_slots and o.material_slots[0].material:
            m = o.material_slots[0].material
            o.color = tuple(m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value)


def road_pass(scene):
    """Road-visibility pass: the visible street surface red, the visible freeway deck green, all
    else black. The page masks its car sprites with it, so cars pass behind whatever stands in
    front of a road (buildings, trees, the freeway over an avenue)."""
    flat_pass(scene)
    for o in scene.objects:
        n = o.name
        if n.startswith(('ew', 'ns_', 'bridge', 'zb')):
            o.color = (1, 0, 0, 1)
        elif n in ('fwy.deck', 'fwy.edges', 'fwy.lanes', 'fwy.edge-1', 'fwy.edge+1') or \
                (n.startswith('ramp_') and n.endswith(('.deck', '.taper'))):
            o.color = (0, 1, 0, 1)


def depth_pass(scene):
    """Depth pass for the road masks (scripts/hero-mask.mjs): each pixel's distance from the camera
    plane in quarter metres, as 16 bits in red (high byte) and green (low byte). The mask grows a
    road upward only into pixels at least as far away as a car's roof on that road, so a sprite
    never shows over something standing in front of it."""
    flat_pass(scene)
    scene.view_settings.view_transform = 'Raw'
    scene.view_layers[0].use_pass_z = True
    scene.render.use_compositing = True
    scene.use_nodes = True
    nt = scene.node_tree
    nt.nodes.clear()
    rl = nt.nodes.new('CompositorNodeRLayers')
    out = nt.nodes.new('CompositorNodeComposite')

    def math(op, a, b=None):
        n = nt.nodes.new('CompositorNodeMath')
        n.operation = op
        for k, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[k].default_value = v
            else:
                nt.links.new(v, n.inputs[k])
        return n.outputs[0]
    q = math('MINIMUM', math('MULTIPLY', rl.outputs['Depth'], 4.0), 65535.0)
    hi = math('FLOOR', math('DIVIDE', q, 256.0))
    lo = math('SUBTRACT', q, math('MULTIPLY', hi, 256.0))
    comb = nt.nodes.new('CompositorNodeCombineColor')
    comb.mode = 'RGB'
    nt.links.new(math('DIVIDE', hi, 255.0), comb.inputs[0])
    nt.links.new(math('DIVIDE', math('ROUND', lo), 255.0), comb.inputs[1])
    comb.inputs[2].default_value = 0.0
    nt.links.new(comb.outputs[0], out.inputs[0])


def lanes(ew, superblocks):
    """Traffic lanes as polylines in the direction of travel (right-hand traffic), taken from
    the same street pieces and freeway spline the render builds: [{'road', 'z', 'pts'}]."""
    out = []
    for a, b in ew:
        if (a, b) == CANAL:
            continue
        w = b - a
        # lane centres from each kerb: clear of the cars parked at 1.6 m (a bus is 2.6 m wide)
        offs = [4.6, 8.0] if w >= 18 else [4.0]
        cuts = sorted((sx0, sx1) for sx0, sx1, sy0, sy1 in superblocks if sy0 < (a + b) / 2 < sy1)
        x = -W - PITCH
        for sx0, sx1 in cuts + [(W + PITCH, W + PITCH)]:
            if sx0 > x:
                for o in offs:
                    out.append({'road': 'street', 'z': 0, 'pts': [[round(x, 1), a + o], [round(sx0, 1), a + o]]})
                    out.append({'road': 'street', 'z': 0, 'pts': [[round(sx0, 1), b - o], [round(x, 1), b - o]]})
            x = max(x, sx1)
    pts = [Vector((p.x, p.y, 0)) for p in MESHES['fwy']]
    nrm = frames(pts)
    for off in (-9.4, -3.8, 3.8, 9.4):                      # n is the left normal: off < 0 drives forward
        line = [[round(p.x + n.x * off, 1), round(p.y + n.y * off, 1)] for p, n in zip(pts, nrm)]
        out.append({'road': 'freeway', 'z': FWY_Z, 'pts': line if off < 0 else line[::-1]})
    return out


def export_scene(path, sites, ew, superblocks, scene, cam, frame_name, letters):
    """The world facts the page needs to animate sprites over the still (see README)."""
    import json
    w, h = FRAMES[frame_name]['res']
    probes = [(0, 0, 0), (-300, 200, 0), (250, -150, 0), (100, 300, 40), (-34, 28, 11)]
    checks = []
    for p in probes:                       # the page's projection is verified against these
        v = world_to_camera_view(scene, cam, Vector(p))
        checks.append([*p, round(v.x * w, 2), round((1 - v.y) * h, 2)])
    boxes = []                             # each title letter's box in the image (sprites keep off them)
    for o, _ in letters:
        vs = [world_to_camera_view(scene, cam, o.matrix_world @ Vector(c)) for c in o.bound_box]
        boxes.append([round(min(v.x for v in vs) * w), round((1 - max(v.y for v in vs)) * h),
                      round(max(v.x for v in vs) * w), round((1 - min(v.y for v in vs)) * h)])
    signs = {}                             # each employer mark's box in the image (legibility check)
    for cid in sites:
        vs = [world_to_camera_view(scene, cam, o.matrix_world @ Vector(c))
              for o in bpy.data.objects if o.name.startswith(f'logo_{cid}.') for c in o.bound_box]
        if vs:
            signs[cid] = [round(min(v.x for v in vs) * w, 1), round((1 - max(v.y for v in vs)) * h, 1),
                          round(max(v.x for v in vs) * w, 1), round((1 - min(v.y for v in vs)) * h, 1)]
    data = {
        'camera': {'azimuth': lib.CAM_AZ, 'elevation': lib.CAM_ELEV},
        'sun': {'shadowAzimuth': lib.SUN_SHADOW_AZ, 'elevation': lib.SUN_ELEV},
        'frames': {k: {'target': list(f.get('target', TARGET)), 'widthM': f['width'], 'res': list(f['res'])}
                   for k, f in FRAMES.items() if k not in ('crop', 'ramps')},
        'streets': [[a, b] for a, b in ew if (a, b) != CANAL],
        'canal': list(CANAL),
        'freeway': {'z': FWY_Z, 'width': FWY_W, 'lanes': [-9.4, -3.8, 3.8, 9.4],
                    'points': [[round(p.x, 1), round(p.y, 1)] for p in MESHES['fwy']]},
        'sites': {cid: {'x': round(s.root.location.x, 1), 'y': round(s.root.location.y, 1),
                        'top': round(s.top, 1)} for cid, s in sites.items()},
        'palette': {'cars': palette.CARS, 'signPanel': palette.CHROME['panel'], 'signFrame': palette.CHROME['frame'],
                    'asphalt': palette.C['asphalt'], 'cream': palette.C['stone'],
                    'glass': palette.C['glass'], 'foliage': palette.C['foliage']},
        'balloons': [{'x': 46, 'y': 104, 'z': 150}, {'x': -93, 'y': -202, 'z': 150}, {'x': 273, 'y': 36, 'z': 140}],
        'lanes': lanes(ew, superblocks),
        # ramp lanes in driving order, [x, y, z] (the off-ramp leaves the freeway's outer lane, the
        # on-ramp joins it): for traffic sprites
        'rampLanes': [{'name': r['name'], 'kind': r['kind'], 'pts': r['lane'], 'tangents': r['tangents']}
                      for r in MESHES.get('ramps', [])],
        'checks': {frame_name: checks},
        'titleBoxes': {frame_name: boxes},
        'signBoxes': {frame_name: signs},
        'idColors': id_colors(sites),
    }
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=1)
    print(f'[export] {path}', flush=True)


main()
