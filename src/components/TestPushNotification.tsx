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

async function waitForServiceWorker(): Promise<ServiceWorkerRegistration> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Service worker not ready. Please refresh the page.'));
        }, 10000);

        navigator.serviceWorker.ready.then((registration) => {
            clearTimeout(timeout);
            console.log('[TestPush] Service worker ready:', registration.active?.scriptURL);
            resolve(registration);
        }).catch((error) => {
            clearTimeout(timeout);
            reject(error);
        });
    });
}

export default function TestPushNotification() {
    const [sending, setSending] = useState(false);
    const [subscribing, setSubscribing] = useState(false);
    const [message, setMessage] = useState('');
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [swStatus, setSwStatus] = useState<'checking' | 'ready' | 'not-found'>('checking');

    useEffect(() => {
        if ('Notification' in window) {
            setPermission(Notification.permission);
        }
        // Check SW status
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration().then((reg) => {
                if (reg?.active) {
                    setSwStatus('ready');
                    // Check existing push subscription
                    reg.pushManager.getSubscription().then((sub) => {
                        setIsSubscribed(!!sub);
                        console.log('Push subscription status:', !!sub);
                    });
                } else {
                    setSwStatus('not-found');
                    console.log('No active service worker found');
                }
            });
        }
    }, []);

    const registerAndSubscribe = async () => {
        setSubscribing(true);
        setMessage('');
        try {
            // Step 1: Request notification permission
            if (Notification.permission !== 'granted') {
                console.log('Requesting notification permission...');
                const perm = await Notification.requestPermission();
                setPermission(perm);
                console.log('Permission result:', perm);
                if (perm !== 'granted') {
                    setMessage('❌ Notification permission denied by browser');
                    return;
                }
            }

            // Step 2: Wait for service worker (registered globally in layout)
            console.log('Waiting for service worker...');
            setMessage('⏳ Waiting for service worker...');
            const registration = await waitForServiceWorker();
            setSwStatus('ready');
            console.log('Service worker ready:', registration.scope);

            // Step 3: Get current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setMessage('❌ User not logged in');
                return;
            }
            console.log('User ID:', user.id);

            // Step 4: Subscribe to push manager
            console.log('Subscribing to push manager...');
            setMessage('⏳ Subscribing to push notifications...');
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
            console.log('Push subscription created:', subscription.endpoint);

            // Step 5: Save to backend
            console.log('Saving subscription to backend...');
            setMessage('⏳ Saving subscription...');
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
            } else {
                setMessage(`❌ Failed to save subscription: ${data.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Error in subscribe flow:', error);
            setMessage(`❌ ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setSubscribing(false);
        }
    };

    const sendTestNotification = async () => {
        setSending(true);
        setMessage('');

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setMessage('❌ User not logged in');
                setSending(false);
                return;
            }

            const response = await fetch('/api/send-notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
                if (data.message) {
                    setMessage('⚠️ No push subscriptions found. Please subscribe first!');
                } else if (data.sent !== undefined) {
                    setMessage(`✅ Notification sent! (${data.sent}/${data.total} subscriptions)`);
                } else {
                    setMessage('⚠️ Unexpected response');
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
                {swStatus === 'ready' && (
                    <span className="ml-auto rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                        SW Active
                    </span>
                )}
                {swStatus === 'not-found' && (
                    <span className="ml-auto rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">
                        SW Not Found
                    </span>
                )}
            </div>
            
            <p className="mb-4 text-sm text-slate-600 dark:text-navy-300">
                Test push notification flow: subscribe &amp; send a test notification to yourself.
            </p>

            {/* Step 1: Subscribe */}
            {!isSubscribed && (
                <button
                    onClick={registerAndSubscribe}
                    disabled={subscribing}
                    type="button"
                    className="mb-3 w-full cursor-pointer rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-700 active:scale-[0.98] disabled:opacity-50"
                >
                    {subscribing ? (
                        <span className="flex items-center gap-2 justify-center">
                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Processing...
                        </span>
                    ) : (
                        '🔔 Step 1: Allow & Subscribe to Notifications'
                    )}
                </button>
            )}

            {/* Step 2: Send Test */}
            <button
                onClick={sendTestNotification}
                disabled={sending || !isSubscribed}
                type="button"
                className="w-full cursor-pointer rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
                {sending ? (
                    <span className="flex items-center gap-2 justify-center">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Sending...
                    </span>
                ) : isSubscribed ? (
                    '📨 Step 2: Send Test Notification'
                ) : (
                    '📨 Step 2: Send Test (subscribe first)'
                )}
            </button>

            {/* Status Message */}
            {message && (
                <div className={`mt-3 rounded-lg p-3 text-sm ${
                    message.startsWith('✅') 
                        ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' 
                        : message.startsWith('⏳')
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                        : message.startsWith('⚠️')
                        ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                        : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                }`}>
                    {message}
                </div>
            )}

            <div className="mt-4 rounded-lg bg-slate-50 p-3 dark:bg-navy-600">
                <p className="text-xs font-medium text-slate-500 dark:text-navy-300">
                    💡 Info:
                </p>
                <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-navy-200">
                    <li>• Permission: <strong>{permission}</strong></li>
                    <li>• Subscribed: <strong>{isSubscribed ? 'Yes' : 'No'}</strong></li>
                    <li>• Service Worker: <strong>{swStatus}</strong></li>
                </ul>
            </div>
        </div>
    );
}
