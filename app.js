/* ============================================================
   Kas UPA — Ust. Lutfi Firdaus
   Data disimpan di Supabase. Berkas web boleh dihosting di GitHub Pages.
   ============================================================ */
(function () {
"use strict";

/* ---------- alat bantu ---------- */
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};
var pad = function (n) { return String(n).padStart(2, "0"); };
var localISO = function (d) { d = d || new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
var localMonth = function (d) { d = d || new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1); };
var rp = function (n) { return "Rp" + Math.round(Number(n) || 0).toLocaleString("id-ID"); };
var num = function (v) { return Math.max(0, Math.round(Number(String(v).replace(/[^\d]/g, "")) || 0)); };
var BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
var BULAN_S = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
var toDate = function (iso) { var p = String(iso).slice(0, 10).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); };
var fmtTgl = function (iso) { return iso ? toDate(iso).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "-"; };
var fmtTglS = function (iso) {
  if (!iso) return "-";
  var p = String(iso).slice(0, 10).split("-");
  return +p[2] + " " + BULAN_S[+p[1] - 1] + " " + p[0];
};
var fmtPeriode = function (p) { if (!p) return "-"; var a = p.split("-"); return BULAN[+a[1] - 1] + " " + a[0]; };
var initial = function (nama) {
  var w = String(nama || "?").trim().split(/\s+/);
  return ((w[0] || "?")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
};
function hariSelisih(iso) {
  var a = toDate(iso), b = new Date();
  a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0);
  return Math.round((a - b) / 86400000);
}
function hitungMundur(iso) {
  var d = hariSelisih(iso);
  if (d === 0) return "Hari ini";
  if (d === 1) return "Besok";
  if (d === 2) return "Lusa";
  if (d > 0) return d + " hari lagi";
  if (d === -1) return "Kemarin";
  return Math.abs(d) + " hari lalu";
}
function richText(t) {
  if (!t) return "";
  return esc(t).replace(/(https?:\/\/[^\s<]+)/g, function (u) {
    var href = u.replace(/&amp;/g, "&");
    var label = u.length > 48 ? u.slice(0, 46) + "\u2026" : u;
    return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + label + "</a>";
  }).replace(/\n/g, "<br>");
}
function potong(t, n) {
  t = String(t || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "\u2026" : t;
}

/* ============================================================
   SAMBUNGAN SUPABASE
   ============================================================ */
var CFG = window.KASUPA_CONFIG || {};
var sb = null;
function cfgOK() { return !!(CFG.url && CFG.anonKey && /^https:\/\/.+\.supabase\.co/.test(String(CFG.url).trim())); }

var db = { meta: { nama: "Kas UPA", ustadz: "Ust. Lutfi Firdaus", iuran: 20000, rekening: "", bendahara: "" },
           members: [], meetings: [], income: [], expenses: [] };
var role = null;
var loginMode = "choose";
var state = { tab: "beranda", meetingId: null, qAnggota: "", qKas: "", fKasStatus: "all",
              fKasBulan: "", fKeluarBulan: "", tahun: new Date().getFullYear() };
var pendingProof = null, pendingFoto = null;
var lastFetch = 0, busyCount = 0;
function isAdmin() { return role === "admin"; }

function syncState(s) {
  var d = $("#syncDot");
  if (!d) return;
  d.className = "syncdot" + (s === "busy" ? " busy" : s === "err" ? " err" : "");
  d.title = s === "busy" ? "Menyimpan\u2026" : s === "err" ? "Gagal tersambung" : "Data tersambung";
}
function busy(on) {
  busyCount += on ? 1 : -1;
  if (busyCount < 0) busyCount = 0;
  syncState(busyCount ? "busy" : "ok");
}
function pesanGalat(e) {
  var m = String((e && (e.message || e.error_description || e.msg)) || e || "");
  if (/row-level security|violates row-level/i.test(m)) return "Tidak diizinkan. Bagian ini hanya untuk admin.";
  if (/Invalid login credentials/i.test(m)) return "Surel atau kata sandi salah.";
  if (/Failed to fetch|NetworkError|fetch/i.test(m)) return "Gagal tersambung. Periksa koneksi internet.";
  if (/JWT|expired/i.test(m)) return "Sesi admin berakhir. Silakan masuk lagi.";
  return m || "Terjadi kesalahan.";
}
function ok(r) { if (r && r.error) throw r.error; return r; }

function fetchAll() {
  return Promise.all([
    sb.from("settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("members").select("*"),
    sb.from("meetings").select("*"),
    sb.from("attendance").select("*"),
    sb.from("income").select("*"),
    sb.from("expenses").select("*")
  ]).then(function (r) {
    r.forEach(ok);
    if (r[0].data) db.meta = r[0].data;
    db.members = r[1].data || [];
    db.meetings = (r[2].data || []).map(function (m) {
      m.tanggal = String(m.tanggal).slice(0, 10); m.att = {}; return m;
    });
    var byId = {};
    db.meetings.forEach(function (m) { byId[m.id] = m; });
    (r[3].data || []).forEach(function (a) { if (byId[a.meeting_id]) byId[a.meeting_id].att[a.member_id] = a.status; });
    db.income = (r[4].data || []).map(function (i) { i.tanggal = String(i.tanggal).slice(0, 10); return i; });
    db.expenses = (r[5].data || []).map(function (e) { e.tanggal = String(e.tanggal).slice(0, 10); return e; });
    lastFetch = Date.now();
  });
}
function refresh() { return fetchAll().then(function () { if (role) render(); }); }

/* jalankan aksi tulis lalu segarkan tampilan */
function run(promiseFactory, okMsg) {
  busy(true);
  return Promise.resolve().then(promiseFactory).then(ok).then(refresh)
    .then(function () { busy(false); if (okMsg) toast(okMsg); })
    .catch(function (e) { busy(false); syncState("err"); toast(pesanGalat(e)); setTimeout(function () { syncState("ok"); }, 2500); });
}

/* unggah gambar ke Supabase Storage, kembalikan URL publik */
function dataURLtoBlob(u) {
  var parts = u.split(","), mime = (parts[0].match(/:(.*?);/) || [])[1] || "image/jpeg";
  var bin = atob(parts[1]), n = bin.length, arr = new Uint8Array(n);
  while (n--) arr[n] = bin.charCodeAt(n);
  return new Blob([arr], { type: mime });
}
function uploadImage(dataUrl) {
  if (!dataUrl) return Promise.resolve(null);
  if (/^https?:/.test(dataUrl)) return Promise.resolve(dataUrl);
  var path = Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
  return sb.storage.from("bukti").upload(path, dataURLtoBlob(dataUrl), { contentType: "image/jpeg", upsert: false })
    .then(function (r) { ok(r); return sb.storage.from("bukti").getPublicUrl(path).data.publicUrl; });
}

/* ---------- pesan singkat ---------- */
var toastT;
function toast(msg) {
  var t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(function () { t.classList.remove("show"); }, 3000);
}

/* ---------- jendela ---------- */
function closeModal() { $("#modalRoot").innerHTML = ""; pendingProof = null; pendingFoto = null; }
function modal(opt) {
  var root = $("#modalRoot");
  var footer = opt.onSubmit
    ? '<div class="modal-ft"><button type="button" class="btn" data-close>Batal</button>' +
      '<button type="submit" class="btn ' + (opt.danger ? "btn-danger" : "btn-primary") + '">' + esc(opt.submitText || "Simpan") + "</button></div>"
    : '<div class="modal-ft"><button type="button" class="btn btn-primary" data-close>Tutup</button></div>';
  root.innerHTML =
    '<div class="overlay"><div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(opt.title) + '">' +
      '<div class="modal-hd"><h3>' + esc(opt.title) + '</h3><div class="spacer"></div>' +
      '<button type="button" class="icon-btn" data-close aria-label="Tutup" style="background:var(--surface-2);border-color:var(--line);color:var(--muted);font-size:15px">&#10005;</button></div>' +
      '<form id="mForm" novalidate><div class="modal-bd">' + opt.body + "</div>" + footer + "</form>" +
    "</div></div>";
  var form = $("#mForm");
  $$("[data-close]", root).forEach(function (b) { b.addEventListener("click", closeModal); });
  $(".overlay", root).addEventListener("mousedown", function (e) { if (e.target === this) closeModal(); });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!opt.onSubmit) { closeModal(); return; }
    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = v; });
    if (opt.onSubmit(data, form) !== false) closeModal();
  });
  if (opt.after) opt.after(form);
  var first = form.querySelector("input:not([type=file]),select,textarea");
  if (first) setTimeout(function () { first.focus(); }, 60);
}
function confirmBox(title, msg, onYes, yesText) {
  modal({ title: title, submitText: yesText || "Hapus", danger: true,
    body: '<p style="margin:0;font-size:14.5px">' + msg + "</p>",
    onSubmit: function () { onYes(); } });
}

