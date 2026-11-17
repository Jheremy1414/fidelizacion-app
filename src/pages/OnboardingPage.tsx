import React, { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  Check,
  Clock,
  Crown,
  ImagePlus,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Percent,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  Wallet,
  X,
} from 'lucide-react';
import { BlockOpsLogo, PoweredByBlockOps } from '../components/brand/BlockOpsLogo';
import { BoliviaLocationPicker } from '../components/map/BoliviaLocationPicker';
import { TouchNumberInput } from '../components/ui/TouchNumberInput';
import { DigitalPassCard } from '../components/wallet/DigitalPassCard';
import { getAuthenticatedHomePath, ONBOARDING_DRAFT_KEY, useApp } from '../context/AppContext';
import { isSupabaseConfigured, supabase, uploadTenantLogo } from '../lib/supabase';
import { LOYALTY_PLANS_META, LoyaltyRules, ProgramType } from '../types/loyalty';

const BRAND_COLORS = [
  { name: 'BlockOps Cobalt', hex: '#0B4BE3' },
  { name: 'Electric Cyan', hex: '#0EA5E9' },
  { name: 'Action Amber', hex: '#FF7A00' },
  { name: 'Emerald Mint', hex: '#10B981' },
  { name: 'Royal Indigo', hex: '#6366F1' },
  { name: 'Ruby Rose', hex: '#E11D48' },
];

