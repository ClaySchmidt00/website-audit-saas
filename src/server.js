import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { runAudit } from "./audit.js";

const app = express();
const PORT = process.env.PORT || 10000;

// Resolve __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// API endpoint for audits
app.post("/api/audit", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "Missing URL" });
    }

    const result = await runAudit(url);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
