/**
 * Catatan Keuangan — logika aplikasi.
 */
import { config } from './config.js';
import * as db from './db.js';

/* ------------------------------------------------------------------ */
/* Util                                                                */
/* ------------------------------------------------------------------ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const INCOME_CATS = ['Gaji', 'Bonus', 'Usaha', 'Investasi', 'Hadiah', 'Lainnya'];
const EXPENSE_CATS = ['Makanan', 'Transportasi', 'Belanja', 'Tagihan', 'Kesehatan',
  'Pendidikan', 'Hiburan', 'Tabungan', 'Lainnya'];

const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (s) => {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const addDays = (d, n) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
};
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const startOfToday = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

function rp(n) {
  return 'Rp ' + nf.format(Math.round(Math.abs(Number(n) || 0)));
}

function rpSigned(n) {
  const v = Number(n) || 0;
  return (v < 0 ? '−' : '+') + rp(v);
}

function formatCompact(n) {
  const v = Number(n) || 0;
  const fmt = (x) => Number(x.toFixed(1)).toString().replace('.', ',');
  if (v >= 1e9) return fmt(v / 1e9) + ' M';
  if (v >= 1e6) return fmt(v / 1e6) + ' jt';
  if (v >= 1e3) return fmt(v / 1e3) + ' rb';
  return String(Math.round(v));
}

const longDateFmt = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
const dayHeadFmt = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
});

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const ICON_IN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7 7 7-7"/></svg>';
const ICON_OUT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7-7-7 7"/></svg>';
const ICON_EDIT = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>';
const ICON_EMPTY = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/><path d="M16 12h5v5h-5a2.5 2.5 0 0 1 0-5Z"/></svg>';

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
  view: 'monthly',
  anchor: startOfToday(),
  rows: [],
  search: '',
  typeFilter: 'all',
  editId: null,
  formType: 'expense',
  authTab: 'signin',
  profile: null,
};

let refreshToken = 0;
let toastTimer = null;

/* ------------------------------------------------------------------ */
/* Elements                                                            */
/* ------------------------------------------------------------------ */

const els = {
  boot: $('#boot'),
  auth: $('#auth-screen'),
  app: $('#app'),

  authForm: $('#auth-form'),
  authEmail: $('#auth-email'),
  authPassword: $('#auth-password'),
  authSubmit: $('#auth-submit'),
  authError: $('#auth-error'),
  authTitle: $('#auth-title'),
  authDesc: $('#auth-desc'),
  useLocal: $('#use-local'),

  modeChip: $('#mode-chip'),
  modeText: $('#mode-text'),
  adminBtn: $('#admin-btn'),
  adminDialog: $('#admin-dialog'),
  adminContent: $('#admin-content'),
  adminClose: $('#admin-close'),
  logoutBtn: $('#logout-btn'),
  footMode: $('#foot-mode'),
  themeToggle: $('#theme-toggle'),

  viewTabs: $('#view-tabs'),
  periodLabel: $('#period-label'),
  periodSub: $('#period-sub'),
  prevPeriod: $('#prev-period'),
  nextPeriod: $('#next-period'),
  todayBtn: $('#today-btn'),

  statIncome: $('#stat-income'),
  statExpense: $('#stat-expense'),
  statBalance: $('#stat-balance'),
  statCount: $('#stat-count'),
  statIncomeSub: $('#stat-income-sub'),
  statExpenseSub: $('#stat-expense-sub'),
  statBalanceSub: $('#stat-balance-sub'),
  statCountSub: $('#stat-count-sub'),

  chartTitle: $('#chart-title'),
  chartSub: $('#chart-sub'),
  chart: $('#chart'),

  listSub: $('#list-sub'),
  txList: $('#tx-list'),
  search: $('#search'),
  typeFilter: $('#type-filter'),
  exportBtn: $('#export-btn'),
  addBtn: $('#add-btn'),
  fabAdd: $('#fab-add'),

  dialog: $('#tx-dialog'),
  txForm: $('#tx-form'),
  txTitle: $('#tx-title'),
  txAmount: $('#tx-amount'),
  txDate: $('#tx-date'),
  txCategory: $('#tx-category'),
  txNote: $('#tx-note'),
  txError: $('#tx-error'),
  txSave: $('#tx-save'),
  txDelete: $('#tx-delete'),
  txClose: $('#tx-close'),
  txCancel: $('#tx-cancel'),
  categoryList: $('#category-list'),

  toast: $('#toast'),
};

