# Bab 1 & Bab 2 — Pendahuluan, Akses Akun, dan Mengenal Antarmuka Aplikasi

Dokumen ini merupakan bagian pertama dari Buku Panduan Pengguna **SIPAYROLL (Sistem Penggajian Sekolah & Yayasan)**. Di dalamnya dijelaskan cara kerja sistem, langkah masuk ke portal menggunakan akun Gmail terdaftar, serta pengenalan tampilan dan navigasi aplikasi untuk setiap peran pengguna.

---

## Bab 1: Pendahuluan & Akses Akun

### 1.1. Mengenal Aplikasi SIPAYROLL

**SIPAYROLL** adalah aplikasi web untuk mengelola penggajian pendidik dan tenaga kependidikan di sekolah maupun yayasan secara terstruktur, transparan, dan mudah diakses dari komputer maupun ponsel. Aplikasi ini terhubung dengan layanan **Google Apps Script (GAS)** dan **Google Sheets** sebagai penyimpanan data sekolah, sekaligus menyediakan **Mode Simulasi** untuk latihan.

Secara garis besar, aplikasi melayani tiga peran pengguna utama:
1. **Admin / Bendahara**: Mengelola daftar guru dan komponen gaji (termasuk impor masal `.XLSX` ke Google Sheets), mencatat kehadiran serta Jam Tatap Muka (JTM), membuat draf penggajian, mengajukan persetujuan ke Kepala Sekolah, mengonfirmasi pembayaran gaji, serta mengatur identitas sekolah/yayasan.
2. **Kepala Sekolah**: Memeriksa rincian pengajuan penggajian per periode serta menyetujui (**Setujui**) atau mengembalikan pengajuan untuk perbaikan (**Revisi**).
3. **Pendidik / Guru**: Melihat profil kepegawaian, memeriksa rincian gaji bulanan yang telah disetujui atau dibayarkan, serta mengunduh Slip Gaji Resmi dalam format PDF.

Siklus status penggajian pada setiap periode berjalan berurutan sebagai berikut:
**Draf** *(oleh Admin / Bendahara)* → **Menunggu Persetujuan** *(diajukan ke Kepala Sekolah)* → **Disetujui Kepsek** *(siap dicairkan)* → **Sudah Dibayarkan** *(slip gaji terbit penuh di akun Guru)*.

### 1.2. Mengenal Mode Server Aktif dan Mode Simulasi

SIPAYROLL dapat berjalan dalam dua mode operasi:
* **Mode Server Aktif (Terhubung Google Sheets)**: Aplikasi terhubung langsung ke server Google Apps Script dan database 6 tab Google Sheets sekolah. Semua perubahan data guru, kehadiran, pengajuan gaji, dan pengiriman kode verifikasi OTP ke kotak masuk Gmail berjalan secara langsung (*real-time*).
* **Mode Simulasi**: Mode latihan atau uji coba yang berjalan secara lokal di perangkat Anda menggunakan data contoh bawaan. Pada mode ini, email OTP tidak benar-benar dikirim ke Gmail melainkan ditampilkan langsung di layar, dan tersedia tombol akses cepat untuk mencoba masing-masing peran.

> **Tips:** Jika Anda baru pertama kali mencoba aplikasi dan belum menghubungkan **Alamat Layanan Server (URL)** sekolah, Anda dapat berlatih dengan aman di **Mode Simulasi** tanpa memengaruhi data operasional sekolah.

### 1.3. Kebijakan Akun, Registrasi, dan Lupa Kata Sandi

SIPAYROLL **tidak menyediakan formulir registrasi mandiri** maupun **fitur lupa kata sandi**. Aplikasi ini menggunakan mekanisme masuk tanpa kata sandi (*passwordless*) berbasis **verifikasi Akun Gmail terdaftar**:
* **Cara Pendaftaran Akun**:
  - Akun **Admin / Bendahara** dan **Kepala Sekolah** didaftarkan oleh pengelola sistem pada daftar pengguna (`Users_Auth`) di Google Sheets sekolah.
  - Akun **Pendidik / Guru** otomatis terbuat dan terhubung saat **Admin / Bendahara** menambahkan data guru baru, mengubah data guru, atau mengimpor data guru dari Excel dengan menyertakan **Alamat Gmail Guru**.
