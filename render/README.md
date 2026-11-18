# render/: the v2 hero still

The hero is one Cycles render of a city built entirely by the Python in this folder. The plan is in
`docs/PLAN-v2.md`. `hero.py` builds the shipped scene; `npm run hero` (below) turns it into the City view assets.

| File | What it does |
|---|---|
| `content.mjs` | Prints the name, title colour and employers from `content.js` as JSON. The Blender scripts call it, so no resume text lives here. |
| `lib.py` | Scene reset, render settings, the locked camera and sun/sky rig, clay materials, primitives, and the name as letter buildings. |
| `kit.py` | Clay massing typologies: slab, L, U, courtyard, drum, stepped, tower, campus, deck, sawtooth, stadium, twin, chain, shed and chamfer. Also tree groves. |
| `blockout.py` | Milestone 2: three hand-placed arrangements (A, B, C) of the name, the eight employer sites and the surrounding masses. |
| `m1_cube.py` | Milestone 1: a beveled cube on a plane under the same rig. |
| `fonts/` | Archivo Black (SIL OFL 1.1, licence in `fonts/OFL.txt`): the face for the letter buildings. |
| `previews/` | Small JPEG previews committed for review. Full-size renders stay out of the repo. |

## Run

Blender 4.2 or newer runs headless on the CPU. Node must be on `PATH`, because the scripts read `content.js` through it.

```sh
B=blender   # or the official LTS tarball's binary, which ships OpenImageDenoise
OUT=/tmp/v2 # any scratch directory

$B -b --factory-startup -P render/m1_cube.py -- --out $OUT --preview render/previews/m1-cube.jpg

# 1440x960 clay blockouts, one per arrangement
$B -b --factory-startup -P render/blockout.py -- --arr B --samples 512 \
   --out $OUT/m2-B.png --preview render/previews/m2-B.jpg

# 780x1688 phone framing (390x844 at 2x)
$B -b --factory-startup -P render/blockout.py -- --arr B --portrait --samples 512 \
   --out $OUT/m2-B-portrait.png --preview render/previews/m2-B-portrait.jpg

# Key: letters in THEME.titleColor and each employer site in its accent, so you can see which mass is which
$B -b --factory-startup -P render/blockout.py -- --arr B --key --samples 128 --scale 50 \
   --out $OUT/m2-B-key.png --preview render/previews/m2-B-key.jpg
```

`--scale` sets the resolution percentage for quick drafts. Each run prints where every employer site
lands in the frame (0..1, origin bottom left) and how long the render took.

The same command produces the same image: the Cycles seed is fixed, the tree groves are seeded per
grove, and every building is placed by hand in `blockout.py`.

## Blender, denoising and sampling

Use the official Blender 4.2 LTS tarball from blender.org, unpacked at
`~/.local/opt/blender-4.2.23/` (`npm run hero` and `npm run sprites` pick it up there; `BLENDER=`
overrides). It ships OpenImageDenoise; the Debian/Ubuntu `blender` package does not.
`lib.setup_render` turns on adaptive sampling (noise threshold 0.01, at least 32 samples, `--samples`
is the cap) and, when the build has it, the OIDN denoiser with albedo and normal passes and the
accurate prefilter. It prints which: `[render] Blender 4.2.23 LTS: OpenImageDenoise on, …`. Without
OIDN it warns and renders undenoised, which needs about 512 samples.

## The hero (`hero.py`)

`hero.py` builds the composition that goes on the page:
- the name in two lines of letter buildings;
- the employer and Norwich buildings, each with its logo built into the architecture (`hq.py`,
  `logos.py`; sources in `logos/SOURCES.md` and `HQ.md`). A builder returns a `sign` dict and
  `logos.place` makes it one of three kinds, all aligned to the building, with no legs, panels or glow:
  - `facade`: relief letters on a stone fascia band over the entrance storeys;
  - `roof`: upright letters on a coping just behind the roof's front edge;
  - `inlay`: flat letters set into a roof.
- the city around them: blocks with filler buildings (parapets, entrances, setbacks, roof plant),
  three tree species planted in groups, people in small groups, an elevated freeway with two working
  ramps, parks, a canal.

The freeway ramps (`RAMPS`, `ramp()` in `hero.py`) start level in a street, turn, climb at a steady
8% grade with eased vertical curves at both ends, run alongside the freeway at deck height and merge
into its outer lane over a 72 m taper where the deck widens and the freeway's parapet stops. Pillars
carry them; lots and street trees in their corridor are cleared. Their lanes are exported as
`rampLanes` in scene.json. `--frame ramps` is a close-up for checking them.

