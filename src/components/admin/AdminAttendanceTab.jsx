import React, { useState, useMemo, useEffect } from 'react';
import {
  Ban,
  Calculator,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Save,
  Search,
} from 'lucide-react';
import {
  formatRibuan,
  formatRupiah,
  getMonthName,
  getStaffCategoryLabel,
  resolveStaffCategory,
} from '../../utils/formatters';
import {
  computeAttendanceBreakdownFromLogs,
  computeClassBreakdownFromLogs,
  computeEffectiveJtmHours,
  formatAttendanceNumber,
  formatDateIndo,
  getAttendanceConditionMeta,
  getLogValidationMeta,
  normalizeLogValidationStatus,
} from '../../utils/attendanceHelpers';
import notify from '../../utils/notify';
import PaginationBar from './PaginationBar';

const EMPTY_LOGS = [];
const DEFAULT_ATT_ROW = { present_days: 0, absent_days: 0, total_jtm: 0 };

const AttendanceTeacherCard = React.memo(function AttendanceTeacherCard({
  teacher,
  row,
  monthCount,
  teacherLogs,
  isLogsExpanded,
  activeValidatingKey,
  onToggleExpand,
  onAttFieldChange,
  onSaveSingle,
  onApplyLogs,
  onValidateLogs,
  onOpenJtmCalc,
}) {
  const [rejectNoteDrafts, setRejectNoteDrafts] = useState({});

  const safeRow = row || DEFAULT_ATT_ROW;
  const hourlyRate = Number(teacher.salary_component?.hourly_rate || 0);
  const estimatedHonor = safeRow.total_jtm * hourlyRate;

  const logBreakdown = useMemo(
    () => (teacherLogs.length > 0 ? computeAttendanceBreakdownFromLogs(teacherLogs) : null),
    [teacherLogs]
  );
  const classBreakdown = useMemo(
    () => (teacherLogs.length > 0 ? computeClassBreakdownFromLogs(teacherLogs) : []),
    [teacherLogs]
  );

  const pendingIds = useMemo(
    () =>
      teacherLogs
        .filter((l) => normalizeLogValidationStatus(l.validation_status) === 'pending')
        .map((l) => l.id),
    [teacherLogs]
  );

  return (
    <div className="fluid-item nim-glass nim-card space-y-4">
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
          onClick={() => onSaveSingle(teacher)}
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
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 font-semibold text-emerald-800">
              <ClipboardList className="h-3.5 w-3.5 shrink-0" />
              <span>
                Catatan Mandiri ({logBreakdown.counted_log_count}/{logBreakdown.log_count} entri
                terhitung)
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
                  disabled={Boolean(activeValidatingKey)}
                  onClick={() =>
                    onValidateLogs(pendingIds, 'valid', '', `bulk:${teacher.id}`)
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-400 bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Check className="h-3 w-3" />
                  <span>
                    {activeValidatingKey === `bulk:${teacher.id}`
                      ? 'Memvalidasi...'
                      : 'Validasi Semua'}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onApplyLogs(teacher.id, logBreakdown);
                  notify.info(`Nilai rekap ${teacher.name} disinkronkan dari log valid.`);
                }}
                className="rounded-lg border border-emerald-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                Terapkan Log
              </button>
              <button
                type="button"
                onClick={() => onToggleExpand(teacher.id)}
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
              Tugas: <strong>{logBreakdown.tugas_count}</strong> (×0,5 Hadir &amp; 50% JTM)
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
              Total Terhitung: {formatAttendanceNumber(logBreakdown.present_days)} Hadir /{' '}
              {formatAttendanceNumber(logBreakdown.total_jtm)} JTM ({classBreakdown.length} Kelas)
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
                const isBusy = activeValidatingKey === lg.id;
                const rawLogJtm = cond.allowsJtm ? Math.max(0, Number(lg.jtm_hours || 0)) : 0;
                const effLogJtm = computeEffectiveJtmHours(lg.status, rawLogJtm);
                const noteDraft =
                  rejectNoteDrafts[lg.id] !== undefined
                    ? rejectNoteDrafts[lg.id]
                    : lg.validation_note || '';

                return (
                  <div
                    key={lg.id}
                    className={`rounded-lg px-2.5 py-2 text-[11px] border space-y-1.5 ${
                      isInvalid
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
                          className={`font-bold tabular-nums mr-1 ${
                            isInvalid ? 'line-through text-rose-500' : 'text-indigo-700'
                          }`}
                        >
                          +{formatAttendanceNumber(cond.presentWeight)} •{' '}
                          {cond.id === 'tugas' && rawLogJtm > 0
                            ? `${formatAttendanceNumber(rawLogJtm)}×50% = ${formatAttendanceNumber(
                                effLogJtm
                              )}`
                            : formatAttendanceNumber(effLogJtm)}{' '}
                          JTM
                        </span>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => onValidateLogs(lg.id, 'valid', '', lg.id)}
                          title="Tandai log ini Valid (masuk hitungan Kehadiran & JTM)"
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-semibold border transition-colors ${
                            vStatus === 'valid'
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
                          onClick={() => onValidateLogs(lg.id, 'invalid', noteDraft, lg.id)}
                          title="Tandai Tidak Valid (tidak dihitung ke Kehadiran & JTM)"
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-semibold border transition-colors ${
                            isInvalid
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
                            setRejectNoteDrafts((prev) => ({
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
                          onClick={() => onValidateLogs(lg.id, 'invalid', noteDraft, lg.id)}
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
          <label className="block text-xs font-semibold text-[var(--ink-2)]">Hari Hadir</label>
          <input
            type="number"
            min="0"
            step="0.5"
            max={31 * monthCount}
            value={safeRow.present_days}
            onChange={(e) => onAttFieldChange(teacher.id, 'present_days', e.target.value)}
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
            max={31 * monthCount}
            value={safeRow.absent_days}
            onChange={(e) => onAttFieldChange(teacher.id, 'absent_days', e.target.value)}
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
              step="any"
              max={200 * monthCount}
              value={safeRow.total_jtm}
              onChange={(e) => onAttFieldChange(teacher.id, 'total_jtm', e.target.value)}
              className="nim-input text-xs font-bold tabular-nums"
            />
            <button
              type="button"
              onClick={() => onOpenJtmCalc(teacher, safeRow.total_jtm)}
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
        <span className="text-[var(--muted)]">Estimasi Honor Mengajar (JTM × Tarif):</span>
        <span className="font-bold text-[var(--accent-text)] tabular-nums">
          {formatRupiah(estimatedHonor)}
        </span>
      </div>
    </div>
  );
});

export const AdminAttendanceTab = React.memo(function AdminAttendanceTab({
  selectedMonth,
  selectedYear,
  periodInfo,
  teachers,
  attEdits,
  attendanceLogs,
  validatingKey,
  onAttFieldChange,
  onSaveSingleAttendance,
  onSaveAllAttendances,
  onApplyTeacherLogs,
  onValidateAttendanceLogs,
  onOpenJtmCalc,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [expandedLogTeacherIds, setExpandedLogTeacherIds] = useState({});

  const logsByTeacherMap = useMemo(() => {
    const map = new Map();
    const pendingSet = new Set();
    attendanceLogs.forEach((l) => {
      let arr = map.get(l.teacher_id);
      if (!arr) {
        arr = [];
        map.set(l.teacher_id, arr);
      }
      arr.push(l);
      if (normalizeLogValidationStatus(l.validation_status) === 'pending') {
        pendingSet.add(l.teacher_id);
      }
    });
    return { map, pendingSet };
  }, [attendanceLogs]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterMode, selectedMonth, selectedYear]);

  const filteredTeachers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return teachers.filter((t) => {
      if (filterMode === 'pending_logs' && !logsByTeacherMap.pendingSet.has(t.id)) {
        return false;
      }
      if (
        (filterMode === 'pendidik' || filterMode === 'kependidikan') &&
        resolveStaffCategory(t) !== filterMode
      ) {
        return false;
      }
      if (!q) return true;
      const hay = `${t.name || ''} ${t.nip || ''} ${t.status || ''} ${getStaffCategoryLabel(
        t
      )}`.toLowerCase();
      return hay.includes(q);
    });
  }, [teachers, searchQuery, filterMode, logsByTeacherMap.pendingSet]);

  const totalPages = Math.max(1, Math.ceil(filteredTeachers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedTeachers = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredTeachers.slice(start, start + pageSize);
  }, [filteredTeachers, safePage, pageSize]);

  const handleToggleExpand = React.useCallback((teacherId) => {
    setExpandedLogTeacherIds((prev) => ({
      ...prev,
      [teacherId]: !prev[teacherId],
    }));
  }, []);

  return (
    <section className="space-y-4">
      <div className="nim-glass nim-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--ink)]">
              Input Kehadiran &amp; JTM — {getMonthName(selectedMonth)} {selectedYear}
            </h2>
            <p className="text-xs text-[var(--muted)]">
              Catat Hari Hadir, Hari Alpa, dan Total JTM bulanan sebagai dasar perhitungan otomatis.
            </p>
          </div>
          <button
            type="button"
            onClick={onSaveAllAttendances}
            className="nim-btn nim-btn--primary"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Simpan Semua Kehadiran ({formatRibuan(teachers.length)})</span>
          </button>
        </div>

        {/* Search & Filter Toolbar */}
        <div
          className="flex flex-wrap items-center justify-between gap-2 pt-3"
          style={{ borderTop: '1px solid var(--line)' }}
        >
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="h-3.5 w-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama PTK atau NIP..."
              className="nim-input !min-h-[34px] !py-1 !pl-8 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: `Semua (${teachers.length})` },
              {
                id: 'pending_logs',
                label: `Log Belum Divalidasi (${logsByTeacherMap.pendingSet.size})`,
              },
              { id: 'pendidik', label: 'Pendidik' },
              { id: 'kependidikan', label: 'Kependidikan' },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilterMode(chip.id)}
                className={`nim-btn nim-btn--sm ${
                  filterMode === chip.id ? 'nim-btn--primary' : ''
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredTeachers.length === 0 ? (
        <div className="nim-glass nim-card p-8 text-center text-xs text-[var(--muted)]">
          {teachers.length === 0
            ? 'Belum ada data PTK terdaftar.'
            : 'Tidak ada PTK yang sesuai dengan filter atau pencarian.'}
        </div>
      ) : (
        <>
          <div className="fluid-container">
            {pagedTeachers.map((teacher) => {
              const tLogs = logsByTeacherMap.map.get(teacher.id) || EMPTY_LOGS;
              const isRelatedValidating =
                Boolean(validatingKey) &&
                (validatingKey === `bulk:${teacher.id}` ||
                  tLogs.some((l) => l.id === validatingKey));

              return (
                <AttendanceTeacherCard
                  key={teacher.id}
                  teacher={teacher}
                  row={attEdits[teacher.id]}
                  monthCount={periodInfo.monthCount}
                  teacherLogs={tLogs}
                  isLogsExpanded={Boolean(expandedLogTeacherIds[teacher.id])}
                  activeValidatingKey={isRelatedValidating ? validatingKey : ''}
                  onToggleExpand={handleToggleExpand}
                  onAttFieldChange={onAttFieldChange}
                  onSaveSingle={onSaveSingleAttendance}
                  onApplyLogs={onApplyTeacherLogs}
                  onValidateLogs={onValidateAttendanceLogs}
                  onOpenJtmCalc={onOpenJtmCalc}
                />
              );
            })}
          </div>

          <PaginationBar
            page={safePage}
            pageSize={pageSize}
            totalItems={filteredTeachers.length}
            onPageChange={setPage}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setPage(1);
            }}
            itemLabel="PTK"
          />
        </>
      )}
    </section>
  );
});

export default AdminAttendanceTab;
