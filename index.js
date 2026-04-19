require('dotenv').config();

const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");
const cors = require("cors");
const Stripe = require("stripe");
const { v4: uuidv4 } = require("uuid");

const { createClient } = require("@supabase/supabase-js");

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* =========================
   DATABASE (REAL PERSISTENCE FIX)
========================= */

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/* =========================
   MIDDLEWARE
========================= */

app.use(cors());

/* Stripe webhook MUST stay raw */
app.post(
  "/api/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {

    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return res.status(400).send(err.message);
    }

    /* =========================
       SUBSCRIPTION UPGRADE
    ========================= */

    if (event.type === "checkout.session.completed") {

      const session = event.data.object;
      const apiKey = session.metadata?.apiKey;

      if (apiKey) {
        await db
          .from("users")
          .update({
            plan: "pro",
            limit: 1000
          })
          .eq("api_key", apiKey);

        console.log("💳 USER UPGRADED:", apiKey);
      }
    }

    res.json({ received: true });
  }
);

/* JSON AFTER WEBHOOK */
app.use(express.json({ limit: "10kb" }));

/* =========================
   HELPERS
========================= */

function normalizeURL(input) {
  try {
    if (!input) return null;
    if (!input.startsWith("http")) input = "https://" + input;
    return new URL(input).toString();
  } catch {
    return null;
  }
}

/* =========================
   AUTH (NOW DATABASE-BASED)
========================= */

async function auth(req, res, next) {

  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    return res.status(401).json({ error: "missing_api_key" });
  }

  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("api_key", apiKey)
    .single();

  if (!data) {
    return res.status(403).json({ error: "invalid_api_key" });
  }

  req.user = data;
  next();
}

/* =========================
   RATE LIMIT (BASIC SAFETY)
========================= */

const rateMap = new Map();

function rateLimit(req, res, next) {
  const key = req.headers["x-api-key"] || req.ip;

  const now = Date.now();
  const window = 60 * 1000;

  if (!rateMap.has(key)) {
    rateMap.set(key, []);
  }

  const timestamps = rateMap.get(key).filter(t => now - t < window);

  if (timestamps.length > 20) {
    return res.status(429).json({ error: "rate_limited" });
  }

  timestamps.push(now);
  rateMap.set(key, timestamps);

  next();
}

/* =========================
   SCRAPER CORE
========================= */

async function fetchHTML(url) {
  try {
    const res = await axios.get(url, {
      timeout: 12000,
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    return res.data;
  } catch {
    return null;
  }
}

function analyzeHTML(html, url) {

  const $ = cheerio.load(html);

  const title = $("title").text() || "";
  const desc = $("meta[name='description']").attr("content") || "";
  const h1 = $("h1").length;
  const links = $("a").length;

  let seo = 50;
  let ux = 50;
  let conv = 50;

  if (title.length > 10) seo += 10;
  if (desc.length > 20) seo += 15;
  if (h1 > 0) seo += 10;

  if (links > 5) ux += 10;
  if (h1 > 0) ux += 10;

  if (desc.length > 40) conv += 10;

  return {
    seo: Math.min(seo, 100),
    ux: Math.min(ux, 100),
    conv: Math.min(conv, 100)
  };
}

/* =========================
   LOGGING (IMPORTANT UPGRADE)
========================= */

async function logEvent(data) {
  await db.from("logs").insert([data]);
}

/* =========================
   USER CREATE
========================= */

app.post("/api/create-user", async (req, res) => {

  const apiKey = uuidv4();

  await db.from("users").insert([{
    api_key: apiKey,
    plan: "free",
    usage: 0,
    limit: 5
  }]);

  res.json({
    apiKey,
    plan: "free"
  });
});

/* =========================
   ANALYZE ENGINE
========================= */

app.post("/api/analyze", rateLimit, auth, async (req, res) => {

  try {

    const url = normalizeURL(req.body.site);
    if (!url) return res.status(400).json({ error: "invalid_url" });

    const html = await fetchHTML(url);
    if (!html) return res.status(500).json({ error: "fetch_failed" });

    const scores = analyzeHTML(html, url);

    /* update usage */
    await db
      .from("users")
      .update({ usage: req.user.usage + 1 })
      .eq("api_key", req.user.api_key);

    /* log for CRM intelligence */
    await logEvent({
      api_key: req.user.api_key,
      url,
      scores,
      created_at: new Date().toISOString()
    });

    res.json({
      success: true,
      result: `
SEO Score: ${scores.seo}/100
UX Score: ${scores.ux}/100
Conversion Score: ${scores.conv}/100
      `.trim()
    });

  } catch (err) {
    res.status(500).json({ error: "server_error" });
  }
});

/* =========================
   HEALTH
========================= */

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "NorthSky Revenue OS v4"
  });
});

/* =========================
   START
========================= */

app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 NorthSky Revenue OS v4 running");
});