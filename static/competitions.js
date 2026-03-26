/* ── Competitions table + CRUD ── */

let _comps = [];
let _selections_set = new Set();
let _overrides = {};
let _sortCol = 'date_start';
let _sortAsc = true;
let _golfCourses = [];
let _selectedGolf = null;

const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

async function loadCompetitions() {
    const [comps, sels, ovr, golfs] = await Promise.all([
        api('/competitions'),
        api('/selections'),
        api('/cost-overrides'),
        _golfCourses.length ? _golfCourses : api('/golf-courses'),
    ]);
    _comps = comps;
    _selections_set = new Set(sels);
    _overrides = ovr;
    if (Array.isArray(golfs)) _golfCourses = golfs;
    populateMonthFilter();
    renderTable();
}

function populateMonthFilter() {
    const sel = document.getElementById('filter-month');
    const months = new Set(_comps.map(c => c.date_start.slice(0, 7)));
    const sorted = [...months].sort();
    // Keep existing options, rebuild
    sel.innerHTML = '<option value="">All months</option>';
    for (const m of sorted) {
        const [y, mo] = m.split('-');
        const label = MONTH_NAMES_SHORT[parseInt(mo) - 1] + ' ' + y;
        sel.innerHTML += `<option value="${m}">${label}</option>`;
    }
}

function getFiltered() {
    const fSource = document.getElementById('filter-source').value;
    const fCat = document.getElementById('filter-category').value;
    const fMonth = document.getElementById('filter-month').value;

    return _comps.filter(c => {
        if (fSource && c.source !== fSource) return false;
        if (fCat && c.distance_category !== fCat) return false;
        if (fMonth && !c.date_start.startsWith(fMonth)) return false;
        return true;
    });
}

function sortData(data) {
    const col = _sortCol;
    return [...data].sort((a, b) => {
        let va = a[col], vb = b[col];
        if (typeof va === 'number' && typeof vb === 'number') {
            return _sortAsc ? va - vb : vb - va;
        }
        va = String(va || ''); vb = String(vb || '');
        return _sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
}

function renderTable() {
    const filtered = sortData(getFiltered());
    const tbody = document.querySelector('#comp-table tbody');
    tbody.innerHTML = '';

    for (const c of filtered) {
        const sel = _selections_set.has(c.id);
        const hasOvr = c.id in _overrides;
        const ovr = _overrides[c.id] || {};
        const tr = document.createElement('tr');
        if (sel) tr.classList.add('selected');

        tr.innerHTML = `
            <td><input type="checkbox" class="sel-cb" data-id="${c.id}" ${sel ? 'checked' : ''}></td>
            <td>${fmtDate(c.date_start)}–${fmtDate(c.date_end)}</td>
            <td>${c.event_name}</td>
            <td>${c.golf_course || ''}</td>
            <td>${c.city}</td>
            <td>${c.department_code ? `${c.department} (${c.department_code})` : c.department || ''}</td>
            <td><span class="badge badge-${c.source === 'club' ? 'club' : 'gp'}">${c.source === 'club' ? 'Club' : 'GP'}</span></td>
            <td><span class="badge badge-${c.distance_category}">${c.distance_category}</span></td>
            <td>${c.driving_minutes}′</td>
            <td class="cost-cell ${ovr.cost_meals != null ? 'override' : ''}">${eur(c.cost_meals)}</td>
            <td class="cost-cell ${ovr.cost_hotel != null ? 'override' : ''}">${eur(c.cost_hotel)}</td>
            <td class="cost-cell ${ovr.cost_ev != null ? 'override' : ''}">${eur(c.cost_ev)}</td>
            <td class="cost-cell ${ovr.cost_tolls != null ? 'override' : ''}">${eur(c.cost_tolls)}</td>
            <td class="cost-cell ${ovr.cost_entry != null ? 'override' : ''}">${eur(c.cost_entry)}</td>
            <td class="total-cell">${eur(c.cost_total)}</td>
            <td class="actions-cell">
                <button class="btn btn-sm" onclick="editComp('${c.id}')">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteComp('${c.id}')">Del</button>
            </td>
        `;
        tbody.appendChild(tr);
    }

    // Selection checkboxes
    tbody.querySelectorAll('.sel-cb').forEach(cb => {
        cb.addEventListener('change', async () => {
            const id = cb.dataset.id;
            const res = await api(`/selections/${id}`, { method: 'PUT' });
            if (res.selected) _selections_set.add(id); else _selections_set.delete(id);
            renderTable();
        });
    });
}

// ── Sorting ──
document.querySelectorAll('#comp-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (_sortCol === col) { _sortAsc = !_sortAsc; } else { _sortCol = col; _sortAsc = true; }
        // Update arrows
        document.querySelectorAll('#comp-table th .sort-arrow').forEach(e => e.remove());
        th.insertAdjacentHTML('beforeend', `<span class="sort-arrow">${_sortAsc ? '▲' : '▼'}</span>`);
        renderTable();
    });
});

// ── Filters ──
['filter-source', 'filter-category', 'filter-month'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderTable);
});

// ── Modal ──
const overlay = document.getElementById('modal-overlay');
const form = document.getElementById('comp-form');

