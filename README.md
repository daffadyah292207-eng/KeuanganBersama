# Catatan Keuangan

Website pencatatan keuangan pribadi: **pemasukan**, **pengeluaran**, **catatan**, plus rekap **harian**, **bulanan**, dan **tahunan**. Data bisa disimpan di **Supabase (PostgreSQL)** atau di browser (**mode lokal**).

![status](https://img.shields.io/badge/status-siap%20pakai-0f9f6e) ![stack](https://img.shields.io/badge/stack-HTML%20%2B%20JS%20%2B%20Supabase-4f46e5)

---

## Fitur

- Catat transaksi **masuk / keluar** lengkap dengan tanggal, kategori, dan catatan.
- Tab laporan **Harian**, **Bulanan**, **Tahunan** dengan navigasi periode (◀ ▶) dan tombol "Hari ini".
- Kartu ringkasan: pemasukan, pengeluaran, saldo, dan jumlah transaksi.
- Grafik batang pemasukan vs pengeluaran (7 hari terakhir / per hari dalam bulan / per bulan dalam tahun).
- Daftar transaksi dikelompokkan per tanggal + subtotal harian.
- Cari catatan/kategori, filter jenis, ubah & hapus transaksi.
- Ekspor CSV sesuai periode & filter.
- Tema terang/gelap otomatis.
- **Mode lokal** (tanpa akun) dan **mode Supabase** (login, tersinkron antar perangkat).
- Keamanan baris (RLS): setiap pengguna hanya bisa melihat datanya sendiri.

---

## 1. Menjalankan di komputer

Butuh **Node.js 18+** (unduh: <https://nodejs.org>).

```bat
:: klik dua kali start.bat, atau dari terminal:
node server.mjs
```

Buka <http://localhost:5173>. Browser akan terbuka otomatis.

> Jangan buka `index.html` langsung lewat `file://`, karena modul JavaScript dan Supabase membutuhkan server HTTP.
> Untuk menjalankan tanpa membuka browser otomatis: `set NO_OPEN=1 && node server.mjs`.

Tanpa konfigurasi apa pun, aplikasi langsung jalan dalam **mode lokal** — data disimpan di `localStorage` browser. Cocok untuk mencoba.

---

## 2. Menyambungkan ke Supabase (database)

### 2.1 Buat project

1. Buka <https://supabase.com/dashboard> → login / daftar (gratis).
2. Klik **New project**.
   - **Name**: `keuangan` (bebas)
   - **Database Password**: buat password kuat, **simpan** (dipakai untuk koneksi Postgres langsung).
   - **Region**: `Southeast Asia (Singapore)` agar cepat dari Indonesia.
3. Klik **Create new project** dan tunggu ± 2 menit sampai statusnya hijau.

### 2.2 Buat tabel (jalankan skema)

1. Di sidebar project, pilih **SQL Editor** → **New query**.
2. Buka file [`supabase/schema.sql`](supabase/schema.sql) di editor teks, **salin seluruh isinya**.
3. Tempel ke SQL Editor, klik **Run** (Ctrl+Enter).
4. Pastikan muncul **"Success. No rows returned"**.

Yang dibuat:

| Objek | Fungsi |
| --- | --- |
| `public.transactions` | tabel transaksi (tanggal, jenis, jumlah, kategori, catatan) |
| `trg_transactions_updated_at` | mengisi `updated_at` otomatis |
| policy RLS | user hanya bisa akses barisnya sendiri |
| `v_daily_summary` | rekap per hari |
| `v_monthly_summary` | rekap per bulan |
| `v_yearly_summary` | rekap per tahun |
| `public.profiles` | profil + role (`user` / `superadmin`) |
| `public.is_superadmin()` | penanda hak akses superadmin untuk RLS |
| `v_user_summary` | ringkasan semua akun untuk panel superadmin |

### 2.3 Ambil kunci API

1. **Project Settings** (ikon gerigi) → **API** (di versi baru: **Data API**).
2. Salin:
   - **Project URL** → contoh `https://abcdefghijklm.supabase.co`
   - **anon public** / **publishable** key → contoh `sb_publishable_xxx` atau `eyJhbGciOi...`
3. Buka [`assets/js/config.js`](assets/js/config.js) dan isi:

```js
export const config = {
  APP_NAME: 'Catatan Keuangan',
  SUPABASE_URL: 'https://abcdefghijklm.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_xxxxxxxxxxxxxxxx',
};
```

4. Simpan file, lalu **refresh** halaman. Akan muncul layar **Masuk / Daftar**.

> ⚠️ Gunakan hanya **anon / publishable** key. **Jangan pernah** memakai `service_role` key di browser — key itu melewati RLS.

### 2.4 Daftar akun & tes

1. Klik tab **Daftar**, isi email + password (minimal 6 karakter).
2. Jika diminta konfirmasi email:
   - Cek email lalu klik tautan konfirmasi, **atau**
   - Matikan sementara: **Authentication → Sign In / Providers → Email → matikan "Confirm email" → Save**, lalu daftar lagi.
3. Setelah masuk, tambahkan transaksi.
4. Cek di **Table Editor → transactions** — data harus muncul.

### 2.5 Akun & role (project yang sudah terpasang)

Project Supabase yang dipakai aplikasi ini sudah berisi 3 akun:

| Email | Role | Bisa apa |
| --- | --- | --- |
| `admin@keuanganbersama.app` | `superadmin` | semua fitur user + **Panel Superadmin** (melihat ringkasan semua akun, hanya-baca) |
| `user1@keuanganbersama.app` | `user` | mencatat & melihat transaksi miliknya sendiri |
| `user2@keuanganbersama.app` | `user` | mencatat & melihat transaksi miliknya sendiri |

Password **tidak** disimpan di repo ini. Kalau lupa, reset lewat **Dashboard → Authentication → Users → pilih user → Reset password** (atau minta admin database mengganti hash-nya).

**Cara kerja role:**

- Role disimpan di `public.profiles.role` (`user` atau `superadmin`).
- Superadmin dikenali lewat fungsi `public.is_superadmin()`; RLS `transactions` memberi akses **SELECT saja** untuk superadmin, jadi panel admin tidak bisa mengubah data orang lain.
- Panel admin muncul otomatis sebagai tombol **Superadmin** di kanan atas setelah login dengan akun ber-role `superadmin`.

**Menjadikan pengguna lain superadmin** (SQL Editor):

```sql
update public.profiles
set role = 'superadmin'
where email = 'email@contoh.com';
```

**Mengembalikan ke user biasa:**

```sql
update public.profiles set role = 'user' where email = 'email@contoh.com';
```

> Akun baru yang mendaftar lewat halaman **Daftar** otomatis mendapat baris `profiles` dengan role `user` (lewat trigger `on_auth_user_created`).

---

## 3. Menyambungkan MCP Supabase ke OpenCode

MCP (Model Context Protocol) membuat saya/agent bisa **membaca & menulis database Supabase langsung** dari chat, misalnya membuat tabel, menjalankan SQL, atau menghitung rekap.

Konfigurasinya sudah saya siapkan di [`opencode.jsonc`](opencode.jsonc):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "supabase": {
      "type": "remote",
      "url": "https://mcp.supabase.com/mcp",
      "enabled": true,
      "oauth": {}
    }
  }
}
```

Langkah menghubungkan:

1. **Restart OpenCode** (konfigurasi MCP dibaca saat aplikasi mulai).
2. Jalankan autentikasi di terminal:

   ```bat
   opencode mcp auth supabase
   ```

   Browser akan terbuka → login akun Supabase → pilih organisasi/project → **Approve**.

3. Cek status:

   ```bat
   opencode mcp list
   ```

   Status harus **connected** / terautentikasi.

4. Uji dari chat OpenCode:

   > Gunakan MCP supabase, tampilkan daftar project saya.

   Lalu untuk membuat tabel:

   > Gunakan MCP supabase pada project `keuangan`, jalankan seluruh isi file `supabase/schema.sql`.

5. Selesai. Anda bisa meminta hal seperti:

   - "Tampilkan total pengeluaran bulan ini per kategori."
   - "Buat view rekap mingguan."
   - "Ada transaksi dengan catatan kosong? Lengkapi."

**Opsional — kunci ke satu project & mode read-only:**

```jsonc
"url": "https://mcp.supabase.com/mcp?project_ref=abcdefghijklm&read_only=true"
```

- `project_ref` = bagian acak di URL dashboard, mis. `https://supabase.com/dashboard/project/abcdefghijklm`
- `read_only=true` mencegah AI mengubah data (aman untuk eksplorasi).

