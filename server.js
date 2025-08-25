import express from "express";
import bodyParser from "body-parser";
import { exec } from "child_process";
import puppeteer from "puppeteer";
import OpenAI from "openai";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Middleware
app.use(bodyParser.json());
app.use(express.static("public"));

// Debug route for env variable
app.get("/debug-env", (req, res) => {
  if (process.env.OPENAI_API_KEY) {
    res.send("✅ OPENAI_API_KEY is set!");
  } else {
    res.send("❌ OPENAI_API_KEY is NOT set.");
  }
});

// Route: Run Audit
app.post("/audit", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "Missing URL" });
    }

    // ✅ Launch Puppeteer safely for Render
    const browser = await puppeteer.launch({
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-gpu"
      ],
      headless: "new"
    });

    const { lhr } = await new Promise((resolve, reject) => {
      exec(
        `npx lighthouse ${url} --quiet --chrome-flags="--headless --no-sandbox --disable-gpu" --output=json --output-path=stdout`,
        { maxBuffer: 1024 * 1024 * 10 },
        (error, stdout, stderr) => {
          if (error) {
            reject(stderr || error);
          } else {
            try {
              resolve(JSON.parse(stdout));
            } catch (parseErr) {
              reject(parseErr);
            }
          }
        }
      );
    });

    await browser.close();

    // ✅ Ask GPT to summarize results
    const auditSummary = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert web auditor. Summarize results clearly for business owners."
        },
        {
          role: "user",
          content: `Summarize this Lighthouse report for ${url}:\n${JSON.stringify(lhr, null, 2)}`
        }
      ]
    });

    res.json({
      summary: auditSummary.choices[0].message.content,
      rawReport: lhr
    });

  } catch (err) {
    console.error("❌ Error during audit:", err);
    res.status(500).json({ error: "Audit failed", details: err.toString() });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
