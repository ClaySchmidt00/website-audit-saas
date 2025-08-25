import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import OpenAI from "openai";
import { JSDOM } from "jsdom";
import axeCore from "axe-core";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import URL from "url-parse";
import metascraper from "metascraper";
import metascraperTitle from "metascraper-title";
import metascraperDescription from "metascraper-description";
import metascraperUrl from "metascraper-url";

const app = express();
const PORT = process.env.PORT || 3000;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(bodyParser.json());
app.use(express.static("public"));

// --- Helper functions ---

async function fetchHTML(url) {
  const res = await axios.get(url, { timeout: 60000 });
  return res.data;
}

async function runAxe(html, url) {
  const dom = new JSDOM(html, { url });
  const { window } = dom;

  // Set globals for axe-core
  global.window = window;
  global.document = window.document;
  global.Node = window.Node;
  global.Element = window.Element;
  global.HTMLElement = window.HTMLElement;

  const results = await new Promise((resolve) => {
    axeCore.run(window.document, {}, (err, results) => resolve(results));
  });

  // Clean up globals
  delete global.window;
  delete global.document;
  delete global.Node;
  delete global.Element;
  delete global.HTMLElement;

  return results;
}

async function runSEO(url, html) {
  try {
    const scraper = metascraper([
      metascraperTitle(),
      metascraperDescription(),
      metascraperUrl()
    ]);
    const meta = await scraper({ html, url });
    return {
      title: meta.title || "",
      description: meta.description || "",
      url: meta.url || url
    };
  } catch {
    return { error: "Failed to parse SEO metadata" };
  }
}

async function runSecurity(url) {
  try {
    const res = await axios.head(url, { timeout: 10000 });
    return {
      'content-security-policy': res.headers['content-security-policy'] || null,
      'x-frame-options': res.headers['x-frame-options'] || null,
      'strict-transport-security': res.headers['strict-transport-security'] || null,
      'x-content-type-options': res.headers['x-content-type-options'] || null
    };
  } catch {
    return { error: "Failed to fetch security headers" };
  }
}

async function runPSI(url) {
  const apiKey = process.env.PSI_API_KEY || "";
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
    url
  )}&strategy=mobile${apiKey ? `&key=${apiKey}` : ""}`;
  const res = await axios.get(apiUrl);
  return res.data;
}

// Crawl internal pages sequentially
async function crawlPagesSequential(rootUrl, maxPages = 3) {
  const visited = new Set();
  const queue = [rootUrl];
  const results = [];

  while (queue.length && visited.size < maxPages) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      const html = await fetchHTML(url);
      const [accessibility, seo, security, performance] = await Promise.all([
        runAxe(html, url),
        runSEO(url, html),
        runSecurity(url),
        runPSI(url)
      ]);

      results.push({ url, accessibility, seo, security, performance });

      // Collect internal links
      const dom = new JSDOM(html, { url });
      const anchors = [...dom.window.document.querySelectorAll("a[href]")];
      anchors.forEach(a => {
        const link = new URL(a.href, url);
        if (link.hostname === new URL(rootUrl).hostname && !visited.has(link.href)) {
          queue.push(link.href);
        }
      });
    } catch (err) {
      console.error(`❌ Error processing ${url}:`, err.toString());
    }
  }

  return results;
}

// Save/load JSON
function saveAuditJSON(site, data) {
  const tmpDir = path.join("tmp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
  const filePath = path.join(tmpDir, `audit_${site.replace(/[^a-z0-9]/gi, "_")}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

function loadAuditJSON(site) {
  const filePath = path.join("tmp", `audit_${site.replace(/[^a-z0-9]/gi, "_")}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath));
}

// Generate PDF
function generatePDF(auditData, gptSummary, outputPath = "public/audit_report.pdf") {
  const doc = new PDFDocument();
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  doc.fontSize(18).text("Website Audit Report", { align: "center", underline: true });
  doc.moveDown();
  doc.fontSize(14).text("GPT Executive Summary:");
  doc.text(gptSummary);
  doc.moveDown();

  auditData.forEach(page => {
    doc.addPage();
    doc.fontSize(12).text(`Page: ${page.url}`, { underline: true });
    doc.text("SEO:");
    doc.text(JSON.stringify(page.seo, null, 2));
    doc.moveDown();
    doc.text("Accessibility Issues:");
    doc.text(JSON.stringify(page.accessibility, null, 2));
    doc.moveDown();
    doc.text("Security Headers:");
    doc.text(JSON.stringify(page.security, null, 2));
    doc.moveDown();
    doc.text("Performance:");
    doc.text(JSON.stringify(page.performance, null, 2));
  });

  doc.end();
  return new Promise(resolve => stream.on("finish", resolve));
}

// --- Routes ---

// Phase 1: Audit JSON
app.post("/audit", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  try {
    const pages = await crawlPagesSequential(url, 3);
    const fullReport = { site: url, pages };
    const jsonPath = saveAuditJSON(url, fullReport);
    res.json({ message: "Audit complete", report: fullReport, jsonPath });
  } catch (err) {
    console.error("❌ Audit failed:", err);
    res.status(500).json({ error: "Audit failed", details: err.toString() });
  }
});

// Phase 2: GPT summary + PDF
app.post("/generate-pdf", async (req, res) => {
  const { site } = req.body;
  if (!site) return res.status(400).json({ error: "Missing site identifier" });

  const auditData = loadAuditJSON(site);
  if (!auditData) return res.status(404).json({ error: "Audit JSON not found" });

  try {
    const gptResp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a web audit expert. Summarize and provide actionable insights." },
        { role: "user", content: JSON.stringify(auditData, null, 2) }
      ]
    });
    const gptSummary = gptResp.choices[0].message.content;

    await generatePDF(auditData.pages, gptSummary);

    res.json({ message: "PDF generated", pdf: "/audit_report.pdf", summary: gptSummary });
  } catch (err) {
    console.error("❌ PDF generation failed:", err);
    res.status(500).json({ error: "PDF generation failed", details: err.toString() });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
