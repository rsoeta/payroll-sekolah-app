# Panduan Fitur Utama — Admin / Bendahara Sekolah

Dokumen ini merupakan panduan operasional lengkap bagi pengguna dengan peran **Admin / Bendahara** di aplikasi **SIPAYROLL**. Pada **Mode Server Aktif**, setiap data yang Anda simpan di ketiga modul utama di bawah ini akan otomatis tersinkronisasi ke Google Sheets sekolah:

1. **Master Guru & Gaji** — Mengelola data profil pendidik, akun Gmail akses portal, dan rincian komponen gaji (tersimpan ke tab `Teachers`, `Salary_Components`, dan `Users_Auth`).
2. **Input Kehadiran & JTM** — Mencatat hari hadir, hari alpa, dan total Jam Tatap Muka (JTM) sesuai periode yang dipilih (tersimpan ke tab `Attendances`).
3. **Alur Penggajian** — Menghitung draf penggajian otomatis, memeriksa rincian slip guru, mengajukan persetujuan ke Kepala Sekolah, hingga mengonfirmasi pembayaran gaji (tersimpan ke tab `Payrolls` dan `Payroll_Details`).

> **Tips Urutan Kerja:** Untuk hasil perhitungan yang akurat, selalu kerjakan secara berurutan: **(1) Lengkapi Master Guru & Gaji → (2) Simpan Kehadiran & JTM pada periode yang sesuai → (3) Jalankan Alur Penggajian**.

---

## 1. Mengelola Master Data Guru & Komponen Gaji (**Master Guru & Gaji**)

**Tujuan Fitur:**
Modul **Master Guru & Gaji** berfungsi sebagai basis data induk seluruh pendidik dan tenaga kependidikan. Data yang disimpan di sini—mulai dari nomor rekening, akun Gmail untuk masuk ke portal, gaji pokok, tarif per JTM, tunjangan, hingga potongan—akan otomatis dipakai setiap kali Anda menghitung penggajian bulanan.

Untuk membuka modul ini, klik tab **Master Guru & Gaji** (pada ponsel: klik tab **Master Guru** di bilah bawah).

`[SCREENSHOT: Halaman Master Data Guru & Komponen Gaji yang menampilkan tombol Unduh Format Import (.XLSX), Import Data (.XLSX), Tambah Guru Baru, serta kartu daftar guru]`

### 1.1. Menambah Data Guru Baru Secara Satuan

Gunakan cara ini apabila Anda ingin menambahkan satu atau beberapa guru baru secara langsung di aplikasi.

1. Pada halaman **Master Data Guru & Komponen Gaji**, klik tombol **Tambah Guru Baru** di sisi kanan atas.
2. Jendela formulir **Tambah Guru & Komponen Gaji** akan terbuka.
3. Lengkapi data identitas dan kepegawaian pada bagian atas formulir:
   * **NIP / NIY** *(wajib diisi)*: Nomor induk pegawai atau yayasan (contoh: `19900101202001`).
   * **Nama Lengkap & Gelar** *(wajib diisi)*: Nama lengkap beserta gelar akademik (contoh: `Ahmad Fauzi, S.Pd.`).
   * **Status Kepegawaian**: Pilih salah satu dari daftar:
     - `GTY (Guru Tetap Yayasan)`
     - `GTT (Guru Tidak Tetap)`
     - `PNS DPK`
     - `Staf Tata Usaha`
   * **Bank & Nomor Rekening** *(wajib diisi)*: Nama bank dan nomor rekening tujuan transfer gaji (contoh: `BSI 7192837465`).
4. Pada kotak **Akun Akses Portal Guru (Gmail)**, isi kolom **Alamat Gmail Guru** (contoh: `ahmad.fauzi@gmail.com`).
   * Saat disimpan, sistem otomatis mendaftarkan alamat Gmail ini ke daftar akun sekolah sehingga guru dapat langsung masuk menggunakan OTP Gmail tanpa kata sandi.
5. Pada bagian **Rincian Komponen Gaji**, masukkan nominal angka (pemisah ribuan titik otomatis terbentuk saat Anda mengetik):
   * **Gaji Pokok (Rp)** *(nilai bawaan: `3.000.000`)*
   * **Tarif Mengajar per JTM (Rp)** *(nilai bawaan: `50.000`)*
   * **Tunjangan Jabatan (Rp)** *(nilai bawaan: `500.000`)*
   * **Potongan BPJS (Rp)** *(nilai bawaan: `120.000`)*
