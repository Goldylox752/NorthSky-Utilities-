/* ================= CORE ================= */
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

/* ================= LOGGING ================= */
app.use((req, res, next) => {
  console.log(`➡️ ${req.method} ${req.url}`);
  next();
});

/* ================= CACHE ================= */
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 30;

/* ================= HELPERS ================= */
function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.time > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data) {
  cache.set(key, { data, time: Date.now() });
}

function normalizeURL(input) {
  try {
    if (!input) return null;
    input = input.trim();
    if (!input.startsWith("http")) input = "https://" + input;
    return new URL(input).toString();
  } catch {
    return null;
  }
}

function isURL(str) {
  try {
    new URL(str.startsWith("http") ? str : "https://" + str);
    return true;
  } catch {
    return false;
  }
}

/* ================= FETCH ================= */
async function fetchHTML(url) {
  try {
    const res = await axios.get(url, {
      timeout: 12000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      },
    });
    return res.data;
  } catch (err) {
    console.log("FETCH ERROR:", err.message);
    return null;
  }
}

/* ================= SCRAPER ================= */
function parseHTML(html, url) {
  const $ = cheerio.load(html);

  const title =
    $("meta[property='og:title']").attr("content") ||
    $("title").text().trim() ||
    "Untitled";

  const description =
    $("meta[name='description']").attr("content") ||
    $("meta[property='og:description']").attr("content") ||
    $("p").first().text().trim().slice(0, 200) ||
    "";

  const image =
    $("meta[property='og:image']").attr("content") || null;

  const site = new URL(url).hostname.replace("www.", "");

  return { title, description, image, site };
}

/* ================= AI SCORING ENGINE ================= */
function analyzeHTML(html, url) {
  const $ = cheerio.load(html);

  const title = $("title").text() || "";
  const desc = $("meta[name='description']").attr("content") || "";
  const h1 = $("h1").length;
  const imgs = $("img").length;
  const links = $("a").length;
  const ssl = url.startsWith("https");

  let seo = 50;
  let ux = 50;
  let conv = 50;

  // SEO
  if (title.length > 10) seo += 10;
  if (desc.length > 20) seo += 15;
  if (h1 > 0) seo += 10;
  if (links > 5) seo += 10;

  // UX
  if (imgs > 0) ux += 10;
  if (h1 > 0) ux += 10;

  // Conversion
  if (desc.length > 50) conv += 10;
  if (links > 3) conv += 10;
  if (ssl) conv += 10;

  return {
    seo: Math.min(seo, 100),
    ux: Math.min(ux, 100),
    conv: Math.min(conv, 100),
  };
}

/* ================= CORE SCRAPE ================= */
async function scrape(url) {
  const html = await fetchHTML(url);
  if (!html) return { success: false, error: "fetch_failed" };

  const metadata = parseHTML(html, url);

  return { success: true, metadata, html };
}

/* ================= SEARCH ENGINE (PHASE 1 MOCK) ================= */
async function searchEngine(query) {
  return {
    success: true,
    query,
    results: [
      {
        title: `Search: ${query}`,
        url: `https://example.com/search?q=${encodeURIComponent(query)}`,
        snippet: "AI-powered placeholder result (upgrade to SerpAPI later)"
      }
    ]
  };
}

/* ================= ASK NORTHSKY (AI ROUTER) ================= */
async function askEngine(input) {
  if (isURL(input)) {
    const url = normalizeURL(input);
    return scrape(url);
  }

  const results = await searchEngine(input);

  return {
    success: true,
    type: "search",
    answer: `NorthSky found results for "${input}"`,
    ...results
  };
}

/* ================= API: SCRAPE ================= */
app.get("/api/rip", async (req, res) => {
  const url = normalizeURL(req.query.url);
  if (!url) return res.status(400).json({ success: false });

  const key = crypto.createHash("md5").update(url).digest("hex");

  const cached = getCache(key);
  if (cached) return res.json({ success: true, cached: true, ...cached });

  const result = await scrape(url);

  setCache(key, result);
  res.json(result);
});

/* ================= API: ANALYZE (YOUR AUDITOR UI) ================= */
app.post("/api/analyze", async (req, res) => {
  try {
    const url = normalizeURL(req.body.site);
    if (!url) return res.status(400).json({ success: false });

    const html = await fetchHTML(url);
    if (!html) return res.status(500).json({ success: false });

    const meta = parseHTML(html, url);
    const scores = analyzeHTML(html, url);

    return res.json({
      success: true,
      meta,
      scores,
      result: `
SEO Score: ${scores.seo}/100
UX Score: ${scores.ux}/100
Conversion Score: ${scores.conv}/100

Insights:
- ${scores.seo < 70 ? "Improve SEO structure" : "Good SEO foundation"}
- ${scores.ux < 70 ? "Improve UX design" : "Good UX"}
- ${scores.conv < 70 ? "Improve conversion elements" : "Good conversion setup"}
      `.trim()
    });

  } catch {
    res.status(500).json({ success: false });
  }
});

/* ================= ASK API (NORTHSKY OS CORE) ================= */
app.get("/api/ask", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ success: false });

  const result = await askEngine(q);
  res.json(result);
});

/* ================= HEALTH ================= */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    cacheSize: cache.size
  });
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log(`🚀 NorthSky OS v3 running on port ${PORT}`);
});