import React, { useState, useMemo, useEffect } from 'react';
import {
  Ban,
  Banknote,
  Calendar,
  Check,
  CheckCheck,
  FileDown,
  RefreshCw,
  Search,
} from 'lucide-react';
import api from '../services/gasApi';
import { emitDataChange } from '../services/realtimeSync';
import notify from '../utils/notify';
import { formatRibuan, formatRupiah, getMonthName, parseRibuan } from '../utils/formatters';
import {
  formatIsoDateTimeIndo,
  getDisbursementScopeMeta,
  getDisbursementStatusMeta,
  getDisbursementTimingMeta,
} from '../utils/disbursementHelpers';
import { downloadPayslipPdf } from '../utils/pdfSlipLoader';
import PaginationBar from './admin/PaginationBar';

export function DisbursementApprovalPanel({
  role = 'admin',
  requests = [],
  onRefresh,
}) {
  const isAdmin = role === 'admin';
  const defaultFilter = isAdmin ? 'pending_treasurer' : 'approved_treasurer';
  const [statusFilter, setStatusFilter] = useState(defaultFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [noteEdits, setNoteEdits] = useState({});
  const [amountEdits, setAmountEdits] = useState({});
  const [busyId, setBusyId] = useState('');

  const counts = useMemo(() => {
    const map = {
      pending_treasurer: 0,
      approved_treasurer: 0,
      approved: 0,
      rejected: 0,
      all: requests.length,
    };
    requests.forEach((r) => {
      if (map[r.status] !== undefined) map[r.status] += 1;
    });
    return map;
  }, [requests]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, searchQuery]);

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${r.teacher_name || ''} ${r.nip || ''} ${r.reason || ''} ${getMonthName(
        r.month
      )} ${r.year}`.toLowerCase();
      return hay.includes(q);
    });
  }, [requests, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRequests = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRequests.slice(start, start + pageSize);
  }, [filteredRequests, safePage, pageSize]);

  const pendingTreasurerOntimeIds = useMemo(
    () =>
      requests
        .filter((r) => r.status === 'pending_treasurer' && r.disbursement_timing === 'ontime')
        .map((r) => r.id),
    [requests]
  );

  const pendingTreasurerAllIds = useMemo(
    () => requests.filter((r) => r.status === 'pending_treasurer').map((r) => r.id),
    [requests]
  );

  const handleReview = async (req, decision) => {
    setBusyId(req.id);
    try {
      const note = noteEdits[req.id] ?? '';
      if (isAdmin) {
        const editedAmt =
          amountEdits[req.id] !== undefined ? amountEdits[req.id] : req.requested_amount;
        await api.put('disbursements.treasurerReview', {
          id: req.id,
          decision,
          approved_amount: editedAmt,
          note,
        });
        notify.success(
          decision === 'approve'
            ? `Pengajuan ${req.teacher_name} disetujui Bendahara & diteruskan ke Kepala Sekolah.`
            : `Pengajuan ${req.teacher_name} ditolak.`
        );
      } else {
        await api.put('disbursements.kepsekReview', {
          id: req.id,
          decision,
          note,
        });
        notify.success(
          decision === 'approve'
            ? `Pengajuan ${req.teacher_name} DISETUJUI! Slip Gaji Pencairan Resmi otomatis diterbitkan ke akun PTK.`
            : `Pengajuan ${req.teacher_name} ditolak oleh Kepala Sekolah.`
        );
      }
      emitDataChange(['disbursements', 'notifications'], { source: 'disb_panel_local' });
      onRefresh?.(['disbursements']);
    } catch (err) {
      notify.error(err.message || 'Gagal memproses persetujuan pencairan.');
    } finally {
      setBusyId('');
    }
  };

  const handleBulkApprove = async (targetIds, label) => {
    if (!targetIds || targetIds.length === 0) return;
    setBusyId('bulk');
    try {
      await api.put('disbursements.bulkTreasurerApprove', {
        ids: targetIds,
        note: `Disetujui ${label} oleh Bendahara.`,
      });
      notify.success(
        `${targetIds.length} pengajuan pencairan berhasil disetujui kolektif & diteruskan ke Kepala Sekolah.`
      );
      emitDataChange(['disbursements', 'notifications'], { source: 'disb_panel_local' });
      onRefresh?.(['disbursements']);
    } catch (err) {
      notify.error(err.message || 'Gagal menyetujui pengajuan secara kolektif.');
    } finally {
      setBusyId('');
    }
  };

  const handleDownloadSlip = async (req) => {
    await downloadPayslipPdf({
      id: req.issued_slip_id || req.id,
      slip_type: 'disbursement',
      disbursement_request_id: req.id,
      month: req.month,
      year: req.year,
      payroll_status: 'paid',
      net_salary: req.approved_amount,
      approved_amount: req.approved_amount,
      teacher_name: req.teacher_name,
      nip: req.nip,
      details_json: req.issued_slip_json || '{}',
    });
  };

  const filterTabs = isAdmin
    ? [
        { id: 'pending_treasurer', label: `Menunggu Bendahara (${counts.pending_treasurer})` },
        { id: 'approved_treasurer', label: `Menunggu Kepsek (${counts.approved_treasurer})` },
        { id: 'approved', label: `Slip Terbit (${counts.approved})` },
        { id: 'rejected', label: `Ditolak (${counts.rejected})` },
        { id: 'all', label: `Semua (${counts.all})` },
      ]
    : [
        { id: 'approved_treasurer', label: `Perlu Otorisasi (${counts.approved_treasurer})` },
        { id: 'approved', label: `Slip Terbit (${counts.approved})` },
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
              <Banknote className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[var(--ink)]">
                {isAdmin
                  ? 'Pengajuan Pencairan Gaji PTK'
                  : 'Otorisasi Pencairan Gaji PTK (Disetujui Bendahara)'}
              </h2>
              <p className="text-xs text-[var(--muted)]">
                {isAdmin
                  ? 'Tinjau pengajuan pencairan sebagian/seluruh estimasi PTK, setujui satuan atau kolektif, lalu teruskan ke Kepala Sekolah.'
                  : 'Berikan persetujuan akhir pengajuan pencairan PTK yang telah disetujui Bendahara untuk menerbitkan Slip Gaji Resmi.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && pendingTreasurerOntimeIds.length > 0 && (
              <button
                type="button"
                disabled={busyId === 'bulk'}
                onClick={() =>
                  handleBulkApprove(pendingTreasurerOntimeIds, 'kolektif (tepat waktu)')
                }
                className="nim-btn nim-btn--good nim-btn--sm"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Setujui Kolektif Tepat Waktu ({pendingTreasurerOntimeIds.length})</span>
              </button>
            )}
            {isAdmin && pendingTreasurerAllIds.length > 1 && (
              <button
                type="button"
                disabled={busyId === 'bulk'}
                onClick={() => handleBulkApprove(pendingTreasurerAllIds, 'kolektif')}
                className="nim-btn nim-btn--primary nim-btn--sm"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Setujui Semua ({pendingTreasurerAllIds.length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onRefresh?.()}
              className="nim-btn nim-btn--sm"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Segarkan</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Chips */}
        <div
          className="flex flex-wrap items-center justify-between gap-2 pt-2"
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

          <div className="relative min-w-[200px] sm:w-64">
            <Search className="h-3.5 w-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama PTK, NIP, bulan..."
              className="nim-input !min-h-[32px] !py-1 !pl-8 text-xs"
            />
          </div>
        </div>
      </div>

      {filteredRequests.length === 0 ? (
        <div className="nim-glass nim-card p-8 text-center text-xs text-[var(--muted)]">
          {requests.length === 0
            ? 'Tidak ada pengajuan pencairan PTK pada kategori ini.'
            : 'Tidak ada pengajuan pencairan PTK yang sesuai dengan filter atau pencarian.'}
        </div>
      ) : (
        <>
          <div className="fluid-container">
            {pagedRequests.map((req) => {
              const stMeta = getDisbursementStatusMeta(req.status);
              const scopeMeta = getDisbursementScopeMeta(req.request_scope);
              const timingMeta = getDisbursementTimingMeta(req.disbursement_timing);
              const canAction = isAdmin
                ? req.status === 'pending_treasurer'
                : req.status === 'approved_treasurer';
              const isBusy = busyId === req.id;

              return (
                <div
                  key={req.id}
                  className="fluid-item nim-glass nim-card flex flex-col justify-between gap-3"
                >
                  <div className="space-y-3">
                    <div
                      className="flex flex-wrap items-start justify-between gap-2 pb-2.5"
                      style={{ borderBottom: '1px solid var(--line)' }}
                    >
                      <div>
                        <h3 className="text-sm font-bold text-[var(--ink)]">{req.teacher_name}</h3>
                        <p className="text-xs text-[var(--muted)]">
                          NIP: {req.nip} • Diajukan {formatIsoDateTimeIndo(req.created_at)}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span className="nim-badge nim-badge--accent !text-[10.5px]">
                            <Calendar className="h-3 w-3" />
                            {getMonthName(req.month)} {req.year}
                          </span>
                          <span className="nim-badge !text-[10.5px]">{scopeMeta.shortLabel}</span>
                          <span
                            className={`nim-badge !text-[10.5px] ${
                              req.disbursement_timing === 'early'
                                ? 'nim-badge--warn'
                                : 'nim-badge--good'
                            }`}
                          >
                            {timingMeta.shortLabel}
                          </span>
                        </div>
                      </div>
                      <span className={stMeta.cls}>{stMeta.shortLabel}</span>
                    </div>

                    <div className="nim-card-well p-3 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[var(--muted)]">Estimasi Gaji Bersih</span>
                        <span className="font-semibold text-[var(--ink)] tabular-nums">
                          {formatRupiah(req.estimated_net_salary)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--muted)]">Nominal Diajukan PTK</span>
                        <span className="font-bold text-[var(--accent-text)] tabular-nums">
                          {formatRupiah(req.requested_amount)}
                        </span>
                      </div>
                      {req.status !== 'pending_treasurer' && (
                        <div className="flex justify-between">
                          <span className="text-[var(--muted)]">Disetujui Bendahara</span>
                          <span className="font-bold text-[var(--good-text)] tabular-nums">
                            {formatRupiah(req.approved_amount)}
                          </span>
                        </div>
                      )}
                    </div>

                    {req.reason && (
                      <p className="text-xs text-[var(--ink-2)]">
                        <strong>Alasan PTK:</strong> {req.reason}
                      </p>
                    )}
                    {req.treasurer_note && (
                      <p className="text-xs text-[var(--ink-2)]">
                        <strong>Catatan Bendahara:</strong> {req.treasurer_note}
                      </p>
                    )}
                    {req.kepsek_note && (
                      <p className="text-xs text-[var(--ink-2)]">
                        <strong>Catatan Kepsek:</strong> {req.kepsek_note}
                      </p>
                    )}

                    {canAction && (
                      <div className="space-y-2 pt-1">
                        {isAdmin && (
                          <div>
                            <label className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                              Nominal Disetujui Bendahara (Rp)
                            </label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={formatRibuan(
                                amountEdits[req.id] !== undefined
                                  ? amountEdits[req.id]
                                  : req.requested_amount
                              )}
                              onChange={(e) =>
                                setAmountEdits((prev) => ({
                                  ...prev,
                                  [req.id]: parseRibuan(e.target.value),
                                }))
                              }
                              className="nim-input !min-h-[32px] !py-1 text-xs font-bold tabular-nums"
                            />
                          </div>
                        )}
                        <div>
                          <input
                            type="text"
                            maxLength={200}
                            value={noteEdits[req.id] || ''}
                            onChange={(e) =>
                              setNoteEdits((prev) => ({ ...prev, [req.id]: e.target.value }))
                            }
                            placeholder={
                              isAdmin
                                ? 'Catatan Bendahara (opsional)...'
                                : 'Catatan Kepala Sekolah (opsional)...'
                            }
                            className="nim-input !min-h-[32px] !py-1 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div
                    className="flex flex-wrap items-center justify-end gap-2 pt-2.5"
                    style={{ borderTop: '1px solid var(--line)' }}
                  >
                    {req.status === 'approved' && (
                      <button
                        type="button"
                        onClick={() => handleDownloadSlip(req)}
                        className="nim-btn nim-btn--good nim-btn--sm"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        <span>Unduh Slip Resmi PDF</span>
                      </button>
                    )}

                    {canAction && (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleReview(req, 'reject')}
                          className="nim-btn nim-btn--danger nim-btn--sm"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          <span>Tolak</span>
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleReview(req, 'approve')}
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
                              : 'Setujui & Terbitkan Slip Gaji'}
                          </span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <PaginationBar
            page={safePage}
            pageSize={pageSize}
            totalItems={filteredRequests.length}
            onPageChange={setPage}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setPage(1);
            }}
            itemLabel="pengajuan"
          />
        </>
      )}
    </section>
  );
}

export default DisbursementApprovalPanel;
