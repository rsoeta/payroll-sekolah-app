import React, { useState, useMemo, useEffect } from 'react';
import {
  Ban,
  Calendar,
  Check,
  CheckCheck,
  Eye,
  Receipt,
  RefreshCw,
  Search,
} from 'lucide-react';
import api from '../services/gasApi';
import { emitDataChange } from '../services/realtimeSync';
import notify from '../utils/notify';
import {
  formatRibuan,
  formatRupiah,
  getMonthName,
  MONTHS_ID,
  parseRibuan,
} from '../utils/formatters';
import { formatIsoDateTimeIndo } from '../utils/disbursementHelpers';
import {
  formatExpenseDateIndo,
  getAdminRoutineStatusMeta,
  getReimbursementCategoryMeta,
  getReimbursementStatusMeta,
  isSafeReceiptUrl,
} from '../utils/reimbursementHelpers';
import PaginationBar from './admin/PaginationBar';
import ReceiptLightboxModal from './ReceiptLightboxModal';

export function ReimbursementApprovalPanel({
  role = 'admin',
  variant = 'ptk',
  items = [],
  onRefresh,
}) {
  const isAdmin = role === 'admin';
  const isRoutine = variant === 'admin_routine';
  const defaultFilter = isAdmin ? 'pending_treasurer' : 'approved_treasurer';

  const [statusFilter, setStatusFilter] = useState(defaultFilter);
  const [monthFilter, setMonthFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const [noteEdits, setNoteEdits] = useState({});
  const [amountEdits, setAmountEdits] = useState({});
  const [periodEdits, setPeriodEdits] = useState({});
  const [busyId, setBusyId] = useState('');
  const [previewReceipt, setPreviewReceipt] = useState(null);

  const counts = useMemo(() => {
    const map = {
      pending_treasurer: 0,
      approved_treasurer: 0,
      approved: 0,
      rejected: 0,
      all: items.length,
    };
    items.forEach((it) => {
      if (map[it.status] !== undefined) map[it.status] += 1;
    });
    return map;
  }, [items]);

  const availableYears = useMemo(() => {
    const set = new Set([2025, 2026, 2027, 2028]);
    items.forEach((it) => {
      const yr = Number(it.year);
      if (yr) set.add(yr);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [items]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, monthFilter, yearFilter, searchQuery, pageSize]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((it) => {
      if (statusFilter !== 'all' && it.status !== statusFilter) return false;
      if (monthFilter !== 'all' && String(it.month) !== String(monthFilter)) return false;
      if (yearFilter !== 'all' && String(it.year) !== String(yearFilter)) return false;
      if (!q) return true;
      const catLabel = getReimbursementCategoryMeta(it.category).label;
      const hay = `${it.teacher_name || ''} ${it.nip || ''} ${it.title || ''} ${
        it.receipt_number || ''
      } ${catLabel} ${getMonthName(it.month)} ${it.year}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, statusFilter, monthFilter, yearFilter, searchQuery]);

  const filteredTotalAmount = useMemo(
    () =>
      filteredItems.reduce((sum, it) => {
        const val =
          it.status === 'approved' || it.status === 'approved_treasurer'
            ? it.approved_amount ?? it.amount ?? 0
            : it.amount ?? 0;
        return sum + Number(val || 0);
      }, 0),
    [filteredItems]
  );

  const eligibleBulkIds = useMemo(() => {
    const targetStatus = isAdmin ? 'pending_treasurer' : 'approved_treasurer';
    return filteredItems.filter((it) => it.status === targetStatus).map((it) => it.id);
  }, [filteredItems, isAdmin]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, safePage, pageSize]);

  const handleReview = async (item, decision) => {
    setBusyId(item.id);
    try {
      const note = noteEdits[item.id] ?? '';
      if (isAdmin) {
        const editedAmt =
          amountEdits[item.id] !== undefined ? amountEdits[item.id] : item.amount;
        const editedPeriod = periodEdits[item.id] || {
          month: Number(item.month),
          year: Number(item.year),
        };
        await api.put('reimbursements.treasurerReview', {
          id: item.id,
          decision,
          approved_amount: editedAmt,
          month: editedPeriod.month,
          year: editedPeriod.year,
          note,
        });
        notify.success(
          decision === 'approve'
            ? `Belanja "${item.title}" disetujui Bendahara & diteruskan ke Kepala Sekolah.`
            : `Catatan belanja ${item.teacher_name} ditolak.`
        );
      } else {
        await api.put('reimbursements.kepsekReview', {
          id: item.id,
          decision,
          note,
        });
        notify.success(
          decision === 'approve'
            ? isRoutine
              ? `Belanja rutin "${item.title}" DISETUJUI! Status tercatat Disetujui Kepala Sekolah.`
              : `Penggantian belanja "${item.title}" DISETUJUI! Otomatis masuk kalkulasi slip gaji (Non-Infaq).`
            : isRoutine
            ? `Belanja rutin "${item.title}" ditolak oleh Kepala Sekolah.`
            : `Catatan belanja ${item.teacher_name} ditolak oleh Kepala Sekolah.`
        );
      }
      emitDataChange(['reimbursements', 'notifications'], { source: 'reimb_panel_local' });
      onRefresh?.(['reimbursements']);
    } catch (err) {
      notify.error(err.message || 'Gagal memproses verifikasi catatan belanja.');
    } finally {
      setBusyId('');
    }
  };

  const handleBulkApprove = async () => {
    if (eligibleBulkIds.length === 0) return;
    setBusyId('bulk');
    try {
      if (isAdmin) {
        await api.put('reimbursements.bulkTreasurerApprove', {
          ids: eligibleBulkIds,
          note: 'Diverifikasi kolektif oleh Bendahara.',
        });
        notify.success(
          `${eligibleBulkIds.length} catatan belanja disetujui kolektif Bendahara & diteruskan ke Kepsek.`
        );
      } else {
        await api.put('reimbursements.bulkKepsekApprove', {
          ids: eligibleBulkIds,
          note: 'Diotorisasi kolektif oleh Kepala Sekolah.',
        });
        notify.success(
          isRoutine
            ? `${eligibleBulkIds.length} belanja rutin Bendahara DISETUJUI kolektif oleh Kepala Sekolah.`
            : `${eligibleBulkIds.length} penggantian belanja DISETUJUI kolektif & masuk perhitungan slip gaji (Non-Infaq).`
        );
      }
      emitDataChange(['reimbursements', 'notifications'], { source: 'reimb_panel_local' });
      onRefresh?.(['reimbursements']);
    } catch (err) {
      notify.error(err.message || 'Gagal memproses persetujuan kolektif.');
    } finally {
      setBusyId('');
    }
  };

  const filterTabs = isRoutine
    ? [
        { id: 'approved_treasurer', label: `Perlu Otorisasi (${counts.approved_treasurer})` },
        { id: 'approved', label: `Disetujui (${counts.approved})` },
        { id: 'rejected', label: `Ditolak (${counts.rejected})` },
        { id: 'all', label: `Semua (${counts.all})` },
      ]
    : isAdmin
    ? [
        { id: 'pending_treasurer', label: `Menunggu Bendahara (${counts.pending_treasurer})` },
        { id: 'approved_treasurer', label: `Menunggu Kepsek (${counts.approved_treasurer})` },
        { id: 'approved', label: `Masuk Slip Gaji (${counts.approved})` },
        { id: 'rejected', label: `Ditolak (${counts.rejected})` },
        { id: 'all', label: `Semua (${counts.all})` },
      ]
    : [
        { id: 'approved_treasurer', label: `Perlu Otorisasi (${counts.approved_treasurer})` },
        { id: 'approved', label: `Disetujui & Masuk Slip (${counts.approved})` },
        { id: 'pending_treasurer', label: `Di Bendahara (${counts.pending_treasurer})` },
        { id: 'rejected', label: `Ditolak (${counts.rejected})` },
        { id: 'all', label: `Semua (${counts.all})` },
      ];

  return (
    <section className="space-y-4">
      <div className="nim-glass nim-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="nim-kpi__ico">
              <Receipt className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[var(--ink)]">
                {isRoutine
                  ? 'Otorisasi Belanja Sekolah Rutinan Bendahara'
                  : isAdmin
                  ? 'Verifikasi Belanja Sekolah PTK (Reimbursement)'
                  : 'Otorisasi Belanja Sekolah PTK (Piutang Non-Infaq)'}
              </h2>
              <p className="text-xs text-[var(--muted)]">
                {isRoutine
                  ? 'Berikan otorisasi akhir atas pengeluaran rutin sekolah yang ditalangi Bendahara (WiFi, polybag pesantren ekologi, makanan warung, amplop, tinta/kertas, domain, token, dll). Tidak memengaruhi slip gaji PTK.'
                  : isAdmin
                  ? 'Periksa catatan pengeluaran keperluan sekolah dari PTK, sesuaikan nominal atau periode slip bila perlu, lalu teruskan ke Kepala Sekolah.'
                  : 'Berikan otorisasi akhir atas pengeluaran sekolah yang ditalangi PTK agar diganti utuh di slip gaji tanpa potongan Infaq 2,5%.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {eligibleBulkIds.length > 1 && (
              <button
                type="button"
                disabled={busyId === 'bulk'}
                onClick={handleBulkApprove}
                className={`nim-btn nim-btn--sm ${isAdmin ? 'nim-btn--primary' : 'nim-btn--good'}`}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>
                  {isAdmin
                    ? `Setujui Kolektif (${eligibleBulkIds.length})`
                    : isRoutine
                    ? `Otorisasi Belanja Rutin (${eligibleBulkIds.length})`
                    : `Otorisasi Semua (${eligibleBulkIds.length})`}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onRefresh?.(['reimbursements'])}
              className="nim-btn nim-btn--sm"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Segarkan</span>
            </button>
          </div>
        </div>

        {/* Summary & Filters */}
        <div
          className="flex flex-wrap items-center justify-between gap-2 pt-2.5"
          style={{ borderTop: '1px solid var(--line)' }}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`nim-btn nim-btn--sm ${
                  statusFilter === tab.id ? 'nim-btn--primary' : ''
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter Bulan Slip"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="nim-select !w-auto !min-h-[32px] !py-1 text-xs font-semibold"
            >
              <option value="all">Semua Bulan</option>
              {MONTHS_ID.map((m) => (
                <option key={m.value} value={String(m.value)}>
                  {m.label}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter Tahun"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="nim-select !w-auto !min-h-[32px] !py-1 text-xs font-semibold"
            >
              <option value="all">Semua Tahun</option>
              {availableYears.map((yr) => (
                <option key={yr} value={String(yr)}>
                  {yr}
                </option>
              ))}
            </select>

            <div className="relative min-w-[190px] sm:w-56">
              <Search className="h-3.5 w-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari PTK, uraian, nota..."
                className="nim-input !min-h-[32px] !py-1 !pl-8 text-xs"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
          <span>
            Menampilkan <strong className="text-[var(--ink)]">{filteredItems.length}</strong>{' '}
            catatan belanja pada filter aktif
          </span>
          <span>
            Total Nominal Filter:{' '}
            <strong className="text-[var(--accent-text)] tabular-nums">
              {formatRupiah(filteredTotalAmount)}
            </strong>
          </span>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="nim-glass nim-card p-8 text-center text-xs text-[var(--muted)]">
          {isRoutine
            ? items.length === 0
              ? 'Belum ada catatan belanja sekolah rutinan dari Bendahara.'
              : 'Tidak ada catatan belanja rutin yang sesuai dengan filter.'
            : items.length === 0
            ? 'Belum ada catatan pengeluaran keperluan sekolah dari PTK.'
            : 'Tidak ada catatan belanja PTK yang sesuai dengan filter.'}
        </div>
      ) : (
        <>
          <div className="fluid-container">
            {pagedItems.map((item) => {
              const stMeta = isRoutine
                ? getAdminRoutineStatusMeta(item.status)
                : getReimbursementStatusMeta(item.status);
              const catMeta = getReimbursementCategoryMeta(item.category);
              const canAction = isAdmin
                ? item.status === 'pending_treasurer'
                : item.status === 'approved_treasurer';
              const isBusy = busyId === item.id;
              const hasLink = isSafeReceiptUrl(item.receipt_url);
              const curPeriodEdit = periodEdits[item.id] || {
                month: Number(item.month),
                year: Number(item.year),
              };

              return (
                <div
                  key={item.id}
                  className="fluid-item nim-glass nim-card flex flex-col justify-between gap-3"
                >
                  <div className="space-y-3">
                    <div
                      className="flex flex-wrap items-start justify-between gap-2 pb-2.5"
                      style={{ borderBottom: '1px solid var(--line)' }}
                    >
                      <div>
                        <h3 className="text-sm font-bold text-[var(--ink)]">{item.title}</h3>
                        <p className="text-xs text-[var(--muted)]">
                          {isRoutine
                            ? `${item.teacher_name || 'Bendahara / Admin'} • Dicatat ${formatIsoDateTimeIndo(
                                item.created_at
                              )}`
                            : `${item.teacher_name} (NIP: ${item.nip}) • Dicatat ${formatIsoDateTimeIndo(
                                item.created_at
                              )}`}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span className="nim-badge !text-[10.5px]">
                            <Calendar className="h-3 w-3" />
                            Belanja {formatExpenseDateIndo(item.expense_date)}
                          </span>
                          <span className="nim-badge nim-badge--accent !text-[10.5px]">
                            {isRoutine ? 'Periode' : 'Slip'}: {getMonthName(item.month)} {item.year}
                          </span>
                          <span className="nim-badge !text-[10.5px]">{catMeta.label}</span>
                        </div>
                      </div>
                      <span className={stMeta.cls}>{stMeta.shortLabel}</span>
                    </div>

                    <div className="nim-card-well p-3 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[var(--muted)]">
                          {isRoutine ? 'Nominal Belanja Rutin' : 'Nominal Diajukan PTK'}
                        </span>
                        <span className="font-bold text-[var(--ink)] tabular-nums">
                          {formatRupiah(item.amount)}
                        </span>
                      </div>
                      {item.status !== 'pending_treasurer' && (
                        <div className="flex justify-between">
                          <span className="text-[var(--muted)]">
                            {item.status === 'approved'
                              ? isRoutine
                                ? 'Disetujui Kepsek (Non-Slip PTK)'
                                : 'Disetujui Masuk Slip (Non-Infaq)'
                              : 'Disetujui Bendahara'}
                          </span>
                          <span className="font-bold text-[var(--good-text)] tabular-nums">
                            {formatRupiah(item.approved_amount)}
                          </span>
                        </div>
                      )}
                      {item.receipt_number && (
                        <div className="flex justify-between">
                          <span className="text-[var(--muted)]">No. Nota / Kwitansi</span>
                          <span className="font-semibold text-[var(--ink-2)]">
                            {item.receipt_number}
                          </span>
                        </div>
                      )}
                    </div>

                    {item.note && (
                      <p className="text-xs text-[var(--ink-2)]">
                        <strong>Keterangan PTK:</strong> {item.note}
                      </p>
                    )}
                    {hasLink && (
                      <p className="text-xs">
                        <button
                          type="button"
                          onClick={() => setPreviewReceipt(item)}
                          className="inline-flex items-center gap-1 font-semibold text-[var(--accent-text)] hover:underline"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Lihat Bukti Nota</span>
                        </button>
                      </p>
                    )}
                    {item.treasurer_note && (
                      <p className="text-xs text-[var(--ink-2)]">
                        <strong>Catatan Bendahara:</strong> {item.treasurer_note}
                      </p>
                    )}
                    {item.kepsek_note && (
                      <p className="text-xs text-[var(--ink-2)]">
                        <strong>Catatan Kepsek:</strong> {item.kepsek_note}
                      </p>
                    )}

                    {canAction && (
                      <div className="space-y-2 pt-1">
                        {isAdmin && (
                          <div className="grid grid-cols-12 gap-2">
                            <div className="col-span-12 sm:col-span-5">
                              <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                                Nominal Disetujui (Rp)
                              </label>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={formatRibuan(
                                  amountEdits[item.id] !== undefined
                                    ? amountEdits[item.id]
                                    : item.amount
                                )}
                                onChange={(e) =>
                                  setAmountEdits((prev) => ({
                                    ...prev,
                                    [item.id]: parseRibuan(e.target.value),
                                  }))
                                }
                                className="nim-input !min-h-[32px] !py-1 text-xs font-bold tabular-nums"
                              />
                            </div>

                            <div className="col-span-7 sm:col-span-4">
                              <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                                Masuk Slip Bulan
                              </label>
                              <select
                                value={curPeriodEdit.month}
                                onChange={(e) =>
                                  setPeriodEdits((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      ...curPeriodEdit,
                                      month: Number(e.target.value),
                                    },
                                  }))
                                }
                                className="nim-select !min-h-[32px] !py-1 text-xs font-semibold"
                              >
                                {MONTHS_ID.map((m) => (
                                  <option key={m.value} value={m.value}>
                                    {m.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="col-span-5 sm:col-span-3">
                              <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                                Tahun
                              </label>
                              <select
                                value={curPeriodEdit.year}
                                onChange={(e) =>
                                  setPeriodEdits((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      ...curPeriodEdit,
                                      year: Number(e.target.value),
                                    },
                                  }))
                                }
                                className="nim-select !min-h-[32px] !py-1 text-xs font-semibold"
                              >
                                {availableYears.map((yr) => (
                                  <option key={yr} value={yr}>
                                    {yr}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}

                        <input
                          type="text"
                          maxLength={240}
                          value={noteEdits[item.id] || ''}
                          onChange={(e) =>
                            setNoteEdits((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          placeholder={
                            isAdmin
                              ? 'Catatan Bendahara (opsional)...'
                              : 'Catatan Kepala Sekolah (opsional)...'
                          }
                          className="nim-input !min-h-[32px] !py-1 text-xs"
                        />
                      </div>
                    )}
                  </div>

                  {canAction && (
                    <div
                      className="flex flex-wrap items-center justify-end gap-2 pt-2.5"
                      style={{ borderTop: '1px solid var(--line)' }}
                    >
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleReview(item, 'reject')}
                        className="nim-btn nim-btn--danger nim-btn--sm"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        <span>Tolak</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleReview(item, 'approve')}
                        className={`nim-btn nim-btn--sm ${
                          isAdmin ? 'nim-btn--primary' : 'nim-btn--good'
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>
                          {isBusy
                            ? 'Memproses...'
                            : isAdmin
                            ? 'Setujui & Teruskan ke Kepsek'
                            : isRoutine
                            ? 'Setujui Belanja Rutin Bendahara'
                            : 'Setujui (Masuk Slip Non-Infaq)'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <PaginationBar
            page={safePage}
            pageSize={pageSize}
            totalItems={filteredItems.length}
            onPageChange={setPage}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setPage(1);
            }}
            itemLabel="catatan belanja"
          />
        </>
      )}

      <ReceiptLightboxModal
        isOpen={Boolean(previewReceipt)}
        url={previewReceipt?.receipt_url || ''}
        title={previewReceipt?.title || 'Bukti Nota Belanja'}
        subtitle={
          previewReceipt
            ? `${previewReceipt.teacher_name || 'PTK'} • ${formatExpenseDateIndo(
                previewReceipt.expense_date
              )} • ${formatRupiah(previewReceipt.approved_amount ?? previewReceipt.amount)}`
            : ''
        }
        receiptNumber={previewReceipt?.receipt_number || ''}
        onClose={() => setPreviewReceipt(null)}
      />
    </section>
  );
}

export default ReimbursementApprovalPanel;
