# v2 plan: the isometric miniature city

Synthesised from two independent, adversarial plans (a Claude subagent and GPT-6.1 sol/high),
each working only from the user's reference image (HBO *Silicon Valley* key art) and the same brief.
Both picked the same approach. Where they disagreed, the decision is noted.

## Goal

The hero is one rendered still in the reference's *visual language*: a steep isometric view of a
dense tech-campus city that looks like a photographed architectural model. The name CHRIS SWANSON
is built into the city as giant lettering. Eight employer buildings can be hovered (card with company,
role and dates) and clicked (details): TiVo, Palantir, Twitch (Amazon), WeWork, Marqeta, ID.me,
Chainalysis, Wells Fargo. The Text and Agent (WebMCP) views stay as they are.

**Hard boundary.** The reference is copyrighted artwork. We build an original scene that uses the
same kind of camera, light, materials, density and props. We do not copy its layout, its buildings
or signage, its title typeface or colour, its brand logos, or its fictional companies. Never trace,
overlay or sample the reference image.

## Owner direction (2026-11-17, after the first clay gate)

- **Title:** two lines, CHRIS on top and SWANSON below. It must be large and dominate the frame
  (the first clay pass made it a 2–3 storey row, which was far too small). The typeface (Archivo
  Black) and the colour (`THEME.titleColor`) stay ours.
- **Employer buildings:** model each one on its real headquarters, simplified to the miniature style.
  Use photos as research only. Never put photos in the repo or use them as textures.
- **Employer logos:** put the owner's real employers' logos on their buildings so each is obvious at
  a glance. Rules:
  - Use official vector files (press or brand kits, or Wikimedia Commons), with each source URL
    recorded in `render/logos/SOURCES.md`.
  - Don't alter, recolour or distort them.
  - The site carries a line saying trademarks belong to their owners and no endorsement is implied.
- Picked layout: B ("Park edge"), plus a denser city with the camera pulled back.

**Revised later on 2026-11-17:**
- **Name size:** keep the name at about its first-pass size. Fitting most employer logos in view
  matters more than a bigger title. Employer placement is free.
- **Panning:** the world is wider than the screen. The page opens centred on the name and most
  logos, and pans slightly north, south, east and west by drag, wheel, keys or touch, so
  some sites can sit off-screen.
- **Ninth campus:** Norwich University, the owner's alma mater and a military college in
  Northfield, VT. It comes from `PROFILE.education` (id `norwich`).
- **Motion:** cars drive the roads, planes fly over and hot-air balloons hover. These are sprites
  animated over the still, following the camera's projection. Respect `prefers-reduced-motion`.
- **Hover card:** themed to match the scene, like an isometric sign or panel in the same palette,
  not a generic web tooltip. It shows company, role, location, dates and the full description
  and highlights, and scrolls when long. On touch, a tap opens it.
- **Density:** denser than the first clay pass.

## What v1 did (archived as git tag `archive/city-v1`) and why it failed

v1 was a three.js real-time procedural city:
- a seeded block grid of boxes with tiled window textures
- instanced trees, cars and people
- 3D-text wordmarks, an intro camera pan and pop-up buildings
- a walkable character

A later pass made the camera steep and telephoto. The user's verdict was: "Still feels too much like
the city game, just from a different camera angle." Diagnosis:

- **Lighting:** flat real-time lighting with no contact shadows (ambient occlusion) or bounce light.
- **Repetition:** the same box silhouette over and over, and evenly scattered props, so nothing was composed.
- **Feel:** game affordances (character, HUD, intro flight, popping) made it read as a game.

## What makes the reference look the way it does

- **Camera:** about 40–45° elevation, and the street grid is turned about 30–35° (not 45°), so the two
  road axes sit at different screen slopes. It is near-orthographic: a long lens, with verticals that
  barely converge. Buildings bleed off every edge, so the frame reads as a crop of a larger world.
- **Light:** one warm sun from the upper left, with shadows falling down and to the right. Shadow
  edges are soft, and a cool sky fill keeps them blue-grey rather than black. Strong contact shadows
  and bounce light, plus slight grain and a vignette, make up most of the "miniature" feel.
- **Palette (estimates):**
  - asphalt `#2f3438`–`#3d4046`, paint `#e9e6df`, sidewalk `#cfc7b8`
  - cream concrete `#d6ccb8`–`#e7dcc8`, pale roofs `#e5e1d7`, roof gravel `#a9a59c`
  - glass `#79a5aa`–`#5f7684`
  - foliage `#244b27`–`#698c29`
  - Saturated colour appears only on signage and props.
