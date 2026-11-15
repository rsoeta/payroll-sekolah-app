const DEPLOY_VERSION = 'v1_GasBackend_Init';
const SESSION_TTL_SECONDS = 3600 * 8; // 8 Jam masa aktif token
const LOCK_TIMEOUT_MS = 15000;        // 15 Detik batas tunggu LockService

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
    [SHEETS.SALARY_COMPONENTS]: ['id', 'teacher_id', 'base_salary', 'hourly_rate', 'position_allowance', 'bpjs_deduction'],
    [SHEETS.ATTENDANCES]: ['id', 'teacher_id', 'month', 'year', 'present_days', 'absent_days', 'total_jtm'],
    [SHEETS.PAYROLLS]: ['id', 'month', 'year', 'total_budget', 'status'],
    [SHEETS.PAYROLL_DETAILS]: ['id', 'payroll_id', 'teacher_id', 'net_salary', 'details_json'],
});

const ROLES = Object.freeze({
    ADMIN: 'admin',
    KEPSEK: 'kepsek',
    GURU: 'guru',
});

/**
 * 1. Entry Point doPost: Menerima REST-over-POST JSON `{ method, action, token, payload }`
 */
function doPost(e) {
    try {
        if (!e || !e.postData || !e.postData.contents) {
            return buildJsonResponse(400, { ok: false, error: 'Bad Request: Empty payload.' });
        }

        const requestBody = JSON.parse(e.postData.contents);
        const httpMethod = sanitizeString(requestBody.method || 'POST').toUpperCase();
        const action = sanitizeString(requestBody.action || '');
        const token = sanitizeString(requestBody.token || '');
        const payload = requestBody.payload && typeof requestBody.payload === 'object' ? requestBody.payload : {};

        // Endpoint Publik: Login dari sheet Users_Auth
        if (action === 'auth.login' && httpMethod === 'POST') {
            return handleLogin(payload);
        }

        // Verifikasi Token Sesi Berbasis Waktu (HMAC-SHA256)
        const session = verifySessionToken(token);
        if (!session) {
            return buildJsonResponse(401, { ok: false, error: 'Unauthorized: Invalid or expired session token.' });
        }

        return routeAuthenticatedRequest(httpMethod, action, payload, session);
    } catch (err) {
        console.error(`[${DEPLOY_VERSION}] Unhandled exception:`, err);
        return buildJsonResponse(500, { ok: false, error: 'Internal Server Error.', version: DEPLOY_VERSION });
    }
}

/**
 * 2. Concurrency Protection dengan LockService pada seluruh operasi Write/Update/Delete
 */
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

/**
 * 3. Autentikasi dari Sheet `Users_Auth` (Zero Hardcoded Password)
 */
function handleLogin(payload) {
    const username = sanitizeString(payload.username || '').toLowerCase();
    const rawPassword = String(payload.password || '');

    const users = readSheetRecords(SHEETS.USERS_AUTH);
    const userRecord = users.find(function (u) {
        return String(u.username || '').trim().toLowerCase() === username;
    });

    if (!userRecord || !verifyPasswordHash(rawPassword, String(userRecord.password_hash || ''))) {
        return buildJsonResponse(401, { ok: false, error: 'Username atau password tidak valid.' });
    }

    const role = String(userRecord.role || '').toLowerCase();
    let teacherProfile = null;
    if (role === ROLES.GURU) {
        const teachers = readSheetRecords(SHEETS.TEACHERS);
        teacherProfile = teachers.find(function (t) {
            return String(t.user_id) === String(userRecord.id);
        }) || null;
    }

    const sessionData = {
        userId: String(userRecord.id),
        username: String(userRecord.username),
        role: role,
        teacherId: teacherProfile ? String(teacherProfile.id) : null,
        teacherName: teacherProfile ? String(teacherProfile.name) : String(userRecord.username),
        exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    };

    return buildJsonResponse(200, {
        ok: true,
        data: {
            token: issueSessionToken(sessionData),
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

/**
 * 4. Object-Level RBAC: Memastikan Guru HANYA dapat mengakses baris miliknya sendiri
 *    (`Teachers.user_id === session.userId` & `Payroll_Details.teacher_id === ownTeacher.id`)
 */
function handleGetMyPayslips(session) {
    const payrolls = readSheetRecords(SHEETS.PAYROLLS);
    const details = readSheetRecords(SHEETS.PAYROLL_DETAILS);

    if (session.role === ROLES.GURU) {
        const ownTeacher = resolveOwnedTeacherRecord(session);
        if (!ownTeacher) return forbiddenResponse(); // 403 Forbidden generik

        const mySlips = details
            .filter(function (d) {
                return String(d.teacher_id) === String(ownTeacher.id);
            })
            .map(function (d) {
                const parentPayroll = payrolls.find(function (p) { return String(p.id) === String(d.payroll_id); });
                if (!parentPayroll || (parentPayroll.status !== 'approved' && parentPayroll.status !== 'paid')) {
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
    return forbiddenResponse();
}