### Alternatif: koneksi Postgres langsung

Kalau ingin memakai `psql`, DBeaver, atau TablePlus:

**Dashboard → Connect** → pilih **Session pooler** (IPv4) atau **Direct connection**.

```
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
```

> Connection string ini **hanya untuk tool server/desktop**, jangan dimasukkan ke website.

---

## 4. Struktur file

```
C:\Keuangan\
├─ index.html                 # halaman utama + dialog form
├─ start.bat                  # klik dua kali untuk menjalankan
├─ server.mjs                 # web server statis tanpa dependency
├─ vercel.json                # konfigurasi deploy Vercel (header keamanan)
├─ .vercelignore              # berkas yang tidak ikut deploy
├─ opencode.jsonc             # konfigurasi MCP Supabase untuk OpenCode
├─ assets/
│  ├─ css/styles.css          # tampilan (terang & gelap, responsif)
│  └─ js/
│     ├─ config.js            # ← isi URL & anon key Supabase di sini
│     ├─ db.js                # lapisan data: Supabase / localStorage
│     └─ app.js               # logika UI, rekap, grafik, ekspor
├─ supabase/
│  └─ schema.sql              # tabel, RLS, trigger, view rekap, profil/role
└─ README.md
```

---

## 5. Kustomisasi

- **Kategori default** → ubah `INCOME_CATS` / `EXPENSE_CATS` di `assets/js/app.js`.
  Kategori yang pernah dipakai otomatis muncul sebagai saran.
