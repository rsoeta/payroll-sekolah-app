export const ADMIN_ROUTINE_TEACHER_ID = 'ADMIN_ROUTINE';

export function isAdminRoutineReimbursement(item) {
  return String(item?.teacher_id || '').trim() === ADMIN_ROUTINE_TEACHER_ID;
}

export const REIMBURSEMENT_CATEGORIES = [
  { id: 'atk', label: 'ATK & Perlengkapan Kelas' },
  { id: 'fotokopi', label: 'Fotokopi & Cetak' },
  { id: 'konsumsi', label: 'Konsumsi Kegiatan' },
  { id: 'sarana', label: 'Perawatan & Sarana' },
  { id: 'transport', label: 'Transportasi Dinas' },
  { id: 'lainnya', label: 'Keperluan Lainnya' },
];

export const ADMIN_ROUTINE_REIMBURSEMENT_CATEGORIES = [
  { id: 'utilitas', label: 'WiFi, Token Listrik & Utilitas' },
  { id: 'pesantren_ekologi', label: 'Pesantren Ekologi (Polybag, Bibit, dll)' },
  { id: 'konsumsi_warung', label: 'Konsumsi / Belanja Warung' },
  { id: 'atk_kantor', label: 'ATK Kantor (Amplop, Tinta, Kertas)' },
  { id: 'domain_it', label: 'Domain, Hosting & Layanan Digital' },
  { id: 'sarana', label: 'Perawatan & Sarana Sekolah' },
  { id: 'lainnya', label: 'Keperluan Rutin Lainnya' },
];

export const ADMIN_ROUTINE_PRESETS = [
  {
    id: 'wifi',
    label: 'Pembayaran WiFi',
    category: 'utilitas',
    title: 'Pembayaran WiFi Sekolah',
  },
  {
    id: 'polybag',
    label: 'Polybag (Pesantren Ekologi)',
    category: 'pesantren_ekologi',
    title: 'Pembayaran Polybag (Pesantren Ekologi)',
  },
  {
    id: 'warung',
    label: 'Makanan di Warung',
    category: 'konsumsi_warung',
    title: 'Pembelian Makanan di Warung',
  },
  {
    id: 'amplop',
    label: 'Amplop',
    category: 'atk_kantor',
    title: 'Pembelian Amplop',
  },
  {
    id: 'tinta_kertas',
    label: 'Tinta / Kertas',
    category: 'atk_kantor',
    title: 'Pembelian Tinta / Kertas',
  },
  {
    id: 'domain',
    label: 'Domain',
    category: 'domain_it',
    title: 'Pembayaran Domain Sekolah',
  },
  {
    id: 'token',
    label: 'Token Listrik',
    category: 'utilitas',
    title: 'Pembelian Token Listrik Sekolah',
  },
];

export const REIMBURSEMENT_CATEGORY_MAP = [
  ...REIMBURSEMENT_CATEGORIES,
  ...ADMIN_ROUTINE_REIMBURSEMENT_CATEGORIES,
].reduce((acc, item) => {
  if (!acc[item.id]) {
    acc[item.id] = item;
  }
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

export const ADMIN_ROUTINE_STATUS_META = {
  approved_treasurer: {
    label: 'Menunggu Otorisasi Kepala Sekolah',
    shortLabel: 'Menunggu Kepsek',
    cls: 'nim-badge nim-badge--warn',
  },
  approved: {
    label: 'Disetujui Kepala Sekolah (Reimbursed)',
    shortLabel: 'Disetujui Kepsek',
    cls: 'nim-badge nim-badge--good',
  },
  rejected: {
    label: 'Catatan Ditolak Kepala Sekolah',
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

export function getAdminRoutineStatusMeta(status) {
  return ADMIN_ROUTINE_STATUS_META[status] || ADMIN_ROUTINE_STATUS_META.approved_treasurer;
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
 * Resolves a safe external receipt URL into Lightbox preview modes
 * (direct image with zoom/rotate, Google Drive thumbnail + preview iframe, or embedded document).
 */
export function resolveReceiptPreviewSource(rawUrl) {
  const clean = String(rawUrl || '').trim();
  if (!isSafeReceiptUrl(clean)) return null;

  let parsed;
  try {
    parsed = new URL(clean);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (host.includes('drive.google.com')) {
    const pathMatch = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    const idParam = parsed.searchParams.get('id');
    const driveFileId = (pathMatch && pathMatch[1]) || idParam || '';
    if (driveFileId) {
      return {
        safeUrl: clean,
        isGoogleDrive: true,
        driveFileId,
        initialMode: 'image',
        imageUrl: `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w1600`,
        iframeUrl: `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/preview`,
      };
    }
  }

  if (host.includes('docs.google.com')) {
    const previewUrl = new URL(clean);
    previewUrl.pathname = previewUrl.pathname.replace(/\/(edit|view)\/?$/i, '/preview');
    return {
      safeUrl: clean,
      isGoogleDrive: false,
      driveFileId: '',
      initialMode: 'iframe',
      imageUrl: '',
      iframeUrl: previewUrl.toString(),
    };
  }

  if (/\.pdf(\?|#|$)/i.test(clean)) {
    return {
      safeUrl: clean,
      isGoogleDrive: false,
      driveFileId: '',
      initialMode: 'iframe',
      imageUrl: '',
      iframeUrl: clean,
    };
  }

  return {
    safeUrl: clean,
    isGoogleDrive: false,
    driveFileId: '',
    initialMode: 'image',
    imageUrl: clean,
    iframeUrl: clean,
  };
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
