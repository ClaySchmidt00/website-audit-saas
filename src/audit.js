import axios from "axios";
import { JSDOM } from "jsdom";
import axeCore from "axe-core";
import metascraper from "metascraper";
import metascraperTitle from "metascraper-title";
import metascraperDescription from "metascraper-description";
import metascraperUrl from "metascraper-url";

export async function fetchHTML(url) {
  const res = await axios.get(url, { timeout: 60000 });
  return res.data;
}

export async function runAxe(html, url) {
  const dom = new JSDOM(html, { url });
  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.Element = dom.window.Element;
  global.HTMLElement = dom.window.HTMLElement;

  const results = await new Promise((resolve) => {
    axeCore.run(dom.window.document, {}, (err, results) => resolve(results));
  });

  delete global.window;
  delete global.document;
  delete global.Node;
  delete global.Element;
  delete global.HTMLElement;

  return results;
}

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
      const [accessibility, seo] = await Promise.all([
        runAxe(html, url),
        runSEO(url, html),
      ]);
      results.push({ url, accessibility, seo });

      const dom = new JSDOM(html, { url });
      const anchors = [...dom.window.document.querySelectorAll("a[href]")];
      anchors.forEach((a) => {
        const link = new URL(a.href, url);
        if (link.hostname === new URL(rootUrl).hostname && !visited.has(link.href)) {
          queue.push(link.href);
        }
      });
    } catch (err) {
      console.error(`Error processing ${url}:`, err.toString());
    }
  }

  return results;
}