- **Materials:** matte concrete with small bevels that catch a highlight line, recessed window bands,
  lightly reflective glass, rough asphalt, and faceted low-poly trees in two types.
- **Typologies:**
  - office slabs of 5–8 storeys with ribbon windows
  - curved glass corners and drums, stepped and terraced roofs
  - low campus buildings and service towers
  - rooftop clutter: vents and HVAC units, skylights, helipads, terraces with people
- **Density:**
  - 15–25 large building masses per frame, with built area or props covering about 60–70% of it
  - streets are narrow separators
  - detail exists at three scales: district, building and prop
  - people are about a quarter of a storey tall

## Decision: a Blender Cycles still rendered on CPU from a scene written in Python

| Option | Verdict |
|---|---|
| **Blender Cycles on CPU, scene built by a Python script, rendered to a still, with SVG hover areas taken from an object-ID pass** | **Chosen by both planners.** Path tracing gives contact shadows, bounce light and soft shadows for free. The scene is code, so it can be reproduced and diffed. On 24 cores with the OIDN denoiser, previews take about a minute and a final render takes minutes. |
| three.js real-time, with SSAO or baked lighting | Rejected: highest risk of repeating v1, and the swiftshader browser in headless tests can't verify effects that need a GPU. |
| Hand-drawn SVG or 2D illustration | Rejected: weeks of drawing to reach this density. |
| AI restyling (the isometricsf pipeline) | Rejected: no image API or GPU here, inconsistent results, unreliable lettering, and map-tile terms-of-service issues. |

**The strongest objection (GPT): a path tracer will faithfully render a boring city.** The engine is
not the fix; composition is. So there's a hard gate: a grey clay render of the composition must pass
review before any materials or detail work starts.

**Lettering (decided):** the name is made of letter-shaped buildings: extruded letter footprints with
real facades and windows on their sides and pale roof caps. This was GPT's idea. Claude's plan had
letters lying on rooftops, which is closer to the reference, so we're not doing that. The typeface is
an original, open-licence heavy face, not the reference's condensed bold. The colour comes from
`THEME.titleColor` and is never red.

## Milestones (each one ends with a screenshot that must pass its check)

1. **Toolchain:** Blender LTS tarball installed outside the repo, scripted render of a beveled cube
   on a plane.
   *Check:* soft shadow, visible contact shadow, a highlight line along the bevel, render time logged.
2. **Composition and clay blockout:** three original arrangements as grey masses; pick one. Lock the
   camera (about 42° elevation, about 33° azimuth, long lens) and the light.
   *Check:* at 1440 px wide the name reads in under a second, all eight employer sites are distinct,
   and there's a foreground, middle and background. Road slopes and shadow direction resemble the
   reference while the layout clearly doesn't.
3. **Building kit and the eight employer buildings:** six or more parametric typologies (ribbon slab,
   drum, stepped terrace, low campus, glass-curtain tower, parking deck). Each employer gets its own
   silhouette, height, facade rhythm and roof.
   *Check:* the buildings are distinguishable with the signs hidden, a 512 px crop contains no plain
   box, and no two neighbours share a silhouette.
4. **Materials, light and dressing:**
   - recessed windows, parapets, roof clutter, curbs and crosswalks
   - tree clusters (placed in groups, not evenly sprinkled), plus sparse people and vehicles
   - wordmarks in brand colours
   *Check:* no empty 200×200 px patch outside the roads, trees sit on the ground (no floating),
   and every employer logo is recognisable at 1440 px.
5. **Render passes:**
   - the beauty render (the final image)
   - an object-ID pass that paints each employer building a unique flat colour
   - optional per-building highlight layers
   - a separate portrait-camera render for phones
   *Check:* the ID mask lines up pixel-for-pixel with the beauty render.
6. **Web integration:** a Node script traces the ID mask into SVG polygons (accounting for buildings
   hidden behind others). Ship responsive WebP or JPEG images. Hover and keyboard focus show the card;
   tap and click open the details. Keep the Text and Agent views.
   *Check:* a Playwright screenshot with a hover active (desktop 1440, phone 390 portrait), overlays
   stay aligned when the window is resized, all eight are reachable by keyboard, and the hero
   image is under ~400 KB at desktop size.

## Do not

- No seeded grid, repeated boxes, uniform tiled window textures or evenly scattered props.
- No real-time lighting, intro flight, popping buildings, walkable character or game HUD.
- Nothing from the reference: its layout, title styling or colour, logos, fictional brands or
  traced buildings. No logos other than the eight employers'.
