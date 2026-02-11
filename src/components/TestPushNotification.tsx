'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function TestPushNotification() {
    const [sending, setSending] = useState(false);
    const [message, setMessage] = useState('');

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
                setMessage(`✅ Notification sent! (${data.sent}/${data.total} subscriptions)`);
            } else {
                setMessage(`❌ Failed: ${data.error}`);
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
                Send a test push notification to yourself. Make sure you've allowed notifications first!
            </p>

            <button
                onClick={sendTestNotification}
                disabled={sending}
                className="btn bg-primary text-white hover:bg-primary-focus disabled:opacity-50 dark:bg-accent dark:hover:bg-accent-focus"
            >
                {sending ? (
                    <span className="flex items-center gap-2">
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
