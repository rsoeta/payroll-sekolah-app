# Bab Penutup — Pengaturan, Pengelolaan Google Sheets, FAQ, dan Troubleshooting

Dokumen ini membahas cara mengelola pengaturan aplikasi dan identitas sekolah, aturan penting menjaga struktur database **Google Sheets** agar aplikasi tidak error, daftar pertanyaan yang sering diajukan (**FAQ**), serta tabel **Troubleshooting** berdasarkan penanganan error di antarmuka web maupun server **Google Apps Script (GAS)**.

---

## 1. Pengaturan Aplikasi, Profil, dan Preferensi Koneksi

### 1.1. Mengatur Profil & Identitas Sekolah / Yayasan *(Khusus Admin / Bendahara)*

Admin / Bendahara dapat menyesuaikan logo, nama institusi, dan nama pejabat penandatangan yang tampil pada Bilah Atas aplikasi, halaman masuk, serta dokumen **Slip Gaji Resmi (PDF)**. Pada **Mode Server Aktif**, perubahan profil disimpan di server sekolah agar otomatis tampil sama di seluruh perangkat pengguna.

1. Masuk sebagai **Admin / Bendahara**, lalu buka tab **Profil Sekolah**.
2. **Mengubah Logo Sekolah / Yayasan**:
   - Klik **Unggah Gambar Logo** lalu pilih gambar berformat **PNG, JPG, WEBP, atau SVG** (otomatis dioptimalkan hingga ukuran maksimal 240×240 piksel agar tajam di PDF).
   - Klik **Gunakan Logo Bawaan** bila ingin kembali ke logo awal aplikasi.
3. **Mengubah Identitas Yayasan & Unit Sekolah**:
   - Isi **Nama Yayasan / Badan Penyelenggara** dan **Nama Sekolah / Madrasah / Unit** *(minimal salah satu wajib diisi)*.
   - Ubah **Nama Singkat Portal** (bawaan: `SIPAYROLL`), **Alamat Lengkap Sekolah / Yayasan**, **Kontak Telepon & Email**, dan **Kota Penerbitan Slip**.
4. **Mengubah Pejabat Penandatangan & Catatan Kaki PDF**:
   - Isi **Nama Kepala Sekolah**, **NIP / NIY Kepala Sekolah**, **Nama Bendahara Sekolah / Yayasan**, **NIP / NIY Bendahara**, serta **Catatan Kaki (Footer) Slip Gaji PDF**.
5. Tinjau hasilnya pada kotak **Pratinjau Kop & Pengesahan Slip Gaji PDF** (*Live Preview*) atau uji melalui tombol **Tes Unduh Slip PDF**.
6. Klik **Simpan Profil Sekolah / Yayasan** hingga muncul notifikasi *"Profil & Identitas Sekolah/Yayasan berhasil disimpan!"*. Klik **Reset Awal** di pojok kanan atas jika ingin kembali ke setelan awal.

`[SCREENSHOT: Halaman Profil Sekolah dengan Pratinjau Kop & Pengesahan Slip Gaji PDF, tombol Tes Unduh Slip PDF, dan formulir identitas institusi]`

### 1.2. Profil Pribadi Pendidik / Guru & Kata Sandi

* **Profil Pribadi Guru (`Profil Saya`)**: Informasi kepegawaian pada dasbor **Pendidik / Guru** (Nama, NIP, Status Kepegawaian, Bank & Nomor Rekening, dan Alamat Gmail) bersifat **hanya baca** agar data penggajian tetap konsisten. Untuk mengubahnya, hubungi **Admin / Bendahara** agar diperbarui melalui **Master Guru & Gaji → Edit Data & Gaji**.
* **Pengaturan Kata Sandi**: SIPAYROLL **tidak memiliki menu ubah kata sandi**, karena seluruh pengguna masuk menggunakan **verifikasi kode OTP 6 digit ke Gmail** tanpa kata sandi.

### 1.3. Pengaturan Koneksi Server & Mode Simulasi

