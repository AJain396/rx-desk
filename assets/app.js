/* ============================================================
   RX DESK — client app
   Reads three static JSON files produced by GitHub Actions:
     data/posts.json   (built from posts/*.md)
     data/market.json  (Yahoo Finance quotes)
     data/news.json    (restructuring headlines)
   No backend, no keys in the browser.
   ============================================================ */

const state = { posts: [], filtered: [], query: '' };

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ---------- helpers ---------- */
const fmtDate = (iso) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US',
    { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const fmtShort = (iso) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US',
    { month: 'short', day: 'numeric', timeZone: 'UTC' });

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

/* ============================================================
   1. MARKET TICKER  (data/market.json)
   ============================================================ */
async function loadMarket() {
  const track = $('#tickerTrack');
  try {
    const r = await fetch('data/market.json?_=' + Date.now());
    if (!r.ok) throw new Error('no market.json');
    const d = await r.json();
    const q = d.quotes || [];
    if (!q.length) throw new Error('empty');

    const html = q.map((x) => {
      const chg = Number(x.changePercent || 0);
      const dir = chg >= 0 ? 'up' : 'down';
      const arrow = chg >= 0 ? '▲' : '▼';
      const px = Number(x.price).toLocaleString('en-US',
        { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `<span class="tick">
        <span class="tick-sym">${esc(x.label || x.symbol)}</span>
        <span class="tick-px">${px}</span>
        <span class="tick-ch ${dir}">${arrow} ${Math.abs(chg).toFixed(2)}%</span>
      </span>`;
    }).join('');

    // duplicate the track so the -50% scroll loops seamlessly
    track.innerHTML = html + html;

    if (d.updated) {
      $('#tickerStamp').textContent =
        new Date(d.updated).toLocaleString('en-US',
          { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' ET';
    }
  } catch (e) {
    track.innerHTML = '<span class="tick tick-loading">market feed unavailable</span>';
  }
}

/* ============================================================
   2. RX NEWS TILES  (data/news.json) — 6 tiles, 3 over 3
   ============================================================ */
async function loadNews() {
  const grid = $('#newsgrid');
  try {
    const r = await fetch('data/news.json?_=' + Date.now());
    if (!r.ok) throw new Error('no news.json');
    const d = await r.json();
    const items = (d.items || []).slice(0, 6);
    if (!items.length) throw new Error('empty');

    grid.innerHTML = items.map((n, i) => {
      // Only make it a link if we actually have a story to point at.
      const linked = typeof n.link === 'string' && /^https?:\/\//i.test(n.link);
      const tag = linked ? 'a' : 'div';
      const attrs = linked ? ` href="${esc(n.link)}" target="_blank" rel="noopener"` : '';
      return `
      <${tag} class="newstile${linked ? '' : ' nolink'}"${attrs}
         style="animation:rise .6s cubic-bezier(.2,.8,.2,1) ${i * 0.06}s both">
        <span class="news-cat">${esc(n.category || 'RX')}</span>
        <span class="news-time">${n.published ? timeAgo(n.published) : ''}</span>
        <span class="news-title">${esc(n.title)}</span>
        ${n.snippet ? `<span class="news-snip">${esc(n.snippet)}</span>` : ''}
        ${n.source ? `<span class="news-src">${esc(n.source)}</span>` : ''}
      </${tag}>`;
    }).join('');

    if (d.updated) {
      $('#newsStamp').textContent = 'updated ' + timeAgo(d.updated);
    }
  } catch (e) {
    grid.innerHTML = Array.from({ length: 6 }, () =>
      `<div class="newstile"><span class="news-src">wire</span>
       <span class="news-title" style="color:var(--ink-3)">news feed unavailable</span></div>`).join('');
  }
}

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}

/* ============================================================
   3. POSTS  (data/posts.json)
   ============================================================ */
async function loadPosts() {
  try {
    const r = await fetch('data/posts.json?_=' + Date.now());
    state.posts = (await r.json()).posts || [];
  } catch (e) {
    state.posts = [];
  }
  state.posts.sort((a, b) => b.date.localeCompare(a.date)); // newest first
  applyFilters();
}

function applyFilters() {
  const q = state.query.trim().toLowerCase();
  state.filtered = state.posts.filter((p) => {
    if (!q) return true;
    const hay = [p.title, p.excerpt, p.plain, (p.tags || []).join(' '), p.date]
      .join(' ').toLowerCase();
    return q.split(/\s+/).every((term) => hay.includes(term));
  });
  renderFeed();
  renderHistory();
}

/* ---------- floating feed ---------- */
function renderFeed() {
  const wrap = $('#floatfeed');
  $('#feedCount').textContent = `${state.filtered.length} post${state.filtered.length === 1 ? '' : 's'}`;
  $('#feedEmpty').hidden = state.filtered.length > 0;

  wrap.innerHTML = state.filtered.map((p, i) => `
    <article class="postcard" data-slug="${esc(p.slug)}"
             style="animation-delay:${Math.min(i * 0.05, 0.6)}s">
      <div class="pc-accent"></div>
      <div class="pc-top">
        <span class="pc-date">${fmtDate(p.date).toUpperCase()}</span>
        <span class="pc-read">${p.readingTime || 1} min</span>
      </div>
      <h3 class="pc-title">${esc(p.title)}</h3>
      <p class="pc-excerpt">${esc(p.excerpt)}</p>
      ${(p.tags || []).length ? `<div class="pc-tags">${p.tags.map(
        (t) => `<span class="pc-tag">${esc(t)}</span>`).join('')}</div>` : ''}
    </article>`).join('');

  $$('.postcard').forEach((c) =>
    c.addEventListener('click', () => (location.hash = '#/post/' + c.dataset.slug)));
}

/* ---------- history / archive ---------- */
function renderHistory() {
  const byYear = {};
  state.filtered.forEach((p) => {
    const y = p.date.slice(0, 4);
    (byYear[y] = byYear[y] || []).push(p);
  });
  const years = Object.keys(byYear).sort().reverse();

  $('#histCount').textContent = `${state.filtered.length} entries · ${years.length} year${years.length === 1 ? '' : 's'}`;

  $('#yearrail').innerHTML = years.map(
    (y) => `<button class="yearbtn" data-year="${y}">${y} <span style="opacity:.5">(${byYear[y].length})</span></button>`).join('');

  $('#timeline').innerHTML = years.map((y) => `
    <div id="y-${y}">
      <div class="tl-year">${y}</div>
      ${byYear[y].map((p) => `
        <div class="tl-item" data-slug="${esc(p.slug)}">
          <span class="tl-date">${fmtShort(p.date)}</span>
          <span class="tl-title">${esc(p.title)}</span>
          <span class="tl-tags">${(p.tags || []).slice(0, 2).join(' · ')}</span>
        </div>`).join('')}
    </div>`).join('') || '<div class="empty">Nothing in the archive yet.</div>';

  $$('.tl-item').forEach((it) =>
    it.addEventListener('click', () => (location.hash = '#/post/' + it.dataset.slug)));

  $$('.yearbtn').forEach((b) =>
    b.addEventListener('click', () => {
      $$('.yearbtn').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      document.getElementById('y-' + b.dataset.year)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
}

/* ============================================================
   4. ROUTER
   ============================================================ */
function route() {
  const h = location.hash || '#/';
  const views = { feed: $('#view-feed'), history: $('#view-history'), post: $('#view-post'), about: $('#view-about') };
  Object.values(views).forEach((v) => (v.hidden = true));

  const showSearch = (on) => ($('.searchwrap').style.display = on ? '' : 'none');

  if (h.startsWith('#/post/')) {
    const slug = decodeURIComponent(h.slice(7));
    renderPost(slug);
    views.post.hidden = false;
    showSearch(false);
  } else if (h.startsWith('#/history')) {
    views.history.hidden = false;
    showSearch(true);
  } else if (h.startsWith('#/about')) {
    views.about.hidden = false;
    showSearch(false);
  } else {
    views.feed.hidden = false;
    showSearch(true);
  }

  $$('.nav-link').forEach((a) => {
    const target = a.getAttribute('href');
    a.classList.toggle('active',
      target === '#/' ? (h === '#/' || h === '' || h === '#') : h.startsWith(target));
  });

  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function renderPost(slug) {
  const p = state.posts.find((x) => x.slug === slug);
  const el = $('#postFull');
  if (!p) { el.innerHTML = '<h1>Not found</h1><p>That post does not exist.</p>'; return; }
  document.title = p.title + ' — RX Desk';
  el.innerHTML = `
    <h1>${esc(p.title)}</h1>
    <div class="post-meta">
      <span>${fmtDate(p.date).toUpperCase()}</span><span class="dot">·</span>
      <span>${p.readingTime || 1} MIN READ</span>
      ${(p.tags || []).length ? `<span class="dot">·</span><span>${p.tags.map(esc).join(' / ').toUpperCase()}</span>` : ''}
    </div>
    ${md.render(p.body || '')}`;
}

/* ============================================================
   5. BOOT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  $('#year').textContent = new Date().getFullYear();

  // theme
  let saved = null;
  try { saved = localStorage.getItem('rx-theme'); } catch (e) {}
  if (saved) document.documentElement.dataset.theme = saved;
  $('#themeToggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('rx-theme', next); } catch (e) {}
  });

  // search
  const input = $('#search');
  if (window.matchMedia('(max-width:640px)').matches) input.placeholder = 'Search posts\u2026';
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { state.query = input.value; applyFilters(); }, 110);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
    if (e.key === 'Escape' && document.activeElement === input) { input.value = ''; state.query = ''; applyFilters(); input.blur(); }
  });

  window.addEventListener('hashchange', route);

  await loadPosts();
  route();
  loadMarket();
  loadNews();

  // refresh market data every 5 minutes while the tab is open
  setInterval(loadMarket, 5 * 60 * 1000);
});
