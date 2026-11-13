import React from 'react';
import { motion } from 'framer-motion';
import { Award, Check, Crown, Percent, QrCode, Sparkles, Star, Wallet } from 'lucide-react';
import { Customer, LoyaltyProgram, Tenant, WalletCard } from '../../types/loyalty';

interface DigitalPassCardProps {
  tenant: Pick<Tenant, 'name' | 'logo_url' | 'brand_color' | 'slug'>;
  program: Pick<LoyaltyProgram, 'type' | 'name' | 'rules'>;
  card?: Partial<WalletCard>;
  customer?: Partial<Customer>;
  compact?: boolean;
  tilted?: boolean;
  animateHighlight?: boolean;
}

export const DigitalPassCard: React.FC<DigitalPassCardProps> = ({
  tenant,
  program,
  card,
  customer,
  compact = false,
  tilted = false,
  animateHighlight = false,
}) => {
  const brandColor = tenant.brand_color || '#0B4BE3';
  const rules = program.rules || { reward: 'Premio Especial', cooldown_hours: 4, auto_approve: true };
  const customerName = customer?.full_name || 'Cliente VIP';
  const balance = Number(card?.current_balance ?? 0);

  const stampsGoal = rules.goal || 10;
  const pointsGoal = rules.goal_points || 500;
  const pointsPct = Math.min(100, Math.round((balance / pointsGoal) * 100));

  const targetSpend = rules.target_spend || 1000;
  const spendPct = Math.min(100, Math.round((balance / targetSpend) * 100));

  const cashbackPercent = rules.cashback_percent || 10;
  const subTotal = rules.monthly_visits || 4;

  const isRewardUnlocked = Boolean(
    card?.reward_available ||
      (program.type === 'stamps' && balance >= stampsGoal) ||
      (program.type === 'points' && balance >= pointsGoal) ||
      (program.type === 'discount' && balance >= targetSpend)
  );

  return (
    <motion.div
      initial={false}
      animate={animateHighlight ? { scale: [1, 1.03, 1] } : { scale: 1 }}
      transition={{ duration: 0.45 }}
      style={{
        background: `linear-gradient(135deg, ${brandColor} 0%, #090D16 115%)`,
      }}
      className={`relative overflow-hidden rounded-2xl text-white shadow-[0_18px_40px_-14px_rgba(11,75,227,0.45)] border border-white/15 select-none ${
        compact ? 'p-4' : 'p-5'
      } ${tilted ? 'transform -rotate-2 hover:rotate-0 transition-transform duration-300' : ''}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 85% 15%, rgba(255,255,255,0.45) 0%, transparent 45%), linear-gradient(30deg, rgba(255,255,255,0.12) 12%, transparent 12.5%, transparent 87%, rgba(255,255,255,0.12) 87.5%)',
          backgroundSize: '100% 100%, 32px 56px',
        }}
      />

      {/* Top Row */}
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
            {tenant.logo_url ? (
              <img src={tenant.logo_url} alt={tenant.name} className="h-full w-full object-cover" />
            ) : (
              <span className="font-display font-extrabold text-base text-white">
                {tenant.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h4 className="font-display font-bold text-sm sm:text-base truncate leading-tight">
              {tenant.name || 'Tu Negocio'}
            </h4>
            <p className="text-[11px] text-white/75 truncate">
              {program.name || 'Programa de Fidelidad'}
            </p>
          </div>
        </div>

        <div className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-black/25 backdrop-blur-md border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider">
          <Wallet className="w-3 h-3 text-[#0EA5E9]" />
          <span>BlockOps</span>
        </div>
      </div>

      {/* Dynamic Engine */}
      <div className="relative z-10 mt-4">
        {program.type === 'stamps' && (
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-white/80 font-medium">Tus Sellos</span>
              <span className="font-bold text-white">
                {Math.floor(balance)} / {stampsGoal}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: Math.min(stampsGoal, 15) }).map((_, i) => {
                const filled = i < Math.floor(balance);
                return (
                  <motion.div
                    key={i}
                    initial={false}
                    animate={filled ? { scale: [0.85, 1.08, 1] } : { scale: 1 }}
                    transition={{ duration: 0.3, delay: i * 0.02 }}
                    className={`aspect-square rounded-full flex items-center justify-center border transition-all ${
                      filled
                        ? 'bg-gradient-to-br from-[#FF7A00] to-[#F59E0B] border-amber-200/70 shadow-[0_4px_12px_rgba(255,122,0,0.45)]'
                        : 'bg-white/10 border-white/25 border-dashed'
                    }`}
                  >
                    {filled ? (
                      <Star className="w-3.5 h-3.5 text-white fill-white" />
                    ) : (
                      <span className="text-[10px] font-semibold text-white/50">{i + 1}</span>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {program.type === 'points' && (
          <div className="rounded-xl bg-black/20 border border-white/10 p-3">
            <div className="flex items-baseline justify-between mb-1.5">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-white/70 block">
                  Puntos acumulados
                </span>
                <span className="font-display text-2xl font-extrabold text-white">
                  {Math.floor(balance).toLocaleString()}{' '}
                  <span className="text-xs font-medium text-white/75">/ {pointsGoal} pts</span>
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#0EA5E9]/30 border border-[#0EA5E9]/40">
                {pointsPct}%
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-white/15 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[#0EA5E9] to-[#FF7A00]"
                initial={{ width: 0 }}
                animate={{ width: `${pointsPct}%` }}
                transition={{ duration: 0.6 }}
              />
            </div>
          </div>
        )}

        {program.type === 'discount' && (
          <div className="rounded-xl bg-black/20 border border-white/10 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-white/70 block">
                  Consumo acumulado
                </span>
                <span className="font-display text-2xl font-extrabold text-white">
                  Bs {balance.toLocaleString('es-BO')}{' '}
                  <span className="text-xs font-medium text-white/75">
                    / Bs {targetSpend.toLocaleString('es-BO')}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FF7A00] text-white text-xs font-extrabold shadow">
                <Percent className="w-3.5 h-3.5" />
                <span>{rules.discount_percent || 20}% OFF</span>
              </div>
            </div>
            <div className="h-2.5 w-full rounded-full bg-white/15 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-[#FF7A00]"
                initial={{ width: 0 }}
                animate={{ width: `${spendPct}%` }}
                transition={{ duration: 0.6 }}
              />
            </div>
          </div>
        )}

        {program.type === 'cashback' && (
          <div className="rounded-xl bg-black/20 border border-white/10 p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-white/70 block">
                Saldo Cashback Disponible
              </span>
              <span className="font-display text-3xl font-extrabold text-white">
                Bs {balance.toFixed(2)}
              </span>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-400/20 border border-emerald-300/35 text-emerald-200 text-xs font-bold">
                <Sparkles className="w-3 h-3" /> {cashbackPercent}% retorno
              </span>
              <p className="text-[10px] text-white/65 mt-1">Válido en tu próxima visita</p>
            </div>
          </div>
        )}

        {program.type === 'subscription' && (
          <div className="rounded-xl bg-black/20 border border-white/10 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Crown className="w-4 h-4 text-[#F59E0B]" />
                <span className="text-xs font-bold text-white">
                  {program.name || 'Membresía Mensual'}
                </span>
              </div>
              <span className="text-xs font-semibold text-amber-300">
                {Math.floor(balance)} de {subTotal} visitas
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: Math.min(subTotal, 8) }).map((_, i) => {
                const available = i < Math.floor(balance);
                return (
                  <div
                    key={i}
                    className={`h-8 rounded-lg flex items-center justify-center text-xs font-bold border ${
                      available
                        ? 'bg-emerald-400/25 border-emerald-300/50 text-white'
                        : 'bg-white/5 border-white/15 text-white/40 line-through'
                    }`}
                  >
                    {available ? <Check className="w-3.5 h-3.5" /> : 'Usada'}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {!compact && (
        <div className="relative z-10 mt-4 pt-3 border-t border-white/15 flex items-center justify-between gap-2 text-xs">
          <div className="min-w-0">
            <span className="text-white/65 text-[10px] uppercase tracking-wider block">
              Titular · {customerName}
            </span>
            <div className="flex items-center gap-1 font-semibold text-white truncate">
              <Award className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
              <span className="truncate">{rules.reward}</span>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-1.5">
            {isRewardUnlocked && (
              <span className="px-2 py-0.5 rounded-full bg-[#FF7A00] text-white font-bold text-[10px] animate-pulse">
                ¡LISTO!
              </span>
            )}
            <div className="h-8 w-8 rounded-lg bg-white p-1 flex items-center justify-center shadow">
              <QrCode className="w-full h-full text-slate-900" />
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