Semua pengguna dapat mengatur koneksi aplikasi melalui tombol **Pengaturan** (ikon roda gigi) di Bilah Atas *(lihat langkah terperinci pada Sub-bab 2.2)*:

1. Klik **Pengaturan** untuk membuka jendela **Pengaturan Koneksi Server**.
2. Pada kolom **Alamat Layanan Server (URL)**:
   - **Terhubung ke Server Google Sheets Sekolah**: Tempelkan URL Web App GAS sekolah (harus diawali `https://script.google.com/`), lalu klik **Simpan Pengaturan**.
   - **Beralih ke Mode Simulasi**: Kosongkan kolom tersebut dan klik **Simpan Pengaturan**.
3. *(Khusus Mode Simulasi)* Klik **Atur Ulang Data Simulasi** untuk mengembalikan seluruh data latihan ke kondisi awal.

---

## 2. Catatan Penting Pengelolaan Google Sheet

Pada **Mode Server Aktif**, aplikasi menyimpan seluruh data sekolah ke dalam **6 tab Google Sheets**. Apabila Admin atau pengelola sekolah membuka file Google Sheets secara langsung untuk melihat atau mencadangkan data, patuhi aturan berikut agar aplikasi tidak mengalami error atau kehilangan data:

> **Perhatian Keras Pengelola Google Sheets:**
> 1. **Jangan Mengubah Nama Tab Sheet**: Aplikasi mencari 6 nama tab persis berikut: `Users_Auth`, `Teachers`, `Salary_Components`, `Attendances`, `Payrolls`, dan `Payroll_Details`. Jika salah satu tab diganti namanya (misalnya `Teachers` diubah menjadi `Daftar Guru`), server akan menganggap tab tersebut belum ada dan membuat tab `Teachers` baru yang kosong sehingga data terlihat hilang.
> 2. **Jangan Menghapus atau Mengubah Baris Header (Baris 1)**: Baris pertama setiap tab dibekukan sebagai nama kolom database. Menghapus baris header akan menyebabkan data baris kedua dianggap sebagai header dan seluruh data gagal terbaca dengan benar.
> 3. **Jangan Mengubah Urutan atau Menyisipkan Kolom di Tengah**: Server membaca dan menulis data berdasarkan posisi kolom secara berurutan (kolom A selalu berisi kode unik `id` untuk melacak baris saat edit/hapus). Menyisipkan kolom baru di tengah atau menggeser urutan kolom akan membuat data tersimpan ke kolom yang salah.
> 4. **Jangan Mengedit Kolom `id`, `user_id`, `teacher_id`, `payroll_id`, atau `details_json` Secara Manual**: Kolom-kolom ini saling terhubung menggunakan kode UUID unik dan format JSON. Mengubahnya secara manual dapat memutus relasi data slip gaji atau login guru.
> 5. **Aturan Penulisan di Tab `Users_Auth`**: Kolom `role` hanya boleh diisi `admin` (atau `bendahara`), `kepsek` (atau `kepala sekolah`), atau `guru` (atau `pendidik`). Pastikan tab `Users_Auth` tidak pernah kosong dan minimal memiliki satu akun `admin`.
> 6. **Hindari Karakter Rumus di Awal Teks**: Saat mengetik teks manual (seperti nama atau NIP), jangan mengawali isi sel dengan tanda `=`, `+`, `-`, atau `@` agar tidak terbaca sebagai rumus spreadsheet.

Berikut referensi susunan **nama tab dan urutan kolom wajib** di Google Sheets agar tetap terjaga:

| Nama Tab Sheet | Urutan Kolom Wajib (Baris 1, dimulai dari Kolom A) |
| :--- | :--- |
| `Users_Auth` | `id`, `username`, `password_hash`, `role` *(juga mendukung kolom `email`)* |
| `Teachers` | `id`, `user_id`, `nip`, `name`, `status`, `bank_account` |
| `Salary_Components` | `id`, `teacher_id`, `base_salary`, `hourly_rate`, `position_allowance`, `bpjs_deduction`, `custom_components_json` |
| `Attendances` | `id`, `teacher_id`, `month`, `year`, `present_days`, `absent_days`, `total_jtm` |
| `Payrolls` | `id`, `month`, `year`, `total_budget`, `status` |
| `Payroll_Details` | `id`, `payroll_id`, `teacher_id`, `net_salary`, `details_json` |

