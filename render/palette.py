"""The scene palette and materials, in one place.

Colours follow the warm miniature-city look described in docs/PLAN-v2.md: cream concrete, pale
roofs, muted teal glass, dark asphalt, real greens, and saturated colour only on signs and props.

Facades are procedural (no textures): a shader reads the world position and the face normal and
draws window bands or punched windows by storey (lib.FLOOR) and bay (BAY), with a bump that sets
the glass back from the wall. Upward faces get the roof colour. So one material dresses any
massing, and the windows line up with the storeys.

`Palette(clay=True)` returns the one clay material for everything (the composition check).
"""
import random

import bpy

import lib

BAY = 3.6           # window bay, metres (wider than a real bay: at 2.4 px/m finer grids alias)

# ── colours ─────────────────────────────────────────────────────────────────
# the page's own chrome (cards, chips) borrows these: a cream face and a dark frame
CHROME = {'panel': '#f7f5ef', 'frame': '#33373d'}

C = {
    'asphalt': '#3a3e44', 'paint': '#e9e6df', 'sidewalk': '#cfc7b8', 'plaza': '#ddd4c2',
    'kerb': '#bdb5a6', 'grass': '#6f9a3a', 'grass2': '#5f8c34', 'field': '#5f9a3e',
    'foliage': '#2f5e2c', 'foliage2': '#3f7030', 'foliage3': '#557f2c', 'trunk': '#5b4632',
    'water': '#4f8f97', 'concrete': '#c9c3b7', 'deck': '#a9a59c', 'plant': '#a7a59f',
    'roof': '#e5e1d7', 'gravel': '#a9a59c', 'glass': '#6f9aa3', 'glass_dark': '#4f6c7a',
    'slate': '#4f565c', 'white': '#f4f2ec', 'stone': '#e2d9c6', 'brick': '#9b4a36',
    'tank': '#7a5236', 'skylight': '#8fb3bd', 'track': '#b5523b', 'roofred': '#a8483a',
    'spray': '#e8f0f0', 'barrier': '#c9c4ba', 'pillar': '#bdb7ab',
    'coping': '#d8d2c5', 'doorway': '#2f3a40', 'lobby': '#5f8a94', 'seat': '#3f6f8f', 'seat2': '#c9c3b7',
}

# Filler facades: (wall, glass, roof, style). Styles: ribbon, punched, curtain, plain.
OFFICE = [
    ('#e7dcc8', '#6f9aa3', '#e5e1d7', 'ribbon'),
    ('#d6ccb8', '#5f7684', '#d9d4c8', 'ribbon'),
    ('#ebe5d8', '#79a5aa', '#c9c4b9', 'ribbon'),
    ('#ddd2bd', '#5f7684', '#e5e1d7', 'punched'),
    ('#c9b79c', '#4f6c7a', '#bdb8ad', 'punched'),
    ('#b98a6a', '#4f6c7a', '#a9a59c', 'punched'),     # brick-toned block
    ('#e4dccb', '#6f9aa3', '#b6b2a8', 'ribbon'),
    ('#d2c6b0', '#6f8f99', '#e5e1d7', 'punched'),
]
TOWER = [
    ('#cfd6d6', '#6f9aa3', '#d9d4c8', 'curtain'),
    ('#d6ccb8', '#5f7684', '#e5e1d7', 'curtain'),
    ('#e4dccb', '#79a5aa', '#c9c4b9', 'curtain'),
]
WAREHOUSE = [
    ('#a8674c', '#4f6c7a', '#8f8a80', 'punched'),
    ('#b77a58', '#5f7684', '#9a958b', 'punched'),
]
SHED = [('#d9d4c8', '#5f7684', '#b6b2a8', 'plain'), ('#c7c9c4', '#5f7684', '#a9a59c', 'plain')]

CARS = ['#c23b32', '#2f5d8a', '#e9e6df', '#2b2d31', '#d6a531', '#7a8a96', '#3f6b4f', '#f2f0ea']
CLOTHES = ['#c23b32', '#2f5d8a', '#e0b13a', '#2b2d31', '#e9e6df', '#3f7a52', '#8a4f9a']

