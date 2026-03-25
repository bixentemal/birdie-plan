/* ── Calendar View (Google Calendar-inspired) ── */

const CAL_COLORS = { club: '#22c55e', grand_prix: '#f97316' };
const CAL_LABELS = { club: 'Club', grand_prix: 'Grand Prix' };
const CAL_CATEGORY_COLORS = { local: '#22c55e', regional: '#eab308', national: '#f97316' };

function costCode(total) {
    if (total < 50) return '\u20ac';
    if (total < 150) return '\u20ac\u20ac';
    if (total < 300) return '\u20ac\u20ac\u20ac';
    return '\u20ac\u20ac\u20ac\u20ac';
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let _calData = [];
let _calSelections = new Set();
let _globalMaxCost = 1;
let _currentView = 'month';
let _currentDate = new Date(2026, 2, 1); // March 2026
let _calFilterSource = '';
let _calSelectedOnly = false;

/* ── Data loading ── */
async function loadCalendar() {
    const data = await api('/timeline');
    _calData = data;
    _calSelections = new Set(data.filter(d => d.selected).map(d => d.id));
    _globalMaxCost = Math.max(1, ...data.map(d => d.cost_total));
    renderCalendar();
}

function filteredData() {
    return _calData.filter(d => {
        if (_calFilterSource && d.source !== _calFilterSource) return false;
        if (_calSelectedOnly && !_calSelections.has(d.id)) return false;
        return true;
    });
}

/* ── Main render dispatcher ── */
function renderCalendar() {
    updateTitle();
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    const view = _currentView;
    if (view === 'month') renderMonthView(grid);
    else if (view === 'week') renderWeekView(grid);
    else if (view === 'day') renderDayView(grid);
    else if (view === 'year') renderYearView(grid);
}

function updateTitle() {
    const el = document.getElementById('cal-title');
    const d = _currentDate;
    if (_currentView === 'month') {
        el.textContent = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    } else if (_currentView === 'week') {
        const start = weekStart(d);
        const end = new Date(start); end.setDate(end.getDate() + 6);
        el.textContent = `Week of ${fmtDateLong(start)} - ${fmtDateLong(end)}`;
    } else if (_currentView === 'day') {
        el.textContent = fmtDateLong(d);
    } else if (_currentView === 'year') {
        el.textContent = `${d.getFullYear()}`;
    }
}

function fmtDateLong(d) {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function toISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function weekStart(d) {
    const result = new Date(d);
    const day = result.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    result.setDate(result.getDate() + diff);
    return result;
}

function isToday(dateStr) {
    return dateStr === toISO(new Date());
}

function isPast(dateStr) {
    return dateStr < toISO(new Date());
}

function eventsOnDate(dateStr, data) {
    return data.filter(d => dateStr >= d.date_start && dateStr <= d.date_end);
}

/* ── Month View (synoptic: lines for multi-day, dots for single-day) ── */
function renderMonthView(container) {
    const data = filteredData();
    const year = _currentDate.getFullYear();
    const month = _currentDate.getMonth();

    const wrapper = document.createElement('div');
    wrapper.className = 'cal-month-wrapper';

    // Day headers
    const headerRow = document.createElement('div');
    headerRow.className = 'cal-month-headers';
    DAY_NAMES.forEach(name => {
        const hdr = document.createElement('div');
        hdr.className = 'cal-day-header';
        hdr.textContent = name;
        headerRow.appendChild(hdr);
    });
    wrapper.appendChild(headerRow);

    const firstDay = new Date(year, month, 1);
    const startDay = weekStart(firstDay);

    // Separate multi-day and single-day events
    const multiDay = data.filter(ev => ev.date_start !== ev.date_end);
    const singleDay = data.filter(ev => ev.date_start === ev.date_end);

    // Render 6 week rows
    const weekDate = new Date(startDay);
    for (let w = 0; w < 6; w++) {
        const weekRow = document.createElement('div');
        weekRow.className = 'cal-week-row';

        const weekDates = [];
        for (let d = 0; d < 7; d++) {
            weekDates.push(toISO(new Date(weekDate.getFullYear(), weekDate.getMonth(), weekDate.getDate() + d)));
        }

        // Day number cells (row 1)
        weekDates.forEach((dateStr, i) => {
            const dateObj = new Date(dateStr + 'T00:00:00');
            const isCurrentMonth = dateObj.getMonth() === month;
            const num = document.createElement('div');
            num.className = 'cal-day-number';
            num.style.gridColumn = (i + 1);
            num.style.gridRow = 1;
            if (!isCurrentMonth) num.classList.add('other-month');
            if (isToday(dateStr)) num.classList.add('today');
            num.textContent = dateObj.getDate();
            num.addEventListener('click', () => { _currentDate = dateObj; switchView('day'); });
            weekRow.appendChild(num);
        });

        // Multi-day events as thin spanning lines
        const weekStart_ = weekDates[0];
        const weekEnd_ = weekDates[6];
        const weekMulti = multiDay.filter(ev => ev.date_start <= weekEnd_ && ev.date_end >= weekStart_);
        weekMulti.sort((a, b) => {
            const aDays = daysBetween(a.date_start, a.date_end);
            const bDays = daysBetween(b.date_start, b.date_end);
            if (bDays !== aDays) return bDays - aDays;
            if (a.date_start !== b.date_start) return a.date_start < b.date_start ? -1 : 1;
            return b.cost_total - a.cost_total;
        });

        // Lane allocation for multi-day lines (no limit)
        const lanes = [];
        const placedMulti = [];
        weekMulti.forEach(ev => {
            const startCol = Math.max(1, dayIndex(weekDates, ev.date_start) + 1);
            const endCol = Math.min(8, dayIndex(weekDates, ev.date_end) + 2);
            if (startCol >= endCol) return;
            let lane = -1;
            for (let l = 0; l < lanes.length; l++) {
                if (!lanes[l] || lanes[l] <= startCol) { lane = l; lanes[l] = endCol; break; }
            }
            if (lane === -1) { lane = lanes.length; lanes.push(endCol); }
            placedMulti.push({ ev, startCol, endCol, lane });
        });

        // Render multi-day lines
        placedMulti.forEach(({ ev, startCol, endCol, lane }) => {
            const line = createSynopticLine(ev, weekDates);
            line.style.gridColumn = `${startCol} / ${endCol}`;
            line.style.gridRow = lane + 2;
            weekRow.appendChild(line);
        });

        // Single-day events as dots, placed after the multi-day lines
        const dotsRow = placedMulti.length > 0 ? lanes.length + 2 : 2;
        weekDates.forEach((dateStr, i) => {
            const daySingles = singleDay.filter(ev => ev.date_start === dateStr);
            if (daySingles.length === 0) return;
            const dotContainer = document.createElement('div');
            dotContainer.className = 'cal-dots';
            dotContainer.style.gridColumn = (i + 1);
            dotContainer.style.gridRow = dotsRow;
            daySingles.forEach(ev => {
                dotContainer.appendChild(createSynopticDot(ev));
            });
            weekRow.appendChild(dotContainer);
        });

        wrapper.appendChild(weekRow);
        weekDate.setDate(weekDate.getDate() + 7);
    }

    container.appendChild(wrapper);
    ensureTooltip();
}

function ensureTooltip() {
    if (!document.getElementById('cal-tooltip')) {
        const tip = document.createElement('div');
        tip.id = 'cal-tooltip';
        tip.className = 'cal-tooltip';
        document.body.appendChild(tip);
    }
}

function daysBetween(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
}

function dayIndex(weekDates, dateStr) {
    for (let i = 0; i < 7; i++) {
        if (weekDates[i] === dateStr) return i;
    }
    if (dateStr < weekDates[0]) return 0;
    return 6;
}

/* Synoptic line for multi-day events */
function createSynopticLine(ev, weekDates) {
    const el = document.createElement('div');
    el.className = 'cal-syn-line';
    const selected = _calSelections.has(ev.id);
    const played = isPast(ev.date_end);

    if (selected) el.classList.add('selected');
    else el.classList.add('unselected');
    if (played && selected) el.classList.add('played');

    const catColor = CAL_CATEGORY_COLORS[ev.distance_category] || CAL_COLORS[ev.source];
    el.style.background = catColor;

    // Continuation indicators (flat ends when spanning beyond this week)
    if (ev.date_start < weekDates[0]) el.classList.add('continues-left');
    if (ev.date_end > weekDates[6]) el.classList.add('continues-right');

    el.addEventListener('mouseenter', (e) => showTooltip(e, ev));
    el.addEventListener('mouseleave', hideTooltip);
    el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const res = await api(`/selections/${ev.id}`, { method: 'PUT' });
        if (res.selected) _calSelections.add(ev.id);
        else _calSelections.delete(ev.id);
        renderCalendar();
    });

    return el;
}

