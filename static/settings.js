/* ── Settings tab: Cost Model + future params ── */

async function loadCostModel() {
    const m = await api('/cost-model');
    document.getElementById('cm-meal-local').value = m.meal_local_per_day;
    document.getElementById('cm-meal-away').value = m.meal_away_per_day;
    document.getElementById('cm-hotel').value = m.hotel_per_night;
    document.getElementById('cm-ev').value = m.ev_cost_per_km;
    document.getElementById('cm-toll').value = m.toll_rate_per_km;
    document.getElementById('cm-toll-ratio').value = m.toll_autoroute_ratio;
    document.getElementById('cm-prep-day').checked = m.gp_prep_day;
    document.getElementById('cm-entry-club').value = m.entry_fee_club;
    document.getElementById('cm-entry-gp').value = m.entry_fee_gp;
}

document.getElementById('cm-save').addEventListener('click', async () => {
    const model = {
        meal_local_per_day: parseFloat(document.getElementById('cm-meal-local').value),
        meal_away_per_day: parseFloat(document.getElementById('cm-meal-away').value),
        hotel_per_night: parseFloat(document.getElementById('cm-hotel').value),
        ev_cost_per_km: parseFloat(document.getElementById('cm-ev').value),
        toll_rate_per_km: parseFloat(document.getElementById('cm-toll').value),
        toll_autoroute_ratio: parseFloat(document.getElementById('cm-toll-ratio').value),
        gp_prep_day: document.getElementById('cm-prep-day').checked,
        entry_fee_club: parseFloat(document.getElementById('cm-entry-club').value),
        entry_fee_gp: parseFloat(document.getElementById('cm-entry-gp').value),
    };
    await api('/cost-model', { method: 'PUT', body: JSON.stringify(model) });
    document.getElementById('cm-status').textContent = 'Applied!';
    setTimeout(() => document.getElementById('cm-status').textContent = '', 2000);
});

// Load cost model values on startup
loadCostModel();
