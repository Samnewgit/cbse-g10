/**
 * Cloudflare Worker — CBSE Math Question Bank API
 *
 * Deploy: wrangler deploy
 * KV namespace: QBANK  (bind in wrangler.toml)
 *
 * Routes:
 *   GET /api/chapters            → chapter index
 *   GET /api/chapters/:id        → full chapter (topics + questions)
 *   GET /api/question/:id        → single question by id
 *   GET /api/search?q=...        → search across all questions (basic)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",         // your domain in prod: "https://yourdomain.com"
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=3600",    // 1hr cache — questions don't change often
};

// Rate limiting: 60 requests per minute per IP
// Uses Cloudflare's built-in rate limiting via a simple KV counter
const RATE_LIMIT = 60;
const RATE_WINDOW_SECONDS = 60;

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";

    // ── Rate limiting ──────────────────────────────────────────────────────────
    const rateLimited = await checkRateLimit(env, ip, ctx);
    if (rateLimited) {
      return json({ error: "Too many requests. Please slow down." }, 429);
    }

    // ── Route matching ─────────────────────────────────────────────────────────
    const path = url.pathname.replace(/\/$/, ""); // strip trailing slash

    try {
      // GET /api/chapters
      if (path === "/api/chapters" || path === "/api") {
        return await handleIndex(env);
      }

      // GET /api/chapters/:id  (e.g. /api/chapters/5)
      const chapterMatch = path.match(/^\/api\/chapters\/([a-z0-9-]+)$/);
      if (chapterMatch) {
        return await handleChapter(env, chapterMatch[1]);
      }

      // GET /api/question/:id  (e.g. /api/question/5_q3)
      const questionMatch = path.match(/^\/api\/question\/([a-z0-9_-]+)$/);
      if (questionMatch) {
        return await handleQuestion(env, questionMatch[1]);
      }

      // GET /api/search?q=discriminant&chapter=4&marks=1
      if (path === "/api/search") {
        return await handleSearch(env, url.searchParams);
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: "Internal server error" }, 500);
    }
  },
};

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleIndex(env) {
  const data = await kvGet(env, "index");
  if (!data) return json({ error: "Index not found" }, 404);
  return json(data);
}

async function handleChapter(env, id) {
  // Accept both numeric id ("5") and slug ("arithmetic-progressions")
  const data = await kvGet(env, `chapters/${id}`);
  if (!data) return json({ error: `Chapter '${id}' not found` }, 404);
  return json(data);
}

async function handleQuestion(env, qid) {
  // qid format: "5_q3" → chapterId = "5"
  const chapterId = qid.split("_")[0];
  const chapter = await kvGet(env, `chapters/${chapterId}`);
  if (!chapter) return json({ error: "Question not found" }, 404);
  const q = chapter.questions.find((q) => q.id === qid);
  if (!q) return json({ error: "Question not found" }, 404);
  return json(q);
}

async function handleSearch(env, params) {
  const query = (params.get("q") || "").toLowerCase().trim();
  const chapterId = params.get("chapter");
  const marksFilter = params.get("marks");
  const yearFilter = params.get("year");
  const topicFilter = params.get("topic"); // topic id like "5.7"

  if (!query && !chapterId && !marksFilter && !topicFilter) {
    return json({ error: "Provide at least one filter: q, chapter, marks, year, or topic" }, 400);
  }

  const index = await kvGet(env, "index");
  if (!index) return json({ error: "Index not found" }, 404);

  // Determine which chapters to search
  const chaptersToSearch = chapterId
    ? index.chapters.filter((c) => c.id === chapterId || c.slug === chapterId)
    : index.chapters;

  const results = [];

  for (const chapterMeta of chaptersToSearch) {
    const chapter = await kvGet(env, `chapters/${chapterMeta.id}`);
    if (!chapter) continue;

    for (const q of chapter.questions) {
      // Apply filters
      if (marksFilter && q.marks !== marksFilter) continue;
      if (yearFilter && q.year !== yearFilter) continue;
      if (topicFilter && !q.topics.some((t) => t.id === topicFilter)) continue;
      if (query && !q.text.toLowerCase().includes(query)) continue;

      results.push({
        ...q,
        chapter_id: chapterMeta.id,
        chapter_name: chapterMeta.name,
      });

      // Hard cap: never return more than 50 results in one call
      // Forces the scraper to make many targeted calls → rate limiting kicks in
      if (results.length >= 50) break;
    }
    if (results.length >= 50) break;
  }

  return json({ count: results.length, results });
}

// ── Rate limiting helper ──────────────────────────────────────────────────────

async function checkRateLimit(env, ip, ctx) {
  if (!env.QBANK) return false; // KV not bound (local dev) — skip

  const key = `rl:${ip}:${Math.floor(Date.now() / (RATE_WINDOW_SECONDS * 1000))}`;
  const current = parseInt((await env.QBANK.get(key)) || "0");

  if (current >= RATE_LIMIT) return true; // rate limited

  // Increment counter (fire-and-forget, don't block response)
  ctx.waitUntil(
    env.QBANK.put(key, String(current + 1), {
      expirationTtl: RATE_WINDOW_SECONDS * 2, // auto-expire after 2 windows
    })
  );

  return false;
}

// ── KV helper ────────────────────────────────────────────────────────────────

async function kvGet(env, key) {
  if (!env.QBANK) return null;
  const val = await env.QBANK.get(key, { type: "json" });
  return val;
}

// ── Response helper ───────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
