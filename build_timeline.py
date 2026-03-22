"""Build an interactive HTML timeline of golf competitions with cost overlay.

Click on any recommended pick to deselect/reselect it.
Budget and bar chart update automatically.
"""

import csv
import json
from datetime import date, datetime, timedelta
from collections import defaultdict
import plotly.graph_objects as go
from plotly.subplots import make_subplots

INPUT_CSV = "data/competitions_2026_u17_costs.csv"
OUTPUT_HTML = "competition_timeline.html"

SOURCES = ("club", "grand_prix")
COLORS = {
    "club": "#22c55e",
    "grand_prix": "#f97316",
}
SOURCE_LABELS = {
    "club": "Club",
    "grand_prix": "Grand Prix",
}
SYMBOLS = {
    "club": "circle",
    "grand_prix": "square",
}
DESELECTED_OPACITY = 0.15
DESELECTED_SIZE = 6
SELECTED_OPACITY = 0.9
SELECTED_SIZE = 11
AVAIL_OPACITY = 0.12
AVAIL_SIZE = 5


def is_eligible(d: date) -> bool:
    return date(2026, 3, 22) <= d <= date(2026, 12, 31)


def is_recommended(row: dict) -> bool:
    """Initial pass: mark all eligible candidates. Narrowed down later."""
    source = row["source"]
    cat = row["distance_category"]

    if source == "club" and cat == "local":
        return True
    if source == "grand_prix" and cat in ("local", "regional"):
        return True
    return False


GP_MONTHS = {"2026-06", "2026-07", "2026-09", "2026-10", "2026-11"}
CLUB_PER_MONTH = 2


def narrow_recommendations(eligible: list[dict]):
    """Narrow picks: 2 closest clubs/month + 1 closest GP in selected months."""
    # Clubs: pick 2 closest per month
    clubs = [r for r in eligible if r["source"] == "club" and r["_recommended"]]
    clubs_by_month = {}
    for r in clubs:
        m = r["date_start"][:7]
        clubs_by_month.setdefault(m, []).append(r)

    club_picks = set()
    for m, evts in clubs_by_month.items():
        evts.sort(key=lambda r: int(r["driving_minutes"]))
        for r in evts[:CLUB_PER_MONTH]:
            club_picks.add(id(r))

    # GP: pick 1 closest per selected month
    gps = [r for r in eligible if r["source"] == "grand_prix" and r["_recommended"]]
    gps_by_month = {}
    for r in gps:
        m = r["date_start"][:7]
        if m in GP_MONTHS:
            gps_by_month.setdefault(m, []).append(r)

    gp_picks = set()
    for m, evts in gps_by_month.items():
        evts.sort(key=lambda r: int(r["driving_minutes"]))
        if evts:
            gp_picks.add(id(evts[0]))

    # Update recommendations
    for r in eligible:
        if r["source"] == "club":
            r["_recommended"] = id(r) in club_picks
        elif r["source"] == "grand_prix":
            r["_recommended"] = id(r) in gp_picks


def build_hover(r: dict) -> str:
    return (
        f"<b>{r['event_name']}</b><br>"
        f"{r['date_start']}  {r['date_end']}<br>"
        f"{r['city']} | {r['distance_category']} | {r['driving_minutes']}min | {r['distance_km']}km<br>"
        f"<br>"
        f"Meals: {r['cost_meals']}  |  Hotel: {r['cost_hotel']}<br>"
        f"EV: {r['cost_ev']}  |  Tolls: {r['cost_tolls']}<br>"
        f"<b>Total: {r['cost_total']} EUR</b> ({r['total_days']}d, {r['hotel_nights']}n)"
    )


# All months we'll show in the bar chart
ALL_MONTHS = [
    "2026-03", "2026-04", "2026-05", "2026-06", "2026-07",
    "2026-08", "2026-09", "2026-10", "2026-11",
]


