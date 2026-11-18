"""Low-poly toy models for the moving sprites (render/sprites.py): three road vehicles, two
planes, a helicopter (body and rotor apart) and a hot-air balloon.

Every builder makes one model at the origin under an empty and returns the empty. Forward is +X,
up is +Z. Road vehicles stand on z = 0; flyers are centred on their body (balloons on the basket
floor), so the page places them at their altitude. Colours come from palette.py or the caller.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import lib
import palette

C = palette.C
COLL = 'sprites'
DARK = '#2b2d31'


def mat(color, rough=0.6, spec=0.45):
    return lib.material(f'sp_{color}_{rough}', color, rough=rough, spec=spec)


def paint(color):
    return lib.material(f'sp_paint_{color}', color, rough=0.35, spec=0.6)


def glass():
    return lib.material('sp_glass', C['glass_dark'], rough=0.32, spec=0.45)


def ghost(color, alpha):
    """A see-through surface (rotor and propeller discs): `alpha` of `color`, the rest clear."""
    name = f'sp_ghost_{color}_{alpha}'
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = lib.material(name, color, rough=0.7)
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    out = nt.nodes['Material Output']
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    mix.inputs['Fac'].default_value = alpha
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(p.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    return m


# ── geometry helpers ────────────────────────────────────────────────────────

def _finish(name, bm, mats, root, bevel=0.0, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    lib.coll(COLL).objects.link(o)
    for p in me.polygons:
        p.use_smooth = smooth
    if bevel > 0:
        b = o.modifiers.new('bevel', 'BEVEL')
        b.width, b.segments, b.limit_method = bevel, 2, 'ANGLE'
        b.angle_limit = math.radians(35)
        b.use_clamp_overlap = True
    o.parent = root
    return o


def box(root, name, x, y, z, w, d, h, m, bevel=0.06, rot=(0, 0, 0)):
    """A box w (X) by d (Y) by h (Z) with its base centred at (x, y, z)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
    o = _finish(name, bm, [m], root, bevel=min(bevel, w / 4, d / 4, h / 4))
    o.location = (x, y, z)
    o.rotation_euler = rot
    return o


def frustum(root, name, bot, top, z0, z1, m, bevel=0.05):
    """A box whose bottom rectangle (x0, x1, half-width) and top rectangle differ: cabins and
    greenhouses with raked screens."""
    bm = bmesh.new()
    (bx0, bx1, bw), (tx0, tx1, tw) = bot, top
    vs = [bm.verts.new(p) for p in ((bx0, -bw, z0), (bx1, -bw, z0), (bx1, bw, z0), (bx0, bw, z0),
                                    (tx0, -tw, z1), (tx1, -tw, z1), (tx1, tw, z1), (tx0, tw, z1))]
    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return _finish(name, bm, [m], root, bevel=bevel)


def loft(root, name, sections, m, n=8, smooth=True, mats=None, mat_of=None):
    """A tube through cross-sections (x, cy, cz, ry, rz): ellipses of n sides in the YZ plane.
    A section with radius 0 closes the tube to a point. `mat_of(i, j)` picks a material index
    for the face between sections i and i+1 at side j."""
    bm = bmesh.new()
    rings = []
    for x, cy, cz, ry, rz in sections:
        if ry <= 0 or rz <= 0:
            rings.append([bm.verts.new((x, cy, cz))])
            continue
        ring = []
        for j in range(n):
            a = 2 * math.pi * (j + 0.5) / n
            ring.append(bm.verts.new((x, cy + ry * math.cos(a), cz + rz * math.sin(a))))
        rings.append(ring)
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(n):
            k = (j + 1) % n
            if len(a) == 1:
                f = bm.faces.new((a[0], b[j], b[k]))
            elif len(b) == 1:
                f = bm.faces.new((a[j], b[0], a[k]))
            else:
                f = bm.faces.new((a[j], b[j], b[k], a[k]))
            if mat_of:
                f.material_index = mat_of(i, j)
    for ring in (rings[0], rings[-1]):
        if len(ring) > 1:
            bm.faces.new(ring)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return _finish(name, bm, mats or [m], root, smooth=smooth)


