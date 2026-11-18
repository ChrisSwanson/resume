// The City view's two panels, filled from content.js at runtime (nothing here is resume text):
//  - the hover preview: the official logo (its wordmark is the visible name; the text name is kept
//    for screen readers and shown if the image fails), role, dates, location and summary;
//  - the side drawer: the same head, then every highlight and the tags.
// Empty fields are left out, so a sparse record gives a short panel.
import { highlightText, highlightSub } from '../format.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const filled = (v) => (typeof v === 'string' ? v.trim() !== '' : v != null);
let uid = 0;

/** logo plate plus the record's name, visually hidden unless the logo fails to load */
function head(rec, extra) {
  const d = rec.data;
  const box = el('div', 'cc-head');
  const plate = el('div', 'cc-logo');
  const name = el('h2', 'cc-name sr-only', d.name);
  name.id = `cc-name-${++uid}`;
  const img = el('img');
  img.src = rec.logo; img.alt = ''; img.decoding = 'async';
  img.addEventListener('error', () => { plate.remove(); name.classList.remove('sr-only'); });
  plate.append(img);
  box.append(plate);
  if (extra) box.append(extra);
  return { box, name };
}

function facts(rec, body) {
  const d = rec.data;
  const role = rec.kind === 'education' ? d.degree : d.role;
  if (filled(role)) body.append(el('p', 'cc-role', role));
  if (filled(d.parent)) body.append(el('p', 'cc-parent', `part of ${d.parent}`));
  const meta = [d.dates, d.location].filter(filled).join(' · ');
  if (meta) body.append(el('p', 'cc-meta', meta));
  if (filled(d.summary)) body.append(el('p', 'cc-summary', d.summary));
}

/** the hover preview (not interactive: click opens the drawer) */
export function fillPreview(root, rec) {
  root.replaceChildren();
  root.style.setProperty('--brand', rec.data.accent || 'var(--title)');
  const { box, name } = head(rec);
  const body = el('div', 'cc-body');
  body.append(name);
  facts(rec, body);
  root.append(el('div', 'cc-bar'), box, body);
}

/** the side drawer (desktop) or bottom sheet (phone): everything about the record */
export function fillDrawer(scroller, rec, { onClose }) {
  const d = rec.data;
  scroller.replaceChildren();
  scroller.closest('.city-drawer').style.setProperty('--brand', d.accent || 'var(--title)');
  const close = el('button', 'cc-btn cd-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.title = 'Close (Esc)';
  close.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  close.addEventListener('click', onClose);
  const { box, name } = head(rec, close);
  const body = el('div', 'cc-body');
  body.append(name);
  facts(rec, body);
  const list = (items, cls) => {
    const ul = el('ul', cls);
    for (const h of items) {
      if (!filled(highlightText(h))) continue;
      const li = el('li', null, highlightText(h));
      const sub = highlightSub(h);
      if (sub.length) li.append(list(sub));
      ul.append(li);
    }
    return ul;
  };
  if ((d.highlights ?? []).some((h) => filled(highlightText(h)))) body.append(list(d.highlights, 'cc-list'));
  const tags = (d.tags ?? []).filter(filled);
  if (tags.length) {
    const t = el('div', 'cc-tags');
    for (const x of tags) t.append(el('span', null, x));
    body.append(t);
  }
  scroller.append(el('div', 'cc-bar'), box, body);
  return { close, nameId: name.id };
}
