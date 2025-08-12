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

// Allow embedding inside Shopify Admin iframe
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

// -------- Paths --------
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const quizJsonPath = path.join(dataDir, "quiz.json");

// -------- Helpers --------
function loadConfig() {
  const raw = fs.readFileSync(quizJsonPath, "utf-8");
  return JSON.parse(raw);
}

async function buildProductsFromHandles(handles) {
  // If you haven't set a Storefront token we can only return handles
  if (!SF_TOKEN || !SHOP) {
    return handles.map(h => ({
      handle: h, title: null, image: null, price: null, currency: null
    }));
  }

  const endpoint = `https://${SHOP}/api/2024-07/graphql.json`;
  const out = [];

  for (const handle of handles) {
    const query = `
      query ProductByHandle($handle: String!) {
        productByHandle(handle: $handle) {
          title
          handle
          featuredImage { url }
          images(first: 1) { edges { node { url } } }   # fallback if no featured image
          variants(first: 1) {
            edges {
              node {
                price { amount currencyCode }          # price & currency
              }
            }
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
        const firstImg =
          p.featuredImage?.url ||
          p.images?.edges?.[0]?.node?.url ||
          null;

        const priceNode = p.variants?.edges?.[0]?.node?.price;

        out.push({
          handle: p.handle,
          title: p.title || null,
          image: firstImg,
          price: priceNode?.amount || null,
          currency: priceNode?.currencyCode || null,
        });
      } else {
        // product not found (wrong handle or not published)
        out.push({ handle, title: null, image: null, price: null, currency: null });
      }
    } catch (e) {
      console.error("Storefront fetch error for", handle, e);
      out.push({ handle, title: null, image: null, price: null, currency: null });
    }
  }

  return out;
}


function makeRecommendHandler() {
  return async (req, res) => {
    try {
      const { answers } = req.body || {};
      const cfg = loadConfig();

      // Build quick lookup: { goal: 'anti_frizz', budget: 'low', ... }
      const aMap = {};
      (answers || []).forEach(a => { aMap[a.questionId] = String(a.value); });

      const picks = new Set();

      // 1) Try COMBO rules first (AND)
      const combos = Array.isArray(cfg.combos) ? cfg.combos : [];
      for (const c of combos) {
        const when = c?.when || {};
        const allMatch = Object.entries(when).every(([qid, val]) => String(aMap[qid]) === String(val));
        if (allMatch && Array.isArray(c.recommend)) {
          c.recommend.forEach(h => picks.add(h));
        }
      }

      // 2) If no combo matched, fall back to single-question rules (OR/union)
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
  res.send(`
<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{font-family:system-ui;margin:0;padding:24px}
  .wrap{max-width:900px;margin:0 auto}
  a.btn,button.btn{display:inline-block;padding:10px 14px;border-radius:10px;border:1px solid #ddd;background:#fff;cursor:pointer;text-decoration:none}
  ul{line-height:1.9}
</style>
<div class="wrap">
  <h2>Shop Quiz Lite</h2>
  <p>Server running at <code>${PUBLIC_URL}</code></p>
  <ul>
    <li>Health: <a href="/health" target="_blank">/health</a></li>
    <li>Static (no proxy): <a href="/apps/quiz/quiz.js" target="_blank">/apps/quiz/quiz.js</a></li>
    <li>Config (no proxy): <a href="/apps/quiz/config" target="_blank">/apps/quiz/config</a></li>
  </ul>

  <hr style="margin:20px 0" />
  <h3>Admin</h3>
  <p>Edit questions, options, and product mappings.</p>
  <p>Use Admin Password : quiz12345</p>
  <div style="display:flex;gap:8px;align-items:center">
    <input id="pw" type="password" placeholder="Enter admin password" style="padding:10px;border:1px solid #ddd;border-radius:10px;min-width:260px" />
    <button class="btn" id="open">Open editor</button>
  </div>
</div>
<script>
  document.getElementById('open').onclick = function(){
    var p = document.getElementById('pw').value || '';
    if(!p){ alert('Enter the admin password'); return; }
    // stay inside the Shopify app iframe
    window.location.href = '/apps/quiz/admin?p=' + encodeURIComponent(p);
  };
</script>
  `);
});


// -------- No-proxy routes (recommended) --------
app.use("/apps/quiz", express.static(publicDir));
app.get("/apps/quiz/config", makeConfigHandler());
app.post("/apps/quiz/recommend", makeRecommendHandler());

// -------- Legacy /proxy routes (kept for compatibility) --------
app.use("/apps/quiz/proxy", express.static(publicDir));
app.get("/apps/quiz/proxy/config", makeConfigHandler());
app.post("/apps/quiz/proxy/recommend", makeRecommendHandler());

// ===== Simple Admin Editor (file-based, no Shopify scopes) =====
function requireAdmin(req, res, next) {
  const pass = req.headers["x-admin-password"] || req.query.p;
  if (ADMIN_PASSWORD && pass === ADMIN_PASSWORD) return next();
  res.status(401).send("Unauthorized");
}

// Read current config (used by admin UI)
app.get("/apps/quiz/admin/config", requireAdmin, (_req, res) => {
  try {
    const raw = fs.readFileSync(quizJsonPath, "utf-8");
    res.type("application/json").send(raw);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "read fail" });
  }
});

// Save updated config
app.put("/apps/quiz/admin/config", requireAdmin, (req, res) => {
  try {
    const body = req.body;
    // basic shape check
    if (!body || !Array.isArray(body.questions) || !Array.isArray(body.rules)) {
      return res.status(400).json({ error: "Invalid config shape" });
    }
    fs.writeFileSync(quizJsonPath, JSON.stringify(body, null, 2), "utf-8");
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "write fail" });
  }
});

// Minimal admin UI (textarea JSON editor)
app.get("/apps/quiz/admin", requireAdmin, (_req, res) => {
  res.send(`
<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{font-family:system-ui;margin:0;padding:24px;background:#fff}
  .wrap{max-width:1000px;margin:0 auto}
  textarea{width:100%;height:60vh;font-family:ui-monospace,monospace;border:1px solid #e5e7eb;border-radius:12px;padding:12px}
  .row{display:flex;gap:8px;align-items:center;margin:12px 0}
  button{padding:10px 14px;border-radius:10px;border:1px solid #ddd;background:#fff;cursor:pointer}
  .hint{color:#555}
</style>
<div class="wrap">
  <h2>Quiz Config Editor</h2>
  <p class="hint">Edit <code>questions</code>, <code>options</code>, and <code>rules</code>. Click <b>Save</b> to publish.</p>
  <div class="row">
    <button id="pretty">Pretty</button>
    <button id="save">Save</button>
    <span id="msg"></span>
  </div>
  <textarea id="t"></textarea>
</div>
<script>
  const p = new URL(location).searchParams.get("p")||"";
  async function load(){
    const r = await fetch("/apps/quiz/admin/config?p="+encodeURIComponent(p));
    const txt = await r.text();
    t.value = txt || "{}";
  }
  pretty.onclick = ()=>{ try{ t.value = JSON.stringify(JSON.parse(t.value), null, 2) }catch(e){ alert("Invalid JSON") } };
  save.onclick = async ()=>{
    try{
      const j = JSON.parse(t.value);
      const r = await fetch("/apps/quiz/admin/config?p="+encodeURIComponent(p),{
        method:"PUT", headers:{"Content-Type":"application/json"}, body: JSON.stringify(j)
      });
      msg.textContent = r.ok ? "Saved!" : "Failed";
      setTimeout(()=>msg.textContent="",3000);
    }catch(e){ alert("Invalid JSON"); }
  };
  load();
</script>
  `);
});

// -------- Start --------
app.listen(PORT, () => {
  console.log(`Quiz Lite running on ${PUBLIC_URL} (port ${PORT})`);
});
