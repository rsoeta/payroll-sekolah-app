import {
  formatRupiah,
  getMonthName,
  normalizePeriodKey,
} from './formatters';
import {
  formatAttendanceNumber,
  getAttendanceConditionMeta,
  getLogValidationMeta,
} from './attendanceHelpers';
import {
  getDisbursementScopeMeta,
  getDisbursementStatusMeta,
  getDisbursementTimingMeta,
} from './disbursementHelpers';
import {
  getAdminRoutineStatusMeta,
  getReimbursementCategoryMeta,
  getReimbursementStatusMeta,
  isAdminRoutineReimbursement,
} from './reimbursementHelpers';

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(val, bits) {
  return (val >>> bits) | (val << (32 - bits));
}

function encodeUtf8Bytes(input) {
  const str = String(input ?? '');
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  const utf8 = unescape(encodeURIComponent(str));
  const bytes = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) {
    bytes[i] = utf8.charCodeAt(i);
  }
  return bytes;
}

/**
 * Pure-JS synchronous SHA-256 (UTF-8) returning 64-char lowercase hex.
 * Works identically across HTTPS, HTTP (Laragon/LAN), and GAS Utilities.computeDigest.
 */
export function sha256HexSync(message) {
  const bytes = encodeUtf8Bytes(message);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  const hiLen = Math.floor(bitLen / 0x100000000);
  const loLen = bitLen >>> 0;
  view.setUint32(paddedLen - 8, hiLen, false);
  view.setUint32(paddedLen - 4, loLen, false);

  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  return h.map((n) => n.toString(16).padStart(8, '0')).join('');
}

export async function sha256Hex(message) {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle?.digest) {
    try {
      const buf = await globalThis.crypto.subtle.digest('SHA-256', encodeUtf8Bytes(message));
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fallback to sync pure-JS implementation
    }
  }
  return sha256HexSync(message);
}

