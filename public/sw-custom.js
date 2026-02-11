// This file will be imported by the service worker
// Add push notification handlers

self.addEventListener('push', function(event) {
    console.log('[SW] Push event received');
    
    if (!event.data) {
        console.log('[SW] No data in push event');
        return;
    }

    try {
        const data = event.data.json();
        console.log('[SW] Push data:', data);
        
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
            timestamp: Date.now(),
        };

        event.waitUntil(
            self.registration.showNotification(title, options)
                .then(() => console.log('[SW] Notification shown successfully'))
                .catch(err => console.error('[SW] Failed to show notification:', err))
        );
    } catch (error) {
        console.error('[SW] Error in push handler:', error);
    }
});

self.addEventListener('notificationclick', function(event) {
    console.log('[SW] Notification click');
    event.notification.close();

    const urlToOpen = event.notification.data?.url || '/dashboard';
    const fullUrl = new URL(urlToOpen, self.location.origin).href;

    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(function(clientList) {
            // Try to find existing window with same URL
            for (let client of clientList) {
                if (client.url === fullUrl && 'focus' in client) {
                    return client.focus();
                }
            }
            // Try to find any window from same origin and navigate
            for (let client of clientList) {
                if (client.url.startsWith(self.location.origin) && 'focus' in client) {
                    return client.focus().then(() => {
                        if ('navigate' in client) {
                            return client.navigate(fullUrl);
                        }
                    });
                }
            }
            // Open new window
            if (clients.openWindow) {
                return clients.openWindow(fullUrl);
            }
        })
    );
});

self.addEventListener('notificationclose', function(event) {
    console.log('[SW] Notification closed');
});
