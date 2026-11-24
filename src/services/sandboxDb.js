/**
 * Local Sandbox Database Mirror (Simulates Google Sheets 6-Tab Schema + Object-Level RBAC)
 * Used ONLY when no live Google Apps Script Web App URL (`VITE_GAS_API_URL`) is configured yet.
 * Strictly mirrors `v1_GasBackend_Init.js`:
 * - UUID v4 Primary Keys for all 6 tables
 * - Users_Auth stores salted SHA-256 hashes (no plaintext passwords stored in tables)
 * - Enforces Object-Level RBAC (403 Forbidden / 404 Not Found on unauthorized access)
 */

import {
  calculateInfaqZakat,
  isInfaqZakatEnabled,
  normalizePeriodKey,
  parsePeriodMonthKey,
  resolveStaffCategory,
} from '../utils/formatters';
import {
  computeAttendanceBreakdownFromLogs,
  getTodayIsoDate,
  normalizeAttendanceStatus,
  normalizeLogValidationStatus,
  roundAttendanceMetric,
} from '../utils/attendanceHelpers';

const STORAGE_KEY = 'sipayroll_sheets_sandbox_v1';
const ADMIN_ROUTINE_TEACHER_ID = 'ADMIN_ROUTINE';

// Deterministic UUIDv4 seeds for relational integrity across the 6 tabs
const SEED_IDS = {
  userAdmin: '11111111-2222-4333-8444-555555550001',
  userKepsek: '11111111-2222-4333-8444-555555550002',
  userGuru1: '11111111-2222-4333-8444-555555550003',
  userGuru2: '11111111-2222-4333-8444-555555550004',
  userGuru3: '11111111-2222-4333-8444-555555550005',

  teacher1: '22222222-3333-4444-8555-666666660001',
  teacher2: '22222222-3333-4444-8555-666666660002',
  teacher3: '22222222-3333-4444-8555-666666660003',

  payrollOct: '55555555-6666-4777-8888-999999990001',
  payrollNov: '55555555-6666-4777-8888-999999990002',
};

function generateUuidV4() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function sha256Hex(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function buildInitialDatabase() {
  const Users_Auth = [
    {
      id: SEED_IDS.userAdmin,
      username: 'admin.sekolah@gmail.com',
      email: 'admin.sekolah@gmail.com',
      password_hash: 'GMAIL_AUTH',
      role: 'admin',
    },
    {
      id: SEED_IDS.userKepsek,
      username: 'kepsek.sekolah@gmail.com',
      email: 'kepsek.sekolah@gmail.com',
      password_hash: 'GMAIL_AUTH',
      role: 'kepsek',
    },
    {
      id: SEED_IDS.userGuru1,
      username: 'budi.santoso@gmail.com',
      email: 'budi.santoso@gmail.com',
      password_hash: 'GMAIL_AUTH',
      role: 'guru',
    },
    {
      id: SEED_IDS.userGuru2,
      username: 'siti.aisyah@gmail.com',
      email: 'siti.aisyah@gmail.com',
      password_hash: 'GMAIL_AUTH',
      role: 'guru',
    },
    {
      id: SEED_IDS.userGuru3,
      username: 'rizky.pratama@gmail.com',
      email: 'rizky.pratama@gmail.com',
      password_hash: 'GMAIL_AUTH',
      role: 'guru',
    },
  ];

  const Teachers = [
    {
      id: SEED_IDS.teacher1,
      user_id: SEED_IDS.userGuru1,
      nip: '19880412201501',
      name: 'Budi Santoso, S.Pd., M.Pd.',
      staff_category: 'pendidik',
      status: 'GTY (Guru Tetap Yayasan)',
      bank_account: 'BSI 7149283741',
      email: 'budi.santoso@gmail.com',
    },
    {
      id: SEED_IDS.teacher2,
      user_id: SEED_IDS.userGuru2,
      nip: '19910823201802',
      name: 'Siti Aisyah, S.Si.',
      staff_category: 'pendidik',
      status: 'GTY (Guru Tetap Yayasan)',
      bank_account: 'BSI 7283910492',
      email: 'siti.aisyah@gmail.com',
    },
    {
      id: SEED_IDS.teacher3,
      user_id: SEED_IDS.userGuru3,
      nip: '19951104202101',
      name: 'Rizky Pratama, S.Kom.',
      staff_category: 'kependidikan',
      status: 'Laboran & Teknisi Sumber Belajar',
      bank_account: 'Mandiri 137001928371',
      email: 'rizky.pratama@gmail.com',
    },
  ];

  const Salary_Components = [
    {
      id: generateUuidV4(),
      teacher_id: SEED_IDS.teacher1,
      base_salary: 3500000,
      hourly_rate: 55000,
      position_allowance: 750000,
      infaq_zakat_enabled: true,
      bpjs_deduction: 1,
    },
    {
      id: generateUuidV4(),
      teacher_id: SEED_IDS.teacher2,
      base_salary: 3200000,
      hourly_rate: 50000,
      position_allowance: 500000,
      infaq_zakat_enabled: true,
      bpjs_deduction: 1,
    },
    {
      id: generateUuidV4(),
      teacher_id: SEED_IDS.teacher3,
      base_salary: 2200000,
      hourly_rate: 45000,
      position_allowance: 300000,
      infaq_zakat_enabled: false,
      bpjs_deduction: 0,
    },
  ];

  const Attendances = [
    // October 2026
    {
      id: generateUuidV4(),
      teacher_id: SEED_IDS.teacher1,
      month: 10,
      year: 2026,
      present_days: 22,
      absent_days: 0,
      total_jtm: 28,
    },
    {
      id: generateUuidV4(),
      teacher_id: SEED_IDS.teacher2,
      month: 10,
      year: 2026,
      present_days: 21,
      absent_days: 1,
      total_jtm: 24,
    },
    {
      id: generateUuidV4(),
      teacher_id: SEED_IDS.teacher3,
      month: 10,
      year: 2026,
      present_days: 20,
      absent_days: 0,
      total_jtm: 20,
    },
    // November 2026
    {
      id: generateUuidV4(),
      teacher_id: SEED_IDS.teacher1,
      month: 11,
      year: 2026,
      present_days: 4.5,
      absent_days: 1,
      total_jtm: 16,
    },
    {
      id: generateUuidV4(),
      teacher_id: SEED_IDS.teacher2,
      month: 11,
      year: 2026,
      present_days: 22,
      absent_days: 0,
      total_jtm: 26,
    },
    {
      id: generateUuidV4(),
      teacher_id: SEED_IDS.teacher3,
      month: 11,
      year: 2026,
      present_days: 19,
      absent_days: 1,
      total_jtm: 18,
    },
  ];

  const Attendance_Logs = [
    {
      id: generateUuidV4(),
      teacher_id: SEED_IDS.teacher1,
      date: '2026-11-11',
      class_name: 'Kelas VII A',
      month: 11,
      year: 2026,
      status: 'hadir',
      jtm_hours: 3,
      note: 'Matematika Aljabar',
      created_at: '2026-11-11T08:00:00.000Z',
      updated_at: '2026-11-11T08:00:00.000Z',
    },
    {
      id: generateUuidV4(),
      teacher_id: SEED_IDS.teacher1,
      date: '2026-11-11',
      class_name: 'Kelas VII B',
      month: 11,
      year: 2026,
      status: 'hadir',
      jtm_hours: 3,
      note: 'Matematika Aljabar',
      created_at: '2026-11-11T10:00:00.000Z',
      updated_at: '2026-11-11T10:00:00.000Z',
    },
    {
      id: generateUuidV4(),
      teacher_id: SEED_IDS.teacher1,
      date: '2026-11-12',
      class_name: 'Kelas VII A',
      month: 11,
      year: 2026,
      status: 'hadir',
      jtm_hours: 6,
      note: 'Latihan Soal & Pembahasan',
      created_at: '2026-11-12T08:00:00.000Z',
      updated_at: '2026-11-12T08:00:00.000Z',
    },
    {
      id: generateUuidV4(),
      teacher_id: SEED_IDS.teacher1,
      date: '2026-11-13',
      class_name: 'Kelas VII B',
      month: 11,
      year: 2026,
      status: 'tugas',
      jtm_hours: 0,
      note: 'Tugas Rapat MGMP Kabupaten',
      created_at: '2026-11-13T09:30:00.000Z',
      updated_at: '2026-11-13T09:30:00.000Z',
    },
    {
      id: generateUuidV4(),
      teacher_id: SEED_IDS.teacher1,
      date: '2026-11-14',
      class_name: 'Kelas VII A',
      month: 11,
      year: 2026,
      status: 'izin',
      jtm_hours: 0,
      note: 'Izin keperluan keluarga',
      created_at: '2026-11-14T07:15:00.000Z',
      updated_at: '2026-11-14T07:15:00.000Z',
    },
    {
      id: generateUuidV4(),
      teacher_id: SEED_IDS.teacher1,
      date: '2026-11-15',
      class_name: 'Kelas VIII A',
      month: 11,
      year: 2026,
      status: 'hadir',
      jtm_hours: 4,
      note: 'Pengayaan Geometri',
      created_at: '2026-11-15T08:00:00.000Z',
      updated_at: '2026-11-15T08:00:00.000Z',
    },
  ];

  // Helper to construct Payroll_Details rows
  const makeDetail = (payrollId, teacher, comp, att) => {
    const jtmHonor = att.total_jtm * comp.hourly_rate;
    let customComponents = [];
    try {
      customComponents = JSON.parse(comp.custom_components_json || '[]');
      if (!Array.isArray(customComponents)) customComponents = [];
    } catch {
      customComponents = [];
    }
    const customAllowanceTotal = customComponents
      .filter((c) => c.type === 'allowance')
      .reduce((s, c) => s + Number(c.amount || 0), 0);
    const customDeductionTotal = customComponents
      .filter((c) => c.type !== 'allowance')
      .reduce((s, c) => s + Number(c.amount || 0), 0);
    const gross =
      comp.base_salary + jtmHonor + comp.position_allowance + customAllowanceTotal;
    const infaqEnabled = isInfaqZakatEnabled(comp);
    const infaqZakat = calculateInfaqZakat(
      comp.base_salary,
      jtmHonor,
      comp.position_allowance,
      infaqEnabled,
      customAllowanceTotal
    );
    const net = Math.max(0, gross - infaqZakat - customDeductionTotal);
    return {
      id: generateUuidV4(),
      payroll_id: payrollId,
      teacher_id: teacher.id,
      net_salary: net,
      details_json: JSON.stringify({
        teacher_name: teacher.name,
        nip: teacher.nip,
        staff_category: resolveStaffCategory(teacher),
        status: teacher.status,
        bank_account: teacher.bank_account,
        month: att.month,
        year: att.year,
        present_days: att.present_days,
        absent_days: att.absent_days,
        total_jtm: att.total_jtm,
        base_salary: comp.base_salary,
        hourly_rate: comp.hourly_rate,
        jtm_honor: jtmHonor,
        position_allowance: comp.position_allowance,
        infaq_zakat_enabled: infaqEnabled,
        infaq_zakat: infaqZakat,
        bpjs_deduction: infaqZakat,
        gross_salary: gross,
        net_salary: net,
      }),
    };
  };

  const octDetails = Teachers.map((t, idx) =>
    makeDetail(SEED_IDS.payrollOct, t, Salary_Components[idx], Attendances[idx])
  );
  const novDetails = Teachers.map((t, idx) =>
    makeDetail(SEED_IDS.payrollNov, t, Salary_Components[idx], Attendances[idx + 3])
  );

  const Payrolls = [
    {
      id: SEED_IDS.payrollOct,
      month: 10,
      year: 2026,
      total_budget: octDetails.reduce((acc, d) => acc + d.net_salary, 0),
      status: 'paid',
    },
    {
      id: SEED_IDS.payrollNov,
      month: 11,
      year: 2026,
      total_budget: novDetails.reduce((acc, d) => acc + d.net_salary, 0),
      status: 'draft',
    },
  ];

  const Payroll_Details = [...octDetails, ...novDetails];
  const Disbursement_Requests = [];
  const Reimbursements = [];
  const Notifications = [];

  return {
    Users_Auth,
    Teachers,
    Salary_Components,
    Attendances,
    Attendance_Logs,
    Payrolls,
    Payroll_Details,
    Disbursement_Requests,
    Reimbursements,
    Notifications,
  };
}

function upgradeLegacyDbToGmail(db) {
  if (!db || !Array.isArray(db.Users_Auth)) return db;
  let modified = false;

  if (!Array.isArray(db.Disbursement_Requests)) {
    db.Disbursement_Requests = [];
    modified = true;
  }
  if (!Array.isArray(db.Reimbursements)) {
    db.Reimbursements = [];
    modified = true;
  }
  if (!Array.isArray(db.Notifications)) {
    db.Notifications = [];
    modified = true;
  }

  if (!Array.isArray(db.Attendance_Logs)) {
    db.Attendance_Logs = [];
    modified = true;
  } else {
    db.Attendance_Logs.forEach((l) => {
      if (!l.class_name) {
        l.class_name = 'Kelas Umum';
        modified = true;
      }
    });
  }

  const legacyMap = {
    admin: 'admin.sekolah@gmail.com',
    kepsek: 'kepsek.sekolah@gmail.com',
  };

  db.Users_Auth.forEach((u) => {
    const rawUser = String(u.email || u.username || '').trim().toLowerCase();
    if (legacyMap[rawUser]) {
      u.username = legacyMap[rawUser];
      u.email = legacyMap[rawUser];
      modified = true;
    } else if (rawUser && !rawUser.includes('@')) {
      u.username = `${rawUser}@gmail.com`;
      u.email = `${rawUser}@gmail.com`;
      modified = true;
    } else if (!u.email && u.username) {
      u.email = u.username.toLowerCase();
      modified = true;
    }
  });

  if (Array.isArray(db.Teachers)) {
    db.Teachers.forEach((t) => {
      if (!t.staff_category) {
        t.staff_category = resolveStaffCategory(t);
        modified = true;
      }
      if (!t.email) {
        const linkedUser = db.Users_Auth.find((u) => u.id === t.user_id);
        if (linkedUser) {
          t.email = String(linkedUser.email || linkedUser.username || '').toLowerCase();
          modified = true;
        }
      }
    });
  }

  if (modified) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }
  return db;
}

async function getDb() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return upgradeLegacyDbToGmail(parsed);
    } catch {
      // Fall through to rebuild
    }
  }
  const fresh = await buildInitialDatabase();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

