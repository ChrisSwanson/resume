"""The employer buildings and the Norwich campus: each a simplified miniature of the real building
(which building, and the source, in render/HQ.md). Proportions follow the real footprints and
storey counts, scaled to fit the block each one stands in. Each sits on its own paved plaza, so
it reads as a place apart from the filler blocks around it.

A builder gets the site and the usable block (w x d metres, centred on the site origin, front
toward -Y, the camera side) and returns its sign spec for logos.place: where the official mark is
built into the architecture (facade relief, roof-edge letters or a flat inlay) and how large it may
be. Sizes are set so the narrowest identifying stroke clears 2 CSS px at 1440 wide (README).
"""
import random

import kit
import lib
from palette import C

F = kit.F


def build(cid, x, y, w, d, pal):
    s = kit.Site(cid, x, y, 0, pal.clay, collection='employers')
    s.footprint = (w, d)
    s.pal = pal
    if cid != 'norwich':
        plaza(s, w - 2, d - 2)
    s.sign = BUILD[cid](s, w - 8, d - 8)
    print(f'[site-size] {cid} at ({x:.0f},{y:.0f}) usable {w - 8:.0f} x {d - 8:.0f} m', flush=True)
    return s


def plaza(s, w, d):
    """The building's own lot: light paving, planters with trees at the front corners, people."""
    pal = s.pal
    s.box(0, 0, w, d, 0.32, bevel=0.1, mat=pal.flat('plaza'))
    trees = kit.trees()
    rng = random.Random(len(s.name) * 97 + int(w))
    for i, sx in enumerate((-1, 1)):
        px, py = sx * (w / 2 - 6), -d / 2 + 6
        s.box(px, py, 7, 7, 0.8, z=0.32, bevel=0.2, mat=pal.flat('grass'))
        o = kit.instance(trees[i], f'{s.name}.pt{i}', px, py, 0, None, 'trees', scale=1.2)
        o.parent = s.root
        o.location.z = 1.1
    for o in kit.people(s.name, [(rng.uniform(-w * 0.4, w * 0.4), -d / 2 + rng.uniform(2, 9))
                                 for _ in range(10)], rng.random()):
        o.parent = s.root
        o.location.z = 0.32


def columns(s, x0, x1, y, n, r, h, z=0.0, mat=None):
    for i in range(n):
        s.cyl(x0 + (x1 - x0) * i / max(1, n - 1), y, r, h, z=z, seg=12, mat=mat)


def tivo(s, w, d):
    """2160 Gold St, Alviso: low two-storey white office blocks with blue ribbon glass, sunshade
    louvres and a rounded corner entry, set around palm-lined surface parking."""
    pal = s.pal
    s.mat = pal.facade('tivo', '#f2f0ea', '#3f78a8', '#e8e6e0', 'ribbon')
    white = pal.flat('white')
    h = 2 * 6.5
    s.box(-w * 0.22, d * 0.12, w * 0.5, d * 0.62, h)                  # 2160
    s.box(w * 0.3, d * 0.28, w * 0.36, d * 0.42, h)                   # 2190, offset north-east
    fy = d * 0.12 - d * 0.31 - 0.6
    for z in (5.6, 12.2):                                            # louvre ledges
        s.box(-w * 0.22, fy, w * 0.5, 1.4, 0.4, z=z, bevel=0.1, mat=white)
    s.cyl(-w * 0.47 + 4, d * 0.12 - d * 0.31 + 4, 6, h, seg=32)        # rounded entry corner
    s.box(-w * 0.47 + 4, d * 0.12 - d * 0.31 - 3, 10, 6, 0.6, z=4.5, bevel=0.1, mat=white)   # canopy
    s.plant(w * 0.36, d * 0.36, 10, 8, h, h=2.0)
    s.clutter(w * 0.24, d * 0.2, w * 0.2, d * 0.2, h)
    s.box(w * 0.12, -d * 0.33, w * 0.62, d * 0.26, 0.36, bevel=0, mat=pal.road(12))   # car park
    for i in range(7):                                               # palms by the car park
        px = -w * 0.2 + i * 9.5
        s.cyl(px, -d * 0.47, 0.35, 9, seg=6, mat=pal.flat('trunk'))
        s.cone(px, -d * 0.47, 3.2, 1.6, z=8.4, seg=7, mat=pal.flat('foliage3'))
    # a two-storey building cannot carry the mascot on its facade: it is inlaid in the roof
    return dict(kind='inlay', x=-w * 0.22, y=d * 0.12, z=h, w=w * 0.46, h=d * 0.58, panel=None)


