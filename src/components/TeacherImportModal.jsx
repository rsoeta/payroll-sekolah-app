import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileDown,
  X,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  RefreshCw,
  Mail,
} from 'lucide-react';
import { formatRupiah, formatRibuan, parseRibuan, sanitizeClientString } from '../utils/formatters';
import notify from '../utils/notify';

const TEMPLATE_HEADERS = [
  'nip',
  'name',
  'status',
  'bank_account',
  'base_salary',
  'hourly_rate',
  'position_allowance',
  'bpjs_deduction',
  'email',
];

const SAMPLE_ROWS = [
  [
    '19900215201901',
    'Ahmad Fauzi, S.Pd.',
    'GTY (Guru Tetap Yayasan)',
    'BSI 7192837465',
    3500000,
    55000,
    600000,
    150000,
    'ahmad.fauzi@gmail.com',
  ],
  [
    '19940710202202',
    'Nadia Putri, M.Pd.',
    'GTT (Guru Tidak Tetap)',
    'Mandiri 137009876543',
    2500000,
    50000,
    350000,
    100000,
    'nadia.putri@gmail.com',
  ],
];

/**
 * Generates and downloads an official Microsoft Excel (.xlsx) Template file
 * for bulk importing Teachers, Salary Components, and Gmail Portal Access.
 */
