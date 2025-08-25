import puppeteer from "puppeteer";
import { marked } from "marked";

export async function renderPdf(siteUrl, result) {
  const md = `# Website Audit Report

**Site:** ${siteUrl}  
**Pages scanned:** ${result.crawledPages}

## Averages
- Performance: **${result.summary.averages.performance}**
- Accessibility: **${result.summary.averages.accessibility}**
- SEO: **${result.summary.averages.seo}**
- Best Practices: **${result.summary.averages.bestPractices}**

## Totals
- Accessibility Violations: **${result.summary.totals.a11yViolations}**

---

## GPT Summary
${result.gptSummary}

---

## Page Details
${result.pages.map(p => `
### ${p.url}
**Lighthouse**  
- Performance: ${p.lighthouse.categories.performance}  
- Accessibility: ${p.lighthouse.categories.accessibility}  
- SEO: ${p.lighthouse.categories.seo}  
- Best Practices: ${p.lighthouse.categories.bestPractices}  

**Core Web Vitals (ms)**  
- FCP: ${Math.round(p.lighthouse.metrics.FCP || 0)}  
- LCP: ${Math.round(p.lighthouse.metrics.LCP || 0)}  
- TBT: ${Math.round(p.lighthouse.metrics.TBT || 0)}  
- INP: ${Math.round(p.lighthouse.metrics.INP || 0)}  
- CLS: ${p.lighthouse.metrics.CLS || 0}

**Top 5 Axe Violations**  
${p.axe.slice(0,5).map(v => `- [${v.impact}] ${v.id} — ${v.description} (${v.helpUrl})`).join("\n")}
`).join("\n")}
`;

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; line-height: 1.5; padding: 24px; }
    h1,h2,h3 { margin: 0.6em 0 0.3em; }
    code, pre { background: #f6f8fa; padding: 2px 4px; border-radius: 4px; }
    a { color: #0366d6; text-decoration: none; }
    hr { border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0; }
    ul { margin: 0.3em 0 1em 1.2em; }
  </style>
</head>
<body>${marked(md)}</body>
</html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  await browser.close();
  return pdf;
}