def palantir(s, w, d):
    """SugarCube, 1555 Blake St, Denver: a ten-storey corner block, brick base wrapping the
    corner, a lighter upper block stepped back above it, beside the ornate 1906 Sugar Building."""
    pal = s.pal
    brick = pal.facade('palantir_base', '#9c5a43', '#3f5866', '#bdb8ad', 'punched', trim='#d9cfba')
    upper = pal.facade('palantir_top', '#e6e1d6', '#5f8a96', '#d9d4c8', 'curtain')
    sugar = pal.facade('sugar_bldg', '#c08a62', '#3f5866', '#a9a59c', 'punched', trim='#efe6d2')
    bw, bd = w * 0.66, d * 0.86
    bx = w / 2 - bw / 2
    s.box(bx, 0, bw, bd, 4 * F, mat=brick)                           # masonry base
    uw, ud = bw * 0.92, bd * 0.76
    s.box(bx + 1, 3, uw, ud, 6 * F, z=4 * F, mat=upper)              # set-back upper block
    s.box(bx + 6, 12, bw * 0.28, bd * 0.3, 1.2 * F, z=10 * F, bevel=0.2, mat=upper)  # rooftop element
    s.box(bx - bw * 0.36, -bd * 0.38, bw * 0.22, bd * 0.14, 1.1, z=4 * F, bevel=0.1, mat=pal.flat('plant'))
    sx = -w / 2 + w * 0.15                                           # the Sugar Building
    s.box(sx, d * 0.06, w * 0.28, d * 0.78, 6 * F, mat=sugar)
    s.box(sx, d * 0.06, w * 0.3, d * 0.8, 0.9, z=6 * F, bevel=0.2, mat=pal.flat('stone'))   # cornice
    s.clutter(sx, d * 0.06, w * 0.24, d * 0.6, 6 * F + 0.9)
    return dict(kind='roof', x=bx + 1, y=3 - ud / 2, z=10 * F, w=uw - 3, h=16.0, coping='#d9d4c8')


def twitch(s, w, d):
    """350 Bush St, San Francisco: a nineteen-storey green-glass tower on a two-storey podium,
    behind the preserved 1923 Mining Exchange temple front with its Corinthian columns."""
    pal = s.pal
    glass = pal.facade('twitch_glass', '#9fbfb2', '#4f8a7c', '#d9d4c8', 'curtain')
    stone = pal.facade('mining_exchange', '#e6dcc6', '#e6dcc6', '#d9cfba', 'plain')
    s.box(0, 4, w * 0.82, d * 0.92, 2 * F, mat=pal.facade('twitch_podium', '#d9d1c0', '#3f5866',
                                                           '#c9c4b9', 'ribbon'))
    tw, td = w * 0.62, d * 0.62
    s.box(0, 8, tw, td, 17 * F, z=2 * F, mat=glass)                  # tower shaft
    s.box(0, 8, tw - 6, td - 6, 1.2 * F, z=19 * F, bevel=0.2, mat=glass)   # stepped glass crown
    # the Mining Exchange on the street front
    ex, ed, eh = w * 0.42, 13.0, 16.0
    ey = -d / 2 + ed / 2
    s.box(0, ey + 2, ex, ed - 4, eh - 2, mat=stone)                  # cella
    s.box(0, ey - ed / 2 + 1.2, ex + 1, 2.4, 1.0, mat=stone)         # stylobate
    columns(s, -ex / 2 + 2, ex / 2 - 2, ey - ed / 2 + 1.6, 6, 0.75, eh - 4, z=1.0, mat=stone)
    s.box(0, ey, ex + 1.5, ed + 0.5, 1.6, z=eh - 3.0, bevel=0.15, mat=stone)    # entablature
    s.gable(0, ey, ed + 0.5, ex + 1.5, 3.0, z=eh - 1.4, rot=90, mat=stone)       # pediment
    return dict(kind='roof', x=0, y=8 - td / 2, z=19 * F, w=tw - 4, h=17.0, coping='#2b3a3a')


