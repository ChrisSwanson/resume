"""Clay massing kit for the blockout (milestone 2): one function per building typology.

Every typology is built around a local origin through a Site, which parents the pieces to
one empty so a whole building can be placed and rotated as a unit. Dimensions are metres;
heights are in storeys (lib.FLOOR). Detail (windows, parapets, materials) is milestone 3+.
"""
import math
import random
import zlib

import bpy

import lib

F = lib.FLOOR
MATS = {}       # optional named materials set by the caller: plant, skylight, tank, foliage, trunk


class Site:
    """A placed building: an empty at (x, y) rotated `rot` degrees, holding its pieces."""

    def __init__(self, name, x, y, rot=0.0, mat=None, collection='city'):
        self.name, self.mat, self.collection = name, mat, collection
        self.root = bpy.data.objects.new(name, None)
        lib.coll(collection).objects.link(self.root)
        self.root.location = (x, y, 0)
        self.root.rotation_euler = (0, 0, math.radians(rot))
        self.n = 0
        self.top = 0.0

    def _adopt(self, o, top):
        o.parent = self.root
        self.n += 1
        self.top = max(self.top, top)
        return o

    def box(self, x, y, w, d, h, z=0.0, rot=0.0, bevel=0.25, mat=None):
        h += self.n * 0.004   # no two pieces of a building share a roof plane (coplanar tops render black)
        o = lib.box(f'{self.name}.{self.n}', x, y, w, d, h, mat or self.mat, z=z, rot=rot, bevel=bevel,
                    collection=self.collection)
        return self._adopt(o, z + h)

    def cyl(self, x, y, r, h, z=0.0, seg=48, mat=None):
        h += self.n * 0.004
        o = lib.cyl(f'{self.name}.{self.n}', x, y, r, h, mat or self.mat, z=z, seg=seg, collection=self.collection)
        return self._adopt(o, z + h)

    def prism(self, pts, h, z=0.0, bevel=0.25, mat=None):
        h += self.n * 0.004
        o = lib.prism(f'{self.name}.{self.n}', pts, h, mat or self.mat, z=z, bevel=bevel, collection=self.collection)
        return self._adopt(o, z + h)

    def cone(self, x, y, r, h, z=0.0, seg=8, mat=None):
        o = lib.cone(f'{self.name}.{self.n}', x, y, r, h, mat or self.mat, z=z, seg=seg, collection=self.collection)
        return self._adopt(o, z + h)

    def sub(self, suffix, x, y):
        """A child site offset by (x, y) from this one (for a second building on the lot)."""
        c = Site(f'{self.name}.{suffix}', 0, 0, 0, self.mat, self.collection)
        c.root.parent = self.root
        c.root.location = (x, y, 0)
        return c

    def wedge(self, x0, x1, d, h, z=0.0, mat=None):
        o = lib.wedge(f'{self.name}.{self.n}', x0, x1, d, h, mat or self.mat, z=z, collection=self.collection)
        return self._adopt(o, z + h)

    def gable(self, x, y, w, d, h, z=0.0, rot=0.0, mat=None):
        o = lib.gable(f'{self.name}.{self.n}', x, y, w, d, h, mat or self.mat, z=z, rot=rot,
                      collection=self.collection)
        return self._adopt(o, z + h)

    def plant(self, x, y, w, d, z, h=2.2):
        """A rooftop plant room / HVAC block."""
        return self.box(x, y, w, d, h, z=z, bevel=0.15, mat=MATS.get('plant'))

    def parapet(self, x, y, w, d, z, h=0.7, t=0.45):
        """A low wall round the roof edge of a w x d block at height z."""
        for px, py, pw, pd in ((x, y - d / 2 + t / 2, w, t), (x, y + d / 2 - t / 2, w, t),
                               (x - w / 2 + t / 2, y, t, d - 2 * t), (x + w / 2 - t / 2, y, t, d - 2 * t)):
            self.box(px, py, pw, pd, h, z=z, bevel=0.06, mat=MATS.get('coping'))

    def entrance(self, x, y, w, kind=0):
        """A ground-floor entrance on the front (-Y) face at y: a canopy over a dark recess,
        or (kind 1) a glazed lobby box standing proud of the facade."""
        if kind == 0:
            self.box(x, y - 0.2, w, 0.6, F * 0.95, bevel=0.0, mat=MATS.get('doorway'))
            self.box(x, y - 1.6, w + 2.0, 3.4, 0.45, z=F * 0.95, bevel=0.08, mat=MATS.get('coping'))
        else:
            self.box(x, y - 2.0, w, 4.4, F * 1.15, bevel=0.1, mat=MATS.get('lobby'))
            self.box(x, y - 2.0, w + 0.6, 5.0, 0.4, z=F * 1.15, bevel=0.06, mat=MATS.get('coping'))

    def clutter(self, x, y, w, d, z, n=None):
        """Rooftop clutter inside (x, y, w, d) at height z: HVAC units, vents, a skylight or a
        water tank, chosen deterministically from the site's name."""
        rng = random.Random(zlib.crc32(self.name.encode()))
        if w < 8 or d < 8:
            return
        n = n if n is not None else rng.randint(2, 5)
        for _ in range(n):
            kind = rng.random()
            px = x + rng.uniform(-0.38, 0.38) * w
            py = y + rng.uniform(-0.38, 0.38) * d
            if kind < 0.5:
                self.box(px, py, rng.uniform(2.5, 5), rng.uniform(2, 4), rng.uniform(1.0, 1.8), z=z,
                         bevel=0.1, mat=MATS.get('plant'))
            elif kind < 0.7:
                self.cyl(px, py, rng.uniform(0.5, 0.9), 1.2, z=z, seg=10, mat=MATS.get('plant'))
            elif kind < 0.88:
                self.box(px, py, rng.uniform(4, 8), rng.uniform(3, 5), 0.5, z=z, bevel=0.1,
                         mat=MATS.get('skylight'))
            else:
                self.cyl(px, py, 1.8, 3.0, z=z + 1.2, seg=14, mat=MATS.get('tank'))
                self.box(px, py, 2.8, 2.8, 1.2, z=z, bevel=0, mat=MATS.get('plant'))


