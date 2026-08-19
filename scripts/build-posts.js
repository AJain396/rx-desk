#!/usr/bin/env node
/* Reads posts/*.md (YAML-ish frontmatter) -> data/posts.json
   Zero dependencies. Run: node scripts/build-posts.js            */

const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, '..', 'posts');
const OUT = path.join(__dirname, '..', 'data', 'posts.json');

function parseFrontmatter(raw) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (/^\[.*\]$/.test(val)) {
      val = val.slice(1, -1).split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      val = val.replace(/^["']|["']$/g, '');
    }
    meta[key] = val;
  }
  return { meta, body: m[2] };
}

const stripMd = (md) => md
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[#>*_`~|-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const slugify = (s) => s.toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);

if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR, { recursive: true });

const posts = fs.readdirSync(POSTS_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((file) => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    const plain = stripMd(body);
    const title = meta.title || file.replace(/\.md$/, '');

    // date: frontmatter, else leading YYYY-MM-DD in filename, else file mtime
    let date = meta.date;
    if (!date) {
      const fm = file.match(/^(\d{4}-\d{2}-\d{2})/);
      date = fm ? fm[1] : fs.statSync(path.join(POSTS_DIR, file))
        .mtime.toISOString().slice(0, 10);
    }

    let tags = meta.tags || [];
    if (typeof tags === 'string') tags = tags.split(/[,\s]+/).filter(Boolean);

    return {
      slug: meta.slug || slugify(file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '')),
      title,
      date: String(date).slice(0, 10),
      tags,
      draft: String(meta.draft || '').toLowerCase() === 'true',
      excerpt: meta.excerpt || plain.slice(0, 190) + (plain.length > 190 ? '…' : ''),
      readingTime: Math.max(1, Math.round(plain.split(' ').length / 220)),
      plain: plain.slice(0, 4000),   // search index
      body: body.trim(),
    };
  })
  .filter((p) => !p.draft)
  .sort((a, b) => b.date.localeCompare(a.date));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), posts }, null, 2));
console.log(`✓ built ${posts.length} post(s) -> data/posts.json`);
