/**
 * Push Subscription Helper Functions
 * Centralized functions for managing push notification subscriptions
 */

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

        // Get service worker registration
        const registration = await navigator.serviceWorker.ready;
        
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

        const registration = await navigator.serviceWorker.ready;

        // Check if already subscribed
        const existingSubscription = await registration.pushManager.getSubscription();
        if (existingSubscription) {
            console.log('[PushSubscription] Already subscribed, updating user_id if needed');
            
            // Update user_id in database
            const response = await fetch('/api/update-subscription-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscription: existingSubscription.toJSON(),
                    userId,
                }),
            });

            return response.ok;
        }

        // Subscribe to push notifications
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });

        // Send subscription to backend
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
            console.error('[PushSubscription] Failed to save subscription to database');
            return false;
        }

    } catch (error) {
        console.error('[PushSubscription] Error subscribing:', error);
        return false;
    }
}

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
