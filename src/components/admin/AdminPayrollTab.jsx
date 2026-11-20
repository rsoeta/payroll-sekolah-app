import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Eye,
  FileDown,
  RefreshCw,
  Search,
  Send,
  X,
} from 'lucide-react';
import {
  formatRibuan,
  formatRupiah,
  getMonthName,
  parseCustomComponents,
  resolveInfaqZakatAmount,
  resolveStaffCategory,
} from '../../utils/formatters';
import {
  downloadBatchPayslipsPdf,
  downloadPayslipPdf,
} from '../../utils/pdfSlipLoader';
import notify from '../../utils/notify';
import PaginationBar from './PaginationBar';

const DETAIL_GROUPS_META = [
  {
    id: 'pendidik',
    titlePrefix: 'Rincian Slip Gaji Tenaga Pendidik (Guru)',
    subtitle: 'Tenaga Pendidik (Guru Mata Pelajaran, Wali Kelas, Pengajar)',
    emptyText: 'Belum ada data Tenaga Pendidik yang sesuai pada periode penggajian ini.',
    showCloseButton: true,
  },
  {
    id: 'kependidikan',
    titlePrefix: 'Rincian Slip Gaji Tenaga Kependidikan',
    subtitle:
      'Staf TU, Pustakawan, Laboran & Teknisi Sumber Belajar, Penguji, Petugas Keamanan, Tenaga Kebersihan',
    emptyText:
      'Belum ada pegawai berstatus Tenaga Kependidikan yang sesuai. Atur kategori pada menu Master PTK & Gaji.',
    showCloseButton: false,
  },
];

