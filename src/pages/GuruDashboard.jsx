import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Banknote,
  FileDown,
  Receipt,
  ShieldCheck,
  Wallet,
  CreditCard,
  Award,
  Calendar,
  CalendarCheck,
  Mail,
  Users,
} from 'lucide-react';
import api, { isActionUnsupported, markActionUnsupported } from '../services/gasApi';
import {
  publishNotificationsSnapshot,
  seedServerVersions,
  subscribeDataChange,
} from '../services/realtimeSync';
import { saveLocalSchoolProfile } from '../services/schoolProfileService';
import notify from '../utils/notify';
import {
  formatRupiah,
  getStaffCategoryLabel,
  parseCustomComponents,
  getMonthName,
  resolveInfaqZakatAmount,
} from '../utils/formatters';
import { formatAttendanceNumber } from '../utils/attendanceHelpers';
import {
  getDisbursementScopeMeta,
  getDisbursementTimingMeta,
} from '../utils/disbursementHelpers';
import {
  downloadBatchPayslipsPdf,
  downloadPayslipPdf,
} from '../utils/pdfSlipLoader';
import FloatingTabBar from '../components/FloatingTabBar';
import GuruSelfAttendanceSection from '../components/GuruSelfAttendanceSection';
import DisbursementRequestSection from '../components/DisbursementRequestSection';
import GuruReimbursementSection from '../components/GuruReimbursementSection';
import TuTeacherSwitcherBar from '../components/TuTeacherSwitcherBar';

