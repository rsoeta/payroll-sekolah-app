import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import GlobalToast from './components/GlobalToast';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import KepsekDashboard from './pages/KepsekDashboard';
import GuruDashboard from './pages/GuruDashboard';
import api, { getSavedSession, clearSession } from './services/gasApi';
import notify from './utils/notify';

export function App() {
  const [user, setUser] = useState(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    const existing = getSavedSession();
    if (existing && existing.user) {
      setUser(existing.user);
    }
  }, []);

  const handleLogout = async () => {
    try {
      await api.post('auth.logout');
    } catch {
      // Ignore network logout error and clear client session
    }
    clearSession();
    setUser(null);
    notify.info('Anda telah keluar dari sesi aplikasi.');
  };

  const triggerRefresh = () => {
    setRefreshCounter((c) => c + 1);
  };

  const renderRoleDashboard = () => {
    if (!user) {
      return <LoginPage onLoginSuccess={(loggedInUser) => setUser(loggedInUser)} />;
    }

    switch (user.role) {
      case 'admin':
        return <AdminDashboard refreshTrigger={refreshCounter} />;
      case 'kepsek':
        return <KepsekDashboard refreshTrigger={refreshCounter} />;
      case 'guru':
        return <GuruDashboard user={user} refreshTrigger={refreshCounter} />;
      default:
        return (
          <div className="app-shell py-12 text-center">
            <p className="text-base font-semibold text-rose-600">
              403 Forbidden: Role akun tidak dikenali.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <GlobalToast />
      <Navbar user={user} onLogout={handleLogout} onDataRefresh={triggerRefresh} />
      <div className="flex-1">{renderRoleDashboard()}</div>
    </div>
  );
}

export default App;
