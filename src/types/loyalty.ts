import { formatBs } from '../utils/bolivia';

export type ProgramType = 'stamps' | 'discount' | 'points' | 'cashback' | 'subscription';

export type TenantStatus = 'trial' | 'active' | 'past_due' | 'canceled';

export type TxType = 'earn' | 'redeem' | 'adjust' | 'subscription_reset';
export type TxStatus = 'completed' | 'pending_approval' | 'rejected';
export type ValidationMode = 'auto' | 'approval' | 'pin';

export interface LoyaltyRules {
  goal?: number;
  reward: string;
  cooldown_hours: number;
  auto_approve: boolean;
  validation_mode?: ValidationMode;
  cashier_pin?: string | null;
  gps_radius_meters?: number;
  // discount
  target_spend?: number;
  discount_percent?: number;
  // points
  goal_points?: number;
  points_per_visit?: number;
  // cashback
  cashback_percent?: number;
  min_redeem_amount?: number;
  // subscription
  monthly_visits?: number;
  monthly_price?: number;
  description?: string;
}

export interface LoyaltyProgram {
  id: string;
  tenant_id: string;
  type: ProgramType;
  name: string;
  rules: LoyaltyRules;
  is_active: boolean;
  created_at: string;
}

export interface Tenant {
  id: string;
  owner_user_id: string | null;
  owner_email?: string | null;
  slug: string;
  name: string;
  logo_url: string | null;
  brand_color: string;
  lat: number | null;
  lng: number | null;
  status: TenantStatus;
  trial_ends_at: string;
  google_class_id: string | null;
  created_at: string;
}

export interface TenantWithProgram extends Tenant {
  program: LoyaltyProgram | null;
}

export interface Customer {
  id: string;
  phone: string;
  full_name: string;
  age?: number | null;
  created_at: string;
}

export interface WalletCard {
  id: string;
  tenant_id: string;
  program_id: string;
  customer_id: string;
  current_balance: number;
  lifetime_accumulated: number;
  reward_available: boolean;
  subscription_expires_at: string | null;
  last_tap_at: string | null;
  google_object_id: string | null;
  pwa_token: string;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  program?: LoyaltyProgram;
}

export interface CardTransaction {
  id: string;
  card_id: string;
  tenant_id: string;
  type: TxType;
  status: TxStatus;
  purchase_amount: number;
  delta_value: number;
  balance_after: number;
  notes: string | null;
  created_at: string;
  customer_name?: string;
  customer_phone?: string;
}

export interface MarketingPush {
  id: string;
  tenant_id: string;
  title: string;
  message: string;
  sent_count: number;
  created_at: string;
}

export interface TenantPayment {
  id: string;
  tenant_id: string;
  amount: number;
  currency: string;
  period_days: number;
  payment_method: string;
  notes?: string | null;
  paid_at: string;
  created_at: string;
  tenant_name?: string;
  tenant_slug?: string;
}

