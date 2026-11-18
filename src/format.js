// Turns content.js into the formats people and agents read: markdown, JSON, llms.txt, JSON-LD.
// Pure functions, no DOM: used by the browser (Text / Agent views, WebMCP) and by scripts/build.mjs.

/** Most recent first, the way resumes are read. content.js lists companies oldest first. */
export const newestFirst = (companies) => [...companies].reverse();

export function companyTitle(c) {
  return c.parent ? `${c.name} (${c.parent})` : c.name;
}

/** Match a company by id, name or parent, case-insensitively, ignoring punctuation. */
export function findCompany(companies, query) {
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const q = norm(query);
  if (!q) return null;
  return (
    companies.find((c) => norm(c.id) === q || norm(c.name) === q) ??
    companies.find((c) => norm(c.name).includes(q) || q.includes(norm(c.name)) || norm(c.parent) === q) ??
    null
  );
}

export function profileMarkdown(p) {
  const lines = [`# ${p.name}`, '', `**${p.title}**${p.location ? ` · ${p.location}` : ''}`, ''];
  if (p.tagline) lines.push(`> ${p.tagline}`, '');
  if (p.summary) lines.push(p.summary, '');
  if (p.links?.length) lines.push(p.links.map((l) => `[${l.label}](${l.href})`).join(' · '), '');
  return lines.join('\n');
}

/** A highlight is a string, or { text, sub: [highlights] } for a bullet with sub-bullets. */
export const highlightText = (h) => (typeof h === 'string' ? h : h?.text ?? '');
export const highlightSub = (h) => (typeof h === 'string' ? [] : h?.sub ?? []);

function highlightLines(items, lines, depth = 0) {
  for (const h of items) {
    lines.push(`${'  '.repeat(depth)}- ${highlightText(h)}`);
    highlightLines(highlightSub(h), lines, depth + 1);
  }
}

export function companyMarkdown(c, level = 3) {
  const h = '#'.repeat(level);
  const meta = [c.dates, c.location].filter(Boolean).join(' · ');
  const lines = [`${h} ${companyTitle(c)}`, '', `**${c.role}**${meta ? ` · ${meta}` : ''}`, ''];
  if (c.summary) lines.push(c.summary, '');
  highlightLines(c.highlights ?? [], lines);
  if (c.highlights?.length) lines.push('');
  if (c.tags?.length) lines.push(`*${c.tags.join(' · ')}*`, '');
  return lines.join('\n');
}

export function educationMarkdown(e) {
  const meta = [e.dates, e.location].filter(Boolean).join(' · ');
  const lines = [`**${e.name}**${e.degree ? `, ${e.degree}` : ''}${meta ? ` · ${meta}` : ''}`, ''];
  if (e.summary) lines.push(e.summary, '');
  return lines.join('\n');
}

export function toMarkdown(profile, companies) {
  const out = [profileMarkdown(profile)];
  out.push('## Experience', '');
  for (const c of newestFirst(companies)) out.push(companyMarkdown(c));
  if (profile.education?.length) {
    out.push('## Education', '');
    for (const e of profile.education) out.push(educationMarkdown(e));
  }
  if (profile.certifications?.length) {
    out.push('## Certifications & training', '', profile.certifications.map((c) => `- ${c.name}${c.year ? ` (${c.year})` : ''}`).join('\n'), '');
  }
  if (profile.skills?.length) out.push('## Skills', '', profile.skills.map((s) => `- ${s}`).join('\n'), '');
  if (profile.strengths?.length) out.push('## CliftonStrengths', '', profile.strengths.join(' · '), '');
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function toJSON(profile, companies) {
  return {
    name: profile.name,
    title: profile.title,
    tagline: profile.tagline,
    location: profile.location,
    summary: profile.summary,
    skills: profile.skills ?? [],
    links: profile.links ?? [],
    experience: newestFirst(companies).map((c) => ({
      id: c.id,
      company: c.name,
      parent: c.parent ?? null,
      role: c.role,
      dates: c.dates,
      location: c.location || null,
      summary: c.summary,
      highlights: c.highlights ?? [],
      tags: c.tags ?? [],
    })),
    education: (profile.education ?? []).map((e) => ({
      id: e.id, school: e.name, degree: e.degree ?? null, dates: e.dates ?? null,
      location: e.location || null, summary: e.summary ?? null,
    })),
    certifications: profile.certifications ?? [],
    strengths: profile.strengths ?? [],
  };
}

export function listExperience(companies) {
  return newestFirst(companies)
    .map((c) => `- ${companyTitle(c)}: ${c.role} (${c.dates}) [id: ${c.id}]`)
    .join('\n');
}

/** schema.org Person, embedded in index.html for crawlers and agents that read structured data. */
export function toJSONLD(profile, companies) {
  const sameAs = (profile.links ?? []).map((l) => l.href).filter((h) => /^https?:/.test(h));
  const current = companies[companies.length - 1];
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.name,
    jobTitle: profile.title,
    description: profile.summary,
    knowsAbout: profile.skills ?? [],
    ...(sameAs.length ? { sameAs } : {}),
    ...(current ? { worksFor: { '@type': 'Organization', name: current.name } } : {}),
    ...(profile.education?.length
      ? { alumniOf: profile.education.map((e) => ({ '@type': 'CollegeOrUniversity', name: e.name })) }
      : {}),
  };
}

export function toLlmsTxt(profile, companies, tools) {
  const lines = [
    `# ${profile.name}`,
    '',
    `> ${profile.title}. ${profile.tagline ?? ''}`.trim(),
    '',
    'This site is an interactive resume. The same content is available in plain formats:',
    '',
    '## Resume',
    '',
    '- [resume.md](resume.md): the full resume as markdown',
    '- [resume.json](resume.json): the full resume as structured JSON',
    '- [index.html?view=text](index.html?view=text): the resume as a plain web page',
    '',
    '## Experience',
    '',
    listExperience(companies),
    '',
    '## WebMCP tools',
    '',
    'In a browser that supports WebMCP (document.modelContext), index.html registers these tools:',
    '',
    ...tools.map((t) => `- \`${t.name}\`: ${t.description}`),
    '',
  ];
  return lines.join('\n');
}
