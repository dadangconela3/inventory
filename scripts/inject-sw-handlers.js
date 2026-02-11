const fs = require('fs');
const path = require('path');

// Path to the generated service worker
const swPath = path.join(__dirname, '../public/sw.js');

// Custom push notification handlers to inject
const customHandlers = `

// Custom push notification handlers
self.addEventListener('push', function(event) {
    console.log('[SW] Push received');
    if (!event.data) return;
    
    try {
        const data = event.data.json();
        const title = data.title || 'Notification';
        const options = {
            body: data.body || '',
            icon: data.icon || '/icons/icon-192x192.png',
            badge: data.badge || '/icons/icon-96x96.png',
            data: { url: data.data?.url || '/dashboard' },
            vibrate: [200, 100, 200],
            tag: 'inventory-' + Date.now(),
            requireInteraction: false,
        };
        event.waitUntil(self.registration.showNotification(title, options));
    } catch (error) {
        console.error('[SW] Push error:', error);
    }
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const url = event.notification.data?.url || '/dashboard';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                for (let client of clientList) {
                    if (client.url.startsWith(self.location.origin) && 'focus' in client) {
                        return client.focus().then(() => client.navigate ? client.navigate(url) : null);
                    }
                }
                return clients.openWindow ? clients.openWindow(url) : null;
            })
    );
});
`;

// Read the existing service worker
if (fs.existsSync(swPath)) {
    let swContent = fs.readFileSync(swPath, 'utf8');
    
    // Check if custom handlers are already injected
    if (!swContent.includes('Custom push notification handlers')) {
        // Append custom handlers at the end
        swContent += customHandlers;
        
        // Write back
        fs.writeFileSync(swPath, swContent, 'utf8');
        console.log('✅ Push notification handlers injected into service worker');
    } else {
        console.log('ℹ️  Push handlers already present in service worker');
    }
} else {
    console.log('⚠️  Service worker not found at:', swPath);
}