def plate(root, name, pts, thick, m, axis='z', at=0.0, bevel=0.04):
    """A flat polygon extruded `thick`: in the XY plane at z = `at` (wings) or, with axis='y',
    in the XZ plane centred on y = `at` (fins). `pts` are (x, y) or (x, z) pairs."""
    bm = bmesh.new()
    if axis == 'z':
        lo = [bm.verts.new((x, y, at - thick / 2)) for x, y in pts]
        hi = [bm.verts.new((x, y, at + thick / 2)) for x, y in pts]
    else:
        lo = [bm.verts.new((x, at - thick / 2, z)) for x, z in pts]
        hi = [bm.verts.new((x, at + thick / 2, z)) for x, z in pts]
    n = len(pts)
    bm.faces.new(lo)
    bm.faces.new(hi[::-1])
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return _finish(name, bm, [m], root, bevel=bevel)


def wheel(root, name, x, y, r, w, m):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=r, radius2=r, depth=w)
    o = _finish(name, bm, [m], root, bevel=0.04)
    o.location = (x, y, r)
    o.rotation_euler = (math.pi / 2, 0, 0)
    return o


def empty(name):
    e = bpy.data.objects.new(name, None)
    lib.coll(COLL).objects.link(e)
    return e


def wheels(root, name, xs, half, r=0.34, w=0.26):
    for i, x in enumerate(xs):
        for s in (-1, 1):
            wheel(root, f'{name}.w{i}{s}', x, s * half, r, w, mat(DARK, 0.9, 0.2))


# ── road vehicles (stand on z = 0) ──────────────────────────────────────────

def sedan(name, color):
    r = empty(name)
    p = paint(color)
    box(r, f'{name}.body', 0, 0, 0.26, 4.4, 1.86, 0.66, p, bevel=0.2)
    frustum(r, f'{name}.cab', (-1.55, 1.05, 0.86), (-1.05, 0.35, 0.72), 0.9, 1.42, glass(), bevel=0.04)
    frustum(r, f'{name}.roof', (-1.07, 0.37, 0.73), (-1.0, 0.3, 0.68), 1.42, 1.5, p, bevel=0.03)
    box(r, f'{name}.lamp', 2.18, 0, 0.62, 0.08, 1.5, 0.14, mat('#f2f0ea', 0.3), bevel=0.02)
    wheels(r, name, (-1.35, 1.35), 0.82)
    return r


def truck(name, cab, body):
    """A box truck: cab in front, a tall cargo box behind."""
    r = empty(name)
    p = paint(cab)
    box(r, f'{name}.chassis', -0.2, 0, 0.32, 6.4, 1.9, 0.3, mat(DARK, 0.8), bevel=0.05)
    box(r, f'{name}.cabl', 2.35, 0, 0.45, 1.7, 2.2, 1.15, p, bevel=0.18)
    frustum(r, f'{name}.cabg', (1.55, 3.15, 1.06), (1.55, 2.75, 0.98), 1.6, 2.3, glass(), bevel=0.04)
    frustum(r, f'{name}.cabr', (1.55, 2.77, 0.99), (1.6, 2.7, 0.95), 2.3, 2.42, p, bevel=0.03)
    box(r, f'{name}.box', -1.05, 0, 0.6, 4.7, 2.36, 2.55, mat(body, 0.55), bevel=0.1)
    box(r, f'{name}.band', -1.05, 0, 2.6, 4.74, 2.4, 0.3, p, bevel=0.03)
    wheels(r, name, (-2.6, -1.6, 2.3), 0.92, r=0.42, w=0.3)
    return r


def bus(name, color):
    r = empty(name)
    p = paint(color)
    box(r, f'{name}.body', 0, 0, 0.32, 11.4, 2.52, 1.2, p, bevel=0.18)
    box(r, f'{name}.win', 0, 0, 1.5, 11.2, 2.44, 0.95, glass(), bevel=0.05)
    box(r, f'{name}.roof', 0, 0, 2.42, 11.36, 2.5, 0.5, mat(C['white'], 0.5), bevel=0.16)
    box(r, f'{name}.belt', 0, 0, 2.42, 11.4, 2.54, 0.16, p, bevel=0.03)
    box(r, f'{name}.ac', -2.4, 0, 2.9, 2.6, 1.6, 0.32, mat(C['plant'], 0.7), bevel=0.08)
    wheels(r, name, (-3.6, 3.7), 1.08, r=0.48, w=0.32)
    return r


