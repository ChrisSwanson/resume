# AGENTS.md

An interactive resume and reusable template: a miniature isometric city (the name as buildings,
each employer's building with its sign), plus a plain Text view and an
Agent view that exposes the resume over WebMCP. Static site, no bundler, no runtime deps.

## The City view (v2)

The real-time three.js city (v1) was removed; it is archived as git tag `archive/city-v1`.
The City view is an offline-rendered isometric still (`render/`, see `render/README.md`) with SVG
hover regions traced from an ID pass and small animated sprites. Read `docs/PLAN-v2.md` (goal,
constraints, milestones, do-not list) before any graphics work.

| You are changing… | Edit | Never touch |
|---|---|---|
| Resume facts (roles, dates, highlights, links, order) | `content.js` only, then `npm run build` | graphics code |
| Title colour | `THEME` in `content.js` | |
| The rendered city, its passes and scene export | `render/*.py`, then `npm run hero` | `assets/hero/` by hand |
| Camera and keys, hover regions, preview, drawer, Sites list, marker, sprites | `src/hero/` (`city.js`, `card.js`, `sprites.js`, `projection.js`) | resume text |
| Markdown / JSON / llms.txt shape | `src/format.js` (+ `src/markdown.js` renderer) | |
| Agent tools (WebMCP) | `src/agent-tools.js` (definitions), `src/webmcp.js` (browser adapter) | |
| View switching, Text and Agent views | `src/app.js`, `styles.css` | |

Resume text never lives in graphics code, and graphics never hard-code resume text.

## Content rules (`content.js`)

- Companies are listed **oldest first**; that is the left→right order and the intro order.
  Generated formats reverse it (newest first).
- `id` is the stable record id agents use. `building` picks the artwork (defaults to `id`);
  an unknown value falls back to `BUILDERS.generic` coloured by `accent`.
- After any edit run `npm run build`. It regenerates `resume.md`, `resume.json`, `llms.txt`,
  and the marked blocks in `index.html` (static Text-view HTML and JSON-LD).
  `npm test` fails if they are stale. Never hand-edit those outputs or the marked blocks.

## Verify

```sh
npm test                    # content shape, formatters, agent tools, generated files in sync
npm run serve -- --port 8790   # LAN preview; then open /, /?view=text, /?view=agent
```
Check City view changes with a headless screenshot (Playwright) at 1440×900 (DPR 2) and 390×844
before claiming they work; `prefers-reduced-motion` must give a still frame.
Renders use the official Blender 4.2 LTS at `~/.local/opt/blender-4.2.23/blender` (it has
OpenImageDenoise; the distro `blender` does not); `npm run hero` and `npm run sprites` pick it up
there, `BLENDER=` overrides. `npm run hero` prints each sign's narrowest stroke: keep it at 2 CSS px
or more at 1440 wide. Details in `render/README.md`.

## Agent access

- Tools are defined once in `src/agent-tools.js` and registered once at boot with
  `document.modelContext.registerTool(tool, { signal })` (falls back to `navigator.modelContext`).
  Read-only tools carry `annotations.readOnlyHint`. The API is a draft; keep it isolated in `src/webmcp.js`.
- WebMCP needs a secure context: test it on `localhost` or HTTPS, not a LAN `http://` address.
- Agents without WebMCP read `resume.md`, `resume.json`, `llms.txt`, or the static HTML.

## Git

Remote is git.swans.in (Forgejo). Work on a release branch, one PR per release ending with a
version bump in `package.json` and a `CHANGELOG.md` entry; the owner merges.