/* ---------- gambar ---------- */
function compressImage(file, max, q) {
  max = max || 1000; q = q || 0.7;
  return new Promise(function (res, rej) {
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height, sc = Math.min(1, max / Math.max(w, h));
        w = Math.max(1, Math.round(w * sc)); h = Math.max(1, Math.round(h * sc));
        var c = document.createElement("canvas"); c.width = w; c.height = h;
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        res(c.toDataURL("image/jpeg", q));
      };
      img.onerror = function () { rej(new Error("x")); };
      img.src = fr.result;
    };
    fr.onerror = function () { rej(new Error("x")); };
    fr.readAsDataURL(file);
  });
}
function imageField(id, label, hint, existing, slot) {
  if (slot === "foto") pendingFoto = existing || null; else pendingProof = existing || null;
  return '<div class="field"><label for="' + id + '">' + esc(label) + "</label>" +
    '<input type="file" id="' + id + '" accept="image/*" style="border:1px dashed var(--line);padding:9px;border-radius:10px;width:100%;background:var(--surface-2)">' +
    '<div id="' + id + 'Box"></div><p class="hint">' + esc(hint) + "</p></div>";
}
function bindImage(form, id, slot) {
  var input = $("#" + id, form), box = $("#" + id + "Box", form);
  if (!input) return;
  function get() { return slot === "foto" ? pendingFoto : pendingProof; }
  function set(v) { if (slot === "foto") pendingFoto = v; else pendingProof = v; }
  function paint() {
    box.innerHTML = get() ? '<img class="thumb" src="' + get() + '" alt=""><button type="button" class="btn btn-sm btn-danger" data-rm="1" style="margin-top:8px">Hapus gambar</button>' : "";
    var rm = box.querySelector("[data-rm]");
    if (rm) rm.addEventListener("click", function () { set(null); input.value = ""; paint(); });
  }
  paint();
  input.addEventListener("change", function () {
    var f = input.files && input.files[0];
    if (!f) return;
    compressImage(f).then(function (u) { set(u); paint(); }).catch(function () { toast("Gambar gagal dibaca."); });
  });
}
function showImage(url, judul) { modal({ title: judul || "Gambar", body: '<img class="thumb" src="' + url + '" alt="" style="margin-top:0">' }); }

/* ---------- hitungan ---------- */
function verifiedIncome() { return db.income.filter(function (i) { return i.status === "verified"; }); }
function totalMasuk() { return verifiedIncome().reduce(function (a, i) { return a + i.nominal; }, 0); }
function totalKeluar() { return db.expenses.reduce(function (a, e) { return a + e.nominal; }, 0); }
function saldo() { return totalMasuk() - totalKeluar(); }
function pendingList() { return db.income.filter(function (i) { return i.status !== "verified"; }); }
function memberById(id) { return db.members.filter(function (m) { return m.id === id; })[0]; }
function meetingById(id) { return db.meetings.filter(function (m) { return m.id === id; })[0]; }
function incomeById(id) { return db.income.filter(function (x) { return x.id === id; })[0]; }
function expenseById(id) { return db.expenses.filter(function (x) { return x.id === id; })[0]; }
function namaOf(i) {
  if (i.member_id) { var m = memberById(i.member_id); return m ? m.nama : "Anggota terhapus"; }
  return i.nama || "Umum";
}
function hadirStats(memberId) {
  var total = 0, hadir = 0;
  db.meetings.forEach(function (mt) {
    var s = mt.att[memberId];
    if (s) { total++; if (s === "H") hadir++; }
  });
  return { total: total, hadir: hadir, pct: total ? Math.round((hadir / total) * 100) : 0 };
}
function lunasBulan(memberId, periode) {
  return verifiedIncome().some(function (i) { return i.member_id === memberId && i.tipe === "iuran" && i.periode === periode; });
}
function tunggakan(memberId, tahun) {
  var now = new Date(), m = memberById(memberId);
  if (!m) return { bulan: 0, nominal: 0 };
  var akhir = tahun < now.getFullYear() ? 12 : (tahun > now.getFullYear() ? 0 : now.getMonth() + 1);
  var mulai = 1;
  if (m.mulai) {
    var mp = String(m.mulai).split("-");
    if (+mp[0] > tahun) mulai = 13;
    else if (+mp[0] === tahun) mulai = +mp[1];
  }
  var n = 0;
  for (var b = mulai; b <= akhir; b++) if (!lunasBulan(memberId, tahun + "-" + pad(b))) n++;
  return { bulan: n, nominal: n * (db.meta.iuran || 0) };
}
function setoranTahun(memberId, tahun) {
  return verifiedIncome().filter(function (i) { return i.member_id === memberId && i.tanggal.slice(0, 4) === String(tahun); })
    .reduce(function (a, i) { return a + i.nominal; }, 0);
}
function meetingsDesc() { return db.meetings.slice().sort(function (a, b) { return a.tanggal < b.tanggal ? 1 : -1; }); }
function nextMeeting() {
  var t = localISO();
  return db.meetings.filter(function (m) { return m.tanggal >= t; })
    .sort(function (a, b) { return a.tanggal > b.tanggal ? 1 : -1; })[0] || null;
}
function defaultMeeting() {
  var t = localISO();
  return meetingsDesc().filter(function (m) { return m.tanggal <= t; })[0] || nextMeeting();
}
function activeMeeting() { return db.meetings.length ? (meetingById(state.meetingId) || defaultMeeting()) : null; }
function attCount(mt) {
  var c = { H: 0, I: 0, S: 0, A: 0 };
  db.members.forEach(function (m) { if (c[mt.att[m.id]] != null) c[mt.att[m.id]]++; });
  return c;
}

/* ---------- ikon ---------- */
var ICO = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>',
  empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  cek: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m4 12 5 5L20 6"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>',
  ulang: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>',
  seal: '<svg viewBox="0 0 64 64" fill="none" stroke="#E0C179" stroke-width="3"><rect x="18" y="18" width="28" height="28"/><path d="M32 12 52 32 32 52 12 32Z"/></svg>'
};
function emptyState(pesan, tombol) {
  return '<div class="empty">' + ICO.empty + "<p>" + esc(pesan) + "</p>" + (tombol || "") + "</div>";
}

/* ============================================================
   LAYAR MASUK
   ============================================================ */
function loginShell(body) {
  var root = $("#loginRoot");
  root.className = "login on";
  $("#app").classList.add("hidden");
  root.innerHTML = '<div class="login-inner"><div class="mark">' + ICO.seal + "</div>" +
    "<h1>" + esc(db.meta.nama || "Kas UPA") + "</h1>" +
    '<p class="lead">' + esc(db.meta.ustadz || "") + " \u00b7 kajian mingguan</p>" + body + "</div>";
}
function showSetup(pesan) {
  loginShell('<div class="login-form"><label>Aplikasi belum tersambung ke Supabase</label>' +
    '<p class="hint" style="margin-top:0">' + esc(pesan || "Buka berkas config.js, lalu isi Project URL dan kunci anon dari dashboard Supabase (Project Settings \u2192 API).") + "</p>" +
    "<pre>window.KASUPA_CONFIG = {\n  url: \"https://xxxx.supabase.co\",\n  anonKey: \"eyJhbGciOi...\"\n};</pre>" +
    '<p class="hint">Jalankan juga supabase-setup.sql di SQL Editor. Panduan lengkap ada di CARA-PASANG.md.</p>' +
    '<div class="btn-row"><button class="btn btn-brass btn-block" data-act="login-retry">Coba lagi</button></div></div>');
}
function showLoading() {
  loginShell('<div class="login-form" style="text-align:center"><p class="hint" style="margin:0">Mengambil data\u2026</p></div>');
}
function showLogin() {
  var body;
  if (loginMode === "choose") {
    body = '<div class="roles">' +
      '<button class="role" data-act="login-pick" data-r="admin">' +
        '<span class="ri"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/></svg></span>' +
        "<span><b>Masuk sebagai Admin</b><span>Bendahara. Bisa mengubah dan menghapus semuanya.</span></span></button>" +
      '<button class="role" data-act="login-pick" data-r="anggota">' +
        '<span class="ri"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg></span>' +
        "<span><b>Masuk sebagai Anggota</b><span>Lihat agenda, isi absen, lapor setoran. Tanpa sandi.</span></span></button></div>";
  } else {
    body = '<div class="login-form"><label for="pEmail">Surel admin</label>' +
      '<input type="text" id="pEmail" inputmode="email" autocomplete="username" placeholder="bendahara@contoh.com">' +
      '<label for="p1" style="margin-top:11px">Kata sandi</label>' +
      '<input type="password" id="p1" autocomplete="current-password">' +
      '<div class="btn-row"><button class="btn btn-brass btn-block" data-act="login-admin">Masuk</button></div>' +
      '<button class="link-btn" data-act="login-back">Kembali</button>' +
      '<p class="hint">Akun admin dibuat di dashboard Supabase \u2192 Authentication \u2192 Users \u2192 Add user. ' +
      "Kata sandi diperiksa oleh server Supabase, bukan oleh halaman ini.</p></div>";
  }
  loginShell(body);
  var f = $("#pEmail") || $("#p1");
  if (f) setTimeout(function () { f.focus(); }, 80);
}
function enter(r) {
  role = r;
  try { sessionStorage.setItem("kasupa_role", r); } catch (e) {}
  $("#loginRoot").className = "login";
  $("#loginRoot").innerHTML = "";
  $("#app").classList.remove("hidden");
  syncState("ok");
  render();
}
function logout() {
  role = null; loginMode = "choose";
  try { sessionStorage.removeItem("kasupa_role"); } catch (e) {}
  closeModal();
  (sb ? sb.auth.signOut().catch(function () {}) : Promise.resolve()).then(showLogin);
}
function goyang() {
  var box = $(".login-form");
  if (box) { box.classList.add("shake"); setTimeout(function () { box.classList.remove("shake"); }, 400); }
}

/* ============================================================
   RENDER
   ============================================================ */
function render() {
  if (!role) return;
  var focus = document.activeElement && document.activeElement.id;
  var pos = null;
  try { if (focus && /^(text|search|tel|url|password)$/.test(document.activeElement.type || "")) pos = document.activeElement.selectionStart; } catch (e) {}

  $("#brandName").textContent = db.meta.nama || "Kas UPA";
  $("#brandSub").textContent = db.meta.ustadz || "";
  document.title = (db.meta.nama || "Kas UPA") + " — " + (db.meta.ustadz || "");
  var chip = $("#roleChip");
  chip.textContent = isAdmin() ? "Admin" : "Anggota";
  chip.className = "rolechip" + (isAdmin() ? "" : " anggota");
  $("#btnSettings").classList.toggle("hidden", !isAdmin());
  $("#footNote").textContent = (db.meta.nama || "Kas UPA") + " \u00b7 Data tersimpan online di Supabase" +
    (isAdmin() ? " \u00b7 Anda masuk sebagai admin." : " \u00b7 Perubahan catatan uang hanya bisa dilakukan admin.");

  renderBeranda(); renderAnggota(); renderAbsensi(); renderKas(); renderKeluar(); renderRekap();

  $$(".tab").forEach(function (t) { t.setAttribute("aria-selected", t.dataset.tab === state.tab ? "true" : "false"); });
  $$(".section").forEach(function (s) { s.classList.toggle("active", s.id === "s-" + state.tab); });

  if (focus) {
    var el = document.getElementById(focus);
    if (el && el.focus) {
      el.focus();
      if (pos != null && el.setSelectionRange) { try { el.setSelectionRange(pos, pos); } catch (e) {} }
    }
  }
}

