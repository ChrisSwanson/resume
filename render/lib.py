"""Shared Blender helpers for the v2 hero render: scene reset, render settings,
the locked camera and light rig, clay materials, and mesh primitives.

Units are metres. One storey is FLOOR. The city is built in a local frame where
streets run along X (the reading direction of the name) and Y; the camera, not
the city, is rotated so the two road axes land at different screen slopes.
"""
import json
import math
import os
import subprocess
import sys
import time

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
FONT = os.path.join(HERE, 'fonts', 'ArchivoBlack-Regular.ttf')

FLOOR = 3.6          # one storey, metres
CAM_ELEV = 42.0      # camera elevation above the ground plane, degrees
CAM_AZ = 33.0        # angle between the view axis and the city's Y streets, degrees
CAM_LENS = 120.0     # mm on a 36 mm sensor: long lens, verticals barely converge
SUN_ELEV = 36.0      # degrees
SUN_SHADOW_AZ = 22.0  # direction shadows fall on the ground, degrees from +X (screen: right, a little down)


def args():
    """Arguments after the `--` on the blender command line, as a dict of --key value."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out, key = {}, None
    for a in argv:
        if a.startswith('--'):
            key = a[2:]
            out[key] = True
        elif key:
            out[key] = a
            key = None
    return out


def content():
    """Resume data the renderer needs, read from content.js through node."""
    raw = subprocess.check_output(['node', os.path.join(HERE, 'content.mjs')], cwd=REPO)
    return json.loads(raw)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    return scene


def setup_render(scene, width, height, samples=64, look='AgX - Medium High Contrast'):
    r = scene.render
    r.engine = 'CYCLES'
    r.resolution_x, r.resolution_y, r.resolution_percentage = width, height, 100
    r.film_transparent = False
    c = scene.cycles
    c.device = 'CPU'
    c.samples = samples
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.01
    c.adaptive_min_samples = 32
    import _cycles
    if getattr(_cycles, 'with_openimagedenoise', False):
        # OIDN with albedo and normal guides keeps edges (sign lettering) crisp while removing grain
        c.use_denoising = True
        c.denoiser = 'OPENIMAGEDENOISE'
        c.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
        c.denoising_prefilter = 'ACCURATE'
        print(f'[render] Blender {bpy.app.version_string}: OpenImageDenoise on, adaptive sampling '
              f'(max {samples}, threshold {c.adaptive_threshold})', flush=True)
    else:  # distro builds may ship without OIDN; use the official 4.2 LTS tarball (render/README.md)
        print('[render] WARNING: this Blender has no OpenImageDenoise; rendering without a denoiser',
              flush=True)
        c.use_denoising = False
    c.seed = 7
    c.max_bounces = 6
    c.diffuse_bounces = 3
    c.glossy_bounces = 2
    c.transmission_bounces = 2
    c.transparent_max_bounces = 2
    c.caustics_reflective = c.caustics_refractive = False
    c.blur_glossy = 1.0
    r.threads_mode = 'AUTO'
    vs = scene.view_settings
    vs.view_transform = 'AgX'
    try:
        vs.look = look
    except TypeError:
        vs.look = 'None'
    vs.exposure = -0.35
    vs.gamma = 1.0


def hexcol(h, a=1.0):
    """sRGB hex to linear RGBA."""
    h = h.lstrip('#')
    def lin(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(int(h[0:2], 16)), lin(int(h[2:4], 16)), lin(int(h[4:6], 16)), a)


def material(name, color, rough=0.85, spec=0.35):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = hexcol(color) if isinstance(color, str) else color
    p.inputs['Roughness'].default_value = rough
    p.inputs['Specular IOR Level'].default_value = spec
    return m


def world(scene, zenith='#7aa2d4', strength=0.5):
    """Cool sky fill: a vertical gradient (blue above, pale at the horizon)."""
    w = bpy.data.worlds.new('sky')
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = hexcol('#d9dde0')
    ramp.color_ramp.elements[1].position = 0.6
    ramp.color_ramp.elements[1].color = hexcol(zenith)
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    nt.links.new(bg.outputs[0], out.inputs[0])
    return w


def sun(strength=5.5, angle_deg=3.0, color='#ffe9cc'):
    """Warm key from the upper left of frame; shadows fall lower right."""
    d = bpy.data.lights.new('sun', 'SUN')
    d.energy = strength
    d.angle = math.radians(angle_deg)
    d.color = hexcol(color)[:3]
    o = bpy.data.objects.new('sun', d)
    bpy.context.scene.collection.objects.link(o)
    az, el = math.radians(SUN_SHADOW_AZ), math.radians(SUN_ELEV)
    travel = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), -math.sin(el)))
    o.rotation_euler = travel.to_track_quat('-Z', 'Y').to_euler()
    return o


def view_dirs():
    """Unit vectors (forward, right) of the camera projected on the ground plane."""
    a = math.radians(CAM_AZ)
    f = Vector((-math.sin(a), math.cos(a), 0.0))
    r = Vector((math.cos(a), math.sin(a), 0.0))
    return f, r


def camera(target, width_m, lens=CAM_LENS, aspect=1.5, name='cam', ortho=False):
    """Camera looking at `target` (x, y, z) from CAM_ELEV, framing `width_m` of screen-horizontal
    extent at the target. Long lens by default; `ortho` makes the projection exactly affine (the
    hero uses it so sprites can follow roads with a fixed 2D transform)."""
    cd = bpy.data.cameras.new(name)
    if ortho:
        cd.type = 'ORTHO'
        cd.sensor_fit = 'HORIZONTAL'
        cd.ortho_scale = width_m
        dist = 3000.0
        cd.clip_start, cd.clip_end = 10.0, 8000.0
        o = bpy.data.objects.new(name, cd)
        bpy.context.scene.collection.objects.link(o)
        f, _ = view_dirs()
        el = math.radians(CAM_ELEV)
        look = Vector((f.x * math.cos(el), f.y * math.cos(el), -math.sin(el)))
        o.location = Vector(target) - look * dist
        o.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
        bpy.context.scene.camera = o
        return o
    cd.lens = lens
    cd.sensor_fit = 'HORIZONTAL' if aspect >= 1 else 'VERTICAL'
    cd.sensor_width = 36.0
    cd.sensor_height = 36.0
    fov = 2 * math.atan(18.0 / lens)
    span = width_m if aspect >= 1 else width_m / aspect  # framed extent along the fitted axis
    dist = (span / 2) / math.tan(fov / 2)
    cd.clip_start, cd.clip_end = 10.0, dist * 4
    o = bpy.data.objects.new(name, cd)
    bpy.context.scene.collection.objects.link(o)
    f, _ = view_dirs()
    el = math.radians(CAM_ELEV)
    look = Vector((f.x * math.cos(el), f.y * math.cos(el), -math.sin(el)))
    t = Vector(target)
    o.location = t - look * dist
    o.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = o
    return o


# ── geometry ────────────────────────────────────────────────────────────────

_COLL = {}


def coll(name):
    c = _COLL.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
        _COLL[name] = c
    return c


def _obj(name, mesh, mat, collection, bevel=0.0, segments=2):
    o = bpy.data.objects.new(name, mesh)
    coll(collection).objects.link(o)
    if mat:
        mesh.materials.append(mat)
    if bevel > 0:
        m = o.modifiers.new('bevel', 'BEVEL')
        m.width = bevel
        m.segments = segments
        m.limit_method = 'ANGLE'
        m.angle_limit = math.radians(35)
        m.harden_normals = False
        m.use_clamp_overlap = True
    for p in mesh.polygons:
        p.use_smooth = False
    return o


def box(name, x, y, w, d, h, mat, z=0.0, rot=0.0, bevel=0.25, collection='city'):
    """Axis box with its base centred at (x, y, z), w along X, d along Y, rotated `rot` deg."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = _obj(name, me, mat, collection, bevel=min(bevel, w / 4, d / 4, h / 4))
    o.location = (x, y, z)
    o.rotation_euler = (0, 0, math.radians(rot))
    return o


