import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  RotateCcw,
  Eye,
  ShieldAlert,
  Wallet,
  Users,
  Clock,
  X,
} from 'lucide-react';
import api from '../services/gasApi';
import notify from '../utils/notify';
import {
  formatRupiah,
  formatRibuan,
  getStaffCategoryLabel,
  parseCustomComponents,
  getMonthName,
  resolveInfaqZakatAmount,
  resolveStaffCategory,
} from '../utils/formatters';
import ConfirmModal from '../components/ConfirmModal';
import FloatingTabBar from '../components/FloatingTabBar';

const STATUS_META = {
  draft: { label: 'Draf Bendahara', cls: 'nim-badge' },
  submitted: {
    label: 'Menunggu Persetujuan Kepsek',
    cls: 'nim-badge nim-badge--warn',
  },
  approved: {
    label: 'Disetujui Kepsek (Siap Cair)',
    cls: 'nim-badge nim-badge--accent',
  },
  paid: { label: 'Sudah Dicairkan', cls: 'nim-badge nim-badge--good' },
};

export function KepsekDashboard({
  refreshTrigger,
  activeTab: controlledTab,
  onTabChange,
  onBadgesChange,
  onSearchItemsChange,
}) {
  const [internalTab, setInternalTab] = useState('all');
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = onTabChange ?? setInternalTab;

  const [payrolls, setPayrolls] = useState([]);
  const [teachersCount, setTeachersCount] = useState(0);
  const [selectedPayroll, setSelectedPayroll] = useState(null);
  const [details, setDetails] = useState([]);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    variant: 'primary',
    onConfirm: null,
  });

  const loadData = useCallback(async () => {
    try {
      const [payrollList, summary] = await Promise.all([
        api.get('payrolls.list'),
        api.get('dashboard.summary'),
      ]);
      setPayrolls(payrollList || []);
      setTeachersCount(summary?.totalTeachers || 0);
    } catch (err) {
      notify.error(err.message || 'Gagal memuat dasbor Kepala Sekolah.');
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTrigger]);

  const handleInspect = useCallback(async (pr) => {
    try {
      setSelectedPayroll(pr);
      const rows = await api.get('payrollDetails.byPayroll', { payroll_id: pr.id });
      setDetails(rows || []);
    } catch (err) {
      notify.error(err.message || 'Gagal memuat rincian payroll.');
    }
  }, []);

  const pendingList = payrolls.filter((p) => p.status === 'submitted');

  useEffect(() => {
    onBadgesChange?.({ submitted: pendingList.length });
  }, [pendingList.length, onBadgesChange]);

  useEffect(() => {
    if (!onSearchItemsChange) return;
    onSearchItemsChange(
      payrolls.map((pr) => ({
        id: `kepsek-pr:${pr.id}`,
        group: 'Periode Penggajian',
        title: `${getMonthName(pr.month)} ${pr.year}`,
        sub: `${STATUS_META[pr.status]?.label || pr.status} • ${formatRupiah(pr.total_budget)}`,
        icon: Wallet,
        run: () => handleInspect(pr),
      }))
    );
  }, [payrolls, onSearchItemsChange, handleInspect]);

  const triggerApproval = (pr, nextStatus) => {
    const isApprove = nextStatus === 'approved';
    setConfirmModal({
      isOpen: true,
      title: isApprove ? 'Setujui Penggajian Bulanan' : 'Kembalikan ke Draf (Revisi)',
      message: isApprove
        ? `Setujui pencairan anggaran gaji ${getMonthName(pr.month)} ${pr.year} sebesar ${formatRupiah(
            pr.total_budget
          )}?`
        : `Kembalikan pengajuan gaji ${getMonthName(pr.month)} ${pr.year} ke Admin/Bendahara untuk direvisi?`,
      variant: isApprove ? 'emerald' : 'danger',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        try {
          const updated = await api.put('payrolls.updateStatus', {
            id: pr.id,
            status: nextStatus,
          });
          notify.success(
            isApprove
              ? `Penggajian ${getMonthName(pr.month)} ${pr.year} resmi DISETUJUI!`
              : 'Penggajian dikembalikan ke status Draft.'
          );
          if (selectedPayroll?.id === pr.id) {
            setSelectedPayroll(updated);
          }
          loadData();
        } catch (err) {
          notify.error(err.message || 'Gagal memproses otorisasi.');
        }
      },
    });
  };

  const filteredPayrolls = payrolls.filter((p) => {
    if (activeTab === 'submitted') return p.status === 'submitted';
    if (activeTab === 'approved') return p.status === 'approved' || p.status === 'paid';
    return true;
  });

  return (
    <main className="space-y-6">
      {/* Page Header */}
      <div className="nim-phead">
        <div>
          <span className="nim-eyebrow">Otorisasi Anggaran Yayasan</span>
          <h1>Dasbor Kepala Sekolah</h1>
          <p>Periksa rincian perhitungan gaji pendidik sebelum menyetujui pencairan.</p>
        </div>
      </div>

      {/* KPI Cards (Single Row on Mobile & Desktop) */}
      <section className="flex flex-nowrap items-stretch gap-2 sm:gap-4 w-full">
        <div
          className="flex-1 basis-0 nim-glass nim-kpi"
          style={{
            boxShadow:
              'inset 0 0 0 1px var(--warn-line), inset 0 1px 0 var(--glass-top), var(--shadow)',
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="nim-kpi__label text-[var(--warn-text)]">
              Menunggu Persetujuan
            </span>
            <span
              className="nim-kpi__ico !w-7 !h-7 sm:!w-9 sm:!h-9"
              style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)' }}
            >
              <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </div>
          <p className="nim-kpi__value mt-2 text-[var(--warn-text)] truncate">
            {formatRibuan(pendingList.length)} Periode
          </p>
          <p className="nim-kpi__sub mt-1 truncate">Memerlukan otorisasi Kepala Sekolah</p>
        </div>

        <div className="flex-1 basis-0 nim-glass nim-kpi">
          <div className="flex items-start justify-between gap-2">
            <span className="nim-kpi__label">Total Pendidik &amp; Staf</span>
            <span className="nim-kpi__ico !w-7 !h-7 sm:!w-9 sm:!h-9">
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </div>
          <p className="nim-kpi__value mt-2 truncate">{formatRibuan(teachersCount)} Orang</p>
          <p className="nim-kpi__sub mt-1 truncate">Pendidik &amp; Tenaga Kependidikan</p>
        </div>

        <div className="flex-1 basis-0 nim-glass nim-kpi">
          <div className="flex items-start justify-between gap-2">
            <span className="nim-kpi__label">Total Periode Tercatat</span>
            <span
              className="nim-kpi__ico !w-7 !h-7 sm:!w-9 sm:!h-9"
              style={{ background: 'var(--good-soft)', color: 'var(--good-text)' }}
            >
              <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </div>
          <p className="nim-kpi__value mt-2 truncate">{formatRibuan(payrolls.length)} Bulan</p>
          <p className="nim-kpi__sub mt-1 truncate">Riwayat anggaran penggajian yayasan</p>
        </div>
      </section>

      {/* Pending Approvals Highlight */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="nim-kpi__ico"
              style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)' }}
            >
              <ShieldAlert className="h-4 w-4" />
            </span>
            <h2 className="text-base sm:text-lg font-bold text-[var(--ink)]">
              Otorisasi Pengajuan Gaji
            </h2>
          </div>

          {/* Filter Tab Switcher (Desktop) */}
          <div
            role="tablist"
            aria-label="Filter Status Otorisasi"
            className="hidden min-[761px]:flex items-center gap-1 rounded-xl p-1"
            style={{
              background: 'var(--card-2)',
              boxShadow: 'inset 0 0 0 1px var(--line)',
            }}
          >
            {[
              { id: 'all', label: 'Semua Periode', icon: Wallet },
              { id: 'submitted', label: 'Perlu Otorisasi', icon: Clock, badge: pendingList.length },
              { id: 'approved', label: 'Telah Disetujui', icon: CheckCircle2 },
            ].map((tabItem) => {
              const TabIcon = tabItem.icon;
              const isTabActive = activeTab === tabItem.id;
              return (
                <button
                  key={tabItem.id}
                  type="button"
                  role="tab"
                  aria-selected={isTabActive}
                  onClick={() => setActiveTab(tabItem.id)}
                  className="relative flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-200 select-none"
                  style={{ color: isTabActive ? 'var(--accent-ink)' : 'var(--muted)' }}
                >
                  {isTabActive && (
                    <motion.span
                      layoutId="kepsek-desktop-tab-pill"
                      transition={{ type: 'spring', stiffness: 361, damping: 24 }}
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: 'linear-gradient(135deg, var(--accent-from), var(--accent-to))',
                        boxShadow: '0 6px 14px -6px var(--accent-glow)',
                      }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <TabIcon className="h-3.5 w-3.5" />
                    <span>{tabItem.label}</span>
                    {tabItem.badge > 0 && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                        style={{
                          background: isTabActive ? 'rgba(255,255,255,0.22)' : 'var(--warn-soft)',
                          color: isTabActive ? '#ffffff' : 'var(--warn-text)',
                        }}
                      >
                        {tabItem.badge}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fluid-container"
          >
            {filteredPayrolls.map((pr) => {
              const meta = STATUS_META[pr.status] || STATUS_META.draft;
              return (
                <div
                  key={pr.id}
                  className="fluid-item nim-glass nim-card flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-bold text-[var(--ink)]">
                        {getMonthName(pr.month)} {pr.year}
                      </h3>
                      <span className={meta.cls}>{meta.label}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">Total pengajuan anggaran gaji</p>
                    <p className="mt-3 text-xl sm:text-2xl font-bold text-[var(--ink)] tabular-nums">
                      {formatRupiah(pr.total_budget)}
                    </p>
                  </div>

                  <div
                    className="flex flex-wrap items-center gap-1.5 pt-3"
                    style={{ borderTop: '1px solid var(--line)' }}
                  >
                    <button
                      type="button"
                      onClick={() => handleInspect(pr)}
                      className="nim-btn flex-1"
                    >
                      <Eye className="h-3.5 w-3.5 text-[var(--accent-text)]" />
                      <span>Periksa Rincian</span>
                    </button>

                    {pr.status === 'submitted' && (
                      <>
                        <button
                          type="button"
                          onClick={() => triggerApproval(pr, 'draft')}
                          className="nim-btn nim-btn--danger"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Revisi</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => triggerApproval(pr, 'approved')}
                          className="nim-btn nim-btn--good flex-1"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Setujui</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </section>

      {/* Breakdown Inspector */}
      {selectedPayroll && (
        <section className="nim-glass nim-card space-y-4">
          <div
            className="flex items-center justify-between pb-3"
            style={{ borderBottom: '1px solid var(--line)' }}
          >
            <div>
              <h3 className="text-base font-bold text-[var(--ink)]">
                Audit Rincian Gaji PTK — {getMonthName(selectedPayroll.month)}{' '}
                {selectedPayroll.year}
              </h3>
              <p className="text-xs text-[var(--muted)]">
                Total Anggaran:{' '}
                <strong className="text-[var(--ink)]">
                  {formatRupiah(selectedPayroll.total_budget)}
                </strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPayroll(null)}
              aria-label="Tutup audit rincian"
              className="nim-ibtn"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="fluid-container">
            {details.map((row) => {
              let d = {};
              try {
                d = JSON.parse(row.details_json || '{}');
              } catch {
                d = {};
              }
              return (
                <div key={row.id} className="fluid-item nim-card-well p-4 space-y-2.5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span
                          className={`nim-badge !text-[10px] ${
                            resolveStaffCategory(d) === 'kependidikan'
                              ? 'nim-badge--warn'
                              : 'nim-badge--good'
                          }`}
                        >
                          {getStaffCategoryLabel(d)}
                        </span>
                      </div>
                      <p className="font-bold text-[var(--ink)]">{d.teacher_name}</p>
                      <p className="text-xs text-[var(--muted)]">
                        NIP: {d.nip} • Hadir: {d.present_days} hr | JTM: {d.total_jtm} jam
                      </p>
                    </div>
                  </div>
                  <div
                    className="grid grid-cols-2 gap-1.5 text-xs text-[var(--muted)] pt-2"
                    style={{ borderTop: '1px solid var(--line)' }}
                  >
                    <span>Gaji Pokok:</span>
                    <span className="text-right font-semibold text-[var(--ink)] tabular-nums">
                      {formatRupiah(d.base_salary)}
                    </span>
                    <span>Honor JTM:</span>
                    <span className="text-right font-semibold text-[var(--ink)] tabular-nums">
                      {formatRupiah(d.jtm_honor)}
                    </span>
                    <span>Tunjangan:</span>
                    <span className="text-right font-semibold text-[var(--ink)] tabular-nums">
                      {formatRupiah(d.position_allowance)}
                    </span>
                    {parseCustomComponents(d.custom_components).map((cust) => (
                      <React.Fragment key={cust.id}>
                        <span>{cust.type === 'allowance' ? `+ ${cust.label}:` : `- ${cust.label}:`}</span>
                        <span
                          className="text-right font-semibold tabular-nums"
                          style={{
                            color:
                              cust.type === 'allowance'
                                ? 'var(--good-text)'
                                : 'var(--bad-text)',
                          }}
                        >
                          {cust.type === 'allowance'
                            ? `+ ${formatRupiah(cust.amount)}`
                            : `- ${formatRupiah(cust.amount)}`}
                        </span>
                      </React.Fragment>
                    ))}
                    {(() => {
                      const infaqZakat = resolveInfaqZakatAmount(d);
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
                    <span className="text-xs font-bold text-[var(--ink-2)]">Take Home Pay:</span>
                    <span className="text-base font-bold text-[var(--accent-text)] tabular-nums">
                      {formatRupiah(row.net_salary)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Mobile Floating Tab Bar */}
      <FloatingTabBar
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'all', label: 'Semua Periode', icon: Wallet },
          { id: 'submitted', label: 'Perlu Otorisasi', icon: Clock, badge: pendingList.length },
          { id: 'approved', label: 'Telah Disetujui', icon: CheckCircle2 },
        ]}
      />
    </main>
  );
}

export default KepsekDashboard;
