import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Crown,
  LogIn,
  MapPin,
  Nfc,
  Percent,
  ShieldCheck,
  Sparkles,
  Star,
  Wallet,
  Wand2,
} from 'lucide-react';
import { BlockOpsLogo, PoweredByBlockOps } from '../components/brand/BlockOpsLogo';
import { DigitalPassCard } from '../components/wallet/DigitalPassCard';
import { useApp } from '../context/AppContext';
import { LOYALTY_PLANS_META } from '../types/loyalty';

export const LandingPage: React.FC = () => {
  const { user, isSuperAdmin, myTenants, tenantsLoaded } = useApp();
  const panelPath =
    isSuperAdmin && myTenants.length === 0
      ? '/admin'
      : tenantsLoaded && myTenants.length === 0
      ? '/onboarding'
      : '/dashboard';

  const engines = [
    { ...LOYALTY_PLANS_META.stamps, icon: Star },
    { ...LOYALTY_PLANS_META.discount, icon: Percent },
    { ...LOYALTY_PLANS_META.points, icon: Award },
    { ...LOYALTY_PLANS_META.cashback, icon: Wallet },
    { ...LOYALTY_PLANS_META.subscription, icon: Crown },
  ];

  return (
    <div className="min-h-screen bg-[#090D16] text-white bg-isometric-dark relative overflow-x-hidden">
      {/* Navbar */}
      <header className="border-b border-white/10 bg-[#090D16]/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <BlockOpsLogo size={36} showWordmark subtitle="Loyalty" theme="dark" />

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
            <a href="#motores" className="hover:text-white transition">
              Planes de Fidelización
            </a>
            <a href="#como-funciona" className="hover:text-white transition">
              Tap-to-Earn NFC
            </a>
            <Link to={user ? panelPath : '/onboarding'} className="hover:text-white transition">
              {user ? 'Mi Panel' : 'Crear Mi Tarjeta'}
            </Link>
          </nav>

          <div className="flex items-center gap-2.5">
            {user ? (
              <Link
                to={panelPath}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0EA5E9] to-[#0B4BE3] px-4 py-2 text-xs font-extrabold text-white shadow-glow-cobalt hover:brightness-110 transition"
              >
                <span>{isSuperAdmin && myTenants.length === 0 ? 'Ir a SuperAdmin' : 'Ir a Mi Panel'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs font-bold text-white transition"
                >
                  <LogIn className="w-3.5 h-3.5 text-[#0EA5E9]" />
                  <span>Iniciar Sesión</span>
                </Link>
                <Link
                  to="/onboarding"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#FF7A00] to-[#F59E0B] px-4 py-2 text-xs font-extrabold text-white shadow-glow-amber hover:brightness-110 transition"
                >
                  <span>Prueba 14 Días Gratis</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 pt-12 pb-16 lg:pt-20 lg:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="lg:col-span-7 space-y-6"
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-[#0B4BE3]/20 border border-[#0EA5E9]/35 px-3.5 py-1.5 text-xs font-bold text-[#0EA5E9]">
              <Sparkles className="w-3.5 h-3.5 text-[#FF7A00]" />
              <span>Google Wallet Nativo + Web Pass PWA (iOS) · Prueba Gratis 14 Días</span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.08]">
              Fidelización{' '}
              <span className="bg-gradient-to-r from-[#0EA5E9] via-[#38BDF8] to-[#0B4BE3] bg-clip-text text-transparent">
                Tap-to-Earn
              </span>{' '}
              para comercios modernos.
            </h1>

            <p className="text-base sm:text-lg text-slate-300 max-w-2xl leading-relaxed">
              Tus clientes solo acercan su celular al sticker NFC o código QR de tu mostrador.
              Guardan su tarjeta de tu negocio en <strong className="text-white">Google Wallet</strong>{' '}
              o <strong className="text-white">iPhone PWA</strong> en 5 segundos y reciben sellos,
              cashback, puntos o avisos automáticos por ubicación.
            </p>

            <div className="flex flex-wrap items-center gap-3.5 pt-2">
              {user ? (
                <Link
                  to={panelPath}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#0EA5E9] to-[#0B4BE3] px-6 py-3.5 text-sm font-extrabold text-white shadow-glow-cobalt hover:brightness-110 transition"
                >
                  <span>
                    {isSuperAdmin && myTenants.length === 0
                      ? 'Abrir Panel SuperAdmin'
                      : 'Ir a Mi Panel de Control'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <>
                  <Link
                    to="/onboarding"
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#FF7A00] to-[#F59E0B] px-6 py-3.5 text-sm font-extrabold text-white shadow-glow-amber hover:brightness-110 transition"
                  >
                    <Wand2 className="w-4 h-4" />
                    <span>Empezar Prueba de 14 Días Gratis</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>

                  <Link
                    to="/login"
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 px-6 py-3.5 text-sm font-bold text-white transition"
                  >
                    <span>Ya tengo cuenta</span>
                  </Link>
                </>
              )}
            </div>

            <div className="pt-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>14 días de prueba sin tarjeta</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#0EA5E9] shrink-0" />
                <span>Geofencing GPS a 150m</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#FF7A00] shrink-0" />
                <span>Antifraude por Cooldown</span>
              </div>
            </div>
          </motion.div>

          {/* Hero Card Preview */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="lg:col-span-5"
          >
            <div className="rounded-3xl bg-[#111827]/90 border border-white/10 p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-white">Así lucirá tu Tarjeta Digital</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-bold">
                  Google Wallet & iOS
                </span>
              </div>
              <DigitalPassCard
                tenant={{
                  name: 'Tu Negocio Aquí',
                  logo_url: null,
                  brand_color: '#0B4BE3',
                  slug: 'tu-negocio',
                }}
                program={{
                  type: 'stamps',
                  name: 'Club de Sellos',
                  rules: LOYALTY_PLANS_META.stamps.defaultRules,
                }}
                card={{ current_balance: 8 }}
                customer={{ full_name: 'Cliente Frecuente' }}
              />
              <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 text-xs text-slate-300 flex items-center gap-3">
                <Nfc className="w-5 h-5 text-[#0EA5E9] shrink-0" />
                <span>
                  El cajero no instala escáneres: el sticker NFC y póster QR en tu mostrador hacen
                  todo el trabajo.
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How it Works */}
      <section id="como-funciona" className="max-w-7xl mx-auto px-4 sm:px-8 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              step: '01',
              title: 'Configura en 60 segundos',
              desc: 'Sube tu logo, elige tu color corporativo, define tu premio y fija la ubicación GPS de tu sucursal.',
            },
            {
              step: '02',
              title: 'Imprime tu QR o graba tu NFC',
              desc: 'Descarga tu póster listo para mostrador y copia tu URL única para cualquier sticker NTAG213/215.',
            },
            {
              step: '03',
              title: 'Fideliza en automático',
              desc: 'Tus clientes acumulan sellos, puntos, cashback o visitas y reciben notificaciones push gratis en Wallet.',
            },
          ].map((item) => (
            <div key={item.step} className="glass-card-dark rounded-2xl p-6">
              <span className="font-display text-2xl font-extrabold text-[#0EA5E9]">
                {item.step}
              </span>
              <h3 className="font-display text-lg font-bold text-white mt-2">{item.title}</h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5 Loyalty Engines */}
      <section id="motores" className="max-w-7xl mx-auto px-4 sm:px-8 pb-24">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold">
            5 Motores de Fidelización incluidos en tu prueba
          </h2>
          <p className="text-sm text-slate-400 mt-2">
            Elige el modelo que mejor convierte para tu industria y cámbialo cuando lo necesites.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {engines.map((eng) => {
            const Icon = eng.icon;
            return (
              <div
                key={eng.type}
                className="glass-card-dark rounded-2xl p-5 flex flex-col justify-between hover:border-[#0EA5E9]/40 transition"
              >
                <div>
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center mb-4 text-white"
                    style={{ backgroundColor: eng.badgeColor }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-display text-base font-bold text-white">{eng.name}</h3>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    {eng.recommendedCopy}
                  </p>
                </div>
                <p className="text-[11px] font-semibold text-[#0EA5E9] mt-4">
                  Ideal: {eng.idealFor}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-14 text-center">
          <PoweredByBlockOps dark />
        </div>
      </section>
    </div>
  );
};