/* ---------- Beranda ---------- */
function renderBeranda() {
  var masuk = totalMasuk(), keluar = totalKeluar(), s = saldo(), tunda = pendingList();
  var tundaTotal = tunda.reduce(function (a, i) { return a + i.nominal; }, 0);
  var tot = masuk + keluar || 1;

  var h = "";
  if (tunda.length && isAdmin()) {
    h += '<div class="banner no-print"><span>' + tunda.length + " setoran menunggu verifikasi Anda.</span>" +
      '<span class="spacer"></span><button class="btn btn-sm" data-act="go" data-tab="kas">Periksa</button></div>';
  }

  h += '<div class="balance">' +
    '<div class="balance-top"><div class="balance-label">Saldo kas kelompok</div>' +
      '<div class="balance-amount' + (s < 0 ? " minus" : "") + '">' + rp(s) + "</div>" +
      '<div class="meter"><i class="in" style="width:' + (masuk / tot * 100) + '%"></i><i class="out" style="width:' + (keluar / tot * 100) + '%"></i></div>' +
      '<div class="meter-key"><span><span class="dot in"></span>Masuk <b>' + rp(masuk) + "</b></span>" +
      '<span><span class="dot out"></span>Keluar <b>' + rp(keluar) + "</b></span></div></div>" +
    '<div class="balance-grid">' +
      '<div class="bstat"><b>' + db.members.length + "</b><span>Anggota</span></div>" +
      '<div class="bstat"><b>' + db.meetings.length + "</b><span>Pertemuan</span></div>" +
      '<div class="bstat"><b style="color:' + (tunda.length ? "var(--brass)" : "inherit") + '">' + tunda.length + "</b><span>Perlu diverifikasi</span></div>" +
    "</div></div>";

  var nx = nextMeeting();
  h += '<div style="margin-top:14px">';
  if (nx) {
    var p = nx.tanggal.split("-");
    h += '<div class="next"><div class="next-hd">' +
      '<div class="datebox"><b>' + p[2] + "</b><span>" + BULAN_S[+p[1] - 1] + "</span></div>" +
      '<div class="next-main"><div class="next-eyebrow">Pertemuan berikutnya</div>' +
        "<h3>" + esc(nx.judul || "Kajian rutin") + "</h3>" +
        '<div class="next-meta">' + esc(toDate(nx.tanggal).toLocaleDateString("id-ID", { weekday: "long" })) +
          (nx.tempat ? " \u00b7 " + esc(nx.tempat) : "") + "</div>" +
        '<div style="margin-top:8px"><span class="countdown">' + esc(hitungMundur(nx.tanggal)) + "</span></div>" +
      "</div></div>" +
      (nx.informasi ? '<div class="next-info">' + richText(potong(nx.informasi, 220)) + "</div>" : "") +
      '<div class="next-ft no-print">' +
        '<button class="btn btn-sm btn-brass" data-act="meeting-detail" data-id="' + nx.id + '">Lihat informasi</button>' +
        '<button class="btn btn-sm" data-act="open-absen" data-id="' + nx.id + '">Isi absensi</button>' +
        '<button class="btn btn-sm" data-act="edit-meeting" data-id="' + nx.id + '">Ubah</button>' +
      "</div></div>";
  } else {
    h += '<div class="card"><div class="card-hd"><h2>Pertemuan berikutnya</h2></div>' +
      emptyState("Belum ada agenda mendatang. Jadwalkan kajian pekan depan supaya semua tahu.",
        '<button class="btn btn-primary btn-sm" data-act="add-meeting">Buat agenda</button>') + "</div>";
  }
  h += "</div>";

  h += '<div class="btn-row no-print" style="margin-top:14px">' +
    '<button class="btn btn-primary" data-act="add-income">' + ICO.plus + (isAdmin() ? " Catat setoran" : " Lapor setoran") + "</button>" +
    (isAdmin() ? '<button class="btn" data-act="add-expense">Catat pengeluaran</button>' : "") +
    '<button class="btn" data-act="add-meeting">Jadwalkan pertemuan</button>' +
    '<button class="btn" data-act="reload">' + ICO.ulang + " Muat ulang</button></div>";

  if (tunda.length) {
    h += '<div class="card" style="margin-top:14px"><div class="card-hd"><h2>Setoran menunggu verifikasi</h2>' +
      '<div class="spacer"></div><span class="chip wait">' + rp(tundaTotal) + "</span></div>" +
      '<ul class="ledger">' + tunda.slice(0, 5).map(incomeRow).join("") + "</ul>" +
      (isAdmin() ? "" : '<div class="card-bd sub" style="border-top:1px solid var(--line-2)">Menunggu dicek admin sebelum masuk saldo.</div>') + "</div>";
  }

  var last = db.income.slice().sort(function (a, b) { return a.tanggal < b.tanggal ? 1 : -1; }).slice(0, 5);
  var lastE = db.expenses.slice().sort(function (a, b) { return a.tanggal < b.tanggal ? 1 : -1; }).slice(0, 4);
  h += '<div class="card" style="margin-top:14px"><div class="card-hd"><h2>Setoran terbaru</h2><div class="spacer"></div>' +
    '<button class="btn btn-sm no-print" data-act="go" data-tab="kas">Semua</button></div>' +
    (last.length ? '<ul class="ledger">' + last.map(incomeRow).join("") + "</ul>" : emptyState("Belum ada setoran masuk.")) + "</div>";
  h += '<div class="card" style="margin-top:14px"><div class="card-hd"><h2>Pengeluaran terbaru</h2><div class="spacer"></div>' +
    '<button class="btn btn-sm no-print" data-act="go" data-tab="keluar">Semua</button></div>' +
    (lastE.length ? '<ul class="ledger">' + lastE.map(expenseRow).join("") + "</ul>" : emptyState("Belum ada pengeluaran.")) + "</div>";

  $("#s-beranda").innerHTML = h;
}
function incomeRow(i) {
  var nm = namaOf(i);
  var ket = i.tipe === "iuran" ? "Iuran " + fmtPeriode(i.periode) : (i.tipe === "donasi" ? "Donasi" : "Pemasukan lain");
  return '<li><div class="avatar">' + esc(initial(nm)) + "</div>" +
    '<div class="main"><b>' + esc(nm) + "</b><span>" + esc(ket) + " \u00b7 " + fmtTglS(i.tanggal) + " \u00b7 " +
      (i.metode === "transfer" ? "Transfer" : "Tunai") +
      (i.bukti ? ' \u00b7 <button class="proof-link" data-act="proof" data-id="' + i.id + '">lihat bukti</button>' : "") + "</span></div>" +
    '<div style="text-align:right">' +
      '<div class="amt in">+' + rp(i.nominal) + "</div>" +
      (i.status === "verified" ? '<span class="chip ok" style="margin-top:3px">Terverifikasi</span>'
        : (isAdmin() ? '<button class="btn btn-sm no-print" data-act="verify" data-id="' + i.id + '" style="margin-top:4px">Verifikasi</button>'
                     : '<span class="chip wait" style="margin-top:3px">Menunggu</span>')) +
    "</div></li>";
}
function expenseRow(e) {
  return '<li><div class="avatar" style="font-family:inherit;font-size:11.5px;color:var(--brick)">' + esc((e.kategori || "Lain").slice(0, 4)) + "</div>" +
    '<div class="main"><b>' + esc(e.keterangan) + "</b><span>" + fmtTglS(e.tanggal) + " \u00b7 " + esc(e.kategori || "Lainnya") +
      (e.oleh ? " \u00b7 " + esc(e.oleh) : "") +
      (e.bukti ? ' \u00b7 <button class="proof-link" data-act="proof-e" data-id="' + e.id + '">lihat nota</button>' : "") + "</span></div>" +
    '<div class="amt out">-' + rp(e.nominal) + "</div></li>";
}

/* ---------- Anggota ---------- */
function renderAnggota() {
  var q = state.qAnggota.toLowerCase();
  var list = db.members.filter(function (m) { return m.nama.toLowerCase().indexOf(q) > -1; })
    .sort(function (a, b) { return a.nama.localeCompare(b.nama, "id"); });
  var th = new Date().getFullYear();

  var h = '<div class="card"><div class="card-hd"><h2>Anggota kelompok</h2><div class="spacer"></div>' +
    (isAdmin() ? '<button class="btn btn-sm btn-primary no-print" data-act="add-member">' + ICO.plus + " Tambah</button>" : "") + "</div>" +
    '<div class="card-bd no-print" style="padding-bottom:10px"><div class="searchbar">' + ICO.search +
      '<input type="text" id="qAnggota" placeholder="Cari nama anggota" value="' + esc(state.qAnggota) + '"></div></div>';

  if (!list.length) {
    h += db.members.length ? emptyState("Tidak ada nama yang cocok.")
      : emptyState(isAdmin() ? "Belum ada anggota. Mulai dengan menambahkan nama jamaah." : "Daftar anggota masih kosong.",
          isAdmin() ? '<button class="btn btn-primary btn-sm" data-act="add-member">Tambah anggota</button>' : "");
  } else {
    h += '<ul class="ledger">' + list.map(function (m) {
      var hs = hadirStats(m.id), tg = tunggakan(m.id, th);
      return '<li><div class="avatar">' + esc(initial(m.nama)) + "</div>" +
        '<div class="main"><b>' + esc(m.nama) + "</b><span>Hadir " + hs.hadir + "/" + hs.total +
          " \u00b7 Setoran " + th + " " + rp(setoranTahun(m.id, th)) + (m.hp ? " \u00b7 " + esc(m.hp) : "") + "</span>" +
          '<div style="margin-top:5px">' + (tg.bulan
            ? '<span class="chip wait">Belum bayar ' + tg.bulan + " bln \u00b7 " + rp(tg.nominal) + "</span>"
            : '<span class="chip ok">Iuran ' + th + " lunas</span>") + "</div></div>" +
        (isAdmin() ? '<div class="btn-row no-print" style="flex-direction:column;gap:5px">' +
          '<button class="btn btn-sm" data-act="pay-member" data-id="' + m.id + '">Setor</button>' +
          '<button class="btn btn-sm" data-act="edit-member" data-id="' + m.id + '">Ubah</button></div>' : "") + "</li>";
    }).join("") + "</ul>";
  }
  $("#s-anggota").innerHTML = h + "</div>";
}