* **Tidak Memerlukan Kata Sandi**: Setiap kali masuk, Anda cukup memverifikasi kepemilikan email menggunakan **kode verifikasi 6 digit (OTP)** yang dikirim ke Gmail Anda. Karena tidak memakai kata sandi, Anda tidak perlu khawatir lupa kata sandi atau melakukan reset kata sandi.

> **Perhatian:** Apabila Anda belum dapat masuk dan muncul pesan bahwa alamat Gmail Anda belum terdaftar, hubungi **Admin / Bendahara** agar alamat Gmail Anda didaftarkan terlebih dahulu.

### 1.4. Cara Masuk ke Portal (Login via Gmail OTP)

Saat membuka aplikasi dalam keadaan belum masuk, Anda akan melihat halaman **Masuk ke Portal** yang terdiri dari panel informasi sekolah di sebelah kiri dan kartu login di sebelah kanan.

`[SCREENSHOT: Halaman awal Masuk ke Portal SIPAYROLL yang menampilkan informasi sekolah di sisi kiri dan formulir input Alamat Akun Gmail Anda di sisi kanan]`

Ikuti langkah-langkah berikut untuk masuk menggunakan akun Gmail Anda:

1. Pastikan Anda berada di halaman **Masuk ke Portal**.
2. Pada kolom **Alamat Akun Gmail Anda** (berisi petunjuk *`nama.anda@gmail.com`*), ketikkan alamat Gmail Anda yang sudah terdaftar di sekolah.
3. Klik tombol **Kirim Kode Verifikasi ke Gmail** (saat diproses, tombol menampilkan *`Mengirim Kode Verifikasi...`*).
   - Jika format email belum valid, muncul peringatan: *"Masukkan alamat Gmail yang valid (contoh: nama@gmail.com)."*
   - Jika alamat Gmail belum didaftarkan oleh Admin Sekolah, muncul pesan penolakan akses (*"Akses Ditolak: Alamat Gmail '...' belum terdaftar..."*).
   - Jika berhasil pada **Mode Server Aktif**, muncul notifikasi *"Kode verifikasi 6 digit telah dikirim ke [alamat Gmail Anda]."* dan sistem mengirimkan email berjudul `[Kode] Kode Verifikasi Masuk — [Nama Sekolah]` ke Gmail Anda.
   - Jika berhasil pada **Mode Simulasi**, sistem memunculkan notifikasi *"Mode Simulasi — Kode OTP Gmail Anda: [6 digit]"* serta kotak kuning **Kode Simulasi** langsung di layar.
4. Buka kotak masuk Gmail Anda (periksa juga folder **Spam** jika belum terlihat di kotak masuk utama) untuk menyalin kode verifikasi 6 digit.
5. Kembali ke aplikasi SIPAYROLL. Pada kolom **Kode Verifikasi (6 Digit)** (berisi petunjuk *`000000`*), ketikkan 6 angka kode tersebut.
   - Pada **Mode Simulasi**, Anda cukup mengklik tombol **Isi Otomatis** di samping **Kode Simulasi** agar kolom kode terisi otomatis.

`[SCREENSHOT: Tampilan langkah kedua login (Kode Terkirim ke Gmail) dengan kolom input Kode Verifikasi (6 Digit), tombol Ganti Gmail, tombol Kirim Ulang Kode, dan tombol Verifikasi & Masuk]`

6. Klik tombol **Verifikasi & Masuk** (saat diproses, tombol menampilkan *`Memverifikasi...`*).
   - Jika angka yang dimasukkan kurang dari 6 digit, muncul peringatan: *"Masukkan tepat 6 digit kode verifikasi yang dikirim ke Gmail Anda."*