const SLIP_STATUS_META = {
  draft: {
    badgeLabel: 'Draf Kalkulasi Bendahara',
    badgeCls: 'nim-badge',
    isEstimate: true,
    netLabel: 'Estimasi Gaji Bersih (Net)',
    btnLabel: 'Unduh Pratinjau Slip (Draf PDF)',
    note: 'Hasil kalkulasi sementara Admin/Bendahara — menunggu pengajuan & persetujuan Kepala Sekolah.',
  },
  submitted: {
    badgeLabel: 'Menunggu Otorisasi Kepsek',
    badgeCls: 'nim-badge nim-badge--warn',
    isEstimate: true,
    netLabel: 'Estimasi Gaji Bersih (Net)',
    btnLabel: 'Unduh Pratinjau Slip (Estimasi PDF)',
    note: 'Telah diajukan Bendahara dan sedang menunggu persetujuan Kepala Sekolah.',
  },
  approved: {
    badgeLabel: 'Disetujui Kepsek',
    badgeCls: 'nim-badge nim-badge--accent',
    isEstimate: false,
    netLabel: 'Gaji Bersih (Take Home Pay)',
    btnLabel: 'Unduh Slip Gaji Resmi (PDF)',
    note: null,
  },
  paid: {
    badgeLabel: 'Sudah Dibayarkan',
    badgeCls: 'nim-badge nim-badge--good',
    isEstimate: false,
    netLabel: 'Gaji Bersih (Take Home Pay)',
    btnLabel: 'Unduh Slip Gaji Resmi (PDF)',
    note: null,
  },
};

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
  const [disbursementRequestsCount, setDisbursementRequestsCount] = useState(0);
  const [reimbursementsCount, setReimbursementsCount] = useState(0);
  const [disbursementTargetPeriod, setDisbursementTargetPeriod] = useState(null);
  const [prefetchedData, setPrefetchedData] = useState(null);
  const [loading, setLoading] = useState(false);

  const [isTuOperator, setIsTuOperator] = useState(() => Boolean(user?.isTuOperator));
  const [assistableTeachers, setAssistableTeachers] = useState([]);
  const [actingTeacherId, setActingTeacherId] = useState('');
  const [ownMeta, setOwnMeta] = useState(() => ({
    id: user?.teacherId ? String(user.teacherId) : '',
    name: user?.name ? String(user.name) : '',
  }));

  useEffect(() => {
    setIsTuOperator(Boolean(user?.isTuOperator));
    setActingTeacherId('');
    setDisbursementTargetPeriod(null);
    setOwnMeta({
      id: user?.teacherId ? String(user.teacherId) : '',
      name: user?.name ? String(user.name) : '',
    });
  }, [user?.id, user?.teacherId, user?.name, user?.isTuOperator]);

  const isAssistingOther = Boolean(
    isTuOperator &&
      actingTeacherId &&
      String(actingTeacherId) !== String(ownMeta.id || '')
  );
  const activeTargetTeacherId = isAssistingOther ? actingTeacherId : '';

  const defaultPeriodRef = useRef(null);
  if (!defaultPeriodRef.current) {
    const now = new Date();
    defaultPeriodRef.current = { month: now.getMonth() + 1, year: now.getFullYear() };
  }

  const handleSelectActingTeacher = useCallback((nextId) => {
    setDisbursementTargetPeriod(null);
    setPrefetchedData(null);
    setActingTeacherId(nextId ? String(nextId) : '');
  }, []);

  const applyDisbursementsCount = useCallback((disbList) => {
    const valid = Array.isArray(disbList) ? disbList : [];
    setDisbursementRequestsCount(
      valid.filter((r) => r.status !== 'rejected' && r.status !== 'approved').length
    );
    return valid;
  }, []);

  const applyReimbursementsCount = useCallback((reimbList) => {
    const valid = Array.isArray(reimbList) ? reimbList : [];
    setReimbursementsCount(
      valid.filter((r) => r.status === 'pending_treasurer' || r.status === 'approved_treasurer')
        .length
    );
    return valid;
  }, []);

  const loadGuruData = useCallback(async () => {
    setLoading(true);
    const curPeriod = defaultPeriodRef.current;
    const targetParam = activeTargetTeacherId
      ? { target_teacher_id: activeTargetTeacherId }
      : {};
    try {
      let loaded = false;
      if (!isActionUnsupported('bootstrap.guru')) {
        try {
          const bundle = await api.get('bootstrap.guru', {
            ...curPeriod,
            ...targetParam,
          });
          if (bundle && typeof bundle === 'object') {
            const liveTuFlag = Boolean(bundle.isTuOperator ?? bundle.summary?.isTuOperator);
            const liveOwnId = String(
              bundle.ownTeacherId || bundle.summary?.ownTeacherId || user?.teacherId || ''
            );
            const liveOwnName = String(
              bundle.ownTeacherName || bundle.summary?.ownTeacherName || user?.name || ''
            );
            setIsTuOperator(liveTuFlag);
            setOwnMeta({ id: liveOwnId, name: liveOwnName });
            setAssistableTeachers(
              liveTuFlag && Array.isArray(bundle.assistableTeachers)
                ? bundle.assistableTeachers
                : []
            );
            if (!liveTuFlag && activeTargetTeacherId) {
              setActingTeacherId('');
            }
            setSummary(bundle.summary || null);
            setSlips(bundle.slips || []);
            const logsArr = Array.isArray(bundle.attendanceLogs) ? bundle.attendanceLogs : [];
            const attArr = Array.isArray(bundle.attendances) ? bundle.attendances : [];
            const disbArr = applyDisbursementsCount(bundle.disbursements);
            const reimbArr = applyReimbursementsCount(bundle.reimbursements);
            const estArr = Array.isArray(bundle.estimates) ? bundle.estimates : [];
            const resolvedActiveId = String(
              bundle.activeTeacherId ||
                activeTargetTeacherId ||
                liveOwnId ||
                bundle.summary?.teacher?.id ||
                ''
            );
            setAttendanceLogCount(logsArr.length);
            setPrefetchedData({
              teacherId: resolvedActiveId,
              period: curPeriod,
              attendanceLogs: logsArr,
              attendanceSummary: attArr.length > 0 ? attArr[0] : null,
              disbursements: disbArr,
              reimbursements: reimbArr,
              estimates: estArr,
            });
            seedServerVersions(bundle.versions);
            if (bundle.schoolProfile) {
              saveLocalSchoolProfile(bundle.schoolProfile);
            }
            if (bundle.notifications) {
              publishNotificationsSnapshot(bundle.notifications, { announceNew: false });
            }
            loaded = true;
          }
        } catch (bootErr) {
          if (bootErr?.status === 404 || String(bootErr?.message || '').includes('404')) {
            markActionUnsupported('bootstrap.guru');
          } else {
            throw bootErr;
          }
        }
      }

      if (!loaded) {
        const [sumData, mySlips, myLogs, myDisbReqs, myReimbs] = await Promise.all([
          api.get('dashboard.summary', targetParam),
          api.get('payslips.myList', targetParam),
          api.get('attendanceLogs.list', { ...curPeriod, ...targetParam }).catch(() => []),
          api.get('disbursements.list', targetParam).catch(() => []),
          api.get('reimbursements.list', targetParam).catch(() => []),
        ]);
        const liveTuFlag = Boolean(sumData?.isTuOperator);
        const liveOwnId = String(sumData?.ownTeacherId || user?.teacherId || '');
        const liveOwnName = String(sumData?.ownTeacherName || user?.name || '');
        setIsTuOperator(liveTuFlag);
        setOwnMeta({ id: liveOwnId, name: liveOwnName });
        if (liveTuFlag) {
          const tList = await api.get('teachers.list').catch(() => []);
          setAssistableTeachers(Array.isArray(tList) ? tList : []);
        } else {
          setAssistableTeachers([]);
          if (activeTargetTeacherId) {
            setActingTeacherId('');
          }
        }
        const logsArr = Array.isArray(myLogs) ? myLogs : [];
        const disbArr = applyDisbursementsCount(myDisbReqs);
        const reimbArr = applyReimbursementsCount(myReimbs);
        setSummary(sumData);
        setSlips(mySlips || []);
        setAttendanceLogCount(logsArr.length);
        setPrefetchedData({
          teacherId: String(
            activeTargetTeacherId || liveOwnId || sumData?.teacher?.id || ''
          ),
          period: curPeriod,
          attendanceLogs: logsArr,
          attendanceSummary: null,
          disbursements: disbArr,
          reimbursements: reimbArr,
          estimates: null,
        });
      }
    } catch (err) {
      if (Number(err?.status) === 403 && activeTargetTeacherId) {
        setActingTeacherId('');
        setIsTuOperator(false);
        setAssistableTeachers([]);
        notify.warn('Mandat TU Pendamping PTK tidak aktif. Dikembalikan ke akun pribadi.');
      } else {
        notify.error(err.message || 'Gagal memuat slip gaji.');
      }
    } finally {
      setLoading(false);
    }
  }, [
    activeTargetTeacherId,
    user?.teacherId,
    user?.name,
    applyDisbursementsCount,
    applyReimbursementsCount,
  ]);

  const refreshDomains = useCallback(
    async (domains = []) => {
      const domainSet = new Set(domains);
      const curPeriod = defaultPeriodRef.current;
      const targetParam = activeTargetTeacherId
        ? { target_teacher_id: activeTargetTeacherId }
        : {};
      try {
        const tasks = [];
        if (
          domainSet.has('teachers') ||
          domainSet.has('payrolls') ||
          domainSet.has('disbursements') ||
          domainSet.has('reimbursements')
        ) {
          tasks.push(
            api.get('dashboard.summary', targetParam).then((sumData) => {
              setSummary(sumData);
              if (sumData && sumData.isTuOperator !== undefined) {
                const liveTu = Boolean(sumData.isTuOperator);
                setIsTuOperator(liveTu);
                if (!liveTu) {
                  setAssistableTeachers([]);
                  if (activeTargetTeacherId) {
                    setActingTeacherId('');
                  }
                } else if (domainSet.has('teachers')) {
                  api
                    .get('teachers.list')
                    .then((tList) => {
                      if (Array.isArray(tList)) setAssistableTeachers(tList);
                    })
                    .catch(() => {});
                }
              }
            })
          );
        }
        if (
          domainSet.has('payrolls') ||
          domainSet.has('disbursements') ||
          domainSet.has('reimbursements')
        ) {
          tasks.push(
            api.get('payslips.myList', targetParam).then((mySlips) => {
              setSlips(mySlips || []);
            })
          );
        }
        if (domainSet.has('disbursements')) {
          tasks.push(
            api
              .get('disbursements.list', targetParam)
              .catch(() => [])
              .then((disbList) => {
                const valid = applyDisbursementsCount(disbList);
                setPrefetchedData((prev) =>
                  prev ? { ...prev, disbursements: valid } : prev
                );
              })
          );
        }
        if (domainSet.has('reimbursements')) {
          tasks.push(
            api
              .get('reimbursements.list', targetParam)
              .catch(() => [])
              .then((reimbList) => {
                const valid = applyReimbursementsCount(reimbList);
                setPrefetchedData((prev) =>
                  prev ? { ...prev, reimbursements: valid } : prev
                );
              })
          );
        }
        if (domainSet.has('attendances')) {
          tasks.push(
            api
              .get('attendanceLogs.list', { ...curPeriod, ...targetParam })
              .catch(() => [])
              .then((myLogs) => {
                const logsArr = Array.isArray(myLogs) ? myLogs : [];
                setAttendanceLogCount(logsArr.length);
                setPrefetchedData((prev) =>
                  prev ? { ...prev, attendanceLogs: logsArr } : prev
                );
              })
          );
        }
        if (tasks.length > 0) {
          await Promise.all(tasks);
        }
      } catch (err) {
        if (Number(err?.status) === 403 && activeTargetTeacherId) {
          setActingTeacherId('');
          setIsTuOperator(false);
          setAssistableTeachers([]);
        }
      }
    },
    [activeTargetTeacherId, applyDisbursementsCount, applyReimbursementsCount]
  );

  useEffect(() => {
    loadGuruData();
  }, [loadGuruData, refreshTrigger]);

  useEffect(() => {
    return subscribeDataChange((domains, meta) => {
      const relevant = [];
      if (domains.includes('payrolls')) relevant.push('payrolls');
      if (domains.includes('teachers')) relevant.push('teachers');
      if (domains.includes('disbursements') && meta?.source !== 'guru_disb_local') {
        relevant.push('disbursements');
      }
      if (domains.includes('reimbursements') && meta?.source !== 'guru_reimb_local') {
        relevant.push('reimbursements');
      }
      if (domains.includes('attendances') && meta?.source !== 'guru_att_local') {
        relevant.push('attendances');
      }
      if (relevant.length > 0) {
        refreshDomains(relevant);
      }
    });
  }, [refreshDomains]);

  const handleDisbursementSectionChange = useCallback(
    (updatedRequests) => {
      if (Array.isArray(updatedRequests)) {
        const valid = applyDisbursementsCount(updatedRequests);
        setPrefetchedData((prev) =>
          prev ? { ...prev, disbursements: valid } : prev
        );
      } else {
        refreshDomains(['disbursements']);
      }
    },
    [applyDisbursementsCount, refreshDomains]
  );

  const handleReimbursementSectionChange = useCallback(
    (updatedItems) => {
      if (Array.isArray(updatedItems)) {
        const valid = applyReimbursementsCount(updatedItems);
        setPrefetchedData((prev) =>
          prev ? { ...prev, reimbursements: valid } : prev
        );
      } else {
        refreshDomains(['reimbursements']);
      }
    },
    [applyReimbursementsCount, refreshDomains]
  );

  const handleAttendanceSectionSync = useCallback((syncInfo) => {
    if (syncInfo && Array.isArray(syncInfo.logs)) {
      setAttendanceLogCount(syncInfo.logs.length);
      setPrefetchedData((prev) =>
        prev ? { ...prev, attendanceLogs: syncInfo.logs } : prev
      );
    }
  }, []);

  useEffect(() => {
    onBadgesChange?.({
      slips: slips.length,
      attendance: attendanceLogCount > 0 ? attendanceLogCount : undefined,
      disbursements: disbursementRequestsCount > 0 ? disbursementRequestsCount : undefined,
      reimbursements: reimbursementsCount > 0 ? reimbursementsCount : undefined,
    });
  }, [
    slips.length,
    attendanceLogCount,
    disbursementRequestsCount,
    reimbursementsCount,
    onBadgesChange,
  ]);

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
      {
        id: 'guru-tab:disbursements',
        group: 'Menu Portal Guru',
        title: 'Ajukan Pencairan Estimasi Gaji',
        sub: 'Pengajuan pencairan sebagian/penuh sebelum waktunya atau kolektif',
        icon: Banknote,
        run: () => setActiveTab('disbursements'),
      },
      {
        id: 'guru-tab:reimbursements',
        group: 'Menu Portal Guru',
        title: 'Belanja Sekolah (Penggantian)',
        sub: 'Catat pengeluaran keperluan sekolah untuk diganti di slip gaji bebas Infaq 2,5%',
        icon: Receipt,
        run: () => setActiveTab('reimbursements'),
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
      ...(isTuOperator
        ? assistableTeachers.map((t) => ({
            id: `tu-switch:${t.id}`,
            group: 'Bantu PTK (Mode TU)',
            title:
              String(t.id) === String(ownMeta.id)
                ? `Akun Saya — ${t.name}`
                : `Bantu: ${t.name}`,
            sub: `NIP: ${t.nip || '-'} • ${t.status || getStaffCategoryLabel(t)}`,
            icon: Users,
            run: () => handleSelectActingTeacher(t.id),
          }))
        : []),
    ]);
  }, [
    slips,
    isTuOperator,
    assistableTeachers,
    ownMeta.id,
    handleSelectActingTeacher,
    onSearchItemsChange,
    setActiveTab,
  ]);

  const handleDownloadPdf = async (slip) => {
    await downloadPayslipPdf(slip);
    const meta = SLIP_STATUS_META[slip.payroll_status] || SLIP_STATUS_META.approved;
    notify.success(
      `${meta.isEstimate ? 'Pratinjau Estimasi Slip' : 'Slip Gaji'} ${getMonthName(
        slip.month
      )} ${slip.year} berhasil diunduh (PDF).`
    );
  };

  const teacherProfile = summary?.teacher || {};
  const expectedPrefetchTeacherId = String(
    activeTargetTeacherId || ownMeta.id || teacherProfile?.id || ''
  );
  const matchingPrefetchedData =
    prefetchedData &&
    expectedPrefetchTeacherId &&
    String(prefetchedData.teacherId || '') === expectedPrefetchTeacherId
      ? prefetchedData
      : null;
  const assistingMeta = {
    isAssistingOther,
    assistedByName: ownMeta.name || user.name || 'Staf TU',
    targetTeacherName: teacherProfile.name || '',
  };
  const latestEstimateSlip = slips.find(
    (s) =>
      s.slip_type !== 'disbursement' &&
      (s.payroll_status === 'draft' || s.payroll_status === 'submitted')
  );

  const headerMeta =
    activeTab === 'attendance'
      ? {
          title: 'Kehadiran Per-Kelas & JTM',
          desc: 'Centang kelas yang diampu (Hadir = 1, Tugas = 0,5, Sakit/Izin = 0) untuk disinkronkan otomatis ke Bendahara.',
        }
      : activeTab === 'disbursements'
      ? {
          title: 'Pengajuan Pencairan Estimasi Gaji',
          desc: 'Ajukan pencairan sebagian atau seluruh estimasi gaji Anda (awal waktu maupun kolektif tepat waktu).',
        }
      : activeTab === 'reimbursements'
      ? {
          title: 'Catatan Belanja Keperluan Sekolah',
          desc: 'Catat pembelian keperluan sekolah yang Anda talangi agar diganti penuh di slip gaji tanpa potongan Infaq 2,5%.',
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
      {isTuOperator && (
        <TuTeacherSwitcherBar
          ownTeacherId={ownMeta.id || user?.teacherId || ''}
          ownTeacherName={ownMeta.name || user?.name || ''}
          activeTeacherId={activeTargetTeacherId}
          activeTeacherProfile={teacherProfile}
          teachers={assistableTeachers}
          loading={loading}
          onSelectTeacher={handleSelectActingTeacher}
        />
      )}

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
            onClick={() => setActiveTab(activeTab === 'disbursements' ? 'slips' : 'disbursements')}
            className={`nim-btn text-xs ${
              activeTab === 'disbursements' ? '' : 'nim-btn--primary'
            }`}
          >
            {activeTab === 'disbursements' ? (
              <>
                <Wallet className="h-3.5 w-3.5" />
                <span>Lihat Slip Gaji</span>
              </>
            ) : (
              <>
                <Banknote className="h-3.5 w-3.5" />
                <span>Ajukan Pencairan</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab(activeTab === 'reimbursements' ? 'slips' : 'reimbursements')}
            className="nim-btn text-xs"
          >
            {activeTab === 'reimbursements' ? (
              <>
                <Wallet className="h-3.5 w-3.5" />
                <span>Lihat Slip Gaji</span>
              </>
            ) : (
              <>
                <Receipt className="h-3.5 w-3.5" />
                <span>Belanja Sekolah</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab(activeTab === 'attendance' ? 'slips' : 'attendance')}
            className="nim-btn text-xs"
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

          <div className="flex flex-wrap items-stretch gap-2.5">
            {latestEstimateSlip &&
              (() => {
                let estD = {};
                try {
                  estD = JSON.parse(latestEstimateSlip.details_json || '{}');
                } catch {
                  estD = {};
                }
                const estApprovedDisb = Number(estD.approved_disbursement_total || 0);
                const estBeforeDisb = Number(
                  estD.net_salary_before_disbursement ||
                    Number(latestEstimateSlip.net_salary || 0) + estApprovedDisb
                );
                return (
                  <div
                    className="nim-card-well px-4 py-3 min-w-[200px]"
                    style={{
                      background: 'var(--accent-soft)',
                      boxShadow: 'inset 0 0 0 1px var(--accent-glow)',
                    }}
                  >
                    <span className="nim-kpi__label block">
                      {estApprovedDisb > 0 ? 'Sisa Estimasi Gaji Bersih' : 'Estimasi Gaji Bersih'} (
                      {getMonthName(latestEstimateSlip.month)})
                    </span>
                    <span className="mt-1 block text-lg sm:text-xl font-bold text-[var(--accent-text)] tabular-nums">
                      {formatRupiah(latestEstimateSlip.net_salary || 0)}
                    </span>
                    <span className="mt-0.5 block text-[10.5px] text-[var(--muted)]">
                      {SLIP_STATUS_META[latestEstimateSlip.payroll_status]?.badgeLabel}
                      {estApprovedDisb > 0
                        ? ` • Sudah cair ${formatRupiah(estApprovedDisb)} dari ${formatRupiah(
                            estBeforeDisb
                          )}`
                        : ''}
                    </span>
                  </div>
                );
              })()}
            <div className="nim-card-well px-4 py-3 min-w-[190px]">
              <span className="nim-kpi__label block">Gaji Bersih Terakhir (Sah)</span>
              <span className="mt-1 block text-lg sm:text-xl font-bold text-[var(--good-text)] tabular-nums">
                {formatRupiah(summary?.latestNetSalary || 0)}
              </span>
              <span className="mt-0.5 block text-[10.5px] text-[var(--muted)]">
                {getStaffCategoryLabel(teacherProfile)}
              </span>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Disbursement Request Section */}
      {activeTab === 'disbursements' && (
        <motion.section
          key="guru-disbursements"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <DisbursementRequestSection
            key={`disb-${activeTargetTeacherId || ownMeta.id || 'self'}`}
            teacherProfile={teacherProfile}
            targetTeacherId={activeTargetTeacherId}
            assistingMeta={assistingMeta}
            initialPeriod={disbursementTargetPeriod || matchingPrefetchedData?.period}
            initialEstimates={matchingPrefetchedData?.estimates}
            initialRequests={matchingPrefetchedData?.disbursements}
            onDisbursementChange={handleDisbursementSectionChange}
          />
        </motion.section>
      )}

      {/* School Expense Reimbursement Section */}
      {activeTab === 'reimbursements' && (
        <motion.section
          key="guru-reimbursements"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <GuruReimbursementSection
            key={`reimb-${activeTargetTeacherId || ownMeta.id || 'self'}`}
            teacherProfile={teacherProfile}
            targetTeacherId={activeTargetTeacherId}
            assistingMeta={assistingMeta}
            initialPeriod={matchingPrefetchedData?.period}
            initialItems={matchingPrefetchedData?.reimbursements}
            onReimbursementsChange={handleReimbursementSectionChange}
          />
        </motion.section>
      )}

      {/* Self Attendance & JTM Section */}
      {activeTab === 'attendance' && (
        <motion.section
          key="guru-attendance"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <GuruSelfAttendanceSection
            key={`att-${activeTargetTeacherId || ownMeta.id || 'self'}`}
            teacherProfile={teacherProfile}
            targetTeacherId={activeTargetTeacherId}
            assistingMeta={assistingMeta}
            initialPeriod={matchingPrefetchedData?.period}
            initialLogs={matchingPrefetchedData?.attendanceLogs}
            initialAttendanceSummary={matchingPrefetchedData?.attendanceSummary}
            onLogsCountChange={setAttendanceLogCount}
            onSyncComplete={handleAttendanceSectionSync}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--ink)]">
              Rincian Slip Gaji &amp; Estimasi Gaji Bersih
            </h2>
            <p className="text-xs text-[var(--muted)]">
              Menampilkan rincian kalkulasi sementara (Estimasi Net) dari Admin/Bendahara maupun
              slip gaji resmi yang telah disetujui / dibayarkan.
            </p>
          </div>
          {slips.length > 1 && (
            <button
              type="button"
              onClick={async () => {
                await downloadBatchPayslipsPdf(
                  slips,
                  `${teacherProfile.nip || 'PTK'}_Riwayat`
                );
                notify.success(
                  `Mengunduh ${slips.length} slip gaji (2 slip per halaman A4).`
                );
              }}
              className="nim-btn nim-btn--sm"
            >
              <FileDown className="h-3.5 w-3.5 text-[var(--accent-text)]" />
              <span>Unduh Semua (2/Hal A4)</span>
            </button>
          )}
        </div>

        {loading ? (
          <div className="nim-glass nim-card p-8 text-center text-sm text-[var(--muted)]">
            Memuat riwayat rincian gaji Anda...
          </div>
        ) : slips.length === 0 ? (
          <div className="nim-glass nim-card p-8 text-center text-sm text-[var(--muted)]">
            Belum ada kalkulasi atau slip gaji yang dibuat Admin/Bendahara untuk akun Anda.
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
              const isDisbursementSlip =
                slip.slip_type === 'disbursement' || d.slip_type === 'disbursement';
              const approvedDisbTotal = !isDisbursementSlip
                ? Math.max(0, Number(d.approved_disbursement_total || 0))
                : 0;
              const approvedDisbCount = !isDisbursementSlip
                ? Number(d.approved_disbursement_count || 0)
                : 0;
              const fullNetBeforeDisb = !isDisbursementSlip
                ? Number(
                    d.net_salary_before_disbursement ??
                      Number(slip.net_salary || 0) + approvedDisbTotal
                  )
                : 0;
              const statusMeta = isDisbursementSlip
                ? {
                    badgeLabel: `Slip Pencairan Resmi (${
                      getDisbursementScopeMeta(d.request_scope || slip.request_scope).shortLabel
                    })`,
                    badgeCls: 'nim-badge nim-badge--good',
                    isEstimate: false,
                    netLabel: 'Nominal Pencairan Disetujui',
                    btnLabel: 'Unduh Slip Pencairan (PDF)',
                    note: `Dicairkan (${
                      getDisbursementTimingMeta(d.disbursement_timing || slip.disbursement_timing)
                        .label
                    }) — disetujui oleh Bendahara & Kepala Sekolah.`,
                  }
                : SLIP_STATUS_META[slip.payroll_status] || SLIP_STATUS_META.approved;

              return (
                <div
                  key={slip.id}
                  className="fluid-item nim-glass nim-card flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div
                      className="flex items-center justify-between gap-2 pb-3"
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
                          <p className="text-xs text-[var(--muted)] tabular-nums">
                            Hadir: {formatAttendanceNumber(d.present_days || 0)} hr • Tidak Hadir:{' '}
                            {formatAttendanceNumber(d.absent_days || 0)} hr • JTM:{' '}
                            {formatAttendanceNumber(d.total_jtm || 0)} jam
                          </p>
                        </div>
                      </div>

                      <span className={statusMeta.badgeCls}>{statusMeta.badgeLabel}</span>
                    </div>

                    {statusMeta.note && (
                      <p
                        className="rounded-xl px-3 py-2 text-[11px] text-[var(--ink-2)]"
                        style={{
                          background: 'var(--card-2)',
                          borderLeft: '3px solid var(--accent-text)',
                        }}
                      >
                        {statusMeta.note}
                      </p>
                    )}

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
                      {Number(d.reimbursement_total || 0) > 0 && (
                        <div
                          className="flex justify-between"
                          style={{ color: 'var(--good-text)' }}
                        >
                          <span>
                            Penggantian Belanja Sekolah (Bebas Infaq
                            {Number(d.reimbursement_count || 0) > 1
                              ? ` • ${d.reimbursement_count} item`
                              : ''}
                            )
                          </span>
                          <span className="font-semibold tabular-nums">
                            + {formatRupiah(d.reimbursement_total)}
                          </span>
                        </div>
                      )}
                      {approvedDisbTotal > 0 && (
                        <div
                          className="flex justify-between"
                          style={{ color: 'var(--warn-text)' }}
                        >
                          <span>
                            Pencairan Disetujui Kepsek
                            {approvedDisbCount > 1 ? ` (${approvedDisbCount}×)` : ''}
                          </span>
                          <span className="font-semibold tabular-nums">
                            - {formatRupiah(approvedDisbTotal)}
                          </span>
                        </div>
                      )}
                    </div>

                    {isDisbursementSlip && (
                      <div
                        className="rounded-xl px-3.5 py-2.5 text-xs space-y-1"
                        style={{
                          background: 'var(--good-soft)',
                          boxShadow: 'inset 0 0 0 1px var(--good-line)',
                        }}
                      >
                        <div className="flex justify-between">
                          <span className="text-[var(--ink-2)]">Estimasi Gaji Bersih Penuh</span>
                          <span className="font-semibold text-[var(--ink)] tabular-nums">
                            {formatRupiah(d.estimated_net_salary || slip.net_salary)}
                          </span>
                        </div>
                        {Number(d.remaining_estimated_salary || 0) > 0 && (
                          <div className="flex justify-between">
                            <span className="text-[var(--ink-2)]">Sisa Estimasi Belum Dicairkan</span>
                            <span className="font-semibold text-[var(--accent-text)] tabular-nums">
                              {formatRupiah(d.remaining_estimated_salary)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <div
                      className="flex items-center justify-between gap-2 rounded-xl px-4 py-3"
                      style={{
                        background: statusMeta.isEstimate ? 'var(--warn-soft)' : 'var(--accent-soft)',
                        boxShadow: statusMeta.isEstimate
                          ? 'inset 0 0 0 1px var(--warn-line)'
                          : 'inset 0 0 0 1px var(--accent-glow)',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Wallet
                          className="h-4 w-4 shrink-0"
                          style={{
                            color: statusMeta.isEstimate
                              ? 'var(--warn-text)'
                              : 'var(--accent-text)',
                          }}
                        />
                        <div>
                          <span className="text-xs font-bold uppercase text-[var(--ink)] block">
                            {approvedDisbTotal > 0
                              ? statusMeta.isEstimate
                                ? 'Sisa Estimasi Gaji Bersih (Net)'
                                : 'Sisa Gaji Bersih (Take Home Pay)'
                              : statusMeta.netLabel}
                          </span>
                          {approvedDisbTotal > 0 && fullNetBeforeDisb > 0 && (
                            <span className="text-[10.5px] text-[var(--muted)] tabular-nums block">
                              Sebelum pencairan: {formatRupiah(fullNetBeforeDisb)}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className="text-base sm:text-lg font-bold tabular-nums shrink-0"
                        style={{
                          color: statusMeta.isEstimate ? 'var(--warn-text)' : 'var(--accent-text)',
                        }}
                      >
                        {formatRupiah(slip.net_salary)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    {statusMeta.isEstimate && !isDisbursementSlip && (
                      <button
                        type="button"
                        onClick={() => {
                          setDisbursementTargetPeriod({ month: slip.month, year: slip.year });
                          setActiveTab('disbursements');
                        }}
                        className="nim-btn nim-btn--primary"
                      >
                        <Banknote className="h-3.5 w-3.5" />
                        <span>Ajukan Pencairan</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDownloadPdf(slip)}
                      className={`nim-btn ${
                        statusMeta.isEstimate ? '' : 'nim-btn--primary'
                      }`}
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      <span>{statusMeta.btnLabel}</span>
                    </button>
                  </div>
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
          { id: 'slips', label: 'Slip Gaji', icon: Wallet, badge: slips.length },
          {
            id: 'disbursements',
            label: 'Pencairan',
            icon: Banknote,
            badge: disbursementRequestsCount > 0 ? disbursementRequestsCount : undefined,
          },
          {
            id: 'reimbursements',
            label: 'Belanja',
            icon: Receipt,
            badge: reimbursementsCount > 0 ? reimbursementsCount : undefined,
          },
          {
            id: 'attendance',
            label: 'Kehadiran',
            icon: CalendarCheck,
            badge: attendanceLogCount > 0 ? attendanceLogCount : undefined,
          },
          { id: 'profile', label: 'Profil', icon: ShieldCheck },
        ]}
      />
    </main>
  );
}

export default GuruDashboard;
