/* ── Map view (Leaflet.js) ── */

const HOME_LAT = 43.5372, HOME_LNG = 1.2314; // Fonsorbes
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

let _map = null;
let _mapData = [];
let _mapMarkers = [];
let _mapInitialized = false;

function createCircleIcon(color, radius, borderColor) {
    return L.divIcon({
        className: 'map-marker',
        html: `<div style="
            width:${radius * 2}px; height:${radius * 2}px;
            border-radius:50%;
            background:${color};
            border:2px solid ${borderColor || '#fff'};
            box-shadow:0 1px 4px rgba(0,0,0,0.3);
        "></div>`,
        iconSize: [radius * 2, radius * 2],
        iconAnchor: [radius, radius],
    });
}

function getMarkerStyle(comp, isSelected, isHighlighted) {
    const isClub = comp.source === 'club';
    if (isSelected && isHighlighted) {
        return {
            color: isClub ? '#16a34a' : '#ea580c',
            radius: 10,
            border: '#fff',
            opacity: 1,
            zIndex: 1000,
        };
    }
    if (isSelected) {
        return {
            color: isClub ? '#22c55e' : '#f97316',
            radius: 8,
            border: '#fff',
            opacity: 0.9,
            zIndex: 900,
        };
    }
    if (isHighlighted) {
        return {
            color: isClub ? '#86efac' : '#fdba74',
            radius: 7,
            border: isClub ? '#22c55e' : '#f97316',
            opacity: 0.8,
            zIndex: 800,
        };
    }
    return {
        color: isClub ? '#bbf7d0' : '#fed7aa',
        radius: 5,
        border: isClub ? '#86efac' : '#fdba74',
        opacity: 0.35,
        zIndex: 100,
    };
}

function buildMapPopup(comp, isSelected) {
    const selBadge = isSelected
        ? '<span style="color:#16a34a;font-weight:600;">&#10003; Selected</span>'
        : '<span style="color:#94a3b8;">Not selected</span>';
    const srcBadge = comp.source === 'club'
        ? '<span class="badge badge-club">Club</span>'
        : '<span class="badge badge-gp">GP</span>';
    const distBadge = `<span class="badge badge-${comp.distance_category}">${comp.distance_category}</span>`;
    const courseLine = comp.golf_course ? `<span style="color:#64748b;">${comp.golf_course}</span><br>` : '';

    return `<div class="map-popup">
        <strong>${comp.event_name}</strong><br>
        ${courseLine}
        ${fmtDate(comp.date_start)}–${fmtDate(comp.date_end)} &nbsp; ${srcBadge} ${distBadge}<br>
        ${comp.city} (${comp.department_code}) &middot; ${comp.driving_minutes}min &middot; ${comp.distance_km}km<br>
        <span style="font-variant-numeric:tabular-nums;">
            Meals ${eur(comp.cost_meals)} &middot; Hotel ${eur(comp.cost_hotel)} &middot;
            EV ${eur(comp.cost_ev)} &middot; Tolls ${eur(comp.cost_tolls)} &middot;
            Entry ${eur(comp.cost_entry)}<br>
            <strong>Total: ${eur(comp.cost_total)}</strong>
        </span><br>
        ${selBadge}
    </div>`;
}