/* ------------------------------------------------------------------ */
/* Tema                                                                */
/* ------------------------------------------------------------------ */

const THEME_KEY = 'keuangan.theme';
const ICON_MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';
const ICON_SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';

function applyTheme() {
  let theme = null;
  try { theme = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
  if (theme !== 'dark' && theme !== 'light') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
  els.themeToggle.innerHTML = theme === 'dark' ? ICON_SUN : ICON_MOON;
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  els.themeToggle.innerHTML = next === 'dark' ? ICON_SUN : ICON_MOON;
}

/* ------------------------------------------------------------------ */
/* Toast & error                                                       */
/* ------------------------------------------------------------------ */

function toast(message, kind = '') {
  els.toast.textContent = message;
  els.toast.className = `toast show ${kind}`.trim();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.className = `toast ${kind}`.trim();
  }, 3400);
}

function formError(message) {
  els.txError.textContent = message;
  els.txError.hidden = false;
}

function friendlyAuthError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Email atau password salah.';
  if (msg.includes('email not confirmed')) return 'Email belum dikonfirmasi. Cek kotak masuk emailmu.';
  if (msg.includes('already registered') || msg.includes('already been registered')) {
    return 'Email ini sudah terdaftar. Silakan masuk.';
  }
  if (msg.includes('password should be at least')) return 'Password minimal 6 karakter.';
  if (msg.includes('unable to validate email') || msg.includes('invalid email')) {
    return 'Format email tidak valid.';
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'Terlalu banyak percobaan. Coba lagi beberapa saat.';
  }
  if (msg.includes('failed to fetch') || msg.includes('networkerror')) {
    return 'Tidak dapat menghubungi Supabase. Periksa koneksi internet dan URL di config.js.';
  }
  return err?.message || 'Terjadi kesalahan. Coba lagi.';
}

/* ------------------------------------------------------------------ */
/* Periode                                                             */
/* ------------------------------------------------------------------ */

