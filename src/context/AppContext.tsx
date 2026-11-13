import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import {
  buildProgressPushMessage,
  isSupabaseConfigured,
  invokeWalletBalanceUpdate,
  supabase,
} from '../lib/supabase';
import {
  CardTransaction,
  LOYALTY_PLANS_META,
  LoyaltyProgram,
  LoyaltyRules,
  MarketingPush,
  ProgramType,
  TenantStatus,
  TenantWithProgram,
  WalletCard,
} from '../types/loyalty';
import { normalizeBoliviaPhone } from '../utils/bolivia';
import { playChime } from '../utils/sound';

export interface CreateTenantPayload {
  name: string;
  slug: string;
  logo_url: string | null;
  brand_color: string;
  type: ProgramType;
  program_name: string;
  rules: LoyaltyRules;
  lat: number | null;
  lng: number | null;
}

interface AppContextValue {
  user: User | null;
  session: Session | null;
  authLoading: boolean;
  isSupabaseReady: boolean;
  isSuperAdmin: boolean;
  tenantsLoaded: boolean;
  myTenants: TenantWithProgram[];
  activeTenant: TenantWithProgram | null;
  setActiveTenantId: (id: string) => void;
  cards: WalletCard[];
  transactions: CardTransaction[];
  campaigns: MarketingPush[];
  dataLoading: boolean;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  refreshData: () => Promise<void>;
  signIn: (
    email: string,
    password: string
  ) => Promise<{
    error: string | null;
    user?: User | null;
    destination?: '/admin' | '/dashboard' | '/onboarding' | null;
  }>;
  signUp: (
    email: string,
    password: string
  ) => Promise<{ error: string | null; needsConfirmation: boolean; hasSession: boolean; user: User | null }>;
  signOut: () => Promise<void>;
  createTenantWithProgram: (payload: CreateTenantPayload, ownerOverride?: User | null) => Promise<TenantWithProgram>;
  updateTenantAndProgram: (
    tenantId: string,
    tenantPatch: Partial<TenantWithProgram>,
    programPatch?: Partial<LoyaltyProgram>
  ) => Promise<void>;
  resolveTransaction: (txId: string, decision: 'completed' | 'rejected') => Promise<void>;
  manualAdjustCard: (cardId: string, units?: number) => Promise<void>;
  redeemCardReward: (cardId: string) => Promise<void>;
  registerManualCustomer: (
    tenantId: string,
    fullName: string,
    phone: string,
    age?: number | null
  ) => Promise<void>;
  sendPushCampaign: (
    tenantId: string,
    title: string,
    message: string
  ) => Promise<{ sentCount: number; warning?: string }>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

function computeRewardAvailable(
  type: ProgramType,
  rules: LoyaltyRules,
  balance: number
): boolean {
  if (type === 'stamps') return balance >= (rules.goal || 10);
  if (type === 'points') return balance >= (rules.goal_points || 500);
  if (type === 'discount') return balance >= (rules.target_spend || 1000);
  if (type === 'cashback') return balance >= (rules.min_redeem_amount || 50);
  return false;
}

export const ONBOARDING_DRAFT_KEY = 'blockops_onboarding_draft';

export function getAuthenticatedHomePath(
  isSuperAdmin: boolean,
  tenantsCount: number
): '/admin' | '/dashboard' | '/onboarding' {
  if (isSuperAdmin) return '/admin';
  if (tenantsCount > 0) return '/dashboard';
  return '/onboarding';
}

function normalizeTenantRow(row: Record<string, unknown>, program: LoyaltyProgram | null): TenantWithProgram {
  return {
    ...(row as unknown as TenantWithProgram),
    lat: row.lat !== null && row.lat !== undefined ? Number(row.lat) : null,
    lng: row.lng !== null && row.lng !== undefined ? Number(row.lng) : null,
    program,
  };
}

async function insertTenantAndProgramForUser(
  ownerUser: User,
  payload: CreateTenantPayload
): Promise<TenantWithProgram> {
  const cleanSlug = payload.slug
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '');

