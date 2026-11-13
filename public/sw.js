// BlockOps Loyalty Service Worker - Notificaciones Nativas y PWA
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Soporte directo desde la app via postMessage o registration.showNotification
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'SHOW_NOTIFICATION') return;

  const title = data.title || 'BlockOps Loyalty';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon.svg',
    badge: data.badge || data.icon || '/icon.svg',
    vibrate: Array.isArray(data.vibrate) ? data.vibrate : [200, 100, 200],
    tag: data.tag || `blockops-${Date.now()}`,
    renotify: false,
    data: {
      url: data.url || '/',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Soporte para Web Push estándar si llega payload remoto
self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || 'BlockOps Loyalty';
  const options = {
    body: payload.body || payload.message || 'Tienes una nueva actualización en tu tarjeta.',
    icon: payload.icon || '/icon.svg',
    badge: payload.badge || payload.icon || '/icon.svg',
    vibrate: [200, 100, 200],
    tag: payload.tag || `blockops-push-${Date.now()}`,
    renotify: false,
    data: {
      url: payload.url || '/',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Al tocar la notificación, enfoca la ventana de la tarjeta o abre la ruta correspondiente
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client && client.url.includes('/tap/')) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});