function cleanStr(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

function cleanInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function cleanDec(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function cleanBool(v) {
  if (v === true || v === 1) return true;
  const s = String(v || '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'ya';
}

function cleanIsoDate(v) {
  const s = cleanStr(v).replace(/^'+/, '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

function cleanMonthVal(v) {
  const norm = normalizePeriodKey(v);
  if (!norm) return '';
  return /^\d+$/.test(norm) ? Number(norm) : norm;
}

/**
 * Canonicalizes full backup data with fixed field order across JS & GAS
 * so SHA-256 checksums match byte-for-byte.
 */
export function normalizeBackupData(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const prof =
    src.school_profile && typeof src.school_profile === 'object' ? src.school_profile : null;

  return {
    school_profile: prof
      ? {
          app_short_name: cleanStr(prof.app_short_name || 'SIPAYROLL') || 'SIPAYROLL',
          foundation_name: cleanStr(prof.foundation_name || ''),
          school_name: cleanStr(prof.school_name || ''),
          address: cleanStr(prof.address || ''),
          contact_info: cleanStr(prof.contact_info || ''),
          city: cleanStr(prof.city || 'Bandung') || 'Bandung',
          principal_name: cleanStr(prof.principal_name || ''),
          principal_nip: cleanStr(prof.principal_nip || ''),
          treasurer_name: cleanStr(prof.treasurer_name || ''),
          treasurer_nip: cleanStr(prof.treasurer_nip || ''),
          slip_footer_note: cleanStr(prof.slip_footer_note || ''),
          logo_data_url: String(prof.logo_data_url || '/logo.png').trim(),
          google_client_id: cleanStr(prof.google_client_id || ''),
        }
      : null,
    users: (Array.isArray(src.users) ? src.users : []).map((u) => {
      const email = cleanStr(u?.email || u?.username || '').toLowerCase();
      return {
        id: cleanStr(u?.id || ''),
        username: cleanStr(u?.username || email).toLowerCase(),
        email: email,
        role: cleanStr(u?.role || 'guru').toLowerCase() || 'guru',
      };
    }),
    teachers: (Array.isArray(src.teachers) ? src.teachers : []).map((t) => ({
      id: cleanStr(t?.id || ''),
      user_id: cleanStr(t?.user_id || ''),
      nip: cleanStr(t?.nip || ''),
      name: cleanStr(t?.name || ''),
      staff_category: cleanStr(t?.staff_category || ''),
      status: cleanStr(t?.status || ''),
      bank_account: cleanStr(t?.bank_account || ''),
      email: cleanStr(t?.email || '').toLowerCase(),
      is_tu_operator: cleanBool(t?.is_tu_operator),
    })),
    salary_components: (Array.isArray(src.salary_components) ? src.salary_components : []).map(
      (c) => ({
        id: cleanStr(c?.id || ''),
        teacher_id: cleanStr(c?.teacher_id || ''),
        base_salary: Math.max(0, cleanInt(c?.base_salary)),
        hourly_rate: Math.max(0, cleanInt(c?.hourly_rate)),
        position_allowance: Math.max(0, cleanInt(c?.position_allowance)),
        bpjs_deduction:
          cleanBool(c?.infaq_zakat_enabled) || Number(c?.bpjs_deduction || 0) > 0 ? 1 : 0,
        custom_components_json: cleanStr(c?.custom_components_json || '[]') || '[]',
      })
    ),
    attendances: (Array.isArray(src.attendances) ? src.attendances : []).map((a) => ({
      id: cleanStr(a?.id || ''),
      teacher_id: cleanStr(a?.teacher_id || ''),
      month: cleanMonthVal(a?.month),
      year: cleanInt(a?.year),
      present_days: Math.max(0, cleanDec(a?.present_days)),
      absent_days: Math.max(0, cleanDec(a?.absent_days)),
      total_jtm: Math.max(0, cleanDec(a?.total_jtm)),
    })),
    attendance_logs: (Array.isArray(src.attendance_logs) ? src.attendance_logs : []).map((l) => ({
      id: cleanStr(l?.id || ''),
      teacher_id: cleanStr(l?.teacher_id || ''),
      date: cleanIsoDate(l?.date),
      month: cleanInt(l?.month),
      year: cleanInt(l?.year),
      status: cleanStr(l?.status || 'hadir').toLowerCase() || 'hadir',
      jtm_hours: Math.max(0, cleanDec(l?.jtm_hours)),
      note: cleanStr(l?.note || ''),
      created_at: cleanStr(l?.created_at || ''),
      updated_at: cleanStr(l?.updated_at || ''),
      class_name: cleanStr(l?.class_name || 'Kelas Umum') || 'Kelas Umum',
      validation_status: cleanStr(l?.validation_status || 'pending').toLowerCase() || 'pending',
      validation_note: cleanStr(l?.validation_note || ''),
      assisted_by_name: cleanStr(l?.assisted_by_name || ''),
    })),
    payrolls: (Array.isArray(src.payrolls) ? src.payrolls : []).map((p) => ({
      id: cleanStr(p?.id || ''),
      month: cleanMonthVal(p?.month),
      year: cleanInt(p?.year),
      total_budget: Math.max(0, cleanInt(p?.total_budget)),
      status: cleanStr(p?.status || 'draft').toLowerCase() || 'draft',
    })),
    payroll_details: (Array.isArray(src.payroll_details) ? src.payroll_details : []).map((d) => ({
      id: cleanStr(d?.id || ''),
      payroll_id: cleanStr(d?.payroll_id || ''),
      teacher_id: cleanStr(d?.teacher_id || ''),
      net_salary: Math.max(0, cleanInt(d?.net_salary)),
      details_json: cleanStr(d?.details_json || '{}') || '{}',
    })),
    disbursements: (Array.isArray(src.disbursements) ? src.disbursements : []).map((r) => ({
      id: cleanStr(r?.id || ''),
      teacher_id: cleanStr(r?.teacher_id || ''),
      teacher_name: cleanStr(r?.teacher_name || ''),
      nip: cleanStr(r?.nip || ''),
      month: cleanMonthVal(r?.month),
      year: cleanInt(r?.year),
      payroll_id: cleanStr(r?.payroll_id || ''),
      payroll_detail_id: cleanStr(r?.payroll_detail_id || ''),
      estimated_net_salary: Math.max(0, cleanInt(r?.estimated_net_salary)),
      request_scope: cleanStr(r?.request_scope || 'partial'),
      disbursement_timing: cleanStr(r?.disbursement_timing || 'early'),
      requested_amount: Math.max(0, cleanInt(r?.requested_amount)),
      approved_amount: Math.max(0, cleanInt(r?.approved_amount)),
      reason: cleanStr(r?.reason || ''),
      status: cleanStr(r?.status || 'pending_treasurer'),
      treasurer_note: cleanStr(r?.treasurer_note || ''),
      kepsek_note: cleanStr(r?.kepsek_note || ''),
      issued_slip_id: cleanStr(r?.issued_slip_id || ''),
      issued_slip_json: cleanStr(r?.issued_slip_json || '{}') || '{}',
      created_at: cleanStr(r?.created_at || ''),
      treasurer_reviewed_at: cleanStr(r?.treasurer_reviewed_at || ''),
      kepsek_reviewed_at: cleanStr(r?.kepsek_reviewed_at || ''),
      slip_issued_at: cleanStr(r?.slip_issued_at || ''),
      assisted_by_name: cleanStr(r?.assisted_by_name || ''),
    })),
    reimbursements: (Array.isArray(src.reimbursements) ? src.reimbursements : []).map((r) => ({
      id: cleanStr(r?.id || ''),
      teacher_id: cleanStr(r?.teacher_id || ''),
      teacher_name: cleanStr(r?.teacher_name || ''),
      nip: cleanStr(r?.nip || ''),
      expense_date: cleanIsoDate(r?.expense_date),
      month: cleanMonthVal(r?.month),
      year: cleanInt(r?.year),
      category: cleanStr(r?.category || 'lainnya'),
      title: cleanStr(r?.title || ''),
      receipt_number: cleanStr(r?.receipt_number || ''),
      receipt_url: cleanStr(r?.receipt_url || ''),
      note: cleanStr(r?.note || ''),
      amount: Math.max(0, cleanInt(r?.amount)),
      approved_amount: Math.max(
        0,
        cleanInt(
          r?.approved_amount !== '' && r?.approved_amount !== undefined && r?.approved_amount !== null
            ? r.approved_amount
            : r?.amount
        )
      ),
      status: cleanStr(r?.status || 'pending_treasurer'),
      treasurer_note: cleanStr(r?.treasurer_note || ''),
      kepsek_note: cleanStr(r?.kepsek_note || ''),
      created_at: cleanStr(r?.created_at || ''),
      updated_at: cleanStr(r?.updated_at || ''),
      treasurer_reviewed_at: cleanStr(r?.treasurer_reviewed_at || ''),
      kepsek_reviewed_at: cleanStr(r?.kepsek_reviewed_at || ''),
      assisted_by_name: cleanStr(r?.assisted_by_name || ''),
    })),
    notifications: (Array.isArray(src.notifications) ? src.notifications : []).map((n) => ({
      id: cleanStr(n?.id || ''),
      recipient_role: cleanStr(n?.recipient_role || 'admin'),
      recipient_teacher_id: cleanStr(n?.recipient_teacher_id || ''),
      recipient_email: cleanStr(n?.recipient_email || ''),
      title: cleanStr(n?.title || ''),
      message: cleanStr(n?.message || ''),
      type: cleanStr(n?.type || 'info'),
      ref_id: cleanStr(n?.ref_id || ''),
      is_read: cleanBool(n?.is_read),
      created_at: cleanStr(n?.created_at || ''),
    })),
  };
}

export function computeBackupChecksumSync(rawData) {
  return sha256HexSync(JSON.stringify(normalizeBackupData(rawData)));
}

export async function computeBackupChecksum(rawData) {
  return sha256Hex(JSON.stringify(normalizeBackupData(rawData)));
}

export function getBackupCounts(normalizedData = {}) {
  return {
    users: (normalizedData.users || []).length,
    teachers: (normalizedData.teachers || []).length,
    salary_components: (normalizedData.salary_components || []).length,
    attendances: (normalizedData.attendances || []).length,
    attendance_logs: (normalizedData.attendance_logs || []).length,
    payrolls: (normalizedData.payrolls || []).length,
    payroll_details: (normalizedData.payroll_details || []).length,
    disbursements: (normalizedData.disbursements || []).length,
    reimbursements: (normalizedData.reimbursements || []).length,
    notifications: (normalizedData.notifications || []).length,
  };
}

export async function verifyBackupFileObject(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'File JSON tidak valid.' };
  }
  if (parsed.format !== 'SIPAYROLL_BACKUP') {
    return {
      ok: false,
      error: 'Format file bukan backup resmi SIPAYROLL (`SIPAYROLL_BACKUP`).',
    };
  }
  if (Number(parsed.schema_version) !== 1) {
    return {
      ok: false,
      error: `Versi skema backup (${parsed.schema_version ?? '-'}) tidak didukung.`,
    };
  }
  if (!parsed.data || typeof parsed.data !== 'object') {
    return { ok: false, error: 'Objek data backup kosong atau rusak.' };
  }

  const normalizedData = normalizeBackupData(parsed.data);
  const expectedChecksum = await computeBackupChecksum(normalizedData);
  const providedChecksum = String(parsed.checksum_sha256 || '').trim().toLowerCase();

  if (!providedChecksum || providedChecksum !== expectedChecksum) {
    return {
      ok: false,
      error:
        'Verifikasi integritas SHA-256 gagal: file backup telah diubah atau rusak sehingga ditolak demi keamanan data.',
    };
  }

  return {
    ok: true,
    normalizedData,
    counts: getBackupCounts(normalizedData),
    checksum: expectedChecksum,
    meta: {
      exported_at: String(parsed.exported_at || ''),
      exported_by: String(parsed.exported_by || ''),
      app_version: String(parsed.app_version || ''),
      school_name:
        String(parsed.school_name || normalizedData.school_profile?.school_name || 'SIPAYROLL'),
    },
  };
}

export function buildBackupFileStamp(isoStr = '') {
  const d = isoStr ? new Date(isoStr) : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  const pad = (n) => String(n).padStart(2, '0');
  return `${safe.getFullYear()}${pad(safe.getMonth() + 1)}${pad(safe.getDate())}_${pad(
    safe.getHours()
  )}${pad(safe.getMinutes())}`;
}

export function downloadJsonBackupFile(backupObj, filePrefix = 'SIPAYROLL_Backup') {
  const stamp = buildBackupFileStamp(backupObj?.exported_at);
  const filename = `${filePrefix}_${stamp}.json`;
  const blob = new Blob([JSON.stringify(backupObj, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

function forceTextCells(worksheet, rowCount, colIndices = []) {
  for (let r = 1; r <= rowCount; r++) {
    colIndices.forEach((cIdx) => {
      const addr = `${columnLetter(cIdx)}${r + 1}`;
      if (worksheet[addr]) {
        worksheet[addr].t = 's';
        worksheet[addr].z = '@';
      }
    });
  }
}

function columnLetter(idx) {
  let col = '';
  let n = idx;
  while (n >= 0) {
    col = String.fromCharCode((n % 26) + 65) + col;
    n = Math.floor(n / 26) - 1;
  }
  return col;
}

export async function downloadExcelBackupWorkbook(backupObj) {
  const XLSX = await import('xlsx');
  const norm = normalizeBackupData(backupObj?.data || {});
  const counts = getBackupCounts(norm);
  const stamp = buildBackupFileStamp(backupObj?.exported_at);
  const filename = `SIPAYROLL_Arsip_Laporan_${stamp}.xlsx`;

  const teacherById = new Map(norm.teachers.map((t) => [t.id, t]));
  const compByTeacherId = new Map(norm.salary_components.map((c) => [c.teacher_id, c]));
  const payrollById = new Map(norm.payrolls.map((p) => [p.id, p]));

  const wb = XLSX.utils.book_new();

  // 1. Ringkasan Backup
  const summaryRows = [
    ['ARSIP LAPORAN & CADANGAN DATA SIPAYROLL', ''],
    ['Nama Sekolah / Yayasan', norm.school_profile?.school_name || backupObj?.school_name || '-'],
    ['Waktu Ekspor', backupObj?.exported_at || new Date().toISOString()],
    ['Diekspor Oleh', backupObj?.exported_by || 'Admin / Bendahara'],
    ['Versi Sistem', backupObj?.app_version || 'SIPAYROLL'],
    ['Checksum SHA-256', backupObj?.checksum_sha256 || computeBackupChecksumSync(norm)],
    ['', ''],
    ['Tabel Data', 'Jumlah Baris'],
    ['Akun Terdaftar (Users)', counts.users],
    ['Master PTK', counts.teachers],
    ['Komponen Gaji', counts.salary_components],
    ['Rekap Kehadiran Bulanan', counts.attendances],
    ['Log Kehadiran Per-Kelas', counts.attendance_logs],
    ['Periode Penggajian (Payroll)', counts.payrolls],
    ['Rincian Slip Gaji', counts.payroll_details],
    ['Pengajuan Pencairan PTK', counts.disbursements],
    ['Belanja Keperluan Sekolah', counts.reimbursements],
    ['Notifikasi Aplikasi', counts.notifications],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 34 }, { wch: 68 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan_Backup');

  // 2. Master PTK & Gaji
  const ptkHeader = [
    'NIP / NIY',
    'Nama Lengkap',
    'Kategori PTK',
    'Jabatan / Status',
    'Akun Google',
    'TU Pendamping PTK',
    'Bank & Rekening',
    'Gaji Pokok (Rp)',
    'Tarif / JTM (Rp)',
    'Tunjangan Jabatan (Rp)',
    'Infaq 2,5%',
    'Komponen Custom JSON',
  ];
  const ptkRows = norm.teachers.map((t) => {
    const c = compByTeacherId.get(t.id) || {};
    return [
      t.nip,
      t.name,
      t.staff_category === 'kependidikan' ? 'Tenaga Kependidikan' : 'Tenaga Pendidik',
      t.status,
      t.email || '-',
      t.is_tu_operator ? 'YA' : 'TIDAK',
      t.bank_account,
      Number(c.base_salary || 0),
      Number(c.hourly_rate || 0),
      Number(c.position_allowance || 0),
      Number(c.bpjs_deduction || 0) > 0 ? 'Aktif' : 'Tidak Aktif',
      c.custom_components_json || '[]',
    ];
  });
  const wsPtk = XLSX.utils.aoa_to_sheet([ptkHeader, ...ptkRows]);
  forceTextCells(wsPtk, ptkRows.length, [0, 6]);
  wsPtk['!cols'] = [
    { wch: 20 }, { wch: 28 }, { wch: 20 }, { wch: 28 }, { wch: 26 },
    { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 15 }, { wch: 18 }, { wch: 12 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, wsPtk, 'Master_PTK_Gaji');

  // 3. Rekap Kehadiran
  const attHeader = [
    'NIP / NIY',
    'Nama PTK',
    'Periode Bulan',
    'Tahun',
    'Nilai Hari Hadir',
    'Tidak Hadir',
    'Total JTM',
  ];
  const attRows = norm.attendances.map((a) => {
    const t = teacherById.get(a.teacher_id);
    return [
      t?.nip || '-',
      t?.name || a.teacher_id,
      getMonthName(a.month),
      a.year,
      formatAttendanceNumber(a.present_days),
      formatAttendanceNumber(a.absent_days),
      formatAttendanceNumber(a.total_jtm),
    ];
  });
  const wsAtt = XLSX.utils.aoa_to_sheet([attHeader, ...attRows]);
  forceTextCells(wsAtt, attRows.length, [0]);
  wsAtt['!cols'] = [
    { wch: 20 }, { wch: 28 }, { wch: 20 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAtt, 'Rekap_Kehadiran');

  // 4. Log Kehadiran Harian
  const logHeader = [
    'Tanggal',
    'NIP / NIY',
    'Nama PTK',
    'Kelas',
    'Kondisi',
    'JTM',
    'Status Validasi',
    'Diinput oleh TU',
    'Catatan',
    'Catatan Validasi',
  ];
  const logRows = norm.attendance_logs.map((l) => {
    const t = teacherById.get(l.teacher_id);
    return [
      l.date,
      t?.nip || '-',
      t?.name || l.teacher_id,
      l.class_name,
      getAttendanceConditionMeta(l.status).label,
      Number(l.jtm_hours || 0),
      getLogValidationMeta(l.validation_status).label,
      l.assisted_by_name || '-',
      l.note || '-',
      l.validation_note || '-',
    ];
  });
  const wsLogs = XLSX.utils.aoa_to_sheet([logHeader, ...logRows]);
  forceTextCells(wsLogs, logRows.length, [0, 1]);
  wsLogs['!cols'] = [
    { wch: 14 }, { wch: 20 }, { wch: 26 }, { wch: 18 }, { wch: 14 },
    { wch: 10 }, { wch: 18 }, { wch: 22 }, { wch: 28 }, { wch: 26 },
  ];
  XLSX.utils.book_append_sheet(wb, wsLogs, 'Log_Kehadiran_Harian');

  // 5. Periode Payroll
  const prHeader = ['Periode Bulan', 'Tahun', 'Status', 'Total Anggaran (Rp)', 'Format Rupiah'];
  const prRows = norm.payrolls.map((p) => [
    getMonthName(p.month),
    p.year,
    String(p.status || '').toUpperCase(),
    Number(p.total_budget || 0),
    formatRupiah(p.total_budget || 0),
  ]);
  const wsPayrolls = XLSX.utils.aoa_to_sheet([prHeader, ...prRows]);
  wsPayrolls['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 16 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsPayrolls, 'Periode_Payroll');

  // 6. Rincian Slip Gaji
  const detHeader = [
    'Periode',
    'Tahun',
    'Status Payroll',
    'NIP / NIY',
    'Nama PTK',
    'Gaji Pokok (Rp)',
    'Honor JTM (Rp)',
    'Tj. Jabatan (Rp)',
    'Infaq 2,5% (Rp)',
    'Belanja Sekolah Non-Infaq (Rp)',
    'Pencairan Awal (Rp)',
    'Gaji Bersih / Sisa (Rp)',
  ];
  const detRows = norm.payroll_details.map((d) => {
    const p = payrollById.get(d.payroll_id);
    const t = teacherById.get(d.teacher_id);
    let parsed = {};
    try {
      parsed = JSON.parse(d.details_json || '{}');
    } catch {
      parsed = {};
    }
    return [
      getMonthName(parsed.month ?? p?.month ?? ''),
      parsed.year || p?.year || '-',
      String(p?.status || '').toUpperCase(),
      parsed.nip || t?.nip || '-',
      parsed.teacher_name || t?.name || d.teacher_id,
      Number(parsed.base_salary || 0),
      Number(parsed.jtm_honor || 0),
      Number(parsed.position_allowance || 0),
      Number(parsed.infaq_zakat ?? parsed.bpjs_deduction ?? 0),
      Number(parsed.reimbursement_total || 0),
      Number(parsed.approved_disbursement_total || 0),
      Number(d.net_salary || 0),
    ];
  });
  const wsDetails = XLSX.utils.aoa_to_sheet([detHeader, ...detRows]);
  forceTextCells(wsDetails, detRows.length, [3]);
  wsDetails['!cols'] = [
    { wch: 20 }, { wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 26 },
    { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDetails, 'Rincian_Slip_Gaji');

  // 7. Pengajuan Pencairan PTK
  const disbHeader = [
    'Waktu Pengajuan',
    'NIP / NIY',
    'Nama PTK',
    'Periode',
    'Tahun',
    'Cakupan',
    'Jadwal',
    'Nominal Diajukan (Rp)',
    'Nominal Disetujui (Rp)',
    'Status',
    'Diinput oleh TU',
    'Alasan PTK',
    'Catatan Bendahara',
    'Catatan Kepsek',
  ];
  const disbRows = norm.disbursements.map((r) => [
    r.created_at,
    r.nip,
    r.teacher_name,
    getMonthName(r.month),
    r.year,
    getDisbursementScopeMeta(r.request_scope).shortLabel,
    getDisbursementTimingMeta(r.disbursement_timing).shortLabel,
    Number(r.requested_amount || 0),
    Number(r.approved_amount || 0),
    getDisbursementStatusMeta(r.status).label,
    r.assisted_by_name || '-',
    r.reason || '-',
    r.treasurer_note || '-',
    r.kepsek_note || '-',
  ]);
  const wsDisb = XLSX.utils.aoa_to_sheet([disbHeader, ...disbRows]);
  forceTextCells(wsDisb, disbRows.length, [1]);
  wsDisb['!cols'] = [
    { wch: 24 }, { wch: 20 }, { wch: 26 }, { wch: 18 }, { wch: 10 },
    { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 24 },
    { wch: 22 }, { wch: 26 }, { wch: 24 }, { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDisb, 'Pengajuan_Pencairan');

  // 8. Belanja Sekolah (PTK & Rutin Bendahara)
  const reimbHeader = [
    'Tanggal Belanja',
    'Jenis',
    'NIP / Penginput',
    'Nama PTK / Pelaku',
    'Periode Slip',
    'Tahun',
    'Kategori',
    'Uraian Barang / Jasa',
    'No. Nota',
    'Nominal Diajukan (Rp)',
    'Nominal Disetujui (Rp)',
    'Status',
    'Diinput oleh TU',
    'Tautan Bukti',
    'Keterangan',
  ];
  const reimbRows = norm.reimbursements.map((r) => {
    const isRoutine = isAdminRoutineReimbursement(r);
    const stMeta = isRoutine
      ? getAdminRoutineStatusMeta(r.status)
      : getReimbursementStatusMeta(r.status);
    return [
      r.expense_date,
      isRoutine ? 'Rutin Bendahara' : 'Belanja PTK',
      r.nip,
      r.teacher_name,
      getMonthName(r.month),
      r.year,
      getReimbursementCategoryMeta(r.category).label,
      r.title,
      r.receipt_number || '-',
      Number(r.amount || 0),
      Number(r.approved_amount ?? r.amount ?? 0),
      stMeta.label,
      r.assisted_by_name || '-',
      r.receipt_url || '-',
      r.note || '-',
    ];
  });
  const wsReimb = XLSX.utils.aoa_to_sheet([reimbHeader, ...reimbRows]);
  forceTextCells(wsReimb, reimbRows.length, [0, 2, 8]);
  wsReimb['!cols'] = [
    { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 24 }, { wch: 18 },
    { wch: 10 }, { wch: 20 }, { wch: 30 }, { wch: 16 }, { wch: 18 },
    { wch: 18 }, { wch: 24 }, { wch: 22 }, { wch: 34 }, { wch: 26 },
  ];
  XLSX.utils.book_append_sheet(wb, wsReimb, 'Belanja_Sekolah');

  XLSX.writeFile(wb, filename);
  return filename;
}
