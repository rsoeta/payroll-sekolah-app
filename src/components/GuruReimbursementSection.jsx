import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Info,
  Pencil,
  Receipt,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import api from '../services/gasApi';
import { emitDataChange, subscribeDataChange } from '../services/realtimeSync';
import notify from '../utils/notify';
import {
  formatRibuan,
  formatRupiah,
  getMonthName,
  MONTHS_ID,
  parseRibuan,
} from '../utils/formatters';
import { formatIsoDateTimeIndo } from '../utils/disbursementHelpers';
import { getTodayIsoDate, normalizeIsoDateOnly } from '../utils/attendanceHelpers';
import {
  formatExpenseDateIndo,
  getReimbursementCategoryMeta,
  getReimbursementStatusMeta,
  isSafeReceiptUrl,
  REIMBURSEMENT_CATEGORIES,
} from '../utils/reimbursementHelpers';
import ConfirmModal from './ConfirmModal';
import DatePicker from './DatePicker';
import PaginationBar from './admin/PaginationBar';
import ReceiptLightboxModal from './ReceiptLightboxModal';

export function GuruReimbursementSection({
  teacherProfile,
  targetTeacherId = '',
  assistingMeta = null,
  initialPeriod,
  initialItems,
  onReimbursementsChange,
}) {
  const now = new Date();
  const todayIso = getTodayIsoDate();
  const defaultMonth = Number(initialPeriod?.month || now.getMonth() + 1);
  const defaultYear = Number(initialPeriod?.year || now.getFullYear());

  const hasPrefetch = Array.isArray(initialItems);
  const [items, setItems] = useState(() => (hasPrefetch ? initialItems : []));
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayIso);
  const [targetMonth, setTargetMonth] = useState(defaultMonth);
  const [targetYear, setTargetYear] = useState(defaultYear);
  const [periodManuallyPicked, setPeriodManuallyPicked] = useState(false);
  const [category, setCategory] = useState('atk');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState(0);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [note, setNote] = useState('');

  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [previewReceipt, setPreviewReceipt] = useState(null);

  const skipInitialFetchRef = useRef(hasPrefetch);

  const loadData = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const targetParam = targetTeacherId ? { target_teacher_id: targetTeacherId } : {};
        const list = await api.get('reimbursements.list', targetParam);
        const validList = Array.isArray(list) ? list : [];
        setItems(validList);
        return validList;
      } catch (err) {
        if (!silent) {
          notify.error(err.message || 'Gagal memuat catatan belanja sekolah.');
        }
        return null;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [targetTeacherId]
  );

  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return;
    }
    loadData();
  }, [loadData]);

  useEffect(() => {
    return subscribeDataChange((domains, meta) => {
      if (meta?.source === 'guru_reimb_local') return;
      if (domains.includes('reimbursements') || domains.includes('payrolls')) {
        loadData({ silent: true });
      }
    });
  }, [loadData]);

  const resetForm = useCallback(() => {
    setEditingId('');
    setExpenseDate(getTodayIsoDate());
    setTargetMonth(defaultMonth);
    setTargetYear(defaultYear);
    setPeriodManuallyPicked(false);
    setCategory('atk');
    setTitle('');
    setAmount(0);
    setReceiptNumber('');
    setReceiptUrl('');
    setNote('');
  }, [defaultMonth, defaultYear]);

  const handleExpenseDateChange = (val) => {
    let cleanVal = normalizeIsoDateOnly(val) || String(val || '').trim();
    const todayMax = getTodayIsoDate();
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanVal) && cleanVal > todayMax) {
      notify.warn('Tanggal pembelian tidak boleh melebihi hari ini.');
      cleanVal = todayMax;
    }
    setExpenseDate(cleanVal);
    const match = String(cleanVal || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match && !editingId && !periodManuallyPicked) {
      const yNum = Number(match[1]);
      const mNum = Number(match[2]);
      if (yNum >= 2025 && yNum <= 2028) setTargetYear(yNum);
      if (mNum >= 1 && mNum <= 12) setTargetMonth(mNum);
    }
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setExpenseDate(item.expense_date || getTodayIsoDate());
    setTargetMonth(Number(item.month || defaultMonth));
    setTargetYear(Number(item.year || defaultYear));
    setPeriodManuallyPicked(true);
    setCategory(item.category || 'lainnya');
    setTitle(item.title || '');
    setAmount(Number(item.amount || 0));
    setReceiptNumber(item.receipt_number || '');
    setReceiptUrl(item.receipt_url || '');
    setNote(item.note || '');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanDate = normalizeIsoDateOnly(expenseDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      notify.warn('Tanggal pembelian wajib diisi dengan format yang valid.');
      return;
    }
    if (cleanDate > getTodayIsoDate()) {
      notify.warn('Tanggal pembelian tidak boleh melebihi hari ini.');
      return;
    }
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) {
      notify.warn('Uraian barang / keperluan sekolah wajib diisi.');
      return;
    }
    const cleanAmount = Math.round(Number(amount || 0));
    if (!cleanAmount || cleanAmount <= 0) {
      notify.warn('Nominal pengeluaran harus lebih dari Rp 0.');
      return;
    }
    const cleanUrl = String(receiptUrl || '').trim();
    if (cleanUrl && !isSafeReceiptUrl(cleanUrl)) {
      notify.warn('Tautan bukti nota harus diawali http:// atau https://');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        expense_date: cleanDate,
        month: Number(targetMonth),
        year: Number(targetYear),
        category,
        title: cleanTitle,
        amount: cleanAmount,
        receipt_number: String(receiptNumber || '').trim(),
        receipt_url: cleanUrl,
        note: String(note || '').trim(),
        ...(targetTeacherId ? { target_teacher_id: targetTeacherId } : {}),
      };

      if (editingId) {
        await api.put('reimbursements.update', { id: editingId, ...payload });
        notify.success('Catatan belanja sekolah berhasil diperbarui.');
      } else {
        const res = await api.post('reimbursements.create', payload);
        const emails = res?.notified_admin_emails || [];
        const notice =
          emails.length > 0
            ? ` Notifikasi terkirim ke Admin/Bendahara (${emails.join(', ')}).`
            : ' Notifikasi terkirim ke Admin/Bendahara.';
        notify.success(
          `Catatan belanja ${formatRupiah(cleanAmount)} berhasil dikirim!${notice}`
        );
      }

      resetForm();
      const updated = await loadData({ silent: true });
      emitDataChange(['reimbursements', 'notifications'], { source: 'guru_reimb_local' });
      onReimbursementsChange?.(updated);
    } catch (err) {
      notify.error(err.message || 'Gagal menyimpan catatan belanja sekolah.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await api.delete('reimbursements.delete', {
        id: target.id,
        ...(targetTeacherId ? { target_teacher_id: targetTeacherId } : {}),
      });
      if (editingId === target.id) resetForm();
      notify.success('Catatan belanja berhasil dihapus.');
      const updated = await loadData({ silent: true });
      emitDataChange(['reimbursements', 'notifications'], { source: 'guru_reimb_local' });
      onReimbursementsChange?.(updated);
    } catch (err) {
      notify.error(err.message || 'Gagal menghapus catatan belanja.');
    }
  };

  const kpiStats = useMemo(() => {
    let pendingSum = 0;
    let pendingCount = 0;
    let approvedSum = 0;
    let approvedCount = 0;
    let rejectedCount = 0;

    items.forEach((it) => {
      if (it.status === 'approved') {
        approvedSum += Number(it.approved_amount ?? it.amount ?? 0);
        approvedCount += 1;
      } else if (it.status === 'rejected') {
        rejectedCount += 1;
      } else {
        pendingSum += Number(
          it.status === 'approved_treasurer'
            ? it.approved_amount ?? it.amount ?? 0
            : it.amount ?? 0
        );
        pendingCount += 1;
      }
    });

    return {
      pendingSum,
      pendingCount,
      approvedSum,
      approvedCount,
      rejectedCount,
      totalCount: items.length,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((it) => {
      if (statusFilter !== 'all' && it.status !== statusFilter) return false;
      if (!q) return true;
      const catLabel = getReimbursementCategoryMeta(it.category).label;
      const hay = `${it.title || ''} ${it.receipt_number || ''} ${it.note || ''} ${catLabel} ${getMonthName(
        it.month
      )} ${it.year}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, statusFilter, searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, searchQuery, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, safePage, pageSize]);

  return (
    <div className="space-y-4">
      {/* Top KPI Summary Cards */}
      <section className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
        <div className="nim-glass nim-kpi">
          <div className="flex items-start justify-between gap-1.5 sm:gap-2">
            <span className="nim-kpi__label">Menunggu Verifikasi</span>
            <span
              className="nim-kpi__ico !w-7 !h-7 sm:!w-8 sm:!h-8"
              style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)' }}
            >
              <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </div>
          <p className="nim-kpi__value mt-1.5 sm:mt-2 text-[var(--warn-text)] tabular-nums truncate">
            {formatRupiah(kpiStats.pendingSum)}
          </p>
          <p className="nim-kpi__sub mt-0.5 sm:mt-1 leading-snug">
            {formatRibuan(kpiStats.pendingCount)} catatan sedang diproses
          </p>
        </div>

        <div className="nim-glass nim-kpi">
          <div className="flex items-start justify-between gap-1.5 sm:gap-2">
            <span className="nim-kpi__label">Piutang Disetujui (Masuk Slip)</span>
            <span
              className="nim-kpi__ico !w-7 !h-7 sm:!w-8 sm:!h-8"
              style={{ background: 'var(--good-soft)', color: 'var(--good-text)' }}
            >
              <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </div>
          <p className="nim-kpi__value mt-1.5 sm:mt-2 text-[var(--good-text)] tabular-nums truncate">
            {formatRupiah(kpiStats.approvedSum)}
          </p>
          <p className="nim-kpi__sub mt-0.5 sm:mt-1 leading-snug">
            {formatRibuan(kpiStats.approvedCount)} nota diganti utuh (Bebas Infaq 2,5%)
          </p>
        </div>

        <div className="nim-glass nim-kpi col-span-2 sm:col-span-1">
          <div className="flex items-start justify-between gap-1.5 sm:gap-2">
            <span className="nim-kpi__label">Total Catatan Tercatat</span>
            <span className="nim-kpi__ico !w-7 !h-7 sm:!w-8 sm:!h-8">
              <Receipt className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </div>
          <p className="nim-kpi__value mt-1.5 sm:mt-2 tabular-nums truncate">
            {formatRibuan(kpiStats.totalCount)} Nota
          </p>
          <p className="nim-kpi__sub mt-0.5 sm:mt-1 leading-snug truncate">
            {teacherProfile?.name ? `${teacherProfile.name} • ` : ''}
            {kpiStats.rejectedCount > 0 ? `${kpiStats.rejectedCount} ditolak` : 'Aktif'}
          </p>
        </div>
      </section>

      <div className="fluid-container items-start">
        {/* Left Card: Expense Input Form */}
        <div className="fluid-item nim-glass nim-card space-y-4">
          <div
            className="flex flex-wrap items-center justify-between gap-2 pb-3"
            style={{ borderBottom: '1px solid var(--line)' }}
          >
            <div className="flex items-center gap-2.5">
              <span className="nim-kpi__ico">
                <Receipt className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-bold text-[var(--ink)]">
                  {editingId ? 'Ubah Catatan Belanja Sekolah' : 'Catat Belanja Sekolah'}
                </h2>
                {assistingMeta?.isAssistingOther && (
                  <span className="nim-badge nim-badge--warn mt-1">
                    Mencatat atas nama: {assistingMeta.targetTeacherName}
                  </span>
                )}
                <p className="text-xs text-[var(--muted)]">
                  Pengeluaran keperluan sekolah yang Anda talangi akan menjadi piutang sekolah di
                  slip gaji tanpa potongan Infaq 2,5%.
                </p>
              </div>
            </div>
            {editingId && (
              <button type="button" onClick={resetForm} className="nim-btn nim-btn--sm">
                <X className="h-3.5 w-3.5" />
                <span>Batal Ubah</span>
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="grid grid-cols-12 gap-2.5">
              <div className="col-span-12 sm:col-span-5">
                <label
                  htmlFor="guru-reimb-date"
                  className="block text-xs font-semibold text-[var(--ink-2)] mb-1"
                >
                  Tanggal Pembelian
                </label>
                <DatePicker
                  id="guru-reimb-date"
                  value={expenseDate}
                  onChange={handleExpenseDateChange}
                  maxDate={getTodayIsoDate()}
                  className="text-xs font-semibold"
                />
              </div>

              <div className="col-span-7 sm:col-span-4">
                <label className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                  Masuk Slip Bulan
                </label>
                <select
                  value={targetMonth}
                  onChange={(e) => {
                    setTargetMonth(Number(e.target.value));
                    setPeriodManuallyPicked(true);
                  }}
                  className="nim-select text-xs font-semibold"
                >
                  {MONTHS_ID.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-5 sm:col-span-3">
                <label className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                  Tahun
                </label>
                <select
                  value={targetYear}
                  onChange={(e) => {
                    setTargetYear(Number(e.target.value));
                    setPeriodManuallyPicked(true);
                  }}
                  className="nim-select text-xs font-semibold"
                >
                  {[2025, 2026, 2027, 2028].map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                  Kategori Pengeluaran
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="nim-select text-xs font-semibold"
                >
                  {REIMBURSEMENT_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                  Nominal Pengeluaran (Rp)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={formatRibuan(amount)}
                  onChange={(e) => setAmount(parseRibuan(e.target.value))}
                  placeholder="Contoh: 125.000"
                  className="nim-input font-bold tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                Uraian Barang / Keperluan Sekolah
              </label>
              <input
                type="text"
                required
                maxLength={140}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Misal: Kertas HVS A4 2 rim & Spidol papan tulis..."
                className="nim-input text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                  Nomor Nota / Kwitansi (Opsional)
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  placeholder="Misal: INV-2026-114"
                  className="nim-input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                  Tautan Foto / Drive Bukti Nota (Opsional)
                </label>
                <input
                  type="url"
                  maxLength={400}
                  value={receiptUrl}
                  onChange={(e) => setReceiptUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="nim-input text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--ink-2)] mb-1">
                Keterangan Tambahan (Opsional)
              </label>
              <textarea
                rows={2}
                maxLength={250}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Toko pembelian, keperluan kelas/kegiatan, atau catatan untuk Bendahara..."
                className="nim-input !min-h-[60px] text-xs"
              />
            </div>

            <div
              className="flex items-start gap-2 rounded-xl p-2.5 text-[11px] text-[var(--ink-2)]"
              style={{ background: 'var(--card-2)', borderLeft: '3px solid var(--good-text)' }}
            >
              <Info className="h-3.5 w-3.5 mt-0.5 text-[var(--good-text)] shrink-0" />
              <span>
                Catatan diverifikasi <strong>Bendahara</strong> lalu diotorisasi{' '}
                <strong>Kepala Sekolah</strong>. Setelah disetujui, penggantian masuk ke{' '}
                <strong>Slip Gaji ({getMonthName(targetMonth)} {targetYear})</strong> utuh tanpa
                potongan Infaq 2,5% dan ikut menambah saldo yang dapat diajukan pencairan lebih awal.
              </span>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="nim-btn nim-btn--primary w-full"
            >
              {submitting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Menyimpan Catatan...</span>
                </>
              ) : editingId ? (
                <>
                  <Save className="h-3.5 w-3.5" />
                  <span>Simpan Perubahan ({formatRupiah(amount)})</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>Ajukan Penggantian ({formatRupiah(amount)})</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Card: History */}
        <div className="fluid-item nim-glass nim-card space-y-4">
          <div
            className="flex flex-wrap items-center justify-between gap-2 pb-3"
            style={{ borderBottom: '1px solid var(--line)' }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="nim-kpi__ico"
                style={{ background: 'var(--good-soft)', color: 'var(--good-text)' }}
              >
                <Clock className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-bold text-[var(--ink)]">
                  Riwayat Belanja Sekolah
                </h2>
                <p className="text-xs text-[var(--muted)]">
                  Pantau verifikasi Bendahara &amp; Kepala Sekolah untuk penggantian ke slip gaji.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => loadData()}
              disabled={loading}
              className="nim-btn nim-btn--sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Segarkan</span>
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: `Semua (${items.length})` },
                { id: 'pending_treasurer', label: 'Menunggu' },
                { id: 'approved_treasurer', label: 'Di Kepsek' },
                { id: 'approved', label: 'Masuk Slip' },
                { id: 'rejected', label: 'Ditolak' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`nim-btn nim-btn--sm ${
                    statusFilter === tab.id ? 'nim-btn--primary' : ''
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative flex-1 min-w-[170px] sm:max-w-[220px]">
              <Search className="h-3.5 w-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari barang / no. nota..."
                className="nim-input !min-h-[32px] !py-1 !pl-8 text-xs"
              />
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="nim-card-well p-6 text-center text-xs text-[var(--muted)]">
              {items.length === 0
                ? 'Belum ada catatan pengeluaran keperluan sekolah yang dikirim.'
                : 'Tidak ada catatan belanja yang cocok dengan filter.'}
            </div>
          ) : (
            <div className="space-y-3">
              {pagedItems.map((item) => {
                const stMeta = getReimbursementStatusMeta(item.status);
                const catMeta = getReimbursementCategoryMeta(item.category);
                const canEdit = item.status === 'pending_treasurer';
                const hasLink = isSafeReceiptUrl(item.receipt_url);

                return (
                  <div key={item.id} className="nim-card-well p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs sm:text-sm font-bold text-[var(--ink)]">
                          {item.title}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="nim-badge !text-[10px]">
                            <Calendar className="h-3 w-3" />
                            Belanja {formatExpenseDateIndo(item.expense_date)}
                          </span>
                          <span className="nim-badge nim-badge--accent !text-[10px]">
                            Slip: {getMonthName(item.month)} {item.year}
                          </span>
                          <span className="nim-badge !text-[10px]">{catMeta.label}</span>
                          {item.assisted_by_name && (
                            <span className="nim-badge nim-badge--accent !text-[10px]">
                              Diinput oleh TU: {item.assisted_by_name}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={stMeta.cls}>{stMeta.shortLabel}</span>
                    </div>

                    <div
                      className="grid grid-cols-2 gap-1.5 pt-2 text-xs"
                      style={{ borderTop: '1px solid var(--line)' }}
                    >
                      <div>
                        <span className="text-[11px] text-[var(--muted)] block">
                          Nominal Dicatat
                        </span>
                        <span className="font-bold text-[var(--ink)] tabular-nums">
                          {formatRupiah(item.amount)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] text-[var(--muted)] block">
                          {item.status === 'approved'
                            ? 'Masuk Slip (Non-Infaq)'
                            : item.status === 'approved_treasurer'
                            ? 'Verifikasi Bendahara'
                            : 'Nomor Nota'}
                        </span>
                        <span
                          className="font-bold tabular-nums"
                          style={{
                            color:
                              item.status === 'approved'
                                ? 'var(--good-text)'
                                : item.status === 'approved_treasurer'
                                ? 'var(--accent-text)'
                                : 'var(--ink-2)',
                          }}
                        >
                          {item.status === 'approved' || item.status === 'approved_treasurer'
                            ? formatRupiah(item.approved_amount)
                            : item.receipt_number || '-'}
                        </span>
                      </div>
                    </div>

                    {(item.receipt_number || hasLink || item.note) && (
                      <div className="text-[11px] text-[var(--ink-2)] space-y-1">
                        {item.receipt_number && (
                          <p>
                            <strong>No. Nota:</strong> {item.receipt_number}
                          </p>
                        )}
                        {item.note && (
                          <p>
                            <strong>Keterangan:</strong> {item.note}
                          </p>
                        )}
                        {hasLink && (
                          <p>
                            <button
                              type="button"
                              onClick={() => setPreviewReceipt(item)}
                              className="inline-flex items-center gap-1 font-semibold text-[var(--accent-text)] hover:underline"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>Lihat Bukti Nota</span>
                            </button>
                          </p>
                        )}
                      </div>
                    )}

                    {item.treasurer_note && (
                      <p className="text-[11px] text-[var(--ink-2)]">
                        <strong>Catatan Bendahara:</strong> {item.treasurer_note}
                      </p>
                    )}
                    {item.kepsek_note && (
                      <p className="text-[11px] text-[var(--ink-2)]">
                        <strong>Catatan Kepsek:</strong> {item.kepsek_note}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
                        <span className="text-[var(--muted)]">
                          {formatIsoDateTimeIndo(item.created_at)}
                        </span>
                        {item.status === 'approved_treasurer' && (
                          <span className="text-[var(--accent-text)] font-semibold">
                            • Bendahara OK
                          </span>
                        )}
                        {item.status === 'approved' && (
                          <span className="inline-flex items-center gap-1 text-[var(--good-text)] font-semibold">
                            <CheckCircle2 className="h-3 w-3" /> Bendahara &amp; Kepsek OK
                          </span>
                        )}
                        {item.status === 'rejected' && (
                          <span className="inline-flex items-center gap-1 text-[var(--bad-text)] font-semibold">
                            <XCircle className="h-3 w-3" /> Ditolak
                          </span>
                        )}
                      </div>

                      {canEdit && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(item)}
                            className="nim-btn nim-btn--sm"
                          >
                            <Pencil className="h-3 w-3" />
                            <span>Ubah</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            className="nim-btn nim-btn--danger nim-btn--sm"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Hapus</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              <PaginationBar
                page={safePage}
                pageSize={pageSize}
                totalItems={filteredItems.length}
                onPageChange={setPage}
                onPageSizeChange={(sz) => {
                  setPageSize(sz);
                  setPage(1);
                }}
                itemLabel="catatan"
                pageSizeOptions={[8, 16, 32]}
              />
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Hapus Catatan Belanja"
        message={
          deleteTarget
            ? `Hapus catatan "${deleteTarget.title}" sebesar ${formatRupiah(
                deleteTarget.amount
              )}?`
            : ''
        }
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ReceiptLightboxModal
        isOpen={Boolean(previewReceipt)}
        url={previewReceipt?.receipt_url || ''}
        title={previewReceipt?.title || 'Bukti Nota Belanja'}
        subtitle={
          previewReceipt
            ? `${formatExpenseDateIndo(previewReceipt.expense_date)} • ${formatRupiah(
                previewReceipt.approved_amount ?? previewReceipt.amount
              )}`
            : ''
        }
        receiptNumber={previewReceipt?.receipt_number || ''}
        onClose={() => setPreviewReceipt(null)}
      />
    </div>
  );
}

export default GuruReimbursementSection;