  const trialEndsAt = new Date(Date.now() + 14 * 86400 * 1000).toISOString();
  const baseInsert = {
    owner_user_id: ownerUser.id,
    slug: cleanSlug,
    name: payload.name.trim(),
    logo_url: payload.logo_url,
    brand_color: payload.brand_color,
    lat: payload.lat,
    lng: payload.lng,
    status: 'trial' as TenantStatus,
    trial_ends_at: trialEndsAt,
  };

  let createdTenantRes = await supabase
    .from('tenants')
    .insert({ ...baseInsert, owner_email: ownerUser.email ?? null })
    .select()
    .single();

  if (createdTenantRes.error && /owner_email/i.test(createdTenantRes.error.message)) {
    createdTenantRes = await supabase.from('tenants').insert(baseInsert).select().single();
  }

  if (createdTenantRes.error || !createdTenantRes.data) {
    throw new Error(createdTenantRes.error?.message || 'No se pudo registrar el negocio');
  }

  const { data: createdProgram, error: pErr } = await supabase
    .from('loyalty_programs')
    .insert({
      tenant_id: createdTenantRes.data.id,
      type: payload.type,
      name: payload.program_name.trim() || LOYALTY_PLANS_META[payload.type].name,
      rules: payload.rules,
      is_active: true,
    })
    .select()
    .single();

  if (pErr || !createdProgram) {
    throw new Error(pErr?.message || 'No se pudo crear el programa de fidelización');
  }

  return normalizeTenantRow(createdTenantRes.data, createdProgram as LoyaltyProgram);
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const [myTenants, setMyTenants] = useState<TenantWithProgram[]>([]);
  const [tenantsLoaded, setTenantsLoaded] = useState(false);
  const [activeTenantId, setActiveTenantId] = useState<string>('');
  const [cards, setCards] = useState<WalletCard[]>([]);
  const [transactions, setTransactions] = useState<CardTransaction[]>([]);
  const [campaigns, setCampaigns] = useState<MarketingPush[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const lastUserIdRef = useRef<string | null>(null);
  const realtimeSeqRef = useRef(0);
  const campaignInFlightRef = useRef(false);

  const applySessionState = useCallback((nextSession: Session | null) => {
    const nextUser = nextSession?.user ?? null;
    const nextId = nextUser?.id ?? null;

    if (!nextUser) {
      lastUserIdRef.current = null;
      setUser(null);
      setSession(null);
      setIsSuperAdmin(false);
      setMyTenants([]);
      setActiveTenantId('');
      setCards([]);
      setTransactions([]);
      setCampaigns([]);
      setTenantsLoaded(true);
      setAuthLoading(false);
      return;
    }

    if (lastUserIdRef.current !== nextId) {
      setTenantsLoaded(false);
    }
    lastUserIdRef.current = nextId;
    setUser(nextUser);
    setSession(nextSession);
    setAuthLoading(false);
  }, []);

  // Initialize Supabase Auth listener
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      setTenantsLoaded(true);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      applySessionState(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySessionState(nextSession);
    });

