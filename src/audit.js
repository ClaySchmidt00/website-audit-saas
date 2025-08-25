import axios from "axios";
import { JSDOM } from "jsdom";
import axeCore from "axe-core";
import metascraper from "metascraper";
import metascraperTitle from "metascraper-title";
import metascraperDescription from "metascraper-description";
import metascraperUrl from "metascraper-url";
import fetch from "node-fetch";
import { pagespeedonline } from "@googleapis/pagespeedonline";

// ---------------------------
// Fetch HTML
// ---------------------------
export async function fetchHTML(url) {
  const res = await axios.get(url, { timeout: 60000 });
  if (!res.data || !res.data.trim()) {
    throw new Error(`Empty HTML returned from ${url}`);
  }
  return res.data;
}

// ---------------------------
// Accessibility Audit (axe-core + JSDOM)
// ---------------------------
export async function runAxe(html, url) {
  if (!html || !html.trim()) throw new Error("Empty HTML cannot be audited");

  const dom = new JSDOM(html, { url });

  // Set globals for axe-core
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  global.Node = window.Node;
  global.Element = window.Element;
  global.HTMLElement = window.HTMLElement;

  try {
    // Run axe on the explicit document
    const results = await new Promise((resolve, reject) => {
      axeCore.run(window.document, {}, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });
    return results;
  } finally {
    // Clean up globals
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.Element;
    delete global.HTMLElement;
  }
}

// ---------------------------
// SEO Metadata
// ---------------------------
export async function runSEO(url, html) {
  try {
    const scraper = metascraper([
      metascraperTitle(),
      metascraperDescription(),
      metascraperUrl(),
    ]);
    return await scraper({ html, url });
  } catch (err) {
    return { error: "Failed to parse SEO metadata" };
  }
}

// ---------------------------
// PageSpeed Insights
// ---------------------------
export async function runPSI(url) {
  try {
    const client = pagespeedonline({ version: "v5", auth: process.env.GOOGLE_API_KEY });
    const res = await client.pagespeedapi.runpagespeed({
      url,
      strategy: "mobile",
      fetch: fetch,
    });

    const lhr = res.data.lighthouseResult;
    return {
      performance: lhr.categories.performance.score * 100,
      accessibility: lhr.categories.accessibility.score * 100,
      seo: lhr.categories.seo.score * 100,
      bestPractices: lhr.categories["best-practices"].score * 100,
      pwa: lhr.categories.pwa.score * 100,
    };
  } catch (err) {
    console.error("PSI failed for", url, err.toString());
    return { error: "PSI failed" };
  }
}
