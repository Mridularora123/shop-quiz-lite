/* Shop Quiz Lite — Express server (with dynamic admin panel at "/")
 * Frontend quiz JS still loads from /apps/quiz/quiz.js and uses:
 *   GET  /apps/quiz/config
 *   POST /apps/quiz/recommend
 * Admin editor UI is served at "/" (no password gate on HTML),
 * but the config API is protected by ADMIN_PASSWORD.
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

// allow embedding inside Shopify admin iframe if you open the editor in the app
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
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ""; // if blank → editor API is open

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

  // If token or shop are missing, return light objects (UI still renders)
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

// ===== Quiz public API =====
function makeRecommendHandler() {
  return async (req, res) => {
    try {
      const { answers } = req.body || {};
      const cfg = loadConfig();

      // Flatten answers to map
      const aMap = {};
      (answers || []).forEach(a => { aMap[a.questionId] = String(a.value); });

      const picks = new Set();

      // 1) combos (AND)
      const combos = Array.isArray(cfg.combos) ? cfg.combos : [];
      for (const c of combos) {
        const when = c?.when || {};
        const allMatch = Object.entries(when).every(([qid, val]) => String(aMap[qid]) === String(val));
        if (allMatch && Array.isArray(c.recommend)) {
          c.recommend.forEach(h => picks.add(h));
        }
      }

      // 2) fallback to single rules (OR/union)
      if (picks.size === 0) {
        (cfg.rules || []).forEach(r => {
          if (!r || !r.questionId) return;
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

app.get("/health", (_req, res) => res.json({ ok: true }));

// Serve quiz static bundle (quiz.js, css, etc)
app.use("/apps/quiz", express.static(publicDir));

// Public quiz endpoints
app.get("/apps/quiz/config", makeConfigHandler());
app.post("/apps/quiz/recommend", makeRecommendHandler());

// Legacy proxy paths
app.use("/apps/quiz/proxy", express.static(publicDir));
app.get("/apps/quiz/proxy/config", makeConfigHandler());
app.post("/apps/quiz/proxy/recommend", makeRecommendHandler());

// ===== Admin protection (API only) =====
function requireAdmin(req, res, next) {
  // If no ADMIN_PASSWORD is configured, allow everything (useful for dev)
  if (!ADMIN_PASSWORD) return next();

  const pass =
    req.headers["x-admin-password"] ||
    req.query.p ||
    "";

  if (pass === ADMIN_PASSWORD) return next();
  res.status(401).send("Unauthorized");
}

// Admin config API (protected)
app.get("/apps/quiz/admin/config", requireAdmin, (_req, res) => {
  try {
    const raw = fs.readFileSync(quizJsonPath, "utf-8");
    res.type("application/json").send(raw);
  } catch {
    res.status(500).json({ error: "read fail" });
  }
});

app.put("/apps/quiz/admin/config", requireAdmin, (req, res) => {
  try {
    const body = req.body || {};
    // keep old shape contract
    if (!Array.isArray(body.questions)) body.questions = [];
    if (!Array.isArray(body.rules)) body.rules = [];
    if (!Array.isArray(body.combos)) body.combos = [];

    fs.writeFileSync(quizJsonPath, JSON.stringify(body, null, 2), "utf-8");
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "write fail" });
  }
});

// ===== Serve the admin editor UI at "/" (NO middleware) =====
// The editor itself will show a password overlay and call the protected API with ?p=...
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Start
app.listen(PORT, () => {
  console.log(`Quiz Lite running on ${PUBLIC_URL} (port ${PORT})`);
});
