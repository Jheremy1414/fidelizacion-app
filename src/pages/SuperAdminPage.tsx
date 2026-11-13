import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Banknote,
  Bell,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  DollarSign,
  ExternalLink,
  ImagePlus,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Nfc,
  PauseCircle,
  PlayCircle,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Store,
  Users,
  X,
} from 'lucide-react';
import { BlockOpsLogo, PoweredByBlockOps } from '../components/brand/BlockOpsLogo';
import { BoliviaLocationPicker } from '../components/map/BoliviaLocationPicker';
import { useApp } from '../context/AppContext';
import {
  createEphemeralSupabaseClient,
  getAppBaseUrl,
  getPublicTapUrl,
  isSupabaseConfigured,
  supabase,
  uploadTenantLogo,
} from '../lib/supabase';
import {
  getTenantSubscriptionStatus,
  LOYALTY_PLANS_META,
  LoyaltyProgram,
  ProgramType,
  TenantNotification,
  TenantPayment,
  TenantStatus,
  TenantWithProgram,
} from '../types/loyalty';
import { formatBs } from '../utils/bolivia';

interface TenantAdminRow extends TenantWithProgram {
  cardsCount: number;
}

interface ProvisionedCredentials {
  tenantName: string;
  slug: string;
  email: string;
  password: string;
  warning?: string;
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `BlockOps-${suffix}`;
}

async function provisionOwnerForTenant(
  tenantId: string,
  ownerEmail: string,
  ownerPassword: string
): Promise<{ warning?: string }> {
  const cleanEmail = ownerEmail.trim().toLowerCase();
  if (!cleanEmail) return {};

  // 1. Intentar vía Edge Function (crea cuenta pre-confirmada y asigna dueño en 1 paso)
  const { data, error } = await supabase.functions.invoke('wallet-pass', {
    body: {
      action: 'create_cold_owner',
      email: cleanEmail,
      password: ownerPassword || undefined,
      tenantId,
    },
  });

  if (!error && data?.userId) {
    return {};
  }

  // 2. Respaldo cliente efímero (no cierra sesión del SuperAdmin) + guardar owner_email para auto-vínculo
  let linkedUserId: string | null = null;
  let warning: string | undefined =
    'Negocio vinculado por correo (claim_tenants_by_email). Despliega wallet-pass si deseas confirmar usuarios automáticamente sin correo.';

  if (ownerPassword.length >= 6) {
    const tempClient = createEphemeralSupabaseClient();
    const { data: signData, error: signErr } = await tempClient.auth.signUp({
      email: cleanEmail,
      password: ownerPassword,
    });
    if (!signErr && signData.user?.id) {
      linkedUserId = signData.user.id;
      if (!signData.session) {
        warning =
          'Usuario creado; si Supabase exige confirmación por email, el cliente deberá confirmar su correo y luego entrará directo a su Dashboard.';
      } else {
        warning = undefined;
      }
    } else if (signErr) {
      warning = `Aviso Auth: ${signErr.message}. El comercio quedó reservado para ${cleanEmail}.`;
    }
  }

  const updatePatch: Record<string, unknown> = { owner_email: cleanEmail };
  if (linkedUserId) updatePatch.owner_user_id = linkedUserId;

  const { error: updErr } = await supabase.from('tenants').update(updatePatch).eq('id', tenantId);
  if (updErr && /owner_email/i.test(updErr.message) && linkedUserId) {
    await supabase.from('tenants').update({ owner_user_id: linkedUserId }).eq('id', tenantId);
  }

  return { warning };
}

