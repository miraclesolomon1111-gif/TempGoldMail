// Service Worker for TempGoldMail Push Notifications
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle push events
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'New Email', body: event.data.text() };
    }
  }

  const title = data.title || 'New Email Received';
  const options = {
    body: data.body || 'You have received a new email on TempGoldMail.',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.tag || 'goldmail-notification',
    data: data.data || { url: '/#email' },
    vibrate: [200, 100, 200],
    requireInteraction: false
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click: focus or open app window
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/#email';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          if (event.notification.data?.emailId) {
            client.postMessage({
              type: 'OPEN_EMAIL',
              emailId: event.notification.data.emailId
            });
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