6. *(Opsional)* Jika guru memiliki tunjangan atau potongan tambahan selain BPJS, tambahkan pada bagian **Potongan & Komponen Lainnya (Custom Admin)** (lihat Sub-bab 1.2).
7. Klik tombol **Simpan Data**. Jika berhasil, muncul notifikasi *"Guru baru & Komponen Gaji berhasil ditambahkan."*

> **Perhatian:**
> * Kolom **NIP / NIY**, **Nama Lengkap & Gelar**, dan **Bank & Nomor Rekening** wajib diisi. Jika salah satu kosong, sistem memunculkan peringatan: *"NIP, Nama Lengkap, dan Nomor Rekening wajib diisi."*
> * Jika **Alamat Gmail Guru** diisi dengan format yang salah (tidak mengandung tanda `@`), muncul peringatan: *"Masukkan alamat Gmail yang valid (contoh: nama.guru@gmail.com)."*
> * Setiap guru harus memiliki alamat Gmail yang unik. Jika Gmail sudah dipakai akun lain, penyimpanan ditolak dengan pesan *"Alamat Gmail sudah digunakan oleh akun lain."*

`[SCREENSHOT: Jendela formulir Tambah Guru & Komponen Gaji beserta bagian Akun Akses Portal Guru (Gmail) dan Rincian Komponen Gaji]`

### 1.2. Menambah Potongan & Tunjangan Custom

**Tujuan Fitur:**
Selain 4 komponen standar (*Gaji Pokok*, *Tarif Mengajar per JTM*, *Tunjangan Jabatan*, dan *Potongan BPJS*), sekolah sering memiliki kebijakan tunjangan khusus (misalnya wali kelas atau uang makan) maupun potongan tambahan (misalnya koperasi, kasbon, atau infaq). Fitur ini memungkinkan Anda menyesuaikannya per guru.

Di dalam formulir **Tambah / Edit Guru & Komponen Gaji**, gulir ke kotak **Potongan & Komponen Lainnya (Custom Admin)**:

1. **Menggunakan Pilihan Cepat (*Preset*)**:
   Klik salah satu tombol preset yang tersedia untuk langsung menambahkan baris item:
   * Potongan (`−`): **Potongan Koperasi / Kasbon** (`Rp 100.000`), **Cicilan Pinjaman Yayasan** (`Rp 200.000`), **Infaq / Zakat Profesi** (`Rp 50.000`), **Potongan Keterlambatan** (`Rp 25.000`).
   * Tunjangan (`+`): **Tunjangan Wali Kelas** (`Rp 150.000`), **Tunjangan Transport & Makan** (`Rp 200.000`).
2. **Menambah Item Secara Manual**:
   Klik tombol **Tambah Item Custom** untuk memunculkan baris kosong baru.
3. Pada setiap baris item custom, atur 3 bagian berikut:
   * **Jenis Komponen**: Pilih **Potongan (−)** atau **Tunjangan (+)**.
   * **Nama potongan/tunjangan (misal: Koperasi)**: Ketik keterangan komponen (contoh: `Koperasi` atau `Tunjangan Lab`).
   * **Nominal (Rp)**: Masukkan jumlah rupiahnya.
4. Untuk menghapus baris yang tidak diperlukan, klik ikon tempat sampah di ujung kanan baris tersebut.
5. Periksa ringkasan otomatis di bagian bawah kotak (**Total Potongan (BPJS + Custom)** dan **Tunjangan Custom**) sebelum mengklik **Simpan Data**.

> **Tips:** Baris item custom yang kolom namanya dibiarkan kosong tidak akan ikut tersimpan saat Anda mengklik **Simpan Data**.

### 1.3. Mengubah dan Menghapus Data Guru

1. Pada daftar kartu guru di tab **Master Guru & Gaji**, cari guru yang ingin diperbarui.
2. **Untuk mengubah data**: Klik tombol **Edit Data & Gaji**, ubah data profil, alamat Gmail, atau komponen gaji pada jendela **Edit Data Guru & Komponen Gaji**, lalu klik **Simpan Data**. Notifikasi *"Data Guru & Komponen Gaji diperbarui."* akan tampil.
3. **Untuk menghapus data**: Klik tombol ikon tempat sampah merah di sebelah kanan tombol **Edit Data & Gaji**.
4. Akan muncul dialog konfirmasi **Hapus Data Guru** bertuliskan *"Apakah Anda yakin ingin menghapus data "[Nama Guru]" beserta komponen gajinya?"*. Klik **Ya, Lanjutkan** untuk menghapus, atau **Batal** jika ingin membatalkan.

