import React, { Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  CalendarCheck,
  Wallet,
  Building2,
  Banknote,
  Bell,
} from 'lucide-react';
import api, { isActionUnsupported, markActionUnsupported } from '../services/gasApi';
import {
  emitDataChange,
  publishNotificationsSnapshot,
  seedServerVersions,
  subscribeDataChange,
} from '../services/realtimeSync';
import notify from '../utils/notify';
import {
  formatRupiah,
  formatRibuan,
  MONTHS_ID,
  getMonthName,
  normalizePeriodKey,
  buildPeriodMonthKey,
  parsePeriodMonthKey,
} from '../utils/formatters';
import { computeAttendanceBreakdownFromLogs } from '../utils/attendanceHelpers';
import ConfirmModal from '../components/ConfirmModal';
import FloatingTabBar from '../components/FloatingTabBar';
import {
  fetchSchoolProfileFromServer,
  saveLocalSchoolProfile,
} from '../services/schoolProfileService';

const AdminPayrollTab = React.lazy(() => import('../components/admin/AdminPayrollTab'));
const AdminAttendanceTab = React.lazy(() => import('../components/admin/AdminAttendanceTab'));
const AdminTeachersTab = React.lazy(() => import('../components/admin/AdminTeachersTab'));
const DisbursementApprovalPanel = React.lazy(() =>
  import('../components/DisbursementApprovalPanel')
);
const SchoolProfileSection = React.lazy(() => import('../components/SchoolProfileSection'));
const DataArchiveSection = React.lazy(() => import('../components/admin/DataArchiveSection'));
const TeacherFormModal = React.lazy(() => import('../components/TeacherFormModal'));
const TeacherImportModal = React.lazy(() => import('../components/TeacherImportModal'));
const JtmCalculatorModal = React.lazy(() => import('../components/JtmCalculatorModal'));

function TabSectionFallback() {
  return (
    <div className="nim-glass nim-card p-8 text-center text-xs text-[var(--muted)]">
      Memuat panel modul...
    </div>
  );
}

const STATUS_BADGE = {
  draft: { label: 'Draf', cls: 'nim-badge' },
  submitted: { label: 'Menunggu Persetujuan', cls: 'nim-badge nim-badge--warn' },
  approved: { label: 'Disetujui Kepsek', cls: 'nim-badge nim-badge--accent' },
  paid: { label: 'Sudah Dibayarkan', cls: 'nim-badge nim-badge--good' },
};

const TAB_HEADER_META = {
  payroll: {
    eyebrow: 'Manajemen Penggajian Yayasan',
    title: 'Alur Penggajian',
    desc: 'Kalkulasi otomatis draf penggajian, ajukan ke Kepala Sekolah, dan terbitkan slip PDF.',
  },
  attendance: {
    eyebrow: 'Rekapitulasi Bulanan',
    title: 'Kehadiran & Jam Tatap Muka (JTM)',
    desc: 'Input hari hadir, hari alpa, dan total JTM untuk menghitung honor mengajar.',
  },
  teachers: {
    eyebrow: 'Basis Data Kepegawaian',
    title: 'Master Data PTK & Komponen Gaji',
    desc: 'Satu formulir penggajian untuk Tenaga Pendidik (Guru) & Tenaga Kependidikan (TU, Pustakawan, Laboran, Penguji, Keamanan, Kebersihan).',
  },
  school_profile: {
    eyebrow: 'Identitas Dokumen & Portal',
    title: 'Profil Sekolah, Yayasan & Arsip',
    desc: 'Sesuaikan kop sekolah, logo, penandatangan resmi Slip Gaji PDF, serta arsip data tahunan.',
  },
  disbursements: {
    eyebrow: 'Pengajuan Pencairan PTK',
    title: 'Persetujuan Pencairan Estimasi Gaji PTK',
    desc: 'Tinjau dan setujui pengajuan pencairan sebagian/penuh PTK (awal waktu maupun kolektif) sebelum otorisasi Kepsek.',
  },
};

const INITIAL_TEACHER_FORM = {
  id: '',
  nip: '',
  name: '',
  staff_category: 'pendidik',
  status: 'GTY (Guru Tetap Yayasan)',
  bank_account: '',
  email: '',
  base_salary: 3000000,
  hourly_rate: 50000,
  position_allowance: 500000,
  infaq_zakat_enabled: true,
  bpjs_deduction: 1,
  custom_components: [],
};

