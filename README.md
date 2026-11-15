# SIPAYROLL — Aplikasi Payroll Sekolah & Yayasan

Sistem Informasi Penggajian Sekolah/Yayasan berbasis **React JS (Vite) + Tailwind CSS (Mobile-First Fluid Flexbox)** dan **Google Apps Script (`v1_GasBackend_Init`) + Google Sheets (6-Tab Database)**.

---

## 1. Arsitektur Keamanan & DevSecOps (`gas/v1_GasBackend_Init.js`)

1. **Database Autentikasi (`Users_Auth`) Tanpa Hardcoded Password**:
   - Seluruh kredensial disimpan di tab `Users_Auth` dalam format **Salted SHA-256** (`salt$sha256_hex`).
   - Perbandingan hash menggunakan algoritma *constant-time comparison* (`constantTimeEqual`) untuk mencegah *timing attack*.
2. **Object-Level Role-Based Access Control (RBAC)**:
   - Setiap request (`GET`, `POST`, `PUT`, `DELETE`) diverifikasi terhadap token sesi berjangka waktu (*HMAC-SHA256 signed token*).
   - Role `guru` diverifikasi secara ketat menggunakan pencocokan `Teachers.user_id === session.userId` dan `Payroll_Details.teacher_id === ownTeacher.id`. Pelanggaran akses langsung mengembalikan `403 Forbidden` atau `404 Not Found` generik.
3. **UUID v4 Primary Key**:
   - Seluruh tabel (`Users_Auth`, `Teachers`, `Salary_Components`, `Attendances`, `Payrolls`, `Payroll_Details`) menggunakan `Utilities.getUuid()` (UUID v4) sebagai Primary Key.
4. **Concurrency Control (`LockService`)**:
   - Seluruh operasi tulis/ubah/hapus dibungkus dengan `LockService.getScriptLock().tryLock(15000)` dan `SpreadsheetApp.flush()` untuk mencegah *race condition*.
5. **Anti-XSS & Spreadsheet Formula Injection**:
   - Input dibersihkan dari tag HTML/script berbahaya serta karakter pemicu formula (`=`, `+`, `-`, `@`).

---

## 2. Struktur 6 Tab Google Sheets (Baris 1 = Header)

| Nama Sheet / Tab | Kolom Header (Baris 1) |
| :--- | :--- |
| `Users_Auth` | `id`, `username`, `password_hash`, `role` |
| `Teachers` | `id`, `user_id`, `nip`, `name`, `status`, `bank_account` |
| `Salary_Components` | `id`, `teacher_id`, `base_salary`, `hourly_rate`, `position_allowance`, `bpjs_deduction` |
| `Attendances` | `id`, `teacher_id`, `month`, `year`, `present_days`, `absent_days`, `total_jtm` |
| `Payrolls` | `id`, `month`, `year`, `total_budget`, `status` |
| `Payroll_Details` | `id`, `payroll_id`, `teacher_id`, `net_salary`, `details_json` |

---

## 3. Cara Deploy Backend Google Apps Script

1. Buat Google Spreadsheet baru, lalu buka **Extensions > Apps Script**.
2. Salin seluruh isi file `gas/v1_GasBackend_Init.js` ke dalam editor `Code.gs`.
3. Jalankan fungsi `setupDatabaseSchema()` satu kali dari editor Apps Script untuk membuat ke-6 tab beserta baris header secara otomatis.
4. Klik **Deploy > New deployment > Web app**:
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
5. Salin **Web App URL** (`https://script.google.com/macros/s/.../exec`) dan masukkan ke file `.env` (`VITE_GAS_API_URL=...`) atau melalui tombol **Koneksi GAS** di pojok kanan atas aplikasi.

---

## 4. Menjalankan Frontend React JS (Vite)

```bash
npm install
npm run dev
```