def main():
    with open(INPUT_CSV, encoding="utf-8") as f:
        all_rows = list(csv.DictReader(f))

    eligible = [r for r in all_rows if is_eligible(date.fromisoformat(r["date_start"]))]

    for r in eligible:
        r["_recommended"] = is_recommended(r)
        r["_cost"] = float(r["cost_total"])

    # Narrow: 2 closest clubs/month + 1 closest GP in Jun/Jul/Sep/Oct/Nov
    narrow_recommendations(eligible)

    # ── Build figure ──
    fig = make_subplots(
        rows=2, cols=1,
        row_heights=[0.78, 0.22],
        vertical_spacing=0.06,
        shared_xaxes=True,
    )

    # Track trace indices and per-point metadata for JS
    # Traces are added in order: for each source → avail trace, pick trace
    # Then bar traces for each source
    pick_trace_indices = {}  # source -> trace index
    pick_metadata = {}       # source -> list of {cost, month} per point
    trace_idx = 0

    for source in SOURCES:
        color = COLORS[source]
        label = SOURCE_LABELS[source]
        symbol = SYMBOLS[source]

        # Available (not recommended)
        avail = [r for r in eligible if r["source"] == source and not r["_recommended"]]
        if avail:
            fig.add_trace(go.Scatter(
                x=[r["date_start"] for r in avail],
                y=[r["_cost"] for r in avail],
                mode="markers",
                marker=dict(size=AVAIL_SIZE, color=color, opacity=AVAIL_OPACITY, symbol=symbol),
                name=f"{label} (avail.)",
                hovertext=[build_hover(r) for r in avail],
                hoverinfo="text",
                legendgroup=source,
            ), row=1, col=1)
            trace_idx += 1

        # Recommended (picks)
        reco = [r for r in eligible if r["source"] == source and r["_recommended"]]
        if reco:
            fig.add_trace(go.Scatter(
                x=[r["date_start"] for r in reco],
                y=[r["_cost"] for r in reco],
                mode="markers",
                marker=dict(
                    size=[SELECTED_SIZE] * len(reco),
                    color=color,
                    opacity=[SELECTED_OPACITY] * len(reco),
                    symbol=symbol,
                    line=dict(width=1.5, color="white"),
                ),
                name=f"{label} (pick)",
                hovertext=[build_hover(r) for r in reco],
                hoverinfo="text",
                legendgroup=source,
            ), row=1, col=1)
            pick_trace_indices[source] = trace_idx
            pick_metadata[source] = [
                {"cost": r["_cost"], "month": r["date_start"][:7]}
                for r in reco
            ]
            trace_idx += 1

    # (Summer break removed — managed manually)

    # (Phase labels removed — summer break managed manually)

    # ── Bar chart traces (one per source, stacked) ──
    bar_trace_indices = {}
    for source in SOURCES:
        color = COLORS[source]
        label = SOURCE_LABELS[source]
        # Compute initial monthly costs from recommended picks
        month_vals = []
        for m in ALL_MONTHS:
            total = sum(
                p["cost"] for p in pick_metadata.get(source, [])
                if p["month"] == m
            )
            month_vals.append(round(total, 2))

        fig.add_trace(go.Bar(
            x=[f"{m}-15" for m in ALL_MONTHS],
            y=month_vals,
            name=label,
            marker_color=color,
            opacity=0.85,
            showlegend=False,
            legendgroup=source,
            hovertemplate="%{x|%b}: %{y:.0f} EUR<extra>" + label + "</extra>",
        ), row=2, col=1)
        bar_trace_indices[source] = trace_idx
        trace_idx += 1

    # Cumulative cost annotations on bars (will be updated by JS)
    # We add one annotation per month with a known name pattern for JS to find
    cumul_annotation_start = len(fig.layout.annotations)
    for i, m in enumerate(ALL_MONTHS):
        month_total = sum(
            sum(p["cost"] for p in pick_metadata.get(s, []) if p["month"] == m)
            for s in SOURCES
        )
        fig.add_annotation(
            x=f"{m}-15", y=month_total, xref="x2", yref="y2",
            text=f"<b>{month_total:.0f}</b>",
            showarrow=False, font=dict(size=9, color="#333"), yshift=10,
        )

    # ── Layout ──
    total_reco = sum(1 for r in eligible if r["_recommended"])
    total_cost = sum(r["_cost"] for r in eligible if r["_recommended"])

    fig.update_layout(
        title=dict(
            text=(
                f"Golf Competition Planner 2026 — Index 17 to Under 10<br>"
                f"<sup id='budget-line'>{total_reco} selected | Budget: {total_cost:,.0f} EUR</sup>"
            ),
            font=dict(size=16),
            x=0.01, xanchor="left",
        ),
        plot_bgcolor="white",
        hoverlabel=dict(bgcolor="white", font_size=11, font_family="monospace"),
        legend=dict(
            orientation="h", yanchor="bottom", y=1.02,
            xanchor="right", x=1.0,
            font=dict(size=10), itemsizing="constant",
        ),
        barmode="stack",
        margin=dict(t=90, b=40, l=60, r=20),
        height=750,
    )
    fig.update_yaxes(title_text="Cost per event (EUR)", gridcolor="#f0f0f0", zeroline=False, row=1, col=1)
    fig.update_xaxes(dtick="M1", tickformat="%b", range=["2026-03-15", "2026-12-15"], gridcolor="#f0f0f0", row=2, col=1)
    fig.update_xaxes(dtick="M1", tickformat="%b", range=["2026-03-15", "2026-12-15"], showticklabels=False, gridcolor="#f0f0f0", row=1, col=1)
    fig.update_yaxes(title_text="Monthly spend (EUR)", gridcolor="#f0f0f0", zeroline=False, row=2, col=1)

    # ── Generate HTML and inject JS ──
    html = fig.to_html(full_html=True, include_plotlyjs="cdn", div_id="gd")

    # Build JS config object
    js_config = {
        "pickTraces": {s: pick_trace_indices[s] for s in SOURCES if s in pick_trace_indices},
        "barTraces": {s: bar_trace_indices[s] for s in SOURCES},
        "pickMeta": {s: pick_metadata.get(s, []) for s in SOURCES},
        "allMonths": ALL_MONTHS,
        "selectedSize": SELECTED_SIZE,
        "deselectedSize": DESELECTED_SIZE,
        "selectedOpacity": SELECTED_OPACITY,
        "deselectedOpacity": DESELECTED_OPACITY,
        "cumulAnnotStart": cumul_annotation_start,
        "sources": list(SOURCES),
    }

    interactive_js = f"""
<script>
(function() {{
    var cfg = {json.dumps(js_config)};
    var gd = document.getElementById('gd');

    // Selection state: true = selected, per pick trace
    var selected = {{}};
    cfg.sources.forEach(function(src) {{
        if (cfg.pickTraces[src] !== undefined) {{
            var n = cfg.pickMeta[src].length;
            selected[src] = new Array(n).fill(true);
        }}
    }});

    // Map trace index -> source for quick lookup
    var traceToSource = {{}};
    cfg.sources.forEach(function(src) {{
        if (cfg.pickTraces[src] !== undefined) {{
            traceToSource[cfg.pickTraces[src]] = src;
        }}
    }});

    function recalc() {{
        // Update marker sizes and opacities for pick traces
        cfg.sources.forEach(function(src) {{
            var ti = cfg.pickTraces[src];
            if (ti === undefined) return;
            var sel = selected[src];
            var sizes = sel.map(function(s) {{ return s ? cfg.selectedSize : cfg.deselectedSize; }});
            var opacs = sel.map(function(s) {{ return s ? cfg.selectedOpacity : cfg.deselectedOpacity; }});
            Plotly.restyle(gd, {{'marker.size': [sizes], 'marker.opacity': [opacs]}}, [ti]);
        }});

        // Recalculate bar chart per source per month
        var monthTotals = {{}};
        cfg.allMonths.forEach(function(m) {{ monthTotals[m] = {{}}; cfg.sources.forEach(function(s) {{ monthTotals[m][s] = 0; }}); }});

        var totalCost = 0;
        var totalCount = 0;

        cfg.sources.forEach(function(src) {{
            var meta = cfg.pickMeta[src];
            var sel = selected[src];
            if (!meta || !sel) return;
            for (var i = 0; i < meta.length; i++) {{
                if (sel[i]) {{
                    monthTotals[meta[i].month][src] += meta[i].cost;
                    totalCost += meta[i].cost;
                    totalCount++;
                }}
            }}
        }});

        // Update bar traces
        cfg.sources.forEach(function(src) {{
            var ti = cfg.barTraces[src];
            var vals = cfg.allMonths.map(function(m) {{ return Math.round(monthTotals[m][src] * 100) / 100; }});
            Plotly.restyle(gd, {{'y': [vals]}}, [ti]);
        }});

        // Update monthly annotations
        var annots = JSON.parse(JSON.stringify(gd.layout.annotations));
        for (var i = 0; i < cfg.allMonths.length; i++) {{
            var m = cfg.allMonths[i];
            var mTotal = 0;
            cfg.sources.forEach(function(s) {{ mTotal += monthTotals[m][s]; }});
            var ai = cfg.cumulAnnotStart + i;
            annots[ai].text = '<b>' + Math.round(mTotal) + '</b>';
            annots[ai].y = mTotal;
        }}

        // Update title
        var titleText = 'Golf Competition Planner 2026 — Index 17 to Under 10<br>'
            + '<sup>' + totalCount + ' selected | Budget: ' + Math.round(totalCost).toLocaleString() + ' EUR</sup>';

        Plotly.relayout(gd, {{'title.text': titleText, 'annotations': annots}});
    }}

    gd.on('plotly_click', function(data) {{
        var pt = data.points[0];
        var src = traceToSource[pt.curveNumber];
        if (src === undefined) return;  // clicked on avail or bar trace
        var idx = pt.pointNumber;
        selected[src][idx] = !selected[src][idx];
        recalc();
    }});
}})();
</script>
"""

    # Inject JS before closing </body>
    html = html.replace("</body>", interactive_js + "</body>")

    with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"Timeline written to {OUTPUT_HTML}")
    print(f"Recommended: {total_reco} events, total cost: {total_cost:,.0f} EUR")
    for source in SOURCES:
        reco = [r for r in eligible if r["source"] == source and r["_recommended"]]
        cost = sum(r["_cost"] for r in reco)
        print(f"  {SOURCE_LABELS[source]}: {len(reco)} events, {cost:,.0f} EUR")


if __name__ == "__main__":
    main()
