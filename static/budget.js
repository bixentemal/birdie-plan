/* ── Budget KPI Dashboard ── */

let _budgetData = [];

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
        </div>
    `;
}
