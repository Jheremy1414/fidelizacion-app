import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Lock, Mail, Sparkles } from 'lucide-react';
import { BlockOpsLogo, PoweredByBlockOps } from '../components/brand/BlockOpsLogo';
import { getAuthenticatedHomePath, useApp } from '../context/AppContext';

interface AuthPageProps {
  mode: 'login' | 'register';
}

export const AuthPage: React.FC<AuthPageProps> = ({ mode }) => {
  const {
    user,
    authLoading,
    tenantsLoaded,
    myTenants,
    isSuperAdmin,
    signIn,
    signUp,
    isSupabaseReady,
  } = useApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const navigate = useNavigate();

  if (authLoading || (user && !tenantsLoaded)) {
    return (
      <div className="min-h-screen bg-[#090D16] text-white flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-[#0EA5E9] animate-spin" />
        <span className="text-xs text-slate-400">Cargando tu panel...</span>
      </div>
    );
  }

  if (user) {
    return (
      <Navigate to={getAuthenticatedHomePath(isSuperAdmin, myTenants.length)} replace />
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!isSupabaseReady) {
      setErrorMsg('Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await signIn(email.trim(), password);
        if (res.error) {
          setErrorMsg(res.error);
        } else if (res.destination) {
          navigate(res.destination, { replace: true });
        }
      } else {
        const { error, needsConfirmation } = await signUp(email.trim(), password);
        if (error) {
          setErrorMsg(error);
        } else if (needsConfirmation) {
          setConfirmationSent(true);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090D16] bg-isometric-dark text-white flex flex-col justify-between p-4 sm:p-8">
      <div className="max-w-6xl w-full mx-auto flex items-center justify-between">
        <Link to={user ? getAuthenticatedHomePath(isSuperAdmin, myTenants.length) : '/'}>
          <BlockOpsLogo size={36} showWordmark subtitle="Loyalty" theme="dark" />
        </Link>
        <Link
          to={mode === 'login' ? '/onboarding' : '/login'}
          className="text-xs font-bold text-[#0EA5E9] hover:underline"
        >
          {mode === 'login' ? 'Crear cuenta (14 días gratis) →' : 'Ya tengo cuenta →'}
        </Link>
      </div>

      <div className="w-full max-w-md mx-auto my-8">
        <div className="glass-card-dark rounded-3xl p-7 sm:p-8 border border-white/10">
          <div className="text-center mb-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0B4BE3]/20 border border-[#0EA5E9]/30 px-3 py-1 text-[11px] font-bold text-[#0EA5E9] mb-3">
              <Sparkles className="w-3.5 h-3.5 text-[#FF7A00]" />
              <span>{mode === 'login' ? 'Acceso para Comercios' : 'Prueba Gratis 14 Días'}</span>
            </span>
            <h1 className="font-display text-2xl font-extrabold">
              {mode === 'login' ? 'Inicia sesión en BlockOps' : 'Crea tu cuenta empresarial'}
            </h1>
            <p className="text-xs text-slate-400 mt-1.5">
              {mode === 'login'
                ? 'Administra tus tarjetas Google Wallet, clientes y campañas push.'
                : 'Sin tarjeta de crédito. Configura tu negocio en menos de 60 segundos.'}
            </p>
          </div>

          {confirmationSent ? (
            <div className="rounded-2xl bg-emerald-500/15 border border-emerald-400/30 p-5 text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h2 className="font-display font-bold text-base">¡Revisa tu correo electrónico!</h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Enviamos un enlace de confirmación a <strong>{email}</strong>. Una vez confirmado,
                inicia sesión para crear tu tarjeta digital y comenzar tus 14 días gratis.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 py-2.5 text-xs font-extrabold text-white transition"
              >
                Ir a Iniciar Sesión
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="rounded-xl bg-rose-500/15 border border-rose-400/30 p-3 text-xs text-rose-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Correo Corporativo
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="dueño@tunegocio.com"
                    className="w-full rounded-xl border border-white/15 bg-[#090D16] pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#0EA5E9]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full rounded-xl border border-white/15 bg-[#090D16] pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#0EA5E9]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-gradient-to-r from-[#0EA5E9] to-[#0B4BE3] py-3.5 text-sm font-extrabold text-white shadow-glow-cobalt hover:brightness-110 disabled:opacity-60 transition flex items-center justify-center gap-2"
              >
                <span>
                  {loading
                    ? 'Procesando...'
                    : mode === 'login'
                    ? 'Entrar al Dashboard'
                    : 'Registrarme (14 Días Gratis)'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="text-center">
        <PoweredByBlockOps dark />
      </div>
    </div>
  );
};

