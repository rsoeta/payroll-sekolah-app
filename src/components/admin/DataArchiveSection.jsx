import React, { useState, useEffect, useCallback } from 'react';
import {
  Archive,
  Bell,
  CheckCircle2,
  Database,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import api from '../../services/gasApi';
import { emitDataChange } from '../../services/realtimeSync';
import { formatRibuan } from '../../utils/formatters';
import notify from '../../utils/notify';
import ConfirmModal from '../ConfirmModal';

export const DataArchiveSection = React.memo(function DataArchiveSection({
  onMaintenanceComplete,
  refreshSignal = 0,
}) {
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: '',
    message: '',
    variant: 'primary',
    onConfirm: null,
  });

  const loadArchiveStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('maintenance.archiveStatus');
      setStatusData(data || null);
      setUnsupported(false);
    } catch (err) {
      if (err?.status === 404 || String(err?.message || '').includes('404')) {
        setUnsupported(true);
      } else {
        notify.error(err?.message || 'Gagal memuat status arsip tahunan.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadArchiveStatus();
  }, [loadArchiveStatus, refreshSignal]);

  const requestArchiveYear = (yearRow) => {
    setConfirmState({
      isOpen: true,
      title: `Arsipkan Data Tahun ${yearRow.year}`,
      message:
        `Sebanyak ${formatRibuan(yearRow.archivableRowsCount)} baris data tahun ${yearRow.year} ` +
        `(Log Kehadiran Harian: ${formatRibuan(yearRow.attendanceLogsCount)}, Rekap Kehadiran: ` +
        `${formatRibuan(yearRow.attendancesCount)}, Rincian Slip Paid: ${formatRibuan(
          yearRow.payrollDetailsCount
        )}) akan dipindahkan ke sheet arsip terpisah (Archive_*_${yearRow.year}).\n\n` +
        `Data tetap aman di Google Sheets dan rincian periode Payroll tahun ${yearRow.year} tetap bisa dibuka kapan saja.`,
      variant: 'primary',
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
        setBusyAction(`archive:${yearRow.year}`);
        try {
          const res = await api.post('maintenance.archiveYear', { year: yearRow.year });
          notify.success(
            `Arsip tahun ${yearRow.year} selesai! Log: ${formatRibuan(
              res?.movedAttendanceLogs || 0
            )}, Rekap: ${formatRibuan(res?.movedAttendances || 0)}, Detail Slip: ${formatRibuan(
              res?.movedPayrollDetails || 0
            )} dipindahkan.`
          );
          emitDataChange(['attendances', 'payrolls'], { source: 'admin_archive' });
          await loadArchiveStatus();
          onMaintenanceComplete?.();
        } catch (err) {
          notify.error(err?.message || `Gagal mengarsipkan data tahun ${yearRow.year}.`);
        } finally {
          setBusyAction('');
        }
      },
    });
  };

  const requestPruneNotifications = () => {
    const count = Number(statusData?.notificationsStats?.prunableReadOldCount || 0);
    setConfirmState({
      isOpen: true,
      title: 'Bersihkan Notifikasi Lama (> 90 Hari)',
      message: `Hapus ${formatRibuan(
        count
      )} notifikasi berstatus sudah dibaca yang berusia lebih dari 90 hari agar sheet Notifications tetap ringan?`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
        setBusyAction('prune_notifs');
        try {
          const res = await api.post('maintenance.pruneNotifications', { olderThanDays: 90 });
          notify.success(
            `${formatRibuan(res?.removedCount || 0)} notifikasi lama dibersihkan. Tersisa ${formatRibuan(
              res?.remainingCount || 0
            )} notifikasi.`
          );
          emitDataChange(['notifications'], { source: 'admin_archive' });
          await loadArchiveStatus();
        } catch (err) {
          notify.error(err?.message || 'Gagal membersihkan notifikasi lama.');
        } finally {
          setBusyAction('');
        }
      },
    });
  };

  const counts = statusData?.activeCounts || {};
  const yearly = Array.isArray(statusData?.yearlyBreakdown) ? statusData.yearlyBreakdown : [];
  const archives = Array.isArray(statusData?.archiveSheets) ? statusData.archiveSheets : [];
  const notifStats = statusData?.notificationsStats || {};

  return (
    <section className="space-y-4">
      <div className="nim-glass nim-card space-y-4">
        <div
          className="flex flex-wrap items-center justify-between gap-3 pb-3"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <span className="nim-kpi__ico">
              <Database className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[var(--ink)]">
                Arsip Tahunan &amp; Pemeliharaan Kapasitas Google Sheets
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Pindahkan data tahun anggaran sebelumnya ke sheet arsip agar sheet aktif tetap cepat
                tanpa menghapus riwayat.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={loadArchiveStatus}
            className="nim-btn nim-btn--sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan Status</span>
          </button>
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
                Backend GAS masih menggunakan versi sebelum v18
              </p>
              <p className="text-[var(--ink-2)] mt-0.5">
                Fitur Arsip Tahunan &amp; Pembersihan Notifikasi aktif otomatis setelah Anda
                men-deploy <code>gas/v18_ArchiveAndMaintenance.js</code> di Google Apps Script.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Active Sheet Capacity Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {[
                { label: 'PTK Aktif', val: counts.teachers || 0 },
                { label: 'Log Kehadiran', val: counts.attendance_logs || 0 },
                { label: 'Rekap Kehadiran', val: counts.attendances || 0 },
                { label: 'Periode Payroll', val: counts.payrolls || 0 },
                { label: 'Detail Slip Aktif', val: counts.payroll_details || 0 },
                { label: 'Notifikasi', val: counts.notifications || 0 },
              ].map((m) => (
                <div key={m.label} className="nim-card-well p-2.5 text-center">
                  <span className="block text-[10.5px] text-[var(--muted)] truncate">{m.label}</span>
                  <span className="mt-0.5 block text-sm sm:text-base font-bold text-[var(--ink)] tabular-nums">
                    {formatRibuan(m.val)}
                  </span>
                </div>
              ))}
            </div>

            {/* Yearly Archival List */}
            <div className="space-y-2.5">
              <h3 className="text-sm font-bold text-[var(--ink)] flex items-center gap-1.5">
                <Archive className="h-4 w-4 text-[var(--accent-text)]" />
                <span>Daftar Tahun Anggaran pada Sheet Aktif</span>
              </h3>

              {yearly.length === 0 ? (
                <p className="text-xs text-[var(--muted)] nim-card-well p-4 text-center">
                  Belum ada data transaksi tahunan pada sheet aktif.
                </p>
              ) : (
                <div className="fluid-container">
                  {yearly.map((yrRow) => {
                    const isCurrentOrFuture = Number(yrRow.year) >= Number(statusData?.currentYear);
                    const isArchivingThis = busyAction === `archive:${yrRow.year}`;

                    return (
                      <div
                        key={yrRow.year}
                        className="fluid-item nim-card-well p-3.5 flex flex-col justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-base font-bold text-[var(--ink)]">
                              Tahun {yrRow.year}
                            </span>
                            {isCurrentOrFuture ? (
                              <span className="nim-badge nim-badge--accent">Tahun Berjalan</span>
                            ) : yrRow.unpaidPayrollsCount > 0 ? (
                              <span className="nim-badge nim-badge--warn">
                                {yrRow.unpaidPayrollsCount} Payroll Belum Dibayar
                              </span>
                            ) : yrRow.canArchiveSafely ? (
                              <span className="nim-badge nim-badge--good">Siap Diarsipkan</span>
                            ) : (
                              <span className="nim-badge">Sudah Ringkas</span>
                            )}
                          </div>

                          <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-[var(--muted)]">
                            <div>
                              <span className="block">Log Harian</span>
                              <strong className="text-[var(--ink)] tabular-nums">
                                {formatRibuan(yrRow.attendanceLogsCount)}
                              </strong>
                            </div>
                            <div>
                              <span className="block">Rekap Bulanan</span>
                              <strong className="text-[var(--ink)] tabular-nums">
                                {formatRibuan(yrRow.attendancesCount)}
                              </strong>
                            </div>
                            <div>
                              <span className="block">Rincian Slip</span>
                              <strong className="text-[var(--ink)] tabular-nums">
                                {formatRibuan(yrRow.payrollDetailsCount)}
                              </strong>
                            </div>
                          </div>
                        </div>

                        <div
                          className="flex items-center justify-end pt-2"
                          style={{ borderTop: '1px solid var(--line)' }}
                        >
                          {yrRow.canArchiveSafely ? (
                            <button
                              type="button"
                              disabled={Boolean(busyAction)}
                              onClick={() => requestArchiveYear(yrRow)}
                              className="nim-btn nim-btn--primary nim-btn--sm"
                            >
                              <Archive className="h-3.5 w-3.5" />
                              <span>
                                {isArchivingThis
                                  ? 'Mengarsipkan...'
                                  : `Arsipkan Tahun ${yrRow.year}`}
                              </span>
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--muted)]">
                              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--good-text)]" />
                              <span>
                                {isCurrentOrFuture
                                  ? 'Menunggu pergantian tahun'
                                  : yrRow.unpaidPayrollsCount > 0
                                  ? 'Selesaikan pembayaran payroll dulu'
                                  : 'Tidak ada baris aktif tersisa'}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Notification Pruning & Existing Archive Sheets */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
              <div className="nim-card-well p-3.5 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-start gap-2.5">
                  <Bell className="h-4 w-4 text-[var(--accent-text)] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-[var(--ink)]">
                      Pembersihan Notifikasi Lama (&gt; 90 Hari)
                    </p>
                    <p className="text-[11px] text-[var(--muted)]">
                      Total: {formatRibuan(notifStats.totalCount || 0)} • Belum dibaca:{' '}
                      {formatRibuan(notifStats.unreadCount || 0)} • Siap bersihkan:{' '}
                      <strong className="text-[var(--ink)]">
                        {formatRibuan(notifStats.prunableReadOldCount || 0)}
                      </strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={
                    Boolean(busyAction) || Number(notifStats.prunableReadOldCount || 0) === 0
                  }
                  onClick={requestPruneNotifications}
                  className="nim-btn nim-btn--danger nim-btn--sm disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>
                    {busyAction === 'prune_notifs' ? 'Membersihkan...' : 'Bersihkan (> 90 Hr)'}
                  </span>
                </button>
              </div>

              <div className="nim-card-well p-3.5 space-y-1.5">
                <p className="text-xs font-bold text-[var(--ink)]">
                  Sheet Arsip Tersimpan ({archives.length})
                </p>
                {archives.length === 0 ? (
                  <p className="text-[11px] text-[var(--muted)]">
                    Belum ada sheet arsip yang dibuat.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {archives.map((sh) => (
                      <span key={sh.sheetName} className="nim-badge !text-[10.5px]">
                        {sh.sheetName} ({formatRibuan(sh.rowCount)} baris)
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        variant={confirmState.variant}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
      />
    </section>
  );
});

export default DataArchiveSection;
