# Changelog

## 0.1.0

- 3D city: a dense isometric street grid (merged office blocks, instanced trees, traffic and pedestrians), one campus per employer with a 3D wordmark and a gag, beat-synced construction, a sign-flip gag, balloons, a blimp and a helicopter; the finale drops the name in 3D letters onto a rooftop. Walkable explore mode with hover previews.
- `THEME` in content.js (title colour, balloon words); `building` decouples artwork from record ids.
- Text view (static HTML generated from content) and Agent view.
- WebMCP tools: get_profile, list_experience, get_experience, get_resume, set_view, show_company.
- Generated resume.md, resume.json, llms.txt and JSON-LD; `npm test` keeps them in sync.
- Zero-dependency LAN preview server.