# ── flyers (origin at the body; the page sets the altitude) ─────────────────

def prop_plane(name, body, accent, phase=0.0):
    """A high-wing light aircraft, toy scale (18 m span). `phase` turns the propeller (degrees)."""
    r = empty(name)
    b, a = paint(body), paint(accent)
    secs = [(5.2, 0, -0.05, 0.0, 0.0), (5.0, 0, -0.05, 0.5, 0.5), (4.3, 0, 0, 0.82, 0.85),
            (2.4, 0, 0.1, 0.95, 1.05), (0.0, 0, 0.1, 0.92, 1.0), (-2.5, 0, 0.3, 0.55, 0.62),
            (-6.4, 0, 0.6, 0.18, 0.2)]
    loft(r, f'{name}.fus', secs, b, mats=[b, a, glass()],
         mat_of=lambda i, j: 2 if (i == 3 and j in (0, 3)) or (i == 2 and j in (1, 2))
         else (1 if i in (3, 4) and j in (4, 7) else 0))
    plate(r, f'{name}.wing', [(1.6, -9), (3.5, -9), (3.5, 9), (1.6, 9)], 0.34, b, at=1.15)
    for s in (-1, 1):
        plate(r, f'{name}.tip{s}', [(1.55, s * 7.3), (3.55, s * 7.3), (3.55, s * 9.05), (1.55, s * 9.05)],
              0.38, a, at=1.15, bevel=0.03)
        box(r, f'{name}.strut{s}', 2.4, s * 0.85, -0.5, 0.18, 0.16, 2.45, b, bevel=0.0,
            rot=(-s * math.atan2(1.95, 1.48), 0, 0))
    plate(r, f'{name}.tail', [(-6.3, -2.9), (-5.0, -2.9), (-4.6, 0), (-5.0, 2.9), (-6.3, 2.9)], 0.2, b, at=0.6)
    plate(r, f'{name}.fin', [(-6.4, 0.5), (-4.6, 0.5), (-5.4, 2.6), (-6.4, 2.75)], 0.22, a, axis='y')
    box(r, f'{name}.spin', 5.15, 0, -0.35, 0.3, 0.6, 0.6, mat(DARK, 0.5), bevel=0.12)
    blades = empty(f'{name}.prop')
    blades.parent = r
    blades.location = (5.35, 0, -0.05)
    blades.rotation_euler = (math.radians(phase), 0, 0)
    box(blades, f'{name}.blade', 0, 0, -1.25, 0.12, 0.3, 2.5, mat(DARK, 0.5), bevel=0.0)
    disc = loft(r, f'{name}.disc', [(5.32, 0, -0.05, 1.3, 1.3), (5.38, 0, -0.05, 1.3, 1.3)],
                ghost('#d8d6d0', 0.18), n=16, smooth=False)
    disc.visible_shadow = False
    return r


