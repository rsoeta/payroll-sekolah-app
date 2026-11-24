import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  RotateCcw,
  Search,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { getStaffCategoryLabel } from '../utils/formatters';

export function TuTeacherSwitcherBar({
  ownTeacherId = '',
  ownTeacherName = '',
  activeTeacherId = '',
  activeTeacherProfile = null,
  teachers = [],
  loading = false,
  onSelectTeacher,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  const isAssistingOther = Boolean(
    activeTeacherId && ownTeacherId && String(activeTeacherId) !== String(ownTeacherId)
  );

  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 30);

    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const sortedOtherTeachers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...(teachers || [])]
      .filter((t) => String(t.id) !== String(ownTeacherId))
      .filter((t) => {
        if (!q) return true;
        const catLabel = getStaffCategoryLabel(t);
        const hay = `${t.name || ''} ${t.nip || ''} ${t.status || ''} ${catLabel}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'));
  }, [teachers, ownTeacherId, query]);

  const ownDisplayName = ownTeacherName || 'Akun Saya';
  const currentTargetName = activeTeacherProfile?.name || 'Memuat data PTK...';

  const handlePick = (teacherId) => {
    setOpen(false);
    setQuery('');
    const nextId = String(teacherId || '') === String(ownTeacherId) ? '' : String(teacherId || '');
    onSelectTeacher?.(nextId);
  };

  return (
    <div ref={containerRef} className="relative z-30">
      <div
        className="nim-glass rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
        style={
          isAssistingOther
            ? {
                background: 'var(--warn-soft)',
                boxShadow: 'inset 0 0 0 1.5px var(--warn-line)',
              }
            : {
                background: 'var(--accent-soft)',
                boxShadow: 'inset 0 0 0 1px var(--accent-glow)',
              }
        }
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <span
            className="nim-kpi__ico !w-9 !h-9 shrink-0 mt-0.5"
            style={
              isAssistingOther
                ? { background: 'rgba(245, 158, 11, 0.22)', color: 'var(--warn-text)' }
                : undefined
            }
          >
            {isAssistingOther ? (
              <ArrowLeftRight className="h-4 w-4" />
            ) : (
              <UserCog className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`nim-badge !text-[10px] ${
                  isAssistingOther ? 'nim-badge--warn' : 'nim-badge--accent'
                }`}
              >
                {isAssistingOther ? 'MODE PENDAMPING TU AKTIF' : 'TU PENDAMPING PTK'}
              </span>
              {loading && (
                <span className="text-[11px] font-semibold text-[var(--muted)]">
                  Memuat data PTK...
                </span>
              )}
            </div>

            {isAssistingOther ? (
              <>
                <p className="text-xs sm:text-sm font-bold text-[var(--ink)] truncate">
                  Sedang Membantu: {currentTargetName}
                  {activeTeacherProfile?.nip ? ` (NIP: ${activeTeacherProfile.nip})` : ''}
                </p>
                <p className="text-[11px] text-[var(--ink-2)] leading-snug">
                  Seluruh menu (Kehadiran, Pencairan, Belanja Sekolah &amp; Slip Gaji) sedang
                  menampilkan data <strong>{currentTargetName}</strong>. Inputan baru akan ditandai{' '}
                  <strong>Diinput oleh TU: {ownDisplayName}</strong>.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs sm:text-sm font-bold text-[var(--ink)] truncate">
                  Akun Pribadi Anda ({ownDisplayName})
                </p>
                <p className="text-[11px] text-[var(--ink-2)] leading-snug">
                  Pilih nama guru/PTK di sebelah kanan untuk membantu pengisian Kehadiran,
                  Pengajuan Pencairan, Belanja Sekolah, atau cetak Slip Gaji.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isAssistingOther && (
            <button
              type="button"
              onClick={() => handlePick('')}
              className="nim-btn nim-btn--sm"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Kembali ke Akun Saya</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            className={`nim-btn nim-btn--sm ${
              isAssistingOther ? 'nim-btn--warn' : 'nim-btn--primary'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>{isAssistingOther ? 'Ganti PTK' : 'Pilih PTK yang Dibantu'}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="Pilih PTK yang Dibantu"
          className="nim-panel absolute right-0 left-0 sm:left-auto sm:w-[390px] mt-2 rounded-2xl p-3 shadow-2xl space-y-2.5 z-40"
          style={{
            boxShadow:
              '0 18px 40px -12px rgba(0, 0, 0, 0.38), inset 0 0 0 1px var(--line-2)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[var(--ink)]">
              Pilih PTK ({teachers.length} Terdaftar)
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Tutup pemilih PTK"
              className="nim-ibtn !w-7 !h-7"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="relative">
            <Search className="h-3.5 w-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama guru, NIP, atau jabatan..."
              className="nim-input !min-h-[34px] !py-1 !pl-8 text-xs"
            />
          </div>

          <div className="max-h-72 overflow-y-auto space-y-1 pr-0.5">
            {/* Always pin own account at top */}
            <button
              type="button"
              onClick={() => handlePick('')}
              className="w-full text-left rounded-xl px-3 py-2 flex items-center justify-between gap-2 transition-colors"
              style={{
                background: !isAssistingOther ? 'var(--accent-soft)' : 'var(--card-2)',
                boxShadow: !isAssistingOther
                  ? 'inset 0 0 0 1px var(--accent-glow)'
                  : 'inset 0 0 0 1px var(--line)',
              }}
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--ink)] truncate">
                  Akun Saya — {ownDisplayName}
                </p>
                <p className="text-[10.5px] text-[var(--muted)]">
                  Kembali ke data pribadi TU sendiri
                </p>
              </div>
              {!isAssistingOther && (
                <Check className="h-4 w-4 text-[var(--accent-text)] shrink-0" />
              )}
            </button>

            {sortedOtherTeachers.length === 0 ? (
              <p className="py-5 text-center text-xs text-[var(--muted)]">
                {teachers.length <= 1
                  ? 'Belum ada data PTK lain yang terdaftar.'
                  : 'Tidak ada nama/NIP PTK yang cocok dengan pencarian.'}
              </p>
            ) : (
              sortedOtherTeachers.map((t) => {
                const isSelected = String(activeTeacherId) === String(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handlePick(t.id)}
                    className="w-full text-left rounded-xl px-3 py-2 flex items-center justify-between gap-2 transition-colors hover:bg-[var(--card-2)]"
                    style={{
                      background: isSelected ? 'var(--warn-soft)' : 'transparent',
                      boxShadow: isSelected
                        ? 'inset 0 0 0 1px var(--warn-line)'
                        : 'inset 0 0 0 1px var(--line)',
                    }}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--ink)] truncate">{t.name}</p>
                      <p className="text-[10.5px] text-[var(--muted)] truncate">
                        NIP: {t.nip || '-'} • {t.status || getStaffCategoryLabel(t)}
                      </p>
                    </div>
                    {isSelected && (
                      <Check className="h-4 w-4 text-[var(--warn-text)] shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TuTeacherSwitcherBar;
