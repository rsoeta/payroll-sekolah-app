import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Banknote,
  Calendar,
  CheckCircle2,
  Clock,
  FileDown,
  Info,
  MailCheck,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react';
import api from '../services/gasApi';
import { emitDataChange, subscribeDataChange } from '../services/realtimeSync';
import notify from '../utils/notify';
import {
  formatRibuan,
  formatRupiah,
  getMonthName,
  MONTHS_ID,
  normalizePeriodKey,
  parseRibuan,
} from '../utils/formatters';
import {
  DISBURSEMENT_SCOPE_META,
  DISBURSEMENT_TIMING_META,
  formatIsoDateTimeIndo,
  getDisbursementScopeMeta,
  getDisbursementStatusMeta,
  getDisbursementTimingMeta,
} from '../utils/disbursementHelpers';
import { downloadPayslipPdf } from '../utils/pdfSlipLoader';

export function DisbursementRequestSection({
  teacherProfile,
  initialPeriod,
  initialEstimates,
  initialRequests,
  onDisbursementChange,
}) {
  const now = new Date();
  const initialMonthVal = initialPeriod?.month
    ? normalizePeriodKey(initialPeriod.month)
    : String(now.getMonth() + 1);
  const initialYearVal = initialPeriod?.year ? Number(initialPeriod.year) : now.getFullYear();

  const hasPrefetchForInitial =
    Array.isArray(initialEstimates) &&
    Array.isArray(initialRequests) &&
    Number(initialPeriod?.year || 0) === initialYearVal &&
    normalizePeriodKey(initialPeriod?.month || '') === initialMonthVal;

  const [estimates, setEstimates] = useState(() =>
    hasPrefetchForInitial ? initialEstimates : []
  );
  const [requests, setRequests] = useState(() => (hasPrefetchForInitial ? initialRequests : []));
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [selectedMonth, setSelectedMonth] = useState(initialMonthVal);
  const [selectedYear, setSelectedYear] = useState(initialYearVal);

  const [requestScope, setRequestScope] = useState('partial');
  const [disbursementTiming, setDisbursementTiming] = useState('early');
  const [requestedAmount, setRequestedAmount] = useState(0);
  const [reason, setReason] = useState('');

  const skipInitialFetchRef = useRef(hasPrefetchForInitial);

  useEffect(() => {
    if (initialPeriod?.month && initialPeriod?.year) {
      setSelectedMonth(normalizePeriodKey(initialPeriod.month));
      setSelectedYear(Number(initialPeriod.year));
    }
  }, [initialPeriod]);

  const loadData = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const [estList, reqList] = await Promise.all([
          api.get('disbursements.estimates', { month: selectedMonth, year: selectedYear }),
          api.get('disbursements.list'),
        ]);
        const validEstimates = Array.isArray(estList) ? estList : [];
        const validReqs = Array.isArray(reqList) ? reqList : [];
        setEstimates(validEstimates);
        setRequests(validReqs);
        return { estimates: validEstimates, requests: validReqs };
      } catch (err) {
        if (!silent) {
          notify.error(err.message || 'Gagal memuat data pengajuan pencairan.');
        }
        return null;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [selectedMonth, selectedYear]
  );

  useEffect(() => {
    if (
      skipInitialFetchRef.current &&
      selectedMonth === initialMonthVal &&
      selectedYear === initialYearVal
    ) {
      skipInitialFetchRef.current = false;
      return;
    }
    loadData();
  }, [loadData, selectedMonth, selectedYear, initialMonthVal, initialYearVal]);

  useEffect(() => {
    return subscribeDataChange((domains, meta) => {
      if (meta?.source === 'guru_disb_local') return;
      if (
        domains.includes('disbursements') ||
        domains.includes('payrolls') ||
        domains.includes('attendances') ||
        domains.includes('teachers')
      ) {
        loadData({ silent: true });
      }
    });
  }, [loadData]);

  const activeEstimate = useMemo(() => {
    const key = `${selectedYear}:${normalizePeriodKey(selectedMonth)}`;
    return (
      estimates.find((e) => e.period_key === key) ||
      estimates[0] || {
        month: selectedMonth,
        year: selectedYear,
        estimated_net_salary: 0,
        already_requested_amount: 0,
        already_approved_amount: 0,
        available_amount: 0,
        is_paid: false,
        payroll_status: 'estimate_live',
      }
    );
  }, [estimates, selectedMonth, selectedYear]);

  useEffect(() => {
    const avail = Number(activeEstimate?.available_amount || 0);
    if (requestScope === 'full') {
      setRequestedAmount(avail);
    } else if (avail > 0 && (requestedAmount <= 0 || requestedAmount > avail)) {
      setRequestedAmount(Math.round(avail * 0.5));
    } else if (avail <= 0) {
      setRequestedAmount(0);
    }
  }, [activeEstimate?.period_key, activeEstimate?.available_amount, requestScope]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const avail = Number(activeEstimate?.available_amount || 0);
    if (activeEstimate?.is_paid) {
      notify.warn('Gaji periode ini sudah dibayarkan penuh secara kolektif.');
      return;
    }
    if (avail <= 0) {
      notify.warn('Sisa estimasi gaji bersih untuk periode ini sudah habis.');
      return;
    }

    const finalAmt = requestScope === 'full' ? avail : Math.round(Number(requestedAmount || 0));
    if (!finalAmt || finalAmt <= 0) {
      notify.warn('Masukkan nominal pengajuan pencairan lebih dari Rp 0.');
      return;
    }
    if (finalAmt > avail) {
      notify.warn(`Nominal melebihi sisa estimasi tersedia (${formatRupiah(avail)}).`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('disbursements.create', {
        month: activeEstimate.month,
        year: activeEstimate.year,
        request_scope: requestScope,
        disbursement_timing: disbursementTiming,
        requested_amount: finalAmt,
        reason,
      });

      const emails = res?.notified_admin_emails || [];
      const emailNotice =
        emails.length > 0
          ? ` Notifikasi aplikasi & email telah dikirim ke Bendahara/Admin (${emails.join(', ')}).`
          : ' Notifikasi pengajuan telah dikirim ke Admin/Bendahara.';

      notify.success(
        `Pengajuan pencairan ${formatRupiah(finalAmt)} berhasil dikirim!${emailNotice}`
      );
      setReason('');
      const refreshed = await loadData({ silent: true });
      emitDataChange(['disbursements', 'notifications'], { source: 'guru_disb_local' });
      onDisbursementChange?.(refreshed?.requests);
    } catch (err) {
      notify.error(err.message || 'Gagal mengirim pengajuan pencairan.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadDisbursementSlip = async (req) => {
    const slipPayload = {
      id: req.issued_slip_id || req.id,
      slip_type: 'disbursement',
      disbursement_request_id: req.id,
      month: req.month,
      year: req.year,
      payroll_status: 'paid',
      net_salary: req.approved_amount,
      approved_amount: req.approved_amount,
      teacher_name: req.teacher_name || teacherProfile?.name,
      nip: req.nip || teacherProfile?.nip,
      bank_account: teacherProfile?.bank_account,
      details_json: req.issued_slip_json || '{}',
    };
    await downloadPayslipPdf(slipPayload);
    notify.success(
      `Slip Gaji Pencairan Resmi (${getMonthName(req.month)} ${req.year}) berhasil diunduh.`
    );
  };

  const available = Number(activeEstimate?.available_amount || 0);
  const canSubmit = !activeEstimate?.is_paid && available > 0 && !submitting;

  return (
    <div className="fluid-container items-start">
      {/* Left Card: Request Form */}
      <div className="fluid-item nim-glass nim-card space-y-4">
        <div
          className="flex flex-wrap items-center justify-between gap-2 pb-3"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <div className="flex items-center gap-2.5">
            <span className="nim-kpi__ico">
              <Banknote className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-[var(--ink)]">
                Ajukan Pencairan Estimasi Gaji
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Pilih pencairan sebagian/seluruh estimasi, baik sebelum waktunya maupun tepat waktu
                secara kolektif.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="nim-btn nim-btn--sm"
            title="Muat Ulang Estimasi"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>
        </div>

        {/* Period Selection & Live Saldo Summary */}
            <div className="grid grid-cols-12 gap-2 sm:gap-2.5">
              <div className="col-span-8 sm:col-span-7">
                <label className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                  Periode Bulan Gaji
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="nim-select text-xs font-semibold"
                >
                  {estimates
                    .filter((e) => !/^\d+$/.test(String(e.month)))
                    .map((e) => (
                      <option key={e.period_key} value={normalizePeriodKey(e.month)}>
                        {getMonthName(e.month)} ({e.year})
                      </option>
                    ))}
                  {MONTHS_ID.map((m) => (
                    <option key={m.value} value={String(m.value)}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
                <div className="col-span-4 sm:col-span-5">
                  <label className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                    Tahun
                  </label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="nim-select text-xs font-semibold"
                  >
                    {[2025, 2026, 2027, 2028].map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Balance Metrics */}
              {(() => {
                const fullEstNet = Number(
                  activeEstimate.full_estimated_net_salary ??
                    activeEstimate.estimated_net_salary ??
                    0
                );
                const alreadyApproved = Number(activeEstimate.already_approved_amount || 0);
                const pendingRequested =
                  activeEstimate.pending_requested_amount !== undefined
                    ? Number(activeEstimate.pending_requested_amount || 0)
                    : Math.max(
                        0,
                        Number(activeEstimate.already_requested_amount || 0) - alreadyApproved
                      );
                return (
                  <div className="nim-card-well p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--muted)]">
                        Estimasi Gaji Bersih Penuh ({getMonthName(activeEstimate.month)}{' '}
                        {activeEstimate.year})
                      </span>
                      <span className="font-bold text-[var(--ink)] tabular-nums">
                        {formatRupiah(fullEstNet)}
                      </span>
                    </div>
                    {alreadyApproved > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--muted)]">Pencairan Disetujui Kepsek</span>
                        <span className="font-semibold text-[var(--bad-text)] tabular-nums">
                          - {formatRupiah(alreadyApproved)}
                        </span>
                      </div>
                    )}
                    {(pendingRequested > 0 || alreadyApproved === 0) && (
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--muted)]">
                          {alreadyApproved > 0
                            ? 'Sedang Diajukan (Menunggu)'
                            : 'Sudah Diajukan / Disetujui'}
                        </span>
                        <span className="font-semibold text-[var(--warn-text)] tabular-nums">
                          -{' '}
                          {formatRupiah(
                            alreadyApproved > 0
                              ? pendingRequested
                              : activeEstimate.already_requested_amount
                          )}
                        </span>
                      </div>
                    )}
                    <div
                      className="flex items-center justify-between pt-2"
                      style={{ borderTop: '1px solid var(--line)' }}
                    >
                      <span className="font-bold text-[var(--ink-2)]">
                        Sisa Estimasi Dapat Diajukan
                      </span>
                      <span className="text-sm font-bold text-[var(--accent-text)] tabular-nums">
                        {formatRupiah(available)}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Cakupan Pencairan */}
                <div>
                  <span className="block text-xs font-bold text-[var(--ink-2)] mb-1.5">
                    1. Jumlah / Cakupan Pencairan
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.values(DISBURSEMENT_SCOPE_META).map((opt) => {
                      const isSelected = requestScope === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setRequestScope(opt.id)}
                          className="rounded-xl p-3 text-left transition-all"
                          style={{
                            background: isSelected ? 'var(--accent-soft)' : 'var(--card-2)',
                            boxShadow: isSelected
                              ? 'inset 0 0 0 1.5px var(--accent)'
                              : 'inset 0 0 0 1px var(--line)',
                          }}
                        >
                          <p
                            className="text-xs font-bold"
                            style={{ color: isSelected ? 'var(--accent-text)' : 'var(--ink)' }}
                          >
                            {opt.label}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[var(--muted)] leading-snug">
                            {opt.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Nominal Input when Partial */}
                {requestScope === 'partial' && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-bold text-[var(--ink-2)]">
                        Nominal Pencairan Sebagian (Rp)
                      </label>
                      {available > 0 && (
                        <div className="flex items-center gap-1">
                          {[0.25, 0.5, 0.75].map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => setRequestedAmount(Math.round(available * pct))}
                              className="nim-btn nim-btn--sm text-[11px]"
                            >
                              {Math.round(pct * 100)}%
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatRibuan(requestedAmount)}
                      onChange={(e) => setRequestedAmount(parseRibuan(e.target.value))}
                      placeholder="Masukkan nominal pengajuan..."
                      className="nim-input font-bold tabular-nums"
                    />
                  </div>
                )}

                {/* Jadwal Pencairan */}
                <div>
                  <span className="block text-xs font-bold text-[var(--ink-2)] mb-1.5">
                    2. Waktu / Jenis Pencairan
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.values(DISBURSEMENT_TIMING_META).map((opt) => {
                      const isSelected = disbursementTiming === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setDisbursementTiming(opt.id)}
                          className="rounded-xl p-3 text-left transition-all"
                          style={{
                            background: isSelected ? 'var(--accent-soft)' : 'var(--card-2)',
                            boxShadow: isSelected
                              ? 'inset 0 0 0 1.5px var(--accent)'
                              : 'inset 0 0 0 1px var(--line)',
                          }}
                        >
                          <p
                            className="text-xs font-bold"
                            style={{ color: isSelected ? 'var(--accent-text)' : 'var(--ink)' }}
                          >
                            {opt.label}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[var(--muted)] leading-snug">
                            {opt.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Alasan / Keperluan */}
                <div>
                  <label className="block text-xs font-bold text-[var(--ink-2)] mb-1">
                    3. Catatan / Keperluan Pengajuan (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    maxLength={240}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Misal: Keperluan mendesak sebelum gajian, atau ikut jadwal pencairan kolektif..."
                    className="nim-input !min-h-[64px] text-xs"
                  />
                </div>

                <div
                  className="flex items-start gap-2 rounded-xl p-2.5 text-[11px] text-[var(--ink-2)]"
                  style={{ background: 'var(--card-2)', borderLeft: '3px solid var(--accent-text)' }}
                >
                  <Info className="h-3.5 w-3.5 mt-0.5 text-[var(--accent-text)] shrink-0" />
                  <span>
                    Pengajuan akan mengirimkan notifikasi aplikasi &amp; email ke Admin/Bendahara. Setelah
                    disetujui <strong>Bendahara</strong> dan <strong>Kepala Sekolah</strong>, Slip Gaji
                    Resmi sesuai nominal pencairan akan otomatis terbit.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="nim-btn nim-btn--primary w-full"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Mengirim Pengajuan &amp; Notifikasi...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span>
                        Ajukan Pencairan ({formatRupiah(requestScope === 'full' ? available : requestedAmount)})
                      </span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Right Card: Request History & Issued Slips */}
            <div className="fluid-item nim-glass nim-card space-y-4">
              <div
                className="flex items-center justify-between gap-2 pb-3"
                style={{ borderBottom: '1px solid var(--line)' }}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="nim-kpi__ico"
                    style={{ background: 'var(--good-soft)', color: 'var(--good-text)' }}
                  >
                    <Clock className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-[var(--ink)]">
                      Riwayat Pengajuan Pencairan
                    </h2>
                    <p className="text-xs text-[var(--muted)]">
                      Pantau persetujuan Bendahara &amp; Kepsek serta unduh slip yang sudah terbit.
                    </p>
                  </div>
                </div>
                <span className="nim-badge nim-badge--accent">{requests.length} Pengajuan</span>
              </div>

              {requests.length === 0 ? (
                <div className="nim-card-well p-6 text-center text-xs text-[var(--muted)]">
                  Belum ada pengajuan pencairan gaji yang diajukan.
                </div>
              ) : (
                <div className="space-y-3 max-h-[650px] overflow-y-auto pr-0.5">
                  {requests.map((req) => {
                    const stMeta = getDisbursementStatusMeta(req.status);
                    const scopeMeta = getDisbursementScopeMeta(req.request_scope);
                    const timingMeta = getDisbursementTimingMeta(req.disbursement_timing);

                    return (
                      <div key={req.id} className="nim-card-well p-3.5 space-y-2.5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-[var(--accent-text)]" />
                              <span className="text-xs font-bold text-[var(--ink)]">
                                {getMonthName(req.month)} {req.year}
                              </span>
                              <span className="nim-badge !text-[10px]">{scopeMeta.shortLabel}</span>
                              <span className="nim-badge !text-[10px]">{timingMeta.shortLabel}</span>
                            </div>
                            <p className="mt-1 text-[10.5px] text-[var(--muted)]">
                              Diajukan: {formatIsoDateTimeIndo(req.created_at)}
                            </p>
                          </div>
                          <span className={stMeta.cls}>{stMeta.shortLabel}</span>
                        </div>

                        <div
                          className="grid grid-cols-2 gap-1.5 pt-2 text-xs"
                          style={{ borderTop: '1px solid var(--line)' }}
                        >
                          <div>
                            <span className="text-[11px] text-[var(--muted)] block">
                              Nominal Diajukan
                            </span>
                            <span className="font-bold text-[var(--ink)] tabular-nums">
                              {formatRupiah(req.requested_amount)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[11px] text-[var(--muted)] block">
                              {req.status === 'approved' ? 'Disetujui & Cair' : 'Estimasi Penuh'}
                            </span>
                            <span
                              className="font-bold tabular-nums"
                              style={{
                                color:
                                  req.status === 'approved' ? 'var(--good-text)' : 'var(--accent-text)',
                              }}
                            >
                              {formatRupiah(
                                req.status === 'approved'
                                  ? req.approved_amount
                                  : req.estimated_net_salary
                              )}
                            </span>
                          </div>
                        </div>

                        {req.reason && (
                          <p className="text-[11px] text-[var(--ink-2)]">
                            <strong>Alasan PTK:</strong> {req.reason}
                          </p>
                        )}
                        {req.treasurer_note && (
                          <p className="text-[11px] text-[var(--ink-2)]">
                            <strong>Catatan Bendahara:</strong> {req.treasurer_note}
                          </p>
                        )}
                        {req.kepsek_note && (
                          <p className="text-[11px] text-[var(--ink-2)]">
                            <strong>Catatan Kepsek:</strong> {req.kepsek_note}
                          </p>
                        )}

                        {/* Approval Stepper Mini Status */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5">
                          <div className="flex items-center gap-2 text-[10.5px]">
                            <span className="inline-flex items-center gap-1 text-[var(--good-text)] font-semibold">
                              <MailCheck className="h-3 w-3" /> Email Bendahara Terkirim
                            </span>
                            {req.status === 'approved_treasurer' && (
                              <span className="inline-flex items-center gap-1 text-[var(--accent-text)] font-semibold">
                                • Bendahara OK
                              </span>
                            )}
                            {req.status === 'approved' && (
                              <span className="inline-flex items-center gap-1 text-[var(--good-text)] font-semibold">
                                <CheckCircle2 className="h-3 w-3" /> Bendahara &amp; Kepsek OK
                              </span>
                            )}
                            {req.status === 'rejected' && (
                              <span className="inline-flex items-center gap-1 text-[var(--bad-text)] font-semibold">
                                <XCircle className="h-3 w-3" /> Ditolak
                              </span>
                            )}
                          </div>

                          {req.status === 'approved' && (
                            <button
                              type="button"
                              onClick={() => handleDownloadDisbursementSlip(req)}
                              className="nim-btn nim-btn--good nim-btn--sm"
                            >
                              <FileDown className="h-3.5 w-3.5" />
                              <span>Unduh Slip Pencairan PDF</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          );
}

          export default DisbursementRequestSection;
