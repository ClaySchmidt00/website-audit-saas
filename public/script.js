document.getElementById("auditForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = document.getElementById("urlInput").value;
  const resultsEl = document.getElementById("results");

  resultsEl.textContent = "Running audit...";

  try {
    const response = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });

    const data = await response.json();

    if (data.error) {
      resultsEl.textContent = "Error: " + data.error;
    } else {
      resultsEl.textContent = JSON.stringify(data, null, 2);
    }
  } catch (err) {
    resultsEl.textContent = "Error: " + err.message;
  }
});
