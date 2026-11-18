"""Milestone 1: toolchain check. A beveled clay cube on a plane under the locked light rig.

    blender -b --factory-startup -P render/m1_cube.py -- --out <dir> [--preview render/previews/m1-cube.jpg]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

a = lib.args()
out = a.get('out', '/tmp/v2')
scene = lib.reset()
lib.setup_render(scene, 960, 640, samples=int(a.get('samples', 128)))
lib.world(scene)
lib.sun()
clay = lib.material('clay', '#cdc8be', rough=0.75, spec=0.4)
lib.box('ground', 0, 0, 400, 400, 0.1, clay, z=-0.1, bevel=0)
lib.box('cube', 0, 0, 12, 12, 12, clay, bevel=0.6)
lib.camera((0, 0, 4), 60, aspect=1.5)
lib.save(scene, os.path.join(out, 'm1-cube.png'), a.get('preview'))