/* ---------- Pertemuan ---------- */
function renderAbsensi() {
  var mt = activeMeeting();
  var h = '<div class="card"><div class="card-hd"><h2>Absensi</h2><div class="spacer"></div>' +
    '<button class="btn btn-sm btn-primary no-print" data-act="add-meeting">' + ICO.plus + " Pertemuan</button></div>";

  if (!mt) {
    $("#s-absensi").innerHTML = h + emptyState("Belum ada pertemuan. Buat agenda kajian pekan ini.",
      '<button class="btn btn-primary btn-sm" data-act="add-meeting">Buat pertemuan</button>') + "</div>";
    return;
  }

  h += '<div class="card-bd no-print" style="padding-bottom:10px"><select id="selMeeting">' +
    meetingsDesc().map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === mt.id ? " selected" : "") + ">" +
        esc(fmtTglS(m.tanggal) + " \u2014 " + (m.judul || "Kajian rutin")) + "</option>";
    }).join("") + "</select></div>";

  var c = attCount(mt);
  h += '<div class="card-bd" style="padding-top:4px"><b style="font-size:15.5px">' + esc(mt.judul || "Kajian rutin") + "</b>" +
    '<div class="sub">' + fmtTgl(mt.tanggal) + (mt.tempat ? " \u00b7 " + esc(mt.tempat) : "") + "</div>" +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">' +
      '<span class="chip ok">Hadir ' + c.H + '</span><span class="chip wait">Izin ' + c.I + "</span>" +
      '<span class="chip info">Sakit ' + c.S + '</span><span class="chip bad">Alpa ' + c.A + "</span></div>" +
    '<div class="btn-row no-print" style="margin-top:11px">' +
      '<button class="btn btn-sm" data-act="meeting-detail" data-id="' + mt.id + '">Informasi</button>' +
      '<button class="btn btn-sm" data-act="all-present" data-id="' + mt.id + '">' + ICO.cek + " Semua hadir</button>" +
      '<button class="btn btn-sm" data-act="edit-meeting" data-id="' + mt.id + '">Ubah</button>' +
      (isAdmin() ? '<button class="btn btn-sm btn-danger" data-act="del-meeting" data-id="' + mt.id + '">Hapus</button>' : "") +
    "</div></div>";

  if (!db.members.length) {
    h += emptyState("Tambahkan anggota dulu supaya bisa diabsen.",
      '<button class="btn btn-primary btn-sm" data-act="go" data-tab="anggota">Ke daftar anggota</button>');
  } else {
    h += '<div style="border-top:1px solid var(--line-2)">' +
      db.members.slice().sort(function (a, b) { return a.nama.localeCompare(b.nama, "id"); }).map(function (m) {
        var cur = mt.att[m.id] || "";
        return '<div class="att-row"><div class="avatar">' + esc(initial(m.nama)) + "</div>" +
          '<div class="nm">' + esc(m.nama) + '</div><div class="att-btns">' +
          ["H", "I", "S", "A"].map(function (s) {
            return '<button data-act="att" data-id="' + m.id + '" data-s="' + s + '" data-on="' + (cur === s ? 1 : 0) +
              '" title="' + ({ H: "Hadir", I: "Izin", S: "Sakit", A: "Alpa" })[s] + '">' + s + "</button>";
          }).join("") + "</div></div>";
      }).join("") + "</div>";
  }
  h += "</div>";

  var t = localISO();
  var akan = db.meetings.filter(function (m) { return m.tanggal > t; }).sort(function (a, b) { return a.tanggal > b.tanggal ? 1 : -1; });
  var lalu = meetingsDesc().filter(function (m) { return m.tanggal <= t; });
  function row(m, tandai) {
    var p = m.tanggal.split("-"), hh = 0;
    Object.keys(m.att).forEach(function (k) { if (m.att[k] === "H") hh++; });
    return '<li class="tap" data-act="meeting-detail" data-id="' + m.id + '">' +
      '<div class="avatar" style="font-family:inherit;font-size:11px;line-height:1.2;text-align:center">' + p[2] + "<br>" + BULAN_S[+p[1] - 1] + "</div>" +
      '<div class="main"><b>' + esc(m.judul || "Kajian rutin") + "</b><span>" +
        esc(toDate(m.tanggal).toLocaleDateString("id-ID", { weekday: "long" })) +
        (m.tempat ? " \u00b7 " + esc(m.tempat) : "") + (m.intisari ? " \u00b7 ada intisari materi" : "") + "</span></div>" +
      (tandai ? '<span class="chip wait">' + esc(hitungMundur(m.tanggal)) + "</span>" : '<span class="chip ok">' + hh + " hadir</span>") +
      '<span class="chev">' + ICO.chev + "</span></li>";
  }
  if (akan.length) {
    h += '<div class="card"><div class="card-hd"><h2>Agenda mendatang</h2></div><ul class="ledger">' +
      akan.map(function (m) { return row(m, true); }).join("") + "</ul></div>";
  }
  h += '<div class="card"><div class="card-hd"><h2>Pertemuan yang sudah berjalan</h2><div class="spacer"></div>' +
    '<span class="sub">' + lalu.length + "</span></div>" +
    (lalu.length ? '<ul class="ledger">' + lalu.slice(0, 20).map(function (m) { return row(m, false); }).join("") + "</ul>"
                 : emptyState("Belum ada pertemuan yang berlalu.")) + "</div>";

  $("#s-absensi").innerHTML = h;
}

/* ---------- Setoran kas ---------- */
function renderKas() {
  var q = state.qKas.toLowerCase();
  var list = db.income.filter(function (i) {
    if (state.fKasStatus === "wait" && i.status === "verified") return false;
    if (state.fKasStatus === "ok" && i.status !== "verified") return false;
    if (state.fKasBulan && i.tanggal.slice(0, 7) !== state.fKasBulan) return false;
    if (q && namaOf(i).toLowerCase().indexOf(q) === -1) return false;
    return true;
  }).sort(function (a, b) { return a.tanggal < b.tanggal ? 1 : -1; });
  var jml = list.reduce(function (a, i) { return a + i.nominal; }, 0);

  var h = '<div class="card"><div class="card-hd"><h2>Setoran masuk</h2><div class="spacer"></div>' +
    '<button class="btn btn-sm btn-primary no-print" data-act="add-income">' + ICO.plus + (isAdmin() ? " Catat" : " Lapor") + "</button></div>" +
    '<div class="card-bd no-print" style="padding-bottom:10px">' +
      '<div class="searchbar" style="margin-bottom:9px">' + ICO.search +
        '<input type="text" id="qKas" placeholder="Cari nama penyetor" value="' + esc(state.qKas) + '"></div>' +
      '<div class="filters"><select id="fKasStatus">' +
        '<option value="all"' + (state.fKasStatus === "all" ? " selected" : "") + ">Semua status</option>" +
        '<option value="wait"' + (state.fKasStatus === "wait" ? " selected" : "") + ">Menunggu verifikasi</option>" +
        '<option value="ok"' + (state.fKasStatus === "ok" ? " selected" : "") + ">Terverifikasi</option></select>" +
        '<input type="month" id="fKasBulan" value="' + esc(state.fKasBulan) + '">' +
        (state.fKasBulan ? '<button class="btn btn-sm" data-act="clear-kas-bulan">Semua bulan</button>' : "") + "</div></div>" +
    '<div class="card-bd" style="border-top:1px solid var(--line-2);border-bottom:1px solid var(--line-2);display:flex;align-items:center">' +
      '<span class="sub">' + list.length + ' catatan</span><span style="margin-left:auto"></span><b class="amt in">' + rp(jml) + "</b></div>";

  h += list.length ? '<ul class="ledger">' + list.map(incomeRowFull).join("") + "</ul>"
    : emptyState("Belum ada setoran pada tampilan ini.",
        '<button class="btn btn-primary btn-sm" data-act="add-income">' + (isAdmin() ? "Catat setoran" : "Lapor setoran") + "</button>");
  h += "</div>";

  if (db.meta.rekening) {
    h += '<div class="note" style="margin-top:14px"><b>Rekening kas:</b> ' + esc(db.meta.rekening) +
      (db.meta.bendahara ? " \u00b7 Bendahara: " + esc(db.meta.bendahara) : "") + "</div>";
  }
  if (!isAdmin()) {
    h += '<div class="note" style="margin-top:10px">Sebagai anggota Anda bisa melaporkan setoran beserta foto buktinya. ' +
      "Yang mengesahkan dan mengubah catatan kas hanya admin.</div>";
  }
  $("#s-kas").innerHTML = h;
}
function incomeRowFull(i) {
  var nm = namaOf(i);
  var ket = i.tipe === "iuran" ? "Iuran " + fmtPeriode(i.periode) : (i.tipe === "donasi" ? "Donasi" : "Pemasukan lain");
  return '<li><div class="avatar">' + esc(initial(nm)) + "</div>" +
    '<div class="main"><b>' + esc(nm) + "</b><span>" + esc(ket) + " \u00b7 " + fmtTglS(i.tanggal) + "</span>" +
      '<div style="margin-top:5px;display:flex;gap:5px;flex-wrap:wrap;align-items:center">' +
        '<span class="chip ' + (i.metode === "transfer" ? "info" : "") + '">' + (i.metode === "transfer" ? "Transfer" : "Tunai") + "</span>" +
        (i.status === "verified" ? '<span class="chip ok">Terverifikasi</span>' : '<span class="chip wait">Menunggu admin</span>') +
        (i.bukti ? '<button class="proof-link" data-act="proof" data-id="' + i.id + '">Lihat bukti</button>' : "") + "</div>" +
      (i.catatan ? '<div class="sub" style="margin-top:4px">' + esc(i.catatan) + "</div>" : "") + "</div>" +
    '<div style="text-align:right;display:flex;flex-direction:column;gap:5px;align-items:flex-end">' +
      '<div class="amt in">+' + rp(i.nominal) + "</div>" +
      (isAdmin() ? '<div class="btn-row no-print" style="justify-content:flex-end">' +
        (i.status === "verified" ? "" : '<button class="btn btn-sm" data-act="verify" data-id="' + i.id + '">Verifikasi</button>') +
        '<button class="btn btn-sm" data-act="edit-income" data-id="' + i.id + '">Ubah</button>' +
        '<button class="btn btn-sm btn-danger" data-act="del-income" data-id="' + i.id + '">Hapus</button></div>' : "") +
    "</div></li>";
}