export function AdminDashboard({
  refreshTrigger,
  activeTab: controlledTab,
  onTabChange,
  onBadgesChange,
  onSearchItemsChange,
}) {
  const [internalTab, setInternalTab] = useState('payroll');
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = onTabChange ?? setInternalTab;

  const [teachers, setTeachers] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [attendances, setAttendances] = useState([]);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [disbursementRequests, setDisbursementRequests] = useState([]);
  const [validatingKey, setValidatingKey] = useState('');
  const [startMonth, setStartMonth] = useState(11);
  const [endMonth, setEndMonth] = useState(11);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [loading, setLoading] = useState(false);

  const selectedMonth = buildPeriodMonthKey(startMonth, endMonth);
  const periodInfo = parsePeriodMonthKey(selectedMonth);

  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [teacherForm, setTeacherForm] = useState(INITIAL_TEACHER_FORM);
  const [isEditingTeacher, setIsEditingTeacher] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const [attEdits, setAttEdits] = useState({});
  const attEditsRef = useRef(attEdits);
  attEditsRef.current = attEdits;

  const teachersRef = useRef(teachers);
  teachersRef.current = teachers;

  const [jtmCalcTarget, setJtmCalcTarget] = useState({
    isOpen: false,
    teacher: null,
    initialJtm: 0,
  });

  const [selectedPayroll, setSelectedPayroll] = useState(null);
  const [payrollDetails, setPayrollDetails] = useState([]);

  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    variant: 'primary',
    onConfirm: null,
  });

  const dirtyAttTeacherIdsRef = useRef(new Set());
  const selectedPayrollRef = useRef(null);
  selectedPayrollRef.current = selectedPayroll;

  const buildAttEditsMap = useCallback(
    (teacherList, attList, logList, prevEdits = {}, preserveDirty = false) => {
      const nextAttMap = {};
      (teacherList || []).forEach((t) => {
        if (preserveDirty && dirtyAttTeacherIdsRef.current.has(t.id) && prevEdits[t.id]) {
          nextAttMap[t.id] = prevEdits[t.id];
          return;
        }
        const found = (attList || []).find((a) => a.teacher_id === t.id);
        const teacherLogs = (Array.isArray(logList) ? logList : []).filter(
          (l) => l.teacher_id === t.id
        );
        if (found) {
          nextAttMap[t.id] = {
            present_days: Number(found.present_days),
            absent_days: Number(found.absent_days),
            total_jtm: Number(found.total_jtm),
          };
        } else if (teacherLogs.length > 0) {
          const calc = computeAttendanceBreakdownFromLogs(teacherLogs);
          nextAttMap[t.id] = {
            present_days: calc.present_days,
            absent_days: calc.absent_days,
            total_jtm: calc.total_jtm,
          };
        } else {
          nextAttMap[t.id] = {
            present_days: 20,
            absent_days: 0,
            total_jtm: 24,
          };
        }
      });
      return nextAttMap;
    },
    []
  );

  const loadAllData = useCallback(async () => {
    setLoading(true);
    dirtyAttTeacherIdsRef.current.clear();
    try {
      let loadedViaBootstrap = false;
      if (!isActionUnsupported('bootstrap.admin')) {
        try {
          const bundle = await api.get('bootstrap.admin', {
            month: selectedMonth,
            year: selectedYear,
          });
          if (bundle && typeof bundle === 'object') {
            const teacherList = bundle.teachers || [];
            const payrollList = bundle.payrolls || [];
            const attList = bundle.attendances || [];
            const logList = Array.isArray(bundle.attendanceLogs) ? bundle.attendanceLogs : [];
            const disbList = Array.isArray(bundle.disbursements) ? bundle.disbursements : [];
            setTeachers(teacherList);
            setPayrolls(payrollList);
            setAttendances(attList);
            setAttendanceLogs(logList);
            setDisbursementRequests(disbList);
            setAttEdits((prev) => buildAttEditsMap(teacherList, attList, logList, prev, false));
            seedServerVersions(bundle.versions);
            if (bundle.schoolProfile) {
              saveLocalSchoolProfile(bundle.schoolProfile);
            }
            if (bundle.notifications) {
              publishNotificationsSnapshot(bundle.notifications, { announceNew: false });
            }
            loadedViaBootstrap = true;
          }
        } catch (bootErr) {
          if (bootErr?.status === 404 || String(bootErr?.message || '').includes('404')) {
            markActionUnsupported('bootstrap.admin');
          } else {
            throw bootErr;
          }
        }
      }

      if (!loadedViaBootstrap) {
        const [teacherList, payrollList, attList, logList, disbList] = await Promise.all([
          api.get('teachers.list'),
          api.get('payrolls.list'),
          api.get('attendances.list', { month: selectedMonth, year: selectedYear }),
          api.get('attendanceLogs.list', { month: selectedMonth, year: selectedYear }).catch(() => []),
          api.get('disbursements.list').catch(() => []),
        ]);
        const validLogs = Array.isArray(logList) ? logList : [];
        setTeachers(teacherList || []);
        setPayrolls(payrollList || []);
        setAttendances(attList || []);
        setAttendanceLogs(validLogs);
        setDisbursementRequests(Array.isArray(disbList) ? disbList : []);
        setAttEdits((prev) => buildAttEditsMap(teacherList, attList, validLogs, prev, false));
        fetchSchoolProfileFromServer();
      }
    } catch (err) {
      notify.error(err.message || 'Gagal memuat data administrasi.');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, buildAttEditsMap]);

  const refreshDomains = useCallback(
    async (domains = [], { silent = true } = {}) => {
      const domainSet = new Set(domains);
      try {
        let nextTeachers = null;
        let nextAtt = null;
        let nextLogs = null;

        const tasks = [];
        if (domainSet.has('teachers')) {
          tasks.push(
            api.get('teachers.list').then((res) => {
              nextTeachers = res || [];
              setTeachers(nextTeachers);
            })
          );
        }
        if (domainSet.has('attendances')) {
          tasks.push(
            api
              .get('attendances.list', { month: selectedMonth, year: selectedYear })
              .then((res) => {
                nextAtt = res || [];
                setAttendances(nextAtt);
              })
          );
          tasks.push(
            api
              .get('attendanceLogs.list', { month: selectedMonth, year: selectedYear })
              .catch(() => [])
              .then((res) => {
                nextLogs = Array.isArray(res) ? res : [];
                setAttendanceLogs(nextLogs);
              })
          );
        }
        if (domainSet.has('payrolls')) {
          tasks.push(
            api.get('payrolls.list').then(async (res) => {
              const list = res || [];
              setPayrolls(list);
              if (selectedPayrollRef.current) {
                const updatedSel = list.find((p) => p.id === selectedPayrollRef.current.id);
                if (updatedSel) {
                  setSelectedPayroll(updatedSel);
                }
                const details = await api
                  .get('payrollDetails.byPayroll', { payroll_id: selectedPayrollRef.current.id })
                  .catch(() => null);
                if (Array.isArray(details)) {
                  setPayrollDetails(details);
                }
              }
            })
          );
        }
        if (domainSet.has('disbursements')) {
          tasks.push(
            api
              .get('disbursements.list')
              .catch(() => [])
              .then((res) => {
                setDisbursementRequests(Array.isArray(res) ? res : []);
              })
          );
        }

        if (tasks.length === 0) return;
        await Promise.all(tasks);

        if (nextTeachers !== null || nextAtt !== null || nextLogs !== null) {
          setTeachers((curTeachers) => {
            const tList = nextTeachers ?? curTeachers;
            setAttendances((curAtt) => {
              const aList = nextAtt ?? curAtt;
              setAttendanceLogs((curLogs) => {
                const lList = nextLogs ?? curLogs;
                setAttEdits((prev) =>
                  buildAttEditsMap(tList, aList, lList, prev, Boolean(silent))
                );
                return lList;
              });
              return aList;
            });
            return tList;
          });
        }
      } catch (err) {
        if (!silent) {
          notify.error(err.message || 'Gagal menyegarkan data.');
        }
      }
    },
    [selectedMonth, selectedYear, buildAttEditsMap]
  );

  useEffect(() => {
    loadAllData();
  }, [loadAllData, refreshTrigger]);

  useEffect(() => {
    return subscribeDataChange((domains, meta) => {
      if (meta?.source === 'admin_local') return;
      const relevant = domains.filter((d) =>
        ['teachers', 'attendances', 'payrolls', 'disbursements'].includes(d)
      );
      if (relevant.length === 0) return;
      const nextSet = new Set(relevant);
      if (
        (nextSet.has('teachers') || nextSet.has('attendances')) &&
        payrolls.some((p) => p.status === 'draft')
      ) {
        nextSet.add('payrolls');
      }
      refreshDomains(Array.from(nextSet), { silent: true });
    });
  }, [refreshDomains, payrolls]);

  const pendingDisbursementsCount = useMemo(
    () => disbursementRequests.filter((r) => r.status === 'pending_treasurer').length,
    [disbursementRequests]
  );
  const outOfSyncDraftsCount = useMemo(
    () => payrolls.filter((p) => p.status === 'draft' && p.needs_resync).length,
    [payrolls]
  );

  useEffect(() => {
    onBadgesChange?.({
      payroll: outOfSyncDraftsCount > 0 ? outOfSyncDraftsCount : undefined,
      teachers: teachers.length,
      disbursements: pendingDisbursementsCount > 0 ? pendingDisbursementsCount : undefined,
    });
  }, [teachers.length, pendingDisbursementsCount, outOfSyncDraftsCount, onBadgesChange]);

  const openEditTeacherModal = useCallback(async (teacher) => {
    const { isInfaqZakatEnabled, parseCustomComponents, resolveStaffCategory } = await import(
      '../utils/formatters'
    );
    const comp = teacher.salary_component || {};
    const infaqEnabled = isInfaqZakatEnabled(comp);
    setIsEditingTeacher(true);
    setTeacherForm({
      id: teacher.id,
      nip: teacher.nip !== undefined && teacher.nip !== null ? String(teacher.nip) : '',
      name: teacher.name !== undefined && teacher.name !== null ? String(teacher.name) : '',
      staff_category: resolveStaffCategory(teacher),
      status: teacher.status ? String(teacher.status) : 'GTY (Guru Tetap Yayasan)',
      bank_account:
        teacher.bank_account !== undefined && teacher.bank_account !== null
          ? String(teacher.bank_account)
          : '',
      email: teacher.email !== undefined && teacher.email !== null ? String(teacher.email) : '',
      base_salary: Number(comp.base_salary || 0),
      hourly_rate: Number(comp.hourly_rate || 0),
      position_allowance: Number(comp.position_allowance || 0),
      infaq_zakat_enabled: infaqEnabled,
      bpjs_deduction: infaqEnabled ? 1 : 0,
      custom_components: parseCustomComponents(comp.custom_components_json),
    });
    setTeacherModalOpen(true);
  }, []);

  const handleInspectPayroll = useCallback(async (payrollRow) => {
    try {
      setSelectedPayroll(payrollRow);
      const details = await api.get('payrollDetails.byPayroll', { payroll_id: payrollRow.id });
      setPayrollDetails(details || []);
    } catch (err) {
      notify.error(err.message || 'Gagal memuat rincian payroll.');
    }
  }, []);

  const handleCloseSelectedPayroll = useCallback(() => {
    setSelectedPayroll(null);
  }, []);

  useEffect(() => {
    if (!onSearchItemsChange) return;
    const items = [
      ...teachers.map((t) => ({
        id: `teacher:${t.id}`,
        group: 'Pendidik & Staf',
        title: t.name,
        sub: `NIP: ${t.nip} • ${t.status}`,
        icon: Users,
        run: () => {
          setActiveTab('teachers');
          openEditTeacherModal(t);
        },
      })),
      ...payrolls.map((pr) => ({
        id: `payroll:${pr.id}`,
        group: 'Periode Penggajian',
        title: `${getMonthName(pr.month)} ${pr.year}`,
        sub: `${STATUS_BADGE[pr.status]?.label || pr.status} • ${formatRupiah(pr.total_budget)}`,
        icon: Wallet,
        run: () => {
          setActiveTab('payroll');
          handleInspectPayroll(pr);
        },
      })),
    ];
    onSearchItemsChange(items);
  }, [teachers, payrolls, onSearchItemsChange, setActiveTab, openEditTeacherModal, handleInspectPayroll]);

  /* --- TEACHER & SALARY COMPONENT CRUD --- */

  const openAddTeacherModal = useCallback(() => {
    setIsEditingTeacher(false);
    setTeacherForm(INITIAL_TEACHER_FORM);
    setTeacherModalOpen(true);
  }, []);

  const openImportModal = useCallback(() => {
    setImportModalOpen(true);
  }, []);

  const addCustomComponent = useCallback((type = 'deduction', label = '', amount = 50000) => {
    setTeacherForm((prev) => ({
      ...prev,
      custom_components: [
        ...(prev.custom_components || []),
        {
          id: `cust_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type,
          label,
          amount,
        },
      ],
    }));
  }, []);

  const updateCustomComponent = useCallback((id, field, value) => {
    setTeacherForm((prev) => ({
      ...prev,
      custom_components: (prev.custom_components || []).map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }));
  }, []);

  const removeCustomComponent = useCallback((id) => {
    setTeacherForm((prev) => ({
      ...prev,
      custom_components: (prev.custom_components || []).filter((item) => item.id !== id),
    }));
  }, []);

  const handleSaveTeacher = async (e) => {
    e.preventDefault();
    const cleanNip = String(teacherForm.nip ?? '').trim();
    const cleanName = String(teacherForm.name ?? '').trim();
    const cleanBank = String(teacherForm.bank_account ?? '').trim();
    if (!cleanNip || !cleanName || !cleanBank) {
      notify.warn('NIP, Nama Lengkap, dan Nomor Rekening wajib diisi.');
      return;
    }

    const cleanEmail = String(teacherForm.email ?? '')
      .trim()
      .toLowerCase();
    if (cleanEmail && !cleanEmail.includes('@')) {
      notify.warn('Masukkan alamat Gmail yang valid (contoh: nama.guru@gmail.com).');
      return;
    }

    const { resolveStaffCategory } = await import('../utils/formatters');

    const cleanCustomList = (teacherForm.custom_components || [])
      .map((item) => ({
        id: item.id,
        type: item.type === 'allowance' ? 'allowance' : 'deduction',
        label: String(item.label || '').trim(),
        amount: Math.max(0, Number(item.amount || 0)),
      }))
      .filter((item) => item.label);

    const isInfaqEnabled = Boolean(teacherForm.infaq_zakat_enabled);

    const submitPayload = {
      ...teacherForm,
      nip: cleanNip,
      name: cleanName,
      bank_account: cleanBank,
      staff_category: resolveStaffCategory(teacherForm),
      email: cleanEmail,
      username: cleanEmail,
      infaq_zakat_enabled: isInfaqEnabled,
      bpjs_deduction: isInfaqEnabled ? 1 : 0,
      custom_components: cleanCustomList,
      custom_components_json: JSON.stringify(cleanCustomList),
    };

    try {
      if (isEditingTeacher) {
        await api.put('teachers.update', submitPayload);
        notify.success('Data PTK & Komponen Gaji diperbarui.');
      } else {
        await api.post('teachers.create', submitPayload);
        notify.success('Data PTK baru & Komponen Gaji berhasil ditambahkan.');
      }
      setTeacherModalOpen(false);
      emitDataChange(['teachers', 'payrolls'], { source: 'admin_local' });
      refreshDomains(['teachers', 'payrolls'], { silent: true });
    } catch (err) {
      notify.error(err.message || 'Gagal menyimpan data guru.');
    }
  };

  const requestDeleteTeacher = useCallback(
    (teacher) => {
      setConfirmDialog({
        isOpen: true,
        title: 'Hapus Data Guru',
        message: `Apakah Anda yakin ingin menghapus data "${teacher.name}" beserta komponen gajinya?`,
        variant: 'danger',
        onConfirm: async () => {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          try {
            await api.delete('teachers.delete', { id: teacher.id });
            notify.success('Data guru berhasil dihapus.');
            emitDataChange(['teachers', 'payrolls'], { source: 'admin_local' });
            refreshDomains(['teachers', 'payrolls'], { silent: true });
          } catch (err) {
            notify.error(err.message || 'Gagal menghapus data guru.');
          }
        },
      });
    },
    [refreshDomains]
  );

  const handleBulkImportTeachers = useCallback(
    async (rows, onProgress) => {
      try {
        const bulkResult = await api.post('teachers.bulkImport', { items: rows });
        notify.success(
          `Import selesai! ${formatRibuan(bulkResult.createdCount || 0)} baru, ${formatRibuan(
            bulkResult.updatedCount || 0
          )} diperbarui.`
        );
        emitDataChange(['teachers', 'payrolls'], { source: 'admin_local' });
        await refreshDomains(['teachers', 'payrolls'], { silent: false });
      } catch (bulkErr) {
        if (bulkErr.status === 404 || String(bulkErr.message || '').includes('404')) {
          let created = 0;
          let updated = 0;
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            if (onProgress) onProgress(i + 1, rows.length);
            if (r.existingId) {
              await api.put('teachers.update', { id: r.existingId, ...r });
              updated++;
            } else {
              await api.post('teachers.create', r);
              created++;
            }
          }
          notify.success(
            `Import selesai! ${formatRibuan(created)} PTK baru, ${formatRibuan(updated)} diperbarui.`
          );
          emitDataChange(['teachers', 'payrolls'], { source: 'admin_local' });
          await refreshDomains(['teachers', 'payrolls'], { silent: false });
        } else {
          throw bulkErr;
        }
      }
    },
    [refreshDomains]
  );

  /* --- ATTENDANCE & JTM HANDLERS --- */

  const handleAttFieldChange = useCallback((teacherId, field, value) => {
    const cleanNum = Math.max(0, Number(value || 0));
    dirtyAttTeacherIdsRef.current.add(teacherId);
    setAttEdits((prev) => ({
      ...prev,
      [teacherId]: {
        ...(prev[teacherId] || { present_days: 0, absent_days: 0, total_jtm: 0 }),
        [field]: cleanNum,
      },
    }));
  }, []);

  const handleApplyTeacherLogs = useCallback((teacherId, logBreakdown) => {
    dirtyAttTeacherIdsRef.current.add(teacherId);
    setAttEdits((prev) => ({
      ...prev,
      [teacherId]: {
        present_days: logBreakdown.present_days,
        absent_days: logBreakdown.absent_days,
        total_jtm: logBreakdown.total_jtm,
      },
    }));
  }, []);

  const handleSaveSingleAttendance = useCallback(
    async (teacher) => {
      const row = attEditsRef.current[teacher.id];
      if (!row) return;
      try {
        await api.post('attendances.upsert', {
          teacher_id: teacher.id,
          month: selectedMonth,
          year: selectedYear,
          present_days: row.present_days,
          absent_days: row.absent_days,
          total_jtm: row.total_jtm,
        });
        dirtyAttTeacherIdsRef.current.delete(teacher.id);
        notify.success(`Kehadiran ${teacher.name} disimpan.`);
        emitDataChange(['attendances', 'payrolls'], { source: 'admin_local' });
        refreshDomains(['attendances', 'payrolls'], { silent: true });
      } catch (err) {
        notify.error(err.message || 'Gagal menyimpan kehadiran.');
      }
    },
    [selectedMonth, selectedYear, refreshDomains]
  );

  const handleSaveAllAttendances = useCallback(async () => {
    const curTeachers = teachersRef.current;
    const curEdits = attEditsRef.current;
    const items = curTeachers.map((t) => {
      const row = curEdits[t.id] || { present_days: 0, absent_days: 0, total_jtm: 0 };
      return {
        teacher_id: t.id,
        present_days: row.present_days,
        absent_days: row.absent_days,
        total_jtm: row.total_jtm,
      };
    });
    if (items.length === 0) {
      notify.warn('Belum ada data PTK untuk disimpan kehadirannya.');
      return;
    }

    try {
      let savedViaBatch = false;
      if (!isActionUnsupported('attendances.bulkUpsert')) {
        try {
          const bulkRes = await api.post('attendances.bulkUpsert', {
            month: selectedMonth,
            year: selectedYear,
            items,
          });
          if (bulkRes?.versions) {
            seedServerVersions(bulkRes.versions);
          }
          savedViaBatch = true;
        } catch (bulkErr) {
          if (bulkErr?.status === 404 || String(bulkErr?.message || '').includes('404')) {
            markActionUnsupported('attendances.bulkUpsert');
          } else {
            throw bulkErr;
          }
        }
      }

      if (!savedViaBatch) {
        for (const item of items) {
          await api.post('attendances.upsert', {
            teacher_id: item.teacher_id,
            month: selectedMonth,
            year: selectedYear,
            present_days: item.present_days,
            absent_days: item.absent_days,
            total_jtm: item.total_jtm,
          });
        }
      }

      dirtyAttTeacherIdsRef.current.clear();
      notify.success(
        `Seluruh data kehadiran ${getMonthName(selectedMonth)} ${selectedYear} tersimpan!`
      );
      emitDataChange(['attendances', 'payrolls'], { source: 'admin_local' });
      refreshDomains(['attendances', 'payrolls'], { silent: false });
    } catch (err) {
      notify.error(err.message || 'Gagal menyimpan kehadiran kolektif.');
    }
  }, [selectedMonth, selectedYear, refreshDomains]);

  const handleValidateAttendanceLogs = useCallback(
    async (ids, validationStatus, validationNote = '', keyTag = '') => {
      const cleanIds = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
      if (cleanIds.length === 0) return;

      setValidatingKey(keyTag || cleanIds[0]);
      try {
        await api.post('attendanceLogs.validate', {
          ids: cleanIds,
          validation_status: validationStatus,
          validation_note: String(validationNote || '').trim(),
        });
        if (validationStatus === 'valid') {
          notify.success(
            cleanIds.length > 1
              ? `${cleanIds.length} log catatan guru divalidasi & dihitung ke Kehadiran & JTM.`
              : 'Log divalidasi (dihitung ke Kehadiran & JTM).'
          );
        } else if (validationStatus === 'invalid') {
          notify.warn('Log ditandai Tidak Valid & dikeluarkan dari hitungan Kehadiran & JTM.');
        } else {
          notify.info('Status validasi log dikembalikan ke Belum Divalidasi.');
        }
        dirtyAttTeacherIdsRef.current.clear();
        emitDataChange(['attendances', 'payrolls'], { source: 'admin_local' });
        await refreshDomains(['attendances', 'payrolls'], { silent: false });
      } catch (err) {
        notify.error(err.message || 'Gagal memperbarui status validasi log.');
      } finally {
        setValidatingKey('');
      }
    },
    [refreshDomains]
  );

  const handleOpenJtmCalc = useCallback((teacher, initialJtm) => {
    setJtmCalcTarget({ isOpen: true, teacher, initialJtm });
  }, []);

  /* --- PAYROLL FLOW HANDLERS --- */

  const handleGenerateDraft = useCallback(
    async (targetMonth = selectedMonth, targetYear = selectedYear) => {
      const cleanMonth =
        typeof targetMonth === 'string' || typeof targetMonth === 'number'
          ? targetMonth
          : selectedMonth;
      const cleanYear = typeof targetYear === 'number' ? targetYear : selectedYear;
      try {
        const generated = await api.post('payrolls.generateDraft', {
          month: cleanMonth,
          year: cleanYear,
        });
        if (generated?.versions) {
          seedServerVersions(generated.versions);
        }
        notify.success(
          `Draf Payroll ${getMonthName(cleanMonth)} ${cleanYear} berhasil disinkronkan & dikalkulasi!`
        );
        if (generated && Array.isArray(generated.details)) {
          setSelectedPayroll(generated);
          setPayrollDetails(generated.details);
        } else if (generated) {
          handleInspectPayroll(generated);
        }
        emitDataChange(['payrolls'], { source: 'admin_local' });
        await refreshDomains(['payrolls'], { silent: false });
      } catch (err) {
        notify.error(err.message || 'Gagal men-generate draf payroll.');
      }
    },
    [selectedMonth, selectedYear, handleInspectPayroll, refreshDomains]
  );

  const requestStatusChange = useCallback(
    (payrollRow, nextStatus, title, message, variant = 'primary') => {
      const outOfSyncWarn =
        nextStatus === 'submitted' && payrollRow?.needs_resync
          ? `PERHATIAN: Draf ini belum disinkronkan dengan perubahan terbaru (${(
              payrollRow.resync_reasons || []
            ).join(' & ')}). Disarankan klik "Sinkronkan Draf" terlebih dahulu. Tetap ajukan dengan angka saat ini?\n\n${message}`
          : message;

      setConfirmDialog({
        isOpen: true,
        title,
        message: outOfSyncWarn,
        variant,
        onConfirm: async () => {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          try {
            const updated = await api.put('payrolls.updateStatus', {
              id: payrollRow.id,
              status: nextStatus,
            });
            notify.success(`Status payroll diperbarui menjadi: ${nextStatus.toUpperCase()}`);
            if (selectedPayrollRef.current && selectedPayrollRef.current.id === payrollRow.id) {
              setSelectedPayroll(updated);
            }
            emitDataChange(['payrolls', 'notifications'], { source: 'admin_local' });
            refreshDomains(['payrolls'], { silent: false });
          } catch (err) {
            notify.error(err.message || 'Gagal memperbarui status payroll.');
          }
        },
      });
    },
    [refreshDomains]
  );

  const handleRefreshDisbursements = useCallback(() => {
    refreshDomains(['disbursements'], { silent: false });
  }, [refreshDomains]);

  const handleMaintenanceComplete = useCallback(() => {
    refreshDomains(['attendances', 'payrolls'], { silent: false });
  }, [refreshDomains]);

  const currentPeriodPayroll = useMemo(
    () =>
      payrolls.find(
        (p) =>
          normalizePeriodKey(p.month) === normalizePeriodKey(selectedMonth) &&
          Number(p.year) === Number(selectedYear)
      ),
    [payrolls, selectedMonth, selectedYear]
  );

  const pageMeta = TAB_HEADER_META[activeTab] || TAB_HEADER_META.payroll;

  return (
    <main className="space-y-6">
      {/* Page Header */}
      <div className="nim-phead">
        <div>
          <span className="nim-eyebrow">{pageMeta.eyebrow}</span>
          <h1>{pageMeta.title}</h1>
          <p>{pageMeta.desc}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="nim-badge nim-badge--accent">
            {formatRibuan(attendances.length)} Rekap Kehadiran Tersimpan
          </span>
        </div>
      </div>

      {/* Notifikasi Pengajuan Pencairan Baru dari PTK */}
      {pendingDisbursementsCount > 0 && activeTab !== 'disbursements' && (
        <div
          className="nim-glass rounded-2xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3"
          style={{
            background: 'var(--warn-soft)',
            boxShadow: 'inset 0 0 0 1px var(--warn-line)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="nim-kpi__ico !w-8 !h-8"
              style={{ background: 'rgba(245, 158, 11, 0.22)', color: 'var(--warn-text)' }}
            >
              <Bell className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs sm:text-sm font-bold text-[var(--ink)]">
                Ada {pendingDisbursementsCount} Pengajuan Pencairan Gaji PTK Baru Menunggu Persetujuan
                Bendahara
              </p>
              <p className="text-[11px] text-[var(--ink-2)]">
                Periksa pengajuan pencairan sebagian/penuh agar dapat diteruskan ke Kepala Sekolah
                untuk penerbitan slip.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('disbursements')}
            className="nim-btn nim-btn--warn nim-btn--sm"
          >
            <Banknote className="h-3.5 w-3.5" />
            <span>Tinjau Pengajuan ({pendingDisbursementsCount})</span>
          </button>
        </div>
      )}

      {/* Top KPI Summary Cards */}
      <section className="flex flex-nowrap items-stretch gap-2 sm:gap-4 w-full">
        <div className="flex-1 basis-0 nim-glass nim-kpi">
          <div className="flex items-start justify-between gap-2">
            <span className="nim-kpi__label">Total PTK Aktif</span>
            <span className="nim-kpi__ico !w-7 !h-7 sm:!w-9 sm:!h-9">
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </div>
          <p className="nim-kpi__value mt-2 truncate">{formatRibuan(teachers.length)} PTK</p>
          <p className="nim-kpi__sub mt-1 truncate">Pendidik &amp; Tenaga Kependidikan</p>
        </div>

        <div className="flex-1 basis-0 nim-glass nim-kpi">
          <div className="flex items-start justify-between gap-2">
            <span className="nim-kpi__label">Periode Aktif</span>
            <span
              className="nim-kpi__ico !w-7 !h-7 sm:!w-9 sm:!h-9"
              style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)' }}
            >
              <CalendarCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </div>
          <p className="nim-kpi__value mt-2 truncate">
            {getMonthName(selectedMonth)} {selectedYear}
          </p>
          <p className="nim-kpi__sub mt-1 truncate">
            Status:{' '}
            <strong className="text-[var(--accent-text)]">
              {currentPeriodPayroll
                ? STATUS_BADGE[currentPeriodPayroll.status]?.label || currentPeriodPayroll.status
                : 'Belum Dibuat'}
            </strong>
          </p>
        </div>

        <div className="flex-1 basis-0 nim-glass nim-kpi">
          <div className="flex items-start justify-between gap-2">
            <span className="nim-kpi__label">Anggaran Periode Ini</span>
            <span
              className="nim-kpi__ico !w-7 !h-7 sm:!w-9 sm:!h-9"
              style={{ background: 'var(--good-soft)', color: 'var(--good-text)' }}
            >
              <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </div>
          <p className="nim-kpi__value mt-2 text-[var(--good-text)] truncate">
            {formatRupiah(currentPeriodPayroll ? currentPeriodPayroll.total_budget : 0)}
          </p>
          <p className="nim-kpi__sub mt-1 truncate">Akumulasi Take Home Pay</p>
        </div>
      </section>

      {/* Period Filter & Navigation Bar */}
      <section className="nim-glass nim-card !p-3.5 sm:!p-4">
        <div className="fluid-container items-center justify-between gap-3">
          {/* Inline Quick Switcher (Desktop >= 761px) */}
          <div
            role="tablist"
            aria-label="Menu Utama Dasbor Admin"
            className="hidden min-[761px]:flex items-center gap-1 rounded-xl p-1"
            style={{
              background: 'var(--card-2)',
              boxShadow: 'inset 0 0 0 1px var(--line)',
            }}
          >
            {[
              {
                id: 'payroll',
                label: 'Alur Penggajian',
                icon: Wallet,
                badge: outOfSyncDraftsCount,
              },
              { id: 'attendance', label: 'Kehadiran & JTM', icon: CalendarCheck },
              {
                id: 'disbursements',
                label: 'Pencairan PTK',
                icon: Banknote,
                badge: pendingDisbursementsCount,
              },
              { id: 'teachers', label: 'Master PTK & Gaji', icon: Users },
              { id: 'school_profile', label: 'Profil & Arsip', icon: Building2 },
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
                      layoutId="admin-desktop-tab-pill"
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

          {/* Flexible Period Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <select
                aria-label="Bulan Awal (Dari)"
                value={startMonth}
                onChange={(e) => setStartMonth(Number(e.target.value))}
                className="nim-select !w-auto flex-1 sm:flex-initial text-xs font-semibold"
              >
                {MONTHS_ID.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>

              <span className="text-[11px] font-bold text-[var(--muted)] shrink-0 px-0.5">
                s/d
              </span>

              <select
                aria-label="Bulan Akhir (Hingga)"
                value={endMonth}
                onChange={(e) => setEndMonth(Number(e.target.value))}
                className="nim-select !w-auto flex-1 sm:flex-initial text-xs font-semibold"
              >
                {MONTHS_ID.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>

              <select
                aria-label="Pilih Tahun"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="nim-select !w-auto text-xs font-semibold"
              >
                {[2025, 2026, 2027, 2028].map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {periodInfo.isRange && (
                <span className="nim-badge nim-badge--accent">{periodInfo.monthCount} Bulan</span>
              )}
              <button
                type="button"
                onClick={() => setEndMonth(startMonth)}
                className={`nim-btn nim-btn--sm text-[11px] ${
                  !periodInfo.isRange ? 'nim-btn--primary' : ''
                }`}
              >
                1 Bulan
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartMonth(1);
                  setEndMonth(6);
                }}
                className={`nim-btn nim-btn--sm text-[11px] ${
                  startMonth === 1 && endMonth === 6 ? 'nim-btn--primary' : ''
                }`}
              >
                Jan–Jun
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartMonth(7);
                  setEndMonth(12);
                }}
                className={`nim-btn nim-btn--sm text-[11px] ${
                  startMonth === 7 && endMonth === 12 ? 'nim-btn--primary' : ''
                }`}
              >
                Jul–Des
              </button>
            </div>
          </div>
        </div>
      </section>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <Suspense fallback={<TabSectionFallback />}>
            {activeTab === 'payroll' && (
              <AdminPayrollTab
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                currentPeriodPayroll={currentPeriodPayroll}
                payrolls={payrolls}
                selectedPayroll={selectedPayroll}
                payrollDetails={payrollDetails}
                teachers={teachers}
                loading={loading}
                statusBadgeMap={STATUS_BADGE}
                onGenerateDraft={handleGenerateDraft}
                onRequestStatusChange={requestStatusChange}
                onInspectPayroll={handleInspectPayroll}
                onCloseSelectedPayroll={handleCloseSelectedPayroll}
              />
            )}

            {activeTab === 'attendance' && (
              <AdminAttendanceTab
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                periodInfo={periodInfo}
                teachers={teachers}
                attEdits={attEdits}
                attendanceLogs={attendanceLogs}
                validatingKey={validatingKey}
                onAttFieldChange={handleAttFieldChange}
                onSaveSingleAttendance={handleSaveSingleAttendance}
                onSaveAllAttendances={handleSaveAllAttendances}
                onApplyTeacherLogs={handleApplyTeacherLogs}
                onValidateAttendanceLogs={handleValidateAttendanceLogs}
                onOpenJtmCalc={handleOpenJtmCalc}
              />
            )}

            {activeTab === 'teachers' && (
              <AdminTeachersTab
                teachers={teachers}
                onOpenImportModal={openImportModal}
                onOpenAddModal={openAddTeacherModal}
                onOpenEditModal={openEditTeacherModal}
                onRequestDelete={requestDeleteTeacher}
              />
            )}

            {activeTab === 'disbursements' && (
              <DisbursementApprovalPanel
                role="admin"
                requests={disbursementRequests}
                onRefresh={handleRefreshDisbursements}
              />
            )}

            {activeTab === 'school_profile' && (
              <div className="space-y-6">
                <SchoolProfileSection />
                <DataArchiveSection onMaintenanceComplete={handleMaintenanceComplete} />
              </div>
            )}
          </Suspense>
        </motion.div>
      </AnimatePresence>

      {/* Lazy Modals: only loaded when opened */}
      {teacherModalOpen && (
        <Suspense fallback={null}>
          <TeacherFormModal
            isOpen={teacherModalOpen}
            isEditing={isEditingTeacher}
            teacherForm={teacherForm}
            setTeacherForm={setTeacherForm}
            onAddCustomComponent={addCustomComponent}
            onUpdateCustomComponent={updateCustomComponent}
            onRemoveCustomComponent={removeCustomComponent}
            onSubmit={handleSaveTeacher}
            onClose={() => setTeacherModalOpen(false)}
          />
        </Suspense>
      )}

      {importModalOpen && (
        <Suspense fallback={null}>
          <TeacherImportModal
            isOpen={importModalOpen}
            existingTeachers={teachers}
            onImportSubmit={handleBulkImportTeachers}
            onClose={() => setImportModalOpen(false)}
          />
        </Suspense>
      )}

      {jtmCalcTarget.isOpen && (
        <Suspense fallback={null}>
          <JtmCalculatorModal
            isOpen={jtmCalcTarget.isOpen}
            teacher={jtmCalcTarget.teacher}
            initialJtm={jtmCalcTarget.initialJtm}
            onApply={(computedJtm) => {
              if (jtmCalcTarget.teacher) {
                handleAttFieldChange(jtmCalcTarget.teacher.id, 'total_jtm', computedJtm);
                notify.info(
                  `Total JTM ${jtmCalcTarget.teacher.name} diatur ke ${formatRibuan(computedJtm)} Jam.`
                );
              }
            }}
            onClose={() => setJtmCalcTarget({ isOpen: false, teacher: null, initialJtm: 0 })}
          />
        </Suspense>
      )}

      {/* Mobile Floating Tab Bar */}
      <FloatingTabBar
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          {
            id: 'payroll',
            label: 'Penggajian',
            icon: Wallet,
            badge: outOfSyncDraftsCount > 0 ? outOfSyncDraftsCount : undefined,
          },
          { id: 'attendance', label: 'Kehadiran', icon: CalendarCheck },
          {
            id: 'disbursements',
            label: 'Pencairan',
            icon: Banknote,
            badge: pendingDisbursementsCount > 0 ? pendingDisbursementsCount : undefined,
          },
          { id: 'teachers', label: 'Master PTK', icon: Users, badge: teachers.length },
          { id: 'school_profile', label: 'Profil', icon: Building2 },
        ]}
      />

      {/* Custom Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </main>
  );
}

export default AdminDashboard;
