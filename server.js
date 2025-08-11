/* Shop Quiz Lite — Express server
 * Works with Shopify App Proxy using either:
 *   A) Proxy URL: https://<render>/apps/quiz         (no "/proxy")
 *      Theme: <script src="/apps/quiz/quiz.js"></script>
 *      JS fetch: /apps/quiz/config  and  /apps/quiz/recommend
 *
 *   B) Proxy URL: https://<render>/apps/quiz/proxy   (with "/proxy")
 *      Theme: <script src="/apps/quiz/proxy/quiz.js"></script>
 *      JS fetch: /apps/quiz/proxy/config  and  /apps/quiz/proxy/recommend
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

// -------- Helpers --------
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const quizJsonPath = path.join(dataDir, "quiz.json");

function loadConfig() {
  const raw = fs.readFileSync(quizJsonPath, "utf-8");
  return JSON.parse(raw);
}

async function buildProductsFromHandles(handles) {
  // If no Storefront token, just return handles (links will still work)
  if (!SF_TOKEN || !SHOP) {
    return handles.map(h => ({ handle: h, title: null, image: null, price: null, currency: null }));
  }

  const endpoint = `https://${SHOP}/api/2024-07/graphql.json`;
  const out = [];

  for (const handle of handles) {
    const query = `
      query ProductByHandle($handle: String!) {
        productByHandle(handle: $handle) {
          title
          handle
          featuredImage { url altText }
          variants(first:1) { edges { node { price { amount currencyCode } } } }
        }
      }
    `;
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": SF_TOKEN,
        },
        body: JSON.stringify({ query, variables: { handle } }),
      });
      const data = await resp.json();
      const p = data?.data?.productByHandle;
      if (p) {
        out.push({
          handle: p.handle,
          title: p.title,
          image: p.featuredImage?.url || null,
          price: p.variants?.edges?.[0]?.node?.price?.amount || null,
          currency: p.variants?.edges?.[0]?.node?.price?.currencyCode || null,
        });
      } else {
        out.push({ handle, title: null, image: null, price: null, currency: null });
      }
    } catch (e) {
      console.error("Storefront fetch error for", handle, e);
      out.push({ handle, title: null, image: null, price: null, currency: null });
    }
  }

  return out;
}

function makeRecommendHandler(basePath = "/apps/quiz") {
  return async (req, res) => {
    try {
      const { answers } = req.body || {};
      const cfg = loadConfig();

      // Map answers -> product handles using simple rules in data/quiz.json
      const picks = new Set();
      (answers || []).forEach(({ questionId, value }) => {
        const rule = (cfg.rules || []).find(
          r => r.questionId === questionId && String(r.value) === String(value)
        );
        if (rule && Array.isArray(rule.recommend)) {
          rule.recommend.forEach(h => picks.add(h));
        }
      });

      const handles = Array.from(picks);
      const products = await buildProductsFromHandles(handles);

      res.json({ success: true, products });
    } catch (e) {
      console.error("Recommendation failed:", e);
      res.status(500).json({ success: false, error: "Recommendation failed" });
    }
  };
}

function makeConfigHandler() {
  return (_req, res) => {
    try {
      const cfg = loadConfig();
      res.json({ success: true, config: cfg, shop: SHOP });
    } catch (e) {
      console.error("Config error:", e);
      res.status(500).json({ success: false, error: "Config error" });
    }
  };
}

// -------- Health & Home --------
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/", (_req, res) => {
  res.send(
    `<div style="font-family:system-ui;padding:24px">
      <h2>Shop Quiz Lite</h2>
      <p>Server running at <code>${PUBLIC_URL}</code></p>
      <ul>
        <li>Health: <a href="/health">/health</a></li>
        <li>Static (no proxy): <a href="/apps/quiz/quiz.js">/apps/quiz/quiz.js</a></li>
        <li>Config (no proxy): <a href="/apps/quiz/config">/apps/quiz/config</a></li>
      </ul>
      <p>If using App Proxy with <code>/proxy</code>, the legacy paths also work.</p>
    </div>`
  );
});

// -------- No-proxy routes (recommended) --------
app.use("/apps/quiz", express.static(publicDir));
app.get("/apps/quiz/config", makeConfigHandler());
app.post("/apps/quiz/recommend", makeRecommendHandler("/apps/quiz"));

// -------- Legacy /proxy routes (kept for compatibility) --------
app.use("/apps/quiz/proxy", express.static(publicDir));
app.get("/apps/quiz/proxy/config", makeConfigHandler());
app.post("/apps/quiz/proxy/recommend", makeRecommendHandler("/apps/quiz/proxy"));

// -------- Start --------
app.listen(PORT, () => {
  console.log(`Quiz Lite running on ${PUBLIC_URL} (port ${PORT})`);
});