# ── typologies ──────────────────────────────────────────────────────────────

def slab(s, w, d, fl, plant=(0.2, 0.1), crown=True):
    """Ribbon-window office slab; taller ones step back for a penthouse storey; plant room on top."""
    h = fl * F
    s.box(0, 0, w, d, h)
    s.parapet(0, 0, w, d, h)
    s.entrance(-w * 0.1, -d / 2, min(10.0, w * 0.3), kind=zlib.crc32(s.name.encode()) % 2)
    if crown and fl >= 5:
        s.box(-w * 0.12, d * 0.08, w * 0.62, d * 0.7, F * 1.4, z=h, bevel=0.2)
        h += F * 1.4
    if plant:
        s.plant(w * plant[0], d * plant[1], w * 0.24, d * 0.3, h)
    s.clutter(-w * 0.25, -d * 0.1, w * 0.4, d * 0.6, fl * F)
    return h


def lshape(s, w, d, wing, fl, fl2=None):
    """L-shaped block: long bar along X (depth `wing`) and a wing along Y at the left end."""
    h, h2 = fl * F, (fl2 or fl) * F
    s.box(0, -d / 2 + wing / 2, w, wing, h)
    s.box(-w / 2 + wing / 2, wing / 2, wing, d - wing, h2)
    s.parapet(0, -d / 2 + wing / 2, w, wing, h)
    s.entrance(w * 0.2, -d / 2, min(9.0, w * 0.25))
    s.plant(w * 0.15, -d / 2 + wing / 2, w * 0.2, wing * 0.45, h)
    s.clutter(w * 0.3, -d / 2 + wing / 2, w * 0.3, wing * 0.8, h)
    return max(h, h2)


