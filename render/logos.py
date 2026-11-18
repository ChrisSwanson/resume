"""Employer logos built into the architecture: the official SVGs in render/logos/ (sources in
SOURCES.md), imported with Blender's SVG importer and scaled uniformly (never stretched, cropped,
thickened or recoloured). Each site's builder in hq.py says where its mark goes:

- 'facade': relief on a solid fascia band of the upper facade that faces the camera-side street
  (-Y), parallel to the wall, extruded about 3% of its height.
- 'roof':   upright letters standing on the front parapet, aligned to that roof edge.
- 'inlay':  laid flat into a roof or paved surface (bold symbols only).

No billboards, legs, backing panels, camera-facing turns or emission: the marks are lit by the
scene's sun and sky like everything else. Colours come from the SVG fills. In clay mode, clay.
"""
import math
import os

import bpy
from mathutils import Matrix, Vector

import lib

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(HERE, 'logos')
# Official variants used on the buildings (see SOURCES.md). Wells Fargo publishes its box logo only
# as a PNG, so its official one-line wordmark is used; Twitch's flat purple wordmark and the
# Chainalysis mark come from the companies' own brand kits.
FILES = {'wellsfargo': 'wellsfargo-wordmark.svg', 'twitch': 'twitch-wordmark.svg',
         'chainalysis': 'chainalysis-mark.svg'}


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def load(cid, width, depth, mat=None, height=None, gap=0.04, flat=False):
    """Import logos/<cid>.svg as one curve object `width` metres wide (aspect kept), `depth` thick,
    standing in the XZ plane with its face toward -Y (or, if `flat`, lying in the XY plane face up,
    top toward +Y), origin at the bottom centre. Later SVG shapes sit `gap` proud of earlier ones,
    so overlapping fills never z-fight. None if the file is absent."""
    path = os.path.join(DIR, FILES.get(cid, f'{cid}.svg'))
    if not os.path.exists(path):
        return None
    before = set(bpy.data.objects)
    mats_before = set(bpy.data.materials)
    bpy.ops.import_curve.svg(filepath=path)
    new = [o for o in bpy.data.objects if o not in before and o.type == 'CURVE']
    if not new:
        return None
    # one object per SVG shape, in document order; later shapes sit a little proud of earlier
    # ones so overlapping fills (lettering on a panel) never z-fight

    def bounds(objs):
        pts = [p.co for o in objs for sp in o.data.splines for p in sp.bezier_points] + \
              [Vector(p.co[:3]) for o in objs for sp in o.data.splines for p in sp.points]
        return (min(p.x for p in pts), max(p.x for p in pts), min(p.y for p in pts), max(p.y for p in pts))

    for o in new:
        o.matrix_world.identity() if o.parent is None else None
    x0, x1, y0, y1 = bounds(new)
    k = width / (x1 - x0)
    if height:
        k = min(k, height / (y1 - y0))
    for o in new:
        o.data.transform(Matrix.Scale(k, 4))
        for sp in o.data.splines:  # transform() scales point radii too, which would scale the extrusion
            for p in sp.bezier_points:
                p.radius = 1.0
            for p in sp.points:
                p.radius = 1.0
    x0, x1, y0, y1 = bounds(new)
    # an upright frame: local X along the sign, local Z up, face toward -Y
    root = bpy.data.objects.new(f'sign_{cid}', None)
    lib.coll('logos').objects.link(root)
    root.rotation_euler = (0, 0, 0) if flat else (1.5707963, 0, 0)
    for i, o in enumerate(new):
        o.data.dimensions = '2D'
        o.data.fill_mode = 'BOTH'
        o.data.extrude = depth / 2
        o.data.resolution_u = 16
        o.parent = root
        o.location = (-(x0 + x1) / 2, -y0, i * gap)
        o.rotation_euler = (0, 0, 0)
        o.scale = (1, 1, 1)
        o.name = f'logo_{cid}.{i}'
        for j, slot in enumerate(o.material_slots):
            src = slot.material
            if mat is not None:
                slot.material = mat
            elif src is not None:
                r, g, b, _ = src.diffuse_color
                m = bpy.data.materials.new(f'logo_{cid}_{i}_{j}')
                m.use_nodes = True
                p = m.node_tree.nodes['Principled BSDF']
                p.inputs['Base Color'].default_value = (r, g, b, 1.0)
                p.inputs['Roughness'].default_value = 0.5
                p.inputs['Specular IOR Level'].default_value = 0.3
                slot.material = m
        for c in list(o.users_collection):
            c.objects.unlink(o)
        lib.coll('logos').objects.link(o)
    for m in set(bpy.data.materials) - mats_before:
        if m.users == 0:
            bpy.data.materials.remove(m)
    root['height'] = y1 - y0
    root['width'] = x1 - x0
    return root


def place(cid, site, mode, clay=None, name=None, pal=None):
    """Build the site's mark from its sign spec (site.sign, from hq.py): a dict with
    kind ('facade' | 'roof' | 'inlay'), x, y, z in site coordinates, the largest logo w and h
    (metres; the logo fits inside, aspect kept), and optional fascia/panel/coping colours."""
    sp = site.sign
    kind = sp['kind']
    clay_mode = mode == 'clay'
    w_max, h_max = sp['w'], sp['h']
    if kind == 'inlay':
        depth = 0.12
    else:
        depth = sp.get('depth') or max(0.3, (0.04 if kind == 'roof' else 0.03) * h_max)
    o = load(cid, w_max, depth=depth, mat=clay if clay_mode else None, height=h_max,
             gap=0.015 if kind == 'inlay' else 0.04, flat=kind == 'inlay')
    if o is None:
        print(f'[logo] {cid}: no SVG, no sign', flush=True)
        return None
    w, h = o['width'], o['height']
    mat = (lambda key, col: clay) if clay_mode else (lambda key, col: lib.material(key, col, rough=0.7, spec=0.3))
    x, y, z = sp['x'], sp['y'], sp['z']
    pad = sp.get('pad', 0.12 * h)
    parts = []
    if kind == 'facade':
        # a solid fascia band proud of the facade, then the relief on its face
        fz = z - h / 2 - pad
        parts.append(lib.box(f'sign_{cid}.fascia', x, y - 0.3, w + 2 * pad, 0.6, h + 2 * pad,
                             mat(f'fascia_{sp["fascia"]}', sp['fascia']), z=fz, bevel=0.08, collection='logos'))
        o.location = (x, y - 0.6 - depth / 2, z - h / 2)
    elif kind == 'roof':
        # letters on a low coping along the parapet edge, set just behind the roof's front edge
        cz = sp.get('coping_h', 0.6)
        if sp.get('coping'):
            parts.append(lib.box(f'sign_{cid}.coping', x, y + 1.2, w + 2.0, 2.0, cz,
                                 mat(f'coping_{sp["coping"]}', sp['coping']), z=z, bevel=0.08, collection='logos'))
        o.location = (x, y + 1.2 + depth / 2 - 0.2, z + cz)
        site.top = max(site.top, z + cz + h)
    else:
        if sp.get('panel'):
            parts.append(lib.box(f'sign_{cid}.panel', x, y, w + 2 * pad, h + 2 * pad, 0.08,
                                 mat(f'inlay_{sp["panel"]}', sp['panel']), z=z, bevel=0, collection='logos'))
        o.location = (x, y - h / 2, z + 0.06)
    for p in parts:
        p.parent = site.root
    o.parent = site.root
    print(f'[logo] {cid}: {kind} {w:.1f} x {h:.1f} m', flush=True)
    return o