def prism(name, pts, h, mat, z=0.0, bevel=0.25, collection='city'):
    """Extrude a 2D polygon (counter-clockwise list of (x, y)) to height h, base at z."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z)) for x, y in pts]
    f = bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=[f])
    if f.normal.z > 0:
        f.normal_flip()
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [v for v in ext['geom'] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, h), verts=top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return _obj(name, me, mat, collection, bevel=bevel)


def wedge(name, x0, x1, d, h, mat, z=0.0, collection='city'):
    """Triangular prism along Y (a sawtooth roof tooth): vertical face at x1, slope down to x0."""
    bm = bmesh.new()
    a = [bm.verts.new((x, -d / 2, zz)) for x, zz in ((x0, z), (x1, z), (x1, z + h))]
    b = [bm.verts.new((x, d / 2, zz)) for x, zz in ((x0, z), (x1, z), (x1, z + h))]
    bm.faces.new(a)
    bm.faces.new(b[::-1])
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((a[i], b[i], b[j], a[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return _obj(name, me, mat, collection, bevel=0.08)


def gable(name, x, y, w, d, h, mat, z=0.0, rot=0.0, collection='city'):
    """A pitched roof: triangular prism w long (ridge along X), d deep, h high, base at z."""
    bm = bmesh.new()
    a = [bm.verts.new((-w / 2, yy, zz)) for yy, zz in ((-d / 2, 0), (d / 2, 0), (0, h))]
    b = [bm.verts.new((w / 2, yy, zz)) for yy, zz in ((-d / 2, 0), (d / 2, 0), (0, h))]
    bm.faces.new(a)
    bm.faces.new(b[::-1])
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((a[i], b[i], b[j], a[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = _obj(name, me, mat, collection, bevel=0.08)
    o.location = (x, y, z)
    o.rotation_euler = (0, 0, math.radians(rot))
    return o


def cyl(name, x, y, r, h, mat, z=0.0, seg=48, bevel=0.25, collection='city'):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=h)
    bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = _obj(name, me, mat, collection, bevel=min(bevel, h / 4))
    o.location = (x, y, z)
    for p in me.polygons:
        p.use_smooth = abs(p.normal.z) < 0.5
    return o


def cone(name, x, y, r, h, mat, z=0.0, seg=8, collection='city'):
    """A pointed roof or spire: base radius r at z, apex at z + h."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=0.0, depth=h)
    bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = _obj(name, me, mat, collection)
    o.location = (x, y, z)
    return o