7. Jika kode cocok, muncul notifikasi *"Terverifikasi! Selamat datang, [Nama Anda]."* dan Anda langsung diarahkan ke dasbor sesuai peran akun Anda.

> **Perhatian:**
> * Setiap kode verifikasi hanya berlaku selama **5 menit** dan hanya dapat digunakan **1 kali**.
> * Jika kode salah dimasukkan hingga **5 kali percobaan**, kode otomatis hangus dan Anda harus meminta kode baru.
> * Tombol **Kirim Ulang Kode** memiliki jeda tunggu **30 detik** (ditampilkan sebagai *`Kirim Ulang (30d)`*) sebelum dapat diklik kembali.
> * Jika Anda salah mengetik alamat email, klik tombol **Ganti Gmail** untuk kembali ke langkah awal.

#### Masuk Menggunakan Akun Gmail yang Pernah Digunakan di Perangkat

Setelah berhasil masuk minimal satu kali, SIPAYROLL menyimpan hingga **6 alamat Gmail** terakhir yang pernah digunakan pada perangkat tersebut di bagian **Akun Gmail yang pernah digunakan di perangkat ini**.

1. Pada halaman **Masuk ke Portal**, klik chip alamat Gmail Anda di bagian **Akun Gmail yang pernah digunakan di perangkat ini**.
2. Sistem akan langsung mengirimkan kode verifikasi 6 digit baru ke alamat Gmail tersebut dan membuka layar pengisian kode.
3. Untuk menghapus akun dari daftar perangkat (misalnya setelah menggunakan komputer bersama), klik ikon tempat sampah kecil di sebelah kanan alamat Gmail pada chip akun tersebut.

#### Masuk Cepat pada Mode Simulasi (Demo)

Apabila aplikasi belum terhubung ke server sekolah (**Mode Simulasi** aktif), di bagian bawah kartu login tampil bagian **Akses Cepat Akun Terdaftar (Mode Simulasi)** berisi empat tombol akun contoh:
* **Admin / Bendahara** (`admin.sekolah@gmail.com`)
* **Kepala Sekolah** (`kepsek.sekolah@gmail.com`)
* **Budi Santoso, S.Pd., M.Pd.** (`budi.santoso@gmail.com`)
* **Siti Aisyah, S.Si.** (`siti.aisyah@gmail.com`)

Anda cukup mengklik salah satu kartu akun tersebut untuk langsung masuk ke dasbor peran terkait tanpa perlu memasukkan kode verifikasi.

`[SCREENSHOT: Bagian Akses Cepat Akun Terdaftar (Mode Simulasi) dengan empat tombol akun peran Admin, Kepala Sekolah, dan Guru]`

### 1.5. Cara Keluar dari Aplikasi (**Keluar**)

Sesi login Anda berlaku selama **8 jam** selama tab browser tidak ditutup. Demi menjaga kerahasiaan data gaji, biasakan keluar secara manual setelah selesai menggunakan aplikasi.

1. Arahkan pandangan ke **Bilah Atas** (*Header*) di pojok kanan atas layar.
2. Klik tombol **Keluar** (tombol berwarna merah muda dengan ikon keluar).
3. Muncul notifikasi *"Anda telah keluar dari sesi aplikasi."* dan layar kembali ke halaman **Masuk ke Portal**.

> **Tips:** Jika Anda menutup tab atau jendela browser, sesi login otomatis berakhir sehingga Anda perlu melakukan verifikasi kode Gmail ulang saat membuka kembali aplikasi.

*Setelah berhasil masuk ke portal sesuai peran akun Anda, langkah selanjutnya adalah mengenali tata letak layar, pengaturan koneksi server Google Sheets, pemasangan aplikasi (PWA), dan navigasi utama pada Bab 2.*

---

## Bab 2: Mengenal Antarmuka Aplikasi

