'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { unsubscribeFromPush, subscribeToPush } from '@/lib/push-subscription';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

/**
 * AuthStateManager Component
 * 
 * Manages push notification subscriptions based on authentication state:
 * - Auto-unsubscribe when user logs out
 * - Auto-subscribe when user logs in (if permission already granted)
 * 
 * This ensures that push notifications are always tied to the current user
 * and prevents notifications from being sent to the wrong user on shared devices.
 */
export default function AuthStateManager() {
    useEffect(() => {
        // Subscribe to auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('[AuthStateManager] Auth state changed:', event);

            // Handle logout - cleanup push subscription
            if (event === 'SIGNED_OUT') {
                console.log('[AuthStateManager] User signed out, cleaning up push subscription...');
                await unsubscribeFromPush();
            }

            // Handle login - auto-subscribe if permission granted
            if (event === 'SIGNED_IN' && session?.user) {
                console.log('[AuthStateManager] User signed in:', session.user.id);
                
                // Check if notification permission is already granted
                if ('Notification' in window && Notification.permission === 'granted') {
                    console.log('[AuthStateManager] Notification permission granted, auto-subscribing...');
                    
                    // Small delay to ensure service worker is ready
                    setTimeout(async () => {
                        const subscribed = await subscribeToPush(session.user.id, VAPID_PUBLIC_KEY);
                        if (subscribed) {
                            console.log('[AuthStateManager] Auto-subscribed successfully');
                        } else {
                            console.log('[AuthStateManager] Auto-subscribe skipped or failed');
                        }
                    }, 1000);
                }
            }

            // Handle token refresh - ensure subscription is still valid
            if (event === 'TOKEN_REFRESHED' && session?.user) {
                console.log('[AuthStateManager] Token refreshed, verifying subscription...');
                
                // Verify subscription is still tied to current user
                if ('serviceWorker' in navigator && 'PushManager' in window) {
                    try {
                        const registration = await navigator.serviceWorker.ready;
                        const pushSubscription = await registration.pushManager.getSubscription();
                        
                        if (pushSubscription) {
                            // Update user_id to ensure it's current
                            await fetch('/api/update-subscription-user', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    subscription: pushSubscription.toJSON(),
                                    userId: session.user.id,
                                }),
                            });
                        }
                    } catch (error) {
                        console.error('[AuthStateManager] Error verifying subscription:', error);
                    }
                }
            }
        });

        // Cleanup subscription on component unmount
        return () => {
            subscription.unsubscribe();
        };
    }, []);

    return null;
}