All colours and materials live in `palette.py`. Facades are procedural, with windows by storey and
bay and no textures, so any massing gets windows that line up with its floors.

```sh
$B -b --factory-startup -P render/hero.py -- --mode clay --frame master --out $OUT/master.png
$B -b --factory-startup -P render/hero.py -- --mode key  --frame crop   --out $OUT/crop.png
$B -b --factory-startup -P render/hero.py -- --mode key  --frame portrait --out $OUT/portrait.png
```

`--frame master` is 2400×1600, which is 1.67× the resting view in each direction, so the page can
pan. `--frame crop` renders only the centre 1440×960 of the master. The pixels are identical, because
it uses a render border with crop. `--frame portrait` is 780×1688 (390×844 at 2×) and has its own centre and width.

### World-to-screen projection (for sprites that follow roads)

The camera is orthographic, so the projection is affine: a road stays a straight line on screen, and
a sprite can move along it with one 2D transform. The scene uses local metres:
- X runs along the lines of the name.
- Y runs across them.
- Z is up.

The constants live in `lib.py` and `hero.py`:
- azimuth `a = CAM_AZ = 33°`
- elevation `e = CAM_ELEV = 42°`
- frame centre `T = TARGET = (-34, 28, 0)` for the master and crop, `(-40, 30, 0)` for the portrait
- frame width `Wm` in metres: 1000 for the master, 580 for the portrait

For a point `P = (x, y, z)`:

```
dx, dy, dz = P - T
sx = dx·cos a + dy·sin a                                   # metres, screen right
sy = -dx·sin a·sin e + dy·cos a·sin e + dz·cos e           # metres, screen up
px = Wpx/2 + sx·(Wpx/Wm)
py = Hpx/2 - sy·(Wpx/Wm)                                   # pixels, y down
```

With numbers, `sx = 0.8387·dx + 0.5446·dy` and `sy = -0.3644·dx + 0.5612·dy + 0.7431·dz`.
- Master: 2.4 px per metre, centre (1200, 800).
- Centre crop: subtract (480, 320) from the master pixel.

Checked against Blender's `world_to_camera_view` for both frames: within 0.05 px.

Roads on screen:
- A road along X (every E-W street in `hero.BANDS`) runs in the screen direction
  (0.8387, +0.3644) in pixel axes: right and slightly down.
- A road along Y (the cross streets) runs in (0.5446, -0.5612): right and up.

Streets and lanes:
- **E-W streets** fill the gaps between consecutive bands (`hero.ew_streets()`).
  - A 12 m street has its travel lanes 3–9 m in from the southern kerb.
  - The two 22 m avenues (y −32…−10 and 346…368) have a 2.2 m planted median, with two lanes each
    way at 3–8 m from either kerb.
  - Parked cars line every kerb.
  - `hero.CANAL` (y −340…−312) is water, not a road.
- **Cross streets** sit at `offset + 110·k` for each band. They are 12 m wide.
- **The freeway** follows `hero.FREEWAY` through a Catmull-Rom spline (`hero.catmull`, sampled
  every 6 m).
  - The deck top is at z = 11 m (`FWY_Z`).
  - Lane centres are ±3.8 m and ±9.4 m from the centreline, with right-hand traffic.
  - Its screen path is the projection of those points with dz = 11. It is a curve, so a sprite
    follows the sampled polyline.
  - The ramps (`hero.RAMPS`) run from the deck down to the avenues.
The sky over the top rows (tall towers, little ground) is the room left for balloons and planes.

## Shipping it: `npm run hero`

One command regenerates everything the City view loads (`assets/hero/`). Commit its outputs; the
intermediates in `render/out/` are git-ignored.

```sh
npm run hero                     # full run (timings below)
npm run hero -- --samples 64     # quick draft
npm run hero -- --skip-render    # reuse render/out/*.png: re-export, re-encode, re-mask, re-trace
BLENDER=/path/to/blender npm run hero
```

Timings on this machine's CPU with Blender 4.2 + OIDN at the default cap of 512 samples: the 4800×3200
master about 15 minutes, the 1560×3376 portrait about 6.5, each flat pass under 10 seconds, the
sprites about 50 seconds; about 24 minutes in all. Sizes: master-4800.webp 1.5 MB (q80; 2.1 MB at q88),
master-2400.webp 0.9 MB, master-2400.jpg 1.0 MB, portrait-1560.webp 1.0 MB, portrait-780.webp 0.4 MB.

