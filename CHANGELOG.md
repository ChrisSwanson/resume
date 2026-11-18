# Changelog

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
