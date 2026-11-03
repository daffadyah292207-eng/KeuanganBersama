-- ============================================================
--  CATATAN KEUANGAN — SKEMA DATABASE (SUPABASE / POSTGRESQL)
--  Tempel seluruh file ini ke Supabase → SQL Editor → Run.
--  Aman dijalankan ulang (idempotent).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Tabel utama: transaksi pemasukan & pengeluaran
-- ------------------------------------------------------------
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  date        date not null default current_date,
  type        text not null check (type in ('income', 'expense')),
  amount      numeric(14, 2) not null check (amount > 0),
  category    text not null default 'Lainnya'
                check (char_length(category) between 1 and 60),
  note        text not null default ''
                check (char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table  public.transactions is 'Catatan pemasukan (income) dan pengeluaran (expense) harian.';
comment on column public.transactions.date is 'Tanggal transaksi (zona waktu lokal pengguna).';
comment on column public.transactions.type is 'income = uang masuk, expense = uang keluar.';
comment on column public.transactions.note is 'Catatan bebas, misal keterangan belanja.';

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, date desc);

create index if not exists transactions_user_type_idx
  on public.transactions (user_id, type);

-- ------------------------------------------------------------
-- Trigger updated_at otomatis
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Row Level Security: setiap user hanya melihat datanya sendiri
-- ------------------------------------------------------------
alter table public.transactions enable row level security;

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own"
  on public.transactions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own"
  on public.transactions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own"
  on public.transactions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own"
  on public.transactions for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.transactions to authenticated;

-- Cabut privilege bawaan Supabase yang tidak dipakai aplikasi.
-- (TRUNCATE tidak terkena RLS, jadi sebaiknya tidak diberikan.)
revoke all on public.transactions from anon;
revoke all on public.transactions from authenticated;
grant select, insert, update, delete on public.transactions to authenticated;

-- ------------------------------------------------------------
-- View rekap harian / bulanan / tahunan
-- security_invoker = true → RLS tabel tetap berlaku
-- ------------------------------------------------------------
create or replace view public.v_daily_summary
with (security_invoker = true) as
select
  user_id,
  date,
  sum(case when type = 'income'  then amount else 0 end) as total_income,
  sum(case when type = 'expense' then amount else 0 end) as total_expense,
  sum(case when type = 'income'  then amount else -amount end) as balance,
  count(*) as transaction_count
from public.transactions
group by user_id, date;

create or replace view public.v_monthly_summary
with (security_invoker = true) as
select
  user_id,
  date_trunc('month', date)::date as month,
  sum(case when type = 'income'  then amount else 0 end) as total_income,
  sum(case when type = 'expense' then amount else 0 end) as total_expense,
  sum(case when type = 'income'  then amount else -amount end) as balance,
  count(*) as transaction_count
from public.transactions
group by user_id, date_trunc('month', date);

create or replace view public.v_yearly_summary
with (security_invoker = true) as
select
  user_id,
  extract(year from date)::int as year,
  sum(case when type = 'income'  then amount else 0 end) as total_income,
  sum(case when type = 'expense' then amount else 0 end) as total_expense,
  sum(case when type = 'income'  then amount else -amount end) as balance,
  count(*) as transaction_count
from public.transactions
group by user_id, extract(year from date);

grant select on public.v_daily_summary   to authenticated;
grant select on public.v_monthly_summary to authenticated;
grant select on public.v_yearly_summary  to authenticated;

revoke all on public.v_daily_summary   from anon;
revoke all on public.v_monthly_summary from anon;
revoke all on public.v_yearly_summary  from anon;
revoke all on public.v_daily_summary   from authenticated;
revoke all on public.v_monthly_summary from authenticated;
revoke all on public.v_yearly_summary  from authenticated;
grant select on public.v_daily_summary   to authenticated;
grant select on public.v_monthly_summary to authenticated;
grant select on public.v_yearly_summary  to authenticated;