Steps (`scripts/hero.mjs`), for each frame (master, portrait):
1. `hero.py --export … --export-only` writes the scene facts: camera, sun, frames, traffic lanes
   (`lanes()`: the street pieces and the freeway spline offset to each lane, in driving order),
   site positions, palette, each title letter's image box, and probe points projected with
   Blender's `world_to_camera_view`.
2. The beauty render at 2× the frame (`--scale 200`: the master is 4800×3200, the portrait
   1560×3376), saved as a lossless PNG. Then Workbench passes on the same camera and geometry (flat
   colour, no anti-aliasing or dither):
   - `--pass id` (1×): each site (building, plaza, sign) in its own colour, everything else black.
   - `--pass roads` (1×): visible street surface red, visible freeway deck and ramps green.
   - `--pass depth` (1×): each pixel's distance from the camera plane in quarter metres, 16 bits
     across red and green (Workbench Z pass through the compositor).
   - `--pass logos` (4×): every logo shape in its SVG colour, everything else magenta.
3. `render/encode.py` encodes each file once, straight from the PNG (Blender is the encoder; no cwebp
   or PIL here): WebP q80 at 4800 and q88 at 2400 wide plus a JPEG q84 fallback at 2400 for the master;
   WebP at 1560 and 780 plus JPEG at 780 for the portrait. The page lists the WebPs with width
   descriptors and `sizes`, so DPR 2 screens get the 2× file.
4. The page's projection (`src/hero/projection.js`) is checked against the probe points; the run
   fails if they differ by more than 0.75 px.
5. `scripts/hero-mask.mjs` turns the road pass into `roads-<frame>-{street,freeway}.png`, alpha
   masks for the car layers, grown upward by 3.2 m (a bus or truck roof), but only into pixels
   no nearer the camera than a vehicle roof on that road (from the depth pass), so a sprite never
   shows over a tree, person or kerb car standing in front of it. Street lanes run 4 m off each
   kerb (4.6 and 8 m on wide avenues), clear of the cars parked at 1.6 m; the freeway deck has
   no baked cars. Ramp lanes (`rampLanes`) start on an avenue lane centre and end on a freeway
   lane vertex, with unit 3D tangents for picking a sprite's heading on the slope.
6. `scripts/hero-trace.mjs` traces the ID pass into `regions.json`: one simplified outline per site,
   in image pixels (marching squares, holes dropped, Douglas-Peucker).
7. The logos are copied to `assets/hero/logos/` for the cards.
8. `scripts/hero-strokes.mjs` measures each sign in the logo pass and prints its narrowest stroke and
   counter in CSS px at a 1440-wide viewport (where the 2400 frame shows 1:1); the floor is 2 px.
   Method: per sign box (`signBoxes` in scene.json), colours quantized to 6 bits a channel; an exact
   Euclidean distance transform per colour; each pixel's local thickness is the diameter of the
   largest inscribed disc covering it; counters are enclosed background holes of at least 4 px².
   It reports the 10th percentile (a tapering tip is a few pixels, not a stroke) and the median,
   and writes `render/out/strokes.json`. Run it alone with
   `node scripts/hero-strokes.mjs render/out/logos-master.png render/out/scene-master.json master 4`.
9. `npm run sprites` (see "Moving sprites" below), unless `--no-sprites`. It runs last because the sprites copy hero.py's sun and sky.

The page (`src/hero/`): `city.js` owns the camera (drag, wheel, held WASD/arrow keys with
velocity and friction, eased snaps), the regions, the hover preview, the side drawer (a bottom
sheet on phones), the Sites list, number-key snaps, the selection marker (the `marker` sprite) and
the key list (`?`). `card.js` fills the preview and the drawer from `content.js`. `sprites.js`
runs the traffic, planes, helicopter and balloons over the still.

## Moving sprites (`npm run sprites`)

Cars, planes, the helicopter and the balloons are low-poly models (`sprites_models.py`) rendered by
`sprites.py` under the hero's rig: `lib.camera` orientation, `lib.sun()`, `lib.world(strength=1.0)`
and `lib.setup_render`'s AgX look. If `hero.py` changes its sun, sky or look, rerun this too.