> **Perhatian:** Menghapus data guru akan menghapus profil serta komponen gaji guru tersebut dari sistem.

### 1.4. Impor Data Guru & Komponen Gaji Secara Masal ke Google Sheets (`.XLSX`)

**Tujuan Fitur:**
Mempercepat pengisian atau pembaruan data puluhan hingga ratusan guru sekaligus dari berkas Microsoft Excel (`.xlsx`) langsung ke database Google Sheets sekolah tanpa harus mengetik satu per satu.

**Langkah 1: Unduh dan Isi Template Excel**
1. Klik tombol **Unduh Format Import (.XLSX)** pada bilah atas tab **Master Guru & Gaji** (atau klik tombol **Unduh Template Excel (.XLSX)** di dalam jendela import).
2. File bernama `Template_Import_Guru_SIPAYROLL.xlsx` akan otomatis terunduh ke perangkat Anda.
3. Buka file tersebut di Microsoft Excel atau Google Sheets. Pastikan isi kolom pada lembar kerja (*Sheet*) pertama sesuai urutan dan aturan berikut:
   * `nip` *(wajib)*: NIP/NIY guru.
   * `name` *(wajib)*: Nama lengkap beserta gelar.
   * `status`: Status kepegawaian (jika dikosongkan, otomatis diisi `GTY (Guru Tetap Yayasan)`).
   * `bank_account` *(wajib)*: Nama bank dan nomor rekening.
   * `base_salary`: Gaji pokok (angka).
   * `hourly_rate`: Tarif mengajar per JTM (angka).
   * `position_allowance`: Tunjangan jabatan (angka).
   * `bpjs_deduction`: Potongan BPJS (angka).
   * `email`: Alamat Gmail guru untuk akses masuk portal.
4. Simpan file dalam format `.xlsx`.

> **Tips Pembaruan Masal:** Jika Anda mengunggah file yang berisi **NIP yang sudah terdaftar** sebelumnya di Google Sheets, sistem tidak akan membuat data ganda, melainkan otomatis **memperbarui** data guru, komponen gaji standar, dan alamat Gmail untuk NIP tersebut.

**Langkah 2: Unggah, Pratinjau, dan Jalankan Impor**
1. Di tab **Master Guru & Gaji**, klik tombol **Import Data (.XLSX)** untuk membuka jendela **Import Master Data Guru & Komponen Gaji (.XLSX)**.
2. Pada **Langkah 2**, klik **Pilih File Excel (.XLSX) dari Perangkat**, lalu pilih file Excel yang sudah Anda siapkan.
   * Jika file bukan berformat `.xlsx` atau `.xls`, muncul peringatan *"Harap pilih file Excel berformat .XLSX (Template Import SIPAYROLL)."*
   * Jika lembar kerja kosong, muncul peringatan *"File Excel (.xlsx) kosong atau tidak memiliki baris data."*
3. Sistem langsung menampilkan **Pratinjau Data Import** beserta jumlah baris **Valid** dan **Tidak Valid**:
   * Baris berlabel **Guru Baru** (hijau): Akan ditambahkan sebagai guru baru.
   * Baris berlabel **Update Data (NIP Sama)** (kuning): Akan memperbarui data guru yang sudah ada.
   * Baris berwarna merah muda menandakan **Tidak Valid**, disertai alasan kesalahannya (*"NIP, Nama, dan Rekening wajib diisi"* atau *"Format alamat Gmail tidak valid"*). Baris tidak valid akan dilewati saat proses impor.
4. Jika ingin mengganti file atau membatalkan pratinjau, klik **Bersihkan Pratinjau** atau **Ganti File Excel (.XLSX)**.
5. Jika pratinjau sudah sesuai, klik tombol **Import [Jumlah] Data Guru** di pojok kanan bawah.
6. Tunggu hingga muncul notifikasi sukses jumlah data baru dan data yang diperbarui.

`[SCREENSHOT: Jendela Import Master Data Guru & Komponen Gaji (.XLSX) pada tahap pratinjau yang menampilkan status Guru Baru, Update Data (NIP Sama), dan baris Tidak Valid]`

