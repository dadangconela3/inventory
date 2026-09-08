/**
 * Push Subscription Helper Functions
 * Centralized functions for managing push notification subscriptions
 */

/**
 * Unsubscribe from push notifications and cleanup from database
 * Can be called from anywhere (logout, settings, etc.)
 */
async function getServiceWorkerRegistration(timeoutMs = 6000): Promise<ServiceWorkerRegistration> {
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
        reg = await navigator.serviceWorker.register('/sw-custom.js');
    }

    if (reg.active) {
        return reg;
    }

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            if (reg) {
                resolve(reg);
            } else {
                reject(new Error('Timeout menunggu Service Worker aktif. Silakan refresh halaman.'));
            }
        }, timeoutMs);

        navigator.serviceWorker.ready
            .then((readyReg) => {
                clearTimeout(timer);
                resolve(readyReg);
            })
            .catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
    });
}

/**
 * Unsubscribe from push notifications and cleanup from database
 * Can be called from anywhere (logout, settings, etc.)
 */
export async function unsubscribeFromPush(): Promise<boolean> {
    try {
        // Check if service worker and push manager are available
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('[PushSubscription] Service Worker or Push Manager not available');
            return false;
        }

        // Get service worker registration safely
        const registration = await getServiceWorkerRegistration();
        
        // Get existing push subscription
        const subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            console.log('[PushSubscription] No active subscription to unsubscribe from');
            return true; // Not an error, just nothing to do
        }

        console.log('[PushSubscription] Unsubscribing from push notifications...');

        // Unsubscribe from push manager
        const unsubscribed = await subscription.unsubscribe();

        if (!unsubscribed) {
            console.error('[PushSubscription] Failed to unsubscribe from push manager');
            return false;
        }

        // Remove subscription from database
        try {
            const response = await fetch('/api/push-subscription/cleanup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    endpoint: subscription.endpoint,
                }),
            });

            if (!response.ok) {
                console.warn('[PushSubscription] Failed to cleanup subscription from database, but local unsubscribe succeeded');
            } else {
                console.log('[PushSubscription] Successfully cleaned up subscription from database');
            }
        } catch (dbError) {
            console.warn('[PushSubscription] Database cleanup error:', dbError);
            // Don't fail the whole operation if DB cleanup fails
        }

        console.log('[PushSubscription] Successfully unsubscribed from push notifications');
        return true;

    } catch (error) {
        console.error('[PushSubscription] Error unsubscribing:', error);
        return false;
    }
}

/**
 * Subscribe to push notifications
 * @param userId - User ID to associate with the subscription
 */
export async function subscribeToPush(userId: string, vapidPublicKey: string): Promise<boolean> {
    try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('[PushSubscription] Service Worker or Push Manager not available');
            return false;
        }

        // Check notification permission
        if (Notification.permission !== 'granted') {
            console.warn('[PushSubscription] Notification permission not granted');
            return false;
        }

        const registration = await getServiceWorkerRegistration();

        // Get existing subscription or create a new one
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
            });
        }

        // Send subscription to backend (handles both insert and update)
        const response = await fetch('/api/push-subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                subscription: subscription.toJSON(),
                userId,
            }),
        });

        if (response.ok) {
            console.log('[PushSubscription] Successfully subscribed to push notifications');
            return true;
        } else {
            const err = await response.json().catch(() => ({}));
            console.error('[PushSubscription] Failed to save subscription to database:', err);
            return false;
        }

    } catch (error) {
        console.error('[PushSubscription] Error subscribing:', error);
        return false;
    }
}

function urlBase64ToUint8Array(base64String: string) {
    const cleanKey = (base64String || '').replace(/^"|"$/g, '').trim();
    if (!cleanKey) {
        throw new Error('VAPID public key kosong.');
    }
    const padding = '='.repeat((4 - (cleanKey.length % 4)) % 4);
    const base64 = (cleanKey + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