/* Synoptic dot for single-day events */
function createSynopticDot(ev) {
    const el = document.createElement('div');
    el.className = 'cal-syn-dot';
    const selected = _calSelections.has(ev.id);
    const played = isPast(ev.date_end);

    if (selected) el.classList.add('selected');
    else el.classList.add('unselected');
    if (played && selected) el.classList.add('played');

    const catColor = CAL_CATEGORY_COLORS[ev.distance_category] || CAL_COLORS[ev.source];
    el.style.background = catColor;

    el.addEventListener('mouseenter', (e) => showTooltip(e, ev));
    el.addEventListener('mouseleave', hideTooltip);
    el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const res = await api(`/selections/${ev.id}`, { method: 'PUT' });
        if (res.selected) _calSelections.add(ev.id);
        else _calSelections.delete(ev.id);
        renderCalendar();
    });

    return el;
}

/* ── Hover Tooltip ── */
function showTooltip(e, ev) {
    const tip = document.getElementById('cal-tooltip');
    if (!tip) return;
    const course = ev.golf_course ? `<div class="tip-course">${ev.golf_course}</div>` : '';
    const sel = _calSelections.has(ev.id);
    const statusLabel = sel ? (isPast(ev.date_end) ? 'Played' : 'Selected') : 'Not selected';
    tip.innerHTML = `
        <div class="tip-name">${ev.event_name}</div>
        ${course}
        <div class="tip-row">${ev.date_start} \u2192 ${ev.date_end} (${ev.total_days}d${ev.hotel_nights > 0 ? ', ' + ev.hotel_nights + 'n' : ''})</div>
        <div class="tip-row">${ev.city} (${ev.department_code || ''}) \u00b7 ${ev.distance_category} \u00b7 ${ev.driving_minutes}min</div>
        <div class="tip-divider"></div>
        <div class="tip-costs">
            <span>Meals ${eur(ev.cost_meals)}</span>
            <span>Hotel ${eur(ev.cost_hotel)}</span>
            <span>EV ${eur(ev.cost_ev)}</span>
            <span>Tolls ${eur(ev.cost_tolls)}</span>
            <span>Entry ${eur(ev.cost_entry)}</span>
        </div>
        <div class="tip-total">Total: ${eur(ev.cost_total)} ${costCode(ev.cost_total)}</div>
        <div class="tip-status">${statusLabel}</div>
    `;
    tip.classList.add('visible');
    positionTooltip(e);
}

