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
  formatRupiah,
  formatRibuan,
  getStaffCategoryLabel,
  isInfaqZakatEnabled,
  parseCustomComponents,
  parseRibuan,
  resolveStaffCategory,
  sanitizeClientString,
  summarizeCustomComponents,
} from '../utils/formatters';
import notify from '../utils/notify';

const TEMPLATE_HEADERS = [
  'nip',
  'name',
  'staff_category',
  'status',
  'bank_account',
  'base_salary',
  'hourly_rate',
  'position_allowance',
  'infaq_zakat_enabled',
  'custom_allowances',
  'custom_deductions',
  'email',
];

const SAMPLE_ROWS = [
  [
    '19900215201901',
    'Ahmad Fauzi, S.Pd.',
    'pendidik',
    'GTY (Guru Tetap Yayasan)',
    'BSI 7192837465',
    3500000,
    55000,
    600000,
    'YA',
    'Wali Kelas: 250000; Piket: 150000',
    'Cicilan Koperasi: 200000',
    'ahmad.fauzi@gmail.com',
  ],
  [
    '19940710202202',
    'Nadia Putri, A.Md.',
    'kependidikan',
    'Staf Tata Usaha (TU)',
    'Mandiri 137009876543',
    2500000,
    0,
    350000,
    'TIDAK',
    'Tunjangan Makan: 200000',
    'Kasbon: 100000',
    'nadia.putri@gmail.com',
  ],
];

const GUIDE_ROWS = [
  ['PANDUAN PENGISIAN TEMPLATE IMPORT MASTER PTK & KOMPONEN GAJI (SIPAYROLL)', '', ''],
  ['Kolom', 'Keterangan / Aturan Pengisian', 'Contoh Nilai'],
  ['nip', 'Wajib diisi (teks/angka NIP atau NIY unik PTK).', '19900215201901'],
  ['name', 'Wajib diisi. Nama lengkap beserta gelar PTK.', 'Ahmad Fauzi, S.Pd.'],
  [
    'staff_category',
    'Isi "pendidik" (Guru) atau "kependidikan" (TU/Staf/Keamanan/Kebersihan). Kosongkan untuk deteksi otomatis dari status.',
    'pendidik / kependidikan',
  ],
  [
    'status',
    'Status/jabatan tugas: GTY (Guru Tetap Yayasan), GTT (Guru Tidak Tetap), PNS DPK, Staf Tata Usaha (TU), Pustakawan, Laboran & Teknisi Sumber Belajar, Penguji, Petugas Keamanan, Tenaga Kebersihan.',
    'GTY (Guru Tetap Yayasan)',
  ],
  ['bank_account', 'Wajib diisi. Nama bank & nomor rekening tujuan pencairan.', 'BSI 7192837465'],
  ['base_salary', 'Gaji Pokok bulanan dalam angka (tanpa Rp).', '3500000'],
  ['hourly_rate', 'Tarif honor per Jam Tatap Muka (JTM). Isi 0 untuk Tenaga Kependidikan non-mengajar.', '55000'],
  ['position_allowance', 'Tunjangan Jabatan bulanan dalam angka.', '600000'],
  [
    'infaq_zakat_enabled',
    'Isi "YA" atau "TIDAK". Jika YA, dipotong 2,5% dari [Gaji Pokok + (JTM x Tarif) + Tj. Jabatan + Tunj (+)] saat kalkulasi payroll.',
    'YA / TIDAK',
  ],
  [
    'custom_allowances',
    'Opsional. Daftar Tunjangan Custom (Tunj +) dipisah titik koma (;). Format: Nama Tunjangan: Nominal',
    'Wali Kelas: 250000; Piket: 150000',
  ],
  [
    'custom_deductions',
    'Opsional. Daftar Potongan Custom (Pot -) dipisah titik koma (;). Format: Nama Potongan: Nominal',
    'Cicilan Koperasi: 200000; Kasbon: 100000',
  ],
  [
    'email',
    'Alamat Gmail aktif PTK untuk login OTP portal PTK (pengajuan pencairan, presensi, & slip gaji).',
    'ahmad.fauzi@gmail.com',
  ],
];

function applyTextColumnFormats(worksheet, rowCount) {
  // Enforce text format ('@') on NIP (col A = 0) & Bank Account (col E = 4) so Excel preserves leading zeros
  for (let r = 1; r <= rowCount; r++) {
    [0, 4].forEach((cIdx) => {
      const addr = XLSX.utils.encode_cell({ r, c: cIdx });
      if (worksheet[addr]) {
        worksheet[addr].t = 's';
        worksheet[addr].z = '@';
      }
    });
  }
}