def jet(name, body, tail):
    """A twin-engine regional jet, toy scale (30 m long)."""
    r = empty(name)
    b, t = paint(body), paint(tail)
    secs = [(15.0, 0, -0.25, 0.0, 0.0), (14.6, 0, -0.2, 0.75, 0.7), (13.4, 0, -0.05, 1.45, 1.45),
            (11.0, 0, 0, 1.75, 1.8), (-6.0, 0, 0, 1.75, 1.8), (-11.0, 0, 0.45, 1.05, 1.15),
            (-14.6, 0, 1.1, 0.25, 0.3)]
    loft(r, f'{name}.fus', secs, b, n=10, mats=[b, t, glass()],
         mat_of=lambda i, j: 2 if i == 1 and j in (1, 2, 3) else (1 if i == 5 else 0))
    for s in (-1, 1):
        wing = [(3.5, 0), (-2.6, 0), (-7.4, 14 * s), (-5.4, 14 * s)]
        plate(r, f'{name}.wing{s}', wing if s > 0 else wing[::-1], 0.42, b, at=-0.9)
        plate(r, f'{name}.tip{s}', [(-5.3, 13.6 * s), (-7.5, 13.6 * s), (-8.1, 14.2 * s), (-6.0, 14.2 * s)][::s],
              0.42, t, at=-0.9, bevel=0.03)
        hs = [(-10.3, 0), (-13.4, 0), (-15.6, 5.4 * s), (-14.1, 5.4 * s)]
        plate(r, f'{name}.hs{s}', hs if s > 0 else hs[::-1], 0.26, b, at=1.0)
        loft(r, f'{name}.eng{s}', [(2.6, 5.2 * s, -1.75, 0.0, 0.0), (2.4, 5.2 * s, -1.75, 0.82, 0.82),
                                   (-0.9, 5.2 * s, -1.75, 0.78, 0.78), (-1.6, 5.2 * s, -1.75, 0.4, 0.4)],
             mat(C['plant'], 0.5), n=10)
        box(r, f'{name}.cheat{s}', 2.5, s * 1.70, -0.2, 17.0, 0.1, 0.32, t, bevel=0.0)
    plate(r, f'{name}.fin', [(-10.4, 1.3), (-14.9, 1.3), (-16.6, 6.4), (-14.6, 6.4)], 0.3, t, axis='y')
    return r


def heli(name, body, accent):
    """A light helicopter without its main rotor (rendered apart, see rotor())."""
    r = empty(name)
    b, a = paint(body), paint(accent)
    secs = [(2.7, 0, 0.0, 0.0, 0.0), (2.55, 0, -0.05, 0.55, 0.6), (2.0, 0, -0.05, 0.95, 0.95),
            (0.6, 0, 0.0, 1.0, 1.05), (-1.3, 0, 0.1, 0.85, 0.9), (-2.1, 0, 0.35, 0.35, 0.45)]
    loft(r, f'{name}.pod', secs, b, n=10, mats=[b, glass(), a],
         mat_of=lambda i, j: 1 if i in (1, 2) and j not in (6, 7, 8) else (2 if i == 3 and j in (4, 5, 9, 0) else 0))
    loft(r, f'{name}.boom', [(-1.6, 0, 0.45, 0.3, 0.3), (-7.0, 0, 0.6, 0.14, 0.16)], b, n=8)
    plate(r, f'{name}.fin', [(-6.6, 0.5), (-7.4, 0.5), (-7.9, 2.0), (-7.2, 2.0)], 0.16, a, axis='y')
    plate(r, f'{name}.hstab', [(-5.9, -1.0), (-6.5, -1.0), (-6.5, 1.0), (-5.9, 1.0)], 0.1, a, at=0.62)
    tr = empty(f'{name}.trotor')
    tr.parent = r
    tr.location, tr.rotation_euler = (-7.45, 0.22, 1.3), (0, math.radians(30), 0)
    box(tr, f'{name}.tb0', 0, 0, -0.8, 0.16, 0.06, 1.6, mat(DARK, 0.5), bevel=0.0)
    box(tr, f'{name}.tb1', 0, 0, -0.08, 1.6, 0.06, 0.16, mat(DARK, 0.5), bevel=0.0)
    box(r, f'{name}.mast', 0.3, 0, 0.9, 0.35, 0.35, 0.5, mat(DARK, 0.5), bevel=0.05)
    box(r, f'{name}.cowl', -0.3, 0, 0.75, 1.6, 0.9, 0.42, b, bevel=0.15)
    for s in (-1, 1):
        box(r, f'{name}.skid{s}', 0.4, s * 0.95, -1.35, 3.8, 0.14, 0.12, mat(DARK, 0.6), bevel=0.04)
        for x in (-0.6, 1.4):
            box(r, f'{name}.strut{s}{x}', x, s * 0.95, -1.25, 0.12, 0.12, 0.66, mat(DARK, 0.6), bevel=0.0,
                rot=(s * math.atan2(0.35, 0.55), 0, 0))
    return r


ROTOR_Z = 1.42     # rotor plane above the helicopter's origin
ROTOR_R = 5.4