> **Catatan:** Template Excel hanya mencakup 4 komponen gaji standar. Jika guru tertentu memerlukan komponen *custom* (seperti Koperasi atau Tunjangan Wali Kelas), tambahkan melalui tombol **Edit Data & Gaji** setelah proses impor selesai.

---

## 2. Mengatur Periode & Mencatat Kehadiran serta JTM (**Input Kehadiran & JTM**)

**Tujuan Fitur:**
Modul **Input Kehadiran & JTM** digunakan untuk mencatat jumlah hari hadir, hari alpa, serta total Jam Tatap Muka (JTM) setiap guru pada bulan atau rentang periode tertentu. Angka **Total JTM** inilah yang nantinya dikalikan dengan **Tarif Mengajar per JTM** saat kalkulasi penggajian.

### 2.1. Memilih Periode Penggajian Fleksibel

Di bagian atas area kerja (di bawah 3 Kartu Ringkasan), terdapat panel **Pemilih Periode Fleksibel** yang memengaruhi data pada tab **Input Kehadiran & JTM** maupun **Alur Penggajian**:

1. Pilih **Bulan Awal (Dari)** pada dropdown pertama dan **Bulan Akhir (Hingga)** pada dropdown kedua (dipisahkan tanda `s/d`).
2. Pilih **Tahun** pada dropdown ketiga (`2025` s/d `2028`).
3. Untuk mempercepat pemilihan, Anda dapat langsung mengklik tombol pintasan di bawahnya:
   * **1 Bulan**: Menyamakan bulan akhir dengan bulan awal (penggajian 1 bulan normal, misalnya *November 2026*).
   * **Jan–Jun**: Mengatur rentang periode semester pertama (*Januari – Juni*, tampil lencana **6 Bulan**).
   * **Jul–Des**: Mengatur rentang periode semester kedua (*Juli – Desember*, tampil lencana **6 Bulan**).

> **Perhatian:** Saat menggunakan **Mode Server Aktif** (terhubung ke Google Sheets) dan memilih rentang multi-bulan (misalnya **Jan–Jun**), pastikan Anda mengisi dan menyimpan data kehadiran pada rentang periode tersebut di tab **Input Kehadiran & JTM** terlebih dahulu sebelum membuat draf penggajian. Jika catatan kehadiran untuk periode yang dipilih belum tersimpan, nilai JTM pada draf otomatis dihitung `0`.

### 2.2. Mengisi Kehadiran & JTM per Guru atau Kolektif

1. Buka tab **Input Kehadiran & JTM** (pada ponsel: klik tab **Kehadiran & JTM**).
2. Pastikan periode pada judul halaman (*Input Kehadiran & Jam Tatap Muka (JTM) — [Bulan/Rentang] [Tahun]*) sudah sesuai.
3. Pada setiap kartu guru, nilai awal tampilan untuk periode yang belum pernah disimpan adalah Hadir `20`, Alpa `0`, dan JTM `24`. Ubah sesuai data aktual pada tiga kolom berikut:
   * **Hari Hadir**: Jumlah hari kehadiran (batas maksimal `31 × jumlah bulan pada periode`).
   * **Hari Alpa**: Jumlah hari ketidakhadiran tanpa keterangan.
   * **Total JTM (Jam)**: Total jam mengajar pada periode tersebut (batas maksimal `200 × jumlah bulan pada periode`).
4. Perhatikan baris **Estimasi Honor Mengajar (JTM × Tarif)** di bagian bawah kartu; nilainya akan otomatis berubah mengikuti angka **Total JTM** yang Anda ketik.
5. Untuk menyimpan data ke sistem/Google Sheets:
   * **Simpan satu guru saja**: Klik tombol **Simpan** di pojok kanan atas kartu guru tersebut. Muncul notifikasi *"Kehadiran [Nama Guru] disimpan."*
   * **Simpan seluruh guru sekaligus**: Klik tombol **Simpan Semua Kehadiran** di bagian atas halaman. Muncul notifikasi *"Seluruh data kehadiran [Periode] [Tahun] tersimpan!"*

`[SCREENSHOT: Halaman Input Kehadiran & JTM yang menampilkan tombol Simpan Semua Kehadiran serta kartu input Hari Hadir, Hari Alpa, Total JTM, dan tombol Kalkulator]`