def arc_pts(cx, cy, r, a0, a1, n=24):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def ring(name, cx, cy, r_out, r_in, h, mat, z=0.0, a0=0, a1=360, seg=64, collection='city', bevel=0.0):
    """Flat annulus or annular sector (roads, curved drives), base at z."""
    bm = bmesh.new()
    n = seg
    outer = [bm.verts.new((cx + r_out * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
                           cy + r_out * math.sin(math.radians(a0 + (a1 - a0) * i / n)), z)) for i in range(n + 1)]
    inner = [bm.verts.new((cx + r_in * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
                           cy + r_in * math.sin(math.radians(a0 + (a1 - a0) * i / n)), z)) for i in range(n + 1)]
    faces = [bm.faces.new((outer[i], outer[i + 1], inner[i + 1], inner[i])) for i in range(n)]
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    for f in faces:
        if f.normal.z < 0:
            f.normal_flip()
    if h > 0:
        ext = bmesh.ops.extrude_face_region(bm, geom=faces)
        top = [v for v in ext['geom'] if isinstance(v, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, vec=(0, 0, h), verts=top)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return _obj(name, me, mat, collection, bevel=bevel)


def text_letters(text, size, mat, x0, y0, heights, collection='name', resolution=6, bevel=0.35,
                 spacing=1.0, word=1.0):
    """The name as one building per glyph: the text is laid flat on the ground with its baseline
    centred on (x0, y0), extruded, split into one object per letter, and each letter's roof set to
    its own height from `heights` (metres, one per non-space character). `spacing` / `word` widen
    the alleys between letters and the street between words. Returns [(obj, (xmin, xmax, ymin, ymax))]."""
    font = bpy.data.fonts.load(FONT)
    cu = bpy.data.curves.new('name_text', 'FONT')
    cu.body = text
    cu.font = font
    cu.size = size
    cu.extrude = 0.5
    cu.resolution_u = resolution
    cu.align_x = 'CENTER'
    cu.space_character = spacing
    cu.space_word = word
    o = bpy.data.objects.new('name_text', cu)
    bpy.context.scene.collection.objects.link(o)
    o.location = (x0, y0, 0.5)
    deps = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(deps))
    me.transform(o.matrix_world)
    bpy.data.objects.remove(o)
    # split into connected parts, one per glyph (no dotted letters in an uppercase name)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.verts.ensure_lookup_table()
    parts, seen = [], set()
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, comp = [v], []
        seen.add(v.index)
        while stack:
            cur = stack.pop()
            comp.append(cur.index)
            for e in cur.link_edges:
                w = e.other_vert(cur)
                if w.index not in seen:
                    seen.add(w.index)
                    stack.append(w)
        parts.append(comp)
    co = [v.co.copy() for v in bm.verts]
    parts.sort(key=lambda c: min(co[i].x for i in c))
    out = []
    for k, comp in enumerate(parts):
        h = heights[k % len(heights)]
        b2 = bm.copy()
        keep = set(comp)
        bounds = (min(co[i].x for i in comp), max(co[i].x for i in comp),
                  min(co[i].y for i in comp), max(co[i].y for i in comp))
        bmesh.ops.delete(b2, geom=[v for v in b2.verts if v.index not in keep], context='VERTS')
        for v in b2.verts:
            v.co.z = h if v.co.z > 0.5 else 0.0
        lm = bpy.data.meshes.new(f'letter_{k}')
        b2.to_mesh(lm)
        b2.free()
        lo = _obj(f'letter_{k}', lm, mat, collection, bevel=bevel, segments=3)
        # smooth curved walls, crisp corners: the letters read as solid sculpted blocks
        for p in lm.polygons:
            p.use_smooth = True
        lm.set_sharp_from_angle(angle=math.radians(30))
        out.append((lo, bounds))
    bm.free()
    bpy.data.meshes.remove(me)
    return out


