import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Banknote,
  BellRing,
  Clock,
  Gift,
  KeyRound,
  Loader2,
  MapPin,
  Nfc,
  PlusSquare,
  Share,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  X,
} from 'lucide-react';
import { PoweredByBlockOps } from '../components/brand/BlockOpsLogo';
import { DigitalPassCard } from '../components/wallet/DigitalPassCard';
import {
  buildProgressPushMessage,
  invokeWalletBalanceUpdate,
  isSupabaseConfigured,
  supabase,
} from '../lib/supabase';
import {
  Customer,
  getTenantSubscriptionStatus,
  LOYALTY_PLANS_META,
  LoyaltyProgram,
  TenantWithProgram,
  WalletCard,
} from '../types/loyalty';
import {
  BOLIVIA_PHONE_PREFIX,
  focusAfterBoliviaPrefix,
  formatBoliviaPhoneInput,
  getDistanceMeters,
  isValidCustomerPhone,
  normalizeBoliviaPhone,
  requestCurrentPosition,
} from '../utils/bolivia';
import {
  registerLoyaltyServiceWorker,
  requestCustomerNotificationPermission,
  showNativeNotification,
} from '../utils/notifications';

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export const TapViewPage: React.FC = () => {
  const { slug = '' } = useParams<{ slug: string }>();
  const tokenKey = `blockops_pwa_token_${slug}`;
  const legacyTokenKey = `clockops_pwa_token_${slug}`;

  const [tenant, setTenant] = useState<TenantWithProgram | null>(null);
  const [card, setCard] = useState<WalletCard | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Registration state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState(BOLIVIA_PHONE_PREFIX);
  const [age, setAge] = useState<number>(25);
  const [enteredPin, setEnteredPin] = useState('');
  const [counterPinInput, setCounterPinInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Amount-based ticket submission
  const [ticketAmount, setTicketAmount] = useState('');
  const [pendingTxId, setPendingTxId] = useState<string | null>(null);

  // UI feedback
  const [banner, setBanner] = useState<{
    type: 'success' | 'cooldown' | 'pending' | 'error';
    text: string;
  } | null>(null);
  const [pulseCard, setPulseCard] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [googleSaveUrl, setGoogleSaveUrl] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const tapAttemptedKeyRef = useRef<string | null>(null);
  const lastKnownBalanceRef = useRef<number | null>(null);
  const lastLocalTapTimestampRef = useRef<number>(0);
  const pendingTxIdRef = useRef<string | null>(null);
  const tenantRef = useRef<TenantWithProgram | null>(null);
  const realtimeSeqRef = useRef<number>(0);

  const isIos = isIosDevice();

  const createPendingApprovalVisit = async (
    t: TenantWithProgram,
    currentCard: WalletCard,
    delta: number,
    notes: string,
    bannerText: string
  ) => {
    const tenMinsAgoIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentPending } = await supabase
      .from('card_transactions')
      .select('id')
      .eq('card_id', currentCard.id)
      .eq('status', 'pending_approval')
      .eq('type', 'earn')
      .gte('created_at', tenMinsAgoIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentPending?.id) {
      setPendingTxId(recentPending.id);
      setBanner({ type: 'pending', text: bannerText });
      return;
    }

    const { data: tx } = await supabase
      .from('card_transactions')
      .insert({
        card_id: currentCard.id,
        tenant_id: t.id,
        type: 'earn',
        status: 'pending_approval',
        purchase_amount: 0,
        delta_value: delta,
        balance_after: currentCard.current_balance,
        notes,
      })
      .select()
      .single();

    if (tx?.id) setPendingTxId(tx.id);
    setBanner({ type: 'pending', text: bannerText });
  };

  const executeAutomaticTap = useCallback(
    async (
      t: TenantWithProgram,
      prog: LoyaltyProgram,
      currentCard: WalletCard,
      custName?: string,
      pinVerified = false
    ) => {
      const rules = prog.rules;
      const cooldownHours = rules.cooldown_hours ?? 4;
      const validationMode =
        rules.validation_mode || (rules.auto_approve === false ? 'approval' : 'auto');

      // Si el negocio exige PIN de mostrador y aún no se verificó mediante el formulario de PIN, omitir tap silencioso
      if (validationMode === 'pin' && !pinVerified) {
        return;
      }

      // 1. Validación local de Cooldown (por defecto 4 horas)
      if (currentCard.last_tap_at && cooldownHours > 0) {
        const elapsedMs = Date.now() - new Date(currentCard.last_tap_at).getTime();
        const cooldownMs = cooldownHours * 3600 * 1000;
        if (elapsedMs < cooldownMs) {
          const remainingMs = cooldownMs - elapsedMs;
          const hoursLeft = Math.max(1, Math.ceil(remainingMs / 3600000));
          const minsLeft = Math.max(1, Math.ceil(remainingMs / 60000));
          setBanner({
            type: 'cooldown',
            text:
              remainingMs >= 3600000
                ? `Ya registraste tu visita de hoy. Podrás volver a sumar en ${hoursLeft} ${
                    hoursLeft === 1 ? 'hora' : 'horas'
                  }.`
                : `Ya registraste tu visita de hoy. Podrás volver a sumar en ${minsLeft} min.`,
          });
          return;
        }
      }

      let delta = 1;
      let nextBalance = currentCard.current_balance;
      let notes = '+1 Sello por visita NFC/QR';

      if (prog.type === 'stamps') {
        const goal = rules.goal || 10;
        if (currentCard.current_balance >= goal) {
          setBanner({
            type: 'success',
            text: `¡Ya completaste ${goal} sellos! Solicita tu canje abajo.`,
          });
          return;
        }
        delta = 1;
        nextBalance = Math.min(goal, currentCard.current_balance + 1);
      } else if (prog.type === 'points') {
        delta = rules.points_per_visit || 50;
        nextBalance = currentCard.current_balance + delta;
        notes = `+${delta} Puntos por visita NFC/QR`;
      } else if (prog.type === 'subscription') {
        if (currentCard.current_balance <= 0) {
          setBanner({
            type: 'error',
            text: 'Ya consumiste todas tus visitas mensuales disponibles.',
          });
          return;
        }
        delta = -1;
        nextBalance = currentCard.current_balance - 1;
        notes = 'Uso de 1 visita de suscripción';
      }

      // Si el negocio configuró modo "Solicitud de Aceptación", no acreditar de forma automática:
      if (validationMode === 'approval') {
        await createPendingApprovalVisit(
          t,
          currentCard,
          delta,
          `${notes} (Esperando aprobación de caja)`,
          'Solicitud de visita enviada al mostrador. Tu cajero la aprobará al momento de pagar.'
        );
        return;
      }

      // 2. Validación de presencia física GPS según radio permitido (gps_radius_meters)
      let customerCoords: { lat: number; lng: number } | null = null;
      const hasStoreCoords =
        t.lat !== null &&
        t.lng !== null &&
        Number.isFinite(Number(t.lat)) &&
        Number.isFinite(Number(t.lng));

      const allowedGpsRadius =
        rules.gps_radius_meters && Number(rules.gps_radius_meters) > 0
          ? Number(rules.gps_radius_meters)
          : 120;

      if (hasStoreCoords) {
        customerCoords = await requestCurrentPosition(8000);
        if (!customerCoords) {
          await createPendingApprovalVisit(
            t,
            currentCard,
            delta,
            `${notes} (Sin GPS · Aprobar en caja)`,
            'No se pudo verificar tu ubicación GPS en el local. Tu visita quedó pendiente para aprobación del cajero.'
          );
          return;
        }

        const distanceMeters = getDistanceMeters(
          customerCoords.lat,
          customerCoords.lng,
          Number(t.lat),
          Number(t.lng)
        );
        if (distanceMeters > allowedGpsRadius) {
          await createPendingApprovalVisit(
            t,
            currentCard,
            delta,
            `${notes} (${Math.round(distanceMeters)}m del local · Aprobar en caja)`,
            `Estás a ${Math.round(distanceMeters)}m del local (máximo ${allowedGpsRadius}m para suma automática). Tu visita quedó pendiente de aprobación en caja.`
          );
          return;
        }
      }

      // 3. Validación antifraude de servidor + sincronización Google Wallet
      let serverAlreadyRecorded = false;
      let serverUpdatedCard: Partial<WalletCard> | null = null;
      const { pushTitle, pushBody } = buildProgressPushMessage(t.name, prog, nextBalance);
      try {
        const { data, error } = await invokeWalletBalanceUpdate({
          googleObjectId: currentCard.google_object_id || '',
          tenant: t,
          program: prog,
          currentBalance: nextBalance,
          holderName: custName || currentCard.customer?.full_name || 'Cliente VIP',
          pushTitle,
          pushBody,
          isCustomerTap: true,
          cardId: currentCard.id,
          customerLat: customerCoords?.lat ?? null,
          customerLng: customerCoords?.lng ?? null,
        });

        const serverMsg = String(data?.error || data?.message || error?.message || '');

        if (data?.cooldown || /cooldown|horas|hoy|espera/i.test(serverMsg)) {
          setBanner({
            type: 'cooldown',
            text:
              data?.message ||
              data?.error ||
              `Ya registraste tu visita de hoy. Podrás volver a sumar en ${cooldownHours} horas.`,
          });
          return;
        }

        if (
          data?.pendingApproval ||
          data?.requiresApproval ||
          data?.tooFar ||
          /gps|distancia|metros|ubicación|pin|cajero|aprob/i.test(serverMsg)
        ) {
          if (data?.transactionId) {
            setPendingTxId(String(data.transactionId));
            setBanner({
              type: 'pending',
              text:
                data?.message ||
                data?.error ||
                'Tu visita requiere aprobación del cajero en el mostrador.',
            });
          } else {
            await createPendingApprovalVisit(
              t,
              currentCard,
              delta,
              `${notes} (Validación remota · Aprobar en caja)`,
              data?.message ||
                data?.error ||
                'Tu visita quedó pendiente de aprobación del cajero en mostrador.'
            );
          }
          return;
        }

        if (data?.blocked) {
          setBanner({
            type: 'cooldown',
            text:
              data?.message ||
              data?.error ||
              'Ya registraste tu visita reciente. Muestra tu tarjeta en caja.',
          });
          return;
        }

        if (data?.alreadyRecorded || data?.transactionId) {
          serverAlreadyRecorded = true;
        }
        if (data?.updatedCard) {
          serverUpdatedCard = data.updatedCard as Partial<WalletCard>;
        }
      } catch {
        // Si wallet-pass no está desplegada o faltan credenciales, continuar ya que pasó validación local
      }

      const rewardAvailable =
        (prog.type === 'stamps' && nextBalance >= (rules.goal || 10)) ||
        (prog.type === 'points' && nextBalance >= (rules.goal_points || 500));

      lastKnownBalanceRef.current = nextBalance;
      lastLocalTapTimestampRef.current = Date.now();

      let updatedCard: WalletCard | null = null;
      if (serverUpdatedCard) {
        updatedCard = {
          ...currentCard,
          ...serverUpdatedCard,
        };
      } else if (serverAlreadyRecorded) {
        const { data: fetchedCard } = await supabase
          .from('wallet_cards')
          .select('*')
          .eq('id', currentCard.id)
          .maybeSingle();
        updatedCard = (fetchedCard as WalletCard | null) ?? {
          ...currentCard,
          current_balance: nextBalance,
          lifetime_accumulated: currentCard.lifetime_accumulated + Math.abs(delta),
          reward_available: rewardAvailable,
        };
      } else {
        const { data: persistedCard } = await supabase
          .from('wallet_cards')
          .update({
            current_balance: nextBalance,
            lifetime_accumulated: currentCard.lifetime_accumulated + Math.abs(delta),
            reward_available: rewardAvailable,
            last_tap_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentCard.id)
          .select()
          .single();
        updatedCard = persistedCard as WalletCard | null;

        await supabase.from('card_transactions').insert({
          card_id: currentCard.id,
          tenant_id: t.id,
          type: 'earn',
          status: 'completed',
          purchase_amount: 0,
          delta_value: delta,
          balance_after: nextBalance,
          notes,
        });
      }

      if (updatedCard) {
        setCard({
          ...updatedCard,
          current_balance: Number(updatedCard.current_balance),
          lifetime_accumulated: Number(updatedCard.lifetime_accumulated),
          customer: currentCard.customer,
        });
      }

      setBanner({
        type: 'success',
        text:
          prog.type === 'stamps'
            ? '¡+1 Sello sumado a tu tarjeta!'
            : prog.type === 'points'
            ? `¡+${delta} Puntos acreditados!`
            : `Visita registrada. Te quedan ${nextBalance} visitas este mes.`,
      });
      setPulseCard(true);
      setTimeout(() => setPulseCard(false), 900);
    },
    []
  );

  const loadTenantAndCard = useCallback(async () => {
    if (!slug || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    const { data: tenantRow, error } = await supabase
      .from('tenants')
      .select('*, loyalty_programs(*)')
      .eq('slug', slug)
      .maybeSingle();

    if (error || !tenantRow) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const progs = (
      tenantRow as unknown as { loyalty_programs: LoyaltyProgram[] | LoyaltyProgram }
    ).loyalty_programs;
    const program = Array.isArray(progs) ? progs[0] || null : progs || null;

    const fullTenant: TenantWithProgram = {
      ...tenantRow,
      lat: tenantRow.lat !== null ? Number(tenantRow.lat) : null,
      lng: tenantRow.lng !== null ? Number(tenantRow.lng) : null,
      program,
    };
    setTenant(fullTenant);

    const savedToken = localStorage.getItem(tokenKey) || localStorage.getItem(legacyTokenKey);
    if (savedToken) {
      localStorage.setItem(tokenKey, savedToken);
      const { data: cardRow } = await supabase
        .from('wallet_cards')
        .select('*, customers(*)')
        .eq('tenant_id', fullTenant.id)
        .eq('pwa_token', savedToken)
        .maybeSingle();

      if (cardRow) {
        const cust = (cardRow as unknown as { customers?: Customer }).customers || null;
        const normalizedCard: WalletCard = {
          ...cardRow,
          current_balance: Number(cardRow.current_balance || 0),
          lifetime_accumulated: Number(cardRow.lifetime_accumulated || 0),
          customer: cust || undefined,
        };
        setCard(normalizedCard);
        setCustomer(cust);

        // Automatic Tap-to-Earn on visit if plan is automatic (ejecutar una sola vez por carga)
        const visitKey = `${fullTenant.id}:${cardRow.id}`;
        const validationMode =
          program?.rules.validation_mode ||
          (program?.rules.auto_approve === false ? 'approval' : 'auto');

        if (
          program &&
          (fullTenant.status === 'trial' || fullTenant.status === 'active') &&
          validationMode !== 'pin' &&
          LOYALTY_PLANS_META[program.type].isAutomatic &&
          tapAttemptedKeyRef.current !== visitKey
        ) {
          tapAttemptedKeyRef.current = visitKey;
          await executeAutomaticTap(fullTenant, program, normalizedCard, cust?.full_name);
        }
      } else {
        localStorage.removeItem(tokenKey);
        localStorage.removeItem(legacyTokenKey);
      }
    }

    setLoading(false);
  }, [slug, tokenKey, legacyTokenKey, executeAutomaticTap]);

  useEffect(() => {
    lastKnownBalanceRef.current = card ? Number(card.current_balance) : null;
  }, [card?.id, card?.current_balance]);

  useEffect(() => {
    pendingTxIdRef.current = pendingTxId;
  }, [pendingTxId]);

  useEffect(() => {
    tenantRef.current = tenant;
  }, [tenant]);

  useEffect(() => {
    void registerLoyaltyServiceWorker();
    void requestCustomerNotificationPermission().then((perm) => {
      setNotifPermission(perm);
    });
  }, [slug]);

  useEffect(() => {
    loadTenantAndCard();
  }, [loadTenantAndCard]);

  // Realtime watch on customer's card, transactions & marketing pushes
  useEffect(() => {
    if (!tenant?.id || !isSupabaseConfigured) return;

    let isEffectActive = true;
    const channelName = `tap-live-${tenant.id}-${card?.id || 'anon'}-${++realtimeSeqRef.current}`;
    const channel = supabase.channel(channelName);

    if (card?.id) {
      channel
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'wallet_cards',
            filter: `id=eq.${card.id}`,
          },
          (payload) => {
            if (!isEffectActive) return;
            const currentTenant = tenantRef.current;
            const next = payload.new as WalletCard;
            const prevBalance = lastKnownBalanceRef.current;
            const nextBalance = Number(next.current_balance);
            lastKnownBalanceRef.current = nextBalance;

            setCard((prev) =>
              prev
                ? {
                    ...prev,
                    ...next,
                    current_balance: nextBalance,
                    lifetime_accumulated: Number(next.lifetime_accumulated),
                  }
                : null
            );
            setPulseCard(true);
            setTimeout(() => setPulseCard(false), 800);

            const isRecentLocalTap = Date.now() - lastLocalTapTimestampRef.current < 4000;
            if (
              !isRecentLocalTap &&
              prevBalance !== null &&
              nextBalance !== prevBalance &&
              currentTenant?.program
            ) {
              const { pushTitle, pushBody } = buildProgressPushMessage(
                currentTenant.name,
                currentTenant.program,
                nextBalance
              );
              void showNativeNotification({
                title: pushTitle,
                body: pushBody,
                icon: currentTenant.logo_url,
                badge: currentTenant.logo_url,
                tag: `wallet-update-${card.id}-${nextBalance}`,
                url: `/tap/${currentTenant.slug}`,
              });
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'card_transactions',
            filter: `card_id=eq.${card.id}`,
          },
          (payload) => {
            if (!isEffectActive) return;
            const updatedTx = payload.new as { id: string; status: string };
            if (pendingTxIdRef.current && updatedTx.id === pendingTxIdRef.current) {
              if (updatedTx.status === 'completed') {
                setBanner({
                  type: 'success',
                  text: '¡Aprobado en caja! Tu saldo se ha actualizado al instante.',
                });
                setPendingTxId(null);
              } else if (updatedTx.status === 'rejected') {
                setBanner({
                  type: 'error',
                  text: 'Tu solicitud fue rechazada en mostrador.',
                });
                setPendingTxId(null);
              }
            }
          }
        );
    }

    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'marketing_pushes',
        filter: `tenant_id=eq.${tenant.id}`,
      },
      (payload) => {
        if (!isEffectActive) return;
        const currentTenant = tenantRef.current;
        const pushRow = payload.new as {
          id?: string;
          title?: string;
          message?: string;
        };
        const title = pushRow.title || currentTenant?.name || 'Nueva Promoción';
        const body = pushRow.message || 'Tienes una nueva promoción disponible.';

        setBanner({
          type: 'success',
          text: `${title}: ${body}`,
        });

        void showNativeNotification({
          title,
          body,
          icon: currentTenant?.logo_url,
          badge: currentTenant?.logo_url,
          tag: pushRow.id ? `marketing-push-${pushRow.id}` : `marketing-push-${title}::${body}`,
          url: currentTenant ? `/tap/${currentTenant.slug}` : window.location.pathname,
        });
      }
    );

    channel.subscribe();

    return () => {
      isEffectActive = false;
      void supabase.removeChannel(channel);
    };
  }, [card?.id, tenant?.id]);

  const generateAndPersistWalletSaveLink = async (
    targetTenant: TenantWithProgram,
    targetCustomer: Customer,
    targetCard: WalletCard,
    targetProgram: LoyaltyProgram
  ) => {
    const { data, error } = await supabase.functions.invoke('wallet-pass', {
      body: {
        action: 'generate_save_link',
        tenant: targetTenant,
        customer: targetCustomer,
        card: targetCard,
        program: targetProgram,
      },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    if (data?.googleObjectId) {
      const { error: updateErr } = await supabase
        .from('wallet_cards')
        .update({
          google_object_id: data.googleObjectId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetCard.id);

      if (updateErr) {
        console.warn('No se pudo persistir google_object_id en wallet_cards:', updateErr.message);
      }

      setCard((prev) =>
        prev && prev.id === targetCard.id
          ? { ...prev, google_object_id: data.googleObjectId }
          : prev
      );
    }

    if (data?.saveUrl) {
      setGoogleSaveUrl(data.saveUrl);
    }

    return data as { saveUrl?: string; googleObjectId?: string } | null;
  };

  const handleFirstRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant?.program || !fullName.trim()) return;
    if (!isValidCustomerPhone(phone)) {
      setBanner({
        type: 'error',
        text: 'Ingresa tu número de WhatsApp después de +591 (mínimo 7 dígitos).',
      });
      return;
    }

    setSubmitting(true);
    setBanner(null);
    void requestCustomerNotificationPermission().then(setNotifPermission);

    try {
      const prog = tenant.program;
      const rules = prog.rules;
      const validationMode =
        rules.validation_mode || (rules.auto_approve === false ? 'approval' : 'auto');

      const allowedGpsRadius =
        rules.gps_radius_meters && Number(rules.gps_radius_meters) > 0
          ? Number(rules.gps_radius_meters)
          : 120;

      const hasStoreCoords =
        tenant.lat !== null &&
        tenant.lng !== null &&
        Number.isFinite(Number(tenant.lat)) &&
        Number.isFinite(Number(tenant.lng));

      if (hasStoreCoords) {
        const customerCoords = await requestCurrentPosition(8000);
        if (!customerCoords) {
          setBanner({
            type: 'error',
            text: 'Debes activar y permitir tu ubicación GPS para confirmar que te encuentras en el local antes de registrarte.',
          });
          setSubmitting(false);
          return;
        }
        const distanceMeters = getDistanceMeters(
          customerCoords.lat,
          customerCoords.lng,
          Number(tenant.lat),
          Number(tenant.lng)
        );
        if (distanceMeters > allowedGpsRadius) {
          setBanner({
            type: 'error',
            text: `Estás a ${Math.round(
              distanceMeters
            )}m del local. Para registrarte por QR o NFC debes estar dentro del radar del negocio (máximo ${allowedGpsRadius}m).`,
          });
          setSubmitting(false);
          return;
        }
      }

      if (validationMode === 'pin') {
        const expectedPin = String(rules.cashier_pin || '').trim().toUpperCase();
        if (!enteredPin.trim() || enteredPin.trim().toUpperCase() !== expectedPin) {
          setBanner({
            type: 'error',
            text: 'Código PIN de mostrador incorrecto. Solicítalo en caja para activar tu tarjeta.',
          });
          setSubmitting(false);
          return;
        }
      }

      const cleanPhone = normalizeBoliviaPhone(phone);
      const baseCustomer = { phone: cleanPhone, full_name: fullName.trim() };
      let custRes = await supabase
        .from('customers')
        .upsert({ ...baseCustomer, age }, { onConflict: 'phone' })
        .select()
        .single();

      if (custRes.error && /age/i.test(custRes.error.message)) {
        custRes = await supabase
          .from('customers')
          .upsert(baseCustomer, { onConflict: 'phone' })
          .select()
          .single();
      }

      const { data: cust, error: cErr } = custRes;
      if (cErr || !cust) throw new Error(cErr?.message || 'Error al registrar tus datos');

      // Check if customer already has a card at this tenant
      const { data: existingCard } = await supabase
        .from('wallet_cards')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('customer_id', cust.id)
        .maybeSingle();

      if (existingCard) {
        localStorage.setItem(tokenKey, existingCard.pwa_token);
        const normalizedExisting: WalletCard = {
          ...existingCard,
          current_balance: Number(existingCard.current_balance),
          lifetime_accumulated: Number(existingCard.lifetime_accumulated),
        };
        setCustomer(cust as Customer);
        setCard(normalizedExisting);
        setBanner({ type: 'success', text: `¡Bienvenido de nuevo, ${cust.full_name}!` });

        if (!isIos && !normalizedExisting.google_object_id) {
          try {
            const walletData = await generateAndPersistWalletSaveLink(
              tenant,
              cust as Customer,
              normalizedExisting,
              tenant.program
            );
            if (walletData?.saveUrl) {
              setSubmitting(false);
              window.location.href = walletData.saveUrl;
              return;
            }
          } catch {
            // Keep screen interactive so user can retry manually with the button
          }
        }

        setSubmitting(false);
        return;
      }

      const isApprovalMode = validationMode === 'approval';
      const initialBalance =
        prog.type === 'stamps'
          ? 1
          : prog.type === 'points'
          ? rules.points_per_visit || 50
          : prog.type === 'subscription'
          ? Math.max(0, (rules.monthly_visits || 4) - 1)
          : 0;

      const startingBalance = isApprovalMode ? 0 : initialBalance;

      const { data: newCard, error: wErr } = await supabase
        .from('wallet_cards')
        .insert({
          tenant_id: tenant.id,
          program_id: prog.id,
          customer_id: cust.id,
          current_balance: startingBalance,
          lifetime_accumulated: startingBalance,
          last_tap_at: isApprovalMode ? null : initialBalance > 0 ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (wErr || !newCard) throw new Error(wErr?.message || 'No se pudo emitir tu tarjeta');

      const { data: initialTx } = await supabase
        .from('card_transactions')
        .insert({
          card_id: newCard.id,
          tenant_id: tenant.id,
          type: 'earn',
          status: isApprovalMode ? 'pending_approval' : 'completed',
          purchase_amount: 0,
          delta_value: prog.type === 'subscription' ? -1 : initialBalance,
          balance_after: startingBalance,
          notes: isApprovalMode
            ? '1er Sello de bienvenida (Pendiente de aprobación en caja)'
            : 'Registro inicial Tap-to-Earn',
        })
        .select()
        .single();

      if (isApprovalMode && initialTx?.id) {
        setPendingTxId(initialTx.id);
      }

      const normalizedNewCard: WalletCard = {
        ...newCard,
        current_balance: Number(newCard.current_balance),
        lifetime_accumulated: Number(newCard.lifetime_accumulated),
        customer: cust as Customer,
      };

      localStorage.setItem(tokenKey, newCard.pwa_token);
      setCustomer(cust as Customer);
      setCard(normalizedNewCard);
      setBanner({
        type: isApprovalMode ? 'pending' : 'success',
        text: isApprovalMode
          ? '¡Tarjeta creada! Tu 1er sello está pendiente de aprobación por el cajero.'
          : prog.type === 'stamps'
          ? '¡Tarjeta creada con tu 1er Sello gratis!'
          : prog.type === 'points'
          ? `¡Tarjeta creada con ${initialBalance} puntos!`
          : '¡Tu tarjeta BlockOps Loyalty está lista!',
      });
      setPulseCard(true);
      setTimeout(() => setPulseCard(false), 900);

      // Inmediatamente en este mismo flujo: generar pase Google Wallet, guardar google_object_id y abrir en Android/Escritorio
      try {
        const walletData = await generateAndPersistWalletSaveLink(
          tenant,
          cust as Customer,
          normalizedNewCard,
          prog
        );
        if (!isIos && walletData?.saveUrl) {
          setSubmitting(false);
          window.location.href = walletData.saveUrl;
          return;
        }
      } catch (walletErr) {
        console.warn('Google Wallet auto-dispatch no disponible:', walletErr);
      }
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al crear tu tarjeta',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePinTapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant?.program || !card) return;
    const prog = tenant.program;
    const rules = prog.rules;

    const expectedPin = String(rules.cashier_pin || '').trim().toUpperCase();
    if (!counterPinInput.trim() || counterPinInput.trim().toUpperCase() !== expectedPin) {
      setBanner({
        type: 'error',
        text: 'Código PIN de mostrador incorrecto. Solicítalo en caja a quien te atiende.',
      });
      return;
    }

    setSubmitting(true);
    setBanner(null);
    try {
      await executeAutomaticTap(tenant, prog, card, customer?.full_name, true);
      setCounterPinInput('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant?.program || !card) return;
    const amt = Number(ticketAmount);
    if (!amt || amt <= 0) return;

    setSubmitting(true);
    try {
      const prog = tenant.program;
      const pct = prog.rules.cashback_percent || 10;
      const delta = prog.type === 'cashback' ? Number(((amt * pct) / 100).toFixed(2)) : amt;

      const { data: tx, error } = await supabase
        .from('card_transactions')
        .insert({
          card_id: card.id,
          tenant_id: tenant.id,
          type: 'earn',
          status: 'pending_approval',
          purchase_amount: amt,
          delta_value: delta,
          balance_after: card.current_balance,
          notes:
            prog.type === 'cashback'
              ? `Cashback (${pct}%) por consumo`
              : 'Compra por acumular',
        })
        .select()
        .single();

      if (error || !tx) throw new Error(error?.message || 'Error al enviar solicitud');
      setPendingTxId(tx.id);
      setTicketAmount('');
      setBanner({
        type: 'pending',
        text: 'Ticket enviado a caja. Esperando aprobación del cajero...',
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al enviar monto',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestRedeem = async () => {
    if (!tenant?.program || !card) return;
    setSubmitting(true);
    try {
      const { data: tx, error } = await supabase
        .from('card_transactions')
        .insert({
          card_id: card.id,
          tenant_id: tenant.id,
          type: 'redeem',
          status: 'pending_approval',
          purchase_amount: 0,
          delta_value: 1,
          balance_after: card.current_balance,
          notes: `Canje de Premio: ${tenant.program.rules.reward}`,
        })
        .select()
        .single();

      if (error || !tx) throw new Error(error?.message || 'No se pudo solicitar el canje');
      setPendingTxId(tx.id);
      setBanner({
        type: 'pending',
        text: 'Solicitud de canje enviada al cajero. Muestra tu pantalla en mostrador.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleWalletSave = async () => {
    if (!card || !tenant?.program || !customer) return;

    if (googleSaveUrl && card.google_object_id) {
      window.location.href = googleSaveUrl;
      return;
    }

    setWalletLoading(true);
    try {
      const data = await generateAndPersistWalletSaveLink(
        tenant,
        customer,
        card,
        tenant.program
      );

      if (data?.saveUrl) {
        window.location.href = data.saveUrl;
        return;
      }

      setBanner({
        type: 'error',
        text: 'Faltan las credenciales GOOGLE_WALLET_ISSUER_ID / CLIENT_EMAIL / PRIVATE_KEY en Supabase Edge Functions.',
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text:
          err instanceof Error && err.message
            ? `Google Wallet: ${err.message}`
            : 'Despliega la Edge Function wallet-pass con tus credenciales de Google Wallet para guardar el pase.',
      });
    } finally {
      setWalletLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090D16] text-white flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-[#0EA5E9] animate-spin" />
        <p className="text-xs text-slate-400">Cargando tarjeta digital...</p>
      </div>
    );
  }

  if (notFound || !tenant || !tenant.program) {
    return (
      <div className="min-h-screen bg-[#090D16] text-white flex flex-col items-center justify-center p-6 text-center">
        <Store className="w-12 h-12 text-[#0EA5E9] mb-3" />
        <h1 className="font-display text-2xl font-bold">Negocio no encontrado</h1>
        <p className="text-sm text-slate-400 mt-1">
          El enlace <code>/tap/{slug}</code> no corresponde a un comercio activo.
        </p>
        <Link to="/" className="mt-6 rounded-xl bg-[#0B4BE3] px-5 py-2.5 text-xs font-bold text-white">
          Ir a BlockOps Loyalty
        </Link>
      </div>
    );
  }

  const subStatus = getTenantSubscriptionStatus(tenant);
  if (subStatus.isBlocked) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full rounded-3xl bg-[#111827] border border-white/10 p-7 shadow-2xl space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/30">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Negocio Deshabilitado</span>
          </span>
          <h1 className="font-display text-2xl font-extrabold text-white">{tenant.name}</h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Este negocio se encuentra deshabilitado. Solicita al comercio que habilite su cuenta para
            poder registrar tus visitas, acumular puntos y canjear premios.
          </p>
          <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-xs text-slate-400">
            <strong>Estado:</strong> {subStatus.blockReason || 'Suscripción o prueba vencida'}
          </div>
          <div className="pt-4 border-t border-white/10">
            <PoweredByBlockOps dark />
          </div>
        </div>
      </div>
    );
  }

  const planMeta = LOYALTY_PLANS_META[tenant.program.type];
  const rules = tenant.program.rules;
  const isRewardReady = Boolean(
    card &&
      (card.reward_available ||
        (tenant.program.type === 'stamps' && card.current_balance >= (rules.goal || 10)) ||
        (tenant.program.type === 'points' &&
          card.current_balance >= (rules.goal_points || 500)) ||
        (tenant.program.type === 'discount' &&
          card.current_balance >= (rules.target_spend || 1000)) ||
        (tenant.program.type === 'cashback' &&
          card.current_balance >= (rules.min_redeem_amount || 50)))
  );

  return (
    <div
      className="min-h-screen flex flex-col justify-between pb-10"
      style={{
        background: `radial-gradient(circle at 50% 0%, ${tenant.brand_color}26 0%, #F8FAFC 48%)`,
      }}
    >
      <main className="w-full max-w-md mx-auto px-4 pt-8 flex-1 flex flex-col justify-center">
        <div className="text-center mb-5">
          <div
            className="h-16 w-16 rounded-2xl mx-auto flex items-center justify-center shadow-lg border-2 border-white overflow-hidden mb-3"
            style={{ backgroundColor: tenant.brand_color }}
          >
            {tenant.logo_url ? (
              <img src={tenant.logo_url} alt={tenant.name} className="h-full w-full object-cover" />
            ) : (
              <span className="font-display text-2xl font-extrabold text-white">
                {tenant.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900 tracking-tight">
            {tenant.name}
          </h1>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">
            {tenant.program.name} · {rules.reward}
          </p>
        </div>

        <AnimatePresence>
          {banner && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`mb-4 rounded-2xl p-3.5 text-xs font-bold flex items-center gap-2.5 shadow-md border ${
                banner.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : banner.type === 'cooldown'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : banner.type === 'pending'
                  ? 'bg-blue-50 border-blue-200 text-[#0B4BE3]'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {banner.type === 'success' && <Sparkles className="w-5 h-5 text-emerald-500 shrink-0" />}
              {banner.type === 'cooldown' && <Clock className="w-5 h-5 text-[#FF7A00] shrink-0" />}
              {banner.type === 'pending' && <Nfc className="w-5 h-5 text-[#0B4BE3] shrink-0 animate-pulse" />}
              {banner.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />}
              <span>{banner.text}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {!card ? (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card-light rounded-3xl p-6 space-y-5"
          >
            <div className="text-center">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-extrabold text-white mb-2"
                style={{ backgroundColor: tenant.brand_color }}
              >
                <Nfc className="w-3.5 h-3.5" />
                <span>Registro en 5 segundos</span>
              </span>
              <h2 className="font-display text-lg font-extrabold text-slate-900">
                Activa tu Tarjeta Digital
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {planMeta.isAutomatic
                  ? 'Obtén tu 1ra visita/sello gratis automáticamente al registrarte.'
                  : 'Crea tu tarjeta y acumula beneficios en cada compra.'}
              </p>
            </div>

            <form onSubmit={handleFirstRegister} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tu Nombre</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej. Ana Pérez"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#0B4BE3]/30"
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
                  autoComplete="tel"
                  required
                  value={phone}
                  onFocus={(e) => focusAfterBoliviaPrefix(e.currentTarget)}
                  onChange={(e) => setPhone(formatBoliviaPhoneInput(e.target.value))}
                  placeholder="+591 7123 4567"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#0B4BE3]/30"
                />
              </div>

              <div className="rounded-2xl bg-slate-50/90 border border-slate-200/80 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="customer-age-slider" className="text-xs font-bold text-slate-700">
                    Tu Edad
                  </label>
                  <span
                    style={{ backgroundColor: tenant.brand_color }}
                    className="inline-flex items-center rounded-full px-3 py-0.5 text-xs font-extrabold text-white shadow-sm"
                  >
                    {age} años
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    aria-label="Disminuir edad"
                    onClick={() => setAge((prev) => Math.max(14, prev - 1))}
                    className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-sm font-extrabold text-slate-700 hover:bg-slate-100 shrink-0"
                  >
                    −
                  </button>
                  <input
                    id="customer-age-slider"
                    type="range"
                    min={14}
                    max={85}
                    step={1}
                    value={age}
                    onChange={(e) => setAge(Number(e.target.value))}
                    style={{ accentColor: tenant.brand_color }}
                    className="w-full h-2 rounded-lg cursor-pointer"
                  />
                  <button
                    type="button"
                    aria-label="Aumentar edad"
                    onClick={() => setAge((prev) => Math.min(85, prev + 1))}
                    className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-sm font-extrabold text-slate-700 hover:bg-slate-100 shrink-0"
                  >
                    +
                  </button>
                </div>
                <div className="flex justify-between text-[10px] font-semibold text-slate-400 px-1">
                  <span>14</span>
                  <span>25</span>
                  <span>40</span>
                  <span>60</span>
                  <span>85</span>
                </div>
              </div>

              {tenant.program.rules.validation_mode === 'pin' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Código PIN de Mostrador
                    </label>
                    <span className="text-[10px] font-semibold text-[#0B4BE3]">Pídelo en caja</span>
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={8}
                    value={enteredPin}
                    onChange={(e) => setEnteredPin(e.target.value.toUpperCase())}
                    placeholder="Ej. 1234"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold tracking-widest text-center text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-[#0B4BE3]/30"
                  />
                </div>
              )}

              {tenant.lat !== null && tenant.lng !== null && (
                <div className="flex items-center gap-2 rounded-xl bg-blue-50/70 border border-blue-200/70 px-3 py-2 text-[11px] font-semibold text-[#0B4BE3]">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Se pedirá tu ubicación GPS para verificar que estás en el local (máximo{' '}
                    {tenant.program.rules.gps_radius_meters ?? 120}m).
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{ backgroundColor: tenant.brand_color }}
                className="w-full rounded-2xl py-3.5 text-sm font-extrabold text-white shadow-lg hover:brightness-110 disabled:opacity-60 transition flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>{submitting ? 'Verificando ubicación...' : 'Crear Mi Tarjeta & Ganar'}</span>
              </button>
            </form>
          </motion.div>
        ) : (
          <div className="space-y-4">
            <DigitalPassCard
              tenant={tenant}
              program={tenant.program}
              card={card}
              customer={customer || undefined}
              animateHighlight={pulseCard}
            />

            {isRewardReady && (
              <motion.button
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                whileTap={{ scale: 0.97 }}
                type="button"
                disabled={submitting}
                onClick={handleRequestRedeem}
                className="w-full rounded-2xl bg-gradient-to-r from-[#FF7A00] to-[#F59E0B] py-3.5 px-5 text-sm font-extrabold text-white shadow-glow-amber flex items-center justify-center gap-2"
              >
                <Gift className="w-5 h-5" />
                <span>¡Premio Disponible! Solicitar Canje</span>
              </motion.button>
            )}

            {/* Formulario de Código PIN de Mostrador para clientes que ya tienen tarjeta */}
            {tenant.program.rules.validation_mode === 'pin' && (
              <form
                onSubmit={handlePinTapSubmit}
                className="glass-card-light rounded-2xl p-4 space-y-3 border border-indigo-200/80 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-indigo-600" />
                    <span>Código PIN de Mostrador</span>
                  </label>
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    Pídelo en caja
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={8}
                    required
                    value={counterPinInput}
                    onChange={(e) => setCounterPinInput(e.target.value.toUpperCase())}
                    placeholder="PIN DEL LOCAL"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center font-extrabold tracking-widest text-slate-900 uppercase"
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{ backgroundColor: tenant.brand_color }}
                    className="rounded-xl px-4 py-2.5 text-xs font-extrabold text-white shadow hover:brightness-110 disabled:opacity-60 transition shrink-0"
                  >
                    {submitting ? 'Validando...' : 'Sumar Visita'}
                  </button>
                </div>
              </form>
            )}

            {/* Botón de solicitud de aprobación en caja si el modo es approval y no hay solicitud pendiente */}
            {tenant.program.rules.validation_mode === 'approval' && !pendingTxId && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  if (tenant && tenant.program && card) {
                    void executeAutomaticTap(tenant, tenant.program, card, customer?.full_name);
                  }
                }}
                style={{ backgroundColor: tenant.brand_color }}
                className="w-full rounded-2xl py-3.5 px-4 text-xs font-extrabold text-white shadow hover:brightness-110 disabled:opacity-60 transition flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Solicitar Aprobación de Visita en Mostrador</span>
              </button>
            )}

            {!planMeta.isAutomatic && (
              <form onSubmit={handleTicketSubmit} className="glass-card-light rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-[#0B4BE3]" />
                    <span>Ingresa el monto de tu ticket (Bs)</span>
                  </label>
                  <span className="text-[10px] font-bold text-slate-400">Aprobación en caja</span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-slate-500">
                      Bs
                    </span>
                    <input
                      type="number"
                      min={1}
                      step="0.01"
                      required
                      value={ticketAmount}
                      onChange={(e) => setTicketAmount(e.target.value)}
                      placeholder="150.00"
                      className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-2.5 text-base font-extrabold text-slate-900"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{ backgroundColor: tenant.brand_color }}
                    className="rounded-xl px-4 py-2.5 text-xs font-extrabold text-white shadow hover:brightness-110 disabled:opacity-60 transition shrink-0"
                  >
                    Enviar a Caja
                  </button>
                </div>
              </form>
            )}

            {!isIos ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={walletLoading}
                  onClick={handleGoogleWalletSave}
                  className="w-full rounded-full bg-[#1F1F1F] hover:bg-black text-white py-3.5 px-6 flex items-center justify-center gap-3 shadow-xl border border-white/10 transition disabled:opacity-60"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <rect x="2" y="4" width="20" height="16" rx="4" fill="#4285F4" />
                    <path d="M2 8.5C2 6.84 3.34 5.5 5 5.5H19C20.66 5.5 22 6.84 22 8.5V11H2V8.5Z" fill="#34A853" />
                    <path d="M2 10.5C2 8.84 3.34 7.5 5 7.5H19C20.66 7.5 22 8.84 22 10.5V13H2V10.5Z" fill="#FBBC05" />
                    <path d="M2 12.5C2 10.84 3.34 9.5 5 9.5H19C20.66 9.5 22 10.84 22 12.5V20H2V12.5Z" fill="#EA4335" />
                    <rect x="2" y="12.5" width="20" height="7.5" rx="2.5" fill="#4285F4" />
                  </svg>
                  <span className="font-display font-bold text-sm">
                    {walletLoading
                      ? 'Generando pase...'
                      : banner?.type === 'cooldown' || card.google_object_id
                        ? 'Ver tarjeta en Google Wallet'
                        : 'Añadir a Google Wallet'}
                  </span>
                </button>
                {card.google_object_id && (
                  <p className="text-center text-[11px] font-semibold text-emerald-600">
                    Pase vinculado en Google Wallet ✓ (toca el botón si deseas volver a abrirlo)
                  </p>
                )}
              </div>
            ) : (
              <div className="glass-card-light rounded-2xl p-4 space-y-3 border border-[#0EA5E9]/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-[#0EA5E9]" />
                    <span className="text-xs font-extrabold text-slate-900">Web Pass PWA (iOS)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#0B4BE3] text-[10px] font-bold">
                    1 toque
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIosGuide(true)}
                  className="w-full rounded-xl bg-gradient-to-r from-[#0EA5E9] to-[#0B4BE3] py-3 text-xs font-extrabold text-white shadow flex items-center justify-center gap-2"
                >
                  <PlusSquare className="w-4 h-4" />
                  <span>Agregar a Pantalla de Inicio</span>
                </button>
              </div>
            )}

            {notifPermission === 'default' && (
              <button
                type="button"
                onClick={() => {
                  void requestCustomerNotificationPermission().then(setNotifPermission);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white/80 hover:bg-white py-2.5 px-4 text-xs font-bold text-slate-700 flex items-center justify-center gap-2 transition shadow-sm"
              >
                <BellRing className="w-4 h-4 text-[#0B4BE3]" />
                <span>Activar notificaciones de sellos y promociones</span>
              </button>
            )}
          </div>
        )}
      </main>

      <footer className="mt-8 text-center">
        <PoweredByBlockOps />
      </footer>

      {showIosGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full max-w-sm rounded-3xl bg-white text-slate-900 p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-extrabold">Instala tu Tarjeta en iPhone</h3>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <ol className="space-y-3 text-xs text-slate-600">
              <li className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <Share className="w-5 h-5 text-[#0B4BE3] shrink-0" />
                <span>
                  1. Toca el botón <strong>Compartir</strong> en la barra inferior de Safari.
                </span>
              </li>
              <li className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <PlusSquare className="w-5 h-5 text-[#FF7A00] shrink-0" />
                <span>
                  2. Elige <strong>"Agregar a inicio"</strong> y pulsa <strong>Agregar</strong>.
                </span>
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="w-full rounded-xl bg-[#0B4BE3] text-white py-3 text-xs font-extrabold"
            >
              Entendido
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};
