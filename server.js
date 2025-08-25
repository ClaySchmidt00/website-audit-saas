import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import OpenAI from "openai";
import { JSDOM } from "jsdom";
import axeCore from "axe-core";
import metadataParser from "html-metadata-parser";
import { getSecurityHeaders } from "securityheaders";

const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(bodyParser.json());
app.use(express.static("public"));

// Helper: fetch HTML
async function fetchHTML(url) {
  const response = await axios.get(url, { timeout: 60000 });
  return response.data;
}

// Accessibility audit using axe-core + jsdom
async function runAxe(html, url) {
  const dom = new JSDOM(html, { url });
  const { window } = dom;
  const results = await new Promise((resolve) => {
    axeCore.run(window.document, {}, (err, results) => resolve(results));
  });
  return results;
}

// SEO basic audit
async function runSEO(html, url) {
  const metadata = await metadataParser(url);
  return {
    title: metadata.general.title,
    description: metadata.general.description,
    canonical: metadata.general.canonical,
    robots: metadata.general.robots
  };
}

// Security audit
async function runSecurity(url) {
  try {
    const headers = await getSecurityHeaders(url);
    return headers;
  } catch {
    return { error: "Failed to fetch security headers" };
  }
}

// Performance audit using PageSpeed Insights API
async function runPSI(url) {
  const apiKey = process.env.PSI_API_KEY || ""; // optional
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
    url
  )}&strategy=mobile${apiKey ? `&key=${apiKey}` : ""}`;
  const res = await axios.get(apiUrl);
  return res.data;
}

// Main audit endpoint
app.post("/audit", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  try {
    // Fetch site HTML
    const html = await fetchHTML(url);

    // Run audits
    const [accessibility, seo, security, performance] = await Promise.all([
      runAxe(html, url),
      runSEO(html, url),
      runSecurity(url),
      runPSI(url)
    ]);

    const fullReport = { url, performance, accessibility, seo, security };

    // GPT summarization
    const gptSummary = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a web auditing expert. Summarize all metrics clearly with actionable recommendations."
        },
        { role: "user", content: `Full audit report for ${url}:\n${JSON.stringify(fullReport, null, 2)}` }
      ]
    });

    res.json({ summary: gptSummary.choices[0].message.content, report: fullReport });
  } catch (err) {
    console.error("❌ Audit failed:", err);
    res.status(500).json({ error: "Audit failed", details: err.toString() });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
