import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FileDown,
  ShieldCheck,
  Wallet,
  CreditCard,
  Award,
  Lock,
  Calendar,
  Mail,
} from 'lucide-react';
import api from '../services/gasApi';
import notify from '../utils/notify';
import { formatRupiah, parseCustomComponents, getMonthName } from '../utils/formatters';
import { downloadPayslipPdf } from '../utils/pdfSlipGenerator';
import FloatingTabBar from '../components/FloatingTabBar';

export function GuruDashboard({ user, refreshTrigger }) {
  const [activeTab, setActiveTab] = useState('slips'); // 'slips' | 'profile'
  const [summary, setSummary] = useState(null);
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadGuruData = useCallback(async () => {
    setLoading(true);
    try {
      const [sumData, mySlips] = await Promise.all([
        api.get('dashboard.summary'),
        api.get('payslips.myList'),
      ]);
      setSummary(sumData);
      setSlips(mySlips || []);
    } catch (err) {
      notify.error(err.message || 'Gagal memuat slip gaji.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGuruData();
  }, [loadGuruData, refreshTrigger]);

  const handleDownloadPdf = (slip) => {
    downloadPayslipPdf(slip);
    notify.success(`Slip Gaji ${getMonthName(slip.month)} ${slip.year} berhasil diunduh (PDF).`);
  };

  const teacherProfile = summary?.teacher || {};

  return (
    <main className="app-shell py-6 space-y-6">
      {/* Teacher Profile Banner */}
      <motion.section
        key={`profile-${activeTab === 'profile' ? 'active' : 'passive'}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={`rounded-3xl bg-slate-900 p-6 text-white shadow-lg ${activeTab === 'profile' ? 'block' : 'hidden sm:block'}`}
      >
        <div className="fluid-container items-center justify-between">
          <div className="fluid-item space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 border border-emerald-400/30">
              <ShieldCheck className="h-4 w-4" />
              <span>Portal Resmi Pendidik & Tenaga Kependidikan</span>
            </div>
            <h1 className="text-2xl font-bold">{teacherProfile.name || user.name}</h1>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <span className="flex items-center gap-1.5">
                <Award className="h-4 w-4 text-indigo-400" />
                NIP: {teacherProfile.nip || '-'}
              </span>
              <span>•</span>
              <span>{teacherProfile.status || 'Pendidik'}</span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <CreditCard className="h-4 w-4 text-emerald-400" />
                {teacherProfile.bank_account || '-'}
              </span>
              {(teacherProfile.email || user.email || user.username) && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1.5 text-indigo-300">
                    <Mail className="h-4 w-4 text-indigo-400" />
                    {teacherProfile.email || user.email || user.username}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl bg-slate-800/90 border border-slate-700 px-4 py-3">
              <span className="text-xs text-slate-400 block">Gaji Bersih Terakhir</span>
              <span className="text-xl font-bold text-emerald-400">
                {formatRupiah(summary?.latestNetSalary || 0)}
              </span>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Digital Salary Slips List */}
      <motion.section
        key={`slips-${activeTab === 'slips' ? 'active' : 'passive'}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={`space-y-4 ${activeTab === 'slips' ? 'block' : 'hidden sm:block'}`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Riwayat Slip Gaji Digital</h2>
            <p className="text-xs text-slate-500">
              Menampilkan slip gaji pribadi yang telah disetujui Kepala Sekolah / dibayarkan.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Memuat riwayat slip gaji Anda...
          </div>
        ) : slips.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Belum ada slip gaji yang diterbitkan untuk akun Anda.
          </div>
        ) : (
          <div className="fluid-container">
            {slips.map((slip) => {
              let d = {};
              try {
                d = JSON.parse(slip.details_json || '{}');
              } catch {
                d = {};
              }

              return (
                <div
                  key={slip.id}
                  className="fluid-item rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                          <Calendar className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-900">
                            {getMonthName(slip.month)} {slip.year}
                          </h3>
                          <p className="text-xs text-slate-500">
                            Hadir: {d.present_days || 0} hr • Alpa: {d.absent_days || 0} hr • JTM:{' '}
                            {d.total_jtm || 0} jam
                          </p>
                        </div>
                      </div>

                      <span className="rounded-full bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                        {slip.payroll_status === 'paid' ? 'Dibayarkan' : 'Disetujui'}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span>Gaji Pokok</span>
                        <span className="font-semibold text-slate-900">
                          {formatRupiah(d.base_salary)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>
                          Honor Mengajar ({d.total_jtm} JTM × {formatRupiah(d.hourly_rate)})
                        </span>
                        <span className="font-semibold text-slate-900">
                          {formatRupiah(d.jtm_honor)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tunjangan Jabatan</span>
                        <span className="font-semibold text-slate-900">
                          {formatRupiah(d.position_allowance)}
                        </span>
                      </div>
                      {parseCustomComponents(d.custom_components).map((cust) => (
                        <div
                          key={cust.id}
                          className={`flex justify-between ${
                            cust.type === 'allowance' ? 'text-emerald-700' : 'text-rose-600'
                          }`}
                        >
                          <span>{cust.label}</span>
                          <span className="font-semibold">
                            {cust.type === 'allowance'
                              ? `+ ${formatRupiah(cust.amount)}`
                              : `- ${formatRupiah(cust.amount)}`}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between text-rose-600">
                        <span>Potongan BPJS</span>
                        <span className="font-semibold">- {formatRupiah(d.bpjs_deduction)}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-indigo-50/80 px-4 py-3 border border-indigo-100">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-indigo-600" />
                        <span className="text-xs font-bold uppercase text-indigo-950">
                          Gaji Bersih (Take Home Pay)
                        </span>
                      </div>
                      <span className="text-lg font-bold text-indigo-700">
                        {formatRupiah(slip.net_salary)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDownloadPdf(slip)}
                    className="touch-target flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    <span>Unduh Slip Gaji Resmi (PDF)</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </motion.section>

      {/* Mobile Floating Tab Bar (Telegram Dual-Spring Pill Indicator) */}
      <FloatingTabBar
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'slips', label: 'Slip Gaji Digital', icon: Wallet, badge: slips.length },
          { id: 'profile', label: 'Profil Saya', icon: ShieldCheck },
        ]}
      />
    </main>
  );
}

export default GuruDashboard;