Antarmuka SIPAYROLL dirancang responsif agar nyaman digunakan di layar komputer (Desktop) maupun ponsel (Mobile). Aplikasi ini **tidak menggunakan sidebar samping**, melainkan memadukan **Bilah Atas** dan **Menu Tab** yang otomatis menyesuaikan ukuran layar perangkat Anda.

### 2.1. Mengenal Bilah Atas (*Navbar*)

**Bilah Atas** selalu menempel di bagian paling atas layar pada setiap halaman aplikasi.

`[SCREENSHOT: Bilah Atas (Navbar) SIPAYROLL setelah login, menunjukkan logo sekolah di sisi kiri serta tombol Install, Pengaturan, lencana peran pengguna, dan tombol Keluar di sisi kanan]`

Komponen yang terdapat pada Bilah Atas dari kiri ke kanan adalah:
1. **Identitas Sekolah/Yayasan**: Menampilkan logo sekolah, nama singkat portal (bawaan: **SIPAYROLL**), serta nama sekolah atau yayasan yang aktif.
2. **Tombol Install**: Berwarna hijau muda untuk memasang aplikasi SIPAYROLL ke layar utama perangkat (tombol ini otomatis tersembunyi apabila aplikasi sudah dibuka dalam mode terinstal).
3. **Tombol Pengaturan**: Berikon roda gigi untuk membuka jendela **Pengaturan Koneksi Server** (dan tombol reset data saat berada di Mode Simulasi).
4. **Kartu Info Pengguna** *(tampil pada layar tablet/komputer setelah masuk)*: Menampilkan nama pengguna beserta lencana peran dengan warna pembeda:
   - **Admin / Bendahara** (lencana biru-ungu)
   - **Kepala Sekolah** (lencana kuning-oranye)
   - **Pendidik / Guru** (lencana hijau)
5. **Tombol Keluar**: Untuk mengakhiri sesi masuk Anda.

### 2.2. Mengatur Koneksi Server Google Sheets & Mode Simulasi

Siapa pun dapat membuka menu **Pengaturan** di Bilah Atas untuk menghubungkan aplikasi ke server Google Apps Script (Google Sheets) milik sekolah atau beralih ke Mode Simulasi.

1. Klik tombol **Pengaturan** di Bilah Atas.
2. Jendela **Pengaturan Koneksi Server** akan muncul di layar.

`[SCREENSHOT: Jendela dialog Pengaturan Koneksi Server yang menampilkan kolom Alamat Layanan Server (URL), tombol Atur Ulang Data Simulasi, dan tombol Simpan Pengaturan]`

3. Pada kolom **Alamat Layanan Server (URL)** (berisi petunjuk *`https://script.google.com/macros/s/.../exec`*):
   - **Untuk terhubung ke Mode Server Aktif (Google Sheets sekolah)**: Tempelkan URL Web App yang diberikan pengelola IT/Admin sekolah, lalu klik **Simpan Pengaturan**. Muncul notifikasi *"Berhasil terhubung ke server utama!"* (jika alamat tidak diawali `https://script.google.com/`, muncul pesan kesalahan *"Alamat server tidak valid."*).
   - **Untuk beralih ke Mode Simulasi**: Kosongkan kolom **Alamat Layanan Server (URL)**, lalu klik **Simpan Pengaturan**. Muncul notifikasi *"Beralih ke Mode Simulasi."*
4. *(Khusus saat Mode Simulasi aktif)* Klik tombol **Atur Ulang Data Simulasi** apabila Anda ingin mengembalikan seluruh data latihan ke kondisi awal. Muncul notifikasi *"Data simulasi berhasil diatur ulang ke kondisi awal."*

> **Tips:** Aplikasi tidak menyediakan tombol atau tautan langsung untuk membuka file Google Sheets di browser. Seluruh sinkronisasi data ke Google Sheets berjalan otomatis di latar belakang melalui alamat server tersebut.

### 2.3. Memasang SIPAYROLL ke Layar Utama Perangkat (PWA)

