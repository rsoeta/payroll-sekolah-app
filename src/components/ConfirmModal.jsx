import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Accessible Frosted-Glass Confirmation Modal.
 * Strictly replaces native `window.confirm()`.
 */
export function ConfirmModal({
  isOpen,
  title = 'Konfirmasi Tindakan',
  message,
  confirmLabel = 'Ya, Lanjutkan',
  cancelLabel = 'Batal',
  variant = 'primary',
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null;

  const confirmBtnStyle =
    variant === 'danger'
      ? 'nim-btn nim-btn--danger-solid'
      : variant === 'emerald'
      ? 'nim-btn nim-btn--good'
      : 'nim-btn nim-btn--primary';

  return (
    <div
      className="nim-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="nim-panel nim-modal w-full max-w-md p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{
                background: 'var(--warn-soft)',
                color: 'var(--warn-text)',
                boxShadow: 'inset 0 0 0 1px var(--warn-line)',
              }}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 id="confirm-modal-title" className="text-base font-bold text-[var(--ink)]">
                {title}
              </h3>
              <p className="mt-1 text-xs sm:text-sm text-[var(--muted)]">{message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Tutup dialog"
            className="nim-ibtn"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="fluid-container mt-5 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="fluid-item-xs nim-btn"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`fluid-item-xs ${confirmBtnStyle}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
