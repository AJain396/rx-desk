#!/usr/bin/env node
/**
 * Reads every .md file in posts/ and writes posts.json at the repo root.
 * Frontmatter keys: title, date, tags, excerpt, draft
 * Slug = filename with the leading YYYY-MM-DD- stripped.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "posts");
const OUT = path.join(ROOT, "posts.json");

function parseFrontmatter(raw) {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!text.startsWith("---")) return { meta: {}, body: text.trim() };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { meta: {}, body: text.trim() };
  const head = text.slice(3, end).trim();
  const body = text.slice(end + 4).replace(/^\n+/, "");
  const meta = {};
  head.split("\n").forEach((line) => {
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) return;
    const key = m[1].trim();
    let val = m[2].trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      meta[key] = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      return;
    }
    val = val.replace(/^["']|["']$/g, "");
    if (val === "true") meta[key] = true;
    else if (val === "false") meta[key] = false;
    else meta[key] = val;
  });
  return { meta, body: body.trim() };
}

if (!fs.existsSync(POSTS_DIR)) {
  fs.writeFileSync(OUT, "[]\n");
  console.log("No posts/ directory — wrote empty posts.json");
  process.exit(0);
}

const posts = fs
  .readdirSync(POSTS_DIR)
  .filter((f) => f.toLowerCase().endsWith(".md"))
  .map((file) => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const stem = file.replace(/\.md$/i, "");
    const slug = stem.replace(/^\d{4}-\d{2}-\d{2}-/, "");
    const dateFromName = (stem.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] || "";
    return {
      slug,
      file,
      title: meta.title || slug,
      date: meta.date || dateFromName,
      tags: Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : [],
      excerpt: meta.excerpt || "",
      draft: meta.draft === true,
      body,
    };
  })
  .sort((a, b) => String(b.date).localeCompare(String(a.date)));

// Warn (do not fail) on posts that don't meet the two-tag convention.
posts.forEach((p) => {
  const hasYear = p.tags.some((t) => /^\d{4}$/.test(String(t).trim()));
  const hasDeal = p.tags.some((t) => !/^\d{4}$/.test(String(t).trim()));
  if (!hasYear || !hasDeal) {
    console.warn(`WARNING: ${p.file} should have at least one year tag and one deal/trend tag.`);
  }
});

fs.writeFileSync(OUT, JSON.stringify(posts, null, 2) + "\n");
console.log(`Wrote posts.json — ${posts.length} post(s), ${posts.filter((p) => p.draft).length} draft(s).`);