- No Google map tiles and no AI-generated imagery.
- Don't polish details before the clay composition passes. More polygons or stronger AO is not art direction.
- No hand-drawn rectangle image maps: hover regions must come from the render's ID pass.
- Don't rely on tiny facade lettering for navigation; the card and labels do that job.
- Don't verify only at desktop width; check 390 px portrait too.

## Open questions for the owner

1. Title colour: `THEME.titleColor` (currently blue `#2b59c3`) or another colour, as long as it isn't red?
2. A still with optional small looping sprites (a balloon, a rotor, a car), or is live pan and zoom required?
3. Should building placement hint at career chronology, or be chosen purely for composition?

## Pass 5 decisions (2026-11-17; owner feedback + GPT-6.1 / Claude review)

Owner feedback on the live page: the billboards look like a cheat (pasted, hovering, off-angle), and
the logos are blurry and grainy. Planes, helicopters and balloons look 2D and flat. The name has
windows and reads as buildings. Anything else below the bar must be raised to match.

**Signage, built into the architecture (no billboards, legs, panels or camera-facing turns):**
- The default is **facade relief**. Official vector curves are mounted flat on a solid upper facade
  or fascia, parallel to the wall, facing its street. They are shallow-extruded (about 2–4% of cap
  height) and lit by the scene sun only, with no emission.
- Use **roof-edge letters**, upright on a parapet and aligned to that edge, where a wordmark needs more size.
- Use a **roof inlay** only for bold symbols.
- Pick the facade that faces the camera (south or west), enlarge the mark, or use an official
  compact variant (separately published by the company, never cropped or thickened).
- Legibility floor: the narrowest identifying stroke or counter must be at least 2 CSS px at
  1440 wide (target 3 px), measured on the delivered image.
- Per-site starting point (projected width in CSS px at 1440):

  | Site | Treatment | Width |
  |---|---|---|
  | TiVo | TV-character lockup on the upper facade | ~100 |
  | Palantir | emblem on the upper facade | ~80 |
  | Twitch | upright parapet wordmark | ~150 |
  | WeWork | upper-facade wordmark | ~190 |
  | Marqeta | facade fascia lockup | ~220 |
  | ID.me | upper facade | ~130 |
  | Chainalysis | roof-inlay symbol | ~90 |
  | Wells Fargo | box logo if an official vector exists, else the wordmark on a stone fascia | ~150 |
  | Norwich | shield or seal over the entrance | ~100 |

**Image quality:**
- Render with the official Blender 4.2.23 LTS at `~/.local/opt/blender-4.2.23/blender`, which has
  OpenImageDenoise. Use adaptive sampling.
- Render the master at 4800×3200 (2× for DPR 2) and ship DPR-aware sources: 2400 for 1×, 4800 for 2×.
- Encode once, directly from a lossless PNG, at high quality (no JPEG→WebP transcoding).
- Verify by comparing three crops of the same sign: the lossless render, the delivered file, and the browser screenshot.

**Moving things are 3D, rendered as sprites from the same camera, sun and colour management:**
- **Headings:** cars and planes at 16 headings; the helicopter at 16 headings × 8 rotor phases;
  balloons at 4 (with a slow sway). Pick the nearest heading, never rotate the image in 2D.
- **Variants:** 3 or more colour or pattern variants per model, as material swaps.
- **Detail:** low-poly toy scale, matching the buildings.
- **Resolution:** sprites at 2× their display size, with consistent anchors.
- **Shadows:**
  - a separate sun-offset soft shadow sprite per flyer, altitude-softened
  - car shadows baked in contact
  - cars stay occluded by the road masks
- **Balloons:** no words.

**The name:** solid blue blocks, matte to satin, small bevel (a 1–2 px highlight), no windows,
seams or roof kit, seated on paving with tight contact shadows.

**Quality sweep:**
- **Filler blocks:** several building families with entrances, setbacks, parapets and roof equipment.
  Fewer identical white slabs, and less window repetition.
- **Trees:** 2–3 species with varied scale and crowns, in groups.
- **People:** small 3D figures in groups.
- **Small details:** curb thickness, stadium seating, fountain water.
- **Web chrome:**
  - one consistent planar style for the name chip, view switch, hint and footer
  - the hint dismisses after the first interaction
  - the footer sits on a readable surface
- **Hover card:**
  - smaller, anchored beside the building rather than covering the centre
  - explicit pin and close buttons, Esc closes it
  - a bottom sheet on phones
  - empty fields and tags are hidden
- **Hover highlight:** a precise, softly tinted building mask with a clear focus ring, instead of the broad white halo.