def courtyard(s, w, d, t, fl, gate=True):
    """Perimeter block around a courtyard, with a gateway cut in the front (-Y) side."""
    h = fl * F
    s.box(0, d / 2 - t / 2, w, t, h)                      # back
    s.box(-w / 2 + t / 2, 0, t, d - 2 * t, h)             # left
    s.box(w / 2 - t / 2, 0, t, d - 2 * t, h)              # right
    if gate:
        g = w * 0.22
        side = (w - g) / 2
        s.box(-w / 2 + side / 2, -d / 2 + t / 2, side, t, h)
        s.box(w / 2 - side / 2, -d / 2 + t / 2, side, t, h)
        s.box(0, -d / 2 + t / 2, g, t, F * 1.2, z=h - F * 1.2)   # bridge over the gate
    else:
        s.box(0, -d / 2 + t / 2, w, t, h)
        s.entrance(0, -d / 2, min(10.0, w * 0.25), kind=1)
    s.parapet(0, -d / 2 + t / 2, w, t, h)
    s.clutter(0, d / 2 - t / 2, w * 0.8, t * 0.8, h)
    return h


def drum(s, r, fl, podium=None, crown=True):
    """Round tower, optionally on a square podium (podium = (w, d, floors))."""
    z = 0.0
    if podium:
        pw, pd, pf = podium
        s.box(0, 0, pw, pd, pf * F)
        z = pf * F
    h = fl * F
    s.cyl(0, 0, r, h, z=z, seg=64)
    if crown:
        s.cyl(0, 0, r * 0.55, F * 0.8, z=z + h, seg=48)
    return z + h


def stepped(s, w, d, fl, steps):
    """Terraced block stepping down toward the front (-Y): the deepest tier is the lowest."""
    tier_d = d / steps
    for i in range(steps):
        tf = max(1, round(fl * (i + 1) / steps))
        dd = d - tier_d * i
        s.box(0, d / 2 - dd / 2, w * (1 - 0.05 * i) - 0.02 * i, dd - 0.02 * i, tf * F, bevel=0.3)
        if i == 0:
            s.entrance(0, -d / 2, min(10.0, w * 0.3), kind=1)
    s.clutter(0, d / 2 - tier_d / 2, w * 0.8, tier_d * 0.8, fl * F)
    return fl * F


def tower(s, w, d, fl, pod=(0, 0, 0), setbacks=((0.8, 0.75),)):
    """Tower on a podium with setbacks: setbacks = ((frac of size, at frac of height), ...)."""
    pw, pd, pf = pod
    z = 0.0
    if pf:
        s.box(0, 0, pw, pd, pf * F)
        s.parapet(0, 0, pw, pd, pf * F, h=0.9)
        s.entrance(0, -pd / 2, min(12.0, pw * 0.3), kind=1)
        z = pf * F
    h = fl * F
    marks = [0.0] + [a for _, a in setbacks] + [1.0]
    sizes = [1.0] + [k for k, _ in setbacks]
    for i, k in enumerate(sizes):
        z0, z1 = z + h * marks[i], z + h * marks[i + 1]
        s.box(0, 0, w * k, d * k, z1 - z0, z=z0)
        if i < len(sizes) - 1:
            s.parapet(0, 0, w * k, d * k, z1, h=0.9)
    s.plant(0, 0, w * 0.3, d * 0.3, z + h, h=3.0)
    return z + h + 3.0


def campus(s, wings, link=True, rotunda=None):
    """Low campus: wings = [(x, y, w, d, floors), ...] joined by a 1-storey link along X, with an
    optional round lobby rotunda = (x, y, r, floors)."""
    top = 0
    for (x, y, w, d, fl) in wings:
        s.box(x, y, w, d, fl * F)
        top = max(top, fl * F)
    if link and len(wings) > 1:
        xs = [x for x, *_ in wings]
        s.box(sum(xs) / len(xs), 0, max(xs) - min(xs), 8, F)
    if rotunda:
        x, y, r, fl = rotunda
        s.cyl(x, y, r, fl * F, seg=56)
        s.cyl(x, y, r * 0.5, F * 0.6, z=fl * F, seg=40)
        top = max(top, fl * F)
    return top


