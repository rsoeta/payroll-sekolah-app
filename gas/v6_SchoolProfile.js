/**
 * ============================================================================
 * SCHOOL / FOUNDATION PAYROLL BACKEND - GOOGLE APPS SCRIPT (GAS)
 * Deploy Identity : v6_SchoolProfile
 * Changelog (v2)  :
 *   1. Fixed SHA-256 hash comparison when pasted from external generators
 *      (handles uppercase/lowercase hex, whitespace/newline trimming, and salt$hash).
 *   2. Case-insensitive & whitespace-tolerant header reading on `Users_Auth` and all sheets.
 *   3. Auto-heals missing UUIDv4 `id` in `Users_Auth` if admin manually typed row in Sheet.
 *   4. Supports both POST body and GET query payload fallback (`?payload=...`) for
 *      environments with strict corporate/browser redirect stripping.
 *   5. Added `testAuthSetup()` diagnostic helper for one-click verification inside GAS Editor.
 * ============================================================================
 */

const DEPLOY_VERSION = 'v6_SchoolProfile';
const SESSION_TTL_SECONDS = 3600 * 8; // 8 Hours session lifetime
const LOCK_TIMEOUT_MS = 15000;        // 15 Seconds max wait for LockService

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
});

const SCHEMA_HEADERS = Object.freeze({
  [SHEETS.USERS_AUTH]: ['id', 'username', 'password_hash', 'role'],
  [SHEETS.TEACHERS]: ['id', 'user_id', 'nip', 'name', 'status', 'bank_account'],
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
  ],
  [SHEETS.PAYROLLS]: ['id', 'month', 'year', 'total_budget', 'status'],
  [SHEETS.PAYROLL_DETAILS]: ['id', 'payroll_id', 'teacher_id', 'net_salary', 'details_json'],
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
  const httpMethod = sanitizeString(requestBody.method || 'POST').toUpperCase();
  const action = sanitizeString(requestBody.action || '');
  const token = sanitizeString(requestBody.token || '');
  const payload = requestBody.payload && typeof requestBody.payload === 'object' ? requestBody.payload : {};

  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(httpMethod)) {
    return buildJsonResponse(405, { ok: false, error: 'Method Not Allowed.' });
  }

  // Public Endpoint: Request Gmail OTP, Login & School Profile Identity
  if (action === 'auth.requestOtp' && httpMethod === 'POST') {
    return handleRequestGmailOtp(payload);
  }
  if ((action === 'auth.login' || action === 'auth.verifyOtp') && httpMethod === 'POST') {
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

      case 'attendanceLogs.list':
        if (method !== 'GET') return forbiddenResponse();
        return handleListAttendanceLogs(session, payload);

      case 'attendanceLogs.upsertMyLog':
        if (!['POST', 'PUT'].includes(method) || ![ROLES.GURU, ROLES.ADMIN].includes(session.role)) {
          return forbiddenResponse();
        }
        return handleUpsertMyAttendanceLog(session, payload);

      case 'attendanceLogs.deleteMyLog':
        if (method !== 'DELETE' || ![ROLES.GURU, ROLES.ADMIN].includes(session.role)) {
          return forbiddenResponse();
        }
        return handleDeleteMyAttendanceLog(session, payload);

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

      case 'schoolProfile.update':
        if (!['POST', 'PUT'].includes(method) || session.role !== ROLES.ADMIN) return forbiddenResponse();
        return handleUpdateSchoolProfile(payload);

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
 * 3. AUTHENTICATION, CRYPTOGRAPHY & SESSION MANAGEMENT (v6_SchoolProfile)
 * ========================================================================== */

const OTP_TTL_SECONDS = 300; // 5 minutes validity for Gmail verification OTP

function findUserRecordByEmail(email) {
  const users = readSheetRecords(SHEETS.USERS_AUTH);
  const localPrefix = email.split('@')[0];
  return (
    users.find(function (u) {
      const storedEmail = String(u.email || u.username || '').trim().toLowerCase();
      if (!storedEmail) return false;
      if (storedEmail === email) return true;
      if (storedEmail.indexOf('@') === -1 && storedEmail === localPrefix) return true;
      return false;
    }) || null
  );
}

/**
 * Step 1 (Zero-Config Gmail Auth): Sends a 6-digit OTP verification code via `MailApp.sendEmail`
 * strictly to email addresses registered in `Users_Auth`. No Google Cloud Client ID required!
 */
function handleRequestGmailOtp(payload) {
  const email = sanitizeString(payload.email || payload.username || '').toLowerCase();
  if (!email || email.indexOf('@') === -1 || email.length > 120) {
    return buildJsonResponse(400, {
      ok: false,
      error: 'Masukkan alamat Akun Google (Gmail) yang valid.',
    });
  }

  const users = readSheetRecords(SHEETS.USERS_AUTH);
  if (users.length === 0) {
    return buildJsonResponse(403, {
      ok: false,
      error: 'Sheet Users_Auth masih kosong. Daftarkan alamat Gmail Admin terlebih dahulu.',
    });
  }

  const userRecord = findUserRecordByEmail(email);
  if (!userRecord) {
    return buildJsonResponse(403, {
      ok: false,
      error: 'Akses Ditolak: Alamat Gmail "' + email + '" belum terdaftar pada sheet Users_Auth.',
    });
  }

  // Generate cryptographically random 6-digit OTP code using GAS UUID bytes
  const randBytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + ':' + Date.now()
  );
  const rawNum = Math.abs(
    ((randBytes[0] & 0xff) << 24) |
      ((randBytes[1] & 0xff) << 16) |
      ((randBytes[2] & 0xff) << 8) |
      (randBytes[3] & 0xff)
  );
  const otpCode = String(100000 + (rawNum % 900000));
  const salt = Utilities.getUuid().replace(/-/g, '').substring(0, 12);
  const otpHash = computeSha256Hex(salt + ':' + otpCode);

  const cacheKey = 'sipayroll_otp_' + computeSha256Hex(email);
  CacheService.getScriptCache().put(
    cacheKey,
    JSON.stringify({
      salt: salt,
      hash: otpHash,
      attempts: 0,
      exp: Math.floor(Date.now() / 1000) + OTP_TTL_SECONDS,
    }),
    OTP_TTL_SECONDS
  );

  var schoolName = 'SIPAYROLL — Sistem Penggajian Sekolah & Yayasan';
  try {
    var rawProf = PropertiesService.getScriptProperties().getProperty('SIPAYROLL_SCHOOL_PROFILE');
    if (rawProf) {
      var parsedProf = JSON.parse(rawProf);
      if (parsedProf.school_name) schoolName = parsedProf.school_name;
    }
  } catch (e) {}

  try {
    MailApp.sendEmail({
      to: email,
      subject: '[' + otpCode + '] Kode Verifikasi Masuk — ' + schoolName,
      body:
        'Halo,\n\n' +
        'Gunakan kode verifikasi berikut untuk masuk ke portal ' +
        schoolName +
        ':\n\n' +
        otpCode +
        '\n\nKode ini berlaku selama 5 menit dan bersifat rahasia. Abaikan email ini jika Anda tidak merasa melakukan permintaan masuk.',
      htmlBody:
        '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:12px;">' +
        '<h2 style="margin:0 0 8px;color:#0f172a;font-size:18px;">Kode Verifikasi Masuk Portal</h2>' +
        '<p style="margin:0 0 16px;color:#475569;font-size:13px;">' +
        schoolName +
        '</p>' +
        '<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:16px;text-align:center;margin-bottom:16px;">' +
        '<span style="font-size:28px;font-weight:700;letter-spacing:6px;color:#3730a3;">' +
        otpCode +
        '</span></div>' +
        '<p style="margin:0;color:#64748b;font-size:12px;">Kode berlaku selama <strong>5 menit</strong>. Jangan bagikan kode ini kepada siapa pun.</p>' +
        '</div>',
    });
  } catch (mailErr) {
    return buildJsonResponse(500, {
      ok: false,
      error:
        'Gagal mengirim kode verifikasi ke Gmail (' +
        (mailErr && mailErr.message ? mailErr.message : 'Izin MailApp belum aktif') +
        '). Jalankan fungsi setupDatabaseSchema() 1x di Editor GAS lalu Deploy New Version.',
    });
  }

  return buildJsonResponse(200, {
    ok: true,
    data: {
      email: email,
      expiresInSeconds: OTP_TTL_SECONDS,
      message: 'Kode verifikasi 6 digit telah dikirim ke kotak masuk Gmail ' + email + '.',
    },
  });
}