/* ---------- Pengeluaran ---------- */
function renderKeluar() {
  var list = db.expenses.filter(function (e) { return !state.fKeluarBulan || e.tanggal.slice(0, 7) === state.fKeluarBulan; })
    .sort(function (a, b) { return a.tanggal < b.tanggal ? 1 : -1; });
  var jml = list.reduce(function (a, e) { return a + e.nominal; }, 0);
  var perKat = {};
  list.forEach(function (e) { perKat[e.kategori || "Lainnya"] = (perKat[e.kategori || "Lainnya"] || 0) + e.nominal; });
  var kats = Object.keys(perKat).sort(function (a, b) { return perKat[b] - perKat[a]; });

  var h = '<div class="card"><div class="card-hd"><h2>Pengeluaran kas</h2><div class="spacer"></div>' +
    (isAdmin() ? '<button class="btn btn-sm btn-primary no-print" data-act="add-expense">' + ICO.plus + " Catat</button>" : "") + "</div>" +
    '<div class="card-bd no-print" style="padding-bottom:10px"><div class="filters">' +
      '<input type="month" id="fKeluarBulan" value="' + esc(state.fKeluarBulan) + '">' +
      (state.fKeluarBulan ? '<button class="btn btn-sm" data-act="clear-keluar-bulan">Semua bulan</button>' : "") + "</div></div>" +
    '<div class="card-bd" style="border-top:1px solid var(--line-2);border-bottom:1px solid var(--line-2);display:flex;align-items:center">' +
      '<span class="sub">' + list.length + ' catatan</span><span style="margin-left:auto"></span><b class="amt out">' + rp(jml) + "</b></div>";

  h += list.length ? '<ul class="ledger">' + list.map(function (e) {
    return '<li><div class="avatar" style="font-family:inherit;font-size:11.5px;color:var(--brick)">' + esc((e.kategori || "Lain").slice(0, 4)) + "</div>" +
      '<div class="main"><b>' + esc(e.keterangan) + "</b><span>" + fmtTglS(e.tanggal) + (e.oleh ? " \u00b7 oleh " + esc(e.oleh) : "") + "</span>" +
      (e.bukti ? '<div style="margin-top:4px"><button class="proof-link" data-act="proof-e" data-id="' + e.id + '">Lihat nota</button></div>' : "") + "</div>" +
      '<div style="text-align:right;display:flex;flex-direction:column;gap:5px;align-items:flex-end">' +
        '<div class="amt out">-' + rp(e.nominal) + "</div>" +
        (isAdmin() ? '<div class="btn-row no-print"><button class="btn btn-sm" data-act="edit-expense" data-id="' + e.id + '">Ubah</button>' +
          '<button class="btn btn-sm btn-danger" data-act="del-expense" data-id="' + e.id + '">Hapus</button></div>' : "") +
      "</div></li>";
  }).join("") + "</ul>" : emptyState("Belum ada pengeluaran tercatat.",
    isAdmin() ? '<button class="btn btn-primary btn-sm" data-act="add-expense">Catat pengeluaran</button>' : "");
  h += "</div>";

  if (kats.length) {
    h += '<div class="card"><div class="card-hd"><h2>Rincian per kategori</h2></div><ul class="ledger">' +
      kats.map(function (k) {
        return '<li><div class="main"><b>' + esc(k) + '</b><div class="bar" style="margin-top:6px"><i style="width:' +
          (perKat[k] / (jml || 1) * 100) + '%;background:var(--brick)"></i></div></div>' +
          '<div class="amt out">' + rp(perKat[k]) + "</div></li>";
      }).join("") + "</ul></div>";
  }
  $("#s-keluar").innerHTML = h;
}

