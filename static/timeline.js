/* ── Timeline chart (Plotly.js) ── */

const SOURCES = ['club', 'grand_prix'];
const COLORS = { club: '#22c55e', grand_prix: '#f97316' };
const SOURCE_LABELS = { club: 'Club', grand_prix: 'Grand Prix' };
const SYMBOLS = { club: 'circle', grand_prix: 'square' };

const SELECTED_SIZE = 11, DESELECTED_SIZE = 6;
const SELECTED_OPACITY = 0.9, DESELECTED_OPACITY = 0.15;
const AVAIL_SIZE = 5, AVAIL_OPACITY = 0.12;

const ALL_MONTHS = [
    '2026-03','2026-04','2026-05','2026-06','2026-07',
    '2026-08','2026-09','2026-10','2026-11','2026-12',
];

let _timelineData = [];
let _selections = new Set();

function buildHover(r) {
    const course = r.golf_course ? `${r.golf_course}<br>` : '';
    return `<b>${r.event_name}</b><br>${course}`
        + `${r.date_start}  ${r.date_end}<br>`
        + `${r.city} (${r.department_code || ''}) | ${r.distance_category} | ${r.driving_minutes}min | ${r.distance_km}km<br><br>`
        + `Meals: ${r.cost_meals}  |  Hotel: ${r.cost_hotel}<br>`
        + `EV: ${r.cost_ev}  |  Tolls: ${r.cost_tolls}  |  Entry: ${r.cost_entry}<br>`
        + `<b>Total: ${r.cost_total} EUR</b> (${r.total_days}d, ${r.hotel_nights}n)`;
}

async function loadTimeline() {
    const data = await api('/timeline');
    _timelineData = data;
    _selections = new Set(data.filter(d => d.selected).map(d => d.id));
    renderTimeline();
}

