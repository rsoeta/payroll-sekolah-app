# Daftar Isi — Buku Panduan Pengguna SIPAYROLL

**SIPAYROLL (Sistem Penggajian Sekolah & Yayasan)** adalah aplikasi web yang terintegrasi dengan layanan **Google Apps Script (GAS)** dan **Google Sheets** untuk mengelola data pendidik, pencatatan kehadiran dan Jam Tatap Muka (JTM), perhitungan gaji bulanan, persetujuan Kepala Sekolah, hingga penerbitan Slip Gaji Digital resmi berformat PDF.

Panduan ini disusun khusus untuk **pengguna akhir (*end-user*)** dan dikelompokkan berdasarkan alur kerja serta peran pengguna di lingkungan sekolah/yayasan.

---

## Ringkasan Peran Pengguna & Integrasi Google Sheets

| Peran Pengguna | Cara Terdaftar | Fokus Utama di Aplikasi |
| :--- | :--- | :--- |
| **Admin / Bendahara** | Terdaftar di tab `Users_Auth` pada Google Sheets sekolah | Mengelola data guru & komponen gaji (termasuk impor masal `.XLSX` ke Google Sheets), mencatat kehadiran & JTM, membuat draf penggajian, mengajukan persetujuan ke Kepala Sekolah, mengonfirmasi pembayaran gaji, serta mengatur identitas sekolah/yayasan. |
| **Kepala Sekolah** | Terdaftar di tab `Users_Auth` pada Google Sheets sekolah | Memantau pengajuan penggajian per periode, memeriksa rincian gaji setiap pendidik, serta memberikan persetujuan (**Setujui**) atau mengembalikan draf untuk perbaikan (**Revisi**). |
| **Pendidik / Guru** | Otomatis terhubung di `Users_Auth` saat Admin mengisi **Alamat Gmail Guru** di aplikasi atau mengimpor `.XLSX` | Memeriksa profil kepegawaian dan gaji bersih terakhir (*hanya baca*), melihat rincian Slip Gaji Digital yang telah disetujui/dibayarkan, serta mengunduh Slip Gaji Resmi berformat PDF. |

### Alur Status Penggajian & Sinkronisasi Data
1. **Siklus Status Penggajian**: **Draf** *(oleh Admin / Bendahara)* → **Menunggu Persetujuan** *(diajukan ke Kepala Sekolah)* → **Disetujui Kepsek** *(siap dicairkan)* → **Sudah Dibayarkan** *(slip gaji terbit penuh di akun Guru)*.
2. **Koneksi & Sinkronisasi Google Sheets**: Aplikasi tidak menyediakan tautan langsung (*hyperlink*) untuk membuka file Google Sheets dari halaman web. Seluruh data tersinkronisasi secara *real-time* melalui **Alamat Layanan Server (URL)** Web App Google Apps Script pada menu **Pengaturan** ke 6 tab Google Sheets (`Users_Auth`, `Teachers`, `Salary_Components`, `Attendances`, `Payrolls`, dan `Payroll_Details`). Apabila alamat server dikosongkan, aplikasi berjalan secara lokal dalam **Mode Simulasi**.

---

## Daftar Isi Final

- **Bab 1: Pendahuluan & Akses Akun**
  - 1.1. Mengenal Aplikasi SIPAYROLL
  - 1.2. Mengenal Mode Server Aktif dan Mode Simulasi
  - 1.3. Kebijakan Akun, Registrasi, dan Lupa Kata Sandi
  - 1.4. Cara Masuk ke Portal (Login via Gmail OTP)
    - Masuk Menggunakan Akun Gmail yang Pernah Digunakan di Perangkat
    - Masuk Cepat pada Mode Simulasi (Demo)
  - 1.5. Cara Keluar dari Aplikasi (**Keluar**)
- **Bab 2: Mengenal Antarmuka Aplikasi**
  - 2.1. Mengenal Bilah Atas (*Navbar*)
  - 2.2. Mengatur Koneksi Server Google Sheets & Mode Simulasi
  - 2.3. Memasang SIPAYROLL ke Layar Utama Perangkat (PWA)
  - 2.4. Navigasi & Tata Letak Dasbor per Peran Pengguna
    - A. Antarmuka Admin / Bendahara
    - B. Antarmuka Kepala Sekolah
    - C. Antarmuka Pendidik / Guru
  - 2.5. Mengenal Notifikasi Aplikasi
- **Bab 3: Panduan Fitur Utama — Admin / Bendahara Sekolah**
  - 3.1. Mengelola Master Data Guru & Komponen Gaji (**Master Guru & Gaji**)
    - 3.1.1. Menambah Data Guru Baru Secara Satuan
    - 3.1.2. Menambah Potongan & Tunjangan Custom
    - 3.1.3. Mengubah dan Menghapus Data Guru
    - 3.1.4. Impor Data Guru & Komponen Gaji Secara Masal ke Google Sheets (`.XLSX`)
  - 3.2. Mengatur Periode & Mencatat Kehadiran serta JTM (**Input Kehadiran & JTM**)
    - 3.2.1. Memilih Periode Penggajian Fleksibel
    - 3.2.2. Mengisi Kehadiran & JTM per Guru atau Kolektif
    - 3.2.3. Menggunakan Kalkulator Total JTM Interaktif
  - 3.3. Menjalankan Alur Penggajian (**Alur Penggajian**)
    - 3.3.1. Memahami Rumus Perhitungan & Status Periode
    - 3.3.2. Membuat & Menghitung Ulang Draf Penggajian
    - 3.3.3. Memeriksa Rincian Slip & Mengunduh PDF per Guru
    - 3.3.4. Mengajukan Draf ke Kepala Sekolah
    - 3.3.5. Mengonfirmasi Pembayaran Gaji (**Sudah Dibayarkan**)
  - 3.4. Contoh Skenario Penggunaan Bulanan
- **Bab 4: Panduan Fitur — Kepala Sekolah & Pendidik / Guru**
  - 4.1. Panduan Kepala Sekolah — Audit & Otorisasi Penggajian
    - 4.1.1. Memfilter Daftar Pengajuan (**Semua Periode**, **Perlu Otorisasi**, **Telah Disetujui**)
    - 4.1.2. Memeriksa Rincian Gaji Pendidik (**Periksa Rincian**)
    - 4.1.3. Menyetujui (**Setujui**) atau Mengembalikan Draf (**Revisi**)
  - 4.2. Panduan Pendidik / Guru — Profil & Slip Gaji Digital
    - 4.2.1. Melihat Informasi Kepegawaian & Gaji Bersih Terakhir (**Profil Saya**)
    - 4.2.2. Membaca Rincian & Mengunduh Slip Gaji Resmi (**Unduh Slip Gaji Resmi (PDF)**)
- **Bab 5: Penutup — Pengaturan, Pengelolaan Google Sheets, FAQ, dan Troubleshooting**
  - 5.1. Pengaturan Aplikasi, Profil, dan Preferensi Koneksi
    - 5.1.1. Mengatur Profil & Identitas Sekolah / Yayasan *(Khusus Admin / Bendahara)*
    - 5.1.2. Profil Pribadi Pendidik / Guru & Kata Sandi
    - 5.1.3. Pengaturan Koneksi Server & Mode Simulasi
  - 5.2. Catatan Penting Pengelolaan Google Sheet
  - 5.3. Pertanyaan yang Sering Diajukan (FAQ)
  - 5.4. Pemecahan Masalah (Troubleshooting)
