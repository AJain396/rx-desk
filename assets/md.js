/* ============================================================
   md.js — tiny markdown renderer (no dependencies, no CDN)
   Supports: headings, bold/italic, inline + fenced code, links,
   images, blockquotes, ordered/unordered lists, tables, hr.
   Escapes HTML first, so post content can't inject markup.
   ============================================================ */
(function (global) {
  const esc = (s) => String(s).replace(/[&<>"']/g,
    (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
      .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g,
        (_, a, u) => `<img src="${u}" alt="${a}" loading="lazy" style="max-width:100%;border-radius:10px" />`)
      .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g,
        (_, t, u) => `<a href="${u}" ${/^https?:/.test(u) ? 'target="_blank" rel="noopener"' : ''}>${t}</a>`)
      .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  }

  function render(md) {
    const src = String(md || '').replace(/\r\n/g, '\n');
    const lines = src.split('\n');
    const out = [];
    let i = 0;

    const isTableSep = (s) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(s) && s.includes('-');
    const cells = (s) => s.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());

    while (i < lines.length) {
      const line = lines[i];

      // blank
      if (!line.trim()) { i++; continue; }

      // fenced code
      if (/^```/.test(line)) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
        continue;
      }

      // hr
      if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) { out.push('<hr />'); i++; continue; }

      // heading
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { const n = h[1].length; out.push(`<h${n}>${inline(esc(h[2]))}</h${n}>`); i++; continue; }

      // table
      if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        const head = cells(line);
        i += 2;
        const body = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) body.push(cells(lines[i++]));
        out.push(
          '<table><thead><tr>' + head.map((c) => `<th>${inline(esc(c))}</th>`).join('') +
          '</tr></thead><tbody>' +
          body.map((r) => '<tr>' + r.map((c) => `<td>${inline(esc(c))}</td>`).join('') + '</tr>').join('') +
          '</tbody></table>');
        continue;
      }

      // blockquote
      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push(`<blockquote>${render(buf.join('\n'))}</blockquote>`);
        continue;
      }

      // lists
      const ul = /^\s*[-*+]\s+/, ol = /^\s*\d+[.)]\s+/;
      if (ul.test(line) || ol.test(line)) {
        const ordered = ol.test(line);
        const re = ordered ? ol : ul;
        const items = [];
        while (i < lines.length && re.test(lines[i])) {
          let text = lines[i++].replace(re, '');
          // continuation lines (indented, not a new item)
          while (i < lines.length && lines[i].trim() && !ul.test(lines[i]) && !ol.test(lines[i]) && /^\s{2,}/.test(lines[i])) {
            text += ' ' + lines[i++].trim();
          }
          items.push(`<li>${inline(esc(text))}</li>`);
        }
        out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
        continue;
      }

      // paragraph
      const buf = [];
      while (i < lines.length && lines[i].trim() &&
             !/^(#{1,6}\s|```|\s*>|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i])) {
        buf.push(lines[i++]);
      }
      out.push(`<p>${inline(esc(buf.join(' ')))}</p>`);
    }

    return out.join('\n');
  }

  global.md = { render };
})(window);
