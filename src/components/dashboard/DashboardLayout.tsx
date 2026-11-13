import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronDown,
  Clock,
  Crown,
  Headphones,
  Home,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  QrCode,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import {
  getTenantSubscriptionStatus,
  LOYALTY_PLANS_META,
  TenantNotification,
} from '../../types/loyalty';
import { showNativeNotification } from '../../utils/notifications';
import { BlockOpsLogo, PoweredByBlockOps } from '../brand/BlockOpsLogo';

export const DashboardLayout: React.FC = () => {
  const {
    user,
    isSuperAdmin,
    myTenants,
    activeTenant,
    setActiveTenantId,
    transactions,
    soundEnabled,
    setSoundEnabled,
    signOut,
  } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tenantMenuOpen, setTenantMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<TenantNotification[]>([]);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!activeTenant?.id) return;
    let isMounted = true;

    const loadNotifications = async () => {
      const { data } = await supabase
        .from('tenant_notifications')
        .select('*')
        .eq('tenant_id', activeTenant.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (isMounted && data) {
        setNotifications(data as TenantNotification[]);
      }
    };

    void loadNotifications();

    const channel = supabase
      .channel(`tenant-notifs-${activeTenant.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tenant_notifications',
          filter: `tenant_id=eq.${activeTenant.id}`,
        },
        (payload) => {
          if (!isMounted) return;
          const newNotif = payload.new as TenantNotification;
          setNotifications((prev) => [newNotif, ...prev]);
          void showNativeNotification({
            title: newNotif.title,
            body: newNotif.message,
            icon: activeTenant.logo_url,
            badge: activeTenant.logo_url,
            url: '/dashboard',
          });
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [activeTenant?.id, activeTenant?.logo_url]);

  if (!activeTenant) {
    return null;
  }

  const subStatus = getTenantSubscriptionStatus(activeTenant);
  const totalBaseDays = activeTenant.status === 'active' ? 30 : 14;
  const daysPct = Math.min(
    100,
    Math.max(4, Math.round((subStatus.daysRemaining / totalBaseDays) * 100))
  );

  const pendingCount = transactions.filter((t) => t.status === 'pending_approval').length;
  const unreadNotifsCount = notifications.filter((n) => !n.is_read).length;
  const totalAlertCount = unreadNotifsCount + pendingCount;

  const markAsRead = async (notifId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
    );
    await supabase.from('tenant_notifications').update({ is_read: true }).eq('id', notifId);
  };

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase
      .from('tenant_notifications')
      .update({ is_read: true })
      .eq('tenant_id', activeTenant.id)
      .eq('is_read', false);
  };

  const navItems = [
    { to: '/dashboard', label: 'Inicio', icon: Home, end: true },
    { to: '/dashboard/customers', label: 'Clientes', icon: Users },
    { to: '/dashboard/campaigns', label: 'Campañas', icon: Megaphone },
    { to: '/dashboard/qr-nfc', label: 'Póster Mostrador', icon: QrCode },
    { to: '/dashboard/settings', label: 'Configuración', icon: Settings },
  ];

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (err) {
      console.warn('Error al cerrar sesión:', err);
    } finally {
      window.location.href = '/login';
    }
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#090D16] via-[#0B1222] to-[#090D16] text-white px-4 py-6 select-none">
      <div className="px-2 mb-8 flex items-center justify-between">
        <Link to="/dashboard" className="focus:outline-none">
          <BlockOpsLogo size={40} showWordmark subtitle="Loyalty" theme="dark" />
        </Link>
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="space-y-1.5 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-[#0B4BE3] to-[#0EA5E9] text-white shadow-[0_8px_20px_-6px_rgba(11,75,227,0.65)]'
                    : 'text-slate-300/85 hover:text-white hover:bg-white/5'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="flex items-center gap-3">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </span>
                  {item.to === '/dashboard' && pendingCount > 0 ? (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FF7A00] text-white">
                      {pendingCount}
                    </span>
                  ) : isActive ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  ) : null}
                </>
              )}
            </NavLink>
          );
        })}

        {isSuperAdmin && (
          <div className="pt-4 mt-4 border-t border-white/10 space-y-1">
            <Link
              to="/admin"
              className="flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition"
            >
              <ShieldCheck className="w-4 h-4 text-[#FF7A00]" />
              <span>Panel SuperAdmin</span>
            </Link>
          </div>
        )}
      </nav>

      {/* Plan / Subscription Expiry Card */}
      <div
        className={`mt-4 rounded-2xl border p-4 shadow-inner ${
          subStatus.isBlocked
            ? 'bg-rose-950/40 border-rose-500/30'
            : 'bg-[#111827] border-white/10'
        }`}
      >
        <div className="flex items-center justify-between text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <Crown
              className={`w-4 h-4 ${subStatus.isBlocked ? 'text-rose-400' : 'text-[#F59E0B]'}`}
            />
            <span className={subStatus.isBlocked ? 'text-rose-300' : 'text-slate-300'}>
              {subStatus.isBlocked
                ? 'Servicio Deshabilitado'
                : activeTenant.status === 'active'
                ? 'Plan Mensual Pro'
                : 'Prueba 14 Días'}
            </span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              subStatus.isBlocked
                ? 'bg-rose-500/20 text-rose-300'
                : 'bg-white/10 text-slate-300'
            }`}
          >
            {subStatus.isBlocked ? 'Vencido' : `${subStatus.daysRemaining}d`}
          </span>
        </div>
        <div className="mt-1.5 font-display text-base font-extrabold text-white">
          {subStatus.isBlocked
            ? 'Renovación Requerida'
            : activeTenant.status === 'active'
            ? 'BlockOps Loyalty Activo'
            : 'Período de Prueba'}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          {subStatus.isBlocked
            ? subStatus.blockReason
            : subStatus.daysRemaining > 0
            ? `Quedan ${subStatus.daysRemaining} días de uso`
            : 'Tu período ha finalizado hoy'}
        </div>
        <div className="mt-2.5 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              subStatus.isBlocked
                ? 'bg-rose-500'
                : 'bg-gradient-to-r from-[#FF7A00] to-[#F59E0B]'
            }`}
            style={{ width: `${daysPct}%` }}
          />
        </div>
      </div>

      {/* Support & Logout */}
      <div className="mt-3 rounded-xl bg-white/[0.04] border border-white/5 px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
            <Headphones className="w-4 h-4 text-[#0EA5E9]" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white truncate">{user?.email}</div>
            <div className="text-[10px] text-slate-400">Sesión activa</div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          title="Cerrar sesión"
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/10 transition"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-4 pt-3 border-t border-white/10 px-1">
        <PoweredByBlockOps dark />
      </div>
    </div>
  );

  const planMeta = activeTenant.program
    ? LOYALTY_PLANS_META[activeTenant.program.type]
    : LOYALTY_PLANS_META.stamps;

  return (
    <div className="min-h-screen flex bg-isometric-light text-slate-900">
      <aside className="hidden lg:block w-[260px] shrink-0 sticky top-0 h-screen z-30">
        <SidebarContent />
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-[270px] h-full z-10 shadow-2xl">
            <SidebarContent />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Banner de alerta de cuenta deshabilitada por suscripción / prueba vencida */}
        {subStatus.isBlocked && (
          <div className="bg-gradient-to-r from-rose-600 via-rose-700 to-rose-600 text-white px-4 sm:px-7 py-2.5 text-xs font-bold flex flex-wrap items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-300" />
              <span>
                Atención: Tu cuenta se encuentra temporalmente deshabilitada ({subStatus.blockReason}).
                El escaneo por QR y el canje de premios en mostrador están bloqueados. Contacta a administración para reactivar.
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-[10px] font-extrabold uppercase tracking-wide">
              Bloqueo por Vencimiento
            </span>
          </div>
        )}

        <header className="sticky top-0 z-20 bg-[#F8FAFC]/85 backdrop-blur-md border-b border-slate-200/70 px-4 sm:px-7 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl bg-white border border-slate-200 text-slate-700 shadow-sm"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div>
                <h1 className="font-display text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  👋 ¡Hola, {activeTenant.name}!
                </h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  Resumen en tiempo real de tu programa de fidelización
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {myTenants.length > 1 ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setTenantMenuOpen(!tenantMenuOpen)}
                    className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200/90 px-3 py-2 text-xs sm:text-sm font-semibold text-slate-800 shadow-sm hover:border-[#0B4BE3]/40 transition"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: activeTenant.brand_color }}
                    />
                    <span className="max-w-[160px] truncate">{activeTenant.name}</span>
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  </button>

                  {tenantMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setTenantMenuOpen(false)} />
                      <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-slate-200 shadow-xl p-2 z-30">
                        {myTenants.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setActiveTenantId(t.id);
                              setTenantMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-xs ${
                              t.id === activeTenant.id
                                ? 'bg-[#0B4BE3]/10 text-[#0B4BE3] font-bold'
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: t.brand_color }}
                            />
                            <span className="truncate">{t.name}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200/90 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: activeTenant.brand_color }}
                  />
                  <span>{planMeta.name}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                title={soundEnabled ? 'Silenciar timbre' : 'Activar timbre'}
                className="p-2 rounded-xl bg-white border border-slate-200/90 text-slate-600 hover:text-[#0B4BE3] shadow-sm transition"
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              {/* Botón de Notificaciones Interactivo con Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                  title="Ver notificaciones y avisos"
                  className="flex items-center justify-center h-9 w-9 rounded-xl bg-white border border-slate-200/90 text-slate-600 hover:text-[#0B4BE3] hover:border-[#0B4BE3]/40 relative shadow-sm transition"
                >
                  <Bell className="w-4 h-4" />
                  {totalAlertCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[#FF7A00] text-[10px] font-extrabold text-white flex items-center justify-center shadow-sm">
                      {totalAlertCount}
                    </span>
                  )}
                </button>

                {notifDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setNotifDropdownOpen(false)} />
                    <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-slate-200 shadow-2xl p-4 z-40 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-lg bg-[#0B4BE3]/10 text-[#0B4BE3] flex items-center justify-center">
                            <Bell className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-extrabold text-slate-900">
                              Centro de Notificaciones
                            </h4>
                            <p className="text-[10px] text-slate-400">
                              Avisos de administración y mostrador
                            </p>
                          </div>
                        </div>
                        {unreadNotifsCount > 0 && (
                          <button
                            type="button"
                            onClick={markAllAsRead}
                            className="text-[11px] font-semibold text-[#0B4BE3] hover:underline"
                          >
                            Leídas todas
                          </button>
                        )}
                      </div>

                      {pendingCount > 0 && (
                        <Link
                          to="/dashboard"
                          onClick={() => setNotifDropdownOpen(false)}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900 hover:bg-amber-100 transition"
                        >
                          <span className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-[#FF7A00]" />
                            <span>{pendingCount} cliente(s) esperando aprobación</span>
                          </span>
                          <span className="text-[10px] bg-[#FF7A00] text-white px-2 py-0.5 rounded-full">
                            Ver
                          </span>
                        </Link>
                      )}

                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {notifications.length === 0 ? (
                          <div className="text-center py-6 text-slate-400 text-xs">
                            <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                            <span>No tienes avisos de administración</span>
                          </div>
                        ) : (
                          notifications.map((n) => (
                            <div
                              key={n.id}
                              className={`p-3 rounded-xl border transition text-xs space-y-1 ${
                                n.is_read
                                  ? 'bg-slate-50/70 border-slate-200/60 text-slate-600'
                                  : 'bg-blue-50/60 border-blue-200 text-slate-900 shadow-sm'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <strong className="font-bold flex items-center gap-1.5">
                                  {!n.is_read && (
                                    <span className="h-2 w-2 rounded-full bg-[#0B4BE3]" />
                                  )}
                                  <span>{n.title}</span>
                                </strong>
                                <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                                  {new Date(n.created_at).toLocaleDateString([], {
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-600 leading-snug">{n.message}</p>
                              {!n.is_read && (
                                <div className="pt-1 text-right">
                                  <button
                                    type="button"
                                    onClick={() => markAsRead(n.id)}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-[#0B4BE3] hover:underline"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Marcar leída</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-7">
          <Outlet />
        </main>

        <footer className="border-t border-slate-200/80 bg-white/80 backdrop-blur-sm px-4 sm:px-7 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              BlockOps Loyalty Operativo
            </span>
            <span className="hidden sm:inline text-slate-300">|</span>
            <span className="hidden sm:inline">
              Motor activo: <strong className="text-slate-700">{planMeta.name}</strong>
            </span>
          </div>
          <PoweredByBlockOps />
        </footer>
      </div>
    </div>
  );
};
