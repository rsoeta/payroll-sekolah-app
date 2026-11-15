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
import { formatRupiah, formatRibuan, parseCustomComponents, getMonthName } from '../utils/formatters';
import ConfirmModal from '../components/ConfirmModal';
import FloatingTabBar from '../components/FloatingTabBar';

const STATUS_META = {
  draft: { label: 'Draf Bendahara', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
  submitted: {
    label: 'Menunggu Persetujuan Kepsek',
    cls: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  approved: {
    label: 'Disetujui Kepsek (Siap Cair)',
    cls: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  },
  paid: { label: 'Sudah Dicairkan', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
};

export function KepsekDashboard({ refreshTrigger }) {
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'submitted' | 'approved'
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

  const handleInspect = async (pr) => {
    try {
      setSelectedPayroll(pr);
      const rows = await api.get('payrollDetails.byPayroll', { payroll_id: pr.id });
      setDetails(rows || []);
    } catch (err) {
      notify.error(err.message || 'Gagal memuat rincian payroll.');
    }
  };

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

  const pendingList = payrolls.filter((p) => p.status === 'submitted');
  const filteredPayrolls = payrolls.filter((p) => {
    if (activeTab === 'submitted') return p.status === 'submitted';
    if (activeTab === 'approved') return p.status === 'approved' || p.status === 'paid';
    return true;
  });

  return (
    <main className="app-shell py-6 space-y-6">
      {/* KPI Cards (Single Row on Mobile & Desktop) */}
      <section className="flex flex-nowrap items-stretch gap-2 sm:gap-4 w-full">
        <div className="flex-1 basis-0 min-w-0 rounded-xl sm:rounded-2xl border border-amber-200 bg-amber-50/70 p-2.5 sm:p-5 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-1">
            <span className="text-[9px] sm:text-xs font-bold uppercase tracking-tight sm:tracking-wider text-amber-800 leading-tight">
              Menunggu Persetujuan Anda
            </span>
            <Clock className="h-3.5 w-3.5 sm:h-5 sm:w-5 shrink-0 text-amber-600" />
          </div>
          <p className="mt-1.5 sm:mt-2 text-xs sm:text-3xl font-bold text-amber-900 leading-snug truncate">
            {formatRibuan(pendingList.length)} Periode
          </p>
          <p className="mt-0.5 sm:mt-1 text-[8.5px] sm:text-xs text-amber-700 leading-tight truncate">
            Memerlukan otorisasi Kepala Sekolah
          </p>
        </div>

        <div className="flex-1 basis-0 min-w-0 rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between gap-1">
            <span className="text-[9px] sm:text-xs font-semibold uppercase tracking-tight sm:tracking-wider text-slate-500 leading-tight">
              Total Pendidik & Staf
            </span>
            <Users className="h-3.5 w-3.5 sm:h-5 sm:w-5 shrink-0 text-indigo-600" />
          </div>
          <p className="mt-1.5 sm:mt-2 text-xs sm:text-3xl font-bold text-slate-900 leading-snug truncate">
            {formatRibuan(teachersCount)} Orang
          </p>
          <p className="mt-0.5 sm:mt-1 text-[8.5px] sm:text-xs text-slate-500 leading-tight truncate">
            Pendidik & Tenaga Kependidikan
          </p>
        </div>

        <div className="flex-1 basis-0 min-w-0 rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between gap-1">
            <span className="text-[9px] sm:text-xs font-semibold uppercase tracking-tight sm:tracking-wider text-slate-500 leading-tight">
              Total Periode Tercatat
            </span>
            <Wallet className="h-3.5 w-3.5 sm:h-5 sm:w-5 shrink-0 text-emerald-600" />
          </div>
          <p className="mt-1.5 sm:mt-2 text-xs sm:text-3xl font-bold text-slate-900 leading-snug truncate">
            {formatRibuan(payrolls.length)} Bulan
          </p>
          <p className="mt-0.5 sm:mt-1 text-[8.5px] sm:text-xs text-slate-500 leading-tight truncate">
            Riwayat anggaran penggajian yayasan
          </p>
        </div>
      </section>

      {/* Pending Approvals Highlight */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-bold text-slate-900">
              Otorisasi Pengajuan Gaji (Kepala Sekolah)
            </h2>
          </div>

          {/* Desktop Filter Tab Switcher */}
          <div
            role="tablist"
            aria-label="Filter Status Otorisasi"
            className="hidden sm:flex items-center gap-1 rounded-xl bg-slate-100/90 p-1 border border-slate-200/70"
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
                  className={`touch-target relative flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-200 select-none ${
                    isTabActive ? 'text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isTabActive && (
                    <motion.span
                      layoutId="kepsek-desktop-tab-pill"
                      transition={{ type: 'spring', stiffness: 361, damping: 24 }}
                      className="absolute inset-0 rounded-lg bg-indigo-600 shadow-xs"
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <TabIcon className="h-3.5 w-3.5" />
                    <span>{tabItem.label}</span>
                    {tabItem.badge > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                          isTabActive ? 'bg-amber-400 text-slate-950' : 'bg-amber-100 text-amber-800'
                        }`}
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
                className="fluid-item rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-bold text-slate-900">
                      {getMonthName(pr.month)} {pr.year}
                    </h3>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.cls}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">Total pengajuan anggaran gaji</p>
                  <p className="mt-2.5 sm:mt-3 text-xl sm:text-2xl font-bold text-slate-900">
                    {formatRupiah(pr.total_budget)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5">
                  <button
                    type="button"
                    onClick={() => handleInspect(pr)}
                    className="flex-1 touch-target flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Eye className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Periksa Rincian</span>
                  </button>

                  {pr.status === 'submitted' && (
                    <>
                      <button
                        type="button"
                        onClick={() => triggerApproval(pr, 'draft')}
                        className="touch-target flex items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Revisi</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => triggerApproval(pr, 'approved')}
                        className="flex-1 touch-target flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
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
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Audit Rincian Gaji Pendidik — {getMonthName(selectedPayroll.month)}{' '}
                {selectedPayroll.year}
              </h3>
              <p className="text-xs text-slate-500">
                Total Anggaran: <strong>{formatRupiah(selectedPayroll.total_budget)}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPayroll(null)}
              className="touch-target flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
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
                <div
                  key={row.id}
                  className="fluid-item rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-slate-900">{d.teacher_name}</p>
                      <p className="text-xs text-slate-500">
                        NIP: {d.nip} • Hadir: {d.present_days} hr | JTM: {d.total_jtm} jam
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs text-slate-600 border-t border-slate-200 pt-2">
                    <span>Gaji Pokok:</span>
                    <span className="text-right font-medium">{formatRupiah(d.base_salary)}</span>
                    <span>Honor JTM:</span>
                    <span className="text-right font-medium">{formatRupiah(d.jtm_honor)}</span>
                    <span>Tunjangan:</span>
                    <span className="text-right font-medium">
                      {formatRupiah(d.position_allowance)}
                    </span>
                    {parseCustomComponents(d.custom_components).map((cust) => (
                      <React.Fragment key={cust.id}>
                        <span>{cust.type === 'allowance' ? `+ ${cust.label}:` : `- ${cust.label}:`}</span>
                        <span
                          className={`text-right font-medium ${
                            cust.type === 'allowance' ? 'text-emerald-700' : 'text-rose-600'
                          }`}
                        >
                          {cust.type === 'allowance'
                            ? `+ ${formatRupiah(cust.amount)}`
                            : `- ${formatRupiah(cust.amount)}`}
                        </span>
                      </React.Fragment>
                    ))}
                    <span>Potongan BPJS:</span>
                    <span className="text-right font-medium text-rose-600">
                      - {formatRupiah(d.bpjs_deduction)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                    <span className="text-xs font-bold text-slate-700">Take Home Pay:</span>
                    <span className="text-base font-bold text-indigo-700">
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

      {/* Mobile Floating Tab Bar (Telegram Dual-Spring Pill Indicator) */}
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
