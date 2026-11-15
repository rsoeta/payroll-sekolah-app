/**
 * ============================================================================
 * SCHOOL / FOUNDATION PAYROLL BACKEND - GOOGLE APPS SCRIPT (GAS)
 * Deploy Identity : v5_FlexiblePeriod
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

const DEPLOY_VERSION = 'v5_FlexiblePeriod';
const SESSION_TTL_SECONDS = 3600 * 8; // 8 Hours session lifetime
const LOCK_TIMEOUT_MS = 15000;        // 15 Seconds max wait for LockService

/**
 * Optional: Jika skrip GAS dibuat secara terpisah (Standalone) dan bukan dari menu
 * Extensions > Apps Script di dalam Google Sheets, isi SPREADSHEET_ID di bawah ini.
 * Jika dibuat langsung dari dalam Google Sheets, biarkan kosong ('').
 */
const OPTIONAL_SPREADSHEET_ID = '';

const SHEETS = Object.freeze({
  USERS_AUTH: 'Users_Auth',
  TEACHERS: 'Teachers',
  SALARY_COMPONENTS: 'Salary_Components',
  ATTENDANCES: 'Attendances',
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
 * - Without `payload` param: returns service health & deploy version (`v5_FlexiblePeriod`).
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

  // Public Endpoint: Login & School Profile Identity
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
 * 3. AUTHENTICATION, CRYPTOGRAPHY & SESSION MANAGEMENT (v5_FlexiblePeriod)
 * ========================================================================== */

/**
 * Authenticates user against `Users_Auth` sheet.
 * Supports both `salt$sha256hex` and direct 64-char SHA-256 hex (uppercase or lowercase).
 */
function handleLogin(payload) {
  const username = sanitizeString(payload.username || '').toLowerCase();
  const rawPassword = String(payload.password || '');

  if (!username || !rawPassword || username.length > 64 || rawPassword.length > 128) {
    return buildJsonResponse(401, { ok: false, error: 'Username atau password wajib diisi.' });
  }

  const users = readSheetRecords(SHEETS.USERS_AUTH);
  if (users.length === 0) {
    return buildJsonResponse(401, {
      ok: false,
      error: 'Sheet Users_Auth masih kosong. Tambahkan minimal 1 baris akun terlebih dahulu.',
    });
  }

  const userRecord = users.find(function (u) {
    return String(u.username || '').trim().toLowerCase() === username;
  });

  if (!userRecord) {
    return buildJsonResponse(401, { ok: false, error: 'Username tidak ditemukan di sheet Users_Auth.' });
  }

  const storedHashClean = String(userRecord.password_hash || '').trim();
  if (!verifyPasswordHash(rawPassword, storedHashClean)) {
    return buildJsonResponse(401, {
      ok: false,
      error: 'Password tidak cocok dengan password_hash di sheet Users_Auth.',
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

  const sessionData = {
    userId: userId,
    username: String(userRecord.username).trim(),
    role: role,
    teacherId: teacherProfile ? String(teacherProfile.id) : null,
    teacherName: teacherProfile ? String(teacherProfile.name) : String(userRecord.username).trim(),
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
        role: sessionData.role,
        teacherId: sessionData.teacherId,
        name: sessionData.teacherName,
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
    var parsed = raw ? JSON.parse(raw) : null;
    return buildJsonResponse(200, { ok: true, data: parsed });
  } catch (e) {
    return buildJsonResponse(200, { ok: true, data: null });
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
    return Object.assign({}, t, { salary_component: comp });
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
  const username = sanitizeString(payload.username || '').toLowerCase();
  const initialPassword = String(payload.password || '');

  if (!nip || !name || !bankAccount) {
    return buildJsonResponse(400, { ok: false, error: 'NIP, Nama, dan Nomor Rekening wajib diisi.' });
  }

  let userId = sanitizeString(payload.user_id) || '';

  if (!userId && username && initialPassword) {
    if (initialPassword.length < 6) {
      return buildJsonResponse(400, { ok: false, error: 'Password minimal 6 karakter.' });
    }
    const existingUsers = readSheetRecords(SHEETS.USERS_AUTH);
    const duplicateUser = existingUsers.some(function (u) {
      return String(u.username || '').trim().toLowerCase() === username;
    });
    if (duplicateUser) {
      return buildJsonResponse(409, { ok: false, error: 'Username sudah digunakan.' });
    }
    userId = Utilities.getUuid();
    appendSheetRecord(SHEETS.USERS_AUTH, {
      id: userId,
      username: username,
      password_hash: createSaltedPasswordHash(initialPassword),
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
    data: Object.assign({}, newTeacher, { salary_component: compRecord }),
  });
}

function handleUpdateTeacher(payload) {
  const teacherId = sanitizeString(payload.id);
  if (!teacherId) return notFoundResponse();

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

  return buildJsonResponse(200, { ok: true, data: updated });
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
    const cleanUsername = sanitizeString(item.username || '').toLowerCase();
    const rawPass = String(item.password || '').trim();

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
      if (cleanUsername && rawPass && rawPass.length >= 6) {
        const dupUser = existingUsers.some(function (u) {
          return String(u.username || '').trim().toLowerCase() === cleanUsername;
        });
        if (!dupUser) {
          appendSheetRecord(SHEETS.USERS_AUTH, {
            id: userId,
            username: cleanUsername,
            password_hash: createSaltedPasswordHash(rawPass),
            role: ROLES.GURU,
          });
          existingUsers.push({ id: userId, username: cleanUsername, role: ROLES.GURU });
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

function handleListAttendances(session, payload) {
  const monthKey = payload.month ? normalizePeriodKey(payload.month) : '';
  const year = payload.year ? Number(payload.year) : null;
  let records = readSheetRecords(SHEETS.ATTENDANCES);

  if (monthKey && year) {
    records = records.filter(function (r) {
      return normalizePeriodKey(r.month) === monthKey && Number(r.year) === year;
    });
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

function handleUpsertAttendance(payload) {
  const teacherId = sanitizeString(payload.teacher_id);
  const monthKey = normalizePeriodKey(payload.month);
  const storedMonth = /^\d+$/.test(monthKey) ? Number(monthKey) : monthKey;
  const year = Number(payload.year);
  const presentDays = sanitizeNonNegativeNumber(payload.present_days, 0);
  const absentDays = sanitizeNonNegativeNumber(payload.absent_days, 0);
  const totalJtm = sanitizeNonNegativeNumber(payload.total_jtm, 0);

  if (!teacherId || !monthKey || !year || year < 2020 || year > 2100) {
    return buildJsonResponse(400, { ok: false, error: 'Parameter kehadiran (guru, periode bulan, tahun) tidak valid.' });
  }

  const attendances = readSheetRecords(SHEETS.ATTENDANCES);
  const existing = attendances.find(function (a) {
    return (
      String(a.teacher_id) === teacherId &&
      normalizePeriodKey(a.month) === monthKey &&
      Number(a.year) === year
    );
  });

  if (existing) {
    const updated = updateSheetRecordById(SHEETS.ATTENDANCES, existing.id, function (row) {
      return {
        id: row.id,
        teacher_id: teacherId,
        month: storedMonth,
        year: year,
        present_days: presentDays,
        absent_days: absentDays,
        total_jtm: totalJtm,
      };
    });
    return buildJsonResponse(200, { ok: true, data: updated });
  }

  const created = {
    id: Utilities.getUuid(),
    teacher_id: teacherId,
    month: storedMonth,
    year: year,
    present_days: presentDays,
    absent_days: absentDays,
    total_jtm: totalJtm,
  };
  appendSheetRecord(SHEETS.ATTENDANCES, created);
  return buildJsonResponse(201, { ok: true, data: created });
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
  const attendances = readSheetRecords(SHEETS.ATTENDANCES).filter(function (a) {
    return normalizePeriodKey(a.month) === monthKey && Number(a.year) === year;
  });
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
    const att =
      attendances.find(function (a) {
        return String(a.teacher_id) === String(teacher.id);
      }) || {
        present_days: 0,
        absent_days: 0,
        total_jtm: 0,
      };

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
      const matchIdx = normalizedSheetHeaders.indexOf(colName.toLowerCase());
      const actualIdx = matchIdx !== -1 ? matchIdx : defaultIdx;
      obj[colName] = row[actualIdx];
    });
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
  // Pastikan ScriptProperties & CacheService juga ter-otorisasi
  getHmacSecret();
  CacheService.getScriptCache().put('healthcheck', 'ok', 60);
  Logger.log('Sukses! 6 Sheet dan izin akses berhasil diinisialisasi (' + DEPLOY_VERSION + ').');
  return 'Database schema initialized (' + DEPLOY_VERSION + ').';
}


