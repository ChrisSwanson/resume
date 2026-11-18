// Fast checks with no browser: content shape, formatters, and agent tools.
import assert from 'node:assert/strict';
import { PROFILE, COMPANIES } from '../content.js';
import { findCompany, toMarkdown, toJSON } from '../src/format.js';
import { markdownToHtml } from '../src/markdown.js';
import { agentTools } from '../src/agent-tools.js';

for (const k of ['name', 'title']) assert.ok(PROFILE[k], `PROFILE.${k} is required`);
const ids = new Set();
for (const c of COMPANIES) {
  for (const k of ['id', 'name', 'role', 'dates']) assert.ok(c[k], `${c.name ?? c.id}: ${k} is required`);
  assert.ok(!ids.has(c.id), `duplicate company id ${c.id}`); ids.add(c.id);
}

// content-agnostic: every record is findable by id and by name, case/punctuation-insensitively
for (const c of COMPANIES) {
  assert.equal(findCompany(COMPANIES, c.id)?.id, c.id);
  assert.equal(findCompany(COMPANIES, c.name.toUpperCase())?.id !== undefined, true);
}
assert.equal(findCompany(COMPANIES, 'zz-no-such-company-zz'), null);

const json = toJSON(PROFILE, COMPANIES);
assert.equal(json.experience.length, COMPANIES.length);
assert.equal(json.education.length, PROFILE.education?.length ?? 0);
for (const e of PROFILE.education ?? []) assert.ok(toMarkdown(PROFILE, COMPANIES).includes(e.name), `education ${e.id} in markdown`);
assert.equal(json.experience[0].company, COMPANIES.at(-1).name, 'experience is newest first');

assert.ok(!markdownToHtml('[x](javascript:alert(1)) <script>').includes('javascript:'), 'unsafe links are dropped');
assert.ok(!markdownToHtml('<script>alert(1)</script>').includes('<script>'), 'html is escaped');
assert.ok(markdownToHtml(toMarkdown(PROFILE, COMPANIES)).includes(`<h1 id=`));

const tools = agentTools({ profile: PROFILE, companies: COMPANIES });
const run = (name, input) => tools.find((t) => t.name === name).execute(input);
const last = COMPANIES.at(-1);
assert.ok((await run('get_experience', { company: last.id })).includes(last.role));
assert.match(await run('get_experience', { company: 'zz-no-such-company-zz' }), /No company matches/);
assert.ok(markdownToHtml('[pdf](files/resume.pdf)').includes('href="files/resume.pdf"'), 'relative links survive');
assert.deepEqual(JSON.parse(await run('get_resume', { format: 'json' })), json);
for (const t of tools) assert.equal(typeof (await t.execute({})), 'string', `${t.name} returns a string`);

console.log(`ok: ${tools.length} tools, ${COMPANIES.length} companies`);
