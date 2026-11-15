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
} from 'lucide-react';
import api from '../services/gasApi';
import notify from '../utils/notify';
import {
  formatRupiah,
  formatRibuan,
  parseRibuan,
  parseCustomComponents,
  summarizeCustomComponents,
  MONTHS_ID,
  getMonthName,
  normalizePeriodKey,
  buildPeriodMonthKey,
  parsePeriodMonthKey,
} from '../utils/formatters';
import { downloadPayslipPdf } from '../utils/pdfSlipGenerator';
import ConfirmModal from '../components/ConfirmModal';
import JtmCalculatorModal from '../components/JtmCalculatorModal';
import TeacherImportModal, {
  downloadTeacherImportTemplate,
} from '../components/TeacherImportModal';
import FloatingTabBar from '../components/FloatingTabBar';
import SchoolProfileSection from '../components/SchoolProfileSection';
import { fetchSchoolProfileFromServer } from '../services/schoolProfileService';

const STATUS_BADGE = {
  draft: { label: 'Draf', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
  submitted: { label: 'Menunggu Persetujuan', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  approved: { label: 'Disetujui Kepsek', cls: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  paid: { label: 'Sudah Dibayarkan', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
};

const INITIAL_TEACHER_FORM = {
  id: '',
  nip: '',
  name: '',
  status: 'GTY (Guru Tetap Yayasan)',
  bank_account: '',
  email: '',
  base_salary: 3000000,
  hourly_rate: 50000,
  position_allowance: 500000,
  bpjs_deduction: 120000,
  custom_components: [],
};

export function AdminDashboard({ refreshTrigger }) {
  const [activeTab, setActiveTab] = useState('payroll'); // 'payroll' | 'teachers' | 'attendance'
  const [teachers, setTeachers] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [attendances, setAttendances] = useState([]);
  const [startMonth, setStartMonth] = useState(11);
  const [endMonth, setEndMonth] = useState(11);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [loading, setLoading] = useState(false);

  const selectedMonth = buildPeriodMonthKey(startMonth, endMonth);
  const periodInfo = parsePeriodMonthKey(selectedMonth);

  // Teacher Form Modal state
  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [teacherForm, setTeacherForm] = useState(INITIAL_TEACHER_FORM);
  const [isEditingTeacher, setIsEditingTeacher] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Attendance local edits map: { [teacherId]: { present_days, absent_days, total_jtm } }
  const [attEdits, setAttEdits] = useState({});
  const [jtmCalcTarget, setJtmCalcTarget] = useState({
    isOpen: false,
    teacher: null,
    initialJtm: 0,
  });

  // Payroll Details drawer/modal
  const [selectedPayroll, setSelectedPayroll] = useState(null);
  const [payrollDetails, setPayrollDetails] = useState([]);

  // Confirmation modal state (replaces native confirm())
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
      const [teacherList, payrollList, attList] = await Promise.all([
        api.get('teachers.list'),
        api.get('payrolls.list'),
        api.get('attendances.list', { month: selectedMonth, year: selectedYear }),
      ]);
      setTeachers(teacherList || []);
      setPayrolls(payrollList || []);
      setAttendances(attList || []);

      const nextAttMap = {};
      (teacherList || []).forEach((t) => {
        const found = (attList || []).find((a) => a.teacher_id === t.id);
        nextAttMap[t.id] = {
          present_days: found ? Number(found.present_days) : 20,
          absent_days: found ? Number(found.absent_days) : 0,
          total_jtm: found ? Number(found.total_jtm) : 24,
        };
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

  /* --- TEACHER & SALARY COMPONENT CRUD --- */

  const openAddTeacherModal = () => {
    setIsEditingTeacher(false);
    setTeacherForm(INITIAL_TEACHER_FORM);
    setTeacherModalOpen(true);
  };

  const openEditTeacherModal = (teacher) => {
    const comp = teacher.salary_component || {};
    setIsEditingTeacher(true);
    setTeacherForm({
      id: teacher.id,
      nip: teacher.nip || '',
      name: teacher.name || '',
      status: teacher.status || 'GTY (Guru Tetap Yayasan)',
      bank_account: teacher.bank_account || '',
      email: teacher.email || '',
      base_salary: Number(comp.base_salary || 0),
      hourly_rate: Number(comp.hourly_rate || 0),
      position_allowance: Number(comp.position_allowance || 0),
      bpjs_deduction: Number(comp.bpjs_deduction || 0),
      custom_components: parseCustomComponents(comp.custom_components_json),
    });
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

    const submitPayload = {
      ...teacherForm,
      email: cleanEmail,
      username: cleanEmail,
      custom_components: cleanCustomList,
      custom_components_json: JSON.stringify(cleanCustomList),
    };

    try {
      if (isEditingTeacher) {
        await api.put('teachers.update', submitPayload);
        notify.success('Data Guru & Komponen Gaji diperbarui.');
      } else {
        await api.post('teachers.create', submitPayload);
        notify.success('Guru baru & Komponen Gaji berhasil ditambahkan.');
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
      // Fallback jika GAS Web App belum di-redeploy ke v3_BulkImport (masih versi lama)
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
          `Import selesai! ${formatRibuan(created)} guru baru, ${formatRibuan(updated)} diperbarui.`
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

  const handleInspectPayroll = async (payrollRow) => {
    try {
      setSelectedPayroll(payrollRow);
      const details = await api.get('payrollDetails.byPayroll', { payroll_id: payrollRow.id });
      setPayrollDetails(details || []);
    } catch (err) {
      notify.error(err.message || 'Gagal memuat rincian payroll.');
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

  return (
    <main className="app-shell py-6 space-y-6">
      {/* Top KPI Summary Cards (Single Row on Mobile & Desktop) */}
      <section className="flex flex-nowrap items-stretch gap-2 sm:gap-4 w-full">
        <div className="flex-1 basis-0 min-w-0 rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between gap-1">
            <span className="text-[9px] sm:text-xs font-semibold uppercase tracking-tight sm:tracking-wider text-slate-500 leading-tight">
              Total Pendidik Aktif
            </span>
            <Users className="h-3.5 w-3.5 sm:h-5 sm:w-5 shrink-0 text-indigo-600" />
          </div>
          <p className="mt-1.5 sm:mt-2 text-xs sm:text-2xl font-bold text-slate-900 leading-snug truncate">
            {formatRibuan(teachers.length)} Guru
          </p>
          <p className="mt-0.5 sm:mt-1 text-[8.5px] sm:text-xs text-slate-500 leading-tight truncate">
            Pendidik & Staf Yayasan
          </p>
        </div>

        <div className="flex-1 basis-0 min-w-0 rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between gap-1">
            <span className="text-[9px] sm:text-xs font-semibold uppercase tracking-tight sm:tracking-wider text-slate-500 leading-tight">
              Periode Aktif
            </span>
            <CalendarCheck className="h-3.5 w-3.5 sm:h-5 sm:w-5 shrink-0 text-amber-600" />
          </div>
          <p className="mt-1.5 sm:mt-2 text-xs sm:text-2xl font-bold text-slate-900 leading-snug truncate">
            {getMonthName(selectedMonth)} {selectedYear}
          </p>
          <p className="mt-0.5 sm:mt-1 text-[8.5px] sm:mt-1 sm:text-xs text-slate-500 leading-tight truncate">
            Status:{' '}
            <strong className="text-indigo-700">
              {currentPeriodPayroll
                ? STATUS_BADGE[currentPeriodPayroll.status]?.label || currentPeriodPayroll.status
                : 'Belum Dibuat'}
            </strong>
          </p>
        </div>

        <div className="flex-1 basis-0 min-w-0 rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between gap-1">
            <span className="text-[9px] sm:text-xs font-semibold uppercase tracking-tight sm:tracking-wider text-slate-500 leading-tight">
              Anggaran Periode Ini
            </span>
            <Wallet className="h-3.5 w-3.5 sm:h-5 sm:w-5 shrink-0 text-emerald-600" />
          </div>
          <p className="mt-1.5 sm:mt-2 text-xs sm:text-2xl font-bold text-emerald-700 leading-snug truncate">
            {formatRupiah(currentPeriodPayroll ? currentPeriodPayroll.total_budget : 0)}
          </p>
          <p className="mt-0.5 sm:mt-1 text-[8.5px] sm:text-xs text-slate-500 leading-tight truncate">
            Akumulasi Take Home Pay
          </p>
        </div>
      </section>

      {/* Period Filter & Navigation Bar */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="fluid-container items-center justify-between">
          {/* Desktop Tab Switcher (Hidden on Mobile — Mobile uses Telegram FloatingTabBar) */}
          <div
            role="tablist"
            aria-label="Menu Utama Dasbor Admin"
            className="hidden sm:flex sm:w-auto items-center gap-1 rounded-xl bg-slate-100/90 p-1 border border-slate-200/70"
          >
            {[
              { id: 'payroll', label: 'Alur Penggajian', icon: Wallet },
              { id: 'attendance', label: 'Input Kehadiran & JTM', icon: CalendarCheck },
              { id: 'teachers', label: 'Master Guru & Gaji', icon: Users },
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
                  className={`touch-target relative flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-200 select-none ${
                    isTabActive ? 'text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isTabActive && (
                    <motion.span
                      layoutId="admin-desktop-tab-pill"
                      transition={{ type: 'spring', stiffness: 361, damping: 24 }}
                      className="absolute inset-0 rounded-lg bg-indigo-600 shadow-xs"
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <TabIcon className="h-3.5 w-3.5" />
                    <span>{tabItem.label}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Flexible Period Selector (Bulan A s/d Bulan B + Tahun) */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <select
                aria-label="Bulan Awal (Dari)"
                value={startMonth}
                onChange={(e) => {
                  const nextStart = Number(e.target.value);
                  setStartMonth(nextStart);
                }}
                className="touch-target flex-1 sm:flex-initial rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800"
              >
                {MONTHS_ID.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>

              <span className="text-[10px] sm:text-xs font-bold text-slate-400 shrink-0 px-0.5">
                s/d
              </span>

              <select
                aria-label="Bulan Akhir (Hingga)"
                value={endMonth}
                onChange={(e) => {
                  const nextEnd = Number(e.target.value);
                  setEndMonth(nextEnd);
                }}
                className="touch-target flex-1 sm:flex-initial rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800"
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
                className="touch-target rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800"
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
                <span className="inline-flex items-center rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                  {periodInfo.monthCount} Bulan
                </span>
              )}
              <button
                type="button"
                onClick={() => setEndMonth(startMonth)}
                className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition ${
                  !periodInfo.isRange
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
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
                className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition ${
                  startMonth === 1 && endMonth === 6
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
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
                className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition ${
                  startMonth === 7 && endMonth === 12
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
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
          {/* ====================================================================
           * TAB 1: ALUR PENGGAJIAN (PAYROLL WORKFLOW)
           * ==================================================================== */}
          {activeTab === 'payroll' && (
        <section className="space-y-6">
          {/* Action Banner for Current Period */}
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3.5 sm:p-5">
            <div className="fluid-container items-center justify-between">
              <div className="fluid-item">
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Kalkulasi Penggajian: {getMonthName(selectedMonth)} {selectedYear}
                </h2>
                <p className="mt-1 text-xs sm:text-sm text-slate-600">
                  Formula Otomatis:{' '}
                  <code className="rounded bg-white px-2 py-0.5 font-semibold text-indigo-700 border border-indigo-200">
                    Gaji Pokok + (JTM × Tarif) + Tunjangan Jabatan - Potongan BPJS
                  </code>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {(!currentPeriodPayroll || currentPeriodPayroll.status === 'draft') && (
                  <button
                    type="button"
                    onClick={handleGenerateDraft}
                    disabled={loading}
                    className="touch-target flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700"
                  >
                    <Calculator className="h-3.5 w-3.5" />
                    <span>
                      {currentPeriodPayroll ? 'Kalkulasi Ulang Draf' : 'Generate Draf Penggajian'}
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
                    className="touch-target flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-amber-700"
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
                    className="touch-target flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
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
            <h3 className="text-base font-bold text-slate-900">Daftar Periode Penggajian</h3>
            <div className="fluid-container">
              {payrolls.map((pr) => {
                const badge = STATUS_BADGE[pr.status] || STATUS_BADGE.draft;
                return (
                  <div
                    key={pr.id}
                    className="fluid-item rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs flex flex-col justify-between gap-3 sm:gap-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-base font-bold text-slate-900">
                          {getMonthName(pr.month)} {pr.year}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">Total anggaran gaji periode berjalan</p>
                      <p className="mt-2 sm:mt-3 text-xl sm:text-2xl font-bold text-slate-900">
                        {formatRupiah(pr.total_budget)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleInspectPayroll(pr)}
                        className="flex-1 touch-target flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Eye className="h-3.5 w-3.5 text-indigo-600" />
                        <span>Rincian Guru</span>
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
                          className="flex-1 touch-target flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
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
                          className="flex-1 touch-target flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
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

          {/* Selected Payroll Details Breakdown */}
          {selectedPayroll && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-base font-bold text-slate-900">
                    Rincian Slip Gaji Guru — {getMonthName(selectedPayroll.month)}{' '}
                    {selectedPayroll.year}
                  </h4>
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
                {payrollDetails.map((detail) => {
                  let parsed = {};
                  try {
                    parsed = JSON.parse(detail.details_json || '{}');
                  } catch {
                    parsed = {};
                  }
                  return (
                    <div
                      key={detail.id}
                      className="fluid-item rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900">{parsed.teacher_name}</p>
                          <p className="text-xs text-slate-500">
                            NIP: {parsed.nip} • {parsed.bank_account}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => downloadPayslipPdf(detail)}
                          className="touch-target flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          <span>PDF</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 text-xs text-slate-600 border-t border-slate-200/80 pt-2">
                        <span>Gaji Pokok:</span>
                        <span className="text-right font-medium text-slate-900">
                          {formatRupiah(parsed.base_salary)}
                        </span>
                        <span>
                          Honor JTM ({parsed.total_jtm} × {formatRupiah(parsed.hourly_rate)}):
                        </span>
                        <span className="text-right font-medium text-slate-900">
                          {formatRupiah(parsed.jtm_honor)}
                        </span>
                        <span>Tunjangan Jabatan:</span>
                        <span className="text-right font-medium text-slate-900">
                          {formatRupiah(parsed.position_allowance)}
                        </span>
                        {parseCustomComponents(parsed.custom_components).map((cust) => (
                          <React.Fragment key={cust.id}>
                            <span>
                              {cust.type === 'allowance' ? `+ ${cust.label}:` : `- ${cust.label}:`}
                            </span>
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
                          - {formatRupiah(parsed.bpjs_deduction)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                        <span className="text-xs font-bold uppercase text-slate-700">
                          Gaji Bersih (Net):
                        </span>
                        <span className="text-base font-bold text-indigo-700">
                          {formatRupiah(detail.net_salary)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ====================================================================
       * TAB 2: INPUT DATA KEHADIRAN & JTM (ATTENDANCE)
       * ==================================================================== */}
      {activeTab === 'attendance' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Input Kehadiran & Jam Tatap Muka (JTM) — {getMonthName(selectedMonth)}{' '}
                {selectedYear}
              </h2>
              <p className="text-xs text-slate-500">
                Catat Hari Hadir, Hari Alpa, dan Total JTM bulanan sebagai dasar perhitungan otomatis.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveAllAttendances}
              className="touch-target flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Simpan Semua Kehadiran</span>
            </button>
          </div>

          <div className="fluid-container">
            {teachers.map((teacher) => {
              const row = attEdits[teacher.id] || { present_days: 0, absent_days: 0, total_jtm: 0 };
              const hourlyRate = Number(teacher.salary_component?.hourly_rate || 0);
              const estimatedHonor = row.total_jtm * hourlyRate;

              return (
                <div
                  key={teacher.id}
                  className="fluid-item rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-3.5 sm:space-y-4"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5 sm:pb-3">
                    <div>
                      <h3 className="font-bold text-slate-900">{teacher.name}</h3>
                      <p className="text-xs text-slate-500">
                        NIP: {teacher.nip} • Tarif JTM: {formatRupiah(hourlyRate)}/jam
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSaveSingleAttendance(teacher)}
                      className="touch-target flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>Simpan</span>
                    </button>
                  </div>

                  <div className="fluid-container gap-2.5 sm:gap-3">
                    <div className="fluid-item-xs">
                      <label className="block text-xs font-semibold text-slate-600">
                        Hari Hadir
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={31 * periodInfo.monthCount}
                        value={row.present_days}
                        onChange={(e) =>
                          handleAttFieldChange(teacher.id, 'present_days', e.target.value)
                        }
                        className="touch-target mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold"
                      />
                    </div>

                    <div className="fluid-item-xs">
                      <label className="block text-xs font-semibold text-slate-600">
                        Hari Alpa
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={31 * periodInfo.monthCount}
                        value={row.absent_days}
                        onChange={(e) =>
                          handleAttFieldChange(teacher.id, 'absent_days', e.target.value)
                        }
                        className="touch-target mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold"
                      />
                    </div>

                    <div className="fluid-item-xs">
                      <label className="block text-xs font-semibold text-indigo-700">
                        Total JTM (Jam)
                      </label>
                      <div className="mt-1 flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          max={200 * periodInfo.monthCount}
                          value={row.total_jtm}
                          onChange={(e) =>
                            handleAttFieldChange(teacher.id, 'total_jtm', e.target.value)
                          }
                          className="touch-target w-full rounded-lg border border-indigo-300 bg-indigo-50/40 px-2.5 py-1.5 text-xs font-bold text-indigo-900"
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
                          className="touch-target flex shrink-0 items-center justify-center gap-1 rounded-lg border border-indigo-200 bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700"
                        >
                          <Calculator className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Kalkulator</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs">
                    <span className="text-slate-600">Estimasi Honor Mengajar (JTM × Tarif):</span>
                    <span className="font-bold text-indigo-700">
                      {formatRupiah(estimatedHonor)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ====================================================================
       * TAB 3: MASTER DATA GURU & KOMPONEN GAJI (TEACHERS & SALARY_COMPONENTS)
       * ==================================================================== */}
      {activeTab === 'teachers' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Master Data Guru & Komponen Gaji
              </h2>
              <p className="text-xs text-slate-500">
                Kelola data profil pendidik, rekening bank, rincian gaji, serta akun akses portal.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  downloadTeacherImportTemplate();
                  notify.info('Format Template Import Excel (.xlsx) berhasil diunduh.');
                }}
                className="touch-target flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <FileDown className="h-3.5 w-3.5 text-indigo-600" />
                <span>Unduh Format Import (.XLSX)</span>
              </button>

              <button
                type="button"
                onClick={() => setImportModalOpen(true)}
                className="touch-target flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                <Upload className="h-3.5 w-3.5 text-emerald-600" />
                <span>Import Data (.XLSX)</span>
              </button>

              <button
                type="button"
                onClick={openAddTeacherModal}
                className="touch-target flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tambah Guru Baru</span>
              </button>
            </div>
          </div>

          <div className="fluid-container">
            {teachers.map((t) => {
              const comp = t.salary_component || {};
              return (
                <div
                  key={t.id}
                  className="fluid-item rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">{t.name}</h3>
                        <p className="text-xs text-slate-500">
                          NIP: {t.nip} • {t.status}
                        </p>
                        {t.email && (
                          <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                            <Mail className="h-3 w-3" />
                            <span>{t.email}</span>
                          </p>
                        )}
                      </div>
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {t.bank_account}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                      <div>
                        <span className="text-slate-500 block">Gaji Pokok</span>
                        <span className="font-bold text-slate-900">
                          {formatRupiah(comp.base_salary)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Tarif / JTM</span>
                        <span className="font-bold text-indigo-700">
                          {formatRupiah(comp.hourly_rate)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Tunjangan Jabatan</span>
                        <span className="font-bold text-slate-900">
                          {formatRupiah(comp.position_allowance)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Potongan BPJS</span>
                        <span className="font-bold text-rose-600">
                          - {formatRupiah(comp.bpjs_deduction)}
                        </span>
                      </div>
                    </div>

                    {parseCustomComponents(comp.custom_components_json).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {parseCustomComponents(comp.custom_components_json).map((cust) => (
                          <span
                            key={cust.id}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${
                              cust.type === 'allowance'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-rose-200 bg-rose-50 text-rose-700'
                            }`}
                          >
                            <span>{cust.label}:</span>
                            <span>
                              {cust.type === 'allowance' ? '+' : '-'} {formatRupiah(cust.amount)}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => openEditTeacherModal(t)}
                      className="flex-1 touch-target flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Edit3 className="h-3.5 w-3.5 text-indigo-600" />
                      <span>Edit Data & Gaji</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDeleteTeacher(t)}
                      className="touch-target flex items-center justify-center rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
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

      {/* ====================================================================
       * TAB 4: PROFIL & IDENTITAS SEKOLAH / YAYASAN
       * ==================================================================== */}
          {activeTab === 'school_profile' && <SchoolProfileSection />}
        </motion.div>
      </AnimatePresence>

      {/* Modal: Create / Edit Teacher & Salary Components */}
      {teacherModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-100 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {isEditingTeacher
                  ? 'Edit Data Guru & Komponen Gaji'
                  : 'Tambah Guru & Komponen Gaji'}
              </h3>
              <button
                type="button"
                onClick={() => setTeacherModalOpen(false)}
                className="touch-target flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTeacher} className="mt-4 space-y-4">
              <div className="fluid-container">
                <div className="fluid-item-sm">
                  <label className="block text-xs font-semibold text-slate-700">NIP / NIY</label>
                  <input
                    type="text"
                    required
                    value={teacherForm.nip}
                    onChange={(e) => setTeacherForm({ ...teacherForm, nip: e.target.value })}
                    placeholder="19900101202001"
                    className="touch-target mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div className="fluid-item-sm">
                  <label className="block text-xs font-semibold text-slate-700">
                    Nama Lengkap & Gelar
                  </label>
                  <input
                    type="text"
                    required
                    value={teacherForm.name}
                    onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })}
                    placeholder="Ahmad Fauzi, S.Pd."
                    className="touch-target mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                  />
                </div>
              </div>

              <div className="fluid-container">
                <div className="fluid-item-sm">
                  <label className="block text-xs font-semibold text-slate-700">
                    Status Kepegawaian
                  </label>
                  <select
                    value={teacherForm.status}
                    onChange={(e) => setTeacherForm({ ...teacherForm, status: e.target.value })}
                    className="touch-target mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                  >
                    <option value="GTY (Guru Tetap Yayasan)">GTY (Guru Tetap Yayasan)</option>
                    <option value="GTT (Guru Tidak Tetap)">GTT (Guru Tidak Tetap)</option>
                    <option value="PNS DPK">PNS DPK</option>
                    <option value="Staf Tata Usaha">Staf Tata Usaha</option>
                  </select>
                </div>
                <div className="fluid-item-sm">
                  <label className="block text-xs font-semibold text-slate-700">
                    Bank & Nomor Rekening
                  </label>
                  <input
                    type="text"
                    required
                    value={teacherForm.bank_account}
                    onChange={(e) =>
                      setTeacherForm({ ...teacherForm, bank_account: e.target.value })
                    }
                    placeholder="BSI 7192837465"
                    className="touch-target mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Mail className="h-4 w-4 text-indigo-600" />
                  <p className="text-xs font-bold text-indigo-950">
                    Akun Akses Portal Guru (Gmail)
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Alamat Gmail Guru
                  </label>
                  <input
                    type="email"
                    value={teacherForm.email || ''}
                    onChange={(e) =>
                      setTeacherForm({ ...teacherForm, email: e.target.value })
                    }
                    placeholder="contoh: ahmad.fauzi@gmail.com"
                    className="touch-target mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Guru cukup masuk menggunakan alamat Gmail ini tanpa perlu username dan password.
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Rincian Komponen Gaji
                </p>
                <div className="fluid-container">
                  <div className="fluid-item-sm">
                    <label className="block text-xs font-semibold text-slate-700">
                      Gaji Pokok (Rp)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatRibuan(teacherForm.base_salary)}
                      onChange={(e) =>
                        setTeacherForm({ ...teacherForm, base_salary: parseRibuan(e.target.value) })
                      }
                      className="touch-target mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold"
                    />
                  </div>
                  <div className="fluid-item-sm">
                    <label className="block text-xs font-semibold text-slate-700">
                      Tarif Mengajar per JTM (Rp)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatRibuan(teacherForm.hourly_rate)}
                      onChange={(e) =>
                        setTeacherForm({ ...teacherForm, hourly_rate: parseRibuan(e.target.value) })
                      }
                      className="touch-target mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold"
                    />
                  </div>
                  <div className="fluid-item-sm">
                    <label className="block text-xs font-semibold text-slate-700">
                      Tunjangan Jabatan (Rp)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatRibuan(teacherForm.position_allowance)}
                      onChange={(e) =>
                        setTeacherForm({
                          ...teacherForm,
                          position_allowance: parseRibuan(e.target.value),
                        })
                      }
                      className="touch-target mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold"
                    />
                  </div>
                  <div className="fluid-item-sm">
                    <label className="block text-xs font-semibold text-slate-700">
                      Potongan BPJS (Rp)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatRibuan(teacherForm.bpjs_deduction)}
                      onChange={(e) =>
                        setTeacherForm({ ...teacherForm, bpjs_deduction: parseRibuan(e.target.value) })
                      }
                      className="touch-target mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold"
                    />
                  </div>
                </div>

                {/* Custom Deductions & Allowances Section */}
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        Potongan & Komponen Lainnya (Custom Admin)
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Tambahkan potongan selain BPJS (misal Koperasi, Kasbon, Infaq, PPh 21) atau
                        tunjangan tambahan sesuai kebijakan sekolah.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addCustomComponent('deduction', '', 50000)}
                      className="touch-target flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Tambah Item Custom</span>
                    </button>
                  </div>

                  {/* Quick Preset Chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { type: 'deduction', label: 'Potongan Koperasi / Kasbon', amount: 100000 },
                      { type: 'deduction', label: 'Cicilan Pinjaman Yayasan', amount: 200000 },
                      { type: 'deduction', label: 'Infaq / Zakat Profesi', amount: 50000 },
                      { type: 'deduction', label: 'Potongan Keterlambatan', amount: 25000 },
                      { type: 'allowance', label: 'Tunjangan Wali Kelas', amount: 150000 },
                      { type: 'allowance', label: 'Tunjangan Transport & Makan', amount: 200000 },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() =>
                          addCustomComponent(preset.type, preset.label, preset.amount)
                        }
                        className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                          preset.type === 'allowance'
                            ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800 hover:bg-emerald-100'
                            : 'border-rose-200 bg-rose-50/80 text-rose-800 hover:bg-rose-100'
                        }`}
                      >
                        {preset.type === 'allowance' ? '+ ' : '− '}
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Dynamic Custom Items Rows */}
                  {(teacherForm.custom_components || []).length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2.5 text-center text-xs text-slate-400">
                      Belum ada potongan atau tunjangan custom tambahan. Ketuk tombol preset di atas
                      atau &ldquo;Tambah Item Custom&rdquo;.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {(teacherForm.custom_components || []).map((item) => (
                        <div
                          key={item.id}
                          className="fluid-container items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5"
                        >
                          <select
                            aria-label="Jenis Komponen"
                            value={item.type}
                            onChange={(e) =>
                              updateCustomComponent(item.id, 'type', e.target.value)
                            }
                            className={`touch-target rounded-xl border px-2.5 py-2 text-xs font-bold ${
                              item.type === 'allowance'
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                : 'border-rose-300 bg-rose-50 text-rose-800'
                            }`}
                          >
                            <option value="deduction">Potongan (−)</option>
                            <option value="allowance">Tunjangan (+)</option>
                          </select>

                          <input
                            type="text"
                            value={item.label}
                            onChange={(e) =>
                              updateCustomComponent(item.id, 'label', e.target.value)
                            }
                            placeholder="Nama potongan/tunjangan (misal: Koperasi)"
                            className="fluid-item-xs touch-target rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium"
                          />

                          <input
                            type="text"
                            inputMode="numeric"
                            value={formatRibuan(item.amount)}
                            onChange={(e) =>
                              updateCustomComponent(
                                item.id,
                                'amount',
                                parseRibuan(e.target.value)
                              )
                            }
                            placeholder="Nominal (Rp)"
                            className="w-32 touch-target rounded-xl border border-slate-300 px-3 py-2 text-right text-xs font-bold"
                          />

                          <button
                            type="button"
                            onClick={() => removeCustomComponent(item.id)}
                            aria-label="Hapus komponen custom"
                            className="touch-target flex items-center justify-center rounded-xl bg-rose-50 px-2.5 py-2 text-rose-600 hover:bg-rose-100"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Summary of Total Deductions & Allowances */}
                  {(() => {
                    const summary = summarizeCustomComponents(teacherForm.custom_components);
                    const totalDeductions =
                      Number(teacherForm.bpjs_deduction || 0) + summary.totalCustomDeduction;
                    return (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2.5 text-xs">
                        <span className="text-slate-600">
                          Total Potongan (BPJS + Custom):{' '}
                          <strong className="text-rose-600">
                            - {formatRupiah(totalDeductions)}
                          </strong>
                        </span>
                        {summary.totalCustomAllowance > 0 && (
                          <span className="text-slate-600">
                            Tunjangan Custom:{' '}
                            <strong className="text-emerald-700">
                              + {formatRupiah(summary.totalCustomAllowance)}
                            </strong>
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="fluid-container pt-3">
                <button
                  type="button"
                  onClick={() => setTeacherModalOpen(false)}
                  className="fluid-item-xs touch-target rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="fluid-item-xs touch-target rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Simpan Data
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

      {/* Telegram-Style Floating Mobile Tab Bar with Dual-Spring Physics */}
      <FloatingTabBar
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'payroll', label: 'Penggajian', icon: Wallet },
          { id: 'attendance', label: 'Kehadiran & JTM', icon: CalendarCheck },
          { id: 'teachers', label: 'Master Guru', icon: Users, badge: teachers.length },
          { id: 'school_profile', label: 'Profil Sekolah', icon: Building2 },
        ]}
      />

      {/* Custom Confirmation Modal (Zero native alert/confirm) */}
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