function positionTooltip(e) {
    const tip = document.getElementById('cal-tooltip');
    if (!tip) return;
    const rect = tip.getBoundingClientRect();
    let x = e.clientX + 12;
    let y = e.clientY + 12;
    if (x + rect.width > window.innerWidth - 10) x = e.clientX - rect.width - 12;
    if (y + rect.height > window.innerHeight - 10) y = e.clientY - rect.height - 12;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
}

function hideTooltip() {
    const tip = document.getElementById('cal-tooltip');
    if (tip) tip.classList.remove('visible');
}

// Track mouse for tooltip positioning
document.addEventListener('mousemove', (e) => {
    const tip = document.getElementById('cal-tooltip');
    if (tip && tip.classList.contains('visible')) {
        positionTooltip(e);
    }
});

/* ── Week View (lines on top for multi-day spans, cards below for single-day) ── */
function renderWeekView(container) {
    const data = filteredData();
    const start = weekStart(_currentDate);

    const weekDates = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(start);
        day.setDate(day.getDate() + i);
        weekDates.push(toISO(day));
    }

    const weekStart_ = weekDates[0];
    const weekEnd_ = weekDates[6];
    const weekEvents = data.filter(ev => ev.date_start <= weekEnd_ && ev.date_end >= weekStart_);
    const multiDay = weekEvents.filter(ev => ev.date_start !== ev.date_end);
    const singleDay = weekEvents.filter(ev => ev.date_start === ev.date_end);

    const outer = document.createElement('div');
    outer.className = 'cal-wk-outer';

    // ── Day headers ──
    const headerRow = document.createElement('div');
    headerRow.className = 'cal-wk-headers';
    for (let i = 0; i < 7; i++) {
        const dateStr = weekDates[i];
        const dateObj = new Date(dateStr + 'T00:00:00');
        const hdr = document.createElement('div');
        hdr.className = 'cal-wk-col-header';
        if (isToday(dateStr)) hdr.classList.add('today');
        hdr.innerHTML = `<span class="cal-wk-day-name">${DAY_NAMES[i]}</span><span class="cal-wk-day-num">${dateObj.getDate()}</span>`;
        hdr.addEventListener('click', () => { _currentDate = dateObj; switchView('day'); });
        headerRow.appendChild(hdr);
    }
    outer.appendChild(headerRow);

    // ── Top section: spanning cards for multi-day events ──
    if (multiDay.length > 0) {
        const spans = document.createElement('div');
        spans.className = 'cal-wk-spans';

        multiDay.sort((a, b) => {
            if ((a.distance_km || 0) !== (b.distance_km || 0)) return (a.distance_km || 0) - (b.distance_km || 0);
            const aDays = daysBetween(a.date_start, a.date_end);
            const bDays = daysBetween(b.date_start, b.date_end);
            if (bDays !== aDays) return bDays - aDays;
            return a.date_start < b.date_start ? -1 : 1;
        });

        const lanes = [];
        multiDay.forEach(ev => {
            const startCol = Math.max(1, dayIndex(weekDates, ev.date_start) + 1);
            const endCol = Math.min(8, dayIndex(weekDates, ev.date_end) + 2);
            if (startCol >= endCol) return;

            let lane = -1;
            for (let l = 0; l < lanes.length; l++) {
                if (!lanes[l] || lanes[l] <= startCol) { lane = l; lanes[l] = endCol; break; }
            }
            if (lane === -1) { lane = lanes.length; lanes.push(endCol); }

            const card = createWeekCard(ev, true);
            card.style.gridColumn = `${startCol} / ${endCol}`;
            card.style.gridRow = lane + 1;
            spans.appendChild(card);
        });

        outer.appendChild(spans);
    }

    // ── Bottom section: card columns for single-day events ──
    const cards = document.createElement('div');
    cards.className = 'cal-wk-cards';

    for (let i = 0; i < 7; i++) {
        const dateStr = weekDates[i];
        const col = document.createElement('div');
        col.className = 'cal-wk-col';
        if (isToday(dateStr)) col.classList.add('today');

        const dayEvts = singleDay.filter(ev => ev.date_start === dateStr);
        dayEvts.sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0));
        dayEvts.forEach(ev => col.appendChild(createWeekCard(ev)));

        cards.appendChild(col);
    }
    outer.appendChild(cards);

    if (weekEvents.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'cal-day-empty';
        empty.textContent = 'No competitions this week';
        outer.appendChild(empty);
    }

    container.appendChild(outer);
    ensureTooltip();
}

