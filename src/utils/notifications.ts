// Utilidades para Service Worker y notificaciones nativas en Android / Desktop

export interface NativeNotificationPayload {
  title: string;
  body: string;
  icon?: string | null;
  badge?: string | null;
  tag?: string;
  url?: string;
}

export async function registerLoyaltyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return await navigator.serviceWorker.ready;
  } catch (err) {
    console.warn('No se pudo registrar el Service Worker /sw.js:', err);
    return null;
  }
}

export function requestCustomerNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return Promise.resolve('unsupported');
  }
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Promise.resolve(Notification.permission);
  }
  try {
    return Notification.requestPermission();
  } catch {
    return Promise.resolve(Notification.permission);
  }
}

const recentNotificationTimestamps = new Map<string, number>();
const DEDUPE_WINDOW_MS = 25_000;

export async function showNativeNotification({
  title,
  body,
  icon,
  badge,
  tag,
  url,
}: NativeNotificationPayload): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  // Deduplicación estricta por contenido y ventana de tiempo (25 segundos)
  const contentKey = `${(title || '').trim()}::${(body || '').trim()}`;
  const now = Date.now();
  const lastShownContent = recentNotificationTimestamps.get(contentKey);
  if (lastShownContent && now - lastShownContent < DEDUPE_WINDOW_MS) {
    return false;
  }
  recentNotificationTimestamps.set(contentKey, now);

  if (tag) {
    const lastShownTag = recentNotificationTimestamps.get(tag);
    if (lastShownTag && now - lastShownTag < DEDUPE_WINDOW_MS) {
      return false;
    }
    recentNotificationTimestamps.set(tag, now);
  }

  if (recentNotificationTimestamps.size > 50) {
    for (const [k, ts] of recentNotificationTimestamps.entries()) {
      if (now - ts >= DEDUPE_WINDOW_MS) recentNotificationTimestamps.delete(k);
    }
  }

  const resolvedIcon = icon || '/icon.png';
  const resolvedBadge = badge || resolvedIcon;
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body,
    icon: resolvedIcon,
    badge: resolvedBadge,
    vibrate: [200, 100, 200],
    tag: tag || contentKey,
    renotify: false,
    data: { url: url || window.location.pathname },
  };

  try {
    const registration = await registerLoyaltyServiceWorker();
    if (registration && typeof registration.showNotification === 'function') {
      await registration.showNotification(title, options);
      return true;
    }
  } catch {
    // Fallback a Notification API directa si el navegador bloquea showNotification del SW
  }

  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

