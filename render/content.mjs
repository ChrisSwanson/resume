// Prints the slice of content.js the renderer needs as JSON on stdout.
// The Blender scripts call this so resume text never lives in graphics code.
import { PROFILE, THEME, COMPANIES } from '../content.js';

const out = {
  title: PROFILE.name.toUpperCase(),
  titleColor: THEME.titleColor,
  companies: COMPANIES.map(({ id, name, accent, building }) => ({ id, name, accent, building: building || id })),
  // only education records with `campus: true` get a site in the city
  education: (PROFILE.education || []).filter((e) => e.campus).map(({ id, name }) => ({ id, name })),
};
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
