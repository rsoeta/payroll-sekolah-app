export const DISBURSEMENT_SCOPE_META = {
  partial: {
    id: 'partial',
    label: 'Sebagian Estimasi Gaji',
    shortLabel: 'Sebagian',
    description: 'Ajukan pencairan sejumlah nominal tertentu dari sisa estimasi gaji bersih.',
  },
  full: {
    id: 'full',
    label: 'Seluruh Estimasi Gaji',
    shortLabel: 'Seluruhnya (100%)',
    description: 'Ajukan pencairan penuh sesuai sisa estimasi gaji bersih periode tersebut.',
  },
};

export const DISBURSEMENT_TIMING_META = {
  early: {
    id: 'early',
    label: 'Sebelum Waktunya (Pencairan Awal)',
    shortLabel: 'Sebelum Waktunya',
    description: 'Dicairkan lebih awal mendahului jadwal pencairan kolektif sekolah.',
  },
  ontime: {
    id: 'ontime',
    label: 'Tepat Waktu (Kolektif Bendahara)',
    shortLabel: 'Tepat Waktu (Kolektif)',
    description: 'Dijadwalkan cair tepat waktu secara kolektif oleh Bendahara.',
  },
};

export const DISBURSEMENT_STATUS_META = {
  pending_treasurer: {
    label: 'Menunggu Persetujuan Bendahara',
    shortLabel: 'Menunggu Bendahara',
    cls: 'nim-badge nim-badge--warn',
  },
  approved_treasurer: {
    label: 'Disetujui Bendahara (Menunggu Kepsek)',
    shortLabel: 'Menunggu Kepsek',
    cls: 'nim-badge nim-badge--accent',
  },
  approved: {
    label: 'Disetujui & Slip Gaji Terbit',
    shortLabel: 'Slip Terbit',
    cls: 'nim-badge nim-badge--good',
  },
  rejected: {
    label: 'Pengajuan Ditolak',
    shortLabel: 'Ditolak',
    cls: 'nim-badge nim-badge--bad',
  },
};

export function getDisbursementScopeMeta(scope) {
  return DISBURSEMENT_SCOPE_META[scope] || DISBURSEMENT_SCOPE_META.partial;
}

export function getDisbursementTimingMeta(timing) {
  return DISBURSEMENT_TIMING_META[timing] || DISBURSEMENT_TIMING_META.ontime;
}

export function getDisbursementStatusMeta(status) {
  return DISBURSEMENT_STATUS_META[status] || DISBURSEMENT_STATUS_META.pending_treasurer;
}

export function formatIsoDateTimeIndo(isoString) {
  if (!isoString) return '-';
  try {
    const dt = new Date(isoString);
    if (Number.isNaN(dt.getTime())) return String(isoString);
    return dt.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(isoString);
  }
}
