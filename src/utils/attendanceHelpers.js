/**
 * Shared helpers for Teacher Self-Attendance & JTM condition weights:
 * - hadir : normal (1.0 present day, full JTM)
 * - tugas : half-day (0.5 present day, optional JTM)
 * - sakit : counts as absent (0 present day, 1 absent day, 0 JTM)
 * - izin  : counts as absent (0 present day, 1 absent day, 0 JTM)
 */

export const DEFAULT_TEACHING_CLASSES = [
  'Kelas VII A',
  'Kelas VII B',
  'Kelas VIII A',
  'Kelas VIII B',
  'Kelas IX A',
  'Kelas IX B',
];

export const ATTENDANCE_CONDITIONS = [
  {
    id: 'hadir',
    label: 'Hadir',
    badgeText: 'Normal (1 Hadir)',
    presentWeight: 1,
    absentWeight: 0,
    allowsJtm: true,
    defaultJtm: 4,
    description: 'Masuk mengajar normal (nilai 1 hari hadir + JTM penuh).',
    tone: 'good',
  },
  {
    id: 'tugas',
    label: 'Tugas',
    badgeText: 'Setengah Hadir (0,5)',
    presentWeight: 0.5,
    absentWeight: 0,
    allowsJtm: true,
    defaultJtm: 0,
    description: 'Tugas dinas/luar (bernilai 0,5 hari hadir; JTM opsional).',
    tone: 'warn',
  },
  {
    id: 'sakit',
    label: 'Sakit',
    badgeText: 'Tidak Hadir (0)',
    presentWeight: 0,
    absentWeight: 1,
    allowsJtm: false,
    defaultJtm: 0,
    description: 'Tidak bernilai hadir maupun JTM (sama dengan tidak hadir).',
    tone: 'bad',
  },
  {
    id: 'izin',
    label: 'Izin',
    badgeText: 'Tidak Hadir (0)',
    presentWeight: 0,
    absentWeight: 1,
    allowsJtm: false,
    defaultJtm: 0,
    description: 'Tidak bernilai hadir maupun JTM (sama dengan tidak hadir).',
    tone: 'neutral',
  },
];

export const ATTENDANCE_CONDITION_MAP = Object.fromEntries(
  ATTENDANCE_CONDITIONS.map((item) => [item.id, item])
);

export function normalizeAttendanceStatus(status) {
  const clean = String(status || '')
    .trim()
    .toLowerCase();
  if (ATTENDANCE_CONDITION_MAP[clean]) return clean;
  return 'hadir';
}

export function getAttendanceConditionMeta(status) {
  return ATTENDANCE_CONDITION_MAP[normalizeAttendanceStatus(status)];
}

export function roundAttendanceMetric(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 10) / 10;
}

export function formatAttendanceNumber(value) {
  const rounded = roundAttendanceMetric(value);
  return String(rounded).replace('.', ',');
}

export function computeAttendanceBreakdownFromLogs(logs = []) {
  let hadirCount = 0;
  let tugasCount = 0;
  let sakitCount = 0;
  let izinCount = 0;
  let totalJtm = 0;

  for (const log of logs) {
    const status = normalizeAttendanceStatus(log.status);
    const meta = getAttendanceConditionMeta(status);
    if (status === 'hadir') hadirCount += 1;
    else if (status === 'tugas') tugasCount += 1;
    else if (status === 'sakit') sakitCount += 1;
    else if (status === 'izin') izinCount += 1;

    if (meta.allowsJtm) {
      totalJtm += Math.max(0, Number(log.jtm_hours || 0));
    }
  }

  return {
    present_days: roundAttendanceMetric(hadirCount * 1 + tugasCount * 0.5),
    absent_days: sakitCount + izinCount,
    total_jtm: roundAttendanceMetric(totalJtm),
    hadir_count: hadirCount,
    tugas_count: tugasCount,
    sakit_count: sakitCount,
    izin_count: izinCount,
    log_count: logs.length,
  };
}

export function computeClassBreakdownFromLogs(logs = []) {
  const byClass = new Map();
  for (const log of logs) {
    const className = String(log.class_name || 'Kelas Umum').trim() || 'Kelas Umum';
    if (!byClass.has(className)) {
      byClass.set(className, []);
    }
    byClass.get(className).push(log);
  }

  return Array.from(byClass.entries())
    .map(([className, classLogs]) => ({
      class_name: className,
      ...computeAttendanceBreakdownFromLogs(classLogs),
    }))
    .sort((a, b) => a.class_name.localeCompare(b.class_name, 'id'));
}

export function getTodayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Normalizes any date string / Date / ISO timestamp (including GAS serialized Date)
 * into a strict `YYYY-MM-DD` string suitable for `<input type="date">`.
 */
export function normalizeIsoDateOnly(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const raw = String(value).trim().replace(/^'/, '');
  const exactMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (exactMatch) return raw;

  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return raw.slice(0, 10);
  }

  const parsedFallback = new Date(raw);
  if (!Number.isNaN(parsedFallback.getTime())) {
    const y = parsedFallback.getFullYear();
    const m = String(parsedFallback.getMonth() + 1).padStart(2, '0');
    const d = String(parsedFallback.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return raw;
}

export function formatDateIndo(dateStr) {
  const iso = normalizeIsoDateOnly(dateStr);
  if (!iso) return '-';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(dateObj.getTime())) return iso;
  return dateObj.toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
