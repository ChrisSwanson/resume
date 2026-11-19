// Generates the plain formats from content.js:
//   resume.md, resume.json, llms.txt, and marked blocks in index.html
//   (static text-view HTML, schema.org JSON-LD, the brand chip, and the City boot script with the
//   inline placeholders), so the page is readable without JS.
// `--check` writes nothing and exits 1 if any output is stale.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PROFILE, COMPANIES } from '../content.js';
import { toMarkdown, toJSON, toLlmsTxt, toJSONLD } from '../src/format.js';
import { markdownToHtml, esc } from '../src/markdown.js';
import { agentTools } from '../src/agent-tools.js';
import { bootScript, placeholderCss } from '../src/hero/boot.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const md = toMarkdown(PROFILE, COMPANIES);
// llms.txt lists the browser-only UI tools too, so build them with a stub ui.
const tools = agentTools({ profile: PROFILE, companies: COMPANIES }, { setView() {}, showCompany() {} });

function replaceBlock(html, name, body) {
  const re = new RegExp(`(<!-- resume:${name}:start[^>]*-->)[\\s\\S]*?(\\s*<!-- resume:${name}:end -->)`);
  if (!re.test(html)) throw new Error(`index.html is missing the resume:${name} markers`);
  return html.replace(re, (_, a, b) => `${a}\n${body}${b}`);
}

let html = await readFile(join(root, 'index.html'), 'utf8');
html = replaceBlock(html, 'jsonld', `  <script type="application/ld+json">\n${JSON.stringify(toJSONLD(PROFILE, COMPANIES), null, 2).replace(/</g, '\\u003c')}\n  </script>`);
html = replaceBlock(html, 'html', markdownToHtml(md));
html = replaceBlock(html, 'brand', `      <span class="brand-name" data-bind="name">${esc(PROFILE.name)}</span>\n      <span class="brand-title" data-bind="title">${esc(PROFILE.title)}</span>`);
// the City view's boot: the boot-view script and the blurred placeholders inline (no extra request)
const dataUri = async (name) => `data:image/webp;base64,${(await readFile(join(root, `assets/hero/placeholder-${name}.webp`))).toString('base64')}`;
html = replaceBlock(html, 'boot', `  <script>\n${bootScript()}\n  </script>\n  <style>\n${placeholderCss({ master: await dataUri('master'), portrait: await dataUri('portrait') })}\n  </style>`);

const outputs = {
  'resume.md': md,
  'resume.json': JSON.stringify(toJSON(PROFILE, COMPANIES), null, 2) + '\n',
  'llms.txt': toLlmsTxt(PROFILE, COMPANIES, tools),
  'index.html': html,
};

let stale = [];
for (const [file, content] of Object.entries(outputs)) {
  const path = join(root, file);
  const current = await readFile(path, 'utf8').catch(() => null);
  if (current === content) continue;
  if (check) stale.push(file);
  else { await writeFile(path, content); console.log('wrote', file); }
}
if (check && stale.length) {
  console.error(`Stale generated files: ${stale.join(', ')}. Run \`npm run build\` after editing content.js.`);
  process.exit(1);
}
if (check) console.log('generated files are up to date');
