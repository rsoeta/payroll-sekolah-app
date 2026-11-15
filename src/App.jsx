import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
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
import AdminDashboard from './pages/AdminDashboard';
import KepsekDashboard from './pages/KepsekDashboard';
import GuruDashboard from './pages/GuruDashboard';
import api, { getSavedSession, clearSession } from './services/gasApi';
import notify from './utils/notify';

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
    clearSession();
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
            id: 'teachers',
            label: 'Master Guru & Gaji',
            group: 'Data & Institusi',
            icon: Users,
            badge: navBadges.teachers,
            description: 'Kelola profil pendidik dan komponen gaji',
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
        ];
      case 'guru':
        return [
          {
            id: 'slips',
            label: 'Slip Gaji Digital',
            group: 'Portal Pendidik',
            icon: Wallet,
            badge: navBadges.slips,
            description: 'Riwayat slip gaji resmi & unduh PDF',
          },
          {
            id: 'profile',
            label: 'Profil Saya',
            group: 'Portal Pendidik',
            icon: ShieldCheck,
            description: 'Identitas pendidik dan ringkasan penghasilan',
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
          <AdminDashboard
            refreshTrigger={refreshCounter}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onBadgesChange={setNavBadges}
            onSearchItemsChange={setQuickSearchItems}
          />
        );
      case 'kepsek':
        return (
          <KepsekDashboard
            refreshTrigger={refreshCounter}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onBadgesChange={setNavBadges}
            onSearchItemsChange={setQuickSearchItems}
          />
        );
      case 'guru':
        return (
          <GuruDashboard
            user={user}
            refreshTrigger={refreshCounter}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onBadgesChange={setNavBadges}
            onSearchItemsChange={setQuickSearchItems}
          />
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
