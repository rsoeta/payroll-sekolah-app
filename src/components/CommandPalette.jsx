import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  X,
  ArrowRight,
  Clock,
  Sun,
  Moon,
  Monitor,
  Settings,
  LogOut,
  PanelLeft,
  Keyboard,
} from 'lucide-react';

/**
 * Nimbra-style Frosted Glass Command Palette (`⌘K` / `/`).
 * Searches role navigation tabs, contextual items, and workspace actions.
 */
export function CommandPalette({
  isOpen,
  onClose,
  navItems = [],
  quickItems = [],
  onNavigate,
  themePref,
  onThemeChange,
  onOpenSettings,
  onToggleRail,
  onLogout,
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [];

    navItems.forEach((item) => {
      if (!q || item.label.toLowerCase().includes(q) || (item.group || '').toLowerCase().includes(q)) {
        list.push({
          id: `nav:${item.id}`,
          group: item.group || 'Navigasi',
          title: item.label,
          sub: item.description || 'Buka modul halaman',
          icon: item.icon,
          run: () => {
            onNavigate?.(item.id);
            onClose();
          },
        });
      }
    });

    if (q) {
      quickItems.forEach((item) => {
        if (
          item.title.toLowerCase().includes(q) ||
          (item.sub || '').toLowerCase().includes(q)
        ) {
          list.push({
            ...item,
            run: () => {
              item.run?.();
              onClose();
            },
          });
        }
      });
    }

    const actions = [
      {
        id: 'act:theme-auto',
        group: 'Tampilan & Aksi',
        title: 'Tema Otomatis Sesuai Waktu (Default)',
        sub:
          themePref === 'auto'
            ? 'Sedang aktif (Terang 06:00–17:59 • Gelap 18:00–05:59)'
            : 'Terang di siang hari • Gelap di malam hari',
        icon: Clock,
        run: () => {
          onThemeChange?.('auto');
          onClose();
        },
      },
      {
        id: 'act:theme-dark',
        group: 'Tampilan & Aksi',
        title: 'Aktifkan Mode Gelap (Dark Glass)',
        sub: themePref === 'dark' ? 'Sedang aktif' : 'Tema navy frosted glass',
        icon: Moon,
        run: () => {
          onThemeChange?.('dark');
          onClose();
        },
      },
      {
        id: 'act:theme-light',
        group: 'Tampilan & Aksi',
        title: 'Aktifkan Mode Terang (Light Glass)',
        sub: themePref === 'light' ? 'Sedang aktif' : 'Tema ice frosted glass',
        icon: Sun,
        run: () => {
          onThemeChange?.('light');
          onClose();
        },
      },
      {
        id: 'act:theme-system',
        group: 'Tampilan & Aksi',
        title: 'Ikuti Tema Sistem Perangkat',
        sub: themePref === 'system' ? 'Sedang aktif' : 'Otomatis sesuai OS',
        icon: Monitor,
        run: () => {
          onThemeChange?.('system');
          onClose();
        },
      },
      {
        id: 'act:rail',
        group: 'Tampilan & Aksi',
        title: 'Ubah Ukuran Sidebar (Rail)',
        sub: 'Pintasan keyboard: [',
        icon: PanelLeft,
        run: () => {
          onToggleRail?.();
          onClose();
        },
      },
      ...(typeof onOpenSettings === 'function'
        ? [
            {
              id: 'act:settings',
              group: 'Tampilan & Aksi',
              title: 'Pengaturan Koneksi Server',
              sub: 'Konfigurasi URL GAS atau reset simulasi',
              icon: Settings,
              run: () => {
                onClose();
                onOpenSettings();
              },
            },
          ]
        : []),
      {
        id: 'act:logout',
        group: 'Tampilan & Aksi',
        title: 'Keluar dari Sesi',
        sub: 'Akhiri sesi akun aktif',
        icon: LogOut,
        run: () => {
          onClose();
          onLogout?.();
        },
      },
    ];

    actions.forEach((act) => {
      if (!q || act.title.toLowerCase().includes(q) || act.sub.toLowerCase().includes(q)) {
        list.push(act);
      }
    });

    return list.slice(0, 12);
  }, [
    query,
    navItems,
    quickItems,
    themePref,
    onNavigate,
    onClose,
    onThemeChange,
    onToggleRail,
    onOpenSettings,
    onLogout,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (results.length ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (results.length ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter' && results[activeIndex]) {
      e.preventDefault();
      results[activeIndex].run();
    }
  };

  let lastGroup = '';

  return (
    <div
      className="nim-backdrop items-start pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Pencarian Cepat & Perintah"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="nim-panel w-full max-w-xl rounded-[22px] overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari menu, guru, periode gaji, atau perintah..."
            className="w-full bg-transparent text-sm font-medium text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none min-h-[34px]"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pencarian"
            className="nim-ibtn"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2.5 space-y-1">
          {results.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--muted)]">
              Tidak ditemukan hasil untuk &ldquo;{query}&rdquo;
            </div>
          ) : (
            results.map((item, idx) => {
              const Icon = item.icon || Keyboard;
              const showGroup = item.group && item.group !== lastGroup;
              lastGroup = item.group || '';
              const isSelected = idx === activeIndex;

              return (
                <React.Fragment key={item.id}>
                  {showGroup && (
                    <div className="px-2.5 pt-2 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      {item.group}
                    </div>
                  )}
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={item.run}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors"
                    style={{
                      background: isSelected ? 'var(--accent-soft)' : 'transparent',
                      boxShadow: isSelected ? 'inset 0 0 0 1px var(--accent-glow)' : 'none',
                    }}
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        background: isSelected ? 'var(--accent)' : 'var(--card-3)',
                        color: isSelected ? 'var(--accent-ink)' : 'var(--ink-2)',
                      }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-semibold text-[var(--ink)] truncate">
                        {item.title}
                      </p>
                      {item.sub && (
                        <p className="text-[11px] text-[var(--muted)] truncate">{item.sub}</p>
                      )}
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>

        <div
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[11px] text-[var(--muted)]"
          style={{
            borderTop: '1px solid var(--line)',
            background: 'var(--card-2)',
          }}
        >
          <div className="flex items-center gap-3">
            <span>
              <kbd className="nim-kbd mr-1">↑↓</kbd>Pilih
            </span>
            <span>
              <kbd className="nim-kbd mr-1">↵</kbd>Buka
            </span>
            <span>
              <kbd className="nim-kbd mr-1">Esc</kbd>Tutup
            </span>
          </div>
          <span>
            Pintasan: <kbd className="nim-kbd">⌘K</kbd> / <kbd className="nim-kbd">[</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
