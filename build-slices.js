#!/usr/bin/env node
/**
 * build-slices.js
 * Run: node build-slices.js
 *
 * Reads master.db.json → writes to /dist/api/
 * The dist/api/ folder is what you deploy to Cloudflare KV.
 * master.db.json NEVER leaves your machine.
 */

const fs = require("fs");
const path = require("path");

const INPUT = "./master.db.json";
const OUT_DIR = "./dist/api";

// Fields to STRIP before any slice is written (never expose to browser)
const STRIP_FIELDS = ["source_file"];

// Clean up source_file into a human label instead
function makeSourceLabel(q) {
  // "23J_30_C_2.pdf" → "July 2023 · Set C2"
  if (!q.source_file) return null;
  const name = q.source_file.replace(".pdf", "");
  // Pattern: YYM_marks_series_set  e.g. 23J_30_C_2  or  23J_30_C_B
  const m = name.match(/^(\d{2})([A-Z])_(\d+)_([A-Z])_([A-Z0-9]+)$/);
  if (!m) return name; // fallback: return raw name
  const [, yy, mo, , series, set] = m;
  const months = { J: "July", M: "March", F: "February", O: "October", N: "November" };
  return `20${yy} ${months[mo] || mo} · Set ${series}${set}`;
}

function sanitizeQuestion(q) {
  const out = { ...q };
  // Replace source_file with a clean human label
  out.source_label = makeSourceLabel(q);
  // Strip sensitive fields
  STRIP_FIELDS.forEach((f) => delete out[f]);
  // Clean up topic names (strip leading whitespace/arrows used for indentation)
  if (Array.isArray(out.topics)) {
    out.topics = out.topics.map((t) => ({
      ...t,
      name: t.name.replace(/^\s+↳\s*/, "↳ ").trim(),
      is_subtopic: t.name.trimStart().startsWith("↳"),
    }));
  }
  return out;
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/^\d+\.\s*/, "")   // remove leading "5. "
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildId(chapterName) {
  const m = chapterName.match(/^(\d+)\./);
  return m ? m[1] : slugify(chapterName);
}

// ── Main ──────────────────────────────────────────────────────────────────────

if (!fs.existsSync(INPUT)) {
  console.error(`❌  ${INPUT} not found. Place it next to this script.`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(INPUT, "utf8"));
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, "chapters"), { recursive: true });

const chapterIndex = [];

for (const [chapterName, data] of Object.entries(raw)) {
  const id = buildId(chapterName);
  const slug = slugify(chapterName);
  const displayName = chapterName.replace(/^\d+\.\s*/, ""); // "Arithmetic Progressions"

  const questions = (data.questions || []).map((q, i) => ({
    id: `${id}_q${i + 1}`,
    ...sanitizeQuestion(q),
  }));

  // Stats for the index (no question content)
  const markCounts = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  const years = new Set();
  questions.forEach((q) => {
    if (markCounts[q.marks] !== undefined) markCounts[q.marks]++;
    if (q.year) years.add(q.year);
  });

  const chapterEntry = {
    id,
    slug,
    name: displayName,
    total: questions.length,
    marks_breakdown: markCounts,
    years: [...years].sort(),
    topics: (data.topics || []).map((t) => ({
      ...t,
      is_subtopic: t.name.trimStart().startsWith("↳"),
      name: t.name.replace(/^\s+↳\s*/, "↳ ").trim(),
    })),
  };

  chapterIndex.push(chapterEntry);

  // Write chapter slice (questions only, no raw DB structure)
  const slice = {
    chapter: chapterEntry,
    questions,
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "chapters", `${id}.json`),
    JSON.stringify(slice, null, 2)
  );

  console.log(`✅  Chapter ${id}: "${displayName}" → ${questions.length} questions`);
}

// Write the index (no questions, just chapter metadata)
fs.writeFileSync(
  path.join(OUT_DIR, "index.json"),
  JSON.stringify({ chapters: chapterIndex, built_at: new Date().toISOString() }, null, 2)
);

console.log(`\n📦  Done. Output in ./dist/api/`);
console.log(`    index.json + ${chapterIndex.length} chapter slices`);
console.log(`\n⚠️   Deploy ./dist/api/ to Cloudflare KV only.`);
console.log(`    NEVER commit master.db.json to git.`);
