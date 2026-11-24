import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  FileSpreadsheet,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import api from '../../services/gasApi';
import { emitDataChange } from '../../services/realtimeSync';
import { formatRibuan } from '../../utils/formatters';
import { formatIsoDateTimeIndo } from '../../utils/disbursementHelpers';
import {
  downloadExcelBackupWorkbook,
  downloadJsonBackupFile,
  verifyBackupFileObject,
} from '../../utils/backupHelpers';
import notify from '../../utils/notify';

const RESET_SCOPE_OPTIONS = [
  {
    id: 'transactions',
    title: 'Reset Transaksi Saja',
    badgeLabel: 'Direkomendasikan',
    badgeCls: 'nim-badge nim-badge--accent',
    phrase: 'RESET TRANSAKSI',
    deletes:
      'Kehadiran & JTM harian, Rekap Kehadiran, Periode & Rincian Payroll, Pengajuan Pencairan, Belanja Sekolah, serta Notifikasi.',
    preserves:
      'Master Data PTK, Komponen Gaji, seluruh Akun Google Login (Admin, Kepsek, Guru/TU), dan Profil Sekolah.',
  },
  {
    id: 'full_operational',
    title: 'Reset Penuh (Transaksi + Master PTK)',
    badgeLabel: 'Hati-hati',
    badgeCls: 'nim-badge nim-badge--bad',
    phrase: 'RESET SEMUA DATA',
    deletes:
      'Seluruh data transaksi DI ATAS ditambah seluruh Master PTK, Komponen Gaji, dan akun login PTK/Guru.',
    preserves:
      'Seluruh Akun Admin/Bendahara, Akun Kepala Sekolah, Profil Sekolah & Logo, serta sheet Arsip tahunan sebelumnya.',
  },
];