export const SuperAdminPage: React.FC = () => {
  const { user, authLoading, tenantsLoaded, myTenants, isSuperAdmin, signOut } = useApp();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (err) {
      console.warn('Error al cerrar sesión:', err);
    } finally {
      window.location.href = '/login';
    }
  };

  const [tenants, setTenants] = useState<TenantAdminRow[]>([]);
  const [totalCards, setTotalCards] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TenantStatus>('all');
  const [activeAdminTab, setActiveAdminTab] = useState<'tenants' | 'accounting'>('tenants');

  // Accounting state
  const [payments, setPayments] = useState<TenantPayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  // Modal: Activar suscripción mensual con cobro manual
  const [paymentTarget, setPaymentTarget] = useState<TenantAdminRow | null>(null);
  const [payAmount, setPayAmount] = useState<number>(250);
  const [payPeriodDays, setPayPeriodDays] = useState<number>(30);
  const [payMethod, setPayMethod] = useState<string>('QR Simple');
  const [payNotes, setPayNotes] = useState<string>('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Modal: Enviar notificación independiente a un negocio
  const [notifyTarget, setNotifyTarget] = useState<TenantAdminRow | null>(null);
  const [notifyTitle, setNotifyTitle] = useState<string>('Aviso de Administración');
  const [notifyMessage, setNotifyMessage] = useState<string>('');
  const [sendingNotice, setSendingNotice] = useState(false);
  const [noticeSent, setNoticeSent] = useState(false);
  const [noticeError, setNoticeError] = useState<string | null>(null);

  // Modal: Crear nueva sucursal o tarjeta para empresa existente
  const [branchParent, setBranchParent] = useState<TenantAdminRow | null>(null);
  const [branchName, setBranchName] = useState<string>('');
  const [branchSlug, setBranchSlug] = useState<string>('');
  const [branchType, setBranchType] = useState<ProgramType>('stamps');
  const [branchColor, setBranchColor] = useState<string>('#0B4BE3');
  const [branchLat, setBranchLat] = useState<number | null>(null);
  const [branchLng, setBranchLng] = useState<number | null>(null);
  const [branchCreating, setBranchCreating] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);

  const [showColdModal, setShowColdModal] = useState(false);

  const [coldName, setColdName] = useState('');
  const [coldSlug, setColdSlug] = useState('');
  const [coldType, setColdType] = useState<ProgramType>('stamps');
  const [coldColor, setColdColor] = useState('#0B4BE3');
  const [coldLogoFile, setColdLogoFile] = useState<File | null>(null);
  const [coldLogoPreview, setColdLogoPreview] = useState<string | null>(null);
  const [coldOwnerEmail, setColdOwnerEmail] = useState('');
  const [coldOwnerPassword, setColdOwnerPassword] = useState('');
  const [coldLat, setColdLat] = useState<number | null>(null);
  const [coldLng, setColdLng] = useState<number | null>(null);
  const [coldError, setColdError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [provisionedCreds, setProvisionedCreds] = useState<ProvisionedCredentials | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // NFC setup modal for SuperAdmin
  const [nfcTarget, setNfcTarget] = useState<TenantAdminRow | null>(null);
  const [nfcCopied, setNfcCopied] = useState(false);
  const [nfcWriting, setNfcWriting] = useState(false);
  const [nfcStatusMsg, setNfcStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Assign / Update Owner modal on existing businesses
  const [assignTarget, setAssignTarget] = useState<TenantAdminRow | null>(null);
  const [assignEmail, setAssignEmail] = useState('');
  const [assignPassword, setAssignPassword] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const fetchAdminData = useCallback(async () => {
    if (!isSupabaseConfigured || !isSuperAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const [tRes, cRes] = await Promise.all([
      supabase
        .from('tenants')
        .select('*, loyalty_programs(*)')
        .order('created_at', { ascending: false }),
      supabase.from('wallet_cards').select('id, tenant_id'),
    ]);

    const cardCountMap = new Map<string, number>();
    if (cRes.data) {
      setTotalCards(cRes.data.length);
      cRes.data.forEach((row) => {
        cardCountMap.set(row.tenant_id, (cardCountMap.get(row.tenant_id) || 0) + 1);
      });
    }

    if (tRes.data) {
      const normalized: TenantAdminRow[] = tRes.data.map((row) => {
        const progs = (
          row as unknown as { loyalty_programs: LoyaltyProgram[] | LoyaltyProgram }
        ).loyalty_programs;
        const program = Array.isArray(progs) ? progs[0] || null : progs || null;
        return {
          ...row,
          lat: row.lat !== null ? Number(row.lat) : null,
          lng: row.lng !== null ? Number(row.lng) : null,
          program,
          cardsCount: cardCountMap.get(row.id) || 0,
        };
      });
      setTenants(normalized);
    }

    setLoading(false);
  }, [isSuperAdmin]);

  const fetchPayments = useCallback(async () => {
    if (!isSupabaseConfigured || !isSuperAdmin) return;
    setLoadingPayments(true);
    try {
      const { data, error } = await supabase
        .from('tenant_payments')
        .select('*, tenant:tenants(name, slug)')
        .order('paid_at', { ascending: false });

      if (data && !error) {
        const normalized: TenantPayment[] = data.map((row: any) => ({
          id: row.id,
          tenant_id: row.tenant_id,
          amount: Number(row.amount),
          currency: row.currency || 'BOB',
          period_days: row.period_days || 30,
          payment_method: row.payment_method || 'QR Simple',
          notes: row.notes,
          paid_at: row.paid_at,
          created_at: row.created_at,
          tenant_name: row.tenant?.name || 'Comercio',
          tenant_slug: row.tenant?.slug || '',
        }));
        setPayments(normalized);
      }
    } catch {
      // Si la tabla tenant_payments aún no se migró, mantener vacío
    } finally {
      setLoadingPayments(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    fetchAdminData();
    fetchPayments();
  }, [fetchAdminData, fetchPayments]);

  const handleConfirmPaymentAndActivation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentTarget) return;
    setPayError(null);
    setPaying(true);

    try {
      const currentExpiry = new Date(paymentTarget.trial_ends_at).getTime();
      const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
      const newExpiry = new Date(baseTime + payPeriodDays * 86400000).toISOString();

      const { error: tErr } = await supabase
        .from('tenants')
        .update({
          status: 'active',
          trial_ends_at: newExpiry,
        })
        .eq('id', paymentTarget.id);

      if (tErr) throw new Error(tErr.message);

      await supabase.from('tenant_payments').insert({
        tenant_id: paymentTarget.id,
        amount: Number(payAmount),
        currency: 'BOB',
        period_days: payPeriodDays,
        payment_method: payMethod,
        notes: payNotes.trim() || null,
        paid_at: new Date().toISOString(),
      });

      await fetchAdminData();
      await fetchPayments();
      setPaymentTarget(null);
      setPayNotes('');
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Error al registrar cobro y activar mes');
    } finally {
      setPaying(false);
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyTarget || !notifyTitle.trim() || !notifyMessage.trim()) return;
    setNoticeError(null);
    setSendingNotice(true);
    try {
      const { error } = await supabase.from('tenant_notifications').insert({
        tenant_id: notifyTarget.id,
        title: notifyTitle.trim(),
        message: notifyMessage.trim(),
        is_read: false,
      });
      if (error) throw new Error(error.message);
      setNoticeSent(true);
      setTimeout(() => {
        setNoticeSent(false);
        setNotifyTarget(null);
        setNotifyTitle('Aviso de Administración');
        setNotifyMessage('');
      }, 1200);
    } catch (err) {
      setNoticeError(err instanceof Error ? err.message : 'No se pudo enviar la notificación');
    } finally {
      setSendingNotice(false);
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchParent || !branchName.trim() || !branchSlug.trim()) return;
    setBranchError(null);

    if (branchLat === null || branchLng === null) {
      setBranchError('Debes fijar la ubicación GPS de la sucursal en el mapa.');
      return;
    }

    setBranchCreating(true);
    try {
      const cleanSlug = branchSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      const meta = LOYALTY_PLANS_META[branchType];

      const { data: newTenant, error: tErr } = await supabase
        .from('tenants')
        .insert({
          owner_user_id: branchParent.owner_user_id,
          owner_email: branchParent.owner_email,
          name: branchName.trim(),
          slug: cleanSlug,
          brand_color: branchColor || branchParent.brand_color,
          logo_url: branchParent.logo_url,
          lat: Number(branchLat),
          lng: Number(branchLng),
          status: branchParent.status,
          trial_ends_at: branchParent.trial_ends_at,
        })
        .select()
        .single();

      if (tErr || !newTenant) throw new Error(tErr?.message || 'Error al crear la sucursal');

      const { error: pErr } = await supabase.from('loyalty_programs').insert({
        tenant_id: newTenant.id,
        type: branchType,
        name: meta.name,
        rules: meta.defaultRules,
        is_active: true,
      });

      if (pErr) throw new Error(pErr.message);

      await fetchAdminData();
      setBranchParent(null);
      setBranchName('');
      setBranchSlug('');
      setBranchLat(null);
      setBranchLng(null);
    } catch (err) {
      setBranchError(err instanceof Error ? err.message : 'No se pudo crear la sucursal');
    } finally {
      setBranchCreating(false);
    }
  };

  const filteredTenants = useMemo(() => {
    return tenants
      .filter((t) => (statusFilter === 'all' ? true : t.status === statusFilter))
      .filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.slug.toLowerCase().includes(search.toLowerCase())
      );
  }, [tenants, statusFilter, search]);

  const activePaidCount = tenants.filter((t) => t.status === 'active').length;
  const trialCount = tenants.filter((t) => t.status === 'trial').length;
  const estimatedMrr = activePaidCount * 340;

  const totalCollected = useMemo(() => {
    return payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  }, [payments]);

  const thisMonthCollected = useMemo(() => {
    const nowMonth = new Date().getMonth();
    const nowYear = new Date().getFullYear();
    return payments
      .filter((p) => {
        const d = new Date(p.paid_at || p.created_at);
        return d.getMonth() === nowMonth && d.getFullYear() === nowYear;
      })
      .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  }, [payments]);

  if (authLoading || (user && !tenantsLoaded)) {
    return (
      <div className="min-h-screen bg-[#090D16] text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#0EA5E9] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-[#090D16] bg-isometric-dark text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md glass-card-dark rounded-3xl p-8 space-y-4">
          <ShieldAlert className="w-12 h-12 text-[#FF7A00] mx-auto" />
          <h1 className="font-display text-xl font-extrabold">Acceso exclusivo SuperAdmin</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Tu cuenta (<code>{user?.email || 'Desconocida'}</code>) no tiene rol de administrador SaaS. Ejecuta{' '}
            <code>003_superadmin_setup.sql</code> en Supabase, verifica{' '}
            <code>VITE_SUPERADMIN_EMAIL</code> en <code>.env</code> y vuelve a iniciar sesión.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <Link
              to="/dashboard"
              className="inline-flex rounded-xl bg-[#0B4BE3] px-5 py-2.5 text-xs font-bold text-white"
            >
              Volver a Mi Dashboard
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2.5 text-xs font-bold text-slate-200"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const updateStatus = async (tenantId: string, nextStatus: TenantStatus) => {
    await supabase.from('tenants').update({ status: nextStatus }).eq('id', tenantId);
    await fetchAdminData();
  };

  const extendTrial = async (tenant: TenantAdminRow, days: number) => {
    const baseMs = Math.max(Date.now(), new Date(tenant.trial_ends_at).getTime());
    const nextDate = new Date(baseMs + days * 86400 * 1000).toISOString();
    await supabase
      .from('tenants')
      .update({ trial_ends_at: nextDate, status: 'trial' })
      .eq('id', tenant.id);
    await fetchAdminData();
  };

  const handleColdCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coldName.trim() || !coldSlug.trim()) return;
    setColdError(null);
    if (coldLat === null || coldLng === null || !Number.isFinite(coldLat) || !Number.isFinite(coldLng)) {
      setColdError('Debes fijar la ubicación del local en el mapa antes de crear el negocio.');
      return;
    }
    const cleanEmail = coldOwnerEmail.trim().toLowerCase();
    const cleanPassword = coldOwnerPassword.trim();
    if (cleanEmail && cleanPassword && cleanPassword.length < 6) {
      setColdError('La contraseña temporal debe tener al menos 6 caracteres.');
      return;
    }

    setCreating(true);
    try {
      const cleanSlug = coldSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      let uploadedLogoUrl: string | null = null;
      if (coldLogoFile) {
        uploadedLogoUrl = await uploadTenantLogo(coldLogoFile, cleanSlug || 'comercio');
      }

      const trialEnds = new Date(Date.now() + 14 * 86400 * 1000).toISOString();
      const baseInsert = {
        owner_user_id: user.id,
        name: coldName.trim(),
        slug: cleanSlug,
        logo_url: uploadedLogoUrl,
        brand_color: coldColor,
        lat: Number(coldLat),
        lng: Number(coldLng),
        status: 'trial' as const,
        trial_ends_at: trialEnds,
      };

      const insertPayload: Record<string, unknown> = cleanEmail
        ? { ...baseInsert, owner_email: cleanEmail }
        : { ...baseInsert };

      let insertRes = await supabase
        .from('tenants')
        .insert(insertPayload)
        .select()
        .single();

      if (insertRes.error && /owner_email/i.test(insertRes.error.message)) {
        insertRes = await supabase.from('tenants').insert(baseInsert).select().single();
      }

      if (insertRes.error || !insertRes.data) {
        throw new Error(insertRes.error?.message || 'Error al crear negocio');
      }

      const created = insertRes.data;
      const meta = LOYALTY_PLANS_META[coldType];
      await supabase.from('loyalty_programs').insert({
        tenant_id: created.id,
        type: coldType,
        name: meta.name,
        rules: meta.defaultRules,
        is_active: true,
      });

      let warning: string | undefined;
      if (cleanEmail) {
        const res = await provisionOwnerForTenant(created.id, cleanEmail, cleanPassword);
        warning = res.warning;
      }

      setProvisionedCreds({
        tenantName: created.name,
        slug: created.slug,
        email: cleanEmail || '(Sin correo asignado aún)',
        password: cleanPassword || '(El cliente creará su cuenta en /registro con este correo)',
        warning,
      });

      setColdName('');
      setColdSlug('');
      setColdLogoFile(null);
      setColdLogoPreview(null);
      setColdOwnerEmail('');
      setColdOwnerPassword('');
      setColdLat(null);
      setColdLng(null);
      setShowColdModal(false);
      await fetchAdminData();
    } catch (err) {
      setColdError(err instanceof Error ? err.message : 'No se pudo provisionar el comercio');
    } finally {
      setCreating(false);
    }
  };

  const handleAssignOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTarget || !assignEmail.trim()) return;
    setAssignError(null);
    if (assignPassword && assignPassword.length < 6) {
      setAssignError('La contraseña temporal debe tener al menos 6 caracteres.');
      return;
    }

    setAssigning(true);
    try {
      const cleanEmail = assignEmail.trim().toLowerCase();
      const res = await provisionOwnerForTenant(assignTarget.id, cleanEmail, assignPassword.trim());

      setProvisionedCreds({
        tenantName: assignTarget.name,
        slug: assignTarget.slug,
        email: cleanEmail,
        password: assignPassword.trim() || '(Sin cambio / cuenta existente)',
        warning: res.warning,
      });
      setAssignTarget(null);
      setAssignEmail('');
      setAssignPassword('');
      await fetchAdminData();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'Error al vincular propietario');
    } finally {
      setAssigning(false);
    }
  };

  const handleCopyCredentials = async () => {
    if (!provisionedCreds) return;
    const baseUrl = getAppBaseUrl();
    const loginUrl = `${baseUrl}/login`;
    const tapUrl = getPublicTapUrl(provisionedCreds.slug);
    const text = [
      `¡Bienvenido a BlockOps Loyalty! Tu tarjeta de ${provisionedCreds.tenantName} ya está lista.`,
      `Panel del Comercio: ${loginUrl}`,
      `Correo: ${provisionedCreds.email}`,
      `Contraseña temporal: ${provisionedCreds.password}`,
      `(Puedes cambiar tu contraseña al entrar en Configuración > Seguridad)`,
      `URL para NFC/QR en mostrador: ${tapUrl}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopiedCreds(true);
      setTimeout(() => setCopiedCreds(false), 2500);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const renderStatusPill = (status: TenantStatus) => {
    if (status === 'active') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-bold">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Activo (Pagado)
        </span>
      );
    }
    if (status === 'trial') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0EA5E9]/15 border border-[#0EA5E9]/30 text-[#38BDF8] text-xs font-bold">
          <Clock className="w-3 h-3" />
          Trial 14d
        </span>
      );
    }
    if (status === 'past_due') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 text-xs font-bold">
          Pago Pendiente
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-400/30 text-rose-300 text-xs font-bold">
        Cancelado / Congelado
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#090D16] bg-isometric-dark text-white pb-20">
      <header className="border-b border-white/10 bg-[#090D16]/85 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to="/admin">
              <BlockOpsLogo size={36} showWordmark subtitle="SuperAdmin SaaS" theme="dark" />
            </Link>
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FF7A00]/15 border border-[#FF7A00]/30 text-[#FF7A00] text-[11px] font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
              Modo Ejecutivo
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {myTenants.length > 0 && (
              <Link
                to="/dashboard"
                className="rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-3.5 py-2 text-xs font-bold text-slate-200 transition"
              >
                Mi Dashboard
              </Link>
            )}
            <button
              type="button"
              onClick={() => setShowColdModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#FF7A00] to-[#F59E0B] px-4 py-2 text-xs font-extrabold text-white shadow-glow-amber hover:brightness-110 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Crear Negocio en Frío</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title="Cerrar sesión"
              className="p-2 rounded-xl border border-white/15 bg-white/5 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="inline-flex rounded-2xl bg-[#111827] border border-white/10 p-1.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveAdminTab('tenants')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl transition ${
                activeAdminTab === 'tenants'
                  ? 'bg-[#0B4BE3] text-white shadow-glow-indigo'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Store className="w-4 h-4" />
              <span>Comercios y Sucursales</span>
              <span className="ml-1 px-1.5 py-0.5 rounded-md bg-white/10 text-[10px] text-white">
                {tenants.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveAdminTab('accounting');
                fetchPayments();
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl transition ${
                activeAdminTab === 'accounting'
                  ? 'bg-emerald-600 text-white shadow-glow-green'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>Contabilidad y Cobros</span>
              <span className="ml-1 px-1.5 py-0.5 rounded-md bg-white/10 text-[10px] text-white">
                {payments.length}
              </span>
            </button>
          </div>

          <div className="text-xs text-slate-400">
            {activeAdminTab === 'tenants'
              ? 'Gestión de comercios, activación manual de meses y sucursales multi-local.'
              : 'Historial contable de cobros mensuales y renovaciones de suscripción.'}
          </div>
        </div>

        {activeAdminTab === 'accounting' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl bg-[#111827] border border-white/10 p-5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Recaudación Histórica</span>
                  <Banknote className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="font-display text-3xl font-extrabold mt-2 text-emerald-300">
                  Bs {totalCollected.toLocaleString('es-BO')}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Total acumulado registrado</div>
              </div>

              <div className="rounded-2xl bg-[#111827] border border-white/10 p-5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Cobrado Este Mes</span>
                  <Calendar className="w-4 h-4 text-[#0EA5E9]" />
                </div>
                <div className="font-display text-3xl font-extrabold mt-2 text-white">
                  Bs {thisMonthCollected.toLocaleString('es-BO')}
                </div>
                <div className="text-[11px] text-emerald-400 mt-1">Mes actual en curso</div>
              </div>

              <div className="rounded-2xl bg-[#111827] border border-white/10 p-5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Transacciones de Cobro</span>
                  <Receipt className="w-4 h-4 text-[#FF7A00]" />
                </div>
                <div className="font-display text-3xl font-extrabold mt-2 text-white">
                  {payments.length}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Registros en tenant_payments</div>
              </div>

              <div className="rounded-2xl bg-[#111827] border border-white/10 p-5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Comercios al Día (Activos)</span>
                  <CheckCircle2 className="w-4 h-4 text-[#0B4BE3]" />
                </div>
                <div className="font-display text-3xl font-extrabold mt-2 text-white">
                  {activePaidCount}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">De {tenants.length} comercios totales</div>
              </div>
            </div>

            <div className="rounded-2xl bg-[#111827] border border-white/10 overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="font-display text-base font-bold text-white">Historial de Cobros y Activaciones</h3>
                  <p className="text-xs text-slate-400">Control contable interno de pagos recibidos por suscripción.</p>
                </div>
                <button
                  type="button"
                  onClick={() => fetchPayments()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Actualizar</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02] text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="py-3.5 px-5">Fecha / Hora</th>
                      <th className="py-3.5 px-4">Comercio</th>
                      <th className="py-3.5 px-4">Monto</th>
                      <th className="py-3.5 px-4">Período Activado</th>
                      <th className="py-3.5 px-4">Método</th>
                      <th className="py-3.5 px-5">Referencia / Comprobante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm">
                    {loadingPayments ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          Cargando cobros contables...
                        </td>
                      </tr>
                    ) : payments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          No hay cobros registrados todavía. Activa un mes en la pestaña &quot;Comercios y Sucursales&quot; pulsando el botón &quot;Cobro / +30d&quot;.
                        </td>
                      </tr>
                    ) : (
                      payments.map((p) => {
                        return (
                          <tr key={p.id} className="hover:bg-white/[0.02] transition">
                            <td className="py-4 px-5 text-xs text-slate-300 whitespace-nowrap">
                              {new Date(p.paid_at || p.created_at).toLocaleString('es-BO', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="py-4 px-4 font-bold text-white">
                              <div>{p.tenant_name || 'Comercio'}</div>
                              {p.tenant_slug && (
                                <div className="text-[11px] font-mono text-[#0EA5E9]">/tap/{p.tenant_slug}</div>
                              )}
                            </td>
                            <td className="py-4 px-4 font-extrabold text-emerald-400">
                              Bs {p.amount.toLocaleString('es-BO')}
                            </td>
                            <td className="py-4 px-4">
                              <span className="px-2.5 py-1 rounded-full bg-[#0EA5E9]/15 border border-[#0EA5E9]/30 text-[#38BDF8] text-xs font-bold">
                                +{p.period_days} días
                              </span>
                            </td>
                            <td className="py-4 px-4 text-xs">
                              <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 font-medium text-slate-200">
                                {p.payment_method}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-xs text-slate-400">
                              {p.notes || <span className="text-slate-600 italic">Sin notas</span>}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-[#111827] border border-white/10 p-5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Negocios Registrados</span>
              <Building2 className="w-4 h-4 text-[#0EA5E9]" />
            </div>
            <div className="font-display text-3xl font-extrabold mt-2">{tenants.length}</div>
            <div className="text-[11px] text-emerald-400 mt-1">Supabase Multi-Tenant</div>
          </div>

          <div className="rounded-2xl bg-[#111827] border border-white/10 p-5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>MRR Mensual</span>
              <Banknote className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="font-display text-3xl font-extrabold mt-2">
              Bs {estimatedMrr.toLocaleString('es-BO')}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">{activePaidCount} suscripciones activas</div>
          </div>

          <div className="rounded-2xl bg-[#111827] border border-white/10 p-5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Pruebas Gratis (14d)</span>
              <Activity className="w-4 h-4 text-[#FF7A00]" />
            </div>
            <div className="font-display text-3xl font-extrabold mt-2">{trialCount}</div>
            <div className="text-[11px] text-amber-300 mt-1">En evaluación</div>
          </div>

          <div className="rounded-2xl bg-[#111827] border border-white/10 p-5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Tarjetas Emitidas</span>
              <Users className="w-4 h-4 text-[#0B4BE3]" />
            </div>
            <div className="font-display text-3xl font-extrabold mt-2">{totalCards}</div>
            <div className="text-[11px] text-slate-400 mt-1">Wallet + Web Pass PWA</div>
          </div>
        </div>

        <div className="rounded-2xl bg-[#111827] border border-white/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar comercio por nombre o slug..."
              className="w-full rounded-xl border border-white/10 bg-[#090D16] pl-10 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#0EA5E9]"
            />
          </div>

          <div className="inline-flex flex-wrap gap-1 rounded-xl bg-[#090D16] p-1 text-xs font-semibold border border-white/5">
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: 'trial', label: 'Trial 14d' },
                { id: 'active', label: 'Activos' },
                { id: 'past_due', label: 'Vencidos' },
                { id: 'canceled', label: 'Congelados' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg transition ${
                  statusFilter === tab.id ? 'bg-[#0B4BE3] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-[#111827] border border-white/10 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02] text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 px-5">Comercio</th>
                  <th className="py-3.5 px-4">Motor</th>
                  <th className="py-3.5 px-4">Estado</th>
                  <th className="py-3.5 px-4">Vigencia</th>
                  <th className="py-3.5 px-4">Tarjetas</th>
                  <th className="py-3.5 px-5 text-right">Control SaaS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      Cargando negocios...
                    </td>
                  </tr>
                ) : filteredTenants.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No hay negocios registrados todavía.
                    </td>
                  </tr>
                ) : (
                  filteredTenants.map((t) => {
                    const daysLeft = Math.ceil(
                      (new Date(t.trial_ends_at).getTime() - Date.now()) / 86400000
                    );
                    const isFrozen = t.status === 'canceled' || t.status === 'past_due';
                    return (
                      <tr key={t.id} className="hover:bg-white/[0.02] transition">
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            {t.logo_url ? (
                              <img
                                src={t.logo_url}
                                alt={t.name}
                                className="h-10 w-10 rounded-xl object-cover shrink-0 border border-white/15 bg-white"
                              />
                            ) : (
                              <div
                                className="h-10 w-10 rounded-xl flex items-center justify-center font-display font-extrabold text-sm text-white shrink-0 border border-white/15"
                                style={{ backgroundColor: t.brand_color }}
                              >
                                {t.name.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="font-bold text-white">{t.name}</div>
                              <div className="font-mono text-xs text-[#0EA5E9]">/tap/{t.slug}</div>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                {t.owner_email ? (
                                  <span>Dueño: {t.owner_email}</span>
                                ) : (
                                  <span className="text-amber-400/90">Sin correo vinculado</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-4 px-4">
                          <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-semibold text-slate-200">
                            {t.program ? LOYALTY_PLANS_META[t.program.type].name : 'Sin programa'}
                          </span>
                        </td>

                        <td className="py-4 px-4">{renderStatusPill(t.status)}</td>

                        <td className="py-4 px-4 text-xs">
                          {(() => {
                            const sub = getTenantSubscriptionStatus(t);
                            if (sub.isBlocked) {
                              return (
                                <span className="text-rose-400 font-bold flex items-center gap-1.5">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                  <span>{sub.blockReason}</span>
                                </span>
                              );
                            }
                            return (
                              <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                <span>{sub.statusLabel}</span>
                              </span>
                            );
                          })()}
                        </td>

                        <td className="py-4 px-4 font-bold text-white">{t.cardsCount}</td>

                        <td className="py-4 px-5 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setPaymentTarget(t);
                                setPayAmount(250);
                                setPayPeriodDays(30);
                                setPayMethod('QR Simple');
                                setPayNotes('');
                                setPayError(null);
                              }}
                              title="Registrar cobro manual y activar 1 mes (+30 días)"
                              className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500 border border-emerald-400/30 text-emerald-300 hover:text-white px-2.5 py-1.5 text-xs font-bold transition"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>Cobro / +30d</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setBranchParent(t);
                                setBranchName(`${t.name} - Sucursal`);
                                setBranchSlug(`${t.slug}-sucursal`);
                                setBranchType(t.program?.type || 'stamps');
                                setBranchColor(t.brand_color);
                                setBranchLat(t.lat);
                                setBranchLng(t.lng);
                                setBranchError(null);
                              }}
                              title="Crear nueva tarjeta o sucursal para este negocio"
                              className="inline-flex items-center gap-1 rounded-xl bg-blue-500/20 hover:bg-blue-600 border border-blue-400/30 text-blue-300 hover:text-white px-2.5 py-1.5 text-xs font-bold transition"
                            >
                              <Store className="w-3.5 h-3.5" />
                              <span>+ Sucursal</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setNotifyTarget(t);
                                setNotifyTitle('Aviso de Administración');
                                setNotifyMessage('');
                                setNoticeError(null);
                              }}
                              title="Enviar notificación directa al panel de este comercio"
                              className="inline-flex items-center gap-1 rounded-xl bg-amber-500/20 hover:bg-[#FF7A00] border border-amber-400/30 text-amber-300 hover:text-white px-2.5 py-1.5 text-xs font-bold transition"
                            >
                              <Bell className="w-3.5 h-3.5" />
                              <span>Notificar</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setNfcTarget(t);
                                setNfcCopied(false);
                                setNfcStatusMsg(null);
                              }}
                              title="Configurar y grabar sticker NFC"
                              className="inline-flex items-center gap-1 rounded-xl bg-white/5 hover:bg-[#FF7A00] border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white transition"
                            >
                              <Nfc className="w-3.5 h-3.5 text-[#FF7A00]" />
                              <span>NFC</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setAssignTarget(t);
                                setAssignEmail(t.owner_email || '');
                                setAssignPassword(generateTempPassword());
                                setAssignError(null);
                              }}
                              title="Vincular dueño o asignar contraseña temporal"
                              className="inline-flex items-center gap-1 rounded-xl bg-white/5 hover:bg-[#0B4BE3] border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white transition"
                            >
                              <KeyRound className="w-3.5 h-3.5 text-[#0EA5E9]" />
                              <span>Acceso</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => updateStatus(t.id, isFrozen ? 'active' : 'canceled')}
                              className={`p-1.5 rounded-xl border transition ${
                                isFrozen
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30 hover:bg-emerald-500 hover:text-white'
                                  : 'bg-rose-500/15 text-rose-300 border-rose-400/25 hover:bg-rose-500 hover:text-white'
                              }`}
                              title={isFrozen ? 'Reactivar' : 'Congelar'}
                            >
                              {isFrozen ? (
                                <PlayCircle className="w-4 h-4" />
                              ) : (
                                <PauseCircle className="w-4 h-4" />
                              )}
                            </button>

                            <a
                              href={`/tap/${t.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Ver tarjeta digital pública"
                              className="p-1.5 rounded-xl bg-white/5 hover:bg-[#0EA5E9] text-slate-300 hover:text-white transition"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )}

    <div className="pt-4 text-center">
      <PoweredByBlockOps dark />
    </div>
  </main>

      {showColdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl bg-[#111827] border border-white/15 p-6 text-white shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-lg font-extrabold">Crear Negocio en Frío</h3>
                <p className="text-xs text-slate-400">
                  Provisiona su tarjeta con prueba de 14 días durante una visita comercial.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowColdModal(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleColdCreate} className="space-y-4">
              {coldError && (
                <div className="rounded-xl bg-rose-500/15 border border-rose-400/30 p-3 text-xs text-rose-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{coldError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Nombre del Comercio *
                </label>
                <input
                  type="text"
                  required
                  value={coldName}
                  onChange={(e) => {
                    setColdName(e.target.value);
                    setColdSlug(
                      e.target.value
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/^-|-$/g, '')
                    );
                  }}
                  placeholder="Ej. Café del Centro"
                  className="w-full rounded-xl border border-white/15 bg-[#090D16] px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Slug URL *</label>
                <input
                  type="text"
                  required
                  value={coldSlug}
                  onChange={(e) => setColdSlug(e.target.value)}
                  placeholder="cafe-del-centro"
                  className="w-full rounded-xl border border-white/15 bg-[#090D16] px-3.5 py-2 text-sm font-mono text-[#0EA5E9]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Motor</label>
                  <select
                    value={coldType}
                    onChange={(e) => setColdType(e.target.value as ProgramType)}
                    className="w-full rounded-xl border border-white/15 bg-[#090D16] px-3 py-2.5 text-sm text-white"
                  >
                    {Object.values(LOYALTY_PLANS_META).map((m) => (
                      <option key={m.type} value={m.type}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Color Marca</label>
                  <input
                    type="color"
                    value={coldColor}
                    onChange={(e) => setColdColor(e.target.value)}
                    className="h-10 w-full rounded-xl border border-white/15 bg-[#090D16] p-1 cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Logo del Comercio (opcional)
                </label>
                <div className="flex items-center gap-3">
                  {coldLogoPreview ? (
                    <img
                      src={coldLogoPreview}
                      alt="Vista previa logo"
                      className="h-10 w-10 rounded-xl object-cover border border-white/15 bg-white shrink-0"
                    />
                  ) : null}
                  <label className="flex-1 cursor-pointer inline-flex items-center gap-2 rounded-xl border border-dashed border-white/20 hover:border-[#0EA5E9] bg-[#090D16] px-3.5 py-2 text-xs font-semibold text-slate-200 transition">
                    <ImagePlus className="w-4 h-4 text-[#0EA5E9] shrink-0" />
                    <span className="truncate">
                      {coldLogoFile ? coldLogoFile.name : 'Subir Logo (PNG/JPG/WEBP)'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        setColdLogoFile(file);
                        const reader = new FileReader();
                        reader.onload = () => setColdLogoPreview(String(reader.result));
                        reader.readAsDataURL(file);
                      }}
                      className="hidden"
                    />
                  </label>
                  {coldLogoFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setColdLogoFile(null);
                        setColdLogoPreview(null);
                      }}
                      className="text-xs font-semibold text-rose-400 hover:underline shrink-0"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-[#090D16]/80 border border-white/10 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#0EA5E9] flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Credenciales para el Dueño</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setColdOwnerPassword(generateTempPassword())}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#FF7A00] hover:underline"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Generar clave</span>
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Correo del Dueño (para su Dashboard)
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={coldOwnerEmail}
                      onChange={(e) => setColdOwnerEmail(e.target.value)}
                      placeholder="dueno@negocio.com"
                      className="w-full rounded-xl border border-white/15 bg-[#111827] pl-9 pr-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Contraseña Temporal (el cliente podrá cambiarla)
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={coldOwnerPassword}
                      onChange={(e) => setColdOwnerPassword(e.target.value)}
                      placeholder="Mín. 6 caracteres (ej. BlockOps-1234)"
                      className="w-full rounded-xl border border-white/15 bg-[#111827] pl-9 pr-3 py-2 text-xs font-mono text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-[#090D16]/70 border border-white/10 p-3.5">
                <BoliviaLocationPicker
                  theme="dark"
                  lat={coldLat}
                  lng={coldLng}
                  heightClassName="h-44"
                  onChange={(nextLat, nextLng) => {
                    setColdLat(nextLat);
                    setColdLng(nextLng);
                    setColdError(null);
                  }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowColdModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating || coldLat === null || coldLng === null}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#FF7A00] to-[#F59E0B] text-xs font-extrabold text-white shadow-glow-amber disabled:opacity-60"
                >
                  {creating ? 'Creando...' : 'Crear Trial 14d'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {assignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-[#111827] border border-white/15 p-6 text-white shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-lg font-extrabold">Vincular Dueño y Acceso</h3>
                <p className="text-xs text-slate-400">
                  Negocio: <strong className="text-white">{assignTarget.name}</strong> (/tap/{assignTarget.slug})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssignTarget(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignOwner} className="space-y-4">
              {assignError && (
                <div className="rounded-xl bg-rose-500/15 border border-rose-400/30 p-3 text-xs text-rose-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{assignError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Correo del Dueño *
                </label>
                <input
                  type="email"
                  required
                  value={assignEmail}
                  onChange={(e) => setAssignEmail(e.target.value)}
                  placeholder="cliente@negocio.com"
                  className="w-full rounded-xl border border-white/15 bg-[#090D16] px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-300">
                    Contraseña Temporal (opcional si ya tiene clave)
                  </label>
                  <button
                    type="button"
                    onClick={() => setAssignPassword(generateTempPassword())}
                    className="text-[11px] font-bold text-[#FF7A00] hover:underline"
                  >
                    Generar otra
                  </button>
                </div>
                <input
                  type="text"
                  value={assignPassword}
                  onChange={(e) => setAssignPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full rounded-xl border border-white/15 bg-[#090D16] px-3.5 py-2.5 text-sm font-mono text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssignTarget(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={assigning}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#0EA5E9] to-[#0B4BE3] text-xs font-extrabold text-white disabled:opacity-60"
                >
                  {assigning ? 'Vinculando...' : 'Guardar Acceso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {nfcTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-[#111827] border border-white/15 p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-[#FF7A00]/15 text-[#FF7A00] flex items-center justify-center">
                  <Nfc className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-extrabold">Configuración NFC · {nfcTarget.name}</h3>
                  <p className="text-xs text-slate-400">
                    Servicio exclusivo SuperAdmin para grabar stickers físicos del comercio.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNfcTarget(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const targetTapUrl = getPublicTapUrl(nfcTarget.slug);
              const supportsWebNfc = typeof window !== 'undefined' && 'NDEFReader' in window;

              const handleWriteWebNfc = async () => {
                setNfcStatusMsg(null);
                if (!supportsWebNfc) {
                  setNfcStatusMsg({
                    type: 'error',
                    text: 'Web NFC directo solo está disponible en Chrome para Android. Copia la URL y grábala con NFC Tools.',
                  });
                  return;
                }
                setNfcWriting(true);
                try {
                  const NdefCtor = (
                    window as unknown as {
                      NDEFReader: new () => {
                        write: (message: {
                          records: Array<{ recordType: string; data: string }>;
                        }) => Promise<void>;
                      };
                    }
                  ).NDEFReader;
                  const ndef = new NdefCtor();
                  await ndef.write({
                    records: [{ recordType: 'url', data: targetTapUrl }],
                  });
                  setNfcStatusMsg({
                    type: 'success',
                    text: '¡Sticker NFC grabado correctamente! Ya puedes probar acercando cualquier teléfono.',
                  });
                } catch (err) {
                  setNfcStatusMsg({
                    type: 'error',
                    text:
                      err instanceof Error
                        ? `No se pudo grabar el sticker: ${err.message}`
                        : 'Acerque el sticker NFC a la antena trasera de su teléfono Android e intente de nuevo.',
                  });
                } finally {
                  setNfcWriting(false);
                }
              };

              return (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-[#090D16] border border-white/10 p-4 space-y-2.5">
                    <span className="text-xs font-bold text-slate-300 block">
                      URL única para grabar en Sticker NFC (NTAG213 / NTAG215)
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-xl border border-white/10 bg-[#111827] px-3 py-2 font-mono text-xs text-[#0EA5E9] truncate select-all">
                        {targetTapUrl}
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(targetTapUrl);
                          setNfcCopied(true);
                          setTimeout(() => setNfcCopied(false), 2000);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-white transition shrink-0 ${
                          nfcCopied ? 'bg-emerald-500' : 'bg-[#0B4BE3] hover:bg-blue-700'
                        }`}
                      >
                        {nfcCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{nfcCopied ? '¡Copiada!' : 'Copiar URL'}</span>
                      </button>
                    </div>
                  </div>

                  {nfcStatusMsg && (
                    <div
                      className={`rounded-xl p-3 text-xs font-semibold border ${
                        nfcStatusMsg.type === 'success'
                          ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200'
                          : 'bg-amber-500/15 border-amber-400/30 text-amber-200'
                      }`}
                    >
                      {nfcStatusMsg.text}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={nfcWriting}
                    onClick={handleWriteWebNfc}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF7A00] to-[#F59E0B] px-4 py-3 text-xs font-extrabold text-white shadow-glow-amber disabled:opacity-60 transition"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>
                      {nfcWriting
                        ? 'Acerca el sticker NFC ahora...'
                        : 'Grabar Sticker NFC directo (Chrome Android)'}
                    </span>
                  </button>

                  <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-xs text-slate-300 space-y-2">
                    <div className="font-bold text-white">Respaldo rápido con app NFC Tools:</div>
                    <p>1. Abre <strong>NFC Tools</strong> → <strong>Escribir</strong> → <strong>Añadir un registro</strong> → <strong>URL / URI</strong>.</p>
                    <p>2. Pega la URL copiada arriba y acerca la etiqueta NTAG213/215 para escribir y bloquear.</p>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {provisionedCreds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-[#111827] border border-emerald-500/30 p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
                <h3 className="font-display text-lg font-extrabold text-white">
                  Acceso Provisionado
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setProvisionedCreds(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-2xl bg-[#090D16] border border-white/10 p-4 space-y-2 text-xs">
              <div>
                <span className="text-slate-400">Comercio:</span>{' '}
                <strong className="text-white">{provisionedCreds.tenantName}</strong>
              </div>
              <div>
                <span className="text-slate-400">Correo:</span>{' '}
                <strong className="text-[#0EA5E9]">{provisionedCreds.email}</strong>
              </div>
              <div>
                <span className="text-slate-400">Contraseña temporal:</span>{' '}
                <strong className="font-mono text-amber-300">{provisionedCreds.password}</strong>
              </div>
              <div>
                <span className="text-slate-400">Tarjeta NFC/QR:</span>{' '}
                <strong className="font-mono text-slate-200">/tap/{provisionedCreds.slug}</strong>
              </div>
            </div>

            {provisionedCreds.warning && (
              <div className="rounded-xl bg-amber-500/15 border border-amber-400/30 p-3 text-[11px] text-amber-200 leading-relaxed">
                {provisionedCreds.warning}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setProvisionedCreds(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleCopyCredentials}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-xs font-extrabold text-white transition"
              >
                {copiedCreds ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCreds ? '¡Copiado!' : 'Copiar Invitación'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-[#111827] border border-emerald-500/30 p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-extrabold">Registrar Cobro y Activar</h3>
                  <p className="text-xs text-slate-400">
                    {paymentTarget.name} <span className="text-emerald-400 font-mono">(/tap/{paymentTarget.slug})</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPaymentTarget(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-2xl bg-[#090D16] border border-white/10 p-3.5 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Estado actual:</span>
                <span className="font-bold text-white capitalize">{paymentTarget.status}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Vencimiento actual:</span>
                <span className="font-mono text-slate-300">
                  {new Date(paymentTarget.trial_ends_at).toLocaleDateString('es-BO', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmPaymentAndActivation} className="space-y-4">
              {payError && (
                <div className="rounded-xl bg-rose-500/15 border border-rose-400/30 p-3 text-xs text-rose-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{payError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Monto Pagado (Bs) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-400">
                      Bs
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      required
                      value={payAmount}
                      onChange={(e) => setPayAmount(Number(e.target.value))}
                      className="w-full rounded-xl border border-white/15 bg-[#090D16] pl-9 pr-3 py-2 text-sm font-bold text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Período de Activación *
                  </label>
                  <select
                    value={payPeriodDays}
                    onChange={(e) => setPayPeriodDays(Number(e.target.value))}
                    className="w-full rounded-xl border border-white/15 bg-[#090D16] px-3 py-2 text-xs font-semibold text-white"
                  >
                    <option value={15}>15 días (Quincena)</option>
                    <option value={30}>30 días (1 Mes)</option>
                    <option value={60}>60 días (2 Meses)</option>
                    <option value={90}>90 días (3 Meses)</option>
                    <option value={180}>180 días (Semestre)</option>
                    <option value={365}>365 días (1 Año)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Método de Pago *
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-[#090D16] px-3 py-2 text-xs text-white"
                >
                  <option value="QR Simple">QR Simple (Banco)</option>
                  <option value="Transferencia">Transferencia Bancaria</option>
                  <option value="Efectivo">Efectivo en mano</option>
                  <option value="Tigo Money">Tigo Money</option>
                  <option value="Tarjeta">Tarjeta de Débito/Crédito</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Notas / Referencia de Comprobante (opcional)
                </label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Ej. Comprobante #948293 Banco Unión"
                  className="w-full rounded-xl border border-white/15 bg-[#090D16] px-3.5 py-2 text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentTarget(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={paying}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-xs font-extrabold text-white shadow-glow-green disabled:opacity-60 transition"
                >
                  {paying ? 'Activando...' : `Confirmar Cobro y Activar +${payPeriodDays}d`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {branchParent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl bg-[#111827] border border-blue-500/30 p-6 text-white shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-extrabold">Crear Nueva Sucursal o Tarjeta</h3>
                  <p className="text-xs text-slate-400">
                    Para: <strong className="text-white">{branchParent.name}</strong> · Propietario ({branchParent.owner_email || 'Misma cuenta'})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBranchParent(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBranch} className="space-y-4">
              {branchError && (
                <div className="rounded-xl bg-rose-500/15 border border-rose-400/30 p-3 text-xs text-rose-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{branchError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Nombre de la Sucursal / Tarjeta *
                </label>
                <input
                  type="text"
                  required
                  value={branchName}
                  onChange={(e) => {
                    setBranchName(e.target.value);
                    setBranchSlug(
                      e.target.value
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/^-|-$/g, '')
                    );
                  }}
                  placeholder="Ej. Café del Centro - Sucursal Equipetrol"
                  className="w-full rounded-xl border border-white/15 bg-[#090D16] px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Slug URL único *</label>
                <input
                  type="text"
                  required
                  value={branchSlug}
                  onChange={(e) => setBranchSlug(e.target.value)}
                  placeholder="cafe-centro-equipetrol"
                  className="w-full rounded-xl border border-white/15 bg-[#090D16] px-3.5 py-2 text-sm font-mono text-[#0EA5E9]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Motor de Fidelización</label>
                  <select
                    value={branchType}
                    onChange={(e) => setBranchType(e.target.value as ProgramType)}
                    className="w-full rounded-xl border border-white/15 bg-[#090D16] px-3 py-2.5 text-sm text-white"
                  >
                    {Object.values(LOYALTY_PLANS_META).map((m) => (
                      <option key={m.type} value={m.type}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Color de Marca</label>
                  <input
                    type="color"
                    value={branchColor}
                    onChange={(e) => setBranchColor(e.target.value)}
                    className="h-10 w-full rounded-xl border border-white/15 bg-[#090D16] p-1 cursor-pointer"
                  />
                </div>
              </div>

              <div className="rounded-2xl bg-[#090D16]/70 border border-white/10 p-3.5 space-y-2">
                <div className="text-xs font-bold text-slate-300">
                  Fijar Ubicación de la Sucursal en Bolivia (Antifraude GPS) *
                </div>
                <BoliviaLocationPicker
                  theme="dark"
                  lat={branchLat}
                  lng={branchLng}
                  heightClassName="h-44"
                  onChange={(nextLat, nextLng) => {
                    setBranchLat(nextLat);
                    setBranchLng(nextLng);
                    setBranchError(null);
                  }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBranchParent(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={branchCreating || branchLat === null || branchLng === null}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-xs font-extrabold text-white shadow-glow-indigo disabled:opacity-60 transition"
                >
                  {branchCreating ? 'Creando Sucursal...' : 'Crear Sucursal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {notifyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-[#111827] border border-amber-500/30 p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-extrabold">Enviar Notificación al Panel</h3>
                  <p className="text-xs text-slate-400">
                    Para: <strong className="text-white">{notifyTarget.name}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNotifyTarget(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendNotification} className="space-y-4">
              {noticeError && (
                <div className="rounded-xl bg-rose-500/15 border border-rose-400/30 p-3 text-xs text-rose-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{noticeError}</span>
                </div>
              )}

              {noticeSent && (
                <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/30 p-3 text-xs text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>¡Notificación enviada en tiempo real al panel del comercio!</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Título del Aviso *
                </label>
                <input
                  type="text"
                  required
                  value={notifyTitle}
                  onChange={(e) => setNotifyTitle(e.target.value)}
                  placeholder="Ej. Suscripción Renovada con Éxito"
                  className="w-full rounded-xl border border-white/15 bg-[#090D16] px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Mensaje / Detalle *
                </label>
                <textarea
                  required
                  rows={4}
                  value={notifyMessage}
                  onChange={(e) => setNotifyMessage(e.target.value)}
                  placeholder="Escribe el mensaje que verá el dueño en la campanita de su dashboard..."
                  className="w-full rounded-xl border border-white/15 bg-[#090D16] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 resize-none focus:outline-none focus:border-[#0EA5E9]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNotifyTarget(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={sendingNotice || noticeSent}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#FF7A00] to-[#F59E0B] text-xs font-extrabold text-white shadow-glow-amber disabled:opacity-60 transition"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sendingNotice ? 'Enviando...' : 'Enviar Notificación'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