-- ------------------------------------------------------------
-- Contoh query rekap (jalankan setelah ada data)
-- ------------------------------------------------------------
-- Harian:
--   select * from v_daily_summary order by date desc limit 31;
-- Bulanan:
--   select * from v_monthly_summary order by month desc limit 12;
-- Tahunan:
--   select * from v_yearly_summary order by year desc;

-- ============================================================
--  PROFIL PENGGUNA, ROLE, DAN PANEL SUPERADMIN
--  (idempotent — aman dijalankan ulang)
-- ============================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null default '',
  display_name text not null default '',
  role         text not null default 'user' check (role in ('user', 'admin', 'superadmin')),
  created_at   timestamptz not null default now()
);

comment on table public.profiles is 'Profil pengguna aplikasi + role (user / admin / superadmin).';

-- Pastikan constraint role juga diperbarui pada database yang sudah ada
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'admin', 'superadmin'));

alter table public.profiles enable row level security;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'superadmin'
  );
$$;

revoke all on function public.is_superadmin() from public;
grant execute on function public.is_superadmin() to authenticated;

-- Admin & superadmin boleh membaca data seluruh akun
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'superadmin')
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, email, display_name)
select id, coalesce(email, ''),
  coalesce(nullif(raw_user_meta_data->>'display_name', ''), split_part(coalesce(email, ''), '@', 1))
from auth.users
on conflict (id) do nothing;

-- Admin & superadmin boleh membaca seluruh transaksi (read-only)
drop policy if exists "transactions_select_superadmin" on public.transactions;
drop policy if exists "transactions_select_admin" on public.transactions;
create policy "transactions_select_admin"
  on public.transactions for select
  to authenticated
  using (public.is_admin());

-- Ringkasan per pengguna untuk panel admin
create or replace view public.v_user_summary
with (security_invoker = true) as
select
  p.id as user_id,
  p.email,
  p.display_name,
  p.role,
  coalesce(sum(case when t.type = 'income'  then t.amount else 0 end), 0) as total_income,
  coalesce(sum(case when t.type = 'expense' then t.amount else 0 end), 0) as total_expense,
  coalesce(sum(case when t.type = 'income'  then t.amount else -t.amount end), 0) as balance,
  count(t.id) as transaction_count,
  max(t.date) as last_transaction
from public.profiles p
left join public.transactions t on t.user_id = p.id
group by p.id, p.email, p.display_name, p.role;

revoke all on public.v_user_summary from anon;
revoke all on public.v_user_summary from authenticated;
grant select on public.v_user_summary to authenticated;

-- ============================================================
--  PEMBUATAN AKUN OLEH SUPERADMIN
--  Pendaftaran mandiri dinonaktifkan; akun hanya dibuat lewat
--  fungsi ini (dipanggil dari Panel Admin).
-- ============================================================
create or replace function public.create_app_user(
  p_email text,
  p_password text,
  p_display_name text default '',
  p_role text default 'user'
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id    uuid := gen_random_uuid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_role  text := lower(coalesce(nullif(btrim(p_role), ''), 'user'));
  v_name  text;
begin
  if not public.is_superadmin() then
    raise exception 'Hanya superadmin yang boleh membuat akun.'
      using errcode = '42501';
  end if;

  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Format email tidak valid.';
  end if;

  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Password minimal 6 karakter.';
  end if;

  if v_role not in ('user', 'admin', 'superadmin') then
    raise exception 'Role tidak valid.';
  end if;

  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'Email sudah terdaftar.';
  end if;

  v_name := coalesce(nullif(btrim(p_display_name), ''), split_part(v_email, '@', 1));

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', v_name),
    now(), now(), false, false,
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  update public.profiles
     set email = v_email,
         display_name = v_name,
         role = v_role
   where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.create_app_user(text, text, text, text) from public;
revoke all on function public.create_app_user(text, text, text, text) from anon;
grant execute on function public.create_app_user(text, text, text, text) to authenticated;
