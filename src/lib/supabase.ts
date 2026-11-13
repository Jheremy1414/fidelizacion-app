import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { formatWalletBalanceText, LoyaltyProgram, TenantWithProgram } from '../types/loyalty';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('tu-proyecto') &&
    !supabaseUrl.includes('your-project-id') &&
    !supabaseAnonKey.includes('tu-supabase-anon-key')
);

export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

export function createEphemeralSupabaseClient(): SupabaseClient {
  return createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-anon-key',
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

export async function uploadTenantLogo(file: File, slug: string): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase no está configurado en las variables de entorno (.env).');
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('El logo debe ser una imagen válida (PNG, JPG, WEBP o SVG).');
  }

  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error('El logo no puede superar los 5 MB.');
  }

  const cleanSlug =
    slug
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '') || 'comercio';

  const rawExt = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const ext = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(rawExt) ? rawExt : 'png';
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const filePath = `${cleanSlug}-${uniqueSuffix}.${ext}`;

  const { error } = await supabase.storage.from('tenant-logos').upload(filePath, file, {
    cacheControl: '3600',
    contentType: file.type || undefined,
    upsert: false,
  });

  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error('El bucket "tenant-logos" no existe en Supabase Storage. Ejecuta la migración 006 en el SQL Editor de Supabase.');
    }
    throw new Error(`Error al subir logo: ${error.message}`);
  }

  const { data } = supabase.storage.from('tenant-logos').getPublicUrl(filePath);
  if (!data?.publicUrl) {
    throw new Error('No se pudo generar la URL pública del logo en Supabase Storage.');
  }

  return data.publicUrl;
}

export function getAppBaseUrl(): string {
  const configuredBase = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim().replace(/\/+$/, '');
  const isRealConfigured =
    configuredBase &&
    !configuredBase.includes('tudominio') &&
    !configuredBase.includes('your-domain');

  if (isRealConfigured) {
    return configuredBase;
  }

  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin;
  }

  return 'https://loyalty.blocops.click';
}

export function getPublicTapUrl(slug: string): string {
  const configuredBase = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined;
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : configuredBase || 'https://loyalty.blockops.com';
  return `${origin}/tap/${slug}`;
  const base = getAppBaseUrl();
  return `${base}/tap/${slug}`;
}

export function buildProgressPushMessage(
  tenantName: string,
  program: Pick<LoyaltyProgram, 'type' | 'rules'>,
  currentBalance: number
) {
  const newBalanceText = formatWalletBalanceText(program.type, program.rules, currentBalance);
  return {
    newBalanceText,
    pushTitle: `¡Sumaste en ${tenantName}!`,
    pushBody: `Tu nuevo progreso es ${newBalanceText}. Premio: ${program.rules?.reward || 'Beneficio VIP'}`,
  };
}

export interface WalletBalanceSyncParams {
  googleObjectId?: string | null;
  tenant: (Pick<TenantWithProgram, 'name' | 'brand_color'> & Partial<TenantWithProgram>);
  program: Pick<LoyaltyProgram, 'type' | 'name' | 'rules'> & Partial<LoyaltyProgram>;
  currentBalance: number;
  holderName: string;
  pushTitle?: string;
  pushBody?: string;
  isCustomerTap?: boolean;
  cardId?: string;
  customerLat?: number | null;
  customerLng?: number | null;
}

export function invokeWalletBalanceUpdate({
  googleObjectId,
  tenant,
  program,
  currentBalance,
  holderName,
  pushTitle,
  pushBody,
  isCustomerTap,
  cardId,
  customerLat,
  customerLng,
}: WalletBalanceSyncParams) {
  const progress = buildProgressPushMessage(tenant.name, program, currentBalance);
  return supabase.functions.invoke('wallet-pass', {
    body: {
      action: 'update_balance',
      cardId,
      googleObjectId: googleObjectId ?? null,
      newBalanceText: progress.newBalanceText,
      program,
      tenant,
      currentBalance,
      brandColor: tenant.brand_color,
      holderName: holderName.trim() || 'Cliente VIP',
      pushTitle: pushTitle ?? progress.pushTitle,
      pushBody: pushBody ?? progress.pushBody,
      ...(isCustomerTap
        ? {
            isCustomerTap: true,
            customerLat: customerLat ?? null,
            customerLng: customerLng ?? null,
          }
        : {}),
    },
  });
}
