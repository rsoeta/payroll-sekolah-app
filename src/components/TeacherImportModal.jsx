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
import {
  calculateInfaqZakat,
  formatRupiah,
  formatRibuan,
  parseRibuan,
  sanitizeClientString,
} from '../utils/formatters';
import notify from '../utils/notify';

const TEMPLATE_HEADERS = [
  'nip',
  'name',
  'status',
  'bank_account',
  'base_salary',
  'hourly_rate',
  'position_allowance',
  'infaq_zakat_enabled',
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
    'YA',
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
    'TIDAK',
    'nadia.putri@gmail.com',
  ],
];

export function downloadTeacherImportTemplate() {
  const worksheetData = [TEMPLATE_HEADERS, ...SAMPLE_ROWS];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  worksheet['!cols'] = [
    { wch: 18 },
    { wch: 26 },
    { wch: 26 },
    { wch: 22 },
    { wch: 15 },
    { wch: 14 },
    { wch: 18 },
    { wch: 15 },
    { wch: 28 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Master_Guru_Gaji');
  XLSX.writeFile(workbook, 'Template_Import_Guru_SIPAYROLL.xlsx');
}

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
  const idxInfaq = colIndex([
    'infaq_zakat_enabled',
    'infaq_zakat',
    'zakat_profesi',
    'infaq',
    'bpjs_deduction',
    'potongan_bpjs',
    'bpjs',
  ]);
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

    const rawInfaqCell = getCell(idxInfaq, cells[7] ?? 'TIDAK');
    const infaqToken = String(rawInfaqCell ?? '')
      .trim()
      .toLowerCase();
    const infaq_zakat_enabled =
      infaqToken === 'ya' ||
      infaqToken === 'yes' ||
      infaqToken === 'true' ||
      infaqToken === '1' ||
      infaqToken === 'aktif' ||
      (infaqToken !== 'tidak' &&
        infaqToken !== 'no' &&
        infaqToken !== 'false' &&
        infaqToken !== '0' &&
        parseRibuan(rawInfaqCell) > 0);
    const infaq_zakat = calculateInfaqZakat(
      base_salary,
      hourly_rate,
      position_allowance,
      infaq_zakat_enabled
    );
    const bpjs_deduction = infaq_zakat;

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
      infaq_zakat_enabled,
      infaq_zakat,
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
      className="nim-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-teacher-modal-title"
    >
      <div className="nim-panel nim-modal w-full max-w-3xl p-5 sm:p-6 my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div
          className="flex items-start justify-between gap-3 pb-3 shrink-0"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{
                background: 'var(--good-soft)',
                color: 'var(--good-text)',
                boxShadow: 'inset 0 0 0 1px var(--good-line)',
              }}
            >
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h3 id="import-teacher-modal-title" className="text-base sm:text-lg font-bold text-[var(--ink)]">
                Import Master Data Guru &amp; Komponen Gaji (.XLSX)
              </h3>
              <p className="text-xs text-[var(--muted)]">
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
            className="nim-ibtn"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="mt-4 space-y-4 overflow-y-auto pr-1 flex-1">
          {/* Step 1: Download Template */}
          <div
            className="rounded-2xl p-4"
            style={{
              background: 'var(--accent-soft)',
              boxShadow: 'inset 0 0 0 1px var(--accent-glow)',
            }}
          >
            <div className="fluid-container items-center justify-between">
              <div className="fluid-item">
                <span className="nim-badge nim-badge--accent">
                  Langkah 1 • Format Import Excel
                </span>
                <h4 className="mt-1.5 text-sm font-bold text-[var(--ink)]">
                  Unduh Template Format Import (.XLSX)
                </h4>
                <p className="mt-0.5 text-xs text-[var(--ink-2)]">
                  Cukup isi data profil guru, nominal komponen gaji, dan alamat Gmail pada kolom{' '}
                  <code className="font-bold text-[var(--accent-text)]">email</code> (tanpa perlu
                  username &amp; password).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    downloadTeacherImportTemplate();
                    notify.info('Template Excel (.xlsx) berhasil diunduh.');
                  }}
                  className="nim-btn nim-btn--primary"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  <span>Unduh Template Excel (.XLSX)</span>
                </button>
              </div>
            </div>

            <div className="nim-card-well mt-3 p-2.5 text-[11px] text-[var(--muted)] font-mono overflow-x-auto">
              Kolom: nip | name | status | bank_account | base_salary | hourly_rate |
              position_allowance | infaq_zakat_enabled (YA/TIDAK) | email (Alamat Gmail)
            </div>
          </div>

          {/* Step 2: Upload XLSX File */}
          <div
            className="nim-card-well p-5 text-center"
            style={{ border: '2px dashed var(--line-2)' }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="nim-kpi__ico mx-auto !w-12 !h-12 !rounded-2xl">
              <Upload className="h-5 w-5" />
            </div>
            <p className="mt-2.5 text-sm font-bold text-[var(--ink)]">
              {fileName ? `File Terpilih: ${fileName}` : 'Pilih File Excel (.XLSX) Master Guru & Gaji'}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Jika NIP sudah terdaftar, data guru, komponen gaji, &amp; akun Gmail akan diperbarui otomatis.
            </p>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="nim-btn nim-btn--primary"
              >
                <Upload className="h-4 w-4" />
                <span>
                  {fileName ? 'Ganti File Excel (.XLSX)' : 'Pilih File Excel (.XLSX) dari Perangkat'}
                </span>
              </button>
            </div>
          </div>

          {/* Step 3: Preview Parsed Rows */}
          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[var(--good-text)]" />
                  <span className="text-xs font-bold text-[var(--ink)]">
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
                  className="nim-btn nim-btn--danger !min-h-[30px] !px-2.5 text-xs"
                >
                  Bersihkan Pratinjau
                </button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {parsedRows.map((row) => (
                  <div
                    key={row.rowNumber}
                    className="rounded-xl p-3 text-xs"
                    style={{
                      background: row.isValid ? 'var(--card-2)' : 'var(--bad-soft)',
                      boxShadow: row.isValid
                        ? 'inset 0 0 0 1px var(--line)'
                        : 'inset 0 0 0 1px var(--bad-line)',
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="nim-badge font-mono">Baris #{row.rowNumber}</span>
                        <span className="font-bold text-[var(--ink)]">{row.name || '(Tanpa Nama)'}</span>
                        <span className="text-[var(--muted)]">NIP: {row.nip || '-'}</span>
                        {row.email && (
                          <span className="nim-badge nim-badge--accent">
                            <Mail className="h-3 w-3" />
                            {row.email}
                          </span>
                        )}
                      </div>

                      {row.isValid ? (
                        <span
                          className={`nim-badge uppercase ${
                            row.mode === 'update' ? 'nim-badge--warn' : 'nim-badge--good'
                          }`}
                        >
                          {row.mode === 'update' ? 'Update Data (NIP Sama)' : 'Guru Baru'}
                        </span>
                      ) : (
                        <span className="nim-badge nim-badge--bad">
                          <AlertCircle className="h-3 w-3" /> {row.errorReason}
                        </span>
                      )}
                    </div>

                    {row.isValid && (
                      <div
                        className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-lg p-2 text-[11px]"
                        style={{ background: 'var(--card-2)' }}
                      >
                        <div>
                          <span className="text-[var(--muted)] block">Gaji Pokok</span>
                          <span className="font-bold text-[var(--ink)] tabular-nums">
                            {formatRupiah(row.base_salary)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--muted)] block">Tarif / JTM</span>
                          <span className="font-bold text-[var(--accent-text)] tabular-nums">
                            {formatRupiah(row.hourly_rate)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--muted)] block">Tunjangan</span>
                          <span className="font-bold text-[var(--ink)] tabular-nums">
                            {formatRupiah(row.position_allowance)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--muted)] block">Infaq / Zakat (2,5%)</span>
                          <span
                            className="font-bold tabular-nums"
                            style={{
                              color: row.infaq_zakat_enabled
                                ? 'var(--bad-text)'
                                : 'var(--muted)',
                            }}
                          >
                            {row.infaq_zakat_enabled
                              ? `- ${formatRupiah(row.infaq_zakat)}`
                              : 'Tidak Aktif (Rp 0)'}
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
        <div
          className="fluid-container mt-4 pt-3 shrink-0 gap-2"
          style={{ borderTop: '1px solid var(--line)' }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="fluid-item-xs nim-btn"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleExecuteImport}
            disabled={importing || validRows.length === 0}
            className="fluid-item-xs nim-btn nim-btn--good"
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
