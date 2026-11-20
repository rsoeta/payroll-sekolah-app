import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function buildPageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = [1];
  const left = Math.max(2, currentPage - 1);
  const right = Math.min(totalPages - 1, currentPage + 1);

  if (left > 2) pages.push('ellipsis-left');
  for (let p = left; p <= right; p++) {
    pages.push(p);
  }
  if (right < totalPages - 1) pages.push('ellipsis-right');
  pages.push(totalPages);
  return pages;
}

export const PaginationBar = React.memo(function PaginationBar({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  itemLabel = 'data',
  pageSizeOptions = [12, 24, 48],
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(totalItems, safePage * pageSize);

  const pageNumbers = useMemo(
    () => buildPageNumbers(safePage, totalPages),
    [safePage, totalPages]
  );

  if (totalItems === 0) return null;

  return (
    <div
      className="nim-card-well px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
    >
      <div className="flex flex-wrap items-center gap-2 text-[var(--muted)]">
        <span>
          Menampilkan <strong className="text-[var(--ink)] tabular-nums">{start}–{end}</strong>{' '}
          dari <strong className="text-[var(--ink)] tabular-nums">{totalItems}</strong> {itemLabel}
        </span>

        {onPageSizeChange && totalItems > pageSizeOptions[0] && (
          <label className="inline-flex items-center gap-1.5 ml-1">
            <span>Per halaman:</span>
            <select
              aria-label={`Jumlah ${itemLabel} per halaman`}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="nim-select !w-auto !min-h-[26px] !py-0.5 !px-2 text-xs font-semibold"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="Halaman sebelumnya"
            className="nim-btn nim-btn--sm !px-2 disabled:opacity-45"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          {pageNumbers.map((item) =>
            typeof item === 'string' ? (
              <span key={item} className="px-1.5 text-[var(--muted)] select-none">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                className={`nim-btn nim-btn--sm !px-2.5 tabular-nums ${
                  item === safePage ? 'nim-btn--primary' : ''
                }`}
              >
                {item}
              </button>
            )
          )}

          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            aria-label="Halaman berikutnya"
            className="nim-btn nim-btn--sm !px-2 disabled:opacity-45"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
});

export default PaginationBar;