function currentRange() {
  const a = state.anchor;

  if (state.view === 'daily') {
    const d = iso(a);
    return { from: d, to: d, chartFrom: iso(addDays(a, -6)) };
  }

  if (state.view === 'monthly') {
    const from = new Date(a.getFullYear(), a.getMonth(), 1);
    const to = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    return { from: iso(from), to: iso(to), chartFrom: iso(from) };
  }

  const y = a.getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31`, chartFrom: `${y}-01-01` };
}

function chartKeys() {
  const a = state.anchor;
  const keys = [];
  const labels = [];

  if (state.view === 'daily') {
    for (let i = 6; i >= 0; i--) {
      const d = addDays(a, -i);
      keys.push(iso(d));
      labels.push(`${d.getDate()}/${d.getMonth() + 1}`);
    }
    return { keys, labels };
  }

  if (state.view === 'monthly') {
    const y = a.getFullYear();
    const m = a.getMonth();
    const total = daysInMonth(y, m);
    for (let d = 1; d <= total; d++) {
      keys.push(`${y}-${pad(m + 1)}-${pad(d)}`);
      labels.push(String(d));
    }
    return { keys, labels };
  }

  const y = a.getFullYear();
  for (let m = 0; m < 12; m++) {
    keys.push(`${y}-${pad(m + 1)}`);
    labels.push(MONTHS_SHORT[m]);
  }
  return { keys, labels };
}

function stepPeriod(dir) {
  const a = state.anchor;
  if (state.view === 'daily') {
    state.anchor = addDays(a, dir);
  } else if (state.view === 'monthly') {
    state.anchor = new Date(a.getFullYear(), a.getMonth() + dir, 1);
  } else {
    state.anchor = new Date(a.getFullYear() + dir, 0, 1);
  }
  refresh();
}

function defaultDate() {
  const a = state.anchor;
  const today = startOfToday();

  if (state.view === 'daily') return iso(a);

  if (state.view === 'monthly') {
    const sameMonth = a.getFullYear() === today.getFullYear() && a.getMonth() === today.getMonth();
    return sameMonth ? iso(today) : iso(new Date(a.getFullYear(), a.getMonth(), 1));
  }

  return a.getFullYear() === today.getFullYear() ? iso(today) : `${a.getFullYear()}-01-01`;
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

async function refresh() {
  const token = ++refreshToken;
  const range = currentRange();
  const from = range.chartFrom < range.from ? range.chartFrom : range.from;

  els.listSub.textContent = 'Memuat…';

  if (db.getMode() === 'cloud') {
    try {
      state.profile = await db.getProfile();
    } catch (err) {
      console.error('[keuangan] gagal memuat profil:', err);
      state.profile = null;
    }
  } else {
    state.profile = null;
  }

  try {
    const rows = await db.listTransactions(from, range.to);
    if (token !== refreshToken) return;
    state.rows = rows;
    render();
  } catch (err) {
    if (token !== refreshToken) return;
    console.error(err);
    els.listSub.textContent = 'Gagal memuat';
    toast('Gagal memuat data: ' + (err?.message || err), 'error');
  }
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

function render() {
  renderPeriod();
  renderStats();
  renderChart();
  renderList();
  updateModeChip();
}

function renderPeriod() {
  const a = state.anchor;

  if (state.view === 'daily') {
    els.periodLabel.textContent = longDateFmt.format(a);
    els.periodSub.textContent = 'Laporan harian · grafik 7 hari terakhir';
  } else if (state.view === 'monthly') {
    els.periodLabel.textContent = `${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
    els.periodSub.textContent = `1 – ${daysInMonth(a.getFullYear(), a.getMonth())} ${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  } else {
    els.periodLabel.textContent = String(a.getFullYear());
    els.periodSub.textContent = 'Januari – Desember';
  }

  $$('#view-tabs button').forEach((btn) => {
    const active = btn.dataset.view === state.view;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
}

function renderStats() {
  const range = currentRange();
  const rows = state.rows.filter((t) => t.date >= range.from && t.date <= range.to);

  let income = 0;
  let expense = 0;
  let incCount = 0;
  let expCount = 0;

  for (const t of rows) {
    if (t.type === 'income') {
      income += Number(t.amount) || 0;
      incCount += 1;
    } else {
      expense += Number(t.amount) || 0;
      expCount += 1;
    }
  }

  const balance = income - expense;

  els.statIncome.textContent = rp(income);
  els.statExpense.textContent = rp(expense);
  els.statBalance.textContent = (balance < 0 ? '−' : '') + rp(balance);
  els.statCount.textContent = nf.format(rows.length);

  els.statIncomeSub.textContent = `${incCount} transaksi masuk`;
  els.statExpenseSub.textContent = `${expCount} transaksi keluar`;
  els.statBalanceSub.textContent = balance >= 0 ? 'Surplus pada periode ini' : 'Defisit pada periode ini';
  els.statCountSub.textContent = `${incCount} masuk · ${expCount} keluar`;
}

function niceCeil(value) {
  if (!value || value <= 0) return 1000;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function renderChart() {
  const host = els.chart;
  if (!host) return;

  const { keys, labels } = chartKeys();
  const buckets = keys.map(() => ({ income: 0, expense: 0 }));
  const index = new Map(keys.map((k, i) => [k, i]));

  for (const t of state.rows) {
    const key = state.view === 'yearly' ? t.date.slice(0, 7) : t.date;
    const i = index.get(key);
    if (i === undefined) continue;
    if (t.type === 'income') buckets[i].income += Number(t.amount) || 0;
    else buckets[i].expense += Number(t.amount) || 0;
  }

  if (state.view === 'daily') {
    els.chartTitle.textContent = 'Arus kas 7 hari terakhir';
    els.chartSub.textContent = 'Termasuk hari yang sedang dipilih';
  } else if (state.view === 'monthly') {
    els.chartTitle.textContent = 'Arus kas harian';
    els.chartSub.textContent = `${MONTHS[state.anchor.getMonth()]} ${state.anchor.getFullYear()}`;
  } else {
    els.chartTitle.textContent = 'Arus kas bulanan';
    els.chartSub.textContent = `Tahun ${state.anchor.getFullYear()}`;
  }

  const maxValue = Math.max(0, ...buckets.map((b) => Math.max(b.income, b.expense)));
  const niceMax = niceCeil(maxValue);
  const total = buckets.reduce((sum, b) => sum + b.income + b.expense, 0);

  const padL = 62;
  const padR = 14;
  const padT = 14;
  const padB = 28;
  const height = 250;
  const minGroup = state.view === 'yearly' ? 52 : 30;
  const width = Math.max(host.clientWidth || 640, keys.length * minGroup + padL + padR);

  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const groupW = plotW / keys.length;
  const barW = Math.max(5, Math.min(18, groupW * 0.32));
  const gap = Math.min(2.5, barW * 0.3);

  const grid = [0, 0.25, 0.5, 0.75, 1].map((p) => {
    const y = padT + plotH - p * plotH;
    const dash = p === 0 ? '' : ' stroke-dasharray="3 5"';
    return `<line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="var(--border)" stroke-width="1"${dash}/>`
      + `<text x="${padL - 10}" y="${y + 3.6}" text-anchor="end" font-size="10.5" fill="var(--muted)">${formatCompact(niceMax * p)}</text>`;
  }).join('');

  const bars = buckets.map((b, i) => {
    const cx = padL + i * groupW + groupW / 2;
    const x1 = cx - barW - gap / 2;
    const x2 = cx + gap / 2;
    const h1 = (b.income / niceMax) * plotH;
    const h2 = (b.expense / niceMax) * plotH;
    const y1 = padT + plotH - h1;
    const y2 = padT + plotH - h2;
    const title = `${labels[i]} — masuk ${rp(b.income)}, keluar ${rp(b.expense)}`;
    return `<g><title>${escapeHtml(title)}</title>`
      + `<rect x="${x1}" y="${y1}" width="${barW}" height="${Math.max(h1, b.income > 0 ? 2 : 0)}" rx="3" fill="var(--income)"/>`
      + `<rect x="${x2}" y="${y2}" width="${barW}" height="${Math.max(h2, b.expense > 0 ? 2 : 0)}" rx="3" fill="var(--expense)"/>`
      + '</g>';
  }).join('');

  const maxLabels = Math.max(4, Math.floor(plotW / 52));
  const labelStep = Math.max(1, Math.ceil(keys.length / maxLabels));
  const xLabels = labels.map((label, i) => {
    if (i % labelStep !== 0 && i !== labels.length - 1) return '';
    return `<text x="${padL + i * groupW + groupW / 2}" y="${height - 8}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${label}</text>`;
  }).join('');

  const empty = total === 0
    ? `<text x="${padL + plotW / 2}" y="${padT + plotH / 2}" text-anchor="middle" font-size="12.5" fill="var(--muted)">Belum ada transaksi pada periode ini</text>`
    : '';

  host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Grafik pemasukan dan pengeluaran">`
    + grid + bars + xLabels + empty
    + '</svg>';
}