```sh
npm run sprites                     # about a minute on the CPU (official 4.2 LTS if installed)
npm run sprites -- --samples 48     # quick draft
npm run sprites -- --skip-render    # re-pack and re-encode render/out/sprites/*.png
```

- **Frames.** 16 headings for cars, planes and the helicopter body. Road vehicles get 3 more
  between each pair (`extraYaws`, a 5.625° step) in every 22.5° sector the freeway or its ramps
  run through (read from `assets/hero/scene.json`, so rerun after the freeway moves). That makes
  46 columns and puts cars-2x at about 690 KB (240 KB with 16). 4 propeller phases. The
  helicopter rotor is a separate sprite in 8 phases, drawn over the body at the same anchor.
  Balloons have 4 headings (gores repeat every 45°). There are 3 or 4 colour variants per model;
  the first balloon uses `THEME.titleColor`.
- **Contrail puffs:** 4 small volumetric clouds, lit by the same sun, in the `air` atlas. The page
  emits them behind a jet's engines (and faintly behind a prop plane's tail). It grows, drifts and
  fades them, and turns them off under reduced motion.
- **One render per atlas.** Every frame is placed at the world point the orthographic camera
  projects onto its cell's anchor. Each cell is pushed along the view axis in proportion to how far
  toward the sun it sits on screen, so no model can shade another.
- **Shadows.** Cars carry a baked contact shadow from a shadow-catcher quad under each cell. Each
  flyer has a separate shadow frame, rendered by a camera-invisible copy over a catcher. The page
  offsets it along the sun by the altitude and blurs it with height on the ground layer.
- **Outputs** go to `assets/hero/sprites/`:
  - `cars-{1x,2x}.webp` and `air-{1x,2x}.webp`: 2x is 4.8 px/m, which matches the 4800 px master.
  - `shadows.webp`: 2.4 px/m.
  - `sprites.json`, the index. For each model it gives the atlas, the block origin, the cell size,
    the anchor, the heading count and step, the variants and phases, and the length in metres.
    Its coordinates are in the largest file of each atlas.
  - A frame `(heading h, variant v, phase p)` is the cell at column `h`, row `v * phases + p`.
- **Contact sheet:** `render/previews/sprites-sheet.jpg`.
- **Marker:** `marker.{1x,2x}.webp` (atlas `marker`, model `marker`) is a glossy red bevelled
  triangle facing the camera, anchored at its tip, with no shadow.
- **The page** (`src/hero/sprites.js`) draws everything on four viewport-sized canvases (ground
  shadows, street cars, freeway cars, air), placed inside the panning world. Each frame clears
  and redraws only the boxes it drew last time. The car canvases keep only pixels on visible road
  (`roads-<frame>-*.png`, cut to the view once per pan, `destination-in` over the drawn boxes).
  Flyer shadows are blurred once per size and cached, since a canvas filter every frame is slow in
  Chromium. Idle at 1440×900 in headless Firefox, frames went from 33 ms median and 51 ms p95
  (SVG sprites under CSS masks) to 17 ms and 17 ms.
- **Headings:** the page shows the atlas column whose projected screen axis best matches the
  projected 3D direction of travel, including the grade on ramps, or `tangents` when a ramp
  exports them. A new column must be better by more than 0.5° so a sprite does not flicker.
  Freeway and ramp cars in view are within 2.2° and 2.9° of their path on screen, measured
  with `spriteState()`. With 16 headings and a 0.012 cosine margin they were up to 10° off. Images
  are never rotated, except a balloon's sway.
- **Traffic:** lanes keep their exported vertices. A car stays a 3 m gap behind the car ahead.
  `scene.rampLanes` (`[x, y, z]` points) start on the lane they are fed from and end on the lane
  they merge into. A car turns off or merges only into a gap, at the exact station, and eases out
  any offset over 18 m. A merging car waits at the ramp's end until there is room.
- **Marker API:** `createMarker(layer, { scene, frame, base, scale })` returns
  `{ show(x, y), hide() }`. `layer` is an SVG whose viewBox is the frame's image pixels, and
  `(x, y)` is the tip in those pixels. It bobs gently, and stays still under reduced motion.
  `scale` (default 1.6) enlarges it from the city's metres-per-pixel.
- **Debugging:** `canvas.sprites-air` has `spriteState()`, which returns cars (lane, station,
  heading fit), planes and puffs in image pixels.