export function downloadTeacherImportTemplate() {
  const worksheetData = [TEMPLATE_HEADERS, ...SAMPLE_ROWS];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Set readable column widths in Excel
  worksheet['!cols'] = [
    { wch: 18 }, // nip
    { wch: 26 }, // name
    { wch: 26 }, // status
    { wch: 22 }, // bank_account
    { wch: 15 }, // base_salary
    { wch: 14 }, // hourly_rate
    { wch: 18 }, // position_allowance
    { wch: 15 }, // bpjs_deduction
    { wch: 28 }, // email (Gmail)
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Master_Guru_Gaji');
  XLSX.writeFile(workbook, 'Template_Import_Guru_SIPAYROLL.xlsx');
}

/**
 * Parses 2D array rows extracted from an Excel (.xlsx) sheet into validated teacher objects.
 */
function parseTeacherSheetRows(rawRows, existingTeachers = []) {
  if (!Array.isArray(rawRows) || rawRows.length < 2) return [];

  const nonEmptyRows = rawRows.filter(
    (r) => Array.isArray(r) && r.some((cell) => String(cell ?? '').trim() !== '')
  );
  if (nonEmptyRows.length < 2) return [];

  const rawHeaders = nonEmptyRows[0].map((h) =>
    String(h ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
  );

  const colIndex = (aliases) => {
    for (const alias of aliases) {
      const idx = rawHeaders.indexOf(alias);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const idxNip = colIndex(['nip', 'niy', 'nip/niy']);
  const idxName = colIndex(['name', 'nama', 'nama_lengkap', 'nama_guru']);
  const idxStatus = colIndex(['status', 'status_kepegawaian']);
  const idxBank = colIndex(['bank_account', 'rekening', 'nomor_rekening', 'no_rekening']);
  const idxBase = colIndex(['base_salary', 'gaji_pokok']);
  const idxRate = colIndex(['hourly_rate', 'tarif_jtm', 'tarif_per_jtm']);
  const idxAllowance = colIndex(['position_allowance', 'tunjangan', 'tunjangan_jabatan']);
  const idxBpjs = colIndex(['bpjs_deduction', 'potongan_bpjs', 'bpjs']);
  const idxEmail = colIndex(['email', 'gmail', 'alamat_gmail', 'akun_gmail', 'username']);

  const existingNipMap = new Map(
    existingTeachers.map((t) => [String(t.nip || '').trim().toLowerCase(), t])
  );

  return nonEmptyRows.slice(1).map((cells, index) => {
    const getCell = (idx, fallback = '') =>
      idx !== -1 && cells[idx] !== undefined && cells[idx] !== null ? cells[idx] : fallback;

    const nip = sanitizeClientString(String(getCell(idxNip, cells[0] ?? '')));
    const name = sanitizeClientString(String(getCell(idxName, cells[1] ?? '')));
    const status =
      sanitizeClientString(String(getCell(idxStatus, cells[2] ?? ''))) ||
      'GTY (Guru Tetap Yayasan)';
    const bank_account = sanitizeClientString(String(getCell(idxBank, cells[3] ?? '')));
    const base_salary = parseRibuan(getCell(idxBase, cells[4] ?? 0));
    const hourly_rate = parseRibuan(getCell(idxRate, cells[5] ?? 0));
    const position_allowance = parseRibuan(getCell(idxAllowance, cells[6] ?? 0));
    const bpjs_deduction = parseRibuan(getCell(idxBpjs, cells[7] ?? 0));
    const email = sanitizeClientString(String(getCell(idxEmail, cells[8] ?? '')))
      .trim()
      .toLowerCase();

    const matchedExisting = nip ? existingNipMap.get(nip.toLowerCase()) : null;
    const hasCoreFields = Boolean(nip && name && bank_account);
    const hasValidEmail = !email || email.includes('@');
    const isValid = hasCoreFields && hasValidEmail;

    let errorReason = null;
    if (!hasCoreFields) {
      errorReason = 'NIP, Nama, dan Rekening wajib diisi';
    } else if (!hasValidEmail) {
      errorReason = 'Format alamat Gmail tidak valid';
    }

    return {
      rowNumber: index + 2,
      existingId: matchedExisting ? matchedExisting.id : null,
      mode: matchedExisting ? 'update' : 'create',
      isValid,
      errorReason,
      nip,
      name,
      status,
      bank_account,
      base_salary,
      hourly_rate,
      position_allowance,
      bpjs_deduction,
      email,
      username: email,
    };
  });
}

export function TeacherImportModal({
  isOpen,
  existingTeachers = [],
  onImportSubmit,
  onClose,
}) {
  const [parsedRows, setParsedRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [progressText, setProgressText] = useState('');
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const validRows = parsedRows.filter((r) => r.isValid);
  const invalidRows = parsedRows.filter((r) => !r.isValid);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) {
      notify.warn('Harap pilih file Excel berformat .XLSX (Template Import SIPAYROLL).');
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result;
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames?.[0];
        if (!firstSheetName) {
          notify.warn('File Excel tidak memiliki lembar kerja (Sheet).');
          return;
        }
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        const rows = parseTeacherSheetRows(rawRows, existingTeachers);
        setParsedRows(rows);
        if (rows.length === 0) {
          notify.warn('File Excel (.xlsx) kosong atau tidak memiliki baris data.');
        } else {
          notify.info(`${formatRibuan(rows.length)} baris data guru berhasil dibaca dari Excel (.xlsx).`);
        }
      } catch {
        notify.error('Gagal membaca struktur file Excel (.xlsx). Pastikan file tidak rusak.');
      }
    };
    reader.onerror = () => {
      notify.error('Gagal membaca file Excel (.xlsx).');
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExecuteImport = async () => {
    if (validRows.length === 0) {
      notify.warn('Tidak ada baris data valid untuk di-import.');
      return;
    }

    setImporting(true);
    setProgressText(`Memproses ${formatRibuan(validRows.length)} data guru...`);
    try {
      await onImportSubmit(validRows, (doneCount, totalCount) => {
        setProgressText(`Mengimpor ${formatRibuan(doneCount)} / ${formatRibuan(totalCount)} guru...`);
      });
      setParsedRows([]);
      setFileName('');
      onClose();
    } catch (err) {
      notify.error(err.message || 'Terjadi kesalahan saat mengimpor data guru.');
    } finally {
      setImporting(false);
      setProgressText('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-teacher-modal-title"
    >
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-100 my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div>
              <h3 id="import-teacher-modal-title" className="text-lg font-bold text-slate-900">
                Import Master Data Guru & Komponen Gaji (.XLSX)
              </h3>
              <p className="text-xs text-slate-500">
                Unggah file Microsoft Excel (.xlsx) untuk menambahkan atau memperbarui data Guru,
                Komponen Gaji, serta alamat Akun Gmail secara masal.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            aria-label="Tutup modal import"
            className="touch-target flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="mt-4 space-y-4 overflow-y-auto pr-1 flex-1">
          {/* Step 1: Download Template */}
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div className="fluid-container items-center justify-between">
              <div className="fluid-item">
                <span className="inline-block rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  Langkah 1 • Format Import Excel
                </span>
                <h4 className="mt-1 text-sm font-bold text-slate-900">
                  Unduh Template Format Import (.XLSX)
                </h4>
                <p className="mt-0.5 text-xs text-slate-600">
                  Cukup isi data profil guru, nominal komponen gaji, dan alamat Gmail pada kolom{' '}
                  <code className="font-semibold text-indigo-800">email</code> (tanpa perlu
                  username & password).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    downloadTeacherImportTemplate();
                    notify.info('Template Excel (.xlsx) berhasil diunduh.');
                  }}
                  className="touch-target flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-700"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  <span>Unduh Template Excel (.XLSX)</span>
                </button>
              </div>
            </div>

            <div className="mt-3 rounded-xl bg-white/90 border border-indigo-100 p-2.5 text-[11px] text-slate-600 font-mono overflow-x-auto">
              Kolom: nip | name | status | bank_account | base_salary | hourly_rate |
              position_allowance | bpjs_deduction | email (Alamat Gmail)
            </div>
          </div>

          {/* Step 2: Upload XLSX File */}
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-5 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              <Upload className="h-6 w-6" />
            </div>
            <p className="mt-2 text-sm font-bold text-slate-900">
              {fileName ? `File Terpilih: ${fileName}` : 'Pilih File Excel (.XLSX) Master Guru & Gaji'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Jika NIP sudah terdaftar, data guru, komponen gaji, & akun Gmail akan diperbarui otomatis.
            </p>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="touch-target flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Upload className="h-4 w-4" />
                <span>{fileName ? 'Ganti File Excel (.XLSX)' : 'Pilih File Excel (.XLSX) dari Perangkat'}</span>
              </button>
            </div>
          </div>

          {/* Step 3: Preview Parsed Rows */}
          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-800">
                    Pratinjau Data Import ({formatRibuan(validRows.length)} Valid
                    {invalidRows.length > 0 ? `, ${formatRibuan(invalidRows.length)} Tidak Valid` : ''})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setParsedRows([]);
                    setFileName('');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="touch-target rounded-xl px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                >
                  Bersihkan Pratinjau
                </button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {parsedRows.map((row) => (
                  <div
                    key={row.rowNumber}
                    className={`rounded-xl border p-3 text-xs ${
                      row.isValid
                        ? 'border-slate-200 bg-white'
                        : 'border-rose-300 bg-rose-50/60 text-rose-900'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                          Baris #{row.rowNumber}
                        </span>
                        <span className="font-bold text-slate-900">{row.name || '(Tanpa Nama)'}</span>
                        <span className="text-slate-500">NIP: {row.nip || '-'}</span>
                        {row.email && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                            <Mail className="h-3 w-3" />
                            {row.email}
                          </span>
                        )}
                      </div>

                      {row.isValid ? (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                            row.mode === 'update'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {row.mode === 'update' ? 'Update Data (NIP Sama)' : 'Guru Baru'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold text-rose-700">
                          <AlertCircle className="h-3 w-3" /> {row.errorReason}
                        </span>
                      )}
                    </div>

                    {row.isValid && (
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-lg bg-slate-50 p-2 text-[11px]">
                        <div>
                          <span className="text-slate-500 block">Gaji Pokok</span>
                          <span className="font-bold text-slate-900">
                            {formatRupiah(row.base_salary)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Tarif / JTM</span>
                          <span className="font-bold text-indigo-700">
                            {formatRupiah(row.hourly_rate)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Tunjangan</span>
                          <span className="font-bold text-slate-900">
                            {formatRupiah(row.position_allowance)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Potongan BPJS</span>
                          <span className="font-bold text-rose-600">
                            - {formatRupiah(row.bpjs_deduction)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="fluid-container mt-4 pt-3 border-t border-slate-100 shrink-0 gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="fluid-item-xs touch-target rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleExecuteImport}
            disabled={importing || validRows.length === 0}
            className="fluid-item-xs touch-target flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
          >
            {importing ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>{progressText || 'Memproses Import...'}</span>
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" />
                <span>Import {formatRibuan(validRows.length)} Data Guru</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TeacherImportModal;
