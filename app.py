"""Bluewave Analytics — an interactive, animated sample dashboard built with Dash + Plotly.

Run:  .venv\\Scripts\\python app.py   then open http://127.0.0.1:8050
Prod: gunicorn app:server
Add ?embed=1 to the URL to hide the header when shown inside an iframe.
All data is synthetic and generated at start-up with a fixed seed.
"""

from datetime import datetime

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from dash import Dash, Input, Output, State, dcc, html

import workforce as wf

# ----------------------------------------------------------------------------
# Palette
# ----------------------------------------------------------------------------
NAVY = "#24385A"
BLUE = "#3F5F92"
BLUE_2 = "#6C88B5"
SKY = "#A9BCD8"
MIST = "#DCE3EE"
INK = "#1D2636"
MUTED = "#64708A"
GRID = "#EDF0F5"
SERIES = [NAVY, BLUE, BLUE_2, SKY]
FONT = "Plus Jakarta Sans, Inter, system-ui, sans-serif"

# ----------------------------------------------------------------------------
# Sample data: ~2 years of B2B transactions
# ----------------------------------------------------------------------------
REGIONS = ["North America", "Europe", "APAC", "LATAM"]
PRODUCTS = ["Analytics", "Cloud", "Security", "Support"]
PRODUCT_P = [0.36, 0.28, 0.21, 0.15]
PRODUCT_PRICE = {"Analytics": 420, "Cloud": 680, "Security": 540, "Support": 160}

rng = np.random.default_rng(7)

_prefix = ["Blue", "North", "Silver", "Clear", "Harbor", "Summit", "Atlas", "Nova",
           "Cobalt", "Pine", "Iron", "Crest", "Lumen", "Tidal"]
_suffix = ["Labs", "Systems", "Logistics", "Health", "Partners", "Foods", "Energy",
           "Media", "Retail", "Capital", "Works", "Dynamics"]
ACCOUNTS = np.array(rng.permutation([f"{p}{s.lower() if i % 3 == 0 else ' ' + s}"
                                     for p in _prefix for i, s in enumerate(_suffix)])[:160])
ACCOUNT_REGION = rng.choice(REGIONS, len(ACCOUNTS), p=[0.40, 0.30, 0.20, 0.10])
ACCOUNT_P = 1 / np.arange(1, len(ACCOUNTS) + 1) ** 0.8
ACCOUNT_P /= ACCOUNT_P.sum()

HOUR_P = 0.15 + np.exp(-((np.arange(24) - 10) ** 2) / 6) + 0.8 * np.exp(-((np.arange(24) - 15) ** 2) / 8)
HOUR_P /= HOUR_P.sum()


def make_transactions() -> pd.DataFrame:
    dates = pd.date_range(end="2026-11-02", periods=730, freq="D")
    t = np.arange(len(dates))
    trend = 1 + 0.55 * t / len(dates)
    season = 1 + 0.12 * np.sin(2 * np.pi * (dates.dayofyear - 80) / 365)
    weekday = np.where(dates.weekday >= 5, 0.55, 1.0)
    per_day = rng.poisson(70 * trend * season * weekday)

    n = per_day.sum()
    acct = rng.choice(len(ACCOUNTS), n, p=ACCOUNT_P)
    product = rng.choice(PRODUCTS, n, p=PRODUCT_P)
    price = np.vectorize(PRODUCT_PRICE.get)(product)
    return pd.DataFrame({
        "date": np.repeat(dates.values, per_day),
        "hour": rng.choice(24, n, p=HOUR_P),
        "account": ACCOUNTS[acct],
        "region": ACCOUNT_REGION[acct],
        "product": product,
        "revenue": price * rng.lognormal(0, 0.45, n),
    })


TX = make_transactions()
MAX_DATE = TX["date"].max()
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
def money(v: float) -> str:
    if abs(v) >= 1e6:
        return f"£{v / 1e6:.2f}M"
    if abs(v) >= 1e3:
        return f"£{v / 1e3:.1f}K"
    return f"£{v:,.0f}"


def base_layout(**kw) -> dict:
    layout = dict(
        font=dict(family=FONT, color=INK, size=12),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        margin=dict(l=8, r=8, t=8, b=8),
        hoverlabel=dict(bgcolor="white", bordercolor=BLUE, font=dict(family=FONT, color=INK)),
        showlegend=False,
    )
    layout.update(kw)
    return layout


def axis(**kw) -> dict:
    a = dict(gridcolor=GRID, zeroline=False, linecolor=GRID, tickfont=dict(color=MUTED), automargin=True)
    a.update(kw)
    return a


def filter_tx(period: str, regions: list, products: list):
    d = TX
    if regions:
        d = d[d["region"].isin(regions)]
    if products:
        d = d[d["product"].isin(products)]
    if period == "all":
        return d, None
    days = int(period)
    start = MAX_DATE - pd.Timedelta(days=days - 1)
    cur = d[d["date"] >= start]
    prev = d[(d["date"] < start) & (d["date"] >= start - pd.Timedelta(days=days))]
    return cur, prev


