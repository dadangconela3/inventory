'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

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

export default function NotificationManager() {
    const [isSupported, setIsSupported] = useState(false);
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [showPrompt, setShowPrompt] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);

    const checkSubscription = async () => {
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            setIsSubscribed(!!subscription);
        } catch (error) {
            console.error('Error checking subscription:', error);
        }
    };

    useEffect(() => {
        // Check if push notifications are supported
        if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
            setIsSupported(true);
            setPermission(Notification.permission);
            
            // Get current user
            supabase.auth.getUser().then(({ data: { user } }) => {
                if (user) {
                    setUserId(user.id);
                    checkSubscription();
                }
            });

            // Show prompt after 5 seconds if permission is default
            const timer = setTimeout(() => {
                if (Notification.permission === 'default') {
                    setShowPrompt(true);
                }
            }, 5000);

            return () => clearTimeout(timer);
        }
    }, []);

    const requestPermission = async () => {
        try {
            const permission = await Notification.requestPermission();
            setPermission(permission);
            setShowPrompt(false);

            if (permission === 'granted') {
                await subscribe();
            }
        } catch (error) {
            console.error('Error requesting permission:', error);
        }
    };

    const subscribe = async () => {
        try {
            if (!userId) {
                console.error('User not logged in');
                return;
            }

            const registration = await navigator.serviceWorker.ready;
            
            // Subscribe to push notifications
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
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
                setIsSubscribed(true);
                console.log('Successfully subscribed to push notifications');
            } else {
                console.error('Failed to save subscription');
            }
        } catch (error) {
            console.error('Error subscribing to push notifications:', error);
        }
    };

    const unsubscribe = async () => {
        try {
            if (!userId) return;

            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();

            if (subscription) {
                await subscription.unsubscribe();

                // Remove subscription from backend
                await fetch('/api/push-subscription', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        endpoint: subscription.endpoint,
                        userId,
                    }),
                });

                setIsSubscribed(false);
                console.log('Successfully unsubscribed from push notifications');
            }
        } catch (error) {
            console.error('Error unsubscribing from push notifications:', error);
        }
    };

    if (!isSupported) {
        return null;
    }

    return (
        <>
            {/* Permission Prompt Toast */}
            {showPrompt && permission === 'default' && (
                <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg bg-white p-4 shadow-lg dark:bg-navy-800">
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                            <svg className="h-6 w-6 text-primary dark:text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                        </div>
                        <div className="flex-1">
                            <h4 className="font-medium text-slate-800 dark:text-navy-100">
                                Aktifkan Notifikasi
                            </h4>
                            <p className="mt-1 text-sm text-slate-600 dark:text-navy-300">
                                Dapatkan notifikasi real-time untuk approval dan update request Anda
                            </p>
                            <div className="mt-3 flex gap-2">
                                <button
                                    onClick={requestPermission}
                                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-focus dark:bg-accent dark:hover:bg-accent-focus"
                                >
                                    Aktifkan
                                </button>
                                <button
                                    onClick={() => setShowPrompt(false)}
                                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-navy-450 dark:text-navy-200 dark:hover:bg-navy-600"
                                >
                                    Nanti
                                </button>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowPrompt(false)}
                            className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:text-navy-300 dark:hover:text-navy-100"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Notification Settings (Hidden, can be shown in settings page) */}
            <div className="hidden">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="font-medium text-slate-800 dark:text-navy-100">
                            Push Notifications
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-navy-300">
                            Status: {permission === 'granted' ? 'Aktif' : permission === 'denied' ? 'Ditolak' : 'Belum diatur'}
                        </p>
                    </div>
                    {permission === 'granted' && (
                        <button
                            onClick={isSubscribed ? unsubscribe : subscribe}
                            className={`rounded-lg px-4 py-2 text-sm font-medium ${
                                isSubscribed
                                    ? 'bg-error text-white hover:bg-error/90'
                                    : 'bg-primary text-white hover:bg-primary-focus dark:bg-accent dark:hover:bg-accent-focus'
                            }`}
                        >
                            {isSubscribed ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}
