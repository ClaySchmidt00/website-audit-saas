import fs from "fs-extra";
import puppeteer from "puppeteer";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import AxePuppeteer from "@axe-core/puppeteer";
import OpenAI from "openai";
import { URL } from "url";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// --- Crawl (depth-limited, internal pages only) ---
async function crawl({ startUrl, maxDepth = 1, maxPages = 8 }) {
  const visited = new Set();
  const queue = [{ url: startUrl, depth: 0 }];
  const origin = new URL(startUrl).origin;
  const collected = [];

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();

  try {
    while (queue.length && collected.length < maxPages) {
      const { url, depth } = queue.shift();
      if (visited.has(url) || depth > maxDepth) continue;
      visited.add(url);

      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
        collected.push(url);

        // collect links
        const links = await page.$$eval("a[href]", as =>
          as.map(a => a.href).filter(Boolean)
        );

        for (const link of links) {
          try {
            const u = new URL(link);
            if (u.origin === origin && !visited.has(u.href)) {
              queue.push({ url: u.href.split("#")[0], depth: depth + 1 });
            }
          } catch {
            // ignore bad/relative without base
          }
        }
      } catch (err) {
        console.warn("Crawl visit failed:", url, err.message);
      }
    }
  } finally {
    await browser.close();
  }

  return collected.slice(0, maxPages);
}

// --- Lighthouse using Puppeteer's Chromium binary ---
async function runLighthouse(url) {
  const chrome = await chromeLauncher.launch({
    chromePath: puppeteer.executablePath(), // use Puppeteer's Chromium
    chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"]
  });

  try {
    const runnerResult = await lighthouse(url, {
      port: chrome.port,
      output: "json",
      logLevel: "error"
    });

    const lhr = runnerResult.lhr;
    return {
      categories: {
        performance: Math.round((lhr.categories.performance?.score ?? 0) * 100),
        accessibility: Math.round((lhr.categories.accessibility?.score ?? 0) * 100),
        seo: Math.round((lhr.categories.seo?.score ?? 0) * 100),
        bestPractices: Math.round((lhr.categories["best-practices"]?.score ?? 0) * 100)
      },
      metrics: {
        FCP: lhr.audits["first-contentful-paint"]?.numericValue ?? null,
        LCP: lhr.audits["largest-contentful-paint"]?.numericValue ?? null,
        CLS: lhr.audits["cumulative-layout-shift"]?.numericValue ?? null,
        TBT: lhr.audits["total-blocking-time"]?.numericValue ?? null,
        INP: lhr.audits["interaction-to-next-paint"]?.numericValue ?? null
      }
    };
  } finally {
    await chrome.kill();
  }
}

// --- axe-core (a11y violations) ---
async function runAxe(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    const results = await new AxePuppeteer(page).analyze();
    return results.violations.map(v => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes?.slice(0, 3)?.map(n => ({
        html: n.html?.slice(0, 300),
        target: n.target
      })) || []
    }));
  } catch (e) {
    return [{ id: "axe_error", impact: "unknown", description: e.message }];
  } finally {
    await browser.close();
  }
}

// --- Aggregate simple averages ---
function aggregate(pages) {
  const n = pages.length || 1;
  const avg = (arr) => Math.round(arr.reduce((a, b) => a + (b || 0), 0) / n);

  return {
    averages: {
      performance: avg(pages.map(p => p.lighthouse.categories.performance)),
      accessibility: avg(pages.map(p => p.lighthouse.categories.accessibility)),
      seo: avg(pages.map(p => p.lighthouse.categories.seo)),
      bestPractices: avg(pages.map(p => p.lighthouse.categories.bestPractices))
    },
    totals: {
      a11yViolations: pages.reduce((sum, p) => sum + (p.axe.length || 0), 0)
    }
  };
}

// --- GPT summary ---
async function summarizeWithGPT({ siteUrl, pages, summary }) {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const prompt = `
You're an expert web auditor.
Provide a concise, prioritized report for the site: ${siteUrl}

Averages: ${JSON.stringify(summary.averages)}
Totals: ${JSON.stringify(summary.totals)}

Page details:
${pages.map(p => `- ${p.url}
  Lighthouse: ${JSON.stringify(p.lighthouse.categories)}
  Key metrics (ms): ${JSON.stringify(p.lighthouse.metrics)}
  Axe violations: ${p.axe.length}`).join("\n")}

Write:
1) Executive summary (bulleted)
2) Top 10 fixes (impact & effort)
3) Accessibility quick wins (with WCAG refs)
4) Performance actions tied to Core Web Vitals (LCP, CLS, TBT/INP)
5) Page-specific notes if something stands out
Keep it actionable and brief.
`;

  const r = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: "You write crisp, technical web audits." },
      { role: "user", content: prompt }
    ]
  });

  return r.choices[0].message.content;
}

// --- Main pipeline ---
export async function runFullAudit({ url, maxPages = 8, maxDepth = 1 }) {
  const pages = await crawl({ startUrl: url, maxDepth, maxPages });

  const results = [];
  for (const p of pages) {
    const [lh, axe] = await Promise.all([runLighthouse(p), runAxe(p)]);
    results.push({ url: p, lighthouse: lh, axe });
  }

  const summary = aggregate(results);
  const gpt = await summarizeWithGPT({ siteUrl: url, pages: results, summary });

  return {
    site: url,
    crawledPages: pages.length,
    summary,
    pages: results,
    gptSummary: gpt
  };
}
