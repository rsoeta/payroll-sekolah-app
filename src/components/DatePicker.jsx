import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTHS_ID } from '../utils/formatters';
import { getTodayIsoDate, normalizeIsoDateOnly } from '../utils/attendanceHelpers';

const WEEKDAYS_ID_SHORT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

function parseIsoParts(iso) {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const probe = new Date(year, month - 1, day);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function toIsoDate(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatTriggerLabels(iso) {
  const parts = parseIsoParts(iso);
  if (!parts) return { shortText: '', fullText: '' };
  const dateObj = new Date(parts.year, parts.month - 1, parts.day);
  return {
    shortText: dateObj.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    fullText: dateObj.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  };
}

function buildCalendarCells(viewYear, viewMonth) {
  const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay();
  const mondayOffset = (firstDayOfWeek + 6) % 7;
  const gridStart = new Date(viewYear, viewMonth - 1, 1 - mondayOffset);
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + i
    );
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    cells.push({
      iso: toIsoDate(year, month, day),
      year,
      month,
      day,
      isOutsideMonth: year !== viewYear || month !== viewMonth,
    });
  }
  return cells;
}

export function DatePicker({
  id,
  value,
  onChange,
  maxDate,
  minDate = '2020-01-01',
  allowFuture = false,
  disabled = false,
  placeholder = 'Pilih tanggal',
  className = '',
  ariaLabel,
}) {
  // Compute today live (never memoize with []) so an open tab stays accurate across midnight
  const todayIso = getTodayIsoDate();

  const normalizedValue = useMemo(() => {
    const clean = normalizeIsoDateOnly(value);
    return parseIsoParts(clean) ? clean : '';
  }, [value]);

  const effectiveMax = useMemo(() => {
    const candidate = normalizeIsoDateOnly(maxDate);
    if (parseIsoParts(candidate)) return candidate;
    return allowFuture ? '' : todayIso;
  }, [maxDate, allowFuture, todayIso]);

  const boundedMin = useMemo(() => {
    const candidate = normalizeIsoDateOnly(minDate);
    const minValid = parseIsoParts(candidate) ? candidate : '2020-01-01';
    if (effectiveMax && minValid > effectiveMax) return effectiveMax;
    return minValid;
  }, [minDate, effectiveMax]);

  const maxParts = useMemo(() => parseIsoParts(effectiveMax), [effectiveMax]);
  const minParts = useMemo(() => parseIsoParts(boundedMin), [boundedMin]);

  const clampMonthYear = useCallback(
    (year, month) => {
      let nextY = year;
      let nextM = month;
      if (minParts) {
        if (nextY < minParts.year || (nextY === minParts.year && nextM < minParts.month)) {
          nextY = minParts.year;
          nextM = minParts.month;
        }
      }
      if (maxParts) {
        if (nextY > maxParts.year || (nextY === maxParts.year && nextM > maxParts.month)) {
          nextY = maxParts.year;
          nextM = maxParts.month;
        }
      }
      return { year: nextY, month: nextM };
    },
    [minParts, maxParts]
  );

  const initialParts = useMemo(() => {
    const base =
      parseIsoParts(normalizedValue) ||
      parseIsoParts(effectiveMax) ||
      parseIsoParts(todayIso) || { year: new Date().getFullYear(), month: new Date().getMonth() + 1, day: 1 };
    return clampMonthYear(base.year, base.month);
  }, [normalizedValue, effectiveMax, todayIso, clampMonthYear]);

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(initialParts.year);
  const [viewMonth, setViewMonth] = useState(initialParts.month);
  const [popoverCoords, setPopoverCoords] = useState({ top: 0, left: 0, width: 308 });

  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const updatePopoverPosition = useCallback(() => {
    const triggerEl = triggerRef.current;
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const width = Math.min(308, Math.max(240, window.innerWidth - 16));
    const popoverHeight = popoverRef.current?.offsetHeight || 356;

    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top;
    if (spaceBelow >= popoverHeight + 8 || spaceBelow >= spaceAbove) {
      top = Math.min(rect.bottom + 6, Math.max(8, window.innerHeight - popoverHeight - 8));
    } else {
      top = Math.max(8, rect.top - popoverHeight - 6);
    }

    setPopoverCoords({ top, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePopoverPosition();
    const handleRelocate = () => updatePopoverPosition();
    window.addEventListener('resize', handleRelocate);
    window.addEventListener('scroll', handleRelocate, true);
    return () => {
      window.removeEventListener('resize', handleRelocate);
      window.removeEventListener('scroll', handleRelocate, true);
    };
  }, [open, updatePopoverPosition, viewYear, viewMonth]);

  useEffect(() => {
    if (!open) return undefined;
    const handleOutside = (event) => {
      const target = event.target;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handleOutside);
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleOutside);
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // Keep open view clamped if effectiveMax or minDate changes dynamically
  useEffect(() => {
    if (!open) return;
    const clamped = clampMonthYear(viewYear, viewMonth);
    if (clamped.year !== viewYear) setViewYear(clamped.year);
    if (clamped.month !== viewMonth) setViewMonth(clamped.month);
  }, [open, viewYear, viewMonth, clampMonthYear]);

  const handleToggleOpen = () => {
    if (disabled) return;
    if (!open) {
      const target =
        parseIsoParts(normalizedValue) ||
        parseIsoParts(effectiveMax) ||
        parseIsoParts(todayIso);
      if (target) {
        const clamped = clampMonthYear(target.year, target.month);
        setViewYear(clamped.year);
        setViewMonth(clamped.month);
      }
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const canGoPrevMonth = useMemo(() => {
    if (!minParts) return true;
    return viewYear > minParts.year || (viewYear === minParts.year && viewMonth > minParts.month);
  }, [minParts, viewYear, viewMonth]);

  const canGoNextMonth = useMemo(() => {
    if (!maxParts) return true;
    return viewYear < maxParts.year || (viewYear === maxParts.year && viewMonth < maxParts.month);
  }, [maxParts, viewYear, viewMonth]);

  const handleStepMonth = (delta) => {
    if (delta < 0 && !canGoPrevMonth) return;
    if (delta > 0 && !canGoNextMonth) return;
    let nextMonth = viewMonth + delta;
    let nextYear = viewYear;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    const clamped = clampMonthYear(nextYear, nextMonth);
    setViewYear(clamped.year);
    setViewMonth(clamped.month);
  };

  const handleSelectMonth = (e) => {
    const clamped = clampMonthYear(viewYear, Number(e.target.value));
    setViewYear(clamped.year);
    setViewMonth(clamped.month);
  };

  const handleSelectYear = (e) => {
    const clamped = clampMonthYear(Number(e.target.value), viewMonth);
    setViewYear(clamped.year);
    setViewMonth(clamped.month);
  };

  const availableMonths = useMemo(() => {
    return MONTHS_ID.filter((m) => {
      if (minParts && viewYear === minParts.year && m.value < minParts.month) return false;
      if (maxParts && viewYear === maxParts.year && m.value > maxParts.month) return false;
      return true;
    });
  }, [minParts, maxParts, viewYear]);

  const availableYears = useMemo(() => {
    const minY = minParts ? minParts.year : 2020;
    const todayYear = Number(todayIso.slice(0, 4)) || new Date().getFullYear();
    const maxY = maxParts ? maxParts.year : Math.max(todayYear + 5, 2030);
    const list = [];
    for (let y = Math.min(minY, maxY); y <= maxY; y += 1) {
      list.push(y);
    }
    return list;
  }, [minParts, maxParts, todayIso]);

  const cells = useMemo(() => buildCalendarCells(viewYear, viewMonth), [viewYear, viewMonth]);

  const selectDate = useCallback(
    (iso) => {
      const clean = normalizeIsoDateOnly(iso);
      if (!parseIsoParts(clean)) return;
      if (effectiveMax && clean > effectiveMax) return;
      if (boundedMin && clean < boundedMin) return;
      onChange?.(clean);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [effectiveMax, boundedMin, onChange]
  );

  const todayTarget = effectiveMax && todayIso > effectiveMax ? effectiveMax : todayIso;
  const isTodayDisabled =
    (Boolean(effectiveMax) && todayTarget > effectiveMax) ||
    (Boolean(boundedMin) && todayTarget < boundedMin);

  const { shortText, fullText } = useMemo(
    () => formatTriggerLabels(normalizedValue),
    [normalizedValue]
  );

  const popoverNode =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-modal="false"
            aria-label="Pemilih tanggal"
            className="nim-panel fixed z-[90] rounded-2xl p-3 select-none"
            style={{
              top: `${popoverCoords.top}px`,
              left: `${popoverCoords.left}px`,
              width: `${popoverCoords.width}px`,
            }}
          >
            {/* Header Navigation */}
            <div className="flex items-center justify-between gap-1.5 pb-2.5 border-b border-[var(--line)]">
              <button
                type="button"
                onClick={() => handleStepMonth(-1)}
                disabled={!canGoPrevMonth}
                aria-label="Bulan sebelumnya"
                title="Bulan sebelumnya"
                className="nim-ibtn !w-8 !h-8 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-center">
                <select
                  aria-label="Pilih bulan"
                  value={viewMonth}
                  onChange={handleSelectMonth}
                  style={{ minHeight: '30px' }}
                  className="nim-select !w-auto max-w-[118px] !py-1 !px-2 !text-xs font-bold"
                >
                  {availableMonths.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Pilih tahun"
                  value={viewYear}
                  onChange={handleSelectYear}
                  style={{ minHeight: '30px' }}
                  className="nim-select !w-auto !py-1 !px-2 !text-xs font-bold tabular-nums"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => handleStepMonth(1)}
                disabled={!canGoNextMonth}
                aria-label="Bulan berikutnya"
                title={
                  canGoNextMonth
                    ? 'Bulan berikutnya'
                    : 'Tidak dapat membuka bulan setelah hari ini'
                }
                className="nim-ibtn !w-8 !h-8 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Weekday Header */}
            <div className="grid grid-cols-7 gap-1 mt-2.5 mb-1">
              {WEEKDAYS_ID_SHORT.map((wd) => (
                <div
                  key={wd}
                  className="text-center text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] py-1"
                >
                  {wd}
                </div>
              ))}
            </div>

            {/* Calendar Day Grid (Monday-First, 6x7) */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell) => {
                const isFuture = Boolean(effectiveMax && cell.iso > effectiveMax);
                const isBeforeMin = Boolean(boundedMin && cell.iso < boundedMin);
                const isCellDisabled = isFuture || isBeforeMin;
                const isSelected = cell.iso === normalizedValue;
                const isToday = cell.iso === todayIso;

                return (
                  <button
                    key={cell.iso}
                    type="button"
                    disabled={isCellDisabled}
                    aria-disabled={isCellDisabled ? 'true' : undefined}
                    aria-pressed={isSelected ? 'true' : 'false'}
                    tabIndex={isCellDisabled ? -1 : 0}
                    title={
                      isFuture
                        ? 'Tidak dapat memilih tanggal setelah hari ini'
                        : isBeforeMin
                        ? 'Tanggal di luar rentang minimum'
                        : cell.iso
                    }
                    onClick={() => {
                      if (isCellDisabled) return;
                      selectDate(cell.iso);
                    }}
                    style={
                      isSelected
                        ? {
                            background: 'linear-gradient(135deg, var(--accent-from), var(--accent-to))',
                            color: 'var(--accent-ink)',
                            boxShadow: '0 4px 12px -4px var(--accent-glow)',
                          }
                        : isToday && !isCellDisabled
                        ? {
                            boxShadow: 'inset 0 0 0 1.5px var(--accent)',
                            color: 'var(--accent-text)',
                          }
                        : undefined
                    }
                    className={`h-8 w-full rounded-lg text-xs tabular-nums flex items-center justify-center transition-colors ${
                      isCellDisabled
                        ? 'opacity-25 cursor-not-allowed line-through text-[var(--muted)]'
                        : isSelected
                        ? 'font-bold'
                        : isToday
                        ? 'font-bold hover:bg-[var(--accent-soft)]'
                        : cell.isOutsideMonth
                        ? 'text-[var(--muted)] opacity-60 hover:bg-[var(--card-3)] hover:opacity-100'
                        : 'text-[var(--ink)] font-medium hover:bg-[var(--card-3)]'
                    }`}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 pt-2.5 mt-2.5 border-t border-[var(--line)]">
              <span className="text-[10.5px] font-medium text-[var(--muted)]">
                {!allowFuture ? 'Maks. hari ini' : 'Pilih tanggal'}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isTodayDisabled}
                  onClick={() => selectDate(todayTarget)}
                  className="nim-btn nim-btn--sm text-[11px] font-bold text-[var(--accent-text)] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Hari Ini
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className="nim-btn nim-btn--sm nim-btn--ghost text-[11px]"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={handleToggleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel || (fullText ? `Tanggal: ${fullText}` : placeholder)}
        title={fullText || placeholder}
        className={`nim-input flex items-center justify-between gap-2 text-left cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed ${className}`}
      >
        <span className={`truncate tabular-nums ${shortText ? '' : 'text-[var(--muted)]'}`}>
          {shortText || placeholder}
        </span>
        <Calendar className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
      </button>
      {popoverNode}
    </>
  );
}

export default DatePicker;
