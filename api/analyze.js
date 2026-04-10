import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// =============================
// 🌐 FETCH WEBSITE HTML
// =============================
async function getSiteContent(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const html = await res.text();

    // trim to avoid token overload
    return html.slice(0, 8000);

  } catch (err) {
    return null;
  }
}

// =============================
// 🚀 MAIN HANDLER
// =============================
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { site } = req.body;

  if (!site) {
    return res.status(400).json({ error: "Missing site URL" });
  }

  // =============================
  // 🌐 GET SITE DATA
  // =============================
  const content = await getSiteContent(site);

  if (!content) {
    return res.status(500).json({
      result: "⚠️ Could not fetch website content"
    });
  }

  // =============================
  // 🧠 GPT PROMPT
  // =============================
  const prompt = `
You are a CRO (conversion rate optimization) expert.

Analyze this website content and give a HIGH-VALUE report.

Website:
${site}

Content:
${content}

Return:

1. 📊 Score (0-100)
2. ❌ 3 Biggest Conversion Problems
3. ✅ 3 Specific Fixes
4. 💡 Better Headline (rewrite it)
5. 🚀 Quick Wins (bullet list)

Keep it short, clear, and actionable.
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an expert website conversion analyst." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    });

    const result = completion.choices[0].message.content;

    return res.status(200).json({ result });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      result: "⚠️ AI analysis failed"
    });
  }
}