/* ---------- Rekap ---------- */
function renderRekap() {
  var th = state.tahun, years = {};
  db.income.forEach(function (i) { years[i.tanggal.slice(0, 4)] = 1; });
  db.expenses.forEach(function (e) { years[e.tanggal.slice(0, 4)] = 1; });
  years[new Date().getFullYear()] = 1; years[th] = 1;
  var ylist = Object.keys(years).sort().reverse();

  var h = '<div class="card"><div class="card-hd"><h2>Rekap tahun</h2><div class="spacer"></div>' +
    '<select id="selTahun" style="width:auto" class="no-print">' + ylist.map(function (y) {
      return '<option value="' + y + '"' + (+y === th ? " selected" : "") + ">" + y + "</option>";
    }).join("") + "</select></div>";

  var rows = "", kum = 0;
  for (var b = 1; b <= 12; b++) {
    var p = th + "-" + pad(b);
    var mIn = verifiedIncome().filter(function (i) { return i.tanggal.slice(0, 7) === p; }).reduce(function (a, i) { return a + i.nominal; }, 0);
    var mOut = db.expenses.filter(function (e) { return e.tanggal.slice(0, 7) === p; }).reduce(function (a, e) { return a + e.nominal; }, 0);
    if (!mIn && !mOut) continue;
    kum += mIn - mOut;
    rows += "<tr><td>" + BULAN[b - 1] + '</td><td class="num" style="color:var(--leaf)">' + rp(mIn) +
      '</td><td class="num" style="color:var(--brick)">' + rp(mOut) + '</td><td class="num"><b>' + rp(kum) + "</b></td></tr>";
  }
  h += '<div class="scroll-x">' + (rows
    ? '<table class="grid"><thead><tr><th>Bulan</th><th class="num">Masuk</th><th class="num">Keluar</th><th class="num">Saldo kumulatif</th></tr></thead><tbody>' + rows + "</tbody></table>"
    : emptyState("Belum ada transaksi di tahun " + th + ".")) + "</div></div>";

  h += '<div class="card"><div class="card-hd"><h2>Kartu iuran ' + th + '</h2><div class="spacer"></div>' +
    '<span class="sub">' + rp(db.meta.iuran) + "/bulan</span></div>";
  if (db.members.length) {
    h += '<div class="scroll-x"><table class="grid"><thead><tr><th>Nama</th>' +
      BULAN_S.map(function (x) { return '<th style="text-align:center">' + x + "</th>"; }).join("") +
      '<th class="num">Total</th><th class="num">Tunggakan</th></tr></thead><tbody>' +
      db.members.slice().sort(function (a, b) { return a.nama.localeCompare(b.nama, "id"); }).map(function (m) {
        var cells = "";
        for (var b2 = 1; b2 <= 12; b2++) {
          var per = th + "-" + pad(b2);
          var lunas = lunasBulan(m.id, per);
          var lewat = new Date(th, b2 - 1, 1) <= new Date();
          cells += '<td style="text-align:center"><span class="cell ' + (lunas ? "paid" : (lewat ? "due" : "none")) + '">' +
            (lunas ? "&#10003;" : (lewat ? "&mdash;" : "\u00b7")) + "</span></td>";
        }
        var tg = tunggakan(m.id, th);
        return "<tr><td><b>" + esc(m.nama) + "</b></td>" + cells + '<td class="num">' + rp(setoranTahun(m.id, th)) +
          '</td><td class="num" style="color:' + (tg.nominal ? "var(--brick)" : "var(--muted)") + '">' +
          (tg.nominal ? rp(tg.nominal) : "-") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  } else h += emptyState("Belum ada anggota.");
  h += "</div>";

  h += '<div class="card"><div class="card-hd"><h2>Kehadiran</h2><div class="spacer"></div>' +
    '<span class="sub">' + db.meetings.length + " pertemuan</span></div>";
  if (db.members.length && db.meetings.length) {
    h += '<ul class="ledger">' + db.members.slice().sort(function (a, b) { return hadirStats(b.id).pct - hadirStats(a.id).pct; })
      .map(function (m) {
        var s = hadirStats(m.id);
        return '<li><div class="avatar">' + esc(initial(m.nama)) + "</div>" +
          '<div class="main"><b>' + esc(m.nama) + '</b><div class="bar" style="margin-top:6px"><i style="width:' + s.pct + '%"></i></div></div>' +
          '<div style="text-align:right"><b>' + s.pct + '%</b><div class="sub">' + s.hadir + "/" + s.total + "</div></div></li>";
      }).join("") + "</ul>";
  } else h += emptyState("Data kehadiran muncul setelah ada pertemuan.");
  h += "</div>";

  h += '<div class="card no-print"><div class="card-hd"><h2>Simpan & bagikan</h2></div><div class="card-bd">' +
    '<div class="btn-row"><button class="btn" data-act="csv-kas">Unduh CSV kas</button>' +
    '<button class="btn" data-act="csv-absen">Unduh CSV absensi</button>' +
    '<button class="btn" data-act="print">Cetak / simpan PDF</button>' +
    (isAdmin() ? '<button class="btn" data-act="backup">Unduh salinan (.json)</button>' : "") + "</div>" +
    '<p class="hint" style="margin-top:10px">Data utama tersimpan online di Supabase dan sama untuk semua pengurus. ' +
    "Supabase juga menyimpan cadangan otomatis; unduhan di atas berguna sebagai arsip pribadi.</p></div></div>";

  $("#s-rekap").innerHTML = h;
}

/* ============================================================
   BORANG
   ============================================================ */
function tolak() { toast("Hanya admin yang bisa mengubah bagian ini."); }

function formMember(m) {
  if (!isAdmin()) return tolak();
  modal({
    title: m ? "Ubah anggota" : "Tambah anggota",
    submitText: m ? "Simpan perubahan" : "Tambah anggota",
    body: '<div class="field"><label for="nama">Nama lengkap</label><input type="text" id="nama" name="nama" required value="' +
        esc(m ? m.nama : "") + '" placeholder="Contoh: Ahmad Fauzi"></div>' +
      '<div class="grid2"><div class="field"><label for="hp">Nomor WhatsApp</label><input type="tel" id="hp" name="hp" value="' +
        esc(m ? m.hp : "") + '" placeholder="08xxxxxxxxxx"></div>' +
      '<div class="field"><label for="mulai">Mulai ikut</label><input type="month" id="mulai" name="mulai" value="' +
        esc(m ? m.mulai : localMonth()) + '"></div></div>' +
      (m ? '<div class="rule"></div><button type="button" class="btn btn-danger btn-block" data-act="del-member" data-id="' + m.id + '">Hapus anggota ini</button>' : ""),
    onSubmit: function (d) {
      if (!d.nama.trim()) { toast("Nama belum diisi."); return false; }
      var row = { nama: d.nama.trim(), hp: d.hp.trim(), mulai: d.mulai || localMonth() };
      run(function () { return m ? sb.from("members").update(row).eq("id", m.id) : sb.from("members").insert(row); },
        m ? "Data anggota diperbarui." : "Anggota ditambahkan.");
    }
  });
}

function formMeeting(mt) {
  modal({
    title: mt ? "Ubah pertemuan" : "Jadwalkan pertemuan",
    submitText: mt ? "Simpan perubahan" : "Simpan pertemuan",
    body:
      '<div class="grid2"><div class="field"><label for="tanggal">Tanggal</label><input type="date" id="tanggal" name="tanggal" required value="' +
        esc(mt ? mt.tanggal : localISO()) + '"></div>' +
      '<div class="field"><label for="tempat">Tempat</label><input type="text" id="tempat" name="tempat" value="' +
        esc(mt ? mt.tempat : "") + '" placeholder="Contoh: Rumah Pak Rahmat"></div></div>' +
      '<div class="field"><label for="judul">Materi / tema</label><input type="text" id="judul" name="judul" value="' +
        esc(mt ? mt.judul : "") + '" placeholder="Contoh: Tadabbur Surat Al-Mulk"></div>' +
      '<div class="field"><label for="informasi">Informasi kegiatan</label>' +
        '<textarea id="informasi" name="informasi" class="tall" placeholder="Jam berapa, apa yang perlu dibawa, siapa yang bertugas.&#10;Tekan Enter untuk baris baru.&#10;Tautan Google Drive atau Maps otomatis bisa diklik.">' +
        esc(mt ? mt.informasi : "") + "</textarea>" +
        '<p class="hint">Untuk berkas besar, unggah ke Google Drive lalu tempelkan tautannya di sini.</p></div>' +
      '<div class="field"><label for="intisari">Intisari materi</label>' +
        '<textarea id="intisari" name="intisari" class="tall" placeholder="Poin-poin yang sudah dipelajari, atau tautan catatan dan rekaman.">' +
        esc(mt ? mt.intisari : "") + "</textarea></div>" +
      imageField("fFoto", "Foto materi atau poster (opsional)", "Diunggah ke penyimpanan Supabase dan bisa dilihat semua anggota.", mt ? mt.foto : null, "foto"),
    after: function (form) { bindImage(form, "fFoto", "foto"); },
    onSubmit: function (d) {
      if (!d.tanggal) { toast("Tanggal belum diisi."); return false; }
      run(function () {
        return uploadImage(pendingFoto).then(function (url) {
          var row = { tanggal: d.tanggal, judul: d.judul.trim(), tempat: d.tempat.trim(),
                      informasi: d.informasi, intisari: d.intisari, foto: url };
          return mt ? sb.from("meetings").update(row).eq("id", mt.id) : sb.from("meetings").insert(row);
        });
      }, mt ? "Pertemuan diperbarui." : "Pertemuan dijadwalkan.");
    }
  });
}

function meetingDetail(id) {
  var m = meetingById(id);
  if (!m) return;
  var c = attCount(m);
  var hadirNama = db.members.filter(function (x) { return m.att[x.id] === "H"; }).map(function (x) { return x.nama; });
  modal({
    title: m.judul || "Kajian rutin",
    body:
      '<div class="detail-row"><div class="k">Tanggal</div><div class="v">' + fmtTgl(m.tanggal) +
        ' <span class="chip" style="margin-left:4px">' + esc(hitungMundur(m.tanggal)) + "</span></div></div>" +
      '<div class="detail-row"><div class="k">Tempat</div><div class="v">' + (m.tempat ? esc(m.tempat) : '<span class="sub">belum diisi</span>') + "</div></div>" +
      '<div class="detail-row"><div class="k">Materi</div><div class="v">' + esc(m.judul || "Kajian rutin") + "</div></div>" +
      '<div class="detail-row"><div class="k">Informasi</div><div class="v prose">' +
        (m.informasi ? richText(m.informasi) : '<span class="sub">belum ada informasi</span>') + "</div></div>" +
      '<div class="detail-row"><div class="k">Intisari materi</div><div class="v prose">' +
        (m.intisari ? richText(m.intisari) : '<span class="sub">belum ada intisari</span>') + "</div></div>" +
      (m.foto ? '<div class="detail-row"><div class="k">Lampiran</div><div class="v"><img class="thumb" src="' + m.foto + '" alt="Lampiran materi" style="margin-top:0"></div></div>' : "") +
      '<div class="detail-row"><div class="k">Kehadiran</div><div class="v">' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap"><span class="chip ok">Hadir ' + c.H + '</span>' +
        '<span class="chip wait">Izin ' + c.I + '</span><span class="chip info">Sakit ' + c.S + '</span>' +
        '<span class="chip bad">Alpa ' + c.A + "</span></div>" +
        (hadirNama.length ? '<div class="sub" style="margin-top:7px">' + esc(hadirNama.join(", ")) + "</div>" : "") + "</div></div>" +
      '<div class="btn-row" style="margin-top:15px">' +
        '<button type="button" class="btn" data-act="open-absen" data-id="' + m.id + '">Buka absensi</button>' +
        '<button type="button" class="btn" data-act="edit-meeting" data-id="' + m.id + '">Ubah</button>' +
        (isAdmin() ? '<button type="button" class="btn btn-danger" data-act="del-meeting" data-id="' + m.id + '">Hapus</button>' : "") +
      "</div>"
  });
}

function formIncome(inc, presetMember) {
  if (inc && !isAdmin()) return tolak();
  var opts = db.members.slice().sort(function (a, b) { return a.nama.localeCompare(b.nama, "id"); })
    .map(function (m) {
      var sel = inc ? inc.member_id === m.id : presetMember === m.id;
      return '<option value="' + m.id + '"' + (sel ? " selected" : "") + ">" + esc(m.nama) + "</option>";
    }).join("");
  var tipe = inc ? inc.tipe : "iuran", metode = inc ? inc.metode : "transfer";
  modal({
    title: inc ? "Ubah setoran" : (isAdmin() ? "Catat setoran kas" : "Lapor setoran"),
    submitText: inc ? "Simpan perubahan" : (isAdmin() ? "Simpan setoran" : "Kirim laporan"),
    body:
      (isAdmin() || !db.meta.rekening ? "" : '<div class="note" style="margin-bottom:13px"><b>Transfer ke:</b> ' + esc(db.meta.rekening) + "</div>") +
      '<div class="field"><label>Jenis pemasukan</label><div class="seg">' +
        ["iuran", "donasi", "lain"].map(function (t, k) {
          var lbl = { iuran: "Iuran bulanan", donasi: "Donasi", lain: "Pemasukan lain" }[t];
          return '<input type="radio" name="tipe" id="tp' + k + '" value="' + t + '"' + (tipe === t ? " checked" : "") + '><label for="tp' + k + '">' + lbl + "</label>";
        }).join("") + "</div></div>" +
      '<div class="field"><label for="memberId">Nama penyetor</label><select id="memberId" name="memberId">' + opts +
        '<option value=""' + (inc && !inc.member_id ? " selected" : "") + ">Bukan anggota / umum</option></select></div>" +
      '<div class="field" id="wrapNama" style="display:none"><label for="namaLain">Tulis nama</label>' +
        '<input type="text" id="namaLain" name="nama" value="' + esc(inc ? inc.nama : "") + '" placeholder="Nama penyetor"></div>' +
      '<div class="grid2"><div class="field" id="wrapPeriode"><label for="periode">Untuk bulan</label>' +
        '<input type="month" id="periode" name="periode" value="' + esc(inc ? inc.periode : localMonth()) + '"></div>' +
      '<div class="field"><label for="tanggal">Tanggal setor</label><input type="date" id="tanggal" name="tanggal" required value="' +
        esc(inc ? inc.tanggal : localISO()) + '"></div></div>' +
      '<div class="field"><label for="nominal">Nominal (Rp)</label><input type="text" inputmode="numeric" id="nominal" name="nominal" required value="' +
        (inc ? inc.nominal : (db.meta.iuran || "")) + '" placeholder="20000"></div>' +
      '<div class="field"><label>Cara setor</label><div class="seg">' +
        ["transfer", "tunai"].map(function (t, k) {
          return '<input type="radio" name="metode" id="mt' + k + '" value="' + t + '"' + (metode === t ? " checked" : "") + '><label for="mt' + k + '">' + (t === "transfer" ? "Transfer" : "Tunai") + "</label>";
        }).join("") + "</div></div>" +
      imageField("fBukti", "Foto bukti transfer (opsional)", "Diunggah ke penyimpanan Supabase agar bisa dicek admin dari HP mana pun.", inc ? inc.bukti : null, "bukti") +
      '<div class="field"><label for="catatan">Catatan</label><input type="text" id="catatan" name="catatan" value="' +
        esc(inc ? inc.catatan : "") + '" placeholder="Opsional"></div>' +
      (isAdmin()
        ? '<div class="field"><label style="display:flex;gap:8px;align-items:center;font-weight:600">' +
          '<input type="checkbox" name="verified" style="width:auto" ' + (!inc || inc.status === "verified" ? "checked" : "") + "> Sudah dicek dan sah</label>" +
          '<p class="hint">Setoran yang belum dicentang tidak dihitung ke saldo.</p></div>'
        : '<div class="note">Laporan ini masuk sebagai <b>menunggu verifikasi</b>. Admin yang akan mengesahkannya sehingga saldo kas bertambah.</div>'),
    after: function (form) {
      bindImage(form, "fBukti", "bukti");
      var sel = $("#memberId", form), wrapNama = $("#wrapNama", form), wrapPer = $("#wrapPeriode", form);
      function sync() {
        wrapNama.style.display = sel.value ? "none" : "block";
        wrapPer.style.display = form.querySelector("input[name=tipe]:checked").value === "iuran" ? "block" : "none";
      }
      sel.addEventListener("change", sync);
      $$("input[name=tipe]", form).forEach(function (r) { r.addEventListener("change", sync); });
      sync();
    },
    onSubmit: function (d) {
      var n = num(d.nominal);
      if (!n) { toast("Nominal belum diisi."); return false; }
      if (!d.memberId && !String(d.nama || "").trim()) { toast("Nama penyetor belum diisi."); return false; }
      var status = isAdmin() ? (d.verified ? "verified" : "pending") : "pending";
      run(function () {
        return uploadImage(pendingProof).then(function (url) {
          var row = {
            member_id: d.memberId || null,
            nama: d.memberId ? "" : String(d.nama || "").trim(),
            tipe: d.tipe, periode: d.tipe === "iuran" ? d.periode : "",
            tanggal: d.tanggal || localISO(), nominal: n, metode: d.metode,
            bukti: url, catatan: String(d.catatan || "").trim(), status: status
          };
          return inc ? sb.from("income").update(row).eq("id", inc.id) : sb.from("income").insert(row);
        });
      }, status === "verified" ? "Setoran tercatat dan masuk saldo." : "Laporan terkirim. Menunggu verifikasi admin.");
    }
  });
}

var KATEGORI = ["Konsumsi", "Infaq & santunan", "Perlengkapan", "Transport", "Kebersihan", "Hadiah / kenang-kenangan", "Lainnya"];
function formExpense(ex) {
  if (!isAdmin()) return tolak();
  modal({
    title: ex ? "Ubah pengeluaran" : "Catat pengeluaran",
    submitText: ex ? "Simpan perubahan" : "Simpan pengeluaran",
    body:
      '<div class="field"><label for="keterangan">Untuk apa</label><input type="text" id="keterangan" name="keterangan" required value="' +
        esc(ex ? ex.keterangan : "") + '" placeholder="Contoh: Snack kajian pekan ke-3"></div>' +
      '<div class="grid2"><div class="field"><label for="nominal">Nominal (Rp)</label>' +
        '<input type="text" inputmode="numeric" id="nominal" name="nominal" required value="' + (ex ? ex.nominal : "") + '" placeholder="150000"></div>' +
      '<div class="field"><label for="tanggal">Tanggal</label><input type="date" id="tanggal" name="tanggal" required value="' +
        esc(ex ? ex.tanggal : localISO()) + '"></div></div>' +
      '<div class="grid2"><div class="field"><label for="kategori">Kategori</label><select id="kategori" name="kategori">' +
        KATEGORI.map(function (k) { return "<option" + (ex && ex.kategori === k ? " selected" : "") + ">" + k + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="oleh">Dibelanjakan oleh</label><input type="text" id="oleh" name="oleh" value="' +
        esc(ex ? ex.oleh : "") + '" placeholder="Nama"></div></div>' +
      imageField("fBukti", "Foto nota / struk (opsional)", "Diunggah ke penyimpanan Supabase.", ex ? ex.bukti : null, "bukti"),
    after: function (form) { bindImage(form, "fBukti", "bukti"); },
    onSubmit: function (d) {
      var n = num(d.nominal);
      if (!String(d.keterangan).trim()) { toast("Keterangan belum diisi."); return false; }
      if (!n) { toast("Nominal belum diisi."); return false; }
      run(function () {
        return uploadImage(pendingProof).then(function (url) {
          var row = { keterangan: String(d.keterangan).trim(), nominal: n, tanggal: d.tanggal || localISO(),
                      kategori: d.kategori, oleh: String(d.oleh || "").trim(), bukti: url };
          return ex ? sb.from("expenses").update(row).eq("id", ex.id) : sb.from("expenses").insert(row);
        });
      }, "Pengeluaran tercatat.");
    }
  });
}

function formSettings() {
  if (!isAdmin()) return tolak();
  modal({
    title: "Pengaturan kelompok",
    submitText: "Simpan pengaturan",
    body:
      '<div class="field"><label for="nama">Nama kas</label><input type="text" id="nama" name="nama" value="' + esc(db.meta.nama) + '"></div>' +
      '<div class="field"><label for="ustadz">Pembina / ustadz</label><input type="text" id="ustadz" name="ustadz" value="' + esc(db.meta.ustadz) + '"></div>' +
      '<div class="grid2"><div class="field"><label for="iuran">Iuran per bulan (Rp)</label>' +
        '<input type="text" inputmode="numeric" id="iuran" name="iuran" value="' + db.meta.iuran + '"></div>' +
      '<div class="field"><label for="bendahara">Bendahara</label><input type="text" id="bendahara" name="bendahara" value="' + esc(db.meta.bendahara) + '"></div></div>' +
      '<div class="field"><label for="rekening">Rekening tujuan transfer</label><input type="text" id="rekening" name="rekening" value="' +
        esc(db.meta.rekening) + '" placeholder="BSI 7212xxxxxx a.n. ..."><p class="hint">Ditampilkan pada halaman setoran dan borang laporan anggota.</p></div>' +
      '<div class="rule"></div>' +
      '<div class="field"><label for="pass">Ganti kata sandi admin</label>' +
        '<input type="password" id="pass" name="pass" placeholder="Kosongkan bila tidak diubah" autocomplete="new-password">' +
        '<p class="hint">Diubah langsung di akun Supabase Anda. Minimal 6 karakter.</p></div>' +
      '<div class="btn-row"><button type="button" class="btn" data-act="backup">Unduh salinan data</button></div>' +
      '<button type="button" class="btn btn-danger btn-block" style="margin-top:8px" data-act="reset">Kosongkan seluruh data</button>',
    onSubmit: function (d) {
      if (d.pass && String(d.pass).length < 6) { toast("Kata sandi minimal 6 karakter."); return false; }
      var row = { nama: d.nama.trim() || "Kas UPA", ustadz: d.ustadz.trim(), iuran: num(d.iuran),
                  bendahara: d.bendahara.trim(), rekening: d.rekening.trim() };
      run(function () {
        return sb.from("settings").update(row).eq("id", 1).then(function (r) {
          ok(r);
          return d.pass ? sb.auth.updateUser({ password: String(d.pass) }) : r;
        });
      }, d.pass ? "Pengaturan dan kata sandi disimpan." : "Pengaturan disimpan.");
    }
  });
}

/* ============================================================
   EKSPOR
   ============================================================ */
function download(name, content, type) {
  var blob = new Blob([content], { type: type || "text/plain;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function csvCell(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }
function slug(s) { return String(s || "kas").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function exportKasCSV() {
  var rows = [["Tanggal", "Jenis", "Nama", "Periode", "Metode", "Status", "Masuk", "Keluar", "Kategori", "Catatan"]];
  db.income.slice().sort(function (a, b) { return a.tanggal < b.tanggal ? -1 : 1; }).forEach(function (i) {
    rows.push([i.tanggal, i.tipe, namaOf(i), i.periode || "", i.metode, i.status === "verified" ? "Terverifikasi" : "Menunggu", i.nominal, "", "", i.catatan || ""]);
  });
  db.expenses.slice().sort(function (a, b) { return a.tanggal < b.tanggal ? -1 : 1; }).forEach(function (e) {
    rows.push([e.tanggal, "pengeluaran", e.oleh || "", "", "", "", "", e.nominal, e.kategori || "", e.keterangan]);
  });
  rows.push([]); rows.push(["Saldo akhir", "", "", "", "", "", totalMasuk(), totalKeluar(), "", saldo()]);
  download("kas-" + slug(db.meta.nama) + "-" + localISO() + ".csv", "\uFEFF" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\n"), "text/csv;charset=utf-8");
  toast("CSV kas diunduh.");
}
function exportAbsenCSV() {
  var ms = meetingsDesc().slice().reverse();
  var rows = [["Nama"].concat(ms.map(function (m) { return m.tanggal; })).concat(["Hadir", "Total", "Persen"])];
  db.members.slice().sort(function (a, b) { return a.nama.localeCompare(b.nama, "id"); }).forEach(function (mb) {
    var s = hadirStats(mb.id);
    rows.push([mb.nama].concat(ms.map(function (m) { return m.att[mb.id] || ""; })).concat([s.hadir, s.total, s.pct + "%"]));
  });
  download("absensi-" + slug(db.meta.nama) + "-" + localISO() + ".csv", "\uFEFF" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\n"), "text/csv;charset=utf-8");
  toast("CSV absensi diunduh.");
}
function backup() {
  if (!isAdmin()) return tolak();
  download("salinan-" + slug(db.meta.nama) + "-" + localISO() + ".json", JSON.stringify(db, null, 2), "application/json");
  toast("Salinan diunduh.");
}

/* ============================================================
   INTERAKSI
   ============================================================ */
document.addEventListener("click", function (ev) {
  var el = ev.target.closest("[data-act]");

  if (el && el.dataset.act.indexOf("login-") === 0) {
    var a = el.dataset.act;
    if (a === "login-retry") { location.reload(); return; }
    if (a === "login-pick") {
      if (el.dataset.r === "anggota") return enter("anggota");
      loginMode = "admin"; return showLogin();
    }
    if (a === "login-back") { loginMode = "choose"; return showLogin(); }
    if (a === "login-admin") {
      var email = String($("#pEmail").value || "").trim(), pw = $("#p1").value;
      if (!email || !pw) { goyang(); toast("Surel dan kata sandi harus diisi."); return; }
      el.disabled = true; el.textContent = "Memeriksa\u2026";
      sb.auth.signInWithPassword({ email: email, password: pw }).then(function (r) {
        if (r.error) throw r.error;
        return fetchAll().then(function () { enter("admin"); });
      }).catch(function (e) {
        el.disabled = false; el.textContent = "Masuk";
        goyang(); toast(pesanGalat(e));
      });
      return;
    }
  }

  var tabBtn = ev.target.closest(".tab");
  if (tabBtn) { state.tab = tabBtn.dataset.tab; render(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (ev.target.closest("#btnSettings")) { formSettings(); return; }
  if (ev.target.closest("#btnLogout")) {
    confirmBox("Keluar dari aplikasi?", "Anda kembali ke layar pemilihan peran. Data tetap tersimpan di Supabase.", logout, "Keluar");
    return;
  }
  if (!el) return;

  var act = el.dataset.act, id = el.dataset.id;
  switch (act) {
    case "go": state.tab = el.dataset.tab; render(); window.scrollTo({ top: 0, behavior: "smooth" }); break;
    case "reload": busy(true); refresh().then(function () { busy(false); toast("Data dimuat ulang."); })
      .catch(function (e) { busy(false); syncState("err"); toast(pesanGalat(e)); }); break;
    case "add-member": formMember(null); break;
    case "edit-member": formMember(memberById(id)); break;
    case "del-member": {
      if (!isAdmin()) return tolak();
      var m = memberById(id); closeModal();
      confirmBox("Hapus anggota?", "Nama <b>" + esc(m.nama) + "</b> dihapus dari daftar. Riwayat setorannya tetap tersimpan tanpa nama.", function () {
        run(function () { return sb.from("members").delete().eq("id", id); }, "Anggota dihapus.");
      });
      break;
    }
    case "add-meeting": formMeeting(null); break;
    case "edit-meeting": closeModal(); formMeeting(meetingById(id)); break;
    case "meeting-detail": meetingDetail(id); break;
    case "open-absen": closeModal(); state.meetingId = id; state.tab = "absensi"; render(); window.scrollTo({ top: 0, behavior: "smooth" }); break;
    case "del-meeting":
      if (!isAdmin()) return tolak();
      closeModal();
      confirmBox("Hapus pertemuan?", "Informasi dan catatan absensi pertemuan ini ikut terhapus.", function () {
        state.meetingId = null;
        run(function () { return sb.from("meetings").delete().eq("id", id); }, "Pertemuan dihapus.");
      });
      break;
    case "att": {
      var mt2 = activeMeeting(); if (!mt2) return;
      var s = el.dataset.s, sama = mt2.att[id] === s;
      if (sama) delete mt2.att[id]; else mt2.att[id] = s;   /* tampilkan langsung */
      renderAbsensi();
      run(function () {
        return sama
          ? sb.from("attendance").delete().eq("meeting_id", mt2.id).eq("member_id", id)
          : sb.from("attendance").upsert({ meeting_id: mt2.id, member_id: id, status: s }, { onConflict: "meeting_id,member_id" });
      });
      break;
    }
    case "all-present": {
      var mt3 = activeMeeting(); if (!mt3) return;
      var rows = db.members.filter(function (mb) { return !mt3.att[mb.id]; })
        .map(function (mb) { return { meeting_id: mt3.id, member_id: mb.id, status: "H" }; });
      if (!rows.length) { toast("Semua sudah terisi."); return; }
      run(function () { return sb.from("attendance").upsert(rows, { onConflict: "meeting_id,member_id" }); }, "Yang belum diisi ditandai hadir.");
      break;
    }
    case "add-income": formIncome(null); break;
    case "pay-member": formIncome(null, id); break;
    case "edit-income": formIncome(incomeById(id)); break;
    case "del-income":
      if (!isAdmin()) return tolak();
      confirmBox("Hapus setoran?", "Catatan setoran ini dihapus permanen.", function () {
        run(function () { return sb.from("income").delete().eq("id", id); }, "Setoran dihapus.");
      });
      break;
    case "verify":
      if (!isAdmin()) return tolak();
      run(function () { return sb.from("income").update({ status: "verified" }).eq("id", id); }, "Setoran diverifikasi dan masuk saldo.");
      break;
    case "proof": { var i2 = incomeById(id); showImage(i2.bukti, "Bukti setor \u2014 " + namaOf(i2)); break; }
    case "proof-e": { var e2 = expenseById(id); showImage(e2.bukti, "Nota \u2014 " + e2.keterangan); break; }
    case "add-expense": formExpense(null); break;
    case "edit-expense": formExpense(expenseById(id)); break;
    case "del-expense":
      if (!isAdmin()) return tolak();
      confirmBox("Hapus pengeluaran?", "Catatan pengeluaran ini dihapus permanen.", function () {
        run(function () { return sb.from("expenses").delete().eq("id", id); }, "Pengeluaran dihapus.");
      });
      break;
    case "clear-kas-bulan": state.fKasBulan = ""; render(); break;
    case "clear-keluar-bulan": state.fKeluarBulan = ""; render(); break;
    case "csv-kas": exportKasCSV(); break;
    case "csv-absen": exportAbsenCSV(); break;
    case "print": window.print(); break;
    case "backup": backup(); break;
    case "reset":
      if (!isAdmin()) return tolak();
      closeModal();
      confirmBox("Kosongkan seluruh data?", "Semua anggota, pertemuan, setoran, dan pengeluaran dihapus dari basis data. Unduh salinan dulu bila perlu.", function () {
        run(function () {
          return sb.from("income").delete().not("id", "is", null)
            .then(function (r) { ok(r); return sb.from("expenses").delete().not("id", "is", null); })
            .then(function (r) { ok(r); return sb.from("meetings").delete().not("id", "is", null); })
            .then(function (r) { ok(r); return sb.from("members").delete().not("id", "is", null); });
        }, "Data dikosongkan.");
      }, "Hapus semua");
      break;
  }
});

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") closeModal();
  if (e.key === "Enter" && $(".login.on") && !e.shiftKey) {
    var b = $(".login-form .btn");
    if (b) { e.preventDefault(); b.click(); }
  }
});
document.addEventListener("input", function (ev) {
  var t = ev.target;
  if (t.id === "qAnggota") { state.qAnggota = t.value; renderAnggota(); refocus("qAnggota"); }
  if (t.id === "qKas") { state.qKas = t.value; renderKas(); refocus("qKas"); }
});
document.addEventListener("change", function (ev) {
  var t = ev.target;
  if (t.id === "selMeeting") { state.meetingId = t.value; render(); }
  if (t.id === "fKasStatus") { state.fKasStatus = t.value; render(); }
  if (t.id === "fKasBulan") { state.fKasBulan = t.value; render(); }
  if (t.id === "fKeluarBulan") { state.fKeluarBulan = t.value; render(); }
  if (t.id === "selTahun") { state.tahun = +t.value; render(); }
});
function refocus(id) {
  var el = document.getElementById(id);
  if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} }
}

/* segarkan saat aplikasi dibuka lagi, maksimal tiap 20 detik */
document.addEventListener("visibilitychange", function () {
  if (!document.hidden && role && Date.now() - lastFetch > 20000 && !$("#mForm")) {
    refresh().catch(function () {});
  }
});

/* ---------- awal ---------- */
function mulai() {
  if (typeof window.supabase === "undefined" || !window.supabase.createClient) {
    showSetup("Pustaka Supabase gagal dimuat. Periksa koneksi internet lalu coba lagi.");
    return;
  }
  if (!cfgOK()) { showSetup(); return; }
  sb = window.supabase.createClient(CFG.url.trim(), CFG.anonKey.trim());
  showLoading();
  fetchAll().then(function () {
    return sb.auth.getSession();
  }).then(function (r) {
    var punyaSesi = r && r.data && r.data.session;
    var saved = null;
    try { saved = sessionStorage.getItem("kasupa_role"); } catch (e) {}
    if (punyaSesi) enter("admin");
    else if (saved === "anggota") enter("anggota");
    else showLogin();
    /* pantau perubahan dari perangkat lain */
    try {
      sb.channel("kasupa").on("postgres_changes", { event: "*", schema: "public" }, function () {
        if (!$("#mForm") && Date.now() - lastFetch > 1500) refresh().catch(function () {});
      }).subscribe();
    } catch (e) {}
  }).catch(function (e) {
    showSetup("Gagal mengambil data: " + pesanGalat(e) + " Pastikan supabase-setup.sql sudah dijalankan dan config.js benar.");
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mulai);
else mulai();

if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
}

})();
