'use client';

import { useState, memo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';

interface HeaderProps {
    userName?: string;
}

function Header({ userName }: HeaderProps) {
    const router = useRouter();
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [userId, setUserId] = useState<string | undefined>();

    // Get user ID for notifications
    useEffect(() => {
        const getUserId = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUserId(user?.id);
        };
        getUserId();
    }, []);

    // Use realtime notifications hook
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useRealtimeNotifications({
        userId,
    });

    const handleLogout = async () => {
        try {
            await supabase.auth.signOut();
            // Clear any cached data
            window.location.href = '/login';
        } catch (error) {
            console.error('Logout error:', error);
            // Force redirect anyway
            window.location.href = '/login';
        }
    };

    const toggleDarkMode = () => {
        const html = document.documentElement;
        if (html.classList.contains('dark')) {
            html.classList.remove('dark');
            setIsDarkMode(false);
            localStorage.setItem('dark-mode', 'light');
        } else {
            html.classList.add('dark');
            setIsDarkMode(true);
            localStorage.setItem('dark-mode', 'dark');
        }
    };

    const handleNotificationClick = async (notification: any) => {
        // Mark as read
        if (!notification.is_read) {
            await markAsRead(notification.id);
        }
        // Navigate to link
        if (notification.link) {
            router.push(notification.link);
            setShowNotifications(false);
        }
    };

    const handleMarkAllAsRead = async () => {
        await markAllAsRead();
    };

    return (
        <header className="fixed right-0 top-0 z-40 h-16 w-full bg-white shadow-soft transition-all dark:bg-navy-750 lg:w-[calc(100%-16rem)] lg:left-64">
            <div className="flex h-full items-center justify-between px-4 lg:px-6">
                {/* Left Section - Page Title */}
                <div className="flex items-center">
                    <h1 className="hidden text-lg font-semibold text-slate-700 dark:text-navy-100 lg:block">
                        Inventory Management System
                    </h1>
                </div>

                {/* Right Section */}
                <div className="flex items-center space-x-3">
                    {/* Dark Mode Toggle */}
                    <button
                        onClick={toggleDarkMode}
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 dark:text-navy-200 dark:hover:bg-navy-600"
                    >
                        {isDarkMode ? (
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                                />
                            </svg>
                        ) : (
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                                />
                            </svg>
                        )}
                    </button>

                    {/* Notifications */}
                    <div className="relative">
                        <button
                            onClick={() => setShowNotifications(!showNotifications)}
                            className="relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 dark:text-navy-200 dark:hover:bg-navy-600"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                                />
                            </svg>
                            {unreadCount > 0 && (
                                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-error text-xs font-medium text-white">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            )}
                        </button>

                        {/* Notification Dropdown */}
                        {showNotifications && (
                            <div className="absolute right-0 top-12 w-96 rounded-lg border border-slate-150 bg-white shadow-lg dark:border-navy-600 dark:bg-navy-700">
                                <div className="flex items-center justify-between border-b border-slate-150 p-4 dark:border-navy-500">
                                    <h3 className="font-semibold text-slate-700 dark:text-navy-100">Notifikasi</h3>
                                    {unreadCount > 0 && (
                                        <button
                                            onClick={handleMarkAllAsRead}
                                            className="text-xs text-primary hover:underline dark:text-accent"
                                        >
                                            Tandai semua dibaca
                                        </button>
                                    )}
                                </div>
                                <div className="max-h-96 overflow-y-auto">
                                    {notifications.length === 0 ? (
                                        <p className="p-8 text-center text-sm text-slate-400 dark:text-navy-300">
                                            Tidak ada notifikasi
                                        </p>
                                    ) : (
                                        <div className="divide-y divide-slate-100 dark:divide-navy-600">
                                            {notifications.slice(0, 10).map((notification) => (
                                                <button
                                                    key={notification.id}
                                                    onClick={() => handleNotificationClick(notification)}
                                                    className={`w-full p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-navy-600 ${!notification.is_read ? 'bg-primary/5 dark:bg-accent/5' : ''
                                                        }`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <div className={`mt-1 h-2 w-2 rounded-full ${!notification.is_read ? 'bg-primary dark:bg-accent' : 'bg-slate-300 dark:bg-navy-400'
                                                            }`} />
                                                        <div className="flex-1">
                                                            <p className="text-sm text-slate-700 dark:text-navy-100">
                                                                {notification.message}
                                                            </p>
                                                            <p className="mt-1 text-xs text-slate-400 dark:text-navy-300">
                                                                {new Date(notification.created_at).toLocaleString('id-ID', {
                                                                    day: '2-digit',
                                                                    month: 'short',
                                                                    hour: '2-digit',
                                                                    minute: '2-digit'
                                                                })}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Profile Menu */}
                    <div className="relative">
                        <button
                            onClick={() => setShowProfileMenu(!showProfileMenu)}
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 transition-colors hover:bg-slate-300 dark:bg-navy-500 dark:hover:bg-navy-400"
                        >
                            <span className="text-sm font-medium text-slate-600 dark:text-navy-100">
                                {userName?.charAt(0).toUpperCase() || 'U'}
                            </span>
                        </button>

                        {/* Profile Dropdown */}
                        {showProfileMenu && (
                            <div className="absolute right-0 top-12 w-48 rounded-lg border border-slate-150 bg-white py-2 shadow-lg dark:border-navy-600 dark:bg-navy-700">
                                <div className="border-b border-slate-150 px-4 py-2 dark:border-navy-500">
                                    <p className="font-medium text-slate-700 dark:text-navy-100">{userName || 'User'}</p>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="flex w-full items-center space-x-2 px-4 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:text-navy-200 dark:hover:bg-navy-600"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                        />
                                    </svg>
                                    <span>Keluar</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Click outside to close dropdowns */}
            {(showProfileMenu || showNotifications) && (
                <div
                    className="fixed inset-0 z-[-1]"
                    onClick={() => {
                        setShowProfileMenu(false);
                        setShowNotifications(false);
                    }}
                />
            )}
        </header>
    );
}

export default memo(Header);
