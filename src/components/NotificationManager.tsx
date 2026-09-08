'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { subscribeToPush, unsubscribeFromPush } from '@/lib/push-subscription';
import { toast } from 'sonner';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

export default function NotificationManager() {
    const [isSupported, setIsSupported] = useState(false);
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [showPrompt, setShowPrompt] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

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
        if (!isSupported) {
            toast.error('Browser Anda tidak mendukung Web Push Notification.');
            return;
        }

        if (Notification.permission === 'denied') {
            setShowPrompt(false);
            toast.error('Izin notifikasi diblokir oleh browser. Silakan izinkan melalui ikon gembok / pengaturan situs di samping URL browser Anda.');
            return;
        }

        setIsLoading(true);
        const infoToastId = toast.info('Periksa pojok kiri atas browser (dekat URL bar) dan klik "Izinkan" / "Allow" untuk mengaktifkan notifikasi.', {
            duration: 10000,
        });

        try {
            // Add a timeout for the browser permission request in case the user ignores it
            const permissionPromise = Notification.requestPermission();
            const timeoutPromise = new Promise<NotificationPermission>((resolve) =>
                setTimeout(() => resolve(Notification.permission), 15000)
            );

            const perm = await Promise.race([permissionPromise, timeoutPromise]);
            toast.dismiss(infoToastId);
            setPermission(perm);

            if (perm === 'granted') {
                setShowPrompt(false);
                let currentUid = userId;
                if (!currentUid) {
                    const { data: { user } } = await supabase.auth.getUser();
                    currentUid = user?.id || null;
                    if (currentUid) setUserId(currentUid);
                }

                if (!currentUid) {
                    toast.error('Gagal mengaktifkan notifikasi: Akun tidak teridentifikasi.');
                    return;
                }

                if (!VAPID_PUBLIC_KEY) {
                    toast.error('Konfigurasi VAPID Public Key belum disetel di server.');
                    return;
                }

                const success = await subscribeToPush(currentUid, VAPID_PUBLIC_KEY);
                if (success) {
                    setIsSubscribed(true);
                    toast.success('Notifikasi berhasil diaktifkan! Anda akan menerima update secara real-time.');
                } else {
                    toast.error('Gagal menyimpan langganan notifikasi ke server. Coba refresh halaman.');
                }
            } else if (perm === 'denied') {
                setShowPrompt(false);
                toast.error('Izin notifikasi ditolak. Anda dapat mengaktifkannya kapan saja di pengaturan browser.');
            } else {
                toast.info('Permintaan izin notifikasi belum disetujui di browser.');
            }
        } catch (error) {
            console.error('Error requesting permission:', error);
            toast.error('Terjadi kesalahan saat meminta izin notifikasi.');
        } finally {
            toast.dismiss(infoToastId);
            setIsLoading(false);
        }
    };

    const subscribe = async () => {
        setIsLoading(true);
        try {
            let currentUid = userId;
            if (!currentUid) {
                const { data: { user } } = await supabase.auth.getUser();
                currentUid = user?.id || null;
                if (currentUid) setUserId(currentUid);
            }

            if (!currentUid) {
                toast.error('User belum login');
                return;
            }

            const success = await subscribeToPush(currentUid, VAPID_PUBLIC_KEY);
            if (success) {
                setIsSubscribed(true);
                toast.success('Notifikasi berhasil diaktifkan!');
            } else {
                toast.error('Gagal mengaktifkan langganan notifikasi.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const unsubscribe = async () => {
        setIsLoading(true);
        try {
            const success = await unsubscribeFromPush();
            if (success) {
                setIsSubscribed(false);
                toast.info('Notifikasi dinonaktifkan.');
            } else {
                toast.error('Gagal menonaktifkan notifikasi.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    if (!isSupported) {
        return null;
    }

    return (
        <>
            {/* Permission Prompt Toast */}
            {showPrompt && permission === 'default' && (
                <div className="fixed bottom-4 right-4 z-[9999] max-w-sm rounded-lg bg-white p-4 shadow-2xl ring-1 ring-black/5 dark:bg-navy-800">
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
                                    type="button"
                                    disabled={isLoading}
                                    className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-focus active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-accent dark:hover:bg-accent-focus"
                                >
                                    {isLoading ? (
                                        <>
                                            <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                                            </svg>
                                            <span>Memproses...</span>
                                        </>
                                    ) : (
                                        'Aktifkan'
                                    )}
                                </button>
                                <button
                                    onClick={() => setShowPrompt(false)}
                                    type="button"
                                    disabled={isLoading}
                                    className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 active:scale-95 disabled:opacity-50 dark:border-navy-450 dark:text-navy-200 dark:hover:bg-navy-600"
                                >
                                    Nanti
                                </button>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowPrompt(false)}
                            type="button"
                            className="cursor-pointer flex-shrink-0 text-slate-400 hover:text-slate-600 dark:text-navy-300 dark:hover:text-navy-100"
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
