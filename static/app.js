/* ── Favicon (convert SVG→PNG for Chrome tab) ── */
(function() {
    const img = new Image();
    img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        c.getContext('2d').drawImage(img, 0, 0, 64, 64);
        const link = document.querySelector('link[rel="icon"]');
        if (link) { link.type = 'image/png'; link.href = c.toDataURL('image/png'); }
    };
    img.src = '/favicon.svg';
})();

/* ── Theme toggle ── */
function isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
}

function themeColors() {
    const s = getComputedStyle(document.documentElement);
    return {
        bg: s.getPropertyValue('--bg').trim(),
        card: s.getPropertyValue('--bg-card').trim(),
        text: s.getPropertyValue('--text').trim(),
        muted: s.getPropertyValue('--text-muted').trim(),
        faint: s.getPropertyValue('--text-faint').trim(),
        grid: s.getPropertyValue('--grid-line').trim(),
    };
}

(function() {
    const toggle = document.getElementById('theme-toggle');
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        toggle.checked = true;
    }
    toggle.addEventListener('change', () => {
        const dark = toggle.checked;
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        localStorage.setItem('theme', dark ? 'dark' : 'light');
        // Re-render active tab to pick up theme colors
        const activeTab = document.querySelector('.tab.active')?.dataset.tab;
        if (activeTab === 'calendar') renderCalendar();
        if (activeTab === 'budget') renderBudget();
    });
})();

/* ── Tab switching ── */
document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');

        if (btn.dataset.tab === 'calendar') loadCalendar();
        if (btn.dataset.tab === 'budget') loadBudget();
        if (btn.dataset.tab === 'map') loadMap();
        if (btn.dataset.tab === 'competitions') loadCompetitions();
        if (btn.dataset.tab === 'settings') loadCostModel();
    });
});

/* ── Shared helpers ── */
async function api(path, opts = {}) {
    const res = await fetch('/api' + path, {
        headers: { 'Content-Type': 'application/json', ...opts.headers },
        ...opts,
    });
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json();
}

function eur(v) {
    return v != null ? v.toFixed(0) + '€' : '–';
}

function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}`;
}
