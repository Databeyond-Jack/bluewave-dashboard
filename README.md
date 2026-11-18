# Data Beyond Sample Dashboard

Interactive sample dashboard: a static site (HTML, CSS and JavaScript with Plotly.js) that runs
entirely in the browser, so Cloudflare can host it with no server. All data is synthetic,
generated in the browser from a fixed seed so every visitor sees the same numbers.

**Live:** https://bluewave-dashboard.jackfarquhar3146.workers.dev

- **Revenue** tab: sales KPIs, trends, region → product flow, cumulative revenue, ordering
  heatmap, top accounts and a simulated live order feed.
- **Workforce** tab: headcount, FTE, turnover, sickness absence, starters and leavers,
  age/gender profile, length of service, leaving reasons and a department scorecard.

```
public/
  index.html              the dashboard
  embed-demo.html         example page embedding the dashboard in an iframe
  _headers                Cloudflare Pages response headers
  assets/style.css
  assets/embed.js         ?embed=1 mode + reports page height to the host page
  assets/embed-host.js    for host sites: resizes the iframe to fit
  assets/js/data.js       sample data generators
  assets/js/charts.js     Plotly figure definitions
  assets/js/main.js       filters, tabs, KPIs, live feed
wrangler.jsonc            Cloudflare config: serve public/ as static assets
package.json              pins the Wrangler version used to deploy
```

## Run locally

Any static file server works, e.g.

```bash
python -m http.server 8050 --directory public
```

Then open http://localhost:8050 (opening `index.html` directly from disk won't work, because
browsers block JavaScript modules on `file://`).

## Deploy to Cloudflare

Cloudflare Pages is now part of Workers, so this deploys as a static-assets-only Worker: no
Worker code, no build step. Cloudflare serves `public/` and applies `public/_headers`.

```bash
npm install
npx wrangler login
npx wrangler deploy
```

(If PowerShell blocks `npx`, use `npx.cmd` instead.) The site is live at
`https://bluewave-dashboard.jackfarquhar3146.workers.dev`.

**Auto-deploy on push (optional):** in the Cloudflare dashboard open **Workers & Pages →
bluewave-dashboard → Settings → Builds**, connect this GitHub repository and set the deploy
command to `npx wrangler deploy` (no build command).

**Custom domain:** add e.g. `dashboard.databeyond.uk` under the Worker's **Settings → Domains &
Routes** (the domain must be on your Cloudflare account), then use it in the embed snippet below.

## Embed in a website

Paste this where the dashboard should appear (swap in your custom domain if you add one):

```html
<iframe
  src="https://bluewave-dashboard.jackfarquhar3146.workers.dev/?embed=1"
  title="Data Beyond sample dashboard"
  style="display:block; width:100%; height:1550px; border:0; border-radius:16px; background:#F5F7FA;">
</iframe>
<script src="https://bluewave-dashboard.jackfarquhar3146.workers.dev/assets/embed-host.js"></script>
```

- `?embed=1` hides the dashboard's Data Beyond header and footer; the tabs and filters stay.
- The script resizes the iframe to fit the dashboard exactly, and keeps it fitted as the window
  is resized, the phone is rotated, filters change or tabs are switched.
- `height:1550px` is only the starting height until the dashboard loads.
- To stop other sites embedding it, see the note in `public/_headers`.
