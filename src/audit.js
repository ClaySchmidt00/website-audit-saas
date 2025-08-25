import axios from "axios";
import { JSDOM } from "jsdom";
import axeCore from "axe-core";
import metascraper from "metascraper";
import metascraperTitle from "metascraper-title";
import metascraperDescription from "metascraper-description";
import metascraperUrl from "metascraper-url";
import fetch from "node-fetch";
import { pagespeedonline } from "@googleapis/pagespeedonline";

// Fetch HTML of a page
export async function fetchHTML(url) {
  const res = await axios.get(url, { timeout: 60000 });
  return res.data;
}

// Accessibility audit
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
    })