SIPAYROLL dapat dipasang sebagai aplikasi di layar utama ponsel maupun komputer agar tampil penuh layaknya aplikasi bawaan (*Progressive Web App*).

1. Klik tombol **Install** pada Bilah Atas.
2. Pada perangkat Android atau browser komputer yang mendukung pemasangan langsung, dialog konfirmasi pemasangan dari browser akan muncul; ikuti petunjuk hingga tampil notifikasi *"SIPAYROLL berhasil di-install ke perangkat Anda!"*.
3. Jika browser tidak memicu dialog otomatis (misalnya Safari di iPhone/iPad), jendela panduan **Install Aplikasi SIPAYROLL (PWA)** akan terbuka dengan petunjuk berikut:
   - **Android (Chrome / Edge)**: Klik menu **⋮ (Titik Tiga)** di pojok kanan atas browser, lalu pilih **"Install app"** atau **"Tambahkan ke layar utama"**.
   - **iPhone / iPad (Safari)**: Klik tombol **Bagikan (Share)** di bilah bawah Safari, lalu pilih **"Add to Home Screen" (Tambah ke Layar Utama)**.
   - **Desktop (Chrome / Edge)**: Klik ikon **Install SIPAYROLL** di sisi kanan *address bar* browser.
4. Klik tombol **Mengerti** untuk menutup jendela panduan.

`[SCREENSHOT: Jendela panduan Install Aplikasi SIPAYROLL (PWA) yang menampilkan langkah pemasangan untuk Android, iPhone/iPad, dan Desktop]`

### 2.4. Navigasi & Tata Letak Dasbor per Peran Pengguna

Setelah masuk, halaman utama menampilkan **Kartu Ringkasan** di bagian atas dan **Area Kerja** di bawahnya. Cara berpindah antar-menu menyesuaikan ukuran layar:
* **Pada Layar Komputer / Tablet**: Menu tab berada di bagian atas area kerja dengan indikator tombol aktif berwarna biru-ungu.
* **Pada Layar Ponsel (*Mobile*)**: Menu tab berpindah menjadi **Bilah Tab Mengambang** berwarna gelap di bagian bawah layar agar mudah dijangkau ibu jari.

#### A. Antarmuka Admin / Bendahara

1. **Kartu Ringkasan Atas (3 Kartu)**:
   - **Total Pendidik Aktif**: Menampilkan jumlah guru dan staf yayasan yang terdaftar.
   - **Periode Aktif**: Menampilkan bulan/rentang periode dan tahun yang dipilih beserta **Status**-nya (*Belum Dibuat*, *Draf*, *Menunggu Persetujuan*, *Disetujui Kepsek*, atau *Sudah Dibayarkan*).
   - **Anggaran Periode Ini**: Menampilkan akumulasi *Take Home Pay* pada periode aktif.
2. **Pemilih Periode Fleksibel**: Terletak di sisi kanan menu tab (atau di bawah kartu ringkasan pada ponsel), terdiri dari pilihan bulan awal `s/d` bulan akhir, pilihan tahun (`2025`–`2028`), serta tombol pintasan **1 Bulan**, **Jan–Jun**, dan **Jul–Des**.
3. **Empat Tab Menu Utama**:
   - **Alur Penggajian** *(di ponsel: **Penggajian**)*: Menghitung draf gaji, melihat rincian per guru, mengunduh PDF, mengajukan ke Kepala Sekolah, dan menandai sudah dibayar.
   - **Input Kehadiran & JTM** *(di ponsel: **Kehadiran & JTM**)*: Mencatat Hari Hadir, Hari Alpa, dan Total JTM (dilengkapi tombol **Kalkulator** JTM).
   - **Master Guru & Gaji** *(di ponsel: **Master Guru**, dilengkapi lencana jumlah guru)*: Mengelola profil pendidik, akun Gmail login, komponen gaji, serta impor masal Excel (`.XLSX`).
   - **Profil Sekolah**: Mengatur logo, nama yayasan/sekolah, alamat, kontak, dan pejabat penandatangan pada Slip Gaji PDF.

