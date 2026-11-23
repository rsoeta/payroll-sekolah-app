import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  FileCheck2,
  GraduationCap,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import api from '../services/gasApi';
import { emitDataChange, subscribeDataChange } from '../services/realtimeSync';
import notify from '../utils/notify';
import ConfirmModal from './ConfirmModal';
import { MONTHS_ID, formatRupiah, getSingleMonthName } from '../utils/formatters';
import {
  ATTENDANCE_CONDITIONS,
  DEFAULT_TEACHING_CLASSES,
  computeAttendanceBreakdownFromLogs,
  computeClassBreakdownFromLogs,
  computeEffectiveJtmHours,
  formatAttendanceNumber,
  formatDateIndo,
  getAttendanceConditionMeta,
  getLogValidationMeta,
  getTodayIsoDate,
  normalizeAttendanceStatus,
  normalizeIsoDateOnly,
  normalizeLogValidationStatus,
} from '../utils/attendanceHelpers';

const CUSTOM_CLASSES_STORAGE_KEY = 'sipayroll_guru_classes_v1';

const TONE_BADGE_CLASS = {
  good: 'nim-badge nim-badge--good',
  warn: 'nim-badge nim-badge--warn',
  bad: 'nim-badge nim-badge--bad',
  neutral: 'nim-badge',
};

function loadStoredClassList() {
  try {
    const raw = localStorage.getItem(CUSTOM_CLASSES_STORAGE_KEY);
    if (!raw) return DEFAULT_TEACHING_CLASSES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // Ignore storage read error
  }
  return DEFAULT_TEACHING_CLASSES;
}

