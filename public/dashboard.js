function renderDashboard(pageData) {
  const dashboard = document.getElementById("dashboard");
  dashboard.innerHTML = `
    <h2>Audit Results for ${pageData.url}</h2>
    <h3>Accessibility</h3>
    <pre>${JSON.stringify(pageData.accessibility, null, 2)}</pre>
    <h3>SEO</h3>
    <pre>${JSON.stringify(pageData.seo, null, 2)}</pre>
    <h3>PageSpeed Insights</h3>
    <pre>${JSON.stringify(pageData.psi, null, 2)}</pre>
    <hr/>
  `;
}

function runAudit() {
  const url = document.getElementById("url").value;
  if (!url) return alert("Enter a URL");

  const progress = document.getElementById("progress");
  const dashboard = document.getElementById("dashboard");
  dashboard.innerHTML = "";
  progress.innerText = "Starting audit...";

  const evtSource = new EventSource(`/audit-stream?url=${encodeURIComponent(url)}`);
  evtSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.status === "accessibility") progress.innerText = "Accessibility done";
    else if (data.status === "seo") progress.innerText = "SEO done";
    else if (data.status === "psi") progress.innerText = "PageSpeed Insights done";
    else if (data.status === "done") {
      progress.innerText = "Audit completed!";
      renderDashboard({ url, accessibility: data.accessibility, seo: data.seo, psi: data.psi });
      evtSource.close();
    } else if (data.status === "error") {
      progress.innerText = `Error: ${data.error}`;
      evtSource.close();
    }
  };
}
