import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { DashboardLayout } from './components/dashboard/DashboardLayout';
import { AppProvider, getAuthenticatedHomePath, useApp } from './context/AppContext';
import { AuthPage } from './pages/AuthPage';
import { CampaignsPage } from './pages/dashboard/CampaignsPage';
import { CustomersPage } from './pages/dashboard/CustomersPage';
import { OverviewPage } from './pages/dashboard/OverviewPage';
import { QrNfcPage } from './pages/dashboard/QrNfcPage';
import { SettingsPage } from './pages/dashboard/SettingsPage';
import { LandingPage } from './pages/LandingPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { SuperAdminPage } from './pages/SuperAdminPage';
import { TapViewPage } from './pages/TapViewPage';

const FullscreenSessionLoader: React.FC<{ label?: string }> = ({
  label = 'Verificando tu sesión...',
}) => (
  <div className="min-h-screen bg-[#090D16] text-white flex flex-col items-center justify-center gap-3">
    <Loader2 className="w-8 h-8 text-[#0EA5E9] animate-spin" />
    <span className="text-xs text-slate-400">{label}</span>
  </div>
);

const GuestOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, authLoading, tenantsLoaded, myTenants, isSuperAdmin } = useApp();

  if (authLoading || (user && !tenantsLoaded)) {
    return <FullscreenSessionLoader label="Cargando tu panel..." />;
  }

  if (user) {
    return <Navigate to={getAuthenticatedHomePath(isSuperAdmin, myTenants.length)} replace />;
  }

  return <>{children}</>;
};

const ProtectedDashboardRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, authLoading, tenantsLoaded, myTenants, isSuperAdmin } = useApp();

  if (authLoading || (user && !tenantsLoaded)) {
    return <FullscreenSessionLoader label="Cargando tu negocio..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (myTenants.length === 0) {
    return <Navigate to={isSuperAdmin ? '/admin' : '/onboarding'} replace />;
  }

  return <>{children}</>;
};

const FallbackRoute: React.FC = () => {
  const { user, authLoading, tenantsLoaded, myTenants, isSuperAdmin } = useApp();
  if (authLoading || (user && !tenantsLoaded)) {
    return <FullscreenSessionLoader />;
  }
  if (user) {
    return <Navigate to={getAuthenticatedHomePath(isSuperAdmin, myTenants.length)} replace />;
  }
  return <Navigate to="/" replace />;
};

export function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <GuestOnlyRoute>
                <LandingPage />
              </GuestOnlyRoute>
            }
          />
          <Route
            path="/login"
            element={
              <GuestOnlyRoute>
                <AuthPage mode="login" />
              </GuestOnlyRoute>
            }
          />
          <Route
            path="/registro"
            element={
              <GuestOnlyRoute>
                <Navigate to="/onboarding" replace />
              </GuestOnlyRoute>
            }
          />
          <Route path="/onboarding" element={<OnboardingPage />} />

          {/* Protected Business Dashboard */}
          <Route
            path="/dashboard"
            element={
              <ProtectedDashboardRoute>
                <DashboardLayout />
              </ProtectedDashboardRoute>
            }
          >
            <Route index element={<OverviewPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="campaigns" element={<CampaignsPage />} />
            <Route path="qr-nfc" element={<QrNfcPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Customer NFC / QR Tap-to-Earn View */}
          <Route path="/tap/:slug" element={<TapViewPage />} />

          {/* SuperAdmin BlockOps Executive Panel */}
          <Route path="/admin" element={<SuperAdminPage />} />

          <Route path="*" element={<FallbackRoute />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
