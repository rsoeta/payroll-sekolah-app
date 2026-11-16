import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FileDown,
  ShieldCheck,
  Wallet,
  CreditCard,
  Award,
  Calendar,
  CalendarCheck,
  Mail,
} from 'lucide-react';
import api from '../services/gasApi';
import notify from '../utils/notify';
import {
  formatRupiah,
  parseCustomComponents,
  getMonthName,
  resolveInfaqZakatAmount,
} from '../utils/formatters';
import { downloadPayslipPdf } from '../utils/pdfSlipGenerator';
import FloatingTabBar from '../components/FloatingTabBar';
import GuruSelfAttendanceSection from '../components/GuruSelfAttendanceSection';

export function GuruDashboard({
  user,
  refreshTrigger,
  activeTab: controlledTab,
  onTabChange,
  onBadgesChange,
  onSearchItemsChange,
}) {
  const [internalTab, setInternalTab] = useState('slips');
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = onTabChange ?? setInternalTab;

  const [summary, setSummary] = useState(null);
  const [slips, setSlips] = useState([]);
  const [attendanceLogCount, setAttendanceLogCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadGuruData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const [sumData, mySlips, myLogs] = await Promise.all([
        api.get('dashboard.summary'),
        api.get('payslips.myList'),
        api
          .get('attendanceLogs.list', {
            month: now.getMonth() + 1,
            year: now.getFullYear(),
          })
          .catch(() => []),
      ]);
      setSummary(sumData);
      setSlips(mySlips || []);
      setAttendanceLogCount(Array.isArray(myLogs) ? myLogs.length : 0);
    } catch (err) {
      notify.error(err.message || 'Gagal memuat slip gaji.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGuruData();
  }, [loadGuruData, refreshTrigger]);

  useEffect(() => {
    onBadgesChange?.({
      slips: slips.length,
      attendance: attendanceLogCount > 0 ? attendanceLogCount : undefined,
    });
  }, [slips.length, attendanceLogCount, onBadgesChange]);

  useEffect(() => {
    if (!onSearchItemsChange) return;
    onSearchItemsChange([
      {
        id: 'guru-tab:attendance',
        group: 'Menu Portal Guru',
        title: 'Catat Kehadiran & JTM Mandiri',
        sub: 'Input hadir, tugas (0,5), sakit/izin & JTM harian',
        icon: CalendarCheck,
        run: () => setActiveTab('attendance'),
      },
      ...slips.map((slip) => ({
        id: `slip:${slip.id}`,
        group: 'Slip Gaji Digital',
        title: `${getMonthName(slip.month)} ${slip.year}`,
        sub: `Take Home Pay: ${formatRupiah(slip.net_salary)}`,
        icon: FileDown,
        run: () => {
          setActiveTab('slips');
          downloadPayslipPdf(slip);
        },
      })),
    ]);
  }, [slips, onSearchItemsChange, setActiveTab]);

  const handleDownloadPdf = (slip) => {
    downloadPayslipPdf(slip);
    notify.success(`Slip Gaji ${getMonthName(slip.month)} ${slip.year} berhasil diunduh (PDF).`);
  };

  const teacherProfile = summary?.teacher || {};

  const headerMeta =
    activeTab === 'attendance'
      ? {
          title: 'Kehadiran Per-Kelas & JTM',
          desc: 'Centang kelas yang diampu (Hadir = 1, Tugas = 0,5, Sakit/Izin = 0) untuk disinkronkan otomatis ke Bendahara.',
        }
      : activeTab === 'profile'
      ? {
          title: 'Profil Pendidik',
          desc: 'Pantau identitas kepegawaian, rekening pencairan, dan ringkasan gaji bersih terakhir.',
        }
      : {
          title: 'Riwayat Slip Gaji Digital',
          desc: 'Pantau penghasilan bulanan dan unduh bukti penerimaan gaji resmi berformat PDF.',
        };

  return (
    <main className="space-y-6">
      {/* Page Header */}
      <div className="nim-phead">
        <div>
          <span className="nim-eyebrow">Portal Pendidik &amp; Tenaga Kependidikan</span>
          <h1>{headerMeta.title}</h1>
          <p>{headerMeta.desc}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab(activeTab === 'attendance' ? 'slips' : 'attendance')}
            className="nim-btn nim-btn--primary text-xs"
          >
            {activeTab === 'attendance' ? (
              <>
                <Wallet className="h-3.5 w-3.5" />
                <span>Lihat Slip Gaji</span>
              </>
            ) : (
              <>
                <CalendarCheck className="h-3.5 w-3.5" />
                <span>Catat Kehadiran &amp; JTM</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Teacher Profile Glass Banner */}
      <motion.section
        key={`profile-${activeTab === 'profile' ? 'active' : 'passive'}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={`nim-glass nim-card relative overflow-hidden ${
          activeTab === 'profile'
            ? 'block'
            : activeTab === 'slips'
            ? 'hidden min-[761px]:block'
            : 'hidden'
        }`}
        style={{
          background:
            'radial-gradient(circle at top right, var(--accent-soft), transparent 55%), linear-gradient(160deg, var(--glass-hi), transparent 46%), var(--card)',
        }}
      >
        <div className="fluid-container items-center justify-between">
          <div className="fluid-item space-y-2.5">
            <div className="nim-badge nim-badge--good">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Portal Resmi Pendidik & Tenaga Kependidikan</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--ink)]">
              {teacherProfile.name || user.name}
            </h2>
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-[var(--muted)]">
              <span className="flex items-center gap-1.5">
                <Award className="h-4 w-4 text-[var(--accent-text)]" />
                NIP: {teacherProfile.nip || '-'}
              </span>
              <span>•</span>
              <span className="text-[var(--ink-2)] font-medium">
                {teacherProfile.status || 'Pendidik'}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <CreditCard className="h-4 w-4 text-[var(--good-text)]" />
                {teacherProfile.bank_account || '-'}
              </span>
              {(teacherProfile.email || user.email || user.username) && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1.5 text-[var(--accent-text)]">
                    <Mail className="h-4 w-4" />
                    {teacherProfile.email || user.email || user.username}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="nim-card-well px-4 py-3.5 min-w-[200px]">
            <span className="nim-kpi__label block">Gaji Bersih Terakhir</span>
            <span className="mt-1 block text-xl font-bold text-[var(--good-text)] tabular-nums">
              {formatRupiah(summary?.latestNetSalary || 0)}
            </span>
          </div>
        </div>
      </motion.section>

      {/* Self Attendance & JTM Section */}
      {activeTab === 'attendance' && (
        <motion.section
          key="guru-attendance"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <GuruSelfAttendanceSection
            teacherProfile={teacherProfile}
            onLogsCountChange={setAttendanceLogCount}
            onSyncComplete={loadGuruData}
          />
        </motion.section>
      )}

      {/* Digital Salary Slips List */}
      <motion.section
        key={`slips-${activeTab === 'slips' ? 'active' : 'passive'}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={`space-y-4 ${
          activeTab === 'slips'
            ? 'block'
            : activeTab === 'profile'
            ? 'hidden min-[761px]:block'
            : 'hidden'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--ink)]">
              Daftar Slip Gaji Terbit
            </h2>
            <p className="text-xs text-[var(--muted)]">
              Menampilkan slip gaji pribadi yang telah disetujui Kepala Sekolah / dibayarkan.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="nim-glass nim-card p-8 text-center text-sm text-[var(--muted)]">
            Memuat riwayat slip gaji Anda...
          </div>
        ) : slips.length === 0 ? (
          <div className="nim-glass nim-card p-8 text-center text-sm text-[var(--muted)]">
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
                  className="fluid-item nim-glass nim-card flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div
                      className="flex items-center justify-between pb-3"
                      style={{ borderBottom: '1px solid var(--line)' }}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="nim-kpi__ico">
                          <Calendar className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-[var(--ink)]">
                            {getMonthName(slip.month)} {slip.year}
                          </h3>
                          <p className="text-xs text-[var(--muted)]">
                            Hadir: {d.present_days || 0} hr • Alpa: {d.absent_days || 0} hr • JTM:{' '}
                            {d.total_jtm || 0} jam
                          </p>
                        </div>
                      </div>

                      <span className="nim-badge nim-badge--good">
                        {slip.payroll_status === 'paid' ? 'Dibayarkan' : 'Disetujui'}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-[var(--muted)]">
                      <div className="flex justify-between">
                        <span>Gaji Pokok</span>
                        <span className="font-semibold text-[var(--ink)] tabular-nums">
                          {formatRupiah(d.base_salary)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>
                          Honor Mengajar ({d.total_jtm} JTM × {formatRupiah(d.hourly_rate)})
                        </span>
                        <span className="font-semibold text-[var(--ink)] tabular-nums">
                          {formatRupiah(d.jtm_honor)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tunjangan Jabatan</span>
                        <span className="font-semibold text-[var(--ink)] tabular-nums">
                          {formatRupiah(d.position_allowance)}
                        </span>
                      </div>
                      {parseCustomComponents(d.custom_components).map((cust) => (
                        <div
                          key={cust.id}
                          className="flex justify-between"
                          style={{
                            color:
                              cust.type === 'allowance'
                                ? 'var(--good-text)'
                                : 'var(--bad-text)',
                          }}
                        >
                          <span>{cust.label}</span>
                          <span className="font-semibold tabular-nums">
                            {cust.type === 'allowance'
                              ? `+ ${formatRupiah(cust.amount)}`
                              : `- ${formatRupiah(cust.amount)}`}
                          </span>
                        </div>
                      ))}
                      {(() => {
                        const infaqZakat = resolveInfaqZakatAmount(d);
                        return (
                          <div
                            className="flex justify-between"
                            style={{
                              color: infaqZakat > 0 ? 'var(--bad-text)' : 'var(--muted)',
                            }}
                          >
                            <span>Infaq / Zakat Profesi (2,5%)</span>
                            <span className="font-semibold tabular-nums">
                              {infaqZakat > 0
                                ? `- ${formatRupiah(infaqZakat)}`
                                : 'Tidak Aktif (Rp 0)'}
                            </span>
                          </div>
                        );
                      })()}
                    </div>

                    <div
                      className="flex items-center justify-between rounded-xl px-4 py-3"
                      style={{
                        background: 'var(--accent-soft)',
                        boxShadow: 'inset 0 0 0 1px var(--accent-glow)',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-[var(--accent-text)]" />
                        <span className="text-xs font-bold uppercase text-[var(--ink)]">
                          Gaji Bersih (Take Home Pay)
                        </span>
                      </div>
                      <span className="text-base sm:text-lg font-bold text-[var(--accent-text)] tabular-nums">
                        {formatRupiah(slip.net_salary)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDownloadPdf(slip)}
                    className="nim-btn nim-btn--primary w-full"
                  >
                    <FileDown className="h-4 w-4" />
                    <span>Unduh Slip Gaji Resmi (PDF)</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </motion.section>

      {/* Mobile Floating Tab Bar */}
      <FloatingTabBar
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'slips', label: 'Slip Gaji Digital', icon: Wallet, badge: slips.length },
          {
            id: 'attendance',
            label: 'Kehadiran & JTM',
            icon: CalendarCheck,
            badge: attendanceLogCount > 0 ? attendanceLogCount : undefined,
          },
          { id: 'profile', label: 'Profil Saya', icon: ShieldCheck },
        ]}
      />
    </main>
  );
}

export default GuruDashboard;