/**
 * Verifies authentication via:
 * 1. Gmail 6-digit OTP verified from CacheService (Zero-Config, works without Google Cloud Client ID)
 * 2. Official Google OAuth2 `id_token` / `access_token` verified via Google endpoints (optional)
 */
function verifyGoogleIdentityOnServer(payload) {
  var emailInput = sanitizeString(payload.email || payload.username || '').toLowerCase();
  var otpInput = String(payload.otp || '').trim();
  var idToken = String(payload.id_token || '').trim();
  var accessToken = String(payload.access_token || '').trim();

  // Path 1: Verify 6-digit Gmail OTP sent via MailApp
  if (emailInput && otpInput) {
    var cache = CacheService.getScriptCache();
    var cacheKey = 'sipayroll_otp_' + computeSha256Hex(emailInput);
    var rawCached = cache.get(cacheKey);
    if (!rawCached) {
      return {
        ok: false,
        error: 'Kode verifikasi tidak ditemukan atau sudah kedaluwarsa. Minta kode baru.',
      };
    }

    var record = JSON.parse(rawCached);
    if (record.exp < Math.floor(Date.now() / 1000)) {
      cache.remove(cacheKey);
      return { ok: false, error: 'Kode verifikasi telah kedaluwarsa. Silakan kirim ulang kode.' };
    }

    if (Number(record.attempts || 0) >= 5) {
      cache.remove(cacheKey);
      return { ok: false, error: 'Terlalu banyak percobaan salah. Silakan minta kode verifikasi baru.' };
    }

    var computedOtpHash = computeSha256Hex(record.salt + ':' + otpInput);
    if (!constantTimeEqual(computedOtpHash, record.hash)) {
      record.attempts = Number(record.attempts || 0) + 1;
      cache.put(cacheKey, JSON.stringify(record), OTP_TTL_SECONDS);
      return { ok: false, error: 'Kode verifikasi 6 digit tidak sesuai. Periksa kembali Gmail Anda.' };
    }

    // Consume OTP on successful verification (single use)
    cache.remove(cacheKey);
    return { ok: true, email: emailInput, name: '', picture: '' };
  }

  // Path 2: Official Google Identity Services ID Token (cryptographically verified via Google)
  if (idToken) {
    var tokenInfoUrl = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
    var res = UrlFetchApp.fetch(tokenInfoUrl, { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      var info = JSON.parse(res.getContentText());
      var validIss = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
      if (String(info.email_verified) === 'true' && validIss && info.email) {
        if (
          GOOGLE_OAUTH_CLIENT_ID &&
          GOOGLE_OAUTH_CLIENT_ID.trim() !== '' &&
          String(info.aud || '').trim() !== GOOGLE_OAUTH_CLIENT_ID.trim()
        ) {
          return { ok: false, error: 'Google OAuth Client ID tidak cocok.' };
        }
        return {
          ok: true,
          email: String(info.email).trim().toLowerCase(),
          name: String(info.name || ''),
          picture: String(info.picture || ''),
        };
      }
    }
  }

  // Path 3: Official Google OAuth2 Access Token
  if (accessToken) {
    var userInfoUrl = 'https://www.googleapis.com/oauth2/v3/userinfo';
    var uRes = UrlFetchApp.fetch(userInfoUrl, {
      headers: { Authorization: 'Bearer ' + accessToken },
      muteHttpExceptions: true,
    });
    if (uRes.getResponseCode() === 200) {
      var uInfo = JSON.parse(uRes.getContentText());
      if (String(uInfo.email_verified) === 'true' && uInfo.email) {
        return {
          ok: true,
          email: String(uInfo.email).trim().toLowerCase(),
          name: String(uInfo.name || ''),
          picture: String(uInfo.picture || ''),
        };
      }
    }
  }

  return {
    ok: false,
    error: 'Harap verifikasi kepemilikan Akun Google Anda menggunakan kode OTP yang dikirim ke Gmail.',
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
      error: 'Sheet Users_Auth masih kosong. Daftarkan alamat Gmail Admin terlebih dahulu di sheet Users_Auth.',
    });
  }

  const userRecord = findUserRecordByEmail(verifiedEmail);

  if (!userRecord) {
    return buildJsonResponse(403, {
      ok: false,
      error:
        'Akses Ditolak: Akun Google "' +
        verifiedEmail +
        '" telah terverifikasi, namun belum terdaftar di sheet Users_Auth.',
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
      role: session.role,
      teacherId: session.teacherId,
      name: session.teacherName,
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

function handleGetSchoolProfile() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('SIPAYROLL_SCHOOL_PROFILE');
    var parsed = raw ? JSON.parse(raw) : {};
    if (!parsed.google_client_id && GOOGLE_OAUTH_CLIENT_ID) {
      parsed.google_client_id = GOOGLE_OAUTH_CLIENT_ID;
    }
    return buildJsonResponse(200, { ok: true, data: parsed });
  } catch (e) {
    return buildJsonResponse(200, {
      ok: true,
      data: GOOGLE_OAUTH_CLIENT_ID ? { google_client_id: GOOGLE_OAUTH_CLIENT_ID } : null,
    });
  }
}

function handleUpdateSchoolProfile(payload) {
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
    google_client_id: sanitizeString(payload.google_client_id || GOOGLE_OAUTH_CLIENT_ID || ''),
  };
  PropertiesService.getScriptProperties().setProperty(
    'SIPAYROLL_SCHOOL_PROFILE',
    JSON.stringify(profileObj)
  );
  return buildJsonResponse(200, { ok: true, data: profileObj });
}