`[SCREENSHOT: Tampilan utama Dasbor Admin / Bendahara di layar Desktop yang memperlihatkan 3 Kartu Ringkasan, Pemilih Periode Fleksibel, dan 4 Tab Menu Utama]`

`[SCREENSHOT: Tampilan Dasbor Admin / Bendahara di layar Ponsel yang memperlihatkan Bilah Tab Mengambang di bagian bawah layar]`

#### B. Antarmuka Kepala Sekolah

1. **Kartu Ringkasan Atas (3 Kartu)**:
   - **Menunggu Persetujuan Anda**: Jumlah periode penggajian yang sudah diajukan bendahara dan menanti otorisasi Kepala Sekolah.
   - **Total Pendidik & Staf**: Jumlah total pendidik dan tenaga kependidikan yang tercatat.
   - **Total Periode Tercatat**: Jumlah seluruh riwayat periode penggajian di yayasan.
2. **Bagian Otorisasi Pengajuan Gaji (Kepala Sekolah)** dengan **Tiga Tab Filter**:
   - **Semua Periode**: Menampilkan seluruh periode dari status Draf hingga Sudah Dicairkan.
   - **Perlu Otorisasi** *(dilengkapi lencana jumlah antrean)*: Menyaring hanya periode berstatus *Menunggu Persetujuan Kepsek* untuk segera diperiksa.
   - **Telah Disetujui**: Menyaring periode yang sudah disetujui maupun yang sudah dicairkan.

`[SCREENSHOT: Tampilan Dasbor Kepala Sekolah dengan 3 Kartu Ringkasan, tab filter otorisasi, dan kartu periode penggajian]`

#### C. Antarmuka Pendidik / Guru

1. **Pada Layar Komputer / Tablet**: Seluruh informasi tampil sekaligus dalam satu halaman tanpa perlu berpindah tab:
   - **Spanduk Profil** di bagian atas (*Portal Resmi Pendidik & Tenaga Kependidikan*) yang memuat Nama, NIP, Status Kepegawaian, Nomor Rekening, Email Gmail, dan kotak **Gaji Bersih Terakhir**.
   - **Riwayat Slip Gaji Digital** di bagian bawah yang menampilkan kartu slip gaji bulanan dan tombol **Unduh Slip Gaji Resmi (PDF)**.
2. **Pada Layar Ponsel (*Mobile*)**: Layar diringkas menjadi dua tab di bilah navigasi bawah:
   - **Slip Gaji Digital** *(dilengkapi lencana jumlah slip tersedia)*: Menampilkan daftar kartu riwayat slip gaji Anda.
   - **Profil Saya**: Menampilkan spanduk profil kepegawaian, nomor rekening tujuan transfer, dan gaji bersih terakhir.

`[SCREENSHOT: Tampilan Dasbor Pendidik / Guru di Desktop yang menampilkan Spanduk Profil di atas dan daftar kartu Riwayat Slip Gaji Digital di bawah]`

### 2.5. Mengenal Notifikasi Aplikasi

Setiap tindakan yang Anda lakukan (seperti masuk, menyimpan data, mengunduh PDF, atau saat terjadi kesalahan) akan memunculkan kotak notifikasi singkat di bagian atas tengah layar selama sekitar **2 detik** dengan warna penanda:
* **Hijau**: Tindakan berhasil dijalankan.
* **Biru**: Informasi umum atau pengingat sistem.
* **Kuning/Oranye**: Peringatan agar Anda melengkapi atau memeriksa ulang isian.
* **Merah**: Terjadi kesalahan atau akses ditolak.

*Setelah memahami tata letak antarmuka dan navigasi untuk setiap peran, mari lanjutkan ke panduan operasional terperinci bagi **Admin / Bendahara Sekolah** pada bab berikutnya.*
