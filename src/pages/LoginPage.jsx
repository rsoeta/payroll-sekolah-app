import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldCheck,
  Sparkles,
  RefreshCw,
  Trash2,
  AlertCircle,
  LogIn,
  KeyRound,
  Copy,
  CheckCircle2,
} from 'lucide-react';
import api, { saveSession, isLiveGasMode } from '../services/gasApi';
import notify from '../utils/notify';
import {
  getSchoolProfile,
  subscribeSchoolProfile,
  fetchSchoolProfileFromServer,
} from '../services/schoolProfileService';
import { getThemePreference, resolveTheme, subscribeTheme } from '../utils/theme';
import {
  getLocalGoogleClientId,
  setLocalGoogleClientId,
  isValidGoogleClientId,
  resolveGoogleClientId,
  loadGoogleIdentityScript,
  requestGoogleAccessToken,
} from '../utils/googleOAuth';

const REMEMBERED_GOOGLE_ACCOUNTS_KEY = 'sipayroll_google_sso_accounts_v1';

const DEFAULT_DEMO_ACCOUNTS = [
  {
    email: 'admin.sekolah@gmail.com',
    name: 'Admin / Bendahara',
    roleLabel: 'Bendahara Sekolah',
    tone: 'nim-badge--accent',
  },
  {
    email: 'kepsek.sekolah@gmail.com',
    name: 'Kepala Sekolah',
    roleLabel: 'Otorisasi Kepsek',
    tone: 'nim-badge--warn',
  },
  {
    email: 'budi.santoso@gmail.com',
    name: 'Budi Santoso, S.Pd., M.Pd.',
    roleLabel: 'Pendidik / Guru',
    tone: 'nim-badge--good',
  },
  {
    email: 'siti.aisyah@gmail.com',
    name: 'Siti Aisyah, S.Si.',
    roleLabel: 'Pendidik / Guru',
    tone: 'nim-badge--info',
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

function GoogleLogo({ className = 'h-4 w-4 shrink-0' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
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
  );
}

export function LoginPage({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [gisReady, setGisReady] = useState(false);
  const [gisError, setGisError] = useState('');
  const [containerWidth, setContainerWidth] = useState(320);
  const [clientIdDraft, setClientIdDraft] = useState(() => getLocalGoogleClientId());
  const [localClientIdVersion, setLocalClientIdVersion] = useState(0);

  const [schoolProfile, setSchoolProfile] = useState(() => getSchoolProfile());
  const [activeTheme, setActiveTheme] = useState(() => resolveTheme(getThemePreference()));
  const [rememberedAccounts, setRememberedAccounts] = useState(() =>
    getRememberedGoogleAccounts()
  );

  const googleBtnContainerRef = useRef(null);
  const idTokenHandlerRef = useRef(null);

  const liveMode = isLiveGasMode();
  const googleClientId = resolveGoogleClientId(schoolProfile);
  const hasValidClientId = Boolean(googleClientId && !googleClientId.startsWith('GANTI_DENGAN_'));
  const isLocalOverrideClientId = Boolean(
    !String(schoolProfile?.google_client_id || '').trim() &&
      !(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim() &&
      getLocalGoogleClientId()
  );
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    fetchSchoolProfileFromServer();
    const unsubProfile = subscribeSchoolProfile((prof) => {
      setSchoolProfile(prof);
    });
    const unsubTheme = subscribeTheme((_, resolved) => {
      setActiveTheme(resolved);
    });
    return () => {
      unsubProfile();
      unsubTheme();
    };
  }, []);

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

  const authenticateWithGooglePayload = useCallback(
    async (oauthPayload, fallbackEmail = '') => {
      setLoading(true);
      setAuthError('');
      try {
        const result = await api.post('auth.login', oauthPayload);
        completeLoginSession(result, fallbackEmail);
      } catch (err) {
        const msg =
          err?.message ||
          'Akun Google Anda belum terdaftar pada whitelist Users_Auth.username atau sesi OAuth gagal diverifikasi.';
        setAuthError(msg);
        notify.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [completeLoginSession]
  );

  idTokenHandlerRef.current = async (credentialResponse) => {
    const idToken = credentialResponse?.credential;
    if (!idToken) {
      const msg = 'Kredensial Google OAuth tidak diterima. Silakan coba lagi.';
      setAuthError(msg);
      notify.error(msg);
      return;
    }
    await authenticateWithGooglePayload({ id_token: idToken });
  };

  useEffect(() => {
    const el = googleBtnContainerRef.current;
    if (!el || !hasValidClientId) return undefined;

    const measureWidth = () => {
      const w = Math.floor(el.getBoundingClientRect().width || el.offsetWidth || 320);
      const clamped = Math.min(Math.max(w, 240), 380);
      setContainerWidth((prev) => (prev === clamped ? prev : clamped));
    };

    measureWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measureWidth);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measureWidth);
    return () => window.removeEventListener('resize', measureWidth);
  }, [hasValidClientId, localClientIdVersion]);

  useEffect(() => {
    let cancelled = false;

    if (!hasValidClientId) {
      setGisReady(false);
      setGisError('');
      return undefined;
    }

    setGisReady(false);
    setGisError('');

    loadGoogleIdentityScript()
      .then((google) => {
        if (cancelled) return;
        const container = googleBtnContainerRef.current;
        if (!container) return;

        google.accounts.id.initialize({
          client_id: googleClientId,
          callback: (resp) => idTokenHandlerRef.current?.(resp),
          auto_select: false,
          cancel_on_tap_outside: true,
          ux_mode: 'popup',
        });

        container.innerHTML = '';
        google.accounts.id.renderButton(container, {
          type: 'standard',
          theme: activeTheme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          logo_alignment: 'left',
          locale: 'id',
          width: containerWidth,
        });

        setGisReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setGisReady(false);
        setGisError(err?.message || 'Gagal memuat tombol Login Google.');
      });

    return () => {
      cancelled = true;
    };
  }, [googleClientId, hasValidClientId, activeTheme, containerWidth, localClientIdVersion]);

  const handlePopupOAuthLogin = async (loginHint = '') => {
    if (!hasValidClientId) {
      notify.warn('Google OAuth Client ID belum dikonfigurasi.');
      return;
    }
    setLoading(true);
    setAuthError('');
    try {
      const accessToken = await requestGoogleAccessToken(googleClientId, loginHint);
      await authenticateWithGooglePayload({ access_token: accessToken }, loginHint);
    } catch (err) {
      const msg = err?.message || 'Login Google OAuth dibatalkan atau gagal.';
      setAuthError(msg);
      notify.error(msg);
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = async (acc) => {
    setLoading(true);
    setAuthError('');
    try {
      const result = await api.post('auth.login', {
        email: acc.email,
        name: acc.name,
        demo_quick_login: true,
      });
      completeLoginSession(result, acc.email, acc.name);
    } catch (err) {
      const msg = err?.message || 'Gagal masuk pada mode simulasi.';
      setAuthError(msg);
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRemembered = (e, email) => {
    e.stopPropagation();
    const updated = removeRememberedGoogleAccount(email);
    setRememberedAccounts(updated);
  };

  const handleSaveLocalClientId = (e) => {
    e.preventDefault();
    const clean = String(clientIdDraft || '').trim();
    if (!isValidGoogleClientId(clean)) {
      notify.warn(
        'Format Client ID harus berakhiran ".apps.googleusercontent.com" (diperoleh dari Google Cloud Console).'
      );
      return;
    }
    setLocalGoogleClientId(clean);
    setLocalClientIdVersion((v) => v + 1);
    setAuthError('');
    notify.success('Google OAuth Client ID perangkat disimpan.');
  };

  const handleResetLocalClientId = () => {
    setLocalGoogleClientId('');
    setClientIdDraft('');
    setLocalClientIdVersion((v) => v + 1);
    setAuthError('');
  };

  const handleCopyOrigin = async () => {
    if (!currentOrigin) return;
    try {
      await navigator.clipboard.writeText(currentOrigin);
      notify.success(`Origin "${currentOrigin}" berhasil disalin.`);
    } catch {
      notify.info(`Origin aplikasi: ${currentOrigin}`);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-110px)] items-center justify-center py-4 sm:py-8">
      <div className="fluid-container max-w-5xl items-stretch">
        {/* Left Column: Frosted Glass Institution Hero */}
        <div
          className="fluid-item nim-glass rounded-[26px] p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden"
          style={{
            background:
              'radial-gradient(circle at top right, var(--accent-soft), transparent 55%), linear-gradient(160deg, var(--glass-hi), transparent 46%), var(--card)',
          }}
        >
          <div>
            <div className="flex items-center gap-3.5 mb-5">
              <img
                src={schoolProfile.logo_data_url || '/logo.png'}
                alt="Logo Sekolah"
                onError={(e) => {
                  e.currentTarget.src = '/logo.png';
                }}
                className="h-16 w-16 shrink-0 rounded-2xl object-contain p-1"
                style={{
                  background: 'var(--card-3)',
                  boxShadow: 'inset 0 0 0 1px var(--glass-rim)',
                }}
              />
              <div className="min-w-0">
                <div className="nim-badge nim-badge--good">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Google OAuth • Whitelist</span>
                </div>
                <p className="mt-1.5 text-[11px] font-bold tracking-wider uppercase text-[var(--muted)] truncate">
                  {schoolProfile.foundation_name || 'SIPAYROLL • YAYASAN PENDIDIKAN'}
                </p>
              </div>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink)] leading-tight">
              {schoolProfile.school_name || 'Sistem Penggajian Sekolah & Yayasan'}
            </h1>
            <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">
              Layanan pengelolaan gaji, rekapitulasi kehadiran, jam mengajar, serta tunjangan
              pendidik dan tenaga kependidikan secara transparan, akurat, dan terintegrasi.
            </p>
          </div>

          <div
            className="mt-8 space-y-3 pt-5 text-xs text-[var(--ink-2)]"
            style={{ borderTop: '1px solid var(--line)' }}
          >
            <div className="flex items-start gap-2.5">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ background: 'var(--good)', boxShadow: '0 0 0 4px var(--good-soft)' }}
              />
              <span>
                <strong className="text-[var(--ink)]">Login Google OAuth:</strong> Masuk satu klik
                menggunakan Akun Google resmi Anda secara aman tanpa kata sandi maupun kode OTP.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ background: 'var(--accent)', boxShadow: '0 0 0 4px var(--accent-soft)' }}
              />
              <span>
                <strong className="text-[var(--ink)]">Whitelist Users_Auth.username:</strong> Hanya
                alamat email Google yang terdaftar pada kolom <code>Users_Auth.username</code> oleh
                Admin Sekolah yang diizinkan mengakses sistem.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ background: 'var(--warn)', boxShadow: '0 0 0 4px var(--warn-soft)' }}
              />
              <span>
                <strong className="text-[var(--ink)]">Slip Gaji Digital:</strong> Unduh bukti
                rincian penerimaan gaji resmi berformat PDF.
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Frosted Glass Google OAuth Login Card */}
        <div className="fluid-item nim-glass rounded-[26px] p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                style={{
                  background: 'var(--card-3)',
                  boxShadow: 'inset 0 0 0 1px var(--glass-rim)',
                }}
              >
                <GoogleLogo className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--ink)]">Masuk dengan Akun Google</h2>
                <p className="text-xs text-[var(--muted)]">
                  Autentikasi Google OAuth resmi dengan validasi whitelist{' '}
                  <code>Users_Auth.username</code>
                </p>
              </div>
            </div>

            {authError && (
              <div
                role="alert"
                className="mt-4 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs"
                style={{
                  background: 'var(--bad-soft)',
                  color: 'var(--bad-text)',
                  boxShadow: 'inset 0 0 0 1px var(--bad-line)',
                }}
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="leading-relaxed font-medium">{authError}</p>
              </div>
            )}

            <div className="mt-5 space-y-4">
              {hasValidClientId ? (
                <>
                  {rememberedAccounts.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-[var(--muted)]">
                        Akun Google yang pernah digunakan di perangkat ini:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {rememberedAccounts.map((acc) => (
                          <div
                            key={acc.email}
                            onClick={() => !loading && handlePopupOAuthLogin(acc.email)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if ((e.key === 'Enter' || e.key === ' ') && !loading) {
                                e.preventDefault();
                                handlePopupOAuthLogin(acc.email);
                              }
                            }}
                            className="group inline-flex items-center gap-2 rounded-full pl-1.5 pr-1.5 py-1 text-[11px] cursor-pointer transition-colors"
                            style={{
                              background: 'var(--card-2)',
                              boxShadow: 'inset 0 0 0 1px var(--line-2)',
                            }}
                          >
                            <span
                              className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold"
                              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                            >
                              {getInitials(acc.name || acc.email)}
                            </span>
                            <span className="font-semibold text-[var(--ink-2)] max-w-[175px] truncate">
                              {acc.email}
                            </span>
                            <button
                              type="button"
                              title="Hapus akun dari perangkat"
                              onClick={(e) => handleRemoveRemembered(e, acc.email)}
                              className="rounded-full p-0.5 text-[var(--muted)] hover:text-[var(--bad-text)]"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="nim-card-well p-4 sm:p-5 space-y-3.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[var(--ink-2)] flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--good-text)]" />
                        <span>Google OAuth Siap</span>
                      </span>
                      {isLocalOverrideClientId && (
                        <button
                          type="button"
                          onClick={handleResetLocalClientId}
                          className="text-[11px] font-semibold text-[var(--accent-text)] hover:underline"
                        >
                          Ubah Client ID
                        </button>
                      )}
                    </div>

                    {/* Official Google Identity Services Button Container */}
                    <div className="flex flex-col items-center justify-center min-h-[46px]">
                      <div
                        ref={googleBtnContainerRef}
                        className="w-full flex justify-center min-h-[42px]"
                      />
                      {!gisReady && !gisError && (
                        <div className="flex items-center gap-2 text-xs text-[var(--muted)] py-2">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>Memuat tombol Google Sign-In...</span>
                        </div>
                      )}
                      {gisError && (
                        <p className="text-[11px] text-[var(--bad-text)] text-center mt-1">
                          {gisError}
                        </p>
                      )}
                    </div>

                    <div className="relative flex items-center py-0.5">
                      <div className="flex-grow border-t border-[var(--line)]" />
                      <span className="mx-3 text-[10.5px] uppercase tracking-wider text-[var(--muted)]">
                        atau
                      </span>
                      <div className="flex-grow border-t border-[var(--line)]" />
                    </div>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handlePopupOAuthLogin('')}
                      className="nim-btn w-full"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>Memverifikasi Akun Google...</span>
                        </>
                      ) : (
                        <>
                          <GoogleLogo className="h-4 w-4" />
                          <span>Pilih / Ganti Akun Google</span>
                        </>
                      )}
                    </button>

                    <p className="text-[11px] text-[var(--muted)] leading-relaxed text-center">
                      Setelah verifikasi Google berhasil, sistem memeriksa email Anda pada sheet{' '}
                      <code>Users_Auth</code> kolom <code>username</code>.
                    </p>
                  </div>
                </>
              ) : (
                <div className="nim-card-well p-4 sm:p-5 space-y-3.5">
                  <div className="flex items-start gap-2.5">
                    <KeyRound className="h-4 w-4 text-[var(--warn-text)] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-[var(--ink)]">
                        Konfigurasi Google OAuth Client ID Diperlukan
                      </p>
                      <p className="text-[11px] text-[var(--muted)] mt-0.5 leading-relaxed">
                        Untuk mengaktifkan tombol <strong>Login Google OAuth</strong> di mode live,
                        pasang Web Client ID dari Google Cloud Console.
                      </p>
                    </div>
                  </div>

                  <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-[var(--ink-2)] leading-relaxed">
                    <li>
                      Buka <strong>Google Cloud Console &rsaquo; APIs &amp; Services &rsaquo; Credentials</strong>,
                      buat <strong>OAuth client ID (Web application)</strong>.
                    </li>
                    <li>
                      Tambahkan origin berikut ke <strong>Authorized JavaScript origins</strong>:
                      {currentOrigin && (
                        <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 bg-[var(--card-2)] border border-[var(--line)]">
                          <code className="text-[10.5px] font-mono text-[var(--ink)]">
                            {currentOrigin}
                          </code>
                          <button
                            type="button"
                            onClick={handleCopyOrigin}
                            title="Salin origin"
                            className="text-[var(--accent-text)] hover:opacity-80"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                    </li>
                    <li>
                      Simpan Client ID di <code>VITE_GOOGLE_CLIENT_ID</code>, konstanta GAS{' '}
                      <code>GOOGLE_OAUTH_CLIENT_ID</code>, menu <strong>Profil Sekolah</strong>,
                      atau uji sementara di bawah ini:
                    </li>
                  </ol>

                  <form onSubmit={handleSaveLocalClientId} className="space-y-2 pt-1">
                    <input
                      type="text"
                      value={clientIdDraft}
                      onChange={(e) => setClientIdDraft(e.target.value)}
                      placeholder="1234567890-xxxx.apps.googleusercontent.com"
                      className="nim-input font-mono text-xs"
                    />
                    <button type="submit" className="nim-btn nim-btn--primary w-full">
                      <LogIn className="h-3.5 w-3.5" />
                      <span>Aktifkan Google Sign-In di Perangkat Ini</span>
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>

          {/* Quick Role Switcher for Demo / Simulation */}
          {!liveMode && (
            <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--line)' }}>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]">
                <Sparkles className="h-4 w-4 text-[var(--warn)]" />
                <span>Akses Cepat Whitelist Users_Auth.username (Mode Simulasi):</span>
              </div>
              <div className="fluid-container mt-3 gap-2">
                {DEFAULT_DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    disabled={loading}
                    onClick={() => handleQuickDemoLogin(acc)}
                    className="fluid-item-xs rounded-xl px-3 py-2 text-left text-xs transition-colors"
                    style={{
                      background: 'var(--card-2)',
                      boxShadow: 'inset 0 0 0 1px var(--line-2)',
                    }}
                  >
                    <span className="block font-bold text-[var(--ink)]">{acc.name}</span>
                    <span className="text-[11px] text-[var(--muted)] truncate block">
                      {acc.email}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