def kpis(d: pd.DataFrame) -> dict:
    rev = d["revenue"].sum()
    orders = len(d)
    return {"revenue": rev, "orders": orders, "aov": rev / orders if orders else 0,
            "customers": d["account"].nunique()}


def delta_badge(cur: float, prev: float | None, note="vs previous period", invert=False, points=False):
    """Change badge. invert: a rise is bad (shown red). points: show the change in percentage points."""
    if prev is None:
        return html.Span("All time", className="delta neutral")
    if not prev:
        return html.Span("—", className="delta neutral")
    change = cur - prev if points else (cur - prev) / prev * 100
    good = (change >= 0) != invert
    arrow = "▲" if change >= 0 else "▼"
    text = f"{arrow} {abs(change):.1f} pts" if points else f"{arrow} {abs(change):.1f}%"
    return [html.Span(text, className=f"delta {'up' if good else 'down'}"),
            html.Span(f" {note}", className="delta-note")]


# ----------------------------------------------------------------------------
# Figures
# ----------------------------------------------------------------------------
def fig_spark(series: pd.Series) -> go.Figure:
    fig = go.Figure(go.Scatter(
        x=series.index, y=series.values, mode="lines", line=dict(color=BLUE, width=2, shape="spline"),
        fill="tozeroy", fillcolor="rgba(63,95,146,0.10)", hoverinfo="skip"))
    fig.update_layout(**base_layout(margin=dict(l=0, r=0, t=0, b=0), height=46,
                                    xaxis=dict(visible=False), yaxis=dict(visible=False)))
    return fig


