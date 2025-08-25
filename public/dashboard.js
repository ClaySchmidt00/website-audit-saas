async function runAudit() {
  const url = document.getElementById("url").value;
  if (!url) return alert("Enter a URL");

  const progress = document.getElementById("progress");
  const dashboard = document.getElementById("dashboard");
  progress.innerText = "Status: Running audit...";
  dashboard.innerHTML = "";

  try {
    const res = await fetch("/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (data.error) {
      progress.innerText = "Error: " + data.error;
      return;
    }

    progress.innerText = "Status: Audit complete";
    renderDashboard(data.pages);
  } catch (err) {
    progress.innerText = "Audit request failed: " + err;
  }
}

function renderDashboard(pages) {
  const container = document.getElementById("dashboard");
  pages.forEach((page) => {
    const card = document.createElement("div");
    card.className = "card";

    const violations = page.accessibility.violations || [];
    const highCount = violations.filter(v => v.impact === "critical" || v.impact === "serious").length;
    const mediumCount = violations.filter(v => v.impact === "moderate").length;
    const lowCount = violations.filter(v => v.impact === "minor").length;

    card.innerHTML = `
      <h2>${page.url}</h2>
      <h3>SEO:</h3>
      <p>Title: ${page.seo.title || "N/A"}<br>
      Description: ${page.seo.description || "N/A"}</p>

      <h3>Accessibility:</h3>
      <p class="issue-high">High: ${highCount}</p>
      <p class="issue-medium">Medium: ${mediumCount}</p>
      <p class="issue-low">Low: ${lowCount}</p>
    `;

    container.appendChild(card);
  });
}