def text_extent(text, size):
    """(width, cap height) of `text` set in the title face at `size`."""
    font = bpy.data.fonts.load(FONT, check_existing=True)
    cu = bpy.data.curves.new('probe', 'FONT')
    cu.body, cu.font, cu.size = text, font, size
    o = bpy.data.objects.new('probe', cu)
    bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.update()
    xs = [(o.matrix_world @ Vector(c)) for c in o.bound_box]
    w = max(v.x for v in xs) - min(v.x for v in xs)
    h = max(v.y for v in xs) - min(v.y for v in xs)
    bpy.data.objects.remove(o)
    return w, h


def save(scene, png_path, jpg_path=None, quality=88):
    t0 = time.time()
    bpy.ops.render.render(write_still=False)
    dt = time.time() - t0
    img = bpy.data.images['Render Result']
    s = scene.render.image_settings
    os.makedirs(os.path.dirname(png_path), exist_ok=True)
    s.file_format, s.color_mode, s.color_depth, s.compression = 'PNG', 'RGB', '8', 15
    img.save_render(png_path, scene=scene)
    if jpg_path:
        os.makedirs(os.path.dirname(jpg_path), exist_ok=True)
        s.file_format, s.color_mode, s.quality = 'JPEG', 'RGB', quality
        img.save_render(jpg_path, scene=scene)
    k = scene.render.resolution_percentage / 100
    print(f'[render] {round(scene.render.resolution_x * k)}x{round(scene.render.resolution_y * k)} '
          f'samples={scene.cycles.samples} time={dt:.1f}s -> {png_path}', flush=True)
    return dt
