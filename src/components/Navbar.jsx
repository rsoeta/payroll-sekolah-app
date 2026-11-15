import React, { useState, useEffect } from 'react';
import {
  Database,
  RefreshCw,
  X,
  Smartphone,
} from 'lucide-react';
import {
  getConfiguredGasUrl,
  setConfiguredGasUrl,
  isLiveGasMode,
} from '../services/gasApi';
import { resetSandboxDb } from '../services/sandboxDb';
import notify from '../utils/notify';

export function ServerConfigModal({ isOpen, onClose, onDataRefresh }) {
  const [gasUrlInput, setGasUrlInput] = useState(getConfiguredGasUrl());
  const liveMode = isLiveGasMode();

  useEffect(() => {
    if (isOpen) {
      setGasUrlInput(getConfiguredGasUrl());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveGasUrl = (e) => {
    e.preventDefault();
    const trimmed = gasUrlInput.trim();
    if (trimmed && !trimmed.startsWith('https://script.google.com/')) {
      notify.error('Alamat server tidak valid.');
      return;
    }
    setConfiguredGasUrl(trimmed);
    onClose();
    notify.success(
      trimmed
        ? 'Berhasil terhubung ke server utama!'
        : 'Beralih ke Mode Simulasi.'
    );
    if (onDataRefresh) onDataRefresh();
  };

  const handleResetSandbox = async () => {
    await resetSandboxDb();
    notify.info('Data simulasi berhasil diatur ulang ke kondisi awal.');
    onClose();
    if (onDataRefresh) onDataRefresh();
  };

  return (
    <div
      className="nim-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Pengaturan Koneksi Server"
    >
      <div className="nim-panel nim-modal w-full max-w-lg p-5 sm:p-6">
        <div
          className="flex items-center justify-between pb-3"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <div className="flex items-center gap-2.5">
            <span className="nim-kpi__ico">
              <Database className="h-4 w-4" />
            </span>
            <h3 className="text-base font-bold text-[var(--ink)]">
              Pengaturan Koneksi Server
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan server"
            className="nim-ibtn"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSaveGasUrl} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              Alamat Layanan Server (URL)
            </label>
            <input
              type="url"
              value={gasUrlInput}
              onChange={(e) => setGasUrlInput(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="nim-input mt-1.5"
            />
            <p className="mt-1.5 text-xs text-[var(--muted)]">
              Kosongkan kolom di atas apabila Anda ingin mencoba aplikasi menggunakan{' '}
              <strong className="text-[var(--ink)]">Mode Simulasi</strong>.
            </p>
          </div>

          <div className="fluid-container pt-2 gap-2">
            {!liveMode && (
              <button
                type="button"
                onClick={handleResetSandbox}
                className="fluid-item-xs nim-btn"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Atur Ulang Data Simulasi</span>
              </button>
            )}
            <button type="submit" className="fluid-item-xs nim-btn nim-btn--primary">
              Simpan Pengaturan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PwaGuideModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div
      className="nim-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Install Aplikasi SIPAYROLL"
    >
      <div className="nim-panel nim-modal w-full max-w-md p-5 space-y-4">
        <div
          className="flex items-center justify-between pb-3"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{
                background: 'var(--good-soft)',
                color: 'var(--good-text)',
                boxShadow: 'inset 0 0 0 1px var(--good-line)',
              }}
            >
              <Smartphone className="h-4 w-4" />
            </span>
            <h3 className="text-sm sm:text-base font-bold text-[var(--ink)]">
              Install Aplikasi SIPAYROLL (PWA)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panduan PWA"
            className="nim-ibtn"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs text-[var(--muted)]">
          <p>
            Tambahkan <strong className="text-[var(--ink)]">SIPAYROLL</strong> ke layar utama
            perangkat Anda agar berjalan penuh layaknya aplikasi native:
          </p>
          <div className="nim-card-well p-3.5 space-y-2">
            <p className="font-bold text-[var(--ink)]">• Android (Chrome / Edge):</p>
            <p>
              Ketuk menu <strong className="text-[var(--ink)]">⋮ (Titik Tiga)</strong> di pojok
              kanan atas browser, lalu pilih{' '}
              <strong className="text-[var(--ink)]">&quot;Install app&quot;</strong> atau{' '}
              <strong className="text-[var(--ink)]">&quot;Tambahkan ke layar utama&quot;</strong>.
            </p>
            <p className="font-bold text-[var(--ink)] pt-1">• iPhone / iPad (Safari):</p>
            <p>
              Ketuk tombol <strong className="text-[var(--ink)]">Bagikan (Share)</strong> di bilah
              bawah Safari, lalu pilih{' '}
              <strong className="text-[var(--ink)]">&quot;Add to Home Screen&quot;</strong>.
            </p>
            <p className="font-bold text-[var(--ink)] pt-1">• Desktop (Chrome / Edge):</p>
            <p>
              Klik ikon <strong className="text-[var(--ink)]">Install SIPAYROLL</strong> di sisi
              kanan <em>address bar</em> browser.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="nim-btn nim-btn--good w-full"
        >
          Mengerti
        </button>
      </div>
    </div>
  );
}

export default ServerConfigModal;
