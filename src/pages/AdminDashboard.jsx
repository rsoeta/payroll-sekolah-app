import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  CalendarCheck,
  Wallet,
  Plus,
  Edit3,
  Trash2,
  Send,
  CheckCircle2,
  Calculator,
  FileDown,
  Upload,
  Save,
  X,
  Eye,
  Building2,
  Mail,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Check,
  Ban,
  Banknote,
  Bell,
} from 'lucide-react';
import api from '../services/gasApi';
import notify from '../utils/notify';
import {
  formatRupiah,
  formatRibuan,
  getStaffCategoryLabel,
  isInfaqZakatEnabled,
  parseCustomComponents,
  resolveInfaqZakatAmount,
  resolveStaffCategory,
  MONTHS_ID,
  getMonthName,
  normalizePeriodKey,
  buildPeriodMonthKey,
  parsePeriodMonthKey,
} from '../utils/formatters';
import {
  computeAttendanceBreakdownFromLogs,
  computeClassBreakdownFromLogs,
  formatAttendanceNumber,
  formatDateIndo,
  getAttendanceConditionMeta,
  getLogValidationMeta,
  normalizeLogValidationStatus,
} from '../utils/attendanceHelpers';
import {
  downloadBatchPayslipsPdf,
  downloadPayslipPdf,
} from '../utils/pdfSlipGenerator';
import ConfirmModal from '../components/ConfirmModal';
import JtmCalculatorModal from '../components/JtmCalculatorModal';
import TeacherImportModal, {
  downloadTeacherImportTemplate,
} from '../components/TeacherImportModal';
import TeacherFormModal from '../components/TeacherFormModal';
import FloatingTabBar from '../components/FloatingTabBar';
import SchoolProfileSection from '../components/SchoolProfileSection';
import DisbursementApprovalPanel from '../components/DisbursementApprovalPanel';
import { fetchSchoolProfileFromServer } from '../services/schoolProfileService';

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
    title: 'Profil Sekolah & Yayasan',
    desc: 'Sesuaikan kop sekolah, logo, dan penandatangan resmi pada Slip Gaji PDF.',
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
  const [expandedLogTeacherIds, setExpandedLogTeacherIds] = useState({});
  const [validatingKey, setValidatingKey] = useState('');
  const [rejectNoteEdits, setRejectNoteEdits] = useState({});
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

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [teacherList, payrollList, attList, logList, disbList] = await Promise.all([
        api.get('teachers.list'),
        api.get('payrolls.list'),
        api.get('attendances.list', { month: selectedMonth, year: selectedYear }),
        api.get('attendanceLogs.list', { month: selectedMonth, year: selectedYear }).catch(() => []),
        api.get('disbursements.list').catch(() => []),
      ]);
      setTeachers(teacherList || []);
      setPayrolls(payrollList || []);
      setAttendances(attList || []);
      setAttendanceLogs(Array.isArray(logList) ? logList : []);
      setDisbursementRequests(Array.isArray(disbList) ? disbList : []);

      const nextAttMap = {};
      (teacherList || []).forEach((t) => {
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
      setAttEdits(nextAttMap);
    } catch (err) {
      notify.error(err.message || 'Gagal memuat data administrasi.');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    loadAllData();
    fetchSchoolProfileFromServer();
  }, [loadAllData, refreshTrigger]);

  const pendingDisbursementsCount = disbursementRequests.filter(
    (r) => r.status === 'pending_treasurer'
  ).length;

  useEffect(() => {
    onBadgesChange?.({
      teachers: teachers.length,
      disbursements: pendingDisbursementsCount > 0 ? pendingDisbursementsCount : undefined,
    });
  }, [teachers.length, pendingDisbursementsCount, onBadgesChange]);

  const openEditTeacherModal = useCallback((teacher) => {
    const comp = teacher.salary_component || {};
    const infaqEnabled = isInfaqZakatEnabled(comp);
    setIsEditingTeacher(true);
    setTeacherForm({
      id: teacher.id,
      nip: teacher.nip || '',
      name: teacher.name || '',
      staff_category: resolveStaffCategory(teacher),
      status: teacher.status || 'GTY (Guru Tetap Yayasan)',
      bank_account: teacher.bank_account || '',
      email: teacher.email || '',
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

  const openAddTeacherModal = () => {
    setIsEditingTeacher(false);
    setTeacherForm(INITIAL_TEACHER_FORM);
    setTeacherModalOpen(true);
  };

  const addCustomComponent = (type = 'deduction', label = '', amount = 50000) => {
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
  };

  const updateCustomComponent = (id, field, value) => {
    setTeacherForm((prev) => ({
      ...prev,
      custom_components: (prev.custom_components || []).map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }));
  };

  const removeCustomComponent = (id) => {
    setTeacherForm((prev) => ({
      ...prev,
      custom_components: (prev.custom_components || []).filter((item) => item.id !== id),
    }));
  };

  const handleSaveTeacher = async (e) => {
    e.preventDefault();
    if (!teacherForm.nip.trim() || !teacherForm.name.trim() || !teacherForm.bank_account.trim()) {
      notify.warn('NIP, Nama Lengkap, dan Nomor Rekening wajib diisi.');
      return;
    }

    const cleanEmail = String(teacherForm.email || '')
      .trim()
      .toLowerCase();
    if (cleanEmail && !cleanEmail.includes('@')) {
      notify.warn('Masukkan alamat Gmail yang valid (contoh: nama.guru@gmail.com).');
      return;
    }

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
      loadAllData();
    } catch (err) {
      notify.error(err.message || 'Gagal menyimpan data guru.');
    }
  };

  const requestDeleteTeacher = (teacher) => {
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
          loadAllData();
        } catch (err) {
          notify.error(err.message || 'Gagal menghapus data guru.');
        }
      },
    });
  };

  const handleBulkImportTeachers = async (rows, onProgress) => {
    try {
      const bulkResult = await api.post('teachers.bulkImport', { items: rows });
      notify.success(
        `Import selesai! ${formatRibuan(bulkResult.createdCount || 0)} baru, ${formatRibuan(
          bulkResult.updatedCount || 0
        )} diperbarui.`
      );
      await loadAllData();
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
        await loadAllData();
      } else {
        throw bulkErr;
      }
    }
  };

  /* --- ATTENDANCE & JTM HANDLERS --- */

  const handleAttFieldChange = (teacherId, field, value) => {
    const cleanNum = Math.max(0, Number(value || 0));
    setAttEdits((prev) => ({
      ...prev,
      [teacherId]: {
        ...(prev[teacherId] || { present_days: 0, absent_days: 0, total_jtm: 0 }),
        [field]: cleanNum,
      },
    }));
  };

  const handleSaveSingleAttendance = async (teacher) => {
    const row = attEdits[teacher.id];
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
      notify.success(`Kehadiran ${teacher.name} disimpan.`);
      loadAllData();
    } catch (err) {
      notify.error(err.message || 'Gagal menyimpan kehadiran.');
    }
  };

  const handleSaveAllAttendances = async () => {
    try {
      for (const t of teachers) {
        const row = attEdits[t.id] || { present_days: 0, absent_days: 0, total_jtm: 0 };
        await api.post('attendances.upsert', {
          teacher_id: t.id,
          month: selectedMonth,
          year: selectedYear,
          present_days: row.present_days,
          absent_days: row.absent_days,
          total_jtm: row.total_jtm,
        });
      }
      notify.success(`Seluruh data kehadiran ${getMonthName(selectedMonth)} ${selectedYear} tersimpan!`);
      loadAllData();
    } catch (err) {
      notify.error(err.message || 'Gagal menyimpan kehadiran kolektif.');
    }
  };

  const handleValidateAttendanceLogs = async (
    ids,
    validationStatus,
    validationNote = '',
    keyTag = ''
  ) => {
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
      await loadAllData();
    } catch (err) {
      notify.error(err.message || 'Gagal memperbarui status validasi log.');
    } finally {
      setValidatingKey('');
    }
  };

  /* --- PAYROLL FLOW HANDLERS --- */

  const handleGenerateDraft = async () => {
    try {
      const generated = await api.post('payrolls.generateDraft', {
        month: selectedMonth,
        year: selectedYear,
      });
      notify.success(
        `Draf Payroll ${getMonthName(selectedMonth)} ${selectedYear} berhasil dikalkulasi!`
      );
      await loadAllData();
      handleInspectPayroll(generated);
    } catch (err) {
      notify.error(err.message || 'Gagal men-generate draf payroll.');
    }
  };

  const requestStatusChange = (payrollRow, nextStatus, title, message, variant = 'primary') => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      variant,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          const updated = await api.put('payrolls.updateStatus', {
            id: payrollRow.id,
            status: nextStatus,
          });
          notify.success(`Status payroll diperbarui menjadi: ${nextStatus.toUpperCase()}`);
          if (selectedPayroll && selectedPayroll.id === payrollRow.id) {
            setSelectedPayroll(updated);
          }
          loadAllData();
        } catch (err) {
          notify.error(err.message || 'Gagal memperbarui status payroll.');
        }
      },
    });
  };

  const currentPeriodPayroll = payrolls.find(
    (p) =>
      normalizePeriodKey(p.month) === normalizePeriodKey(selectedMonth) &&
      Number(p.year) === Number(selectedYear)
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
                Ada {pendingDisbursementsCount} Pengajuan Pencairan Gaji PTK Baru Menunggu Persetujuan Bendahara
              </p>
              <p className="text-[11px] text-[var(--ink-2)]">
                Periksa pengajuan pencairan sebagian/penuh agar dapat diteruskan ke Kepala Sekolah untuk penerbitan slip.
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

      {/* Top KPI Summary Cards (Single Row on Mobile & Desktop) */}
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
          {/* Inline Quick Switcher (Desktop >= 761px, synced with Sidebar) */}
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
              { id: 'payroll', label: 'Alur Penggajian', icon: Wallet },
              { id: 'attendance', label: 'Kehadiran & JTM', icon: CalendarCheck },
              {
                id: 'disbursements',
                label: 'Pencairan PTK',
                icon: Banknote,
                badge: pendingDisbursementsCount,
              },
              { id: 'teachers', label: 'Master PTK & Gaji', icon: Users },
              { id: 'school_profile', label: 'Profil Sekolah', icon: Building2 },
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

            {/* Quick Period Range Presets */}
            <div className="flex flex-wrap items-center gap-1">
              {periodInfo.isRange && (
                <span className="nim-badge nim-badge--accent">{periodInfo.monthCount} Bulan</span>
              )}
              <button
                type="button"
                onClick={() => setEndMonth(startMonth)}
                className={`nim-btn nim-btn--sm text-[11px] ${!periodInfo.isRange ? 'nim-btn--primary' : ''
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
                className={`nim-btn nim-btn--sm text-[11px] ${startMonth === 1 && endMonth === 6 ? 'nim-btn--primary' : ''
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
                className={`nim-btn nim-btn--sm text-[11px] ${startMonth === 7 && endMonth === 12 ? 'nim-btn--primary' : ''
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
          {/* TAB 1: ALUR PENGGAJIAN */}
          {activeTab === 'payroll' && (
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
                        Gaji Pokok + (JTM × Tarif) + Tunjangan Jabatan + Tunj (+) − Infaq / Zakat
                        Profesi 2,5% (opsional)
                      </code>
                      <span className="mt-1 block text-[11px] text-[var(--muted)]">
                        Infaq / Zakat Profesi = 2,5% × [Gaji Pokok + (JTM × Tarif) + Tunjangan
                        Jabatan + Tunjangan Custom (Tunj +)], otomatis dipotong saat kalkulasi bagi
                        PTK yang mengaktifkan opsi.
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {(!currentPeriodPayroll || currentPeriodPayroll.status === 'draft') && (
                      <button
                        type="button"
                        onClick={handleGenerateDraft}
                        disabled={loading}
                        className="nim-btn nim-btn--primary"
                      >
                        <Calculator className="h-3.5 w-3.5" />
                        <span>
                          {currentPeriodPayroll
                            ? 'Kalkulasi Ulang Draf'
                            : 'Generate Draf Penggajian'}
                        </span>
                      </button>
                    )}

                    {currentPeriodPayroll && currentPeriodPayroll.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() =>
                          requestStatusChange(
                            currentPeriodPayroll,
                            'submitted',
                            'Ajukan Penggajian ke Kepala Sekolah',
                            `Ajukan draf gaji periode ${getMonthName(selectedMonth)} ${selectedYear} sebesar ${formatRupiah(
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
                          requestStatusChange(
                            currentPeriodPayroll,
                            'paid',
                            'Konfirmasi Pencairan Gaji',
                            `Tandai penggajian ${getMonthName(selectedMonth)} ${selectedYear} sebagai SUDAH DIBAYARKAN? Slip gaji digital akan diterbitkan ke dasbor masing-masing guru.`,
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
              </div>

              {/* Payroll Periods List */}
              <div className="space-y-3">
                <h3 className="text-base font-bold text-[var(--ink)]">
                  Daftar Periode Penggajian
                </h3>
                <div className="fluid-container">
                  {payrolls.map((pr) => {
                    const badge = STATUS_BADGE[pr.status] || STATUS_BADGE.draft;
                    return (
                      <div
                        key={pr.id}
                        className="fluid-item nim-glass nim-card flex flex-col justify-between gap-4"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-base font-bold text-[var(--ink)]">
                              {getMonthName(pr.month)} {pr.year}
                            </span>
                            <span className={badge.cls}>{badge.label}</span>
                          </div>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            Total anggaran gaji periode berjalan
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
                            onClick={() => handleInspectPayroll(pr)}
                            className="nim-btn"
                          >
                            <Eye className="h-3.5 w-3.5 text-[var(--accent-text)]" />
                            <span>Rincian Slip</span>
                          </button>

                          {pr.status === 'draft' && (
                            <button
                              type="button"
                              onClick={() =>
                                requestStatusChange(
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
                                requestStatusChange(
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
              </div>

              {/* Selected Payroll Details Breakdown — Dipisah menjadi 2 Card: Tenaga Pendidik & Tenaga Kependidikan */}
              {selectedPayroll &&
                (() => {
                  const enrichedDetails = payrollDetails.map((detail) => {
                    let parsed = {};
                    try {
                      parsed = JSON.parse(detail.details_json || '{}');
                    } catch {
                      parsed = {};
                    }
                    const linkedTeacher = teachers.find((t) => t.id === detail.teacher_id);
                    const staffCategory = resolveStaffCategory(
                      {
                        staff_category: parsed.staff_category || linkedTeacher?.staff_category,
                        status: parsed.status || linkedTeacher?.status,
                      }
                    );
                    return { detail, parsed, staffCategory };
                  });

                  const groups = [
                    {
                      id: 'pendidik',
                      title: `Rincian Slip Gaji Tenaga Pendidik (Guru) — ${getMonthName(
                        selectedPayroll.month
                      )} ${selectedPayroll.year}`,
                      subtitle: 'Tenaga Pendidik (Guru Mata Pelajaran, Wali Kelas, Pengajar)',
                      emptyText: 'Belum ada data Tenaga Pendidik pada periode penggajian ini.',
                      items: enrichedDetails.filter((x) => x.staffCategory === 'pendidik'),
                      showCloseButton: true,
                    },
                    {
                      id: 'kependidikan',
                      title: `Rincian Slip Gaji Tenaga Kependidikan — ${getMonthName(
                        selectedPayroll.month
                      )} ${selectedPayroll.year}`,
                      subtitle:
                        'Staf TU, Pustakawan, Laboran & Teknisi Sumber Belajar, Penguji, Petugas Keamanan, Tenaga Kebersihan',
                      emptyText:
                        'Belum ada pegawai berstatus Tenaga Kependidikan pada periode ini. Atur kategori pada menu Master PTK & Gaji.',
                      items: enrichedDetails.filter((x) => x.staffCategory === 'kependidikan'),
                      showCloseButton: false,
                    },
                  ];

                  return (
                    <div className="space-y-4">
                      {groups.map((grp) => {
                        const groupBudget = grp.items.reduce(
                          (acc, x) => acc + Number(x.detail.net_salary || 0),
                          0
                        );
                        return (
                          <div key={grp.id} className="nim-glass nim-card space-y-4">
                            <div
                              className="flex flex-wrap items-center justify-between gap-2 pb-3"
                              style={{ borderBottom: '1px solid var(--line)' }}
                            >
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-base font-bold text-[var(--ink)]">
                                    {grp.title}
                                  </h4>
                                  <span
                                    className={`nim-badge ${grp.id === 'kependidikan'
                                        ? 'nim-badge--warn'
                                        : 'nim-badge--accent'
                                      }`}
                                  >
                                    {formatRibuan(grp.items.length)} Orang
                                  </span>
                                </div>
                                <p className="mt-0.5 text-xs text-[var(--muted)]">
                                  {grp.subtitle} • Subtotal:{' '}
                                  <strong className="text-[var(--ink)] tabular-nums">
                                    {formatRupiah(groupBudget)}
                                  </strong>{' '}
                                  (Total Anggaran Keseluruhan:{' '}
                                  <strong className="text-[var(--ink)] tabular-nums">
                                    {formatRupiah(selectedPayroll.total_budget)}
                                  </strong>
                                  )
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {grp.items.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      downloadBatchPayslipsPdf(
                                        grp.items.map(({ detail }) => ({
                                          ...detail,
                                          month: selectedPayroll.month,
                                          year: selectedPayroll.year,
                                          payroll_status: selectedPayroll.status,
                                        })),
                                        `${grp.id}_${getMonthName(selectedPayroll.month)}_${selectedPayroll.year
                                        }`
                                      );
                                      notify.success(
                                        `Mengunduh ${grp.items.length} slip PDF (${grp.title}, 2 slip per halaman A4).`
                                      );
                                    }}
                                    className="nim-btn nim-btn--primary nim-btn--sm"
                                  >
                                    <FileDown className="h-3.5 w-3.5" />
                                    <span>Cetak Semua (2/Hal A4)</span>
                                  </button>
                                )}
                                {grp.showCloseButton && (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedPayroll(null)}
                                    aria-label="Tutup rincian"
                                    className="nim-ibtn"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {grp.items.length === 0 ? (
                              <div
                                className="nim-card-well p-4 text-center text-xs text-[var(--muted)]"
                                style={{ border: '1px dashed var(--line-2)' }}
                              >
                                {grp.emptyText}
                              </div>
                            ) : (
                              <div className="fluid-container">
                                {grp.items.map(({ detail, parsed }) => (
                                  <div
                                    key={detail.id}
                                    className="fluid-item nim-card-well p-4 space-y-2.5"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <p className="font-bold text-[var(--ink)]">
                                          {parsed.teacher_name}
                                        </p>
                                        <p className="text-xs text-[var(--muted)]">
                                          NIP: {parsed.nip} • {parsed.status} •{' '}
                                          {parsed.bank_account}
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
                                        Honor JTM ({parsed.total_jtm} ×{' '}
                                        {formatRupiah(parsed.hourly_rate)}):
                                      </span>
                                      <span className="text-right font-semibold text-[var(--ink)] tabular-nums">
                                        {formatRupiah(parsed.jtm_honor)}
                                      </span>
                                      <span>Tunjangan Jabatan:</span>
                                      <span className="text-right font-semibold text-[var(--ink)] tabular-nums">
                                        {formatRupiah(parsed.position_allowance)}
                                      </span>
                                      {parseCustomComponents(parsed.custom_components).map(
                                        (cust) => (
                                          <React.Fragment key={cust.id}>
                                            <span>
                                              {cust.type === 'allowance'
                                                ? `+ ${cust.label}:`
                                                : `- ${cust.label}:`}
                                            </span>
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
                                        )
                                      )}
                                      {(() => {
                                        const infaqZakat = resolveInfaqZakatAmount(parsed);
                                        return (
                                          <>
                                            <span>Infaq / Zakat Profesi (2,5%):</span>
                                            <span
                                              className="text-right font-semibold tabular-nums"
                                              style={{
                                                color:
                                                  infaqZakat > 0
                                                    ? 'var(--bad-text)'
                                                    : 'var(--muted)',
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
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
            </section>
          )}

          {/* TAB 2: INPUT KEHADIRAN & JTM */}
          {activeTab === 'attendance' && (
            <section className="space-y-4">
              <div className="nim-glass nim-card flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[var(--ink)]">
                    Input Kehadiran &amp; JTM — {getMonthName(selectedMonth)} {selectedYear}
                  </h2>
                  <p className="text-xs text-[var(--muted)]">
                    Catat Hari Hadir, Hari Alpa, dan Total JTM bulanan sebagai dasar perhitungan
                    otomatis.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveAllAttendances}
                  className="nim-btn nim-btn--primary"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>Simpan Semua Kehadiran</span>
                </button>
              </div>

              <div className="fluid-container">
                {teachers.map((teacher) => {
                  const row = attEdits[teacher.id] || {
                    present_days: 0,
                    absent_days: 0,
                    total_jtm: 0,
                  };
                  const hourlyRate = Number(teacher.salary_component?.hourly_rate || 0);
                  const estimatedHonor = row.total_jtm * hourlyRate;
                  const teacherLogs = attendanceLogs.filter((l) => l.teacher_id === teacher.id);
                  const logBreakdown =
                    teacherLogs.length > 0 ? computeAttendanceBreakdownFromLogs(teacherLogs) : null;
                  const classBreakdown =
                    teacherLogs.length > 0 ? computeClassBreakdownFromLogs(teacherLogs) : [];
                  const isLogsExpanded = Boolean(expandedLogTeacherIds[teacher.id]);

                  return (
                    <div
                      key={teacher.id}
                      className="fluid-item nim-glass nim-card space-y-4"
                    >
                      <div
                        className="flex items-start justify-between gap-2 pb-3"
                        style={{ borderBottom: '1px solid var(--line)' }}
                      >
                        <div>
                          <h3 className="font-bold text-[var(--ink)]">{teacher.name}</h3>
                          <p className="text-xs text-[var(--muted)]">
                            NIP: {teacher.nip} • Tarif JTM: {formatRupiah(hourlyRate)}/jam
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSaveSingleAttendance(teacher)}
                          className="nim-btn nim-btn--sm shrink-0"
                          style={{
                            background: 'var(--accent-soft)',
                            color: 'var(--accent-text)',
                          }}
                        >
                          <Save className="h-3.5 w-3.5" />
                          <span>Simpan</span>
                        </button>
                      </div>

                      {logBreakdown && (
                        <div
                          className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3 space-y-2 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5 font-semibold text-emerald-800">
                              <ClipboardList className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                Catatan Mandiri ({logBreakdown.counted_log_count}/
                                {logBreakdown.log_count} entri terhitung)
                              </span>
                              {logBreakdown.pending_count > 0 && (
                                <span className="nim-badge nim-badge--warn !text-[10px]">
                                  {logBreakdown.pending_count} Belum Divalidasi
                                </span>
                              )}
                              {logBreakdown.invalid_count > 0 && (
                                <span className="nim-badge nim-badge--bad !text-[10px]">
                                  {logBreakdown.invalid_count} Tidak Valid
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {logBreakdown.pending_count > 0 && (
                                <button
                                  type="button"
                                  disabled={Boolean(validatingKey)}
                                  onClick={() =>
                                    handleValidateAttendanceLogs(
                                      teacherLogs
                                        .filter(
                                          (l) =>
                                            normalizeLogValidationStatus(l.validation_status) ===
                                            'pending'
                                        )
                                        .map((l) => l.id),
                                      'valid',
                                      '',
                                      `bulk:${teacher.id}`
                                    )
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-400 bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                >
                                  <Check className="h-3 w-3" />
                                  <span>
                                    {validatingKey === `bulk:${teacher.id}`
                                      ? 'Memvalidasi...'
                                      : 'Validasi Semua'}
                                  </span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setAttEdits((prev) => ({
                                    ...prev,
                                    [teacher.id]: {
                                      present_days: logBreakdown.present_days,
                                      absent_days: logBreakdown.absent_days,
                                      total_jtm: logBreakdown.total_jtm,
                                    },
                                  }));
                                  notify.info(
                                    `Nilai rekap ${teacher.name} disinkronkan dari log valid.`
                                  );
                                }}
                                className="rounded-lg border border-emerald-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
                              >
                                Terapkan Log
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedLogTeacherIds((prev) => ({
                                    ...prev,
                                    [teacher.id]: !prev[teacher.id],
                                  }))
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                <span>{isLogsExpanded ? 'Tutup Log' : 'Validasi / Lihat Log'}</span>
                                {isLogsExpanded ? (
                                  <ChevronUp className="h-3 w-3" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-700 tabular-nums">
                            <span>
                              Hadir: <strong>{logBreakdown.hadir_count}</strong> (×1)
                            </span>
                            <span>•</span>
                            <span>
                              Tugas: <strong>{logBreakdown.tugas_count}</strong> (×0,5)
                            </span>
                            <span>•</span>
                            <span>
                              Sakit: <strong>{logBreakdown.sakit_count}</strong> (0)
                            </span>
                            <span>•</span>
                            <span>
                              Izin: <strong>{logBreakdown.izin_count}</strong> (0)
                            </span>
                            <span>•</span>
                            <span className="font-semibold text-emerald-800">
                              Total Terhitung: {formatAttendanceNumber(logBreakdown.present_days)}{' '}
                              Hadir / {formatAttendanceNumber(logBreakdown.total_jtm)} JTM (
                              {classBreakdown.length} Kelas)
                            </span>
                          </div>

                          {classBreakdown.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {classBreakdown.map((cb) => (
                                <span
                                  key={cb.class_name}
                                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white/90 px-2 py-0.5 text-[10.5px] font-semibold text-slate-700 tabular-nums"
                                >
                                  <span className="text-emerald-800">{cb.class_name}:</span>
                                  <span>
                                    {formatAttendanceNumber(cb.present_days)} hr •{' '}
                                    {formatAttendanceNumber(cb.total_jtm)} JTM
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}

                          {isLogsExpanded && (
                            <div className="mt-2 max-h-60 overflow-y-auto space-y-2 border-t border-emerald-200/70 pt-2">
                              {teacherLogs.map((lg) => {
                                const cond = getAttendanceConditionMeta(lg.status);
                                const vStatus = normalizeLogValidationStatus(lg.validation_status);
                                const vMeta = getLogValidationMeta(vStatus);
                                const isInvalid = vStatus === 'invalid';
                                const isBusy = validatingKey === lg.id;
                                const noteDraft =
                                  rejectNoteEdits[lg.id] !== undefined
                                    ? rejectNoteEdits[lg.id]
                                    : lg.validation_note || '';

                                return (
                                  <div
                                    key={lg.id}
                                    className={`rounded-lg px-2.5 py-2 text-[11px] border space-y-1.5 ${isInvalid
                                        ? 'border-rose-300 bg-rose-50/70'
                                        : vStatus === 'valid'
                                          ? 'border-emerald-300/80 bg-white'
                                          : 'border-slate-200 bg-white/95'
                                      }`}
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div className="min-w-0 space-y-0.5">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span className="font-semibold text-slate-800">
                                            {formatDateIndo(lg.date)}
                                          </span>
                                          <span className="inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                                            {lg.class_name || 'Kelas Umum'}
                                          </span>
                                          <span className="text-slate-600">
                                            — {cond.label} ({cond.badgeText})
                                          </span>
                                          <span className={`${vMeta.badgeCls} !text-[9.5px]`}>
                                            {vMeta.shortLabel}
                                          </span>
                                        </div>
                                        {lg.note && (
                                          <span className="block text-[10.5px] text-slate-500">
                                            Catatan Guru: “{lg.note}”
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                        <span
                                          className={`font-bold tabular-nums mr-1 ${isInvalid
                                              ? 'line-through text-rose-500'
                                              : 'text-indigo-700'
                                            }`}
                                        >
                                          +{formatAttendanceNumber(cond.presentWeight)} •{' '}
                                          {formatAttendanceNumber(
                                            cond.allowsJtm ? lg.jtm_hours : 0
                                          )}{' '}
                                          JTM
                                        </span>

                                        <button
                                          type="button"
                                          disabled={isBusy}
                                          onClick={() =>
                                            handleValidateAttendanceLogs(lg.id, 'valid', '', lg.id)
                                          }
                                          title="Tandai log ini Valid (masuk hitungan Kehadiran & JTM)"
                                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-semibold border transition-colors ${vStatus === 'valid'
                                              ? 'border-emerald-600 bg-emerald-600 text-white'
                                              : 'border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50'
                                            }`}
                                        >
                                          <Check className="h-3 w-3" />
                                          <span>Valid</span>
                                        </button>

                                        <button
                                          type="button"
                                          disabled={isBusy}
                                          onClick={() =>
                                            handleValidateAttendanceLogs(
                                              lg.id,
                                              'invalid',
                                              noteDraft,
                                              lg.id
                                            )
                                          }
                                          title="Tandai Tidak Valid (tidak dihitung ke Kehadiran & JTM)"
                                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-semibold border transition-colors ${isInvalid
                                              ? 'border-rose-600 bg-rose-600 text-white'
                                              : 'border-rose-300 bg-white text-rose-700 hover:bg-rose-50'
                                            }`}
                                        >
                                          <Ban className="h-3 w-3" />
                                          <span>Tidak Valid</span>
                                        </button>
                                      </div>
                                    </div>

                                    {isInvalid && (
                                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-rose-200/70">
                                        <input
                                          type="text"
                                          maxLength={160}
                                          value={noteDraft}
                                          onChange={(e) =>
                                            setRejectNoteEdits((prev) => ({
                                              ...prev,
                                              [lg.id]: e.target.value,
                                            }))
                                          }
                                          placeholder="Alasan penolakan (opsional, misal: tidak sesuai jadwal)..."
                                          className="flex-1 min-w-[160px] rounded-md border border-rose-200 bg-white px-2 py-0.5 text-[10.5px] text-slate-700 focus:border-rose-400 focus:outline-none"
                                        />
                                        <button
                                          type="button"
                                          disabled={isBusy}
                                          onClick={() =>
                                            handleValidateAttendanceLogs(
                                              lg.id,
                                              'invalid',
                                              noteDraft,
                                              lg.id
                                            )
                                          }
                                          className="rounded-md bg-rose-600 px-2 py-0.5 text-[10.5px] font-semibold text-white hover:bg-rose-700"
                                        >
                                          Simpan Alasan
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="fluid-container gap-2.5 sm:gap-3">
                        <div className="fluid-item-xs">
                          <label className="block text-xs font-semibold text-[var(--ink-2)]">
                            Hari Hadir
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            max={31 * periodInfo.monthCount}
                            value={row.present_days}
                            onChange={(e) =>
                              handleAttFieldChange(teacher.id, 'present_days', e.target.value)
                            }
                            className="nim-input mt-1 text-xs font-semibold tabular-nums"
                          />
                        </div>

                        <div className="fluid-item-xs">
                          <label className="block text-xs font-semibold text-[var(--ink-2)]">
                            Tidak Hadir (Sakit/Izin/Alpa)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            max={31 * periodInfo.monthCount}
                            value={row.absent_days}
                            onChange={(e) =>
                              handleAttFieldChange(teacher.id, 'absent_days', e.target.value)
                            }
                            className="nim-input mt-1 text-xs font-semibold tabular-nums"
                          />
                        </div>

                        <div className="fluid-item-xs">
                          <label className="block text-xs font-semibold text-[var(--accent-text)]">
                            Total JTM (Jam)
                          </label>
                          <div className="mt-1 flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              max={200 * periodInfo.monthCount}
                              value={row.total_jtm}
                              onChange={(e) =>
                                handleAttFieldChange(teacher.id, 'total_jtm', e.target.value)
                              }
                              className="nim-input text-xs font-bold tabular-nums"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setJtmCalcTarget({
                                  isOpen: true,
                                  teacher,
                                  initialJtm: row.total_jtm,
                                })
                              }
                              title="Buka Kalkulator JTM"
                              aria-label={`Buka Kalkulator JTM untuk ${teacher.name}`}
                              className="nim-btn nim-btn--primary nim-btn--sm shrink-0"
                            >
                              <Calculator className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Kalkulator</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="nim-card-well flex items-center justify-between px-3.5 py-2.5 text-xs">
                        <span className="text-[var(--muted)]">
                          Estimasi Honor Mengajar (JTM × Tarif):
                        </span>
                        <span className="font-bold text-[var(--accent-text)] tabular-nums">
                          {formatRupiah(estimatedHonor)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* TAB 3: MASTER DATA PTK & KOMPONEN GAJI */}
          {activeTab === 'teachers' && (
            <section className="space-y-4">
              <div className="nim-glass nim-card flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[var(--ink)]">
                    Master Data PTK &amp; Komponen Gaji
                  </h2>
                  <p className="text-xs text-[var(--muted)]">
                    Kelola profil Tenaga Pendidik (Guru) &amp; Tenaga Kependidikan, rekening bank,
                    rincian gaji, serta akun Gmail portal.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      downloadTeacherImportTemplate();
                      notify.info('Format Template Import Excel (.xlsx) berhasil diunduh.');
                    }}
                    className="nim-btn"
                  >
                    <FileDown className="h-3.5 w-3.5 text-[var(--accent-text)]" />
                    <span>Unduh Format Import (.XLSX)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setImportModalOpen(true)}
                    className="nim-btn"
                    style={{
                      background: 'var(--good-soft)',
                      color: 'var(--good-text)',
                      boxShadow: 'inset 0 0 0 1px var(--good-line)',
                    }}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Import Data (.XLSX)</span>
                  </button>

                  <button
                    type="button"
                    onClick={openAddTeacherModal}
                    className="nim-btn nim-btn--primary"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Tambah Data PTK Baru</span>
                  </button>
                </div>
              </div>

              <div className="fluid-container">
                {teachers.map((t) => {
                  const comp = t.salary_component || {};
                  const catId = resolveStaffCategory(t);
                  const catLabel = getStaffCategoryLabel(catId);
                  return (
                    <div
                      key={t.id}
                      className="fluid-item nim-glass nim-card flex flex-col justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              <span
                                className={`nim-badge !text-[10.5px] ${catId === 'kependidikan'
                                    ? 'nim-badge--warn'
                                    : 'nim-badge--good'
                                  }`}
                              >
                                {catLabel}
                              </span>
                            </div>
                            <h3 className="text-base font-bold text-[var(--ink)]">{t.name}</h3>
                            <p className="text-xs text-[var(--muted)]">
                              NIP: {t.nip} • {t.status}
                            </p>
                            {t.email && (
                              <p className="nim-badge nim-badge--accent mt-1.5">
                                <Mail className="h-3 w-3" />
                                <span>{t.email}</span>
                              </p>
                            )}
                          </div>
                          <span className="nim-badge shrink-0">{t.bank_account}</span>
                        </div>

                        <div className="nim-card-well mt-4 grid grid-cols-2 gap-2.5 p-3 text-xs">
                          <div>
                            <span className="text-[var(--muted)] block">Gaji Pokok</span>
                            <span className="font-bold text-[var(--ink)] tabular-nums">
                              {formatRupiah(comp.base_salary)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[var(--muted)] block">Tarif / JTM</span>
                            <span className="font-bold text-[var(--accent-text)] tabular-nums">
                              {formatRupiah(comp.hourly_rate)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[var(--muted)] block">Tunjangan Jabatan</span>
                            <span className="font-bold text-[var(--ink)] tabular-nums">
                              {formatRupiah(comp.position_allowance)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[var(--muted)] block">
                              Infaq / Zakat Profesi (2,5%)
                            </span>
                            {(() => {
                              const infaqEnabled = isInfaqZakatEnabled(comp);
                              return (
                                <span
                                  className="font-bold"
                                  style={{
                                    color: infaqEnabled ? 'var(--good-text)' : 'var(--muted)',
                                  }}
                                >
                                  {infaqEnabled ? 'Aktif (2,5% di Payroll)' : 'Tidak Aktif (Rp 0)'}
                                </span>
                              );
                            })()}
                          </div>
                        </div>

                        {parseCustomComponents(comp.custom_components_json).length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {parseCustomComponents(comp.custom_components_json).map((cust) => (
                              <span
                                key={cust.id}
                                className={`nim-badge ${cust.type === 'allowance' ? 'nim-badge--good' : 'nim-badge--bad'
                                  }`}
                              >
                                <span>{cust.label}:</span>
                                <span className="tabular-nums">
                                  {cust.type === 'allowance' ? '+' : '-'}{' '}
                                  {formatRupiah(cust.amount)}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div
                        className="flex items-center justify-end gap-2 pt-3"
                        style={{ borderTop: '1px solid var(--line)' }}
                      >
                        <button
                          type="button"
                          onClick={() => openEditTeacherModal(t)}
                          className="nim-btn nim-btn--sm"
                        >
                          <Edit3 className="h-3.5 w-3.5 text-[var(--accent-text)]" />
                          <span>Edit Data &amp; Gaji</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDeleteTeacher(t)}
                          className="nim-btn nim-btn--danger nim-btn--sm"
                          aria-label={`Hapus ${t.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* TAB 4: PENGAJUAN PENCAIRAN PTK */}
          {activeTab === 'disbursements' && (
            <DisbursementApprovalPanel
              role="admin"
              requests={disbursementRequests}
              onRefresh={loadAllData}
            />
          )}

          {/* TAB 5: PROFIL & IDENTITAS SEKOLAH */}
          {activeTab === 'school_profile' && <SchoolProfileSection />}
        </motion.div>
      </AnimatePresence>

      {/* Modal: Create / Edit Teacher & Salary Components */}
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

      {/* Bulk Import Teachers & Salary Components Modal */}
      <TeacherImportModal
        isOpen={importModalOpen}
        existingTeachers={teachers}
        onImportSubmit={handleBulkImportTeachers}
        onClose={() => setImportModalOpen(false)}
      />

      {/* JTM Interactive Calculator Modal */}
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

      {/* Mobile Floating Tab Bar */}
      <FloatingTabBar
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'payroll', label: 'Penggajian', icon: Wallet },
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
