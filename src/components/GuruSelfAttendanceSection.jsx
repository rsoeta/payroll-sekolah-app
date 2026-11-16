import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  FileCheck2,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
  XCircle,
} from 'lucide-react';
import api from '../services/gasApi';
import notify from '../utils/notify';
import ConfirmModal from './ConfirmModal';
import { MONTHS_ID, formatRupiah, getSingleMonthName } from '../utils/formatters';
import {
  ATTENDANCE_CONDITIONS,
  computeAttendanceBreakdownFromLogs,
  formatAttendanceNumber,
  formatDateIndo,
  getAttendanceConditionMeta,
  getTodayIsoDate,
  normalizeAttendanceStatus,
} from '../utils/attendanceHelpers';

const TONE_BADGE_CLASS = {
  good: 'nim-badge nim-badge--good',
  warn: 'nim-badge nim-badge--warn',
  bad: 'nim-badge nim-badge--bad',
  neutral: 'nim-badge',
};

const QUICK_JTM_PRESETS = [0, 2, 4, 6, 8];

export function GuruSelfAttendanceSection({
  teacherProfile,
  onLogsCountChange,
  onSyncComplete,
}) {
  const todayIso = useMemo(() => getTodayIsoDate(), []);
  const initialDateParts = todayIso.split('-');

  const [selectedMonth, setSelectedMonth] = useState(Number(initialDateParts[1]) || 11);
  const [selectedYear, setSelectedYear] = useState(Number(initialDateParts[0]) || 2026);

  const [logs, setLogs] = useState([]);
  const [adminSummary, setAdminSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [dateInput, setDateInput] = useState(todayIso);
  const [statusInput, setStatusInput] = useState('hadir');
  const [jtmInput, setJtmInput] = useState(4);
  const [noteInput, setNoteInput] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadPeriodAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const [logRows, attRows] = await Promise.all([
        api.get('attendanceLogs.list', { month: selectedMonth, year: selectedYear }),
        api.get('attendances.list', { month: selectedMonth, year: selectedYear }),
      ]);
      const normalizedLogs = Array.isArray(logRows) ? logRows : [];
      setLogs(normalizedLogs);
      setAdminSummary(Array.isArray(attRows) && attRows.length > 0 ? attRows[0] : null);
      onLogsCountChange?.(normalizedLogs.length);
    } catch (err) {
      notify.error(err.message || 'Gagal memuat catatan kehadiran & JTM.');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, onLogsCountChange]);

  useEffect(() => {
    loadPeriodAttendance();
  }, [loadPeriodAttendance]);

  const existingLogForDate = useMemo(
    () => logs.find((item) => String(item.date).trim() === String(dateInput).trim()) || null,
    [logs, dateInput]
  );

  // Sinkronkan isi form ketika memilih tanggal yang sudah pernah dicatat
  const populateFormFromLog = useCallback((logRow) => {
    if (!logRow) return;
    const st = normalizeAttendanceStatus(logRow.status);
    setDateInput(logRow.date);
    setStatusInput(st);
    setJtmInput(st === 'sakit' || st === 'izin' ? 0 : Number(logRow.jtm_hours || 0));
    setNoteInput(logRow.note || '');
  }, []);

  const handleDateChange = (nextDate) => {
    setDateInput(nextDate);
    const parts = String(nextDate || '').split('-');
    if (parts.length === 3) {
      const yr = Number(parts[0]);
      const mo = Number(parts[1]);
      if (yr >= 2020 && yr <= 2100 && mo >= 1 && mo <= 12) {
        setSelectedYear(yr);
        setSelectedMonth(mo);
      }
    }
    const matched = logs.find((item) => String(item.date).trim() === String(nextDate).trim());
    if (matched) {
      populateFormFromLog(matched);
    }
  };

  const handleSelectStatus = (nextStatusId) => {
    const meta = getAttendanceConditionMeta(nextStatusId);
    setStatusInput(meta.id);
    if (!meta.allowsJtm) {
      setJtmInput(0);
    } else if (existingLogForDate && existingLogForDate.status === meta.id) {
      setJtmInput(Number(existingLogForDate.jtm_hours || 0));
    } else if (meta.id === 'tugas') {
      setJtmInput(0);
    } else if (Number(jtmInput) === 0) {
      setJtmInput(meta.defaultJtm);
    }
  };

  const handleSaveLog = async (e) => {
    e.preventDefault();
    if (!dateInput) {
      notify.warn('Pilih tanggal kehadiran terlebih dahulu.');
      return;
    }

    const condMeta = getAttendanceConditionMeta(statusInput);
    const finalJtm = condMeta.allowsJtm ? Math.max(0, Number(jtmInput || 0)) : 0;

    setSaving(true);
    try {
      await api.post('attendanceLogs.upsertMyLog', {
        date: dateInput,
        status: condMeta.id,
        jtm_hours: finalJtm,
        note: noteInput.trim(),
      });
      notify.success(
        `Catatan ${formatDateIndo(dateInput)} (${condMeta.label}) tersimpan & otomatis masuk ke rekap Admin.`
      );
      setNoteInput('');
      await loadPeriodAttendance();
      onSyncComplete?.();
    } catch (err) {
      notify.error(err.message || 'Gagal menyimpan catatan kehadiran mandiri.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete('attendanceLogs.deleteMyLog', { id: deleteTarget.id });
      notify.success(`Catatan tanggal ${formatDateIndo(deleteTarget.date)} dihapus.`);
      setDeleteTarget(null);
      await loadPeriodAttendance();
      onSyncComplete?.();
    } catch (err) {
      notify.error(err.message || 'Gagal menghapus catatan kehadiran.');
    }
  };

  const breakdown = useMemo(() => computeAttendanceBreakdownFromLogs(logs), [logs]);
  const activeCondition = getAttendanceConditionMeta(statusInput);
  const previewJtm = activeCondition.allowsJtm ? Math.max(0, Number(jtmInput || 0)) : 0;
  const hourlyRate = Number(teacherProfile?.salary_component?.hourly_rate || 0);

  return (
    <div className="space-y-4">
      {/* Header & Period Controls */}
      <div className="nim-glass nim-card flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-[var(--ink)]">
              Catat Kehadiran &amp; JTM Mandiri
            </h2>
            <span className="nim-badge nim-badge--good">
              <CheckCircle2 className="h-3 w-3" />
              <span>Tersinkron ke Admin / Bendahara</span>
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Setiap catatan harian otomatis diakumulasi ke menu <strong>Kehadiran &amp; JTM</strong>{' '}
            Bendahara (Hadir = 1, Tugas = 0,5, Sakit/Izin = tidak hadir).
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
            {formatAttendanceNumber(breakdown.present_days)} Hari
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
          <p className="nim-kpi__value mt-2 tabular-nums">{breakdown.absent_days} Hari</p>
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
              : `Periode ${getSingleMonthName(selectedMonth)} ${selectedYear}`}
          </p>
        </div>
      </div>

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
                Hadir {formatAttendanceNumber(adminSummary.present_days)} hr
              </strong>{' '}
              •{' '}
              <strong className="text-[var(--ink)] tabular-nums">
                Tidak Hadir {formatAttendanceNumber(adminSummary.absent_days)} hr
              </strong>{' '}
              •{' '}
              <strong className="text-[var(--accent-text)] tabular-nums">
                Total {formatAttendanceNumber(adminSummary.total_jtm)} JTM
              </strong>
            </span>
          </div>
          <span className="text-[11px] text-[var(--muted)]">
            {logs.length} catatan harian tercatat
          </span>
        </div>
      )}

      {/* Main Content Split: Self Input Form + Monthly Log History */}
      <div className="fluid-container items-start">
        {/* Form Card */}
        <form onSubmit={handleSaveLog} className="fluid-item nim-glass nim-card space-y-4">
          <div
            className="flex flex-wrap items-center justify-between gap-2 pb-3"
            style={{ borderBottom: '1px solid var(--line)' }}
          >
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--ink)]">
                Form Catatan Harian
              </h3>
              <p className="text-[11px] text-[var(--muted)]">
                Pilih tanggal, kondisi kehadiran, dan jumlah jam mengajar.
              </p>
            </div>
            {existingLogForDate && (
              <span className="nim-badge nim-badge--warn">Mode Edit Tanggal Ini</span>
            )}
          </div>

          {/* Date Picker */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[180px]">
              <label
                htmlFor="guru-att-date"
                className="block text-xs font-semibold text-[var(--ink-2)]"
              >
                Tanggal Kehadiran
              </label>
              <input
                id="guru-att-date"
                type="date"
                required
                value={dateInput}
                onChange={(e) => handleDateChange(e.target.value)}
                className="nim-input mt-1 text-xs font-semibold tabular-nums"
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

          {/* Condition Options */}
          <div>
            <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1.5">
              Kondisi Kehadiran
            </span>
            <div className="grid grid-cols-2 gap-2">
              {ATTENDANCE_CONDITIONS.map((cond) => {
                const isSelected = statusInput === cond.id;
                return (
                  <button
                    key={cond.id}
                    type="button"
                    onClick={() => handleSelectStatus(cond.id)}
                    className={`rounded-xl border p-2.5 text-left transition-all ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20'
                        : 'border-[var(--line)] bg-[var(--surface)] hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-xs font-bold text-[var(--ink)]">{cond.label}</span>
                      <span className={`${TONE_BADGE_CLASS[cond.tone]} !text-[10px]`}>
                        {cond.badgeText}
                      </span>
                    </div>
                    <p className="mt-1 text-[10.5px] leading-snug text-[var(--muted)]">
                      {cond.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* JTM Hours Input */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="guru-att-jtm"
                className="block text-xs font-semibold text-[var(--ink-2)]"
              >
                Jumlah Jam Tatap Muka (JTM)
              </label>
              {!activeCondition.allowsJtm && (
                <span className="text-[11px] font-medium text-[var(--bad-text)]">
                  Terkunci 0 JTM ({activeCondition.label})
                </span>
              )}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <input
                id="guru-att-jtm"
                type="number"
                min="0"
                max="24"
                step="0.5"
                disabled={!activeCondition.allowsJtm}
                value={activeCondition.allowsJtm ? jtmInput : 0}
                onChange={(e) => setJtmInput(e.target.value)}
                className="nim-input !w-28 text-xs font-bold tabular-nums disabled:opacity-60"
              />
              {activeCondition.allowsJtm && (
                <div className="flex flex-wrap items-center gap-1">
                  {QUICK_JTM_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setJtmInput(preset)}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-semibold tabular-nums transition-colors ${
                        Number(jtmInput) === preset
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {preset} jam
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Note Input */}
          <div>
            <label
              htmlFor="guru-att-note"
              className="block text-xs font-semibold text-[var(--ink-2)]"
            >
              Keterangan / Aktivitas (Opsional)
            </label>
            <input
              id="guru-att-note"
              type="text"
              maxLength={250}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder={
                statusInput === 'tugas'
                  ? 'Contoh: Tugas rapat MGMP / dinas luar'
                  : statusInput === 'sakit' || statusInput === 'izin'
                  ? 'Contoh: Izin keperluan keluarga / surat dokter'
                  : 'Contoh: Mengajar kelas X & XI'
              }
              className="nim-input mt-1 text-xs"
            />
          </div>

          {/* Contribution Preview */}
          <div className="nim-card-well px-3.5 py-2.5 text-[11.5px] text-[var(--ink-2)] flex flex-wrap items-center justify-between gap-2">
            <span>Nilai masuk rekap Admin:</span>
            <span className="font-bold text-[var(--ink)] tabular-nums">
              +{formatAttendanceNumber(activeCondition.presentWeight)} Hadir •{' '}
              {activeCondition.absentWeight} Tidak Hadir • {formatAttendanceNumber(previewJtm)} JTM
            </span>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="nim-btn nim-btn--primary w-full"
          >
            {saving ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Menyimpan &amp; Menyinkronkan...</span>
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                <span>
                  {existingLogForDate
                    ? 'Perbarui Catatan Tanggal Ini'
                    : 'Simpan Catatan & Masuk Rekap Admin'}
                </span>
              </>
            )}
          </button>
        </form>

        {/* Daily History Card */}
        <div className="fluid-item nim-glass nim-card space-y-3">
          <div
            className="flex items-center justify-between gap-2 pb-3"
            style={{ borderBottom: '1px solid var(--line)' }}
          >
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--ink)]">
                Riwayat Catatan ({getSingleMonthName(selectedMonth)} {selectedYear})
              </h3>
              <p className="text-[11px] text-[var(--muted)]">
                Klik ikon edit untuk mengubah kondisi atau jam JTM pada tanggal tertentu.
              </p>
            </div>
            <span className="nim-badge nim-badge--accent tabular-nums">{logs.length} Hari</span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-[var(--muted)]">
              Memuat catatan kehadiran...
            </div>
          ) : logs.length === 0 ? (
            <div className="nim-card-well p-6 text-center text-xs text-[var(--muted)]">
              Belum ada catatan kehadiran mandiri pada bulan {getSingleMonthName(selectedMonth)}{' '}
              {selectedYear}. Isi formulir di sebelah untuk mulai mencatat.
            </div>
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-0.5">
              {logs.map((log) => {
                const cond = getAttendanceConditionMeta(log.status);
                const isActiveDate = String(log.date) === String(dateInput);
                return (
                  <div
                    key={log.id}
                    className={`rounded-xl border p-3 transition-colors ${
                      isActiveDate
                        ? 'border-indigo-300 bg-indigo-50/40'
                        : 'border-[var(--line)] bg-[var(--surface)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-[var(--ink)]">
                            {formatDateIndo(log.date)}
                          </span>
                          <span className={TONE_BADGE_CLASS[cond.tone]}>
                            {cond.label} • {cond.badgeText}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--muted)] tabular-nums">
                          Nilai hadir:{' '}
                          <strong className="text-[var(--ink)]">
                            +{formatAttendanceNumber(cond.presentWeight)}
                          </strong>{' '}
                          • Tidak hadir:{' '}
                          <strong className="text-[var(--ink)]">{cond.absentWeight}</strong> • JTM:{' '}
                          <strong className="text-[var(--accent-text)]">
                            {formatAttendanceNumber(cond.allowsJtm ? log.jtm_hours : 0)} jam
                          </strong>
                        </p>
                        {log.note && (
                          <p className="text-[11px] text-[var(--ink-2)] break-words">
                            “{log.note}”
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => populateFormFromLog(log)}
                          title="Edit catatan ini"
                          className="rounded-lg border border-[var(--line)] bg-white p-1.5 text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(log)}
                          title="Hapus catatan ini"
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

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Hapus Catatan Kehadiran?"
        message={
          deleteTarget
            ? `Catatan tanggal ${formatDateIndo(deleteTarget.date)} (${
                getAttendanceConditionMeta(deleteTarget.status).label
              }) akan dihapus dan rekap kehadiran Admin diperbarui otomatis.`
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