def deck(s, w, d, levels):
    """Open parking deck: thin slabs on columns, a ramp drum at one end."""
    gap = 3.0
    for i in range(levels + 1):
        s.box(0, 0, w, d, 0.6, z=i * gap, bevel=0.1)
    for cx in (-w / 2 + 1, w / 2 - 1):
        for cy in (-d / 2 + 1, d / 2 - 1):
            s.box(cx, cy, 1.4, 1.4, levels * gap, bevel=0)
    s.cyl(w / 2 + 7, 0, 8, levels * gap + 0.6, seg=40)
    return levels * gap


def sawtooth(s, w, d, fl, teeth):
    """Loft / warehouse with a sawtooth roof (teeth along X)."""
    h = fl * F
    s.box(0, 0, w, d, h)
    tw = w / teeth
    for i in range(teeth):
        x0 = -w / 2 + i * tw
        s.wedge(x0 + 0.4, x0 + tw - 0.4, d - 2.0, 3.6, z=h)
    return h + 3.6


def stadium(s, w, d, fl, ends=2):
    """Slab with rounded (half-cylinder) ends on its long axis: curved glass corners."""
    h = fl * F
    long_x = w >= d
    L, r = (w, d / 2) if long_x else (d, w / 2)
    r = min(r, L / 2 - 0.01)
    pts = lib.arc_pts(L / 2 - r, 0, r, -90, 90, 16)
    if ends == 2:
        pts += lib.arc_pts(-L / 2 + r, 0, r, 90, 270, 16)
    else:
        pts += [(-L / 2, r), (-L / 2, -r)]
    if not long_x:
        pts = [(-y, x) for x, y in pts]
    s.prism(pts, h)
    s.plant(-w * 0.15 if long_x else 0, 0 if long_x else -d * 0.15, w * 0.22, d * 0.3, h)
    return h


def twin(s, w, d, gap, fl, bridge_fl=None):
    """Two parallel slabs (along X) linked by a skybridge."""
    h = fl * F
    y = (d + gap) / 2
    s.box(0, -y, w, d, h)
    s.box(0, y, w, d, h * 0.86)
    bf = bridge_fl or fl * 0.6
    s.box(w * 0.18, 0, 7, gap + 2, F * 1.2, z=bf * F)
    s.box(-w * 0.25, 0, 7, gap + 2, F * 1.2, z=bf * F * 0.5)
    return h


def chain(s, size, n, fl, step):
    """Linked pavilions: n square blocks at 45 degrees, overlapping along X, each a storey taller."""
    top = 0
    for i in range(n):
        x = (i - (n - 1) / 2) * step
        hh = (fl + i) * F
        s.box(x, 0, size, size, hh, rot=45)
        top = max(top, hh)
    return top


def shed(s, w, d, fl, vents=3):
    """Low service building with a row of roof vents."""
    h = fl * F
    s.box(0, 0, w, d, h)
    s.parapet(0, 0, w, d, h, h=0.5)
    for k in range(max(1, int(w / 22))):                   # loading doors on the front
        s.box(-w / 2 + (k + 0.5) * w / max(1, int(w / 22)), -d / 2 - 0.2, 4.2, 0.6, 3.8, bevel=0.0,
              mat=MATS.get('doorway'))
    for i in range(vents):
        s.plant(-w / 2 + (i + 0.5) * w / vents, d * 0.15, w / vents * 0.45, d * 0.3, h, h=1.6)
    return h


