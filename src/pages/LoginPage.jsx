import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  Mail,
  KeyRound,
  ArrowLeft,
  Trash2,
  Send,
} from 'lucide-react';
import api, { saveSession, isLiveGasMode } from '../services/gasApi';
import notify from '../utils/notify';
import {
  getSchoolProfile,
  subscribeSchoolProfile,
  fetchSchoolProfileFromServer,
} from '../services/schoolProfileService';

const REMEMBERED_GOOGLE_ACCOUNTS_KEY = 'sipayroll_google_sso_accounts_v1';

const DEFAULT_DEMO_ACCOUNTS = [
  {
    email: 'admin.sekolah@gmail.com',
    name: 'Admin / Bendahara',
    roleLabel: 'Bendahara Sekolah',
  },
  {
    email: 'kepsek.sekolah@gmail.com',
    name: 'Kepala Sekolah',
    roleLabel: 'Otorisasi Kepsek',
  },
  {
    email: 'budi.santoso@gmail.com',
    name: 'Budi Santoso, S.Pd., M.Pd.',
    roleLabel: 'Pendidik / Guru',
  },
  {
    email: 'siti.aisyah@gmail.com',
    name: 'Siti Aisyah, S.Si.',
    roleLabel: 'Pendidik / Guru',
  },
];

