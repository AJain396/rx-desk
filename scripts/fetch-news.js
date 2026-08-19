#!/usr/bin/env node
/* ============================================================
   Restructuring headlines -> data/news.json
   Google News RSS (free, no key).

   Tuned for specificity: each query is narrow, every headline is
   scored against restructuring vocabulary, and anything vague or
   off-topic is dropped rather than padded into the grid.
   Each item carries a CATEGORY so the tile says what kind of
   development it is, not just who published it.
   ============================================================ */

const fs = require('fs');
const path = require('path');

/* Narrow queries. Each carries the category shown on the tile. */
const FEEDS = [
  { cat: 'CHAPTER 11',  q: '"files for chapter 11" OR "chapter 11 petition" bankruptcy' },
  { cat: 'DIP',         q: '"DIP financing" OR "debtor-in-possession financing" approved court' },
  { cat: 'LME',         q: '"liability management" OR uptier OR "drop-down" OR "double dip" creditors' },
  { cat: 'PLAN',        q: '"plan of reorganization" OR "confirmation hearing" OR "disclosure statement" bankruptcy' },
  { cat: 'CREDITORS',   q: '"cooperation agreement" OR "ad hoc group" OR "creditor committee" debt' },
  { cat: 'DISTRESSED',  q: '"distressed exchange" OR "debt restructuring" OR "missed interest payment" default' },
  { cat: 'ASSET SALE',  q: '"363 sale" OR "stalking horse" bankruptcy auction' },
  { cat: 'CROSS-BORDER',q: '"chapter 15" OR "scheme of arrangement" OR "restructuring plan" court sanction' },
];

/* A headline has to earn its tile. */
const SIGNAL = /\b(chapter 11|chapter 15|chapter 7|bankrupt\w*|restructur\w*|reorganiz\w*|creditor\w*|debtor\w*|insolven\w*|distress\w*|default\w*|DIP|uptier|liability management|forbearance|covenant|noteholder\w*|lender\w*|receivership|administration|liquidat\w*|363 sale|stalking horse|disclosure statement|confirmation hearing|ad hoc group|scheme of arrangement)\b/i;

/* Obvious noise. */
const NOISE = /\b(stocks? to (watch|buy)|price prediction|penny stock|best \d+|horoscope|sponsored|crypto giveaway|how to (file|declare) bankruptcy|bankruptcy attorney near|debt relief program|credit card debt|student loan forgiveness)\b/i;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const decode = (s) => String(s)
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(d))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/* How specific is this headline? Concrete detail beats vague framing. */
function score(title) {
  let s = 0;
  if (/\$\s?[\d.,]+\s?(bn|billion|m\b|million|mm)/i.test(title)) s += 3;  // a number
  if (/\b(19|20)\d{2}\b|\bQ[1-4]\b/.test(title)) s += 1;
  if (/\b(Delaware|Texas|Southern District|SDNY|New Jersey|Judge|Court|bankruptcy court)\b/i.test(title)) s += 2;
  if (/\b(approv|reject|rul|grant|deni|file|confirm|seal|reach|secur|complet|launch)\w*\b/i.test(title)) s += 2;
  if (/\b(cents on the dollar|haircut|recovery|maturity|coupon)\b/i.test(title)) s += 2;
  if (/[A-Z][a-z]+ (Inc|Corp|Holdings|Group|LLC|Ltd|Partners|Energy|Retail|Health|Media)\b/.test(title)) s += 2;
  if (title.length > 55) s += 1;
  if (/\?$/.test(title)) s -= 2;                                  // speculation
  if (/\b(could|might|may|expected to|reportedly|weighs|mulls|eyes)\b/i.test(title)) s -= 1;
  return s;
}

function parseRss(xml, cat) {
  return Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g)).map((m) => {
    const b = m[1];
    const pick = (tag) => (b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [])[1] || '';

    let title = decode(pick('title'));
    let source = decode(pick('source'));

    // Google News appends " - Publisher" to titles
    if (!source) {
      const cut = title.lastIndexOf(' - ');
      if (cut > 20) { source = title.slice(cut + 3); title = title.slice(0, cut); }
    } else if (title.endsWith(' - ' + source)) {
      title = title.slice(0, -(source.length + 3));
    }

    // The description is usually just the linked title again; only keep
    // it when it actually adds something.
    let snippet = decode(pick('description'));
    if (snippet) {
      snippet = snippet.replace(/\s*-\s*[A-Z][\w .&']+$/, '').trim();
      const overlap = norm(snippet).startsWith(norm(title).slice(0, 40));
      if (overlap || snippet.length < 45 || snippet.length > 400) snippet = '';
      else snippet = snippet.slice(0, 165).replace(/\s+\S*$/, '') + '…';
    }

    const pub = decode(pick('pubDate'));
    const link = decode(pick('link'));

    // Always show a publisher. If Google didn't give one, derive it from the
    // article host (news.bbc.co.uk -> BBC) rather than printing "wire".
    if (!source && link) {
      try {
        source = new URL(link).hostname
          .replace(/^(www|news|amp|m)\./, '')
          .replace(/\.(com|net|org|co\.uk|co|io|news)$/, '')
          .split('.')[0]
          .replace(/-/g, ' ');
        source = source.length <= 4 ? source.toUpperCase()
                                    : source.charAt(0).toUpperCase() + source.slice(1);
      } catch (e) { source = ''; }
    }

    return {
      title,
      snippet,
      category: cat,
      link,
      source: source.slice(0, 26),
      published: pub ? new Date(pub).toISOString() : null,
    };
  });
}

(async () => {
  const all = [];

  for (const f of FEEDS) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(f.q + ' when:10d')}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const items = parseRss(await r.text(), f.cat)
        .filter((n) => n.title && n.link)
        .filter((n) => n.title.length >= 28)
        .filter((n) => SIGNAL.test(n.title))
        .filter((n) => !NOISE.test(n.title));
      all.push(...items.slice(0, 10));
      console.log(`· ${f.cat.padEnd(13)} ${items.length} usable`);
    } catch (e) {
      console.error(`! ${f.cat}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  // dedupe by normalised title
  const seen = new Set();
  const unique = all.filter((n) => {
    const k = norm(n.title).slice(0, 55);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // rank: specificity first, recency as the tiebreak
  const hoursOld = (n) => n.published ? (Date.now() - new Date(n.published)) / 3.6e6 : 999;
  const ranked = unique
    .map((n) => ({ ...n, _s: score(n.title) - Math.min(hoursOld(n) / 24, 4) }))
    .sort((a, b) => b._s - a._s);

  // spread the top tiles across categories so the grid isn't six of the same thing
  const picked = [], used = {};
  for (const pass of [1, 2, 99]) {
    for (const n of ranked) {
      if (picked.includes(n)) continue;
      if ((used[n.category] || 0) >= pass) continue;
      picked.push(n);
      used[n.category] = (used[n.category] || 0) + 1;
      if (picked.length >= 18) break;
    }
    if (picked.length >= 18) break;
  }

  const items = picked.map(({ _s, ...n }) => n);
  const OUT = path.join(__dirname, '..', 'data', 'news.json');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  if (!items.length) {
    console.error('no headlines passed the filter; leaving previous news.json in place');
    process.exit(fs.existsSync(OUT) ? 0 : 1);
  }

  fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), items }, null, 2));
  console.log(`✓ ${items.length} headlines -> data/news.json`);
})();