---

## 3. Pertanyaan yang Sering Diajukan (FAQ)

**1. Mengapa saat pertama kali dibuka atau setelah lama tidak dipakai, aplikasi terasa memuat agak lama (beberapa detik)?**
Itu adalah kondisi wajar (*cold start*) pada server gratis Google Apps Script ketika baru aktif kembali setelah tidak menerima permintaan beberapa saat. Permintaan kedua dan seterusnya biasanya akan jauh lebih cepat.

**2. Mengapa tidak ada menu Daftar (Registrasi) dan Lupa Kata Sandi?**
SIPAYROLL menggunakan login tanpa kata sandi (*passwordless*) berbasis akun Gmail yang terdaftar. Anda tidak perlu membuat atau mengingat kata sandi; cukup masukkan alamat Gmail yang sudah didaftarkan oleh **Admin / Bendahara** untuk menerima kode verifikasi 6 digit.

**3. Bagaimana jika guru mengganti alamat Gmail atau salah ketik nomor rekening?**
Guru tidak dapat mengubah data pribadinya dari dasbor guru. Minta **Admin / Bendahara** membuka **Master Guru & Gaji**, klik **Edit Data & Gaji** pada kartu guru bersangkutan, perbarui **Alamat Gmail Guru** atau **Bank & Nomor Rekening**, lalu klik **Simpan Data**.

**4. Mengapa halaman Slip Gaji Digital Guru kosong padahal gaji sudah dihitung bendahara?**
Slip gaji hanya muncul di akun **Pendidik / Guru** apabila periode penggajian sudah berstatus **Disetujui Kepsek** (`Disetujui`) atau **Sudah Dibayarkan** (`Dibayarkan`). Selama status masih **Draf** atau **Menunggu Persetujuan**, slip gaji belum diterbitkan ke akun guru.

**5. Admin sudah terlanjur mengklik "Ajukan ke Kepsek", ternyata ada nilai JTM atau potongan yang keliru. Bagaimana cara memperbaikinya?**
Selama berstatus **Menunggu Persetujuan**, draf terkunci. Minta **Kepala Sekolah** masuk ke dasbor beliau dan mengklik tombol **Revisi** pada periode tersebut agar statusnya kembali menjadi **Draf**. Setelah itu Admin dapat memperbaiki data lalu mengklik **Kalkulasi Ulang Draf**.

**6. Apa perbedaan Mode Simulasi dengan Mode Server Aktif?**
**Mode Simulasi** menyimpan data contoh secara lokal di browser Anda untuk keperluan latihan tanpa menyentuh Google Sheets sekolah. **Mode Server Aktif** terjadi ketika **Alamat Layanan Server (URL)** di menu **Pengaturan** terisi URL Web App sekolah, sehingga seluruh data langsung tersimpan ke Google Sheets.

**7. Apakah mengimpor ulang file Excel (`.XLSX`) akan membuat data guru menjadi ganda?**
Tidak, selama kolom `nip` sama persis dengan data guru yang sudah ada. Sistem otomatis mendeteksinya sebagai **Update Data (NIP Sama)** untuk memperbarui profil, komponen gaji standar, dan akun Gmail guru tersebut.

**8. Apakah tombol "Gunakan [X] Jam" di Kalkulator Total JTM otomatis menyimpan ke Google Sheets?**
Belum. Tombol tersebut hanya mengisi angka ke kotak **Total JTM (Jam)** di layar. Anda wajib mengklik tombol **Simpan** pada kartu guru atau **Simpan Semua Kehadiran** agar data tersimpan ke server.