def wework(s, w, d):
    """115 W 18th St, Chelsea: a broad eight-storey 1917 loft block in the street wall, flat roof
    with water tanks and plant."""
    pal = s.pal
    s.mat = pal.facade('wework_loft', '#c9a27c', '#3f5866', '#a9a59c', 'punched', trim='#ece4d4')
    lw, ld = w * 0.96, d * 0.86
    s.box(0, 0, lw, ld, 8 * F)
    s.box(0, 0, lw + 0.8, ld + 0.8, 0.8, z=8 * F - 0.8, bevel=0.15, mat=pal.flat('stone'))  # cornice
    wood = pal.flat('tank')
    for x, y in ((lw * 0.28, ld * 0.22), (-lw * 0.1, ld * 0.28)):     # water tanks on legs
        for dx in (-1.6, 1.6):
            for dy in (-1.6, 1.6):
                s.box(x + dx, y + dy, 0.4, 0.4, 2.4, z=8 * F, bevel=0, mat=pal.flat('plant'))
        s.cyl(x, y, 2.6, 4.2, z=8 * F + 2.4, seg=16, mat=wood)
        s.cone(x, y, 2.8, 1.4, z=8 * F + 6.6, seg=16, mat=wood)
    s.plant(-lw * 0.3, ld * 0.1, 14, 10, 8 * F, h=2.4)
    s.clutter(lw * 0.1, -ld * 0.1, lw * 0.5, ld * 0.3, 8 * F)
    return dict(kind='roof', x=0, y=-ld / 2, z=8 * F, w=lw - 8, h=17.0, coping='#ece4d4')


def marqeta(s, w, d):
    """180 Grand Ave, Oakland: a fifteen-storey 1981 office slab with a ten-level parking
    garage behind it."""
    pal = s.pal
    s.mat = pal.facade('marqeta', '#d8d2c4', '#34505e', '#c9c4b9', 'ribbon')
    sw, sd = w * 0.98, d * 0.46
    sy = -d / 2 + sd / 2
    s.box(0, sy, sw, sd, 15 * F)
    s.plant(sw * 0.3, sy + 4, 14, sd * 0.4, 15 * F, h=3.0)
    gw, gd = w * 0.5, d * 0.48
    g = s.sub('garage', -w * 0.18, d / 2 - gd / 2)
    g.mat = pal.flat('deck')
    kit.deck(g, gw - 16, gd - 2, 9)                                  # garage behind
    return dict(kind='facade', x=0, y=sy - sd / 2, z=15 * F - 1.2 - 5.4, w=sw - 2, h=9.0,
                fascia='#f2efe8', pad=1.0)


def idme(s, w, d):
    """8280 Greensboro Dr, Tysons: a ten-storey 1985 office slab with a stepped plan, precast
    bands and ribbon glass."""
    pal = s.pal
    s.mat = pal.facade('idme', '#e2dccf', '#4f7f8c', '#d9d4c8', 'ribbon')
    a_w, a_d = w * 0.6, d * 0.6
    s.box(-w * 0.18, -d / 2 + a_d / 2, a_w, a_d, 10 * F)
    s.box(w * 0.22, d / 2 - a_d / 2, a_w, a_d, 10 * F)
    s.plant(w * 0.25, d * 0.15, 14, 10, 10 * F, h=2.6)
    s.clutter(w * 0.3, d / 2 - a_d / 2, a_w * 0.5, a_d * 0.6, 10 * F)
    return dict(kind='roof', x=-w * 0.18, y=-d / 2, z=10 * F, w=a_w - 8, h=24.0, coping='#d9d4c8')


