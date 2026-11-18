// Plotly figure builders. Each returns { data, layout } for Plotly.react.

export const NAVY = "#24385A", BLUE = "#3F5F92", BLUE_2 = "#6C88B5", SKY = "#A9BCD8", MIST = "#DCE3EE";
export const INK = "#1D2636", MUTED = "#64708A", GRID = "#EDF0F5";
export const SERIES = [NAVY, BLUE, BLUE_2, SKY];
const FONT = "Plus Jakarta Sans, Inter, system-ui, sans-serif";
const FILL = "rgba(63,95,146,0.10)";

export function money(v) {
  if (Math.abs(v) >= 1e6) return `£${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `£${(v / 1e3).toFixed(1)}K`;
  return `£${Math.round(v).toLocaleString("en-GB")}`;
}

function base(extra = {}) {
  return {
    font: { family: FONT, color: INK, size: 12 },
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 8, r: 8, t: 8, b: 8 },
    hoverlabel: { bgcolor: "white", bordercolor: BLUE, font: { family: FONT, color: INK } },
    showlegend: false,
    ...extra,
  };
}

function axis(extra = {}) {
  return { gridcolor: GRID, zeroline: false, linecolor: GRID, tickfont: { color: MUTED }, automargin: true, ...extra };
}

const legendTop = (x = 1, xanchor = "right") =>
  ({ orientation: "h", y: 1.08, x, xanchor, font: { color: MUTED }, traceorder: "normal" });

function rgba(hex, alpha) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

// Symmetric axis ticks for charts with values either side of zero (shown as absolute numbers).
function mirroredTicks(top, unit) {
  const step = Math.max(unit, Math.ceil(Math.max(top, 1) / 2 / unit) * unit);
  const vals = [-2 * step, -step, 0, step, 2 * step];
  return { step, vals, text: vals.map((v) => String(Math.abs(v))) };
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------
export function spark(x, y) {
  return {
    data: [{ x, y, type: "scatter", mode: "lines", line: { color: BLUE, width: 2, shape: "spline" },
             fill: "tozeroy", fillcolor: FILL, hoverinfo: "skip" }],
    layout: base({ margin: { l: 0, r: 0, t: 0, b: 0 }, height: 46,
                   xaxis: { visible: false }, yaxis: { visible: false } }),
  };
}

// ---------------------------------------------------------------------------
// Revenue tab
// ---------------------------------------------------------------------------
export function trend(x, y, avg) {
  return {
    data: [
      { x, y, name: "Revenue", type: "scatter", mode: "lines",
        line: { color: BLUE, width: 2.5, shape: "spline", smoothing: 0.6 }, fill: "tozeroy", fillcolor: FILL,
        hovertemplate: "%{x|%d %b %Y}<br><b>£%{y:,.0f}</b><extra></extra>" },
      { x, y: avg, name: "Rolling avg", type: "scatter", mode: "lines", line: { color: NAVY, width: 1.5, dash: "dot" },
        hovertemplate: "Rolling avg £%{y:,.0f}<extra></extra>" },
    ],
    layout: base({ height: 300, hovermode: "x unified", showlegend: true, legend: legendTop(),
                   xaxis: axis({ showgrid: false, type: "date" }),
                   yaxis: axis({ tickprefix: "£", tickformat: "~s" }) }),
  };
}

export function flow(regions, regionColors, products, flows, regionTotals, productTotals) {
  const labels = [...regions.map((r, i) => `${r}  ${money(regionTotals[i])}`),
                  ...products.map((p, i) => `${p}  ${money(productTotals[i])}`)];
  const source = [], target = [], value = [], color = [];
  flows.forEach((row, ri) => row.forEach((v, pi) => {
    if (v <= 0) return;
    source.push(ri); target.push(regions.length + pi); value.push(v);
    color.push(rgba(regionColors[ri], 0.28));
  }));
  return {
    data: [{
      type: "sankey", arrangement: "fixed",
      node: { label: labels, pad: 14, thickness: 12, line: { width: 0 },
              color: [...regionColors, ...products.map(() => MUTED)],
              hovertemplate: "%{label}<extra></extra>" },
      link: { source, target, value, color,
              hovertemplate: "%{source.label} → %{target.label}<br><b>£%{value:,.0f}</b><extra></extra>" },
      textfont: { family: FONT, color: INK, size: 11 },
    }],
    layout: base({ height: 300, margin: { l: 4, r: 4, t: 8, b: 8 } }),
  };
}

export function regionBars(names, values, colors) {
  const max = Math.max(...values, 0);
  return {
    data: [{ type: "bar", orientation: "h", x: values, y: names, marker: { color: colors, cornerradius: 6 },
             text: values.map(money), textposition: "outside", cliponaxis: false, textfont: { color: INK },
             hovertemplate: "%{y}<br><b>£%{x:,.0f}</b><extra></extra>" }],
    layout: base({ height: 260, bargap: 0.38, margin: { l: 8, r: 56, t: 8, b: 8 },
                   xaxis: axis({ visible: false, range: [0, max ? max * 1.18 : 1] }),
                   yaxis: axis({ showgrid: false, linecolor: "rgba(0,0,0,0)", tickfont: { color: INK } }) }),
  };
}

export function cumulative(months, series) {  // series: [{ name, color, values }]
  if (!months.length || !series.length) return { data: [], layout: base({ height: 300 }) };
  const ymax = Math.max(...series.flatMap((s) => s.values));
  const gap = ymax * 0.08;
  const ends = series.map((s) => ({ v: s.values[s.values.length - 1], s })).sort((a, b) => a.v - b.v);
  let prevY = -Infinity;
  const placed = ends.map(({ v, s }) => { const y = Math.max(v, prevY + gap); prevY = y; return { y, v, s }; });
  const last = months[months.length - 1];
  return {
    data: series.map((s) => ({
      x: months, y: s.values, name: s.name, type: "scatter", mode: "lines", line: { color: s.color, width: 2.5 },
      hovertemplate: `${s.name} <b>£%{y:,.0f}</b><extra></extra>` })),
    layout: base({
      height: 300, hovermode: "x unified", margin: { l: 8, r: 64, t: 8, b: 8 },
      showlegend: true, legend: legendTop(0, "left"),
      xaxis: axis({ showgrid: false, type: "date", dtick: "M6", tickformat: "%b %Y", range: [months[0], last] }),
      yaxis: axis({ tickprefix: "£", tickformat: "~s", range: [0, Math.max(ymax, prevY) * 1.06] }),
      annotations: placed.map(({ y, v, s }) => ({
        x: last, y, text: `<b>${money(v)}</b>`, showarrow: false, xanchor: "left", xshift: 6,
        font: { color: s.color, size: 12 } })),
    }),
  };
}

export function heatmap(z, weekdays) {
  return {
    data: [{ type: "heatmap", z, y: weekdays, x: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`),
             xgap: 3, ygap: 3, showscale: false,
             colorscale: [[0, "#F4F6FA"], [0.35, MIST], [0.7, BLUE_2], [1, NAVY]],
             hovertemplate: "%{y} %{x}<br><b>%{z:,} orders</b><extra></extra>" }],
    layout: base({ height: 250,
                   xaxis: axis({ showgrid: false, dtick: 3, linecolor: "rgba(0,0,0,0)" }),
                   yaxis: axis({ showgrid: false, autorange: "reversed", linecolor: "rgba(0,0,0,0)" }) }),
  };
}

