# Bluewave Analytics

Interactive sample dashboard: a static site (HTML, CSS and JavaScript with Plotly.js) that runs
entirely in the browser, so it can be hosted on Cloudflare Pages with no server. All data is
synthetic, generated in the browser from a fixed seed so every visitor sees the same numbers.

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
wrangler.jsonc            Cloudflare Pages config (output dir: public)
```

## Run locally

Any static file server works, e.g.

```bash
python -m http.server 8050 --directory public
```

Then open http://localhost:8050 (opening `index.html` directly from disk won't work, because
browsers block JavaScript modules on `file://`).

## Deploy to Cloudflare Pages

**From GitHub (recommended, redeploys on every push):** in the Cloudflare dashboard go to
**Workers & Pages → Create → Pages → Connect to Git**, pick this repository and set:

- Framework preset: **None**
- Build command: *(leave empty)*
- Build output directory: **public**

**Or upload directly** with Wrangler, which reads `wrangler.jsonc`:

```bash
npx wrangler pages deploy
```

The site is then live at `https://bluewave-dashboard.pages.dev`. To use your own domain (e.g.
`dashboard.databeyond.uk`), add it under the Pages project's **Custom domains**.

## Embed in a website

Paste this where the dashboard should appear, replacing the address with your deployment's:

```html
<iframe
  src="https://bluewave-dashboard.pages.dev/?embed=1"
  title="Bluewave Analytics dashboard"
  style="display:block; width:100%; height:1550px; border:0; border-radius:16px; background:#F5F7FA;">
</iframe>
<script src="https://bluewave-dashboard.pages.dev/assets/embed-host.js"></script>
```

- `?embed=1` hides the dashboard's own title bar and footer; the tabs and filters stay.
- The script resizes the iframe to fit the dashboard exactly, and keeps it fitted as the window
  is resized, the phone is rotated, filters change or tabs are switched.
- `height:1550px` is only the starting height until the dashboard loads.
- To stop other sites embedding it, see the note in `public/_headers`.