def chainalysis(s, w, d):
    """114 Fifth Ave, New York: an eighteen-storey 1909 Beaux-Arts loft tower on its corner,
    rising well above lower neighbours."""
    pal = s.pal
    s.mat = pal.facade('fifth_ave', '#e3d6bd', '#3f5866', '#bdb8ad', 'punched', trim='#f2ead8',
                       ground='#6b5a48')
    stone = pal.flat('stone')
    tw, td = w * 0.7, d * 0.6
    ty = -d / 2 + td / 2 + 3
    s.box(0, ty, tw, td, 18 * F)
    s.box(0, ty, tw + 1.2, td + 1.2, 1.0, z=18 * F - 1.0, bevel=0.2, mat=stone)  # cornice
    s.box(0, ty, tw + 0.8, td + 0.8, 0.8, z=3 * F, bevel=0.15, mat=stone)        # base course
    s.box(tw * 0.38, ty + td / 2 - 5, 8, 6, 3.0, z=18 * F, mat=pal.flat('plant'))   # bulkhead
    s.box(-w * 0.1, d / 2 - d * 0.22, w * 0.7, d * 0.4, 6 * F,
          mat=pal.facade('fifth_nbr', '#b98a6a', '#4f6c7a', '#a9a59c', 'punched'))   # lower neighbour
    return dict(kind='inlay', x=-tw * 0.12, y=ty, z=18 * F, w=td - 3, h=td - 3, panel=None)


def wellsfargo(s, w, d):
    """420 Montgomery / 464 California St, San Francisco: a twelve-storey 1959 modernist slab
    running through the block, with the low former museum and banking-hall wing in front."""
    pal = s.pal
    s.mat = pal.facade('wf_slab', '#e6e4de', '#4f6c7a', '#d9d4c8', 'punched')
    hall = pal.facade('wf_hall', '#ddd2bb', '#3f5866', '#c9c4b9', 'plain', ground='#b9ad95')
    sw, sd = w * 0.98, d * 0.42
    sy = d / 2 - sd / 2
    s.box(0, sy, sw, sd, 12 * F)
    s.box(sw * 0.25, sy, sw * 0.3, sd * 0.6, 1.3 * F, z=12 * F, bevel=0.2)   # penthouse
    s.box(-w * 0.12, -d / 2 + d * 0.27, w * 0.6, d * 0.5, 2.5 * F, mat=hall)  # banking-hall wing
    columns(s, -w * 0.12 - w * 0.27, -w * 0.12 + w * 0.27, -d / 2 + d * 0.02 - 0.6, 8, 0.7,
            2.5 * F - 0.4, mat=pal.flat('stone'))
    s.box(-w * 0.12, -d / 2 + d * 0.27, w * 0.4, d * 0.3, 0.4, z=2.5 * F, bevel=0.1, mat=pal.flat('grass'))
    return dict(kind='facade', x=0, y=sy - sd / 2, z=12 * F - 1.0 - 5.5, w=sw - 3, h=9.0,
                fascia='#e9e1cf', pad=1.0)


NORWICH_FRONT = (150.0, 16.0, 4)     # the front hall: length, depth, storeys
NORWICH_SIGN_W = 90.0                # the lockup's width on its parapet, metres