export interface TenantNotification {
  id: string;
  tenant_id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export function getTenantSubscriptionStatus(tenant: Tenant): {
  isExpired: boolean;
  isBlocked: boolean;
  daysRemaining: number;
  statusLabel: string;
  blockReason?: string;
} {
  const now = Date.now();
  const expiry = new Date(tenant.trial_ends_at).getTime();
  const diffMs = expiry - now;
  const daysRemaining = Math.max(0, Math.ceil(diffMs / 86400000));
  const isExpired = Number.isFinite(expiry) && diffMs <= 0;
  const isExplicitlyBlocked = tenant.status === 'canceled' || tenant.status === 'past_due';
  const isBlocked = isExplicitlyBlocked || isExpired;

  let blockReason = '';
  if (tenant.status === 'canceled') blockReason = 'Negocio deshabilitado por administración';
  else if (tenant.status === 'past_due') blockReason = 'Negocio con suscripción pendiente';
  else if (isExpired && tenant.status === 'active') blockReason = 'Suscripción mensual vencida';
  else if (isExpired) blockReason = 'Período de prueba de 14 días finalizado';

  return {
    isExpired,
    isBlocked,
    daysRemaining,
    statusLabel: isBlocked
      ? 'Deshabilitado'
      : tenant.status === 'active'
      ? `${daysRemaining} días de suscripción`
      : `${daysRemaining} días de prueba`,
    blockReason,
  };
}

export interface LoyaltyPlanMeta {
  type: ProgramType;
  name: string;
  tagline: string;
  idealFor: string;
  recommendedCopy: string;
  defaultRules: LoyaltyRules;
  isAutomatic: boolean;
  badgeColor: string;
}

export function formatWalletBalanceText(
  type: ProgramType,
  rules: LoyaltyRules | undefined,
  balance: number
): string {
  if (type === 'stamps') {
    return `${Math.floor(balance)} / ${rules?.goal ?? 10}`;
  }
  if (type === 'points') {
    return `${Math.floor(balance)} / ${rules?.goal_points ?? 500} pts`;
  }
  if (type === 'cashback') {
    return formatBs(balance, 2);
  }
  if (type === 'discount') {
    return `${formatBs(balance)} / ${formatBs(rules?.target_spend ?? 1000)}`;
  }
  if (type === 'subscription') {
    return `${Math.floor(balance)} visitas`;
  }
  return `${balance}`;
}

export const LOYALTY_PLANS_META: Record<ProgramType, LoyaltyPlanMeta> = {
  stamps: {
    type: 'stamps',
    name: 'Tarjeta de Sellos',
    tagline: 'Círculos visuales por cada visita',
    idealFor: 'Cafeterías, panaderías, autolavados, heladerías',
    recommendedCopy: 'Compra 10 cafés y el 11vo es completamente gratis',
    defaultRules: {
      goal: 10,
      reward: '11vo Café Gratis',
      cooldown_hours: 4,
      auto_approve: true,
      validation_mode: 'auto',
      gps_radius_meters: 120,
      description: 'Acumula un sello en cada visita con tu celular',
    },
    isAutomatic: true,
    badgeColor: '#0B4BE3',
  },
  discount: {
    type: 'discount',
    name: 'Descuento Acumulado',
    tagline: 'Meta de gasto para desbloquear % OFF',
    idealFor: 'Boutiques, tiendas de ropa, calzado, electrónica',
    recommendedCopy: 'Acumula Bs 1,000 en compras y gana 20% OFF en tu siguiente visita',
    defaultRules: {
      target_spend: 1000,
      discount_percent: 20,
      reward: '20% OFF en tu siguiente compra',
      cooldown_hours: 1,
      auto_approve: false,
      validation_mode: 'approval',
      gps_radius_meters: 120,
      description: 'Ingresa el monto de tu ticket y acumula para desbloquear descuento',
    },
    isAutomatic: false,
    badgeColor: '#6366F1',
  },
  points: {
    type: 'points',
    name: 'Club de Puntos',
    tagline: 'Barra de progreso numérica por visita',
    idealFor: 'Spas, clínicas estéticas, dentistas, veterinarias',
    recommendedCopy: 'Junta 500 puntos y canjea 1 Masaje Relajante gratis',
    defaultRules: {
      goal_points: 500,
      points_per_visit: 50,
      reward: '1 Masaje Relajante Gratis',
      cooldown_hours: 4,
      auto_approve: true,
      validation_mode: 'auto',
      gps_radius_meters: 120,
      description: 'Suma 50 puntos en cada visita automáticamente',
    },
    isAutomatic: true,
    badgeColor: '#0EA5E9',
  },
  cashback: {
    type: 'cashback',
    name: 'Cashback en Monedero',
    tagline: 'Devuelve % de cada ticket como saldo',
    idealFor: 'Restaurantes, bares, hamburgueserías, farmacias',
    recommendedCopy: 'Recibe 10% de cada consumo como saldo a favor para tu próxima visita',
    defaultRules: {
      cashback_percent: 10,
      min_redeem_amount: 50,
      reward: 'Saldo a favor en consumo',
      cooldown_hours: 1,
      auto_approve: false,
      validation_mode: 'approval',
      gps_radius_meters: 120,
      description: 'Paga con tu saldo acumulado en cualquier visita',
    },
    isAutomatic: false,
    badgeColor: '#10B981',
  },
  subscription: {
    type: 'subscription',
    name: 'Suscripción Mensual',
    tagline: 'Membresía con X visitas incluidas al mes',
    idealFor: 'Barberías, estudios fitness, carwash ilimitado, coworking',
    recommendedCopy: 'Plan VIP: 4 cortes de cabello al mes incluidos con 1 tap',
    defaultRules: {
      monthly_visits: 4,
      monthly_price: 450,
      reward: '4 Visitas Mensuales Incluidas',
      cooldown_hours: 12,
      auto_approve: true,
      validation_mode: 'auto',
      gps_radius_meters: 120,
      description: 'Cada visita al mostrador descuenta 1 pase disponible',
    },
    isAutomatic: true,
    badgeColor: '#FF7A00',
  },
};