**9. Mengapa saat menyimpan kehadiran banyak guru sekaligus atau mengimpor ratusan data terkadang butuh waktu agak lama?**
Setiap penyimpanan data melalui Google Apps Script menggunakan antrean penguncian data (*lock*) agar data Google Sheets tidak saling menimpa saat diakses bersamaan. Pastikan koneksi internet stabil dan tunggu notifikasi hijau muncul sebelum menutup halaman.

---

## 4. Pemecahan Masalah (Troubleshooting)

Tabel berikut merangkum kendala teknis, pesan validasi form, toast notifikasi, serta respons error dari server Google Apps Script (GAS) beserta solusi praktisnya:

| Kendala / Pesan Error | Penyebab Utama | Solusi |
| :--- | :--- | :--- |
| **Loading data terasa lambat beberapa detik di awal saat membuka aplikasi atau login** | Server Google Apps Script mengalami *cold start* (bangun dari kondisi jeda setelah lama tidak diakses) atau koneksi internet perangkat sedang lambat. | 1. Tunggu 3–8 detik hingga proses selesai tanpa mengklik tombol berulang kali.<br>2. Setelah respons pertama berhasil, akses menu berikutnya akan berjalan lebih cepat.<br>3. Jika lebih dari 20 detik tidak merespons, periksa jaringan internet lalu muat ulang halaman. |
| **Data gagal tersimpan karena koneksi terputus, batas waktu eksekusi habis, atau muncul pesan:**<br>`Resource Locked: Server sedang memproses transaksi lain. Silakan coba beberapa saat lagi.` / `Gagal menghubungi server GAS: ...` | Koneksi internet terputus di tengah penyimpanan, dua Admin menyimpan data bersamaan (*lock* maksimal 15 detik), atau penyimpanan kolektif melebihi batas waktu eksekusi GAS. | 1. Tunggu 5–15 detik lalu coba klik tombol **Simpan** kembali.<br>2. Jika menyimpan kehadiran untuk sangat banyak guru (ratusan baris) dan gagal di tengah jalan, gunakan tombol **Simpan** per guru atau bagi bertahap.<br>3. Untuk input guru masal, gunakan fitur **Import Data (.XLSX)** yang mengirim data dalam satu paket sehingga jauh lebih cepat dan aman. |
| **Data guru/kehadiran/payroll tiba-tiba terlihat kosong, salah kolom, atau muncul error setelah spreadsheet diedit manual** | Admin mengubah nama tab sheet (misal `Teachers`), menghapus baris header (baris 1), mengubah urutan kolom, atau menyisipkan kolom baru di tengah tabel Google Sheets. | 1. Buka Google Sheets sekolah dan periksa 6 nama tab wajib (`Users_Auth`, `Teachers`, `Salary_Components`, `Attendances`, `Payrolls`, `Payroll_Details`).<br>2. Kembalikan perubahan menggunakan **Version History (Riwayat Versi)** di Google Sheets (*File → Version history → See version history*).<br>3. Jika terlanjur terbuat tab duplikat kosong akibat salah nama tab, pindahkan data ke tab asli yang benar sesuai urutan kolom pada Bagian 2. |
| **`Spreadsheet tidak ditemukan. Pastikan skrip dibuat melalui Extensions > Apps Script di dalam Google Sheets...`** | Skrip GAS dibuat terpisah (*standalone*) dan belum dihubungkan ke ID file Google Sheets sekolah. | 1. Laporkan ke **Pengelola IT Sekolah** agar memastikan skrip GAS dibuat dari dalam file Google Sheets melalui menu **Extensions → Apps Script** (atau mengisi ID Spreadsheet di konfigurasi skrip). |
| **`Akses Ditolak: Alamat Gmail "..." belum terdaftar pada sheet Users_Auth.`** *(atau `...belum terdaftar pada daftar akun (Users_Auth) oleh Admin Sekolah.`)* | Alamat Gmail yang dimasukkan belum didaftarkan oleh Admin di sistem, salah ketik email, atau aplikasi sedang berada di Mode Simulasi/server yang berbeda. | 1. Periksa ejaan alamat Gmail Anda.<br>2. Pastikan **Alamat Layanan Server (URL)** di menu **Pengaturan** sudah terhubung ke server sekolah.<br>3. Hubungi **Admin / Bendahara** agar Gmail Anda didaftarkan pada **Master Guru & Gaji** (untuk Guru) atau di tab `Users_Auth` Google Sheets (untuk Admin/Kepsek). |
| **Kendala otorisasi Akun Google / OAuth:**<br>`Akses Ditolak: Akun Google "..." telah terverifikasi, namun belum terdaftar di sheet Users_Auth.` / `Google OAuth Client ID tidak cocok.` / `Harap verifikasi kepemilikan Akun Google Anda menggunakan kode OTP yang dikirim ke Gmail.` | Akun Google sudah terverifikasi tetapi email belum dicatat di tab `Users_Auth`, konfigurasi Google Client ID berbeda dengan server, atau sesi verifikasi Google tidak terbaca. | 1. Gunakan metode login utama **Kirim Kode Verifikasi ke Gmail** (OTP 6 digit) yang langsung aktif tanpa memerlukan Client ID tambahan.<br>2. Pastikan alamat email Google Anda sudah tercantum di tab `Users_Auth` Google Sheets sekolah.<br>3. Jika memakai OAuth Client ID khusus, minta Pengelola IT menyamakan konfigurasi Client ID di server GAS. |
| **`Sheet Users_Auth masih kosong. Daftarkan alamat Gmail Admin terlebih dahulu.`** / **`Kolom role di Users_Auth harus bernilai: admin, kepsek, atau guru.`** | Tab `Users_Auth` di Google Sheets belum memiliki satupun baris pengguna, atau isi kolom `role` salah ketik (misal `staff` atau `superuser`). | 1. Buka tab `Users_Auth` di Google Sheets sekolah.<br>2. Tambahkan baris akun Admin dengan mengisi `username` (alamat Gmail) dan `role` bernilai `admin`, `kepsek`, atau `guru`. |
| **Kendala OTP Gmail tidak masuk / gagal kirim:**<br>`Gagal mengirim kode verifikasi ke Gmail (...Izin MailApp belum aktif)` | Email OTP masuk ke folder Spam/Promosi, izin kirim email di GAS belum disetujui pemilik skrip, atau kuota kirim email harian akun Google penyedia GAS sudah penuh. | 1. Periksa folder **Spam** atau **Updates** di Gmail Anda.<br>2. Tunggu 30 detik lalu klik **Kirim Ulang Kode**.<br>3. Jika muncul pesan `Izin MailApp belum aktif`, minta Pengelola IT menjalankan inisialisasi ulang di Editor Apps Script dan menyetujui izin akses Gmail (*Allow*), lalu *Deploy New Version*. |
| **`Kode verifikasi tidak ditemukan atau sudah kedaluwarsa.`** / **`Kode verifikasi 6 digit tidak sesuai.`** / **`Terlalu banyak percobaan salah. Silakan minta kode verifikasi baru.`** | Masa berlaku kode OTP (**5 menit**) habis, salah ketik hingga **5 kali**, atau memasukkan kode dari email OTP lama setelah meminta kode baru. | 1. Klik **Kirim Ulang Kode** (atau **Ganti Gmail** untuk mengulang).<br>2. Masukkan tepat 6 angka dari email verifikasi paling baru dalam batas waktu 5 menit. |
| **`Akses ditolak oleh Google Apps Script (HTTP 403 Forbidden)`** / **`Respons tidak terduga dari GAS`** / **`Alamat server tidak valid.`** | URL Web App salah (tidak diawali `https://script.google.com/` atau berakhiran `/dev` bukan `/exec`), atau izin deployment Web App belum disetel ke *Anyone*. | 1. Buka menu **Pengaturan** di Bilah Atas dan pastikan URL berakhiran `/exec`.<br>2. Minta Pengelola IT memastikan pada pengaturan *Deploy → Manage deployments* di GAS opsi **Who has access** disetel ke **Anyone** dan menggunakan versi terbaru. |
| **`Unauthorized: Sesi berakhir atau token tidak valid.`** / **`Token sesi telah kedaluwarsa.`** | Masa sesi login (**8 jam**) berakhir atau terjadi pembaruan server saat sesi berlangsung. | 1. Klik **Keluar** atau muat ulang (*refresh*) halaman browser.<br>2. Masuk kembali dengan verifikasi OTP Gmail. |
| **`NIP, Nama Lengkap, dan Nomor Rekening wajib diisi.`** / **`Alamat Gmail sudah digunakan oleh akun lain.`** | Salah satu kolom wajib di formulir guru masih kosong, atau Gmail yang diketik sudah dipakai akun lain. | 1. Isi lengkap **NIP / NIY**, **Nama Lengkap & Gelar**, dan **Bank & Nomor Rekening**.<br>2. Gunakan alamat Gmail pribadi yang belum dipakai akun lain, lalu klik **Simpan Data**. |
| **`Harap pilih file Excel berformat .XLSX`** / **`File Excel (.xlsx) kosong`** / **`Gagal membaca struktur file Excel (.xlsx).`** / **`Tidak ada baris data valid untuk di-import.`** | Format file bukan `.xlsx`/`.xls`, file rusak, sheet pertama kosong, atau pada baris Excel ada kolom wajib (`nip`, `name`, `bank_account`) yang kosong / format email salah. | 1. Unduh file resmi lewat **Unduh Format Import (.XLSX)** (`Template_Import_Guru_SIPAYROLL.xlsx`).<br>2. Isi data mulai baris 2 di sheet pertama tanpa mengubah baris header.<br>3. Periksa baris berwarna merah pada **Pratinjau Data Import**, perbaiki di Excel, lalu unggah ulang. |
| **`Payroll periode ini sudah diajukan/disetujui dan terkunci.`** *(atau `...tidak dapat di-generate ulang.`)* | Periode sudah berstatus **Menunggu Persetujuan**, **Disetujui Kepsek**, atau **Sudah Dibayarkan** sehingga terkunci dari kalkulasi ulang. | 1. Jika masih **Menunggu Persetujuan**, minta **Kepala Sekolah** mengklik **Revisi** agar status kembali menjadi **Draf**.<br>2. Setelah kembali ke **Draf**, klik **Kalkulasi Ulang Draf** di tab **Alur Penggajian**. |
| **`403 Forbidden: Anda tidak memiliki otorisasi...`** / **`403 Forbidden: Role akun tidak dikenali.`** / **`Belum ada slip gaji yang diterbitkan untuk akun Anda.`** | Akun mencoba membuka aksi peran lain, nilai `role` tidak dikenali, atau untuk Guru: gaji bulan berjalan belum disetujui/dibayarkan atau Gmail login belum tertaut ke data guru. | 1. Pastikan Anda login dengan akun peran yang sesuai.<br>2. Untuk Guru, pastikan Admin sudah mengajukan dan Kepala Sekolah sudah menyetujui penggajian periode tersebut, serta Gmail login Anda sama dengan yang tercatat pada kartu guru di **Master Guru & Gaji**. |
| **`Nama Yayasan atau Nama Sekolah wajib diisi.`** / **`Pilih file gambar yang valid (PNG, JPG, WEBP, atau SVG).`** | Kolom Nama Yayasan dan Nama Sekolah sama-sama kosong di tab **Profil Sekolah**, atau file logo bukan format gambar yang didukung. | 1. Isi minimal salah satu dari **Nama Yayasan** atau **Nama Sekolah**.<br>2. Unggah logo berformat `.png`, `.jpg`, `.webp`, atau `.svg` yang tidak rusak, lalu klik **Simpan Profil Sekolah / Yayasan**. |
