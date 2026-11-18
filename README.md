# Bluewave Analytics

Interactive sample dashboard built with Dash + Plotly. All data is synthetic.

- **Revenue** tab: sales KPIs, trends, region → product flow and a live order feed (`app.py`).
- **Workforce** tab: headcount, FTE, turnover, sickness absence, age/gender profile, length of
  service, leaving reasons and a department scorecard (data generated in `workforce.py`).

## Run locally

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python app.py
```

Open http://127.0.0.1:8050

## Deploy to Render

1. Push this folder to a GitHub repository.
2. In Render, choose **New → Blueprint** and pick the repository. It reads `render.yaml` and
   creates the web service (build: `pip install -r requirements.txt`, start: `gunicorn app:server`).
3. When the deploy finishes, the dashboard is live at `https://<service-name>.onrender.com`.

On the free plan the service sleeps after ~15 minutes without traffic; the first visit after
that takes ~30 seconds to wake it. The Starter plan keeps it running.

Optional: add a custom domain such as `dashboard.example.com` under the service's
**Settings → Custom Domains** and add the CNAME record Render shows you.

## Embed in a website

Paste this where the dashboard should appear, replacing `dashboard.example.com` with your
dashboard's address:

```html
<iframe
  src="https://dashboard.example.com/?embed=1"
  title="Bluewave Analytics dashboard"
  style="display:block; width:100%; height:1550px; border:0; border-radius:16px; background:#F5F7FA;">
</iframe>
<script src="https://dashboard.example.com/assets/embed-host.js"></script>
```

- `?embed=1` hides the dashboard's own title bar and footer.
- The script resizes the iframe to fit the dashboard exactly, and keeps it fitted as the
  window is resized, the phone is rotated or filters change. The cards stack on narrow
  screens, so the page is ~1,550px tall on desktop and ~3,000px on a phone.
- `height:1550px` is only the starting height until the dashboard loads; the background
  colour fills the space meanwhile.
- If the dashboard sits below the fold, you can add `loading="lazy"` to the iframe.

### Try it locally

Run the dashboard, then serve the demo host page on another port and open
http://localhost:8060/embed-demo.html:

```bash
.venv\Scripts\python -m http.server 8060 --directory examples
```
