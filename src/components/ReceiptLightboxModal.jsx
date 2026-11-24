import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { resolveReceiptPreviewSource } from '../utils/reimbursementHelpers';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export function ReceiptLightboxModal({
  isOpen,
  url,
  title = 'Bukti Nota',
  subtitle = '',
  receiptNumber = '',
  onClose,
}) {
  const source = useMemo(() => resolveReceiptPreviewSource(url), [url]);

  const [mode, setMode] = useState(() => source?.initialMode || 'image');
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMode(source?.initialMode || 'image');
    setZoom(1);
    setRotation(0);
    setLoading(true);
    setImgFailed(false);
  }, [isOpen, url, source?.initialMode]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || mode !== 'image') return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100));
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setRotation((rot) => (rot + 90) % 360);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, mode, onClose]);

  if (!isOpen || !source || typeof document === 'undefined') return null;

  const isImageMode = mode === 'image' && Boolean(source.imageUrl);
  const canSwitchToImage = Boolean(source.imageUrl) && !imgFailed;

  const handleToggleMode = () => {
    if (isImageMode && source.iframeUrl) {
      setLoading(true);
      setMode('iframe');
    } else if (!isImageMode && canSwitchToImage) {
      setLoading(true);
      setMode('image');
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Pratinjau ${title || 'Bukti Nota'}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      className="fixed inset-0 z-[95] flex flex-col bg-black/82 backdrop-blur-md p-2.5 sm:p-5"
    >
      {/* Top Toolbar */}
      <div
        className="nim-panel mx-auto w-full max-w-5xl rounded-2xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="nim-kpi__ico !w-8 !h-8 shrink-0">
            {isImageMode ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-xs sm:text-sm font-bold text-[var(--ink)] truncate max-w-[55vw] sm:max-w-md">
                {title || 'Bukti Nota Belanja'}
              </h3>
              {receiptNumber && (
                <span className="nim-badge nim-badge--accent !text-[10px]">
                  No. {receiptNumber}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-[11px] text-[var(--muted)] truncate">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {isImageMode && (
            <>
              <button
                type="button"
                onClick={() =>
                  setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100))
                }
                disabled={zoom <= MIN_ZOOM}
                title="Perkecil (-)"
                aria-label="Perkecil gambar"
                className="nim-ibtn !w-8 !h-8 rounded-lg disabled:opacity-35"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setRotation(0);
                }}
                title="Reset ukuran & rotasi"
                className="nim-btn nim-btn--sm tabular-nums text-[11px] !px-2"
              >
                {Math.round(zoom * 100)}%
              </button>

              <button
                type="button"
                onClick={() =>
                  setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100))
                }
                disabled={zoom >= MAX_ZOOM}
                title="Perbesar (+)"
                aria-label="Perbesar gambar"
                className="nim-ibtn !w-8 !h-8 rounded-lg disabled:opacity-35"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setRotation((rot) => (rot + 90) % 360)}
                title="Putar 90° (R)"
                aria-label="Putar gambar 90 derajat"
                className="nim-ibtn !w-8 !h-8 rounded-lg"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          {source.isGoogleDrive && (isImageMode ? Boolean(source.iframeUrl) : canSwitchToImage) && (
            <button
              type="button"
              onClick={handleToggleMode}
              className="nim-btn nim-btn--sm text-[11px]"
              title={
                isImageMode
                  ? 'Buka penampil Google Drive (cocok untuk PDF multi-halaman)'
                  : 'Kembali ke mode gambar'
              }
            >
              {isImageMode ? (
                <>
                  <FileText className="h-3.5 w-3.5" />
                  <span>Preview Drive</span>
                </>
              ) : (
                <>
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span>Mode Gambar</span>
                </>
              )}
            </button>
          )}

          <a
            href={source.safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="nim-btn nim-btn--sm text-[11px]"
            title="Buka tautan asli di tab baru"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Tab Baru</span>
          </a>

          <button
            type="button"
            onClick={() => onClose?.()}
            aria-label="Tutup pratinjau nota"
            title="Tutup (Esc)"
            className="nim-ibtn !w-8 !h-8 rounded-lg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Viewer Area */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose?.();
        }}
        className="relative mx-auto mt-2.5 w-full max-w-5xl flex-1 min-h-0 flex flex-col items-center justify-center overflow-hidden rounded-2xl"
      >
        {loading && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-white/85">
            <Loader2 className="h-7 w-7 animate-spin" />
            <span className="text-xs font-semibold">Memuat pratinjau bukti nota...</span>
          </div>
        )}

        {isImageMode ? (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose?.();
            }}
            className="w-full h-full overflow-auto flex items-center justify-center p-2 sm:p-4"
          >
            <img
              src={source.imageUrl}
              alt={title || 'Bukti Nota Belanja'}
              referrerPolicy="no-referrer"
              onLoad={() => setLoading(false)}
              onError={() => {
                setImgFailed(true);
                setLoading(false);
                if (source.iframeUrl) {
                  setLoading(true);
                  setMode('iframe');
                }
              }}
              onClick={() => setZoom((z) => (z === 1 ? 1.75 : 1))}
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
              }}
              className={`max-h-[76vh] max-w-full rounded-xl object-contain shadow-2xl transition-transform duration-200 select-none ${
                zoom > 1 ? 'cursor-zoom-out' : 'cursor-zoom-in'
              }`}
            />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col gap-2 min-h-0">
            {imgFailed && (
              <div
                className="rounded-xl px-3 py-1.5 text-center text-[11px] text-white/90 bg-black/55 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                Menampilkan mode pratinjau dokumen/web. Jika pratinjau tidak muncul karena batasan
                situs atau akses Google Drive, klik <strong>Tab Baru</strong> di kanan atas.
              </div>
            )}
            <iframe
              src={source.iframeUrl}
              title={`Pratinjau ${title || 'Bukti Nota'}`}
              referrerPolicy="no-referrer"
              allow="autoplay; fullscreen"
              onLoad={() => setLoading(false)}
              className="w-full flex-1 min-h-[65vh] rounded-xl bg-white shadow-2xl border-0"
            />
            {!imgFailed && (
              <p className="text-center text-[11px] text-white/75 shrink-0">
                Jika pratinjau tidak muncul karena kebijakan keamanan situs asal atau izin file, klik{' '}
                <strong className="text-white">Tab Baru</strong> di kanan atas.
              </p>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default ReceiptLightboxModal;