function buildWorkbookWithRows(dataRows) {
  const worksheetData = [TEMPLATE_HEADERS, ...dataRows];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  worksheet['!cols'] = [
    { wch: 18 },
    { wch: 26 },
    { wch: 16 },
    { wch: 28 },
    { wch: 22 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 20 },
    { wch: 30 },
    { wch: 28 },
    { wch: 28 },
  ];
  applyTextColumnFormats(worksheet, dataRows.length);

  const guideSheet = XLSX.utils.aoa_to_sheet(GUIDE_ROWS);
  guideSheet['!cols'] = [{ wch: 24 }, { wch: 76 }, { wch: 34 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Master_PTK_Gaji');
  XLSX.utils.book_append_sheet(workbook, guideSheet, 'Panduan_Pengisian');
  return workbook;
}

export function downloadTeacherImportTemplate() {
  const workbook = buildWorkbookWithRows(SAMPLE_ROWS);
  XLSX.writeFile(workbook, 'Template_Import_PTK_SIPAYROLL.xlsx');
}

function formatCustomItemsToText(items = []) {
  return items
    .filter((it) => it && it.label)
    .map((it) => `${it.label}: ${Math.round(Number(it.amount || 0))}`)
    .join('; ');
}

export function exportExistingTeachersToXlsx(teachers = []) {
  const rows = teachers.map((t) => {
    const comp = t.salary_component || {};
    const custSummary = summarizeCustomComponents(comp.custom_components_json);
    const infaqActive = isInfaqZakatEnabled(comp);
    return [
      String(t.nip || ''),
      String(t.name || ''),
      resolveStaffCategory(t),
      String(t.status || 'GTY (Guru Tetap Yayasan)'),
      String(t.bank_account || ''),
      Number(comp.base_salary || 0),
      Number(comp.hourly_rate || 0),
      Number(comp.position_allowance || 0),
      infaqActive ? 'YA' : 'TIDAK',
      formatCustomItemsToText(custSummary.allowances),
      formatCustomItemsToText(custSummary.deductions),
      String(t.email || ''),
    ];
  });

  const workbook = buildWorkbookWithRows(rows.length > 0 ? rows : SAMPLE_ROWS);
  XLSX.writeFile(workbook, 'Master_Data_PTK_SIPAYROLL.xlsx');
}

/**
 * Parses human-friendly Excel cell text like "Wali Kelas: 250000; Piket: 150.000"
 * into structured custom component objects.
 */
function parseCustomExpressionCell(rawCell, itemType, rowIdx) {
  const rawStr = String(rawCell ?? '').trim();
  if (!rawStr || rawStr === '-') return [];

  const tokens = rawStr
    .split(/[;\n|]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const items = [];
  tokens.forEach((token, idx) => {
    const sepMatch = token.match(/^(.+?)\s*[:=]\s*(.+)$/);
    if (sepMatch) {
      const label = sanitizeClientString(sepMatch[1]);
      const amount = parseRibuan(sepMatch[2]);
      if (label) {
        items.push({
          id: `imp_${itemType}_${rowIdx}_${idx}`,
          type: itemType,
          label,
          amount: Math.max(0, amount),
        });
      }
    } else {
      // Fallback: extract trailing number if separated by space, e.g. "Wali Kelas 250000"
      const spaceNum = token.match(/^(.+?)\s+([\d.,]+)$/);
      if (spaceNum) {
        const label = sanitizeClientString(spaceNum[1]);
        const amount = parseRibuan(spaceNum[2]);
        if (label) {
          items.push({
            id: `imp_${itemType}_${rowIdx}_${idx}`,
            type: itemType,
            label,
            amount: Math.max(0, amount),
          });
        }
      }
    }
  });
  return items;
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
  const idxName = colIndex(['name', 'nama', 'nama_lengkap', 'nama_guru', 'nama_ptk']);
  const idxCategory = colIndex(['staff_category', 'kategori', 'kategori_ptk', 'jenis_ptk']);
  const idxStatus = colIndex(['status', 'status_kepegawaian', 'jabatan', 'jabatan_tugas']);
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
  const idxCustomAllow = colIndex([
    'custom_allowances',
    'tunjangan_custom',
    'tunj_custom',
    'tunjangan_tambahan',
  ]);
  const idxCustomDeduct = colIndex([
    'custom_deductions',
    'potongan_custom',
    'pot_custom',
    'potongan_lain',
  ]);
  const idxCustomJson = colIndex(['custom_components_json', 'custom_components']);
  const idxEmail = colIndex(['email', 'gmail', 'alamat_gmail', 'akun_gmail', 'username']);

  const existingNipMap = new Map(
    existingTeachers.map((t) => [String(t.nip || '').trim().toLowerCase(), t])
  );

  const hasCategoryCol = idxCategory !== -1;
  const hasCustomColumns = idxCustomAllow !== -1 || idxCustomDeduct !== -1 || idxCustomJson !== -1;
  const seenNipsInFile = new Set();

  return nonEmptyRows.slice(1).map((cells, index) => {
    const getCell = (idx, fallback = '') =>
      idx !== -1 && cells[idx] !== undefined && cells[idx] !== null ? cells[idx] : fallback;

    const nip = sanitizeClientString(String(getCell(idxNip, cells[0] ?? '')));
    const name = sanitizeClientString(String(getCell(idxName, cells[1] ?? '')));
    const rawCat = hasCategoryCol
      ? sanitizeClientString(String(getCell(idxCategory, cells[2] ?? '')))
      : '';
    const status =
      sanitizeClientString(String(getCell(idxStatus, cells[hasCategoryCol ? 3 : 2] ?? ''))) ||
      'GTY (Guru Tetap Yayasan)';
    const staff_category = resolveStaffCategory({ staff_category: rawCat, status });
    const bank_account = sanitizeClientString(
      String(getCell(idxBank, cells[hasCategoryCol ? 4 : 3] ?? ''))
    );
    const base_salary = parseRibuan(getCell(idxBase, cells[hasCategoryCol ? 5 : 4] ?? 0));
    const hourly_rate = parseRibuan(getCell(idxRate, cells[hasCategoryCol ? 6 : 5] ?? 0));
    const position_allowance = parseRibuan(
      getCell(idxAllowance, cells[hasCategoryCol ? 7 : 6] ?? 0)
    );

    const rawInfaqCell = getCell(idxInfaq, cells[hasCategoryCol ? 8 : 7] ?? 'TIDAK');
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
    const bpjs_deduction = infaq_zakat_enabled ? 1 : 0;

    let parsedCustomComponents;
    if (hasCustomColumns) {
      if (idxCustomJson !== -1 && String(getCell(idxCustomJson, '')).trim().startsWith('[')) {
        parsedCustomComponents = parseCustomComponents(getCell(idxCustomJson, '[]'));
      } else {
        const allowItems =
          idxCustomAllow !== -1
            ? parseCustomExpressionCell(getCell(idxCustomAllow, ''), 'allowance', index)
            : [];
        const deductItems =
          idxCustomDeduct !== -1
            ? parseCustomExpressionCell(getCell(idxCustomDeduct, ''), 'deduction', index)
            : [];
        parsedCustomComponents = [...allowItems, ...deductItems];
      }
    }

    const emailFallbackIdx = hasCustomColumns ? 11 : hasCategoryCol ? 9 : 8;
    const email = sanitizeClientString(
      String(getCell(idxEmail, cells[emailFallbackIdx] ?? ''))
    )
      .trim()
      .toLowerCase();

    const matchedExisting = nip ? existingNipMap.get(nip.toLowerCase()) : null;
    const isDuplicateInFile = Boolean(nip && seenNipsInFile.has(nip.toLowerCase()));
    if (nip) seenNipsInFile.add(nip.toLowerCase());

    const hasCoreFields = Boolean(nip && name && bank_account);
    const hasValidEmail = !email || email.includes('@');
    const isValid = hasCoreFields && hasValidEmail && !isDuplicateInFile;

    let errorReason = null;
    if (!hasCoreFields) {
      errorReason = 'NIP, Nama, dan Rekening wajib diisi';
    } else if (isDuplicateInFile) {
      errorReason = 'NIP duplikat di dalam file Excel ini';
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
      staff_category,
      status,
      bank_account,
      base_salary,
      hourly_rate,
      position_allowance,
      infaq_zakat_enabled,
      bpjs_deduction,
      ...(parsedCustomComponents !== undefined
        ? {
            custom_components: parsedCustomComponents,
            custom_components_json: JSON.stringify(parsedCustomComponents),
          }
        : {}),
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
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
        const rows = parseTeacherSheetRows(rawRows, existingTeachers);
        setParsedRows(rows);
        if (rows.length === 0) {
          notify.warn('File Excel (.xlsx) kosong atau tidak memiliki baris data.');
        } else {
          notify.info(`${formatRibuan(rows.length)} baris data PTK berhasil dibaca dari Excel (.xlsx).`);
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
    setProgressText(`Memproses ${formatRibuan(validRows.length)} data PTK...`);
    try {
      await onImportSubmit(validRows, (doneCount, totalCount) => {
        setProgressText(`Mengimpor ${formatRibuan(doneCount)} / ${formatRibuan(totalCount)} PTK...`);
      });
      setParsedRows([]);
      setFileName('');
      onClose();
    } catch (err) {
      notify.error(err.message || 'Terjadi kesalahan saat mengimpor data PTK.');
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
                Import Master Data PTK &amp; Komponen Gaji (.XLSX)
              </h3>
              <p className="text-xs text-[var(--muted)]">
                Unggah file Excel (.xlsx) untuk menambah/memperbarui Tenaga Pendidik (Guru), Tenaga
                Kependidikan, Komponen Gaji, Tunjangan/Potongan Custom, &amp; Gmail secara massal.
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
          {/* Step 1: Download Template or Export Current Data */}
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
                  Langkah 1 • Format Import Excel (12 Kolom + Panduan)
                </span>
                <h4 className="mt-1.5 text-sm font-bold text-[var(--ink)]">
                  Unduh Template Format Import atau Data PTK Aktif (.XLSX)
                </h4>
                <p className="mt-0.5 text-xs text-[var(--ink-2)]">
                  Isi data profil PTK, komponen gaji, opsi Infaq 2,5%, Tunjangan/Potongan Custom,
                  serta alamat Gmail di kolom <code className="font-bold text-[var(--accent-text)]">email</code>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    downloadTeacherImportTemplate();
                    notify.info('Template Format Import PTK (.xlsx) berhasil diunduh.');
                  }}
                  className="nim-btn nim-btn--primary"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  <span>Template Kosong (.XLSX)</span>
                </button>

                {existingTeachers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      exportExistingTeachersToXlsx(existingTeachers);
                      notify.info(
                        `Data ${formatRibuan(existingTeachers.length)} PTK aktif diekspor ke Excel (.xlsx).`
                      );
                    }}
                    className="nim-btn"
                  >
                    <FileDown className="h-3.5 w-3.5 text-[var(--good-text)]" />
                    <span>Ekspor PTK Aktif ({existingTeachers.length})</span>
                  </button>
                )}
              </div>
            </div>

            <div className="nim-card-well mt-3 p-2.5 text-[11px] text-[var(--muted)] font-mono overflow-x-auto">
              Kolom: nip | name | staff_category | status | bank_account | base_salary | hourly_rate
              | position_allowance | infaq_zakat_enabled (YA/TIDAK) | custom_allowances |
              custom_deductions | email
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
              {fileName ? `File Terpilih: ${fileName}` : 'Pilih File Excel (.XLSX) Master PTK & Gaji'}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Jika NIP sudah terdaftar, profil PTK, kategori, komponen gaji, custom item, &amp;
              Gmail akan diperbarui otomatis.
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
                  className="nim-btn nim-btn--danger nim-btn--sm"
                >
                  Bersihkan Pratinjau
                </button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {parsedRows.map((row) => {
                  const custList = Array.isArray(row.custom_components)
                    ? row.custom_components
                    : [];
                  return (
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
                          <span
                            className={`nim-badge ${
                              row.staff_category === 'kependidikan'
                                ? 'nim-badge--warn'
                                : 'nim-badge--good'
                            }`}
                          >
                            {getStaffCategoryLabel(row.staff_category)}
                          </span>
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
                            {row.mode === 'update' ? 'Update Data (NIP Sama)' : 'PTK Baru'}
                          </span>
                        ) : (
                          <span className="nim-badge nim-badge--bad">
                            <AlertCircle className="h-3 w-3" /> {row.errorReason}
                          </span>
                        )}
                      </div>

                      {row.isValid && (
                        <>
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
                              <span className="text-[var(--muted)] block">Tunjangan Jabatan</span>
                              <span className="font-bold text-[var(--ink)] tabular-nums">
                                {formatRupiah(row.position_allowance)}
                              </span>
                            </div>
                            <div>
                              <span className="text-[var(--muted)] block">Infaq / Zakat (2,5%)</span>
                              <span
                                className="font-bold"
                                style={{
                                  color: row.infaq_zakat_enabled
                                    ? 'var(--good-text)'
                                    : 'var(--muted)',
                                }}
                              >
                                {row.infaq_zakat_enabled ? 'Aktif (2,5% di Payroll)' : 'Tidak Aktif (Rp 0)'}
                              </span>
                            </div>
                          </div>

                          {custList.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {custList.map((cust) => (
                                <span
                                  key={cust.id}
                                  className={`nim-badge !text-[10.5px] ${
                                    cust.type === 'allowance'
                                      ? 'nim-badge--good'
                                      : 'nim-badge--bad'
                                  }`}
                                >
                                  <span>{cust.label}:</span>
                                  <span className="tabular-nums">
                                    {cust.type === 'allowance' ? '+' : '-'}{' '}
                                    {formatRupiah(cust.amount)}
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          className="flex flex-wrap items-center justify-end mt-4 pt-3 shrink-0 gap-2"
          style={{ borderTop: '1px solid var(--line)' }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="nim-btn"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleExecuteImport}
            disabled={importing || validRows.length === 0}
            className="nim-btn nim-btn--good"
          >
            {importing ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>{progressText || 'Memproses Import...'}</span>
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" />
                <span>Import {formatRibuan(validRows.length)} Data PTK</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TeacherImportModal;
