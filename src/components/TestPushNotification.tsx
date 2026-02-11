'use client';

import { useState, useEffect } from 'react';
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

export default function TestPushNotification() {
    const [sending, setSending] = useState(false);
    const [subscribing, setSubscribing] = useState(false);
    const [message, setMessage] = useState('');
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [isSubscribed, setIsSubscribed] = useState(false);

    useEffect(() => {
        if ('Notification' in window) {
            setPermission(Notification.permission);
            checkSubscription();
        }
    }, []);

    const checkSubscription = async () => {
        try {
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.getSubscription();
                setIsSubscribed(!!subscription);
                console.log('Subscription status:', !!subscription);
            }
        } catch (error) {
            console.error('Error checking subscription:', error);
        }
    };

    const requestPermissionAndSubscribe = async () => {
        setSubscribing(true);
        setMessage('');
        try {
            console.log('Requesting notification permission...');
            const perm = await Notification.requestPermission();
            setPermission(perm);
            console.log('Permission result:', perm);

            if (perm === 'granted') {
                await subscribe();
            } else {
                setMessage('❌ Notification permission denied');
            }
        } catch (error) {
            console.error('Error requesting permission:', error);
            setMessage('❌ Error requesting permission');
        } finally {
            setSubscribing(false);
        }
    };

    const subscribe = async () => {
        setSubscribing(true);
        setMessage('');
        try {
            console.log('Starting subscription process...');
            
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setMessage('❌ User not logged in');
                setSubscribing(false);
                return;
            }
            console.log('User ID:', user.id);

            console.log('Waiting for service worker...');
            const registration = await navigator.serviceWorker.ready;
            console.log('Service worker ready');

            console.log('Subscribing to push manager...');
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
            console.log('Push subscription created:', subscription.endpoint);

            console.log('Saving subscription to backend...');
            const response = await fetch('/api/push-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscription: subscription.toJSON(),
                    userId: user.id,
                }),
            });

            const data = await response.json();
            console.log('Backend response:', data);

            if (response.ok) {
                setIsSubscribed(true);
                setMessage('✅ Successfully subscribed to notifications!');
                console.log('Subscription successful!');
            } else {
                setMessage(`❌ Failed to save subscription: ${data.error || 'Unknown error'}`);
                console.error('Backend error:', data);
            }
        } catch (error) {
            console.error('Error subscribing:', error);
            setMessage(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setSubscribing(false);
        }
    };

    const sendTestNotification = async () => {
        setSending(true);
        setMessage('');

        try {
            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setMessage('❌ User not logged in');
                setSending(false);
                return;
            }

            // Send test notification
            const response = await fetch('/api/send-notification', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: user.id,
                    title: '🧪 Test Notification',
                    body: 'This is a test push notification sent at ' + new Date().toLocaleTimeString(),
                    link: '/dashboard',
                    icon: '/icons/icon-192x192.png',
                }),
            });

            const data = await response.json();

            if (response.ok) {
                // Check if there's a message (no subscriptions case)
                if (data.message) {
                    setMessage('⚠️ No push subscriptions found. Please allow notifications first!');
                } else if (data.sent !== undefined && data.total !== undefined) {
                    if (data.sent === 0 && data.total === 0) {
                        setMessage('⚠️ No push subscriptions found. Please allow notifications first!');
                    } else {
                        setMessage(`✅ Notification sent! (${data.sent}/${data.total} subscriptions)`);
                    }
                } else {
                    setMessage('⚠️ Unexpected response format');
                    console.error('Unexpected data:', data);
                }
            } else {
                setMessage(`❌ Failed: ${data.error || 'Unknown error'}`);
                console.error('API Error:', data);
            }
        } catch (error) {
            console.error('Error sending test notification:', error);
            setMessage('❌ Error sending notification');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-navy-600 dark:bg-navy-700">
            <div className="mb-3 flex items-center gap-2">
                <span className="text-lg">🧪</span>
                <h3 className="font-semibold text-slate-700 dark:text-navy-100">
                    Test Push Notification
                </h3>
            </div>
            
            <p className="mb-4 text-sm text-slate-600 dark:text-navy-300">
                Send a test push notification to yourself. Make sure you&apos;ve allowed notifications first!
            </p>

            {/* Subscribe Button if not subscribed */}
            {permission !== 'granted' && (
                <button
                    onClick={requestPermissionAndSubscribe}
                    disabled={subscribing}
                    className="mb-3 btn bg-success text-white hover:bg-success-focus w-full disabled:opacity-50"
                >
                    {subscribing ? (
                        <span className="flex items-center gap-2 justify-center">
                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Subscribing...
                        </span>
                    ) : (
                        '🔔 Allow Notifications First'
                    )}
                </button>
            )}

            {permission === 'granted' && !isSubscribed && (
                <button
                    onClick={subscribe}
                    disabled={subscribing}
                    className="mb-3 btn bg-success text-white hover:bg-success-focus w-full disabled:opacity-50"
                >
                    {subscribing ? (
                        <span className="flex items-center gap-2 justify-center">
                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Subscribing...
                        </span>
                    ) : (
                        '✅ Subscribe to Push Notifications'
                    )}
                </button>
            )}

            {/* Test Button */}
            <button
                onClick={sendTestNotification}
                disabled={sending || !isSubscribed}
                className="btn bg-primary text-white hover:bg-primary-focus disabled:opacity-50 dark:bg-accent dark:hover:bg-accent-focus w-full"
            >
                {sending ? (
                    <span className="flex items-center gap-2 justify-center">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Sending...
                    </span>
                ) : (
                    '🔔 Send Test Notification'
                )}
            </button>

            {message && (
                <div className={`mt-3 rounded-lg p-3 text-sm ${
                    message.startsWith('✅') 
                        ? 'bg-success/10 text-success' 
                        : 'bg-error/10 text-error'
                }`}>
                    {message}
                </div>
            )}

            <div className="mt-4 rounded-lg bg-slate-50 p-3 dark:bg-navy-600">
                <p className="text-xs font-medium text-slate-500 dark:text-navy-300">
                    💡 Testing Tips:
                </p>
                <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-navy-200">
                    <li>• <strong>App Open:</strong> Notification will show as toast in-app</li>
                    <li>• <strong>App Background:</strong> Notification will show in system tray</li>
                    <li>• <strong>App Closed (Android PWA):</strong> Notification will still appear!</li>
                </ul>
            </div>
        </div>
    );
}
