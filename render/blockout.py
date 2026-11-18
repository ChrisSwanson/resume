"""Milestone 2: clay blockout of the composition. Three original arrangements (A, B, C) of the
same parts: the name as letter-shaped buildings, the eight employer sites, and 15-25
surrounding masses, all in one matte clay under the locked camera and light.

    blender -b --factory-startup -P render/blockout.py -- --arr A [--portrait] [--key]
        [--samples 256] [--scale 100] --out <png> [--preview <jpg>]

--key colours the letters with THEME.titleColor and each employer site with its accent, so a
reviewer can see which mass is which. Arrangement data is hand-placed: no seeded grid.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402
from mathutils import Vector  # noqa: E402

import kit  # noqa: E402
import lib  # noqa: E402

F = lib.FLOOR
CAP = 34.0                       # cap height of the name's letter footprints, metres
SIZE = CAP / 0.5817              # font size giving that cap height in the title face


# ── arrangements ────────────────────────────────────────────────────────────
# Local frame: X runs along the name (screen: down-right, shallow), Y across it (screen: up-right,
# steep). The camera sits toward +X/-Y, so low Y is foreground and high Y is background.
# Each road is (x0, y0, x1, y1) as an axis rectangle, or ('ring', cx, cy, r_out, r_in).
# Sites are (name, kind, x, y, rot, params); employer sites are keyed by content id.
# An arrangement function gets the name's footprint: nx0/nx1 (ends) and g0/g1 (word space).

def arrangement_a(nx0, nx1, g0, g1):
    """A, "Avenue": the name fronts the main avenue; employers alternate behind and in front of
    it in reading order (oldest first); dense uneven blocks bleed off every edge."""
    gx = (g0 + g1) / 2
    W = 1200
    return dict(
        target=(0, 20, 0), width=560, ptarget=(-10, 10, 0), pwidth=470,
        heights=[5, 5, 6, 6, 5, 6, 5, 5, 6, 6, 5, 6],
        roads=[
            (-W, -32, W, -12),                     # the avenue in front of the name
            (-W, 50, W, 60),                       # service street behind the letters
            (-W, 150, W, 162),
            (-W, 262, W, 274),
            (-W, -120, W, -108),
            (-W, -222, W, -210),
            (-W, -330, W, -318),
            (gx - 6, -W, gx + 6, W),               # cross street through the word space
            (nx0 - 24, -W, nx0 - 12, W),           # the name block's ends
            (nx1 + 12, -W, nx1 + 24, W),
            (-180, 60, -170, W), (80, 60, 90, W),  # back cross streets
            (190, 60, 200, 150),
            (90, -W, 100, -32), (190, -W, 200, -32),   # front cross streets, offset from the back
            (-160, -W, -150, -120),
        ],
        employers={
            # back row, y 60..150
            'tivo': ('campus', -245, 103, 0, dict(wings=[(-30, 18, 34, 26, 2), (20, -18, 50, 22, 3), (34, 24, 26, 22, 2)],
                                                   rotunda=(-28, -16, 13, 2))),
            'twitch': ('stepped', -115, 103, 0, dict(w=96, d=80, fl=9, steps=4)),
            'marqeta': ('drum', 15, 103, 0, dict(r=22, fl=12, podium=(100, 76, 2))),
            'wellsfargo': ('tower', 140, 105, 0, dict(w=46, d=46, fl=26, pod=(96, 80, 3),
                                                     setbacks=((0.8, 0.55), (0.6, 0.82)))),
            # front row, y -108..-32
            'palantir': ('courtyard', -150, -70, 0, dict(w=74, d=70, t=16, fl=6)),
            'wework': ('sawtooth', 15, -70, 0, dict(w=100, d=66, fl=4, teeth=6)),
            'idme': ('twin', 145, -70, 0, dict(w=82, d=24, gap=16, fl=8)),
            'chainalysis': ('chain', 255, -70, 0, dict(size=34, n=3, fl=4, step=30)),
        },
        fillers=[
            # left of the name, bleeding off the left edge
            ('l1', 'stadium', nx0 - 60, 15, 90, dict(w=80, d=50, fl=7, ends=1)),
            ('l2', 'lshape', nx0 - 70, 105, 0, dict(w=90, d=80, wing=26, fl=9, fl2=12)),
            ('l3', 'drum', -250, -70, 0, dict(r=26, fl=4, podium=(76, 66, 1))),
            # back rows: the tallest masses, a skyline behind the name
            ('b1', 'stadium', -230, 205, 0, dict(w=100, d=40, fl=12)),
            ('b2', 'deck', -112, 190, 0, dict(w=80, d=50, levels=5)),
            ('b3', 'courtyard', 25, 205, 0, dict(w=100, d=86, t=20, fl=10, gate=False)),
            ('b4', 'chamfer', 150, 205, 0, dict(w=100, d=86, fl=15, c=26)),
            ('b5', 'ushape', -95, 318, 0, dict(w=150, d=84, t=24, fl=11)),
            ('b6', 'tower', 40, 318, 0, dict(w=50, d=46, fl=24, pod=(96, 84, 3), setbacks=((0.8, 0.7),))),
            ('b7', 'stepped', 160, 318, 0, dict(w=90, d=84, fl=16, steps=3)),
            ('b8', 'shed', 260, 205, 0, dict(w=80, d=80, fl=3, vents=4)),
            ('b9', 'tower', -330, 205, 0, dict(w=44, d=44, fl=18, pod=(76, 80, 2), setbacks=())),
            # right of the name, bleeding off the right edge
            ('r1', 'stadium', nx1 + 70, 10, 90, dict(w=90, d=60, fl=8, ends=1)),
            ('r2', 'lshape', 360, -70, 0, dict(w=90, d=70, wing=24, fl=5)),
            ('r3', 'chamfer', 260, 103, 0, dict(w=100, d=74, fl=12, c=22)),
            # front rows: lower, so they never cover the letters
            ('f1', 'lshape', -205, -165, 0, dict(w=80, d=86, wing=26, fl=4, fl2=6)),
            ('f2', 'stadium', -95, -150, 0, dict(w=90, d=34, fl=3)),
            ('f4', 'courtyard', 145, -165, 0, dict(w=82, d=84, t=18, fl=5, gate=False)),
            ('f5', 'stadium', 260, -165, 0, dict(w=110, d=60, fl=4)),
            ('f6', 'chamfer', -95, -270, 0, dict(w=110, d=90, fl=7, c=30)),
            ('f7', 'deck', 30, -270, 0, dict(w=100, d=70, levels=3)),
            ('f8', 'lshape', 145, -270, 0, dict(w=86, d=86, wing=28, fl=6)),
            ('f9', 'ushape', -220, -270, 0, dict(w=100, d=86, t=26, fl=5)),
        ],
        # (x, y, trees, spread)
        groves=[(30, -165, 16, 34), (-95, -188, 8, 18), (300, 150, 8, 14), (-290, -100, 7, 10),
                (gx, 120, 5, 8), (-60, 205, 6, 12)],
        ponds=[(40, -160, 26, 16)],
    )


def arrangement_b(nx0, nx1, g0, g1):
    """B, "Park edge": the name is the front of a city that rises behind it, facing a wooded park
    with a pond in the foreground; every employer sits in the city, in the upper-right half."""
    gx = (g0 + g1) / 2
    W = 1200
    return dict(
        target=(-28, 62, 0), width=560, ptarget=(-40, 70, 0), pwidth=470,
        heights=[4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 7],
        roads=[
            (-W, -24, W, -10),                     # promenade between the park and the name
            (-W, 50, W, 60),
            (-W, 140, W, 152),
            (-W, 236, W, 248),
            (-W, 336, W, 348),
            (-W, 436, W, 448),
            (-W, -190, W, -176),                   # the far side of the park
            (gx - 6, -10, gx + 6, W),              # the word space continues as a street
            (nx0 - 24, -10, nx0 - 12, 60),
            (nx1 + 12, -W, nx1 + 24, W),
            (-318, 60, -310, W), (-205, 60, -197, W), (40, 60, 48, W), (222, 60, 230, W),
            (140, 152, 148, W),
            (-60, -W, -50, -190), (120, -W, 130, -190),
            (-W, 536, W, 548), (-W, 636, W, 648), (-W, 736, W, 748), (-440, 60, -432, W),
            (-W, -290, W, -280), (-W, -390, W, -380), (-W, -490, W, -480), (-W, -590, W, -580),
            (-W, -690, W, -680), (250, -W, 258, -190), (380, -W, 388, -24), (500, -W, 508, -24),
        ],
        outer=[
            # the far city (top of the portrait): the skyline climbs away from the name
            (392, [(-257, 'slab', dict(w=100, d=80, fl=15)), (-375, 'stadium', dict(w=110, d=60, fl=12)),
                   (-500, 'courtyard', dict(w=110, d=80, t=24, fl=10, gate=False))]),
            (492, [(-500, 'tower', dict(w=50, d=50, fl=24, pod=(100, 80, 3), setbacks=())),
                   (-375, 'chamfer', dict(w=110, d=80, fl=16, c=26)),
                   (-257, 'stepped', dict(w=100, d=80, fl=20, steps=3)),
                   (-130, 'tower', dict(w=60, d=50, fl=30, pod=(110, 80, 4), setbacks=((0.8, 0.6), (0.6, 0.85)))),
                   (-5, 'lshape', dict(w=84, d=80, wing=30, fl=16, fl2=22)), (94, 'drum', dict(r=30, fl=18, podium=(84, 80, 3)))]),
            (592, [(-500, 'ushape', dict(w=110, d=80, t=26, fl=14)), (-375, 'tower', dict(w=56, d=56, fl=34, pod=(110, 80, 3), setbacks=((0.7, 0.8),))),
                   (-257, 'slab', dict(w=100, d=80, fl=18)), (-130, 'courtyard', dict(w=110, d=80, t=24, fl=14, gate=False)),
                   (-5, 'chamfer', dict(w=84, d=80, fl=24, c=30))]),
            (692, [(-500, 'stepped', dict(w=110, d=80, fl=24, steps=3)), (-375, 'slab', dict(w=110, d=80, fl=20)),
                   (-257, 'tower', dict(w=60, d=60, fl=36, pod=(100, 80, 4), setbacks=((0.75, 0.7),))),
                   (-130, 'stadium', dict(w=110, d=70, fl=22))]),
            (792, [(-500, 'slab', dict(w=110, d=80, fl=26)), (-375, 'courtyard', dict(w=110, d=80, t=26, fl=20, gate=False)),
                   (-257, 'lshape', dict(w=100, d=80, wing=30, fl=24))]),
            # the near side (bottom of the portrait): a low campus district past the park
            (-235, [(190, 'shed', dict(w=110, d=80, fl=3, vents=4)), (320, 'lshape', dict(w=110, d=80, wing=28, fl=4)),
                    (445, 'deck', dict(w=100, d=60, levels=3))]),
            (-335, [(-130, 'courtyard', dict(w=110, d=80, t=24, fl=5, gate=False)), (30, 'stadium', dict(w=120, d=60, fl=4)),
                    (190, 'chamfer', dict(w=110, d=80, fl=5, c=24)), (320, 'shed', dict(w=110, d=80, fl=2, vents=5)),
                    (445, 'ushape', dict(w=100, d=80, t=24, fl=5)), (570, 'slab', dict(w=110, d=80, fl=6))]),
            (-435, [(30, 'deck', dict(w=120, d=70, levels=4)), (190, 'lshape', dict(w=110, d=80, wing=30, fl=6)),
                    (445, 'stadium', dict(w=100, d=60, fl=5, ends=1)), (570, 'courtyard', dict(w=110, d=80, t=24, fl=6, gate=False))]),
            (-535, [(190, 'shed', dict(w=110, d=80, fl=2, vents=4)), (320, 'chamfer', dict(w=110, d=80, fl=7, c=26)),
                    (445, 'slab', dict(w=100, d=80, fl=5)), (570, 'stepped', dict(w=110, d=80, fl=8, steps=3))]),
            (-635, [(320, 'courtyard', dict(w=110, d=80, t=26, fl=6, gate=False)), (445, 'deck', dict(w=100, d=60, levels=3)),
                    (570, 'lshape', dict(w=110, d=80, wing=30, fl=6))]),
        ],
        employers={
            # row 1 (y 60..140), directly behind the name
            'tivo': ('campus', -257, 100, 0, dict(wings=[(-14, 16, 50, 26, 3), (4, -16, 62, 22, 2)],
                                                   rotunda=(34, 14, 15, 3))),
            'twitch': ('stepped', -130, 100, 0, dict(w=100, d=74, fl=10, steps=3)),
            'wework': ('sawtooth', -5, 100, 0, dict(w=80, d=70, fl=4, teeth=5)),
            'idme': ('twin', 170, 100, 0, dict(w=84, d=26, gap=16, fl=10)),
            # row 2 (y 152..236)
            'chainalysis': ('chain', -130, 194, 0, dict(size=34, n=3, fl=5, step=32)),
            'wellsfargo': ('tower', -5, 194, 0, dict(w=48, d=48, fl=24, pod=(84, 76, 4),
                                                    setbacks=((0.8, 0.55), (0.58, 0.83)))),
            'palantir': ('courtyard', 94, 194, 0, dict(w=84, d=76, t=18, fl=7)),
            # row 3 (y 248..336)
            'marqeta': ('drum', -5, 292, 0, dict(r=24, fl=13, podium=(84, 80, 2))),
        },
        fillers=[
            ('c1', 'stadium', 82, 100, 90, dict(w=74, d=56, fl=6, ends=1)),
            ('c2', 'lshape', 300, 100, 0, dict(w=110, d=74, wing=26, fl=9)),
            ('c3', 'tower', -360, 100, 0, dict(w=40, d=40, fl=15, pod=(80, 74, 2), setbacks=())),
            ('c4', 'ushape', -257, 194, 0, dict(w=100, d=76, t=24, fl=11)),
            ('c5', 'chamfer', 185, 194, 0, dict(w=70, d=76, fl=13, c=22)),
            ('c6', 'slab', -380, 194, 0, dict(w=110, d=76, fl=14)),
            ('c7', 'courtyard', -257, 292, 0, dict(w=100, d=80, t=22, fl=12, gate=False)),
            ('c8', 'deck', -130, 290, 0, dict(w=100, d=60, levels=6)),
            ('c9', 'stadium', 94, 292, 0, dict(w=84, d=56, fl=16)),
            ('c10', 'stepped', 185, 292, 0, dict(w=70, d=80, fl=18, steps=3)),
            ('c11', 'tower', -130, 392, 0, dict(w=54, d=50, fl=26, pod=(100, 80, 3), setbacks=((0.75, 0.7),))),
            ('c12', 'lshape', -5, 392, 0, dict(w=84, d=80, wing=28, fl=14, fl2=18)),
            ('c13', 'chamfer', 94, 392, 0, dict(w=84, d=80, fl=20, c=24)),
            ('c14', 'slab', nx1 + 70, 0, 90, dict(w=100, d=60, fl=7)),
            ('c15', 'shed', 300, 194, 0, dict(w=110, d=76, fl=3, vents=4)),
            ('c16', 'lshape', nx0 - 70, 10, 0, dict(w=90, d=56, wing=24, fl=6)),
            ('c17', 'deck', 300, -100, 90, dict(w=90, d=50, levels=2)),
            # the near bank: pavilions in the park, a low strip along the bottom edge
            ('p1', 'shed', -150, -60, 0, dict(w=50, d=24, fl=1, vents=2)),
            ('p2', 'drum', 175, -60, 0, dict(r=14, fl=1, crown=False)),
            ('s1', 'lshape', -150, -250, 0, dict(w=150, d=90, wing=30, fl=4)),
            ('s2', 'courtyard', 30, -250, 0, dict(w=130, d=90, t=24, fl=4, gate=False)),
        ],
        groves=[(-330, -100, 60, 56), (-215, -125, 56, 50), (-95, -150, 30, 32), (-120, -78, 14, 18),
                (-260, -50, 18, 22), (125, -145, 34, 34), (245, -115, 52, 48), (335, -55, 24, 30),
                (75, -40, 10, 16), (-20, -62, 8, 12), (gx, 120, 4, 6)],
        ponds=[(40, -95, 56, 28)],
    )


def arrangement_c(nx0, nx1, g0, g1):
    """C, "Boulevard": the word space opens into a broad planted boulevard that crosses the name;
    the eight employers line it in pairs, so the city makes an X with the name."""
    gx = (g0 + g1) / 2
    W = 1200
    return dict(
        target=(gx + 25, 8, 0), width=580, ptarget=(gx + 20, 0, 0), pwidth=480,
        heights=[4, 5, 5, 6, 7, 7, 6, 6, 5, 5, 4, 4], word=3.6,
        roads=[
            (-W, -32, W, -14),                     # the avenue in front of the name
            (-W, 50, W, 60),
            (-W, 152, W, 164),
            (-W, 254, W, 266),
            (-W, -128, W, -116),
            (-W, -232, W, -220),
            (gx - 24, -W, gx - 8, W),              # the cross boulevard, two carriageways
            (gx + 8, -W, gx + 24, W),
            (nx0 - 24, -W, nx0 - 12, W), (nx1 + 12, -W, nx1 + 24, W),
            (gx - 160, -W, gx - 150, -32), (gx + 150, -W, gx + 160, -32),
            (gx - 160, 60, gx - 150, W), (gx + 150, 60, gx + 160, W),
            (gx + 270, 60, gx + 280, W), (gx - 280, -W, gx - 270, -32),
        ],
        rows=[(gx, -320, gx, -40), (gx, 70, gx, 420)],
        employers={
            'tivo': ('campus', gx - 85, 106, 0, dict(wings=[(-14, 16, 42, 22, 2), (10, -16, 44, 22, 3)],
                                                     rotunda=(30, 14, 12, 2))),
            'twitch': ('stepped', gx + 80, 106, 0, dict(w=90, d=82, fl=10, steps=3)),
            'marqeta': ('drum', gx - 85, 209, 0, dict(r=24, fl=10, podium=(90, 80, 2))),
            'wellsfargo': ('tower', gx + 80, 209, 0, dict(w=50, d=50, fl=27, pod=(96, 82, 4),
                                                         setbacks=((0.8, 0.55), (0.58, 0.83)))),
            'palantir': ('courtyard', gx - 85, -73, 0, dict(w=80, d=74, t=17, fl=6)),
            'wework': ('sawtooth', gx + 85, -73, 0, dict(w=100, d=70, fl=4, teeth=6)),
            'idme': ('twin', gx - 85, -175, 0, dict(w=90, d=26, gap=16, fl=7)),
            'chainalysis': ('chain', gx + 85, -175, 0, dict(size=36, n=3, fl=4, step=30)),
        },
        fillers=[
            ('w1', 'lshape', gx - 215, 106, 0, dict(w=100, d=86, wing=28, fl=8, fl2=11)),
            ('w2', 'chamfer', gx - 215, 209, 0, dict(w=100, d=84, fl=14, c=26)),
            ('w3', 'stadium', gx - 215, 310, 0, dict(w=100, d=60, fl=12)),
            ('w4', 'tower', gx - 87, 310, 0, dict(w=50, d=50, fl=22, pod=(90, 84, 3), setbacks=((0.75, 0.75),))),
            ('w5', 'slab', nx0 - 60, 0, 90, dict(w=80, d=56, fl=8)),
            ('w6', 'ushape', gx - 215, -73, 0, dict(w=100, d=76, t=24, fl=5)),
            ('w7', 'deck', gx - 215, -175, 0, dict(w=100, d=60, levels=3)),
            ('w8', 'lshape', gx - 87, -280, 0, dict(w=100, d=86, wing=26, fl=5)),
            ('w9', 'stadium', gx - 345, -73, 90, dict(w=80, d=50, fl=5, ends=1)),
            ('e1', 'chamfer', gx + 215, 106, 0, dict(w=100, d=86, fl=10, c=24)),
            ('e2', 'courtyard', gx + 215, 209, 0, dict(w=100, d=84, t=20, fl=11, gate=False)),
            ('e3', 'stepped', gx + 87, 310, 0, dict(w=100, d=86, fl=16, steps=3)),
            ('e4', 'deck', gx + 215, 300, 0, dict(w=90, d=60, levels=6)),
            ('e5', 'stadium', gx + 215, -73, 0, dict(w=100, d=50, fl=5)),
            ('e6', 'lshape', gx + 215, -175, 0, dict(w=100, d=80, wing=26, fl=4, fl2=6)),
            ('e7', 'shed', gx + 87, -280, 0, dict(w=100, d=80, fl=2, vents=4)),
            ('e8', 'slab', nx1 + 70, 10, 90, dict(w=90, d=60, fl=7)),
            ('e9', 'chamfer', gx + 340, -73, 0, dict(w=90, d=76, fl=6, c=20)),
            ('e10', 'tower', gx + 340, 106, 0, dict(w=40, d=40, fl=16, pod=(90, 80, 2), setbacks=())),
        ],
        groves=[(gx - 215, -280, 14, 30), (gx + 215, -270, 10, 22), (gx - 345, 106, 8, 16),
                (gx + 340, -175, 10, 20)],
    )


ARRANGEMENTS = {'A': arrangement_a, 'B': arrangement_b, 'C': arrangement_c}


# ── scene ───────────────────────────────────────────────────────────────────

def build(arr_key, key_colours, data):
    clay = lib.material('clay', '#cdc8be', rough=0.75, spec=0.4)
    road = lib.material('road', '#6b6e73', rough=0.9, spec=0.2)
    lib.box('ground', 0, 0, 4000, 4000, 0.2, clay, z=-0.2, bevel=0, collection='ground')

    # the name first: its word gap places the cross street
    name_mat = lib.material('title', data['titleColor'], rough=0.6) if key_colours else clay
    probe = ARRANGEMENTS[arr_key](0, 0, 0, 0)
    letters = lib.text_letters(data['title'], probe.get('size', SIZE), name_mat, 0, 0,
                               [h * F for h in probe['heights']],
                               spacing=probe.get('spacing', 1.1), word=probe.get('word', 1.0))
    split = len(data['title'].split()[0])
    arr = ARRANGEMENTS[arr_key](letters[0][1][0], letters[-1][1][1],
                                letters[split - 1][1][1], letters[split][1][0])
    print(f"[name] x {letters[0][1][0]:.0f}..{letters[-1][1][1]:.0f}, word space "
          f"{letters[split - 1][1][1]:.0f}..{letters[split][1][0]:.0f}", flush=True)

    for i, r in enumerate(arr['roads']):
        if r[0] == 'ring':
            _, cx, cy, ro, ri = r
            lib.ring(f'road{i}', cx, cy, ro, ri, 0.06 + i * 0.004, road, collection='roads')
        else:
            x0, y0, x1, y1 = r
            lib.box(f'road{i}', (x0 + x1) / 2, (y0 + y1) / 2, abs(x1 - x0), abs(y1 - y0), 0.06 + i * 0.004, road,
                    bevel=0, collection='roads')

    sites = {}
    by_id = {c['id']: c for c in data['companies']}
    for cid, (kind, x, y, rot, kw) in arr['employers'].items():
        mat = lib.material(f'acc_{cid}', by_id[cid]['accent'], rough=0.6) if key_colours else clay
        sites[cid] = kit.build(cid, kind, x, y, rot, mat, collection='employers', **kw)
    missing = set(by_id) - set(sites)
    if missing:
        raise SystemExit(f'arrangement {arr_key} does not place: {sorted(missing)}')
    for (name, kind, x, y, rot, kw) in arr['fillers']:
        kit.build(name, kind, x, y, rot, clay, **kw)
    for y, items in arr.get('outer', []):
        for x, kind, kw in items:
            kit.build(f'o{x:+.0f}{y:+.0f}', kind, x, y, 0, clay, **kw)
    for i, (x, y, n, spread) in enumerate(arr['groves']):
        if n:
            kit.grove(f'grove{i}', x, y, n, spread, clay, seed=100 + i)
    for i, (x, y, rx, ry) in enumerate(arr.get('ponds', [])):
        o = lib.cyl(f'pond{i}', x, y, rx, 0.12, road, seg=64, collection='roads')
        o.scale = (1, ry / rx, 1)
    for i, (x, y, r, h) in enumerate(arr.get('plazas', [])):
        lib.cyl(f'plaza{i}', x, y, r, h, clay, seg=64, collection='roads')
    for i, (x0, y0, x1, y1) in enumerate(arr.get('rows', [])):
        kit.row(f'row{i}', x0, y0, x1, y1, 13, clay, seed=200 + i)
    return arr, letters, sites


def report(scene, cam, letters, sites):
    """Print where each employer and the name land in the frame (0..1, origin bottom-left)."""
    bpy.context.view_layer.update()
    def px(p):
        v = world_to_camera_view(scene, cam, Vector(p))
        return round(v.x, 3), round(v.y, 3)
    for cid, s in sites.items():
        loc = s.root.location
        print(f'[site] {cid:12s} base={px((loc.x, loc.y, 0))} top={px((loc.x, loc.y, s.top))}', flush=True)
    l0, l1 = letters[0][1], letters[-1][1]
    print(f'[name] first={px((l0[0], l0[2], 0))} last={px((l1[1], l1[2], 0))}', flush=True)


def main():
    a = lib.args()
    arr_key = a.get('arr', 'A')
    portrait = bool(a.get('portrait'))
    w, h = (780, 1688) if portrait else (1440, 960)
    pct = int(a.get('scale', 100))
    scene = lib.reset()
    lib.setup_render(scene, w, h, samples=int(a.get('samples', 256)))
    scene.render.resolution_percentage = pct
    lib.world(scene)
    lib.sun()
    data = lib.content()
    arr, letters, sites = build(arr_key, bool(a.get('key')), data)
    if portrait:
        cam = lib.camera(arr['ptarget'], arr['pwidth'], aspect=w / h)
    else:
        cam = lib.camera(arr['target'], arr['width'], aspect=w / h)
    report(scene, cam, letters, sites)
    lib.save(scene, a['out'], a.get('preview'))


main()
