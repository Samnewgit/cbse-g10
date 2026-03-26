# CBSE Class 10 Mathematics — Question Bank
## Deployment Guide

---

## What you have

| File | Purpose |
|------|---------|
| `build-slices.js` | Splits master.db.json into safe API slices |
| `worker.js` | Cloudflare Worker (API + rate limiting) |
| `wrangler.toml` | Cloudflare deployment config |
| `upload-to-kv.js` | Pushes slices to Cloudflare KV |
| `index.html` | Student-facing frontend |

---

## Step 1 — Build the slices (your machine only)

```bash
# Place master.db.json next to build-slices.js, then:
node build-slices.js
```

Output: `dist/api/index.json` + `dist/api/chapters/*.json`

⚠️  **NEVER commit master.db.json to git.**
Add to `.gitignore`:
```
master.db.json
dist/
```

---

## Step 2 — Set up Cloudflare (free)

1. Create a free account at https://cloudflare.com
2. Install wrangler: `npm install -g wrangler`
3. Login: `wrangler login`
4. Create KV namespace:
   ```bash
   wrangler kv:namespace create "QBANK"
   ```
   Copy the `id` it gives you, paste into `wrangler.toml`

---

## Step 3 — Upload data to KV

```bash
node upload-to-kv.js
```

---

## Step 4 — Deploy the Worker

```bash
wrangler deploy
```

It will give you a URL like:
`https://cbse-math-qbank.YOUR_NAME.workers.dev`

---

## Step 5 — Update the frontend

Open `index.html`, find this line near the top of the `<script>`:

```js
const API_BASE = "https://cbse-math-qbank.YOUR_SUBDOMAIN.workers.dev/api";
```

Replace with your actual Worker URL.

---

## Step 6 — Deploy the frontend (free)

**Option A — GitHub Pages (recommended)**
1. Create a GitHub repo (can be private)
2. Push `index.html` to the repo
3. Enable Pages in repo Settings → Pages → Source: main branch

**Option B — Netlify**
1. Drag the `index.html` file to https://app.netlify.com/drop
2. Netlify gives you a free URL instantly

---

## API Routes (for your reference)

| Route | Returns |
|-------|---------|
| `GET /api/chapters` | All chapter names + metadata |
| `GET /api/chapters/5` | All questions in chapter 5 |
| `GET /api/question/5_q3` | Single question |
| `GET /api/search?chapter=5&marks=1` | Filtered questions |
| `GET /api/search?chapter=5&topic=5.7` | Questions by topic ID |
| `GET /api/search?chapter=5&year=2023` | Questions by year |

---

## Protection model

| Threat | Defense |
|--------|---------|
| Publisher downloads master.db.json | Impossible — file never leaves your machine |
| Bulk scraping via API | Rate limiter: 60 req/min/IP, auto-ban |
| Reconstruct DB from API | Hard cap of 50 results per search call |
| Source paper filenames exposed | Stripped in build-slices.js, replaced with clean labels |
| Raw chapter dump | Each chapter served as its own key — no single "dump all" endpoint |

---

## Updating the question bank

When you add new questions to master.db.json:

```bash
node build-slices.js    # re-build slices
node upload-to-kv.js    # re-upload to KV
# No code changes needed — Worker and frontend stay the same
```

---

## Cost

| Service | Cost |
|---------|------|
| Cloudflare Workers | Free (100k req/day) |
| Cloudflare KV | Free (100k reads/day) |
| GitHub Pages / Netlify | Free |
| **Total** | **₹0/month** |