def time_buckets(d: pd.DataFrame, period: str):
    """Group by day for short periods, else by 7-day weeks ending on the last date (partial first week dropped)."""
    if period in ("30", "90"):
        return d.groupby(pd.Grouper(key="date", freq="D"))
    span = (MAX_DATE - d["date"].min()).days + 1 if len(d) else 0
    d = d[d["date"] > MAX_DATE - pd.Timedelta(days=span // 7 * 7)]
    return d.groupby(pd.Grouper(key="date", freq="7D", origin="end", closed="right", label="right"))


def fig_trend(d: pd.DataFrame, period: str) -> go.Figure:
    daily = period in ("30", "90")
    s = time_buckets(d, period)["revenue"].sum()
    avg = s.rolling(7 if daily else 4, min_periods=1).mean()
    fig = go.Figure([
        go.Scatter(x=s.index, y=s.values, name="Revenue", mode="lines",
                   line=dict(color=BLUE, width=2.5, shape="spline", smoothing=0.6),
                   fill="tozeroy", fillcolor="rgba(63,95,146,0.10)",
                   hovertemplate="%{x|%d %b %Y}<br><b>£%{y:,.0f}</b><extra></extra>"),
        go.Scatter(x=avg.index, y=avg.values, name="Rolling avg", mode="lines",
                   line=dict(color=NAVY, width=1.5, dash="dot"),
                   hovertemplate="Rolling avg £%{y:,.0f}<extra></extra>"),
    ])
    fig.update_layout(**base_layout(
        hovermode="x unified", height=300,
        xaxis=axis(showgrid=False), yaxis=axis(tickprefix="£", tickformat="~s"),
        showlegend=True, legend=dict(orientation="h", y=1.08, x=1, xanchor="right", font=dict(color=MUTED)),
    ))
    return fig


def rgba(hex_color: str, alpha: float) -> str:
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return f"rgba({r},{g},{b},{alpha})"


def fig_flow(d: pd.DataFrame) -> go.Figure:
    """Sankey of revenue flowing from each region into each product."""
    flows = d.groupby(["region", "product"])["revenue"].sum()
    regs = [r for r in REGIONS if r in flows.index.get_level_values(0)]
    prods = [p for p in PRODUCTS if p in flows.index.get_level_values(1)]
    reg_tot = flows.groupby(level=0).sum()
    prod_tot = flows.groupby(level=1).sum()
    colors = dict(zip(REGIONS, SERIES))

    labels = [f"{r}  {money(reg_tot[r])}" for r in regs] + [f"{p}  {money(prod_tot[p])}" for p in prods]
    src, tgt, val, link_colors = [], [], [], []
    for (r, p), v in flows.items():
        src.append(regs.index(r))
        tgt.append(len(regs) + prods.index(p))
        val.append(float(v))
        link_colors.append(rgba(colors[r], 0.28))

    fig = go.Figure(go.Sankey(
        arrangement="fixed",
        node=dict(label=labels, pad=14, thickness=12, line=dict(width=0),
                  color=[colors[r] for r in regs] + [MUTED] * len(prods),
                  hovertemplate="%{label}<extra></extra>"),
        link=dict(source=src, target=tgt, value=val, color=link_colors,
                  hovertemplate="%{source.label} → %{target.label}<br><b>£%{value:,.0f}</b><extra></extra>"),
        textfont=dict(family=FONT, color=INK, size=11),
    ))
    fig.update_layout(**base_layout(height=300, margin=dict(l=4, r=4, t=8, b=8)))
    return fig


def fig_regions(d: pd.DataFrame) -> go.Figure:
    s = d.groupby("region")["revenue"].sum().reindex(REGIONS).fillna(0).sort_values()
    fig = go.Figure(go.Bar(
        x=s.values, y=s.index, orientation="h",
        marker=dict(color=[SKY, BLUE_2, BLUE, NAVY][-len(s):], cornerradius=6),
        text=[money(v) for v in s.values], textposition="outside", cliponaxis=False,
        textfont=dict(color=INK), hovertemplate="%{y}<br><b>£%{x:,.0f}</b><extra></extra>"))
    fig.update_layout(**base_layout(
        height=260, bargap=0.38, margin=dict(l=8, r=56, t=8, b=8),
        xaxis=axis(visible=False, range=[0, s.max() * 1.18 if s.max() else 1]),
        yaxis=axis(showgrid=False, linecolor="rgba(0,0,0,0)", tickfont=dict(color=INK)),
    ))
    return fig


def fig_heatmap(d: pd.DataFrame) -> go.Figure:
    grid = (d.assign(wd=d["date"].dt.weekday).groupby(["wd", "hour"]).size()
            .unstack(fill_value=0).reindex(index=range(7), columns=range(24), fill_value=0))
    fig = go.Figure(go.Heatmap(
        z=grid.values, x=[f"{h:02d}:00" for h in range(24)], y=WEEKDAYS, xgap=3, ygap=3,
        colorscale=[[0, "#F4F6FA"], [0.35, MIST], [0.7, BLUE_2], [1, NAVY]], showscale=False,
        hovertemplate="%{y} %{x}<br><b>%{z:,} orders</b><extra></extra>"))
    fig.update_layout(**base_layout(
        height=250, xaxis=axis(showgrid=False, dtick=3, linecolor="rgba(0,0,0,0)"),
        yaxis=axis(showgrid=False, autorange="reversed", linecolor="rgba(0,0,0,0)")))
    return fig


def fig_cumulative(d: pd.DataFrame, regions: list) -> go.Figure:
    regs = [r for r in REGIONS if not regions or r in regions]
    colors = dict(zip(REGIONS, SERIES))
    m = (d.assign(month=d["date"].dt.to_period("M").dt.to_timestamp())
         .groupby(["month", "region"])["revenue"].sum().unstack(fill_value=0)
         .reindex(columns=regs, fill_value=0).cumsum())
    if m.empty:
        return go.Figure().update_layout(**base_layout(height=300))

    fig = go.Figure([
        go.Scatter(x=m.index, y=m[r], name=r, mode="lines", line=dict(color=colors[r], width=2.5),
                   hovertemplate=f"{r} <b>£%{{y:,.0f}}</b><extra></extra>")
        for r in regs
    ])

    # End-of-line value labels, nudged apart so close finishers don't overlap.
    ymax = float(m.values.max())
    gap = ymax * 0.08
    ends = sorted(((float(m[r].iloc[-1]), r) for r in regs))
    placed = []
    for v, r in ends:
        y = max(v, placed[-1][0] + gap) if placed else v
        placed.append((y, v, r))
    fig.update_layout(**base_layout(
        height=300, hovermode="x unified", margin=dict(l=8, r=64, t=8, b=8),
        showlegend=True, legend=dict(orientation="h", y=1.08, x=0, font=dict(color=MUTED)),
        xaxis=axis(showgrid=False, dtick="M6", tickformat="%b %Y", range=[m.index[0], m.index[-1]]),
        yaxis=axis(tickprefix="£", tickformat="~s", range=[0, max(ymax, placed[-1][0]) * 1.06]),
        annotations=[dict(x=m.index[-1], y=y, text=f"<b>{money(v)}</b>", showarrow=False,
                          xanchor="left", xshift=6, font=dict(color=colors[r], size=12))
                     for y, v, r in placed],
    ))
    return fig


def fig_live_initial() -> go.Figure:
    now = pd.Timestamp.now().floor("s")
    # Plain lists, not numpy arrays: Plotly would encode those as typed arrays, which extendData can't append to.
    xs = pd.date_range(end=now, periods=60, freq="2s").strftime("%Y-%m-%d %H:%M:%S").tolist()
    ys = np.clip(12 + np.cumsum(rng.normal(0, 1.2, 60)), 3, None).round(1).tolist()
    fig = go.Figure(go.Scatter(
        x=xs, y=ys, mode="lines", line=dict(color=BLUE, width=2, shape="spline"),
        fill="tozeroy", fillcolor="rgba(63,95,146,0.10)",
        hovertemplate="%{x|%H:%M:%S}<br><b>%{y:.0f} orders/min</b><extra></extra>"))
    fig.update_layout(**base_layout(height=130,
                                    xaxis=axis(showgrid=False, tickformat="%H:%M:%S", nticks=4),
                                    yaxis=axis(nticks=3)))
    return fig


# ----------------------------------------------------------------------------
# Workforce tab: metrics and figures
# ----------------------------------------------------------------------------
YEAR = pd.Timedelta(days=365)
LAST_12_START = (wf.AS_OF - YEAR).to_period("M").to_timestamp()  # first of the 12 complete absence months


def wf_filter(depts: list, locs: list):
    e, a, v = wf.EMPLOYEES, wf.ABSENCE, wf.VACANCIES
    if depts:
        e, a, v = e[e["department"].isin(depts)], a[a["department"].isin(depts)], v[v["department"].isin(depts)]
    if locs:
        e, a, v = e[e["location"].isin(locs)], a[a["location"].isin(locs)], v[v["location"].isin(locs)]
    return e, a, v


def active_at(e: pd.DataFrame, t: pd.Timestamp) -> pd.Series:
    return (e["hire_date"] <= t) & (e["leave_date"].isna() | (e["leave_date"] > t))


def turnover_rate(e: pd.DataFrame, end: pd.Timestamp) -> float:
    """Leavers in the 12 months to `end` as a % of average headcount over those months."""
    leavers = e["leave_date"].between(end - YEAR, end, inclusive="right").sum()
    avg = np.mean([active_at(e, end - pd.Timedelta(days=30 * k)).sum() for k in range(13)])
    return leavers / avg * 100 if avg else 0.0


def absence_rate(a: pd.DataFrame) -> float:
    days = a["days_available"].sum()
    return a["days_lost"].sum() / days * 100 if days else 0.0


def wf_monthly(e: pd.DataFrame) -> pd.DataFrame:
    """Per month: headcount and FTE at month end, starters and leavers during the month."""
    rows = []
    for end in wf.MONTH_ENDS:
        start = end - pd.offsets.MonthBegin(1)
        act = active_at(e, end)
        rows.append({"month": start, "headcount": int(act.sum()), "fte": e.loc[act, "fte"].sum(),
                     "starters": int(e["hire_date"].between(start, end).sum()),
                     "leavers": int(e["leave_date"].between(start, end).sum())})
    return pd.DataFrame(rows).set_index("month")


def fig_movement(m: pd.DataFrame) -> go.Figure:
    top = max(int(m[["starters", "leavers"]].values.max()), 1)
    step = max(5, int(np.ceil(top / 2 / 5) * 5))
    ticks = [-2 * step, -step, 0, step, 2 * step]
    fig = go.Figure([
        go.Bar(x=m.index, y=m["starters"], name="Starters", marker_color=BLUE_2,
               hovertemplate="Starters <b>%{y}</b><extra></extra>"),
        go.Bar(x=m.index, y=-m["leavers"], name="Leavers", marker_color=SKY, customdata=m["leavers"],
               hovertemplate="Leavers <b>%{customdata}</b><extra></extra>"),
        go.Scatter(x=m.index, y=m["headcount"], name="Headcount", yaxis="y2", mode="lines+markers",
                   line=dict(color=NAVY, width=2.5), marker=dict(size=5),
                   hovertemplate="Headcount <b>%{y:,}</b><extra></extra>"),
    ])
    fig.update_layout(**base_layout(
        height=300, barmode="relative", bargap=0.35, hovermode="x unified",
        showlegend=True, legend=dict(orientation="h", y=1.08, x=1, xanchor="right", font=dict(color=MUTED)),
        xaxis=axis(showgrid=False, dtick="M3", tickformat="%b %Y", hoverformat="%B %Y"),
        yaxis=axis(tickvals=ticks, ticktext=[str(abs(t)) for t in ticks], range=[-2.4 * step, 2.4 * step],
                   title=dict(text="Starters / leavers", font=dict(color=MUTED, size=11))),
        yaxis2=dict(overlaying="y", side="right", showgrid=False, zeroline=False, tickfont=dict(color=MUTED),
                    tickformat=",d",
                    title=dict(text="Headcount", font=dict(color=MUTED, size=11)), automargin=True),
    ))
    return fig


def fig_departments(act: pd.DataFrame) -> go.Figure:
    g = (act.assign(contract=np.where(act["fte"] < 1, "Part-time", "Full-time"))
         .groupby(["department", "contract"]).size().unstack(fill_value=0)
         .reindex(columns=["Full-time", "Part-time"], fill_value=0))
    g = g.loc[g.sum(axis=1).sort_values().index]
    totals = g.sum(axis=1)
    fig = go.Figure([
        go.Bar(y=g.index, x=g[c], name=c, orientation="h", marker_color=color,
               hovertemplate=f"%{{y}} · {c} <b>%{{x}}</b><extra></extra>")
        for c, color in (("Full-time", NAVY), ("Part-time", SKY))
    ])
    fig.update_layout(**base_layout(
        height=300, barmode="stack", bargap=0.35, margin=dict(l=8, r=40, t=8, b=8),
        showlegend=True, legend=dict(orientation="h", y=1.08, x=0, traceorder="normal", font=dict(color=MUTED)),
        xaxis=axis(visible=False, range=[0, totals.max() * 1.15 if len(totals) else 1]),
        yaxis=axis(showgrid=False, linecolor="rgba(0,0,0,0)", tickfont=dict(color=INK)),
        annotations=[dict(x=v, y=d, text=f"{v:,}", showarrow=False, xanchor="left", xshift=6,
                          font=dict(color=INK, size=12)) for d, v in totals.items()],
    ))
    return fig


def fig_pyramid(act: pd.DataFrame) -> go.Figure:
    g = (act[act["gender"].isin(["Female", "Male"])].groupby(["age_band", "gender"]).size().unstack(fill_value=0)
         .reindex(index=wf.AGE_BANDS, columns=["Male", "Female"], fill_value=0))
    top = max(int(g.values.max()), 1)
    step = max(10, int(np.ceil(top / 2 / 10) * 10))
    ticks = [-2 * step, -step, 0, step, 2 * step]
    fig = go.Figure([
        go.Bar(y=g.index, x=-g["Male"], name="Male", orientation="h", marker_color=NAVY, customdata=g["Male"],
               hovertemplate="%{y} · Male <b>%{customdata}</b><extra></extra>"),
        go.Bar(y=g.index, x=g["Female"], name="Female", orientation="h", marker_color=BLUE_2,
               hovertemplate="%{y} · Female <b>%{x}</b><extra></extra>"),
    ])
    fig.update_layout(**base_layout(
        height=300, barmode="relative", bargap=0.18,
        showlegend=True, legend=dict(orientation="h", y=1.08, x=0, font=dict(color=MUTED)),
        xaxis=axis(tickvals=ticks, ticktext=[str(abs(t)) for t in ticks], range=[-2.2 * step, 2.2 * step]),
        yaxis=axis(showgrid=False, linecolor="rgba(0,0,0,0)"),
    ))
    return fig


def fig_service(act: pd.DataFrame) -> go.Figure:
    years = (wf.AS_OF - act["hire_date"]).dt.days / 365.25
    labels = ["<1", "1–2", "2–5", "5–10", "10+"]
    counts = pd.cut(years, [-1, 1, 2, 5, 10, 100], labels=labels).value_counts().reindex(labels, fill_value=0)
    median = years.median() if len(years) else 0
    fig = go.Figure(go.Bar(
        x=labels, y=counts.values, marker=dict(color=BLUE, cornerradius=4),
        text=counts.values, textposition="outside", cliponaxis=False, textfont=dict(color=INK),
        hovertemplate="%{x} years<br><b>%{y} staff</b><extra></extra>"))
    fig.update_layout(**base_layout(
        height=260, bargap=0.3, margin=dict(l=8, r=8, t=36, b=8),
        xaxis=axis(showgrid=False, title=dict(text="Years of service", font=dict(color=MUTED, size=11))),
        yaxis=axis(visible=False, range=[0, max(counts.max(), 1) * 1.18]),
        annotations=[dict(x=0, y=1.14, xref="paper", yref="paper", xanchor="left", showarrow=False,
                          text=f"Median <b>{median:.1f} years</b>", font=dict(color=INK, size=13))],
    ))
    return fig


def fig_absence(a: pd.DataFrame, target=3.5) -> go.Figure:
    g = a.groupby("month")[["days_lost", "days_available"]].sum()
    rate = g["days_lost"] / g["days_available"] * 100
    fig = go.Figure(go.Scatter(
        x=rate.index, y=rate.values, mode="lines+markers", line=dict(color=BLUE, width=2.5),
        marker=dict(size=5), fill="tozeroy", fillcolor="rgba(63,95,146,0.10)",
        hovertemplate="%{x|%B %Y}<br><b>%{y:.2f}%</b> of days lost<extra></extra>"))
    fig.add_hline(y=target, line=dict(color=MUTED, width=1, dash="dot"),
                  annotation=dict(text=f"Target {target}%", font=dict(color=MUTED, size=11),
                                  xanchor="left", x=0, yanchor="bottom"))
    fig.update_layout(**base_layout(
        height=260, xaxis=axis(showgrid=False, dtick="M6", tickformat="%b %Y"),
        yaxis=axis(ticksuffix="%", rangemode="tozero")))
    return fig


def fig_leaving_reasons(e: pd.DataFrame) -> go.Figure:
    recent = e[e["leave_date"].between(wf.AS_OF - YEAR, wf.AS_OF, inclusive="right")]
    s = recent["leave_reason"].value_counts().reindex(wf.REASONS, fill_value=0).sort_values()
    fig = go.Figure(go.Bar(
        x=s.values, y=s.index, orientation="h", marker=dict(color=BLUE, cornerradius=5),
        text=s.values, textposition="outside", cliponaxis=False, textfont=dict(color=INK),
        hovertemplate="%{y}<br><b>%{x} leavers</b><extra></extra>"))
    fig.update_layout(**base_layout(
        height=290, bargap=0.35, margin=dict(l=8, r=36, t=8, b=8),
        xaxis=axis(visible=False, range=[0, max(s.max(), 1) * 1.15]),
        yaxis=axis(showgrid=False, linecolor="rgba(0,0,0,0)", tickfont=dict(color=INK))))
    return fig


def scorecard(e: pd.DataFrame, a: pd.DataFrame, v: pd.DataFrame):
    last_12 = a[a["month"] >= LAST_12_START]
    head = html.Div(className="sc-row sc-head", children=[
        html.Span(h) for h in ("Department", "Headcount", "Turnover", "Absence", "Engagement", "Open roles")])
    rows = []
    for d in wf.DEPARTMENTS:
        ed = e[e["department"] == d]
        if ed.empty:
            continue
        act = ed[active_at(ed, wf.AS_OF)]
        turn = turnover_rate(ed, wf.AS_OF)
        absn = absence_rate(last_12[last_12["department"] == d])
        eng = act["engagement"].mean()
        roles = int(v.loc[v["department"] == d, "open_roles"].sum())
        rows.append(html.Div(className="sc-row", children=[
            html.Span(d, className="sc-name"),
            html.Span(f"{len(act):,}"),
            html.Span(f"{turn:.1f}%", className=f"pill {'warn' if turn >= 16 else 'ok'}"),
            html.Span(f"{absn:.1f}%", className=f"pill {'warn' if absn >= 4 else 'ok'}"),
            html.Span(f"{eng:.0f}", className=f"pill {'warn' if eng < 66 else 'ok'}"),
            html.Span(f"{roles}"),
        ]))
    return [head] + rows if rows else [html.P("No data for this selection.", className="sub")]


# ----------------------------------------------------------------------------
# Layout
# ----------------------------------------------------------------------------
GRAPH_CFG = {"displayModeBar": False, "responsive": True}


def graph(id_, height, **kw):
    return dcc.Graph(id=id_, config=GRAPH_CFG, style={"height": f"{height}px"}, **kw)


def card(title, body, cls="", subtitle=None, extra=None):
    head = [html.Div([html.H3(title), html.P(subtitle, className="sub") if subtitle else None])]
    if extra is not None:
        head.append(extra)
    return html.Section(className=f"card {cls}", children=[html.Div(head, className="card-head"), body])


def kpi(label, key, fmt):
    return html.Section(className="card kpi", children=[
        html.Div(label, className="kpi-label"),
        html.Div(id=f"kpi-{key}", className="kpi-value",
                 children=html.Span(className="countup", id=f"cu-{key}", **{"data-value": 0, "data-format": fmt})),
        html.Div(id=f"delta-{key}", className="delta-row"),
        dcc.Graph(id=f"spark-{key}", config={"displayModeBar": False, "staticPlot": True}, className="spark"),
    ])


app = Dash(
    __name__, title="Bluewave Analytics",
    assets_ignore=r"embed-host\.js",  # served for host sites to load, not run by the dashboard itself
    external_stylesheets=["https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"],
)
server = app.server  # WSGI entry point for gunicorn

app.layout = html.Div(id="page", className="page tab-sales", children=[
    html.Header(className="hero", children=[
        html.Div(className="hero-inner", children=[
            html.Div(className="brand", children=[
                html.Div(className="logo", children=html.Span()),
                html.Div([html.H1("Bluewave Analytics"),
                          html.P(f"Sample business performance · data through {MAX_DATE:%d %b %Y}",
                                 className="tagline")]),
            ]),
            html.Div(className="live-pill only-sales", children=[html.Span(className="pulse"), "Live"]),
        ]),
        html.Div(className="hero-inner tabbar", children=dcc.RadioItems(
            id="tab", value="sales", className="tabs", inline=True,
            options=[{"label": "Revenue", "value": "sales"}, {"label": "Workforce", "value": "workforce"}])),
        html.Div(className="filters hero-inner only-workforce", children=[
            html.Div(className="filter", children=[
                html.Label("Department"),
                dcc.Checklist(id="wf-depts", value=wf.DEPARTMENTS, options=wf.DEPARTMENTS,
                              className="chips", inline=True),
            ]),
            html.Div(className="filter", children=[
                html.Label("Location"),
                dcc.Checklist(id="wf-locs", value=wf.LOCATIONS, options=wf.LOCATIONS,
                              className="chips", inline=True),
            ]),
        ]),
        html.Div(className="filters hero-inner only-sales", children=[
            html.Div(className="filter", children=[
                html.Label("Period"),
                dcc.RadioItems(id="period", value="90", className="segmented", inline=True,
                               options=[{"label": l, "value": v} for l, v in
                                        [("30D", "30"), ("90D", "90"), ("12M", "365"), ("All", "all")]]),
            ]),
            html.Div(className="filter", children=[
                html.Label("Region"),
                dcc.Checklist(id="regions", value=REGIONS, options=REGIONS, className="chips", inline=True),
            ]),
            html.Div(className="filter", children=[
                html.Label("Product"),
                dcc.Checklist(id="products", value=PRODUCTS, options=PRODUCTS, className="chips", inline=True),
            ]),
        ]),
    ]),

    html.Main(className="grid only-sales", children=[
        kpi("Revenue", "revenue", "money"),
        kpi("Orders", "orders", "int"),
        kpi("Avg order value", "aov", "money2"),
        kpi("Active customers", "customers", "int"),

        card("Revenue trend", graph("trend", 300), cls="span-8",
             subtitle="Total revenue with rolling average"),
        card("Revenue flow", graph("flow", 300), cls="span-4",
             subtitle="From region to product, selected period"),

        card("Cumulative revenue by region", graph("cumulative", 300), cls="span-5",
             subtitle="All time, month by month"),
        card("Revenue by region", graph("regionbars", 260), cls="span-3",
             subtitle="Selected period"),
        card("Live orders", html.Div([
            html.Div(className="today", children=[
                html.Span("Today", className="kpi-label"),
                html.Div(id="today-wrap", className="today-value"),
            ]),
            graph("live", 130, figure=fig_live_initial()),
            html.Ul(id="feed", className="feed"),
        ]), cls="span-4", subtitle="Streaming every 2 seconds",
            extra=html.Span(className="pulse small")),

        card("When customers buy", graph("heatmap", 250), cls="span-7",
             subtitle="Orders by weekday and hour"),
        card("Top accounts", html.Div(id="accounts", className="accounts"), cls="span-5",
             subtitle="Highest revenue in selected period"),
    ]),

    html.Main(className="grid only-workforce", children=[
        kpi("Headcount", "wf_headcount", "int"),
        kpi("Full-time equivalent", "wf_fte", "dec1"),
        kpi("Staff turnover (12m)", "wf_turnover", "pct"),
        kpi("Sickness absence (12m)", "wf_absence", "pct"),

        card("Starters, leavers & headcount", graph("wf-movement", 300), cls="span-8",
             subtitle="Monthly, last 24 months"),
        card("Staff by department", graph("wf-departments", 300), cls="span-4",
             subtitle="Current headcount by contract type"),

        card("Age & gender profile", graph("wf-pyramid", 300), cls="span-5",
             subtitle="Current staff by age band"),
        card("Length of service", graph("wf-service", 260), cls="span-3",
             subtitle="Current staff by years since joining"),
        card("Sickness absence rate", graph("wf-absence", 260), cls="span-4",
             subtitle="% of available working days lost"),

        card("Department scorecard", html.Div(className="scorecard-wrap",
                                              children=html.Div(id="wf-scorecard", className="scorecard")),
             cls="span-7", subtitle="Rolling 12 months · red = needs attention"),
        card("Why people leave", graph("wf-reasons", 290), cls="span-5",
             subtitle="Leavers in the last 12 months by reason"),
    ]),
    html.Footer("Synthetic sample data · built with Dash & Plotly", className="foot"),

    dcc.Interval(id="tick", interval=2000),
    dcc.Store(id="live-state", data={"today": float(TX.loc[TX["date"] == MAX_DATE, "revenue"].sum()),
                                     "orders": [], "seq": 0}),
])


# ----------------------------------------------------------------------------
# Callbacks
# ----------------------------------------------------------------------------
@app.callback(
    [Output(f"kpi-{k}", "children") for k in ("revenue", "orders", "aov", "customers")]
    + [Output(f"delta-{k}", "children") for k in ("revenue", "orders", "aov", "customers")]
    + [Output(f"spark-{k}", "figure") for k in ("revenue", "orders", "aov", "customers")]
    + [Output("trend", "figure"), Output("flow", "figure"), Output("regionbars", "figure"),
       Output("heatmap", "figure"), Output("cumulative", "figure"), Output("accounts", "children")],
    Input("period", "value"), Input("regions", "value"), Input("products", "value"),
)
def update(period, regions, products):
    cur, prev = filter_tx(period, regions, products)
    k_cur = kpis(cur)
    k_prev = kpis(prev) if prev is not None else None
    fmts = {"revenue": "money", "orders": "int", "aov": "money2", "customers": "int"}

    values = [html.Span(className="countup", id=f"cu-{k}", **{"data-value": round(k_cur[k], 2), "data-format": f})
              for k, f in fmts.items()]
    deltas = [delta_badge(k_cur[k], k_prev[k] if k_prev else None) for k in fmts]

    by_day = time_buckets(cur, period)
    spark_series = {
        "revenue": by_day["revenue"].sum(),
        "orders": by_day.size(),
        "aov": by_day["revenue"].mean().fillna(0),
        "customers": by_day["account"].nunique(),
    }
    sparks = [fig_spark(spark_series[k]) for k in fmts]

    top = cur.groupby(["account", "region"])["revenue"].sum().nlargest(7).reset_index()
    top_max = top["revenue"].max() if len(top) else 1
    accounts = [html.Div(className="acct", key=r.account, children=[
        html.Div(className="acct-top", children=[
            html.Span(f"{i + 1:02d}", className="rank"),
            html.Span(r.account, className="acct-name"),
            html.Span(r.region, className="acct-region"),
            html.Span(money(r.revenue), className="acct-rev"),
        ]),
        html.Div(className="bar", children=html.Div(className="bar-fill",
                                                     style={"width": f"{r.revenue / top_max * 100:.1f}%"})),
    ]) for i, r in enumerate(top.itertuples())] or [html.P("No data for this selection.", className="sub")]

    cumulative_src = TX[TX["product"].isin(products)] if products else TX
    if regions:
        cumulative_src = cumulative_src[cumulative_src["region"].isin(regions)]

    return (values + deltas + sparks
            + [fig_trend(cur, period), fig_flow(cur), fig_regions(cur), fig_heatmap(cur),
               fig_cumulative(cumulative_src, regions), accounts])


@app.callback(
    Output("live", "extendData"), Output("feed", "children"), Output("today-wrap", "children"),
    Output("live-state", "data"),
    Input("tick", "n_intervals"), State("live-state", "data"),
)
def stream(_, state):
    burst = int(rng.integers(1, 4))
    acct = rng.choice(len(ACCOUNTS), burst, p=ACCOUNT_P)
    product = rng.choice(PRODUCTS, burst, p=PRODUCT_P)
    for a, p in zip(acct, product):
        state["seq"] += 1
        amount = float(PRODUCT_PRICE[p] * rng.lognormal(0, 0.45))
        state["today"] += amount
        state["orders"].insert(0, {"id": state["seq"], "account": str(ACCOUNTS[a]),
                                   "region": str(ACCOUNT_REGION[a]), "product": str(p),
                                   "amount": amount, "time": datetime.now().strftime("%H:%M:%S")})
    state["orders"] = state["orders"][:5]

    rate = max(3.0, 12 + 4 * np.sin(state["seq"] / 9) + rng.normal(0, 1.5))
    extend = (dict(x=[[datetime.now().strftime("%Y-%m-%d %H:%M:%S")]], y=[[rate]]), [0], 60)

    feed = [html.Li(key=str(o["id"]), className="feed-item", children=[
        html.Span(className=f"feed-dot p{PRODUCTS.index(o['product'])}"),
        html.Div([html.Div(o["account"], className="feed-acct"),
                  html.Div(f"{o['product']} · {o['region']} · {o['time']}", className="feed-meta")]),
        html.Span(money(o["amount"]), className="feed-amt"),
    ]) for o in state["orders"]]

    today = html.Span(className="countup", id="cu-today", **{"data-value": round(state["today"], 2),
                                                               "data-format": "money"})
    return extend, feed, today, state


@app.callback(
    [Output(f"kpi-wf_{k}", "children") for k in ("headcount", "fte", "turnover", "absence")]
    + [Output(f"delta-wf_{k}", "children") for k in ("headcount", "fte", "turnover", "absence")]
    + [Output(f"spark-wf_{k}", "figure") for k in ("headcount", "fte", "turnover", "absence")]
    + [Output("wf-movement", "figure"), Output("wf-departments", "figure"), Output("wf-pyramid", "figure"),
       Output("wf-service", "figure"), Output("wf-absence", "figure"), Output("wf-reasons", "figure"),
       Output("wf-scorecard", "children")],
    Input("wf-depts", "value"), Input("wf-locs", "value"),
)
def update_workforce(depts, locs):
    e, a, v = wf_filter(depts, locs)
    now, year_ago = wf.AS_OF, wf.AS_OF - YEAR
    act, act_prev = e[active_at(e, now)], e[active_at(e, year_ago)]
    a_cur, a_prev = a[a["month"] >= LAST_12_START], a[a["month"] < LAST_12_START]

    cur = {"headcount": len(act), "fte": act["fte"].sum(),
           "turnover": turnover_rate(e, now), "absence": absence_rate(a_cur)}
    prev = {"headcount": len(act_prev), "fte": act_prev["fte"].sum(),
            "turnover": turnover_rate(e, year_ago), "absence": absence_rate(a_prev)}
    fmts = {"headcount": "int", "fte": "dec1", "turnover": "pct", "absence": "pct"}

    values = [html.Span(className="countup", id=f"cu-wf_{k}", **{"data-value": round(cur[k], 2), "data-format": f})
              for k, f in fmts.items()]
    note = "vs 12 months ago"
    deltas = [delta_badge(cur["headcount"], prev["headcount"], note),
              delta_badge(cur["fte"], prev["fte"], note),
              delta_badge(cur["turnover"], prev["turnover"], "vs prior 12m", invert=True, points=True),
              delta_badge(cur["absence"], prev["absence"], "vs prior 12m", invert=True, points=True)]

    m = wf_monthly(e)
    monthly_absence = a.groupby("month")[["days_lost", "days_available"]].sum()
    sparks = [fig_spark(m["headcount"]), fig_spark(m["fte"]), fig_spark(m["leavers"]),
              fig_spark(monthly_absence["days_lost"] / monthly_absence["days_available"] * 100)]

    return (values + deltas + sparks
            + [fig_movement(m), fig_departments(act), fig_pyramid(act), fig_service(act),
               fig_absence(a), fig_leaving_reasons(e), scorecard(e, a, v)])


# Switch tabs by class on the page (both tabs stay mounted, so filters and the live feed keep
# their state), then nudge Plotly to re-measure charts that were hidden while the tab was off.
app.clientside_callback(
    """(tab) => {
        requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
        return "page tab-" + tab;
    }""",
    Output("page", "className"), Input("tab", "value"),
)


if __name__ == "__main__":
    app.run(debug=False, port=8050)
