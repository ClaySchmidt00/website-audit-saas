// src/server.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import { runAudit } from "./audit.js"; // ✅ make sure audit.js export is used

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// API route to run an audit
app.post("/api/audit", async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "Missing URL parameter" });
  }

  try {
    console.log(`Running audit for: ${url}`);
    const results = await runAudit(url); // ✅ uses fixed audit.js
    res.json(results);
  } catch (error) {
    console.error("Audit failed:", error);
    res.status(500).json({ error: error.message || "Audit failed" });
  }
});

// Fallback to frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
