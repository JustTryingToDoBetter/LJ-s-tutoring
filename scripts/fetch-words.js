/*
  Build-time word list fetcher (offline-safe).
  - Downloads a curated 5-letter word list
  - Writes to assets/data/words-5.json
  - If fetch fails, uses existing local file (no build fail)
*/

const https = require("https");
const fs = require("fs");
const path = require("path");

const OUT_PATH = path.join(__dirname, "..", "assets", "data", "words-5.json");
const DEFAULT_URL = "https://raw.githubusercontent.com/tabatkins/wordle-list/main/words";

const WORDS_URL = process.env.WORDS_URL || DEFAULT_URL;

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function sanitizeWords(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);

  const set = new Set();
  for (const w of lines) {
    if (/^[a-z]{5}$/.test(w)) set.add(w);
  }

  return Array.from(set).sort();
}

function readLocalWords() {
  try {
    const raw = fs.readFileSync(OUT_PATH, "utf8");
    const data = JSON.parse(raw);
    const words = Array.isArray(data?.words) ? data.words : [];
    return words.filter((w) => typeof w === "string" && /^[a-z]{5}$/.test(w));
  } catch {
    return [];
  }
}

async function main() {
  let words = [];

  try {
    const text = await fetchText(WORDS_URL);
    words = sanitizeWords(text);
  } catch (err) {
    const fallback = readLocalWords();
    if (fallback.length) {
      console.warn(`[fetch-words] Network unavailable; using cached ${fallback.length} words.`);
      return;
    }
    console.error(`[fetch-words] Failed to download words and no cache found: ${err.message}`);
    process.exit(1);
  }

  if (!words.length) {
    const fallback = readLocalWords();
    if (fallback.length) {
      console.warn("[fetch-words] Downloaded list was empty; using cached words.");
      return;
    }
    console.error("[fetch-words] No valid 5-letter words found.");
    process.exit(1);
  }

  const payload = {
    version: 1,
    source: WORDS_URL,
    words,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`[fetch-words] Saved ${words.length} words to ${OUT_PATH}`);
}

main();
