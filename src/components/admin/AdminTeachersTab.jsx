import React, { useState, useMemo, useEffect } from 'react';
import { Edit3, FileDown, Mail, Plus, Search, Trash2, Upload, UserCog } from 'lucide-react';
import {
  formatRupiah,
  getStaffCategoryLabel,
  isInfaqZakatEnabled,
  parseCustomComponents,
  resolveStaffCategory,
} from '../../utils/formatters';
import notify from '../../utils/notify';
import PaginationBar from './PaginationBar';

const TeacherMasterCard = React.memo(function TeacherMasterCard({
  teacher,
  onEdit,
  onDelete,
  onToggleTuOperator,
}) {
  const comp = teacher.salary_component || {};
  const catId = resolveStaffCategory(teacher);
  const catLabel = getStaffCategoryLabel(catId);
  const infaqEnabled = isInfaqZakatEnabled(comp);
  const isTuOperator = Boolean(teacher.is_tu_operator);
  const customComponents = useMemo(
    () => parseCustomComponents(comp.custom_components_json),
    [comp.custom_components_json]
  );

  return (
    <div className="fluid-item nim-glass nim-card flex flex-col justify-between gap-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <span
                className={`nim-badge !text-[10.5px] ${
                  catId === 'kependidikan' ? 'nim-badge--warn' : 'nim-badge--good'
                }`}
              >
                {catLabel}
              </span>
              {isTuOperator && (
                <span className="nim-badge nim-badge--accent !text-[10.5px]">
                  <UserCog className="h-3 w-3" />
                  <span>TU Pendamping PTK</span>
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-[var(--ink)]">{teacher.name}</h3>
            <p className="text-xs text-[var(--muted)]">
              NIP: {teacher.nip} • {teacher.status}
            </p>
            {teacher.email && (
              <p className="nim-badge nim-badge--accent mt-1.5">
                <Mail className="h-3 w-3" />
                <span>{teacher.email}</span>
              </p>
            )}
          </div>
          <span className="nim-badge shrink-0">{teacher.bank_account}</span>
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
            <span className="text-[var(--muted)] block">Infaq / Zakat Profesi (2,5%)</span>
            <span
              className="font-bold"
              style={{
                color: infaqEnabled ? 'var(--good-text)' : 'var(--muted)',
              }}
            >
              {infaqEnabled ? 'Aktif (2,5% di Payroll)' : 'Tidak Aktif (Rp 0)'}
            </span>
          </div>
        </div>

        {customComponents.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {customComponents.map((cust) => (
              <span
                key={cust.id}
                className={`nim-badge ${
                  cust.type === 'allowance' ? 'nim-badge--good' : 'nim-badge--bad'
                }`}
              >
                <span>{cust.label}:</span>
                <span className="tabular-nums">
                  {cust.type === 'allowance' ? '+' : '-'} {formatRupiah(cust.amount)}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div
        className="flex flex-wrap items-center justify-end gap-2 pt-3"
        style={{ borderTop: '1px solid var(--line)' }}
      >
        {onToggleTuOperator && (
          <button
            type="button"
            onClick={() => onToggleTuOperator(teacher)}
            title={
              isTuOperator
                ? 'Cabut mandat TU Pendamping PTK'
                : 'Tunjuk sebagai TU Pendamping PTK (akses bantu seluruh guru)'
            }
            className="nim-btn nim-btn--sm"
            style={
              isTuOperator
                ? {
                    background: 'var(--warn-soft)',
                    color: 'var(--warn-text)',
                    boxShadow: 'inset 0 0 0 1px var(--warn-line)',
                  }
                : undefined
            }
          >
            <UserCog className="h-3.5 w-3.5" />
            <span>{isTuOperator ? 'Cabut TU' : 'Tunjuk TU'}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onEdit(teacher)}
          className="nim-btn nim-btn--sm"
        >
          <Edit3 className="h-3.5 w-3.5 text-[var(--accent-text)]" />
          <span>Edit Data &amp; Gaji</span>
        </button>
        <button
          type="button"
          onClick={() => onDelete(teacher)}
          className="nim-btn nim-btn--danger nim-btn--sm"
          aria-label={`Hapus ${teacher.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
});

export const AdminTeachersTab = React.memo(function AdminTeachersTab({
  teachers,
  onOpenImportModal,
  onOpenAddModal,
  onOpenEditModal,
  onRequestDelete,
  onToggleTuOperator,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [portalFilter, setPortalFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [downloadingTpl, setDownloadingTpl] = useState(false);

  const tuOperatorCount = useMemo(
    () => teachers.filter((t) => Boolean(t.is_tu_operator)).length,
    [teachers]
  );

  useEffect(() => {
    setPage(1);
  }, [searchQuery, categoryFilter, portalFilter]);

  const filteredTeachers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return teachers.filter((t) => {
      if (categoryFilter !== 'all' && resolveStaffCategory(t) !== categoryFilter) {
        return false;
      }
      if (portalFilter === 'has_email' && !t.email) return false;
      if (portalFilter === 'no_email' && Boolean(t.email)) return false;
      if (portalFilter === 'tu_operator' && !t.is_tu_operator) return false;
      if (!q) return true;
      const hay = `${t.name || ''} ${t.nip || ''} ${t.status || ''} ${t.bank_account || ''} ${
        t.email || ''
      }`.toLowerCase();
      return hay.includes(q);
    });
  }, [teachers, searchQuery, categoryFilter, portalFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTeachers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedTeachers = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredTeachers.slice(start, start + pageSize);
  }, [filteredTeachers, safePage, pageSize]);

  const handleDownloadTemplate = async () => {
    setDownloadingTpl(true);
    try {
      const { downloadTeacherImportTemplate } = await import('../TeacherImportModal');
      downloadTeacherImportTemplate();
      notify.info('Format Template Import Excel (.xlsx) berhasil diunduh.');
    } catch (err) {
      notify.error(err?.message || 'Gagal menyiapkan template Excel (.xlsx).');
    } finally {
      setDownloadingTpl(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="nim-glass nim-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--ink)]">
              Master Data PTK &amp; Komponen Gaji
            </h2>
            <p className="text-xs text-[var(--muted)]">
              Kelola profil Tenaga Pendidik (Guru) &amp; Tenaga Kependidikan, rekening bank, rincian
              gaji, serta akun Gmail portal.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={downloadingTpl}
              onClick={handleDownloadTemplate}
              className="nim-btn"
            >
              <FileDown className="h-3.5 w-3.5 text-[var(--accent-text)]" />
              <span>
                {downloadingTpl ? 'Menyiapkan .XLSX...' : 'Unduh Format Import (.XLSX)'}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenImportModal}
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
              onClick={onOpenAddModal}
              className="nim-btn nim-btn--primary"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tambah Data PTK Baru</span>
            </button>
          </div>
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
              placeholder="Cari nama, NIP, jabatan, rekening, atau Gmail..."
              className="nim-input !min-h-[34px] !py-1 !pl-8 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: `Semua (${teachers.length})` },
              { id: 'pendidik', label: 'Tenaga Pendidik' },
              { id: 'kependidikan', label: 'Tenaga Kependidikan' },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setCategoryFilter(chip.id)}
                className={`nim-btn nim-btn--sm ${
                  categoryFilter === chip.id ? 'nim-btn--primary' : ''
                }`}
              >
                {chip.label}
              </button>
            ))}

            <select
              aria-label="Filter Akun Portal Gmail"
              value={portalFilter}
              onChange={(e) => setPortalFilter(e.target.value)}
              className="nim-select !w-auto !min-h-[30px] !py-0.5 text-xs font-semibold"
            >
              <option value="all">Semua Akses Portal</option>
              <option value="has_email">Punya Gmail Portal</option>
              <option value="no_email">Belum Ada Gmail</option>
              <option value="tu_operator">
                TU Pendamping PTK ({tuOperatorCount})
              </option>
            </select>
          </div>
        </div>
      </div>

      {filteredTeachers.length === 0 ? (
        <div className="nim-glass nim-card p-8 text-center text-xs text-[var(--muted)]">
          {teachers.length === 0
            ? 'Belum ada data PTK terdaftar. Tambahkan manual atau import dari .XLSX.'
            : 'Tidak ada data PTK yang cocok dengan filter atau kata kunci pencarian.'}
        </div>
      ) : (
        <>
          <div className="fluid-container">
            {pagedTeachers.map((t) => (
              <TeacherMasterCard
                key={t.id}
                teacher={t}
                onEdit={onOpenEditModal}
                onDelete={onRequestDelete}
                onToggleTuOperator={onToggleTuOperator}
              />
            ))}
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

export default AdminTeachersTab;
