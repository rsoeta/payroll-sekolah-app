/**
 * ============================================================================
 * SCHOOL / FOUNDATION PAYROLL BACKEND - GOOGLE APPS SCRIPT (GAS)
 * Deploy Identity : v19_GoogleOAuthWhitelist
 * Changelog (v19) :
 *   1. Mengganti mekanisme login OTP Gmail 6-digit dengan Google OAuth 2.0 penuh
 *      (`id_token` & `access_token` diverifikasi langsung ke endpoint resmi Google).
 *   2. Menerapkan validasi whitelist ketat terhadap kolom `Users_Auth.username`
 *      (pencocokan alamat email persis, case-insensitive, tanpa fallback prefix).
 *   3. Menonaktifkan endpoint `auth.requestOtp` (mengembalikan HTTP 410 Gone)
 *      dan menyinkronkan `google_client_id` dari Profil Sekolah / konstanta server.
 * ============================================================================
 */

const DEPLOY_VERSION = 'v19_GoogleOAuthWhitelist';
const SESSION_TTL_SECONDS = 3600 * 8; // 8 Hours session lifetime
const LOCK_TIMEOUT_MS = 15000;        // 15 Seconds max wait for LockService

const SYNC_META_PROP_KEY = 'SIPAYROLL_SYNC_META_V17';
const SYNC_META_CACHE_KEY = 'sync_meta_v17';
const SYNC_META_CACHE_TTL = 21600; // 6 Hours
const SHEET_CACHE_PREFIX = 'sheet_cache_v17_';
const SHEET_CACHE_TTL_SEC = 300; // 5 Minutes

var __REQ_SS__ = null;
var __REQ_SHEET_OBJ__ = {};
var __REQ_SHEET_CACHE__ = {};
var __REQ_SYNC_META__ = null;

function resetRequestScopeCache() {
  __REQ_SS__ = null;
  __REQ_SHEET_OBJ__ = {};
  __REQ_SHEET_CACHE__ = {};
  __REQ_SYNC_META__ = null;
}

/**
 * Optional: Jika skrip GAS dibuat secara terpisah (Standalone) dan bukan dari menu
 * Extensions > Apps Script di dalam Google Sheets, isi SPREADSHEET_ID di bawah ini.
 * Jika dibuat langsung dari dalam Google Sheets, biarkan kosong ('').
 */
const OPTIONAL_SPREADSHEET_ID = '';

/**
 * Optional: Isi Google OAuth 2.0 Client ID (contoh: '12345-abc.apps.googleusercontent.com')
 * untuk memvalidasi audience (`aud`) ID Token secara ketat di sisi server GAS.
 * Dapat juga diatur langsung melalui menu Pengaturan di aplikasi web.
 */
const GOOGLE_OAUTH_CLIENT_ID = '';

const SHEETS = Object.freeze({
  USERS_AUTH: 'Users_Auth',
  TEACHERS: 'Teachers',
  SALARY_COMPONENTS: 'Salary_Components',
  ATTENDANCES: 'Attendances',
  ATTENDANCE_LOGS: 'Attendance_Logs',
  PAYROLLS: 'Payrolls',
  PAYROLL_DETAILS: 'Payroll_Details',
  DISBURSEMENT_REQUESTS: 'Disbursement_Requests',
  NOTIFICATIONS: 'Notifications',
});

const SCHEMA_HEADERS = Object.freeze({
  [SHEETS.USERS_AUTH]: ['id', 'username', 'password_hash', 'role'],
  [SHEETS.TEACHERS]: ['id', 'user_id', 'nip', 'name', 'status', 'bank_account', 'staff_category'],
  [SHEETS.SALARY_COMPONENTS]: [
    'id',
    'teacher_id',
    'base_salary',
    'hourly_rate',
    'position_allowance',
    'bpjs_deduction',
    'custom_components_json',
  ],
  [SHEETS.ATTENDANCES]: ['id', 'teacher_id', 'month', 'year', 'present_days', 'absent_days', 'total_jtm'],
  [SHEETS.ATTENDANCE_LOGS]: [
    'id',
    'teacher_id',
    'date',
    'month',
    'year',
    'status',
    'jtm_hours',
    'note',
    'created_at',
    'updated_at',
    'class_name',
    'validation_status',
    'validation_note',
  ],
  [SHEETS.PAYROLLS]: ['id', 'month', 'year', 'total_budget', 'status'],
  [SHEETS.PAYROLL_DETAILS]: ['id', 'payroll_id', 'teacher_id', 'net_salary', 'details_json'],
  [SHEETS.DISBURSEMENT_REQUESTS]: [
    'id',
    'teacher_id',
    'teacher_name',
    'nip',
    'month',
    'year',
    'payroll_id',
    'payroll_detail_id',
    'estimated_net_salary',
    'request_scope',
    'disbursement_timing',
    'requested_amount',
    'approved_amount',
    'reason',
    'status',
    'treasurer_note',
    'kepsek_note',
    'issued_slip_id',
    'issued_slip_json',
    'created_at',
    'treasurer_reviewed_at',
    'kepsek_reviewed_at',
    'slip_issued_at',
  ],
  [SHEETS.NOTIFICATIONS]: [
    'id',
    'recipient_role',
    'recipient_teacher_id',
    'recipient_email',
    'title',
    'message',
    'type',
    'ref_id',
    'is_read',
    'created_at',
  ],
});

const ROLES = Object.freeze({
  ADMIN: 'admin',
  KEPSEK: 'kepsek',
  GURU: 'guru',
});

const PAYROLL_STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  PAID: 'paid',
});

/* ==========================================================================
 * 1. ENTRY POINTS: doGet & doPost
 * ========================================================================== */

/**
 * Handles HTTP GET requests.
 * - Without `payload` param: returns service health & deploy version (`v6_SchoolProfile`).
 * - With `?payload=<encodedJSON>`: processes RPC request via GET fallback if needed.
 */