> **Tips:** Nilai bawaan `20` hari hadir dan `24` JTM pada layar hanya merupakan angka bantu awal di formulir, belum tersimpan ke database sebelum Anda mengklik **Simpan** atau **Simpan Semua Kehadiran**.

### 2.3. Menggunakan Kalkulator Total JTM Interaktif

**Tujuan Fitur:**
Membantu bendahara menjumlahkan jam mengajar guru secara cepat tanpa membuka aplikasi kalkulator terpisah—baik berdasarkan rincian kelas/pertemuan maupun berdasarkan jadwal mingguan.

1. Pada kartu guru di tab **Input Kehadiran & JTM**, klik tombol biru **Kalkulator** di sebelah kanan kolom **Total JTM (Jam)**.
2. Jendela **Kalkulator Total JTM** akan terbuka menampilkan nama guru dan tarif per JTM-nya.
3. Pilih salah satu dari dua mode perhitungan:

   **Pilihan A — Mode `Kalkulator Angka` (untuk penjumlahan/perkalian bebas):**
   * Klik tombol angka (`0`–`9`) dan operator (`+`, `−`, `×`), atau ketik langsung di kotak **Ekspresi (Ketik atau gunakan tombol)** (contoh: `6 + 6 + 4 + 8` atau `6 * 4`).
   * Anda juga bisa mengklik tombol pintasan cepat: **+2 Jam**, **+4 Jam**, **+6 Jam**, **× 4 Minggu**, atau **× 5 Minggu**.
   * Klik **=** untuk menyederhanakan ekspresi menjadi hasil angka, tombol panah hapus untuk menghapus 1 karakter, atau **C** untuk membersihkan layar.

   **Pilihan B — Mode `Rumus Mingguan` (untuk jadwal rutin per minggu):**
   * Isi **JTM per Minggu (Jam)** *(contoh: `6`)*.
   * Pilih **Minggu Efektif Bulan Ini** (`1 Minggu` s/d `5 Minggu`, bawaan `4 Minggu`).
   * Isi **+ Jam Tambahan / Pengganti** jika guru mengisi kelas pengganti atau jam ekstra.
   * Isi **− Potongan Jam Kosong / Alpa** jika ada jam mengajar yang tidak terlaksana.

4. Pantau layar gelap di bagian atas kalkulator untuk melihat **Estimasi Honor JTM** dan **Hasil Total JTM** secara langsung.
5. Klik tombol **Gunakan [Jumlah] Jam** untuk memasukkan hasil hitungan ke kolom **Total JTM (Jam)** guru tersebut.

`[SCREENSHOT: Jendela Kalkulator Total JTM menampilkan layar hasil gelap, tombol mode Kalkulator Angka dan Rumus Mingguan, serta tombol Gunakan [Jumlah] Jam]`

> **Perhatian:**
> * Kalkulator JTM membatasi hasil maksimal hingga **200 Jam** per bulan.
> * Setelah mengklik **Gunakan [Jumlah] Jam**, jangan lupa mengklik tombol **Simpan** pada kartu guru (atau **Simpan Semua Kehadiran**) agar data benar-benar tersimpan sebelum Anda membuat draf gaji.

---

## 3. Menjalankan Alur Penggajian (**Alur Penggajian**)

**Tujuan Fitur:**
Modul **Alur Penggajian** adalah pusat proses penggajian setiap periode. Di sinilah seluruh komponen gaji guru dan catatan JTM digabungkan menjadi draf rincian gaji, diajukan untuk diperiksa Kepala Sekolah, hingga ditandai selesai dibayarkan agar Slip Gaji Digital resmi terbit untuk masing-masing guru.

Untuk membukanya, klik tab **Alur Penggajian** (pada ponsel: klik tab **Penggajian**).

`[SCREENSHOT: Halaman Alur Penggajian yang menampilkan banner Kalkulasi Penggajian, Daftar Periode Penggajian beserta lencana status, dan panel Rincian Slip Gaji Guru]`

### 3.1. Memahami Rumus Perhitungan & Status Periode

Setiap kali draf dibuat, sistem menghitung gaji bersih (*Take Home Pay*) tiap guru dengan rumus:
* **Penerimaan Kotor (*Gross*)** = `Gaji Pokok + (Total JTM × Tarif/JTM) + Tunjangan Jabatan + Total Tunjangan Custom`
* **Gaji Bersih (*Net / Take Home Pay*)** = `Penerimaan Kotor − Potongan BPJS − Total Potongan Custom` *(minimal Rp 0)*