export const DataBackupResetSection = React.memo(function DataBackupResetSection({
  onMaintenanceComplete,
  refreshSignal = 0,
}) {
  const [counts, setCounts] = useState(null);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [unsupported, setUnsupported] = useState(false);

  const [sessionBackupInfo, setSessionBackupInfo] = useState(null);

  const [restoreParseState, setRestoreParseState] = useState({
    status: 'idle', // 'idle' | 'error' | 'verified'
    fileName: '',
    error: '',
    rawBackup: null,
    meta: null,
    counts: null,
    checksum: '',
  });
  const [restorePhrase, setRestorePhrase] = useState('');

  const [resetScope, setResetScope] = useState('transactions');
  const [resetAckChecked, setResetAckChecked] = useState(false);
  const [resetPhrase, setResetPhrase] = useState('');

  const fileInputRef = useRef(null);

  const loadCounts = useCallback(async () => {
    setLoadingCounts(true);
    try {
      const statusRes = await api.get('maintenance.archiveStatus');
      setCounts(statusRes?.activeCounts || null);
      setUnsupported(false);
    } catch (err) {
      if (err?.status === 404 || String(err?.message || '').includes('404')) {
        setUnsupported(true);
      }
    } finally {
      setLoadingCounts(false);
    }
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts, refreshSignal]);

  const fetchFullBackupPayload = async () => {
    const res = await api.get('maintenance.exportBackup');
    if (!res || res.format !== 'SIPAYROLL_BACKUP') {
      throw new Error('Server tidak mengembalikan paket backup yang valid.');
    }
    return res;
  };

  const handleDownloadJsonBackup = async () => {
    setBusyAction('export_json');
    try {
      const backupObj = await fetchFullBackupPayload();
      const filename = downloadJsonBackupFile(backupObj, 'SIPAYROLL_Backup');
      setSessionBackupInfo({
        filename,
        exportedAt: backupObj.exported_at,
        checksum: backupObj.checksum_sha256,
        counts: backupObj.counts,
      });
      notify.success(`Backup Sistem (${filename}) berhasil diunduh.`);
      return backupObj;
    } catch (err) {
      if (err?.status === 404 || String(err?.message || '').includes('404')) {
        setUnsupported(true);
      }
      notify.error(err?.message || 'Gagal mengunduh Backup Sistem (.JSON).');
      return null;
    } finally {
      setBusyAction('');
    }
  };

  const handleDownloadExcelBackup = async () => {
    setBusyAction('export_xlsx');
    try {
      const backupObj = await fetchFullBackupPayload();
      const filename = await downloadExcelBackupWorkbook(backupObj);
      notify.success(`Arsip Laporan Excel (${filename}) berhasil diunduh.`);
    } catch (err) {
      if (err?.status === 404 || String(err?.message || '').includes('404')) {
        setUnsupported(true);
      }
      notify.error(err?.message || 'Gagal membuat Arsip Laporan (.XLSX).');
    } finally {
      setBusyAction('');
    }
  };

  const handleFilePicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setRestorePhrase('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const check = await verifyBackupFileObject(parsed);
      if (!check.ok) {
        setRestoreParseState({
          status: 'error',
          fileName: file.name,
          error: check.error || 'Verifikasi integritas file backup gagal.',
          rawBackup: null,
          meta: null,
          counts: null,
          checksum: '',
        });
        notify.error(check.error || 'File backup tidak lolos verifikasi integritas.');
        return;
      }

      setRestoreParseState({
        status: 'verified',
        fileName: file.name,
        error: '',
        rawBackup: parsed,
        meta: check.meta,
        counts: check.counts,
        checksum: check.checksum,
      });
      notify.success(`Checksum SHA-256 valid untuk "${file.name}". Periksa pratinjau sebelum memulihkan.`);
    } catch {
      setRestoreParseState({
        status: 'error',
        fileName: file.name,
        error: 'File gagal dibaca atau bukan JSON yang valid.',
        rawBackup: null,
        meta: null,
        counts: null,
        checksum: '',
      });
      notify.error('File backup gagal dibaca atau format JSON rusak.');
    }
  };

  const clearRestoreSelection = () => {
    setRestoreParseState({
      status: 'idle',
      fileName: '',
      error: '',
      rawBackup: null,
      meta: null,
      counts: null,
      checksum: '',
    });
    setRestorePhrase('');
  };

  const handleExecuteRestore = async () => {
    if (restoreParseState.status !== 'verified' || !restoreParseState.rawBackup) return;
    if (restorePhrase.trim().toUpperCase() !== 'PULIHKAN DATA') {
      notify.warn('Ketik persis frasa "PULIHKAN DATA" untuk melanjutkan pemulihan.');
      return;
    }

    setBusyAction('restore');
    try {
      // Safety net: unduh cadangan kondisi saat ini terlebih dahulu sebelum menimpa
      try {
        const preRestoreBackup = await fetchFullBackupPayload();
        downloadJsonBackupFile(preRestoreBackup, 'SIPAYROLL_AutoBackup_Sebelum_Restore');
      } catch {
        // Tetap lanjut jika ekspor pra-restore gagal di sisi lokal
      }

      const res = await api.post('maintenance.restoreBackup', {
        backup: restoreParseState.rawBackup,
        confirm_phrase: 'PULIHKAN DATA',
      });

      notify.success(
        `Pemulihan berhasil! (${formatRibuan(res?.restoredCounts?.teachers || 0)} PTK, ${formatRibuan(
          res?.restoredCounts?.payrolls || 0
        )} periode payroll dipulihkan).`
      );
      clearRestoreSelection();
      emitDataChange(
        [
          'teachers',
          'attendances',
          'payrolls',
          'disbursements',
          'reimbursements',
          'notifications',
          'school_profile',
        ],
        { source: 'admin_maintenance' }
      );
      await loadCounts();
      onMaintenanceComplete?.();
    } catch (err) {
      notify.error(err?.message || 'Gagal memulihkan data dari file backup.');
    } finally {
      setBusyAction('');
    }
  };

  const selectedScopeMeta =
    RESET_SCOPE_OPTIONS.find((opt) => opt.id === resetScope) || RESET_SCOPE_OPTIONS[0];
  const isResetPhraseValid =
    resetPhrase.trim().toUpperCase() === selectedScopeMeta.phrase;
  const canExecuteReset =
    Boolean(sessionBackupInfo) &&
    resetAckChecked &&
    isResetPhraseValid &&
    !busyAction;

  const handleExecuteReset = async () => {
    if (!canExecuteReset) return;
    setBusyAction('reset');
    try {
      const res = await api.post('maintenance.resetData', {
        scope: resetScope,
        backup_confirmed: true,
        confirm_phrase: selectedScopeMeta.phrase,
      });

      const del = res?.deletedCounts || {};
      notify.success(
        resetScope === 'full_operational'
          ? `Reset penuh selesai (${formatRibuan(del.teachers || 0)} PTK & ${formatRibuan(
              del.payrolls || 0
            )} payroll dibersihkan). Akun Admin, Kepsek & Profil Sekolah tetap aman.`
          : `Reset transaksi selesai (${formatRibuan(del.payrolls || 0)} payroll & ${formatRibuan(
              del.attendances || 0
            )} kehadiran dibersihkan). Master PTK & Komponen Gaji tetap aman.`
      );
      setResetAckChecked(false);
      setResetPhrase('');
      setSessionBackupInfo(null);
      emitDataChange(
        [
          'teachers',
          'attendances',
          'payrolls',
          'disbursements',
          'reimbursements',
          'notifications',
          'school_profile',
        ],
        { source: 'admin_maintenance' }
      );
      await loadCounts();
      onMaintenanceComplete?.();
    } catch (err) {
      notify.error(err?.message || 'Gagal menjalankan reset data.');
    } finally {
      setBusyAction('');
    }
  };

  return (
    <section className="space-y-6">
      {/* Card 1: Backup & Restore */}
      <div className="nim-glass nim-card space-y-4">
        <div
          className="flex flex-wrap items-center justify-between gap-3 pb-3"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <span className="nim-kpi__ico">
              <DatabaseBackup className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[var(--ink)]">
                Backup &amp; Pemulihan Data (Restore)
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Unduh cadangan terverifikasi SHA-256 (.JSON) untuk pemulihan presisi, atau ekspor
                arsip laporan multi-sheet (.XLSX) untuk audit Excel.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="nim-badge nim-badge--good !text-[10.5px]">
              <ShieldCheck className="h-3 w-3" />
              <span>Bebas Kredensial &amp; Checksum SHA-256</span>
            </span>
            <button
              type="button"
              onClick={loadCounts}
              disabled={loadingCounts}
              className="nim-btn nim-btn--sm"
              title="Segarkan jumlah data aktif"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingCounts ? 'animate-spin' : ''}`} />
              <span>Segarkan</span>
            </button>
          </div>
        </div>

        {unsupported ? (
          <div
            className="rounded-xl p-3.5 flex items-start gap-2.5 text-xs"
            style={{
              background: 'var(--warn-soft)',
              boxShadow: 'inset 0 0 0 1px var(--warn-line)',
            }}
          >
            <ShieldAlert
              className="h-4 w-4 shrink-0 mt-0.5"
              style={{ color: 'var(--warn-text)' }}
            />
            <div>
              <p className="font-bold" style={{ color: 'var(--warn-text)' }}>
                Backend Google Apps Script perlu diperbarui untuk fitur Backup/Restore/Reset
              </p>
              <p className="text-[var(--ink-2)] mt-0.5">
                Deploy ulang skrip GAS terbaru lalu muat ulang halaman agar tombol cadangan dan
                reset terhubung ke Google Sheets Anda.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Button Card 1: JSON Backup */}
              <div className="nim-card-well p-3.5 flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-[var(--ink)]">
                    1. Backup Sistem (.JSON)
                  </p>
                  <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                    Memotret seluruh data operasional, profil sekolah, dan PTK beserta{' '}
                    <strong>checksum SHA-256</strong> untuk kebutuhan Restore.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={handleDownloadJsonBackup}
                  className="nim-btn nim-btn--primary nim-btn--sm w-full"
                >
                  <DatabaseBackup className="h-3.5 w-3.5" />
                  <span>
                    {busyAction === 'export_json'
                      ? 'Menyiapkan .JSON...'
                      : 'Unduh Backup Sistem (.JSON)'}
                  </span>
                </button>
              </div>

              {/* Button Card 2: XLSX Backup */}
              <div className="nim-card-well p-3.5 flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-[var(--ink)]">
                    2. Backup Arsip Laporan (.XLSX)
                  </p>
                  <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                    Workbook Excel 8 sheet (Master PTK, Kehadiran, Slip Gaji, Pencairan, Belanja
                    Sekolah) siap dibuka dan dicetak manual.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={handleDownloadExcelBackup}
                  className="nim-btn nim-btn--good nim-btn--sm w-full"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>
                    {busyAction === 'export_xlsx'
                      ? 'Menyusun .XLSX...'
                      : 'Unduh Arsip Laporan (.XLSX)'}
                  </span>
                </button>
              </div>

              {/* Button Card 3: Restore Picker */}
              <div className="nim-card-well p-3.5 flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-[var(--ink)]">
                    3. Pulihkan Data (Restore)
                  </p>
                  <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                    Unggah file <code>.json</code> cadangan resmi. Sistem akan memverifikasi
                    checksum &amp; menampilkan pratinjau sebelum memulihkan.
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFilePicked}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => fileInputRef.current?.click()}
                  className="nim-btn nim-btn--sm w-full"
                >
                  <Upload className="h-3.5 w-3.5 text-[var(--accent-text)]" />
                  <span>Pilih File Backup (.JSON)</span>
                </button>
              </div>
            </div>

            {sessionBackupInfo && (
              <div
                className="rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                style={{
                  background: 'var(--good-soft)',
                  boxShadow: 'inset 0 0 0 1px var(--good-line)',
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="h-4 w-4 text-[var(--good-text)] shrink-0" />
                  <span className="text-[var(--ink)] truncate">
                    Cadangan terbaru diunduh: <strong>{sessionBackupInfo.filename}</strong> (
                    {formatIsoDateTimeIndo(sessionBackupInfo.exportedAt)})
                  </span>
                </div>
                <span className="text-[10.5px] font-mono text-[var(--good-text)]">
                  SHA-256: {String(sessionBackupInfo.checksum || '').slice(0, 16)}…
                </span>
              </div>
            )}

            {/* Restore Error Panel */}
            {restoreParseState.status === 'error' && (
              <div
                className="rounded-xl p-3.5 flex items-start justify-between gap-3 text-xs"
                style={{
                  background: 'var(--bad-soft)',
                  boxShadow: 'inset 0 0 0 1px var(--bad-line)',
                }}
              >
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="h-4 w-4 text-[var(--bad-text)] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-[var(--bad-text)]">
                      File Backup Ditolak ({restoreParseState.fileName})
                    </p>
                    <p className="text-[var(--ink-2)] mt-0.5">{restoreParseState.error}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearRestoreSelection}
                  className="nim-btn nim-btn--sm shrink-0"
                >
                  Tutup
                </button>
              </div>
            )}

            {/* Restore Verified Preview Panel */}
            {restoreParseState.status === 'verified' && (
              <div
                className="rounded-2xl p-4 space-y-3"
                style={{
                  background: 'var(--accent-soft)',
                  boxShadow: 'inset 0 0 0 1.5px var(--accent-glow)',
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="nim-badge nim-badge--good !text-[10.5px]">
                      <ShieldCheck className="h-3 w-3" />
                      <span>Integritas Checksum SHA-256 Terverifikasi</span>
                    </span>
                    <h3 className="mt-1.5 text-sm font-bold text-[var(--ink)]">
                      Pratinjau Pemulihan: {restoreParseState.fileName}
                    </h3>
                    <p className="text-[11px] text-[var(--ink-2)]">
                      Sekolah: <strong>{restoreParseState.meta?.school_name}</strong> • Waktu
                      Backup: <strong>{formatIsoDateTimeIndo(restoreParseState.meta?.exported_at)}</strong>{' '}
                      • Oleh: <strong>{restoreParseState.meta?.exported_by || '-'}</strong>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={clearRestoreSelection}
                    className="nim-btn nim-btn--sm"
                  >
                    Batalkan
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { label: 'PTK', val: restoreParseState.counts?.teachers || 0 },
                    { label: 'Periode Payroll', val: restoreParseState.counts?.payrolls || 0 },
                    { label: 'Rekap Hadir', val: restoreParseState.counts?.attendances || 0 },
                    { label: 'Pencairan PTK', val: restoreParseState.counts?.disbursements || 0 },
                    { label: 'Belanja Sekolah', val: restoreParseState.counts?.reimbursements || 0 },
                  ].map((item) => (
                    <div key={item.label} className="nim-card-well p-2 text-center">
                      <span className="block text-[10px] text-[var(--muted)]">{item.label}</span>
                      <span className="text-sm font-bold text-[var(--ink)] tabular-nums">
                        {formatRibuan(item.val)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-end gap-2.5 pt-1">
                  <div className="flex-1">
                    <label
                      htmlFor="restore-confirm-phrase"
                      className="block text-[11px] font-bold text-[var(--ink)] mb-1"
                    >
                      Ketik <code>PULIHKAN DATA</code> (sistem akan otomatis mengunduh cadangan
                      kondisi saat ini terlebih dahulu):
                    </label>
                    <input
                      id="restore-confirm-phrase"
                      type="text"
                      value={restorePhrase}
                      onChange={(e) => setRestorePhrase(e.target.value)}
                      placeholder="PULIHKAN DATA"
                      className="nim-input !min-h-[36px] text-xs font-bold uppercase tracking-wide"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={
                      Boolean(busyAction) ||
                      restorePhrase.trim().toUpperCase() !== 'PULIHKAN DATA'
                    }
                    onClick={handleExecuteRestore}
                    className="nim-btn nim-btn--primary disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>
                      {busyAction === 'restore'
                        ? 'Memulihkan Data...'
                        : 'Auto-Backup & Pulihkan Data'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Card 2: Safe Data Reset (2-Tier + Multi-Layer Guardrails) */}
      {!unsupported && (
        <div
          className="nim-glass nim-card space-y-4"
          style={{
            boxShadow: 'inset 0 0 0 1px var(--bad-line)',
          }}
        >
          <div
            className="flex flex-wrap items-center justify-between gap-3 pb-3"
            style={{ borderBottom: '1px solid var(--line)' }}
          >
            <div className="flex items-center gap-3">
              <span
                className="nim-kpi__ico"
                style={{ background: 'var(--bad-soft)', color: 'var(--bad-text)' }}
              >
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[var(--ink)]">
                  Reset Data Sistem (Berpengaman Berlapis)
                </h2>
                <p className="text-xs text-[var(--muted)]">
                  Bersihkan data pasca uji coba atau mulai tahun buku baru secara terkendali tanpa
                  mengunci akun Admin &amp; Kepala Sekolah.
                </p>
              </div>
            </div>

            <span className="nim-badge nim-badge--warn !text-[10.5px]">
              <Lock className="h-3 w-3" />
              <span>Wajib Backup Sebelum Reset</span>
            </span>
          </div>

          {/* Step 1: Scope Picker */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-[var(--ink-2)]">
              Langkah 1 — Pilih Cakupan Reset Data:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {RESET_SCOPE_OPTIONS.map((opt) => {
                const isSelected = resetScope === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setResetScope(opt.id);
                      setResetPhrase('');
                    }}
                    className="rounded-2xl p-3.5 text-left transition-all space-y-2"
                    style={{
                      background: isSelected
                        ? opt.id === 'full_operational'
                          ? 'var(--bad-soft)'
                          : 'var(--warn-soft)'
                        : 'var(--card-2)',
                      boxShadow: isSelected
                        ? opt.id === 'full_operational'
                          ? 'inset 0 0 0 1.5px var(--bad-line)'
                          : 'inset 0 0 0 1.5px var(--warn-line)'
                        : 'inset 0 0 0 1px var(--line)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm font-bold text-[var(--ink)]">
                        {opt.title}
                      </span>
                      <span className={`${opt.badgeCls} !text-[10px]`}>{opt.badgeLabel}</span>
                    </div>
                    <p className="text-[11px] text-[var(--ink-2)] leading-snug">
                      <strong className="text-[var(--bad-text)]">Dihapus:</strong> {opt.deletes}
                    </p>
                    <p className="text-[11px] text-[var(--ink-2)] leading-snug">
                      <strong className="text-[var(--good-text)]">Dipertahankan:</strong>{' '}
                      {opt.preserves}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Impact Preview */}
          {counts && (
            <div className="nim-card-well p-3 space-y-1.5 text-xs">
              <p className="font-bold text-[var(--ink-2)]">
                Pratinjau Dampak pada Database Aktif ({selectedScopeMeta.title}):
              </p>
              <div className="flex flex-wrap gap-1.5">
                <span className="nim-badge nim-badge--bad !text-[10.5px]">
                  {formatRibuan(counts.payrolls || 0)} Periode Payroll
                </span>
                <span className="nim-badge nim-badge--bad !text-[10.5px]">
                  {formatRibuan(counts.payroll_details || 0)} Rincian Slip
                </span>
                <span className="nim-badge nim-badge--bad !text-[10.5px]">
                  {formatRibuan(counts.attendances || 0)} Rekap Kehadiran
                </span>
                <span className="nim-badge nim-badge--bad !text-[10.5px]">
                  {formatRibuan(counts.attendance_logs || 0)} Log Harian
                </span>
                <span className="nim-badge nim-badge--bad !text-[10.5px]">
                  {formatRibuan(counts.disbursements || 0)} Pencairan
                </span>
                <span className="nim-badge nim-badge--bad !text-[10.5px]">
                  {formatRibuan(counts.reimbursements || 0)} Belanja Sekolah
                </span>
                {resetScope === 'full_operational' ? (
                  <span className="nim-badge nim-badge--bad !text-[10.5px]">
                    {formatRibuan(counts.teachers || 0)} Master PTK &amp; Gaji
                  </span>
                ) : (
                  <span className="nim-badge nim-badge--good !text-[10.5px]">
                    {formatRibuan(counts.teachers || 0)} Master PTK Aman
                  </span>
                )}
                <span className="nim-badge nim-badge--good !text-[10.5px]">
                  Akun Admin, Kepsek &amp; Profil Sekolah Aman
                </span>
              </div>
            </div>
          )}

          {/* Step 2 & 3 Guardrails */}
          <div className="nim-card-well p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                {sessionBackupInfo ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-[var(--good-text)] shrink-0" />
                    <span className="font-semibold text-[var(--good-text)]">
                      Langkah 2 Terpenuhi — Backup sesi ini sudah diunduh ({sessionBackupInfo.filename}).
                    </span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-4 w-4 text-[var(--warn-text)] shrink-0" />
                    <span className="font-semibold text-[var(--warn-text)]">
                      Langkah 2 — Unduh Backup Sistem (.JSON) terlebih dahulu untuk membuka tombol
                      Reset.
                    </span>
                  </>
                )}
              </div>
              {!sessionBackupInfo && (
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={handleDownloadJsonBackup}
                  className="nim-btn nim-btn--primary nim-btn--sm"
                >
                  <DatabaseBackup className="h-3.5 w-3.5" />
                  <span>Unduh Backup (.JSON) Sekarang</span>
                </button>
              )}
            </div>

            <label className="flex items-start gap-2.5 text-xs text-[var(--ink-2)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={resetAckChecked}
                onChange={(e) => setResetAckChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-rose-600 shrink-0"
              />
              <span>
                Saya memahami tindakan <strong>{selectedScopeMeta.title}</strong> akan menghapus
                data terpilih pada sistem aktif dan laporan audit otomatis dikirim ke{' '}
                <strong>Kepala Sekolah</strong>.
              </span>
            </label>

            <div className="flex flex-col sm:flex-row sm:items-end gap-2.5">
              <div className="flex-1">
                <label
                  htmlFor="reset-confirm-phrase"
                  className="block text-[11px] font-bold text-[var(--ink)] mb-1"
                >
                  Langkah 3 — Ketik frasa pengaman <code>{selectedScopeMeta.phrase}</code>:
                </label>
                <input
                  id="reset-confirm-phrase"
                  type="text"
                  value={resetPhrase}
                  onChange={(e) => setResetPhrase(e.target.value)}
                  placeholder={selectedScopeMeta.phrase}
                  className="nim-input !min-h-[36px] text-xs font-bold uppercase tracking-wide"
                />
              </div>

              <button
                type="button"
                disabled={!canExecuteReset}
                onClick={handleExecuteReset}
                className="nim-btn nim-btn--danger disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>
                  {busyAction === 'reset'
                    ? 'Menjalankan Reset...'
                    : `Jalankan ${selectedScopeMeta.title}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
});

export default DataBackupResetSection;
