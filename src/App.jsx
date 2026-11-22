import React, { Suspense, useState, useEffect, useMemo, useCallback } from 'react';
import {
  Banknote,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import AppShell from './components/AppShell';
import GlobalToast from './components/GlobalToast';
import LoginPage from './pages/LoginPage';
import api, { getSavedSession, clearSession } from './services/gasApi';
import { resetRealtimeSyncState } from './services/realtimeSync';
import { disableGoogleAutoSelect } from './utils/googleOAuth';
import notify from './utils/notify';

const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const KepsekDashboard = React.lazy(() => import('./pages/KepsekDashboard'));
const GuruDashboard = React.lazy(() => import('./pages/GuruDashboard'));

function DashboardLoadingFallback() {
  return (
    <div className="nim-glass nim-card my-8 p-8 text-center space-y-2">
      <div className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--accent-text)] border-t-transparent animate-spin" />
      <p className="text-xs sm:text-sm font-semibold text-[var(--ink-2)]">
        Memuat modul dasbor...
      </p>
    </div>
  );
}

const DEFAULT_TAB_BY_ROLE = {
  admin: 'payroll',
  kepsek: 'all',
  guru: 'slips',
};

export function App() {
  const [user, setUser] = useState(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [activeTab, setActiveTab] = useState('payroll');
  const [navBadges, setNavBadges] = useState({});
  const [quickSearchItems, setQuickSearchItems] = useState([]);

  useEffect(() => {
    const existing = getSavedSession();
    if (existing && existing.user) {
      setUser(existing.user);
      setActiveTab(DEFAULT_TAB_BY_ROLE[existing.user.role] || 'payroll');
    }
  }, []);

  const handleLoginSuccess = useCallback((loggedInUser) => {
    setUser(loggedInUser);
    setActiveTab(DEFAULT_TAB_BY_ROLE[loggedInUser?.role] || 'payroll');
    setNavBadges({});
    setQuickSearchItems([]);
  }, []);

  const handleLogout = async () => {
    try {
      await api.post('auth.logout');
    } catch {
      // Ignore network logout error and clear client session
    }
    disableGoogleAutoSelect();
    clearSession();
    resetRealtimeSyncState();
    setUser(null);
    setNavBadges({});
    setQuickSearchItems([]);
    notify.info('Anda telah keluar dari sesi aplikasi.');
  };

  const triggerRefresh = () => {
    setRefreshCounter((c) => c + 1);
  };

  const navItems = useMemo(() => {
    if (!user) return [];
    switch (user.role) {
      case 'admin':
        return [
          {
            id: 'payroll',
            label: 'Alur Penggajian',
            group: 'Penggajian',
            icon: Wallet,
            badge: navBadges.payroll,
            description: 'Kalkulasi draf, pengajuan, dan pencairan gaji',
          },
          {
            id: 'attendance',
            label: 'Kehadiran & JTM',
            group: 'Penggajian',
            icon: CalendarCheck,
            description: 'Catat hari hadir, alpa, dan jam tatap muka',
          },
          {
            id: 'disbursements',
            label: 'Pencairan PTK',
            group: 'Penggajian',
            icon: Banknote,
            badge: navBadges.disbursements,
            description: 'Review pengajuan pencairan sebagian/penuh PTK',
          },
          {
            id: 'teachers',
            label: 'Master PTK & Gaji',
            group: 'Data & Institusi',
            icon: Users,
            badge: navBadges.teachers,
            description: 'Kelola Pendidik, Tenaga Kependidikan & komponen gaji',
          },
          {
            id: 'school_profile',
            label: 'Profil Sekolah',
            group: 'Data & Institusi',
            icon: Building2,
            description: 'Identitas yayasan, logo, dan pejabat penandatangan',
          },
        ];
      case 'kepsek':
        return [
          {
            id: 'all',
            label: 'Semua Periode',
            group: 'Otorisasi Kepsek',
            icon: Wallet,
            description: 'Tinjau seluruh riwayat anggaran penggajian',
          },
          {
            id: 'submitted',
            label: 'Perlu Otorisasi',
            group: 'Otorisasi Kepsek',
            icon: Clock,
            badge: navBadges.submitted,
            description: 'Pengajuan gaji menunggu persetujuan',
          },
          {
            id: 'approved',
            label: 'Telah Disetujui',
            group: 'Otorisasi Kepsek',
            icon: CheckCircle2,
            description: 'Periode gaji yang sudah disetujui & cair',
          },
          {
            id: 'disbursements',
            label: 'Pencairan PTK',
            group: 'Otorisasi Kepsek',
            icon: Banknote,
            badge: navBadges.disbursements,
            description: 'Otorisasi pengajuan pencairan PTK & terbitkan slip',
          },
        ];
      case 'guru':
        return [
          {
            id: 'slips',
            label: 'Slip Gaji Digital',
            group: 'Portal PTK',
            icon: Wallet,
            badge: navBadges.slips,
            description: 'Riwayat slip gaji resmi & unduh PDF',
          },
          {
            id: 'attendance',
            label: 'Kehadiran & JTM',
            group: 'Portal PTK',
            icon: CalendarCheck,
            badge: navBadges.attendance,
            description: 'Catat hadir, tugas, sakit/izin & JTM mandiri',
          },
          {
            id: 'disbursements',
            label: 'Ajukan Pencairan',
            group: 'Portal PTK',
            icon: Banknote,
            badge: navBadges.disbursements,
            description: 'Ajukan pencairan sebagian/seluruh estimasi gaji',
          },
          {
            id: 'profile',
            label: 'Profil Saya',
            group: 'Portal PTK',
            icon: ShieldCheck,
            description: 'Identitas Pendidik / Tenaga Kependidikan & penghasilan',
          },
        ];
      default:
        return [];
    }
  }, [user, navBadges]);

  const renderRoleDashboard = () => {
    if (!user) {
      return <LoginPage onLoginSuccess={handleLoginSuccess} />;
    }

    switch (user.role) {
      case 'admin':
        return (
          <Suspense fallback={<DashboardLoadingFallback />}>
            <AdminDashboard
              refreshTrigger={refreshCounter}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onBadgesChange={setNavBadges}
              onSearchItemsChange={setQuickSearchItems}
            />
          </Suspense>
        );
      case 'kepsek':
        return (
          <Suspense fallback={<DashboardLoadingFallback />}>
            <KepsekDashboard
              refreshTrigger={refreshCounter}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onBadgesChange={setNavBadges}
              onSearchItemsChange={setQuickSearchItems}
            />
          </Suspense>
        );
      case 'guru':
        return (
          <Suspense fallback={<DashboardLoadingFallback />}>
            <GuruDashboard
              user={user}
              refreshTrigger={refreshCounter}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onBadgesChange={setNavBadges}
              onSearchItemsChange={setQuickSearchItems}
            />
          </Suspense>
        );
      default:
        return (
          <div className="nim-glass nim-card my-10 text-center">
            <p className="text-base font-bold text-[var(--bad-text)]">
              403 Forbidden: Role akun tidak dikenali.
            </p>
          </div>
        );
    }
  };

  return (
    <>
      <GlobalToast />
      <AppShell
        user={user}
        navItems={navItems}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        quickSearchItems={quickSearchItems}
        onLogout={handleLogout}
        onDataRefresh={triggerRefresh}
      >
        {renderRoleDashboard()}
      </AppShell>
    </>
  );
}

export default App;