export const OnboardingPage: React.FC = () => {
  const {
    user,
    authLoading,
    tenantsLoaded,
    myTenants,
    isSuperAdmin,
    signUp,
    signOut,
    refreshData,
    createTenantWithProgram,
  } = useApp();
  const [checkingLink, setCheckingLink] = useState(false);
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

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Identity
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [brandColor, setBrandColor] = useState('#0B4BE3');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadedLogoUrl, setUploadedLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  // Step 2: Loyalty Engine
  const [planType, setPlanType] = useState<ProgramType>('stamps');
  const [programName, setProgramName] = useState('Club de Sellos');
  const [rules, setRules] = useState<LoyaltyRules>({ ...LOYALTY_PLANS_META.stamps.defaultRules });

  // Step 3: GPS Geofencing & Account Creation (if not logged in)
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [tempLat, setTempLat] = useState<number | null>(null);
  const [tempLng, setTempLng] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [emailConfirmationNotice, setEmailConfirmationNotice] = useState(false);

  const handleNameChange = (val: string) => {
    setName(val);
    const auto = val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setSlug(auto);
  };

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMsg(null);
    if (!file.type.startsWith('image/')) {
      setErrorMsg('El logo debe ser una imagen válida (PNG, JPG, WEBP o SVG).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('El logo no puede superar los 5 MB.');
      return;
    }

    setLogoFile(file);
    setUploadedLogoUrl(null);
    const previewReader = new FileReader();
    previewReader.onload = () => setLogoUrl(String(previewReader.result));
    previewReader.readAsDataURL(file);

    // Subir de inmediato a tenant-logos para obtener la URL pública
    if (isSupabaseConfigured) {
      setLogoUploading(true);
      try {
        const publicUrl = await uploadTenantLogo(file, slug || name || 'comercio');
        setUploadedLogoUrl(publicUrl);
        setLogoUrl(publicUrl);
      } catch (err) {
        console.warn('Subida previa diferida:', err);
      } finally {
        setLogoUploading(false);
      }
    }
  };

  const handleSelectPlan = (type: ProgramType) => {
    setPlanType(type);
    setProgramName(LOYALTY_PLANS_META[type].name);
    setRules({ ...LOYALTY_PLANS_META[type].defaultRules });
  };

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isSupabaseConfigured) {
      setErrorMsg('Configura tus credenciales de Supabase en .env antes de registrar una empresa.');
      return;
    }
    if (!name.trim() || !slug.trim()) {
      setErrorMsg('Por favor ingresa el nombre y URL de tu negocio en el Paso 1.');
      setStep(1);
      return;
    }
    if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setErrorMsg(
        'Debes fijar la ubicación exacta de tu local en el mapa (clic en el mapa, buscador o GPS) antes de continuar.'
      );
      setStep(3);
      return;
    }

    setSubmitting(true);
    try {
      let ownerUser = user;
      const cleanName = name.trim();
      const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

      // VERIFICACIÓN ESTRICTA: Si el nombre comercial o slug ya existe en la base de datos, BLOQUEAR la creación
      const { data: existingBusiness } = await supabase
        .from('tenants')
        .select('id, name, slug')
        .or(`name.ilike.${cleanName},slug.eq.${cleanSlug}`)
        .limit(1)
        .maybeSingle();

      if (existingBusiness) {
        const isSameName = existingBusiness.name.toLowerCase() === cleanName.toLowerCase();
        setErrorMsg(
          isSameName
            ? `Ya existe un negocio registrado con el nombre "${existingBusiness.name}". Por favor elige otro nombre comercial.`
            : `El enlace "/tap/${cleanSlug}" ya está registrado por otro negocio. Por favor elige otro nombre o URL.`
        );
        setStep(1);
        setSubmitting(false);
        return;
      }

      // Si es un usuario nuevo, verificar si ya tiene un negocio registrado con ese correo
      if (!ownerUser && email.trim()) {
        const { data: existingEmailTenant } = await supabase
          .from('tenants')
          .select('id, name')
          .ilike('owner_email', email.trim().toLowerCase())
          .limit(1)
          .maybeSingle();

        if (existingEmailTenant) {
          setErrorMsg(
            `Ya existe un negocio (${existingEmailTenant.name}) registrado con el correo "${email.trim()}". Inicia sesión en /login para administrarlo.`
          );
          setSubmitting(false);
          return;
        }
      }

      const draftPayload = {
        name: cleanName,
        slug: cleanSlug,
        logo_url: uploadedLogoUrl,
        brand_color: brandColor,
        type: planType,
        program_name: programName,
        rules,
        lat,
        lng,
      };

      // 1. Upload logo to tenant-logos bucket in Supabase Storage & obtain getPublicUrl
      let finalLogoUrl: string | null = uploadedLogoUrl;
      if (!finalLogoUrl && logoFile) {
        try {
          finalLogoUrl = await uploadTenantLogo(logoFile, cleanSlug);
        } catch (uploadErr) {
          console.warn('No se pudo subir logo a storage:', uploadErr);
        }
      }

      const enrichedDraft = {
        ...draftPayload,
        logo_url: finalLogoUrl,
      };

      // 2. Ensure user is authenticated
      if (!ownerUser) {
        if (!email.trim() || password.length < 6) {
          throw new Error('Ingresa tu correo y una contraseña de al menos 6 caracteres para crear tu cuenta.');
        }
        const { error, needsConfirmation, user: signedUser, tenants: createdTenants } = await signUp(
          email.trim(),
          password,
          { onboarding_draft: enrichedDraft }
        );
        if (error) throw new Error(error);
        if (needsConfirmation) {
          localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(enrichedDraft));
          setEmailConfirmationNotice(true);
          setSubmitting(false);
          return;
        }
        ownerUser = signedUser;

        // Si fetchMyTenants ya creó el negocio a partir de onboarding_draft durante el signUp con sesión inmediata, no crear otro
        if (createdTenants && createdTenants.length > 0) {
          navigate('/dashboard', { replace: true });
          return;
        }
      }

      // 3. Crear tenant y programa verificando directamente en base de datos para no duplicar
      if (ownerUser) {
        const { data: userTenants } = await supabase
          .from('tenants')
          .select('id, name, slug')
          .eq('owner_user_id', ownerUser.id);

        const alreadyCreated = (userTenants || []).some(
          (t: { slug: string; name: string }) =>
            t.slug === cleanSlug || t.name.toLowerCase() === cleanName.toLowerCase()
        );

        if (!alreadyCreated) {
          await createTenantWithProgram(enrichedDraft, ownerUser);
        }
      }

      navigate('/dashboard', { replace: true });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo completar el registro');
    } finally {
      setSubmitting(false);
    }
  };

  const planIcons: Record<ProgramType, React.FC<{ className?: string }>> = {
    stamps: Star,
    discount: Percent,
    points: Award,
    cashback: Wallet,
    subscription: Crown,
  };

  const previewBalance = useMemo(() => {
    if (planType === 'stamps') return Math.max(1, (rules.goal || 10) - 2);
    if (planType === 'points') return Math.round((rules.goal_points || 500) * 0.7);
    if (planType === 'discount') return Math.round((rules.target_spend || 1000) * 0.65);
    if (planType === 'cashback') return 145;
    return Math.max(1, (rules.monthly_visits || 4) - 1);
  }, [planType, rules]);

  if (authLoading || (user && !tenantsLoaded)) {
    return (
      <div className="min-h-screen bg-[#090D16] text-white flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-[#0EA5E9] animate-spin" />
        <span className="text-xs text-slate-400">Verificando tu sesión...</span>
      </div>
    );
  }

  if (user && (isSuperAdmin || myTenants.length > 0)) {
    return (
      <Navigate to={getAuthenticatedHomePath(isSuperAdmin, myTenants.length)} replace />
    );
  }

  return (
    <div className="min-h-screen bg-isometric-light text-slate-900 flex flex-col">
      <header className="bg-white/85 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 h-16 flex items-center justify-between">
        <Link to={user ? getAuthenticatedHomePath(isSuperAdmin, myTenants.length) : '/'}>
          <BlockOpsLogo size={34} showWordmark subtitle="Registro Empresarial" theme="light" />
        </Link>

        <div className="hidden md:flex items-center gap-3 text-xs font-bold">
          {[
            { num: 1, label: '1. Marca y Tarjeta' },
            { num: 2, label: '2. Motor de Fidelización' },
            { num: 3, label: '3. GPS & Prueba 14 Días' },
          ].map((item) => (
            <button
              key={item.num}
              type="button"
              onClick={() => {
                if (item.num > 1 && (!name.trim() || !slug.trim())) {
                  setErrorMsg('Ingresa primero el nombre y URL de tu negocio.');
                  setStep(1);
                  return;
                }
                setStep(item.num as 1 | 2 | 3);
              }}
              className={`px-3.5 py-1.5 rounded-full border transition ${
                step === item.num
                  ? 'bg-[#0B4BE3] text-white border-[#0B4BE3] shadow-sm'
                  : step > item.num
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-white text-slate-400 border-slate-200'
              }`}
            >
              {step > item.num ? `✓ ${item.label}` : item.label}
            </button>
          ))}
        </div>

        {user ? (
          <div className="flex items-center gap-3">
            {myTenants.length > 0 && (
              <Link to="/dashboard" className="text-xs font-bold text-[#0B4BE3] hover:underline">
                Volver al Panel →
              </Link>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-rose-600"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        ) : (
          <Link to="/login" className="text-xs font-bold text-[#0B4BE3] hover:underline">
            Iniciar Sesión →
          </Link>
        )}
      </header>

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-8">
        {emailConfirmationNotice ? (
          <div className="max-w-xl mx-auto py-6">
            <div className="rounded-3xl bg-white border border-slate-200/90 shadow-2xl p-6 sm:p-10 text-center space-y-6">
              <div className="mx-auto h-20 w-20 rounded-3xl bg-gradient-to-tr from-[#0EA5E9] to-[#0B4BE3] flex items-center justify-center text-white shadow-glow-cobalt">
                <Mail className="w-10 h-10 animate-bounce" />
              </div>
              <div>
                <span className="px-3.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-extrabold uppercase tracking-wide">
                  Cuenta creada con éxito
                </span>
                <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 mt-3">
                  ¡Confirma tu correo electrónico!
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
                  Hemos enviado un enlace de activación a:
                </p>
                <div className="mt-2 inline-block rounded-xl bg-slate-100 border border-slate-200 px-4 py-2 text-sm font-bold text-slate-900 font-mono">
                  {email}
                </div>
              </div>

              <div className="rounded-2xl bg-blue-50/70 border border-blue-200/80 p-4 text-left text-xs text-slate-700 space-y-3">
                <div className="flex items-start gap-2.5">
                  <div className="h-5 w-5 rounded-full bg-[#0B4BE3] text-white flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                    1
                  </div>
                  <p>
                    Abre tu correo (revisa también tu carpeta de Spam) y haz clic en <strong>Confirm your mail</strong>.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="h-5 w-5 rounded-full bg-[#0B4BE3] text-white flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                    2
                  </div>
                  <p>
                    Tu negocio <strong>{name}</strong> se activará automáticamente y entrarás directamente a tu panel de control sin tener que volver a crearlo.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <Link
                  to="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0EA5E9] to-[#0B4BE3] px-6 py-3 text-xs sm:text-sm font-bold text-white shadow-glow-cobalt hover:brightness-105 transition"
                >
                  <span>Ir a Iniciar Sesión</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => setEmailConfirmationNotice(false)}
                  className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-5 py-3 text-xs font-bold text-slate-700 transition"
                >
                  Revisar datos ingresados
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Form Card */}
            <form onSubmit={handleLaunch} className="lg:col-span-7 glass-card-light rounded-3xl p-6 sm:p-8">
              {user && myTenants.length === 0 && (
                <div className="mb-5 rounded-2xl bg-blue-50 border border-blue-200 p-4 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900">Sesión iniciada: {user.email}</div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      Aún no tienes un negocio vinculado. Configura el primero abajo o verifica si ya te asignaron uno.
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={checkingLink}
                    onClick={async () => {
                      setCheckingLink(true);
                      try {
                        await refreshData();
                      } finally {
                        setCheckingLink(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B4BE3] hover:bg-blue-700 text-white px-3 py-2 text-[11px] font-bold transition disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checkingLink ? 'animate-spin' : ''}`} />
                    <span>Verificar vinculación</span>
                  </button>
                </div>
              )}
              <div className="mb-6">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#0B4BE3]">
                  Paso {step} de 3 · Prueba Gratis de 14 Días
                </span>
                <h1 className="font-display text-2xl font-extrabold text-slate-900 mt-1">
                  {step === 1 && 'Configura la identidad de tu negocio'}
                  {step === 2 && 'Elige tu motor de fidelización'}
                  {step === 3 && 'Geofencing GPS y activación de cuenta'}
                </h1>
              </div>

              {errorMsg && (
                <div className="mb-5 rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs font-semibold text-rose-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

          {/* STEP 1 */}
          {step === 1 && (
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nombre Comercial del Negocio *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Ej. Café Central"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#0B4BE3]/30 focus:border-[#0B4BE3]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Enlace de tu Tarjeta Digital y QR *
                </label>
                <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
                  <span className="text-slate-400 font-mono">/tap/</span>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="cafe-central"
                    className="flex-1 bg-transparent font-mono font-bold text-[#0B4BE3] focus:outline-none ml-1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Logo del Negocio (opcional)
                </label>
                <div className="flex flex-wrap items-center gap-4">
                  <label
                    className={`cursor-pointer inline-flex items-center gap-2.5 rounded-xl border-2 border-dashed border-slate-300 hover:border-[#0B4BE3] bg-slate-50/70 px-4 py-3 text-xs font-bold text-slate-700 transition ${
                      logoUploading ? 'opacity-60 pointer-events-none' : ''
                    }`}
                  >
                    {logoUploading ? (
                      <Loader2 className="w-4 h-4 text-[#0B4BE3] animate-spin" />
                    ) : (
                      <ImagePlus className="w-4 h-4 text-[#0B4BE3]" />
                    )}
                    <span>
                      {logoUploading
                        ? 'Subiendo logo...'
                        : logoFile
                        ? logoFile.name
                        : 'Subir Logo (PNG/JPG/WEBP)'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={logoUploading}
                      onChange={handleLogoSelect}
                      className="hidden"
                    />
                  </label>
                  {uploadedLogoUrl && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                      Logo cargado ✓
                    </span>
                  )}
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setLogoUrl(null);
                        setUploadedLogoUrl(null);
                        setLogoFile(null);
                      }}
                      className="text-xs font-semibold text-rose-500 hover:underline"
                    >
                      Quitar imagen
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Color Corporativo de Tarjeta
                </label>
                <div className="flex flex-wrap items-center gap-2.5">
                  {BRAND_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setBrandColor(c.hex)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        brandColor === c.hex
                          ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="h-3.5 w-3.5 rounded-full border border-white/40" style={{ backgroundColor: c.hex }} />
                      <span>{c.name}</span>
                    </button>
                  ))}
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-9 w-11 rounded-lg border border-slate-200 cursor-pointer"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.values(LOYALTY_PLANS_META).map((plan) => {
                  const Icon = planIcons[plan.type];
                  const selected = planType === plan.type;
                  return (
                    <button
                      key={plan.type}
                      type="button"
                      onClick={() => handleSelectPlan(plan.type)}
                      className={`text-left rounded-2xl border p-4 transition-all ${
                        selected
                          ? 'border-[#0B4BE3] bg-blue-50/70 ring-2 ring-[#0B4BE3]/20'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className="h-9 w-9 rounded-xl flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: plan.badgeColor }}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            plan.isAutomatic ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {plan.isAutomatic ? 'Tap Automático' : 'Aprobación Cajero'}
                        </span>
                      </div>
                      <h3 className="font-display font-bold text-sm text-slate-900 mt-3">{plan.name}</h3>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{plan.recommendedCopy}</p>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 sm:p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nombre del Programa</label>
                  <input
                    type="text"
                    value={programName}
                    onChange={(e) => setProgramName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold"
                  />
                </div>

                {planType === 'stamps' && (
                  <div>
                    <TouchNumberInput
                      label="Meta de Sellos para Recompensa"
                      value={rules.goal ?? 10}
                      onChange={(v) => setRules({ ...rules, goal: v })}
                      min={3}
                      max={30}
                      step={1}
                      suffix="sellos"
                      presets={[5, 8, 10, 12]}
                      helperText="Cantidad de visitas requeridas para llenar la tarjeta y ganar el beneficio."
                    />
                  </div>
                )}

                {planType === 'points' && (
                  <div className="space-y-4 pt-1 border-t border-slate-200/60">
                    <TouchNumberInput
                      label="Meta de Puntos para Recompensa"
                      value={rules.goal_points ?? 500}
                      onChange={(v) => setRules({ ...rules, goal_points: v })}
                      min={50}
                      max={10000}
                      step={50}
                      suffix="pts"
                      presets={[100, 250, 500, 1000, 2000]}
                      helperText="Puntos requeridos para canjear el premio. Toca un botón rápido o usa [+] y [-]."
                    />

                    <TouchNumberInput
                      label="Puntos por Visita / Compra"
                      value={rules.points_per_visit ?? 50}
                      onChange={(v) => setRules({ ...rules, points_per_visit: v })}
                      min={5}
                      max={2000}
                      step={10}
                      suffix="pts"
                      presets={[10, 20, 50, 100]}
                      helperText="Puntos otorgados al cliente en cada escaneo de código QR en caja."
                    />
                  </div>
                )}

                {planType === 'discount' && (
                  <div className="space-y-4 pt-1 border-t border-slate-200/60">
                    <TouchNumberInput
                      label="Meta de Gasto Acumulado"
                      value={rules.target_spend ?? 1000}
                      onChange={(v) => setRules({ ...rules, target_spend: v })}
                      min={50}
                      max={50000}
                      step={100}
                      suffix="Bs"
                      presets={[200, 500, 1000, 2000]}
                    />
                    <TouchNumberInput
                      label="% de Descuento Otorgado"
                      value={rules.discount_percent ?? 20}
                      onChange={(v) => setRules({ ...rules, discount_percent: v })}
                      min={5}
                      max={90}
                      step={5}
                      suffix="%"
                      presets={[10, 15, 20, 25, 30]}
                    />
                  </div>
                )}

                {planType === 'cashback' && (
                  <div className="pt-1 border-t border-slate-200/60">
                    <TouchNumberInput
                      label="% de Cashback Acumulable"
                      value={rules.cashback_percent ?? 10}
                      onChange={(v) => setRules({ ...rules, cashback_percent: v })}
                      min={1}
                      max={50}
                      step={1}
                      suffix="%"
                      presets={[5, 10, 15, 20]}
                    />
                  </div>
                )}

                {planType === 'subscription' && (
                  <div className="pt-1 border-t border-slate-200/60">
                    <TouchNumberInput
                      label="Visitas Mensuales Incluidas"
                      value={rules.monthly_visits ?? 4}
                      onChange={(v) => setRules({ ...rules, monthly_visits: v })}
                      min={1}
                      max={31}
                      step={1}
                      suffix="visitas"
                      presets={[2, 4, 8, 12]}
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200/60">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#FF7A00]" />
                      <span>Cooldown Antifraude</span>
                    </label>
                    <select
                      value={rules.cooldown_hours}
                      onChange={(e) => setRules({ ...rules, cooldown_hours: Number(e.target.value) })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold"
                    >
                      <option value={0}>Sin espera (0 horas)</option>
                      <option value={1}>1 hora</option>
                      <option value={2}>2 horas</option>
                      <option value={4}>4 horas (Recomendado)</option>
                      <option value={12}>12 horas</option>
                      <option value={24}>24 horas</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Premio / Beneficio *</label>
                    <input
                      type="text"
                      required
                      value={rules.reward}
                      onChange={(e) => setRules({ ...rules, reward: e.target.value })}
                      placeholder="Ej. 1 Café Americano Gratis"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
              <div className="rounded-2xl bg-white border border-slate-200/90 p-4 sm:p-5 space-y-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-[#0B4BE3]/10 text-[#0B4BE3] flex items-center justify-center">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-800">
                        Ubicación del Local en Bolivia *
                      </label>
                      <p className="text-[11px] text-slate-500">
                        Radar antifraude GPS para validar visitas presenciales
                      </p>
                    </div>
                  </div>
                  {lat !== null && lng !== null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                      <Check className="w-3.5 h-3.5" /> Fijado
                    </span>
                  )}
                </div>

                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-slate-800">
                      {lat !== null && lng !== null
                        ? `Coordenadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}`
                        : 'Aún no has fijado la ubicación de tu local en el mapa.'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {lat !== null && lng !== null
                        ? 'Radar activo: 120 metros alrededor del punto marcado'
                        : 'Requerido para que los clientes registren sus visitas'}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setTempLat(lat);
                      setTempLng(lng);
                      setShowMapModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0EA5E9] to-[#0B4BE3] px-4 py-2 text-xs font-bold text-white shadow-sm hover:brightness-105 transition"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{lat !== null ? 'Cambiar en Mapa' : 'Abrir Selector de Mapa'}</span>
                  </button>
                </div>
              </div>

              {!user && (
                <div className="rounded-2xl bg-blue-50/70 border border-blue-200 p-4 sm:p-5 space-y-3">
                  <div className="text-xs font-extrabold text-slate-900">
                    Crea tus credenciales para administrar tu negocio (14 días gratis)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="correo@negocio.com"
                        className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm font-semibold"
                      />
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Contraseña (6+ caract.)"
                        className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm font-semibold"
                      />
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Footer Buttons */}
          <div className="mt-8 pt-5 border-t border-slate-200/80 flex items-center justify-between gap-3">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((step - 1) as 1 | 2)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Atrás</span>
              </button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <button
                type="button"
                disabled={checkingDuplicate}
                onClick={async () => {
                  if (step === 1) {
                    if (!name.trim() || !slug.trim()) {
                      setErrorMsg('Ingresa el nombre y URL de tu negocio para continuar.');
                      return;
                    }
                    setErrorMsg(null);
                    setCheckingDuplicate(true);
                    try {
                      const cleanName = name.trim();
                      const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
                      const { data: existing } = await supabase
                        .from('tenants')
                        .select('id, name, slug')
                        .or(`name.ilike.${cleanName},slug.eq.${cleanSlug}`)
                        .limit(1)
                        .maybeSingle();

                      if (existing) {
                        const isSameName = existing.name.toLowerCase() === cleanName.toLowerCase();
                        setErrorMsg(
                          isSameName
                            ? `Ya existe un negocio registrado con el nombre "${existing.name}". Por favor elige otro nombre comercial.`
                            : `El enlace "/tap/${cleanSlug}" ya está registrado por otro negocio. Por favor elige otro nombre o URL.`
                        );
                        return;
                      }
                    } catch (err) {
                      console.warn('Error verificando nombre duplicado:', err);
                    } finally {
                      setCheckingDuplicate(false);
                    }
                  }
                  setErrorMsg(null);
                  setStep((step + 1) as 2 | 3);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0EA5E9] to-[#0B4BE3] px-6 py-3 text-xs sm:text-sm font-extrabold text-white shadow-glow-cobalt hover:brightness-105 disabled:opacity-60 transition"
              >
                <span>{checkingDuplicate ? 'Verificando nombre...' : 'Siguiente Paso'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting || lat === null || lng === null}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF7A00] to-[#F59E0B] px-6 py-3 text-xs sm:text-sm font-extrabold text-white shadow-glow-amber hover:brightness-105 disabled:opacity-60 transition"
              >
                <Rocket className="w-4 h-4" />
                <span>{submitting ? 'Activando...' : 'Iniciar Prueba Gratis de 14 Días'}</span>
              </button>
            )}
          </div>
        </form>

        {/* Live Card Preview */}
        <div className="lg:col-span-5 lg:sticky lg:top-8 space-y-4">
          <div className="rounded-3xl bg-[#090D16] p-6 text-white shadow-2xl border border-white/10">
            <div className="flex items-center justify-between text-xs mb-4">
              <span className="inline-flex items-center gap-1.5 font-bold text-[#0EA5E9]">
                <Sparkles className="w-3.5 h-3.5 text-[#FF7A00]" />
                <span>Previsualización de Tarjeta</span>
              </span>
              <span className="text-slate-400">Google Wallet + iOS PWA</span>
            </div>

            <DigitalPassCard
              tenant={{
                name: name || 'Tu Negocio',
                logo_url: logoUrl,
                brand_color: brandColor,
                slug: slug || 'tu-negocio',
              }}
              program={{ type: planType, name: programName, rules }}
              card={{ current_balance: previewBalance }}
              customer={{ full_name: 'Cliente VIP' }}
            />

            <div className="mt-5 rounded-2xl bg-white/5 border border-white/10 p-4 space-y-2 text-xs text-slate-300">
              <div className="flex items-center justify-between">
                <span>Motor:</span>
                <strong className="text-white">{LOYALTY_PLANS_META[planType].name}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Antifraude Cooldown:</span>
                <strong className="text-white">{rules.cooldown_hours} horas</strong>
              </div>
              <div className="pt-2 border-t border-white/10 flex items-center gap-2 text-emerald-400 font-semibold">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>14 días gratis · Sin tarjeta de crédito para iniciar</span>
              </div>
            </div>
          </div>

          <div className="text-center">
            <PoweredByBlockOps />
          </div>
        </div>
      </div>
    )}
  </div>

      {showMapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-2xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-[#0B4BE3]/10 text-[#0B4BE3] flex items-center justify-center">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-sm text-slate-900">
                    Fijar Ubicación del Local
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Haz clic en el mapa, busca tu zona o usa el GPS
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMapModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-hidden">
              <BoliviaLocationPicker
                lat={tempLat}
                lng={tempLng}
                heightClassName="h-72 sm:h-80"
                onChange={(nextLat, nextLng) => {
                  setTempLat(nextLat);
                  setTempLng(nextLng);
                }}
              />
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                {tempLat !== null && tempLng !== null ? (
                  <span className="font-semibold text-slate-700">
                    Punto: {tempLat.toFixed(5)}, {tempLng.toFixed(5)}
                  </span>
                ) : (
                  'Selecciona un punto en el mapa'
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowMapModal(false)}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={tempLat === null || tempLng === null}
                  onClick={() => {
                    setLat(tempLat);
                    setLng(tempLng);
                    setShowMapModal(false);
                  }}
                  className="rounded-xl bg-[#0B4BE3] hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50"
                >
                  Guardar Ubicación
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