def norwich(s, w, d):
    """Norwich University, Northfield VT: the Upper Parade Ground, a long lawn framed by red-brick
    barracks and halls with slate roofs and white trim, Jackman Hall with its portico and cupola
    closing one end, and the brick White Memorial Chapel with its clock steeple one block over."""
    pal = s.pal
    s.mat = pal.facade('norwich_brick', '#9b4a36', '#2f3d45', '#4f565c', 'punched', trim='#f2efe6')
    slate, white = pal.flat('slate'), pal.flat('white')
    s.box(0, 0, w + 6, d + 6, 0.3, bevel=0.1, mat=pal.flat('grass2'))          # campus green
    lawn_w, gap = w * 0.7, 46.0                                      # lawn between the two rows
    s.box(-w * 0.06, 0, lawn_w, gap - 14, 0.36, bevel=0.1, mat=pal.flat('field'))   # the parade lawn
    for y in (-(gap - 14) / 2 - 2.5, (gap - 14) / 2 + 2.5):
        s.box(-w * 0.06, y, lawn_w, 3, 0.38, bevel=0, mat=pal.flat('plaza'))       # walks
    xs = -w * 0.06 - lawn_w / 2
    bars = [(0.0, 0.26, 3), (0.28, 0.52, 4), (0.55, 0.78, 3), (0.8, 1.0, 4)]

    def hall(x, y, bw, bd, fl, rot=0.0):
        s.box(x, y, bw, bd, fl * F, rot=rot)
        s.box(x, y, bw + 0.6, bd + 0.6, 0.5, z=fl * F - 0.5, bevel=0.1, rot=rot, mat=white)   # cornice
        s.gable(x, y, bw, bd, min(bd, 14) * 0.38, z=fl * F, rot=rot, mat=slate)

    for side in (-1, 1):
        for i, (a, b, fl) in enumerate(bars):
            x0, x1 = xs + lawn_w * a, xs + lawn_w * b
            if side == 1 and i == 1:                                 # Chaplin Hall, end-on
                hall((x0 + x1) / 2, side * (gap / 2 + 12), 26, 18, 3, rot=90)
                continue
            hall((x0 + x1) / 2, side * (gap / 2 + 6), x1 - x0 - 3, 11, fl)
    # Jackman Hall closing the +X end: portico and cupola on the axis
    jx = xs + lawn_w + 12
    hall(jx, 0, 46, 20, 3, rot=90)
    s.box(jx - 11, 0, 3, 16, 3 * F - 1, bevel=0.15, mat=white)       # portico
    for y in (-6, -2, 2, 6):
        s.cyl(jx - 12.6, y, 0.6, 3 * F - 2.2, seg=10, mat=white)
    s.gable(jx - 11.5, 0, 16, 4, 2.6, z=3 * F - 1, rot=90, mat=white)
    s.box(jx, 0, 6, 6, 3.4, z=3 * F + 3, bevel=0.1, mat=white)       # cupola base
    s.cyl(jx, 0, 2.4, 3.2, z=3 * F + 6.4, seg=8, mat=white)
    s.cone(jx, 0, 2.7, 3.0, z=3 * F + 9.6, mat=slate)
    # far end: Goodyear Hall across the axis
    hall(xs - 10, 0, 44, 12, 3, rot=90)
    # White Memorial Chapel, one block over (toward the back, +Y), with its clock steeple
    cx, cy = -w * 0.05, d / 2 - 12
    s.box(cx, cy, 34, 15, 2.5 * F)
    s.gable(cx, cy, 34, 15, 5.0, z=2.5 * F, mat=slate)
    s.box(cx - 20, cy, 6, 6, 4.2 * F)                                # steeple tower
    s.box(cx - 20, cy, 4.4, 4.4, 3.0, z=4.2 * F, bevel=0.1, mat=white)   # belfry with the clock
    s.cone(cx - 20, cy, 2.8, 11.0, z=4.2 * F + 3.0, mat=white)       # spire
    # the front of the campus: one long hall on the avenue, facing the camera, with a white
    # parapet; the official lockup stands on it as upright letters, like the employers' roof signs
    fw, fd, ffl = NORWICH_FRONT
    fy = -d / 2 + 4 + fd / 2
    hx = w * 0.08                     # toward the city centre, so the sign is in the resting view
    s.box(hx, fy, fw, fd, ffl * F)
    s.box(hx, fy, fw + 0.6, fd + 0.6, 0.9, z=ffl * F - 0.4, bevel=0.1, mat=white)          # cornice
    s.parapet(hx, fy, fw, fd, ffl * F + 0.5, h=0.9)
    s.box(hx, fy - fd / 2 - 1.2, 18, 2.6, ffl * F * 0.45, bevel=0.1, mat=white)          # entrance bay
    s.clutter(hx - fw * 0.3, fy + 2, fw * 0.25, fd * 0.6, ffl * F)
    hall(-w * 0.35, d / 2 - 10, 36, 14, 3)
    hall(w * 0.3, d / 2 - 10, 40, 14, 4)
    kit.grove(s.name + '.trees', s.root.location.x - w * 0.42, s.root.location.y - d * 0.05, 14, 16,
              None, seed=901)
    kit.grove(s.name + '.trees2', s.root.location.x + w * 0.42, s.root.location.y + d * 0.25, 8, 12,
              None, seed=902)
    rng = random.Random(903)
    for o in kit.people(s.name, [(-w * 0.06 + rng.choice((-1, 1)) * rng.uniform(lawn_w * 0.34, lawn_w * 0.48),
                                  rng.uniform(-10, 10)) for _ in range(24)], 904):
        o.parent = s.root
        o.location.z = 0.36
    lw = NORWICH_SIGN_W
    return dict(kind='roof', x=w * 0.18, y=fy - fd / 2, z=ffl * F + 0.5, w=lw, h=lw * 0.3, depth=1.2,
                coping='#f2efe6')


BUILD = {f.__name__: f for f in (tivo, palantir, twitch, wework, marqeta, idme, chainalysis,
                                  wellsfargo, norwich)}
