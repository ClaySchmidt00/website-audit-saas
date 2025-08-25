import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { runFullAudit } from "./audit.js";
import { renderPdf } from "./report.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/audit", async (req, res) => {
  const { url, maxPages = 8, maxDepth = 1 } = req.body || {};
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "Please provide a valid URL starting with http(s)://" });
  }
  try {
    const result = await runFullAudit({ url, maxPages, maxDepth });
    res.json(result);
  } catch (err) {
    console.error("Audit failed:", err);
    res.status(500).json({ error: err.message || "Audit failed" });
  }
});

app.post("/api/report", async (req, res) => {
  try {
    const { url, result } = req.body || {};
    if (!result || !url) return res.status(400).json({ error: "Missing url or result" });

    const pdfBuffer = await renderPdf(url, result);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="audit-report.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("PDF error:", err);
    res.status(500).json({ error: err.message || "Failed to generate PDF" });
  }
});

// Health check (Render pings this)
app.get("/healthz", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
