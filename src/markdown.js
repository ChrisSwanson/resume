// Minimal markdown → HTML for the subset src/format.js produces:
// headings, paragraphs, blockquotes, "-" lists, **bold**, *italic*, `code`, [links](url).
// Escapes everything first, and only allows http(s), mailto and relative link targets.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Relative paths are allowed; anything with a scheme must be http(s) or mailto.
const safeHref = (h) => (!/^[a-z][a-z0-9+.-]*:/i.test(h) || /^(https?|mailto):/i.test(h) ? h : '#');
export const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => {
      const h = safeHref(href.replace(/&amp;/g, '&'));
      const ext = /^https?:/.test(h) ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${esc(h)}"${ext}>${text}</a>`;
    });
}

export function markdownToHtml(md) {
  const out = [];
  let list = null, para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`); list = null; } };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      flushPara(); flushList();
      const n = m[1].length, body = inline(m[2]);
      out.push(`<h${n} id="${slug(m[2])}">${body}</h${n}>`);
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara(); flushList();
      out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    } else if ((m = line.match(/^-\s+(.*)$/))) {
      flushPara();
      (list ??= []).push(m[1]);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara(); flushList();
  return out.join('\n');
}