export function live(x, y) {
  return {
    data: [{ x, y, type: "scatter", mode: "lines", line: { color: BLUE, width: 2, shape: "spline" },
             fill: "tozeroy", fillcolor: FILL,
             hovertemplate: "%{x|%H:%M:%S}<br><b>%{y:.0f} orders/min</b><extra></extra>" }],
    layout: base({ height: 130, xaxis: axis({ showgrid: false, type: "date", tickformat: "%H:%M:%S", nticks: 4 }),
                   yaxis: axis({ nticks: 3 }) }),
  };
}

// ---------------------------------------------------------------------------
// Workforce tab
// ---------------------------------------------------------------------------
export function movement(x, starters, leavers, headcount) {
  const t = mirroredTicks(Math.max(...starters, ...leavers), 5);
  return {
    data: [
      { x, y: starters, name: "Starters", type: "bar", marker: { color: BLUE_2 },
        hovertemplate: "Starters <b>%{y}</b><extra></extra>" },
      { x, y: leavers.map((v) => -v), name: "Leavers", type: "bar", marker: { color: SKY }, customdata: leavers,
        hovertemplate: "Leavers <b>%{customdata}</b><extra></extra>" },
      { x, y: headcount, name: "Headcount", yaxis: "y2", type: "scatter", mode: "lines+markers",
        line: { color: NAVY, width: 2.5 }, marker: { size: 5 },
        hovertemplate: "Headcount <b>%{y:,}</b><extra></extra>" },
    ],
    layout: base({
      height: 300, barmode: "relative", bargap: 0.35, hovermode: "x unified", showlegend: true, legend: legendTop(),
      xaxis: axis({ showgrid: false, type: "date", dtick: "M3", tickformat: "%b %Y", hoverformat: "%B %Y" }),
      yaxis: axis({ tickvals: t.vals, ticktext: t.text, range: [-2.4 * t.step, 2.4 * t.step],
                    title: { text: "Starters / leavers", font: { color: MUTED, size: 11 } } }),
      yaxis2: { overlaying: "y", side: "right", showgrid: false, zeroline: false, tickfont: { color: MUTED },
                tickformat: ",d", automargin: true, title: { text: "Headcount", font: { color: MUTED, size: 11 } } },
    }),
  };
}

