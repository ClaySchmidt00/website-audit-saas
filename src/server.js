import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { fetchHTML, runAxe, runSEO, runPSI } from "./audit.js";

const app = express();
const PORT = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());

// SSE stream for live updates
app.get("/audit-stream", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).end();

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const html = await fetchHTML(url);

    const accessibility = await runAxe(html, url);
    send({ status: "accessibility", data: accessibility });

    const seo = await runSEO(url, html);
    send({ status: "seo", data: seo });

    const psi = await runPSI(url);
    send({ status: "psi", data: psi });

    send({ status: "done" });
    res.end();
  } catch (err) {
    send({ status: "error", error: err.toString() });
    res.end();
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
