# Shop Quiz Lite (Private, Proxy-style)

A minimal, fast-to-deploy product recommendation quiz inspired by apps like RevenueHunt and Quiz Kit.

## Deploy (Render)
1. Push this folder to a Git repo.
2. Create a new **Web Service** on Render -> Node 18+
3. **Start command**: `node server.js` (no build step)
4. Set env vars: `SHOPIFY_SHOP`, `PUBLIC_URL`, (optional) `STOREFRONT_API_TOKEN`
5. Deploy, note the public URL.

## App Proxy (Shopify)
Settings -> Apps and sales channels -> Develop apps -> Your app -> **App proxy**
- Subpath prefix: `apps`
- Subpath: `quiz`
- Proxy URL: `${PUBLIC_URL}/apps/quiz/proxy`

## Theme Install
Add before `</body>` in theme.liquid:
```html
<div id="shop-quiz" data-quiz-lite></div>
<script src="/apps/quiz/proxy/quiz.js"></script>
```

## Configure Recommendations
Edit `data/quiz.json` and replace the sample product handles with your real product handles.

If you add a Storefront API token, product cards will show image/title/price automatically. Without it, links will still work to `/products/{handle}`.