def chamfer(s, w, d, fl, c):
    """Block with its front-right corner cut on the diagonal."""
    h = fl * F
    pts = [(-w / 2, -d / 2), (w / 2 - c, -d / 2), (w / 2, -d / 2 + c), (w / 2, d / 2), (-w / 2, d / 2)]
    s.prism(pts, h)
    s.box(w / 2 - c / 2 - 0.9, -d / 2 + c / 2 - 0.9, 6.0, 0.6, F * 0.95, rot=45, bevel=0.0, mat=MATS.get('doorway'))
    s.plant(-w * 0.2, d * 0.15, w * 0.25, d * 0.3, h)
    s.clutter(w * 0.05, d * 0.1, w * 0.5, d * 0.5, h)
    return h


def ushape(s, w, d, t, fl):
    """U-shaped block opening toward the back (+Y)."""
    h = fl * F
    s.box(0, -d / 2 + t / 2, w, t, h)
    s.box(-w / 2 + t / 2, t / 2, t, d - t, h)
    s.box(w / 2 - t / 2, t / 2, t, d - t, h * 0.8)
    s.parapet(0, -d / 2 + t / 2, w, t, h)
    s.entrance(0, -d / 2, min(10.0, w * 0.3))
    return h


TYPES = {
    'slab': slab, 'lshape': lshape, 'courtyard': courtyard, 'drum': drum, 'stepped': stepped,
    'tower': tower, 'campus': campus, 'deck': deck, 'sawtooth': sawtooth, 'stadium': stadium,
    'twin': twin, 'chain': chain, 'shed': shed, 'chamfer': chamfer, 'ushape': ushape,
}


def build(name, kind, x, y, rot, mat, collection='city', **kw):
    s = Site(name, x, y, rot, mat, collection)
    TYPES[kind](s, **kw)
    return s


# ── trees ───────────────────────────────────────────────────────────────────

_TREES = []


def trees():
    """The shared tree meshes. Indexes 0-2: round broadleaf crowns in three greens; 3: a tiered
    conifer; 4: a columnar poplar; 5: a wide, flat-topped plane tree. Callers that take [:3] or
    [:4] keep their old mix; groves and parks draw on all species."""
    if not _TREES:
        greens = [MATS.get(k) for k in ('foliage', 'foliage2', 'foliage3')]
        for i, g in enumerate(greens):
            _TREES.append(tree_mesh(4.0, f'tree{i}', g))
        _TREES.append(tree_mesh(2.6, 'conifer', greens[0], conifer=True))
        _TREES.append(tree_mesh(2.4, 'poplar', greens[2], shape=(1.0, 1.0, 2.3)))
        _TREES.append(tree_mesh(4.6, 'plane', greens[1], shape=(1.25, 1.1, 0.72)))
    return _TREES


def grove(name, x, y, n, spread, mat, seed, r=(5.5, 8.0), collection='trees', conifers=0.25):
    """A clump of trees around (x, y): denser in the middle, mixed greens and some conifers,
    deterministic per seed. `mat` is unused (kept for old callers)."""
    rng = random.Random(seed)
    kinds = trees()
    # a grove leans to one species with a few others mixed in, like a planted stand
    lead = rng.choice((0, 1, 2, 5))
    for i in range(n):
        a = rng.uniform(0, math.tau)
        d = spread * math.sqrt(rng.random())
        tx, ty = x + math.cos(a) * d, y + math.sin(a) * d * 0.8
        u = rng.random()
        me = kinds[3] if u < conifers else kinds[lead] if u < conifers + 0.5 else \
            kinds[4] if u > 0.93 else kinds[rng.randrange(3)]
        o = instance(me, f'{name}.{i}', tx, ty, rng.uniform(0, 360), None, collection,
                     scale=rng.uniform(*r) / 4.0 * 0.8)


def row(name, x0, y0, x1, y1, spacing, mat, seed, r=(3.6, 4.6)):
    """Street trees along a line."""
    n = max(2, int(math.hypot(x1 - x0, y1 - y0) / spacing))
    rng = random.Random(seed)
    for i in range(n + 1):
        t = i / n
        rr = rng.uniform(*r)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=rr,
                                              location=(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, rr + 1.8))
        o = bpy.context.active_object
        o.name = f'{name}.{i}'
        o.data.materials.append(mat)
        for c in o.users_collection:
            c.objects.unlink(o)
        lib.coll('trees').objects.link(o)