Setiap periode memiliki empat tahapan status yang ditandai dengan lencana warna:
1. **Draf** *(abu-abu)*: Baru dibuat atau dikembalikan Kepala Sekolah untuk revisi. Data gaji masih bisa dihitung ulang.
2. **Menunggu Persetujuan** *(kuning)*: Sudah diajukan ke Kepala Sekolah dan **terkunci** (tidak bisa dihitung ulang oleh Admin selama menunggu keputusan Kepala Sekolah).
3. **Disetujui Kepsek** *(biru-ungu)*: Sudah disetujui Kepala Sekolah dan siap dicairkan oleh bendahara.
4. **Sudah Dibayarkan** *(hijau)*: Pencairan dana telah dikonfirmasi selesai oleh bendahara.

### 3.2. Membuat & Menghitung Ulang Draf Penggajian

1. Pastikan bulan/rentang dan tahun pada **Pemilih Periode Fleksibel** sudah sesuai dengan periode yang akan digaji.
2. Perhatikan kotak biru **Kalkulasi Penggajian: [Periode] [Tahun]** di bagian atas tab **Alur Penggajian**.
3. Klik tombol **Generate Draf Penggajian**.
   * Jika periode tersebut sudah memiliki draf berstatus **Draf**, tombol berubah nama menjadi **Kalkulasi Ulang Draf**. Gunakan tombol ini apabila Anda baru saja mengubah gaji guru atau memperbarui catatan kehadiran/JTM.
4. Sistem akan otomatis menghitung total anggaran, menyimpannya ke Google Sheets, menampilkan notifikasi *"Draf Payroll [Periode] [Tahun] berhasil dikalkulasi!"*, serta membuka panel **Rincian Slip Gaji Guru** di bagian bawah halaman.

> **Perhatian:** Anda hanya bisa menjalankan **Generate Draf Penggajian** / **Kalkulasi Ulang Draf** selama status periode masih **Belum Dibuat** atau **Draf**. Jika statusnya sudah **Menunggu Persetujuan**, **Disetujui Kepsek**, atau **Sudah Dibayarkan**, periode tersebut terkunci agar nominal yang sudah diperiksa tidak berubah secara sepihak.

### 3.3. Memeriksa Rincian Slip & Mengunduh PDF per Guru

1. Pada daftar **Daftar Periode Penggajian**, klik tombol **Rincian Guru** pada kartu periode yang ingin diperiksa.
2. Bagian **Rincian Slip Gaji Guru — [Periode] [Tahun]** akan terbuka di bawah daftar periode, menampilkan:
   * **Total Anggaran** untuk seluruh guru pada periode tersebut.
   * Kartu rincian untuk masing-masing guru yang memuat: Nama, NIP, Nomor Rekening, rincian *Gaji Pokok*, *Honor JTM*, *Tunjangan Jabatan*, seluruh item *Custom* (`+` tunjangan / `−` potongan), *Potongan BPJS*, dan **Gaji Bersih (Net)**.
3. Untuk mengunduh dokumen resmi slip gaji guru tertentu, klik tombol **PDF** di pojok kanan atas kartu guru tersebut. File PDF bernama `Slip_Gaji_[NIP]_[Bulan]_[Tahun].pdf` akan langsung terunduh.
4. Klik tombol **X** di pojok kanan atas panel rincian untuk menutup tampilan rincian.

### 3.4. Mengajukan Draf ke Kepala Sekolah

Setelah seluruh rincian guru pada draf dipastikan benar:

1. Pada periode yang berstatus **Draf**, klik tombol kuning **Ajukan ke Kepsek** (bisa dari banner atas maupun langsung dari kartu periode di **Daftar Periode Penggajian**).
2. Dialog konfirmasi **Ajukan Penggajian ke Kepala Sekolah** akan muncul menampilkan periode dan total anggaran yang diajukan.
3. Klik **Ya, Lanjutkan**.
4. Status periode berubah menjadi **Menunggu Persetujuan**, dan pengajuan langsung muncul di dasbor Kepala Sekolah.