def rotor(name, phase=0.0, blades=3):
    """The main rotor alone: hub, blades at `phase` degrees and a faint disc."""
    r = empty(name)
    hub = empty(f'{name}.hub')
    hub.parent = r
    hub.location = (0.3, 0, ROTOR_Z)
    hub.rotation_euler = (0, 0, math.radians(phase))
    box(hub, f'{name}.cap', 0, 0, -0.05, 0.6, 0.6, 0.22, mat(DARK, 0.5), bevel=0.08)
    for i in range(blades):
        a = 2 * math.pi * i / blades
        bl = box(hub, f'{name}.b{i}', 0, 0, 0, ROTOR_R, 0.42, 0.08, mat('#3a3e44', 0.5), bevel=0.0)
        bl.data.transform(Matrix.Translation((ROTOR_R / 2, 0, 0)))
        bl.rotation_euler = (0, 0, a)
    disc = loft(r, f'{name}.disc', [(-0.03, 0, 0, ROTOR_R, ROTOR_R), (0.03, 0, 0, ROTOR_R, ROTOR_R)],
                ghost('#d8dadc', 0.06), n=24, smooth=False)
    disc.location, disc.rotation_euler = (0.3, 0, ROTOR_Z), (0, math.pi / 2, 0)
    return r


def balloon(name, gores, bands=(), crown=None):
    """A hot-air balloon: a gored envelope (16 gores, `gores` colours repeating around it), a
    basket and its lines. `bands` are (z0, z1, colour) horizontal stripes across every gore;
    `crown` colours the top cap. Origin at the basket floor. No words."""
    r = empty(name)
    prof = [(4.6, 1.5), (5.4, 2.6), (6.6, 4.3), (8.3, 6.1), (10.4, 7.6), (13.0, 8.6), (15.6, 9.0),
            (18.0, 8.8), (20.2, 7.9), (22.0, 6.4), (23.4, 4.5), (24.3, 2.4), (24.6, 0.0)]
    n = 16
    names = list(dict.fromkeys(list(gores) + [c for _, _, c in bands] + ([crown] if crown else [])))
    mats = [mat(c, 0.75, 0.3) for c in names]

    def mat_of(i, j):
        z = (prof[i][0] + prof[i + 1][0]) / 2
        for z0, z1, c in bands:
            if z0 <= z < z1:
                return names.index(c)
        if crown and z > 22.8:
            return names.index(crown)
        return names.index(gores[j % len(gores)])
    # the loft puts its ring vertices half a step off the axes, so gore seams stay between colours
    env = loft(r, f'{name}.env', [(z, 0, 0, rad, rad) for z, rad in prof], mats[0], n=n, mats=mats,
               mat_of=mat_of)
    env.data.transform(Matrix.Rotation(-math.pi / 2, 4, 'Y'))      # the loft runs along X: stand it up
    wick = mat('#8a6a45', 0.85, 0.2)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.85, radius2=0.95, depth=1.15)
    bmesh.ops.translate(bm, vec=(0, 0, 0.575), verts=bm.verts)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 8, 3, 'Z'))
    _finish(f'{name}.basket', bm, [wick], r, bevel=0.08)
    box(r, f'{name}.rim', 0, 0, 1.12, 1.9, 1.9, 0.12, mat('#5b4632', 0.8), bevel=0.04,
        rot=(0, 0, math.pi / 8))
    box(r, f'{name}.burner', 0, 0, 2.3, 0.7, 0.7, 0.6, mat('#7a8a96', 0.4, 0.6), bevel=0.08)
    line = mat('#5b4632', 0.8)
    for i in range(8):
        a = 2 * math.pi * (i + 0.5) / 8
        x0, y0 = 0.85 * math.cos(a), 0.85 * math.sin(a)
        x1, y1 = 1.45 * math.cos(a), 1.45 * math.sin(a)
        L = math.dist((x0, y0, 1.15), (x1, y1, 4.65))
        tilt = math.atan2(0.6, 3.5)
        o = box(r, f'{name}.line{i}', x0, y0, 1.15, 0.08, 0.08, L, line, bevel=0.0)
        o.rotation_euler = (0, tilt, a)
    return r


