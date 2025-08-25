import axios from "axios";
import { JSDOM } from "jsdom";
import axeCore from "axe-core";
import metascraper from "metascraper";
import metascraperTitle from "metascraper-title";
import metascraperDescription from "metascraper-description";
import metascraperUrl from "metascraper-url";
import fetch from "node-fetch";
import { pagespeedonline } from "@googleapis/pagespeedonline";

// Fetch HTML
export async function fetchHTML(url) {
  const res = await axios.get(url, { timeout: 60000 });
  return res.data;
}

// Accessibility audit
export async function runAxe(html, url) {
  const dom = new JSDOM(html, { url });

  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.Element = dom.window.Element;
  global.HTMLElement = dom.window.HTMLElement;

  try {
    const results = await new Promise((resolve, reject) => {
      axeCore.run(dom.window.document, {}, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    return results;
  } finally {
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.Element;
    delete global.HTMLElement;
  }
}

// SEO metadata
export async function runSEO(url, html) {
  try {
    const scraper = metascraper([
      metascraperTitle(),
      metascraperDescription(),
      metascraperUrl(),
    ]);
    return await scraper({ html, url });
  } catch {
    return { error: "Failed to parse SEO metadata" };
  }
}

// PageSpeed Insights
export async function runPSI(url) {
  try {
    const client = pagespeedonline({ version: "v5", auth: process.env.GOOGLE_API_KEY });
    const res = await client.pagespeedapi.runpagespeed({
      url,
      strategy: "mobile",
      fetch: fetch, // explicitly provide node-fetch
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
    console.error("PSI failed for"