function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.payload) {
      const decoded = JSON.parse(e.parameter.payload);
      return processIncomingRpc(decoded);
    }

    return buildJsonResponse(200, {
      ok: true,
      version: DEPLOY_VERSION,
      service: 'School Payroll GAS API',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[${DEPLOY_VERSION}] doGet error:`, err);
    return buildJsonResponse(500, {
      ok: false,
      error: 'Internal Server Error on doGet.',
      version: DEPLOY_VERSION,
    });
  }
}

/**
 * Handles HTTP POST requests.
 * Accepts `Content-Type: text/plain;charset=utf-8` or `application/json`
 * containing `{ method, action, token, payload }`.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return buildJsonResponse(400, { ok: false, error: 'Bad Request: Empty payload.' });
    }

    let requestBody;
    try {
      requestBody = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return buildJsonResponse(400, { ok: false, error: 'Bad Request: Malformed JSON.' });
    }

    return processIncomingRpc(requestBody);
  } catch (err) {
    console.error(`[${DEPLOY_VERSION}] Unhandled exception:`, err);
    return buildJsonResponse(500, {
      ok: false,
      error: 'Internal Server Error: ' + (err && err.message ? err.message : 'Unknown'),
      version: DEPLOY_VERSION,
    });
  }
}

function processIncomingRpc(requestBody) {
  resetRequestScopeCache();
  const httpMethod = sanitizeString(requestBody.method || 'POST').toUpperCase();
  const action = sanitizeString(requestBody.action || '');
  const token = sanitizeString(requestBody.token || '');
  const payload = requestBody.payload && typeof requestBody.payload === 'object' ? requestBody.payload : {};

  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(httpMethod)) {
    return buildJsonResponse(405, { ok: false, error: 'Method Not Allowed.' });
  }

  // Public Endpoint: Google OAuth Login & School Profile Identity (OTP disabled in v19)
  if (action === 'auth.requestOtp' && httpMethod === 'POST') {
    return buildJsonResponse(410, {
      ok: false,
      error: 'Metode login kode OTP Gmail sudah dinonaktifkan. Gunakan tombol Login dengan Google OAuth.',
    });
  }
  if (action === 'auth.login' && httpMethod === 'POST') {
    return handleLogin(payload);
  }
  if (action === 'schoolProfile.get' && httpMethod === 'GET') {
    return handleGetSchoolProfile();
  }

  // All other endpoints require a valid, non-expired time-based token
  const session = verifySessionToken(token);
  if (!session) {
    return buildJsonResponse(401, { ok: false, error: 'Unauthorized: Sesi berakhir atau token tidak valid.' });
  }

  if (action === 'auth.logout' && httpMethod === 'POST') {
    revokeSessionToken(token);
    return buildJsonResponse(200, { ok: true, message: 'Session terminated.' });
  }

  if (action === 'auth.me' && httpMethod === 'GET') {
    return handleGetProfile(session);
  }

  return routeAuthenticatedRequest(httpMethod, action, payload, session);
}

/* ==========================================================================
 * 2. OBJECT-LEVEL RBAC ROUTER & CONCURRENCY DISPATCHER
 * ========================================================================== */

function routeAuthenticatedRequest(method, action, payload, session) {
  const isMutation = ['POST', 'PUT', 'DELETE'].includes(method);

  const executeAction = function () {
    switch (action) {
      case 'dashboard.summary':
        if (method !== 'GET') return forbiddenResponse();
        return handleDashboardSummary(session);

      case 'teachers.list':
        if (method !== 'GET') return forbiddenResponse();
        return handleListTeachers(session);

      case 'teachers.get':
        if (method !== 'GET') return forbiddenResponse();
        return handleGetTeacherById(session, payload);

      case 'teachers.create':
        if (method !== 'POST' || session.role !== ROLES.ADMIN) return forbiddenResponse();
        return handleCreateTeacher(payload);

      case 'teachers.update':
        if (method !== 'PUT' || session.role !== ROLES.ADMIN) return forbiddenResponse();
        return handleUpdateTeacher(payload);

      case 'teachers.delete':
        if (method !== 'DELETE' || session.role !== ROLES.ADMIN) return forbiddenResponse();
        return handleDeleteTeacher(payload);

      case 'teachers.bulkImport':
        if (method !== 'POST' || session.role !== ROLES.ADMIN) return forbiddenResponse();
        return handleBulkImportTeachers(payload);

      case 'salaryComponents.list':
        if (method !== 'GET') return forbiddenResponse();
        return handleListSalaryComponents(session);

      case 'salaryComponents.upsert':
        if (!['POST', 'PUT'].includes(method) || session.role !== ROLES.ADMIN) return forbiddenResponse();
        return handleUpsertSalaryComponent(payload);

      case 'attendances.list':
        if (method !== 'GET') return forbiddenResponse();
        return handleListAttendances(session, payload);

      case 'attendances.upsert':
        if (!['POST', 'PUT'].includes(method) || session.role !== ROLES.ADMIN) return forbiddenResponse();
        return handleUpsertAttendance(payload);

      case 'attendances.bulkUpsert':
        if (!['POST', 'PUT'].includes(method) || session.role !== ROLES.ADMIN) return forbiddenResponse();
        return handleBulkUpsertAttendances(payload);

      case 'sync.versions':
        if (method !== 'GET') return forbiddenResponse();
        return handleGetSyncVersions();

      case 'bootstrap.admin':
        if (method !== 'GET' || session.role !== ROLES.ADMIN) return forbiddenResponse();
        return handleBootstrapAdmin(session, payload);

      case 'bootstrap.kepsek':
        if (method !== 'GET' || session.role !== ROLES.KEPSEK) return forbiddenResponse();
        return handleBootstrapKepsek(session);

      case 'bootstrap.guru':
        if (method !== 'GET' || session.role !== ROLES.GURU) return forbiddenResponse();
        return handleBootstrapGuru(session, payload);

      case 'attendanceLogs.list':
        if (method !== 'GET') return forbiddenResponse();
        return handleListAttendanceLogs(session, payload);

      case 'attendanceLogs.upsertMyLog':
        if (!['POST', 'PUT'].includes(method) || ![ROLES.GURU, ROLES.ADMIN].includes(session.role)) {
          return forbiddenResponse();
        }
        return handleUpsertMyAttendanceLog(session, payload);

      case 'attendanceLogs.syncDateLogs':
        if (!['POST', 'PUT'].includes(method) || ![ROLES.GURU, ROLES.ADMIN].includes(session.role)) {
          return forbiddenResponse();
        }
        return handleSyncDateAttendanceLogs(session, payload);

      case 'attendanceLogs.deleteMyLog':
        if (method !== 'DELETE' || ![ROLES.GURU, ROLES.ADMIN].includes(session.role)) {
          return forbiddenResponse();
        }
        return handleDeleteMyAttendanceLog(session, payload);

      case 'attendanceLogs.validate':
        if (!['POST', 'PUT'].includes(method) || session.role !== ROLES.ADMIN) {
          return forbiddenResponse();
        }
        return handleValidateAttendanceLogs(payload);

      case 'payrolls.list':
        if (method !== 'GET') return forbiddenResponse();
        return handleListPayrolls(session);

      case 'payrolls.generateDraft':
        if (method !== 'POST' || session.role !== ROLES.ADMIN) return forbiddenResponse();
        return handleGeneratePayrollDraft(payload);

      case 'payrolls.updateStatus':
        if (method !== 'PUT') return forbiddenResponse();
        return handleUpdatePayrollStatus(session, payload);

      case 'payrollDetails.byPayroll':
        if (method !== 'GET') return forbiddenResponse();
        return handleGetPayrollDetailsByPayrollId(session, payload);

      case 'payslips.myList':
        if (method !== 'GET') return forbiddenResponse();
        return handleGetMyPayslips(session);

      case 'payslips.getById':
        if (method !== 'GET') return forbiddenResponse();
        return handleGetPayslipById(session, payload);

      case 'disbursements.estimates':
        if (method !== 'GET' || session.role !== ROLES.GURU) return forbiddenResponse();
        return handleGetDisbursementEstimates(session, payload);

      case 'disbursements.list':
        if (method !== 'GET') return forbiddenResponse();
        return handleListDisbursementRequests(session);

      case 'disbursements.create':
        if (method !== 'POST' || session.role !== ROLES.GURU) return forbiddenResponse();
        return handleCreateDisbursementRequest(session, payload);

      case 'disbursements.treasurerReview':
        if (!['POST', 'PUT'].includes(method) || session.role !== ROLES.ADMIN) return forbiddenResponse();
        return handleTreasurerReviewDisbursement(payload);

      case 'disbursements.bulkTreasurerApprove':
        if (!['POST', 'PUT'].includes(method) || session.role !== ROLES.ADMIN) return forbiddenResponse();
        return handleBulkTreasurerApproveDisbursements(payload);

      case 'disbursements.kepsekReview':
        if (!['POST', 'PUT'].includes(method) || session.role !== ROLES.KEPSEK) return forbiddenResponse();
        return handleKepsekReviewDisbursement(payload);

      case 'notifications.list':
        if (method !== 'GET') return forbiddenResponse();
        return handleListNotifications(session);

      case 'notifications.markRead':
        if (!['POST', 'PUT'].includes(method)) return forbiddenResponse();
        return handleMarkNotificationsRead(session, payload);

      case 'schoolProfile.update':
        if (!['POST', 'PUT'].includes(method) || session.role !== ROLES.ADMIN) return forbiddenResponse();
        return handleUpdateSchoolProfile(payload);

      case 'maintenance.archiveStatus':
        if (method !== 'GET' || session.role !== ROLES.ADMIN) return forbiddenResponse();
        return handleGetArchiveStatus();

      case 'maintenance.archiveYear':
        if (method !== 'POST' || session.role !== ROLES.ADMIN) return forbiddenResponse();
        return handleArchiveYearData(payload);

      case 'maintenance.pruneNotifications':
        if (method !== 'POST' || session.role !== ROLES.ADMIN) return forbiddenResponse();
        return handlePruneNotifications(payload);

      default:
        return notFoundResponse();
    }
  };

  if (isMutation) {
    return withScriptLock(executeAction);
  }
  return executeAction();
}

function withScriptLock(callback) {
  const lock = LockService.getScriptLock();
  const acquired = lock.tryLock(LOCK_TIMEOUT_MS);
  if (!acquired) {
    return buildJsonResponse(423, {
      ok: false,
      error: 'Resource Locked: Server sedang memproses transaksi lain. Silakan coba beberapa saat lagi.',
    });
  }
  try {
    return callback();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

/* ==========================================================================
 * 3. AUTHENTICATION, CRYPTOGRAPHY & SESSION MANAGEMENT (v19_GoogleOAuthWhitelist)
 * ========================================================================== */

function getEffectiveGoogleClientIdGas() {
  var profile = getSchoolProfileDataGas();
  var fromProfile =
    profile && profile.google_client_id ? sanitizeString(profile.google_client_id) : '';
  return fromProfile || sanitizeString(GOOGLE_OAUTH_CLIENT_ID || '');
}

/**
 * Mencocokkan email terverifikasi dari Google OAuth secara ketat
 * terhadap whitelist kolom `Users_Auth.username` (case-insensitive exact match).
 */
function findWhitelistedUserByUsername(verifiedEmail) {
  const cleanEmail = String(verifiedEmail || '').trim().toLowerCase();
  if (!cleanEmail || cleanEmail.indexOf('@') === -1) return null;
  const users = readSheetRecords(SHEETS.USERS_AUTH);
  return (
    users.find(function (u) {
      const storedUsername = String(u.username || '').trim().toLowerCase();
      return storedUsername !== '' && storedUsername === cleanEmail;
    }) || null
  );
}

/**
 * Verifies official Google OAuth2 credentials (`id_token` or `access_token`)
 * against Google's token verification endpoints and enforces configured `aud` Client ID.
 */
function verifyGoogleIdentityOnServer(payload) {
  var idToken = String((payload && payload.id_token) || '').trim();
  var accessToken = String((payload && payload.access_token) || '').trim();
  var effectiveClientId = getEffectiveGoogleClientIdGas();

  // Path 1: Official Google Identity Services ID Token (cryptographically verified via Google)
  if (idToken) {
    var tokenInfoUrl =
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
    var res = UrlFetchApp.fetch(tokenInfoUrl, { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      var info = {};
      try {
        info = JSON.parse(res.getContentText() || '{}');
      } catch (e) {
        info = {};
      }
      var validIss =
        info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
      var notExpired = !info.exp || Number(info.exp) > Math.floor(Date.now() / 1000);
      if (String(info.email_verified) === 'true' && validIss && notExpired && info.email) {
        if (effectiveClientId && String(info.aud || '').trim() !== effectiveClientId) {
          return {
            ok: false,
            error: 'Google OAuth Client ID tidak cocok dengan konfigurasi sekolah.',
          };
        }
        return {
          ok: true,
          email: String(info.email).trim().toLowerCase(),
          name: String(info.name || ''),
          picture: String(info.picture || ''),
        };
      }
    }
    return {
      ok: false,
      error: 'Token ID Google tidak valid atau telah kedaluwarsa. Silakan ulangi Login dengan Google.',
    };
  }

  // Path 2: Official Google OAuth2 Access Token
  if (accessToken) {
    if (effectiveClientId) {
      var accessTokenInfoUrl =
        'https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken);
      var tRes = UrlFetchApp.fetch(accessTokenInfoUrl, { muteHttpExceptions: true });
      if (tRes.getResponseCode() !== 200) {
        return {
          ok: false,
          error: 'Token akses Google OAuth tidak valid atau telah kedaluwarsa.',
        };
      }
      var tInfo = {};
      try {
        tInfo = JSON.parse(tRes.getContentText() || '{}');
      } catch (e2) {
        tInfo = {};
      }
      if (String(tInfo.aud || '').trim() !== effectiveClientId) {
        return {
          ok: false,
          error: 'Token akses Google OAuth bukan berasal dari Client ID aplikasi sekolah.',
        };
      }
    }

    var userInfoUrl = 'https://www.googleapis.com/oauth2/v3/userinfo';
    var uRes = UrlFetchApp.fetch(userInfoUrl, {
      headers: { Authorization: 'Bearer ' + accessToken },
      muteHttpExceptions: true,
    });
    if (uRes.getResponseCode() === 200) {
      var uInfo = {};
      try {
        uInfo = JSON.parse(uRes.getContentText() || '{}');
      } catch (e3) {
        uInfo = {};
      }
      if (String(uInfo.email_verified) === 'true' && uInfo.email) {
        return {
          ok: true,
          email: String(uInfo.email).trim().toLowerCase(),
          name: String(uInfo.name || ''),
          picture: String(uInfo.picture || ''),
        };
      }
    }
    return {
      ok: false,
      error: 'Gagal memverifikasi profil Akun Google melalui OAuth. Silakan coba lagi.',
    };
  }

  return {
    ok: false,
    error: 'Autentikasi wajib menggunakan Login Google OAuth (Sign in with Google).',
  };
}

function handleLogin(payload) {
  const oauthResult = verifyGoogleIdentityOnServer(payload);
  if (!oauthResult.ok) {
    return buildJsonResponse(401, {
      ok: false,
      error: oauthResult.error,
    });
  }

  const verifiedEmail = oauthResult.email;

  const users = readSheetRecords(SHEETS.USERS_AUTH);
  if (users.length === 0) {
    return buildJsonResponse(403, {
      ok: false,
      error:
        'Sheet Users_Auth masih kosong. Daftarkan alamat email Google Admin pada kolom Users_Auth.username terlebih dahulu.',
    });
  }

  const userRecord = findWhitelistedUserByUsername(verifiedEmail);

  if (!userRecord) {
    return buildJsonResponse(403, {
      ok: false,
      error:
        'Akses Ditolak: Akun Google "' +
        verifiedEmail +
        '" tidak terdaftar pada whitelist Users_Auth.username. Hubungi Admin Sekolah untuk mendaftarkan email Anda.',
    });
  }

  // Normalize role (supports 'admin', 'bendahara', 'kepsek', 'kepala sekolah', 'guru')
  const rawRole = String(userRecord.role || 'admin').trim().toLowerCase();
  let role = rawRole;
  if (rawRole === 'bendahara' || rawRole === 'administrator') role = ROLES.ADMIN;
  if (rawRole === 'kepala sekolah' || rawRole === 'principal') role = ROLES.KEPSEK;
  if (rawRole === 'pendidik' || rawRole === 'teacher') role = ROLES.GURU;

  const validRoles = [ROLES.ADMIN, ROLES.KEPSEK, ROLES.GURU];
  if (!validRoles.includes(role)) {
    return buildJsonResponse(403, {
      ok: false,
      error: 'Kolom role di Users_Auth harus bernilai: admin, kepsek, atau guru.',
    });
  }

  // Ensure user has a UUID v4 in sheet (auto-heal if user manually entered row without UUID)
  let userId = String(userRecord.id || '').trim();
  if (!userId) {
    userId = Utilities.getUuid();
  }

  let teacherProfile = null;
  if (role === ROLES.GURU) {
    const teachers = readSheetRecords(SHEETS.TEACHERS);
    teacherProfile =
      teachers.find(function (t) {
        return String(t.user_id || '').trim() === userId;
      }) || null;
  }

  const displayName =
    teacherProfile && teacherProfile.name
      ? String(teacherProfile.name)
      : oauthResult.name
      ? oauthResult.name
      : role === ROLES.ADMIN
      ? 'Admin / Bendahara'
      : role === ROLES.KEPSEK
      ? 'Kepala Sekolah'
      : verifiedEmail;

  const sessionData = {
    userId: userId,
    username: verifiedEmail,
    email: verifiedEmail,
    role: role,
    teacherId: teacherProfile ? String(teacherProfile.id) : null,
    teacherName: displayName,
    picture: oauthResult.picture || '',
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };

  const token = issueSessionToken(sessionData);

  return buildJsonResponse(200, {
    ok: true,
    data: {
      token: token,
      expiresAt: sessionData.exp * 1000,
      user: {
        id: sessionData.userId,
        username: sessionData.username,
        email: sessionData.email,
        role: sessionData.role,
        teacherId: sessionData.teacherId,
        name: sessionData.teacherName,
        picture: sessionData.picture,
      },
    },
  });
}

function handleGetProfile(session) {
  return buildJsonResponse(200, {
    ok: true,
    data: {
      id: session.userId,
      username: session.username,
      email: session.email || session.username,
      role: session.role,
      teacherId: session.teacherId,
      name: session.teacherName,
      picture: session.picture || '',
    },
  });
}

/**
 * Verifies a password against:
 * 1. Salted hash format: `salt$sha256Hex`
 * 2. Direct SHA-256 hex from online generators (case-insensitive, trimmed)
 * 3. Direct SHA-256 of trimmed password (in case trailing space occurred)
 */
function verifyPasswordHash(rawPassword, storedHash) {
  if (!storedHash) return false;
  const cleanHash = String(storedHash).trim().toLowerCase();

  if (cleanHash.includes('$')) {
    const parts = cleanHash.split('$');
    if (parts.length === 2) {
      const salt = parts[0].trim();
      const targetHash = parts[1].trim();
      const computed = computeSha256Hex(salt + ':' + rawPassword);
      return constantTimeEqual(computed, targetHash);
    }
  }

  const directComputed = computeSha256Hex(rawPassword);
  if (constantTimeEqual(directComputed, cleanHash)) {
    return true;
  }

  const trimmedComputed = computeSha256Hex(rawPassword.trim());
  return constantTimeEqual(trimmedComputed, cleanHash);
}

function createSaltedPasswordHash(rawPassword) {
  const salt = Utilities.getUuid().replace(/-/g, '').substring(0, 16);
  const hash = computeSha256Hex(salt + ':' + rawPassword);
  return salt + '$' + hash;
}

function computeSha256Hex(input) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  return digest
    .map(function (byte) {
      const v = byte < 0 ? byte + 256 : byte;
      return ('0' + v.toString(16)).slice(-2);
    })
    .join('');
}

function constantTimeEqual(a, b) {
  const strA = String(a || '');
  const strB = String(b || '');
  if (strA.length !== strB.length) return false;
  let diff = 0;
  for (let i = 0; i < strA.length; i++) {
    diff |= strA.charCodeAt(i) ^ strB.charCodeAt(i);
  }
  return diff === 0;
}

function getHmacSecret() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('SESSION_HMAC_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + '-' + Utilities.getUuid();
    props.setProperty('SESSION_HMAC_SECRET', secret);
  }
  return secret;
}

function issueSessionToken(sessionPayload) {
  const jsonPayload = JSON.stringify(sessionPayload);
  const encodedPayload = Utilities.base64EncodeWebSafe(jsonPayload, Utilities.Charset.UTF_8);
  const signatureBytes = Utilities.computeHmacSha256Signature(encodedPayload, getHmacSecret(), Utilities.Charset.UTF_8);
  const encodedSig = Utilities.base64EncodeWebSafe(signatureBytes);
  const token = encodedPayload + '.' + encodedSig;

  const cache = CacheService.getScriptCache();
  cache.put('sess_' + computeSha256Hex(token).substring(0, 32), 'active', SESSION_TTL_SECONDS);
  return token;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const encodedPayload = parts[0];
  const providedSig = parts[1];

  const expectedSigBytes = Utilities.computeHmacSha256Signature(encodedPayload, getHmacSecret(), Utilities.Charset.UTF_8);
  const expectedSig = Utilities.base64EncodeWebSafe(expectedSigBytes);

  if (!constantTimeEqual(providedSig, expectedSig)) return null;

  const cache = CacheService.getScriptCache();
  const cacheKey = 'sess_' + computeSha256Hex(token).substring(0, 32);
  if (cache.get(cacheKey) === 'revoked') return null;

  try {
    const jsonStr = Utilities.newBlob(Utilities.base64DecodeWebSafe(encodedPayload)).getDataAsString();
    const session = JSON.parse(jsonStr);
    const nowSec = Math.floor(Date.now() / 1000);
    if (!session.exp || session.exp < nowSec) return null;
    return session;
  } catch (e) {
    return null;
  }
}

function revokeSessionToken(token) {
  if (!token) return;
  const cache = CacheService.getScriptCache();
  const cacheKey = 'sess_' + computeSha256Hex(token).substring(0, 32);
  cache.put(cacheKey, 'revoked', SESSION_TTL_SECONDS);
}

/* ==========================================================================
 * 4. BUSINESS LOGIC & OBJECT-LEVEL RBAC HANDLERS
 * ========================================================================== */

function resolveOwnedTeacherRecord(session) {
  const teachers = readSheetRecords(SHEETS.TEACHERS);
  return (
    teachers.find(function (t) {
      return String(t.user_id || '').trim() === String(session.userId || '').trim();
    }) || null
  );
}

function getSchoolProfileDataGas() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('SIPAYROLL_SCHOOL_PROFILE');
    var parsed = raw ? JSON.parse(raw) : {};
    if (!parsed.google_client_id && GOOGLE_OAUTH_CLIENT_ID) {
      parsed.google_client_id = GOOGLE_OAUTH_CLIENT_ID;
    }
    return parsed;
  } catch (e) {
    return GOOGLE_OAUTH_CLIENT_ID ? { google_client_id: GOOGLE_OAUTH_CLIENT_ID } : null;
  }
}

function handleGetSchoolProfile() {
  return buildJsonResponse(200, { ok: true, data: getSchoolProfileDataGas() });
}

function handleUpdateSchoolProfile(payload) {
  var existing = getSchoolProfileDataGas() || {};
  var nextGoogleClientId =
    payload.google_client_id !== undefined
      ? sanitizeString(payload.google_client_id || '')
      : sanitizeString(existing.google_client_id || GOOGLE_OAUTH_CLIENT_ID || '');
  var profileObj = {
    app_short_name: sanitizeString(payload.app_short_name || 'SIPAYROLL'),
    foundation_name: sanitizeString(payload.foundation_name || ''),
    school_name: sanitizeString(payload.school_name || ''),
    address: sanitizeString(payload.address || ''),
    contact_info: sanitizeString(payload.contact_info || ''),
    city: sanitizeString(payload.city || 'Bandung'),
    principal_name: sanitizeString(payload.principal_name || ''),
    principal_nip: sanitizeString(payload.principal_nip || ''),
    treasurer_name: sanitizeString(payload.treasurer_name || ''),
    treasurer_nip: sanitizeString(payload.treasurer_nip || ''),
    slip_footer_note: sanitizeString(payload.slip_footer_note || ''),
    logo_data_url: String(payload.logo_data_url || '/logo.png').trim(),
    google_client_id: nextGoogleClientId,
  };
  PropertiesService.getScriptProperties().setProperty(
    'SIPAYROLL_SCHOOL_PROFILE',
    JSON.stringify(profileObj)
  );
  bumpSyncVersionGas(['school_profile']);
  return buildJsonResponse(200, { ok: true, data: profileObj });
}

function getDashboardSummaryDataGas(session) {
  const teachers = readSheetRecords(SHEETS.TEACHERS);
  const payrolls = readSheetRecords(SHEETS.PAYROLLS);
  const details = readSheetRecords(SHEETS.PAYROLL_DETAILS);

  if (session.role === ROLES.GURU) {
    const ownTeacher = resolveOwnedTeacherRecord(session);
    if (!ownTeacher) {
      return {
        role: ROLES.GURU,
        teacher: { name: session.teacherName, nip: '-', status: 'Guru', bank_account: '-' },
        totalSlips: 0,
        latestNetSalary: 0,
      };
    }

    const components = readSheetRecords(SHEETS.SALARY_COMPONENTS);
    const ownComp =
      components.find(function (c) {
        return String(c.teacher_id) === String(ownTeacher.id);
      }) || null;
    const enrichedTeacher = Object.assign({}, ownTeacher, {
      staff_category: resolveStaffCategoryGas(ownTeacher.staff_category, ownTeacher.status),
      salary_component: ownComp,
    });

    const approvedPayrollIds = new Set(
      payrolls
        .filter(function (p) {
          return p.status === PAYROLL_STATUS.APPROVED || p.status === PAYROLL_STATUS.PAID;
        })
        .map(function (p) {
          return String(p.id);
        })
    );

    const myApprovedSlips = details.filter(function (d) {
      return String(d.teacher_id) === String(ownTeacher.id) && approvedPayrollIds.has(String(d.payroll_id));
    });
    const allMySlips = details.filter(function (d) {
      return String(d.teacher_id) === String(ownTeacher.id);
    });

    return {
      role: ROLES.GURU,
      teacher: enrichedTeacher,
      totalSlips: allMySlips.length,
      latestNetSalary:
        myApprovedSlips.length > 0 ? Number(myApprovedSlips[myApprovedSlips.length - 1].net_salary || 0) : 0,
      latestEstimatedNetSalary:
        allMySlips.length > 0 ? Number(allMySlips[allMySlips.length - 1].net_salary || 0) : 0,
    };
  }

  return {
    role: session.role,
    totalTeachers: teachers.length,
    pendingApprovals: payrolls.filter(function (p) {
      return p.status === PAYROLL_STATUS.SUBMITTED;
    }).length,
    paidPayrolls: payrolls.filter(function (p) {
      return p.status === PAYROLL_STATUS.PAID;
    }).length,
    totalPayrolls: payrolls.length,
  };
}

function handleDashboardSummary(session) {
  return buildJsonResponse(200, {
    ok: true,
    data: getDashboardSummaryDataGas(session),
  });
}

function resolveStaffCategoryGas(rawCategory, rawStatus) {
  var cat = sanitizeString(rawCategory || '').toLowerCase();
  if (cat === 'kependidikan' || cat === 'tenaga kependidikan') return 'kependidikan';
  if (cat === 'pendidik' || cat === 'tenaga pendidik' || cat === 'guru') return 'pendidik';
  var st = sanitizeString(rawStatus || '').toLowerCase();
  if (
    /kependidikan|tata\s*usaha|\btu\b|pustakawan|laboran|teknisi|penguji|keamanan|satpam|security|kebersihan|cleaning|staf/.test(
      st
    )
  ) {
    return 'kependidikan';
  }
  return 'pendidik';
}

function getTeachersListDataGas(session) {
  const teachers = readSheetRecords(SHEETS.TEACHERS);
  const components = readSheetRecords(SHEETS.SALARY_COMPONENTS);
  const users = readSheetRecords(SHEETS.USERS_AUTH);

  if (session.role === ROLES.GURU) {
    return teachers
      .filter(function (t) {
        return String(t.user_id) === String(session.userId);
      })
      .map(function (t) {
        return Object.assign({}, t, {
          staff_category: resolveStaffCategoryGas(t.staff_category, t.status),
        });
      });
  }

  return teachers.map(function (t) {
    const comp =
      components.find(function (c) {
        return String(c.teacher_id) === String(t.id);
      }) || null;
    const linkedUser =
      users.find(function (u) {
        return String(u.id) === String(t.user_id);
      }) || null;
    const email = linkedUser ? String(linkedUser.username || '').trim().toLowerCase() : '';
    return Object.assign({}, t, {
      staff_category: resolveStaffCategoryGas(t.staff_category, t.status),
      email: email,
      salary_component: comp,
    });
  });
}

function handleListTeachers(session) {
  return buildJsonResponse(200, { ok: true, data: getTeachersListDataGas(session) });
}

function handleGetTeacherById(session, payload) {
  const targetId = sanitizeString(payload.id);
  if (!targetId) return notFoundResponse();

  const teachers = readSheetRecords(SHEETS.TEACHERS);
  const teacher = teachers.find(function (t) {
    return String(t.id) === targetId;
  });
  if (!teacher) return notFoundResponse();

  if (session.role === ROLES.GURU && String(teacher.user_id) !== String(session.userId)) {
    return forbiddenResponse();
  }

  return buildJsonResponse(200, { ok: true, data: teacher });
}

function handleCreateTeacher(payload) {
  const nip = sanitizeString(payload.nip);
  const name = sanitizeString(payload.name);
  const status = sanitizeString(payload.status || 'GTY (Guru Tetap Yayasan)');
  const staffCategory = resolveStaffCategoryGas(payload.staff_category, status);
  const bankAccount = sanitizeString(payload.bank_account);
  const cleanEmail = sanitizeString(payload.email || payload.username || '').toLowerCase();

  if (!nip || !name || !bankAccount) {
    return buildJsonResponse(400, { ok: false, error: 'NIP, Nama, dan Nomor Rekening wajib diisi.' });
  }

  let userId = sanitizeString(payload.user_id) || '';

  if (!userId && cleanEmail) {
    const existingUsers = readSheetRecords(SHEETS.USERS_AUTH);
    const duplicateUser = existingUsers.some(function (u) {
      return String(u.username || '').trim().toLowerCase() === cleanEmail;
    });
    if (duplicateUser) {
      return buildJsonResponse(409, { ok: false, error: 'Alamat Gmail sudah digunakan oleh akun lain.' });
    }
    userId = Utilities.getUuid();
    appendSheetRecord(SHEETS.USERS_AUTH, {
      id: userId,
      username: cleanEmail,
      password_hash: 'GMAIL_AUTH',
      role: ROLES.GURU,
    });
  } else if (!userId) {
    userId = Utilities.getUuid();
  }

  const teacherId = Utilities.getUuid();
  const newTeacher = {
    id: teacherId,
    user_id: userId,
    nip: nip,
    name: name,
    status: status,
    bank_account: bankAccount,
    staff_category: staffCategory,
  };
  appendSheetRecord(SHEETS.TEACHERS, newTeacher);

  const customJson =
    typeof payload.custom_components_json === 'string'
      ? payload.custom_components_json
      : Array.isArray(payload.custom_components)
      ? JSON.stringify(payload.custom_components)
      : '[]';

  const compBase = sanitizeNonNegativeNumber(payload.base_salary, 0);
  const compRate = sanitizeNonNegativeNumber(payload.hourly_rate, 0);
  const compAllowance = sanitizeNonNegativeNumber(payload.position_allowance, 0);
  const compInfaqEnabled = resolveInfaqZakatEnabledGas(payload, false);

  const compRecord = {
    id: Utilities.getUuid(),
    teacher_id: teacherId,
    base_salary: compBase,
    hourly_rate: compRate,
    position_allowance: compAllowance,
    bpjs_deduction: compInfaqEnabled ? 1 : 0,
    custom_components_json: customJson,
  };
  appendSheetRecord(SHEETS.SALARY_COMPONENTS, compRecord);
  bumpSyncVersionGas(['teachers']);

  return buildJsonResponse(201, {
    ok: true,
    data: Object.assign({}, newTeacher, { email: cleanEmail, salary_component: compRecord }),
  });
}

function handleUpdateTeacher(payload) {
  const teacherId = sanitizeString(payload.id);
  if (!teacherId) return notFoundResponse();

  const nextEmail =
    payload.email !== undefined || payload.username !== undefined
      ? sanitizeString(payload.email || payload.username || '').toLowerCase()
      : null;

  const updated = updateSheetRecordById(SHEETS.TEACHERS, teacherId, function (existing) {
    const nextStatus = payload.status !== undefined ? sanitizeString(payload.status) : existing.status;
    const nextCategory =
      payload.staff_category !== undefined
        ? resolveStaffCategoryGas(payload.staff_category, nextStatus)
        : resolveStaffCategoryGas(existing.staff_category, nextStatus);
    return {
      id: existing.id,
      user_id: existing.user_id,
      nip: payload.nip !== undefined ? sanitizeString(payload.nip) : existing.nip,
      name: payload.name !== undefined ? sanitizeString(payload.name) : existing.name,
      status: nextStatus,
      bank_account: payload.bank_account !== undefined ? sanitizeString(payload.bank_account) : existing.bank_account,
      staff_category: nextCategory,
    };
  });

  if (!updated) return notFoundResponse();

  if (nextEmail && updated.user_id) {
    const existingUsers = readSheetRecords(SHEETS.USERS_AUTH);
    const hasLinked = existingUsers.some(function (u) {
      return String(u.id) === String(updated.user_id);
    });
    if (hasLinked) {
      updateSheetRecordById(SHEETS.USERS_AUTH, updated.user_id, function (uRow) {
        return {
          id: uRow.id,
          username: nextEmail,
          password_hash: uRow.password_hash || 'GMAIL_AUTH',
          role: uRow.role || ROLES.GURU,
        };
      });
    } else {
      appendSheetRecord(SHEETS.USERS_AUTH, {
        id: updated.user_id,
        username: nextEmail,
        password_hash: 'GMAIL_AUTH',
        role: ROLES.GURU,
      });
    }
  }

  if (
    payload.base_salary !== undefined ||
    payload.hourly_rate !== undefined ||
    payload.position_allowance !== undefined ||
    payload.infaq_zakat_enabled !== undefined ||
    payload.bpjs_deduction !== undefined ||
    payload.custom_components_json !== undefined ||
    payload.custom_components !== undefined
  ) {
    upsertSalaryComponentDataGas({
      teacher_id: teacherId,
      base_salary: payload.base_salary,
      hourly_rate: payload.hourly_rate,
      position_allowance: payload.position_allowance,
      infaq_zakat_enabled: payload.infaq_zakat_enabled,
      bpjs_deduction: payload.bpjs_deduction,
      custom_components_json: payload.custom_components_json,
      custom_components: payload.custom_components,
    });
  }

  bumpSyncVersionGas(['teachers']);
  return buildJsonResponse(200, { ok: true, data: Object.assign({}, updated, { email: nextEmail || '' }) });
}

function handleDeleteTeacher(payload) {
  const teacherId = sanitizeString(payload.id);
  if (!teacherId) return notFoundResponse();

  const deleted = deleteSheetRecordById(SHEETS.TEACHERS, teacherId);
  if (!deleted) return notFoundResponse();
  deleteSheetRecordsByColumn(SHEETS.SALARY_COMPONENTS, 'teacher_id', teacherId);
  bumpSyncVersionGas(['teachers']);

  return buildJsonResponse(200, { ok: true, message: 'Data guru berhasil dihapus.' });
}

function handleBulkImportTeachers(payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) {
    return buildJsonResponse(400, { ok: false, error: 'Daftar data import kosong.' });
  }

  const existingTeachers = readSheetRecords(SHEETS.TEACHERS);
  const existingUsers = readSheetRecords(SHEETS.USERS_AUTH);
  const existingComponents = readSheetRecords(SHEETS.SALARY_COMPONENTS);

  let teachersDirty = false;
  let usersDirty = false;
  let compDirty = false;
  let createdCount = 0;
  let updatedCount = 0;

  items.forEach(function (item) {
    const cleanNip = sanitizeString(item.nip);
    const cleanName = sanitizeString(item.name);
    const cleanStatus = sanitizeString(item.status || 'GTY (Guru Tetap Yayasan)');
    const cleanCategory = resolveStaffCategoryGas(item.staff_category, cleanStatus);
    const cleanBank = sanitizeString(item.bank_account);
    const cleanEmail = sanitizeString(item.email || item.username || '').toLowerCase();

    if (!cleanNip || !cleanName || !cleanBank) return;

    const itemBase = sanitizeNonNegativeNumber(item.base_salary, 0);
    const itemRate = sanitizeNonNegativeNumber(item.hourly_rate, 0);
    const itemAllowance = sanitizeNonNegativeNumber(item.position_allowance, 0);
    const customJson =
      item.custom_components_json !== undefined
        ? String(item.custom_components_json || '[]')
        : Array.isArray(item.custom_components)
        ? JSON.stringify(item.custom_components)
        : undefined;

    const matchTeacherIdx = existingTeachers.findIndex(function (t) {
      return String(t.nip || '').trim().toLowerCase() === cleanNip.toLowerCase();
    });

    if (matchTeacherIdx !== -1) {
      const matchTeacher = existingTeachers[matchTeacherIdx];
      existingTeachers[matchTeacherIdx] = {
        id: matchTeacher.id,
        user_id: matchTeacher.user_id,
        nip: cleanNip,
        name: cleanName,
        status: cleanStatus || matchTeacher.status,
        bank_account: cleanBank,
        staff_category: item.staff_category
          ? cleanCategory
          : resolveStaffCategoryGas(matchTeacher.staff_category, cleanStatus || matchTeacher.status),
      };
      teachersDirty = true;

      if (cleanEmail && matchTeacher.user_id) {
        const userIdx = existingUsers.findIndex(function (u) {
          return String(u.id) === String(matchTeacher.user_id);
        });
        if (userIdx !== -1) {
          existingUsers[userIdx] = {
            id: existingUsers[userIdx].id,
            username: cleanEmail,
            password_hash: existingUsers[userIdx].password_hash || 'GMAIL_AUTH',
            role: existingUsers[userIdx].role || ROLES.GURU,
          };
          usersDirty = true;
        } else {
          existingUsers.push({
            id: matchTeacher.user_id,
            username: cleanEmail,
            password_hash: 'GMAIL_AUTH',
            role: ROLES.GURU,
          });
          usersDirty = true;
        }
      }

      const compIdx = existingComponents.findIndex(function (c) {
        return String(c.teacher_id) === String(matchTeacher.id);
      });
      if (compIdx !== -1) {
        const prevComp = existingComponents[compIdx];
        const prevEnabled = Number(prevComp.bpjs_deduction || 0) > 0;
        const nextEnabled = resolveInfaqZakatEnabledGas(item, prevEnabled);
        existingComponents[compIdx] = {
          id: prevComp.id,
          teacher_id: String(matchTeacher.id),
          base_salary: itemBase,
          hourly_rate: itemRate,
          position_allowance: itemAllowance,
          bpjs_deduction: nextEnabled ? 1 : 0,
          custom_components_json:
            customJson !== undefined ? customJson : prevComp.custom_components_json || '[]',
        };
      } else {
        const nextEnabled = resolveInfaqZakatEnabledGas(item, false);
        existingComponents.push({
          id: Utilities.getUuid(),
          teacher_id: String(matchTeacher.id),
          base_salary: itemBase,
          hourly_rate: itemRate,
          position_allowance: itemAllowance,
          bpjs_deduction: nextEnabled ? 1 : 0,
          custom_components_json: customJson !== undefined ? customJson : '[]',
        });
      }
      compDirty = true;
      updatedCount++;
    } else {
      let userId = Utilities.getUuid();
      if (cleanEmail) {
        const existingUser = existingUsers.find(function (u) {
          return String(u.email || u.username || '').trim().toLowerCase() === cleanEmail;
        });
        if (existingUser) {
          userId = String(existingUser.id || userId);
        } else {
          existingUsers.push({
            id: userId,
            username: cleanEmail,
            password_hash: 'GMAIL_AUTH',
            role: ROLES.GURU,
          });
          usersDirty = true;
        }
      }

      const teacherId = Utilities.getUuid();
      const newTeacher = {
        id: teacherId,
        user_id: userId,
        nip: cleanNip,
        name: cleanName,
        status: cleanStatus,
        bank_account: cleanBank,
        staff_category: cleanCategory,
      };
      existingTeachers.push(newTeacher);
      teachersDirty = true;

      const itemInfaqEnabled = resolveInfaqZakatEnabledGas(item, false);
      existingComponents.push({
        id: Utilities.getUuid(),
        teacher_id: teacherId,
        base_salary: itemBase,
        hourly_rate: itemRate,
        position_allowance: itemAllowance,
        bpjs_deduction: itemInfaqEnabled ? 1 : 0,
        custom_components_json: customJson !== undefined ? customJson : '[]',
      });
      compDirty = true;
      createdCount++;
    }
  });

  if (usersDirty) {
    replaceSheetRecords(SHEETS.USERS_AUTH, existingUsers);
  }
  if (teachersDirty) {
    replaceSheetRecords(SHEETS.TEACHERS, existingTeachers);
  }
  if (compDirty) {
    replaceSheetRecords(SHEETS.SALARY_COMPONENTS, existingComponents);
  }
  if (createdCount > 0 || updatedCount > 0) {
    bumpSyncVersionGas(['teachers']);
  }

  return buildJsonResponse(200, {
    ok: true,
    data: {
      createdCount: createdCount,
      updatedCount: updatedCount,
      totalProcessed: createdCount + updatedCount,
    },
  });
}

function handleListSalaryComponents(session) {
  const components = readSheetRecords(SHEETS.SALARY_COMPONENTS);

  if (session.role === ROLES.GURU) {
    const ownTeacher = resolveOwnedTeacherRecord(session);
    if (!ownTeacher) return forbiddenResponse();
    const filtered = components.filter(function (c) {
      return String(c.teacher_id) === String(ownTeacher.id);
    });
    return buildJsonResponse(200, { ok: true, data: filtered });
  }

  return buildJsonResponse(200, { ok: true, data: components });
}

function resolveInfaqZakatEnabledGas(obj, fallbackBool) {
  if (!obj || typeof obj !== 'object') return Boolean(fallbackBool);
  if (obj.infaq_zakat_enabled !== undefined && obj.infaq_zakat_enabled !== '') {
    return (
      obj.infaq_zakat_enabled === true ||
      String(obj.infaq_zakat_enabled).trim().toLowerCase() === 'true' ||
      String(obj.infaq_zakat_enabled).trim().toLowerCase() === 'ya' ||
      String(obj.infaq_zakat_enabled).trim() === '1'
    );
  }
  if (obj.bpjs_deduction !== undefined) {
    return Number(obj.bpjs_deduction || 0) > 0;
  }
  return Boolean(fallbackBool);
}

function calculateInfaqZakatGas(baseSalary, jtmHonor, positionAllowance, isEnabled, customAllowanceTotal) {
  if (!isEnabled) return 0;
  var basis =
    Math.max(0, Number(baseSalary || 0)) +
    Math.max(0, Number(jtmHonor || 0)) +
    Math.max(0, Number(positionAllowance || 0)) +
    Math.max(0, Number(customAllowanceTotal || 0));
  return Math.round(basis * 0.025);
}

function upsertSalaryComponentDataGas(payload) {
  const teacherId = sanitizeString(payload.teacher_id);
  const baseSalary = sanitizeNonNegativeNumber(payload.base_salary, 0);
  const hourlyRate = sanitizeNonNegativeNumber(payload.hourly_rate, 0);
  const positionAllowance = sanitizeNonNegativeNumber(payload.position_allowance, 0);
  const customJson =
    payload.custom_components_json !== undefined
      ? String(payload.custom_components_json || '[]')
      : Array.isArray(payload.custom_components)
      ? JSON.stringify(payload.custom_components)
      : undefined;

  const components = readSheetRecords(SHEETS.SALARY_COMPONENTS);
  const existing = components.find(function (c) {
    return String(c.teacher_id) === teacherId;
  });

  const existingEnabled = existing ? Number(existing.bpjs_deduction || 0) > 0 : false;
  const infaqEnabled = resolveInfaqZakatEnabledGas(payload, existingEnabled);
  const infaqFlagValue = infaqEnabled ? 1 : 0;

  if (existing) {
    const updated = updateSheetRecordById(SHEETS.SALARY_COMPONENTS, existing.id, function (row) {
      return {
        id: row.id,
        teacher_id: teacherId,
        base_salary: baseSalary,
        hourly_rate: hourlyRate,
        position_allowance: positionAllowance,
        bpjs_deduction: infaqFlagValue,
        custom_components_json:
          customJson !== undefined ? customJson : row.custom_components_json || '[]',
      };
    });
    return { status: 200, data: updated };
  }

  const created = {
    id: Utilities.getUuid(),
    teacher_id: teacherId,
    base_salary: baseSalary,
    hourly_rate: hourlyRate,
    position_allowance: positionAllowance,
    bpjs_deduction: infaqFlagValue,
    custom_components_json: customJson !== undefined ? customJson : '[]',
  };
  appendSheetRecord(SHEETS.SALARY_COMPONENTS, created);
  return { status: 201, data: created };
}

function handleUpsertSalaryComponent(payload) {
  const teacherId = sanitizeString(payload.teacher_id);
  if (!teacherId) {
    return buildJsonResponse(400, { ok: false, error: 'teacher_id tidak valid.' });
  }
  const result = upsertSalaryComponentDataGas(payload);
  bumpSyncVersionGas(['teachers']);
  return buildJsonResponse(result.status, { ok: true, data: result.data });
}

function normalizePeriodKey(monthValue) {
  if (monthValue === null || monthValue === undefined) return '';
  var raw = String(monthValue).trim();
  var rangeMatch = raw.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (rangeMatch) {
    var s = Number(rangeMatch[1]);
    var e = Number(rangeMatch[2]);
    if (s < 1 || s > 12 || e < 1 || e > 12) return '';
    return s === e ? String(s) : s + '-' + e;
  }
  var num = Number(raw);
  if (!isNaN(num) && num >= 1 && num <= 12) {
    return String(num);
  }
  return '';
}

function parsePeriodMonthKeyGas(monthValue) {
  var norm = normalizePeriodKey(monthValue);
  var rangeMatch = norm.match(/^(\d{1,2})-(\d{1,2})$/);
  if (rangeMatch) {
    var startMonth = Number(rangeMatch[1]);
    var endMonth = Number(rangeMatch[2]);
    var monthCount =
      endMonth >= startMonth ? endMonth - startMonth + 1 : 12 - startMonth + 1 + endMonth;
    var monthsInRange = [];
    var cur = startMonth;
    for (var i = 0; i < monthCount; i++) {
      monthsInRange.push(cur);
      cur = cur === 12 ? 1 : cur + 1;
    }
    return {
      key: norm,
      startMonth: startMonth,
      endMonth: endMonth,
      isRange: true,
      monthCount: monthCount,
      monthsInRange: monthsInRange,
    };
  }
  var single = Math.min(12, Math.max(1, Number(norm) || 1));
  return {
    key: String(single),
    startMonth: single,
    endMonth: single,
    isRange: false,
    monthCount: 1,
    monthsInRange: [single],
  };
}

function getAttendancesListDataGas(session, payload) {
  const monthKey = payload && payload.month ? normalizePeriodKey(payload.month) : '';
  const year = payload && payload.year ? Number(payload.year) : null;
  let records = readSheetRecords(SHEETS.ATTENDANCES);

  if (monthKey && year) {
    const parsedPeriod = parsePeriodMonthKeyGas(monthKey);
    const directMatches = records.filter(function (r) {
      return normalizePeriodKey(r.month) === monthKey && Number(r.year) === year;
    });

    if (parsedPeriod.isRange) {
      const directTeacherIds = {};
      directMatches.forEach(function (a) {
        directTeacherIds[String(a.teacher_id)] = true;
      });
      const rangeSet = {};
      parsedPeriod.monthsInRange.forEach(function (m) {
        rangeSet[String(m)] = true;
      });
      const teachers = readSheetRecords(SHEETS.TEACHERS);
      const aggregatedRows = [];

      teachers.forEach(function (t) {
        if (directTeacherIds[String(t.id)]) return;
        const subRows = records.filter(function (a) {
          return (
            String(a.teacher_id) === String(t.id) &&
            Number(a.year) === year &&
            Boolean(rangeSet[normalizePeriodKey(a.month)])
          );
        });
        if (subRows.length > 0) {
          let sumPresent = 0;
          let sumAbsent = 0;
          let sumJtm = 0;
          subRows.forEach(function (r) {
            sumPresent += Number(r.present_days || 0);
            sumAbsent += Number(r.absent_days || 0);
            sumJtm += Number(r.total_jtm || 0);
          });
          aggregatedRows.push({
            id: 'agg_' + t.id + '_' + monthKey + '_' + year,
            teacher_id: t.id,
            month: monthKey,
            year: year,
            present_days: sanitizeDecimalNonNegative(sumPresent, 0),
            absent_days: sanitizeDecimalNonNegative(sumAbsent, 0),
            total_jtm: sanitizeDecimalNonNegative(sumJtm, 0),
          });
        }
      });
      records = directMatches.concat(aggregatedRows);
    } else {
      records = directMatches;
    }
  }

  if (session.role === ROLES.GURU) {
    const ownTeacher = resolveOwnedTeacherRecord(session);
    if (!ownTeacher) return null;
    records = records.filter(function (r) {
      return String(r.teacher_id) === String(ownTeacher.id);
    });
  }

  return records;
}

function handleListAttendances(session, payload) {
  const records = getAttendancesListDataGas(session, payload);
  if (records === null) return forbiddenResponse();
  return buildJsonResponse(200, { ok: true, data: records });
}

function upsertAttendanceSummaryRecord(teacherId, monthNumOrKey, year, presentDays, absentDays, totalJtm) {
  const monthKey = normalizePeriodKey(monthNumOrKey);
  const storedMonth = /^\d+$/.test(monthKey) ? Number(monthKey) : monthKey;
  const cleanPresent = sanitizeDecimalNonNegative(presentDays, 0);
  const cleanAbsent = sanitizeDecimalNonNegative(absentDays, 0);
  const cleanJtm = sanitizeDecimalNonNegative(totalJtm, 0);

  const attendances = readSheetRecords(SHEETS.ATTENDANCES);
  const existing = attendances.find(function (a) {
    return (
      String(a.teacher_id) === String(teacherId) &&
      normalizePeriodKey(a.month) === monthKey &&
      Number(a.year) === Number(year)
    );
  });

  if (existing) {
    return updateSheetRecordById(SHEETS.ATTENDANCES, existing.id, function (row) {
      return {
        id: row.id,
        teacher_id: teacherId,
        month: storedMonth,
        year: Number(year),
        present_days: cleanPresent,
        absent_days: cleanAbsent,
        total_jtm: cleanJtm,
      };
    });
  }

  const created = {
    id: Utilities.getUuid(),
    teacher_id: teacherId,
    month: storedMonth,
    year: Number(year),
    present_days: cleanPresent,
    absent_days: cleanAbsent,
    total_jtm: cleanJtm,
  };
  appendSheetRecord(SHEETS.ATTENDANCES, created);
  return created;
}

function handleUpsertAttendance(payload) {
  const teacherId = sanitizeString(payload.teacher_id);
  const monthKey = normalizePeriodKey(payload.month);
  const year = Number(payload.year);

  if (!teacherId || !monthKey || !year || year < 2020 || year > 2100) {
    return buildJsonResponse(400, { ok: false, error: 'Parameter kehadiran (guru, periode bulan, tahun) tidak valid.' });
  }

  const saved = upsertAttendanceSummaryRecord(
    teacherId,
    monthKey,
    year,
    payload.present_days,
    payload.absent_days,
    payload.total_jtm
  );
  bumpSyncVersionGas(['attendances'], [{ month: monthKey, year: year }]);
  return buildJsonResponse(200, { ok: true, data: saved });
}

function handleBulkUpsertAttendances(payload) {
  const monthKey = normalizePeriodKey(payload.month);
  const year = Number(payload.year);
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!monthKey || !year || year < 2020 || year > 2100) {
    return buildJsonResponse(400, { ok: false, error: 'Periode bulan dan tahun kehadiran tidak valid.' });
  }
  if (items.length === 0) {
    return buildJsonResponse(400, { ok: false, error: 'Daftar kehadiran kosong.' });
  }

  const storedMonth = /^\d+$/.test(monthKey) ? Number(monthKey) : monthKey;
  const allAttendances = readSheetRecords(SHEETS.ATTENDANCES);
  const existingIdxByTeacher = {};

  allAttendances.forEach(function (a, idx) {
    if (normalizePeriodKey(a.month) === monthKey && Number(a.year) === year) {
      existingIdxByTeacher[String(a.teacher_id)] = idx;
    }
  });

  const savedRows = [];
  items.forEach(function (item) {
    const teacherId = sanitizeString(item.teacher_id);
    if (!teacherId) return;
    const cleanPresent = sanitizeDecimalNonNegative(item.present_days, 0);
    const cleanAbsent = sanitizeDecimalNonNegative(item.absent_days, 0);
    const cleanJtm = sanitizeDecimalNonNegative(item.total_jtm, 0);
    const idx = existingIdxByTeacher[teacherId];

    if (idx !== undefined) {
      const updated = {
        id: allAttendances[idx].id,
        teacher_id: teacherId,
        month: storedMonth,
        year: year,
        present_days: cleanPresent,
        absent_days: cleanAbsent,
        total_jtm: cleanJtm,
      };
      allAttendances[idx] = updated;
      savedRows.push(updated);
    } else {
      const created = {
        id: Utilities.getUuid(),
        teacher_id: teacherId,
        month: storedMonth,
        year: year,
        present_days: cleanPresent,
        absent_days: cleanAbsent,
        total_jtm: cleanJtm,
      };
      allAttendances.push(created);
      existingIdxByTeacher[teacherId] = allAttendances.length - 1;
      savedRows.push(created);
    }
  });

  if (savedRows.length > 0) {
    replaceSheetRecords(SHEETS.ATTENDANCES, allAttendances);
    var versions = bumpSyncVersionGas(['attendances'], [{ month: monthKey, year: year }]);
    return buildJsonResponse(200, {
      ok: true,
      data: {
        saved: savedRows,
        count: savedRows.length,
        versions: versions,
      },
    });
  }

  return buildJsonResponse(200, {
    ok: true,
    data: { saved: [], count: 0, versions: getSyncMetaGas(false).versions },
  });
}

function normalizeAttendanceLogStatus(status) {
  var clean = sanitizeString(status).toLowerCase();
  if (clean === 'hadir' || clean === 'tugas' || clean === 'sakit' || clean === 'izin') {
    return clean;
  }
  return '';
}

function isPeriodPayrollLocked(monthNum, yearNum) {
  var payrolls = readSheetRecords(SHEETS.PAYROLLS);
  var targetMonth = Number(monthNum);
  var targetYear = Number(yearNum);
  return payrolls.some(function (p) {
    if (Number(p.year) !== targetYear) return false;
    if (String(p.status) === PAYROLL_STATUS.DRAFT) return false;
    var parsed = parsePeriodMonthKeyGas(p.month);
    return parsed.monthsInRange.indexOf(targetMonth) !== -1;
  });
}

function normalizeLogValidationStatusGas(status) {
  var clean = sanitizeString(status).toLowerCase();
  if (clean === 'valid' || clean === 'invalid' || clean === 'pending') {
    return clean;
  }
  return 'pending';
}

function computeAttendanceMetricsFromLogsGas(sourceLogs, teacherId, monthNum, yearNum) {
  var logs = (sourceLogs || []).filter(function (l) {
    return (
      String(l.teacher_id) === String(teacherId) &&
      Number(l.month) === Number(monthNum) &&
      Number(l.year) === Number(yearNum)
    );
  });

  var hadirCount = 0;
  var tugasCount = 0;
  var sakitCount = 0;
  var izinCount = 0;
  var totalJtm = 0;

  logs.forEach(function (l) {
    if (normalizeLogValidationStatusGas(l.validation_status) === 'invalid') {
      return;
    }
    var st = normalizeAttendanceLogStatus(l.status) || 'hadir';
    if (st === 'hadir') {
      hadirCount += 1;
      totalJtm += sanitizeDecimalNonNegative(l.jtm_hours, 0);
    } else if (st === 'tugas') {
      tugasCount += 1;
      totalJtm += sanitizeDecimalNonNegative(l.jtm_hours, 0);
    } else if (st === 'sakit') {
      sakitCount += 1;
    } else if (st === 'izin') {
      izinCount += 1;
    }
  });

  return {
    present_days: sanitizeDecimalNonNegative(hadirCount * 1 + tugasCount * 0.5, 0),
    absent_days: sakitCount + izinCount,
    total_jtm: sanitizeDecimalNonNegative(totalJtm, 0),
  };
}

function syncMonthlyAttendanceFromLogs(teacherId, monthNum, yearNum, preloadedLogs) {
  var logsSource = preloadedLogs || readSheetRecords(SHEETS.ATTENDANCE_LOGS);
  var metrics = computeAttendanceMetricsFromLogsGas(logsSource, teacherId, monthNum, yearNum);
  return upsertAttendanceSummaryRecord(
    teacherId,
    Number(monthNum),
    Number(yearNum),
    metrics.present_days,
    metrics.absent_days,
    metrics.total_jtm
  );
}

function normalizeDateStringGas(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    var tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
    return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  }
  var raw = String(value).trim().replace(/^'/, '');
  var exact = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (exact) return raw;
  var isoPrefix = raw.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoPrefix) {
    var d = new Date(raw);
    if (!isNaN(d.getTime())) {
      var tz2 = Session.getScriptTimeZone() || 'Asia/Jakarta';
      return Utilities.formatDate(d, tz2, 'yyyy-MM-dd');
    }
    return isoPrefix[1];
  }
  var parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    var tz3 = Session.getScriptTimeZone() || 'Asia/Jakarta';
    return Utilities.formatDate(parsed, tz3, 'yyyy-MM-dd');
  }
  return raw;
}

function getAttendanceLogsListDataGas(session, payload) {
  var records = readSheetRecords(SHEETS.ATTENDANCE_LOGS).map(function (r) {
    return Object.assign({}, r, {
      date: normalizeDateStringGas(r.date),
      class_name: sanitizeString(r.class_name || 'Kelas Umum') || 'Kelas Umum',
      validation_status: normalizeLogValidationStatusGas(r.validation_status),
      validation_note: sanitizeString(r.validation_note || ''),
    });
  });
  var monthKey = payload && payload.month ? normalizePeriodKey(payload.month) : '';
  var year = payload && payload.year ? Number(payload.year) : null;
  var filterTeacherId = payload && payload.teacher_id ? sanitizeString(payload.teacher_id) : '';

  if (session.role === ROLES.GURU) {
    var ownTeacher = resolveOwnedTeacherRecord(session);
    if (!ownTeacher) return null;
    records = records.filter(function (r) {
      return String(r.teacher_id) === String(ownTeacher.id);
    });
  } else if (filterTeacherId) {
    records = records.filter(function (r) {
      return String(r.teacher_id) === filterTeacherId;
    });
  }

  if (year) {
    records = records.filter(function (r) {
      return Number(r.year) === year;
    });
  }

  if (monthKey) {
    var parsedPeriod = parsePeriodMonthKeyGas(monthKey);
    records = records.filter(function (r) {
      return parsedPeriod.monthsInRange.indexOf(Number(r.month)) !== -1;
    });
  }

  records.sort(function (a, b) {
    return String(b.date || '').localeCompare(String(a.date || ''));
  });

  return records;
}

function handleListAttendanceLogs(session, payload) {
  var records = getAttendanceLogsListDataGas(session, payload);
  if (records === null) return forbiddenResponse();
  return buildJsonResponse(200, { ok: true, data: records });
}

function handleUpsertMyAttendanceLog(session, payload) {
  var targetTeacherId = '';
  if (session.role === ROLES.GURU) {
    var ownTeacher = resolveOwnedTeacherRecord(session);
    if (!ownTeacher) return forbiddenResponse();
    targetTeacherId = String(ownTeacher.id);
  } else {
    targetTeacherId = sanitizeString(payload.teacher_id);
  }

  if (!targetTeacherId) {
    return buildJsonResponse(400, { ok: false, error: 'Identitas guru tidak valid.' });
  }

  var rawDate = sanitizeString(payload.date);
  var dateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) {
    return buildJsonResponse(400, { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' });
  }

  var yearNum = Number(dateMatch[1]);
  var monthNum = Number(dateMatch[2]);
  if (yearNum < 2020 || yearNum > 2100 || monthNum < 1 || monthNum > 12) {
    return buildJsonResponse(400, { ok: false, error: 'Tanggal kehadiran tidak valid.' });
  }

  var status = normalizeAttendanceLogStatus(payload.status);
  if (!status) {
    return buildJsonResponse(400, {
      ok: false,
      error: 'Kondisi kehadiran harus salah satu dari: hadir, tugas, sakit, atau izin.',
    });
  }

  if (isPeriodPayrollLocked(monthNum, yearNum)) {
    return buildJsonResponse(409, {
      ok: false,
      error: 'Periode penggajian bulan ini sudah diajukan/disetujui sehingga catatan kehadiran terkunci.',
    });
  }

  var className = (sanitizeString(payload.class_name) || 'Kelas Umum').slice(0, 80);
  var jtmHours =
    status === 'sakit' || status === 'izin' ? 0 : sanitizeDecimalNonNegative(payload.jtm_hours, 0);
  var note = sanitizeString(payload.note || '').slice(0, 250);
  var nowIso = new Date().toISOString();

  var existingLogs = readSheetRecords(SHEETS.ATTENDANCE_LOGS);
  var existing = existingLogs.find(function (l) {
    var rowClass = (sanitizeString(l.class_name) || 'Kelas Umum').toLowerCase();
    return (
      String(l.teacher_id) === targetTeacherId &&
      normalizeDateStringGas(l.date) === rawDate &&
      rowClass === className.toLowerCase()
    );
  });

  var storedDateText = "'" + rawDate;
  var savedLog;
  if (existing) {
    savedLog = updateSheetRecordById(SHEETS.ATTENDANCE_LOGS, existing.id, function (row) {
      return {
        id: row.id,
        teacher_id: targetTeacherId,
        date: storedDateText,
        month: monthNum,
        year: yearNum,
        status: status,
        jtm_hours: jtmHours,
        note: note,
        created_at: row.created_at || nowIso,
        updated_at: nowIso,
        class_name: className,
        validation_status: 'pending',
        validation_note: '',
      };
    });
    savedLog = Object.assign({}, savedLog, { date: rawDate });
  } else {
    savedLog = {
      id: Utilities.getUuid(),
      teacher_id: targetTeacherId,
      date: storedDateText,
      month: monthNum,
      year: yearNum,
      status: status,
      jtm_hours: jtmHours,
      note: note,
      created_at: nowIso,
      updated_at: nowIso,
      class_name: className,
      validation_status: 'pending',
      validation_note: '',
    };
    appendSheetRecord(SHEETS.ATTENDANCE_LOGS, savedLog);
    savedLog = Object.assign({}, savedLog, { date: rawDate });
  }

  var summary = syncMonthlyAttendanceFromLogs(targetTeacherId, monthNum, yearNum);
  bumpSyncVersionGas(['attendances'], [{ month: monthNum, year: yearNum }]);
  return buildJsonResponse(existing ? 200 : 201, {
    ok: true,
    data: {
      log: savedLog,
      attendanceSummary: summary,
    },
  });
}

function handleSyncDateAttendanceLogs(session, payload) {
  var targetTeacherId = '';
  if (session.role === ROLES.GURU) {
    var ownTeacher = resolveOwnedTeacherRecord(session);
    if (!ownTeacher) return forbiddenResponse();
    targetTeacherId = String(ownTeacher.id);
  } else {
    targetTeacherId = sanitizeString(payload.teacher_id);
  }

  if (!targetTeacherId) {
    return buildJsonResponse(400, { ok: false, error: 'Identitas guru tidak valid.' });
  }

  var rawDate = sanitizeString(payload.date);
  var dateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) {
    return buildJsonResponse(400, { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' });
  }

  var yearNum = Number(dateMatch[1]);
  var monthNum = Number(dateMatch[2]);
  if (yearNum < 2020 || yearNum > 2100 || monthNum < 1 || monthNum > 12) {
    return buildJsonResponse(400, { ok: false, error: 'Tanggal kehadiran tidak valid.' });
  }

  if (isPeriodPayrollLocked(monthNum, yearNum)) {
    return buildJsonResponse(409, {
      ok: false,
      error: 'Periode penggajian bulan ini sudah diajukan/disetujui sehingga catatan kehadiran terkunci.',
    });
  }

  var entries = Array.isArray(payload.entries) ? payload.entries : [];
  var sanitizedEntries = [];
  var seenClassKeys = {};

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i] || {};
    var className = (sanitizeString(entry.class_name) || '').slice(0, 80);
    if (!className) continue;
    var classKey = className.toLowerCase();
    if (seenClassKeys[classKey]) continue;
    seenClassKeys[classKey] = true;

    var status = normalizeAttendanceLogStatus(entry.status);
    if (!status) {
      return buildJsonResponse(400, {
        ok: false,
        error: 'Kondisi kehadiran kelas "' + className + '" tidak valid.',
      });
    }
    var jtmHours =
      status === 'sakit' || status === 'izin' ? 0 : sanitizeDecimalNonNegative(entry.jtm_hours, 0);
    var note = sanitizeString(entry.note || '').slice(0, 250);

    sanitizedEntries.push({
      class_name: className,
      status: status,
      jtm_hours: jtmHours,
      note: note,
    });
  }

  var allLogs = readSheetRecords(SHEETS.ATTENDANCE_LOGS);
  var existingLogs = [];
  var keptLogs = [];

  allLogs.forEach(function (l) {
    var cleanD = normalizeDateStringGas(l.date);
    if (String(l.teacher_id) === targetTeacherId && cleanD === rawDate) {
      existingLogs.push(l);
    } else {
      keptLogs.push(Object.assign({}, l, { date: cleanD ? "'" + cleanD : '' }));
    }
  });

  var nowIso = new Date().toISOString();
  var storedDateText = "'" + rawDate;
  var newRowRecords = [];
  var savedLogs = [];
  sanitizedEntries.forEach(function (item) {
    var prevMatch = existingLogs.find(function (pl) {
      return (
        (sanitizeString(pl.class_name || '') || '').toLowerCase() ===
        item.class_name.toLowerCase()
      );
    });
    var isUnchanged =
      prevMatch &&
      normalizeAttendanceLogStatus(prevMatch.status) === item.status &&
      Number(prevMatch.jtm_hours || 0) === Number(item.jtm_hours) &&
      sanitizeString(prevMatch.note || '') === item.note;

    var rowRecord = {
      id: prevMatch ? String(prevMatch.id) : Utilities.getUuid(),
      teacher_id: targetTeacherId,
      date: storedDateText,
      month: monthNum,
      year: yearNum,
      status: item.status,
      jtm_hours: item.jtm_hours,
      note: item.note,
      created_at: prevMatch && prevMatch.created_at ? prevMatch.created_at : nowIso,
      updated_at: nowIso,
      class_name: item.class_name,
      validation_status: isUnchanged
        ? normalizeLogValidationStatusGas(prevMatch.validation_status)
        : 'pending',
      validation_note: isUnchanged ? sanitizeString(prevMatch.validation_note || '') : '',
    };
    newRowRecords.push(rowRecord);
    savedLogs.push(Object.assign({}, rowRecord, { date: rawDate }));
  });

  var nextAllLogs = keptLogs.concat(newRowRecords);
  replaceSheetRecords(SHEETS.ATTENDANCE_LOGS, nextAllLogs);

  var summary = syncMonthlyAttendanceFromLogs(targetTeacherId, monthNum, yearNum, nextAllLogs);
  bumpSyncVersionGas(['attendances'], [{ month: monthNum, year: yearNum }]);
  return buildJsonResponse(200, {
    ok: true,
    data: {
      date: rawDate,
      logs: savedLogs,
      attendanceSummary: summary,
    },
  });
}

function handleDeleteMyAttendanceLog(session, payload) {
  var logId = sanitizeString(payload.id);
  if (!logId) return notFoundResponse();

  var logs = readSheetRecords(SHEETS.ATTENDANCE_LOGS);
  var target = logs.find(function (l) {
    return String(l.id) === logId;
  });
  if (!target) return notFoundResponse();

  if (session.role === ROLES.GURU) {
    var ownTeacher = resolveOwnedTeacherRecord(session);
    if (!ownTeacher || String(target.teacher_id) !== String(ownTeacher.id)) {
      return forbiddenResponse();
    }
  }

  if (isPeriodPayrollLocked(target.month, target.year)) {
    return buildJsonResponse(409, {
      ok: false,
      error: 'Periode penggajian bulan ini sudah diajukan/disetujui sehingga catatan tidak dapat dihapus.',
    });
  }

  deleteSheetRecordById(SHEETS.ATTENDANCE_LOGS, logId);
  var remainingLogs = logs.filter(function (l) {
    return String(l.id) !== logId;
  });
  var summary = syncMonthlyAttendanceFromLogs(target.teacher_id, target.month, target.year, remainingLogs);
  bumpSyncVersionGas(['attendances'], [{ month: Number(target.month), year: Number(target.year) }]);

  return buildJsonResponse(200, {
    ok: true,
    data: {
      deletedId: logId,
      attendanceSummary: summary,
    },
  });
}

function handleValidateAttendanceLogs(payload) {
  var ids = Array.isArray(payload.ids)
    ? payload.ids
        .map(function (x) {
          return sanitizeString(x);
        })
        .filter(Boolean)
    : payload.id
    ? [sanitizeString(payload.id)].filter(Boolean)
    : [];

  if (ids.length === 0) {
    return buildJsonResponse(400, { ok: false, error: 'ID catatan kehadiran tidak ditemukan.' });
  }

  var vStatus = normalizeLogValidationStatusGas(payload.validation_status);
  var vNote = sanitizeString(payload.validation_note || '').slice(0, 250);
  var nowIso = new Date().toISOString();

  var allLogs = readSheetRecords(SHEETS.ATTENDANCE_LOGS);
  var targetLogs = allLogs.filter(function (l) {
    return ids.indexOf(String(l.id)) !== -1;
  });

  if (targetLogs.length === 0) {
    return notFoundResponse();
  }

  for (var i = 0; i < targetLogs.length; i++) {
    if (isPeriodPayrollLocked(targetLogs[i].month, targetLogs[i].year)) {
      return buildJsonResponse(409, {
        ok: false,
        error:
          'Periode penggajian bulan ini sudah diajukan/disetujui sehingga validasi terkunci.',
      });
    }
  }

  var affectedPeriods = {};
  var updatedLogs = [];

  for (var j = 0; j < allLogs.length; j++) {
    var row = allLogs[j];
    var cleanDate = normalizeDateStringGas(row.date);
    if (ids.indexOf(String(row.id)) !== -1) {
      var updatedRow = {
        id: row.id,
        teacher_id: row.teacher_id,
        date: cleanDate ? "'" + cleanDate : '',
        month: row.month,
        year: row.year,
        status: row.status,
        jtm_hours: row.jtm_hours,
        note: row.note,
        created_at: row.created_at,
        updated_at: nowIso,
        class_name: row.class_name,
        validation_status: vStatus,
        validation_note: vStatus === 'invalid' ? vNote : '',
      };
      allLogs[j] = updatedRow;
      updatedLogs.push(Object.assign({}, updatedRow, { date: cleanDate }));
      var pKey = String(row.teacher_id) + ':' + Number(row.month) + ':' + Number(row.year);
      affectedPeriods[pKey] = {
        teacher_id: String(row.teacher_id),
        month: Number(row.month),
        year: Number(row.year),
      };
    } else if (cleanDate) {
      allLogs[j] = Object.assign({}, row, { date: "'" + cleanDate });
    }
  }

  replaceSheetRecords(SHEETS.ATTENDANCE_LOGS, allLogs);

  var allAttendances = readSheetRecords(SHEETS.ATTENDANCES);
  var affectedPeriodsList = [];
  var lastSummary = null;

  Object.keys(affectedPeriods).forEach(function (k) {
    var per = affectedPeriods[k];
    affectedPeriodsList.push(per);
    var metrics = computeAttendanceMetricsFromLogsGas(allLogs, per.teacher_id, per.month, per.year);
    var attIdx = allAttendances.findIndex(function (a) {
      return (
        String(a.teacher_id) === String(per.teacher_id) &&
        normalizePeriodKey(a.month) === String(per.month) &&
        Number(a.year) === Number(per.year)
      );
    });
    if (attIdx !== -1) {
      lastSummary = {
        id: allAttendances[attIdx].id,
        teacher_id: per.teacher_id,
        month: Number(per.month),
        year: Number(per.year),
        present_days: metrics.present_days,
        absent_days: metrics.absent_days,
        total_jtm: metrics.total_jtm,
      };
      allAttendances[attIdx] = lastSummary;
    } else {
      lastSummary = {
        id: Utilities.getUuid(),
        teacher_id: per.teacher_id,
        month: Number(per.month),
        year: Number(per.year),
        present_days: metrics.present_days,
        absent_days: metrics.absent_days,
        total_jtm: metrics.total_jtm,
      };
      allAttendances.push(lastSummary);
    }
  });

  replaceSheetRecords(SHEETS.ATTENDANCES, allAttendances);
  bumpSyncVersionGas(['attendances'], affectedPeriodsList);

  return buildJsonResponse(200, {
    ok: true,
    data: {
      updatedLogs: updatedLogs,
      attendanceSummary: lastSummary,
    },
  });
}

function getPayrollsListDataGas(session) {
  if (session.role === ROLES.GURU) {
    return null;
  }
  const payrolls = readSheetRecords(SHEETS.PAYROLLS);
  return enrichPayrollsWithSyncStatusGas(payrolls);
}

function handleListPayrolls(session) {
  const payrolls = getPayrollsListDataGas(session);
  if (payrolls === null) {
    return forbiddenResponse();
  }
  return buildJsonResponse(200, { ok: true, data: payrolls });
}

function handleGeneratePayrollDraft(payload) {
  const monthKey = normalizePeriodKey(payload.month);
  const month = /^\d+$/.test(monthKey) ? Number(monthKey) : monthKey;
  const year = Number(payload.year);

  if (!monthKey || !year || year < 2020 || year > 2100) {
    return buildJsonResponse(400, { ok: false, error: 'Periode bulan dan tahun penggajian tidak valid.' });
  }

  const teachers = readSheetRecords(SHEETS.TEACHERS);
  const components = readSheetRecords(SHEETS.SALARY_COMPONENTS);
  const allYearAttendances = readSheetRecords(SHEETS.ATTENDANCES).filter(function (a) {
    return Number(a.year) === year;
  });
  const parsedPeriod = parsePeriodMonthKeyGas(monthKey);
  const payrolls = readSheetRecords(SHEETS.PAYROLLS);

  const existingPayroll = payrolls.find(function (p) {
    return normalizePeriodKey(p.month) === monthKey && Number(p.year) === year;
  });

  if (existingPayroll && existingPayroll.status !== PAYROLL_STATUS.DRAFT) {
    return buildJsonResponse(409, {
      ok: false,
      error: 'Payroll periode ini sudah diajukan/disetujui dan tidak dapat di-generate ulang.',
    });
  }

  const payrollId = existingPayroll ? String(existingPayroll.id) : Utilities.getUuid();
  let totalBudget = 0;
  const generatedDetails = [];

  teachers.forEach(function (teacher) {
    const comp =
      components.find(function (c) {
        return String(c.teacher_id) === String(teacher.id);
      }) || {
        base_salary: 0,
        hourly_rate: 0,
        position_allowance: 0,
        bpjs_deduction: 0,
      };
    var att = allYearAttendances.find(function (a) {
      return String(a.teacher_id) === String(teacher.id) && normalizePeriodKey(a.month) === monthKey;
    });
    if (!att && parsedPeriod.isRange) {
      var subRows = allYearAttendances.filter(function (a) {
        return (
          String(a.teacher_id) === String(teacher.id) &&
          parsedPeriod.monthsInRange.indexOf(Number(normalizePeriodKey(a.month))) !== -1
        );
      });
      if (subRows.length > 0) {
        att = {
          present_days: subRows.reduce(function (s, r) {
            return s + Number(r.present_days || 0);
          }, 0),
          absent_days: subRows.reduce(function (s, r) {
            return s + Number(r.absent_days || 0);
          }, 0),
          total_jtm: subRows.reduce(function (s, r) {
            return s + Number(r.total_jtm || 0);
          }, 0),
        };
      }
    }
    if (!att) {
      att = {
        present_days: 0,
        absent_days: 0,
        total_jtm: 0,
      };
    }

    const baseSalary = Number(comp.base_salary || 0);
    const hourlyRate = Number(comp.hourly_rate || 0);
    const totalJtm = Number(att.total_jtm || 0);
    const jtmHonor = totalJtm * hourlyRate;
    const positionAllowance = Number(comp.position_allowance || 0);
    const infaqEnabled = Number(comp.bpjs_deduction || 0) > 0;

    let customComponents = [];
    try {
      customComponents = JSON.parse(comp.custom_components_json || '[]');
      if (!Array.isArray(customComponents)) customComponents = [];
    } catch (e) {
      customComponents = [];
    }

    let customAllowanceTotal = 0;
    let customDeductionTotal = 0;
    customComponents.forEach(function (c) {
      const amt = sanitizeNonNegativeNumber(c.amount, 0);
      if (c.type === 'allowance') {
        customAllowanceTotal += amt;
      } else {
        customDeductionTotal += amt;
      }
    });

    const infaqZakatAmount = calculateInfaqZakatGas(
      baseSalary,
      jtmHonor,
      positionAllowance,
      infaqEnabled,
      customAllowanceTotal
    );

    const grossSalary = baseSalary + jtmHonor + positionAllowance + customAllowanceTotal;
    const netSalary = Math.max(0, grossSalary - infaqZakatAmount - customDeductionTotal);
    totalBudget += netSalary;

    const detailBreakdown = {
      teacher_name: teacher.name,
      nip: teacher.nip,
      staff_category: resolveStaffCategoryGas(teacher.staff_category, teacher.status),
      status: teacher.status,
      bank_account: teacher.bank_account,
      month: month,
      year: year,
      present_days: Number(att.present_days || 0),
      absent_days: Number(att.absent_days || 0),
      total_jtm: totalJtm,
      base_salary: baseSalary,
      hourly_rate: hourlyRate,
      jtm_honor: jtmHonor,
      position_allowance: positionAllowance,
      infaq_zakat_enabled: infaqEnabled,
      infaq_zakat: infaqZakatAmount,
      bpjs_deduction: infaqZakatAmount,
      custom_components: customComponents,
      custom_allowance_total: customAllowanceTotal,
      custom_deduction_total: customDeductionTotal,
      gross_salary: grossSalary,
      net_salary: netSalary,
    };

    generatedDetails.push({
      id: Utilities.getUuid(),
      payroll_id: payrollId,
      teacher_id: String(teacher.id),
      net_salary: netSalary,
      details_json: JSON.stringify(detailBreakdown),
    });
  });

  if (existingPayroll) {
    updateSheetRecordById(SHEETS.PAYROLLS, payrollId, function () {
      return {
        id: payrollId,
        month: month,
        year: year,
        total_budget: totalBudget,
        status: PAYROLL_STATUS.DRAFT,
      };
    });
  } else {
    appendSheetRecord(SHEETS.PAYROLLS, {
      id: payrollId,
      month: month,
      year: year,
      total_budget: totalBudget,
      status: PAYROLL_STATUS.DRAFT,
    });
  }

  const allExistingDetails = readSheetRecords(SHEETS.PAYROLL_DETAILS);
  const keptDetails = allExistingDetails.filter(function (d) {
    return String(d.payroll_id) !== payrollId;
  });
  replaceSheetRecords(SHEETS.PAYROLL_DETAILS, keptDetails.concat(generatedDetails));

  recordDraftSnapshotGas(payrollId, monthKey, year);
  const nextVersions = bumpSyncVersionGas(['payrolls']);

  return buildJsonResponse(200, {
    ok: true,
    data: {
      id: payrollId,
      month: month,
      year: year,
      total_budget: totalBudget,
      status: PAYROLL_STATUS.DRAFT,
      details_count: generatedDetails.length,
      details: generatedDetails,
      needs_resync: false,
      resync_reasons: [],
      versions: nextVersions,
    },
  });
}

function handleUpdatePayrollStatus(session, payload) {
  const payrollId = sanitizeString(payload.id);
  const nextStatus = sanitizeString(payload.status).toLowerCase();

  if (!payrollId || !Object.values(PAYROLL_STATUS).includes(nextStatus)) {
    return buildJsonResponse(400, { ok: false, error: 'ID Payroll atau status tujuan tidak valid.' });
  }

  const payrolls = readSheetRecords(SHEETS.PAYROLLS);
  const current = payrolls.find(function (p) {
    return String(p.id) === payrollId;
  });
  if (!current) return notFoundResponse();

  const currentStatus = String(current.status);

  let authorized = false;
  if (session.role === ROLES.ADMIN) {
    if (currentStatus === PAYROLL_STATUS.DRAFT && nextStatus === PAYROLL_STATUS.SUBMITTED) authorized = true;
    if (currentStatus === PAYROLL_STATUS.APPROVED && nextStatus === PAYROLL_STATUS.PAID) authorized = true;
  } else if (session.role === ROLES.KEPSEK) {
    if (currentStatus === PAYROLL_STATUS.SUBMITTED && nextStatus === PAYROLL_STATUS.APPROVED) authorized = true;
    if (currentStatus === PAYROLL_STATUS.SUBMITTED && nextStatus === PAYROLL_STATUS.DRAFT) authorized = true;
  }

  if (!authorized) {
    return forbiddenResponse();
  }

  const updated = updateSheetRecordById(SHEETS.PAYROLLS, payrollId, function (row) {
    return {
      id: row.id,
      month: row.month,
      year: row.year,
      total_budget: row.total_budget,
      status: nextStatus,
    };
  });

  if (nextStatus !== PAYROLL_STATUS.DRAFT) {
    clearDraftSnapshotGas(payrollId);
  }
  bumpSyncVersionGas(['payrolls']);

  const enrichedUpdated = enrichPayrollsWithSyncStatusGas([updated])[0];
  return buildJsonResponse(200, { ok: true, data: enrichedUpdated });
}

function handleGetPayrollDetailsByPayrollId(session, payload) {
  if (session.role !== ROLES.ADMIN && session.role !== ROLES.KEPSEK) {
    return forbiddenResponse();
  }
  const payrollId = sanitizeString(payload.payroll_id);
  if (!payrollId) return notFoundResponse();

  let details = readSheetRecords(SHEETS.PAYROLL_DETAILS).filter(function (d) {
    return String(d.payroll_id) === payrollId;
  });

  if (details.length === 0) {
    const payrolls = readSheetRecords(SHEETS.PAYROLLS);
    const parentPayroll = payrolls.find(function (p) {
      return String(p.id) === payrollId;
    });
    if (parentPayroll && Number(parentPayroll.year)) {
      const archiveSheetName = 'Archive_Payroll_Details_' + Number(parentPayroll.year);
      const archivedRows = readCustomSheetRecordsIfExists(
        archiveSheetName,
        SCHEMA_HEADERS[SHEETS.PAYROLL_DETAILS]
      );
      details = archivedRows.filter(function (d) {
        return String(d.payroll_id) === payrollId;
      });
    }
  }

  return buildJsonResponse(200, { ok: true, data: details });
}

function getMyPayslipsDataGas(session) {
  const payrolls = readSheetRecords(SHEETS.PAYROLLS);
  const details = readSheetRecords(SHEETS.PAYROLL_DETAILS);
  const teachers = readSheetRecords(SHEETS.TEACHERS);
  const disbRequests = readSheetRecords(SHEETS.DISBURSEMENT_REQUESTS);

  if (session.role === ROLES.GURU) {
    const ownTeacher = resolveOwnedTeacherRecord(session);
    if (!ownTeacher) {
      return [];
    }

    const mySlips = details
      .filter(function (d) {
        return String(d.teacher_id) === String(ownTeacher.id);
      })
      .map(function (d) {
        const parentPayroll = payrolls.find(function (p) {
          return String(p.id) === String(d.payroll_id);
        });
        if (!parentPayroll) return null;
        return Object.assign({}, d, {
          slip_type: 'payroll',
          month: parentPayroll.month,
          year: parentPayroll.year,
          payroll_status: parentPayroll.status,
          teacher_name: ownTeacher.name,
          nip: ownTeacher.nip,
          bank_account: ownTeacher.bank_account,
          staff_category: resolveStaffCategoryGas(ownTeacher.staff_category, ownTeacher.status),
        });
      })
      .filter(Boolean);

    const issuedDisbSlips = disbRequests
      .filter(function (r) {
        return (
          String(r.teacher_id) === String(ownTeacher.id) &&
          String(r.status) === 'approved' &&
          r.issued_slip_id &&
          r.issued_slip_json
        );
      })
      .map(function (r) {
        return {
          id: r.issued_slip_id,
          slip_type: 'disbursement',
          disbursement_request_id: r.id,
          payroll_id: r.payroll_id || r.id,
          teacher_id: ownTeacher.id,
          month: r.month,
          year: r.year,
          payroll_status: PAYROLL_STATUS.PAID,
          net_salary: Number(r.approved_amount || 0),
          approved_amount: Number(r.approved_amount || 0),
          request_scope: r.request_scope,
          disbursement_timing: r.disbursement_timing,
          slip_issued_at: r.slip_issued_at,
          teacher_name: ownTeacher.name,
          nip: ownTeacher.nip,
          bank_account: ownTeacher.bank_account,
          staff_category: resolveStaffCategoryGas(ownTeacher.staff_category, ownTeacher.status),
          details_json: r.issued_slip_json,
        };
      });

    return issuedDisbSlips.concat(mySlips).sort(function (a, b) {
      var yrDiff = Number(b.year || 0) - Number(a.year || 0);
      if (yrDiff !== 0) return yrDiff;
      var mDiff = parsePeriodMonthKeyGas(b.month).endMonth - parsePeriodMonthKeyGas(a.month).endMonth;
      if (mDiff !== 0) return mDiff;
      if (a.slip_type === 'disbursement' && b.slip_type !== 'disbursement') return -1;
      if (a.slip_type !== 'disbursement' && b.slip_type === 'disbursement') return 1;
      return String(b.slip_issued_at || '').localeCompare(String(a.slip_issued_at || ''));
    });
  }

  return details.map(function (d) {
    const parentPayroll =
      payrolls.find(function (p) {
        return String(p.id) === String(d.payroll_id);
      }) || {};
    const teacher =
      teachers.find(function (t) {
        return String(t.id) === String(d.teacher_id);
      }) || {};
    return Object.assign({}, d, {
      month: parentPayroll.month,
      year: parentPayroll.year,
      payroll_status: parentPayroll.status,
      teacher_name: teacher.name,
      nip: teacher.nip,
      bank_account: teacher.bank_account,
    });
  });
}

function handleGetMyPayslips(session) {
  return buildJsonResponse(200, { ok: true, data: getMyPayslipsDataGas(session) });
}

function handleGetPayslipById(session, payload) {
  const detailId = sanitizeString(payload.id);
  if (!detailId) return notFoundResponse();

  const details = readSheetRecords(SHEETS.PAYROLL_DETAILS);
  const slip = details.find(function (d) {
    return String(d.id) === detailId;
  });
  if (!slip) return notFoundResponse();

  if (session.role === ROLES.GURU) {
    const ownTeacher = resolveOwnedTeacherRecord(session);
    if (!ownTeacher || String(slip.teacher_id) !== String(ownTeacher.id)) {
      return forbiddenResponse();
    }
  }

  return buildJsonResponse(200, { ok: true, data: slip });
}

function handleBootstrapAdmin(session, payload) {
  return buildJsonResponse(200, {
    ok: true,
    data: {
      teachers: getTeachersListDataGas(session) || [],
      payrolls: getPayrollsListDataGas(session) || [],
      attendances: getAttendancesListDataGas(session, payload) || [],
      attendanceLogs: getAttendanceLogsListDataGas(session, payload) || [],
      disbursements: getDisbursementRequestsDataGas(session) || [],
      notifications: getNotificationsDataGas(session),
      schoolProfile: getSchoolProfileDataGas(),
      versions: getSyncMetaGas(false).versions,
    },
  });
}

function handleBootstrapKepsek(session) {
  return buildJsonResponse(200, {
    ok: true,
    data: {
      payrolls: getPayrollsListDataGas(session) || [],
      summary: getDashboardSummaryDataGas(session),
      disbursements: getDisbursementRequestsDataGas(session) || [],
      notifications: getNotificationsDataGas(session),
      schoolProfile: getSchoolProfileDataGas(),
      versions: getSyncMetaGas(false).versions,
    },
  });
}

function handleBootstrapGuru(session, payload) {
  const now = new Date();
  const queryPayload = {
    month: payload && payload.month ? payload.month : now.getMonth() + 1,
    year: payload && payload.year ? payload.year : now.getFullYear(),
  };
  return buildJsonResponse(200, {
    ok: true,
    data: {
      summary: getDashboardSummaryDataGas(session),
      slips: getMyPayslipsDataGas(session) || [],
      attendanceLogs: getAttendanceLogsListDataGas(session, queryPayload) || [],
      attendances: getAttendancesListDataGas(session, queryPayload) || [],
      disbursements: getDisbursementRequestsDataGas(session) || [],
      estimates: getDisbursementEstimatesDataGas(session, queryPayload) || [],
      notifications: getNotificationsDataGas(session),
      schoolProfile: getSchoolProfileDataGas(),
      versions: getSyncMetaGas(false).versions,
    },
  });
}

/* ==========================================================================
 * 4B. PENGAJUAN PENCAIRAN GAJI PTK, OTORISASI BERJENJANG & NOTIFIKASI (v13)
 * ========================================================================== */

function formatRupiahGas(amount) {
  var num = Math.round(Math.abs(Number(amount || 0)));
  var str = String(num).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return 'Rp ' + (Number(amount || 0) < 0 ? '-' + str : str);
}

function getSchoolDisplayNameGas() {
  var name = 'SIPAYROLL — Sistem Penggajian Sekolah & Yayasan';
  try {
    var rawProf = PropertiesService.getScriptProperties().getProperty('SIPAYROLL_SCHOOL_PROFILE');
    if (rawProf) {
      var parsed = JSON.parse(rawProf);
      if (parsed && parsed.school_name) name = parsed.school_name;
    }
  } catch (e) {}
  return name;
}

function getRoleEmailListGas(targetRole) {
  var users = readSheetRecords(SHEETS.USERS_AUTH);
  var emails = [];
  users.forEach(function (u) {
    if (String(u.role).trim().toLowerCase() === String(targetRole).toLowerCase()) {
      var candidate = sanitizeString(u.email || u.username || '').toLowerCase();
      if (candidate && candidate.indexOf('@') !== -1 && emails.indexOf(candidate) === -1) {
        emails.push(candidate);
      }
    }
  });
  return emails;
}

function sendNotificationEmailGas(recipientEmails, subject, bodyText, htmlBody) {
  if (!recipientEmails || recipientEmails.length === 0) return false;
  try {
    MailApp.sendEmail({
      to: recipientEmails.join(','),
      subject: subject,
      body: bodyText,
      htmlBody: htmlBody || undefined,
    });
    return true;
  } catch (mailErr) {
    console.warn('MailApp notification warning:', mailErr && mailErr.message ? mailErr.message : mailErr);
    return false;
  }
}

function createNotificationRecordGas(params) {
  var record = {
    id: Utilities.getUuid(),
    recipient_role: sanitizeString(params.recipient_role || 'admin'),
    recipient_teacher_id: sanitizeString(params.recipient_teacher_id || ''),
    recipient_email: sanitizeString(params.recipient_email || ''),
    title: sanitizeString(params.title || '').slice(0, 140),
    message: sanitizeString(params.message || '').slice(0, 500),
    type: sanitizeString(params.type || 'info'),
    ref_id: sanitizeString(params.ref_id || ''),
    is_read: false,
    created_at: new Date().toISOString(),
  };
  appendSheetRecord(SHEETS.NOTIFICATIONS, record);
  return record;
}

function buildTeacherEstimateSnapshotGas(teacher, monthVal, yearVal, cachedSheets) {
  var cache = cachedSheets || {};
  var readCached = function (sheetName) {
    if (!cache[sheetName]) {
      cache[sheetName] = readSheetRecords(sheetName);
    }
    return cache[sheetName];
  };

  var periodKey = normalizePeriodKey(monthVal);
  var yr = Number(yearVal);
  var payrolls = readCached(SHEETS.PAYROLLS);
  var details = readCached(SHEETS.PAYROLL_DETAILS);

  var matchingPayroll = payrolls.find(function (p) {
    return normalizePeriodKey(p.month) === periodKey && Number(p.year) === yr;
  });
  var matchingDetail = matchingPayroll
    ? details.find(function (d) {
        return String(d.payroll_id) === String(matchingPayroll.id) && String(d.teacher_id) === String(teacher.id);
      })
    : null;

  var estimatedNet = 0;
  var detailsObj = {};
  var payrollStatus = matchingPayroll ? String(matchingPayroll.status) : 'estimate_live';

  if (matchingDetail) {
    estimatedNet = Number(matchingDetail.net_salary || 0);
    try {
      detailsObj = JSON.parse(matchingDetail.details_json || '{}');
    } catch (e) {
      detailsObj = {};
    }
  } else {
    var components = readCached(SHEETS.SALARY_COMPONENTS);
    var comp = components.find(function (c) {
      return String(c.teacher_id) === String(teacher.id);
    }) || {
      base_salary: 0,
      hourly_rate: 0,
      position_allowance: 0,
      bpjs_deduction: 0,
    };
    var parsedPeriod = parsePeriodMonthKeyGas(periodKey);
    var allAtt = readCached(SHEETS.ATTENDANCES).filter(function (a) {
      return String(a.teacher_id) === String(teacher.id) && Number(a.year) === yr;
    });
    var att = allAtt.find(function (a) {
      return normalizePeriodKey(a.month) === periodKey;
    });
    if (!att && parsedPeriod.isRange) {
      var subRows = allAtt.filter(function (a) {
        return parsedPeriod.monthsInRange.indexOf(Number(normalizePeriodKey(a.month))) !== -1;
      });
      if (subRows.length > 0) {
        att = {
          present_days: subRows.reduce(function (s, r) { return s + Number(r.present_days || 0); }, 0),
          absent_days: subRows.reduce(function (s, r) { return s + Number(r.absent_days || 0); }, 0),
          total_jtm: subRows.reduce(function (s, r) { return s + Number(r.total_jtm || 0); }, 0),
        };
      }
    }
    if (!att) {
      var validLogs = readCached(SHEETS.ATTENDANCE_LOGS).filter(function (l) {
        return (
          String(l.teacher_id) === String(teacher.id) &&
          Number(l.year) === yr &&
          parsedPeriod.monthsInRange.indexOf(Number(l.month)) !== -1 &&
          normalizeLogValidationStatusGas(l.validation_status) !== 'invalid'
        );
      });
      var hadirC = 0;
      var tugasC = 0;
      var absC = 0;
      var jtmSum = 0;
      validLogs.forEach(function (l) {
        var st = normalizeAttendanceLogStatus(l.status) || 'hadir';
        if (st === 'hadir') {
          hadirC += 1;
          jtmSum += sanitizeDecimalNonNegative(l.jtm_hours, 0);
        } else if (st === 'tugas') {
          tugasC += 1;
          jtmSum += sanitizeDecimalNonNegative(l.jtm_hours, 0);
        } else {
          absC += 1;
        }
      });
      att = {
        present_days: sanitizeDecimalNonNegative(hadirC + tugasC * 0.5, 0),
        absent_days: absC,
        total_jtm: sanitizeDecimalNonNegative(jtmSum, 0),
      };
    }

    var baseSalary = Number(comp.base_salary || 0);
    var hourlyRate = Number(comp.hourly_rate || 0);
    var totalJtm = Number(att.total_jtm || 0);
    var jtmHonor = totalJtm * hourlyRate;
    var positionAllowance = Number(comp.position_allowance || 0);
    var infaqEnabled = Number(comp.bpjs_deduction || 0) > 0;

    var customComponents = [];
    try {
      customComponents = JSON.parse(comp.custom_components_json || '[]');
      if (!Array.isArray(customComponents)) customComponents = [];
    } catch (e) {
      customComponents = [];
    }
    var customAllowanceTotal = 0;
    var customDeductionTotal = 0;
    customComponents.forEach(function (c) {
      var amt = sanitizeNonNegativeNumber(c.amount, 0);
      if (c.type === 'allowance') customAllowanceTotal += amt;
      else customDeductionTotal += amt;
    });

    var infaqZakatAmount = calculateInfaqZakatGas(
      baseSalary,
      jtmHonor,
      positionAllowance,
      infaqEnabled,
      customAllowanceTotal
    );

    var grossSalary = baseSalary + jtmHonor + positionAllowance + customAllowanceTotal;
    estimatedNet = Math.max(0, grossSalary - infaqZakatAmount - customDeductionTotal);
    detailsObj = {
      teacher_name: teacher.name,
      nip: teacher.nip,
      staff_category: resolveStaffCategoryGas(teacher.staff_category, teacher.status),
      status: teacher.status,
      bank_account: teacher.bank_account,
      month: /^\d+$/.test(periodKey) ? Number(periodKey) : periodKey,
      year: yr,
      present_days: Number(att.present_days || 0),
      absent_days: Number(att.absent_days || 0),
      total_jtm: totalJtm,
      base_salary: baseSalary,
      hourly_rate: hourlyRate,
      jtm_honor: jtmHonor,
      position_allowance: positionAllowance,
      infaq_zakat_enabled: infaqEnabled,
      infaq_zakat: infaqZakatAmount,
      bpjs_deduction: infaqZakatAmount,
      custom_components: customComponents,
      custom_allowance_total: customAllowanceTotal,
      custom_deduction_total: customDeductionTotal,
      gross_salary: grossSalary,
      net_salary: estimatedNet,
    };
  }

  var disbReqs = readCached(SHEETS.DISBURSEMENT_REQUESTS).filter(function (r) {
    return (
      String(r.teacher_id) === String(teacher.id) &&
      normalizePeriodKey(r.month) === periodKey &&
      Number(r.year) === yr &&
      String(r.status) !== 'rejected'
    );
  });

  var alreadyRequested = 0;
  var alreadyApproved = 0;
  disbReqs.forEach(function (r) {
    var st = String(r.status);
    var amt =
      st === 'approved' || st === 'approved_treasurer'
        ? Number(r.approved_amount !== '' && r.approved_amount !== undefined ? r.approved_amount : r.requested_amount || 0)
        : Number(r.requested_amount || 0);
    alreadyRequested += amt;
    if (st === 'approved') {
      alreadyApproved += Number(r.approved_amount || 0);
    }
  });

  var isPaid = payrollStatus === PAYROLL_STATUS.PAID;
  var availableAmount = isPaid ? 0 : Math.max(0, estimatedNet - alreadyRequested);

  return {
    period_key: yr + ':' + periodKey,
    month: /^\d+$/.test(periodKey) ? Number(periodKey) : periodKey,
    year: yr,
    payroll_id: matchingPayroll ? String(matchingPayroll.id) : '',
    payroll_detail_id: matchingDetail ? String(matchingDetail.id) : '',
    payroll_status: payrollStatus,
    is_paid: isPaid,
    estimated_net_salary: estimatedNet,
    already_requested_amount: alreadyRequested,
    already_approved_amount: alreadyApproved,
    available_amount: availableAmount,
    details: detailsObj,
  };
}

function getDisbursementEstimatesDataGas(session, payload) {
  var ownTeacher = resolveOwnedTeacherRecord(session);
  if (!ownTeacher) return null;

  var sharedCache = {};
  var payrolls = readSheetRecords(SHEETS.PAYROLLS);
  sharedCache[SHEETS.PAYROLLS] = payrolls;
  sharedCache[SHEETS.PAYROLL_DETAILS] = readSheetRecords(SHEETS.PAYROLL_DETAILS);
  sharedCache[SHEETS.DISBURSEMENT_REQUESTS] = readSheetRecords(SHEETS.DISBURSEMENT_REQUESTS);

  var seenMap = {};
  var periodList = [];

  payrolls.forEach(function (p) {
    var pk = normalizePeriodKey(p.month);
    var yr = Number(p.year);
    var key = yr + ':' + pk;
    if (!seenMap[key]) {
      seenMap[key] = true;
      periodList.push({ month: p.month, year: yr });
    }
  });

  var reqMonth = payload && payload.month ? normalizePeriodKey(payload.month) : '';
  var reqYear = payload && payload.year ? Number(payload.year) : 0;
  if (reqMonth && reqYear) {
    var rKey = reqYear + ':' + reqMonth;
    if (!seenMap[rKey]) {
      seenMap[rKey] = true;
      periodList.push({ month: reqMonth, year: reqYear });
    }
  } else {
    var now = new Date();
    var cm = String(now.getMonth() + 1);
    var cy = now.getFullYear();
    var cKey = cy + ':' + cm;
    if (!seenMap[cKey]) {
      seenMap[cKey] = true;
      periodList.push({ month: Number(cm), year: cy });
    }
  }

  return periodList
    .map(function (item) {
      return buildTeacherEstimateSnapshotGas(ownTeacher, item.month, item.year, sharedCache);
    })
    .sort(function (a, b) {
      var yrDiff = Number(b.year || 0) - Number(a.year || 0);
      if (yrDiff !== 0) return yrDiff;
      return parsePeriodMonthKeyGas(b.month).endMonth - parsePeriodMonthKeyGas(a.month).endMonth;
    });
}

function handleGetDisbursementEstimates(session, payload) {
  var snapshots = getDisbursementEstimatesDataGas(session, payload);
  if (snapshots === null) return forbiddenResponse();
  return buildJsonResponse(200, { ok: true, data: snapshots });
}

function getDisbursementRequestsDataGas(session) {
  var allReqs = readSheetRecords(SHEETS.DISBURSEMENT_REQUESTS).sort(function (a, b) {
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });

  if (session.role === ROLES.GURU) {
    var ownTeacher = resolveOwnedTeacherRecord(session);
    if (!ownTeacher) return null;
    return allReqs.filter(function (r) {
      return String(r.teacher_id) === String(ownTeacher.id);
    });
  }

  if (session.role === ROLES.ADMIN || session.role === ROLES.KEPSEK) {
    return allReqs;
  }

  return null;
}

function handleListDisbursementRequests(session) {
  var result = getDisbursementRequestsDataGas(session);
  if (result === null) return forbiddenResponse();
  return buildJsonResponse(200, { ok: true, data: result });
}

function handleCreateDisbursementRequest(session, payload) {
  var ownTeacher = resolveOwnedTeacherRecord(session);
  if (!ownTeacher) return forbiddenResponse();

  var periodKey = normalizePeriodKey(payload.month);
  var year = Number(payload.year);
  if (!periodKey || !year || year < 2020 || year > 2100) {
    return buildJsonResponse(400, { ok: false, error: 'Periode bulan dan tahun pencairan tidak valid.' });
  }

  var scope = payload.request_scope === 'full' ? 'full' : 'partial';
  var timing = payload.disbursement_timing === 'early' ? 'early' : 'ontime';
  var reason = sanitizeString(payload.reason || '').slice(0, 240);

  var snapshot = buildTeacherEstimateSnapshotGas(ownTeacher, periodKey, year);
  if (snapshot.is_paid) {
    return buildJsonResponse(409, {
      ok: false,
      error: 'Gaji periode ini sudah dibayarkan penuh secara kolektif.',
    });
  }
  if (snapshot.available_amount <= 0) {
    return buildJsonResponse(400, {
      ok: false,
      error: 'Sisa estimasi gaji bersih periode ini sudah habis atau sedang dalam proses pengajuan.',
    });
  }

  var requestedAmount =
    scope === 'full'
      ? snapshot.available_amount
      : sanitizeNonNegativeNumber(payload.requested_amount, 0);

  if (!requestedAmount || requestedAmount <= 0) {
    return buildJsonResponse(400, { ok: false, error: 'Nominal pengajuan pencairan harus lebih dari Rp 0.' });
  }
  if (requestedAmount > snapshot.available_amount) {
    return buildJsonResponse(400, {
      ok: false,
      error: 'Nominal melebihi sisa estimasi tersedia (' + formatRupiahGas(snapshot.available_amount) + ').',
    });
  }

  var nowIso = new Date().toISOString();
  var storedMonth = /^\d+$/.test(periodKey) ? Number(periodKey) : periodKey;
  var newReq = {
    id: Utilities.getUuid(),
    teacher_id: String(ownTeacher.id),
    teacher_name: ownTeacher.name,
    nip: ownTeacher.nip,
    month: storedMonth,
    year: year,
    payroll_id: snapshot.payroll_id || '',
    payroll_detail_id: snapshot.payroll_detail_id || '',
    estimated_net_salary: snapshot.estimated_net_salary,
    request_scope: scope,
    disbursement_timing: timing,
    requested_amount: requestedAmount,
    approved_amount: requestedAmount,
    reason: reason,
    status: 'pending_treasurer',
    treasurer_note: '',
    kepsek_note: '',
    issued_slip_id: '',
    issued_slip_json: JSON.stringify(snapshot.details || {}),
    created_at: nowIso,
    treasurer_reviewed_at: '',
    kepsek_reviewed_at: '',
    slip_issued_at: '',
  };

  appendSheetRecord(SHEETS.DISBURSEMENT_REQUESTS, newReq);

  var adminEmails = getRoleEmailListGas(ROLES.ADMIN);
  var scopeLabel = scope === 'full' ? 'Seluruh Estimasi Gaji' : 'Sebagian Estimasi Gaji';
  var timingLabel =
    timing === 'early' ? 'Sebelum Waktunya (Pencairan Awal)' : 'Tepat Waktu (Kolektif Bendahara)';

  createNotificationRecordGas({
    recipient_role: ROLES.ADMIN,
    recipient_teacher_id: '',
    recipient_email: adminEmails.join(', '),
    title: 'Pengajuan Pencairan Gaji: ' + ownTeacher.name,
    message:
      ownTeacher.name +
      ' mengajukan pencairan ' +
      scopeLabel +
      ' (' +
      timingLabel +
      ') sebesar ' +
      formatRupiahGas(requestedAmount) +
      ' untuk periode ' +
      storedMonth +
      '/' +
      year +
      '.' +
      (reason ? ' Catatan: ' + reason : ''),
    type: 'disbursement_submitted',
    ref_id: newReq.id,
  });

  var schoolName = getSchoolDisplayNameGas();
  var emailSent = sendNotificationEmailGas(
    adminEmails,
    '[SIPAYROLL] Pengajuan Pencairan Gaji Baru — ' + ownTeacher.name + ' (' + formatRupiahGas(requestedAmount) + ')',
    'Yth. Admin / Bendahara ' +
      schoolName +
      ',\n\n' +
      'Terdapat pengajuan pencairan gaji PTK baru dengan rincian:\n' +
      '- Nama PTK      : ' + ownTeacher.name + ' (NIP: ' + ownTeacher.nip + ')\n' +
      '- Periode       : ' + storedMonth + '/' + year + '\n' +
      '- Cakupan       : ' + scopeLabel + '\n' +
      '- Jadwal        : ' + timingLabel + '\n' +
      '- Nominal       : ' + formatRupiahGas(requestedAmount) + '\n' +
      '- Estimasi Gaji : ' + formatRupiahGas(snapshot.estimated_net_salary) + '\n' +
      (reason ? '- Keterangan    : ' + reason + '\n' : '') +
      '\nSilakan login ke portal SIPAYROLL -> Menu Pengajuan Pencairan PTK untuk meninjau & menyetujui.',
    '<div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:12px;">' +
      '<h2 style="margin:0 0 8px;color:#0f172a;font-size:18px;">Pengajuan Pencairan Gaji PTK Baru</h2>' +
      '<p style="margin:0 0 14px;color:#475569;font-size:13px;">' + schoolName + '</p>' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">' +
      '<tr><td style="padding:6px 0;color:#64748b;">Nama PTK</td><td style="padding:6px 0;font-weight:700;color:#0f172a;">' + ownTeacher.name + ' (' + ownTeacher.nip + ')</td></tr>' +
      '<tr><td style="padding:6px 0;color:#64748b;">Periode Gaji</td><td style="padding:6px 0;font-weight:700;color:#0f172a;">' + storedMonth + '/' + year + '</td></tr>' +
      '<tr><td style="padding:6px 0;color:#64748b;">Cakupan</td><td style="padding:6px 0;color:#0f172a;">' + scopeLabel + '</td></tr>' +
      '<tr><td style="padding:6px 0;color:#64748b;">Jadwal Pencairan</td><td style="padding:6px 0;color:#0f172a;">' + timingLabel + '</td></tr>' +
      '<tr><td style="padding:6px 0;color:#64748b;">Nominal Diajukan</td><td style="padding:6px 0;font-weight:700;color:#1d4ed8;">' + formatRupiahGas(requestedAmount) + '</td></tr>' +
      '<tr><td style="padding:6px 0;color:#64748b;">Estimasi Gaji Bersih</td><td style="padding:6px 0;color:#0f172a;">' + formatRupiahGas(snapshot.estimated_net_salary) + '</td></tr>' +
      (reason ? '<tr><td style="padding:6px 0;color:#64748b;">Alasan PTK</td><td style="padding:6px 0;color:#0f172a;">' + reason + '</td></tr>' : '') +
      '</table>' +
      '<p style="margin:0;color:#475569;font-size:12px;">Silakan buka aplikasi <strong>SIPAYROLL</strong> menu <strong>Pengajuan Pencairan PTK</strong> untuk memproses persetujuan Bendahara sebelum diteruskan ke Kepala Sekolah.</p>' +
      '</div>'
  );

  bumpSyncVersionGas(['disbursements', 'notifications']);

  return buildJsonResponse(201, {
    ok: true,
    data: {
      request: newReq,
      notified_admin_emails: adminEmails,
      email_sent: emailSent,
    },
  });
}

function handleTreasurerReviewDisbursement(payload) {
  var reqId = sanitizeString(payload.id);
  if (!reqId) return notFoundResponse();

  var allReqs = readSheetRecords(SHEETS.DISBURSEMENT_REQUESTS);
  var target = allReqs.find(function (r) {
    return String(r.id) === reqId;
  });
  if (!target) return notFoundResponse();
  if (String(target.status) !== 'pending_treasurer') {
    return buildJsonResponse(409, { ok: false, error: 'Pengajuan ini sudah diproses Bendahara sebelumnya.' });
  }

  var decision = payload.decision === 'reject' ? 'reject' : 'approve';
  var note = sanitizeString(payload.note || '').slice(0, 240);
  var nowIso = new Date().toISOString();

  var updated = updateSheetRecordById(SHEETS.DISBURSEMENT_REQUESTS, reqId, function (row) {
    if (decision === 'reject') {
      return Object.assign({}, row, {
        status: 'rejected',
        treasurer_note: note || 'Ditolak oleh Admin/Bendahara.',
        treasurer_reviewed_at: nowIso,
      });
    }
    var reqAmt = Number(row.requested_amount || 0);
    var estMax = Number(row.estimated_net_salary || reqAmt);
    var approvedAmt =
      payload.approved_amount !== undefined && Number(payload.approved_amount) > 0
        ? Math.min(sanitizeNonNegativeNumber(payload.approved_amount, reqAmt), estMax)
        : reqAmt;
    return Object.assign({}, row, {
      approved_amount: approvedAmt,
      status: 'approved_treasurer',
      treasurer_note: note,
      treasurer_reviewed_at: nowIso,
    });
  });

  if (decision === 'reject') {
    createNotificationRecordGas({
      recipient_role: ROLES.GURU,
      recipient_teacher_id: target.teacher_id,
      title: 'Pengajuan Pencairan Ditolak Bendahara',
      message:
        'Pengajuan pencairan periode ' +
        target.month +
        '/' +
        target.year +
        ' sebesar ' +
        formatRupiahGas(target.requested_amount) +
        ' ditolak.' +
        (note ? ' Alasan: ' + note : ''),
      type: 'disbursement_rejected',
      ref_id: target.id,
    });
  } else {
    var kepsekEmails = getRoleEmailListGas(ROLES.KEPSEK);
    createNotificationRecordGas({
      recipient_role: ROLES.KEPSEK,
      recipient_email: kepsekEmails.join(', '),
      title: 'Menunggu Otorisasi Pencairan: ' + target.teacher_name,
      message:
        'Bendahara telah menyetujui pengajuan pencairan ' +
        target.teacher_name +
        ' sebesar ' +
        formatRupiahGas(updated.approved_amount) +
        '. Menunggu otorisasi Kepala Sekolah.',
      type: 'disbursement_treasurer_approved',
      ref_id: target.id,
    });
    sendNotificationEmailGas(
      kepsekEmails,
      '[SIPAYROLL] Otorisasi Pencairan PTK — ' + target.teacher_name,
      'Yth. Kepala Sekolah,\n\nBendahara telah menyetujui pengajuan pencairan PTK ' +
        target.teacher_name +
        ' periode ' +
        target.month +
        '/' +
        target.year +
        ' sebesar ' +
        formatRupiahGas(updated.approved_amount) +
        '. Silakan buka SIPAYROLL untuk otorisasi final agar slip gaji terbit.'
    );
  }

  bumpSyncVersionGas(['disbursements', 'notifications']);
  return buildJsonResponse(200, { ok: true, data: updated });
}

function handleBulkTreasurerApproveDisbursements(payload) {
  var ids = Array.isArray(payload.ids)
    ? payload.ids.map(function (x) { return sanitizeString(x); }).filter(Boolean)
    : [];
  var note = sanitizeString(payload.note || '').slice(0, 240) || 'Disetujui kolektif oleh Bendahara.';
  var nowIso = new Date().toISOString();

  var allReqs = readSheetRecords(SHEETS.DISBURSEMENT_REQUESTS);
  var updatedList = [];

  for (var i = 0; i < allReqs.length; i++) {
    var row = allReqs[i];
    if (
      String(row.status) === 'pending_treasurer' &&
      (ids.length === 0 || ids.indexOf(String(row.id)) !== -1)
    ) {
      var updatedRow = Object.assign({}, row, {
        approved_amount: Number(row.requested_amount || 0),
        status: 'approved_treasurer',
        treasurer_note: note,
        treasurer_reviewed_at: nowIso,
      });
      allReqs[i] = updatedRow;
      updatedList.push(updatedRow);
    }
  }

  if (updatedList.length === 0) {
    return buildJsonResponse(400, { ok: false, error: 'Tidak ada pengajuan menunggu untuk disetujui kolektif.' });
  }

  replaceSheetRecords(SHEETS.DISBURSEMENT_REQUESTS, allReqs);

  var kepsekEmails = getRoleEmailListGas(ROLES.KEPSEK);
  createNotificationRecordGas({
    recipient_role: ROLES.KEPSEK,
    recipient_email: kepsekEmails.join(', '),
    title: updatedList.length + ' Pengajuan Pencairan PTK Siap Diotorisasi',
    message:
      'Bendahara menyetujui ' +
      updatedList.length +
      ' pengajuan pencairan PTK secara kolektif dan meneruskannya ke Kepala Sekolah.',
    type: 'disbursement_treasurer_approved',
    ref_id: updatedList[0].id,
  });

  bumpSyncVersionGas(['disbursements', 'notifications']);
  return buildJsonResponse(200, { ok: true, data: updatedList });
}

function handleKepsekReviewDisbursement(payload) {
  var reqId = sanitizeString(payload.id);
  if (!reqId) return notFoundResponse();

  var allReqs = readSheetRecords(SHEETS.DISBURSEMENT_REQUESTS);
  var target = allReqs.find(function (r) {
    return String(r.id) === reqId;
  });
  if (!target) return notFoundResponse();
  if (String(target.status) !== 'approved_treasurer') {
    return buildJsonResponse(409, {
      ok: false,
      error: 'Pengajuan harus disetujui Bendahara terlebih dahulu sebelum diotorisasi Kepala Sekolah.',
    });
  }

  var decision = payload.decision === 'reject' ? 'reject' : 'approve';
  var note = sanitizeString(payload.note || '').slice(0, 240);
  var nowIso = new Date().toISOString();

  var updated;
  if (decision === 'reject') {
    updated = updateSheetRecordById(SHEETS.DISBURSEMENT_REQUESTS, reqId, function (row) {
      return Object.assign({}, row, {
        status: 'rejected',
        kepsek_note: note || 'Ditolak oleh Kepala Sekolah.',
        kepsek_reviewed_at: nowIso,
      });
    });

    createNotificationRecordGas({
      recipient_role: ROLES.GURU,
      recipient_teacher_id: target.teacher_id,
      title: 'Pengajuan Pencairan Ditolak Kepsek',
      message:
        'Pengajuan pencairan periode ' +
        target.month +
        '/' +
        target.year +
        ' tidak disetujui Kepala Sekolah.' +
        (note ? ' Alasan: ' + note : ''),
      type: 'disbursement_rejected',
      ref_id: target.id,
    });
  } else {
    var slipId = Utilities.getUuid();
    var priorApproved = allReqs
      .filter(function (r) {
        return (
          String(r.id) !== String(target.id) &&
          String(r.teacher_id) === String(target.teacher_id) &&
          normalizePeriodKey(r.month) === normalizePeriodKey(target.month) &&
          Number(r.year) === Number(target.year) &&
          String(r.status) === 'approved'
        );
      })
      .reduce(function (s, r) {
        return s + Number(r.approved_amount || 0);
      }, 0);

    var approvedAmt = Number(target.approved_amount || target.requested_amount || 0);
    var estNet = Number(target.estimated_net_salary || approvedAmt);
    var remainingEst = Math.max(0, estNet - priorApproved - approvedAmt);

    var baseDetails = {};
    try {
      baseDetails = JSON.parse(target.issued_slip_json || '{}');
    } catch (e) {
      baseDetails = {};
    }

    var slipDetails = Object.assign({}, baseDetails, {
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
    });

    updated = updateSheetRecordById(SHEETS.DISBURSEMENT_REQUESTS, reqId, function (row) {
      return Object.assign({}, row, {
        status: 'approved',
        kepsek_note: note,
        kepsek_reviewed_at: nowIso,
        issued_slip_id: slipId,
        issued_slip_json: JSON.stringify(slipDetails),
        slip_issued_at: nowIso,
      });
    });

    createNotificationRecordGas({
      recipient_role: ROLES.GURU,
      recipient_teacher_id: target.teacher_id,
      title: 'Slip Gaji Pencairan Resmi Terbit!',
      message:
        'Pengajuan pencairan periode ' +
        target.month +
        '/' +
        target.year +
        ' sebesar ' +
        formatRupiahGas(approvedAmt) +
        ' telah disetujui Bendahara & Kepsek. Slip Gaji siap diunduh.',
      type: 'disbursement_issued',
      ref_id: target.id,
    });

    createNotificationRecordGas({
      recipient_role: ROLES.ADMIN,
      title: 'Slip Pencairan Terbit: ' + target.teacher_name,
      message:
        'Kepsek telah menyetujui pencairan ' +
        target.teacher_name +
        ' sebesar ' +
        formatRupiahGas(approvedAmt) +
        '. Slip Gaji Resmi otomatis diterbitkan.',
      type: 'disbursement_issued',
      ref_id: target.id,
    });

    var teachers = readSheetRecords(SHEETS.TEACHERS);
    var teacherRow = teachers.find(function (t) {
      return String(t.id) === String(target.teacher_id);
    });
    if (teacherRow) {
      var users = readSheetRecords(SHEETS.USERS_AUTH);
      var linkedUser = users.find(function (u) {
        return String(u.id) === String(teacherRow.user_id);
      });
      var teacherEmail = linkedUser ? sanitizeString(linkedUser.email || linkedUser.username || '').toLowerCase() : '';
      if (teacherEmail && teacherEmail.indexOf('@') !== -1) {
        sendNotificationEmailGas(
          [teacherEmail],
          '[SIPAYROLL] Slip Gaji Pencairan Resmi Telah Terbit (' + formatRupiahGas(approvedAmt) + ')',
          'Yth. ' +
            target.teacher_name +
            ',\n\nPengajuan pencairan gaji periode ' +
            target.month +
            '/' +
            target.year +
            ' sebesar ' +
            formatRupiahGas(approvedAmt) +
            ' telah disetujui oleh Bendahara dan Kepala Sekolah.\nSilakan masuk ke portal SIPAYROLL untuk melihat rincian dan mengunduh Slip Gaji Resmi PDF Anda.'
        );
      }
    }
  }

  bumpSyncVersionGas(['disbursements', 'notifications']);
  return buildJsonResponse(200, { ok: true, data: updated });
}

function getNotificationsDataGas(session) {
  var allNotifs = readSheetRecords(SHEETS.NOTIFICATIONS);
  var ownTeacher = session.role === ROLES.GURU ? resolveOwnedTeacherRecord(session) : null;

  var filtered = allNotifs
    .filter(function (n) {
      if (session.role === ROLES.GURU) {
        return (
          String(n.recipient_role) === ROLES.GURU &&
          ownTeacher &&
          String(n.recipient_teacher_id) === String(ownTeacher.id)
        );
      }
      return String(n.recipient_role) === String(session.role);
    })
    .map(function (n) {
      return Object.assign({}, n, {
        is_read: n.is_read === true || String(n.is_read).toLowerCase() === 'true',
      });
    })
    .sort(function (a, b) {
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });

  var unreadCount = filtered.filter(function (n) {
    return !n.is_read;
  }).length;

  return {
    items: filtered.slice(0, 40),
    unreadCount: unreadCount,
  };
}

function handleListNotifications(session) {
  return buildJsonResponse(200, {
    ok: true,
    data: getNotificationsDataGas(session),
  });
}

function handleMarkNotificationsRead(session, payload) {
  var ownTeacher = session.role === ROLES.GURU ? resolveOwnedTeacherRecord(session) : null;
  var allNotifs = readSheetRecords(SHEETS.NOTIFICATIONS);
  var targetId = sanitizeString(payload.id || '');
  var markAll = payload.mark_all === true || String(payload.mark_all).toLowerCase() === 'true';
  var changed = false;

  for (var i = 0; i < allNotifs.length; i++) {
    var n = allNotifs[i];
    var belongs =
      session.role === ROLES.GURU
        ? String(n.recipient_role) === ROLES.GURU &&
          ownTeacher &&
          String(n.recipient_teacher_id) === String(ownTeacher.id)
        : String(n.recipient_role) === String(session.role);
    if (!belongs) continue;
    var alreadyRead = n.is_read === true || String(n.is_read).toLowerCase() === 'true';
    if (!alreadyRead && (markAll || (targetId && String(n.id) === targetId))) {
      allNotifs[i] = Object.assign({}, n, { is_read: true });
      changed = true;
    }
  }

  if (changed) {
    replaceSheetRecords(SHEETS.NOTIFICATIONS, allNotifs);
    bumpSyncVersionGas(['notifications']);
  }

  return buildJsonResponse(200, { ok: true, data: { updated: true } });
}

/* ==========================================================================
 * 4C. REALTIME SYNC VERSION STAMPS & DRAFT RESYNC METADATA (v17)
 * ========================================================================== */

function createDefaultSyncMetaGas() {
  return {
    versions: {
      teachers: 1,
      attendances: 1,
      payrolls: 1,
      disbursements: 1,
      notifications: 1,
      school_profile: 1,
    },
    attendance_period_versions: {},
    draft_snapshots: {},
    updated_at: new Date().toISOString(),
  };
}

function normalizeSyncMetaGas(rawObj) {
  var def = createDefaultSyncMetaGas();
  if (!rawObj || typeof rawObj !== 'object') return def;
  var srcVersions = rawObj.versions && typeof rawObj.versions === 'object' ? rawObj.versions : {};
  Object.keys(def.versions).forEach(function (k) {
    def.versions[k] = Number(srcVersions[k] || 1);
  });
  def.attendance_period_versions =
    rawObj.attendance_period_versions && typeof rawObj.attendance_period_versions === 'object'
      ? Object.assign({}, rawObj.attendance_period_versions)
      : {};
  def.draft_snapshots =
    rawObj.draft_snapshots && typeof rawObj.draft_snapshots === 'object'
      ? Object.assign({}, rawObj.draft_snapshots)
      : {};
  def.updated_at = rawObj.updated_at || def.updated_at;
  return def;
}

function getSyncMetaGas(forceFreshProp) {
  if (!forceFreshProp && __REQ_SYNC_META__) {
    return __REQ_SYNC_META__;
  }
  var cache = CacheService.getScriptCache();
  if (!forceFreshProp) {
    try {
      var cachedRaw = cache.get(SYNC_META_CACHE_KEY);
      if (cachedRaw) {
        __REQ_SYNC_META__ = normalizeSyncMetaGas(JSON.parse(cachedRaw));
        return __REQ_SYNC_META__;
      }
    } catch (e) {}
  }

  var parsed = null;
  try {
    var propRaw = PropertiesService.getScriptProperties().getProperty(SYNC_META_PROP_KEY);
    if (propRaw) parsed = JSON.parse(propRaw);
  } catch (e) {}

  var meta = normalizeSyncMetaGas(parsed);
  __REQ_SYNC_META__ = meta;
  try {
    cache.put(SYNC_META_CACHE_KEY, JSON.stringify(meta), SYNC_META_CACHE_TTL);
  } catch (e) {}
  return meta;
}

function saveSyncMetaGas(meta) {
  var cleanMeta = normalizeSyncMetaGas(meta);
  cleanMeta.updated_at = new Date().toISOString();

  // Keep attendance_period_versions compact
  var periodKeys = Object.keys(cleanMeta.attendance_period_versions || {});
  if (periodKeys.length > 80) {
    periodKeys.sort();
    for (var i = 0; i < periodKeys.length - 80; i++) {
      delete cleanMeta.attendance_period_versions[periodKeys[i]];
    }
  }

  var raw = JSON.stringify(cleanMeta);
  PropertiesService.getScriptProperties().setProperty(SYNC_META_PROP_KEY, raw);
  __REQ_SYNC_META__ = cleanMeta;
  try {
    CacheService.getScriptCache().put(SYNC_META_CACHE_KEY, raw, SYNC_META_CACHE_TTL);
  } catch (e) {}
  return cleanMeta;
}

function getEffectivePeriodAttendanceVersionGas(meta, monthValue, yearValue) {
  var parsed = parsePeriodMonthKeyGas(monthValue);
  var yr = Number(yearValue);
  if (!yr || !meta || !meta.attendance_period_versions) return 0;

  var seenKeys = {};
  var keys = [];
  var pushKey = function (k) {
    if (!seenKeys[k]) {
      seenKeys[k] = true;
      keys.push(k);
    }
  };
  pushKey(yr + ':' + parsed.key);
  parsed.monthsInRange.forEach(function (m) {
    pushKey(yr + ':' + m);
  });

  var total = 0;
  keys.forEach(function (k) {
    total += Number(meta.attendance_period_versions[k] || 0);
  });
  return total;
}

function bumpSyncVersionGas(domains, periodList) {
  var meta = getSyncMetaGas(true);
  var domainArr = Array.isArray(domains) ? domains : [domains];
  domainArr.forEach(function (d) {
    if (d && meta.versions[d] !== undefined) {
      meta.versions[d] = Number(meta.versions[d] || 1) + 1;
    }
  });

  if (Array.isArray(periodList)) {
    periodList.forEach(function (item) {
      if (!item) return;
      var pk = normalizePeriodKey(item.month);
      var yr = Number(item.year);
      if (!pk || !yr) return;
      var pKey = yr + ':' + pk;
      meta.attendance_period_versions[pKey] = Number(meta.attendance_period_versions[pKey] || 0) + 1;
    });
  }

  return saveSyncMetaGas(meta).versions;
}

function recordDraftSnapshotGas(payrollId, monthKey, year) {
  if (!payrollId) return;
  var meta = getSyncMetaGas(true);
  meta.draft_snapshots[String(payrollId)] = {
    generated_at: new Date().toISOString(),
    teachers_ver: Number(meta.versions.teachers || 1),
    attendance_ver: getEffectivePeriodAttendanceVersionGas(meta, monthKey, year),
    period_key: Number(year) + ':' + normalizePeriodKey(monthKey),
  };
  saveSyncMetaGas(meta);
}

function clearDraftSnapshotGas(payrollId) {
  if (!payrollId) return;
  var meta = getSyncMetaGas(true);
  if (meta.draft_snapshots[String(payrollId)]) {
    delete meta.draft_snapshots[String(payrollId)];
    saveSyncMetaGas(meta);
  }
}

function enrichPayrollsWithSyncStatusGas(payrolls) {
  var meta = getSyncMetaGas(false);
  var curTeachersVer = Number(meta.versions.teachers || 1);
  return (payrolls || []).map(function (p) {
    if (String(p.status) !== PAYROLL_STATUS.DRAFT) {
      return Object.assign({}, p, {
        needs_resync: false,
        resync_reasons: [],
      });
    }
    var snap = (meta.draft_snapshots || {})[String(p.id)] || {
      teachers_ver: 1,
      attendance_ver: 0,
      generated_at: '',
    };
    var curAttVer = getEffectivePeriodAttendanceVersionGas(meta, p.month, p.year);
    var reasons = [];
    if (curTeachersVer > Number(snap.teachers_ver || 1)) {
      reasons.push('Perubahan Master PTK / Komponen Gaji');
    }
    if (curAttVer > Number(snap.attendance_ver || 0)) {
      reasons.push('Perubahan Kehadiran & JTM');
    }
    return Object.assign({}, p, {
      needs_resync: reasons.length > 0,
      resync_reasons: reasons,
      draft_generated_at: snap.generated_at || '',
    });
  });
}

function handleGetSyncVersions() {
  var meta = getSyncMetaGas(false);
  return buildJsonResponse(200, {
    ok: true,
    data: {
      versions: meta.versions,
      serverTime: new Date().toISOString(),
    },
  });
}

/* ==========================================================================
 * 4E. ARSIP TAHUNAN & PEMELIHARAAN DATA (v18 - NON-DESTRUCTIVE ARCHIVE)
 * ========================================================================== */

function parseTimestampMsGas(value) {
  if (!value) return NaN;
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.getTime();
  }
  return Date.parse(String(value));
}

function appendToArchiveSheetBatch(archiveSheetName, headers, recordObjs) {
  if (!recordObjs || recordObjs.length === 0) return [];
  const ss = getSpreadsheetInstance();
  let sheet = ss.getSheetByName(archiveSheetName);
  if (!sheet) {
    sheet = ss.insertSheet(archiveSheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  const rows = recordObjs.map(function (recordObj) {
    return headers.map(function (col) {
      return sanitizeForSpreadsheetCell(recordObj[col]);
    });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  return recordObjs;
}

function readCustomSheetRecordsIfExists(sheetName, expectedHeaders) {
  const ss = getSpreadsheetInstance();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const lastCol = Math.max(sheet.getLastColumn(), expectedHeaders.length);
  const rawHeaderRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const normalizedSheetHeaders = rawHeaderRow.map(function (h) {
    return String(h || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
  });

  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  return values.map(function (row) {
    const obj = {};
    expectedHeaders.forEach(function (colName, defaultIdx) {
      const matchIdx = normalizedSheetHeaders.indexOf(colName.toLowerCase());
      const actualIdx = matchIdx !== -1 ? matchIdx : defaultIdx;
      obj[colName] = row[actualIdx];
    });
    return obj;
  });
}

function listArchiveSheetsMetadataGas() {
  const ss = getSpreadsheetInstance();
  const sheets = ss.getSheets();
  const result = [];
  for (let i = 0; i < sheets.length; i++) {
    const name = sheets[i].getName();
    if (String(name).indexOf('Archive_') === 0) {
      result.push({
        sheetName: name,
        rowCount: Math.max(0, sheets[i].getLastRow() - 1),
      });
    }
  }
  return result;
}

function handleGetArchiveStatus() {
  const currentYear = new Date().getFullYear();
  const teachers = readSheetRecords(SHEETS.TEACHERS);
  const logs = readSheetRecords(SHEETS.ATTENDANCE_LOGS);
  const atts = readSheetRecords(SHEETS.ATTENDANCES);
  const payrolls = readSheetRecords(SHEETS.PAYROLLS);
  const details = readSheetRecords(SHEETS.PAYROLL_DETAILS);
  const disbursements = readSheetRecords(SHEETS.DISBURSEMENT_REQUESTS);
  const notifs = readSheetRecords(SHEETS.NOTIFICATIONS);

  const yearsMap = {};
  logs.forEach(function (l) {
    const y = Number(l.year);
    if (y) yearsMap[y] = true;
  });
  atts.forEach(function (a) {
    const y = Number(a.year);
    if (y) yearsMap[y] = true;
  });
  payrolls.forEach(function (p) {
    const y = Number(p.year);
    if (y) yearsMap[y] = true;
  });

  const payrollYearById = {};
  payrolls.forEach(function (p) {
    payrollYearById[String(p.id)] = Number(p.year);
  });

  const sortedYears = Object.keys(yearsMap)
    .map(function (k) {
      return Number(k);
    })
    .sort(function (a, b) {
      return a - b;
    });

  const yearlyBreakdown = sortedYears.map(function (yr) {
    const yearLogsCount = logs.filter(function (l) {
      return Number(l.year) === yr;
    }).length;
    const yearAttsCount = atts.filter(function (a) {
      return Number(a.year) === yr;
    }).length;
    const yearPayrolls = payrolls.filter(function (p) {
      return Number(p.year) === yr;
    });
    const paidPayrollsCount = yearPayrolls.filter(function (p) {
      return String(p.status) === PAYROLL_STATUS.PAID;
    }).length;
    const unpaidPayrollsCount = yearPayrolls.length - paidPayrollsCount;
    const yearDetailsCount = details.filter(function (d) {
      return payrollYearById[String(d.payroll_id)] === yr;
    }).length;
    const archivableRowsCount = yearLogsCount + yearAttsCount + yearDetailsCount;

    return {
      year: yr,
      attendanceLogsCount: yearLogsCount,
      attendancesCount: yearAttsCount,
      payrollsCount: yearPayrolls.length,
      paidPayrollsCount: paidPayrollsCount,
      unpaidPayrollsCount: unpaidPayrollsCount,
      payrollDetailsCount: yearDetailsCount,
      archivableRowsCount: archivableRowsCount,
      canArchiveSafely: yr < currentYear && unpaidPayrollsCount === 0 && archivableRowsCount > 0,
    };
  });

  const cutoffMs = Date.now() - 90 * 86400000;
  let unreadCount = 0;
  let prunableReadOldCount = 0;
  notifs.forEach(function (n) {
    const isRead = n.is_read === true || String(n.is_read).toLowerCase() === 'true';
    if (!isRead) {
      unreadCount += 1;
      return;
    }
    const ts = parseTimestampMsGas(n.created_at);
    if (!isNaN(ts) && ts < cutoffMs) {
      prunableReadOldCount += 1;
    }
  });

  return buildJsonResponse(200, {
    ok: true,
    data: {
      currentYear: currentYear,
      activeCounts: {
        teachers: teachers.length,
        attendance_logs: logs.length,
        attendances: atts.length,
        payrolls: payrolls.length,
        payroll_details: details.length,
        disbursements: disbursements.length,
        notifications: notifs.length,
      },
      yearlyBreakdown: yearlyBreakdown,
      archiveSheets: listArchiveSheetsMetadataGas(),
      notificationsStats: {
        totalCount: notifs.length,
        unreadCount: unreadCount,
        prunableReadOldCount: prunableReadOldCount,
      },
    },
  });
}

function handleArchiveYearData(payload) {
  const targetYear = Number(payload && payload.year);
  const currentYear = new Date().getFullYear();
  if (!targetYear || targetYear < 2020 || targetYear > 2100) {
    return buildJsonResponse(400, { ok: false, error: 'Tahun arsip tidak valid.' });
  }
  if (targetYear >= currentYear) {
    return buildJsonResponse(409, {
      ok: false,
      error: 'Tahun ' + targetYear + ' adalah tahun berjalan/mendatang dan belum boleh diarsipkan.',
    });
  }

  const payrolls = readSheetRecords(SHEETS.PAYROLLS);
  const yearPayrolls = payrolls.filter(function (p) {
    return Number(p.year) === targetYear;
  });
  const hasUnpaid = yearPayrolls.some(function (p) {
    return String(p.status) !== PAYROLL_STATUS.PAID;
  });
  if (hasUnpaid) {
    return buildJsonResponse(409, {
      ok: false,
      error: 'Masih ada periode payroll tahun ' + targetYear + ' yang belum berstatus PAID.',
    });
  }

  const paidPayrollIds = {};
  yearPayrolls.forEach(function (p) {
    paidPayrollIds[String(p.id)] = true;
  });

  const normalizeLogRowForWrite = function (row) {
    const cleanDate = normalizeDateStringGas(row.date);
    return Object.assign({}, row, {
      date: cleanDate ? "'" + cleanDate : '',
    });
  };

  const allLogs = readSheetRecords(SHEETS.ATTENDANCE_LOGS);
  const logsToArchive = [];
  const logsToKeep = [];
  allLogs.forEach(function (row) {
    const normalized = normalizeLogRowForWrite(row);
    if (Number(row.year) === targetYear) {
      logsToArchive.push(normalized);
    } else {
      logsToKeep.push(normalized);
    }
  });

  const allAtts = readSheetRecords(SHEETS.ATTENDANCES);
  const attsToArchive = [];
  const attsToKeep = [];
  allAtts.forEach(function (row) {
    if (Number(row.year) === targetYear) {
      attsToArchive.push(row);
    } else {
      attsToKeep.push(row);
    }
  });

  const allDetails = readSheetRecords(SHEETS.PAYROLL_DETAILS);
  const detailsToArchive = [];
  const detailsToKeep = [];
  allDetails.forEach(function (row) {
    if (paidPayrollIds[String(row.payroll_id)]) {
      detailsToArchive.push(row);
    } else {
      detailsToKeep.push(row);
    }
  });

  const archiveSheetsCreated = [];
  if (logsToArchive.length > 0) {
    const logArchiveName = 'Archive_Attendance_Logs_' + targetYear;
    appendToArchiveSheetBatch(logArchiveName, SCHEMA_HEADERS[SHEETS.ATTENDANCE_LOGS], logsToArchive);
    replaceSheetRecords(SHEETS.ATTENDANCE_LOGS, logsToKeep);
    archiveSheetsCreated.push(logArchiveName);
  }
  if (attsToArchive.length > 0) {
    const attArchiveName = 'Archive_Attendances_' + targetYear;
    appendToArchiveSheetBatch(attArchiveName, SCHEMA_HEADERS[SHEETS.ATTENDANCES], attsToArchive);
    replaceSheetRecords(SHEETS.ATTENDANCES, attsToKeep);
    archiveSheetsCreated.push(attArchiveName);
  }
  if (detailsToArchive.length > 0) {
    const detailArchiveName = 'Archive_Payroll_Details_' + targetYear;
    appendToArchiveSheetBatch(
      detailArchiveName,
      SCHEMA_HEADERS[SHEETS.PAYROLL_DETAILS],
      detailsToArchive
    );
    replaceSheetRecords(SHEETS.PAYROLL_DETAILS, detailsToKeep);
    archiveSheetsCreated.push(detailArchiveName);
  }

  if (archiveSheetsCreated.length > 0) {
    bumpSyncVersionGas(['attendances', 'payrolls']);
  }

  return buildJsonResponse(200, {
    ok: true,
    data: {
      archivedYear: targetYear,
      movedAttendanceLogs: logsToArchive.length,
      movedAttendances: attsToArchive.length,
      movedPayrollDetails: detailsToArchive.length,
      archiveSheetsCreated: archiveSheetsCreated,
    },
  });
}

function handlePruneNotifications(payload) {
  const rawDays = Number((payload && payload.olderThanDays) || 90);
  const days = Math.max(7, Math.min(365, isNaN(rawDays) ? 90 : rawDays));
  const cutoffMs = Date.now() - days * 86400000;

  const allNotifs = readSheetRecords(SHEETS.NOTIFICATIONS);
  const kept = [];
  allNotifs.forEach(function (n) {
    const normalizedRow =
      n.created_at instanceof Date && !isNaN(n.created_at.getTime())
        ? Object.assign({}, n, { created_at: n.created_at.toISOString() })
        : n;
    const isRead = n.is_read === true || String(n.is_read).toLowerCase() === 'true';
    if (!isRead) {
      kept.push(normalizedRow);
      return;
    }
    const ts = parseTimestampMsGas(n.created_at);
    if (isNaN(ts) || ts >= cutoffMs) {
      kept.push(normalizedRow);
    }
  });

  const removedCount = allNotifs.length - kept.length;
  if (removedCount > 0) {
    replaceSheetRecords(SHEETS.NOTIFICATIONS, kept);
    bumpSyncVersionGas(['notifications']);
  }

  return buildJsonResponse(200, {
    ok: true,
    data: {
      removedCount: removedCount,
      remainingCount: kept.length,
      olderThanDays: days,
    },
  });
}

/* ==========================================================================
 * 5. GOOGLE SHEETS DATA ACCESS LAYER (TOLERANT HEADER MAPPING + CACHE + BATCH)
 * ========================================================================== */

const CACHEABLE_SHEETS = Object.freeze([
  SHEETS.USERS_AUTH,
  SHEETS.TEACHERS,
  SHEETS.SALARY_COMPONENTS,
  SHEETS.PAYROLLS,
]);

function invalidateSheetCache(sheetName) {
  delete __REQ_SHEET_CACHE__[sheetName];
  if (CACHEABLE_SHEETS.indexOf(sheetName) !== -1) {
    try {
      CacheService.getScriptCache().remove(SHEET_CACHE_PREFIX + sheetName);
    } catch (e) {}
  }
}

function getSpreadsheetInstance() {
  if (__REQ_SS__) return __REQ_SS__;
  if (OPTIONAL_SPREADSHEET_ID && OPTIONAL_SPREADSHEET_ID.trim() !== '') {
    __REQ_SS__ = SpreadsheetApp.openById(OPTIONAL_SPREADSHEET_ID.trim());
    return __REQ_SS__;
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error(
      'Spreadsheet tidak ditemukan. Pastikan skrip dibuat melalui Extensions > Apps Script di dalam Google Sheets, atau isi OPTIONAL_SPREADSHEET_ID.'
    );
  }
  __REQ_SS__ = active;
  return __REQ_SS__;
}

function getOrCreateSheet(sheetName) {
  if (__REQ_SHEET_OBJ__[sheetName]) return __REQ_SHEET_OBJ__[sheetName];
  const ss = getSpreadsheetInstance();
  let sheet = ss.getSheetByName(sheetName);
  const headers = SCHEMA_HEADERS[sheetName];

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  } else if (sheet.getLastRow() === 0 && headers && headers.length > 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else if (headers && headers.length > 0 && sheet.getLastColumn() < headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  __REQ_SHEET_OBJ__[sheetName] = sheet;
  return sheet;
}

function readSheetRecords(sheetName) {
  if (__REQ_SHEET_CACHE__[sheetName]) {
    return __REQ_SHEET_CACHE__[sheetName].slice();
  }

  const isCacheable = CACHEABLE_SHEETS.indexOf(sheetName) !== -1;
  if (isCacheable) {
    try {
      const cachedJson = CacheService.getScriptCache().get(SHEET_CACHE_PREFIX + sheetName);
      if (cachedJson) {
        const parsed = JSON.parse(cachedJson);
        if (Array.isArray(parsed)) {
          __REQ_SHEET_CACHE__[sheetName] = parsed;
          return parsed.slice();
        }
      }
    } catch (e) {}
  }

  const sheet = getOrCreateSheet(sheetName);
  const lastRow = sheet.getLastRow();
  const expectedHeaders = SCHEMA_HEADERS[sheetName];
  if (lastRow <= 1) {
    __REQ_SHEET_CACHE__[sheetName] = [];
    return [];
  }

  const lastCol = Math.max(sheet.getLastColumn(), expectedHeaders.length);
  const rawHeaderRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const normalizedSheetHeaders = rawHeaderRow.map(function (h) {
    return String(h || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
  });

  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const records = values.map(function (row) {
    const obj = {};
    expectedHeaders.forEach(function (colName, defaultIdx) {
      let matchIdx = normalizedSheetHeaders.indexOf(colName.toLowerCase());
      // Pada Users_Auth, dukung header kolom bernama `email` maupun `username`
      if (matchIdx === -1 && sheetName === SHEETS.USERS_AUTH && colName === 'username') {
        matchIdx = normalizedSheetHeaders.indexOf('email');
      }
      const actualIdx = matchIdx !== -1 ? matchIdx : defaultIdx;
      obj[colName] = row[actualIdx];
    });
    if (sheetName === SHEETS.USERS_AUTH) {
      const emailIdx = normalizedSheetHeaders.indexOf('email');
      if (emailIdx !== -1 && row[emailIdx]) {
        obj.email = row[emailIdx];
        if (!obj.username) obj.username = row[emailIdx];
      } else {
        obj.email = obj.username;
      }
    }
    return obj;
  });

  __REQ_SHEET_CACHE__[sheetName] = records;
  if (isCacheable) {
    try {
      const serialized = JSON.stringify(records);
      if (serialized.length < 90000) {
        CacheService.getScriptCache().put(SHEET_CACHE_PREFIX + sheetName, serialized, SHEET_CACHE_TTL_SEC);
      }
    } catch (e) {}
  }

  return records.slice();
}

function appendSheetRecord(sheetName, recordObj) {
  const sheet = getOrCreateSheet(sheetName);
  const headers = SCHEMA_HEADERS[sheetName];
  const rowValues = headers.map(function (col) {
    return sanitizeForSpreadsheetCell(recordObj[col]);
  });
  sheet.appendRow(rowValues);
  invalidateSheetCache(sheetName);
  return recordObj;
}

function appendSheetRecordsBatch(sheetName, recordObjs) {
  if (!recordObjs || recordObjs.length === 0) return [];
  const sheet = getOrCreateSheet(sheetName);
  const headers = SCHEMA_HEADERS[sheetName];
  const rows = recordObjs.map(function (recordObj) {
    return headers.map(function (col) {
      return sanitizeForSpreadsheetCell(recordObj[col]);
    });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  invalidateSheetCache(sheetName);
  return recordObjs;
}

function replaceSheetRecords(sheetName, allRecordObjs) {
  const sheet = getOrCreateSheet(sheetName);
  const headers = SCHEMA_HEADERS[sheetName];
  const oldLastRow = sheet.getLastRow();
  const list = Array.isArray(allRecordObjs) ? allRecordObjs : [];

  if (list.length > 0) {
    const rows = list.map(function (recordObj) {
      return headers.map(function (col) {
        return sanitizeForSpreadsheetCell(recordObj[col]);
      });
    });
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  const newLastRow = list.length + 1;
  if (oldLastRow > newLastRow) {
    if (newLastRow === 1) {
      sheet
        .getRange(2, 1, oldLastRow - 1, Math.max(sheet.getLastColumn(), headers.length))
        .clearContent();
    } else {
      try {
        sheet.deleteRows(newLastRow + 1, oldLastRow - newLastRow);
      } catch (e) {
        sheet
          .getRange(newLastRow + 1, 1, oldLastRow - newLastRow, Math.max(sheet.getLastColumn(), headers.length))
          .clearContent();
      }
    }
  }
  invalidateSheetCache(sheetName);
}

function updateSheetRecordById(sheetName, targetUuid, updaterFn) {
  const sheet = getOrCreateSheet(sheetName);
  const lastRow = sheet.getLastRow();
  const headers = SCHEMA_HEADERS[sheetName];
  if (lastRow <= 1) return null;

  const range = sheet.getRange(2, 1, lastRow - 1, headers.length);
  const values = range.getValues();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === String(targetUuid).trim()) {
      const currentObj = {};
      headers.forEach(function (col, idx) {
        currentObj[col] = values[i][idx];
      });
      const updatedObj = updaterFn(currentObj);
      const newRow = headers.map(function (col) {
        return sanitizeForSpreadsheetCell(updatedObj[col]);
      });
      sheet.getRange(i + 2, 1, 1, headers.length).setValues([newRow]);
      invalidateSheetCache(sheetName);
      return updatedObj;
    }
  }
  return null;
}

function deleteSheetRecordById(sheetName, targetUuid) {
  const sheet = getOrCreateSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]).trim() === String(targetUuid).trim()) {
      sheet.deleteRow(i + 2);
      invalidateSheetCache(sheetName);
      return true;
    }
  }
  return false;
}

function deleteSheetRecordsByColumn(sheetName, columnName, matchValue) {
  const sheet = getOrCreateSheet(sheetName);
  const lastRow = sheet.getLastRow();
  const headers = SCHEMA_HEADERS[sheetName];
  const colIdx = headers.indexOf(columnName);
  if (lastRow <= 1 || colIdx === -1) return 0;

  const data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  let deletedCount = 0;
  for (let i = data.length - 1; i >= 0; i--) {
    if (String(data[i][colIdx]).trim() === String(matchValue).trim()) {
      sheet.deleteRow(i + 2);
      deletedCount++;
    }
  }
  if (deletedCount > 0) {
    invalidateSheetCache(sheetName);
  }
  return deletedCount;
}

/* ==========================================================================
 * 6. INPUT VALIDATION, ANTI-XSS & FORMULA INJECTION SANITIZATION
 * ========================================================================== */

function sanitizeString(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

function sanitizeNonNegativeNumber(value, fallback) {
  const num = Number(value);
  if (Number.isNaN(num) || !Number.isFinite(num) || num < 0) {
    return fallback !== undefined ? fallback : 0;
  }
  return Math.round(num);
}

function sanitizeDecimalNonNegative(value, fallback) {
  const num = Number(value);
  if (Number.isNaN(num) || !Number.isFinite(num) || num < 0) {
    return fallback !== undefined ? fallback : 0;
  }
  return Math.round(num * 10) / 10;
}

function sanitizeForSpreadsheetCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const str = String(value);
  if (/^[=+\-@]/.test(str)) {
    return "'" + str;
  }
  return str;
}

/* ==========================================================================
 * 7. HTTP RESPONSE HELPERS & DIAGNOSTIC SETUP TOOLS
 * ========================================================================== */

function forbiddenResponse() {
  return buildJsonResponse(403, {
    ok: false,
    error: '403 Forbidden: Anda tidak memiliki otorisasi untuk mengakses resource ini.',
  });
}

function notFoundResponse() {
  return buildJsonResponse(404, {
    ok: false,
    error: '404 Not Found: Resource tidak ditemukan.',
  });
}

function buildJsonResponse(statusCode, payload) {
  const responseBody = Object.assign({ status: statusCode, version: DEPLOY_VERSION }, payload);
  return ContentService.createTextOutput(JSON.stringify(responseBody)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Jalankan fungsi `setupDatabaseSchema()` ini 1x dari dropdown atas Editor GAS
 * untuk memicu dialog izin (Review Permissions -> Allow) sekaligus membuat 6 Sheet.
 */
function setupDatabaseSchema() {
  Object.values(SHEETS).forEach(function (sheetName) {
    getOrCreateSheet(sheetName);
  });
  // Pastikan ScriptProperties, CacheService, MailApp (notifikasi email), dan UrlFetchApp (Google OAuth) ter-otorisasi
  getHmacSecret();
  CacheService.getScriptCache().put('healthcheck', 'ok', 60);
  var mailQuota = MailApp.getRemainingDailyQuota();
  UrlFetchApp.fetch('https://www.googleapis.com/oauth2/v3/certs', { muteHttpExceptions: true });
  Logger.log(
    'Sukses! Seluruh Sheet & izin Google OAuth / Notifikasi Email (sisa kuota MailApp: ' +
      mailQuota +
      ') berhasil diinisialisasi (' +
      DEPLOY_VERSION +
      ').'
  );
  return 'Database schema & Google OAuth whitelist permissions initialized (' + DEPLOY_VERSION + ').';
}



