#!/usr/bin/env node
/**
 * upload-to-kv.js
 * Uploads all slices from ./dist/api/ to Cloudflare KV using wrangler.
 *
 * Run AFTER build-slices.js:
 *   node build-slices.js
 *   node upload-to-kv.js
 *
 * Requires wrangler to be installed: npm install -g wrangler
 * And logged in: wrangler login
 */

const fs   = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const DIST = "./dist/api";
const KV_BINDING = "QBANK"; // must match wrangler.toml binding name

function kvPut(key, value) {
  // Write to temp file to avoid shell escaping issues with JSON
  const tmp = "./tmp_kv_value.json";
  fs.writeFileSync(tmp, value);
  try {
    execSync(
      `wrangler kv:key put --binding=${KV_BINDING} "${key}" --path="${tmp}"`,
      { stdio: "inherit" }
    );
  } finally {
    fs.unlinkSync(tmp);
  }
}

// Upload index
console.log("Uploading index.json…");
kvPut("index", fs.readFileSync(path.join(DIST, "index.json"), "utf8"));

// Upload chapter slices
const chaptersDir = path.join(DIST, "chapters");
const files = fs.readdirSync(chaptersDir).filter(f => f.endsWith(".json"));

for (const file of files) {
  const id = file.replace(".json", "");
  const key = `chapters/${id}`;
  console.log(`Uploading ${key}…`);
  kvPut(key, fs.readFileSync(path.join(chaptersDir, file), "utf8"));
}

console.log(`\n✅  Uploaded ${files.length + 1} keys to Cloudflare KV.`);