export function departments(names, fullTime, partTime) {
  const totals = names.map((_, i) => fullTime[i] + partTime[i]);
  return {
    data: [
      { y: names, x: fullTime, name: "Full-time", type: "bar", orientation: "h", marker: { color: NAVY },
        hovertemplate: "%{y} · Full-time <b>%{x}</b><extra></extra>" },
      { y: names, x: partTime, name: "Part-time", type: "bar", orientation: "h", marker: { color: SKY },
        hovertemplate: "%{y} · Part-time <b>%{x}</b><extra></extra>" },
    ],
    layout: base({
      height: 300, barmode: "stack", bargap: 0.35, margin: { l: 8, r: 40, t: 8, b: 8 },
      showlegend: true, legend: legendTop(0, "left"),
      xaxis: axis({ visible: false, range: [0, Math.max(...totals, 1) * 1.15] }),
      yaxis: axis({ showgrid: false, linecolor: "rgba(0,0,0,0)", tickfont: { color: INK } }),
      annotations: names.map((n, i) => ({ x: totals[i], y: n, text: totals[i].toLocaleString("en-GB"), showarrow: false,
                                          xanchor: "left", xshift: 6, font: { color: INK, size: 12 } })),
    }),
  };
}

export function pyramid(bands, male, female) {
  const t = mirroredTicks(Math.max(...male, ...female), 10);
  return {
    data: [
      { y: bands, x: male.map((v) => -v), name: "Male", type: "bar", orientation: "h", marker: { color: NAVY },
        customdata: male, hovertemplate: "%{y} · Male <b>%{customdata}</b><extra></extra>" },
      { y: bands, x: female, name: "Female", type: "bar", orientation: "h", marker: { color: BLUE_2 },
        hovertemplate: "%{y} · Female <b>%{x}</b><extra></extra>" },
    ],
    layout: base({
      height: 300, barmode: "relative", bargap: 0.18, showlegend: true, legend: legendTop(0, "left"),
      xaxis: axis({ tickvals: t.vals, ticktext: t.text, range: [-2.2 * t.step, 2.2 * t.step] }),
      yaxis: axis({ showgrid: false, linecolor: "rgba(0,0,0,0)", type: "category" }),
    }),
  };
}

export function service(labels, counts, median) {
  return {
    data: [{ x: labels, y: counts, type: "bar", marker: { color: BLUE, cornerradius: 4 },
             text: counts, textposition: "outside", cliponaxis: false, textfont: { color: INK },
             hovertemplate: "%{x} years<br><b>%{y} staff</b><extra></extra>" }],
    layout: base({
      height: 260, bargap: 0.3, margin: { l: 8, r: 8, t: 36, b: 8 },
      xaxis: axis({ showgrid: false, type: "category", title: { text: "Years of service", font: { color: MUTED, size: 11 } } }),
      yaxis: axis({ visible: false, range: [0, Math.max(...counts, 1) * 1.18] }),
      annotations: [{ x: 0, y: 1.14, xref: "paper", yref: "paper", xanchor: "left", showarrow: false,
                      text: `Median <b>${median.toFixed(1)} years</b>`, font: { color: INK, size: 13 } }],
    }),
  };
}

export function absence(x, rate, target = 3.5) {
  return {
    data: [{ x, y: rate, type: "scatter", mode: "lines+markers", line: { color: BLUE, width: 2.5 }, marker: { size: 5 },
             fill: "tozeroy", fillcolor: FILL,
             hovertemplate: "%{x|%B %Y}<br><b>%{y:.2f}%</b> of days lost<extra></extra>" }],
    layout: base({
      height: 260,
      xaxis: axis({ showgrid: false, type: "date", dtick: "M6", tickformat: "%b %Y" }),
      yaxis: axis({ ticksuffix: "%", rangemode: "tozero" }),
      shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: target, y1: target,
                 line: { color: MUTED, width: 1, dash: "dot" } }],
      annotations: [{ xref: "paper", x: 0, y: target, yanchor: "bottom", xanchor: "left", showarrow: false,
                      text: `Target ${target}%`, font: { color: MUTED, size: 11 } }],
    }),
  };
}

export function reasons(names, counts) {
  return {
    data: [{ x: counts, y: names, type: "bar", orientation: "h", marker: { color: BLUE, cornerradius: 5 },
             text: counts, textposition: "outside", cliponaxis: false, textfont: { color: INK },
             hovertemplate: "%{y}<br><b>%{x} leavers</b><extra></extra>" }],
    layout: base({
      height: 290, bargap: 0.35, margin: { l: 8, r: 36, t: 8, b: 8 },
      xaxis: axis({ visible: false, range: [0, Math.max(...counts, 1) * 1.15] }),
      yaxis: axis({ showgrid: false, linecolor: "rgba(0,0,0,0)", tickfont: { color: INK }, type: "category" }),
    }),
  };
}