> **Tips Jika Ada Kesalahan Setelah Diajukan:** Jika ternyata ada angka yang keliru setelah pengajuan dikirim, minta Kepala Sekolah mengklik tombol **Revisi** pada dasbor beliau agar status periode kembali menjadi **Draf**, lalu lakukan perbaikan dan klik **Kalkulasi Ulang Draf**.

### 3.5. Mengonfirmasi Pembayaran Gaji (**Sudah Dibayarkan**)

Setelah Kepala Sekolah menyetujui pengajuan (status berubah menjadi **Disetujui Kepsek**) dan bendahara selesai mentransfer gaji ke rekening masing-masing pendidik:

1. Buka tab **Alur Penggajian** dan temukan periode yang berstatus **Disetujui Kepsek**.
2. Klik tombol hijau **Tandai Sudah Dibayar** (pada banner atas) atau **Tandai Dibayar** (pada kartu periode).
3. Dialog konfirmasi **Konfirmasi Pencairan Gaji** akan muncul dengan keterangan bahwa slip gaji digital akan diterbitkan ke dasbor masing-masing guru.
4. Klik **Ya, Lanjutkan**.
5. Status periode berubah menjadi **Sudah Dibayarkan**, dan seluruh pendidik dapat melihat serta mengunduh slip gaji periode tersebut dari akun masing-masing.

---

## 4. Contoh Skenario Penggunaan Bulanan

Agar lebih mudah membayangkan alurnya, berikut contoh skenario kerja Bendahara Sekolah untuk penggajian bulan **November 2026**:

1. **Minggu Pertama (Pembaruan Data Guru Baru):**
   Bendahara menerima SK pengangkatan seorang guru honorer baru, *Nadia Putri, M.Pd.*, dan seorang guru lama mendapatkan tugas tambahan sebagai wali kelas.
   - Bendahara membuka tab **Master Guru & Gaji**, klik **Tambah Guru Baru**, mengisi NIP, nama, status *GTT*, rekening bank, alamat Gmail `nadia.putri@gmail.com`, dan komponen gajinya, lalu klik **Simpan Data**.
   - Untuk guru lama, Bendahara klik **Edit Data & Gaji**, klik preset **+ Tunjangan Wali Kelas** (`Rp 150.000`), lalu klik **Simpan Data**.
2. **Akhir Bulan (Rekap Kehadiran & JTM):**
   - Bendahara membuka tab **Input Kehadiran & JTM** dan memastikan pemilih periode berada di **November s/d November 2026** (klik pintasan **1 Bulan**).
   - Untuk *Budi Santoso, S.Pd., M.Pd.* yang jadwalnya 6 JTM/minggu selama 4 minggu efektif ditambah 2 jam kelas pengganti, Bendahara klik tombol **Kalkulator**, memilih mode **Rumus Mingguan**, mengisi `6` JTM/minggu, `4 Minggu`, dan `+ 2` jam tambahan, lalu klik **Gunakan 26 Jam**.
   - Setelah seluruh guru diisi, Bendahara klik **Simpan Semua Kehadiran** agar data tersimpan ke Google Sheets.
3. **Proses Penggajian & Pengajuan:**
   - Bendahara berpindah ke tab **Alur Penggajian**, lalu klik **Generate Draf Penggajian**.
   - Bendahara meninjau panel **Rincian Slip Gaji Guru** untuk memastikan *Take Home Pay* seluruh guru sudah sesuai.
   - Setelah yakin, Bendahara klik **Ajukan ke Kepsek** dan klik **Ya, Lanjutkan**. Status berubah menjadi **Menunggu Persetujuan**.
4. **Setelah Disetujui & Ditransfer:**
   - Keesokan harinya, Kepala Sekolah menyetujui pengajuan sehingga status berubah menjadi **Disetujui Kepsek**.
   - Bendahara mentransfer gaji ke rekening masing-masing guru sesuai rincian, lalu kembali ke **Alur Penggajian** dan klik **Tandai Sudah Dibayar** (atau **Tandai Dibayar** pada kartu periode). Kini seluruh guru bisa mengunduh Slip Gaji Digital bulan November 2026 dari perangkat masing-masing.

*Setelah memahami tugas lengkap Admin / Bendahara dari hulu ke hilir, mari melihat alur kerja dari sisi **Kepala Sekolah** saat mengaudit dan mengesahkan gaji, serta sisi **Pendidik / Guru** saat mengunduh slip gaji resmi pada bab berikutnya.*
