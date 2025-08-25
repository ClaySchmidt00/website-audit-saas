import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import OpenAI from "openai";
import { JSDOM } from "jsdom";
import axeCore from "axe-core";
import { getSecurityHeaders } from "securityheaders";
import PDFDocument from "pdfkit";
import { writeFileSync } from "fs";
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

// Fetch HTML
async function fetchHTML(url) {
  const res = await axios.get(url, { timeout: 60000 });
  return res.data;
}

// Axe-core accessibility
async function runAxe(html, url) {
  const dom = new JSDOM(html, { url });
  const { window } = dom;
  const results = await new Promise((resolve) => {
    axeCore.run(window.document, {}, (err, results) => resolve(results));
  });
  return results;
}

// SEO using metascraper
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

// Security headers
async function runSecurity(url) {
  try {
    const res = await axios.head(url, { timeout: 10000 });
    return {
      'content-security-policy': res.headers['content-security-policy'] || null,
      'x-frame-options': res.headers['x-frame-options'] || null,
      'strict-transport-security': res.headers['strict-transport-security'] || null,
      'x-content-type-options': res.headers['x-content-type-options'] || null
    };
  } catch (err) {
    return { error: "Failed to fetch security headers" };
  }
}


// PageSpeed Insights API
async function runPSI(url) {
  const apiKey = process.env.PSI_API_KEY || "";
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
    url
  )}&strategy=mobile${apiKey ? `&key=${apiKey}` : ""}`;
  const res = await axios.get(apiUrl);
  return res.data;
}

// Crawl internal pages
async function crawlPages(rootUrl, maxPages = 10) {
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

      // Find internal links
      const dom = new JSDOM(html, { url });
      const anchors = [...dom.window.document.querySelectorAll("a[href]")];
      anchors.forEach(a => {
        const link = new URL(a.href, url);
        if (link.hostname === new URL(rootUrl).hostname && !visited.has(link.href)) {
          queue.push(link.href);
        }
      });

    } catch (err) {
      console.error(`❌ Error crawling ${url}:`, err.toString());
    }
  }

  return results;
}

// Generate PDF report
function generatePDF(auditData, gptSummary, outputPath = "public/audit_report.pdf") {
  const doc = new PDFDocument();
  doc.pipe(writeFileSync(outputPath, ""));
  doc.text("Complete Website Audit Report", { align: "center", underline: true });
  doc.moveDown();
  doc.text("GPT Executive Summary:", { bold: true });
  doc.text(gptSummary);
  doc.moveDown();

  auditData.forEach(page => {
    doc.addPage();
    doc.text(`Page: ${page.url}`, { underline: true });
    doc.text("SEO:", { bold: true });
    doc.text(JSON.stringify(page.seo, null, 2));
    doc.moveDown();
    doc.text("Accessibility Issues:", { bold: true });
    doc.text(JSON.stringify(page.accessibility, null, 2));
    doc.moveDown();
    doc.text("Security Headers:", { bold: true });
    doc.text(JSON.stringify(page.security, null, 2));
    doc.moveDown();
    doc.text("Performance:", { bold: true });
    doc.text(JSON.stringify(page.performance, null, 2));
  });

  doc.end();
}

// Audit endpoint
app.post("/audit", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  try {
    const pages = await crawlPages(url, 10); // max 10 pages
    const fullReport = { site: url, pages };

    const gptSummaryResp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a web auditing expert. Provide clear actionable insights from this report."
        },
        { role: "user", content: JSON.stringify(fullReport, null, 2) }
      ]
    });

    const gptSummary = gptSummaryResp.choices[0].message.content;

    generatePDF(pages, gptSummary, "public/audit_report.pdf");

    res.json({ summary: gptSummary, report: fullReport, pdf: "/audit_report.pdf" });

  } catch (err) {
    console.error("❌ Full audit failed:", err);
    res.status(500).json({ error: "Full audit failed", details: err.toString() });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