const DetailGroupCard = React.memo(function DetailGroupCard({
  grpMeta,
  items,
  selectedPayroll,
  searchActive,
  onCloseSelectedPayroll,
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  useEffect(() => {
    setPage(1);
  }, [selectedPayroll?.id, searchActive, items.length]);

  const groupBudget = useMemo(
    () => items.reduce((acc, x) => acc + Number(x.detail.net_salary || 0), 0),
    [items]
  );

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  return (
    <div className="nim-glass nim-card space-y-4">
      <div
        className="flex flex-wrap items-center justify-between gap-2 pb-3"
        style={{ borderBottom: '1px solid var(--line)' }}
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-bold text-[var(--ink)]">
              {grpMeta.titlePrefix} — {getMonthName(selectedPayroll.month)} {selectedPayroll.year}
            </h4>
            <span
              className={`nim-badge ${
                grpMeta.id === 'kependidikan' ? 'nim-badge--warn' : 'nim-badge--accent'
              }`}
            >
              {formatRibuan(items.length)} Orang
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {grpMeta.subtitle} • Subtotal:{' '}
            <strong className="text-[var(--ink)] tabular-nums">{formatRupiah(groupBudget)}</strong>{' '}
            (Total Anggaran Keseluruhan:{' '}
            <strong className="text-[var(--ink)] tabular-nums">
              {formatRupiah(selectedPayroll.total_budget)}
            </strong>
            )
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {items.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                await downloadBatchPayslipsPdf(
                  items.map(({ detail }) => ({
                    ...detail,
                    month: selectedPayroll.month,
                    year: selectedPayroll.year,
                    payroll_status: selectedPayroll.status,
                  })),
                  `${grpMeta.id}_${getMonthName(selectedPayroll.month)}_${selectedPayroll.year}`
                );
                notify.success(
                  `Mengunduh ${items.length} slip PDF (${grpMeta.titlePrefix}, 2 slip per halaman A4).`
                );
              }}
              className="nim-btn nim-btn--primary nim-btn--sm"
            >
              <FileDown className="h-3.5 w-3.5" />
              <span>Cetak Semua (2/Hal A4)</span>
            </button>
          )}
          {grpMeta.showCloseButton && (
            <button
              type="button"
              onClick={onCloseSelectedPayroll}
              aria-label="Tutup rincian"
              className="nim-ibtn"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div
          className="nim-card-well p-4 text-center text-xs text-[var(--muted)]"
          style={{ border: '1px dashed var(--line-2)' }}
        >
          {grpMeta.emptyText}
        </div>
      ) : (
        <>
          <div className="fluid-container">
            {pagedItems.map(({ detail, parsed }) => (
              <div key={detail.id} className="fluid-item nim-card-well p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-[var(--ink)]">{parsed.teacher_name}</p>
                    <p className="text-xs text-[var(--muted)]">
                      NIP: {parsed.nip} • {parsed.status} • {parsed.bank_account}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadPayslipPdf(detail)}
                    className="nim-btn nim-btn--sm shrink-0"
                    style={{
                      background: 'var(--accent-soft)',
                      color: 'var(--accent-text)',
                    }}
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    <span>PDF</span>
                  </button>
                </div>

                <div
                  className="grid grid-cols-2 gap-1.5 text-xs text-[var(--muted)] pt-2"
                  style={{ borderTop: '1px solid var(--line)' }}
                >
                  <span>Gaji Pokok:</span>
                  <span className="text-right font-semibold text-[var(--ink)] tabular-nums">
                    {formatRupiah(parsed.base_salary)}
                  </span>
                  <span>
                    Honor JTM ({parsed.total_jtm} × {formatRupiah(parsed.hourly_rate)}):
                  </span>
                  <span className="text-right font-semibold text-[var(--ink)] tabular-nums">
                    {formatRupiah(parsed.jtm_honor)}
                  </span>
                  <span>Tunjangan Jabatan:</span>
                  <span className="text-right font-semibold text-[var(--ink)] tabular-nums">
                    {formatRupiah(parsed.position_allowance)}
                  </span>
                  {parseCustomComponents(parsed.custom_components).map((cust) => (
                    <React.Fragment key={cust.id}>
                      <span>
                        {cust.type === 'allowance' ? `+ ${cust.label}:` : `- ${cust.label}:`}
                      </span>
                      <span
                        className="text-right font-semibold tabular-nums"
                        style={{
                          color:
                            cust.type === 'allowance' ? 'var(--good-text)' : 'var(--bad-text)',
                        }}
                      >
                        {cust.type === 'allowance'
                          ? `+ ${formatRupiah(cust.amount)}`
                          : `- ${formatRupiah(cust.amount)}`}
                      </span>
                    </React.Fragment>
                  ))}
                  {(() => {
                    const infaqZakat = resolveInfaqZakatAmount(parsed);
                    return (
                      <>
                        <span>Infaq / Zakat Profesi (2,5%):</span>
                        <span
                          className="text-right font-semibold tabular-nums"
                          style={{
                            color: infaqZakat > 0 ? 'var(--bad-text)' : 'var(--muted)',
                          }}
                        >
                          {infaqZakat > 0
                            ? `- ${formatRupiah(infaqZakat)}`
                            : 'Tidak Aktif (Rp 0)'}
                        </span>
                      </>
                    );
                  })()}
                </div>

                <div
                  className="flex items-center justify-between pt-2"
                  style={{ borderTop: '1px solid var(--line)' }}
                >
                  <span className="text-xs font-bold uppercase text-[var(--ink-2)]">
                    Gaji Bersih (Net):
                  </span>
                  <span className="text-base font-bold text-[var(--accent-text)] tabular-nums">
                    {formatRupiah(detail.net_salary)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <PaginationBar
            page={safePage}
            pageSize={pageSize}
            totalItems={items.length}
            onPageChange={setPage}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setPage(1);
            }}
            itemLabel="slip PTK"
          />
        </>
      )}
    </div>
  );
});

