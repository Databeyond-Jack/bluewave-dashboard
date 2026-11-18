import * as D from "./data.js";
import * as C from "./charts.js";

const $ = (id) => document.getElementById(id);
const CONFIG = { displayModeBar: false, responsive: true };
const SPARK_CONFIG = { displayModeBar: false, staticPlot: true, responsive: true };
const REDUCE_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const YEAR = 365;

const draw = (id, fig, config = CONFIG) => Plotly.react($(id), fig.data, fig.layout, config);
const sum = (arr) => arr.reduce((s, v) => s + v, 0);
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------------------------------------------------------------------------
// Headline numbers: count up from the previous value to the new one
// ---------------------------------------------------------------------------
const FORMATS = {
  money: C.money,
  money2: (v) => "£" + v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  int: (v) => Math.round(v).toLocaleString("en-GB"),
  dec1: (v) => v.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  pct: (v) => v.toFixed(1) + "%",
};
const shown = new Map();

function countTo(id, target, format) {
  const el = $(id), fmt = FORMATS[format], from = shown.get(id) ?? 0;
  const duration = REDUCE_MOTION ? 0 : 900, start = performance.now();
  cancelAnimationFrame(el._raf);
  const step = (now) => {
    const t = duration ? Math.min(1, (now - start) / duration) : 1;
    const v = from + (target - from) * (1 - (1 - t) ** 3);
    el.textContent = fmt(v);
    shown.set(id, v);
    if (t < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

// invert: a rise is bad (shown red). points: show the change in percentage points.
function deltaBadge(id, cur, prev, { note = "vs previous period", invert = false, points = false } = {}) {
  const el = $(id);
  if (prev === null) { el.innerHTML = `<span class="delta neutral">All time</span>`; return; }
  if (!prev) { el.innerHTML = `<span class="delta neutral">—</span>`; return; }
  const change = points ? cur - prev : ((cur - prev) / prev) * 100;
  const good = (change >= 0) !== invert;
  const arrow = change >= 0 ? "▲" : "▼";
  const text = `${arrow} ${Math.abs(change).toFixed(1)}${points ? " pts" : "%"}`;
  el.innerHTML = `<span class="delta ${good ? "up" : "down"}">${text}</span><span class="delta-note"> ${note}</span>`;
}

// ---------------------------------------------------------------------------
// Filter controls (radio "segmented" buttons and checkbox "chips")
// ---------------------------------------------------------------------------
function buildOptions(containerId, type, name, options, checked, onChange) {
  const box = $(containerId);
  box.innerHTML = options.map(({ label, value }) =>
    `<label><input type="${type}" name="${name}" value="${value}"${checked(value) ? " checked" : ""}>${escapeHtml(label)}</label>`
  ).join("");
  box.addEventListener("change", () => onChange([...box.querySelectorAll("input:checked")].map((i) => i.value)));
}

// ---------------------------------------------------------------------------
// Revenue tab
// ---------------------------------------------------------------------------
const tx = D.SALES.tx;
const sales = { period: "90", regions: new Set(D.REGIONS.map((_, i) => i)), products: new Set(D.PRODUCTS.map((_, i) => i)) };

function periodStart(period) {
  return period === "all" ? D.SALES_START : D.SALES_END - Number(period) + 1;
}

// Rows matching the region/product filters, split into the selected period and the one before it.
function filterSales() {
  const start = periodStart(sales.period), days = D.SALES_END - start + 1;
  const prevStart = start - days, cur = [], prev = [];
  const allR = sales.regions.size === 0, allP = sales.products.size === 0;
  for (let i = 0; i < tx.n; i++) {
    if (!(allR || sales.regions.has(tx.region[i])) || !(allP || sales.products.has(tx.product[i]))) continue;
    if (tx.day[i] >= start) cur.push(i);
    else if (tx.day[i] >= prevStart) prev.push(i);
  }
  return { cur, prev: sales.period === "all" ? null : prev };
}

function salesKpis(rows) {
  let revenue = 0;
  const customers = new Set();
  for (const i of rows) { revenue += tx.revenue[i]; customers.add(tx.account[i]); }
  return { revenue, orders: rows.length, aov: rows.length ? revenue / rows.length : 0, customers: customers.size };
}

// Daily buckets for 30/90 days; otherwise 7-day weeks ending on the last date (partial first week dropped).
function salesBuckets(rows) {
  const daily = sales.period === "30" || sales.period === "90";
  const size = daily ? 1 : 7;
  const span = D.SALES_END - periodStart(sales.period) + 1;
  const nb = Math.floor(span / size);
  const revenue = new Array(nb).fill(0), orders = new Array(nb).fill(0);
  const customers = Array.from({ length: nb }, () => new Set());
  for (const i of rows) {
    const b = Math.floor((D.SALES_END - tx.day[i]) / size);
    if (b >= nb) continue;
    const p = nb - 1 - b;
    revenue[p] += tx.revenue[i]; orders[p]++; customers[p].add(tx.account[i]);
  }
  const x = revenue.map((_, p) => D.isoDate(D.SALES_END - (nb - 1 - p) * size));
  return { daily, x, revenue, orders, customers: customers.map((s) => s.size),
           aov: revenue.map((r, p) => (orders[p] ? r / orders[p] : 0)) };
}

function rolling(values, window) {
  return values.map((_, i) => { const s = values.slice(Math.max(0, i - window + 1), i + 1); return sum(s) / s.length; });
}

function renderSales() {
  const { cur, prev } = filterSales();
  const k = salesKpis(cur), kp = prev ? salesKpis(prev) : null;
  const fmts = { revenue: "money", orders: "int", aov: "money2", customers: "int" };
  for (const [key, fmt] of Object.entries(fmts)) {
    countTo(`cu-${key}`, k[key], fmt);
    deltaBadge(`delta-${key}`, k[key], kp ? kp[key] : null);
  }

  const b = salesBuckets(cur);
  for (const key of Object.keys(fmts)) draw(`spark-${key}`, C.spark(b.x, b[key]), SPARK_CONFIG);
  draw("trend", C.trend(b.x, b.revenue, rolling(b.revenue, b.daily ? 7 : 4)));

  // Region × product totals
  const flows = D.REGIONS.map(() => D.PRODUCTS.map(() => 0));
  const weekHour = WEEKDAYS.map(() => new Array(24).fill(0));
  const byAccount = new Map();
  for (const i of cur) {
    flows[tx.region[i]][tx.product[i]] += tx.revenue[i];
    weekHour[tx.weekday[i]][tx.hour[i]]++;
    byAccount.set(tx.account[i], (byAccount.get(tx.account[i]) ?? 0) + tx.revenue[i]);
  }
  const regionTotals = flows.map(sum);
  const productTotals = D.PRODUCTS.map((_, p) => sum(flows.map((row) => row[p])));
  const ri = D.REGIONS.map((_, i) => i).filter((i) => regionTotals[i] > 0);
  const pi = D.PRODUCTS.map((_, i) => i).filter((i) => productTotals[i] > 0);
  draw("flow", C.flow(ri.map((i) => D.REGIONS[i]), ri.map((i) => C.SERIES[i]), pi.map((i) => D.PRODUCTS[i]),
                      ri.map((r) => pi.map((p) => flows[r][p])), ri.map((i) => regionTotals[i]), pi.map((i) => productTotals[i])));

  const sorted = [...ri].sort((a, b2) => regionTotals[a] - regionTotals[b2]);
  draw("regionbars", C.regionBars(sorted.map((i) => D.REGIONS[i]), sorted.map((i) => regionTotals[i]),
                                  [C.SKY, C.BLUE_2, C.BLUE, C.NAVY].slice(-sorted.length)));
  draw("heatmap", C.heatmap(weekHour, WEEKDAYS));
  renderAccounts(byAccount);
  renderCumulative();
}

// All-time running total by region, month by month (follows region/product filters, not the period).
function renderCumulative() {
  const regs = D.REGIONS.map((_, i) => i).filter((i) => sales.regions.size === 0 || sales.regions.has(i));
  const first = new Date(D.SALES_START * D.DAY_MS), last = new Date(D.SALES_END * D.DAY_MS);
  const months = [];
  for (let y = first.getUTCFullYear(), m = first.getUTCMonth(); y < last.getUTCFullYear() || (y === last.getUTCFullYear() && m <= last.getUTCMonth());
       m === 11 ? (y++, m = 0) : m++) months.push([y, m]);
  const monthIndex = (day) => { const d = new Date(day * D.DAY_MS); return (d.getUTCFullYear() - months[0][0]) * 12 + d.getUTCMonth() - months[0][1]; };
  const totals = D.REGIONS.map(() => new Array(months.length).fill(0));
  const allP = sales.products.size === 0;
  for (let i = 0; i < tx.n; i++) {
    if (!regs.includes(tx.region[i]) || !(allP || sales.products.has(tx.product[i]))) continue;
    totals[tx.region[i]][monthIndex(tx.day[i])] += tx.revenue[i];
  }
  const x = months.map(([y, m]) => D.isoDate(Date.UTC(y, m, 1) / D.DAY_MS));
  draw("cumulative", C.cumulative(x, regs.map((r) => {
    let acc = 0;
    return { name: D.REGIONS[r], color: C.SERIES[r], values: totals[r].map((v) => (acc += v)) };
  })));
}

function renderAccounts(byAccount) {
  const top = [...byAccount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  const max = top.length ? top[0][1] : 1;
  $("accounts").innerHTML = top.length ? top.map(([a, rev], i) => `
    <div class="acct">
      <div class="acct-top">
        <span class="rank">${String(i + 1).padStart(2, "0")}</span>
        <span class="acct-name">${escapeHtml(D.SALES.accounts[a])}</span>
        <span class="acct-region">${D.REGIONS[D.SALES.accountRegion[a]]}</span>
        <span class="acct-rev">${C.money(rev)}</span>
      </div>
      <div class="bar"><div class="bar-fill" style="width:${((rev / max) * 100).toFixed(1)}%"></div></div>
    </div>`).join("") : `<p class="sub">No data for this selection.</p>`;
}

// ---------------------------------------------------------------------------
// Live orders: a simulated stream, one tick every 2 seconds
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, "0");
const localStamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const live = { today: 0, seq: 0, orders: [] };

function startLive() {
  const rng = D.SALES.rng;
  for (let i = 0; i < tx.n; i++) if (tx.day[i] === D.SALES_END) live.today += tx.revenue[i];
  countTo("cu-today", live.today, "money");

  const now = Date.now(), x = [], y = [];
  let level = 12;
  for (let i = 59; i >= 0; i--) {
    level = Math.max(3, level + rng.normal(0, 1.2));
    x.push(localStamp(new Date(now - i * 2000))); y.push(Math.round(level * 10) / 10);
  }
  draw("live", C.live(x, y));

  const tick = () => {
    if (document.hidden) return;
    const burst = 1 + Math.floor(rng.next() * 3), time = new Date();
    for (let j = 0; j < burst; j++) {
      const a = D.SALES.pickAccount(), p = D.SALES.pickProduct();
      const amount = D.PRODUCT_PRICE[p] * rng.lognormal(0, 0.45);
      live.today += amount;
      live.orders.unshift({ id: ++live.seq, a, p, amount, time: time.toTimeString().slice(0, 8) });
    }
    live.orders = live.orders.slice(0, 5);
    const rate = Math.max(3, 12 + 4 * Math.sin(live.seq / 9) + rng.normal(0, 1.5));
    Plotly.extendTraces($("live"), { x: [[localStamp(time)]], y: [[rate]] }, [0], 60);
    countTo("cu-today", live.today, "money");
    renderFeed();
  };
  tick();
  setInterval(tick, 2000);
}

function renderFeed() {
  const feed = $("feed");
  const existing = new Set([...feed.children].map((li) => li.dataset.id));
  const items = live.orders.map((o) => {
    const id = String(o.id);
    const old = existing.has(id) ? feed.querySelector(`[data-id="${id}"]`) : null;
    if (old) return old;
    const li = document.createElement("li");
    li.className = "feed-item";
    li.dataset.id = id;
    li.innerHTML = `<span class="feed-dot p${o.p}"></span>
      <div><div class="feed-acct">${escapeHtml(D.SALES.accounts[o.a])}</div>
      <div class="feed-meta">${D.PRODUCTS[o.p]} · ${D.REGIONS[D.SALES.accountRegion[o.a]]} · ${o.time}</div></div>
      <span class="feed-amt">${C.money(o.amount)}</span>`;
    return li;
  });
  feed.replaceChildren(...items);
}

// ---------------------------------------------------------------------------
// Workforce tab
// ---------------------------------------------------------------------------
const W = D.WORKFORCE;
const wfState = { depts: new Set(D.DEPARTMENTS.map((_, i) => i)), locs: new Set(D.LOCATIONS.map((_, i) => i)) };
const LAST_12 = 12;  // months 12–23 are the last 12 complete months (Nov 2025 – Oct 2026)

const activeAt = (e, t) => e.hire <= t && (e.leave === null || e.leave > t);
const countActive = (es, t) => es.reduce((n, e) => n + (activeAt(e, t) ? 1 : 0), 0);

function filterWorkforce() {
  const keep = (r) => (wfState.depts.size === 0 || wfState.depts.has(r.dept)) && (wfState.locs.size === 0 || wfState.locs.has(r.loc));
  return { es: W.employees.filter(keep), abs: W.absence.filter(keep), vac: W.vacancies.filter(keep) };
}

// Leavers in the 12 months to `end` as a % of average headcount over those months.
function turnoverRate(es, end) {
  const leavers = es.filter((e) => e.leave !== null && e.leave > end - YEAR && e.leave <= end).length;
  const avg = sum(Array.from({ length: 13 }, (_, k) => countActive(es, end - 30 * k))) / 13;
  return avg ? (leavers / avg) * 100 : 0;
}

function absenceRate(rows) {
  const available = sum(rows.map((r) => r.available));
  return available ? (sum(rows.map((r) => r.lost)) / available) * 100 : 0;
}

function renderWorkforce() {
  const { es, abs, vac } = filterWorkforce();
  const now = D.AS_OF, yearAgo = D.AS_OF - YEAR;
  const act = es.filter((e) => activeAt(e, now)), actPrev = es.filter((e) => activeAt(e, yearAgo));
  const absCur = abs.filter((r) => r.month >= LAST_12), absPrev = abs.filter((r) => r.month < LAST_12);

  const cur = { headcount: act.length, fte: sum(act.map((e) => e.fte)), turnover: turnoverRate(es, now), absence: absenceRate(absCur) };
  const prev = { headcount: actPrev.length, fte: sum(actPrev.map((e) => e.fte)), turnover: turnoverRate(es, yearAgo), absence: absenceRate(absPrev) };
  const fmts = { headcount: "int", fte: "dec1", turnover: "pct", absence: "pct" };
  for (const [key, fmt] of Object.entries(fmts)) countTo(`cu-wf_${key}`, cur[key], fmt);
  deltaBadge("delta-wf_headcount", cur.headcount, prev.headcount, { note: "vs 12 months ago" });
  deltaBadge("delta-wf_fte", cur.fte, prev.fte, { note: "vs 12 months ago" });
  deltaBadge("delta-wf_turnover", cur.turnover, prev.turnover, { note: "vs prior 12m", invert: true, points: true });
  deltaBadge("delta-wf_absence", cur.absence, prev.absence, { note: "vs prior 12m", invert: true, points: true });

  // Month by month
  const x = D.MONTHS.map((m) => D.isoDate(m.start));
  const monthly = D.MONTHS.map((m) => {
    const active = es.filter((e) => activeAt(e, m.end));
    return { headcount: active.length, fte: sum(active.map((e) => e.fte)),
             starters: es.filter((e) => e.hire >= m.start && e.hire <= m.end).length,
             leavers: es.filter((e) => e.leave !== null && e.leave >= m.start && e.leave <= m.end).length };
  });
  const absByMonth = D.MONTHS.map((_, mi) => absenceRate(abs.filter((r) => r.month === mi)));
  draw("spark-wf_headcount", C.spark(x, monthly.map((m) => m.headcount)), SPARK_CONFIG);
  draw("spark-wf_fte", C.spark(x, monthly.map((m) => m.fte)), SPARK_CONFIG);
  draw("spark-wf_turnover", C.spark(x, monthly.map((m) => m.leavers)), SPARK_CONFIG);
  draw("spark-wf_absence", C.spark(x, absByMonth), SPARK_CONFIG);
  draw("wf-movement", C.movement(x, monthly.map((m) => m.starters), monthly.map((m) => m.leavers), monthly.map((m) => m.headcount)));
  draw("wf-absence", C.absence(x, absByMonth));

  // Current staff
  const depts = D.DEPARTMENTS.map((name, d) => ({
    name, ft: act.filter((e) => e.dept === d && e.fte === 1).length, pt: act.filter((e) => e.dept === d && e.fte < 1).length,
  })).filter((d) => d.ft + d.pt > 0).sort((a, b) => a.ft + a.pt - (b.ft + b.pt));
  draw("wf-departments", C.departments(depts.map((d) => d.name), depts.map((d) => d.ft), depts.map((d) => d.pt)));
  draw("wf-pyramid", C.pyramid(D.AGE_BANDS,
    D.AGE_BANDS.map((_, b) => act.filter((e) => e.ageBand === b && e.gender === 1).length),
    D.AGE_BANDS.map((_, b) => act.filter((e) => e.ageBand === b && e.gender === 0).length)));

  const years = act.map((e) => (D.AS_OF - e.hire) / 365.25);
  const edges = [1, 2, 5, 10, Infinity];
  const service = edges.map(() => 0);
  for (const y of years) service[edges.findIndex((edge) => y <= edge)]++;
  draw("wf-service", C.service(["<1", "1–2", "2–5", "5–10", "10+"], service, median(years)));

  const recentLeavers = es.filter((e) => e.leave !== null && e.leave > now - YEAR);
  const reasons = D.REASONS.map((name, r) => ({ name, n: recentLeavers.filter((e) => e.reason === r).length }))
    .sort((a, b) => a.n - b.n);
  draw("wf-reasons", C.reasons(reasons.map((r) => r.name), reasons.map((r) => r.n)));

  renderScorecard(es, absCur, vac);
}

function renderScorecard(es, absCur, vac) {
  const rows = D.DEPARTMENTS.map((name, d) => {
    const ed = es.filter((e) => e.dept === d);
    if (!ed.length) return "";
    const act = ed.filter((e) => activeAt(e, D.AS_OF));
    const turn = turnoverRate(ed, D.AS_OF);
    const absn = absenceRate(absCur.filter((r) => r.dept === d));
    const eng = act.length ? sum(act.map((e) => e.engagement)) / act.length : 0;
    const roles = sum(vac.filter((v) => v.dept === d).map((v) => v.open));
    const pill = (text, warn) => `<span class="pill ${warn ? "warn" : "ok"}">${text}</span>`;
    return `<div class="sc-row"><span class="sc-name">${name}</span><span>${act.length.toLocaleString("en-GB")}</span>
      ${pill(turn.toFixed(1) + "%", turn >= 16)}${pill(absn.toFixed(1) + "%", absn >= 4)}${pill(eng.toFixed(0), eng < 66)}
      <span>${roles}</span></div>`;
  }).join("");
  $("wf-scorecard").innerHTML = rows
    ? `<div class="sc-row sc-head">${["Department", "Headcount", "Turnover", "Absence", "Engagement", "Open roles"]
        .map((h) => `<span>${h}</span>`).join("")}</div>${rows}`
    : `<p class="sub">No data for this selection.</p>`;
}

// ---------------------------------------------------------------------------
// Tabs and start-up
// ---------------------------------------------------------------------------
let workforceDrawn = false;

function showTab(tab) {
  $("page").className = `page tab-${tab}`;
  if (tab === "workforce" && !workforceDrawn) { renderWorkforce(); workforceDrawn = true; }
  // Charts drawn while their tab was hidden need re-measuring once visible.
  requestAnimationFrame(() => document.querySelectorAll(`.only-${tab === "sales" ? "sales" : "workforce"} .js-plotly-plot`)
    .forEach((g) => Plotly.Plots.resize(g)));
}

function init() {
  $("tagline").textContent = `Revenue and workforce analytics · synthetic data through ${new Date(D.SALES_END * D.DAY_MS)
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}`;

  buildOptions("tab", "radio", "tab", [{ label: "Revenue", value: "sales" }, { label: "Workforce", value: "workforce" }],
               (v) => v === "sales", ([v]) => showTab(v));
  buildOptions("period", "radio", "period", [["30D", "30"], ["90D", "90"], ["12M", "365"], ["All", "all"]]
               .map(([label, value]) => ({ label, value })), (v) => v === sales.period,
               ([v]) => { sales.period = v; renderSales(); });
  buildOptions("regions", "checkbox", "regions", D.REGIONS.map((label, i) => ({ label, value: i })), () => true,
               (v) => { sales.regions = new Set(v.map(Number)); renderSales(); });
  buildOptions("products", "checkbox", "products", D.PRODUCTS.map((label, i) => ({ label, value: i })), () => true,
               (v) => { sales.products = new Set(v.map(Number)); renderSales(); });
  buildOptions("wf-depts", "checkbox", "wf-depts", D.DEPARTMENTS.map((label, i) => ({ label, value: i })), () => true,
               (v) => { wfState.depts = new Set(v.map(Number)); renderWorkforce(); });
  buildOptions("wf-locs", "checkbox", "wf-locs", D.LOCATIONS.map((label, i) => ({ label, value: i })), () => true,
               (v) => { wfState.locs = new Set(v.map(Number)); renderWorkforce(); });

  renderSales();
  startLive();
}

init();