function createWeekCard(ev, isMultiDay = false) {
    const card = document.createElement('div');
    card.className = 'cal-wk-card';
    if (isMultiDay) card.classList.add('multi-day');
    const selected = _calSelections.has(ev.id);
    const played = isPast(ev.date_end);
    const catColor = CAL_CATEGORY_COLORS[ev.distance_category] || CAL_COLORS[ev.source];

    card.style.setProperty('--card-color', catColor);
    if (!selected) card.classList.add('unselected');
    if (played && selected) card.classList.add('played');

    const catLabel = ev.distance_category === 'national' ? 'nat.'
        : ev.distance_category === 'regional' ? 'reg.' : 'loc.';
    const sourceLabel = ev.source === 'grand_prix' ? 'GP' : 'Club';
    const dateText = isMultiDay ? `${fmtDate(ev.date_start)}→${fmtDate(ev.date_end)}` : fmtDate(ev.date_start);
    const spanLine = isMultiDay ? `<div class="cal-wk-span-line" style="background:${catColor}"></div>` : '';

    card.innerHTML = `
        ${spanLine}
        <div class="cal-wk-card-top">
            <span class="cal-wk-dot" style="background:${catColor}"></span>
            <span class="cal-wk-source">${sourceLabel}</span>
            <span class="cal-wk-cost">${costCode(ev.cost_total)}</span>
        </div>
        <div class="cal-wk-card-name">${ev.event_name}</div>
        <div class="cal-wk-card-loc">${ev.city}</div>
        <div class="cal-wk-card-bottom">
            <span class="cal-wk-cat">${catLabel}</span>
            <span class="cal-wk-date">${dateText}</span>
            <label class="cal-wk-sel"><input type="checkbox" class="sel-cb" ${selected ? 'checked' : ''}></label>
        </div>
    `;

    const cb = card.querySelector('.sel-cb');
    cb.addEventListener('change', async (e) => {
        e.stopPropagation();
        const res = await api(`/selections/${ev.id}`, { method: 'PUT' });
        if (res.selected) _calSelections.add(ev.id);
        else _calSelections.delete(ev.id);
        renderCalendar();
    });

    card.addEventListener('mouseenter', (e) => showTooltip(e, ev));
    card.addEventListener('mouseleave', hideTooltip);

    return card;
}

