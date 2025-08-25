// src/audit.js
import fetch from "node-fetch";

export async function runAudit(url) {
  try {
    if (!url) {
      throw new Error("No URL provided to audit.");
    }

    console.log("🔍 Running audit for:", url);

    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
      url
    )}&strategy=mobile&key=${process.env.GOOGLE_API_KEY}`;

    console.log("➡️ Fetching:", apiUrl);

    const response = await fetch(apiUrl);
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `PSI API request failed: ${response.status} ${response.statusText}\n${errText}`
      );
    }

    const data = await response.json();

    return {
      performance: data.lighthouseResult?.categories?.performance?.score ?? null,
      accessibility: data.lighthouseResult?.categories?.accessibility?.score ?? null,
      bestPractices: data.lighthouseResult?.categories?.["best-practices"]?.score ?? null,
      seo: data.lighthouseResult?.categories?.seo?.score ?? null,
      pwa: data.lighthouseResult?.categories?.pwa?.score ?? null,
    };
  } catch (err) {
    console.error("❌ Audit failed:", err.message);
    throw err;
  }
}