function saveStoredClassList(list) {
  try {
    localStorage.setItem(CUSTOM_CLASSES_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage write error
  }
}

function createDefaultClassRowState(existingLog = null) {
  if (existingLog) {
    const st = normalizeAttendanceStatus(existingLog.status);
    return {
      checked: true,
      status: st,
      jtm_hours: st === 'sakit' || st === 'izin' ? 0 : Number(existingLog.jtm_hours || 0),
      note: existingLog.note || '',
    };
  }
  return {
    checked: false,
    status: 'hadir',
    jtm_hours: 2,
    note: '',
  };
}

export function GuruSelfAttendanceSection({
  teacherProfile,
  initialPeriod,
  initialLogs,
  initialAttendanceSummary,
  onLogsCountChange,
  onSyncComplete,
}) {
  const todayIso = useMemo(() => getTodayIsoDate(), []);
  const initialDateParts = todayIso.split('-');
  const initialMonthVal = Number(initialPeriod?.month) || Number(initialDateParts[1]) || 11;
  const initialYearVal = Number(initialPeriod?.year) || Number(initialDateParts[0]) || 2026;
  const hasPrefetchedLogs = Array.isArray(initialLogs);

  const [selectedMonth, setSelectedMonth] = useState(initialMonthVal);
  const [selectedYear, setSelectedYear] = useState(initialYearVal);

  const [logs, setLogs] = useState(() =>
    hasPrefetchedLogs
      ? initialLogs.map((row) => ({
          ...row,
          date: normalizeIsoDateOnly(row.date),
          class_name: String(row.class_name || 'Kelas Umum').trim() || 'Kelas Umum',
        }))
      : []
  );
  const [adminSummary, setAdminSummary] = useState(() => initialAttendanceSummary || null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [dateInput, setDateInput] = useState(todayIso);
  const [classList, setClassList] = useState(() => loadStoredClassList());
  const [newClassInput, setNewClassInput] = useState('');
  const [classRowsState, setClassRowsState] = useState({});
  const [editingHighlightClass, setEditingHighlightClass] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const formRef = useRef(null);
  const classListRef = useRef(classList);
  classListRef.current = classList;
  const skipInitialFetchRef = useRef(hasPrefetchedLogs);

  const buildChecklistStateForDate = useCallback((targetDate, sourceLogs, classes) => {
    const cleanTargetDate = normalizeIsoDateOnly(targetDate);
    const logsForDate = sourceLogs.filter(
      (item) => normalizeIsoDateOnly(item.date) === cleanTargetDate
    );
    const nextState = {};
    for (const cls of classes) {
      const match = logsForDate.find(
        (l) => String(l.class_name || 'Kelas Umum').trim().toLowerCase() === cls.toLowerCase()
      );
      nextState[cls] = createDefaultClassRowState(match || null);
    }
    return nextState;
  }, []);

  const loadPeriodAttendance = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const [logRows, attRows] = await Promise.all([
          api.get('attendanceLogs.list', { month: selectedMonth, year: selectedYear }),
          api.get('attendances.list', { month: selectedMonth, year: selectedYear }),
        ]);
        const normalizedLogs = (Array.isArray(logRows) ? logRows : []).map((row) => ({
          ...row,
          date: normalizeIsoDateOnly(row.date),
          class_name: String(row.class_name || 'Kelas Umum').trim() || 'Kelas Umum',
        }));
        setLogs(normalizedLogs);
        setAdminSummary(Array.isArray(attRows) && attRows.length > 0 ? attRows[0] : null);
        onLogsCountChange?.(normalizedLogs.length);

        // Pastikan seluruh nama kelas yang ada pada riwayat log ikut muncul di checklist
        const discoveredClasses = normalizedLogs
          .map((l) => l.class_name)
          .filter(Boolean);
        if (discoveredClasses.length > 0) {
          setClassList((prev) => {
            const merged = [...prev];
            let changed = false;
            for (const cls of discoveredClasses) {
              if (!merged.some((item) => item.toLowerCase() === cls.toLowerCase())) {
                merged.push(cls);
                changed = true;
              }
            }
            if (changed) saveStoredClassList(merged);
            return merged;
          });
        }
        return normalizedLogs;
      } catch (err) {
        if (!silent) {
          notify.error(err.message || 'Gagal memuat catatan kehadiran & JTM.');
        }
        return null;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [selectedMonth, selectedYear, onLogsCountChange]
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
    loadPeriodAttendance();
  }, [loadPeriodAttendance, selectedMonth, selectedYear, initialMonthVal, initialYearVal]);

  useEffect(() => {
    return subscribeDataChange((domains, meta) => {
      if (meta?.source === 'guru_att_local') return;
      if (domains.includes('attendances') || domains.includes('payrolls')) {
        loadPeriodAttendance({ silent: true });
      }
    });
  }, [loadPeriodAttendance]);

  // Sinkronkan checklist ketika tanggal atau data `logs` berubah (tidak menimpa edit saat `classList` ditambah)
  useEffect(() => {
    setClassRowsState(buildChecklistStateForDate(dateInput, logs, classListRef.current));
  }, [dateInput, logs, buildChecklistStateForDate]);

  // Pastikan kelas yang baru ditambahkan lewat `classList` langsung terinisialisasi tanpa mereset kelas lain
  useEffect(() => {
    setClassRowsState((prev) => {
      let updated = false;
      const next = { ...prev };
      const cleanTargetDate = normalizeIsoDateOnly(dateInput);
      const logsForDate = logs.filter(
        (item) => normalizeIsoDateOnly(item.date) === cleanTargetDate
      );
      for (const cls of classList) {
        if (!next[cls]) {
          const match = logsForDate.find(
            (l) => String(l.class_name || 'Kelas Umum').trim().toLowerCase() === cls.toLowerCase()
          );
          next[cls] = createDefaultClassRowState(match || null);
          updated = true;
        }
      }
      return updated ? next : prev;
    });
  }, [classList, dateInput, logs]);

  const handleDateChange = (nextDate) => {
    const isoDate = normalizeIsoDateOnly(nextDate) || nextDate;
    setEditingHighlightClass('');
    setDateInput(isoDate);
    const parts = String(isoDate || '').split('-');
    if (parts.length === 3) {
      const yr = Number(parts[0]);
      const mo = Number(parts[1]);
      if (yr >= 2020 && yr <= 2100 && mo >= 1 && mo <= 12) {
        setSelectedYear(yr);
        setSelectedMonth(mo);
      }
    }
  };

  const handleEditLogEntry = (log) => {
    const isoDate = normalizeIsoDateOnly(log.date);
    const targetClass = String(log.class_name || 'Kelas Umum').trim() || 'Kelas Umum';

    let nextClasses = classListRef.current;
    if (!nextClasses.some((c) => c.toLowerCase() === targetClass.toLowerCase())) {
      nextClasses = [...nextClasses, targetClass];
      setClassList(nextClasses);
      saveStoredClassList(nextClasses);
    }

    const parts = isoDate.split('-');
    if (parts.length === 3) {
      const yr = Number(parts[0]);
      const mo = Number(parts[1]);
      if (yr >= 2020 && yr <= 2100 && mo >= 1 && mo <= 12) {
        setSelectedYear(yr);
        setSelectedMonth(mo);
      }
    }

    setDateInput(isoDate);
    setClassRowsState(buildChecklistStateForDate(isoDate, logs, nextClasses));
    setEditingHighlightClass(targetClass);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    notify.info(
      `Mode edit aktif: ${targetClass} (${formatDateIndo(isoDate)}). Ubah kondisi/JTM lalu simpan.`
    );
  };

  const handleToggleClassCheck = (clsName) => {
    setClassRowsState((prev) => {
      const cur = prev[clsName] || createDefaultClassRowState(null);
      return {
        ...prev,
        [clsName]: { ...cur, checked: !cur.checked },
      };
    });
  };

  const handleChangeClassCondition = (clsName, nextStatusId) => {
    const meta = getAttendanceConditionMeta(nextStatusId);
    setClassRowsState((prev) => {
      const cur = prev[clsName] || createDefaultClassRowState(null);
      let nextJtm = cur.jtm_hours;
      if (!meta.allowsJtm) {
        nextJtm = 0;
      } else if (Number(cur.jtm_hours) === 0) {
        nextJtm = meta.defaultJtm || 2;
      }
      return {
        ...prev,
        [clsName]: {
          ...cur,
          checked: true,
          status: meta.id,
          jtm_hours: nextJtm,
        },
      };
    });
  };

  const handleUpdateClassField = (clsName, field, value) => {
    setClassRowsState((prev) => {
      const cur = prev[clsName] || createDefaultClassRowState(null);
      return {
        ...prev,
        [clsName]: {
          ...cur,
          [field]: value,
        },
      };
    });
  };

  const allChecked =
    classList.length > 0 && classList.every((cls) => Boolean(classRowsState[cls]?.checked));

  const handleToggleAllClasses = () => {
    const targetChecked = !allChecked;
    setClassRowsState((prev) => {
      const next = {};
      for (const cls of classList) {
        const cur = prev[cls] || createDefaultClassRowState(null);
        next[cls] = { ...cur, checked: targetChecked };
      }
      return next;
    });
  };

  const handleApplyStatusToChecked = (statusId) => {
    const meta = getAttendanceConditionMeta(statusId);
    setClassRowsState((prev) => {
      const next = { ...prev };
      for (const cls of classList) {
        const cur = prev[cls];
        if (!cur?.checked) continue;
        next[cls] = {
          ...cur,
          status: meta.id,
          jtm_hours: !meta.allowsJtm
            ? 0
            : Number(cur.jtm_hours) > 0
            ? cur.jtm_hours
            : meta.defaultJtm || 2,
        };
      }
      return next;
    });
  };

  const handleAddCustomClass = (e) => {
    e.preventDefault();
    const clean = newClassInput.trim();
    if (!clean) return;
    const exists = classList.find((c) => c.toLowerCase() === clean.toLowerCase());
    if (exists) {
      setClassRowsState((prev) => ({
        ...prev,
        [exists]: { ...(prev[exists] || createDefaultClassRowState(null)), checked: true },
      }));
      setNewClassInput('');
      return;
    }
    const nextList = [...classList, clean];
    setClassList(nextList);
    saveStoredClassList(nextList);
    setClassRowsState((prev) => ({
      ...prev,
      [clean]: { ...createDefaultClassRowState(null), checked: true },
    }));
    setNewClassInput('');
  };

  const handleRemoveClassOption = (clsName) => {
    if (classList.length <= 1) {
      notify.warn('Minimal harus tersisa 1 kelas pada daftar.');
      return;
    }
    const nextList = classList.filter((c) => c !== clsName);
    setClassList(nextList);
    saveStoredClassList(nextList);
  };

  const checkedEntries = useMemo(() => {
    return classList
      .filter((cls) => Boolean(classRowsState[cls]?.checked))
      .map((cls) => {
        const row = classRowsState[cls];
        const meta = getAttendanceConditionMeta(row.status);
        return {
          class_name: cls,
          status: meta.id,
          jtm_hours: meta.allowsJtm ? Math.max(0, Number(row.jtm_hours || 0)) : 0,
          note: String(row.note || '').trim(),
        };
      });
  }, [classList, classRowsState]);

  const selectedDateContribution = useMemo(
    () => computeAttendanceBreakdownFromLogs(checkedEntries),
    [checkedEntries]
  );

  const logsExistingOnSelectedDate = useMemo(
    () =>
      logs.filter((l) => normalizeIsoDateOnly(l.date) === normalizeIsoDateOnly(dateInput)).length,
    [logs, dateInput]
  );

  const handleSaveDateChecklist = async (e) => {
    e.preventDefault();
    if (!dateInput) {
      notify.warn('Pilih tanggal kehadiran terlebih dahulu.');
      return;
    }
    if (checkedEntries.length === 0 && logsExistingOnSelectedDate === 0) {
      notify.warn('Centang minimal 1 kelas sebelum menyimpan.');
      return;
    }

    setSaving(true);
    try {
      await api.post('attendanceLogs.syncDateLogs', {
        date: dateInput,
        entries: checkedEntries,
      });
      if (checkedEntries.length === 0) {
        notify.info(`Catatan kelas pada ${formatDateIndo(dateInput)} dikosongkan.`);
      } else {
        notify.success(
          `${checkedEntries.length} kelas (${formatDateIndo(
            dateInput
          )}) tersimpan & langsung masuk ke rekap Admin.`
        );
      }
      setEditingHighlightClass('');
      const nextLogs = await loadPeriodAttendance({ silent: true });
      emitDataChange(['attendances', 'disbursements'], { source: 'guru_att_local' });
      onSyncComplete?.(nextLogs);
    } catch (err) {
      notify.error(err.message || 'Gagal menyimpan kehadiran per-kelas.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete('attendanceLogs.deleteMyLog', { id: deleteTarget.id });
      notify.success(
        `Catatan ${deleteTarget.class_name || 'Kelas'} (${formatDateIndo(deleteTarget.date)}) dihapus.`
      );
      setDeleteTarget(null);
      setEditingHighlightClass('');
      const nextLogs = await loadPeriodAttendance({ silent: true });
      emitDataChange(['attendances', 'disbursements'], { source: 'guru_att_local' });
      onSyncComplete?.(nextLogs);
    } catch (err) {
      notify.error(err.message || 'Gagal menghapus catatan kehadiran.');
    }
  };

  const breakdown = useMemo(() => computeAttendanceBreakdownFromLogs(logs), [logs]);
  const classBreakdown = useMemo(() => computeClassBreakdownFromLogs(logs), [logs]);
  const hourlyRate = Number(teacherProfile?.salary_component?.hourly_rate || 0);

  return (
    <div className="space-y-4">
      {/* Header & Period Controls */}
      <div className="nim-glass nim-card flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-[var(--ink)]">
              Catat Kehadiran Per-Kelas &amp; JTM
            </h2>
            <span className="nim-badge nim-badge--good">
              <CheckCircle2 className="h-3 w-3" />
              <span>Tersinkron ke Admin / Bendahara</span>
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Centang kelas yang diampu pada tanggal tersebut, pilih kondisi (Hadir = 1 &amp; 100%
            JTM, Tugas = 0,5 &amp; 50% JTM, Sakit/Izin = 0), lalu simpan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Pilih bulan rekap"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="nim-input !w-auto text-xs font-semibold"
          >
            {MONTHS_ID.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Pilih tahun rekap"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="nim-input !w-auto text-xs font-semibold tabular-nums"
          >
            {[2024, 2025, 2026, 2027, 2028].map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={loadPeriodAttendance}
            disabled={loading}
            className="nim-btn nim-btn--ghost text-xs"
            title="Muat ulang data periode"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* Period Summary KPI Strip */}
      <div className="flex flex-wrap items-stretch gap-2.5 sm:gap-3">
        <div className="flex-1 min-w-[160px] nim-glass nim-kpi">
          <div className="flex items-start justify-between gap-2">
            <span className="nim-kpi__label">Total Nilai Hadir</span>
            <span className="nim-kpi__ico !w-8 !h-8">
              <CalendarCheck className="h-4 w-4" />
            </span>
          </div>
          <p className="nim-kpi__value mt-2 tabular-nums">
            {formatAttendanceNumber(breakdown.present_days)}
          </p>
          <p className="nim-kpi__sub mt-1">
            Hadir {breakdown.hadir_count}×1 • Tugas {breakdown.tugas_count}×0,5
          </p>
        </div>

        <div className="flex-1 min-w-[160px] nim-glass nim-kpi">
          <div className="flex items-start justify-between gap-2">
            <span className="nim-kpi__label">Tidak Hadir</span>
            <span
              className="nim-kpi__ico !w-8 !h-8"
              style={{ background: 'var(--bad-soft)', color: 'var(--bad-text)' }}
            >
              <XCircle className="h-4 w-4" />
            </span>
          </div>
          <p className="nim-kpi__value mt-2 tabular-nums">{breakdown.absent_days}</p>
          <p className="nim-kpi__sub mt-1">
            Sakit {breakdown.sakit_count} • Izin {breakdown.izin_count} (nilai 0)
          </p>
        </div>

        <div className="flex-1 min-w-[160px] nim-glass nim-kpi">
          <div className="flex items-start justify-between gap-2">
            <span className="nim-kpi__label">Total JTM Mengajar</span>
            <span
              className="nim-kpi__ico !w-8 !h-8"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
            >
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <p className="nim-kpi__value mt-2 tabular-nums">
            {formatAttendanceNumber(breakdown.total_jtm)} Jam
          </p>
          <p className="nim-kpi__sub mt-1 truncate">
            {hourlyRate > 0
              ? `Estimasi: ${formatRupiah(breakdown.total_jtm * hourlyRate)}`
              : `${classBreakdown.length} Kelas Tercatat`}
          </p>
        </div>
      </div>

      {breakdown.invalid_count > 0 && (
        <div
          className="nim-card-well flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
          style={{
            background: 'var(--bad-soft)',
            borderLeft: '3px solid var(--bad-text)',
            color: 'var(--bad-text)',
          }}
        >
          <span>
            <strong>{breakdown.invalid_count} catatan ditandai Tidak Valid</strong> oleh
            Admin/Bendahara dan <strong>tidak dihitung</strong> ke rekap Kehadiran &amp; JTM.
          </span>
        </div>
      )}

      {/* Sync Info against Admin Recorded Attendance */}
      {adminSummary && (
        <div
          className="nim-card-well flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
          style={{ borderLeft: '3px solid var(--good-text)' }}
        >
          <div className="flex items-center gap-2 text-[var(--ink-2)]">
            <FileCheck2 className="h-4 w-4 shrink-0 text-[var(--good-text)]" />
            <span>
              Rekap tersimpan di Admin ({getSingleMonthName(selectedMonth)} {selectedYear}):{' '}
              <strong className="text-[var(--ink)] tabular-nums">
                Hadir {formatAttendanceNumber(adminSummary.present_days)}
              </strong>{' '}
              •{' '}
              <strong className="text-[var(--ink)] tabular-nums">
                Tidak Hadir {formatAttendanceNumber(adminSummary.absent_days)}
              </strong>{' '}
              •{' '}
              <strong className="text-[var(--accent-text)] tabular-nums">
                Total {formatAttendanceNumber(adminSummary.total_jtm)} JTM
              </strong>
            </span>
          </div>
          <span className="text-[11px] text-[var(--muted)]">
            {logs.length} entri kelas tercatat
          </span>
        </div>
      )}

      {/* Checklist Input Form + Per-Class Summary */}
      <div className="fluid-container items-start">
        {/* Per-Class Checkbox Form */}
        <form
          ref={formRef}
          onSubmit={handleSaveDateChecklist}
          className="fluid-item nim-glass nim-card space-y-4"
        >
          <div
            className="flex flex-wrap items-center justify-between gap-2 pb-3"
            style={{ borderBottom: '1px solid var(--line)' }}
          >
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--ink)]">
                Checklist Kehadiran Per-Kelas
              </h3>
              <p className="text-[11px] text-[var(--muted)]">
                Centang kelas yang diajar/diabsen pada tanggal pilihan Anda.
              </p>
            </div>
            {logsExistingOnSelectedDate > 0 && (
              <span className="nim-badge nim-badge--warn">
                {logsExistingOnSelectedDate} kelas tersimpan di tanggal ini
              </span>
            )}
          </div>

          {/* Date Picker + Select All */}
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label
                  htmlFor="guru-att-date"
                  className="block text-xs font-semibold text-[var(--ink-2)]"
                >
                  Tanggal
                </label>
                <input
                  id="guru-att-date"
                  type="date"
                  required
                  value={dateInput}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="nim-input mt-1 !w-auto text-xs font-semibold tabular-nums"
                />
              </div>
              <button
                type="button"
                onClick={() => handleDateChange(getTodayIsoDate())}
                className="nim-btn nim-btn--ghost text-xs"
              >
                Hari Ini
              </button>
            </div>

            <label className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={handleToggleAllClasses}
                className="h-4 w-4 rounded accent-emerald-600"
              />
              <span>Centang Semua Kelas</span>
            </label>
          </div>

          {/* Quick Bulk Condition Buttons when >= 1 class checked */}
          {checkedEntries.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 border border-slate-200/80 text-[11px]">
              <span className="font-semibold text-slate-600 mr-1">
                Set kondisi {checkedEntries.length} kelas terpilih:
              </span>
              {ATTENDANCE_CONDITIONS.map((cond) => (
                <button
                  key={cond.id}
                  type="button"
                  onClick={() => handleApplyStatusToChecked(cond.id)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:border-emerald-400 hover:text-emerald-700"
                >
                  {cond.label}
                </button>
              ))}
            </div>
          )}

          {/* Class Rows Checklist */}
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-0.5">
            {classList.map((clsName) => {
              const rowState = classRowsState[clsName] || createDefaultClassRowState(null);
              const condMeta = getAttendanceConditionMeta(rowState.status);
              const rawRowJtm = condMeta.allowsJtm
                ? Math.max(0, Number(rowState.jtm_hours || 0))
                : 0;
              const effRowJtm = computeEffectiveJtmHours(rowState.status, rawRowJtm);
              const isHighlightedEdit =
                editingHighlightClass &&
                editingHighlightClass.toLowerCase() === clsName.toLowerCase();

              return (
                <div
                  key={clsName}
                  className={`rounded-xl border p-3 transition-all ${
                    isHighlightedEdit
                      ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                      : rowState.checked
                      ? 'border-emerald-500/80 bg-emerald-50/40'
                      : 'border-[var(--line)] bg-[var(--surface)] opacity-85'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rowState.checked}
                        onChange={() => handleToggleClassCheck(clsName)}
                        className="h-4 w-4 rounded accent-emerald-600"
                      />
                      <span className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[var(--ink)]">
                        <GraduationCap className="h-4 w-4 text-emerald-700" />
                        {clsName}
                      </span>
                    </label>

                    <div className="flex items-center gap-1.5">
                      {rowState.checked ? (
                        <span className={`${TONE_BADGE_CLASS[condMeta.tone]} !text-[10.5px]`}>
                          {condMeta.label} • +{formatAttendanceNumber(condMeta.presentWeight)} •{' '}
                          {condMeta.id === 'tugas' && rawRowJtm > 0
                            ? `${formatAttendanceNumber(rawRowJtm)}×50% = ${formatAttendanceNumber(
                                effRowJtm
                              )}`
                            : formatAttendanceNumber(effRowJtm)}{' '}
                          JTM
                        </span>
                      ) : (
                        <span className="text-[11px] text-[var(--muted)]">Tidak dipilih</span>
                      )}
                      {classList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveClassOption(clsName)}
                          title={`Hapus ${clsName} dari daftar`}
                          className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {rowState.checked && (
                    <div className="mt-2.5 pt-2.5 border-t border-emerald-200/70 space-y-2.5">
                      {/* Condition Checkboxes */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {ATTENDANCE_CONDITIONS.map((cond) => {
                          const isSelected = rowState.status === cond.id;
                          return (
                            <label
                              key={cond.id}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold cursor-pointer select-none transition-colors ${
                                isSelected
                                  ? 'border-emerald-500 bg-white text-emerald-800 shadow-2xs'
                                  : 'border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleChangeClassCondition(clsName, cond.id)}
                                className="h-3.5 w-3.5 rounded accent-emerald-600"
                              />
                              <span>{cond.label}</span>
                              <span className="text-[10px] opacity-75">
                                ({cond.id === 'hadir' ? '1' : cond.id === 'tugas' ? '0,5' : '0'})
                              </span>
                            </label>
                          );
                        })}
                      </div>

                      {/* JTM & Optional Note */}
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <label className="text-[11px] font-semibold text-[var(--ink-2)]">
                            JTM:
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="24"
                            step="0.5"
                            disabled={!condMeta.allowsJtm}
                            value={condMeta.allowsJtm ? rowState.jtm_hours : 0}
                            onChange={(e) =>
                              handleUpdateClassField(clsName, 'jtm_hours', e.target.value)
                            }
                            className="nim-input !w-20 !py-1 text-xs font-bold tabular-nums disabled:opacity-60"
                          />
                          <span className="text-[11px] text-[var(--muted)]">
                            jam
                            {condMeta.id === 'tugas' && (
                              <strong className="ml-1 text-[var(--warn-text)] tabular-nums">
                                → {formatAttendanceNumber(effRowJtm)} JTM efektif (50%)
                              </strong>
                            )}
                          </span>
                        </div>

                        <input
                          type="text"
                          maxLength={200}
                          value={rowState.note}
                          onChange={(e) => handleUpdateClassField(clsName, 'note', e.target.value)}
                          placeholder="Catatan singkat (opsional)..."
                          className="nim-input flex-1 min-w-[160px] !py-1 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Custom Class Inline */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={newClassInput}
              onChange={(e) => setNewClassInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustomClass(e);
                }
              }}
              placeholder="Tambah nama kelas lain (misal: X IPA 1)..."
              className="nim-input flex-1 !py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={handleAddCustomClass}
              className="nim-btn nim-btn--ghost nim-btn--sm shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tambah Kelas</span>
            </button>
          </div>

          {/* Contribution Preview & Submit */}
          <div className="nim-card-well px-3.5 py-2.5 text-[11.5px] text-[var(--ink-2)] flex flex-wrap items-center justify-between gap-2">
            <span>
              Total tanggal ini ({checkedEntries.length} kelas):
            </span>
            <span className="font-bold text-[var(--ink)] tabular-nums">
              +{formatAttendanceNumber(selectedDateContribution.present_days)} Hadir •{' '}
              {selectedDateContribution.absent_days} Tidak Hadir •{' '}
              {formatAttendanceNumber(selectedDateContribution.total_jtm)} JTM
            </span>
          </div>

          <button type="submit" disabled={saving} className="nim-btn nim-btn--primary w-full">
            {saving ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Menyimpan &amp; Menyinkronkan...</span>
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                <span>
                  {logsExistingOnSelectedDate > 0
                    ? 'Simpan Perubahan Kehadiran Per-Kelas'
                    : 'Simpan Kehadiran Per-Kelas & Masuk Rekap Admin'}
                </span>
              </>
            )}
          </button>
        </form>

        {/* Right Column: Per-Class Breakdown & Daily Log History */}
        <div className="fluid-item space-y-4">
          {/* Per-Class Summary Card */}
          <div className="nim-glass nim-card space-y-3">
            <div
              className="flex items-center justify-between gap-2 pb-2.5"
              style={{ borderBottom: '1px solid var(--line)' }}
            >
              <h3 className="text-sm sm:text-base font-bold text-[var(--ink)]">
                Rekap Per-Kelas ({getSingleMonthName(selectedMonth)} {selectedYear})
              </h3>
              <span className="nim-badge nim-badge--accent tabular-nums">
                {classBreakdown.length} Kelas
              </span>
            </div>

            {classBreakdown.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">
                Belum ada kelas yang dicatat pada periode ini.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {classBreakdown.map((cb) => (
                  <div
                    key={cb.class_name}
                    className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2.5 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-bold text-[var(--ink)] truncate">
                        {cb.class_name}
                      </span>
                      <span className="font-bold text-[var(--accent-text)] tabular-nums shrink-0">
                        {formatAttendanceNumber(cb.total_jtm)} JTM
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--muted)] tabular-nums">
                      Nilai hadir:{' '}
                      <strong className="text-[var(--ink)]">
                        {formatAttendanceNumber(cb.present_days)}
                      </strong>{' '}
                      • Tidak hadir:{' '}
                      <strong className="text-[var(--ink)]">{cb.absent_days}</strong>
                    </p>
                    <p className="text-[10.5px] text-[var(--muted)] tabular-nums">
                      Hadir {cb.hadir_count} • Tugas {cb.tugas_count} • Sakit {cb.sakit_count} •
                      Izin {cb.izin_count}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Daily Log History Card */}
          <div className="nim-glass nim-card space-y-3">
            <div
              className="flex items-center justify-between gap-2 pb-2.5"
              style={{ borderBottom: '1px solid var(--line)' }}
            >
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[var(--ink)]">
                  Riwayat Catatan Per-Kelas
                </h3>
                <p className="text-[11px] text-[var(--muted)]">
                  Klik Edit untuk memuat ulang checklist tanggal tersebut.
                </p>
              </div>
              <span className="nim-badge nim-badge--accent tabular-nums">{logs.length} Entri</span>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-[var(--muted)]">
                Memuat catatan kehadiran...
              </div>
            ) : logs.length === 0 ? (
              <div className="nim-card-well p-6 text-center text-xs text-[var(--muted)]">
                Belum ada catatan kehadiran pada bulan {getSingleMonthName(selectedMonth)}{' '}
                {selectedYear}.
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-0.5">
                {logs.map((log) => {
                  const cond = getAttendanceConditionMeta(log.status);
                  const vStatus = normalizeLogValidationStatus(log.validation_status);
                  const vMeta = getLogValidationMeta(vStatus);
                  const isInvalid = vStatus === 'invalid';
                  const isActiveDate =
                    normalizeIsoDateOnly(log.date) === normalizeIsoDateOnly(dateInput);
                  const rawLogJtm = cond.allowsJtm ? Math.max(0, Number(log.jtm_hours || 0)) : 0;
                  const effLogJtm = computeEffectiveJtmHours(log.status, rawLogJtm);
                  return (
                    <div
                      key={log.id}
                      className={`rounded-xl border p-3 transition-colors ${
                        isInvalid
                          ? 'border-rose-300 bg-rose-50/50 opacity-85'
                          : isActiveDate
                          ? 'border-indigo-300 bg-indigo-50/40'
                          : 'border-[var(--line)] bg-[var(--surface)]'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-bold text-[var(--ink)]">
                              {formatDateIndo(log.date)}
                            </span>
                            <span className="nim-badge nim-badge--accent !text-[10.5px]">
                              {log.class_name || 'Kelas Umum'}
                            </span>
                            <span className={`${TONE_BADGE_CLASS[cond.tone]} !text-[10.5px]`}>
                              {cond.label}
                            </span>
                            <span className={`${vMeta.badgeCls} !text-[10px]`}>
                              {vMeta.label}
                            </span>
                          </div>
                          <p
                            className={`text-[11px] text-[var(--muted)] tabular-nums ${
                              isInvalid ? 'line-through' : ''
                            }`}
                          >
                            Nilai hadir:{' '}
                            <strong className="text-[var(--ink)]">
                              +{formatAttendanceNumber(cond.presentWeight)}
                            </strong>{' '}
                            • Tidak hadir:{' '}
                            <strong className="text-[var(--ink)]">{cond.absentWeight}</strong> •
                            JTM:{' '}
                            <strong className="text-[var(--accent-text)]">
                              {cond.id === 'tugas' && rawLogJtm > 0
                                ? `${formatAttendanceNumber(rawLogJtm)} × 50% = ${formatAttendanceNumber(
                                    effLogJtm
                                  )} jam`
                                : `${formatAttendanceNumber(effLogJtm)} jam`}
                            </strong>
                          </p>
                          {isInvalid && (
                            <p className="text-[11px] font-semibold text-[var(--bad-text)]">
                              Tidak dihitung ke Kehadiran &amp; JTM
                              {log.validation_note ? ` (${log.validation_note})` : ''}
                            </p>
                          )}
                          {log.note && (
                            <p className="text-[11px] text-[var(--ink-2)] break-words">
                              “{log.note}”
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleEditLogEntry(log)}
                            title="Edit catatan kelas ini"
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
                          >
                            <Pencil className="h-3 w-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(log)}
                            title="Hapus entri kelas ini"
                            className="rounded-lg border border-[var(--line)] bg-white p-1.5 text-slate-500 hover:border-rose-300 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Hapus Catatan Kelas?"
        message={
          deleteTarget
            ? `Catatan ${deleteTarget.class_name || 'Kelas'} tanggal ${formatDateIndo(
                deleteTarget.date
              )} (${getAttendanceConditionMeta(deleteTarget.status).label}) akan dihapus.`
            : ''
        }
        confirmLabel="Ya, Hapus"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default GuruSelfAttendanceSection;
