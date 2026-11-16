import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  Download,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  Search,
  Settings,
  Sun,
  UserCheck,
  X,
} from 'lucide-react';
import { isLiveGasMode } from '../services/gasApi';
import {
  getSchoolProfile,
  subscribeSchoolProfile,
} from '../services/schoolProfileService';
import {
  subscribePwaInstallState,
  triggerPwaInstallPrompt,
} from '../utils/pwaRegister';
import {
  applyRail,
  applyTheme,
  getRailPreference,
  getThemePreference,
  resolveTheme,
  subscribeRail,
  subscribeTheme,
} from '../utils/theme';
import { ServerConfigModal, PwaGuideModal } from './Navbar';
import CommandPalette from './CommandPalette';

const ROLE_META = {
  admin: { label: 'Admin / Bendahara', tone: 'nim-badge--accent' },
  kepsek: { label: 'Kepala Sekolah', tone: 'nim-badge--warn' },
  guru: { label: 'Pendidik / Guru', tone: 'nim-badge--good' },
};

export function AppShell({
  user,
  navItems = [],
  activeTab,
  onTabChange,
  quickSearchItems = [],
  onLogout,
  onDataRefresh,
  children,
}) {
  const [configOpen, setConfigOpen] = useState(false);
  const [pwaGuideOpen, setPwaGuideOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const [schoolProfile, setSchoolProfile] = useState(() => getSchoolProfile());
  const [themePref, setThemePref] = useState(() => getThemePreference());
  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(getThemePreference()));
  const [railCollapsed, setRailCollapsed] = useState(() => getRailPreference());
  const [pwaState, setPwaState] = useState({
    canPromptInstall: false,
    isStandalone: false,
    isIos: false,
  });

  const liveMode = isLiveGasMode();

  useEffect(() => {
    const unsubPwa = subscribePwaInstallState(setPwaState);
    const unsubProfile = subscribeSchoolProfile(setSchoolProfile);
    const unsubTheme = subscribeTheme((pref, resolved) => {
      setThemePref(pref);
      setResolvedTheme(resolved);
    });
    const unsubRail = subscribeRail(setRailCollapsed);

    const handleResize = () => {
      const w = window.innerWidth;
      if (w <= 760) {
        document.documentElement.classList.remove('is-rail');
      } else if (w < 1280) {
        document.documentElement.classList.add('is-rail');
      } else {
        document.documentElement.classList.toggle('is-rail', getRailPreference());
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      unsubPwa();
      unsubProfile();
      unsubTheme();
      unsubRail();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Global Keyboard Shortcuts (⌘K / Ctrl+K, /, [)
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (!user) return;
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }

      if (e.target && e.target.closest('input, textarea, select, [contenteditable]')) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || !user) return;

      if (e.key === '/') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === '[' && window.innerWidth >= 1280) {
        e.preventDefault();
        applyRail(!getRailPreference());
      } else if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [user, mobileMenuOpen]);

  const handleInstallPwaClick = async () => {
    if (pwaState.canPromptInstall) {
      await triggerPwaInstallPrompt();
    } else {
      setPwaGuideOpen(true);
    }
  };

  const handleToggleTheme = () => {
    applyTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const handleToggleRail = () => {
    applyRail(!railCollapsed);
  };

  const isAdmin = user?.role === 'admin';
  const roleMeta = user ? ROLE_META[user.role] || ROLE_META.guru : null;
  const activeNav = navItems.find((item) => item.id === activeTab) || navItems[0];
  const shortBrand = schoolProfile.app_short_name || 'SIPAYROLL';
  const schoolSubtitle =
    schoolProfile.school_name ||
    schoolProfile.foundation_name ||
    'Sistem Penggajian Sekolah & Yayasan';

  // Group nav items preserving insertion order
  const groupedNav = navItems.reduce((acc, item) => {
    const group = item.group || 'Menu Utama';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});

  return (
    <>
      {/* Ambient Glass Background Aura */}
      <div className="nim-aura" aria-hidden="true">
        <div className="nim-aura__orb nim-aura__orb--a" />
        <div className="nim-aura__orb nim-aura__orb--b" />
        <div className="nim-aura__orb nim-aura__orb--c" />
      </div>

      <div className="nim-app">
        {/* Desktop & Tablet Floating Glass Sidebar (Authenticated Users) */}
        {user && (
          <aside className="nim-side nim-glass" aria-label="Navigasi Samping">
            <div className="nim-side__top">
              <div className="nim-side__brand flex items-center gap-2.5 min-w-0 flex-1">
                <img
                  src={schoolProfile.logo_data_url || '/logo.png'}
                  alt={`Logo ${shortBrand}`}
                  onError={(e) => {
                    e.currentTarget.src = '/logo.png';
                  }}
                  className="h-9 w-9 shrink-0 rounded-xl object-contain p-0.5"
                  style={{
                    background: 'var(--card-3)',
                    boxShadow: 'inset 0 0 0 1px var(--glass-rim)',
                  }}
                />
                <div className="nim-side__hide-rail min-w-0">
                  <p className="text-sm font-bold tracking-tight text-[var(--ink)] truncate">
                    {shortBrand}
                  </p>
                  <p className="text-[11px] text-[var(--muted)] truncate">{schoolSubtitle}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleRail}
                title={railCollapsed ? 'Perluas sidebar ([)' : 'Ciutkan sidebar ([)'}
                aria-label={railCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
                className="nim-side__collapse"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto space-y-1 pr-0.5" aria-label="Menu Modul">
              {Object.entries(groupedNav).map(([groupName, items]) => (
                <div key={groupName} className="space-y-1">
                  <p className="nim-side__group-label nim-side__hide-rail">{groupName}</p>
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.id === activeTab;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onTabChange?.(item.id)}
                        title={item.label}
                        aria-current={isActive ? 'page' : undefined}
                        className={`nim-side__nav-btn ${isActive ? 'is-active' : ''}`}
                      >
                        {Icon && <Icon className="h-4 w-4 shrink-0" />}
                        <span className="nim-side__hide-rail flex-1 truncate">{item.label}</span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span
                            className="nim-side__hide-rail rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                            style={{
                              background: isActive ? 'rgba(255,255,255,0.22)' : 'var(--card-3)',
                              color: isActive ? '#ffffff' : 'var(--ink-2)',
                            }}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            <div className="nim-side__foot">
              <div className="nim-side__me" title={`${user.name} — ${roleMeta?.label}`}>
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name}
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                    style={{ boxShadow: '0 0 0 1px var(--line-2)' }}
                  />
                ) : (
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                  >
                    <UserCheck className="h-4 w-4" />
                  </span>
                )}
                <div className="nim-side__hide-rail min-w-0 flex-1">
                  <p className="text-xs font-bold text-[var(--ink)] truncate">{user.name}</p>
                  <p className="text-[10.5px] text-[var(--muted)] truncate">{roleMeta?.label}</p>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Main Viewport Stage */}
        <div className={`nim-stage ${!user ? 'nim-stage--guest' : ''}`}>
          {/* Sticky Frosted Glass Topbar */}
          <header className="nim-top">
            <div className="nim-top__in nim-glass">
              {user && (
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  aria-label="Buka menu"
                  className="nim-ibtn nim-top__menu"
                >
                  <Menu className="h-4 w-4" />
                </button>
              )}

              {/* Brand (always shown on guest view, and on mobile <= 760px when logged in) */}
              <div
                className={`${user ? 'nim-top__brand hidden max-[760px]:flex' : 'flex'
                  } items-center gap-2.5 min-w-0`}
              >
                <img
                  src={schoolProfile.logo_data_url || '/logo.png'}
                  alt={`Logo ${shortBrand}`}
                  onError={(e) => {
                    e.currentTarget.src = '/logo.png';
                  }}
                  className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-xl object-contain p-0.5"
                  style={{
                    background: 'var(--card-3)',
                    boxShadow: 'inset 0 0 0 1px var(--glass-rim)',
                  }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold tracking-tight text-[var(--ink)] truncate">
                    {shortBrand}
                  </p>
                  {!user && (
                    <p className="text-[11px] text-[var(--muted)] truncate max-w-[200px] sm:max-w-xs">
                      {schoolSubtitle}
                    </p>
                  )}
                </div>
              </div>

              {/* Breadcrumbs (Desktop when logged in) */}
              {user && (
                <nav className="nim-crumbs" aria-label="Breadcrumb">
                  <span className="truncate">{shortBrand}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  <span className="truncate">{roleMeta?.label}</span>
                  {activeNav && (
                    <>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      <b className="truncate">{activeNav.label}</b>
                    </>
                  )}
                </nav>
              )}

              {/* Command Palette Search Pill (Desktop when logged in) */}
              {user && (
                <button
                  type="button"
                  onClick={() => setPaletteOpen(true)}
                  aria-label="Cari cepat"
                  aria-keyshortcuts="Meta+K"
                  className="nim-searchpill"
                >
                  <Search className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Cari menu, guru, atau perintah…</span>
                  <span className="nim-kbd">⌘K</span>
                </button>
              )}

              <div className="flex-1" />

              {/* Right Tools */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span
                  className="nim-livepill hidden sm:inline-flex"
                  title={liveMode ? 'Terhubung ke Google Apps Script' : 'Berjalan pada Mode Simulasi'}
                >
                  <i className={`nim-live-dot ${liveMode ? '' : 'nim-live-dot--sim'}`} />
                  <span>{liveMode ? 'Live' : 'Simulasi'}</span>
                </span>

                {!pwaState.isStandalone && (
                  <button
                    type="button"
                    onClick={handleInstallPwaClick}
                    title="Install Aplikasi SIPAYROLL"
                    className="nim-btn nim-btn--sm"
                    style={{
                      background: 'var(--good-soft)',
                      color: 'var(--good-text)',
                      boxShadow: 'inset 0 0 0 1px var(--good-line)',
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">Install</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleToggleTheme}
                  title={resolvedTheme === 'dark' ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}
                  aria-label={
                    resolvedTheme === 'dark' ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'
                  }
                  className="nim-ibtn"
                >
                  {resolvedTheme === 'dark' ? (
                    <Sun className="h-4 w-4 text-[var(--warn)]" />
                  ) : (
                    <Moon className="h-4 w-4 text-[var(--accent-text)]" />
                  )}
                </button>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setConfigOpen(true)}
                    title="Pengaturan Koneksi Server"
                    aria-label="Pengaturan Koneksi Server"
                    className="nim-ibtn"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                )}

                {user && (
                  <button
                    type="button"
                    onClick={onLogout}
                    aria-label="Keluar sesi"
                    className="nim-btn nim-btn--danger nim-btn--sm"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Keluar</span>
                  </button>
                )}
              </div>
            </div>
          </header>

          {/* Main Dashboard / Login Stage */}
          <div className="nim-main">{children}</div>
        </div>
      </div>

      {/* Mobile Glass Slide-Over Drawer (<= 760px) */}
      {user && mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 hidden max-[760px]:flex bg-black/55 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Menu Navigasi"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMobileMenuOpen(false);
          }}
        >
          <div className="nim-panel h-full w-[min(84vw,300px)] rounded-r-[24px] p-4 flex flex-col gap-3">
            <div
              className="flex items-center justify-between pb-3"
              style={{ borderBottom: '1px solid var(--line)' }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={schoolProfile.logo_data_url || '/logo.png'}
                  alt={shortBrand}
                  onError={(e) => {
                    e.currentTarget.src = '/logo.png';
                  }}
                  className="h-9 w-9 shrink-0 rounded-xl object-contain p-0.5"
                  style={{ background: 'var(--card-3)' }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--ink)] truncate">{shortBrand}</p>
                  <p className="text-[11px] text-[var(--muted)] truncate">{roleMeta?.label}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Tutup menu"
                className="nim-ibtn"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1">
              {Object.entries(groupedNav).map(([groupName, items]) => (
                <div key={groupName} className="space-y-1">
                  <p className="nim-side__group-label">{groupName}</p>
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.id === activeTab;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onTabChange?.(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`nim-side__nav-btn ${isActive ? 'is-active' : ''}`}
                      >
                        {Icon && <Icon className="h-4 w-4 shrink-0" />}
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="nim-badge">{item.badge}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="pt-3 space-y-2" style={{ borderTop: '1px solid var(--line)' }}>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setPaletteOpen(true);
                }}
                className="nim-btn w-full justify-start"
              >
                <Search className="h-4 w-4" />
                <span>Pencarian Cepat</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout?.();
                }}
                className="nim-btn nim-btn--danger w-full"
              >
                <LogOut className="h-4 w-4" />
                <span>Keluar Sesi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Command Palette */}
      {user && (
        <CommandPalette
          isOpen={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          navItems={navItems}
          quickItems={quickSearchItems}
          onNavigate={onTabChange}
          themePref={themePref}
          onThemeChange={applyTheme}
          onOpenSettings={isAdmin ? () => setConfigOpen(true) : undefined}
          onToggleRail={handleToggleRail}
          onLogout={onLogout}
        />
      )}

      {/* Server Config & PWA Guide Modals */}
      {isAdmin && (
        <ServerConfigModal
          isOpen={configOpen}
          onClose={() => setConfigOpen(false)}
          onDataRefresh={onDataRefresh}
        />
      )}
      <PwaGuideModal
        isOpen={pwaGuideOpen}
        onClose={() => setPwaGuideOpen(false)}
      />
    </>
  );
}

export default AppShell;
