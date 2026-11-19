# Changelog

## 0.3.0

- Loading screen: the City view no longer flashes the Text view first. An inline boot script picks the view before first paint (no-JS still gets Text), and a ~1 KB pre-blurred placeholder of the city, framed exactly like the real image, shows from the first paint with a "Loading the city…" pill. The hero image is preloaded at boot and fades in over the blur; dots, sprites and tools follow it. Sprite atlases wait for the hero instead of competing with it.
- Landmark dots sit exactly at the red marker's tip and pulse: a solid dot in the company's colour with a soft glow and an expanding ring, staggered per site (a still glow under reduced motion). Each dot has its own pointer target above the buildings, so overlapping buildings open the right company.
- The view switch shows City as pressed from the first paint.
- Fixes: the pointer leaving the window clears the hover label; turning a phone while the city loads waits for the new frame's image.
- Dev only: loading-screen tests hold the hero image for real while checking the loading state.

## 0.2.0

- City view performance: panning no longer reallocates canvases, re-blurs shadows or rebuilds caches (per pan event: 6.7 canvas reallocations and 4.9 shadow blurs → under 0.1); camera input is applied once per frame; sprites paint at 30 Hz with the simulation unchanged; sprite canvases cap at 1.5x density. Idle main-thread time at 1440x900@2x dropped from about 461 to 183 ms/s in headless Chromium.
- Road masks are applied on whole pixels, so cars no longer leak a faint pixel off the road.
- Landmark dots: a small ring in each company's colour marks every clickable site; hovering or keyboard focus shows a name pill (flipping below the dot near the top edge). The red marker replaces the dot on the selected site.
- The drawer takes about a third of the screen (`--drawer-w: clamp(320px, 33vw, 640px)`) with a readable line length; camera centring measures it; the Sites and Keys popovers move clear of it.
- Snaps stop when leaving the City view or closing the drawer; turning on reduced motion finishes a snap and freezes the sprites.
- The City view footer overlay is gone; the trademark notice stays in the Text view.
- Dev only: Playwright browser tests (`npm run test:browser`), node:test unit tests in `npm test`, and `npm run perf`.

## 0.1.1

- Resume accuracy: experience highlights are transcribed from the source resume instead of condensed, keeping its sub-bullets.
- Highlights can nest (`{ text, sub: [...] }`); resume.md, the Text view and the City drawer render the nesting.
- OSCP is listed as training, not a certification; SANS FOR508 and the Mandiant courses are marked as training; GCFA shows 2016–2020.
- Norwich University shows its 2010 graduation year.
- Skills move near the end of the resume (after certifications, before CliftonStrengths); compliance is no longer listed as a skill.

## 0.1.0

- 3D city: a dense isometric street grid (merged office blocks, instanced trees, traffic and pedestrians), one campus per employer with a 3D wordmark and a gag, beat-synced construction, a sign-flip gag, balloons, a blimp and a helicopter; the finale drops the name in 3D letters onto a rooftop. Walkable explore mode with hover previews.
- `THEME` in content.js (title colour, balloon words); `building` decouples artwork from record ids.
- Text view (static HTML generated from content) and Agent view.
- WebMCP tools: get_profile, list_experience, get_experience, get_resume, set_view, show_company.
- Generated resume.md, resume.json, llms.txt and JSON-LD; `npm test` keeps them in sync.
- Zero-dependency LAN preview server.
