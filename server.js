import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import OpenAI from "openai";
import { JSDOM } from "jsdom";
import axeCore from "axe-core";
import PDFDocument from "pdfkit";
import { writeFileSync, readFileSync, existsSync } from "fs";
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

// Security headers using axios head
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

// PageSpeed Insights API
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

      // Collect internal links for future crawl
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

// Save audit JSON temporarily
function saveAuditJ