/* ── Day View ── */
function renderDayView(container) {
    const data = filteredData();
    const dateStr = toISO(_currentDate);
    const dayEvents = eventsOnDate(dateStr, data);
    dayEvents.sort((a, b) => {
        const aSel = _calSelections.has(a.id) ? 0 : 1;
        const bSel = _calSelections.has(b.id) ? 0 : 1;
        if (aSel !== bSel) return aSel - bSel;
        return (a.distance_km || 0) - (b.distance_km || 0);
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'cal-day-view';

    if (dayEvents.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'cal-day-empty';
        empty.textContent = 'No competitions on this day';
        wrapper.appendChild(empty);
    }

    dayEvents.forEach(ev => {
        const card = document.createElement('div');
        card.className = 'cal-day-card';
        const selected = _calSelections.has(ev.id);
        const played = isPast(ev.date_end);
        const catColor = CAL_CATEGORY_COLORS[ev.distance_category] || CAL_COLORS[ev.source];
        card.style.borderLeftColor = catColor;

        if (!selected) card.classList.add('unselected');
        if (played && selected) card.classList.add('played');

        // Cost bar (full width)
        const barWidth = Math.max(5, (ev.cost_total / _globalMaxCost) * 100);

        const spansBefore = ev.date_start < dateStr;
        const spansAfter = ev.date_end > dateStr;

        card.innerHTML = `
            ${spansBefore ? `<div class="cal-day-span-arrow left" title="${ev.date_start}">◀</div>` : ''}
            ${spansAfter ? `<div class="cal-day-span-arrow right" title="${ev.date_end}">▶</div>` : ''}
            <div class="cal-day-card-bar" style="width:${barWidth}%;background:${catColor}"></div>
            <div class="cal-day-card-content">
                <div class="cal-day-card-header">
                    <label class="cal-day-sel">
                        <input type="checkbox" class="sel-cb" ${selected ? 'checked' : ''} data-id="${ev.id}">
                    </label>
                    <strong>${ev.event_name}</strong>
                    ${played && selected ? '<span class="cal-check">\u2713</span>' : ''}
                    <span class="cal-day-cost">${eur(ev.cost_total)}</span>
                </div>
                <div class="cal-day-card-details">
                    ${ev.golf_course ? `<span>${ev.golf_course}</span>` : ''}
                    <span>${ev.city} (${ev.department_code || ''})</span>
                    <span>${ev.date_start} \u2192 ${ev.date_end} (${ev.total_days}d)</span>
                    <span class="badge badge-${ev.source === 'grand_prix' ? 'gp' : 'club'}">${CAL_LABELS[ev.source]}</span>
                    <span class="badge badge-${ev.distance_category}">${ev.distance_category}</span>
                    <span>${ev.driving_minutes}min | ${ev.distance_km}km</span>
                </div>
                <div class="cal-day-card-costs">
                    <span>Meals: ${eur(ev.cost_meals)}</span>
                    <span>Hotel: ${eur(ev.cost_hotel)}</span>
                    <span>EV: ${eur(ev.cost_ev)}</span>
                    <span>Tolls: ${eur(ev.cost_tolls)}</span>
                    <span>Entry: ${eur(ev.cost_entry)}</span>
                </div>
            </div>
        `;

        // Span arrow navigation
        const leftArrow = card.querySelector('.cal-day-span-arrow.left');
        if (leftArrow) {
            leftArrow.addEventListener('click', (e) => {
                e.stopPropagation();
                _currentDate = new Date(ev.date_start + 'T00:00:00');
                renderCalendar();
            });
        }
        const rightArrow = card.querySelector('.cal-day-span-arrow.right');
        if (rightArrow) {
            rightArrow.addEventListener('click', (e) => {
                e.stopPropagation();
                _currentDate = new Date(ev.date_end + 'T00:00:00');
                renderCalendar();
            });
        }

        // Selection checkbox handler
        const cb = card.querySelector('.sel-cb');
        cb.addEventListener('change', async (e) => {
            e.stopPropagation();
            const res = await api(`/selections/${ev.id}`, { method: 'PUT' });
            if (res.selected) _calSelections.add(ev.id);
            else _calSelections.delete(ev.id);
            renderCalendar();
        });

        wrapper.appendChild(card);
    });

    container.appendChild(wrapper);
}

/* ── Year View ── */
function renderYearView(container) {
    const data = filteredData();
    const year = _currentDate.getFullYear();

    const grid = document.createElement('div');
    grid.className = 'cal-year-grid';

    for (let m = 0; m < 12; m++) {
        const mini = document.createElement('div');
        mini.className = 'cal-mini-month';
        mini.addEventListener('click', () => {
            _currentDate = new Date(year, m, 1);
            switchView('month');
        });

        const title = document.createElement('div');
        title.className = 'cal-mini-title';
        title.textContent = MONTH_NAMES[m].slice(0, 3);
        mini.appendChild(title);

        // Mini calendar grid
        const miniGrid = document.createElement('div');
        miniGrid.className = 'cal-mini-grid';

        // Day headers
        DAY_NAMES.forEach(n => {
            const h = document.createElement('div');
            h.className = 'cal-mini-header';
            h.textContent = n.charAt(0);
            miniGrid.appendChild(h);
        });

        const firstDay = new Date(year, m, 1);
        const start = weekStart(firstDay);
        const current = new Date(start);
        for (let i = 0; i < 42; i++) {
            const dateStr = toISO(current);
            const isThisMonth = current.getMonth() === m;
            const cell = document.createElement('div');
            cell.className = 'cal-mini-cell';
            if (!isThisMonth) {
                cell.classList.add('other-month');
            } else {
                cell.textContent = current.getDate();
                if (isToday(dateStr)) cell.classList.add('today');

                // Events indicator
                const dayEvents = eventsOnDate(dateStr, data);
                if (dayEvents.length > 0) {
                    cell.classList.add('has-events');
                    // Compute total cost for this day
                    const totalCost = dayEvents.reduce((s, e) => s + e.cost_total, 0);
                    const dotSize = Math.max(3, Math.min(8, (totalCost / _globalMaxCost) * 8));
                    const hasSelected = dayEvents.some(e => _calSelections.has(e.id));
                    cell.style.setProperty('--dot-size', dotSize + 'px');
                    if (hasSelected) cell.classList.add('has-selected');
                }
            }

            miniGrid.appendChild(cell);
            current.setDate(current.getDate() + 1);
        }

        mini.appendChild(miniGrid);

        // Monthly total for selected
        const monthSelected = data.filter(d => {
            const ms = d.date_start.slice(0, 7);
            return ms === `${year}-${String(m+1).padStart(2,'0')}` && _calSelections.has(d.id);
        });
        const monthTotal = monthSelected.reduce((s, d) => s + d.cost_total, 0);
        if (monthTotal > 0) {
            const totalEl = document.createElement('div');
            totalEl.className = 'cal-mini-total';
            totalEl.textContent = `${monthSelected.length} sel. | ${eur(monthTotal)}`;
            mini.appendChild(totalEl);
        }

        grid.appendChild(mini);
    }

    container.appendChild(grid);
}

/* ── Navigation ── */
function navigate(dir) {
    const d = _currentDate;
    if (_currentView === 'month') {
        _currentDate = new Date(d.getFullYear(), d.getMonth() + dir, 1);
    } else if (_currentView === 'week') {
        _currentDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() + dir * 7);
    } else if (_currentView === 'day') {
        _currentDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() + dir);
    } else if (_currentView === 'year') {
        _currentDate = new Date(d.getFullYear() + dir, d.getMonth(), 1);
    }
    renderCalendar();
}

function switchView(view) {
    _currentView = view;
    document.querySelectorAll('.cal-view-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.view === view);
    });
    renderCalendar();
}

/* ── Event listeners ── */
document.getElementById('cal-prev').addEventListener('click', () => navigate(-1));
document.getElementById('cal-next').addEventListener('click', () => navigate(1));
document.getElementById('cal-today').addEventListener('click', () => {
    _currentDate = new Date();
    renderCalendar();
});

document.querySelectorAll('.cal-view-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
});

document.getElementById('cal-filter-source').addEventListener('change', (e) => {
    _calFilterSource = e.target.value;
    renderCalendar();
});

document.getElementById('cal-selected-only').addEventListener('change', (e) => {
    _calSelectedOnly = e.target.checked;
    renderCalendar();
});

// Initial load
loadCalendar();
