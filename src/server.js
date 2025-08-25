import express from "express";
import bodyParser from "body-parser";
import { crawlPages } from "./audit.js";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());
app.use(express.static("public"));

app.post("/audit", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  try {
    const pages = await crawlPages(url, 3); // limit 3 pages for free tier
    res.json({ site: url, pages });
  } catch (err) {
    console.error("Audit failed:", err);
    res.status(500).json({ error: "Audit failed", details: err.toString() });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
