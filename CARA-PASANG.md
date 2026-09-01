# Kas UPA — pemasangan

Sekarang datanya online. Semua pengurus melihat angka yang sama dari HP masing-masing.

Pembagian tugasnya begini: **GitHub Pages** menyimpan berkas halamannya (gratis, hanya file statis, tidak bisa menyimpan data), dan **Supabase** menjadi basis data sekaligus tempat foto bukti transfer (gratis untuk pemakaian sekecil ini).

Ada tiga langkah. Sekitar 20 menit.

---

## Langkah 1 — Siapkan Supabase

1. Daftar di <https://supabase.com>, klik **New project**. Beri nama misalnya `kas-upa`, pilih region **Southeast Asia (Singapore)**, dan simpan baik-baik kata sandi database yang muncul.
2. Tunggu proyek selesai dibuat, lalu buka menu **SQL Editor** → **New query**.
3. Buka berkas `supabase-setup.sql`, salin **seluruh isinya**, tempel di editor, klik **Run**. Sekali saja. Ini membuat semua tabel, aturan akses, dan tempat penyimpanan foto.
4. Buka **Authentication** → **Users** → **Add user** → **Create new user**. Isi surel dan kata sandi bendahara, dan centang *Auto Confirm User* bila ada. Inilah akun Admin.
5. Buka **Project Settings** → **API**. Salin dua hal: **Project URL** dan kunci **anon public**.

> Jangan pernah menyalin kunci `service_role`. Yang dipakai hanya `anon`.

Sebagai tambahan, buka **Database** → **Replication** dan aktifkan realtime untuk tabel-tabel tadi. Kalau diaktifkan, perubahan dari HP lain muncul otomatis; kalau tidak, cukup tekan tombol **Muat ulang** di Beranda.

## Langkah 2 — Isi config.js

Buka `config.js`, isi dua barisnya:

```js
window.KASUPA_CONFIG = {
  url: "https://xxxxxxxx.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
};
```

Kunci anon memang boleh terlihat publik. Yang menjaga data adalah aturan Row Level Security yang sudah dipasang di langkah 1.

## Langkah 3 — Hosting di GitHub Pages

1. Daftar di <https://github.com>, klik **New repository**, beri nama `kas-upa`, pilih **Public**, Create.
2. Klik **Add file → Upload files**, seret **semua** berkas berikut, lalu Commit:

```
index.html   app.js   config.js   manifest.json   sw.js
icon-192.png   icon-512.png   icon-maskable-512.png   apple-touch-icon.png
```

3. Buka **Settings → Pages**. Bagian Source pilih `Deploy from a branch`, branch `main`, folder `/ (root)`, Save.
4. Tunggu satu menit. Alamatnya `https://namaakun.github.io/kas-upa/`.
5. Bagikan alamat itu ke grup WhatsApp. Di Chrome Android, menu tiga titik → **Install app** akan memasangnya seperti aplikasi biasa lengkap dengan ikon.

Kalau nanti ada perubahan, cukup unggah ulang berkas yang berubah di GitHub; semua orang langsung dapat versi terbaru.

---

## Dua peran

**Admin** masuk dengan surel dan kata sandi akun Supabase tadi. Kata sandi diperiksa oleh server Supabase, bukan oleh halaman web. Admin bisa mengubah dan menghapus apa pun, mencatat pengeluaran, mengubah pengaturan, dan **hanya admin yang bisa memverifikasi setoran**.

**Anggota** masuk tanpa sandi. Anggota bisa melihat semuanya, mengisi absensi, menjadwalkan dan mengubah informasi pertemuan, serta melaporkan setoran beserta foto bukti transfer. Laporan itu selalu berstatus *menunggu* dan belum menambah saldo sampai admin menekan Verifikasi.

Batasan ini bukan sekadar tombol yang disembunyikan. Aturan di database menolak permintaan anggota untuk mengubah, menghapus, atau mengesahkan catatan uang, jadi tetap aman walau ada yang mencoba mengakalinya dari peramban.

## Menu

**Beranda** — saldo kas, perbandingan pemasukan dan pengeluaran, **pertemuan berikutnya** dengan tanggal, tempat, hitungan hari, dan ringkasan informasinya, lalu setoran yang menunggu verifikasi dan transaksi terbaru.

**Anggota** — daftar jamaah, persentase kehadiran, total setoran, sisa tunggakan iuran.

**Pertemuan** — absensi Hadir/Izin/Sakit/Alpa, daftar agenda mendatang dan pertemuan yang sudah berjalan. Setiap baris bisa diketuk untuk membuka informasi lengkap. Tiap pertemuan punya kolom tanggal, tempat, materi, informasi kegiatan (kotak panjang, boleh banyak baris, tautan otomatis bisa diklik), intisari materi, dan satu foto poster.

**Setoran kas** — iuran bulanan, donasi, atau pemasukan lain; tunai atau transfer; dengan foto bukti.

**Pengeluaran** — belanja kelompok berikut kategori dan foto nota. Admin saja.

**Rekap** — kas per bulan dengan saldo kumulatif, kartu iuran 12 bulan per anggota, peringkat kehadiran, ekspor CSV, cetak/PDF.

## Kalau ada masalah

**Muncul layar "belum tersambung"** — `config.js` belum diisi atau salah ketik. Periksa lagi Project URL dan kunci anon.

**Muncul "Tidak diizinkan"** — Anda sedang masuk sebagai anggota, atau sesi admin sudah berakhir. Keluar lalu masuk lagi sebagai admin.

**Foto bukti gagal diunggah** — pastikan langkah SQL sudah dijalankan seluruhnya, termasuk bagian storage di bawah. Bisa juga dibuat manual lewat menu Storage: buat bucket bernama `bukti` dan tandai sebagai Public.

**Data tidak berubah padahal orang lain sudah mengisi** — tekan tombol Muat ulang di Beranda, atau aktifkan Replication seperti di Langkah 1.

Paket gratis Supabase akan menghentikan sementara proyek yang tidak dipakai selama seminggu penuh. Cukup buka aplikasinya sekali seminggu, atau login ke dashboard, dan proyek aktif kembali.
