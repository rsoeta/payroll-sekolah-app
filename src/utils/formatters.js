/**
 * Formatting, Custom Component Helpers & Anti-XSS Sanitization Utilities
 */

export const MONTHS_ID = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
];

/**
 * Formats a number with explicit dot ('.') thousands separators (e.g. 3500000 -> "3.500.000").
 * Guaranteed to work identically across all browsers, OS locales, and PDF generators.
 */
export function formatRibuan(value) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return '0';
  const isNegative = numeric < 0;
  const rounded = Math.round(Math.abs(numeric));
  const withDots = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return isNegative ? `-${withDots}` : withDots;
}

/**
 * Parses a dot-formatted thousands string ("3.500.000") back into a clean non-negative integer (3500000).
 */
export function parseRibuan(input) {
  if (input === null || input === undefined) return 0;
  const digitsOnly = String(input).replace(/\D/g, '');
  if (!digitsOnly) return 0;
  const parsed = Number(digitsOnly);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Formats an amount in Rupiah using explicit dot thousands separators (e.g. "Rp 3.500.000").
 */
export function formatRupiah(amount) {
  return `Rp ${formatRibuan(amount)}`;
}

/**
 * Normalizes a month/period value:
 * - Single month: 11, "11", "11-11" -> "11"
 * - Month range : "1-3", "7-12"     -> "1-3", "7-12"
 */
export function normalizePeriodKey(monthValue) {
  if (monthValue === null || monthValue === undefined) return '';
  const raw = String(monthValue).trim();
  const rangeMatch = raw.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (start === end) return String(start);
    return `${start}-${end}`;
  }
  const num = Number(raw);
  if (Number.isFinite(num) && num >= 1 && num <= 12) {
    return String(num);
  }
  return raw;
}

/**
 * Builds a normalized period key from `startMonth` (Bulan A) and `endMonth` (Bulan B).
 */
export function buildPeriodMonthKey(startMonth, endMonth) {
  const s = Math.min(12, Math.max(1, Number(startMonth) || 1));
  const e = Math.min(12, Math.max(1, Number(endMonth ?? startMonth) || s));
  return s === e ? String(s) : `${s}-${e}`;
}

/**
 * Parses a period key (e.g. "11" or "1-3") into structured metadata.
 */
export function parsePeriodMonthKey(monthValue) {
  const norm = normalizePeriodKey(monthValue);
  const rangeMatch = norm.match(/^(\d{1,2})-(\d{1,2})$/);
  if (rangeMatch) {
    const startMonth = Number(rangeMatch[1]);
    const endMonth = Number(rangeMatch[2]);
    const monthCount =
      endMonth >= startMonth ? endMonth - startMonth + 1 : 12 - startMonth + 1 + endMonth;
    const monthsInRange = [];
    let cur = startMonth;
    for (let i = 0; i < monthCount; i++) {
      monthsInRange.push(cur);
      cur = cur === 12 ? 1 : cur + 1;
    }
    return {
      key: norm,
      startMonth,
      endMonth,
      isRange: true,
      monthCount,
      monthsInRange,
    };
  }
  const single = Math.min(12, Math.max(1, Number(norm) || 1));
  return {
    key: String(single),
    startMonth: single,
    endMonth: single,
    isRange: false,
    monthCount: 1,
    monthsInRange: [single],
  };
}

export function getSingleMonthName(monthNumber) {
  const found = MONTHS_ID.find((m) => m.value === Number(monthNumber));
  return found ? found.label : `Bulan ${monthNumber}`;
}

/**
 * Formats a single month ("11" -> "November") or a flexible month range ("1-3" -> "Januari – Maret").
 */
export function getMonthName(monthValue) {
  if (monthValue === null || monthValue === undefined || monthValue === '') return '-';
  const norm = normalizePeriodKey(monthValue);
  const rangeMatch = norm.match(/^(\d{1,2})-(\d{1,2})$/);
  if (rangeMatch) {
    const startLabel = getSingleMonthName(Number(rangeMatch[1]));
    const endLabel = getSingleMonthName(Number(rangeMatch[2]));
    return `${startLabel} – ${endLabel}`;
  }
  return getSingleMonthName(norm);
}