- **Nama aplikasi** → `APP_NAME` di `config.js` dan teks di `index.html`.
- **Warna** → variabel CSS di bagian `:root` pada `assets/css/styles.css`.

---

## 6. Deploy gratis

Website ini statis, jadi bisa di-hosting di mana saja.

### 6.1 Vercel (disarankan)

Repo ini sudah disiapkan untuk Vercel: tidak ada build step, tidak ada environment variable, dan `vercel.json` sudah berisi header keamanan.

**Cara A — lewat dashboard (paling mudah):**

1. Buka <https://vercel.com/new> dan login (bisa pakai akun GitHub).
2. Pilih **Import Git Repository** → repo `daffadyah292207-eng/KeuanganBersama`.
3. Isi pengaturan:
   - **Framework Preset**: `Other`
   - **Build Command**: kosongkan / biarkan default
   - **Output Directory**: kosongkan / `.`
   - **Root Directory**: `./`
   - **Environment Variables**: tidak ada
4. Klik **Deploy** dan tunggu ±30 detik.
5. Situs tersedia di `https://keuangan-bersama.vercel.app` (atau nama lain yang Vercel buat).

Setiap `git push` ke branch `main` akan otomatis membuat deployment baru.

**Cara B — lewat CLI:**

```bat
npx vercel login
npx vercel --prod
```

Ikuti tautan login yang muncul di terminal, lalu pilih project saat diminta.

### 6.2 Opsi lain

- **Netlify Drop** — buka <https://app.netlify.com/drop>, tarik folder `C:\Keuangan`.
- **GitHub Pages** — push ke repo, Settings → Pages → deploy dari branch `main` folder `/root`.

Pastikan `assets/js/config.js` sudah diisi sebelum deploy.

---

## 7. Query rekap manual (SQL Editor)

```sql
-- Rekap 30 hari terakhir
select * from v_daily_summary order by date desc limit 30;

-- Rekap 12 bulan terakhir
select * from v_monthly_summary order by month desc limit 12;

-- Rekap tahunan
select * from v_yearly_summary order by year desc;

-- Pengeluaran per kategori bulan ini
select category, sum(amount) as total
from transactions
where type = 'expense'
  and date >= date_trunc('month', current_date)
group by category
order by total desc;

-- Saldo keseluruhan
select
  coalesce(sum(case when type = 'income' then amount end), 0) as masuk,
  coalesce(sum(case when type = 'expense' then amount end), 0) as keluar,
  coalesce(sum(case when type = 'income' then amount else -amount end), 0) as saldo
from transactions;
```

---

## 8. Troubleshooting

| Masalah | Solusi |
| --- | --- |
| Halaman kosong / gaya tidak muncul | Jalankan lewat `start.bat` / `node server.mjs`, bukan `file://`. |
| "Supabase belum dikonfigurasi" | Isi `SUPABASE_URL` & `SUPABASE_ANON_KEY` di `assets/js/config.js`, lalu refresh. |
| "Invalid API key" | Salah menyalin key. Ambil ulang dari Project Settings → API. Jangan pakai `service_role`. |
| Login gagal "Email not confirmed" | Klik tautan di email, atau matikan *Confirm email* di Authentication → Providers → Email. |
| Data tidak muncul setelah login | Pastikan `schema.sql` sudah dijalankan dan RLS aktif. Cek Console browser (F12). |
| `opencode mcp auth supabase` gagal | Pastikan OpenCode sudah di-restart setelah `opencode.jsonc` dibuat; coba `opencode mcp debug supabase`. |
| Data hilang setelah ganti browser | Mode lokal tidak tersinkron. Sambungkan Supabase lalu salin ulang datanya. |

---

## Catatan keamanan

- `anon` / `publishable` key memang dirancang untuk publik; keamanan data dijaga oleh **Row Level Security**.
- `service_role` key = akses penuh tanpa RLS. Jangan taruh di frontend, jangan di-commit.
- Untuk produksi, aktifkan kembali konfirmasi email dan gunakan password kuat.
