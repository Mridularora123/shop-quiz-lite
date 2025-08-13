/* Shop Quiz Lite — Express server (with dynamic admin panel)
 * Works with Shopify App Proxy using either:
 *   A) Proxy URL: https://<render>/apps/quiz
 *      Theme: <script src="/apps/quiz/quiz.js"></script>
 *   B) Proxy URL: https://<render>/apps/quiz/proxy
 *      Theme: <script src="/apps/quiz/proxy/quiz.js"></script>
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

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors https://*.myshopify.com https://admin.shopify.com;"
  );
  next();
});

const PORT = process.env.PORT || 3000;
const SHOP = process.env.SHOPIFY_SHOP || "";
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const SF_TOKEN = process.env.STOREFRONT_API_TOKEN || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

// Paths
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const quizJsonPath = path.join(dataDir, "quiz.json");

// Helpers
function loadConfig() {
  const raw = fs.readFileSync(quizJsonPath, "utf-8");
  return JSON.parse(raw);
}

async function buildProductsFromHandles(handles) {
  const shopDomain = (SHOP || "").replace(/^https?:\/\//, "").replace(/\/$/, "");

  if (!SF_TOKEN || !shopDomain) {
    return handles.map(h => ({
      handle: h, title: null, image: null, price: null, currency: null
    }));
  }

  const endpoint = `https://${shopDomain}/api/2024-07/graphql.json`;
  const out = [];

  for (const handle of handles) {
    const query = `
      query ProductByHandle($handle: String!) {
        productByHandle(handle: $handle) {
          title
          handle
          featuredImage { url }
          images(first: 1) { edges { node { url } } }
          variants(first: 1) {
            edges { node { price { amount currencyCode } } }
          }
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
        const img = p.featuredImage?.url || p.images?.edges?.[0]?.node?.url || null;
        const priceNode = p.variants?.edges?.[0]?.node?.price;
        out.push({
          handle: p.handle,
          title: p.title || null,
          image: img,
          price: priceNode?.amount || null,
          currency: priceNode?.currencyCode || null,
        });
      } else {
        out.push({ handle, title: null, image: null, price: null, currency: null });
      }
    } catch {
      out.push({ handle, title: null, image: null, price: null, currency: null });
    }
  }

  return out;
}

// Recommend Handler
function makeRecommendHandler() {
  return async (req, res) => {
    try {
      const { answers } = req.body || {};
      const cfg = loadConfig();

      const aMap = {};
      (answers || []).forEach(a => { aMap[a.questionId] = String(a.value); });

      const picks = new Set();
      const combos = Array.isArray(cfg.combos) ? cfg.combos : [];

      for (const c of combos) {
        const when = c?.when || {};
        const allMatch = Object.entries(when).every(([qid, val]) => String(aMap[qid]) === String(val));
        if (allMatch && Array.isArray(c.recommend)) {
          c.recommend.forEach(h => picks.add(h));
        }
      }

      if (picks.size === 0) {
        (cfg.rules || []).forEach(r => {
          if (String(aMap[r.questionId]) === String(r.value) && Array.isArray(r.recommend)) {
            r.recommend.forEach(h => picks.add(h));
          }
        });
      }

      const handles = Array.from(picks);
      const products = await buildProductsFromHandles(handles);

      res.json({ success: true, products });
    } catch (e) {
      res.status(500).json({ success: false, error: "Recommendation failed" });
    }
  };
}

// Config Handler
function makeConfigHandler() {
  return (_req, res) => {
    try {
      const cfg = loadConfig();
      res.json({ success: true, config: cfg, shop: SHOP });
    } catch {
      res.status(500).json({ success: false, error: "Config error" });
    }
  };
}

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

// Static + routes
app.use("/apps/quiz", express.static(publicDir));
app.get("/apps/quiz/config", makeConfigHandler());
app.post("/apps/quiz/recommend", makeRecommendHandler());

app.use("/apps/quiz/proxy", express.static(publicDir));
app.get("/apps/quiz/proxy/config", makeConfigHandler());
app.post("/apps/quiz/proxy/recommend", makeRecommendHandler());

// Admin Middleware
function requireAdmin(req, res, next) {
  const pass = req.headers["x-admin-password"] || req.query.p;
  if (ADMIN_PASSWORD && pass === ADMIN_PASSWORD) return next();
  res.status(401).send("Unauthorized");
}

// Get config
app.get("/apps/quiz/admin/config", requireAdmin, (_req, res) => {
  try {
    const raw = fs.readFileSync(quizJsonPath, "utf-8");
    res.type("application/json").send(raw);
  } catch {
    res.status(500).json({ error: "read fail" });
  }
});

// Save config
app.put("/apps/quiz/admin/config", requireAdmin, (req, res) => {
  try {
    const body = req.body;
    if (!body || !Array.isArray(body.questions) || !Array.isArray(body.rules)) {
      return res.status(400).json({ error: "Invalid config shape" });
    }
    fs.writeFileSync(quizJsonPath, JSON.stringify(body, null, 2), "utf-8");
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "write fail" });
  }
});

// Dynamic Admin UI
app.get("/", requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Start
app.listen(PORT, () => {
  console.log(`Quiz Lite running on ${PUBLIC_URL} (port ${PORT})`);
});
