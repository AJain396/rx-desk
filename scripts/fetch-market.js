#!/usr/bin/env node
/* ============================================================
   Market tape -> data/market.json
   Runs on GitHub's servers (never in the browser), so there is
   no CORS problem and no API key in your repo.

   Sources, tried in order per symbol:
     1. Yahoo Finance  /v8/finance/chart   (query1, then query2)
     2. Yahoo Finance  /v7/finance/quote   (with cookie + crumb)
     3. Stooq CSV                          (free fallback, no key)

   Yahoo occasionally 403s requests from cloud IP ranges. The
   fallbacks mean the tape keeps running when that happens.
   Edit SYMBOLS below to change what scrolls across the top.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const SYMBOLS = [
  { symbol: '^GSPC',    stooq: '^spx',  label: 'S&P 500' },
  { symbol: '^DJI',     stooq: '^dji',  label: 'DOW'     },
  { symbol: '^IXIC',    stooq: '^ndq',  label: 'NASDAQ'  },
  { symbol: '^RUT',     stooq: '^rut',  label: 'RUSSELL' },
  { symbol: '^VIX',     stooq: '^vix',  label: 'VIX'     },
  { symbol: '^TNX',     stooq: '10usy.b', label: 'US 10Y' },
  { symbol: 'HYG',      stooq: 'hyg.us', label: 'HYG'    },  // high yield
  { symbol: 'JNK',      stooq: 'jnk.us', label: 'JNK'    },  // high yield
  { symbol: 'BKLN',     stooq: 'bkln.us',label: 'BKLN'   },  // leveraged loans
  { symbol: 'LQD',      stooq: 'lqd.us', label: 'LQD'    },  // IG credit
  { symbol: 'CL=F',     stooq: 'cl.f',  label: 'CRUDE'   },
  { symbol: 'GC=F',     stooq: 'gc.f',  label: 'GOLD'    },
  { symbol: 'DX-Y.NYB', stooq: '',      label: 'DXY'     },
  { symbol: 'BTC-USD',  stooq: 'btcusd',label: 'BTC'     },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const H  = { 'User-Agent': UA, 'Accept': 'application/json,text/plain,*/*', 'Accept-Language': 'en-US,en;q=0.9' };

const get = (url, extra = {}) =>
  fetch(url, { headers: { ...H, ...extra }, redirect: 'follow' });

/* ---------- 1 & 2: Yahoo ---------- */
let CRUMB = null, COOKIE = null;

async function yahooCrumb() {
  if (CRUMB) return CRUMB;
  try {
    const a = await get('https://fc.yahoo.com/');
    COOKIE = (a.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
    const b = await get('https://query2.finance.yahoo.com/v1/test/getcrumb', { Cookie: COOKIE });
    const t = (await b.text()).trim();
    if (t && t.length < 32) CRUMB = t;
  } catch (e) { /* fall through to stooq */ }
  return CRUMB;
}

async function fromYahooChart(sym) {
  for (const host of ['query1', 'query2']) {
    try {
      const r = await get(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`);
      if (!r.ok) continue;
      const m = (await r.json())?.chart?.result?.[0]?.meta;
      if (!m?.regularMarketPrice) continue;
      const prev = m.chartPreviousClose ?? m.previousClose ?? m.regularMarketPrice;
      return mk(m.regularMarketPrice, prev, `yahoo/${host}`);
    } catch (e) { /* next host */ }
  }
  return null;
}

async function fromYahooQuote(sym) {
  const crumb = await yahooCrumb();
  if (!crumb) return null;
  try {
    const r = await get(
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sym)}&crumb=${encodeURIComponent(crumb)}`,
      { Cookie: COOKIE });
    if (!r.ok) return null;
    const q = (await r.json())?.quoteResponse?.result?.[0];
    if (!q?.regularMarketPrice) return null;
    return mk(q.regularMarketPrice, q.regularMarketPreviousClose ?? q.regularMarketPrice, 'yahoo/quote');
  } catch (e) { return null; }
}

/* ---------- 3: Stooq fallback ---------- */
async function fromStooq(sym) {
  if (!sym) return null;
  try {
    const r = await get(`https://stooq.com/q/l/?s=${encodeURIComponent(sym)}&f=sd2t2ohlcv&h&e=csv`);
    if (!r.ok) return null;
    const rows = (await r.text()).trim().split('\n');
    if (rows.length < 2) return null;
    const c = rows[1].split(',');
    const open = parseFloat(c[3]), close = parseFloat(c[6]);
    if (!isFinite(close)) return null;
    return mk(close, isFinite(open) ? open : close, 'stooq');
  } catch (e) { return null; }
}

function mk(price, prev, source) {
  return {
    price: Number(price),
    change: Number(price) - Number(prev),
    changePercent: prev ? ((price - prev) / prev) * 100 : 0,
    source,
  };
}

/* ---------- run ---------- */
(async () => {
  const out = [];
  for (const s of SYMBOLS) {
    const q = (await fromYahooChart(s.symbol))
           || (await fromYahooQuote(s.symbol))
           || (await fromStooq(s.stooq));
    if (q) {
      out.push({ symbol: s.symbol, label: s.label, ...q });
      console.log(`· ${s.label.padEnd(9)} ${q.price.toFixed(2).padStart(11)}  (${q.source})`);
    } else {
      console.error(`! ${s.label}: all sources failed`);
    }
    await new Promise((r) => setTimeout(r, 250)); // be polite
  }

  const OUT = path.join(__dirname, '..', 'data', 'market.json');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  if (!out.length) {
    // Never overwrite good data with nothing — keep the last successful pull.
    console.error('no quotes fetched; leaving previous market.json in place');
    process.exit(fs.existsSync(OUT) ? 0 : 1);
  }

  fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), quotes: out }, null, 2));
  console.log(`✓ ${out.length}/${SYMBOLS.length} quotes -> data/market.json`);
})();
