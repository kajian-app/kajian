-- ============================================================
-- Kas UPA — penyiapan basis data Supabase
-- Jalankan seluruh isi berkas ini sekali saja di:
-- Supabase → SQL Editor → New query → tempel → Run
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABEL
-- ------------------------------------------------------------

create table if not exists public.settings (
  id         int primary key default 1,
  nama       text not null default 'Kas UPA',
  ustadz     text not null default 'Ust. Lutfi Firdaus',
  iuran      int  not null default 20000,
  rekening   text not null default '',
  bendahara  text not null default '',
  constraint settings_satu_baris check (id = 1)
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.members (
  id         uuid primary key default gen_random_uuid(),
  nama       text not null,
  hp         text not null default '',
  mulai      text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.meetings (
  id         uuid primary key default gen_random_uuid(),
  tanggal    date not null,
  judul      text not null default '',
  tempat     text not null default '',
  informasi  text not null default '',
  intisari   text not null default '',
  foto       text,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  member_id  uuid not null references public.members(id)  on delete cascade,
  status     text not null check (status in ('H','I','S','A')),
  primary key (meeting_id, member_id)
);

create table if not exists public.income (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid references public.members(id) on delete set null,
  nama       text not null default '',
  tipe       text not null default 'iuran'    check (tipe in ('iuran','donasi','lain')),
  periode    text not null default '',
  tanggal    date not null,
  nominal    int  not null check (nominal >= 0),
  metode     text not null default 'transfer' check (metode in ('transfer','tunai')),
  bukti      text,
  catatan    text not null default '',
  status     text not null default 'pending'  check (status in ('pending','verified')),
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  tanggal    date not null,
  keterangan text not null,
  nominal    int  not null check (nominal >= 0),
  kategori   text not null default 'Lainnya',
  oleh       text not null default '',
  bukti      text,
  created_at timestamptz not null default now()
);

create index if not exists income_tanggal_idx   on public.income (tanggal);
create index if not exists expenses_tanggal_idx on public.expenses (tanggal);
create index if not exists meetings_tanggal_idx on public.meetings (tanggal);

-- ------------------------------------------------------------
-- 2. ATURAN AKSES (Row Level Security)
--    anon          = pengunjung tanpa masuk, yaitu Anggota
--    authenticated = sudah masuk lewat Supabase Auth, yaitu Admin
-- ------------------------------------------------------------

alter table public.settings   enable row level security;
alter table public.members    enable row level security;
alter table public.meetings   enable row level security;
alter table public.attendance enable row level security;
alter table public.income     enable row level security;
alter table public.expenses   enable row level security;

-- semua orang boleh membaca
drop policy if exists baca_settings   on public.settings;
drop policy if exists baca_members    on public.members;
drop policy if exists baca_meetings   on public.meetings;
drop policy if exists baca_attendance on public.attendance;
drop policy if exists baca_income     on public.income;
drop policy if exists baca_expenses   on public.expenses;

create policy baca_settings   on public.settings   for select using (true);
create policy baca_members    on public.members    for select using (true);
create policy baca_meetings   on public.meetings   for select using (true);
create policy baca_attendance on public.attendance for select using (true);
create policy baca_income     on public.income     for select using (true);
create policy baca_expenses   on public.expenses   for select using (true);

-- admin boleh apa saja
drop policy if exists admin_settings   on public.settings;
drop policy if exists admin_members    on public.members;
drop policy if exists admin_meetings   on public.meetings;
drop policy if exists admin_attendance on public.attendance;
drop policy if exists admin_income     on public.income;
drop policy if exists admin_expenses   on public.expenses;

create policy admin_settings   on public.settings   for all to authenticated using (true) with check (true);
create policy admin_members    on public.members    for all to authenticated using (true) with check (true);
create policy admin_meetings   on public.meetings   for all to authenticated using (true) with check (true);
create policy admin_attendance on public.attendance for all to authenticated using (true) with check (true);
create policy admin_income     on public.income     for all to authenticated using (true) with check (true);
create policy admin_expenses   on public.expenses   for all to authenticated using (true) with check (true);

-- anggota: boleh mengatur jadwal dan informasi pertemuan, tapi tidak menghapusnya
drop policy if exists anggota_tambah_meeting on public.meetings;
drop policy if exists anggota_ubah_meeting   on public.meetings;
create policy anggota_tambah_meeting on public.meetings for insert to anon with check (true);
create policy anggota_ubah_meeting   on public.meetings for update to anon using (true) with check (true);

-- anggota: boleh mengisi absensi
drop policy if exists anggota_tambah_absen on public.attendance;
drop policy if exists anggota_ubah_absen   on public.attendance;
drop policy if exists anggota_hapus_absen  on public.attendance;
create policy anggota_tambah_absen on public.attendance for insert to anon with check (true);
create policy anggota_ubah_absen   on public.attendance for update to anon using (true) with check (true);
create policy anggota_hapus_absen  on public.attendance for delete to anon using (true);

-- anggota: boleh MELAPORKAN setoran, dan laporannya wajib berstatus 'pending'.
-- Tidak ada kebijakan update/delete untuk anon, jadi anggota tidak bisa
-- mengubah, menghapus, atau mengesahkan catatan uang. Itu hanya milik admin.
drop policy if exists anggota_lapor_setoran on public.income;
create policy anggota_lapor_setoran on public.income for insert to anon with check (status = 'pending');

-- pengeluaran, anggota, dan pengaturan sepenuhnya milik admin (tidak ada kebijakan anon)

-- ------------------------------------------------------------
-- 3. TEMPAT SIMPAN FOTO BUKTI
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('bukti', 'bukti', true)
on conflict (id) do nothing;

drop policy if exists bukti_baca   on storage.objects;
drop policy if exists bukti_unggah on storage.objects;
drop policy if exists bukti_hapus  on storage.objects;

create policy bukti_baca   on storage.objects for select using (bucket_id = 'bukti');
create policy bukti_unggah on storage.objects for insert with check (bucket_id = 'bukti');
create policy bukti_hapus  on storage.objects for delete to authenticated using (bucket_id = 'bukti');

-- ------------------------------------------------------------
-- Selesai. Langkah berikutnya ada di CARA-PASANG.md:
-- buat akun admin di menu Authentication, lalu isi config.js.
-- ------------------------------------------------------------
