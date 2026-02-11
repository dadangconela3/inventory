// Custom Service Worker with Push Notification Support
// This worker imports the next-pwa generated worker and adds push handlers

// Import the next-pwa service worker
importScripts('/sw.js');

// Listen for push events
self.addEventListener('push', function(event) {
    console.log('[SW-Custom] Push event received');
    
    if (!event.data) {
        console.log('[SW-Custom] No data in push event');
        return;
    }

    try {
        const data = event.data.json();
        console.log('[SW-Custom] Push data:', JSON.stringify(data));
        
        const title = data.title || 'Notification';
        const options = {
            body: data.body || '',
            icon: data.icon || '/icons/icon-192x192.png',
            badge: data.badge || '/icons/icon-96x96.png',
            data: {
                url: data.data?.url || '/dashboard',
            },
            vibrate: [200, 100, 200],
            tag: 'inventory-notification-' + Date.now(),
            requireInteraction: false,
        };

        event.waitUntil(
            self.registration.showNotification(title, options)
        );
    } catch (error) {
        console.error('[SW-Custom] Error handling push event:', error);
    }
});

// Listen for notification click events
self.addEventListener('notificationclick', function(event) {
    console.log('[SW-Custom] Notification clicked');
    event.notification.close();

    const urlToOpen = event.notification.data?.url || '/dashboard';

    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(function(clientList) {
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus().then(() => {
                        return client.navigate(urlToOpen);
                    });
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// Listen for notification close events
self.addEventListener('notificationclose', function(event) {
    console.log('[SW-Custom] Notification closed:', event.notification.tag);
});

console.log('[SW-Custom] Custom service worker with push support loaded');
