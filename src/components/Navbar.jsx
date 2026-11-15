import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  LogOut,
  Settings,
  Database,
  RefreshCw,
  X,
  CheckCircle2,
  UserCheck,
  Download,
  Smartphone,
} from 'lucide-react';
import {
  getConfiguredGasUrl,
  setConfiguredGasUrl,
  isLiveGasMode,
} from '../services/gasApi';
import { resetSandboxDb } from '../services/sandboxDb';
import notify from '../utils/notify';
import {
  subscribePwaInstallState,
  triggerPwaInstallPrompt,
} from '../utils/pwaRegister';
import {
  getSchoolProfile,
  subscribeSchoolProfile,
} from '../services/schoolProfileService';

const ROLE_LABELS = {
  admin: { label: 'Admin / Bendahara', badge: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  kepsek: { label: 'Kepala Sekolah', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
  guru: { label: 'Pendidik / Guru', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
};

export function Navbar({ user, onLogout, onDataRefresh }) {
  const [configOpen, setConfigOpen] = useState(false);
  const [pwaGuideOpen, setPwaGuideOpen] = useState(false);
  const [gasUrlInput, setGasUrlInput] = useState(getConfiguredGasUrl());
  const [schoolProfile, setSchoolProfile] = useState(() => getSchoolProfile());
  const [pwaState, setPwaState] = useState({
    canPromptInstall: false,
    isStandalone: false,
    isIos: false,
  });
  const liveMode = isLiveGasMode();

  useEffect(() => {
    const unsubPwa = subscribePwaInstallState((state) => {
      setPwaState(state);
    });
    const unsubProfile = subscribeSchoolProfile((prof) => {
      setSchoolProfile(prof);
    });
    return () => {
      unsubPwa();
      unsubProfile();
    };
  }, []);

  const handleInstallPwaClick = async () => {
    if (pwaState.canPromptInstall) {
      await triggerPwaInstallPrompt();
    } else {
      setPwaGuideOpen(true);
    }
  };

  const roleMeta = user ? ROLE_LABELS[user.role] || ROLE_LABELS.guru : null;

  const handleSaveGasUrl = (e) => {
    e.preventDefault();
    const trimmed = gasUrlInput.trim();
    if (trimmed && !trimmed.startsWith('https://script.google.com/')) {
      notify.error('Alamat server tidak valid.');
      return;
    }
    setConfiguredGasUrl(trimmed);
    setConfigOpen(false);
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
    setConfigOpen(false);
    if (onDataRefresh) onDataRefresh();
  };

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
          {/* Brand Logo */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <img
              src={schoolProfile.logo_data_url || '/logo.png'}
              alt={`Logo ${schoolProfile.app_short_name || 'SIPAYROLL'}`}
              onError={(e) => {
                e.currentTarget.src = '/logo.png';
              }}
              className="h-9 w-9 sm:h-11 sm:w-11 shrink-0 rounded-xl sm:rounded-2xl object-contain bg-slate-50 shadow-sm border border-emerald-900/20"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 truncate">
                  {schoolProfile.app_short_name || 'SIPAYROLL'}
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-500 truncate max-w-[180px] sm:max-w-xs">
                {schoolProfile.school_name ||
                  schoolProfile.foundation_name ||
                  'Sistem Penggajian Sekolah & Yayasan'}
              </p>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-1.5">
            {!pwaState.isStandalone && (
              <button
                type="button"
                onClick={handleInstallPwaClick}
                title="Install Aplikasi SIPAYROLL"
                className="touch-target flex items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                <Download className="h-3.5 w-3.5 text-emerald-600" />
                <span>Install</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setGasUrlInput(getConfiguredGasUrl());
                setConfigOpen(true);
              }}
              title="Pengaturan Koneksi Server"
              className="touch-target flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <Settings className="h-3.5 w-3.5 text-indigo-600" />
              <span className="hidden md:inline">Pengaturan</span>
            </button>

            {user && (
              <>
                <div className="hidden sm:flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1">
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt={user.name}
                      referrerPolicy="no-referrer"
                      className="h-5 w-5 rounded-full object-cover border border-slate-200"
                    />
                  ) : (
                    <UserCheck className="h-3.5 w-3.5 text-slate-500" />
                  )}
                  <div className="text-left">
                    <p className="text-xs font-semibold text-slate-800 leading-none">{user.name}</p>
                    <span
                      className={`mt-0.5 inline-block rounded-full border px-1.5 py-0.2 text-[9.5px] font-semibold ${roleMeta?.badge}`}
                    >
                      {roleMeta?.label}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onLogout}
                  aria-label="Keluar sesi"
                  className="touch-target flex items-center justify-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Keluar</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Server Connection Configuration Modal */}
      {configOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <Database className="h-5 w-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Pengaturan Koneksi Server
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfigOpen(false)}
                className="touch-target flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGasUrl} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Alamat Layanan Server (URL)
                </label>
                <input
                  type="url"
                  value={gasUrlInput}
                  onChange={(e) => setGasUrlInput(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-indigo-600 focus:outline-none"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Kosongkan kolom di atas apabila Anda ingin mencoba aplikasi menggunakan{' '}
                  <strong>Mode Simulasi</strong>.
                </p>
              </div>

              <div className="fluid-container pt-2">
                {!liveMode && (
                  <button
                    type="button"
                    onClick={handleResetSandbox}
                    className="fluid-item-xs touch-target flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Atur Ulang Data Simulasi
                  </button>
                )}
                <button
                  type="submit"
                  className="fluid-item-xs touch-target rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Simpan Pengaturan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Panduan Install PWA (iOS / Browser Fallback) */}
      {pwaGuideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-4 sm:p-5 shadow-2xl border border-slate-100 space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Install Aplikasi SIPAYROLL (PWA)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPwaGuideOpen(false)}
                className="touch-target flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600">
              <p>
                Tambahkan <strong>SIPAYROLL</strong> ke layar utama perangkat Anda agar berjalan penuh layaknya aplikasi native:
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <p className="font-semibold text-slate-800">
                  • Android (Chrome / Edge):
                </p>
                <p>
                  Ketuk menu <strong>⋮ (Titik Tiga)</strong> di pojok kanan atas browser, lalu pilih{' '}
                  <strong>&quot;Install app&quot;</strong> atau <strong>&quot;Tambahkan ke layar utama&quot;</strong>.
                </p>
                <p className="font-semibold text-slate-800 pt-1">
                  • iPhone / iPad (Safari):
                </p>
                <p>
                  Ketuk tombol <strong>Bagikan (Share)</strong> di bilah bawah Safari, lalu pilih{' '}
                  <strong>&quot;Add to Home Screen&quot; (Tambah ke Layar Utama)</strong>.
                </p>
                <p className="font-semibold text-slate-800 pt-1">
                  • Desktop (Chrome / Edge):
                </p>
                <p>
                  Klik ikon <strong>Install SIPAYROLL</strong> di sisi kanan *address bar* browser.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPwaGuideOpen(false)}
              className="touch-target w-full rounded-lg sm:rounded-xl bg-emerald-600 px-3 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default Navbar;
