/* ── Budget KPI Dashboard ── */

let _budgetData = [];
let _scatterView = 'year'; // 'year' or { month: 3 } (1-indexed)

async function loadBudget() {
    _budgetData = await api('/timeline');
    renderBudget();
}

function renderBudget() {
    const el = document.getElementById('budget-dashboard');
    const data = _budgetData;
    const selected = data.filter(d => d.selected);
    const all = data;

    // Aggregations
    const totalCost = selected.reduce((s, d) => s + d.cost_total, 0);
    const totalCount = selected.length;

    // Monthly breakdown
    const months = {};
    selected.forEach(d => {
        const m = d.date_start.slice(0, 7);
        if (!months[m]) months[m] = { club: 0, gp: 0, total: 0, count: 0 };
        if (d.source === 'club') months[m].club += d.cost_total;
        else months[m].gp += d.cost_total;
        months[m].total += d.cost_total;
        months[m].count++;
    });
    const monthKeys = Object.keys(months).sort();
    const maxMonthTotal = Math.max(1, ...monthKeys.map(m => months[m].total));

    // Cost by distance category
    const byCat = { local: { cost: 0, count: 0 }, regional: { cost: 0, count: 0 }, national: { cost: 0, count: 0 } };
    selected.forEach(d => {
        if (byCat[d.distance_category]) {
            byCat[d.distance_category].cost += d.cost_total;
            byCat[d.distance_category].count++;
        }
    });

    // Averages
    const avgCost = totalCount > 0 ? totalCost / totalCount : 0;
    const clubSel = selected.filter(d => d.source === 'club');
    const gpSel = selected.filter(d => d.source === 'grand_prix');
    const avgClub = clubSel.length > 0 ? clubSel.reduce((s, d) => s + d.cost_total, 0) / clubSel.length : 0;
    const avgGP = gpSel.length > 0 ? gpSel.reduce((s, d) => s + d.cost_total, 0) / gpSel.length : 0;

    // Transport
    const totalEV = selected.reduce((s, d) => s + d.cost_ev, 0);
    const totalTolls = selected.reduce((s, d) => s + d.cost_tolls, 0);
    const totalKm = selected.reduce((s, d) => s + (d.distance_km || 0), 0);
    const avgDrive = totalCount > 0 ? selected.reduce((s, d) => s + (d.driving_minutes || 0), 0) / totalCount : 0;

    // Accommodation
    const totalHotelNights = selected.reduce((s, d) => s + (d.hotel_nights || 0), 0);
    const totalHotelCost = selected.reduce((s, d) => s + d.cost_hotel, 0);

    el.innerHTML = `
        <div class="budget-grid">
            <div class="budget-card budget-card-hero">
                <div class="budget-card-title">Season Budget</div>
                <div class="budget-big-number">${eur(totalCost)}</div>
                <div class="budget-sub">${totalCount} competitions selected out of ${all.length}</div>
            </div>

            <div class="budget-card">
                <div class="budget-card-title">Average Cost</div>
                <div class="budget-big-number">${eur(avgCost)}</div>
                <div class="budget-breakdown">
                    <span class="budget-pill" style="--pill-color:#22c55e">Club: ${eur(avgClub)}</span>
                    <span class="budget-pill" style="--pill-color:#f97316">GP: ${eur(avgGP)}</span>
                </div>
            </div>

            <div class="budget-card">
                <div class="budget-card-title">Transport</div>
                <div class="budget-big-number">${eur(totalEV + totalTolls)}</div>
                <div class="budget-breakdown">
                    <span>EV: ${eur(totalEV)} | Tolls: ${eur(totalTolls)}</span>
                    <span>${(totalKm * 2).toLocaleString()} km total (round-trip)</span>
                    <span>Avg drive: ${Math.round(avgDrive)} min</span>
                </div>
            </div>

            <div class="budget-card">
                <div class="budget-card-title">Accommodation</div>
                <div class="budget-big-number">${eur(totalHotelCost)}</div>
                <div class="budget-breakdown">
                    <span>${totalHotelNights} hotel nights</span>
                </div>
            </div>

            <div class="budget-card budget-card-wide">
                <div class="budget-card-title">Cost by Distance Category</div>
                <div class="budget-cats">
                    ${['local', 'regional', 'national'].map(cat => `
                        <div class="budget-cat">
                            <span class="badge badge-${cat}">${cat}</span>
                            <span class="budget-cat-cost">${eur(byCat[cat].cost)}</span>
                            <span class="budget-cat-count">${byCat[cat].count} comp.</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="budget-card budget-card-full">
                <div class="budget-card-title">Monthly Breakdown</div>
                <div class="budget-months">
                    ${monthKeys.map(m => {
                        const d = months[m];
                        const clubPct = (d.club / maxMonthTotal) * 100;
                        const gpPct = (d.gp / maxMonthTotal) * 100;
                        const label = new Date(m + '-15').toLocaleDateString('en-GB', { month: 'short' });
                        return `
                            <div class="budget-month-row">
                                <span class="budget-month-label">${label}</span>
                                <div class="budget-month-bar">
                                    <div class="budget-bar-seg club" style="width:${clubPct}%"></div>
                                    <div class="budget-bar-seg gp" style="width:${gpPct}%"></div>
                                </div>
                                <span class="budget-month-total">${eur(d.total)} (${d.count})</span>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="budget-months-legend">
                    <span class="budget-pill" style="--pill-color:#22c55e">Club</span>
                    <span class="budget-pill" style="--pill-color:#f97316">Grand Prix</span>
                </div>
            </div>

            <div class="budget-card budget-card-full">
                <div class="budget-card-title">Cost Timeline</div>
                <div id="scatter-container" class="scatter-wrap"></div>
                <div class="scatter-legend">
                    <span class="budget-pill" style="--pill-color:#22c55e">Local</span>
                    <span class="budget-pill" style="--pill-color:#eab308">Regional</span>
                    <span class="budget-pill" style="--pill-color:#f97316">National</span>
                    <span class="scatter-legend-hint">click month to zoom</span>
                </div>
            </div>
        </div>
    `;
    renderCostScatter();
}

/* ── Cost Timeline Scatter Chart ── */

const SCATTER_COLORS = { local: '#22c55e', regional: '#eab308', national: '#f97316' };
const SVG_NS = 'http://www.w3.org/2000/svg';

function niceMax(v) {
    const steps = [50, 100, 150, 200, 300, 400, 500, 750, 1000, 1500, 2000];
    for (const s of steps) if (s >= v) return s;
    return Math.ceil(v / 500) * 500;
}

function scatterZoomMonth(m) {
    _scatterView = { month: m };
    renderCostScatter();
}

function scatterZoomOut() {
    _scatterView = 'year';
    renderCostScatter();
}

function renderCostScatter() {
    const container = document.getElementById('scatter-container');
    if (!container) return;
    container.innerHTML = '';

    const data = _budgetData;
    if (!data.length) return;

    const rect = container.getBoundingClientRect();
    const W = rect.width || 800;
    const H = 320;
    const P = { top: 25, right: 20, bottom: 40, left: 55 };
    const cw = W - P.left - P.right;
    const ch = H - P.top - P.bottom;

    const maxCostData = Math.max(300, ...data.map(d => d.cost_total));
    const COST_BANDS = [
        { label: '€', min: 0, max: 50 },
        { label: '€€', min: 50, max: 150 },
        { label: '€€€', min: 150, max: 300 },
        { label: '€€€€', min: 300, max: maxCostData },
    ];

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.display = 'block';

    const tc = themeColors();

    // Scales
    let xMin, xMax, xLabels, gridXPositions;

    if (_scatterView === 'year') {
        // Year view: x = full date range
        const dates = data.map(d => new Date(d.date_start + 'T00:00:00'));
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        xMin = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
        xMax = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);

        // Month boundaries and labels
        xLabels = [];
        gridXPositions = [];
        const cur = new Date(xMin);
        while (cur <= xMax) {
            const x = P.left + ((cur - xMin) / (xMax - xMin)) * cw;
            if (cur > xMin) gridXPositions.push(x);
            const mid = new Date(cur.getFullYear(), cur.getMonth(), 15);
            const midX = P.left + ((mid - xMin) / (xMax - xMin)) * cw;
            xLabels.push({ x: midX, label: cur.toLocaleDateString('en-GB', { month: 'short' }), month: cur.getMonth() + 1, year: cur.getFullYear() });
            cur.setMonth(cur.getMonth() + 1);
        }
    } else {
        // Month view: x = days of the month
        const m = _scatterView.month;
        const year = 2026;
        xMin = new Date(year, m - 1, 1);
        xMax = new Date(year, m, 0); // last day
        const daysInMonth = xMax.getDate();

        xLabels = [];
        gridXPositions = [];
        for (let d = 1; d <= daysInMonth; d++) {
            const x = P.left + ((d - 0.5) / daysInMonth) * cw;
            if (d > 1) {
                const gx = P.left + ((d - 1) / daysInMonth) * cw;
                gridXPositions.push(gx);
            }
            if (d % 2 === 1 || daysInMonth <= 15) {
                xLabels.push({ x, label: String(d) });
            }
        }
    }

    const xScale = (dateStr) => {
        const d = new Date(dateStr + 'T00:00:00');
        if (_scatterView !== 'year') {
            const dayOfMonth = d.getDate();
            const daysInMonth = xMax.getDate();
            return P.left + ((dayOfMonth - 0.5) / daysInMonth) * cw;
        }
        return P.left + ((d - xMin) / (xMax - xMin)) * cw;
    };

    const bandHeight = ch / 4;
    const yScale = (cost) => {
        for (let i = 0; i < COST_BANDS.length; i++) {
            const b = COST_BANDS[i];
            if (cost <= b.max || i === 3) {
                const bandTop = P.top + (3 - i) * bandHeight;
                const range = b.max - b.min;
                const ratio = range > 0 ? (cost - b.min) / range : 0.5;
                return bandTop + bandHeight - ratio * bandHeight;
            }
        }
        return P.top;
    };

    // ── Band separator lines + labels ──
    // Bottom base line
    const baseLine = document.createElementNS(SVG_NS, 'line');
    baseLine.setAttribute('x1', P.left); baseLine.setAttribute('x2', W - P.right);
    baseLine.setAttribute('y1', P.top + ch); baseLine.setAttribute('y2', P.top + ch);
    baseLine.setAttribute('stroke', tc.grid); baseLine.setAttribute('stroke-width', '1');
    svg.appendChild(baseLine);

    // Top line
    const topLine = document.createElementNS(SVG_NS, 'line');
    topLine.setAttribute('x1', P.left); topLine.setAttribute('x2', W - P.right);
    topLine.setAttribute('y1', P.top); topLine.setAttribute('y2', P.top);
    topLine.setAttribute('stroke', tc.grid); topLine.setAttribute('stroke-width', '1');
    svg.appendChild(topLine);

    // Band boundaries at 50€, 150€, 300€ + band labels
    for (let i = 0; i < 4; i++) {
        const b = COST_BANDS[i];
        const bandTop = P.top + (3 - i) * bandHeight;
        const bandMid = bandTop + bandHeight / 2;

        // Separator line (between bands, not at top/bottom)
        if (i > 0) {
            const sepY = bandTop + bandHeight;
            const sep = document.createElementNS(SVG_NS, 'line');
            sep.setAttribute('x1', P.left); sep.setAttribute('x2', W - P.right);
            sep.setAttribute('y1', sepY); sep.setAttribute('y2', sepY);
            sep.setAttribute('stroke', tc.grid); sep.setAttribute('stroke-width', '1');
            sep.setAttribute('stroke-dasharray', '4,3');
            svg.appendChild(sep);
        }

        // Band label on Y-axis
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', P.left - 8); label.setAttribute('y', bandMid + 4);
        label.setAttribute('text-anchor', 'end');
        label.setAttribute('fill', tc.muted); label.setAttribute('font-size', '11');
        label.setAttribute('font-weight', '600');
        label.textContent = b.label;
        svg.appendChild(label);

        // Range hint (smaller, below the label)
        const hint = document.createElementNS(SVG_NS, 'text');
        hint.setAttribute('x', P.left - 8); hint.setAttribute('y', bandMid + 16);
        hint.setAttribute('text-anchor', 'end');
        hint.setAttribute('fill', tc.faint); hint.setAttribute('font-size', '9');
        hint.textContent = i < 3 ? `${b.min}-${b.max}€` : `${b.min}€+`;
        svg.appendChild(hint);
    }

    // ── Vertical grid lines ──
    gridXPositions.forEach(x => {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', x); line.setAttribute('x2', x);
        line.setAttribute('y1', P.top); line.setAttribute('y2', H - P.bottom);
        line.setAttribute('stroke', tc.grid); line.setAttribute('stroke-width', '1');
        svg.appendChild(line);
    });

    // ── X-axis labels ──
    xLabels.forEach(item => {
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', item.x); label.setAttribute('y', H - P.bottom + 18);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', tc.muted); label.setAttribute('font-size', '11');
        label.textContent = item.label;

        if (_scatterView === 'year' && item.month) {
            label.style.cursor = 'pointer';
            label.addEventListener('click', () => scatterZoomMonth(item.month));
            label.addEventListener('mouseenter', () => { label.setAttribute('fill', tc.text); label.setAttribute('font-weight', '600'); });
            label.addEventListener('mouseleave', () => { label.setAttribute('fill', tc.muted); label.setAttribute('font-weight', 'normal'); });
        }
        svg.appendChild(label);
    });

    // ── Clickable month zones (year view) ──
    if (_scatterView === 'year') {
        xLabels.forEach(item => {
            if (!item.month) return;
            const monthStart = new Date(item.year, item.month - 1, 1);
            const monthEnd = new Date(item.year, item.month, 0);
            const x1 = P.left + ((monthStart - xMin) / (xMax - xMin)) * cw;
            const x2 = P.left + ((monthEnd - xMin) / (xMax - xMin)) * cw;
            const zone = document.createElementNS(SVG_NS, 'rect');
            zone.setAttribute('x', x1); zone.setAttribute('y', P.top);
            zone.setAttribute('width', x2 - x1); zone.setAttribute('height', ch);
            zone.setAttribute('fill', 'transparent');
            zone.style.cursor = 'pointer';
            zone.addEventListener('click', () => scatterZoomMonth(item.month));
            svg.appendChild(zone);
        });
    }

    // ── Back button (month view) ──
    if (_scatterView !== 'year') {
        const monthName = new Date(2026, _scatterView.month - 1, 15).toLocaleDateString('en-GB', { month: 'long' });
        const back = document.createElementNS(SVG_NS, 'text');
        back.setAttribute('x', P.left + 4); back.setAttribute('y', P.top - 6);
        back.setAttribute('font-size', '12');
        back.setAttribute('fill', tc.muted);
        back.style.cursor = 'pointer';
        back.textContent = `\u2190 Year`;
        back.addEventListener('click', scatterZoomOut);
        back.addEventListener('mouseenter', () => back.setAttribute('fill', tc.text));
        back.addEventListener('mouseleave', () => back.setAttribute('fill', tc.muted));
        svg.appendChild(back);

        const title = document.createElementNS(SVG_NS, 'text');
        title.setAttribute('x', W / 2); title.setAttribute('y', P.top - 6);
        title.setAttribute('text-anchor', 'middle');
        title.setAttribute('font-size', '13'); title.setAttribute('font-weight', '600');
        title.setAttribute('fill', tc.text);
        title.textContent = monthName + ' 2026';
        svg.appendChild(title);
    }

    // ── Dots ──
    // Filter to current view's date range
    const viewData = _scatterView === 'year' ? data : data.filter(d => {
        const m = parseInt(d.date_start.slice(5, 7));
        return m === _scatterView.month;
    });

    // Sort: unselected first (so selected render on top)
    const sorted = [...viewData].sort((a, b) => (a.selected ? 1 : 0) - (b.selected ? 1 : 0));

    sorted.forEach(ev => {
        const cx = xScale(ev.date_start);
        const cy = yScale(ev.cost_total);
        if (cx < P.left || cx > W - P.right) return;

        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', _scatterView === 'year' ? 4.5 : 6);
        circle.setAttribute('fill', SCATTER_COLORS[ev.distance_category] || '#999');
        circle.setAttribute('opacity', ev.selected ? '1' : '0.15');
        circle.classList.add('scatter-dot');

        circle.addEventListener('mouseenter', (e) => showTooltip(e, ev));
        circle.addEventListener('mouseleave', hideTooltip);

        svg.appendChild(circle);
    });

    container.appendChild(svg);
    ensureTooltip();
}

// Debounced resize
let _scatterResizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(_scatterResizeTimer);
    _scatterResizeTimer = setTimeout(() => {
        if (document.getElementById('scatter-container')) renderCostScatter();
    }, 200);
});
