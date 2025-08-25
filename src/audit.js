import axios from "axios";
import { JSDOM } from "jsdom";
import axeCore from "axe-core";
import metascraper from "metascraper";
import metascraperTitle from "metascraper-title";
import metascraperDescription from "metascraper-description";
import metascraperUrl from "metascraper-url";
import fetch from "node-fetch";
import { pagespeedonline } from "@googleapis/pagespeedonline";

// ---------- Fetch HTML ----------
export async function fetchHTML(url) {
  const res = await axios.get(url, { timeout: 60000 });
  return res.data;
}

// ---------- Accessibility using axe-core ----------
export async function runAxe(html, url) {
  const dom = new JSDOM(html, { url });

  // Set globals for axe-core
  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.Element = dom.window.Element;
  global.HTMLElement = dom.window.HTMLElement;

  const results = await new Promise((resolve, reject) => {
    axeCore.run(dom.window.document, {}, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

  // Clean up globals
  delete global.window;
  delete global.document;
  delete global.Node;
  delete global.Element;
  delete global.HTMLElement;

  return results;
}

// ---------- SEO metadata ----------
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

// ---------- PageSpeed Insights ----------
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
    console.error("PSI failed for", url, err.toString());
    return { error: "PSI failed" };
  }
}

// ---------- Crawl pages sequentially ----------
export async function crawlPages(rootUrl, maxPages = 3) {
  const visited = new Set();
  const queue = [rootUrl];
  const results = [];

  while (queue.length && visited.size < maxPages) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      const html = await fetchHTML(url);

      const [accessibility, seo, psi] = await Promise.all([
        runAxe(html, url),
        runSEO(url, html),
        runPSI(url),
      ]);

      results.push({ url, accessibility, seo, psi });

      // Find internal links
      const dom = new JSDOM(html, { url });
      const anchors = [...dom.window.document.querySelectorAll("a[href]")];
      anchors.forEach((a) => {
        try {
          const link = new URL(a.href, url);
          if (link.hostname === new URL(rootUrl).hostname && !visited.has(link.href)) {
            queue.push(link.href);
          }
        } catch {}
      });
    } catch (err) {
      console.error(`Error processing ${url}:`, err.toString());
    }
  }

  return results;
}