function getRememberedGoogleAccounts() {
  try {
    const raw = localStorage.getItem(REMEMBERED_GOOGLE_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRememberedGoogleAccount(account) {
  if (!account || !account.email) return;
  const cleanEmail = String(account.email).trim().toLowerCase();
  const current = getRememberedGoogleAccounts().filter(
    (a) => String(a.email || '').toLowerCase() !== cleanEmail
  );
  const next = [
    {
      email: cleanEmail,
      name: account.name || cleanEmail.split('@')[0],
      roleLabel: account.roleLabel || '',
    },
    ...current,
  ].slice(0, 6);
  localStorage.setItem(REMEMBERED_GOOGLE_ACCOUNTS_KEY, JSON.stringify(next));
}

function removeRememberedGoogleAccount(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const next = getRememberedGoogleAccounts().filter(
    (a) => String(a.email || '').toLowerCase() !== cleanEmail
  );
  localStorage.setItem(REMEMBERED_GOOGLE_ACCOUNTS_KEY, JSON.stringify(next));
  return next;
}

function getInitials(nameOrEmail) {
  const clean = String(nameOrEmail || '').trim();
  if (!clean) return 'G';
  const parts = clean.split(/[\s.@]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export function LoginPage({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('email'); // 'email' | 'otp'
  const [emailInput, setEmailInput] = useState('');
  const [activeEmail, setActiveEmail] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [simulationOtpHint, setSimulationOtpHint] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const [schoolProfile, setSchoolProfile] = useState(() => getSchoolProfile());
  const [rememberedAccounts, setRememberedAccounts] = useState(() =>
    getRememberedGoogleAccounts()
  );

  const liveMode = isLiveGasMode();

  useEffect(() => {
    fetchSchoolProfileFromServer();
    return subscribeSchoolProfile((prof) => {
      setSchoolProfile(prof);
    });
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setTimeout(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const completeLoginSession = useCallback(
    (result, fallbackEmail = '', fallbackName = '') => {
      const resolvedEmail = String(result?.user?.email || fallbackEmail || '')
        .trim()
        .toLowerCase();
      saveRememberedGoogleAccount({
        email: resolvedEmail,
        name: result?.user?.name || fallbackName || resolvedEmail,
        roleLabel:
          result?.user?.role === 'admin'
            ? 'Admin / Bendahara'
            : result?.user?.role === 'kepsek'
            ? 'Kepala Sekolah'
            : 'Pendidik / Guru',
      });
      setRememberedAccounts(getRememberedGoogleAccounts());
      saveSession(result);
      notify.success(`Terverifikasi! Selamat datang, ${result.user.name}.`);
      onLoginSuccess(result.user);
    },
    [onLoginSuccess]
  );

  const requestGmailOtp = useCallback(async (targetEmail) => {
    const cleanEmail = String(targetEmail || '')
      .trim()
      .toLowerCase();

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      notify.warn('Masukkan alamat Gmail yang valid (contoh: nama@gmail.com).');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('auth.requestOtp', { email: cleanEmail });
      setActiveEmail(res?.email || cleanEmail);
      setEmailInput(res?.email || cleanEmail);
      setOtpInput('');
      setStep('otp');
      setResendCooldown(30);

      if (res?.simulationOtp) {
        setSimulationOtpHint(String(res.simulationOtp));
        notify.info(`Mode Simulasi — Kode OTP Gmail Anda: ${res.simulationOtp}`);
      } else {
        setSimulationOtpHint('');
        notify.success(`Kode verifikasi 6 digit telah dikirim ke ${cleanEmail}.`);
      }
    } catch (err) {
      notify.error(
        err.message ||
          'Email tidak terdaftar atau gagal mengirim kode verifikasi. Pastikan Gmail Anda sudah didaftarkan oleh Admin.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRequestOtpSubmit = async (e) => {
    e.preventDefault();
    await requestGmailOtp(emailInput);
  };

  const handleVerifyOtpSubmit = async (e) => {
    e.preventDefault();
    const cleanOtp = String(otpInput || '').replace(/\D/g, '').trim();
    if (cleanOtp.length !== 6) {
      notify.warn('Masukkan tepat 6 digit kode verifikasi yang dikirim ke Gmail Anda.');
      return;
    }

    setLoading(true);
    try {
      const result = await api.post('auth.login', {
        email: activeEmail,
        otp: cleanOtp,
      });
      completeLoginSession(result, activeEmail);
    } catch (err) {
      notify.error(
        err.message || 'Kode verifikasi salah atau kedaluwarsa. Silakan periksa kembali.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = async (acc) => {
    setLoading(true);
    try {
      const result = await api.post('auth.login', {
        email: acc.email,
        name: acc.name,
        demo_quick_login: true,
      });
      completeLoginSession(result, acc.email, acc.name);
    } catch (err) {
      notify.error(err.message || 'Gagal masuk pada mode simulasi.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRemembered = (e, email) => {
    e.stopPropagation();
    const updated = removeRememberedGoogleAccount(email);
    setRememberedAccounts(updated);
  };

  const handleBackToEmail = () => {
    setStep('email');
    setOtpInput('');
    setSimulationOtpHint('');
  };

  return (
    <div className="app-shell flex min-h-[calc(100vh-5rem)] items-center justify-center py-6">
      <div className="fluid-container max-w-4xl items-stretch">
        {/* Left Column: Institution Branding & Overview */}
        <div className="fluid-item flex flex-col justify-between rounded-3xl bg-slate-900 p-6 sm:p-8 text-white shadow-xl">
          <div>
            <div className="flex items-center gap-3.5 mb-5">
              <img
                src={schoolProfile.logo_data_url || '/logo.png'}
                alt="Logo Sekolah"
                onError={(e) => {
                  e.currentTarget.src = '/logo.png';
                }}
                className="h-16 w-16 shrink-0 rounded-2xl object-contain bg-white/10 shadow-md border border-emerald-400/30"
              />
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 border border-emerald-400/30">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Verifikasi Akun Gmail</span>
                </div>
                <p className="mt-1 text-xs text-slate-400 font-medium tracking-wider uppercase">
                  {schoolProfile.foundation_name || 'SIPAYROLL • YAYASAN PENDIDIKAN'}
                </p>
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {schoolProfile.school_name || 'Sistem Penggajian Sekolah & Yayasan'}
            </h1>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              Layanan pengelolaan gaji, rekapitulasi kehadiran, jam mengajar, serta tunjangan
              pendidik dan tenaga kependidikan secara transparan, akurat, dan terintegrasi.
            </p>
          </div>

          <div className="mt-8 space-y-3 border-t border-slate-800 pt-5 text-xs text-slate-300">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>
                <strong>Login Praktis via Gmail:</strong> Masuk menggunakan kode verifikasi 6 digit
                yang dikirim otomatis ke kotak masuk Gmail Anda tanpa password
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-indigo-400" />
              <span>
                <strong>Otorisasi Daftar Email Resmi:</strong> Hanya alamat Gmail yang didaftarkan
                Admin Sekolah yang diizinkan mengakses sistem
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span>
                <strong>Slip Gaji Digital:</strong> Unduh bukti rincian penerimaan gaji resmi
                berformat PDF
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Zero-Config Gmail Verification Login Card */}
        <div className="fluid-item rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-100 shadow-2xs">
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Masuk ke Portal</h2>
                <p className="text-xs text-slate-500">
                  {step === 'email'
                    ? 'Masukkan Akun Gmail yang terdaftar untuk menerima kode masuk'
                    : 'Masukkan kode verifikasi 6 digit dari kotak masuk Gmail Anda'}
                </p>
              </div>
            </div>

            {step === 'email' ? (
              <div className="mt-5 space-y-4">
                {rememberedAccounts.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-500">
                      Akun Gmail yang pernah digunakan di perangkat ini:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {rememberedAccounts.map((acc) => (
                        <div
                          key={acc.email}
                          onClick={() => !loading && requestGmailOtp(acc.email)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if ((e.key === 'Enter' || e.key === ' ') && !loading) {
                              e.preventDefault();
                              requestGmailOtp(acc.email);
                            }
                          }}
                          className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 pl-2 pr-1.5 py-1 text-[11px] hover:border-indigo-300 hover:bg-indigo-50/70 cursor-pointer transition-colors"
                        >
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-bold text-white">
                            {getInitials(acc.name || acc.email)}
                          </span>
                          <span className="font-semibold text-slate-700 max-w-[175px] truncate">
                            {acc.email}
                          </span>
                          <button
                            type="button"
                            title="Hapus akun dari perangkat"
                            onClick={(e) => handleRemoveRemembered(e, acc.email)}
                            className="rounded-full p-0.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <form
                  onSubmit={handleRequestOtpSubmit}
                  className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 sm:p-5 space-y-3.5"
                >
                  <div>
                    <label
                      htmlFor="login-gmail-input"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Alamat Akun Gmail Anda
                    </label>
                    <div className="relative mt-1.5">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="login-gmail-input"
                        type="email"
                        required
                        autoComplete="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="nama.anda@gmail.com"
                        className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3.5 py-2 text-xs sm:text-sm font-medium text-slate-900 focus:border-indigo-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Mengirim Kode Verifikasi...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        <span>Kirim Kode Verifikasi ke Gmail</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-center gap-1.5 text-[10.5px] text-emerald-700 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span>Langsung aktif tanpa pengaturan Client ID tambahan</span>
                  </div>
                </form>
              </div>
            ) : (
              <form
                onSubmit={handleVerifyOtpSubmit}
                className="mt-5 rounded-2xl border border-indigo-200/80 bg-indigo-50/40 p-4 sm:p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                      Kode Terkirim ke Gmail
                    </p>
                    <p className="text-xs font-bold text-slate-900 break-all">{activeEmail}</p>
                  </div>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleBackToEmail}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    <span>Ganti Gmail</span>
                  </button>
                </div>

                {simulationOtpHint && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                    <span>
                      Kode Simulasi:{' '}
                      <strong className="font-mono text-xs tracking-wider">
                        {simulationOtpHint}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setOtpInput(simulationOtpHint)}
                      className="rounded-lg bg-amber-200/80 px-2 py-0.5 text-[10.5px] font-bold text-amber-950 hover:bg-amber-300"
                    >
                      Isi Otomatis
                    </button>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="login-otp-input"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Kode Verifikasi (6 Digit)
                  </label>
                  <div className="relative mt-1.5">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
                    <input
                      id="login-otp-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                      autoFocus
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3.5 py-2 text-center font-mono text-base font-bold tracking-[0.35em] text-slate-900 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Periksa kotak masuk atau folder Spam pada Gmail Anda. Kode berlaku selama 5
                    menit.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    disabled={loading || resendCooldown > 0}
                    onClick={() => requestGmailOtp(activeEmail)}
                    className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100/70 disabled:text-slate-400 disabled:hover:bg-transparent"
                  >
                    {resendCooldown > 0
                      ? `Kirim Ulang (${resendCooldown}d)`
                      : 'Kirim Ulang Kode'}
                  </button>

                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Memverifikasi...</span>
                      </>
                    ) : (
                      <span>Verifikasi & Masuk</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Quick Role Switcher for Demo / Simulation */}
          {!liveMode && (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span>Akses Cepat Akun Terdaftar (Mode Simulasi):</span>
              </div>
              <div className="fluid-container mt-3 gap-2">
                {DEFAULT_DEMO_ACCOUNTS.map((acc, idx) => {
                  const colorClasses = [
                    'border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-900',
                    'border-amber-200 bg-amber-50/70 hover:bg-amber-100 text-amber-900',
                    'border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-emerald-900',
                    'border-teal-200 bg-teal-50/70 hover:bg-teal-100 text-teal-900',
                  ][idx % 4];
                  return (
                    <button
                      key={acc.email}
                      type="button"
                      disabled={loading}
                      onClick={() => handleQuickDemoLogin(acc)}
                      className={`fluid-item-xs rounded-xl border px-3 py-2 text-left text-xs ${colorClasses}`}
                    >
                      <span className="block font-bold">{acc.name}</span>
                      <span className="text-[11px] opacity-80 truncate block">{acc.email}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
