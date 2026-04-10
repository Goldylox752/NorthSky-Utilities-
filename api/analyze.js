export default async function handler(req, res) {
  try {
    let { site } = req.body;

    // ❌ INVALID
    if (!site || !site.includes(".")) {
      return res.status(400).json({
        result: "Enter a valid website"
      });
    }

    // 🔧 FIX URL
    if (!site.startsWith("http")) {
      site = "https://" + site;
    }

    // =============================
    // 🚫 RATE LIMIT
    // =============================
    const ip = req.headers["x-forwarded-for"] || "unknown";

    global.calls = global.calls || {};
    if (!global.calls[ip]) global.calls[ip] = 0;

    if (global.calls[ip] > 10) {
      return res.status(429).json({
        result: "Too many requests"
      });
    }

    global.calls[ip]++;

    // =============================
    // 🤖 OPENAI CALL (FIXED)
    // =============================
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: `Analyze this website and give conversion insights:\n\n${site}`
      })
    });

    const data = await response.json();

    const result =
      data.output?.[0]?.content?.[0]?.text ||
      "No response from AI";

    // =============================
    // ✅ RETURN RESPONSE (THIS WAS MISSING)
    // =============================
    return res.status(200).json({
      result
    });

  } catch (err) {
    console.error("Analyze error:", err);

    return res.status(500).json({
      result: "Server error while analyzing site"
    });
  }
}
