# RX Desk — ananayajain.com

Static blog. No frameworks, no build dependencies beyond Node (already on the GitHub Actions runner).

## Structure

```
index.html                    the entire site (home, deals page, post view) — inline CSS + JS
posts/YYYY-MM-DD-slug.md      one file per post
scripts/build-posts.js        reads posts/, writes posts.json
posts.json                    generated — do not hand-edit
.github/workflows/build.yml   on push to main: rebuild posts.json, deploy to GitHub Pages
CNAME                         ananayajain.com
.nojekyll                     stops GitHub Pages from running Jekyll
```

## Publishing a post

1. Add a file to `posts/` named `YYYY-MM-DD-slug.md`.
2. Frontmatter:

```
---
title: Altice USA (Optimum) and the Creditor Co-op
date: 2026-09-19
tags: [Altice/Optimum, 2026]
excerpt: One-sentence preview shown on the home page tile.
---
```

3. Body is markdown below the frontmatter.
4. Commit to `main`. The workflow regenerates `posts.json` and redeploys.

### Tag rules

Every post needs at least two tags: one **year** tag (`2025`, `2026`) and at least one **deal/trend** tag (`Altice/Optimum`, `LifeScan`, `Serta`, `Liability Management Exercises`). The build warns if either is missing. Deal tags are matched exactly, so spell them the same way every time — `Altice/Optimum` and `Altice` would become two separate tiles on the Deals and Trends page.

### Other frontmatter

- `draft: true` — keeps the post out of the site while leaving the file in the repo.

## Local preview

```
node scripts/build-posts.js
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly from the filesystem will not work — `posts.json` is loaded by fetch, which needs a server.
