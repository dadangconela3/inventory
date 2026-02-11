'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Component that automatically updates push subscription user_id
 * when a user logs in on a device that has an existing subscription
 * from a different user.
 */
export default function SubscriptionUserUpdater() {
    useEffect(() => {
        const updateSubscriptionUser = async () => {
            try {
                // Get current user
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                // Check if service worker and push manager are available
                if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                    return;
                }

                // Wait for service worker to be ready
                const registration = await navigator.serviceWorker.ready;
                
                // Get existing push subscription
                const subscription = await registration.pushManager.getSubscription();
                
                if (subscription) {
                    console.log('[SubscriptionUpdater] Found existing subscription, updating user_id to:', user.id);
                    
                    // Update subscription user_id in database
                    const response = await fetch('/api/update-subscription-user', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            subscription: subscription.toJSON(),
                            userId: user.id,
                        }),
                    });

                    const result = await response.json();
                    
                    if (result.updated) {
                        console.log('[SubscriptionUpdater] Subscription user_id updated successfully');
                    } else if (result.success) {
                        console.log('[SubscriptionUpdater] Subscription already up to date');
                    } else {
                        console.warn('[SubscriptionUpdater] Failed to update subscription:', result.error);
                    }
                }
            } catch (error) {
                console.error('[SubscriptionUpdater] Error updating subscription:', error);
            }
        };

        // Run on component mount (when user logs in)
        updateSubscriptionUser();
    }, []);

    return null;
}