export const AdminPayrollTab = React.memo(function AdminPayrollTab({
  selectedMonth,
  selectedYear,
  currentPeriodPayroll,
  payrolls,
  selectedPayroll,
  payrollDetails,
  teachers,
  loading,
  statusBadgeMap,
  onGenerateDraft,
  onRequestStatusChange,
  onInspectPayroll,
  onCloseSelectedPayroll,
}) {
  const [periodSearch, setPeriodSearch] = useState('');
  const [periodStatusFilter, setPeriodStatusFilter] = useState('all');
  const [periodYearFilter, setPeriodYearFilter] = useState('all');
  const [periodPage, setPeriodPage] = useState(1);
  const [periodPageSize, setPeriodPageSize] = useState(12);

  const [detailSearch, setDetailSearch] = useState('');

  useEffect(() => {
    setPeriodPage(1);
  }, [periodSearch, periodStatusFilter, periodYearFilter]);

  useEffect(() => {
    setDetailSearch('');
  }, [selectedPayroll?.id]);

  const yearOptions = useMemo(() => {
    const yrs = Array.from(new Set(payrolls.map((p) => Number(p.year)).filter(Boolean)));
    return yrs.sort((a, b) => b - a);
  }, [payrolls]);

  const filteredPayrolls = useMemo(() => {
    const q = periodSearch.trim().toLowerCase();
    return payrolls.filter((pr) => {
      if (periodStatusFilter !== 'all' && pr.status !== periodStatusFilter) return false;
      if (periodYearFilter !== 'all' && Number(pr.year) !== Number(periodYearFilter)) return false;
      if (!q) return true;
      const label = `${getMonthName(pr.month)} ${pr.year}`.toLowerCase();
      return label.includes(q);
    });
  }, [payrolls, periodSearch, periodStatusFilter, periodYearFilter]);

  const totalPeriodPages = Math.max(1, Math.ceil(filteredPayrolls.length / periodPageSize));
  const safePeriodPage = Math.min(periodPage, totalPeriodPages);
  const pagedPayrolls = useMemo(() => {
    const start = (safePeriodPage - 1) * periodPageSize;
    return filteredPayrolls.slice(start, start + periodPageSize);
  }, [filteredPayrolls, safePeriodPage, periodPageSize]);

  const teacherMap = useMemo(() => {
    const map = new Map();
    teachers.forEach((t) => map.set(t.id, t));
    return map;
  }, [teachers]);

  const groupedDetails = useMemo(() => {
    if (!selectedPayroll) return { pendidik: [], kependidikan: [] };
    const q = detailSearch.trim().toLowerCase();
    const pendidik = [];
    const kependidikan = [];

    payrollDetails.forEach((detail) => {
      let parsed = {};
      try {
        parsed = JSON.parse(detail.details_json || '{}');
      } catch {
        parsed = {};
      }
      const linkedTeacher = teacherMap.get(detail.teacher_id);
      const staffCategory = resolveStaffCategory({
        staff_category: parsed.staff_category || linkedTeacher?.staff_category,
        status: parsed.status || linkedTeacher?.status,
      });

      if (q) {
        const hay = `${parsed.teacher_name || ''} ${parsed.nip || ''} ${parsed.status || ''} ${
          parsed.bank_account || ''
        }`.toLowerCase();
        if (!hay.includes(q)) return;
      }

      const item = { detail, parsed, staffCategory };
      if (staffCategory === 'kependidikan') {
        kependidikan.push(item);
      } else {
        pendidik.push(item);
      }
    });

    return { pendidik, kependidikan };
  }, [selectedPayroll, payrollDetails, teacherMap, detailSearch]);

  return (
    <section className="space-y-6">
      {/* Action Banner */}
      <div
        className="nim-glass nim-card"
        style={{
          background:
            'radial-gradient(circle at top right, var(--accent-soft), transparent 55%), linear-gradient(160deg, var(--glass-hi), transparent 46%), var(--card)',
        }}
      >
        <div className="fluid-container items-center justify-between">
          <div className="fluid-item">
            <h2 className="text-base sm:text-lg font-bold text-[var(--ink)]">
              Kalkulasi Penggajian: {getMonthName(selectedMonth)} {selectedYear}
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-[var(--muted)]">
              Formula Otomatis:{' '}
              <code
                className="rounded-lg px-2 py-0.5 font-semibold text-[var(--accent-text)]"
                style={{
                  background: 'var(--card-2)',
                  boxShadow: 'inset 0 0 0 1px var(--line-2)',
                }}
              >
                Gaji Pokok + (JTM × Tarif) + Tunjangan Jabatan + Tunj (+) − Infaq / Zakat Profesi
                2,5% (opsional)
              </code>
              <span className="mt-1 block text-[11px] text-[var(--muted)]">
                Infaq / Zakat Profesi = 2,5% × [Gaji Pokok + (JTM × Tarif) + Tunjangan Jabatan +
                Tunjangan Custom (Tunj +)], otomatis dipotong saat kalkulasi bagi PTK yang
                mengaktifkan opsi.
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(!currentPeriodPayroll || currentPeriodPayroll.status === 'draft') && (
              <button
                type="button"
                onClick={() => onGenerateDraft()}
                disabled={loading}
                className={`nim-btn ${
                  currentPeriodPayroll?.needs_resync ? 'nim-btn--warn' : 'nim-btn--primary'
                }`}
              >
                {currentPeriodPayroll?.needs_resync ? (
                  <RefreshCw className="h-3.5 w-3.5" />
                ) : (
                  <Calculator className="h-3.5 w-3.5" />
                )}
                <span>
                  {currentPeriodPayroll?.needs_resync
                    ? 'Sinkronkan Draf Sekarang'
                    : currentPeriodPayroll
                    ? 'Kalkulasi Ulang Draf'
                    : 'Generate Draf Penggajian'}
                </span>
              </button>
            )}

            {currentPeriodPayroll && currentPeriodPayroll.status === 'draft' && (
              <button
                type="button"
                onClick={() =>
                  onRequestStatusChange(
                    currentPeriodPayroll,
                    'submitted',
                    'Ajukan Penggajian ke Kepala Sekolah',
                    `Ajukan draf gaji periode ${getMonthName(
                      selectedMonth
                    )} ${selectedYear} sebesar ${formatRupiah(
                      currentPeriodPayroll.total_budget
                    )} kepada Kepala Sekolah?`,
                    'primary'
                  )
                }
                className="nim-btn nim-btn--warn"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Ajukan ke Kepsek</span>
              </button>
            )}

            {currentPeriodPayroll && currentPeriodPayroll.status === 'approved' && (
              <button
                type="button"
                onClick={() =>
                  onRequestStatusChange(
                    currentPeriodPayroll,
                    'paid',
                    'Konfirmasi Pencairan Gaji',
                    `Tandai penggajian ${getMonthName(
                      selectedMonth
                    )} ${selectedYear} sebagai SUDAH DIBAYARKAN? Slip gaji digital akan diterbitkan ke dasbor masing-masing guru.`,
                    'emerald'
                  )
                }
                className="nim-btn nim-btn--good"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Tandai Sudah Dibayar</span>
              </button>
            )}
          </div>
        </div>

        {currentPeriodPayroll?.status === 'draft' && currentPeriodPayroll?.needs_resync && (
          <div
            className="mt-3.5 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5"
            style={{
              background: 'var(--warn-soft)',
              boxShadow: 'inset 0 0 0 1px var(--warn-line)',
            }}
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle
                className="h-4 w-4 shrink-0 mt-0.5"
                style={{ color: 'var(--warn-text)' }}
              />
              <div>
                <p className="text-xs font-bold" style={{ color: 'var(--warn-text)' }}>
                  Draf perlu disinkronkan — terdapat perubahan data terbaru
                </p>
                <p className="text-[11px] text-[var(--ink-2)] mt-0.5">
                  {(currentPeriodPayroll.resync_reasons || []).join(' • ')}. Angka draf tetap
                  dipertahankan sampai Anda menekan tombol Sinkronkan Draf.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onGenerateDraft()}
              disabled={loading}
              className="nim-btn nim-btn--warn nim-btn--sm"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Sinkronkan Draf</span>
            </button>
          </div>
        )}
      </div>

      {/* Payroll Periods List with Search, Status/Year Filter & Pagination */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-[var(--ink)]">
            Daftar Periode Penggajian ({formatRibuan(payrolls.length)})
          </h3>

          {payrolls.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={periodSearch}
                  onChange={(e) => setPeriodSearch(e.target.value)}
                  placeholder="Cari bulan / tahun..."
                  className="nim-input !min-h-[32px] !py-1 !pl-8 text-xs w-44 sm:w-52"
                />
              </div>

              {yearOptions.length > 1 && (
                <select
                  aria-label="Filter Tahun Penggajian"
                  value={periodYearFilter}
                  onChange={(e) => setPeriodYearFilter(e.target.value)}
                  className="nim-select !w-auto !min-h-[32px] !py-1 text-xs font-semibold"
                >
                  <option value="all">Semua Tahun</option>
                  {yearOptions.map((yr) => (
                    <option key={yr} value={String(yr)}>
                      {yr}
                    </option>
                  ))}
                </select>
              )}

              <select
                aria-label="Filter Status Penggajian"
                value={periodStatusFilter}
                onChange={(e) => setPeriodStatusFilter(e.target.value)}
                className="nim-select !w-auto !min-h-[32px] !py-1 text-xs font-semibold"
              >
                <option value="all">Semua Status</option>
                <option value="draft">Draf</option>
                <option value="submitted">Menunggu Persetujuan</option>
                <option value="approved">Disetujui Kepsek</option>
                <option value="paid">Sudah Dibayarkan</option>
              </select>
            </div>
          )}
        </div>

        {filteredPayrolls.length === 0 ? (
          <div className="nim-glass nim-card p-6 text-center text-xs text-[var(--muted)]">
            {payrolls.length === 0
              ? 'Belum ada periode penggajian tercatat. Pilih periode di atas lalu klik "Generate Draf Penggajian".'
              : 'Tidak ada periode penggajian yang cocok dengan filter pencarian.'}
          </div>
        ) : (
          <>
            <div className="fluid-container">
              {pagedPayrolls.map((pr) => {
                const badge = statusBadgeMap[pr.status] || statusBadgeMap.draft;
                const isDraftOutOfSync = pr.status === 'draft' && Boolean(pr.needs_resync);
                return (
                  <div
                    key={pr.id}
                    className="fluid-item nim-glass nim-card flex flex-col justify-between gap-4"
                    style={
                      isDraftOutOfSync
                        ? { boxShadow: 'inset 0 0 0 1px var(--warn-line), var(--shadow)' }
                        : undefined
                    }
                  >
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-base font-bold text-[var(--ink)]">
                          {getMonthName(pr.month)} {pr.year}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isDraftOutOfSync && (
                            <span className="nim-badge nim-badge--warn">
                              <AlertTriangle className="h-3 w-3" />
                              <span>Perlu Sinkronisasi</span>
                            </span>
                          )}
                          <span className={badge.cls}>{badge.label}</span>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {isDraftOutOfSync
                          ? `Perubahan terdeteksi: ${(pr.resync_reasons || []).join(' & ')}`
                          : 'Total anggaran gaji periode berjalan'}
                      </p>
                      <p className="mt-3 text-xl sm:text-2xl font-bold text-[var(--ink)] tabular-nums">
                        {formatRupiah(pr.total_budget)}
                      </p>
                    </div>

                    <div
                      className="flex flex-wrap items-center justify-end gap-2 pt-3"
                      style={{ borderTop: '1px solid var(--line)' }}
                    >
                      <button
                        type="button"
                        onClick={() => onInspectPayroll(pr)}
                        className="nim-btn"
                      >
                        <Eye className="h-3.5 w-3.5 text-[var(--accent-text)]" />
                        <span>Rincian Slip</span>
                      </button>

                      {isDraftOutOfSync && (
                        <button
                          type="button"
                          onClick={() => onGenerateDraft(pr.month, pr.year)}
                          disabled={loading}
                          className="nim-btn nim-btn--primary"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          <span>Sinkronkan Draf</span>
                        </button>
                      )}

                      {pr.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() =>
                            onRequestStatusChange(
                              pr,
                              'submitted',
                              'Ajukan ke Kepala Sekolah',
                              `Ajukan penggajian ${getMonthName(pr.month)} ${pr.year} ke Kepala Sekolah?`
                            )
                          }
                          className="nim-btn nim-btn--warn"
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span>Ajukan ke Kepsek</span>
                        </button>
                      )}

                      {pr.status === 'approved' && (
                        <button
                          type="button"
                          onClick={() =>
                            onRequestStatusChange(
                              pr,
                              'paid',
                              'Konfirmasi Pembayaran',
                              `Tandai periode ${getMonthName(pr.month)} ${pr.year} sebagai SUDAH DIBAYARKAN?`,
                              'emerald'
                            )
                          }
                          className="nim-btn nim-btn--good"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Tandai Dibayar</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <PaginationBar
              page={safePeriodPage}
              pageSize={periodPageSize}
              totalItems={filteredPayrolls.length}
              onPageChange={setPeriodPage}
              onPageSizeChange={(sz) => {
                setPeriodPageSize(sz);
                setPeriodPage(1);
              }}
              itemLabel="periode"
            />
          </>
        )}
      </div>

      {/* Selected Payroll Details Breakdown */}
      {selectedPayroll && (
        <div className="space-y-4">
          {payrollDetails.length > 0 && (
            <div className="nim-glass nim-card !py-2.5 !px-3.5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[var(--ink-2)]">
                Filter Rincian Slip: {getMonthName(selectedPayroll.month)} {selectedPayroll.year} (
                {formatRibuan(payrollDetails.length)} PTK)
              </p>
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={detailSearch}
                  onChange={(e) => setDetailSearch(e.target.value)}
                  placeholder="Cari nama / NIP / bank PTK..."
                  className="nim-input !min-h-[30px] !py-1 !pl-8 text-xs w-56 sm:w-64"
                />
              </div>
            </div>
          )}

          {DETAIL_GROUPS_META.map((grpMeta) => (
            <DetailGroupCard
              key={grpMeta.id}
              grpMeta={grpMeta}
              items={
                grpMeta.id === 'kependidikan'
                  ? groupedDetails.kependidikan
                  : groupedDetails.pendidik
              }
              selectedPayroll={selectedPayroll}
              searchActive={detailSearch}
              onCloseSelectedPayroll={onCloseSelectedPayroll}
            />
          ))}
        </div>
      )}
    </section>
  );
});

export default AdminPayrollTab;
