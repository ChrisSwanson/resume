# Valley Resume

An interactive resume with three views of the same content:

- **3D**: a pan across a toy-scale valley where each employer's campus springs up, then a walkable
  map. Hover a building for a preview, click for details.
- **Text**: the resume as a plain page (`?view=text`), pre-rendered into `index.html` so it works without JavaScript.
- **Agent**: raw markdown/JSON plus a WebMCP tool list (`?view=agent`). In WebMCP-capable browsers the
  page registers tools on `document.modelContext`; other agents read `resume.md`, `resume.json` or `llms.txt`.

## Use it as a template

1. Edit `content.js` (profile + companies, oldest first).
2. `npm run build` to regenerate the static formats, `npm test` to check.
3. Optional: add a custom building for a company in `src/scene/buildings.js`.

No dependencies to install; Node 20+ is only needed for the build, test and preview scripts.

## Preview

```sh
npm run serve -- --port 8790   # prints LAN URLs
```

See `AGENTS.md` for how the code is organised (content vs graphics vs agent access).
Three.js r170 is vendored in `vendor/` (MIT).

## Hero render (v2, in progress)

The v2 hero is a Blender Cycles still built from Python in `render/`; see `render/README.md` and
`docs/PLAN-v2.md`.
