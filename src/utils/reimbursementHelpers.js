export const REIMBURSEMENT_CATEGORIES = [
  { id: 'atk', label: 'ATK & Perlengkapan Kelas' },
  { id: 'fotokopi', label: 'Fotokopi & Cetak' },
  { id: 'konsumsi', label: 'Konsumsi Kegiatan' },
  { id: 'sarana', label: 'Perawatan & Sarana' },
  { id: 'transport', label: 'Transportasi Dinas' },
  { id: 'lainnya', label: 'Keperluan Lainnya' },
];

export const REIMBURSEMENT_CATEGORY_MAP = REIMBURSEMENT_CATEGORIES.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

export const REIMBURSEMENT_STATUS_META = {
  pending_treasurer: {
    label: 'Menunggu Verifikasi Bendahara',
    shortLabel: 'Menunggu Bendahara',
    cls: 'nim-badge nim-badge--warn',
  },
  approved_treasurer: {
    label: 'Disetujui Bendahara (Menunggu Kepsek)',
    shortLabel: 'Menunggu Kepsek',
    cls: 'nim-badge nim-badge--accent',
  },
  approved: {
    label: 'Disetujui Kepsek (Masuk Slip Gaji)',
    shortLabel: 'Disetujui (Masuk Slip)',
    cls: 'nim-badge nim-badge--good',
  },
  rejected: {
    label: 'Catatan Ditolak',
    shortLabel: 'Ditolak',
    cls: 'nim-badge nim-badge--bad',
  },
};

export function getReimbursementCategoryMeta(catId) {
  const key = String(catId || '').trim().toLowerCase();
  return REIMBURSEMENT_CATEGORY_MAP[key] || { id: 'lainnya', label: 'Keperluan Lainnya' };
}

export function getReimbursementStatusMeta(status) {
  return REIMBURSEMENT_STATUS_META[status] || REIMBURSEMENT_STATUS_META.pending_treasurer;
}

/**
 * Validates that an optional external receipt link uses strictly http:// or https://.
 */
export function isSafeReceiptUrl(url) {
  const clean = String(url || '').trim();
  if (!clean) return false;
  try {
    const parsed = new URL(clean);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Formats an expense date (YYYY-MM-DD or ISO) into concise Indonesian date text.
 */
export function formatExpenseDateIndo(dateValue) {
  const raw = String(dateValue || '').trim();
  if (!raw) return '-';
  try {
    const exactMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const dt = exactMatch
      ? new Date(Number(exactMatch[1]), Number(exactMatch[2]) - 1, Number(exactMatch[3]))
      : new Date(raw);
    if (Number.isNaN(dt.getTime())) return raw;
    return dt.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return raw;
  }
}