# window layouts per style: (sill, head) as fractions of a storey, (left, right) of a bay,
# trim width as a fraction
STYLES = {
    'ribbon': dict(v=(0.32, 0.86), h=(0.04, 1.0), trim=0.0),
    'punched': dict(v=(0.30, 0.82), h=(0.22, 0.78), trim=0.05),
    'curtain': dict(v=(0.08, 0.98), h=(0.03, 1.0), trim=0.0),
    'plain': dict(v=(0.62, 0.86), h=(0.30, 0.70), trim=0.0),
}


def _math(nt, op, a, b=None, clamp=False):
    n = nt.nodes.new('ShaderNodeMath')
    n.operation = op
    n.use_clamp = clamp
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def _between(nt, x, lo, hi):
    return _math(nt, 'MULTIPLY', _math(nt, 'GREATER_THAN', x, lo), _math(nt, 'LESS_THAN', x, hi))


def _mix(nt, fac, a, b):
    n = nt.nodes.new('ShaderNodeMix')
    n.data_type = 'RGBA'
    nt.links.new(fac, n.inputs['Factor'])
    for sock, v in ((n.inputs[6], a), (n.inputs[7], b)):
        if isinstance(v, str):
            sock.default_value = lib.hexcol(v)
        else:
            nt.links.new(v, sock)
    return n.outputs[2]


def facade(name, wall, glass, roof, style='ribbon', trim=None, ground=None):
    """A procedural facade material. `trim` colours a frame around punched windows; `ground`
    (a colour) makes the ground storey a darker shopfront band."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    st = STYLES[style]
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    pos = nt.nodes.new('ShaderNodeSeparateXYZ')
    nrm = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Position'], pos.inputs[0])
    nt.links.new(geo.outputs['Normal'], nrm.inputs[0])
    f = _math(nt, 'FRACT', _math(nt, 'DIVIDE', pos.outputs['Z'], lib.FLOOR))
    storey = _math(nt, 'FLOOR', _math(nt, 'DIVIDE', pos.outputs['Z'], lib.FLOOR))
    # bay coordinate: along X on faces that look along Y, along Y on faces that look along X
    ux = _math(nt, 'FRACT', _math(nt, 'DIVIDE', pos.outputs['X'], BAY))
    uy = _math(nt, 'FRACT', _math(nt, 'DIVIDE', pos.outputs['Y'], BAY))
    facing_x = _math(nt, 'GREATER_THAN', _math(nt, 'ABSOLUTE', nrm.outputs['X']),
                     _math(nt, 'ABSOLUTE', nrm.outputs['Y']))
    u = nt.nodes.new('ShaderNodeMix')
    u.data_type = 'FLOAT'
    nt.links.new(facing_x, u.inputs['Factor'])
    nt.links.new(ux, u.inputs[2])
    nt.links.new(uy, u.inputs[3])
    u = u.outputs[0]
    win = _math(nt, 'MULTIPLY', _between(nt, f, *st['v']), _between(nt, u, *st['h']))
    t = st['trim'] if trim else 0.0
    frame = _math(nt, 'MULTIPLY', _between(nt, f, st['v'][0] - t, st['v'][1] + t),
                  _between(nt, u, st['h'][0] - t, st['h'][1] + t))
    roof_mask = _math(nt, 'GREATER_THAN', nrm.outputs['Z'], 0.5)
    wall_mask = _math(nt, 'SUBTRACT', 1.0, roof_mask)
    win = _math(nt, 'MULTIPLY', win, wall_mask)
    col = wall
    if trim:
        col = _mix(nt, frame, wall, trim)
    if ground:
        col = _mix(nt, _math(nt, 'LESS_THAN', storey, 0.5), col, ground)
    col = _mix(nt, win, col, glass)
    col = _mix(nt, roof_mask, col, roof)
    nt.links.new(col, p.inputs['Base Color'])
    rough = _math(nt, 'ADD', 0.82, _math(nt, 'MULTIPLY', win, -0.62))
    nt.links.new(rough, p.inputs['Roughness'])
    p.inputs['Specular IOR Level'].default_value = 0.45
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.6
    bump.inputs['Distance'].default_value = 0.15
    nt.links.new(_math(nt, 'SUBTRACT', 1.0, win), bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m


def road(name, paint, lines, axis='x', dash=(3.0, 6.0)):
    """Asphalt with painted lines. `lines` are offsets (m) across the road from its centre;
    a positive dash length makes the line dashed (dash, period). Uses object coordinates, so each
    road box must be centred on its own origin (lib.box does this)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    along, across = (sep.outputs['X'], sep.outputs['Y']) if axis == 'x' else (sep.outputs['Y'], sep.outputs['X'])
    on = None
    for off, dashed in lines:
        ln = _math(nt, 'LESS_THAN', _math(nt, 'ABSOLUTE', _math(nt, 'SUBTRACT', across, off)), 0.14)
        if dashed:
            d = _math(nt, 'LESS_THAN', _math(nt, 'FRACT', _math(nt, 'DIVIDE', along, dash[1])), dash[0] / dash[1])
            ln = _math(nt, 'MULTIPLY', ln, d)
        on = ln if on is None else _math(nt, 'MAXIMUM', on, ln)
    col = _mix(nt, on, C['asphalt'], paint) if on is not None else None
    if col is not None:
        nt.links.new(col, p.inputs['Base Color'])
    else:
        p.inputs['Base Color'].default_value = lib.hexcol(C['asphalt'])
    p.inputs['Roughness'].default_value = 0.92
    p.inputs['Specular IOR Level'].default_value = 0.2
    return m