    return () => listener.subscription.unsubscribe();
  }, [applySessionState]);

  const resolveSuperAdminStatus = useCallback(async (targetUser: User): Promise<boolean> => {
    const envEmail = import.meta.env.VITE_SUPERADMIN_EMAIL as string | undefined;
    const byJwt = targetUser.app_metadata?.role === 'superadmin';
    const byEnv = Boolean(
      envEmail && targetUser.email && targetUser.email.toLowerCase() === envEmail.toLowerCase()
    );

    if (byJwt || byEnv) return true;

    if (isSupabaseConfigured && targetUser.email) {
      const { data } = await supabase
        .from('superadmins')
        .select('email')
        .ilike('email', targetUser.email)
        .maybeSingle();
      return Boolean(data);
    }

    return false;
  }, []);

  const fetchMyTenants = useCallback(
    async (explicitUser?: User | null): Promise<TenantWithProgram[]> => {
      const targetUser = explicitUser !== undefined ? explicitUser : user;

      if (!targetUser || !isSupabaseConfigured) {
        setIsSuperAdmin(false);
        setMyTenants([]);
        setTenantsLoaded(true);
        return [];
      }

      const superAdminFlag = await resolveSuperAdminStatus(targetUser);
      setIsSuperAdmin(superAdminFlag);

      // Reclaim any cold-provisioned businesses assigned to this user's email
      try {
        await supabase.rpc('claim_tenants_by_email');
      } catch {
        // Ignorable before migration 004 is executed
      }

      let query = supabase
        .from('tenants')
        .select('*, loyalty_programs(*)')
        .order('created_at', { ascending: false });

      if (targetUser.email) {
        query = query.or(`owner_user_id.eq.${targetUser.id},owner_email.ilike.${targetUser.email.toLowerCase()}`);
      } else {
        query = query.eq('owner_user_id', targetUser.id);
      }

      const { data, error } = await query;

      if (error || !data) {
        setTenantsLoaded(true);
        return [];
      }

      // Si había comercios vinculados por owner_email, actualizar su owner_user_id de inmediato
      for (const row of data) {
        if (row.owner_user_id !== targetUser.id) {
          void supabase.from('tenants').update({ owner_user_id: targetUser.id }).eq('id', row.id);
        }
      }

      let normalized: TenantWithProgram[] = data.map((row) => {
        const progs = (
          row as unknown as { loyalty_programs: LoyaltyProgram[] | LoyaltyProgram }
        ).loyalty_programs;
        const program = Array.isArray(progs) ? progs[0] || null : progs || null;
        return normalizeTenantRow(row, program);
      });

      // Auto-complete deferred onboarding draft (e.g. after email confirmation login)
      if (normalized.length === 0 && !superAdminFlag) {
        const rawDraft = localStorage.getItem(ONBOARDING_DRAFT_KEY);
        if (rawDraft) {
          try {
            const draft = JSON.parse(rawDraft) as CreateTenantPayload;
            if (draft?.name && draft?.slug) {
              const created = await insertTenantAndProgramForUser(targetUser, draft);
              normalized = [created];
            }
          } catch {
            // Keep clean state if draft cannot be applied
          } finally {
            localStorage.removeItem(ONBOARDING_DRAFT_KEY);
          }
        }
      }

      setMyTenants(normalized);
      if (normalized.length > 0) {
        setActiveTenantId((prev) =>
          prev && normalized.some((t) => t.id === prev) ? prev : normalized[0].id
        );
      }
      setTenantsLoaded(true);
      return normalized;
    },
    [user, resolveSuperAdminStatus]
  );

  const activeTenant = useMemo(
    () => myTenants.find((t) => t.id === activeTenantId) || myTenants[0] || null,
    [myTenants, activeTenantId]
  );

  const fetchTenantDetails = useCallback(async (tenantId: string) => {
    if (!tenantId || !isSupabaseConfigured) return;
    setDataLoading(true);

    try {
      const [cardsRes, txRes, campRes] = await Promise.all([
        supabase
          .from('wallet_cards')
          .select('*, customer:customers(*), program:loyalty_programs(*)')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false }),
        supabase
          .from('card_transactions')
          .select('*, wallet_cards(customer_id, customers(full_name, phone))')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(250),
        supabase
          .from('marketing_pushes')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false }),
      ]);

      if (cardsRes.error) {
        console.error('Error al cargar wallet_cards:', cardsRes.error.message);
      }

      if (cardsRes.data) {
        const mappedCards: WalletCard[] = cardsRes.data.map((c) => {
          const raw = c as unknown as {
            customer?: WalletCard['customer'];
            customers?: WalletCard['customer'];
            program?: LoyaltyProgram | LoyaltyProgram[];
          };
          const cust = raw.customer ?? raw.customers;
          const progRow = Array.isArray(raw.program) ? raw.program[0] : raw.program;
          return {
            ...c,
            current_balance: Number(c.current_balance || 0),
            lifetime_accumulated: Number(c.lifetime_accumulated || 0),
            customer: cust,
            program: progRow,
          };
        });
        setCards(mappedCards);
      }

      if (txRes.data) {
        const mappedTxs: CardTransaction[] = txRes.data.map((t) => {
          const wc = (
            t as unknown as {
              wallet_cards?: { customers?: { full_name?: string; phone?: string } };
            }
          ).wallet_cards;
          return {
            ...t,
            purchase_amount: Number(t.purchase_amount || 0),
            delta_value: Number(t.delta_value || 0),
            balance_after: Number(t.balance_after || 0),
            customer_name: wc?.customers?.full_name || 'Cliente',
            customer_phone: wc?.customers?.phone || '',
          };
        });
        setTransactions(mappedTxs);
      }

      if (campRes.data) {
        setCampaigns(campRes.data as MarketingPush[]);
      }
    } finally {
      setDataLoading(false);
    }
  }, []);

  const refreshData = useCallback(async () => {
    await fetchMyTenants();
    if (activeTenant?.id) {
      await fetchTenantDetails(activeTenant.id);
    }
  }, [fetchMyTenants, fetchTenantDetails, activeTenant?.id]);

  useEffect(() => {
    if (authLoading) return;
    fetchMyTenants();
  }, [authLoading, fetchMyTenants]);

  useEffect(() => {
    if (activeTenant?.id) {
      fetchTenantDetails(activeTenant.id);
    } else {
      setCards([]);
      setTransactions([]);
      setCampaigns([]);
    }
  }, [activeTenant?.id, fetchTenantDetails]);

  // Real-time Supabase Subscriptions for active business
  useEffect(() => {
    if (!activeTenant?.id || !isSupabaseConfigured) return;

    let isEffectActive = true;
    const channel = supabase
      .channel(`tenant-live-${activeTenant.id}-${++realtimeSeqRef.current}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'card_transactions',
          filter: `tenant_id=eq.${activeTenant.id}`,
        },
        (payload) => {
          if (!isEffectActive) return;
          if (payload.eventType === 'INSERT') {
            const newTx = payload.new as CardTransaction;
            if (newTx.status === 'pending_approval' && soundEnabled) {
              playChime('notification');
            }
          }
          fetchTenantDetails(activeTenant.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallet_cards',
          filter: `tenant_id=eq.${activeTenant.id}`,
        },
        () => {
          if (!isEffectActive) return;
          fetchTenantDetails(activeTenant.id);
        }
      )
      .subscribe();

    return () => {
      isEffectActive = false;
      void supabase.removeChannel(channel);
    };
  }, [activeTenant?.id, soundEnabled, fetchTenantDetails]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      setTenantsLoaded(false);
      setSession(data.session);
      setUser(data.user);
      const tenants = await fetchMyTenants(data.user);
      const isSuper = await resolveSuperAdminStatus(data.user);
      const destination = getAuthenticatedHomePath(isSuper, tenants.length);
      return { error: null, user: data.user, destination };
    }
    return { error: error ? error.message : null, user: null, destination: null };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    const hasSession = Boolean(!error && data.session && data.user);
    if (hasSession && data.user) {
      setTenantsLoaded(false);
      setSession(data.session);
      setUser(data.user);
      await fetchMyTenants(data.user);
    }
    return {
      error: error ? error.message : null,
      needsConfirmation: Boolean(!error && data.user && !data.session),
      hasSession,
      user: data.user ?? null,
    };
  };

  const signOut = async () => {
    // Inmediatamente limpiar el estado en memoria para que las rutas protegidas y guards actúen de forma instantánea
    lastUserIdRef.current = null;
    setUser(null);
    setSession(null);
    setIsSuperAdmin(false);
    setMyTenants([]);
    setActiveTenantId('');
    setCards([]);
    setTransactions([]);
    setCampaigns([]);
    setTenantsLoaded(true);
    setAuthLoading(false);

    try {
      localStorage.removeItem(ONBOARDING_DRAFT_KEY);
    } catch {
      // Ignorar error de acceso a storage
    }

    if (isSupabaseConfigured) {
      try {
        // Timeout de seguridad de 1200ms para evitar cuelgues si Supabase Auth tarda o no responde
        await Promise.race([
          supabase.auth.signOut(),
          new Promise((resolve) => setTimeout(resolve, 1200)),
        ]);
      } catch (err) {
        console.warn('Advertencia durante supabase.auth.signOut:', err);
      }
    }
  };

  const createTenantWithProgram = async (
    payload: CreateTenantPayload,
    ownerOverride?: User | null
  ): Promise<TenantWithProgram> => {
    let currentUser = ownerOverride ?? user;
    if (!currentUser) {
      const { data: userData } = await supabase.auth.getUser();
      currentUser = userData.user ?? null;
    }
    if (!currentUser) throw new Error('Debes iniciar sesión primero.');

    const fullTenant = await insertTenantAndProgramForUser(currentUser, payload);

    localStorage.removeItem(ONBOARDING_DRAFT_KEY);
    setMyTenants((prev) => [fullTenant, ...prev.filter((t) => t.id !== fullTenant.id)]);
    setActiveTenantId(fullTenant.id);
    setTenantsLoaded(true);
    return fullTenant;
  };

  const updateTenantAndProgram = async (
    tenantId: string,
    tenantPatch: Partial<TenantWithProgram>,
    programPatch?: Partial<LoyaltyProgram>
  ) => {
    const { program: _ignored, ...cleanTenantPatch } = tenantPatch;
    if (Object.keys(cleanTenantPatch).length > 0) {
      const { error } = await supabase
        .from('tenants')
        .update(cleanTenantPatch)
        .eq('id', tenantId);
      if (error) throw new Error(error.message);
    }

    if (programPatch && activeTenant?.program?.id) {
      const { error } = await supabase
        .from('loyalty_programs')
        .update(programPatch)
        .eq('id', activeTenant.program.id);
      if (error) throw new Error(error.message);
    }

    await refreshData();
  };

  const resolveTransaction = async (txId: string, decision: 'completed' | 'rejected') => {
    const tx = transactions.find((t) => t.id === txId);
    if (!tx || !activeTenant?.program) return;

    if (decision === 'rejected') {
      await supabase
        .from('card_transactions')
        .update({ status: 'rejected' })
        .eq('id', txId);
      await fetchTenantDetails(activeTenant.id);
      return;
    }

    const card = cards.find((c) => c.id === tx.card_id);
    if (!card) return;
    const prog = activeTenant.program;
    const rules = prog.rules;

    let nextBalance = card.current_balance;
    let nextLifetime = card.lifetime_accumulated;
    let nextRewardAvailable = card.reward_available;

    if (tx.type === 'redeem') {
      if (prog.type === 'stamps') nextBalance = 0;
      else if (prog.type === 'points') nextBalance = Math.max(0, card.current_balance - (rules.goal_points || 500));
      else if (prog.type === 'discount') nextBalance = Math.max(0, card.current_balance - (rules.target_spend || 1000));
      else if (prog.type === 'cashback') nextBalance = 0;
      nextRewardAvailable = computeRewardAvailable(prog.type, rules, nextBalance);
    } else {
      nextBalance = Number((card.current_balance + tx.delta_value).toFixed(2));
      nextLifetime = Number((card.lifetime_accumulated + Math.max(0, tx.delta_value)).toFixed(2));
      nextRewardAvailable = computeRewardAvailable(prog.type, rules, nextBalance);
    }

    await supabase
      .from('card_transactions')
      .update({ status: 'completed', balance_after: nextBalance })
      .eq('id', txId);

    await supabase
      .from('wallet_cards')
      .update({
        current_balance: nextBalance,
        lifetime_accumulated: nextLifetime,
        reward_available: nextRewardAvailable,
        last_tap_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', card.id);

    const earnPush = buildProgressPushMessage(activeTenant.name, prog, nextBalance);
    invokeWalletBalanceUpdate({
      cardId: card.id,
      googleObjectId: card.google_object_id,
      tenant: activeTenant,
      program: prog,
      currentBalance: nextBalance,
      holderName: card.customer?.full_name || tx.customer_name || 'Cliente VIP',
      pushTitle:
        tx.type === 'redeem' ? `¡Canje aprobado en ${activeTenant.name}!` : earnPush.pushTitle,
      pushBody:
        tx.type === 'redeem'
          ? `Disfruta tu premio: ${rules.reward || 'Beneficio VIP'}`
          : earnPush.pushBody,
    }).catch(() => null);

    if (soundEnabled) playChime('success');
    await fetchTenantDetails(activeTenant.id);
  };

  const manualAdjustCard = async (cardId: string, units?: number) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card || !activeTenant?.program) return;
    const prog = activeTenant.program;
    const rules = prog.rules;

    let delta = 1;
    let notes = '+1 Sello manual';

    if (prog.type === 'stamps') {
      delta = units ?? 1;
      notes = `+${delta} Sello manual`;
    } else if (prog.type === 'points') {
      delta = units ?? (rules.points_per_visit || 50);
      notes = `+${delta} Puntos manuales`;
    } else if (prog.type === 'cashback') {
      delta = units ?? 25;
      notes = `+Bs ${delta} Cashback manual`;
    } else if (prog.type === 'discount') {
      delta = units ?? 200;
      notes = `+Bs ${delta} Consumo manual`;
    } else if (prog.type === 'subscription') {
      delta = -1;
      notes = 'Uso manual de 1 visita';
    }

    const nextBalance =
      prog.type === 'subscription'
        ? Math.max(0, card.current_balance + delta)
        : Number((card.current_balance + delta).toFixed(2));
    const nextLifetime = Number((card.lifetime_accumulated + Math.abs(delta)).toFixed(2));
    const nextRewardAvailable = computeRewardAvailable(prog.type, rules, nextBalance);

    await supabase.from('card_transactions').insert({
      card_id: card.id,
      tenant_id: activeTenant.id,
      type: 'adjust',
      status: 'completed',
      purchase_amount: 0,
      delta_value: delta,
      balance_after: nextBalance,
      notes,
    });

    await supabase
      .from('wallet_cards')
      .update({
        current_balance: nextBalance,
        lifetime_accumulated: nextLifetime,
        reward_available: nextRewardAvailable,
        last_tap_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', card.id);

    const adjustPush = buildProgressPushMessage(activeTenant.name, prog, nextBalance);
    invokeWalletBalanceUpdate({
      cardId: card.id,
      googleObjectId: card.google_object_id,
      tenant: activeTenant,
      program: prog,
      currentBalance: nextBalance,
      holderName: card.customer?.full_name || 'Cliente VIP',
      pushTitle: adjustPush.pushTitle,
      pushBody: adjustPush.pushBody,
    }).catch(() => null);

    if (soundEnabled) playChime('success');
    await fetchTenantDetails(activeTenant.id);
  };

  const redeemCardReward = async (cardId: string) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card || !activeTenant?.program) return;
    const prog = activeTenant.program;
    const rules = prog.rules;

    let nextBalance = 0;
    let delta = -card.current_balance;
    let txType: 'redeem' | 'subscription_reset' = 'redeem';
    let notes = `Canje: ${rules.reward}`;

    if (prog.type === 'points') {
      const goal = rules.goal_points || 500;
      nextBalance = Math.max(0, card.current_balance - goal);
      delta = -Math.min(card.current_balance, goal);
    } else if (prog.type === 'discount') {
      const target = rules.target_spend || 1000;
      nextBalance = Math.max(0, card.current_balance - target);
      delta = -Math.min(card.current_balance, target);
    } else if (prog.type === 'subscription') {
      nextBalance = rules.monthly_visits || 4;
      delta = nextBalance;
      txType = 'subscription_reset';
      notes = `Renovación mensual (${nextBalance} visitas)`;
    }

    await supabase.from('card_transactions').insert({
      card_id: card.id,
      tenant_id: activeTenant.id,
      type: txType,
      status: 'completed',
      purchase_amount: 0,
      delta_value: delta,
      balance_after: nextBalance,
      notes,
    });

    await supabase
      .from('wallet_cards')
      .update({
        current_balance: nextBalance,
        reward_available: computeRewardAvailable(prog.type, rules, nextBalance),
        updated_at: new Date().toISOString(),
      })
      .eq('id', card.id);

    invokeWalletBalanceUpdate({
      cardId: card.id,
      googleObjectId: card.google_object_id,
      tenant: activeTenant,
      program: prog,
      currentBalance: nextBalance,
      holderName: card.customer?.full_name || 'Cliente VIP',
      pushTitle: `¡Premio canjeado en ${activeTenant.name}!`,
      pushBody: notes,
    }).catch(() => null);

    if (soundEnabled) playChime('success');
    await fetchTenantDetails(activeTenant.id);
  };

  const registerManualCustomer = async (
    tenantId: string,
    fullName: string,
    phone: string,
    age?: number | null
  ) => {
    if (!activeTenant?.program) return;
    const cleanPhone = normalizeBoliviaPhone(phone);
    if (!cleanPhone) throw new Error('Número de WhatsApp inválido');

    const baseCustomerPayload = { phone: cleanPhone, full_name: fullName.trim() };
    const payloadWithAge =
      typeof age === 'number' && Number.isFinite(age)
        ? { ...baseCustomerPayload, age: Math.round(age) }
        : baseCustomerPayload;

    let customerRes = await supabase
      .from('customers')
      .upsert(payloadWithAge, { onConflict: 'phone' })
      .select()
      .single();

    if (customerRes.error && /age/i.test(customerRes.error.message)) {
      customerRes = await supabase
        .from('customers')
        .upsert(baseCustomerPayload, { onConflict: 'phone' })
        .select()
        .single();
    }

    const { data: customer, error: cErr } = customerRes;
    if (cErr || !customer) throw new Error(cErr?.message || 'Error al guardar cliente');

    const prog = activeTenant.program;
    const initialBalance =
      prog.type === 'subscription'
        ? prog.rules.monthly_visits || 4
        : prog.type === 'stamps'
        ? 1
        : prog.type === 'points'
        ? prog.rules.points_per_visit || 50
        : 0;

    const { error: wErr } = await supabase.from('wallet_cards').upsert(
      {
        tenant_id: tenantId,
        program_id: prog.id,
        customer_id: customer.id,
        current_balance: initialBalance,
        lifetime_accumulated: initialBalance,
        last_tap_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,customer_id' }
    );

    if (wErr) throw new Error(wErr.message);
    await fetchTenantDetails(tenantId);
  };

  const sendPushCampaign = async (tenantId: string, title: string, message: string) => {
    if (campaignInFlightRef.current) {
      return { sentCount: 0, warning: 'Envío en curso, espera un momento.' };
    }
    campaignInFlightRef.current = true;

    try {
      const googleObjectIds = Array.from(
        new Set(cards.map((c) => c.google_object_id).filter((id): id is string => Boolean(id)))
      );

      let delivered = 0;
      let hadError = false;
      let serverAlreadySavedPush = false;

      try {
        const { data, error } = await supabase.functions.invoke('wallet-pass', {
          body: {
            action: 'send_campaign',
            tenantId,
            pushTitle: title,
            pushBody: message,
            googleObjectIds,
          },
        });
        if (!error && data?.success !== false) {
          delivered = Number(
            data?.sentCount ?? data?.delivered ?? data?.count ?? googleObjectIds.length
          );
          serverAlreadySavedPush = Boolean(
            data?.marketingPushId || data?.pushId || data?.insertedInDb || data?.saved
          );
        } else {
          hadError = true;
        }
      } catch {
        hadError = true;
      }

      if (!serverAlreadySavedPush) {
        const fifteenSecsAgoIso = new Date(Date.now() - 15_000).toISOString();
        const { data: recentExisting } = await supabase
          .from('marketing_pushes')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('title', title)
          .eq('message', message)
          .gte('created_at', fifteenSecsAgoIso)
          .limit(1)
          .maybeSingle();

        if (!recentExisting?.id) {
          const { error: dbErr } = await supabase.from('marketing_pushes').insert({
            tenant_id: tenantId,
            title,
            message,
            sent_count: delivered,
          });
          if (dbErr) throw new Error(dbErr.message);
        }
      }

      await fetchTenantDetails(tenantId);
      if (soundEnabled) playChime('success');

      return {
        sentCount: delivered,
        warning:
          googleObjectIds.length === 0
            ? 'Campaña guardada en historial y enviada a Web Passes en vivo (aún no hay tarjetas vinculadas en Google Wallet).'
            : hadError
            ? 'Campaña guardada en historial. Verifica la acción send_campaign y los secretos de Google Wallet en la Edge Function wallet-pass.'
            : undefined,
      };
    } finally {
      campaignInFlightRef.current = false;
    }
  };

  return (
    <AppContext.Provider
      value={{
        user,
        session,
        authLoading,
        isSupabaseReady: isSupabaseConfigured,
        isSuperAdmin,
        tenantsLoaded,
        myTenants,
        activeTenant,
        setActiveTenantId,
        cards,
        transactions,
        campaigns,
        dataLoading,
        soundEnabled,
        setSoundEnabled,
        refreshData,
        signIn,
        signUp,
        signOut,
        createTenantWithProgram,
        updateTenantAndProgram,
        resolveTransaction,
        manualAdjustCard,
        redeemCardReward,
        registerManualCustomer,
        sendPushCampaign,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