# ── instanced street furniture ──────────────────────────────────────────────

def tree_mesh(r, name='tree', foliage=None, conifer=False, shape=(1.0, 1.0, 1.12)):
    """A tree: faceted crown (round, stretched by `shape`, or two stacked cones for a conifer) on
    a short trunk, base at the origin. Material slot 0 is the crown, slot 1 the trunk."""
    import bmesh
    bm = bmesh.new()
    if conifer:
        for k, (rr, dd, zz) in enumerate(((r, r * 2.2, r * 1.1 + 1.6), (r * 0.72, r * 1.8, r * 2.5 + 1.6))):
            crown = bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=rr, radius2=0.0, depth=dd)
            bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(0.45 * k, 3, 'Z'),
                             verts=crown['verts'])
            bmesh.ops.translate(bm, vec=(0, 0, zz), verts=crown['verts'])
    else:
        ico = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
        bmesh.ops.scale(bm, vec=shape, verts=ico['verts'])
        bmesh.ops.translate(bm, vec=(0, 0, r * shape[2] + 2.2), verts=ico['verts'])
    n_crown = len(bm.faces)
    trunk = bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.4, radius2=0.3, depth=2.6)
    bmesh.ops.translate(bm, vec=(0, 0, 1.3), verts=trunk['verts'])
    bm.faces.ensure_lookup_table()
    for i, f in enumerate(bm.faces):
        f.material_index = 0 if i < n_crown else 1
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(foliage or MATS.get('foliage'))
    me.materials.append(MATS.get('trunk'))
    return me


def person_mesh(name, mat):
    """A tiny person: a body and a head, 1.8 m tall."""
    import bmesh
    bm = bmesh.new()
    b = bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.32, radius2=0.26, depth=1.4)
    bmesh.ops.translate(bm, vec=(0, 0, 0.7), verts=b['verts'])
    h = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.22)
    bmesh.ops.translate(bm, vec=(0, 0, 1.6), verts=h['verts'])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    return me


def car_mesh(name='car', mat=None):
    """A parked car at miniature fidelity: body and cabin, 4.4 x 1.9 m, long axis along X."""
    import bmesh
    bm = bmesh.new()
    for (sx, sy, sz, tx, tz) in ((4.4, 1.9, 0.9, 0.0, 0.75), (2.4, 1.7, 0.65, -0.2, 1.5)):
        r = bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=r['verts'])
        bmesh.ops.translate(bm, vec=(tx, 0, tz), verts=r['verts'])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if mat:
        me.materials.append(mat)
    return me


def instance(mesh, name, x, y, rot, mat, collection, scale=1.0):
    """A linked duplicate of `mesh` (shared data, so thousands stay cheap)."""
    if not mesh.materials and mat is not None:
        mesh.materials.append(mat)
    o = bpy.data.objects.new(name, mesh)
    lib.coll(collection).objects.link(o)
    o.location = (x, y, 0)
    o.rotation_euler = (0, 0, math.radians(rot))
    o.scale = (scale, scale, scale)
    return o


# ── parks ───────────────────────────────────────────────────────────────────

def people(name, pts, seed, collection='people'):
    """Tiny people at the given (x, y) points, in assorted clothes."""
    rng = random.Random(seed)
    meshes = MATS.get('people') or []
    return [instance(meshes[rng.randrange(len(meshes))], f'{name}.p{i}', x, y, 0, None, collection)
            for i, (x, y) in enumerate(pts) if meshes]


def _adopt_people(s, objs, z):
    for o in objs:
        o.parent = s.root
        o.location.z = z


