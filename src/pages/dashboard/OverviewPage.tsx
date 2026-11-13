import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowRight,
  Award,
  BarChart3,
  Bell,
  Check,
  Gift,
  Percent,
  QrCode,
  Send,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { DigitalPassCard } from '../../components/wallet/DigitalPassCard';
import { useApp } from '../../context/AppContext';
import { getPublicTapUrl } from '../../lib/supabase';
import { LOYALTY_PLANS_META } from '../../types/loyalty';
import { formatBoliviaDate, formatBs } from '../../utils/bolivia';

export const OverviewPage: React.FC = () => {
  const { activeTenant, cards, transactions, resolveTransaction } = useApp();

  const [chartRange, setChartRange] = useState<'30d' | '90d' | '1y'>('30d');
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);

  const pendingRequests = useMemo(
    () => transactions.filter((t) => t.status === 'pending_approval'),
    [transactions]
  );

  // Real metrics from Supabase
  const totalCustomers = cards.length;
  const nowMs = Date.now();
  const thirtyDaysAgo = nowMs - 30 * 86400 * 1000;

  const monthlyVisits = useMemo(
    () =>
      transactions.filter(
        (t) =>
          t.status === 'completed' &&
          (t.type === 'earn' || t.type === 'adjust') &&
          new Date(t.created_at).getTime() >= thirtyDaysAgo
      ).length,
    [transactions, thirtyDaysAgo]
  );

  const totalRewardsRedeemed = useMemo(
    () =>
      transactions.filter((t) => t.status === 'completed' && t.type === 'redeem').length,
    [transactions]
  );

  const googleWalletCount = useMemo(
    () => cards.filter((c) => c.google_object_id !== null && Boolean(c.google_object_id)).length,
    [cards]
  );

  const walletAdoptionPct = useMemo(() => {
    if (cards.length === 0) return 0;
    return Math.round((googleWalletCount / cards.length) * 100);
  }, [cards.length, googleWalletCount]);

  // Real chart series grouped from card_transactions
  const chartSeries = useMemo(() => {
    const buckets = chartRange === '30d' ? 10 : chartRange === '90d' ? 8 : 12;
    const windowDays = chartRange === '30d' ? 30 : chartRange === '90d' ? 90 : 365;
    const stepMs = (windowDays * 86400 * 1000) / buckets;
    const startMs = nowMs - windowDays * 86400 * 1000;

    return Array.from({ length: buckets }).map((_, idx) => {
      const bucketStart = startMs + idx * stepMs;
      const bucketEnd = bucketStart + stepMs;
      const count = transactions.filter((t) => {
        const ts = new Date(t.created_at).getTime();
        return t.status === 'completed' && ts >= bucketStart && ts < bucketEnd;
      }).length;

      const labelDate = new Date(bucketEnd);
      const label =
        chartRange === '1y'
          ? formatBoliviaDate(labelDate, { month: 'short' })
          : formatBoliviaDate(labelDate, { day: '2-digit', month: 'short' });

      return { label, visits: count };
    });
  }, [transactions, chartRange, nowMs]);

  if (!activeTenant || !activeTenant.program) return null;

  const maxVal = Math.max(5, ...chartSeries.map((s) => s.visits)) * 1.15;
  const chartW = 680;
  const chartH = 210;
  const padX = 28;
  const padY = 24;

  const coords = chartSeries.map((pt, i) => {
    const x = padX + (i / Math.max(1, chartSeries.length - 1)) * (chartW - padX * 2);
    const y = chartH - padY - (pt.visits / maxVal) * (chartH - padY * 2);
    return { ...pt, x, y };
  });

  const linePath = coords
    .map((pt, i, arr) => {
      if (i === 0) return `M ${pt.x} ${pt.y}`;
      const prev = arr[i - 1];
      const cx = (prev.x + pt.x) / 2;
      return `C ${cx} ${prev.y}, ${cx} ${pt.y}, ${pt.x} ${pt.y}`;
    })
    .join(' ');

  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${chartH - padY} L ${
    coords[0].x
  } ${chartH - padY} Z`;

  const highlightedIdx = hoveredPointIdx !== null ? hoveredPointIdx : coords.length - 1;
  const activePoint = coords[highlightedIdx] || coords[coords.length - 1];

  const tapUrl = getPublicTapUrl(activeTenant.slug);
  const planMeta = LOYALTY_PLANS_META[activeTenant.program.type];
  const sampleCard = cards[0];

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto">
      {/* 4 Vibrant KPI Cards (100% Real Data) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        <motion.div
          whileHover={{ y: -2 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0EA5E9] to-[#0B4BE3] p-5 text-white shadow-glow-cobalt"
        >
          <Users className="absolute -right-3 -bottom-3 w-24 h-24 text-white/10" />
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-100">
            <Users className="w-4 h-4" />
            <span>Clientes Totales</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2.5">
            <span className="font-display text-3xl font-extrabold tracking-tight">
              {totalCustomers.toLocaleString()}
            </span>
            <span className="text-xs font-semibold text-blue-100">
              {googleWalletCount} registrados en Google Wallet
            </span>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -2 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#FF7A00] to-[#F59E0B] p-5 text-white shadow-glow-amber"
        >
          <Star className="absolute -right-3 -bottom-3 w-24 h-24 text-white/15 fill-white/10" />
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-50">
            <Star className="w-4 h-4 fill-white" />
            <span>Visitas del Mes</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2.5">
            <span className="font-display text-3xl font-extrabold tracking-tight">
              {monthlyVisits.toLocaleString()}
            </span>
            <span className="text-xs font-semibold text-amber-50">últimos 30 días</span>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -2 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] p-5 text-white shadow-[0_12px_28px_-10px_rgba(99,102,241,0.45)]"
        >
          <Gift className="absolute -right-3 -bottom-3 w-24 h-24 text-white/10" />
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-100">
            <Gift className="w-4 h-4" />
            <span>Premios Canjeados</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2.5">
            <span className="font-display text-3xl font-extrabold tracking-tight">
              {totalRewardsRedeemed.toLocaleString()}
            </span>
            <span className="text-xs font-semibold text-indigo-100">histórico</span>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -2 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#10B981] to-[#059669] p-5 text-white shadow-[0_12px_28px_-10px_rgba(16,185,129,0.42)]"
        >
          <TrendingUp className="absolute -right-3 -bottom-3 w-24 h-24 text-white/10" />
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-100">
            <TrendingUp className="w-4 h-4" />
            <span>Adopción Google Wallet</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2.5">
            <span className="font-display text-3xl font-extrabold tracking-tight">
              {walletAdoptionPct}%
            </span>
            <span className="text-xs font-semibold text-emerald-100">
              {googleWalletCount} de {totalCustomers} tarjetas
            </span>
          </div>
        </motion.div>
      </div>

      {/* Middle Row: Real Activity Chart + Live Pending Approvals */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 glass-card-light rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-[#0B4BE3]/10 text-[#0B4BE3] flex items-center justify-center">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
                  Actividad de Clientes
                </h2>
                <p className="text-xs text-slate-500">
                  Movimientos completados en tiempo real
                </p>
              </div>
            </div>

            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
              {[
                { key: '30d', label: '30 días' },
                { key: '90d', label: '90 días' },
                { key: '1y', label: '1 año' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setChartRange(tab.key as '30d' | '90d' | '1y');
                    setHoveredPointIdx(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    chartRange === tab.key
                      ? 'bg-[#0B4BE3] text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative w-full overflow-hidden">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-56 sm:h-64 overflow-visible">
              <defs>
                <linearGradient id="areaCobalt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#0B4BE3" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {[0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = chartH - padY - ratio * (chartH - padY * 2);
                const labelVal = Math.round(maxVal * ratio);
                return (
                  <g key={idx}>
                    <line x1={padX} y1={y} x2={chartW - padX} y2={y} stroke="#E2E8F0" strokeDasharray="4 4" />
                    <text x={0} y={y + 4} className="fill-slate-400 text-[11px] font-medium">
                      {labelVal}
                    </text>
                  </g>
                );
              })}

              <path d={areaPath} fill="url(#areaCobalt)" />
              <path d={linePath} fill="none" stroke="#0B4BE3" strokeWidth="3" strokeLinecap="round" />

              {activePoint && (
                <line
                  x1={activePoint.x}
                  y1={activePoint.y}
                  x2={activePoint.x}
                  y2={chartH - padY}
                  stroke="#0B4BE3"
                  strokeOpacity="0.35"
                  strokeDasharray="4 4"
                />
              )}

              {coords.map((pt, i) => {
                const isActive = i === highlightedIdx;
                return (
                  <g key={pt.label + i} className="cursor-pointer" onMouseEnter={() => setHoveredPointIdx(i)}>
                    <circle cx={pt.x} cy={pt.y} r={14} fill="transparent" />
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isActive ? 6 : 4}
                      fill={isActive ? '#0B4BE3' : '#FFFFFF'}
                      stroke="#0B4BE3"
                      strokeWidth="2.5"
                    />
                    <text x={pt.x} y={chartH - 4} textAnchor="middle" className="fill-slate-400 text-[11px] font-medium">
                      {pt.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {activePoint && (
              <div
                style={{
                  left: `${(activePoint.x / chartW) * 100}%`,
                  top: `${Math.max(4, (activePoint.y / chartH) * 100 - 16)}%`,
                }}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-xl bg-white border border-slate-200 px-3 py-1.5 shadow-lg text-xs font-bold text-slate-800 whitespace-nowrap flex items-center gap-1.5"
              >
                <span className="h-2 w-2 rounded-full bg-[#0B4BE3]" />
                <span>{activePoint.visits} visitas</span>
              </div>
            )}
          </div>
        </div>

        {/* Live Pending Approvals */}
        <div className="lg:col-span-4 glass-card-light rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-[#FF7A00] flex items-center justify-center">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Solicitudes Pendientes
                  </h2>
                  <p className="text-[11px] text-slate-500">Bandeja Realtime de mostrador</p>
                </div>
              </div>
              <span className="h-6 min-w-6 px-2 rounded-full bg-[#FF7A00] text-white text-xs font-extrabold flex items-center justify-center shadow-sm">
                {pendingRequests.length}
              </span>
            </div>

            <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
              <AnimatePresence mode="popLayout">
                {pendingRequests.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center"
                  >
                    <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-700">Sin solicitudes pendientes</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Cuando un cliente envíe un ticket de compra o solicite canje desde{' '}
                      <code>/tap/{activeTenant.slug}</code>, sonará aquí al instante.
                    </p>
                  </motion.div>
                ) : (
                  pendingRequests.map((req) => {
                    const isRedeem = req.type === 'redeem';
                    const isCashback = activeTenant.program?.type === 'cashback';
                    return (
                      <motion.div
                        key={req.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        className="rounded-xl bg-white border border-slate-200/85 p-3 shadow-sm flex items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-white ${
                              isRedeem ? 'bg-[#0B4BE3]' : isCashback ? 'bg-[#0EA5E9]' : 'bg-[#FF7A00]'
                            }`}
                          >
                            {isRedeem ? (
                              <Gift className="w-4 h-4" />
                            ) : isCashback ? (
                              <Wallet className="w-4 h-4" />
                            ) : (
                              <Percent className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate">
                              {req.notes || (isRedeem ? 'Canje de Premio' : 'Compra por aprobar')}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              Cliente: <strong className="text-slate-700">{req.customer_name}</strong>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs font-extrabold text-slate-900 mr-1">
                            {isRedeem
                              ? '1 Premio'
                              : req.purchase_amount > 0
                              ? formatBs(req.purchase_amount)
                              : `+${req.delta_value} ${
                                  activeTenant.program?.type === 'points' ? 'pts' : 'visita'
                                }`}
                          </span>
                          <button
                            type="button"
                            onClick={() => resolveTransaction(req.id, 'completed')}
                            title="Aprobar con 1 clic"
                            className="h-7 w-7 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-sm transition"
                          >
                            <Check className="w-4 h-4 stroke-[2.5]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => resolveTransaction(req.id, 'rejected')}
                            title="Rechazar"
                            className="h-7 w-7 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center shadow-sm transition"
                          >
                            <X className="w-4 h-4 stroke-[2.5]" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end">
            <Link
              to="/dashboard/customers"
              className="text-xs font-semibold text-[#0B4BE3] hover:underline inline-flex items-center gap-1"
            >
              <span>Ver todos los clientes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 glass-card-light rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center">
                <Award className="w-4 h-4" />
              </div>
              <h3 className="font-display text-base font-bold text-slate-900">
                Tu Programa de Fidelización
              </h3>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
              <Check className="w-3 h-3" /> Activo
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div>
              <DigitalPassCard
                tenant={activeTenant}
                program={activeTenant.program}
                card={sampleCard || { current_balance: 0 }}
                customer={sampleCard?.customer || { full_name: 'Tu Cliente' }}
                compact
                tilted
              />
            </div>
            <div className="space-y-3">
              <div>
                <div className="inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-900">
                  <Star className="w-4 h-4 text-[#F59E0B] fill-[#F59E0B]" />
                  <span>{planMeta.name}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {activeTenant.program.rules.description || planMeta.recommendedCopy}
                </p>
              </div>

              <div className="rounded-xl bg-amber-50 border border-amber-200/70 p-2.5 text-xs text-amber-900">
                <div className="font-bold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-[#FF7A00]" />
                  <span>Premio: {activeTenant.program.rules.reward}</span>
                </div>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Cooldown: {activeTenant.program.rules.cooldown_hours}h · Radar GPS: {activeTenant.program.rules.gps_radius_meters ?? 120}m · Validación:{' '}
                  <strong>
                    {activeTenant.program.rules.validation_mode === 'approval'
                      ? 'Aprobación en caja'
                      : activeTenant.program.rules.validation_mode === 'pin'
                      ? 'PIN de mostrador'
                      : 'Automática'}
                  </strong>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 glass-card-light rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-[#0B4BE3]/10 text-[#0B4BE3] flex items-center justify-center">
                <QrCode className="w-4 h-4" />
              </div>
              <h3 className="font-display text-base font-bold text-slate-900">Póster de Mostrador</h3>
            </div>
            <Link
              to="/dashboard/qr-nfc"
              className="inline-flex items-center gap-1 rounded-xl bg-[#0B4BE3] hover:bg-blue-700 px-3 py-1.5 text-xs font-bold text-white transition"
            >
              <span>Ver Póster</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-sm shrink-0">
              <QRCodeSVG value={tapUrl} size={92} fgColor="#090D16" bgColor="#FFFFFF" />
            </div>

            <div className="space-y-2 text-xs min-w-0">
              <div className="flex items-center gap-2 text-slate-700 font-medium">
                <span className="h-4 w-4 rounded-full bg-[#0B4BE3]/10 text-[#0B4BE3] flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5" />
                </span>
                <span>Póster imprimible listo</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700 font-medium">
                <span className="h-4 w-4 rounded-full bg-[#0B4BE3]/10 text-[#0B4BE3] flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5" />
                </span>
                <span>Insignia "Acerca tu celular"</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700 font-medium">
                <span className="h-4 w-4 rounded-full bg-[#0B4BE3]/10 text-[#0B4BE3] flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5" />
                </span>
                <span className="truncate font-mono text-[11px] text-[#0B4BE3]">
                  /tap/{activeTenant.slug}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-amber-50/80 border border-amber-200/60 px-3 py-2 text-[11px] font-medium text-amber-900">
            Coloca el póster impreso en tu mostrador para registrar y fidelizar clientes en caja.
          </div>
        </div>

        <div className="lg:col-span-3 relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0EA5E9] via-[#0B4BE3] to-[#1E3A8A] p-5 text-white shadow-glow-cobalt flex flex-col justify-between">
          <div className="relative z-10">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-bold uppercase tracking-wider mb-2">
              <Send className="w-3 h-3" /> Google Wallet Push
            </span>
            <h3 className="font-display text-lg font-extrabold leading-snug">
              Envía una Campaña a tus Clientes
            </h3>
            <p className="text-xs text-blue-100 mt-1.5 leading-relaxed">
              Promociona 2x1 o descuentos directo en la pantalla bloqueada sin pagar SMS.
            </p>
          </div>

          <Link
            to="/dashboard/campaigns"
            className="relative z-10 mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-white text-[#0B4BE3] px-4 py-2.5 text-xs font-extrabold shadow-lg hover:bg-blue-50 transition w-fit"
          >
            <span>Crear Campaña</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};
