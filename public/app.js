const form = document.getElementById("audit-form");
const siteInput = document.getElementById("site-url");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const gptEl = document.getElementById("gpt");
const pagesEl = document.getElementById("pages");
const actionsEl = document.getElementById("actions");
const downloadBtn = document.getElementById("download-pdf");

let lastResult = null;
let lastUrl = null;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = siteInput.value.trim();
  if (!url) return;

  summaryEl.classList.add("hidden");
  gptEl.classList.add("hidden");
  pagesEl.classList.add("hidden");
  actionsEl.classList.add("hidden");
  statusEl.textContent = "Running audit… (this can take 30–90 seconds on free hosting)";

  try {
    const res = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Audit failed");

    lastResult = data;
    lastUrl = url;
    statusEl.textContent = "";

    // Summary
    summaryEl.innerHTML = `
      <h2>Summary</h2>
      <p><strong>Site:</strong> ${data.site}</p>
      <p><strong>Pages scanned:</strong> ${data.crawledPages}</p>
      <div class="badges">
        <span class="badge">Perf: ${data.summary.averages.performance}</span>
        <span class="badge">A11y: ${data.summary.averages.accessibility}</span>
        <span class="badge">SEO: ${data.summary.averages.seo}</span>
        <span class="badge">Best Prac: ${data.summary.averages.bestPractices}</span>
        <span class="badge">Violations: ${data.summary.totals.a11yViolations}</span>
      </div>
    `;
    summaryEl.classList.remove("hidden");

    // GPT
    gptEl.innerHTML = `<h2>GPT Recommendations</h2><pre>${escapeHtml(data.gptSummary)}</pre>`;
    gptEl.classList.remove("hidden");

    // Pages table
    pagesEl.innerHTML = `
      <h2>Pages</h2>
      <table>
        <thead>
          <tr>
            <th>URL</th>
            <th>Perf</th>
            <th>A11y</th>
            <th>SEO</th>
            <th>Best</th>
            <th>Axe Violations</th>
          </tr>
        </thead>
        <tbody>
          ${data.pages.map(p => `
            <tr>
              <td><a href="${p.url}" target="_blank" rel="noreferrer">${p.url}</a></td>
              <td>${p.lighthouse.categories.performance}</td>
              <td>${p.lighthouse.categories.accessibility}</td>
              <td>${p.lighthouse.categories.seo}</td>
              <td>${p.lighthouse.categories.bestPractices}</td>
              <td>${p.axe.length}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
    pagesEl.classList.remove("hidden");
    actionsEl.classList.remove("hidden");
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  }
});

downloadBtn.addEventListener("click", async () => {
  if (!lastResult || !lastUrl) return;
  const res = await fetch("/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: lastUrl, result: lastResult })
  });
  if (!res.ok) {
    alert("Failed to generate PDF.");
    return;
  }
  const blob = await res.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "audit-report.pdf";
  link.click();
  URL.revokeObjectURL(link.href);
});

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