def lawn_park(s, w, d):
    """A lawn crossed by two diagonal paths meeting at a round plaza, trees along the edges."""
    s.box(0, 0, w, d, 0.35, bevel=0.1, mat=MATS.get('grass'))
    ang = math.degrees(math.atan2(d, w))
    L = math.hypot(w, d) - 6
    for a in (ang, -ang):
        s.box(0, 0, L, 3.2, 0.42, rot=a, bevel=0, mat=MATS.get('plaza'))
    s.cyl(0, 0, min(w, d) * 0.16, 0.45, seg=40, mat=MATS.get('plaza'))
    s.cyl(0, 0, 1.6, 2.4, z=0.45, seg=12, mat=MATS.get('stone'))         # a monument
    rng = random.Random(zlib.crc32(s.name.encode()))
    kinds = trees()
    for i in range(int((w + d) / 6)):
        t = rng.random()
        side = rng.randrange(4)
        x, y = [(-w / 2 + 4 + t * (w - 8), -d / 2 + 4), (-w / 2 + 4 + t * (w - 8), d / 2 - 4),
                (-w / 2 + 4, -d / 2 + 4 + t * (d - 8)), (w / 2 - 4, -d / 2 + 4 + t * (d - 8))][side]
        o = instance(kinds[rng.randrange(4)], f'{s.name}.t{i}', x, y, rng.uniform(0, 360), None, 'trees',
                     scale=rng.uniform(1.0, 1.4))
        o.parent = s.root
    _adopt_people(s, people(s.name, [(rng.uniform(-w / 3, w / 3), rng.uniform(-d / 4, d / 4))
                                     for _ in range(int(w * d / 260))], rng.random()), 0.42)
    return 0.45


def fountain_plaza(s, w, d):
    """A paved plaza with a round fountain, planted corners and benches of people."""
    s.box(0, 0, w, d, 0.3, bevel=0.1, mat=MATS.get('plaza'))
    r = min(w, d) * 0.22
    s.cyl(0, 0, r, 0.9, z=0.3, seg=48, mat=MATS.get('stone'))
    s.cyl(0, 0, r - 0.8, 0.95, z=0.3, seg=48, mat=MATS.get('water'))
    s.cyl(0, 0, r * 0.3, 1.6, z=0.3, seg=24, mat=MATS.get('stone'))
    s.cyl(0, 0, r * 0.3 - 0.5, 1.65, z=0.3, seg=24, mat=MATS.get('water'))       # upper bowl
    s.cone(0, 0, 1.1, 5.0, z=1.9, seg=10, mat=MATS.get('spray'))                # central plume
    s.cone(0, 0, r * 0.3 - 0.6, 0.9, z=1.95, seg=16, mat=MATS.get('spray'))    # its falling curtain
    for k in range(12):                                                        # a ring of small jets
        t = k * math.tau / 12
        s.cone(math.cos(t) * (r - 2.4), math.sin(t) * (r - 2.4), 0.35, 1.8, z=1.2, seg=6, mat=MATS.get('spray'))
    kinds = trees()
    rng = random.Random(zlib.crc32(s.name.encode()))
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        cx, cy = sx * (w / 2 - 7), sy * (d / 2 - 7)
        s.box(cx, cy, 9, 9, 0.7, z=0.3, bevel=0.2, mat=MATS.get('grass'))
        o = instance(kinds[i % 3], f'{s.name}.t{i}', cx, cy, rng.uniform(0, 360), None, 'trees', scale=1.4)
        o.parent = s.root
        o.location.z = 1.0
    pts = []
    for _ in range(int(w * d / 140)):
        a = rng.uniform(0, math.tau)
        rr = r + rng.uniform(2, min(w, d) * 0.3)
        pts.append((math.cos(a) * rr, math.sin(a) * rr))
    _adopt_people(s, people(s.name, pts, rng.random()), 0.3)
    return 1.2


