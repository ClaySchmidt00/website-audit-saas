import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.PSI_API_KEY;

export async function runAudit(url) {
  try {
    const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
      url
    )}&key=${API_KEY}&strategy=mobile`;

    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`PSI API request failed: ${response.status}`);
    }

    const data = await response.json();

    // Extract useful fields
    const lighthouseResult = data.lighthouseResult || {};
    const categories = lighthouseResult.categories || {};

    return {
      performance: categories.performance?.score ?? null,
      accessibility: categories.accessibility?.score ?? null,
      bestPractices: categories["best-practices"]?.score ?? null,
      seo: categories.seo?.score ?? null,
      url: data.id || url
    };
  } catch (err) {
    console.error("Audit error:", err.message);
    throw err;
  }
}