function filteredRows() {
  const range = currentRange();
  const q = state.search.trim().toLowerCase();

  return state.rows
    .filter((t) => t.date >= range.from && t.date <= range.to)
    .filter((t) => state.typeFilter === 'all' || t.type === state.typeFilter)
    .filter((t) => !q
      || String(t.category).toLowerCase().includes(q)
      || String(t.note || '').toLowerCase().includes(q))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
}

function renderList() {
  const rows = filteredRows();
  const range = currentRange();

  els.listSub.textContent = `${nf.format(rows.length)} transaksi`;

  if (!rows.length) {
    const filtered = Boolean(state.search.trim()) || state.typeFilter !== 'all';
    els.txList.innerHTML = `<div class="empty">
      <div class="empty-ico">${ICON_EMPTY}</div>
      <h3>${filtered ? 'Tidak ada hasil' : 'Belum ada transaksi'}</h3>
      <p>${filtered
        ? 'Coba ubah kata kunci atau filter jenis transaksi.'
        : `Catat pemasukan atau pengeluaran pertamamu pada periode ini (${escapeHtml(range.from)} s/d ${escapeHtml(range.to)}).`}</p>
      ${filtered ? '' : '<button type="button" class="btn primary sm" data-act="add">Tambah transaksi</button>'}
    </div>`;
    return;
  }

  const groups = new Map();
  for (const t of rows) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }

  let html = '';
  for (const [date, items] of groups) {
    const dayBalance = items.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
    const headClass = dayBalance >= 0 ? 'income' : 'expense';

    html += `<div class="day-group">
      <div class="day-head">
        <span>${escapeHtml(dayHeadFmt.format(fromISO(date)))}</span>
        <span class="day-total ${headClass}">${rpSigned(dayBalance)}</span>
      </div>
      <ul class="tx-list-plain">`;

    for (const t of items) {
      const isIncome = t.type === 'income';
      html += `<li class="tx" data-id="${escapeHtml(t.id)}">
        <span class="tx-ico ${isIncome ? 'income' : 'expense'}">${isIncome ? ICON_IN : ICON_OUT}</span>
        <div class="tx-main">
          <p class="tx-cat">${escapeHtml(t.category)}</p>
          ${t.note ? `<p class="tx-note">${escapeHtml(t.note)}</p>` : ''}
        </div>
        <span class="tx-amount ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '−'}${rp(t.amount)}</span>
        <div class="tx-actions">
          <button type="button" data-act="edit" title="Ubah" aria-label="Ubah transaksi">${ICON_EDIT}</button>
          <button type="button" data-act="delete" class="del" title="Hapus" aria-label="Hapus transaksi">${ICON_TRASH}</button>
        </div>
      </li>`;
    }

    html += '</ul></div>';
  }

  els.txList.innerHTML = html;
}

