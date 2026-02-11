// Custom service worker source for push notifications
// This will be compiled by next-pwa into sw.js

// Import workbox
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

// Initialize workbox
workbox.setConfig({
  debug: false
});

// Precache and route
workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);

// Clean up old caches
workbox.precaching.cleanupOutdatedCaches();

// Custom push notification handler
self.addEventListener('push', function(event) {
    console.log('[Service Worker] Push received:', event);
    
    if (!event.data) {
        console.log('[Service Worker] Push event but no data');
        return;
    }

    try {
        const data = event.data.json();
        console.log('[Service Worker] Push data:', data);
        
        const title = data.title || 'Notification';
        const options = {
            body: data.body || '',
            icon: data.icon || '/icons/icon-192x192.png',
            badge: data.badge || '/icons/icon-96x96.png',
            data: {
                url: data.data?.url || '/dashboard',
            },
            vibrate: [200, 100, 200],
            tag: 'inventory-notification',
            requireInteraction: false,
            // Add these for better Android support
            actions: data.actions || [],
            timestamp: Date.now(),
        };

        event.waitUntil(
            self.registration.showNotification(title, options)
                .then(() => console.log('[Service Worker] Notification shown'))
                .catch(err => console.error('[Service Worker] Error showing notification:', err))
        );
    } catch (error) {
        console.error('[Service Worker] Error handling push event:', error);
    }
});

// Handle notification click
self.addEventListener('notificationclick', function(event) {
    console.log('[Service Worker] Notification clicked:', event.notification.tag);
    event.notification.close();

    const urlToOpen = event.notification.data?.url || '/dashboard';
    const fullUrl = new URL(urlToOpen, self.location.origin).href;

    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(function(clientList) {
            // Check if there's already a window/tab open
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url === fullUrl && 'focus' in client) {
                    return client.focus();
                }
            }
            // If no matching window, try to focus any window from this origin
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url.startsWith(self.location.origin) && 'focus' in client) {
                    return client.focus().then(() => {
                        if ('navigate' in client) {
                            return client.navigate(fullUrl);
                        }
                    });
                }
            }
            // If no window is open, open a new one
            if (clients.openWindow) {
                return clients.openWindow(fullUrl);
            }
        })
    );
});

// Handle notification close
self.addEventListener('notificationclose', function(event) {
    console.log('[Service Worker] Notification closed:', event.notification.tag);
});

// Activate event
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activated');
    event.waitUntil(clients.claim());
});