# ── contrail puff ───────────────────────────────────────────────────────────

def cloud(seed):
    """A soft white volume: density falls off from each sphere's centre, broken up by noise, so
    the edges are wispy and the sun lights one side."""
    name = f'sp_cloud{seed}'
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    vol = nt.nodes.new('ShaderNodeVolumePrincipled')
    vol.inputs['Color'].default_value = (1, 1, 1, 1)
    vol.inputs['Anisotropy'].default_value = -0.15
    vol.inputs['Emission Color'].default_value = (1.0, 0.98, 0.95, 1)    # stands in for deep multiple scattering
    tc = nt.nodes.new('ShaderNodeTexCoord')
    grad = nt.nodes.new('ShaderNodeTexGradient')
    grad.gradient_type = 'SPHERICAL'
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.noise_dimensions = '4D'
    noise.inputs['W'].default_value = seed * 3.7
    noise.inputs['Scale'].default_value = 2.2
    noise.inputs['Detail'].default_value = 4.0
    nt.links.new(tc.outputs['Object'], grad.inputs['Vector'])
    nt.links.new(tc.outputs['Object'], noise.inputs['Vector'])

    def op(kind, a, b):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = kind
        for i, v in enumerate((a, b)):
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                nt.links.new(v, n.inputs[i])
        return n.outputs[0]
    # zero at the sphere's surface (no hard rim), lumpy inside
    v = op('MULTIPLY', grad.outputs['Fac'], op('ADD', 1.0, op('MULTIPLY', op('SUBTRACT', noise.outputs['Fac'], 0.5), 1.4)))
    dens = op('MULTIPLY', op('MAXIMUM', op('SUBTRACT', v, 0.1), 0.0), 5.0)
    nt.links.new(dens, vol.inputs['Density'])
    nt.links.new(op('MULTIPLY', dens, 0.09), vol.inputs['Emission Strength'])
    nt.links.new(vol.outputs[0], out.inputs['Volume'])
    return m


def puff(name, seed):
    """A contrail puff about 7 m across: a few overlapping soft volumes. Origin at its centre."""
    import random
    rng = random.Random(seed * 101 + 7)
    r = empty(name)
    for i in range(rng.randint(3, 5)):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        o = _finish(f'{name}.v{i}', bm, [cloud(seed * 10 + i)], r)
        s = rng.uniform(1.6, 2.6)
        o.scale = (s * rng.uniform(1.0, 1.25), s, s * rng.uniform(0.8, 1.0))
        o.location = (rng.uniform(-1.6, 1.6), rng.uniform(-1.2, 1.2), rng.uniform(-0.6, 0.8))
        o.visible_shadow = True
    return r


# ── marker ──────────────────────────────────────────────────────────────────

def marker(name, color='#d7262b', width=12.0, height=13.0, depth=3.6, cam_az=33.0, cam_el=42.0, yaw=-32.0):
    """A "player select" pointer: a glossy, bevelled triangular prism pointing down, its tip at the
    origin. It is turned to face the camera, then yawed a little so a side shows and it reads as
    a solid."""
    r = empty(name)
    bm = bmesh.new()
    tri = [(0.0, 0.0), (width / 2, height), (-width / 2, height)]
    front = [bm.verts.new((x, -depth / 2, z)) for x, z in tri]
    back = [bm.verts.new((x, depth / 2, z)) for x, z in tri]
    bm.faces.new(front)
    bm.faces.new(back[::-1])
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    gloss = lib.material(f'sp_gloss_{color}', color, rough=0.22, spec=0.7)
    o = _finish(f'{name}.body', bm, [gloss], r, bevel=0.6)
    a, e = math.radians(cam_az), math.radians(cam_el)
    right = Vector((math.cos(a), math.sin(a), 0.0))
    look = Vector((-math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), -math.sin(e)))
    up = right.cross(look)
    basis = Matrix((right, look, up)).transposed().to_4x4()      # local X right, Y away, Z up on screen
    o.matrix_basis = basis @ Matrix.Rotation(math.radians(yaw), 4, 'Z')
    return r