function handleDashboardSummary(session) {
  const teachers = readSheetRecords(SHEETS.TEACHERS);
  const payrolls = readSheetRecords(SHEETS.PAYROLLS);
  const details = readSheetRecords(SHEETS.PAYROLL_DETAILS);

  if (session.role === ROLES.GURU) {
    const ownTeacher = resolveOwnedTeacherRecord(session);
    if (!ownTeacher) {
      return buildJsonResponse(200, {
        ok: true,
        data: {
          role: ROLES.GURU,
          teacher: { name: session.teacherName, nip: '-', status: 'Guru', bank_account: '-' },
          totalSlips: 0,
          latestNetSalary: 0,
        },
      });
    }

    const approvedPayrollIds = new Set(
      payrolls
        .filter(function (p) {
          return p.status === PAYROLL_STATUS.APPROVED || p.status === PAYROLL_STATUS.PAID;
        })
        .map(function (p) {
          return String(p.id);
        })
    );

    const mySlips = details.filter(function (d) {
      return String(d.teacher_id) === String(ownTeacher.id) && approvedPayrollIds.has(String(d.payroll_id));
    });

    return buildJsonResponse(200, {
      ok: true,
      data: {
        role: ROLES.GURU,
        teacher: ownTeacher,
        totalSlips: mySlips.length,
        latestNetSalary: mySlips.length > 0 ? Number(mySlips[mySlips.length - 1].net_salary || 0) : 0,
      },
    });
  }

  return buildJsonResponse(200, {
    ok: true,
    data: {
      role: session.role,
      totalTeachers: teachers.length,
      pendingApprovals: payrolls.filter(function (p) {
        return p.status === PAYROLL_STATUS.SUBMITTED;
      }).length,
      paidPayrolls: payrolls.filter(function (p) {
        return p.status === PAYROLL_STATUS.PAID;
      }).length,
      totalPayrolls: payrolls.length,
    },
  });
}