def ball_field(s, w, d):
    """A sports field: grass pitch with white lines inside a running track, a small stand."""
    s.box(0, 0, w, d, 0.3, bevel=0.1, mat=MATS.get('grass'))
    tw, td = w - 10, d - 16
    r = td / 2
    pts = lib.arc_pts(tw / 2 - r, 0, r, -90, 90, 20) + lib.arc_pts(-tw / 2 + r, 0, r, 90, 270, 20)
    s.prism(pts, 0.36, bevel=0, mat=MATS.get('track'))
    r2 = r - 5
    pts = lib.arc_pts(tw / 2 - r, 0, r2, -90, 90, 20) + lib.arc_pts(-tw / 2 + r, 0, r2, 90, 270, 20)
    s.prism(pts, 0.40, bevel=0, mat=MATS.get('field'))
    pw, pd = tw - 2 * r + 2 * r2 * 0.7, r2 * 1.5
    paint = MATS.get('paint')
    for y in (-pd / 2, pd / 2):
        s.box(0, y, pw, 0.4, 0.43, bevel=0, mat=paint)
    for x in (-pw / 2, 0, pw / 2):
        s.box(x, 0, 0.4, pd, 0.43, bevel=0, mat=paint)
    s.cyl(0, 0, 5, 0.43, seg=32, mat=paint)
    s.cyl(0, 0, 4.6, 0.44, seg=32, mat=MATS.get('field'))
    for k in range(4):                                                         # stepped stand
        s.box(0, d / 2 - 6 + k * 1.2, w * 0.4, 1.4, 0.7 * (k + 1), z=0.3, bevel=0.05,
              mat=MATS.get('seat' if k % 2 else 'seat2'))
    s.box(0, d / 2 - 2.5, w * 0.4, 2, 1.6, z=2.8, bevel=0.1, mat=MATS.get('roofred'))
    rng = random.Random(zlib.crc32(s.name.encode()))
    _adopt_people(s, people(s.name, [(rng.uniform(-pw / 2, pw / 2), rng.uniform(-pd / 2, pd / 2))
                                     for _ in range(14)], rng.random()), 0.4)
    return 3.0


def arena(s, w, d):
    """An oval arena: a grass pitch inside banked stands, with a light canopy ring on top."""
    k = w / d
    r = d / 2 - 2
    s.box(0, 0, w, d, 0.3, bevel=0.1, mat=MATS.get('plaza'))
    # raked seating: four tiers stepping up and out, seat rows alternating two tones
    tiers = [(r * 0.79, r * 0.72, 2.2), (r * 0.85, r * 0.78, 4.0), (r * 0.91, r * 0.84, 5.8), (r * 0.97, r * 0.90, 7.6)]
    for name, ro, ri, h, z, mat in [(f'tier{k}', ro, ri, hh - 0.3, 0.3, MATS.get('seat' if k % 2 else 'seat2'))
                                    for k, (ro, ri, hh) in enumerate(tiers)] + \
                                   [('shell', r, r * 0.96, 8.7, 0.3, MATS.get('stone')),
                                    ('canopy', r + 0.5, r * 0.95, 1.0, 12.0, MATS.get('roofred'))]:
        o = lib.ring(f'{s.name}.{name}', 0, 0, ro, ri, h, mat or s.mat, z=z, seg=64, collection=s.collection)
        o.scale.x = k * 0.92
        s._adopt(o, z + h)
    for a in range(0, 360, 30):                          # canopy masts
        t = math.radians(a)
        s.cyl(math.cos(t) * r * 0.97 * k * 0.92, math.sin(t) * r * 0.97, 0.5, 12.0, seg=8, mat=MATS.get('stone'))
    o = lib.cyl(f'{s.name}.pitch', 0, 0, r * 0.72, 0.5, MATS.get('field') or s.mat, seg=64, collection=s.collection)
    o.scale.x = k * 0.92
    s._adopt(o, 0.5)
    return 13.2


TYPES.update({'arena': arena, 'lawn_park': lawn_park, 'fountain_plaza': fountain_plaza, 'ball_field': ball_field})
