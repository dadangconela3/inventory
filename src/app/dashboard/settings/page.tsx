'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import TestPushNotification from '@/components/TestPushNotification';
import TestDepartmentNotification from '@/components/TestDepartmentNotification';

export default function SettingsPage() {
    const [userRole, setUserRole] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            setUserRole(profile?.role || '');
            setLoading(false);
        };

        fetchUser();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    const isAdmin = userRole === 'admin_produksi' || userRole === 'admin_indirect';

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-semibold text-slate-700 dark:text-navy-100">
                    Pengaturan
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-navy-300">
                    Kelola pengaturan notifikasi dan preferensi Anda
                </p>
            </div>

            {/* Notification Settings Section */}
            <div className="space-y-4">
                <h2 className="text-lg font-medium text-slate-700 dark:text-navy-100">
                    Pengaturan Notifikasi
                </h2>

                {/* Subscribe Component - Always visible */}
                <TestPushNotification />

                {/* Department Test - Only for admins */}
                {isAdmin && <TestDepartmentNotification />}
            </div>
        </div>
    );
}
