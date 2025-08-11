/* Minimal Shopify Product Quiz (Proxy-style)
 * Quick start:
 * 1) Set env vars in .env (SHOPIFY_SHOP, PUBLIC_URL, optionally STOREFRONT_API_TOKEN)
 * 2) Deploy to Render (Web Service, Node 18+). Build cmd: none. Start cmd: node server.js
 * 3) In Shopify Admin -> Settings -> Apps and sales channels -> Develop apps -> Your app:
 *    - App proxy: Subpath prefix: apps  | Subpath: quiz  | Proxy URL: {PUBLIC_URL}/apps/quiz/proxy
 * 4) Add this tag to theme.liquid (before </body>):
 *    <script src="/apps/quiz/proxy/quiz.js"></script>
 */
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
const SHOP = process.env.SHOPIFY_SHOP || "";
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const SF_TOKEN = process.env.STOREFRONT_API_TOKEN || "";

// Serve static frontend assets
app.use("/apps/quiz/proxy", express.static(path.join(__dirname, "public")));

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// Load quiz config
function loadConfig() {
  const p = path.join(__dirname, "data", "quiz.json");
  const raw = fs.readFileSync(p, "utf-8");
  return JSON.parse(raw);
}

// Return quiz config (used by the frontend)
app.get("/apps/quiz/proxy/config", (_req, res) => {
  try {
    const cfg = loadConfig();
    res.json({ success: true, config: cfg, shop: SHOP });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: "Config error" });
  }
});

// Recommend products from answers
app.post("/apps/quiz/proxy/recommend", async (req, res) => {
  try {
    const { answers } = req.body || {};
    const cfg = loadConfig();

    // Basic scoring: map answers -> product handles (from quiz.json)
    const picks = new Set();
    (answers || []).forEach(({ questionId, value }) => {
      const rule = (cfg.rules || []).find(r => r.questionId === questionId && String(r.value) === String(value));
      if (rule && Array.isArray(rule.recommend)) {
        rule.recommend.forEach(h => picks.add(h));
      }
    });

    const handles = Array.from(picks);
    let products = handles.map(h => ({ handle: h, title: null, image: null, price: null }));

    // Optional: fetch product details via Storefront API if token provided
    if (SF_TOKEN && SHOP) {
      const endpoint = `https://${SHOP}/api/2024-07/graphql.json`;
      products = [];
      for (const handle of handles) {
        const q = `
          query ProductByHandle($handle: String!) {
            productByHandle(handle: $handle) {
              title
              handle
              featuredImage { url altText }
              variants(first:1){ edges{ node{ price { amount currencyCode } } } }
            }
          }
        `;
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Storefront-Access-Token": SF_TOKEN
          },
          body: JSON.stringify({ query: q, variables: { handle } })
        });
        const data = await resp.json();
        const p = data?.data?.productByHandle;
        if (p) {
          products.push({
            handle: p.handle,
            title: p.title,
            image: p.featuredImage?.url || null,
            price: p.variants?.edges?.[0]?.node?.price?.amount || null,
            currency: p.variants?.edges?.[0]?.node?.price?.currencyCode || null
          });
        } else {
          products.push({ handle });
        }
      }
    }

    res.json({ success: true, products });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: "Recommendation failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Quiz Lite running on ${PUBLIC_URL} (port ${PORT})`);
});