function saveDb(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export async function resetSandboxDb() {
  localStorage.removeItem(STORAGE_KEY);
  return getDb();
}

function findWhitelistedUserByUsername(db, rawEmail) {
  const cleanEmail = String(rawEmail || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) return null;

  return (
    (db.Users_Auth || []).find(
      (u) => String(u.username || '').trim().toLowerCase() === cleanEmail
    ) || null
  );
}

/**
 * Verifies Google OAuth2 JWT ID Token or Access Token,
 * or Simulation Quick Demo Login (subject to Users_Auth.username whitelist).
 */
async function verifyGoogleOAuthPayload(payload, db) {
  const configuredClientId = String(db?.School_Profile?.google_client_id || '').trim();

  // 1. Google Identity Services ID Token (JWT)
  if (payload.id_token && typeof payload.id_token === 'string') {
    const parts = payload.id_token.split('.');
    if (parts.length >= 2) {
      try {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
        const decodedJson = decodeURIComponent(
          Array.prototype.map
            .call(atob(padded), (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const claims = JSON.parse(decodedJson);
        if (claims && claims.email && claims.email_verified !== false) {
          if (configuredClientId && String(claims.aud || '').trim() !== configuredClientId) {
            return {
              error: 'Konfigurasi layanan masuk Google tidak sesuai. Silakan hubungi Admin Sekolah.',
            };
          }
          return {
            email: String(claims.email).trim().toLowerCase(),
            name: claims.name || '',
            picture: claims.picture || '',
            email_verified: true,
          };
        }
      } catch {
        // Fall through
      }
    }
    return { error: 'Sesi masuk Google tidak valid atau telah kedaluwarsa. Silakan coba lagi.' };
  }

  // 2. Google OAuth2 Access Token
  if (payload.access_token && typeof payload.access_token === 'string') {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${payload.access_token}` },
      });
      if (res.ok) {
        const info = await res.json();
        if (info && info.email && info.email_verified !== false) {
          return {
            email: String(info.email).trim().toLowerCase(),
            name: info.name || '',
            picture: info.picture || '',
            email_verified: true,
          };
        }
      }
    } catch {
      // Fall through
    }
    return { error: 'Gagal memverifikasi token akses Akun Google Anda.' };
  }

  // 3. Sandbox Demo Quick Login (hanya berlaku di Mode Simulasi)
  if (payload.demo_quick_login === true) {
    const demoEmail = String(payload.email || '').trim().toLowerCase();
    if (demoEmail && demoEmail.includes('@')) {
      return {
        email: demoEmail,
        name: String(payload.name || '').trim(),
        picture: '',
        email_verified: true,
      };
    }
  }

  return null;
}

/**
 * Executes a request against the local Google Sheets Sandbox with strict Object-Level RBAC.
 */
export async function executeSandboxRequest(method, action, token, payload = {}) {
  const db = await getDb();

  // 1a. OTP login endpoint retired in v19
  if (action === 'auth.requestOtp' && method === 'POST') {
    return {
      ok: false,
      status: 410,
      error: 'Metode masuk dengan kode email sudah tidak digunakan. Silakan masuk menggunakan Akun Google.',
    };
  }

  // 1b. Google OAuth Login (Strict Whitelist against Users_Auth.username)
  if (action === 'auth.login' && method === 'POST') {
    const oauthProfile = await verifyGoogleOAuthPayload(payload, db);
    if (!oauthProfile || oauthProfile.error || !oauthProfile.email) {
      return {
        ok: false,
        status: 401,
        error:
          (oauthProfile && oauthProfile.error) ||
          'Silakan masuk menggunakan tombol Akun Google resmi.',
      };
    }

    const rawEmail = oauthProfile.email;
    const user = findWhitelistedUserByUsername(db, rawEmail);

    if (!user) {
      return {
        ok: false,
        status: 403,
        error: `Akses Ditolak: Akun Google "${rawEmail}" belum terdaftar sebagai pengguna resmi portal. Silakan hubungi Admin Sekolah untuk mendaftarkan email Anda.`,
      };
    }

    const linkedTeacher =
      user.role === 'guru'
        ? db.Teachers.find(
            (t) =>
              t.user_id === user.id ||
              String(t.email || '').trim().toLowerCase() === rawEmail
          ) || null
        : null;

    const displayName =
      linkedTeacher?.name ||
      oauthProfile.name ||
      (user.role === 'admin'
        ? 'Admin / Bendahara'
        : user.role === 'kepsek'
        ? 'Kepala Sekolah'
        : rawEmail);

    const sessionPayload = {
      userId: user.id,
      username: rawEmail,
      email: rawEmail,
      role: user.role,
      teacherId: linkedTeacher ? linkedTeacher.id : null,
      teacherName: displayName,
      picture: oauthProfile.picture || '',
      exp: Math.floor(Date.now() / 1000) + 3600 * 8,
    };

    const encodedToken = btoa(JSON.stringify(sessionPayload)) + '.sandbox_sig';
    return {
      ok: true,
      status: 200,
      version: 'v22_SchoolExpenseReimbursement (Sandbox)',
      data: {
        token: encodedToken,
        expiresAt: sessionPayload.exp * 1000,
        user: {
          id: sessionPayload.userId,
          username: sessionPayload.username,
          email: sessionPayload.email,
          role: sessionPayload.role,
          teacherId: sessionPayload.teacherId,
          name: sessionPayload.teacherName,
          picture: sessionPayload.picture,
        },
      },
    };
  }

  if (action === 'schoolProfile.get') {
    return {
      ok: true,
      status: 200,
      data: db.School_Profile || null,
    };
  }

  // 2. Verify Session Token
  if (!token || !token.includes('.')) {
    return { ok: false, status: 401, error: 'Unauthorized: Sesi berakhir atau tidak valid.' };
  }

  let session;
  try {
    session = JSON.parse(atob(token.split('.')[0]));
    if (session.exp * 1000 < Date.now()) {
      return { ok: false, status: 401, error: 'Unauthorized: Token sesi telah kedaluwarsa.' };
    }
  } catch {
    return { ok: false, status: 401, error: 'Unauthorized: Token korup.' };
  }

  const forbidden = () => ({
    ok: false,
    status: 403,
    error: '403 Forbidden: Pelanggaran Object-Level RBAC.',
  });
  const notFound = () => ({
    ok: false,
    status: 404,
    error: '404 Not Found: Resource tidak ditemukan.',
  });

  // Helper for Guru Object-Level Ownership
  const getOwnedTeacher = () => {
    const foundById = db.Teachers.find((t) => t.user_id === session.userId);
    if (foundById) return foundById;
    const sessEmail = String(session.email || session.username || '').toLowerCase();
    return sessEmail
      ? db.Teachers.find((t) => String(t.email || '').toLowerCase() === sessEmail) || null
      : null;
  };

  const doesDisbursementMatchPeriod = (disbMonth, disbYear, targetMonthKey, targetYear) => {
    if (Number(disbYear) !== Number(targetYear)) return false;
    const dKey = normalizePeriodKey(disbMonth);
    const tKey = normalizePeriodKey(targetMonthKey);
    if (!dKey || !tKey) return false;
    if (dKey === tKey) return true;
    const parsedTarget = parsePeriodMonthKey(tKey);
    if (!parsedTarget.isRange) return false;
    const parsedDisb = parsePeriodMonthKey(dKey);
    return parsedDisb.monthsInRange.every((m) => parsedTarget.monthsInRange.includes(m));
  };

  const getApprovedDisbursementSummaryForPeriod = (
    allDisbursements,
    teacherId,
    targetMonthKey,
    targetYear
  ) => {
    let total = 0;
    let count = 0;
    (allDisbursements || []).forEach((r) => {
      if (
        String(r.teacher_id) === String(teacherId) &&
        String(r.status) === 'approved' &&
        doesDisbursementMatchPeriod(r.month, r.year, targetMonthKey, targetYear)
      ) {
        total += Math.max(0, Number(r.approved_amount ?? r.requested_amount ?? 0));
        count += 1;
      }
    });
    return { total: Math.round(total), count };
  };

  const sanitizeReceiptUrl = (raw) => {
    const trimmed = String(raw || '').trim().slice(0, 500);
    if (!trimmed) return { ok: true, value: '' };
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return {
          ok: false,
          error: 'Tautan bukti nota hanya boleh menggunakan protokol http:// atau https://.',
        };
      }
      return { ok: true, value: parsed.toString() };
    } catch {
      return { ok: false, error: 'Format tautan bukti nota tidak valid.' };
    }
  };

  const isTargetPayrollPeriodLocked = (monthVal, yearVal) => {
    const targetParsed = parsePeriodMonthKey(monthVal);
    const yr = Number(yearVal);
    if (!targetParsed.key || !yr) return false;
    return (db.Payrolls || []).some((p) => {
      if (Number(p.year) !== yr || String(p.status) === 'draft') return false;
      const pParsed = parsePeriodMonthKey(p.month);
      if (pParsed.key === targetParsed.key) return true;
      return targetParsed.monthsInRange.some((m) => pParsed.monthsInRange.includes(m));
    });
  };

  const getApprovedReimbursementSummaryForPeriod = (
    allReimbursements,
    teacherId,
    targetMonthKey,
    targetYear
  ) => {
    let total = 0;
    let count = 0;
    const items = [];
    (allReimbursements || []).forEach((r) => {
      if (
        String(r.teacher_id) === String(teacherId) &&
        String(r.status) === 'approved' &&
        doesDisbursementMatchPeriod(r.month, r.year, targetMonthKey, targetYear)
      ) {
        const amt = Math.round(Math.max(0, Number(r.approved_amount ?? r.amount ?? 0)));
        if (amt > 0) {
          total += amt;
          count += 1;
          items.push({
            id: r.id,
            expense_date: r.expense_date || '',
            title: r.title || '',
            category: r.category || 'lainnya',
            amount: amt,
          });
        }
      }
    });
    return { total: Math.round(total), count, items };
  };

  const applyLiveDisbursementToDraftDetail = (
    detailRow,
    parentPayroll,
    allDisbursements,
    allReimbursements = db.Reimbursements || []
  ) => {
    let detailsObj = {};
    try {
      detailsObj = JSON.parse(detailRow.details_json || '{}');
    } catch {
      detailsObj = {};
    }
    if (!parentPayroll || String(parentPayroll.status) !== 'draft') {
      return {
        net_salary: Number(detailRow.net_salary || 0),
        details_json: detailRow.details_json || '{}',
        detailsObj,
        adjusted: false,
      };
    }

    const storedNet = Number(detailRow.net_salary || 0);
    const storedReimbTotal = Math.max(0, Number(detailsObj.reimbursement_total || 0));
    const prevApproved = Number(detailsObj.approved_disbursement_total || 0);
    const baseNetBeforeDisb =
      detailsObj.net_salary_before_disbursement !== undefined &&
      detailsObj.net_salary_before_disbursement !== ''
        ? Math.max(0, Number(detailsObj.net_salary_before_disbursement))
        : Math.max(0, storedNet + prevApproved);
    const salaryNetOnly = Math.max(0, baseNetBeforeDisb - storedReimbTotal);

    const reimbSummary = getApprovedReimbursementSummaryForPeriod(
      allReimbursements,
      detailRow.teacher_id,
      parentPayroll.month,
      parentPayroll.year
    );
    const fullNetBefore = salaryNetOnly + reimbSummary.total;

    const approvedSummary = getApprovedDisbursementSummaryForPeriod(
      allDisbursements,
      detailRow.teacher_id,
      parentPayroll.month,
      parentPayroll.year
    );

    const liveNet = Math.max(0, fullNetBefore - approvedSummary.total);
    const prevCount = Number(detailsObj.approved_disbursement_count || 0);
    const prevReimbCount = Number(detailsObj.reimbursement_count || 0);
    if (
      liveNet === storedNet &&
      reimbSummary.total === storedReimbTotal &&
      reimbSummary.count === prevReimbCount &&
      approvedSummary.total === prevApproved &&
      approvedSummary.count === prevCount &&
      detailsObj.net_salary_before_disbursement !== undefined
    ) {
      return {
        net_salary: storedNet,
        details_json: detailRow.details_json || '{}',
        detailsObj,
        adjusted: false,
      };
    }

    const updatedDetailsObj = {
      ...detailsObj,
      reimbursement_total: reimbSummary.total,
      reimbursement_count: reimbSummary.count,
      reimbursement_items: reimbSummary.items,
      net_salary_before_disbursement: fullNetBefore,
      approved_disbursement_total: approvedSummary.total,
      approved_disbursement_count: approvedSummary.count,
      net_salary: liveNet,
    };
    return {
      net_salary: liveNet,
      details_json: JSON.stringify(updatedDetailsObj),
      detailsObj: updatedDetailsObj,
      adjusted:
        reimbSummary.total !== storedReimbTotal ||
        approvedSummary.total !== prevApproved ||
        liveNet !== storedNet,
    };
  };

  const ensureSyncMeta = () => {
    if (!db._meta || typeof db._meta !== 'object') db._meta = {};
    const v = db._meta.versions && typeof db._meta.versions === 'object' ? db._meta.versions : {};
    db._meta.versions = {
      teachers: Number(v.teachers || 1),
      attendances: Number(v.attendances || 1),
      payrolls: Number(v.payrolls || 1),
      disbursements: Number(v.disbursements || 1),
      reimbursements: Number(v.reimbursements || 1),
      notifications: Number(v.notifications || 1),
      school_profile: Number(v.school_profile || 1),
    };
    if (
      !db._meta.attendance_period_versions ||
      typeof db._meta.attendance_period_versions !== 'object'
    ) {
      db._meta.attendance_period_versions = {};
    }
    if (
      !db._meta.disbursement_period_versions ||
      typeof db._meta.disbursement_period_versions !== 'object'
    ) {
      db._meta.disbursement_period_versions = {};
    }
    if (
      !db._meta.reimbursement_period_versions ||
      typeof db._meta.reimbursement_period_versions !== 'object'
    ) {
      db._meta.reimbursement_period_versions = {};
    }
    if (!db._meta.draft_snapshots || typeof db._meta.draft_snapshots !== 'object') {
      db._meta.draft_snapshots = {};
    }
    return db._meta;
  };

  const getEffectivePeriodAttVersion = (monthVal, yearVal) => {
    const meta = ensureSyncMeta();
    const parsed = parsePeriodMonthKey(monthVal);
    const yr = Number(yearVal);
    if (!yr) return 0;
    const keys = Array.from(
      new Set([`${yr}:${parsed.key}`, ...parsed.monthsInRange.map((m) => `${yr}:${m}`)])
    );
    return keys.reduce(
      (sum, k) => sum + Number(meta.attendance_period_versions[k] || 0),
      0
    );
  };

  const getEffectivePeriodDisbVersion = (monthVal, yearVal) => {
    const meta = ensureSyncMeta();
    const parsed = parsePeriodMonthKey(monthVal);
    const yr = Number(yearVal);
    if (!yr) return 0;
    const keys = Array.from(
      new Set([`${yr}:${parsed.key}`, ...parsed.monthsInRange.map((m) => `${yr}:${m}`)])
    );
    return keys.reduce(
      (sum, k) => sum + Number(meta.disbursement_period_versions[k] || 0),
      0
    );
  };

  const getEffectivePeriodReimbVersion = (monthVal, yearVal) => {
    const meta = ensureSyncMeta();
    const parsed = parsePeriodMonthKey(monthVal);
    const yr = Number(yearVal);
    if (!yr) return 0;
    const keys = Array.from(
      new Set([`${yr}:${parsed.key}`, ...parsed.monthsInRange.map((m) => `${yr}:${m}`)])
    );
    return keys.reduce(
      (sum, k) => sum + Number(meta.reimbursement_period_versions[k] || 0),
      0
    );
  };

  const bumpVersions = (
    domains,
    periodList = [],
    disbursementPeriodList = [],
    reimbursementPeriodList = []
  ) => {
    const meta = ensureSyncMeta();
    (Array.isArray(domains) ? domains : [domains]).forEach((d) => {
      if (d && meta.versions[d] !== undefined) {
        meta.versions[d] = Number(meta.versions[d] || 1) + 1;
      }
    });
    if (Array.isArray(periodList)) {
      periodList.forEach((p) => {
        if (!p) return;
        const pk = normalizePeriodKey(p.month);
        const yr = Number(p.year);
        if (!pk || !yr) return;
        const pKey = `${yr}:${pk}`;
        meta.attendance_period_versions[pKey] =
          Number(meta.attendance_period_versions[pKey] || 0) + 1;
      });
    }
    if (Array.isArray(disbursementPeriodList)) {
      disbursementPeriodList.forEach((p) => {
        if (!p) return;
        const pk = normalizePeriodKey(p.month);
        const yr = Number(p.year);
        if (!pk || !yr) return;
        const pKey = `${yr}:${pk}`;
        meta.disbursement_period_versions[pKey] =
          Number(meta.disbursement_period_versions[pKey] || 0) + 1;
      });
    }
    if (Array.isArray(reimbursementPeriodList)) {
      reimbursementPeriodList.forEach((p) => {
        if (!p) return;
        const pk = normalizePeriodKey(p.month);
        const yr = Number(p.year);
        if (!pk || !yr) return;
        const pKey = `${yr}:${pk}`;
        meta.reimbursement_period_versions[pKey] =
          Number(meta.reimbursement_period_versions[pKey] || 0) + 1;
      });
    }
    return { ...meta.versions };
  };

  const recordDraftSnapshot = (payrollId, monthVal, yearVal) => {
    if (!payrollId) return;
    const meta = ensureSyncMeta();
    meta.draft_snapshots[String(payrollId)] = {
      generated_at: new Date().toISOString(),
      teachers_ver: Number(meta.versions.teachers || 1),
      attendance_ver: getEffectivePeriodAttVersion(monthVal, yearVal),
      disbursement_ver: getEffectivePeriodDisbVersion(monthVal, yearVal),
      reimbursement_ver: getEffectivePeriodReimbVersion(monthVal, yearVal),
      period_key: `${Number(yearVal)}:${normalizePeriodKey(monthVal)}`,
    };
  };

  const clearDraftSnapshot = (payrollId) => {
    if (!payrollId) return;
    const meta = ensureSyncMeta();
    delete meta.draft_snapshots[String(payrollId)];
  };

  const enrichPayrollsWithSyncStatus = (payrollsList) => {
    const meta = ensureSyncMeta();
    const curTeachersVer = Number(meta.versions.teachers || 1);
    return (payrollsList || []).map((p) => {
      if (String(p.status) !== 'draft') {
        return { ...p, needs_resync: false, resync_reasons: [] };
      }
      const snap = meta.draft_snapshots[String(p.id)] || {
        teachers_ver: 1,
        attendance_ver: 0,
        generated_at: '',
      };
      const curAttVer = getEffectivePeriodAttVersion(p.month, p.year);
      const curDisbVer = getEffectivePeriodDisbVersion(p.month, p.year);
      const curReimbVer = getEffectivePeriodReimbVersion(p.month, p.year);
      const reasons = [];
      if (curTeachersVer > Number(snap.teachers_ver || 1)) {
        reasons.push('Perubahan Master PTK / Komponen Gaji');
      }
      if (curAttVer > Number(snap.attendance_ver || 0)) {
        reasons.push('Perubahan Kehadiran & JTM');
      }
      if (curDisbVer > Number(snap.disbursement_ver || 0)) {
        reasons.push('Pencairan PTK Disetujui Kepsek');
      } else if (snap.disbursement_ver === undefined) {
        const hasApprovedDisb = (db.Disbursement_Requests || []).some(
          (r) =>
            r.status === 'approved' &&
            doesDisbursementMatchPeriod(r.month, r.year, p.month, p.year)
        );
        if (hasApprovedDisb) {
          reasons.push('Pencairan PTK Disetujui Kepsek (belum terhitung di draf)');
        }
      }
      if (curReimbVer > Number(snap.reimbursement_ver || 0)) {
        reasons.push('Belanja Sekolah Disetujui Kepsek');
      } else if (snap.reimbursement_ver === undefined) {
        const hasApprovedReimb = (db.Reimbursements || []).some(
          (r) =>
            r.teacher_id !== ADMIN_ROUTINE_TEACHER_ID &&
            r.status === 'approved' &&
            doesDisbursementMatchPeriod(r.month, r.year, p.month, p.year)
        );
        if (hasApprovedReimb) {
          reasons.push('Belanja Sekolah Disetujui Kepsek (belum terhitung di draf)');
        }
      }
      return {
        ...p,
        needs_resync: reasons.length > 0,
        resync_reasons: reasons,
        draft_generated_at: snap.generated_at || '',
      };
    });
  };

  const dispatchAction = (actionName, payload = {}) => {
    switch (actionName) {
      case 'auth.logout':
        return { ok: true, status: 200, message: 'Logged out.' };

      case 'sync.versions':
        return {
          ok: true,
          status: 200,
          data: {
            versions: { ...ensureSyncMeta().versions },
            serverTime: new Date().toISOString(),
          },
        };

      case 'bootstrap.admin': {
        if (session.role !== 'admin') return forbidden();
        const teachersRes = dispatchAction('teachers.list', {});
        const payrollsRes = dispatchAction('payrolls.list', {});
        const attendancesRes = dispatchAction('attendances.list', payload);
        const logsRes = dispatchAction('attendanceLogs.list', payload);
        const disbRes = dispatchAction('disbursements.list', {});
        const reimbRes = dispatchAction('reimbursements.list', {});
        const notifRes = dispatchAction('notifications.list', {});
        return {
          ok: true,
          status: 200,
          data: {
            teachers: teachersRes.data || [],
            payrolls: payrollsRes.data || [],
            attendances: attendancesRes.data || [],
            attendanceLogs: logsRes.data || [],
            disbursements: disbRes.data || [],
            reimbursements: reimbRes.data || [],
            notifications: notifRes.data || { items: [], unreadCount: 0 },
            schoolProfile: db.School_Profile || null,
            versions: { ...ensureSyncMeta().versions },
          },
        };
      }

      case 'bootstrap.kepsek': {
        if (session.role !== 'kepsek') return forbidden();
        const payrollsRes = dispatchAction('payrolls.list', {});
        const summaryRes = dispatchAction('dashboard.summary', {});
        const disbRes = dispatchAction('disbursements.list', {});
        const reimbRes = dispatchAction('reimbursements.list', {});
        const notifRes = dispatchAction('notifications.list', {});
        return {
          ok: true,
          status: 200,
          data: {
            payrolls: payrollsRes.data || [],
            summary: summaryRes.data || null,
            disbursements: disbRes.data || [],
            reimbursements: reimbRes.data || [],
            notifications: notifRes.data || { items: [], unreadCount: 0 },
            schoolProfile: db.School_Profile || null,
            versions: { ...ensureSyncMeta().versions },
          },
        };
      }

      case 'bootstrap.guru': {
        if (session.role !== 'guru') return forbidden();
        const now = new Date();
        const periodQuery = {
          month: payload.month || now.getMonth() + 1,
          year: payload.year || now.getFullYear(),
        };
        const sumRes = dispatchAction('dashboard.summary', {});
        const slipsRes = dispatchAction('payslips.myList', {});
        const logsRes = dispatchAction('attendanceLogs.list', periodQuery);
        const attRes = dispatchAction('attendances.list', periodQuery);
        const disbRes = dispatchAction('disbursements.list', {});
        const reimbRes = dispatchAction('reimbursements.list', {});
        const estRes = dispatchAction('disbursements.estimates', periodQuery);
        const notifRes = dispatchAction('notifications.list', {});
        return {
          ok: true,
          status: 200,
          data: {
            summary: sumRes.data || null,
            slips: slipsRes.data || [],
            attendanceLogs: logsRes.data || [],
            attendances: attRes.data || [],
            disbursements: disbRes.data || [],
            reimbursements: reimbRes.data || [],
            estimates: estRes.data || [],
            notifications: notifRes.data || { items: [], unreadCount: 0 },
            schoolProfile: db.School_Profile || null,
            versions: { ...ensureSyncMeta().versions },
          },
        };
      }

    case 'dashboard.summary': {
      if (session.role === 'guru') {
        const own = getOwnedTeacher();
        if (!own) return forbidden();
        const linkedUser = db.Users_Auth.find((u) => u.id === own.user_id);
        const ownComp = db.Salary_Components.find((c) => c.teacher_id === own.id) || null;
        const enrichedOwn = {
          ...own,
          email: own.email || linkedUser?.email || linkedUser?.username || session.email || '',
          salary_component: ownComp,
        };
        const approvedPayrollIds = new Set(
          db.Payrolls.filter((p) => p.status === 'approved' || p.status === 'paid').map((p) => p.id)
        );
        const myApprovedSlips = db.Payroll_Details.filter(
          (d) => d.teacher_id === own.id && approvedPayrollIds.has(d.payroll_id)
        );
        const allMySlips = db.Payroll_Details.filter((d) => d.teacher_id === own.id);
        const latestSlip = allMySlips.length ? allMySlips[allMySlips.length - 1] : null;
        const latestParent = latestSlip
          ? db.Payrolls.find((p) => p.id === latestSlip.payroll_id)
          : null;
        const latestEstimatedNetSalary = latestSlip
          ? applyLiveDisbursementToDraftDetail(
              latestSlip,
              latestParent,
              db.Disbursement_Requests || []
            ).net_salary
          : 0;
        return {
          ok: true,
          status: 200,
          data: {
            role: 'guru',
            teacher: enrichedOwn,
            totalSlips: allMySlips.length,
            latestNetSalary: myApprovedSlips.length
              ? myApprovedSlips[myApprovedSlips.length - 1].net_salary
              : 0,
            latestEstimatedNetSalary,
          },
        };
      }
      return {
        ok: true,
        status: 200,
        data: {
          role: session.role,
          totalTeachers: db.Teachers.length,
          pendingApprovals: db.Payrolls.filter((p) => p.status === 'submitted').length,
          paidPayrolls: db.Payrolls.filter((p) => p.status === 'paid').length,
          totalPayrolls: db.Payrolls.length,
        },
      };
    }

    case 'teachers.list': {
      if (session.role === 'guru') {
        const own = getOwnedTeacher();
        return { ok: true, status: 200, data: own ? [own] : [] };
      }
      const enriched = db.Teachers.map((t) => {
        const linkedUser = db.Users_Auth.find((u) => u.id === t.user_id);
        const email =
          t.email ||
          (linkedUser ? String(linkedUser.email || linkedUser.username || '') : '');
        return {
          ...t,
          email,
          salary_component: db.Salary_Components.find((c) => c.teacher_id === t.id) || null,
        };
      });
      return { ok: true, status: 200, data: enriched };
    }

    case 'teachers.create': {
      if (session.role !== 'admin') return forbidden();
      const cleanEmail = String(payload.email || payload.username || '')
        .trim()
        .toLowerCase();

      if (cleanEmail) {
        const dup = db.Users_Auth.some(
          (u) =>
            String(u.email || u.username || '')
              .trim()
              .toLowerCase() === cleanEmail
        );
        if (dup) {
          return {
            ok: false,
            status: 409,
            error: `Alamat Gmail "${cleanEmail}" sudah digunakan oleh akun lain.`,
          };
        }
      }

      const userId = generateUuidV4();
      if (cleanEmail) {
        db.Users_Auth.push({
          id: userId,
          username: cleanEmail,
          email: cleanEmail,
          password_hash: 'GMAIL_AUTH',
          role: 'guru',
        });
      }

      const teacherId = generateUuidV4();
      const newTeacher = {
        id: teacherId,
        user_id: userId,
        nip: payload.nip,
        name: payload.name,
        staff_category: resolveStaffCategory(payload),
        status: payload.status || 'GTY (Guru Tetap Yayasan)',
        bank_account: payload.bank_account,
        email: cleanEmail,
      };
      db.Teachers.push(newTeacher);

      const baseSalary = Number(payload.base_salary || 0);
      const hourlyRate = Number(payload.hourly_rate || 0);
      const positionAllowance = Number(payload.position_allowance || 0);
      const infaqEnabled = isInfaqZakatEnabled(payload);

      const newComp = {
        id: generateUuidV4(),
        teacher_id: teacherId,
        base_salary: baseSalary,
        hourly_rate: hourlyRate,
        position_allowance: positionAllowance,
        infaq_zakat_enabled: infaqEnabled,
        bpjs_deduction: infaqEnabled ? 1 : 0,
        custom_components_json:
          typeof payload.custom_components_json === 'string'
            ? payload.custom_components_json
            : JSON.stringify(payload.custom_components || []),
      };
      db.Salary_Components.push(newComp);
      bumpVersions(['teachers']);
      saveDb(db);
      return { ok: true, status: 201, data: { ...newTeacher, salary_component: newComp } };
    }

    case 'teachers.update': {
      if (session.role !== 'admin') return forbidden();
      const idx = db.Teachers.findIndex((t) => t.id === payload.id);
      if (idx === -1) return notFound();

      const existingTeacher = db.Teachers[idx];
      const nextEmail =
        payload.email !== undefined || payload.username !== undefined
          ? String(payload.email ?? payload.username ?? '')
              .trim()
              .toLowerCase()
          : existingTeacher.email || '';

      if (nextEmail) {
        const conflictUser = db.Users_Auth.find(
          (u) =>
            u.id !== existingTeacher.user_id &&
            String(u.email || u.username || '')
              .trim()
              .toLowerCase() === nextEmail
        );
        if (conflictUser) {
          return {
            ok: false,
            status: 409,
            error: `Alamat Gmail "${nextEmail}" sudah digunakan oleh akun lain.`,
          };
        }

        const userIdx = db.Users_Auth.findIndex((u) => u.id === existingTeacher.user_id);
        if (userIdx !== -1) {
          db.Users_Auth[userIdx] = {
            ...db.Users_Auth[userIdx],
            username: nextEmail,
            email: nextEmail,
          };
        } else {
          const newUserId = existingTeacher.user_id || generateUuidV4();
          existingTeacher.user_id = newUserId;
          db.Users_Auth.push({
            id: newUserId,
            username: nextEmail,
            email: nextEmail,
            password_hash: 'GMAIL_AUTH',
            role: 'guru',
          });
        }
      }

      db.Teachers[idx] = {
        ...existingTeacher,
        nip: payload.nip ?? existingTeacher.nip,
        name: payload.name ?? existingTeacher.name,
        staff_category:
          payload.staff_category !== undefined
            ? resolveStaffCategory(payload)
            : existingTeacher.staff_category || resolveStaffCategory(existingTeacher),
        status: payload.status ?? existingTeacher.status,
        bank_account: payload.bank_account ?? existingTeacher.bank_account,
        email: nextEmail,
      };
      const compIdx = db.Salary_Components.findIndex((c) => c.teacher_id === payload.id);
      const nextCustomJson =
        payload.custom_components_json !== undefined
          ? payload.custom_components_json
          : payload.custom_components !== undefined
          ? JSON.stringify(payload.custom_components)
          : undefined;
      if (compIdx !== -1) {
        const prevComp = db.Salary_Components[compIdx];
        const nextBase = Number(payload.base_salary ?? prevComp.base_salary);
        const nextRate = Number(payload.hourly_rate ?? prevComp.hourly_rate);
        const nextAllowance = Number(payload.position_allowance ?? prevComp.position_allowance);
        const nextInfaqEnabled =
          payload.infaq_zakat_enabled !== undefined || payload.bpjs_deduction !== undefined
            ? isInfaqZakatEnabled(payload)
            : isInfaqZakatEnabled(prevComp);

        db.Salary_Components[compIdx] = {
          ...prevComp,
          base_salary: nextBase,
          hourly_rate: nextRate,
          position_allowance: nextAllowance,
          infaq_zakat_enabled: nextInfaqEnabled,
          bpjs_deduction: nextInfaqEnabled ? 1 : 0,
          custom_components_json:
            nextCustomJson !== undefined
              ? nextCustomJson
              : prevComp.custom_components_json || '[]',
        };
      }
      bumpVersions(['teachers']);
      saveDb(db);
      return { ok: true, status: 200, data: db.Teachers[idx] };
    }

    case 'teachers.bulkImport': {
      if (session.role !== 'admin') return forbidden();
      const items = Array.isArray(payload.items) ? payload.items : [];
      let createdCount = 0;
      let updatedCount = 0;

      for (const item of items) {
        const cleanNip = String(item.nip || '').trim();
        const cleanName = String(item.name || '').trim();
        const cleanBank = String(item.bank_account || '').trim();
        const cleanEmail = String(item.email || item.username || '')
          .trim()
          .toLowerCase();
        if (!cleanNip || !cleanName || !cleanBank) continue;

        const existingTeacherIdx = db.Teachers.findIndex(
          (t) => String(t.nip || '').trim().toLowerCase() === cleanNip.toLowerCase()
        );

        if (existingTeacherIdx !== -1) {
          const existingTeacher = db.Teachers[existingTeacherIdx];
          const targetId = existingTeacher.id;
          const updatedEmail = cleanEmail || existingTeacher.email || '';

          if (cleanEmail) {
            const userIdx = db.Users_Auth.findIndex((u) => u.id === existingTeacher.user_id);
            if (userIdx !== -1) {
              db.Users_Auth[userIdx] = {
                ...db.Users_Auth[userIdx],
                username: cleanEmail,
                email: cleanEmail,
              };
            } else {
              const newUserId = existingTeacher.user_id || generateUuidV4();
              existingTeacher.user_id = newUserId;
              db.Users_Auth.push({
                id: newUserId,
                username: cleanEmail,
                email: cleanEmail,
                password_hash: 'GMAIL_AUTH',
                role: 'guru',
              });
            }
          }

          db.Teachers[existingTeacherIdx] = {
            ...existingTeacher,
            nip: cleanNip,
            name: cleanName,
            staff_category: resolveStaffCategory({
              staff_category: item.staff_category,
              status: item.status || existingTeacher.status,
            }),
            status: item.status || existingTeacher.status,
            bank_account: cleanBank,
            email: updatedEmail,
          };
          const itemBase = Number(item.base_salary || 0);
          const itemRate = Number(item.hourly_rate || 0);
          const itemAllowance = Number(item.position_allowance || 0);
          const itemInfaqEnabled = isInfaqZakatEnabled(item);
          const itemCustomJson =
            item.custom_components_json !== undefined
              ? typeof item.custom_components_json === 'string'
                ? item.custom_components_json
                : JSON.stringify(item.custom_components_json)
              : Array.isArray(item.custom_components)
              ? JSON.stringify(item.custom_components)
              : undefined;

          const compIdx = db.Salary_Components.findIndex((c) => c.teacher_id === targetId);
          if (compIdx !== -1) {
            const prevComp = db.Salary_Components[compIdx];
            db.Salary_Components[compIdx] = {
              ...prevComp,
              base_salary: itemBase,
              hourly_rate: itemRate,
              position_allowance: itemAllowance,
              infaq_zakat_enabled: itemInfaqEnabled,
              bpjs_deduction: itemInfaqEnabled ? 1 : 0,
              custom_components_json:
                itemCustomJson !== undefined
                  ? itemCustomJson
                  : prevComp.custom_components_json || '[]',
            };
          } else {
            db.Salary_Components.push({
              id: generateUuidV4(),
              teacher_id: targetId,
              base_salary: itemBase,
              hourly_rate: itemRate,
              position_allowance: itemAllowance,
              infaq_zakat_enabled: itemInfaqEnabled,
              bpjs_deduction: itemInfaqEnabled ? 1 : 0,
              custom_components_json: itemCustomJson !== undefined ? itemCustomJson : '[]',
            });
          }
          updatedCount++;
        } else {
          let userId = generateUuidV4();
          if (cleanEmail) {
            const existingUser = db.Users_Auth.find(
              (u) =>
                String(u.email || u.username || '')
                  .trim()
                  .toLowerCase() === cleanEmail
            );
            if (existingUser) {
              userId = existingUser.id;
            } else {
              db.Users_Auth.push({
                id: userId,
                username: cleanEmail,
                email: cleanEmail,
                password_hash: 'GMAIL_AUTH',
                role: 'guru',
              });
            }
          }
          const teacherId = generateUuidV4();
          db.Teachers.push({
            id: teacherId,
            user_id: userId,
            nip: cleanNip,
            name: cleanName,
            staff_category: resolveStaffCategory(item),
            status: item.status || 'GTY (Guru Tetap Yayasan)',
            bank_account: cleanBank,
            email: cleanEmail,
          });
          const itemBase = Number(item.base_salary || 0);
          const itemRate = Number(item.hourly_rate || 0);
          const itemAllowance = Number(item.position_allowance || 0);
          const itemInfaqEnabled = isInfaqZakatEnabled(item);
          const itemCustomJson =
            item.custom_components_json !== undefined
              ? typeof item.custom_components_json === 'string'
                ? item.custom_components_json
                : JSON.stringify(item.custom_components_json)
              : Array.isArray(item.custom_components)
              ? JSON.stringify(item.custom_components)
              : '[]';

          db.Salary_Components.push({
            id: generateUuidV4(),
            teacher_id: teacherId,
            base_salary: itemBase,
            hourly_rate: itemRate,
            position_allowance: itemAllowance,
            infaq_zakat_enabled: itemInfaqEnabled,
            bpjs_deduction: itemInfaqEnabled ? 1 : 0,
            custom_components_json: itemCustomJson,
          });
          createdCount++;
        }
      }

      if (createdCount > 0 || updatedCount > 0) {
        bumpVersions(['teachers']);
      }
      saveDb(db);
      return {
        ok: true,
        status: 200,
        data: { createdCount, updatedCount, totalProcessed: createdCount + updatedCount },
      };
    }

    case 'teachers.delete': {
      if (session.role !== 'admin') return forbidden();
      const targetTeacher = db.Teachers.find((t) => t.id === payload.id);
      if (!targetTeacher) return notFound();
      db.Teachers = db.Teachers.filter((t) => t.id !== payload.id);
      db.Salary_Components = db.Salary_Components.filter((c) => c.teacher_id !== payload.id);
      if (targetTeacher.user_id) {
        db.Users_Auth = db.Users_Auth.filter(
          (u) => !(u.id === targetTeacher.user_id && u.role === 'guru')
        );
      }
      bumpVersions(['teachers']);
      saveDb(db);
      return { ok: true, status: 200, message: 'Data guru berhasil dihapus.' };
    }

    case 'attendances.list': {
      let list = db.Attendances;
      if (payload.month && payload.year) {
        const targetKey = normalizePeriodKey(payload.month);
        const targetYear = Number(payload.year);
        const parsedPeriod = parsePeriodMonthKey(targetKey);

        const directMatches = list.filter(
          (a) => normalizePeriodKey(a.month) === targetKey && Number(a.year) === targetYear
        );

        if (parsedPeriod.isRange) {
          const directTeacherIds = new Set(directMatches.map((a) => a.teacher_id));
          const rangeSet = new Set(parsedPeriod.monthsInRange.map((m) => String(m)));
          const aggregatedRows = [];

          for (const t of db.Teachers) {
            if (directTeacherIds.has(t.id)) continue;
            const subRows = list.filter(
              (a) =>
                a.teacher_id === t.id &&
                Number(a.year) === targetYear &&
                rangeSet.has(normalizePeriodKey(a.month))
            );
            if (subRows.length > 0) {
              aggregatedRows.push({
                id: `agg_${t.id}_${targetKey}_${targetYear}`,
                teacher_id: t.id,
                month: targetKey,
                year: targetYear,
                present_days: subRows.reduce((s, r) => s + Number(r.present_days || 0), 0),
                absent_days: subRows.reduce((s, r) => s + Number(r.absent_days || 0), 0),
                total_jtm: subRows.reduce((s, r) => s + Number(r.total_jtm || 0), 0),
              });
            }
          }
          list = [...directMatches, ...aggregatedRows];
        } else {
          list = directMatches;
        }
      }
      if (session.role === 'guru') {
        const own = getOwnedTeacher();
        if (!own) return forbidden();
        list = list.filter((a) => a.teacher_id === own.id);
      }
      return { ok: true, status: 200, data: list };
    }

    case 'attendances.upsert': {
      if (session.role !== 'admin') return forbidden();
      const targetKey = normalizePeriodKey(payload.month);
      const targetYear = Number(payload.year);
      const existingIdx = db.Attendances.findIndex(
        (a) =>
          a.teacher_id === payload.teacher_id &&
          normalizePeriodKey(a.month) === targetKey &&
          Number(a.year) === targetYear
      );
      const storedMonth = /^\d+$/.test(targetKey) ? Number(targetKey) : targetKey;
      const record = {
        id: existingIdx !== -1 ? db.Attendances[existingIdx].id : generateUuidV4(),
        teacher_id: payload.teacher_id,
        month: storedMonth,
        year: targetYear,
        present_days: roundAttendanceMetric(payload.present_days || 0),
        absent_days: roundAttendanceMetric(payload.absent_days || 0),
        total_jtm: roundAttendanceMetric(payload.total_jtm || 0),
      };
      if (existingIdx !== -1) {
        db.Attendances[existingIdx] = record;
      } else {
        db.Attendances.push(record);
      }
      bumpVersions(['attendances'], [{ month: targetKey, year: targetYear }]);
      saveDb(db);
      return { ok: true, status: 200, data: record };
    }

    case 'attendances.bulkUpsert': {
      if (session.role !== 'admin') return forbidden();
      const targetKey = normalizePeriodKey(payload.month);
      const targetYear = Number(payload.year);
      const items = Array.isArray(payload.items) ? payload.items : [];
      if (!targetKey || !targetYear) {
        return { ok: false, status: 400, error: 'Periode bulan dan tahun tidak valid.' };
      }
      const storedMonth = /^\d+$/.test(targetKey) ? Number(targetKey) : targetKey;
      const savedRows = [];

      items.forEach((item) => {
        if (!item || !item.teacher_id) return;
        const existingIdx = db.Attendances.findIndex(
          (a) =>
            a.teacher_id === item.teacher_id &&
            normalizePeriodKey(a.month) === targetKey &&
            Number(a.year) === targetYear
        );
        const record = {
          id: existingIdx !== -1 ? db.Attendances[existingIdx].id : generateUuidV4(),
          teacher_id: item.teacher_id,
          month: storedMonth,
          year: targetYear,
          present_days: roundAttendanceMetric(item.present_days || 0),
          absent_days: roundAttendanceMetric(item.absent_days || 0),
          total_jtm: roundAttendanceMetric(item.total_jtm || 0),
        };
        if (existingIdx !== -1) {
          db.Attendances[existingIdx] = record;
        } else {
          db.Attendances.push(record);
        }
        savedRows.push(record);
      });

      let versions = { ...ensureSyncMeta().versions };
      if (savedRows.length > 0) {
        versions = bumpVersions(['attendances'], [{ month: targetKey, year: targetYear }]);
        saveDb(db);
      }
      return {
        ok: true,
        status: 200,
        data: { saved: savedRows, count: savedRows.length, versions },
      };
    }

    case 'attendanceLogs.list': {
      let logs = [...(db.Attendance_Logs || [])];
      if (session.role === 'guru') {
        const own = getOwnedTeacher();
        if (!own) return forbidden();
        logs = logs.filter((l) => l.teacher_id === own.id);
      } else if (payload.teacher_id) {
        logs = logs.filter((l) => l.teacher_id === payload.teacher_id);
      }

      if (payload.year) {
        logs = logs.filter((l) => Number(l.year) === Number(payload.year));
      }
      if (payload.month) {
        const parsed = parsePeriodMonthKey(payload.month);
        const rangeSet = new Set(parsed.monthsInRange);
        logs = logs.filter((l) => rangeSet.has(Number(l.month)));
      }

      logs.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      return { ok: true, status: 200, data: logs };
    }

    case 'attendanceLogs.upsertMyLog': {
      if (!['guru', 'admin'].includes(session.role)) return forbidden();
      const targetTeacherId =
        session.role === 'guru' ? getOwnedTeacher()?.id : String(payload.teacher_id || '');
      if (!targetTeacherId) return forbidden();

      const rawDate = String(payload.date || '').trim();
      const dateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!dateMatch) {
        return { ok: false, status: 400, error: 'Format tanggal harus YYYY-MM-DD.' };
      }
      const yearNum = Number(dateMatch[1]);
      const monthNum = Number(dateMatch[2]);
      if (yearNum < 2020 || yearNum > 2100 || monthNum < 1 || monthNum > 12) {
        return { ok: false, status: 400, error: 'Tanggal kehadiran tidak valid.' };
      }
      if (rawDate > getTodayIsoDate()) {
        return {
          ok: false,
          status: 400,
          error: 'Tanggal kehadiran tidak boleh melebihi hari ini.',
        };
      }

      const locked = (db.Payrolls || []).some((p) => {
        if (Number(p.year) !== yearNum || p.status === 'draft') return false;
        const parsed = parsePeriodMonthKey(p.month);
        return parsed.monthsInRange.includes(monthNum);
      });
      if (locked) {
        return {
          ok: false,
          status: 409,
          error:
            'Periode penggajian bulan ini sudah diajukan/disetujui sehingga catatan kehadiran terkunci.',
        };
      }

      const className = (String(payload.class_name || '').trim() || 'Kelas Umum').slice(0, 80);
      const status = normalizeAttendanceStatus(payload.status);
      const jtmHours =
        status === 'sakit' || status === 'izin' ? 0 : roundAttendanceMetric(payload.jtm_hours || 0);
      const note = String(payload.note || '').trim().slice(0, 250);
      const nowIso = new Date().toISOString();

      if (!Array.isArray(db.Attendance_Logs)) db.Attendance_Logs = [];
      const existingIdx = db.Attendance_Logs.findIndex(
        (l) =>
          l.teacher_id === targetTeacherId &&
          l.date === rawDate &&
          String(l.class_name || 'Kelas Umum').toLowerCase() === className.toLowerCase()
      );

      let savedLog;
      if (existingIdx !== -1) {
        savedLog = {
          ...db.Attendance_Logs[existingIdx],
          class_name: className,
          month: monthNum,
          year: yearNum,
          status,
          jtm_hours: jtmHours,
          note,
          validation_status: 'pending',
          validation_note: '',
          updated_at: nowIso,
        };
        db.Attendance_Logs[existingIdx] = savedLog;
      } else {
        savedLog = {
          id: generateUuidV4(),
          teacher_id: targetTeacherId,
          date: rawDate,
          class_name: className,
          month: monthNum,
          year: yearNum,
          status,
          jtm_hours: jtmHours,
          note,
          validation_status: 'pending',
          validation_note: '',
          created_at: nowIso,
          updated_at: nowIso,
        };
        db.Attendance_Logs.push(savedLog);
      }

      const monthLogs = db.Attendance_Logs.filter(
        (l) =>
          l.teacher_id === targetTeacherId &&
          Number(l.month) === monthNum &&
          Number(l.year) === yearNum
      );
      const breakdown = computeAttendanceBreakdownFromLogs(monthLogs);
      const attIdx = db.Attendances.findIndex(
        (a) =>
          a.teacher_id === targetTeacherId &&
          normalizePeriodKey(a.month) === String(monthNum) &&
          Number(a.year) === yearNum
      );
      const attSummary = {
        id: attIdx !== -1 ? db.Attendances[attIdx].id : generateUuidV4(),
        teacher_id: targetTeacherId,
        month: monthNum,
        year: yearNum,
        present_days: breakdown.present_days,
        absent_days: breakdown.absent_days,
        total_jtm: breakdown.total_jtm,
      };
      if (attIdx !== -1) {
        db.Attendances[attIdx] = attSummary;
      } else {
        db.Attendances.push(attSummary);
      }

      bumpVersions(['attendances'], [{ month: monthNum, year: yearNum }]);
      saveDb(db);
      return {
        ok: true,
        status: existingIdx !== -1 ? 200 : 201,
        data: { log: savedLog, attendanceSummary: attSummary },
      };
    }

    case 'attendanceLogs.syncDateLogs': {
      if (!['guru', 'admin'].includes(session.role)) return forbidden();
      const targetTeacherId =
        session.role === 'guru' ? getOwnedTeacher()?.id : String(payload.teacher_id || '');
      if (!targetTeacherId) return forbidden();

      const rawDate = String(payload.date || '').trim();
      const dateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!dateMatch) {
        return { ok: false, status: 400, error: 'Format tanggal harus YYYY-MM-DD.' };
      }
      const yearNum = Number(dateMatch[1]);
      const monthNum = Number(dateMatch[2]);
      if (yearNum < 2020 || yearNum > 2100 || monthNum < 1 || monthNum > 12) {
        return { ok: false, status: 400, error: 'Tanggal kehadiran tidak valid.' };
      }
      if (rawDate > getTodayIsoDate()) {
        return {
          ok: false,
          status: 400,
          error: 'Tanggal kehadiran tidak boleh melebihi hari ini.',
        };
      }

      const locked = (db.Payrolls || []).some((p) => {
        if (Number(p.year) !== yearNum || p.status === 'draft') return false;
        const parsed = parsePeriodMonthKey(p.month);
        return parsed.monthsInRange.includes(monthNum);
      });
      if (locked) {
        return {
          ok: false,
          status: 409,
          error:
            'Periode penggajian bulan ini sudah diajukan/disetujui sehingga catatan kehadiran terkunci.',
        };
      }

      const rawEntries = Array.isArray(payload.entries) ? payload.entries : [];
      const seen = new Set();
      const nowIso = new Date().toISOString();
      const nextDateLogs = [];

      if (!Array.isArray(db.Attendance_Logs)) db.Attendance_Logs = [];
      const prevDateLogs = db.Attendance_Logs.filter(
        (l) => l.teacher_id === targetTeacherId && l.date === rawDate
      );

      for (const entry of rawEntries) {
        const className = String(entry?.class_name || '').trim().slice(0, 80);
        if (!className) continue;
        const key = className.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const status = normalizeAttendanceStatus(entry.status);
        const jtmHours =
          status === 'sakit' || status === 'izin' ? 0 : roundAttendanceMetric(entry.jtm_hours || 0);
        const note = String(entry.note || '').trim().slice(0, 250);

        const prevMatch = prevDateLogs.find(
          (pl) => String(pl.class_name || '').trim().toLowerCase() === key
        );
        const isUnchanged =
          prevMatch &&
          prevMatch.status === status &&
          Number(prevMatch.jtm_hours || 0) === Number(jtmHours) &&
          String(prevMatch.note || '') === note;

        nextDateLogs.push({
          id: prevMatch ? prevMatch.id : generateUuidV4(),
          teacher_id: targetTeacherId,
          date: rawDate,
          class_name: className,
          month: monthNum,
          year: yearNum,
          status,
          jtm_hours: jtmHours,
          note,
          validation_status: isUnchanged
            ? normalizeLogValidationStatus(prevMatch.validation_status)
            : 'pending',
          validation_note: isUnchanged ? String(prevMatch.validation_note || '') : '',
          created_at: prevMatch?.created_at || nowIso,
          updated_at: nowIso,
        });
      }

      db.Attendance_Logs = db.Attendance_Logs.filter(
        (l) => !(l.teacher_id === targetTeacherId && l.date === rawDate)
      ).concat(nextDateLogs);

      const monthLogs = db.Attendance_Logs.filter(
        (l) =>
          l.teacher_id === targetTeacherId &&
          Number(l.month) === monthNum &&
          Number(l.year) === yearNum
      );
      const breakdown = computeAttendanceBreakdownFromLogs(monthLogs);
      const attIdx = db.Attendances.findIndex(
        (a) =>
          a.teacher_id === targetTeacherId &&
          normalizePeriodKey(a.month) === String(monthNum) &&
          Number(a.year) === yearNum
      );
      const attSummary = {
        id: attIdx !== -1 ? db.Attendances[attIdx].id : generateUuidV4(),
        teacher_id: targetTeacherId,
        month: monthNum,
        year: yearNum,
        present_days: breakdown.present_days,
        absent_days: breakdown.absent_days,
        total_jtm: breakdown.total_jtm,
      };
      if (attIdx !== -1) {
        db.Attendances[attIdx] = attSummary;
      } else {
        db.Attendances.push(attSummary);
      }

      bumpVersions(['attendances'], [{ month: monthNum, year: yearNum }]);
      saveDb(db);
      return {
        ok: true,
        status: 200,
        data: { date: rawDate, logs: nextDateLogs, attendanceSummary: attSummary },
      };
    }

    case 'attendanceLogs.deleteMyLog': {
      if (!['guru', 'admin'].includes(session.role)) return forbidden();
      const logs = db.Attendance_Logs || [];
      const targetIdx = logs.findIndex((l) => l.id === payload.id);
      if (targetIdx === -1) return { ok: false, status: 404, error: 'Catatan tidak ditemukan.' };

      const target = logs[targetIdx];
      if (session.role === 'guru') {
        const own = getOwnedTeacher();
        if (!own || target.teacher_id !== own.id) return forbidden();
      }

      const locked = (db.Payrolls || []).some((p) => {
        if (Number(p.year) !== Number(target.year) || p.status === 'draft') return false;
        const parsed = parsePeriodMonthKey(p.month);
        return parsed.monthsInRange.includes(Number(target.month));
      });
      if (locked) {
        return {
          ok: false,
          status: 409,
          error:
            'Periode penggajian bulan ini sudah diajukan/disetujui sehingga catatan tidak dapat dihapus.',
        };
      }

      db.Attendance_Logs.splice(targetIdx, 1);

      const monthLogs = db.Attendance_Logs.filter(
        (l) =>
          l.teacher_id === target.teacher_id &&
          Number(l.month) === Number(target.month) &&
          Number(l.year) === Number(target.year)
      );
      const breakdown = computeAttendanceBreakdownFromLogs(monthLogs);
      const attIdx = db.Attendances.findIndex(
        (a) =>
          a.teacher_id === target.teacher_id &&
          normalizePeriodKey(a.month) === String(target.month) &&
          Number(a.year) === Number(target.year)
      );
      const attSummary = {
        id: attIdx !== -1 ? db.Attendances[attIdx].id : generateUuidV4(),
        teacher_id: target.teacher_id,
        month: Number(target.month),
        year: Number(target.year),
        present_days: breakdown.present_days,
        absent_days: breakdown.absent_days,
        total_jtm: breakdown.total_jtm,
      };
      if (attIdx !== -1) {
        db.Attendances[attIdx] = attSummary;
      } else {
        db.Attendances.push(attSummary);
      }

      bumpVersions(['attendances'], [{ month: Number(target.month), year: Number(target.year) }]);
      saveDb(db);
      return {
        ok: true,
        status: 200,
        data: { deletedId: target.id, attendanceSummary: attSummary },
      };
    }

    case 'attendanceLogs.validate': {
      if (session.role !== 'admin') return forbidden();
      const ids = Array.isArray(payload.ids)
        ? payload.ids.map((x) => String(x || '').trim()).filter(Boolean)
        : payload.id
        ? [String(payload.id).trim()]
        : [];
      if (ids.length === 0) {
        return { ok: false, status: 400, error: 'ID catatan kehadiran tidak ditemukan.' };
      }

      const vStatus = normalizeLogValidationStatus(payload.validation_status);
      const vNote = String(payload.validation_note || '').trim().slice(0, 250);
      const nowIso = new Date().toISOString();

      if (!Array.isArray(db.Attendance_Logs)) db.Attendance_Logs = [];
      const idSet = new Set(ids);
      const affectedPeriods = new Map();
      const updatedLogs = [];

      db.Attendance_Logs.forEach((log, idx) => {
        if (!idSet.has(log.id)) return;
        const nextRow = {
          ...log,
          validation_status: vStatus,
          validation_note: vStatus === 'invalid' ? vNote : '',
          updated_at: nowIso,
        };
        db.Attendance_Logs[idx] = nextRow;
        updatedLogs.push(nextRow);
        affectedPeriods.set(`${log.teacher_id}:${log.month}:${log.year}`, {
          teacher_id: log.teacher_id,
          month: Number(log.month),
          year: Number(log.year),
        });
      });

      if (updatedLogs.length === 0) {
        return { ok: false, status: 404, error: 'Catatan kehadiran tidak ditemukan.' };
      }

      const lockedPeriod = Array.from(affectedPeriods.values()).some((per) =>
        (db.Payrolls || []).some((p) => {
          if (Number(p.year) !== per.year || p.status === 'draft') return false;
          return parsePeriodMonthKey(p.month).monthsInRange.includes(per.month);
        })
      );
      if (lockedPeriod) {
        return {
          ok: false,
          status: 409,
          error:
            'Periode penggajian bulan ini sudah diajukan/disetujui sehingga validasi terkunci.',
        };
      }

      let lastSummary = null;
      affectedPeriods.forEach((per) => {
        const monthLogs = db.Attendance_Logs.filter(
          (l) =>
            l.teacher_id === per.teacher_id &&
            Number(l.month) === per.month &&
            Number(l.year) === per.year
        );
        const breakdown = computeAttendanceBreakdownFromLogs(monthLogs);
        const attIdx = db.Attendances.findIndex(
          (a) =>
            a.teacher_id === per.teacher_id &&
            normalizePeriodKey(a.month) === String(per.month) &&
            Number(a.year) === per.year
        );
        const attSummary = {
          id: attIdx !== -1 ? db.Attendances[attIdx].id : generateUuidV4(),
          teacher_id: per.teacher_id,
          month: per.month,
          year: per.year,
          present_days: breakdown.present_days,
          absent_days: breakdown.absent_days,
          total_jtm: breakdown.total_jtm,
        };
        if (attIdx !== -1) {
          db.Attendances[attIdx] = attSummary;
        } else {
          db.Attendances.push(attSummary);
        }
        lastSummary = attSummary;
      });

      bumpVersions(['attendances'], Array.from(affectedPeriods.values()));
      saveDb(db);
      return {
        ok: true,
        status: 200,
        data: { updatedLogs, attendanceSummary: lastSummary },
      };
    }

    case 'payrolls.list': {
      if (session.role === 'guru') return forbidden();
      return { ok: true, status: 200, data: enrichPayrollsWithSyncStatus(db.Payrolls) };
    }

    case 'payrolls.generateDraft': {
      if (session.role !== 'admin') return forbidden();
      const targetKey = normalizePeriodKey(payload.month);
      const storedMonth = /^\d+$/.test(targetKey) ? Number(targetKey) : targetKey;
      const year = Number(payload.year);
      const parsedPeriod = parsePeriodMonthKey(targetKey);
      const rangeSet = new Set(parsedPeriod.monthsInRange.map((m) => String(m)));

      const existing = db.Payrolls.find(
        (p) => normalizePeriodKey(p.month) === targetKey && Number(p.year) === year
      );
      if (existing && existing.status !== 'draft') {
        return {
          ok: false,
          status: 409,
          error: 'Payroll periode ini sudah diajukan/disetujui dan terkunci.',
        };
      }
      const payrollId = existing ? existing.id : generateUuidV4();
      let totalBudget = 0;
      const newDetails = db.Teachers.map((teacher) => {
        const comp = db.Salary_Components.find((c) => c.teacher_id === teacher.id) || {
          base_salary: 0,
          hourly_rate: 0,
          position_allowance: 0,
          bpjs_deduction: 0,
        };
        let att = db.Attendances.find(
          (a) =>
            a.teacher_id === teacher.id &&
            normalizePeriodKey(a.month) === targetKey &&
            Number(a.year) === year
        );
        if (!att && parsedPeriod.isRange) {
          const subRows = db.Attendances.filter(
            (a) =>
              a.teacher_id === teacher.id &&
              Number(a.year) === year &&
              rangeSet.has(normalizePeriodKey(a.month))
          );
          att = {
            present_days: subRows.reduce((s, r) => s + Number(r.present_days || 0), 0),
            absent_days: subRows.reduce((s, r) => s + Number(r.absent_days || 0), 0),
            total_jtm: subRows.reduce((s, r) => s + Number(r.total_jtm || 0), 0),
          };
        }
        if (!att) {
          att = { present_days: 0, absent_days: 0, total_jtm: 0 };
        }

        const jtmHonor = Number(att.total_jtm) * Number(comp.hourly_rate);
        let customComponents = [];
        try {
          customComponents = JSON.parse(comp.custom_components_json || '[]');
          if (!Array.isArray(customComponents)) customComponents = [];
        } catch {
          customComponents = [];
        }
        const customAllowanceTotal = customComponents
          .filter((c) => c.type === 'allowance')
          .reduce((sum, c) => sum + Number(c.amount || 0), 0);
        const customDeductionTotal = customComponents
          .filter((c) => c.type !== 'allowance')
          .reduce((sum, c) => sum + Number(c.amount || 0), 0);

        const infaqEnabled = isInfaqZakatEnabled(comp);
        const infaqZakatAmount = calculateInfaqZakat(
          comp.base_salary,
          jtmHonor,
          comp.position_allowance,
          infaqEnabled,
          customAllowanceTotal
        );

        const gross =
          Number(comp.base_salary) +
          jtmHonor +
          Number(comp.position_allowance) +
          customAllowanceTotal;
        const approvedReimb = getApprovedReimbursementSummaryForPeriod(
          db.Reimbursements || [],
          teacher.id,
          targetKey,
          year
        );
        const netBeforeDisbursement =
          Math.max(0, gross - infaqZakatAmount - customDeductionTotal) + approvedReimb.total;
        const approvedDisb = getApprovedDisbursementSummaryForPeriod(
          db.Disbursement_Requests || [],
          teacher.id,
          targetKey,
          year
        );
        const net = Math.max(0, netBeforeDisbursement - approvedDisb.total);
        totalBudget += net;

        return {
          id: generateUuidV4(),
          payroll_id: payrollId,
          teacher_id: teacher.id,
          net_salary: net,
          details_json: JSON.stringify({
            teacher_name: teacher.name,
            nip: teacher.nip,
            staff_category: resolveStaffCategory(teacher),
            status: teacher.status,
            bank_account: teacher.bank_account,
            month: storedMonth,
            year,
            present_days: att.present_days,
            absent_days: att.absent_days,
            total_jtm: att.total_jtm,
            base_salary: comp.base_salary,
            hourly_rate: comp.hourly_rate,
            jtm_honor: jtmHonor,
            position_allowance: comp.position_allowance,
            infaq_zakat_enabled: infaqEnabled,
            infaq_zakat: infaqZakatAmount,
            bpjs_deduction: infaqZakatAmount,
            custom_components: customComponents,
            custom_allowance_total: customAllowanceTotal,
            custom_deduction_total: customDeductionTotal,
            gross_salary: gross,
            reimbursement_total: approvedReimb.total,
            reimbursement_count: approvedReimb.count,
            reimbursement_items: approvedReimb.items,
            net_salary_before_disbursement: netBeforeDisbursement,
            approved_disbursement_total: approvedDisb.total,
            approved_disbursement_count: approvedDisb.count,
            net_salary: net,
          }),
        };
      });

      if (existing) {
        existing.total_budget = totalBudget;
        existing.status = 'draft';
        db.Payroll_Details = db.Payroll_Details.filter((d) => d.payroll_id !== payrollId);
      } else {
        db.Payrolls.push({
          id: payrollId,
          month: storedMonth,
          year,
          total_budget: totalBudget,
          status: 'draft',
        });
      }
      db.Payroll_Details.push(...newDetails);
      recordDraftSnapshot(payrollId, targetKey, year);
      const nextVersions = bumpVersions(['payrolls']);
      saveDb(db);
      return {
        ok: true,
        status: 200,
        data: {
          id: payrollId,
          month: storedMonth,
          year,
          total_budget: totalBudget,
          status: 'draft',
          details: newDetails,
          needs_resync: false,
          resync_reasons: [],
          versions: nextVersions,
        },
      };
    }

    case 'payrolls.updateStatus': {
      const target = db.Payrolls.find((p) => p.id === payload.id);
      if (!target) return notFound();
      const nextStatus = payload.status;
      let allowed = false;
      if (session.role === 'admin') {
        if (target.status === 'draft' && nextStatus === 'submitted') allowed = true;
        if (target.status === 'approved' && nextStatus === 'paid') allowed = true;
      } else if (session.role === 'kepsek') {
        if (target.status === 'submitted' && (nextStatus === 'approved' || nextStatus === 'draft')) {
          allowed = true;
        }
      }
      if (!allowed) return forbidden();
      target.status = nextStatus;
      if (nextStatus !== 'draft') {
        clearDraftSnapshot(target.id);
      }
      bumpVersions(['payrolls']);
      saveDb(db);
      return { ok: true, status: 200, data: enrichPayrollsWithSyncStatus([target])[0] };
    }

    case 'payrollDetails.byPayroll': {
      if (session.role !== 'admin' && session.role !== 'kepsek') return forbidden();
      let rows = db.Payroll_Details.filter((d) => d.payroll_id === payload.payroll_id);
      if (rows.length === 0) {
        const parent = (db.Payrolls || []).find((p) => p.id === payload.payroll_id);
        if (parent && parent.year && db.Archives) {
          const archKey = `Archive_Payroll_Details_${Number(parent.year)}`;
          const archived = Array.isArray(db.Archives[archKey]) ? db.Archives[archKey] : [];
          rows = archived.filter((d) => d.payroll_id === payload.payroll_id);
        }
      }
      return { ok: true, status: 200, data: rows };
    }

    case 'payslips.myList': {
      if (session.role === 'guru') {
        const own = getOwnedTeacher();
        if (!own) return forbidden();
        const mySlips = db.Payroll_Details.filter((d) => d.teacher_id === own.id)
          .map((d) => {
            const parent = db.Payrolls.find((p) => p.id === d.payroll_id);
            if (!parent) return null;
            const liveApplied = applyLiveDisbursementToDraftDetail(
              d,
              parent,
              db.Disbursement_Requests || []
            );
            return {
              ...d,
              net_salary: liveApplied.net_salary,
              details_json: liveApplied.details_json,
              slip_type: 'payroll',
              month: parent.month,
              year: parent.year,
              payroll_status: parent.status,
              teacher_name: own.name,
              nip: own.nip,
              bank_account: own.bank_account,
            };
          })
          .filter(Boolean);

        const issuedDisbursementSlips = (db.Disbursement_Requests || [])
          .filter(
            (r) =>
              r.teacher_id === own.id &&
              r.status === 'approved' &&
              r.issued_slip_id &&
              r.issued_slip_json
          )
          .map((r) => ({
            id: r.issued_slip_id,
            slip_type: 'disbursement',
            disbursement_request_id: r.id,
            payroll_id: r.payroll_id || r.id,
            teacher_id: own.id,
            month: r.month,
            year: r.year,
            payroll_status: 'paid',
            net_salary: Number(r.approved_amount || 0),
            approved_amount: Number(r.approved_amount || 0),
            request_scope: r.request_scope,
            disbursement_timing: r.disbursement_timing,
            slip_issued_at: r.slip_issued_at,
            teacher_name: own.name,
            nip: own.nip,
            bank_account: own.bank_account,
            details_json: r.issued_slip_json,
          }));

        const combinedSlips = [...issuedDisbursementSlips, ...mySlips].sort((a, b) => {
          const yrDiff = Number(b.year || 0) - Number(a.year || 0);
          if (yrDiff !== 0) return yrDiff;
          const mDiff =
            parsePeriodMonthKey(b.month).endMonth - parsePeriodMonthKey(a.month).endMonth;
          if (mDiff !== 0) return mDiff;
          if (a.slip_type === 'disbursement' && b.slip_type !== 'disbursement') return -1;
          if (a.slip_type !== 'disbursement' && b.slip_type === 'disbursement') return 1;
          return String(b.slip_issued_at || '').localeCompare(String(a.slip_issued_at || ''));
        });

        return { ok: true, status: 200, data: combinedSlips };
      }
      return forbidden();
    }

    case 'disbursements.estimates': {
      if (session.role !== 'guru') return forbidden();
      const own = getOwnedTeacher();
      if (!own) return forbidden();

      const buildEstimateSnapshot = (monthVal, yearVal) => {
        const targetKey = normalizePeriodKey(monthVal);
        const yr = Number(yearVal);
        const matchingPayroll = (db.Payrolls || []).find(
          (p) => normalizePeriodKey(p.month) === targetKey && Number(p.year) === yr
        );
        const matchingDetail = matchingPayroll
          ? (db.Payroll_Details || []).find(
              (d) => d.payroll_id === matchingPayroll.id && d.teacher_id === own.id
            )
          : null;

        let estimatedNet = 0;
        let detailsObj = null;
        let payrollStatus = matchingPayroll ? matchingPayroll.status : 'estimate_live';

        if (matchingDetail) {
          let rawDetails = {};
          try {
            rawDetails = JSON.parse(matchingDetail.details_json || '{}');
          } catch {
            rawDetails = {};
          }
          const storedReimbTotal = Math.max(0, Number(rawDetails.reimbursement_total || 0));
          const prevNetBeforeDisb =
            rawDetails.net_salary_before_disbursement !== undefined &&
            rawDetails.net_salary_before_disbursement !== ''
              ? Math.max(0, Number(rawDetails.net_salary_before_disbursement))
              : Math.max(
                  0,
                  Number(matchingDetail.net_salary || 0) +
                    Number(rawDetails.approved_disbursement_total || 0)
                );
          let fullEstimatedNet = prevNetBeforeDisb;
          let reimbMeta = {
            total: storedReimbTotal,
            count: Number(rawDetails.reimbursement_count || 0),
            items: Array.isArray(rawDetails.reimbursement_items)
              ? rawDetails.reimbursement_items
              : [],
          };
          if (!matchingPayroll || String(matchingPayroll.status) === 'draft') {
            const salaryNetOnly = Math.max(0, prevNetBeforeDisb - storedReimbTotal);
            reimbMeta = getApprovedReimbursementSummaryForPeriod(
              db.Reimbursements || [],
              own.id,
              targetKey,
              yr
            );
            fullEstimatedNet = salaryNetOnly + reimbMeta.total;
          }
          estimatedNet = fullEstimatedNet;
          detailsObj = {
            ...rawDetails,
            reimbursement_total: reimbMeta.total,
            reimbursement_count: reimbMeta.count,
            reimbursement_items: reimbMeta.items,
            net_salary_before_disbursement: fullEstimatedNet,
            estimated_net_salary: fullEstimatedNet,
            net_salary: fullEstimatedNet,
          };
          delete detailsObj.approved_disbursement_total;
          delete detailsObj.approved_disbursement_count;
        } else {
          const comp = db.Salary_Components.find((c) => c.teacher_id === own.id) || {
            base_salary: 0,
            hourly_rate: 0,
            position_allowance: 0,
            bpjs_deduction: 0,
          };
          const parsedPeriod = parsePeriodMonthKey(targetKey);
          const rangeSet = new Set(parsedPeriod.monthsInRange.map((m) => String(m)));
          let att = db.Attendances.find(
            (a) =>
              a.teacher_id === own.id &&
              normalizePeriodKey(a.month) === targetKey &&
              Number(a.year) === yr
          );
          if (!att && parsedPeriod.isRange) {
            const subRows = db.Attendances.filter(
              (a) =>
                a.teacher_id === own.id &&
                Number(a.year) === yr &&
                rangeSet.has(normalizePeriodKey(a.month))
            );
            if (subRows.length > 0) {
              att = {
                present_days: subRows.reduce((s, r) => s + Number(r.present_days || 0), 0),
                absent_days: subRows.reduce((s, r) => s + Number(r.absent_days || 0), 0),
                total_jtm: subRows.reduce((s, r) => s + Number(r.total_jtm || 0), 0),
              };
            }
          }
          if (!att) {
            const logs = (db.Attendance_Logs || []).filter(
              (l) =>
                l.teacher_id === own.id &&
                Number(l.year) === yr &&
                rangeSet.has(String(l.month))
            );
            att = computeAttendanceBreakdownFromLogs(logs);
          }

          const baseSalary = Number(comp.base_salary || 0);
          const hourlyRate = Number(comp.hourly_rate || 0);
          const totalJtm = Number(att.total_jtm || 0);
          const jtmHonor = totalJtm * hourlyRate;
          const posAllowance = Number(comp.position_allowance || 0);
          let customComponents = [];
          try {
            customComponents = JSON.parse(comp.custom_components_json || '[]');
            if (!Array.isArray(customComponents)) customComponents = [];
          } catch {
            customComponents = [];
          }
          const customAllowance = customComponents
            .filter((c) => c.type === 'allowance')
            .reduce((s, c) => s + Number(c.amount || 0), 0);
          const customDeduction = customComponents
            .filter((c) => c.type !== 'allowance')
            .reduce((s, c) => s + Number(c.amount || 0), 0);
          const infaqEnabled = isInfaqZakatEnabled(comp);
          const infaqZakat = calculateInfaqZakat(
            baseSalary,
            jtmHonor,
            posAllowance,
            infaqEnabled,
            customAllowance
          );
          const approvedReimb = getApprovedReimbursementSummaryForPeriod(
            db.Reimbursements || [],
            own.id,
            targetKey,
            yr
          );
          const gross = baseSalary + jtmHonor + posAllowance + customAllowance;
          estimatedNet = Math.max(0, gross - infaqZakat - customDeduction) + approvedReimb.total;

          detailsObj = {
            teacher_name: own.name,
            nip: own.nip,
            staff_category: resolveStaffCategory(own),
            status: own.status,
            bank_account: own.bank_account,
            month: /^\d+$/.test(targetKey) ? Number(targetKey) : targetKey,
            year: yr,
            present_days: Number(att.present_days || 0),
            absent_days: Number(att.absent_days || 0),
            total_jtm: totalJtm,
            base_salary: baseSalary,
            hourly_rate: hourlyRate,
            jtm_honor: jtmHonor,
            position_allowance: posAllowance,
            infaq_zakat_enabled: infaqEnabled,
            infaq_zakat: infaqZakat,
            bpjs_deduction: infaqZakat,
            custom_components: customComponents,
            custom_allowance_total: customAllowance,
            custom_deduction_total: customDeduction,
            gross_salary: gross,
            reimbursement_total: approvedReimb.total,
            reimbursement_count: approvedReimb.count,
            reimbursement_items: approvedReimb.items,
            net_salary_before_disbursement: estimatedNet,
            estimated_net_salary: estimatedNet,
            net_salary: estimatedNet,
          };
        }

        const periodReqs = (db.Disbursement_Requests || []).filter(
          (r) =>
            r.teacher_id === own.id &&
            r.status !== 'rejected' &&
            doesDisbursementMatchPeriod(r.month, r.year, targetKey, yr)
        );
        let alreadyApproved = 0;
        let pendingRequested = 0;
        periodReqs.forEach((r) => {
          if (r.status === 'approved') {
            alreadyApproved += Math.max(0, Number(r.approved_amount ?? r.requested_amount ?? 0));
          } else {
            pendingRequested += Math.max(
              0,
              Number(
                r.status === 'approved_treasurer'
                  ? r.approved_amount ?? r.requested_amount ?? 0
                  : r.requested_amount ?? 0
              )
            );
          }
        });
        const alreadyRequested = alreadyApproved + pendingRequested;
        const netAfterApproved = Math.max(0, estimatedNet - alreadyApproved);
        const isPaid = payrollStatus === 'paid';
        const availableAmount = isPaid ? 0 : Math.max(0, estimatedNet - alreadyRequested);

        return {
          period_key: `${yr}:${targetKey}`,
          month: /^\d+$/.test(targetKey) ? Number(targetKey) : targetKey,
          year: yr,
          payroll_id: matchingPayroll ? matchingPayroll.id : '',
          payroll_detail_id: matchingDetail ? matchingDetail.id : '',
          payroll_status: payrollStatus,
          is_paid: isPaid,
          full_estimated_net_salary: estimatedNet,
          estimated_net_salary: estimatedNet,
          reimbursement_total: Number(detailsObj?.reimbursement_total || 0),
          reimbursement_count: Number(detailsObj?.reimbursement_count || 0),
          net_after_approved_disbursement: netAfterApproved,
          already_requested_amount: alreadyRequested,
          already_approved_amount: alreadyApproved,
          pending_requested_amount: pendingRequested,
          available_amount: availableAmount,
          details: detailsObj,
        };
      };

      const seenPeriods = new Map();
      (db.Payrolls || []).forEach((p) => {
        const k = `${Number(p.year)}:${normalizePeriodKey(p.month)}`;
        if (!seenPeriods.has(k)) {
          seenPeriods.set(k, { month: p.month, year: Number(p.year) });
        }
      });

      const reqMonth = payload.month ? normalizePeriodKey(payload.month) : null;
      const reqYear = payload.year ? Number(payload.year) : null;
      if (reqMonth && reqYear) {
        const rk = `${reqYear}:${reqMonth}`;
        if (!seenPeriods.has(rk)) {
          seenPeriods.set(rk, { month: reqMonth, year: reqYear });
        }
      } else {
        const now = new Date();
        const curM = String(now.getMonth() + 1);
        const curY = now.getFullYear();
        const ck = `${curY}:${curM}`;
        if (!seenPeriods.has(ck)) {
          seenPeriods.set(ck, { month: Number(curM), year: curY });
        }
      }

      const estimates = Array.from(seenPeriods.values())
        .map((p) => buildEstimateSnapshot(p.month, p.year))
        .sort((a, b) => {
          const yrDiff = Number(b.year || 0) - Number(a.year || 0);
          if (yrDiff !== 0) return yrDiff;
          return (
            parsePeriodMonthKey(b.month).endMonth - parsePeriodMonthKey(a.month).endMonth
          );
        });

      return { ok: true, status: 200, data: estimates };
    }

    case 'disbursements.list': {
      const allReqs = [...(db.Disbursement_Requests || [])].sort((a, b) =>
        String(b.created_at || '').localeCompare(String(a.created_at || ''))
      );
      if (session.role === 'guru') {
        const own = getOwnedTeacher();
        if (!own) return forbidden();
        return {
          ok: true,
          status: 200,
          data: allReqs.filter((r) => r.teacher_id === own.id),
        };
      }
      if (session.role === 'admin' || session.role === 'kepsek') {
        return { ok: true, status: 200, data: allReqs };
      }
      return forbidden();
    }

    case 'disbursements.create': {
      if (session.role !== 'guru') return forbidden();
      const own = getOwnedTeacher();
      if (!own) return forbidden();

      const periodKey = normalizePeriodKey(payload.month);
      const year = Number(payload.year);
      if (!periodKey || !year || year < 2020 || year > 2100) {
        return { ok: false, status: 400, error: 'Periode bulan/tahun pencairan tidak valid.' };
      }

      const scope = payload.request_scope === 'full' ? 'full' : 'partial';
      const timing = payload.disbursement_timing === 'early' ? 'early' : 'ontime';
      const reason = String(payload.reason || '').trim().slice(0, 240);

      // Recalculate current estimate & available balance server-side
      const matchingPayroll = (db.Payrolls || []).find(
        (p) => normalizePeriodKey(p.month) === periodKey && Number(p.year) === year
      );
      if (matchingPayroll && matchingPayroll.status === 'paid') {
        return {
          ok: false,
          status: 409,
          error: 'Gaji periode ini sudah dibayarkan penuh secara kolektif.',
        };
      }
      const matchingDetail = matchingPayroll
        ? (db.Payroll_Details || []).find(
            (d) => d.payroll_id === matchingPayroll.id && d.teacher_id === own.id
          )
        : null;

      let estimatedNet = 0;
      let detailsSnapshot = {};
      if (matchingDetail) {
        let rawDetails = {};
        try {
          rawDetails = JSON.parse(matchingDetail.details_json || '{}');
        } catch {
          rawDetails = {};
        }
        const storedReimbTotal = Math.max(0, Number(rawDetails.reimbursement_total || 0));
        const prevNetBeforeDisb =
          rawDetails.net_salary_before_disbursement !== undefined &&
          rawDetails.net_salary_before_disbursement !== ''
            ? Math.max(0, Number(rawDetails.net_salary_before_disbursement))
            : Math.max(
                0,
                Number(matchingDetail.net_salary || 0) +
                  Number(rawDetails.approved_disbursement_total || 0)
              );
        let fullEstimatedNet = prevNetBeforeDisb;
        let reimbMeta = {
          total: storedReimbTotal,
          count: Number(rawDetails.reimbursement_count || 0),
          items: Array.isArray(rawDetails.reimbursement_items)
            ? rawDetails.reimbursement_items
            : [],
        };
        if (!matchingPayroll || String(matchingPayroll.status) === 'draft') {
          const salaryNetOnly = Math.max(0, prevNetBeforeDisb - storedReimbTotal);
          reimbMeta = getApprovedReimbursementSummaryForPeriod(
            db.Reimbursements || [],
            own.id,
            periodKey,
            year
          );
          fullEstimatedNet = salaryNetOnly + reimbMeta.total;
        }
        estimatedNet = fullEstimatedNet;
        detailsSnapshot = {
          ...rawDetails,
          reimbursement_total: reimbMeta.total,
          reimbursement_count: reimbMeta.count,
          reimbursement_items: reimbMeta.items,
          net_salary_before_disbursement: fullEstimatedNet,
          estimated_net_salary: fullEstimatedNet,
          net_salary: fullEstimatedNet,
        };
        delete detailsSnapshot.approved_disbursement_total;
        delete detailsSnapshot.approved_disbursement_count;
      } else {
        const comp = db.Salary_Components.find((c) => c.teacher_id === own.id) || {
          base_salary: 0,
          hourly_rate: 0,
          position_allowance: 0,
          bpjs_deduction: 0,
        };
        const parsedPeriod = parsePeriodMonthKey(periodKey);
        const rangeSet = new Set(parsedPeriod.monthsInRange.map((m) => String(m)));
        let att = db.Attendances.find(
          (a) =>
            a.teacher_id === own.id &&
            normalizePeriodKey(a.month) === periodKey &&
            Number(a.year) === year
        );
        if (!att && parsedPeriod.isRange) {
          const subRows = db.Attendances.filter(
            (a) =>
              a.teacher_id === own.id &&
              Number(a.year) === year &&
              rangeSet.has(normalizePeriodKey(a.month))
          );
          if (subRows.length > 0) {
            att = {
              present_days: subRows.reduce((s, r) => s + Number(r.present_days || 0), 0),
              absent_days: subRows.reduce((s, r) => s + Number(r.absent_days || 0), 0),
              total_jtm: subRows.reduce((s, r) => s + Number(r.total_jtm || 0), 0),
            };
          }
        }
        if (!att) {
          const logs = (db.Attendance_Logs || []).filter(
            (l) =>
              l.teacher_id === own.id &&
              Number(l.year) === year &&
              rangeSet.has(String(l.month))
          );
          att = computeAttendanceBreakdownFromLogs(logs);
        }
        const baseSalary = Number(comp.base_salary || 0);
        const hourlyRate = Number(comp.hourly_rate || 0);
        const totalJtm = Number(att.total_jtm || 0);
        const jtmHonor = totalJtm * hourlyRate;
        const posAllowance = Number(comp.position_allowance || 0);
        let customComponents = [];
        try {
          customComponents = JSON.parse(comp.custom_components_json || '[]');
          if (!Array.isArray(customComponents)) customComponents = [];
        } catch {
          customComponents = [];
        }
        const customAllowance = customComponents
          .filter((c) => c.type === 'allowance')
          .reduce((s, c) => s + Number(c.amount || 0), 0);
        const customDeduction = customComponents
          .filter((c) => c.type !== 'allowance')
          .reduce((s, c) => s + Number(c.amount || 0), 0);
        const infaqEnabled = isInfaqZakatEnabled(comp);
        const infaqZakat = calculateInfaqZakat(
          baseSalary,
          jtmHonor,
          posAllowance,
          infaqEnabled,
          customAllowance
        );
        const approvedReimb = getApprovedReimbursementSummaryForPeriod(
          db.Reimbursements || [],
          own.id,
          periodKey,
          year
        );
        const gross = baseSalary + jtmHonor + posAllowance + customAllowance;
        estimatedNet = Math.max(0, gross - infaqZakat - customDeduction) + approvedReimb.total;
        detailsSnapshot = {
          teacher_name: own.name,
          nip: own.nip,
          staff_category: resolveStaffCategory(own),
          status: own.status,
          bank_account: own.bank_account,
          month: /^\d+$/.test(periodKey) ? Number(periodKey) : periodKey,
          year,
          present_days: Number(att.present_days || 0),
          absent_days: Number(att.absent_days || 0),
          total_jtm: totalJtm,
          base_salary: baseSalary,
          hourly_rate: hourlyRate,
          jtm_honor: jtmHonor,
          position_allowance: posAllowance,
          infaq_zakat_enabled: infaqEnabled,
          infaq_zakat: infaqZakat,
          bpjs_deduction: infaqZakat,
          custom_components: customComponents,
          custom_allowance_total: customAllowance,
          custom_deduction_total: customDeduction,
          gross_salary: gross,
          reimbursement_total: approvedReimb.total,
          reimbursement_count: approvedReimb.count,
          reimbursement_items: approvedReimb.items,
          net_salary_before_disbursement: estimatedNet,
          estimated_net_salary: estimatedNet,
          net_salary: estimatedNet,
        };
      }

      const activeRequestedSum = (db.Disbursement_Requests || [])
        .filter(
          (r) =>
            r.teacher_id === own.id &&
            r.status !== 'rejected' &&
            doesDisbursementMatchPeriod(r.month, r.year, periodKey, year)
        )
        .reduce(
          (s, r) =>
            s +
            Number(
              r.status === 'approved' || r.status === 'approved_treasurer'
                ? r.approved_amount ?? r.requested_amount ?? 0
                : r.requested_amount ?? 0
            ),
          0
        );
      const availableBalance = Math.max(0, estimatedNet - activeRequestedSum);
      if (availableBalance <= 0) {
        return {
          ok: false,
          status: 400,
          error:
            'Sisa estimasi gaji bersih periode ini sudah habis atau seluruhnya sedang diajukan.',
        };
      }

      const requestedAmount =
        scope === 'full'
          ? availableBalance
          : Math.round(Number(payload.requested_amount || 0));

      if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
        return { ok: false, status: 400, error: 'Nominal pengajuan pencairan harus lebih dari Rp 0.' };
      }
      if (requestedAmount > availableBalance) {
        return {
          ok: false,
          status: 400,
          error: `Nominal melebihi sisa estimasi tersedia (maksimal Rp ${availableBalance.toLocaleString('id-ID')}).`,
        };
      }

      const nowIso = new Date().toISOString();
      const newReq = {
        id: generateUuidV4(),
        teacher_id: own.id,
        teacher_name: own.name,
        nip: own.nip,
        month: /^\d+$/.test(periodKey) ? Number(periodKey) : periodKey,
        year,
        payroll_id: matchingPayroll ? matchingPayroll.id : '',
        payroll_detail_id: matchingDetail ? matchingDetail.id : '',
        estimated_net_salary: estimatedNet,
        request_scope: scope,
        disbursement_timing: timing,
        requested_amount: requestedAmount,
        approved_amount: requestedAmount,
        reason,
        status: 'pending_treasurer',
        treasurer_note: '',
        kepsek_note: '',
        issued_slip_id: '',
        issued_slip_json: JSON.stringify(detailsSnapshot),
        created_at: nowIso,
        treasurer_reviewed_at: '',
        kepsek_reviewed_at: '',
        slip_issued_at: '',
      };

      db.Disbursement_Requests.unshift(newReq);

      const adminEmails = (db.Users_Auth || [])
        .filter((u) => u.role === 'admin')
        .map((u) => String(u.email || u.username || '').trim())
        .filter((e) => e.includes('@'));

      const timingLabel =
        timing === 'early' ? 'Sebelum Waktunya (Pencairan Awal)' : 'Tepat Waktu (Kolektif)';
      const scopeLabel = scope === 'full' ? 'Seluruhnya' : 'Sebagian';

      db.Notifications.unshift({
        id: generateUuidV4(),
        recipient_role: 'admin',
        recipient_teacher_id: '',
        recipient_email: adminEmails.join(', '),
        title: `Pengajuan Pencairan Gaji: ${own.name}`,
        message: `${own.name} mengajukan pencairan ${scopeLabel} (${timingLabel}) sebesar Rp ${requestedAmount.toLocaleString('id-ID')} untuk periode ${periodKey}/${year}.${reason ? ` Catatan: ${reason}` : ''}`,
        type: 'disbursement_submitted',
        ref_id: newReq.id,
        is_read: false,
        created_at: nowIso,
      });

      bumpVersions(['disbursements', 'notifications']);
      saveDb(db);
      return {
        ok: true,
        status: 201,
        data: {
          request: newReq,
          notified_admin_emails: adminEmails,
          email_sent: true,
          simulation_email_notice:
            adminEmails.length > 0
              ? `Notifikasi email simulasi dicatat untuk ${adminEmails.join(', ')}`
              : '',
        },
      };
    }

    case 'disbursements.treasurerReview': {
      if (session.role !== 'admin') return forbidden();
      const target = (db.Disbursement_Requests || []).find((r) => r.id === payload.id);
      if (!target) return notFound();
      if (target.status !== 'pending_treasurer') {
        return {
          ok: false,
          status: 409,
          error: 'Pengajuan ini sudah diproses Bendahara sebelumnya.',
        };
      }

      const decision = payload.decision === 'reject' ? 'reject' : 'approve';
      const note = String(payload.note || '').trim().slice(0, 240);
      const nowIso = new Date().toISOString();

      if (decision === 'reject') {
        target.status = 'rejected';
        target.treasurer_note = note || 'Ditolak oleh Admin/Bendahara.';
        target.treasurer_reviewed_at = nowIso;

        db.Notifications.unshift({
          id: generateUuidV4(),
          recipient_role: 'guru',
          recipient_teacher_id: target.teacher_id,
          recipient_email: '',
          title: 'Pengajuan Pencairan Ditolak Bendahara',
          message: `Pengajuan pencairan periode ${target.month}/${target.year} sebesar Rp ${Number(target.requested_amount).toLocaleString('id-ID')} ditolak.${note ? ` Alasan: ${note}` : ''}`,
          type: 'disbursement_rejected',
          ref_id: target.id,
          is_read: false,
          created_at: nowIso,
        });
      } else {
        const approvedAmt =
          payload.approved_amount !== undefined && Number(payload.approved_amount) > 0
            ? Math.round(Number(payload.approved_amount))
            : Number(target.requested_amount);
        target.approved_amount = Math.min(approvedAmt, Number(target.estimated_net_salary || approvedAmt));
        target.status = 'approved_treasurer';
        target.treasurer_note = note;
        target.treasurer_reviewed_at = nowIso;

        db.Notifications.unshift({
          id: generateUuidV4(),
          recipient_role: 'kepsek',
          recipient_teacher_id: '',
          recipient_email: '',
          title: `Menunggu Otorisasi Pencairan: ${target.teacher_name}`,
          message: `Bendahara telah menyetujui pengajuan pencairan ${target.teacher_name} sebesar Rp ${Number(target.approved_amount).toLocaleString('id-ID')}. Menunggu persetujuan Kepala Sekolah.`,
          type: 'disbursement_treasurer_approved',
          ref_id: target.id,
          is_read: false,
          created_at: nowIso,
        });
      }

      bumpVersions(['disbursements', 'notifications']);
      saveDb(db);
      return { ok: true, status: 200, data: target };
    }

    case 'disbursements.bulkTreasurerApprove': {
      if (session.role !== 'admin') return forbidden();
      const ids = Array.isArray(payload.ids) ? payload.ids : [];
      const note = String(payload.note || '').trim().slice(0, 240);
      const nowIso = new Date().toISOString();
      const updatedList = [];

      (db.Disbursement_Requests || []).forEach((target) => {
        if (target.status === 'pending_treasurer' && (ids.length === 0 || ids.includes(target.id))) {
          target.approved_amount = Number(target.requested_amount || 0);
          target.status = 'approved_treasurer';
          target.treasurer_note = note || 'Disetujui kolektif oleh Bendahara.';
          target.treasurer_reviewed_at = nowIso;
          updatedList.push(target);
        }
      });

      if (updatedList.length === 0) {
        return { ok: false, status: 400, error: 'Tidak ada pengajuan menunggu yang dapat disetujui.' };
      }

      db.Notifications.unshift({
        id: generateUuidV4(),
        recipient_role: 'kepsek',
        recipient_teacher_id: '',
        recipient_email: '',
        title: `${updatedList.length} Pengajuan Pencairan PTK Siap Diotorisasi`,
        message: `Bendahara telah menyetujui ${updatedList.length} pengajuan pencairan PTK secara kolektif dan meneruskannya untuk otorisasi Kepala Sekolah.`,
        type: 'disbursement_treasurer_approved',
        ref_id: updatedList[0].id,
        is_read: false,
        created_at: nowIso,
      });

      bumpVersions(['disbursements', 'notifications']);
      saveDb(db);
      return { ok: true, status: 200, data: updatedList };
    }

    case 'disbursements.kepsekReview': {
      if (session.role !== 'kepsek') return forbidden();
      const target = (db.Disbursement_Requests || []).find((r) => r.id === payload.id);
      if (!target) return notFound();
      if (target.status !== 'approved_treasurer') {
        return {
          ok: false,
          status: 409,
          error: 'Pengajuan harus disetujui Bendahara terlebih dahulu sebelum diotorisasi Kepsek.',
        };
      }

      const decision = payload.decision === 'reject' ? 'reject' : 'approve';
      const note = String(payload.note || '').trim().slice(0, 240);
      const nowIso = new Date().toISOString();

      if (decision === 'reject') {
        target.status = 'rejected';
        target.kepsek_note = note || 'Ditolak oleh Kepala Sekolah.';
        target.kepsek_reviewed_at = nowIso;

        db.Notifications.unshift({
          id: generateUuidV4(),
          recipient_role: 'guru',
          recipient_teacher_id: target.teacher_id,
          recipient_email: '',
          title: 'Pengajuan Pencairan Ditolak Kepsek',
          message: `Pengajuan pencairan Anda periode ${target.month}/${target.year} tidak disetujui Kepala Sekolah.${note ? ` Alasan: ${note}` : ''}`,
          type: 'disbursement_rejected',
          ref_id: target.id,
          is_read: false,
          created_at: nowIso,
        });
      } else {
        target.status = 'approved';
        target.kepsek_note = note;
        target.kepsek_reviewed_at = nowIso;
        target.slip_issued_at = nowIso;

        const slipId = generateUuidV4();
        target.issued_slip_id = slipId;

        let baseDetails = {};
        try {
          baseDetails = JSON.parse(target.issued_slip_json || '{}');
        } catch {
          baseDetails = {};
        }

        const priorApprovedTotal = (db.Disbursement_Requests || [])
          .filter(
            (r) =>
              r.id !== target.id &&
              r.teacher_id === target.teacher_id &&
              r.status === 'approved' &&
              doesDisbursementMatchPeriod(r.month, r.year, target.month, target.year)
          )
          .reduce((s, r) => s + Number(r.approved_amount || 0), 0);

        const approvedAmt = Number(target.approved_amount || target.requested_amount || 0);
        const estNet = Number(target.estimated_net_salary || approvedAmt);
        const remainingEst = Math.max(0, estNet - priorApprovedTotal - approvedAmt);

        const slipDetails = {
          ...baseDetails,
          slip_type: 'disbursement',
          disbursement_request_id: target.id,
          request_scope: target.request_scope,
          disbursement_timing: target.disbursement_timing,
          estimated_net_salary: estNet,
          approved_amount: approvedAmt,
          remaining_estimated_salary: remainingEst,
          treasurer_note: target.treasurer_note || '',
          kepsek_note: note,
          slip_issued_at: nowIso,
          net_salary: approvedAmt,
        };
        target.issued_slip_json = JSON.stringify(slipDetails);

        db.Notifications.unshift(
          {
            id: generateUuidV4(),
            recipient_role: 'guru',
            recipient_teacher_id: target.teacher_id,
            recipient_email: '',
            title: 'Slip Gaji Pencairan Resmi Terbit!',
            message: `Pengajuan pencairan periode ${target.month}/${target.year} sebesar Rp ${approvedAmt.toLocaleString('id-ID')} telah disetujui Bendahara & Kepsek. Slip Gaji siap diunduh.`,
            type: 'disbursement_issued',
            ref_id: target.id,
            is_read: false,
            created_at: nowIso,
          },
          {
            id: generateUuidV4(),
            recipient_role: 'admin',
            recipient_teacher_id: '',
            recipient_email: '',
            title: `Slip Pencairan Terbit: ${target.teacher_name}`,
            message: `Kepsek telah menyetujui pencairan ${target.teacher_name} sebesar Rp ${approvedAmt.toLocaleString('id-ID')}. Slip resmi otomatis diterbitkan ke PTK.`,
            type: 'disbursement_issued',
            ref_id: target.id,
            is_read: false,
            created_at: nowIso,
          }
        );
      }

      if (decision === 'approve') {
        bumpVersions(
          ['disbursements', 'notifications'],
          [],
          [{ month: target.month, year: target.year }]
        );
      } else {
        bumpVersions(['disbursements', 'notifications']);
      }
      saveDb(db);
      return { ok: true, status: 200, data: target };
    }

    case 'reimbursements.list': {
      const allReimbs = [...(db.Reimbursements || [])].sort((a, b) =>
        String(b.created_at || '').localeCompare(String(a.created_at || ''))
      );
      if (session.role === 'guru') {
        const own = getOwnedTeacher();
        if (!own) return forbidden();
        return {
          ok: true,
          status: 200,
          data: allReimbs.filter((r) => r.teacher_id === own.id),
        };
      }
      if (session.role === 'admin' || session.role === 'kepsek') {
        return { ok: true, status: 200, data: allReimbs };
      }
      return forbidden();
    }

    case 'reimbursements.create': {
      if (!['guru', 'admin'].includes(session.role)) return forbidden();
      const isAdminRoutine = session.role === 'admin';
      const own = isAdminRoutine ? null : getOwnedTeacher();
      if (!isAdminRoutine && !own) return forbidden();

      const expenseDate = String(payload.expense_date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
        return { ok: false, status: 400, error: 'Tanggal pembelian wajib format YYYY-MM-DD.' };
      }
      if (expenseDate > getTodayIsoDate()) {
        return {
          ok: false,
          status: 400,
          error: 'Tanggal pembelian tidak boleh melebihi hari ini.',
        };
      }
      const periodKey = normalizePeriodKey(payload.month);
      const year = Number(payload.year);
      if (!periodKey || !year || year < 2020 || year > 2100) {
        return { ok: false, status: 400, error: 'Periode bulan/tahun masuk slip gaji tidak valid.' };
      }
      if (!isAdminRoutine && isTargetPayrollPeriodLocked(periodKey, year)) {
        return {
          ok: false,
          status: 409,
          error:
            'Periode penggajian tujuan sudah diajukan/dikunci. Pilih periode bulan berikutnya.',
        };
      }

      const title = String(payload.title || '').trim().slice(0, 180);
      if (!title) {
        return { ok: false, status: 400, error: 'Uraian keperluan belanja sekolah wajib diisi.' };
      }
      const amount = Math.round(Number(payload.amount || 0));
      if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, status: 400, error: 'Nominal pengeluaran harus lebih dari Rp 0.' };
      }
      const urlCheck = sanitizeReceiptUrl(payload.receipt_url);
      if (!urlCheck.ok) {
        return { ok: false, status: 400, error: urlCheck.error };
      }

      const nowIso = new Date().toISOString();
      const actorName =
        String(session.name || session.teacherName || 'Bendahara / Admin').trim() ||
        'Bendahara / Admin';
      const newItem = {
        id: generateUuidV4(),
        teacher_id: isAdminRoutine ? ADMIN_ROUTINE_TEACHER_ID : own.id,
        teacher_name: isAdminRoutine ? actorName : own.name,
        nip: isAdminRoutine ? 'BENDAHARA' : own.nip,
        expense_date: expenseDate,
        month: /^\d+$/.test(periodKey) ? Number(periodKey) : periodKey,
        year,
        category:
          String(payload.category || (isAdminRoutine ? 'utilitas' : 'lainnya'))
            .trim()
            .slice(0, 40) || 'lainnya',
        title,
        receipt_number: String(payload.receipt_number || '').trim().slice(0, 80),
        receipt_url: urlCheck.value,
        note: String(payload.note || '').trim().slice(0, 300),
        amount,
        approved_amount: amount,
        status: isAdminRoutine ? 'approved_treasurer' : 'pending_treasurer',
        treasurer_note: isAdminRoutine ? 'Dicatat langsung oleh Bendahara / Admin.' : '',
        kepsek_note: '',
        created_at: nowIso,
        updated_at: nowIso,
        treasurer_reviewed_at: isAdminRoutine ? nowIso : '',
        kepsek_reviewed_at: '',
      };

      if (!Array.isArray(db.Reimbursements)) db.Reimbursements = [];
      db.Reimbursements.unshift(newItem);

      if (isAdminRoutine) {
        const kepsekEmails = (db.Users_Auth || [])
          .filter((u) => u.role === 'kepsek')
          .map((u) => String(u.email || u.username || '').trim())
          .filter((e) => e.includes('@'));

        db.Notifications.unshift({
          id: generateUuidV4(),
          recipient_role: 'kepsek',
          recipient_teacher_id: '',
          recipient_email: kepsekEmails.join(', '),
          title: 'Belanja Rutin Bendahara Menunggu Otorisasi',
          message: `${actorName} mencatat belanja sekolah rutinan "${title}" sebesar Rp ${amount.toLocaleString('id-ID')} untuk periode ${periodKey}/${year}.`,
          type: 'reimbursement_treasurer_approved',
          ref_id: newItem.id,
          is_read: false,
          created_at: nowIso,
        });

        bumpVersions(['reimbursements', 'notifications']);
        saveDb(db);
        return {
          ok: true,
          status: 201,
          data: {
            item: newItem,
            notified_kepsek_emails: kepsekEmails,
            email_sent: true,
          },
        };
      }

      const adminEmails = (db.Users_Auth || [])
        .filter((u) => u.role === 'admin')
        .map((u) => String(u.email || u.username || '').trim())
        .filter((e) => e.includes('@'));

      db.Notifications.unshift({
        id: generateUuidV4(),
        recipient_role: 'admin',
        recipient_teacher_id: '',
        recipient_email: adminEmails.join(', '),
        title: `Catatan Belanja Sekolah Baru: ${own.name}`,
        message: `${own.name} mencatat belanja sekolah "${title}" sebesar Rp ${amount.toLocaleString('id-ID')} untuk slip periode ${periodKey}/${year}.`,
        type: 'reimbursement_submitted',
        ref_id: newItem.id,
        is_read: false,
        created_at: nowIso,
      });

      bumpVersions(['reimbursements', 'notifications']);
      saveDb(db);
      return {
        ok: true,
        status: 201,
        data: {
          item: newItem,
          notified_admin_emails: adminEmails,
          email_sent: true,
        },
      };
    }

    case 'reimbursements.update': {
      if (!['guru', 'admin'].includes(session.role)) return forbidden();
      const isAdminRoutine = session.role === 'admin';
      const own = isAdminRoutine ? null : getOwnedTeacher();
      if (!isAdminRoutine && !own) return forbidden();
      const target = (db.Reimbursements || []).find((r) => r.id === payload.id);
      if (!target) return notFound();

      if (isAdminRoutine) {
        if (target.teacher_id !== ADMIN_ROUTINE_TEACHER_ID) return forbidden();
        if (target.status !== 'approved_treasurer') {
          return {
            ok: false,
            status: 409,
            error:
              'Hanya catatan belanja rutin yang masih menunggu otorisasi Kepala Sekolah yang dapat diubah.',
          };
        }
      } else {
        if (target.teacher_id !== own.id) return forbidden();
        if (target.status !== 'pending_treasurer') {
          return {
            ok: false,
            status: 409,
            error: 'Hanya catatan yang masih menunggu verifikasi Bendahara yang dapat diubah.',
          };
        }
      }

      const expenseDate = String(payload.expense_date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
        return { ok: false, status: 400, error: 'Tanggal pembelian wajib format YYYY-MM-DD.' };
      }
      if (expenseDate > getTodayIsoDate()) {
        return {
          ok: false,
          status: 400,
          error: 'Tanggal pembelian tidak boleh melebihi hari ini.',
        };
      }
      const periodKey = normalizePeriodKey(payload.month);
      const year = Number(payload.year);
      if (!periodKey || !year || year < 2020 || year > 2100) {
        return { ok: false, status: 400, error: 'Periode bulan/tahun masuk slip gaji tidak valid.' };
      }
      if (!isAdminRoutine && isTargetPayrollPeriodLocked(periodKey, year)) {
        return {
          ok: false,
          status: 409,
          error:
            'Periode penggajian tujuan sudah diajukan/dikunci. Pilih periode bulan berikutnya.',
        };
      }

      const title = String(payload.title || '').trim().slice(0, 180);
      if (!title) {
        return { ok: false, status: 400, error: 'Uraian keperluan belanja sekolah wajib diisi.' };
      }
      const amount = Math.round(Number(payload.amount || 0));
      if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, status: 400, error: 'Nominal pengeluaran harus lebih dari Rp 0.' };
      }
      const urlCheck = sanitizeReceiptUrl(payload.receipt_url);
      if (!urlCheck.ok) {
        return { ok: false, status: 400, error: urlCheck.error };
      }

      target.expense_date = expenseDate;
      target.month = /^\d+$/.test(periodKey) ? Number(periodKey) : periodKey;
      target.year = year;
      target.category = String(payload.category || 'lainnya').trim().slice(0, 40) || 'lainnya';
      target.title = title;
      target.receipt_number = String(payload.receipt_number || '').trim().slice(0, 80);
      target.receipt_url = urlCheck.value;
      target.note = String(payload.note || '').trim().slice(0, 300);
      target.amount = amount;
      target.approved_amount = amount;
      target.updated_at = new Date().toISOString();

      bumpVersions(['reimbursements']);
      saveDb(db);
      return { ok: true, status: 200, data: target };
    }

    case 'reimbursements.delete': {
      if (!['guru', 'admin'].includes(session.role)) return forbidden();
      const isAdminRoutine = session.role === 'admin';
      const own = isAdminRoutine ? null : getOwnedTeacher();
      if (!isAdminRoutine && !own) return forbidden();
      const idx = (db.Reimbursements || []).findIndex((r) => r.id === payload.id);
      if (idx === -1) return notFound();
      const target = db.Reimbursements[idx];
      if (isAdminRoutine) {
        if (target.teacher_id !== ADMIN_ROUTINE_TEACHER_ID) return forbidden();
        if (target.status !== 'approved_treasurer') {
          return {
            ok: false,
            status: 409,
            error: 'Catatan belanja rutin yang sudah diotorisasi/ditolak Kepsek tidak dapat dihapus.',
          };
        }
      } else {
        if (target.teacher_id !== own.id) return forbidden();
        if (target.status !== 'pending_treasurer') {
          return {
            ok: false,
            status: 409,
            error: 'Catatan yang sudah diproses Bendahara/Kepsek tidak dapat dihapus.',
          };
        }
      }
      db.Reimbursements.splice(idx, 1);
      bumpVersions(['reimbursements']);
      saveDb(db);
      return { ok: true, status: 200, data: { deletedId: target.id } };
    }

    case 'reimbursements.treasurerReview': {
      if (session.role !== 'admin') return forbidden();
      const target = (db.Reimbursements || []).find((r) => r.id === payload.id);
      if (!target) return notFound();
      if (target.status !== 'pending_treasurer') {
        return {
          ok: false,
          status: 409,
          error: 'Catatan belanja ini sudah diproses Bendahara sebelumnya.',
        };
      }

      const decision = payload.decision === 'reject' ? 'reject' : 'approve';
      const note = String(payload.note || '').trim().slice(0, 240);
      const nowIso = new Date().toISOString();

      if (decision === 'reject') {
        target.status = 'rejected';
        target.treasurer_note = note || 'Ditolak oleh Admin/Bendahara.';
        target.treasurer_reviewed_at = nowIso;
        target.updated_at = nowIso;

        db.Notifications.unshift({
          id: generateUuidV4(),
          recipient_role: 'guru',
          recipient_teacher_id: target.teacher_id,
          recipient_email: '',
          title: 'Catatan Belanja Sekolah Ditolak Bendahara',
          message: `Catatan belanja "${target.title}" sebesar Rp ${Number(target.amount).toLocaleString('id-ID')} tidak disetujui.${note ? ` Alasan: ${note}` : ''}`,
          type: 'reimbursement_rejected',
          ref_id: target.id,
          is_read: false,
          created_at: nowIso,
        });
      } else {
        const nextPeriodKey = normalizePeriodKey(
          payload.month !== undefined && payload.month !== '' ? payload.month : target.month
        );
        const nextYear = Number(
          payload.year !== undefined && payload.year !== '' ? payload.year : target.year
        );
        if (!nextPeriodKey || !nextYear || nextYear < 2020 || nextYear > 2100) {
          return { ok: false, status: 400, error: 'Periode bulan/tahun tujuan tidak valid.' };
        }
        if (isTargetPayrollPeriodLocked(nextPeriodKey, nextYear)) {
          return {
            ok: false,
            status: 409,
            error:
              'Periode penggajian tujuan sudah diajukan/dikunci. Geser ke periode bulan berikutnya.',
          };
        }
        const approvedAmt =
          payload.approved_amount !== undefined && payload.approved_amount !== ''
            ? Math.round(Number(payload.approved_amount))
            : Number(target.amount);
        if (!Number.isFinite(approvedAmt) || approvedAmt <= 0) {
          return { ok: false, status: 400, error: 'Nominal disetujui harus lebih dari Rp 0.' };
        }

        target.month = /^\d+$/.test(nextPeriodKey) ? Number(nextPeriodKey) : nextPeriodKey;
        target.year = nextYear;
        target.approved_amount = approvedAmt;
        target.status = 'approved_treasurer';
        target.treasurer_note = note;
        target.treasurer_reviewed_at = nowIso;
        target.updated_at = nowIso;

        db.Notifications.unshift({
          id: generateUuidV4(),
          recipient_role: 'kepsek',
          recipient_teacher_id: '',
          recipient_email: '',
          title: `Menunggu Otorisasi Belanja: ${target.teacher_name}`,
          message: `Bendahara memverifikasi belanja "${target.title}" (${target.teacher_name}) sebesar Rp ${approvedAmt.toLocaleString('id-ID')} untuk slip ${target.month}/${target.year}.`,
          type: 'reimbursement_treasurer_approved',
          ref_id: target.id,
          is_read: false,
          created_at: nowIso,
        });
      }

      bumpVersions(['reimbursements', 'notifications']);
      saveDb(db);
      return { ok: true, status: 200, data: target };
    }

    case 'reimbursements.bulkTreasurerApprove': {
      if (session.role !== 'admin') return forbidden();
      const ids = Array.isArray(payload.ids) ? payload.ids : [];
      const note = String(payload.note || '').trim().slice(0, 240);
      const nowIso = new Date().toISOString();
      const updatedList = [];
      let lockedSkipped = 0;

      (db.Reimbursements || []).forEach((target) => {
        if (target.status === 'pending_treasurer' && (ids.length === 0 || ids.includes(target.id))) {
          if (isTargetPayrollPeriodLocked(target.month, target.year)) {
            lockedSkipped += 1;
            return;
          }
          target.approved_amount = Number(target.approved_amount || target.amount || 0);
          target.status = 'approved_treasurer';
          target.treasurer_note = note || 'Diverifikasi kolektif oleh Bendahara.';
          target.treasurer_reviewed_at = nowIso;
          target.updated_at = nowIso;
          updatedList.push(target);
        }
      });

      if (updatedList.length === 0) {
        if (lockedSkipped > 0) {
          return {
            ok: false,
            status: 409,
            error:
              'Periode penggajian tujuan catatan belanja sudah terkunci. Geser periode secara satuan terlebih dahulu.',
          };
        }
        return {
          ok: false,
          status: 400,
          error: 'Tidak ada catatan belanja menunggu yang dapat diverifikasi.',
        };
      }

      db.Notifications.unshift({
        id: generateUuidV4(),
        recipient_role: 'kepsek',
        recipient_teacher_id: '',
        recipient_email: '',
        title: `${updatedList.length} Belanja Sekolah PTK Siap Diotorisasi`,
        message: `Bendahara telah memverifikasi ${updatedList.length} catatan belanja sekolah PTK dan meneruskannya ke Kepala Sekolah.`,
        type: 'reimbursement_treasurer_approved',
        ref_id: updatedList[0].id,
        is_read: false,
        created_at: nowIso,
      });

      bumpVersions(['reimbursements', 'notifications']);
      saveDb(db);
      return { ok: true, status: 200, data: updatedList };
    }

    case 'reimbursements.kepsekReview': {
      if (session.role !== 'kepsek') return forbidden();
      const target = (db.Reimbursements || []).find((r) => r.id === payload.id);
      if (!target) return notFound();
      if (target.status !== 'approved_treasurer') {
        return {
          ok: false,
          status: 409,
          error: 'Catatan belanja harus diverifikasi Bendahara terlebih dahulu sebelum diotorisasi Kepsek.',
        };
      }

      const decision = payload.decision === 'reject' ? 'reject' : 'approve';
      const note = String(payload.note || '').trim().slice(0, 240);
      const nowIso = new Date().toISOString();
      const isAdminRoutine = target.teacher_id === ADMIN_ROUTINE_TEACHER_ID;

      if (decision === 'reject') {
        target.status = 'rejected';
        target.kepsek_note = note || 'Ditolak oleh Kepala Sekolah.';
        target.kepsek_reviewed_at = nowIso;
        target.updated_at = nowIso;

        if (isAdminRoutine) {
          db.Notifications.unshift({
            id: generateUuidV4(),
            recipient_role: 'admin',
            recipient_teacher_id: '',
            recipient_email: '',
            title: 'Belanja Rutin Bendahara Ditolak Kepsek',
            message: `Belanja sekolah rutinan "${target.title}" periode ${target.month}/${target.year} tidak disetujui Kepala Sekolah.${note ? ` Alasan: ${note}` : ''}`,
            type: 'reimbursement_rejected',
            ref_id: target.id,
            is_read: false,
            created_at: nowIso,
          });
        } else {
          db.Notifications.unshift({
            id: generateUuidV4(),
            recipient_role: 'guru',
            recipient_teacher_id: target.teacher_id,
            recipient_email: '',
            title: 'Belanja Sekolah Ditolak Kepsek',
            message: `Penggantian belanja "${target.title}" periode ${target.month}/${target.year} tidak disetujui Kepala Sekolah.${note ? ` Alasan: ${note}` : ''}`,
            type: 'reimbursement_rejected',
            ref_id: target.id,
            is_read: false,
            created_at: nowIso,
          });
        }

        bumpVersions(['reimbursements', 'notifications']);
      } else {
        if (!isAdminRoutine && isTargetPayrollPeriodLocked(target.month, target.year)) {
          return {
            ok: false,
            status: 409,
            error: `Periode ${target.month}/${target.year} sudah diajukan/dikunci. Minta Bendahara memindahkan target periode.`,
          };
        }
        const approvedAmt = Math.round(Number(target.approved_amount ?? target.amount ?? 0));
        target.approved_amount = approvedAmt;
        target.status = 'approved';
        target.kepsek_note = note;
        target.kepsek_reviewed_at = nowIso;
        target.updated_at = nowIso;

        if (isAdminRoutine) {
          db.Notifications.unshift({
            id: generateUuidV4(),
            recipient_role: 'admin',
            recipient_teacher_id: '',
            recipient_email: '',
            title: 'Belanja Rutin Bendahara Disetujui Kepsek!',
            message: `Pengeluaran rutin "${target.title}" sebesar Rp ${approvedAmt.toLocaleString('id-ID')} (periode ${target.month}/${target.year}) telah disetujui Kepala Sekolah.`,
            type: 'reimbursement_approved',
            ref_id: target.id,
            is_read: false,
            created_at: nowIso,
          });
          bumpVersions(['reimbursements', 'notifications']);
        } else {
          db.Notifications.unshift(
            {
              id: generateUuidV4(),
              recipient_role: 'guru',
              recipient_teacher_id: target.teacher_id,
              recipient_email: '',
              title: 'Penggantian Belanja Sekolah Disetujui!',
              message: `Belanja "${target.title}" sebesar Rp ${approvedAmt.toLocaleString('id-ID')} disetujui Kepsek dan masuk slip gaji ${target.month}/${target.year} (Bebas Infaq 2,5%).`,
              type: 'reimbursement_approved',
              ref_id: target.id,
              is_read: false,
              created_at: nowIso,
            },
            {
              id: generateUuidV4(),
              recipient_role: 'admin',
              recipient_teacher_id: '',
              recipient_email: '',
              title: `Belanja Sekolah Disetujui: ${target.teacher_name}`,
              message: `Kepsek menyetujui penggantian belanja "${target.title}" (${target.teacher_name}) sebesar Rp ${approvedAmt.toLocaleString('id-ID')} untuk slip ${target.month}/${target.year}.`,
              type: 'reimbursement_approved',
              ref_id: target.id,
              is_read: false,
              created_at: nowIso,
            }
          );

          bumpVersions(
            ['reimbursements', 'notifications'],
            [],
            [],
            [{ month: target.month, year: target.year }]
          );
        }
      }

      saveDb(db);
      return { ok: true, status: 200, data: target };
    }

    case 'reimbursements.bulkKepsekApprove': {
      if (session.role !== 'kepsek') return forbidden();
      const ids = Array.isArray(payload.ids) ? payload.ids : [];
      const note = String(payload.note || '').trim().slice(0, 240);
      const nowIso = new Date().toISOString();
      const updatedList = [];
      const approvedPeriods = [];
      let lockedSkipped = 0;

      (db.Reimbursements || []).forEach((target) => {
        if (target.status === 'approved_treasurer' && (ids.length === 0 || ids.includes(target.id))) {
          const isAdminRoutine = target.teacher_id === ADMIN_ROUTINE_TEACHER_ID;
          if (!isAdminRoutine && isTargetPayrollPeriodLocked(target.month, target.year)) {
            lockedSkipped += 1;
            return;
          }
          const approvedAmt = Math.round(Number(target.approved_amount ?? target.amount ?? 0));
          target.approved_amount = approvedAmt;
          target.status = 'approved';
          target.kepsek_note = note || 'Diotorisasi kolektif oleh Kepala Sekolah.';
          target.kepsek_reviewed_at = nowIso;
          target.updated_at = nowIso;
          updatedList.push(target);
          if (!isAdminRoutine) {
            approvedPeriods.push({ month: target.month, year: target.year });
          }
        }
      });

      if (updatedList.length === 0) {
        if (lockedSkipped > 0) {
          return {
            ok: false,
            status: 409,
            error:
              'Periode penggajian tujuan sudah diajukan/dikunci. Minta Bendahara memindahkan periode bulan catatan belanja.',
          };
        }
        return {
          ok: false,
          status: 400,
          error: 'Tidak ada belanja sekolah menunggu otorisasi yang dapat disetujui.',
        };
      }

      const byTeacher = new Map();
      let routineCount = 0;
      updatedList.forEach((it) => {
        if (it.teacher_id === ADMIN_ROUTINE_TEACHER_ID) {
          routineCount += 1;
          return;
        }
        const cur = byTeacher.get(it.teacher_id) || {
          teacher_id: it.teacher_id,
          name: it.teacher_name,
          count: 0,
          total: 0,
        };
        cur.count += 1;
        cur.total += Number(it.approved_amount || 0);
        byTeacher.set(it.teacher_id, cur);
      });

      byTeacher.forEach((tInfo) => {
        db.Notifications.unshift({
          id: generateUuidV4(),
          recipient_role: 'guru',
          recipient_teacher_id: tInfo.teacher_id,
          recipient_email: '',
          title: `${tInfo.count} Penggantian Belanja Sekolah Disetujui!`,
          message: `Kepala Sekolah menyetujui ${tInfo.count} catatan belanja sekolah Anda senilai total Rp ${tInfo.total.toLocaleString('id-ID')} (Bebas Infaq 2,5%).`,
          type: 'reimbursement_approved',
          ref_id: updatedList[0].id,
          is_read: false,
          created_at: nowIso,
        });
      });

      const ptkCount = updatedList.length - routineCount;
      db.Notifications.unshift({
        id: generateUuidV4(),
        recipient_role: 'admin',
        recipient_teacher_id: '',
        recipient_email: '',
        title:
          ptkCount === 0
            ? `${routineCount} Belanja Rutin Bendahara Disetujui Kepsek`
            : `${updatedList.length} Belanja Sekolah Disetujui Kepsek`,
        message:
          ptkCount === 0
            ? `Kepsek telah menyetujui ${routineCount} catatan belanja sekolah rutinan Bendahara secara kolektif.`
            : `Kepsek telah menyetujui ${updatedList.length} catatan belanja sekolah secara kolektif. Sinkronkan draf penggajian terkait bila diperlukan.`,
        type: 'reimbursement_approved',
        ref_id: updatedList[0].id,
        is_read: false,
        created_at: nowIso,
      });

      bumpVersions(['reimbursements', 'notifications'], [], [], approvedPeriods);
      saveDb(db);
      return { ok: true, status: 200, data: updatedList };
    }

    case 'notifications.list': {
      const allNotifs = [...(db.Notifications || [])];
      let filtered = [];
      if (session.role === 'admin' || session.role === 'kepsek') {
        filtered = allNotifs.filter((n) => n.recipient_role === session.role);
      } else if (session.role === 'guru') {
        const own = getOwnedTeacher();
        filtered = allNotifs.filter(
          (n) => n.recipient_role === 'guru' && own && n.recipient_teacher_id === own.id
        );
      }
      filtered.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      const unreadCount = filtered.filter((n) => !n.is_read).length;
      return {
        ok: true,
        status: 200,
        data: { items: filtered.slice(0, 40), unreadCount },
      };
    }

    case 'notifications.markRead': {
      const own = session.role === 'guru' ? getOwnedTeacher() : null;
      let changed = false;
      (db.Notifications || []).forEach((n) => {
        const belongsToUser =
          session.role === 'guru'
            ? n.recipient_role === 'guru' && own && n.recipient_teacher_id === own.id
            : n.recipient_role === session.role;
        if (!belongsToUser) return;
        if (!n.is_read && (payload.mark_all || (payload.id && n.id === payload.id))) {
          n.is_read = true;
          changed = true;
        }
      });
      if (changed) {
        bumpVersions(['notifications']);
        saveDb(db);
      }
      return { ok: true, status: 200, data: { updated: true } };
    }

    case 'schoolProfile.update': {
      if (session.role !== 'admin') return forbidden();
      db.School_Profile = {
        ...(db.School_Profile || {}),
        ...payload,
      };
      bumpVersions(['school_profile']);
      saveDb(db);
      return { ok: true, status: 200, data: db.School_Profile };
    }

    case 'maintenance.archiveStatus': {
      if (session.role !== 'admin') return forbidden();
      const currentYear = new Date().getFullYear();
      const logs = Array.isArray(db.Attendance_Logs) ? db.Attendance_Logs : [];
      const atts = Array.isArray(db.Attendances) ? db.Attendances : [];
      const payrolls = Array.isArray(db.Payrolls) ? db.Payrolls : [];
      const details = Array.isArray(db.Payroll_Details) ? db.Payroll_Details : [];
      const notifs = Array.isArray(db.Notifications) ? db.Notifications : [];

      const yearsSet = new Set();
      logs.forEach((l) => Number(l.year) && yearsSet.add(Number(l.year)));
      atts.forEach((a) => Number(a.year) && yearsSet.add(Number(a.year)));
      payrolls.forEach((p) => Number(p.year) && yearsSet.add(Number(p.year)));

      const payrollYearById = new Map();
      payrolls.forEach((p) => payrollYearById.set(p.id, { year: Number(p.year), status: p.status }));

      const yearlyBreakdown = Array.from(yearsSet)
        .sort((a, b) => a - b)
        .map((yr) => {
          const yearLogs = logs.filter((l) => Number(l.year) === yr);
          const yearAtts = atts.filter((a) => Number(a.year) === yr);
          const yearPayrolls = payrolls.filter((p) => Number(p.year) === yr);
          const paidPayrollsCount = yearPayrolls.filter((p) => p.status === 'paid').length;
          const unpaidPayrollsCount = yearPayrolls.length - paidPayrollsCount;
          const yearDetailsCount = details.filter(
            (d) => payrollYearById.get(d.payroll_id)?.year === yr
          ).length;
          const archivableRowsCount = yearLogs.length + yearAtts.length + yearDetailsCount;
          return {
            year: yr,
            attendanceLogsCount: yearLogs.length,
            attendancesCount: yearAtts.length,
            payrollsCount: yearPayrolls.length,
            paidPayrollsCount,
            unpaidPayrollsCount,
            payrollDetailsCount: yearDetailsCount,
            archivableRowsCount,
            canArchiveSafely:
              yr < currentYear && unpaidPayrollsCount === 0 && archivableRowsCount > 0,
          };
        });

      const cutoffMs = Date.now() - 90 * 86400000;
      const unreadCount = notifs.filter((n) => !n.is_read).length;
      const prunableReadOldCount = notifs.filter((n) => {
        if (!n.is_read) return false;
        const ts = Date.parse(n.created_at || '');
        return Number.isFinite(ts) && ts < cutoffMs;
      }).length;

      const archiveObj = db.Archives && typeof db.Archives === 'object' ? db.Archives : {};
      const archiveSheets = Object.keys(archiveObj).map((sheetName) => ({
        sheetName,
        rowCount: Array.isArray(archiveObj[sheetName]) ? archiveObj[sheetName].length : 0,
      }));

      return {
        ok: true,
        status: 200,
        data: {
          currentYear,
          activeCounts: {
            teachers: (db.Teachers || []).length,
            attendance_logs: logs.length,
            attendances: atts.length,
            payrolls: payrolls.length,
            payroll_details: details.length,
            disbursements: (db.Disbursement_Requests || []).length,
            reimbursements: (db.Reimbursements || []).length,
            notifications: notifs.length,
          },
          yearlyBreakdown,
          archiveSheets,
          notificationsStats: {
            totalCount: notifs.length,
            unreadCount,
            prunableReadOldCount,
          },
        },
      };
    }

    case 'maintenance.archiveYear': {
      if (session.role !== 'admin') return forbidden();
      const targetYear = Number(payload.year);
      const currentYear = new Date().getFullYear();
      if (!targetYear || targetYear < 2020 || targetYear > 2100) {
        return { ok: false, status: 400, error: 'Tahun arsip tidak valid.' };
      }
      if (targetYear >= currentYear) {
        return {
          ok: false,
          status: 409,
          error: `Tahun ${targetYear} adalah tahun berjalan/mendatang dan belum boleh diarsipkan.`,
        };
      }
      const payrolls = Array.isArray(db.Payrolls) ? db.Payrolls : [];
      const yearPayrolls = payrolls.filter((p) => Number(p.year) === targetYear);
      const hasUnpaid = yearPayrolls.some((p) => p.status !== 'paid');
      if (hasUnpaid) {
        return {
          ok: false,
          status: 409,
          error: `Masih ada periode payroll tahun ${targetYear} yang belum berstatus PAID.`,
        };
      }

      if (!db.Archives || typeof db.Archives !== 'object') db.Archives = {};
      const paidPayrollIds = new Set(yearPayrolls.map((p) => p.id));

      const logsToArchive = (db.Attendance_Logs || []).filter((l) => Number(l.year) === targetYear);
      db.Attendance_Logs = (db.Attendance_Logs || []).filter((l) => Number(l.year) !== targetYear);

      const attsToArchive = (db.Attendances || []).filter((a) => Number(a.year) === targetYear);
      db.Attendances = (db.Attendances || []).filter((a) => Number(a.year) !== targetYear);

      const detailsToArchive = (db.Payroll_Details || []).filter((d) =>
        paidPayrollIds.has(d.payroll_id)
      );
      db.Payroll_Details = (db.Payroll_Details || []).filter(
        (d) => !paidPayrollIds.has(d.payroll_id)
      );

      const archiveSheetsCreated = [];
      if (logsToArchive.length > 0) {
        const sName = `Archive_Attendance_Logs_${targetYear}`;
        db.Archives[sName] = [...(db.Archives[sName] || []), ...logsToArchive];
        archiveSheetsCreated.push(sName);
      }
      if (attsToArchive.length > 0) {
        const sName = `Archive_Attendances_${targetYear}`;
        db.Archives[sName] = [...(db.Archives[sName] || []), ...attsToArchive];
        archiveSheetsCreated.push(sName);
      }
      if (detailsToArchive.length > 0) {
        const sName = `Archive_Payroll_Details_${targetYear}`;
        db.Archives[sName] = [...(db.Archives[sName] || []), ...detailsToArchive];
        archiveSheetsCreated.push(sName);
      }

      bumpVersions(['attendances', 'payrolls']);
      saveDb(db);
      return {
        ok: true,
        status: 200,
        data: {
          archivedYear: targetYear,
          movedAttendanceLogs: logsToArchive.length,
          movedAttendances: attsToArchive.length,
          movedPayrollDetails: detailsToArchive.length,
          archiveSheetsCreated,
        },
      };
    }

    case 'maintenance.pruneNotifications': {
      if (session.role !== 'admin') return forbidden();
      const days = Math.max(7, Math.min(365, Number(payload.olderThanDays || 90)));
      const cutoffMs = Date.now() - days * 86400000;
      const before = db.Notifications || [];
      const kept = before.filter((n) => {
        if (!n.is_read) return true;
        const ts = Date.parse(n.created_at || '');
        return !Number.isFinite(ts) || ts >= cutoffMs;
      });
      const removedCount = before.length - kept.length;
      if (removedCount > 0) {
        db.Notifications = kept;
        bumpVersions(['notifications']);
        saveDb(db);
      }
      return {
        ok: true,
        status: 200,
        data: {
          removedCount,
          remainingCount: kept.length,
          olderThanDays: days,
        },
      };
    }

    default:
      return notFound();
    }
  };

  return dispatchAction(action, payload);
}