function renderTimeline() {
    const el = document.getElementById('plotly-chart');
    const data = _timelineData;

    const traces = [];
    const pickTraceIndices = {};
    const pickMeta = {};
    let traceIdx = 0;

    for (const source of SOURCES) {
        const color = COLORS[source];
        const label = SOURCE_LABELS[source];
        const symbol = SYMBOLS[source];

        // Available (not selected)
        const avail = data.filter(r => r.source === source && !_selections.has(r.id));
        if (avail.length) {
            traces.push({
                x: avail.map(r => r.date_start),
                y: avail.map(r => r.cost_total),
                mode: 'markers',
                marker: { size: AVAIL_SIZE, color, opacity: AVAIL_OPACITY, symbol },
                name: `${label} (avail.)`,
                hovertext: avail.map(buildHover),
                hoverinfo: 'text',
                legendgroup: source,
                customdata: avail.map(r => r.id),
                xaxis: 'x', yaxis: 'y',
            });
            traceIdx++;
        }

        // Selected (picks)
        const picks = data.filter(r => r.source === source && _selections.has(r.id));
        if (picks.length) {
            traces.push({
                x: picks.map(r => r.date_start),
                y: picks.map(r => r.cost_total),
                mode: 'markers',
                marker: {
                    size: picks.map(() => SELECTED_SIZE),
                    color,
                    opacity: picks.map(() => SELECTED_OPACITY),
                    symbol,
                    line: { width: 1.5, color: 'white' },
                },
                name: `${label} (pick)`,
                hovertext: picks.map(buildHover),
                hoverinfo: 'text',
                legendgroup: source,
                customdata: picks.map(r => r.id),
                xaxis: 'x', yaxis: 'y',
            });
            pickTraceIndices[source] = traceIdx;
            pickMeta[source] = picks.map(r => ({ cost: r.cost_total, month: r.date_start.slice(0, 7), id: r.id }));
            traceIdx++;
        }
    }

    // Bar chart traces
    const barTraceIndices = {};
    for (const source of SOURCES) {
        const color = COLORS[source];
        const label = SOURCE_LABELS[source];
        const monthVals = ALL_MONTHS.map(m => {
            return (pickMeta[source] || [])
                .filter(p => p.month === m)
                .reduce((s, p) => s + p.cost, 0);
        });

        traces.push({
            x: ALL_MONTHS.map(m => m + '-15'),
            y: monthVals,
            type: 'bar',
            name: label,
            marker: { color },
            opacity: 0.85,
            showlegend: false,
            legendgroup: source,
            hovertemplate: '%{x|%b}: %{y:.0f} EUR<extra>' + label + '</extra>',
            xaxis: 'x2', yaxis: 'y2',
        });
        barTraceIndices[source] = traceIdx;
        traceIdx++;
    }

    // Theme-aware colors
    const tc = themeColors();

    // Monthly total annotations
    const annotations = ALL_MONTHS.map(m => {
        const mTotal = SOURCES.reduce((s, src) => {
            return s + (pickMeta[src] || []).filter(p => p.month === m).reduce((a, p) => a + p.cost, 0);
        }, 0);
        return {
            x: m + '-15', y: mTotal, xref: 'x2', yref: 'y2',
            text: `<b>${Math.round(mTotal)}</b>`,
            showarrow: false, font: { size: 9, color: tc.muted }, yshift: 10,
        };
    });
    // Month labels below bars
    ALL_MONTHS.forEach(m => {
        const label = new Date(m + '-15').toLocaleString('default', { month: 'short' });
        annotations.push({
            x: m + '-15', y: 0, xref: 'x2', yref: 'y2',
            text: `<b>${label}</b>`,
            showarrow: false, font: { size: 10, color: tc.muted }, yshift: -14,
        });
    });

    const totalCount = _selections.size;
    const totalCost = data.filter(r => _selections.has(r.id)).reduce((s, r) => s + r.cost_total, 0);

    const layout = {
        grid: { rows: 2, columns: 1, pattern: 'independent', roworder: 'top to bottom' },
        xaxis: { tickformat: '%d %b', range: ['2026-03-15', '2026-12-15'], gridcolor: tc.grid, domain: [0, 1], anchor: 'y', tickfont: { color: tc.muted } },
        yaxis: { title: { text: 'Cost per event (EUR)', font: { color: tc.muted } }, gridcolor: tc.grid, zeroline: false, domain: [0.28, 1], anchor: 'x', tickfont: { color: tc.muted } },
        xaxis2: { dtick: 'M1', range: ['2026-03-15', '2026-12-15'], gridcolor: tc.grid, domain: [0, 1], anchor: 'y2', tickfont: { color: tc.muted }, fixedrange: true, showticklabels: false },
        yaxis2: { title: { text: 'Monthly spend (EUR)', font: { color: tc.muted } }, gridcolor: tc.grid, zeroline: false, domain: [0, 0.22], anchor: 'x2', tickfont: { color: tc.muted }, fixedrange: true },
        title: {
            text: `Birdie Plan 2026<br><sup>${totalCount} selected | Budget: ${Math.round(totalCost).toLocaleString()} EUR</sup>`,
            font: { size: 16, color: tc.text }, x: 0.01, xanchor: 'left',
        },
        barmode: 'stack',
        plot_bgcolor: tc.card,
        paper_bgcolor: tc.bg,
        hoverlabel: { bgcolor: tc.card, font: { size: 11, family: 'monospace', color: tc.text } },
        legend: { orientation: 'h', yanchor: 'bottom', y: 1.02, xanchor: 'right', x: 1.0, font: { size: 10, color: tc.muted }, itemsizing: 'constant' },
        margin: { t: 80, b: 40, l: 60, r: 20 },
        annotations,
        height: 700,
    };

    Plotly.newPlot(el, traces, layout, { responsive: true }).then(() => {
        el.on('plotly_click', async (eventData) => {
            const pt = eventData.points[0];
            const compId = pt.customdata;
            if (!compId) return;

            // Toggle via API
            const res = await api(`/selections/${compId}`, { method: 'PUT' });
            if (res.selected) {
                _selections.add(compId);
            } else {
                _selections.delete(compId);
            }
            // Full re-render to update pick vs avail grouping
            renderTimeline();
        });
    });
}

// Initial load
loadTimeline();