def glow(name, color, strength=0.8, rough=0.5):
    """A sign face: its own colour plus a modest emission, so it reads in any light."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = lib.material(name, color, rough=rough, spec=0.3)
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Emission Color'].default_value = lib.hexcol(color) if isinstance(color, str) else color
    p.inputs['Emission Strength'].default_value = strength
    return m


class Palette:
    """Material lookup for one render. In clay mode every lookup returns the clay material."""

    def __init__(self, clay_mode, title_color='#2b59c3'):
        self.clay_mode = clay_mode
        self.clay = lib.material('clay', '#cdc8be', rough=0.75, spec=0.4)
        self.title_color = title_color

    def _c(self, m):
        return self.clay if self.clay_mode else m

    def flat(self, key, rough=0.85, spec=0.35):
        return self._c(lib.material(key, C.get(key, key), rough=rough, spec=spec))

    def facade(self, name, wall, glass, roof, style='ribbon', trim=None, ground=None):
        return self._c(facade(name, wall, glass, roof, style, trim, ground))

    def filler(self, kind, seed):
        """A facade for a filler building of typology letter `kind`, chosen by `seed`."""
        rng = random.Random(seed)
        pool = {'W': TOWER, 'D': TOWER + OFFICE[:3], 'Z': WAREHOUSE, 'H': SHED}.get(kind, OFFICE)
        i = rng.randrange(len(pool))
        wall, glass, roof, style = pool[i]
        if kind == 'P':
            return self.facade('deck', C['deck'], C['deck'], C['deck'], 'plain')
        return self.facade(f'f_{wall}{glass}{roof}{style}', wall, glass, roof, style)

    def title(self):
        """The name: solid blue, satin (no windows: it reads as lettering, not buildings)."""
        return self._c(lib.material('title', self.title_color, rough=0.42, spec=0.45))

    def road(self, width):
        """Road paint by width: a dashed centre line, or two lanes each way beside a median."""
        if width >= 18:
            return self._c(road(f'road{width:.0f}', C['paint'], [(w * s, True) for s in (-1, 1)
                                                                  for w in (width / 4 + 0.6,)]))
        return self._c(road('road_x', C['paint'], [(0.0, True)]))

    def road_ns(self):
        return self._c(road('road_y', C['paint'], [(0.0, True)], axis='y'))

    def glow(self, name, color, strength=0.8):
        return self._c(glow(name, color, strength))

    def cars(self):
        return [self._c(lib.material(f'car{i}', c, rough=0.35, spec=0.6)) for i, c in enumerate(CARS)]

    def clothes(self):
        return [self._c(lib.material(f'cloth{i}', c, rough=0.8)) for i, c in enumerate(CLOTHES)]

    def water(self):
        return self._c(lib.material('water', C['water'], rough=0.08, spec=0.6))