/**
 * Parses `custom_components_json` or array into validated custom items:
 * `[{ id, type: 'deduction' | 'allowance', label: string, amount: number }]`
 */
export function parseCustomComponents(raw) {
  if (!raw) return [];
  let arr = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((item, idx) => ({
      id: String(item.id || `cust_${idx}_${Date.now()}`),
      type: item.type === 'allowance' ? 'allowance' : 'deduction',
      label: sanitizeClientString(item.label || ''),
      amount: Math.max(0, Number(item.amount || 0)),
    }))
    .filter((item) => item.label && item.amount >= 0);
}

/**
 * Computes totals and separates custom allowances vs custom deductions.
 */
export function summarizeCustomComponents(raw) {
  const items = parseCustomComponents(raw);
  const allowances = items.filter((i) => i.type === 'allowance');
  const deductions = items.filter((i) => i.type === 'deduction');
  const totalCustomAllowance = allowances.reduce((sum, i) => sum + Number(i.amount || 0), 0);
  const totalCustomDeduction = deductions.reduce((sum, i) => sum + Number(i.amount || 0), 0);
  return {
    items,
    allowances,
    deductions,
    totalCustomAllowance,
    totalCustomDeduction,
  };
}

export const INFAQ_ZAKAT_RATE = 0.025;

/**
 * Computes 2.5% Infaq / Zakat Profesi from (Gaji Pokok + Tarif per JTM + Tunjangan Jabatan)
 * when enabled for the teacher, or 0 when unchecked.
 */
export function calculateInfaqZakat(
  baseSalary,
  hourlyRate,
  positionAllowance,
  isEnabled = true
) {
  if (!isEnabled) return 0;
  const basis =
    Math.max(0, Number(baseSalary || 0)) +
    Math.max(0, Number(hourlyRate || 0)) +
    Math.max(0, Number(positionAllowance || 0));
  return Math.round(basis * INFAQ_ZAKAT_RATE);
}

/**
 * Resolves whether Infaq / Zakat Profesi deduction is enabled on a salary component or slip detail.
 */
export function isInfaqZakatEnabled(record = {}) {
  if (!record || typeof record !== 'object') return false;
  if (record.infaq_zakat_enabled !== undefined) {
    return (
      record.infaq_zakat_enabled === true ||
      String(record.infaq_zakat_enabled).toLowerCase() === 'true'
    );
  }
  return Number(record.infaq_zakat ?? record.bpjs_deduction ?? 0) > 0;
}

/**
 * Resolves the Infaq / Zakat Profesi amount for display & calculation.
 */
export function resolveInfaqZakatAmount(record = {}) {
  if (!record || typeof record !== 'object') return 0;
  if (record.infaq_zakat !== undefined) {
    return Math.max(0, Number(record.infaq_zakat || 0));
  }
  if (record.infaq_zakat_enabled !== undefined) {
    return calculateInfaqZakat(
      record.base_salary,
      record.hourly_rate,
      record.position_allowance,
      isInfaqZakatEnabled(record)
    );
  }
  return Math.max(0, Number(record.bpjs_deduction || 0));
}

/**
 * Client-side Anti-XSS input sanitizer.
 */
export function sanitizeClientString(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

/**
 * Recursively sanitizes string fields in a request payload before sending to GAS.
 */
export function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const cleaned = {};
  for (const [key, val] of Object.entries(payload)) {
    if (typeof val === 'string') {
      cleaned[key] = sanitizeClientString(val);
    } else if (typeof val === 'number' || typeof val === 'boolean' || val === null) {
      cleaned[key] = val;
    } else if (Array.isArray(val)) {
      cleaned[key] = val.map((item) =>
        typeof item === 'object' && item !== null ? sanitizePayload(item) : item
      );
    } else if (typeof val === 'object') {
      cleaned[key] = sanitizePayload(val);
    } else {
      cleaned[key] = val;
    }
  }
  return cleaned;
}
