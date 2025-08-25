import express from "express";
import bodyParser from "body-parser";
import puppeteer from "puppeteer";
import OpenAI from "openai";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static("public"));

// OpenAI setup
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Debug route to check environment variable
app.get("/debug-env", (_req, res) => {
  if (process.env.OPENAI_API_KEY) {
    res.send("✅ OPENAI_API_KEY is set!");
  } else {
    res.send("❌ OPENAI_API_KEY is NOT set.");
  }
});

// Audit endpoint
app.post("/audit", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  try {
    // Launch Puppeteer with Render-safe flags
    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-gpu"
      ]
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // Run Lighthouse via Puppeteer Chromium
    const { exec } = await import("node:child_process");
    const lhr = await new Promise((resolve, reject) => {
      exec(
        `npx lighthouse ${url} --quiet --chrome-flags="--headless --no-sandbox --disable-gpu" --output=json --output-path=stdout`,
        { maxBuffer: 1024 * 1024 * 10 },
        (error, stdout) => {
          if (error) reject(error);
          else resolve(JSON.parse(stdout));
        }
      );
    });

    await browser.close();

    // Ask GPT to summarize Lighthouse
    const gptSummary = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an expert web auditor. Provide a concise, actionable summary." },
        { role: "user", content: `Summarize this Lighthouse report for ${url}:\n${JSON.stringify(lhr, null, 2)}` }
      ]
    });

    res.json({ summary: gptSummary.choices[0].message.content, report: lhr });
  } catch (err) {
    console.error("❌ Error during audit:", err);
    res.status(500).json({ error: "Audit failed", details: err.toString() });
  }
});

// Start server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