function openModal(title, comp) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('f-id').value = comp.id || '';
    document.getElementById('f-date-start').value = comp.date_start || '';
    document.getElementById('f-date-end').value = comp.date_end || '';
    document.getElementById('f-name').value = comp.event_name || '';
    document.getElementById('f-golf').value = comp.golf_course || '';
    _selectedGolf = comp.golf_course
        ? _golfCourses.find(g => g.name === comp.golf_course) || null
        : null;
    document.getElementById('f-city').value = comp.city || '';
    document.getElementById('f-source').value = comp.source || 'club';
    document.getElementById('f-dist-cat').value = comp.distance_category || 'local';
    document.getElementById('f-driving').value = comp.driving_minutes || '';
    document.getElementById('f-distance').value = comp.distance_km || '';

    // Overrides
    const ovr = _overrides[comp.id] || {};
    document.getElementById('f-ov-meals').value = ovr.cost_meals != null ? ovr.cost_meals : '';
    document.getElementById('f-ov-hotel').value = ovr.cost_hotel != null ? ovr.cost_hotel : '';
    document.getElementById('f-ov-ev').value = ovr.cost_ev != null ? ovr.cost_ev : '';
    document.getElementById('f-ov-tolls').value = ovr.cost_tolls != null ? ovr.cost_tolls : '';
    document.getElementById('f-ov-entry').value = ovr.cost_entry != null ? ovr.cost_entry : '';

    document.getElementById('f-golf-list').classList.remove('open');
    overlay.classList.add('open');
}

function closeModal() { overlay.classList.remove('open'); }

document.getElementById('modal-cancel').addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

document.getElementById('btn-add').addEventListener('click', () => {
    openModal('Add Competition', {});
});

window.editComp = function(id) {
    const comp = _comps.find(c => c.id === id);
    if (comp) openModal('Edit Competition', comp);
};

window.deleteComp = async function(id) {
    if (!confirm('Delete this competition?')) return;
    await api(`/competitions/${id}`, { method: 'DELETE' });
    await loadCompetitions();
};

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('f-id').value;
    const golf = _selectedGolf;
    const body = {
        date_start: document.getElementById('f-date-start').value,
        date_end: document.getElementById('f-date-end').value,
        event_name: document.getElementById('f-name').value,
        golf_course: document.getElementById('f-golf').value,
        city: document.getElementById('f-city').value,
        department: golf ? golf.department : '',
        department_code: golf ? golf.department_code : '',
        latitude: golf ? golf.latitude : 0,
        longitude: golf ? golf.longitude : 0,
        source: document.getElementById('f-source').value,
        distance_category: document.getElementById('f-dist-cat').value,
        driving_minutes: parseInt(document.getElementById('f-driving').value) || 0,
        distance_km: parseInt(document.getElementById('f-distance').value) || 0,
        age_category: '',
        club_file: '',
    };

    if (id) {
        await api(`/competitions/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
        await api('/competitions', { method: 'POST', body: JSON.stringify(body) });
    }

    // Save overrides if any field is filled
    const ovrMeals = document.getElementById('f-ov-meals').value;
    const ovrHotel = document.getElementById('f-ov-hotel').value;
    const ovrEv = document.getElementById('f-ov-ev').value;
    const ovrTolls = document.getElementById('f-ov-tolls').value;
    const ovrEntry = document.getElementById('f-ov-entry').value;

    const compId = id || (await api('/competitions')).slice(-1)[0]?.id;
    if (compId) {
        const hasAny = ovrMeals || ovrHotel || ovrEv || ovrTolls || ovrEntry;
        if (hasAny) {
            const override = {
                cost_meals: ovrMeals ? parseFloat(ovrMeals) : null,
                cost_hotel: ovrHotel ? parseFloat(ovrHotel) : null,
                cost_ev: ovrEv ? parseFloat(ovrEv) : null,
                cost_tolls: ovrTolls ? parseFloat(ovrTolls) : null,
                cost_entry: ovrEntry ? parseFloat(ovrEntry) : null,
            };
            await api(`/cost-overrides/${compId}`, { method: 'PUT', body: JSON.stringify(override) });
        } else if (id && _overrides[id]) {
            // Remove existing override if all fields cleared
            await api(`/cost-overrides/${id}`, { method: 'DELETE' });
        }
    }

    closeModal();
    await loadCompetitions();
});

// ── Golf course autocomplete ──
(function() {
    const input = document.getElementById('f-golf');
    const list = document.getElementById('f-golf-list');
    let activeIdx = -1;

    function renderList(matches) {
        list.innerHTML = '';
        activeIdx = -1;
        if (!matches.length) { list.classList.remove('open'); return; }
        for (const g of matches.slice(0, 20)) {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.innerHTML = `${g.name}<span class="ac-city">${g.city} (${g.department_code})</span>`;
            div.addEventListener('mousedown', (e) => {
                e.preventDefault();
                selectGolf(g);
            });
            list.appendChild(div);
        }
        list.classList.add('open');
    }

    function selectGolf(g) {
        _selectedGolf = g;
        input.value = g.name;
        document.getElementById('f-city').value = g.city;
        list.classList.remove('open');
    }

    input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        if (q.length < 2) { list.classList.remove('open'); return; }
        const matches = _golfCourses.filter(g =>
            g.name.toLowerCase().includes(q) || g.city.toLowerCase().includes(q)
        );
        renderList(matches);
    });

    input.addEventListener('focus', () => {
        if (input.value.trim().length >= 2) input.dispatchEvent(new Event('input'));
    });

    input.addEventListener('blur', () => {
        setTimeout(() => list.classList.remove('open'), 150);
    });

    input.addEventListener('keydown', (e) => {
        const items = list.querySelectorAll('.autocomplete-item');
        if (!items.length) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIdx = Math.min(activeIdx + 1, items.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIdx = Math.max(activeIdx - 1, 0);
        } else if (e.key === 'Enter' && activeIdx >= 0) {
            e.preventDefault();
            items[activeIdx].dispatchEvent(new MouseEvent('mousedown'));
            return;
        } else { return; }
        items.forEach((it, i) => it.classList.toggle('active', i === activeIdx));
        items[activeIdx]?.scrollIntoView({ block: 'nearest' });
    });
})();

// Initial load when competitions tab is first shown
// (loadTimeline is called on startup via timeline.js, competitions loaded on tab click)
