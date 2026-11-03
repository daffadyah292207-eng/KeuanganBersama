/**
 * Lapisan data aplikasi.
 *
 * Ada dua mode:
 *  - "cloud" : data disimpan di Supabase (Postgres) dan butuh login.
 *  - "local" : data disimpan di localStorage browser (tanpa akun).
 *
 * Semua fungsi di bawah dipakai oleh app.js, sehingga tampilan tidak perlu
 * tahu sedang memakai mode yang mana.
 */
import { config } from './config.js';

const LOCAL_KEY = 'keuangan.transactions.v1';
const SUPABASE_SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let client = null;
let mode = 'local';
let currentUser = null;
const authListeners = new Set();

/* ------------------------------------------------------------------ */
/* Inisialisasi                                                        */
/* ------------------------------------------------------------------ */

export function isCloudConfigured() {
  return Boolean(
    String(config.SUPABASE_URL || '').trim() &&
    String(config.SUPABASE_ANON_KEY || '').trim()
  );
}

export function getMode() {
  return mode;
}

export function getUser() {
  return currentUser;
}

export async function init() {
  if (!isCloudConfigured()) {
    mode = 'local';
    return { mode, user: null, cloud: false };
  }

  try {
    const { createClient } = await import(SUPABASE_SDK);
    client = createClient(
      String(config.SUPABASE_URL).trim(),
      String(config.SUPABASE_ANON_KEY).trim(),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );

    mode = 'cloud';

    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    currentUser = data.session?.user ?? null;

    client.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user ?? null;
      if (event === 'SIGNED_OUT') mode = 'cloud';
      authListeners.forEach((fn) => fn(currentUser, event));
    });

    return { mode, user: currentUser, cloud: true };
  } catch (err) {
    console.error('[keuangan] Gagal memuat Supabase:', err);
    client = null;
    mode = 'local';
    return { mode, user: null, cloud: false, error: err };
  }
}

export function onAuthChange(fn) {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

export function enterLocalMode() {
  mode = 'local';
}

export function enterCloudMode() {
  if (client) mode = 'cloud';
}

/* ------------------------------------------------------------------ */
/* Autentikasi                                                         */
/* ------------------------------------------------------------------ */

function requireClient() {
  if (!client) throw new Error('Supabase belum terhubung. Periksa assets/js/config.js.');
}

export async function signIn(email, password) {
  requireClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: String(email).trim(),
    password,
  });
  if (error) throw error;
  currentUser = data.user;
  mode = 'cloud';
  return data.user;
}

export async function signOut() {
  if (!client) return;
  await client.auth.signOut();
  currentUser = null;
}

/* ------------------------------------------------------------------ */
/* Transaksi — cloud (Supabase)                                        */
/* ------------------------------------------------------------------ */

function mapRow(row) {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    amount: Number(row.amount),
    category: row.category || 'Lainnya',
    note: row.note || '',
    created_at: row.created_at,
  };
}

async function cloudList(from, to) {
  const { data, error } = await client
    .from('transactions')
    .select('id,date,type,amount,category,note,created_at')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map(mapRow);
}

async function cloudSave(tx) {
  const payload = {
    date: tx.date,
    type: tx.type,
    amount: Number(tx.amount),
    category: tx.category,
    note: tx.note || '',
  };

  if (tx.id) {
    const { data, error } = await client
      .from('transactions')
      .update(payload)
      .eq('id', tx.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapRow(data);
  }

  const { data, error } = await client
    .from('transactions')
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

async function cloudRemove(id) {
  const { error } = await client.from('transactions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Transaksi — lokal (localStorage)                                    */
/* ------------------------------------------------------------------ */

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(rows) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
}

function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'tx-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function localList(from, to) {
  return readLocal()
    .filter((t) => t.date >= from && t.date <= to)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
}

function localSave(tx) {
  const rows = readLocal();

  if (tx.id) {
    const i = rows.findIndex((t) => t.id === tx.id);
    if (i === -1) throw new Error('Transaksi tidak ditemukan.');
    rows[i] = {
      ...rows[i],
      date: tx.date,
      type: tx.type,
      amount: Number(tx.amount),
      category: tx.category,
      note: tx.note || '',
      updated_at: new Date().toISOString(),
    };
    writeLocal(rows);
    return rows[i];
  }

  const row = {
    id: uid(),
    date: tx.date,
    type: tx.type,
    amount: Number(tx.amount),
    category: tx.category,
    note: tx.note || '',
    created_at: new Date().toISOString(),
  };
  rows.push(row);
  writeLocal(rows);
  return row;
}

function localRemove(id) {
  const rows = readLocal().filter((t) => t.id !== id);
  writeLocal(rows);
}

/* ------------------------------------------------------------------ */
/* API publik                                                          */
/* ------------------------------------------------------------------ */

export async function listTransactions(from, to) {
  if (mode === 'cloud') {
    if (!currentUser) throw new Error('Sesi login tidak ditemukan. Silakan masuk kembali.');
    return cloudList(from, to);
  }
  return localList(from, to);
}

export async function saveTransaction(tx) {
  if (mode === 'cloud') {
    if (!currentUser) throw new Error('Sesi login tidak ditemukan. Silakan masuk kembali.');
    return cloudSave(tx);
  }
  return localSave(tx);
}

export async function removeTransaction(id) {
  if (mode === 'cloud') {
    if (!currentUser) throw new Error('Sesi login tidak ditemukan. Silakan masuk kembali.');
    return cloudRemove(id);
  }
  return localRemove(id);
}

/** Menghapus seluruh data lokal (dipakai untuk tombol reset bila perlu). */
export function clearLocalData() {
  localStorage.removeItem(LOCAL_KEY);
}

/* ------------------------------------------------------------------ */
/* Profil & panel admin                                                */
/* ------------------------------------------------------------------ */

export async function getProfile() {
  if (mode !== 'cloud' || !currentUser) return null;

  const { data, error } = await client
    .from('profiles')
    .select('id,email,display_name,role')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function listUserSummaries() {
  if (mode !== 'cloud' || !currentUser) return [];

  const { data, error } = await client
    .from('v_user_summary')
    .select('user_id,email,display_name,role,total_income,total_expense,balance,transaction_count,last_transaction')
    .order('email', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Membuat akun baru. Hanya berhasil jika pengguna yang login adalah superadmin
 * (ditegakkan lagi oleh fungsi SQL `create_app_user` di server).
 */
export async function createUser({ email, password, displayName, role }) {
  if (mode !== 'cloud' || !currentUser) {
    throw new Error('Harus login sebagai superadmin untuk membuat akun.');
  }

  const { data, error } = await client.rpc('create_app_user', {
    p_email: String(email).trim(),
    p_password: password,
    p_display_name: String(displayName || '').trim(),
    p_role: role || 'user',
  });

  if (error) throw new Error(error.message);
  return data;
}