function handleListTeachers(session) {
  const teachers = readSheetRecords(SHEETS.TEACHERS);
  const components = readSheetRecords(SHEETS.SALARY_COMPONENTS);
  const users = readSheetRecords(SHEETS.USERS_AUTH);

  if (session.role === ROLES.GURU) {
    const own = teachers.filter(function (t) {
      return String(t.user_id) === String(session.userId);
    });
    return buildJsonResponse(200, { ok: true, data: own });
  }

  const enriched = teachers.map(function (t) {
    const comp =
      components.find(function (c) {
        return String(c.teacher_id) === String(t.id);
      }) || null;
    const linkedUser =
      users.find(function (u) {
        return String(u.id) === String(t.user_id);
      }) || null;
    const email = linkedUser ? String(linkedUser.username || '').trim().toLowerCase() : '';
    return Object.assign({}, t, { email: email, salary_component: comp });
  });

  return buildJsonResponse(200, { ok: true, data: enriched });
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
  const status = sanitizeString(payload.status || 'GTY');
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
  };
  appendSheetRecord(SHEETS.TEACHERS, newTeacher);

  const customJson =
    typeof payload.custom_components_json === 'string'
      ? payload.custom_components_json
      : Array.isArray(payload.custom_components)
      ? JSON.stringify(payload.custom_components)
      : '[]';

  const compRecord = {
    id: Utilities.getUuid(),
    teacher_id: teacherId,
    base_salary: sanitizeNonNegativeNumber(payload.base_salary, 0),
    hourly_rate: sanitizeNonNegativeNumber(payload.hourly_rate, 0),
    position_allowance: sanitizeNonNegativeNumber(payload.position_allowance, 0),
    bpjs_deduction: sanitizeNonNegativeNumber(payload.bpjs_deduction, 0),
    custom_components_json: customJson,
  };
  appendSheetRecord(SHEETS.SALARY_COMPONENTS, compRecord);

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
    return {
      id: existing.id,
      user_id: existing.user_id,
      nip: payload.nip !== undefined ? sanitizeString(payload.nip) : existing.nip,
      name: payload.name !== undefined ? sanitizeString(payload.name) : existing.name,
      status: payload.status !== undefined ? sanitizeString(payload.status) : existing.status,
      bank_account: payload.bank_account !== undefined ? sanitizeString(payload.bank_account) : existing.bank_account,
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
    payload.bpjs_deduction !== undefined ||
    payload.custom_components_json !== undefined ||
    payload.custom_components !== undefined
  ) {
    handleUpsertSalaryComponent({
      teacher_id: teacherId,
      base_salary: payload.base_salary,
      hourly_rate: payload.hourly_rate,
      position_allowance: payload.position_allowance,
      bpjs_deduction: payload.bpjs_deduction,
      custom_components_json: payload.custom_components_json,
      custom_components: payload.custom_components,
    });
  }

  return buildJsonResponse(200, { ok: true, data: Object.assign({}, updated, { email: nextEmail || '' }) });
}

