'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Notification as AppNotification, Request } from '@/types/database';

interface UseRealtimeNotificationsOptions {
    userId?: string;
    onNewNotification?: (notification: AppNotification) => void;
    onRequestUpdate?: (request: Request) => void;
}

interface UseRealtimeNotificationsReturn {
    notifications: AppNotification[];
    unreadCount: number;
    loading: boolean;
    markAsRead: (notificationId: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    refetch: () => Promise<void>;
}

export function useRealtimeNotifications({
    userId,
    onNewNotification,
    onRequestUpdate,
}: UseRealtimeNotificationsOptions = {}): UseRealtimeNotificationsReturn {
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchNotifications = useCallback(async () => {
        if (!userId || !isSupabaseConfigured) {
            setLoading(false);
            return;
        }

        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            setNotifications(data || []);
        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    // Initial fetch
    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    // Subscribe to realtime changes
    useEffect(() => {
        if (!userId || !isSupabaseConfigured) return;

        // Subscribe to notifications table
        const notificationsChannel = supabase
            .channel('notifications-channel')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`,
                },
                (payload) => {
                    const newNotification = payload.new as AppNotification;
                    setNotifications((prev) => [newNotification, ...prev]);
                    onNewNotification?.(newNotification);

                    // Show toast notification
                    showToast(newNotification.message, 'info');

                    // Show browser notification if permitted
                    if (Notification.permission === 'granted') {
                        new Notification('Notifikasi Baru', {
                            body: newNotification.message,
                            icon: '/favicon.ico',
                        });
                    }
                }
            )
            .subscribe();

        // Subscribe to requests table for status changes
        const requestsChannel = supabase
            .channel('requests-channel')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'requests',
                },
                (payload) => {
                    const updatedRequest = payload.new as Request;
                    onRequestUpdate?.(updatedRequest);
                }
            )
            .subscribe();

        // Request browser notification permission
        if (typeof window !== 'undefined' && 'Notification' in window) {
            Notification.requestPermission();
        }

        return () => {
            supabase.removeChannel(notificationsChannel);
            supabase.removeChannel(requestsChannel);
        };
    }, [userId, onNewNotification, onRequestUpdate]);

    const markAsRead = async (notificationId: string) => {
        try {
            await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', notificationId);

            setNotifications((prev) =>
                prev.map((n) =>
                    n.id === notificationId ? { ...n, is_read: true } : n
                )
            );
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    };

    const markAllAsRead = async () => {
        if (!userId) return;

        try {
            await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', userId)
                .eq('is_read', false);

            setNotifications((prev) =>
                prev.map((n) => ({ ...n, is_read: true }))
            );
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
        }
    };

    const unreadCount = notifications.filter((n) => !n.is_read).length;

    return {
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllAsRead,
        refetch: fetchNotifications,
    };
}

// Toast notification utility
export function showToast(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') {
    if (typeof window === 'undefined') return;

    // Create toast element
    const toast = document.createElement('div');
    const bgColors = {
        success: 'bg-success',
        error: 'bg-error',
        info: 'bg-info',
        warning: 'bg-warning',
    };

    toast.className = `fixed top-20 right-4 z-50 flex items-center gap-2 rounded-lg ${bgColors[type]} px-4 py-3 text-white shadow-lg transition-all duration-300 translate-x-full`;
    toast.innerHTML = `
    <span class="text-sm font-medium">${message}</span>
    <button onclick="this.parentElement.remove()" class="ml-2 text-white/80 hover:text-white">
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  `;

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full');
    });

    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.classList.add('translate-x-full');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}
