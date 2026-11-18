// Entry point. Owns the three views (City / Text / Agent) and WebMCP registration.
// The City view (src/hero/) is a rendered image with traced hover regions, so it needs no WebGL;
// it fetches its images and data only when first shown, so the Text and Agent views never do.
import { PROFILE, COMPANIES, THEME } from '../content.js';
import { toMarkdown, toJSON } from './format.js';
import { markdownToHtml } from './markdown.js';
import { agentTools } from './agent-tools.js';
import { registerTools } from './webmcp.js';
import { createCity } from './hero/city.js';

const VIEWS = ['3d', 'text', 'agent'];   // '3d' is the City view's id (kept for URLs and set_view)
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

let view = null;
let city = null;
let mcp = { supported: false, registered: [], errors: [] };
const EDUCATION = PROFILE.education ?? [];

document.querySelectorAll('[data-bind]').forEach((n) => { n.textContent = PROFILE[n.dataset.bind] ?? ''; });
document.title = `${PROFILE.name} · ${PROFILE.title}`;

function getCity() {
  city ??= createCity($('#view-3d'), { profile: PROFILE, companies: COMPANIES, theme: THEME });
  return city;
}

export async function setView(v) {
  if (!VIEWS.includes(v)) v = '3d';
  if (v === view) return;
  view = v;
  document.body.dataset.view = v;
  $('#view-3d').hidden = v !== '3d';
  $('#view-text').hidden = v !== 'text';
  $('#view-agent').hidden = v !== 'agent';
  document.querySelectorAll('.view-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));

  const url = new URL(location.href);
  if (v === '3d') url.searchParams.delete('view'); else url.searchParams.set('view', v);
  history.replaceState(null, '', url);

  if (v === 'text') renderText();
  if (v === 'agent') renderAgent();
  if (v === '3d') {
    const c = getCity();
    try { await c.ready; } catch (e) {
      console.error('City view failed to load', e);
      return setView('text');
    }
    c.setActive(view === '3d'); // the user may have switched away while it loaded
  } else {
    city?.setActive(false);
    window.scrollTo(0, 0);
  }
}

/** index: position in COMPANIES; positions past the end are education records (in order). */
async function showCompany(index) {
  const rec = COMPANIES[index] ?? EDUCATION[index - COMPANIES.length];
  if (!rec) return;
  if (view === '3d') { await getCity().showSite(rec.id); return; }
  if (view !== 'text') await setView('text');
  // Text view lists experience newest first, one h3 per record, then education
  const target = index < COMPANIES.length
    ? document.querySelectorAll('#doc-body h3')[COMPANIES.length - 1 - index]
    : document.querySelector('#education');
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  target.classList.remove('flash'); void target.offsetWidth; target.classList.add('flash');
}

// ── Text view ──────────────────────────────────────────────────────────────
function renderText() {
  // Re-rendered from content.js so edits show without a rebuild; the build bakes the same HTML in statically.
  $('#doc-body').innerHTML = markdownToHtml(toMarkdown(PROFILE, COMPANIES));
}

// ── Agent view ─────────────────────────────────────────────────────────────
function renderAgent() {
  const root = $('#view-agent');
  root.replaceChildren();
  const md = toMarkdown(PROFILE, COMPANIES);
  const json = JSON.stringify(toJSON(PROFILE, COMPANIES), null, 2);
  const tools = pageTools();

  root.append(el('h1', null, 'For AI agents'), el('p', 'lede', `Everything about ${PROFILE.name} on this site, in formats an agent can use directly. No JavaScript needed for the files.`));

  const status = el('section', 'card');
  status.append(el('h2', null, 'WebMCP'));
  if (mcp.registered.length) {
    status.append(el('p', 'ok', `Active: this page registered ${mcp.registered.length} tools with document.modelContext.`));
  } else if (mcp.supported) {
    status.append(el('p', 'warn', `document.modelContext exists but registration failed: ${mcp.errors.join('; ') || 'unknown error'}`));
  } else {
    status.append(el('p', 'muted', 'This browser does not expose WebMCP (document.modelContext), so no tools are registered here. In a WebMCP browser the tools below appear automatically; anywhere else, read the files.'));
  }
  const list = el('dl', 'tools');
  for (const t of tools) {
    const dt = el('dt'); dt.append(el('code', null, t.name));
    if (t.annotations?.readOnlyHint) dt.append(el('span', 'badge', 'read-only'));
    const dd = el('dd');
    dd.append(el('p', null, t.description));
    const props = Object.entries(t.inputSchema?.properties ?? {});
    if (props.length) dd.append(el('p', 'args', 'Input: ' + props.map(([k, v]) => `${k}${t.inputSchema.required?.includes(k) ? '' : '?'}: ${v.enum ? v.enum.join(' | ') : v.type}`).join(', ')));
    list.append(dt, dd);
  }
  status.append(list);
  root.append(status);

  const files = el('section', 'card');
  files.append(el('h2', null, 'Files'));
  const ul = el('ul', 'files');
  for (const [href, label] of [['resume.md', 'Resume as markdown'], ['resume.json', 'Resume as JSON'], ['llms.txt', 'llms.txt: site summary for LLMs'], ['?view=text', 'Plain HTML page']]) {
    const li = el('li'); const a = el('a', null, href); a.href = href; li.append(a, document.createTextNode(`: ${label}`)); ul.append(li);
  }
  files.append(ul);
  root.append(files);

  for (const [title, text] of [['resume.md', md], ['resume.json', json]]) {
    const sec = el('section', 'card');
    const head = el('div', 'card-head');
    const copy = el('button', 'copy', 'Copy');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; }
      catch { copy.textContent = 'Copy failed'; }
      setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
    });
    head.append(el('h2', null, title), copy);
    sec.append(head, el('pre', null, text));
    root.append(sec);
  }
}

// ── boot ───────────────────────────────────────────────────────────────────
const uiHooks = { setView, showCompany };

// The page's tools. show_company is taken from a second build whose list also holds the education
// records (after the companies, so its indexes line up with showCompany above); every other tool
// sees only COMPANIES, so list_experience, get_resume and the rest are unchanged.
function pageTools() {
  const tools = agentTools({ profile: PROFILE, companies: COMPANIES }, uiHooks);
  const all = agentTools({ profile: PROFILE, companies: [...COMPANIES, ...EDUCATION] }, uiHooks);
  return tools.map((t) => (t.name === 'show_company' ? all.find((u) => u.name === t.name) : t));
}

document.querySelectorAll('.view-switch button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

const requested = new URLSearchParams(location.search).get('view');
setView(requested ?? '3d');

registerTools(pageTools()).then((r) => {
  mcp = r;
  if (view === 'agent') renderAgent();
});
