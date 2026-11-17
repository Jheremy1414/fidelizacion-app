import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Gift, PieChart, Plus, Search, Smartphone, UserPlus, Users, Wallet, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ProgramType, WalletCard } from '../../types/loyalty';
import {
  BOLIVIA_PHONE_PREFIX,
  focusAfterBoliviaPrefix,
  formatBoliviaPhoneInput,
  formatBoliviaDateTime,
  formatBs,
  isValidCustomerPhone,
} from '../../utils/bolivia';

export const CustomersPage: React.FC = () => {
  const {
    activeTenant,
    cards,
    manualAdjustCard,
    redeemCardReward,
    registerManualCustomer,
  } = useApp();

  const [query, setQuery] = useState('');
  const [filterWallet, setFilterWallet] = useState<'all' | 'google' | 'pwa'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState(BOLIVIA_PHONE_PREFIX);
  const [newAge, setNewAge] = useState<number>(25);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const googleWalletCount = useMemo(
    () => cards.filter((c) => c.google_object_id !== null && Boolean(c.google_object_id)).length,
    [cards]
  );

  const webPassCount = useMemo(
    () => cards.filter((c) => c.google_object_id === null || !c.google_object_id).length,
    [cards]
  );

  const ageAnalytics = useMemo(() => {
    const brackets = [
      { id: '14-17', label: '14–17 años', short: '14-17', color: '#38BDF8', min: 14, max: 17, count: 0 },
      { id: '18-24', label: '18–24 años', short: '18-24', color: '#0B4BE3', min: 18, max: 24, count: 0 },
      { id: '25-34', label: '25–34 años', short: '25-34', color: '#6366F1', min: 25, max: 34, count: 0 },
      { id: '35-44', label: '35–44 años', short: '35-44', color: '#FF7A00', min: 35, max: 44, count: 0 },
      { id: '45-54', label: '45–54 años', short: '45-54', color: '#10B981', min: 45, max: 54, count: 0 },
      { id: '55+', label: '55+ años', short: '55+', color: '#8B5CF6', min: 55, max: 120, count: 0 },
    ];

    const ages: number[] = [];
    cards.forEach((card) => {
      const a = card.customer?.age;
      if (typeof a === 'number' && Number.isFinite(a) && a >= 10 && a <= 110) {
        ages.push(a);
        const target = brackets.find((b) => a >= b.min && a <= b.max) || brackets[brackets.length - 1];
        target.count += 1;
      }
    });

    const totalWithAge = ages.length;
    const avgAge = totalWithAge > 0 ? Math.round(ages.reduce((s, v) => s + v, 0) / totalWithAge) : null;
    const maxCount = Math.max(1, ...brackets.map((b) => b.count));
    const mappedBrackets = brackets.map((b) => ({
      ...b,
      pct: totalWithAge > 0 ? Math.round((b.count / totalWithAge) * 100) : 0,
    }));
    const dominant =
      totalWithAge > 0
        ? mappedBrackets.reduce((best, curr) => (curr.count > best.count ? curr : best), mappedBrackets[0])
        : null;

    return {
      brackets: mappedBrackets,
      totalWithAge,
      avgAge,
      maxCount,
      dominant,
    };
  }, [cards]);

  const filteredCards = useMemo(() => {
    return cards
      .filter((c) => {
        if (filterWallet === 'google') {
          return c.google_object_id !== null && Boolean(c.google_object_id);
        }
        if (filterWallet === 'pwa') {
          return c.google_object_id === null || !c.google_object_id;
        }
        return true;
      })
      .filter((c) => {
        const name = c.customer?.full_name || '';
        const phone = c.customer?.phone || '';
        return (
          name.toLowerCase().includes(query.toLowerCase()) ||
          phone.toLowerCase().includes(query.toLowerCase())
        );
      });
  }, [cards, filterWallet, query]);

  if (!activeTenant?.program) return null;

  const engine: ProgramType = activeTenant.program.type;
  const rules = activeTenant.program.rules;

  const triggerToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 2800);
  };

  const renderBalanceCell = (card: WalletCard) => {
    const bal = Number(card.current_balance);
    if (engine === 'stamps') {
      const goal = rules.goal || 10;
      const pct = Math.min(100, Math.round((bal / goal) * 100));
      return (
        <div className="min-w-[130px]">
          <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-1">
            <span>
              {Math.floor(bal)} / {goal} sellos
            </span>
            {card.reward_available && (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-[#FF7A00] text-[10px]">
                ¡Premio!
              </span>
            )}
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#0EA5E9] to-[#0B4BE3]"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      );
    }
    if (engine === 'points') {
      return (
        <div>
          <span className="font-bold text-slate-900">{Math.floor(bal)} pts</span>
          <span className="text-[11px] text-slate-400 block">Meta: {rules.goal_points || 500} pts</span>
        </div>
      );
    }
    if (engine === 'cashback') {
      return (
        <div>
          <span className="font-bold text-emerald-600">{formatBs(bal, 2)}</span>
          <span className="text-[11px] text-slate-400 block">Saldo a favor</span>
        </div>
      );
    }
    if (engine === 'discount') {
      return (
        <div>
          <span className="font-bold text-indigo-600">{formatBs(bal)}</span>
          <span className="text-[11px] text-slate-400 block">
            Meta: {formatBs(rules.target_spend || 1000)}
          </span>
        </div>
      );
    }
    return (
      <div>
        <span className="font-bold text-[#FF7A00]">
          {Math.floor(bal)} / {rules.monthly_visits || 4} visitas
        </span>
        <span className="text-[11px] text-slate-400 block">Disponibles este mes</span>
      </div>
    );
  };

  const manualButtonLabel =
    engine === 'stamps'
      ? '+1 Sello'
      : engine === 'points'
      ? `+${rules.points_per_visit || 50} Pts`
      : engine === 'cashback'
      ? '+Bs 25 Saldo'
      : engine === 'discount'
      ? '+Bs 200 Compra'
      : '-1 Visita';

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    if (!isValidCustomerPhone(newPhone)) {
      setFormError('Ingresa un número de WhatsApp válido después de +591 (ej. 71234567).');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await registerManualCustomer(activeTenant.id, newName, newPhone, newAge);
      setNewName('');
      setNewPhone(BOLIVIA_PHONE_PREFIX);
      setNewAge(25);
      setShowAddModal(false);
      triggerToast('Cliente registrado y tarjeta emitida');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al registrar cliente');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 max-w-[1440px] mx-auto">
      {feedbackToast && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-20 right-6 z-50 rounded-xl bg-[#090D16] text-white px-4 py-2.5 text-xs font-bold shadow-xl border border-white/10"
        >
          ✓ {feedbackToast}
        </motion.div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-[#0B4BE3]" />
            <span>CRM de Clientes · {activeTenant.name}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Gestiona tarjetas emitidas, suma sellos o saldos manuales y canjea premios en mostrador.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setNewPhone(BOLIVIA_PHONE_PREFIX);
            setNewAge(25);
            setShowAddModal(true);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0EA5E9] to-[#0B4BE3] px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-glow-cobalt hover:brightness-105 transition"
        >
          <UserPlus className="w-4 h-4" />
          <span>Registrar Cliente</span>
        </button>
      </div>

      {/* Age Analytics Charts for Decision Making */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 glass-card-light rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-[#0B4BE3]/10 text-[#0B4BE3] flex items-center justify-center">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Distribución por Edad de tus Clientes
                </h3>
                <p className="text-[11px] text-slate-500">
                  Segmentación para adaptar promociones y campañas
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
              {ageAnalytics.totalWithAge} de {cards.length} con edad registrada
            </span>
          </div>

          {ageAnalytics.totalWithAge === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-xs text-slate-500">
              Aún no hay clientes con edad registrada. Aparecerán aquí automáticamente apenas se registren con la barra deslizante.
            </div>
          ) : (
            <div className="space-y-3">
              {ageAnalytics.brackets.map((b) => {
                const widthPct = Math.max(b.count > 0 ? 6 : 0, Math.round((b.count / ageAnalytics.maxCount) * 100));
                const isDominant = ageAnalytics.dominant?.id === b.id && b.count > 0;
                return (
                  <div key={b.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700 flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                        <span>{b.label}</span>
                        {isDominant && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-[#FF7A00] text-[10px] font-extrabold">
                            Principal
                          </span>
                        )}
                      </span>
                      <span className="font-semibold text-slate-600">
                        {b.count} {b.count === 1 ? 'cliente' : 'clientes'} ({b.pct}%)
                      </span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${widthPct}%` }}
                        transition={{ duration: 0.45 }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: b.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 glass-card-light rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#FF7A00]/10 text-[#FF7A00] flex items-center justify-center">
              <PieChart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                Resumen Demográfico
              </h3>
              <p className="text-[11px] text-slate-500">Indicadores clave para toma de decisiones</p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            {/* SVG Donut Ring */}
            <div className="relative h-28 w-28 shrink-0">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="38" fill="none" stroke="#E2E8F0" strokeWidth="14" />
                {(() => {
                  const circumference = 2 * Math.PI * 38;
                  let offset = 0;
                  return ageAnalytics.brackets
                    .filter((b) => b.count > 0)
                    .map((b) => {
                      const dash = (b.count / Math.max(1, ageAnalytics.totalWithAge)) * circumference;
                      const el = (
                        <circle
                          key={b.id}
                          cx="50"
                          cy="50"
                          r="38"
                          fill="none"
                          stroke={b.color}
                          strokeWidth="14"
                          strokeDasharray={`${dash} ${circumference - dash}`}
                          strokeDashoffset={-offset}
                        />
                      );
                      offset += dash;
                      return el;
                    });
                })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-display text-xl font-extrabold text-slate-900 leading-none">
                  {ageAnalytics.avgAge ?? '—'}
                </span>
                <span className="text-[10px] font-bold text-slate-400 mt-0.5">Edad Prom.</span>
              </div>
            </div>

            <div className="flex-1 space-y-2 text-xs">
              <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-2.5">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Segmento Líder</span>
                <strong className="text-slate-900 text-sm">
                  {ageAnalytics.dominant ? ageAnalytics.dominant.label : 'Sin datos aún'}
                </strong>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-2.5">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Participación</span>
                <strong className="text-[#0B4BE3] text-sm">
                  {ageAnalytics.dominant ? `${ageAnalytics.dominant.pct}% de tu base` : '0%'}
                </strong>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-blue-50/70 border border-blue-200/70 px-3.5 py-2.5 text-[11px] text-slate-700 leading-relaxed">
            {ageAnalytics.dominant ? (
              <>
                💡 Tu público principal tiene entre <strong>{ageAnalytics.dominant.label}</strong>. Enfoca tus campañas push y horarios promocionales en este segmento.
              </>
            ) : (
              <>
                💡 A medida que tus clientes ingresen su edad al escanear tu QR, verás aquí su distribución exacta.
              </>
            )}
          </div>
        </div>
      </div>

      <div className="glass-card-light rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o WhatsApp..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B4BE3]/30 focus:border-[#0B4BE3]"
          />
        </div>

        <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
          {[
            { id: 'all', label: `Todos (${cards.length})` },
            { id: 'google', label: `Registrado en Google Wallet (${googleWalletCount})` },
            { id: 'pwa', label: `Web Pass / Activo (${webPassCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterWallet(tab.id as 'all' | 'google' | 'pwa')}
              className={`px-3 py-1.5 rounded-lg transition ${
                filterWallet === tab.id ? 'bg-white text-[#0B4BE3] shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-card-light rounded-2xl overflow-hidden">
        {/* Mobile View: Customer Cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredCards.length === 0 ? (
            <div className="py-10 px-4 text-center text-slate-400 text-xs">
              Aún no hay clientes registrados. Comparte tu QR en mostrador.
            </div>
          ) : (
            filteredCards.map((card) => {
              const fullName = card.customer?.full_name || 'Cliente';
              const phone = card.customer?.phone || '';
              return (
                <div key={card.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#0EA5E9] to-[#0B4BE3] text-white font-bold text-xs flex items-center justify-center shrink-0">
                        {fullName
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                          {fullName}
                        </div>
                        <div className="text-[11px] text-slate-500">{phone}</div>
                      </div>
                    </div>
                    {typeof card.customer?.age === 'number' && card.customer.age > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold shrink-0">
                        {card.customer.age} años
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-200/60">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Saldo Actual
                      </span>
                      <strong className="text-sm font-extrabold text-[#0B4BE3]">
                        {card.current_balance}{' '}
                        {engine === 'points'
                          ? 'pts'
                          : engine === 'stamps'
                          ? 'sellos'
                          : engine === 'cashback'
                          ? formatBs(card.current_balance)
                          : 'visitas'}
                      </strong>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-200/60">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Wallet
                      </span>
                      <span className="text-xs font-semibold text-slate-700">
                        {card.google_object_id ? '✓ Google Wallet' : 'Web Pass'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        await manualAdjustCard(card.id);
                        triggerToast(`Sumado a ${fullName}`);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0B4BE3]/10 hover:bg-[#0B4BE3] text-[#0B4BE3] hover:text-white py-2 text-xs font-bold transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{manualButtonLabel}</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await redeemCardReward(card.id);
                        triggerToast(
                          engine === 'subscription'
                            ? `Visitas renovadas para ${fullName}`
                            : `Premio canjeado para ${fullName}`
                        );
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500/15 hover:bg-[#FF7A00] text-[#FF7A00] hover:text-white py-2 text-xs font-bold transition"
                    >
                      <Gift className="w-3.5 h-3.5" />
                      <span>{engine === 'subscription' ? 'Renovar' : 'Canjear'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-5">Cliente</th>
                <th className="py-3.5 px-4">Wallet / Estado</th>
                <th className="py-3.5 px-4">Saldo Actual</th>
                <th className="py-3.5 px-4">Acumulado Histórico</th>
                <th className="py-3.5 px-4">Último Tap</th>
                <th className="py-3.5 px-5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredCards.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 text-sm">
                    Aún no hay clientes registrados. Comparte tu código QR o sticker NFC{' '}
                    <code className="text-[#0B4BE3]">/tap/{activeTenant.slug}</code> en mostrador.
                  </td>
                </tr>
              ) : (
                filteredCards.map((card) => {
                  const fullName = card.customer?.full_name || 'Cliente';
                  const phone = card.customer?.phone || '';
                  return (
                    <tr key={card.id} className="hover:bg-blue-50/30 transition">
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#0EA5E9] to-[#0B4BE3] text-white font-bold text-xs flex items-center justify-center shrink-0">
                            {fullName
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')
                              .toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-2">
                              <span>{fullName}</span>
                              {typeof card.customer?.age === 'number' && card.customer.age > 0 && (
                                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold">
                                  {card.customer.age} años
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">{phone}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {card.google_object_id !== null && Boolean(card.google_object_id) ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-[#0B4BE3] text-xs font-semibold">
                            <Wallet className="w-3.5 h-3.5" />
                            <span>Registrado en Google Wallet</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-700 text-xs font-semibold">
                            <Smartphone className="w-3.5 h-3.5" />
                            <span>{card.pwa_token ? 'Web Pass / Activo' : 'Activo'}</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">{renderBalanceCell(card)}</td>

                      <td className="py-3.5 px-4 text-xs font-semibold text-slate-700">
                        {card.lifetime_accumulated.toLocaleString()}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {card.last_tap_at
                          ? formatBoliviaDateTime(card.last_tap_at)
                          : 'Sin actividad'}
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              await manualAdjustCard(card.id);
                              triggerToast(`${manualButtonLabel} acreditado a ${fullName}`);
                            }}
                            className="inline-flex items-center gap-1 rounded-xl bg-[#0B4BE3]/10 hover:bg-[#0B4BE3] text-[#0B4BE3] hover:text-white px-3 py-1.5 text-xs font-bold transition"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{manualButtonLabel}</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await redeemCardReward(card.id);
                              triggerToast(
                                engine === 'subscription'
                                  ? `Visitas renovadas para ${fullName}`
                                  : `Premio canjeado para ${fullName}`
                              );
                            }}
                            className="inline-flex items-center gap-1 rounded-xl bg-amber-500/15 hover:bg-[#FF7A00] text-[#FF7A00] hover:text-white px-3 py-1.5 text-xs font-bold transition"
                          >
                            <Gift className="w-3.5 h-3.5" />
                            <span>{engine === 'subscription' ? 'Renovar Mes' : 'Canjear Premio'}</span>
                          </button>
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

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold text-slate-900">Registrar Nuevo Cliente</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre completo</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej. Valeria Gómez"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">WhatsApp (Bolivia)</label>
                  <span className="text-[10px] font-semibold text-slate-400">Código +591 pre-llenado</span>
                </div>
                <input
                  type="tel"
                  inputMode="tel"
                  required
                  value={newPhone}
                  onFocus={(e) => focusAfterBoliviaPrefix(e.currentTarget)}
                  onChange={(e) => {
                    setFormError(null);
                    setNewPhone(formatBoliviaPhoneInput(e.target.value));
                  }}
                  placeholder="+591 7123 4567"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-semibold"
                />
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="manual-age-slider" className="text-xs font-bold text-slate-700">
                    Edad del Cliente
                  </label>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#0B4BE3] text-white text-xs font-extrabold">
                    {newAge} años
                  </span>
                </div>
                <input
                  id="manual-age-slider"
                  type="range"
                  min={14}
                  max={85}
                  step={1}
                  value={newAge}
                  onChange={(e) => setNewAge(Number(e.target.value))}
                  className="w-full h-2 accent-[#0B4BE3] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-semibold text-slate-400">
                  <span>14</span>
                  <span>25</span>
                  <span>40</span>
                  <span>60</span>
                  <span>85</span>
                </div>
              </div>
              {formError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700">
                  {formError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-[#0B4BE3] text-white text-xs font-bold hover:bg-blue-700 shadow-sm disabled:opacity-60"
                >
                  {submitting ? 'Guardando...' : 'Crear Tarjeta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