function updateModeChip() {
  const cloud = db.getMode() === 'cloud';
  const user = db.getUser();
  const isSuperadmin = cloud && state.profile?.role === 'superadmin';

  els.modeChip.classList.toggle('local', !cloud);
  els.modeText.textContent = cloud
    ? (user?.email || 'Terhubung')
    : 'Mode lokal';

  els.adminBtn.hidden = !isSuperadmin;
  els.logoutBtn.hidden = !cloud || !user;
  els.footMode.textContent = cloud
    ? (isSuperadmin ? 'Superadmin · tersimpan di Supabase' : 'Tersimpan di Supabase')
    : 'Tersimpan di browser ini (lokal)';
}

/* ------------------------------------------------------------------ */
/* Panel superadmin                                                    */
/* ------------------------------------------------------------------ */

function openAdmin() {
  if (state.profile?.role !== 'superadmin') return;

  els.adminContent.innerHTML = '<p class="muted small">Memuat data akun…</p>';
  if (!els.adminDialog.open) els.adminDialog.showModal();
  renderAdmin();
}

async function renderAdmin() {
  try {
    const rows = await db.listUserSummaries();

    if (!rows.length) {
      els.adminContent.innerHTML = '<p class="muted small">Belum ada akun.</p>';
      return;
    }

    const totalIncome = rows.reduce((s, r) => s + Number(r.total_income || 0), 0);
    const totalExpense = rows.reduce((s, r) => s + Number(r.total_expense || 0), 0);
    const totalCount = rows.reduce((s, r) => s + Number(r.transaction_count || 0), 0);
    const totalBalance = totalIncome - totalExpense;

    els.adminContent.innerHTML = `
      <div class="admin-scroll">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Akun</th>
              <th>Role</th>
              <th class="num">Transaksi</th>
              <th class="num">Masuk</th>
              <th class="num">Keluar</th>
              <th class="num">Saldo</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
              const balance = Number(r.balance || 0);
              const initial = String(r.display_name || r.email || '?').trim().charAt(0).toUpperCase();
              return `<tr>
                <td>
                  <div class="admin-user">
                    <span class="avatar">${escapeHtml(initial)}</span>
                    <div class="admin-user-text">
                      <strong>${escapeHtml(r.display_name || '—')}</strong>
                      <span class="muted tiny">${escapeHtml(r.email || '')}</span>
                    </div>
                  </div>
                </td>
                <td><span class="badge ${r.role === 'superadmin' ? 'admin' : ''}">${r.role === 'superadmin' ? 'Superadmin' : 'User'}</span></td>
                <td class="num">${nf.format(Number(r.transaction_count || 0))}</td>
                <td class="num income">${rp(r.total_income)}</td>
                <td class="num expense">${rp(r.total_expense)}</td>
                <td class="num ${balance < 0 ? 'expense' : ''}">${balance < 0 ? '−' : ''}${rp(balance)}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2">Total ${nf.format(rows.length)} akun</td>
              <td class="num">${nf.format(totalCount)}</td>
              <td class="num income">${rp(totalIncome)}</td>
              <td class="num expense">${rp(totalExpense)}</td>
              <td class="num ${totalBalance < 0 ? 'expense' : ''}">${totalBalance < 0 ? '−' : ''}${rp(totalBalance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="muted tiny admin-note">Diperbarui ${escapeHtml(new Date().toLocaleString('id-ID'))} · data hanya-baca</p>`;
  } catch (err) {
    console.error(err);
    els.adminContent.innerHTML = `<p class="form-error">Gagal memuat data: ${escapeHtml(err?.message || String(err))}</p>`;
  }
}

/* ------------------------------------------------------------------ */
/* Form transaksi                                                      */
/* ------------------------------------------------------------------ */

function categoryPool(type) {
  const defaults = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
  const used = state.rows
    .filter((t) => t.type === type)
    .map((t) => t.category)
    .filter(Boolean);
  return [...new Set([...defaults, ...used])];
}

function buildCategoryOptions(type) {
  els.categoryList.innerHTML = categoryPool(type)
    .map((c) => `<option value="${escapeHtml(c)}"></option>`)
    .join('');
}

function setFormType(type) {
  state.formType = type === 'income' ? 'income' : 'expense';
  $$('#tx-form [data-type]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.type === state.formType);
  });
  buildCategoryOptions(state.formType);
}

function openForm(tx = null) {
  state.editId = tx?.id ?? null;
  setFormType(tx?.type || 'expense');

  els.txTitle.textContent = tx ? 'Ubah Transaksi' : 'Tambah Transaksi';
  els.txAmount.value = tx ? nf.format(Math.round(tx.amount)) : '';
  els.txDate.value = tx ? tx.date : defaultDate();
  els.txCategory.value = tx ? tx.category : '';
  els.txNote.value = tx ? (tx.note || '') : '';
  els.txDelete.hidden = !tx;
  els.txError.hidden = true;
  els.txSave.disabled = false;
  els.txSave.textContent = 'Simpan';

  if (!els.dialog.open) els.dialog.showModal();
  setTimeout(() => els.txAmount.focus(), 60);
}

function closeForm() {
  if (els.dialog.open) els.dialog.close();
}

async function deleteTx(tx) {
  if (!tx) return;
  const ok = window.confirm(`Hapus transaksi "${tx.category}" sebesar ${rp(tx.amount)}?`);
  if (!ok) return;

  try {
    await db.removeTransaction(tx.id);
    toast('Transaksi dihapus.', 'success');
    await refresh();
  } catch (err) {
    console.error(err);
    toast('Gagal menghapus: ' + (err?.message || err), 'error');
  }
}

/* ------------------------------------------------------------------ */
/* Ekspor CSV                                                          */
/* ------------------------------------------------------------------ */

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv() {
  const rows = filteredRows();
  if (!rows.length) {
    toast('Tidak ada transaksi untuk diekspor.', 'warn');
    return;
  }

  const header = ['Tanggal', 'Jenis', 'Kategori', 'Jumlah', 'Catatan'];
  const lines = [header.join(',')];

  for (const t of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    lines.push([
      t.date,
      t.type === 'income' ? 'Masuk' : 'Keluar',
      t.category,
      t.amount,
      t.note || '',
    ].map(csvCell).join(','));
  }

  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const range = currentRange();
  a.href = url;
  a.download = `keuangan-${state.view}-${range.from}_${range.to}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);

  toast('CSV berhasil diunduh.', 'success');
}

/* ------------------------------------------------------------------ */
/* Auth UI                                                             */
/* ------------------------------------------------------------------ */

function setAuthTab(tab) {
  state.authTab = tab === 'signup' ? 'signup' : 'signin';
  const isSignup = state.authTab === 'signup';

  $$('#auth-screen [data-auth-tab]').forEach((btn) => {
    const active = btn.dataset.authTab === state.authTab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });

  els.authTitle.textContent = isSignup ? 'Buat akun baru' : 'Masuk ke akunmu';
  els.authDesc.textContent = isSignup
    ? 'Gratis. Data keuanganmu akan tersimpan di database Supabase milikmu sendiri.'
    : 'Data tersimpan aman di Supabase dan bisa dibuka dari perangkat mana pun.';
  els.authSubmit.textContent = isSignup ? 'Daftar' : 'Masuk';
  els.authPassword.autocomplete = isSignup ? 'new-password' : 'current-password';
  els.authError.className = 'form-error';
  els.authError.hidden = true;
}

function setAuthBusy(busy) {
  els.authSubmit.disabled = busy;
  els.authSubmit.textContent = busy
    ? 'Memproses…'
    : (state.authTab === 'signup' ? 'Daftar' : 'Masuk');
}

function showAuth() {
  els.app.hidden = true;
  els.auth.hidden = false;
  els.boot.hidden = true;
  state.profile = null;
  state.rows = [];
  els.adminBtn.hidden = true;
  setAuthTab('signin');
  els.authPassword.value = '';
}

function showApp() {
  els.auth.hidden = true;
  els.app.hidden = false;
  els.boot.hidden = true;
  updateModeChip();
  refresh();
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

function bindEvents() {
  els.themeToggle.addEventListener('click', toggleTheme);

  // --- panel superadmin
  els.adminBtn.addEventListener('click', openAdmin);
  els.adminClose.addEventListener('click', () => els.adminDialog.close());
  els.adminDialog.addEventListener('click', (e) => {
    if (e.target === els.adminDialog) els.adminDialog.close();
  });

  // --- auth
  $$('#auth-screen [data-auth-tab]').forEach((btn) => {
    btn.addEventListener('click', () => setAuthTab(btn.dataset.authTab));
  });

  els.authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = els.authEmail.value.trim();
    const password = els.authPassword.value;

    els.authError.className = 'form-error';

    if (!email || !password) {
      els.authError.textContent = 'Email dan password wajib diisi.';
      els.authError.hidden = false;
      return;
    }
    if (password.length < 6) {
      els.authError.textContent = 'Password minimal 6 karakter.';
      els.authError.hidden = false;
      return;
    }

    els.authError.hidden = true;
    setAuthBusy(true);

    try {
      if (state.authTab === 'signin') {
        await db.signIn(email, password);
        showApp();
        toast('Selamat datang kembali!', 'success');
      } else {
        const result = await db.signUp(email, password);
        if (result.needsConfirmation) {
          setAuthTab('signin');
          els.authError.className = 'form-error ok';
          els.authError.textContent = 'Akun dibuat. Cek email untuk konfirmasi, lalu masuk.';
          els.authError.hidden = false;
        } else {
          showApp();
          toast('Akun berhasil dibuat. Selamat mencatat!', 'success');
        }
      }
    } catch (err) {
      els.authError.className = 'form-error';
      els.authError.textContent = friendlyAuthError(err);
      els.authError.hidden = false;
    } finally {
      setAuthBusy(false);
    }
  });

  els.useLocal.addEventListener('click', () => {
    db.enterLocalMode();
    showApp();
    toast('Mode lokal aktif — data hanya tersimpan di browser ini.', 'warn');
  });

  els.modeChip.addEventListener('click', () => {
    const user = db.getUser();
    if (db.getMode() === 'cloud' && user) {
      toast(`Masuk sebagai ${user.email}`, '');
    } else if (db.isCloudConfigured()) {
      showAuth();
    } else {
      toast('Supabase belum dikonfigurasi. Isi assets/js/config.js lalu muat ulang halaman.', 'warn');
    }
  });

  els.logoutBtn.addEventListener('click', async () => {
    if (!window.confirm('Keluar dari akun ini?')) return;
    try {
      await db.signOut();
    } catch (err) {
      console.error(err);
    }
    state.rows = [];
    state.profile = null;
    showAuth();
    toast('Kamu sudah keluar.', 'success');
  });

  // --- periode
  els.viewTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn || btn.dataset.view === state.view) return;
    state.view = btn.dataset.view;
    refresh();
  });

  els.prevPeriod.addEventListener('click', () => stepPeriod(-1));
  els.nextPeriod.addEventListener('click', () => stepPeriod(1));
  els.todayBtn.addEventListener('click', () => {
    state.anchor = startOfToday();
    refresh();
  });

  // --- filter
  els.search.addEventListener('input', () => {
    state.search = els.search.value;
    renderList();
  });

  els.typeFilter.addEventListener('change', () => {
    state.typeFilter = els.typeFilter.value;
    renderList();
  });

  els.exportBtn.addEventListener('click', exportCsv);

  // --- tambah / edit / hapus
  els.addBtn.addEventListener('click', () => openForm());
  els.fabAdd.addEventListener('click', () => openForm());

  els.txList.addEventListener('click', async (e) => {
    const addBtn = e.target.closest('[data-act="add"]');
    if (addBtn) {
      openForm();
      return;
    }

    const btn = e.target.closest('button[data-act]');
    if (!btn) return;

    const li = btn.closest('.tx');
    const id = li?.dataset.id;
    const tx = state.rows.find((t) => String(t.id) === String(id));
    if (!tx) return;

    if (btn.dataset.act === 'edit') openForm(tx);
    if (btn.dataset.act === 'delete') await deleteTx(tx);
  });

  // --- dialog
  els.txClose.addEventListener('click', closeForm);
  els.txCancel.addEventListener('click', closeForm);

  els.dialog.addEventListener('click', (e) => {
    if (e.target === els.dialog) closeForm();
  });

  $$('#tx-form [data-type]').forEach((btn) => {
    btn.addEventListener('click', () => setFormType(btn.dataset.type));
  });

  els.txAmount.addEventListener('input', () => {
    const digits = els.txAmount.value.replace(/\D/g, '').slice(0, 15);
    els.txAmount.value = digits ? Number(digits).toLocaleString('id-ID') : '';
  });

  els.txDelete.addEventListener('click', async () => {
    const tx = state.rows.find((t) => String(t.id) === String(state.editId));
    closeForm();
    await deleteTx(tx);
  });

  els.txForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const amount = Number(els.txAmount.value.replace(/\D/g, ''));
    const date = els.txDate.value;
    const category = els.txCategory.value.trim() || 'Lainnya';
    const note = els.txNote.value.trim();

    if (!amount || amount <= 0) {
      formError('Jumlah harus lebih dari 0.');
      els.txAmount.focus();
      return;
    }
    if (!date) {
      formError('Tanggal wajib diisi.');
      els.txDate.focus();
      return;
    }

    els.txError.hidden = true;
    els.txSave.disabled = true;
    els.txSave.textContent = 'Menyimpan…';

    try {
      const isEdit = Boolean(state.editId);
      await db.saveTransaction({
        id: state.editId,
        date,
        type: state.formType,
        amount,
        category,
        note,
      });
      closeForm();
      toast(isEdit ? 'Transaksi diperbarui.' : 'Transaksi disimpan.', 'success');
      await refresh();
    } catch (err) {
      console.error(err);
      formError(err?.message || 'Gagal menyimpan transaksi.');
    } finally {
      els.txSave.disabled = false;
      els.txSave.textContent = 'Simpan';
    }
  });

  // --- responsif: gambar ulang grafik
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderChart, 150);
  });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function boot() {
  applyTheme();
  buildCategoryOptions('expense');
  bindEvents();

  const info = await db.init();

  if (info.cloud && info.user) {
    showApp();
  } else if (info.cloud) {
    showAuth();
  } else {
    showApp();
    if (info.error) {
      toast('Supabase tidak dapat dimuat — aplikasi memakai mode lokal.', 'warn');
    }
  }

  db.onAuthChange((user, event) => {
    // Defer: jangan panggil Supabase lagi di dalam callback auth (bisa deadlock).
    if (user) {
      setTimeout(() => {
        if (els.app.hidden) showApp();
      }, 0);
    } else if (event === 'SIGNED_OUT') {
      setTimeout(showAuth, 0);
    }
  });

  els.boot.hidden = true;
}

boot();