function handleDeleteTeacher(payload) {
  const teacherId = sanitizeString(payload.id);
  if (!teacherId) return notFoundResponse();

  const deleted = deleteSheetRecordById(SHEETS.TEACHERS, teacherId);
  if (!deleted) return notFoundResponse();
  deleteSheetRecordsByColumn(SHEETS.SALARY_COMPONENTS, 'teacher_id', teacherId);

  return buildJsonResponse(200, { ok: true, message: 'Data guru berhasil dihapus.' });
}

function handleBulkImportTeachers(payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) {
    return buildJsonResponse(400, { ok: false, error: 'Daftar data import kosong.' });
  }

  const existingTeachers = readSheetRecords(SHEETS.TEACHERS);
  const existingUsers = readSheetRecords(SHEETS.USERS_AUTH);
  let createdCount = 0;
  let updatedCount = 0;

  items.forEach(function (item) {
    const cleanNip = sanitizeString(item.nip);
    const cleanName = sanitizeString(item.name);
    const cleanStatus = sanitizeString(item.status || 'GTY (Guru Tetap Yayasan)');
    const cleanBank = sanitizeString(item.bank_account);
    const cleanEmail = sanitizeString(item.email || item.username || '').toLowerCase();

    if (!cleanNip || !cleanName || !cleanBank) return;

    const matchTeacher = existingTeachers.find(function (t) {
      return String(t.nip || '').trim().toLowerCase() === cleanNip.toLowerCase();
    });

    if (matchTeacher) {
      updateSheetRecordById(SHEETS.TEACHERS, matchTeacher.id, function (row) {
        return {
          id: row.id,
          user_id: row.user_id,
          nip: cleanNip,
          name: cleanName,
          status: cleanStatus || row.status,
          bank_account: cleanBank,
        };
      });
      if (cleanEmail && matchTeacher.user_id) {
        const hasLinked = existingUsers.some(function (u) {
          return String(u.id) === String(matchTeacher.user_id);
        });
        if (hasLinked) {
          updateSheetRecordById(SHEETS.USERS_AUTH, matchTeacher.user_id, function (uRow) {
            return {
              id: uRow.id,
              username: cleanEmail,
              password_hash: uRow.password_hash || 'GMAIL_AUTH',
              role: uRow.role || ROLES.GURU,
            };
          });
        } else {
          appendSheetRecord(SHEETS.USERS_AUTH, {
            id: matchTeacher.user_id,
            username: cleanEmail,
            password_hash: 'GMAIL_AUTH',
            role: ROLES.GURU,
          });
          existingUsers.push({ id: matchTeacher.user_id, username: cleanEmail, role: ROLES.GURU });
        }
      }
      handleUpsertSalaryComponent({
        teacher_id: String(matchTeacher.id),
        base_salary: item.base_salary,
        hourly_rate: item.hourly_rate,
        position_allowance: item.position_allowance,
        bpjs_deduction: item.bpjs_deduction,
      });
      updatedCount++;
    } else {
      let userId = Utilities.getUuid();
      if (cleanEmail) {
        const dupUser = existingUsers.some(function (u) {
          return String(u.username || '').trim().toLowerCase() === cleanEmail;
        });
        if (!dupUser) {
          appendSheetRecord(SHEETS.USERS_AUTH, {
            id: userId,
            username: cleanEmail,
            password_hash: 'GMAIL_AUTH',
            role: ROLES.GURU,
          });
          existingUsers.push({ id: userId, username: cleanEmail, role: ROLES.GURU });
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
      };
      appendSheetRecord(SHEETS.TEACHERS, newTeacher);
      existingTeachers.push(newTeacher);

      appendSheetRecord(SHEETS.SALARY_COMPONENTS, {
        id: Utilities.getUuid(),
        teacher_id: teacherId,
        base_salary: sanitizeNonNegativeNumber(item.base_salary, 0),
        hourly_rate: sanitizeNonNegativeNumber(item.hourly_rate, 0),
        position_allowance: sanitizeNonNegativeNumber(item.position_allowance, 0),
        bpjs_deduction: sanitizeNonNegativeNumber(item.bpjs_deduction, 0),
      });
      createdCount++;
    }
  });

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

function handleUpsertSalaryComponent(payload) {
  const teacherId = sanitizeString(payload.teacher_id);
  if (!teacherId) {
    return buildJsonResponse(400, { ok: false, error: 'teacher_id tidak valid.' });
  }

  const baseSalary = sanitizeNonNegativeNumber(payload.base_salary, 0);
  const hourlyRate = sanitizeNonNegativeNumber(payload.hourly_rate, 0);
  const positionAllowance = sanitizeNonNegativeNumber(payload.position_allowance, 0);
  const bpjsDeduction = sanitizeNonNegativeNumber(payload.bpjs_deduction, 0);
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

  if (existing) {
    const updated = updateSheetRecordById(SHEETS.SALARY_COMPONENTS, existing.id, function (row) {
      return {
        id: row.id,
        teacher_id: teacherId,
        base_salary: baseSalary,
        hourly_rate: hourlyRate,
        position_allowance: positionAllowance,
        bpjs_deduction: bpjsDeduction,
        custom_components_json:
          customJson !== undefined ? customJson : row.custom_components_json || '[]',
      };
    });
    return buildJsonResponse(200, { ok: true, data: updated });
  }

  const created = {
    id: Utilities.getUuid(),
    teacher_id: teacherId,
    base_salary: baseSalary,
    hourly_rate: hourlyRate,
    position_allowance: positionAllowance,
    bpjs_deduction: bpjsDeduction,
    custom_components_json: customJson !== undefined ? customJson : '[]',
  };
  appendSheetRecord(SHEETS.SALARY_COMPONENTS, created);
  return buildJsonResponse(201, { ok: true, data: created });
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

function handleListAttendances(session, payload) {
  const monthKey = payload.month ? normalizePeriodKey(payload.month) : '';
  const year = payload.year ? Number(payload.year) : null;
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
    if (!ownTeacher) return forbiddenResponse();
    records = records.filter(function (r) {
      return String(r.teacher_id) === String(ownTeacher.id);
    });
  }

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
  return buildJsonResponse(200, { ok: true, data: saved });
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

function syncMonthlyAttendanceFromLogs(teacherId, monthNum, yearNum) {
  var logs = readSheetRecords(SHEETS.ATTENDANCE_LOGS).filter(function (l) {
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

  var presentDays = sanitizeDecimalNonNegative(hadirCount * 1 + tugasCount * 0.5, 0);
  var absentDays = sakitCount + izinCount;

  return upsertAttendanceSummaryRecord(teacherId, Number(monthNum), Number(yearNum), presentDays, absentDays, totalJtm);
}

function handleListAttendanceLogs(session, payload) {
  var records = readSheetRecords(SHEETS.ATTENDANCE_LOGS);
  var monthKey = payload.month ? normalizePeriodKey(payload.month) : '';
  var year = payload.year ? Number(payload.year) : null;
  var filterTeacherId = sanitizeString(payload.teacher_id);

  if (session.role === ROLES.GURU) {
    var ownTeacher = resolveOwnedTeacherRecord(session);
    if (!ownTeacher) return forbiddenResponse();
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

  var jtmHours =
    status === 'sakit' || status === 'izin' ? 0 : sanitizeDecimalNonNegative(payload.jtm_hours, 0);
  var note = sanitizeString(payload.note || '').slice(0, 250);
  var nowIso = new Date().toISOString();

  var existingLogs = readSheetRecords(SHEETS.ATTENDANCE_LOGS);
  var existing = existingLogs.find(function (l) {
    return String(l.teacher_id) === targetTeacherId && String(l.date).trim() === rawDate;
  });

  var savedLog;
  if (existing) {
    savedLog = updateSheetRecordById(SHEETS.ATTENDANCE_LOGS, existing.id, function (row) {
      return {
        id: row.id,
        teacher_id: targetTeacherId,
        date: rawDate,
        month: monthNum,
        year: yearNum,
        status: status,
        jtm_hours: jtmHours,
        note: note,
        created_at: row.created_at || nowIso,
        updated_at: nowIso,
      };
    });
  } else {
    savedLog = {
      id: Utilities.getUuid(),
      teacher_id: targetTeacherId,
      date: rawDate,
      month: monthNum,
      year: yearNum,
      status: status,
      jtm_hours: jtmHours,
      note: note,
      created_at: nowIso,
      updated_at: nowIso,
    };
    appendSheetRecord(SHEETS.ATTENDANCE_LOGS, savedLog);
  }

  var summary = syncMonthlyAttendanceFromLogs(targetTeacherId, monthNum, yearNum);
  return buildJsonResponse(existing ? 200 : 201, {
    ok: true,
    data: {
      log: savedLog,
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
  var summary = syncMonthlyAttendanceFromLogs(target.teacher_id, target.month, target.year);

  return buildJsonResponse(200, {
    ok: true,
    data: {
      deletedId: logId,
      attendanceSummary: summary,
    },
  });
}

function handleListPayrolls(session) {
  if (session.role === ROLES.GURU) {
    return forbiddenResponse();
  }
  const payrolls = readSheetRecords(SHEETS.PAYROLLS);
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
    const bpjsDeduction = Number(comp.bpjs_deduction || 0);

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

    const grossSalary = baseSalary + jtmHonor + positionAllowance + customAllowanceTotal;
    const netSalary = Math.max(0, grossSalary - bpjsDeduction - customDeductionTotal);
    totalBudget += netSalary;

    const detailBreakdown = {
      teacher_name: teacher.name,
      nip: teacher.nip,
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
      bpjs_deduction: bpjsDeduction,
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
    deleteSheetRecordsByColumn(SHEETS.PAYROLL_DETAILS, 'payroll_id', payrollId);
  } else {
    appendSheetRecord(SHEETS.PAYROLLS, {
      id: payrollId,
      month: month,
      year: year,
      total_budget: totalBudget,
      status: PAYROLL_STATUS.DRAFT,
    });
  }

  generatedDetails.forEach(function (detailRow) {
    appendSheetRecord(SHEETS.PAYROLL_DETAILS, detailRow);
  });

  return buildJsonResponse(200, {
    ok: true,
    data: {
      id: payrollId,
      month: month,
      year: year,
      total_budget: totalBudget,
      status: PAYROLL_STATUS.DRAFT,
      details_count: generatedDetails.length,
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

  return buildJsonResponse(200, { ok: true, data: updated });
}

function handleGetPayrollDetailsByPayrollId(session, payload) {
  if (session.role !== ROLES.ADMIN && session.role !== ROLES.KEPSEK) {
    return forbiddenResponse();
  }
  const payrollId = sanitizeString(payload.payroll_id);
  if (!payrollId) return notFoundResponse();

  const details = readSheetRecords(SHEETS.PAYROLL_DETAILS).filter(function (d) {
    return String(d.payroll_id) === payrollId;
  });

  return buildJsonResponse(200, { ok: true, data: details });
}

function handleGetMyPayslips(session) {
  const payrolls = readSheetRecords(SHEETS.PAYROLLS);
  const details = readSheetRecords(SHEETS.PAYROLL_DETAILS);
  const teachers = readSheetRecords(SHEETS.TEACHERS);

  if (session.role === ROLES.GURU) {
    const ownTeacher = resolveOwnedTeacherRecord(session);
    if (!ownTeacher) {
      return buildJsonResponse(200, { ok: true, data: [] });
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
        if (parentPayroll.status !== PAYROLL_STATUS.APPROVED && parentPayroll.status !== PAYROLL_STATUS.PAID) {
          return null;
        }
        return Object.assign({}, d, {
          month: parentPayroll.month,
          year: parentPayroll.year,
          payroll_status: parentPayroll.status,
          teacher_name: ownTeacher.name,
          nip: ownTeacher.nip,
          bank_account: ownTeacher.bank_account,
        });
      })
      .filter(Boolean);

    return buildJsonResponse(200, { ok: true, data: mySlips });
  }

  const allSlips = details.map(function (d) {
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

  return buildJsonResponse(200, { ok: true, data: allSlips });
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

/* ==========================================================================
 * 5. GOOGLE SHEETS DATA ACCESS LAYER (TOLERANT HEADER MAPPING)
 * ========================================================================== */

function getSpreadsheetInstance() {
  if (OPTIONAL_SPREADSHEET_ID && OPTIONAL_SPREADSHEET_ID.trim() !== '') {
    return SpreadsheetApp.openById(OPTIONAL_SPREADSHEET_ID.trim());
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error(
      'Spreadsheet tidak ditemukan. Pastikan skrip dibuat melalui Extensions > Apps Script di dalam Google Sheets, atau isi OPTIONAL_SPREADSHEET_ID.'
    );
  }
  return active;
}

function getOrCreateSheet(sheetName) {
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
  return sheet;
}

function readSheetRecords(sheetName) {
  const sheet = getOrCreateSheet(sheetName);
  const lastRow = sheet.getLastRow();
  const expectedHeaders = SCHEMA_HEADERS[sheetName];
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
}

function appendSheetRecord(sheetName, recordObj) {
  const sheet = getOrCreateSheet(sheetName);
  const headers = SCHEMA_HEADERS[sheetName];
  const rowValues = headers.map(function (col) {
    return sanitizeForSpreadsheetCell(recordObj[col]);
  });
  sheet.appendRow(rowValues);
  return recordObj;
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
  // Pastikan ScriptProperties, CacheService, MailApp (OTP Gmail), dan UrlFetchApp ter-otorisasi
  getHmacSecret();
  CacheService.getScriptCache().put('healthcheck', 'ok', 60);
  var mailQuota = MailApp.getRemainingDailyQuota();
  UrlFetchApp.fetch('https://www.googleapis.com/oauth2/v3/certs', { muteHttpExceptions: true });
  Logger.log(
    'Sukses! 6 Sheet dan izin OTP Gmail (sisa kuota harian: ' +
      mailQuota +
      ') berhasil diinisialisasi (' +
      DEPLOY_VERSION +
      ').'
  );
  return 'Database schema & Gmail OTP permissions initialized (' + DEPLOY_VERSION + ').';
}