function initMap() {
    if (_map) return;
    const scrollZoom = localStorage.getItem('mapScrollZoom') !== 'false';
    _map = L.map('map-container', {
        center: [46.5, 2.5], // France center
        zoom: 6,
        scrollWheelZoom: scrollZoom,
    });
    document.getElementById('map-scroll-zoom').checked = scrollZoom;
    _map.doubleClickZoom.disable();
    _map.on('dblclick', () => _map.setView([46.5, 2.5], 6));

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
    }).addTo(_map);

    // Home marker
    const homeIcon = L.divIcon({
        className: 'map-marker',
        html: `<div style="
            width:14px;height:14px;border-radius:50%;
            background:#2563eb;border:3px solid #fff;
            box-shadow:0 2px 6px rgba(0,0,0,0.4);
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
    });
    L.marker([HOME_LAT, HOME_LNG], { icon: homeIcon, zIndexOffset: 2000 })
        .addTo(_map)
        .bindPopup('<strong>Home</strong><br>Fonsorbes (31)');
}

function populateMapMonthFilter() {
    const sel = document.getElementById('map-filter-month');
    const months = new Set(_mapData.map(c => c.date_start.slice(0, 7)));
    const sorted = [...months].sort();
    const current = sel.value;
    sel.innerHTML = '<option value="">All months</option>';
    for (const m of sorted) {
        const [y, mo] = m.split('-');
        const label = MONTH_LABELS[parseInt(mo) - 1] + ' ' + y;
        sel.innerHTML += `<option value="${m}">${label}</option>`;
    }
    sel.value = current;
}

function renderMapMarkers() {
    // Clear existing
    _mapMarkers.forEach(m => _map.removeLayer(m));
    _mapMarkers = [];

    const filterMonth = document.getElementById('map-filter-month').value;
    const filterSource = document.getElementById('map-filter-source').value;
    const filterCat = document.getElementById('map-filter-category').value;
    const selectedOnly = document.getElementById('map-selected-only').checked;
    const selections = new Set(_mapData.filter(d => d.selected).map(d => d.id));

    // Group by location to handle multiple events at same coordinates
    const byLocation = {};
    for (const c of _mapData) {
        if (!c.latitude || !c.longitude) continue;
        if (filterSource && c.source !== filterSource) continue;
        if (filterCat && c.distance_category !== filterCat) continue;
        if (selectedOnly && !selections.has(c.id)) continue;

        const key = `${c.latitude.toFixed(4)},${c.longitude.toFixed(4)}`;
        if (!byLocation[key]) byLocation[key] = [];
        byLocation[key].push(c);
    }

    let shownCount = 0;
    let highlightedCount = 0;
    let selectedCount = 0;

    for (const [, comps] of Object.entries(byLocation)) {
        // For each location, determine the best style (most prominent event there)
        const highlightedComps = filterMonth
            ? comps.filter(c => c.date_start.startsWith(filterMonth))
            : comps;
        const nonHighlighted = filterMonth
            ? comps.filter(c => !c.date_start.startsWith(filterMonth))
            : [];

        // If filtering by month and no events match at this location, show faded
        const displayComps = filterMonth && highlightedComps.length === 0
            ? nonHighlighted
            : (highlightedComps.length > 0 ? highlightedComps : comps);

        const isHighlighted = filterMonth ? highlightedComps.length > 0 : false;

        // Pick the most prominent comp for marker style
        const hasSelected = displayComps.some(c => selections.has(c.id));
        const bestComp = displayComps.find(c => selections.has(c.id)) || displayComps[0];
        const style = getMarkerStyle(bestComp, hasSelected, isHighlighted);

        const icon = createCircleIcon(style.color, style.radius, style.border);
        const marker = L.marker([bestComp.latitude, bestComp.longitude], {
            icon,
            zIndexOffset: style.zIndex,
            opacity: style.opacity,
        });

        // Build popup with all events at this location
        const allComps = [...highlightedComps, ...nonHighlighted.filter(c => !highlightedComps.includes(c))];
        const uniqueComps = allComps.length > 0 ? allComps : comps;
        let popupHtml;
        if (uniqueComps.length === 1) {
            popupHtml = buildMapPopup(uniqueComps[0], selections.has(uniqueComps[0].id));
        } else {
            const courseNames = [...new Set(uniqueComps.map(c => c.golf_course).filter(Boolean))];
            const courseLine = courseNames.length ? `<span style="color:#64748b;font-size:0.85em;">${courseNames.join(', ')}</span><br>` : '';
            popupHtml = `<div class="map-popup"><strong>${bestComp.city}</strong> (${bestComp.department_code}) &mdash; ${uniqueComps.length} events<br>${courseLine}<hr>`;
            const INITIAL_SHOW = 8;
            const popupId = 'popup-' + bestComp.latitude.toFixed(4).replace('.','') + bestComp.longitude.toFixed(4).replace('.','');
            for (let idx = 0; idx < uniqueComps.length; idx++) {
                const c = uniqueComps[idx];
                const sel = selections.has(c.id) ? '&#10003; ' : '';
                const isThisMonth = filterMonth && c.date_start.startsWith(filterMonth);
                const bold = isThisMonth ? 'font-weight:600;' : '';
                const hidden = idx >= INITIAL_SHOW ? ` style="display:none;margin:4px 0;${bold}" class="popup-extra-${popupId}"` : ` style="margin:4px 0;${bold}"`;
                popupHtml += `<div${hidden}>${sel}${fmtDate(c.date_start)} ${c.event_name} <span style="color:#64748b">${eur(c.cost_total)}</span></div>`;
            }
            if (uniqueComps.length > INITIAL_SHOW) {
                const remaining = uniqueComps.length - INITIAL_SHOW;
                popupHtml += `<div class="popup-expand" id="expand-${popupId}" style="color:#2563eb;margin-top:4px;cursor:pointer;font-size:0.85em;"
                    onclick="document.querySelectorAll('.popup-extra-${popupId}').forEach(e=>e.style.display='block');this.style.display='none';">
                    +${remaining} more</div>`;
            }
            popupHtml += '</div>';
        }
        marker.bindPopup(popupHtml, { maxWidth: 380 });

        marker.addTo(_map);
        _mapMarkers.push(marker);

        shownCount += displayComps.length;
        if (isHighlighted) highlightedCount += highlightedComps.length;
        displayComps.forEach(c => { if (selections.has(c.id)) selectedCount++; });
    }

    // Update summary
    const summaryEl = document.getElementById('map-summary');
    let summary = `${Object.keys(byLocation).length} locations &middot; ${shownCount} competitions`;
    if (filterMonth) {
        const [, mo] = filterMonth.split('-');
        summary += ` &middot; <strong>${highlightedCount} in ${MONTH_LABELS[parseInt(mo) - 1]}</strong>`;
    }
    summary += ` &middot; ${selectedCount} selected`;
    summaryEl.innerHTML = summary;
}

async function loadMap() {
    initMap();
    _mapData = await api('/timeline');
    populateMapMonthFilter();
    renderMapMarkers();

    // Invalidate map size after tab switch (Leaflet needs this)
    setTimeout(() => _map.invalidateSize(), 100);
}

// Filter events
['map-filter-month', 'map-filter-source', 'map-filter-category'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderMapMarkers);
});
document.getElementById('map-selected-only').addEventListener('change', renderMapMarkers);
document.getElementById('map-scroll-zoom').addEventListener('change', (e) => {
    if (e.target.checked) { _map.scrollWheelZoom.enable(); } else { _map.scrollWheelZoom.disable(); }
    localStorage.setItem('mapScrollZoom', e.target.checked);
});
