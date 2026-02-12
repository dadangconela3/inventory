'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import NotificationManager from '@/components/NotificationManager';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Profile, UserRole } from '@/types/database';

// Cache profile to avoid refetching on every navigation
let cachedProfile: Profile | null = null;

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const [loading, setLoading] = useState(!cachedProfile);
    const [profile, setProfile] = useState<Profile | null>(cachedProfile);

    const checkAuth = useCallback(async () => {
        if (!isSupabaseConfigured) {
            // Demo mode - use mock profile
            const mockProfile: Profile = {
                id: 'demo-user',
                email: 'demo@demo.com',
                full_name: 'Demo User',
                role: 'hrga' as UserRole,
                department_id: null,
                created_at: new Date().toISOString(),
            };
            setProfile(mockProfile);
            cachedProfile = mockProfile;
            setLoading(false);
            return;
        }

        try {
            // Use getSession() instead of getUser() - faster, reads from localStorage
            const { data: { session }, error } = await supabase.auth.getSession();

            if (error || !session?.user) {
                cachedProfile = null;
                router.replace('/login');
                return;
            }

            const user = session.user;

            if (cachedProfile && cachedProfile.id === user.id) {
                setProfile(cachedProfile);
                setLoading(false);
                return;
            }

            // Fetch user profile
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (profileError) {
                console.error('Error fetching profile:', profileError);
                // For demo, create a mock profile
                const mockProfile: Profile = {
                    id: user.id,
                    email: user.email || '',
                    full_name: user.email?.split('@')[0] || 'User',
                    role: 'admin_dept' as UserRole,
                    department_id: null,
                    created_at: new Date().toISOString(),
                };
                setProfile(mockProfile);
                cachedProfile = mockProfile;
            } else {
                setProfile(profileData);
                cachedProfile = profileData;
            }

        } catch (err) {
            console.error('Auth check error:', err);
            cachedProfile = null;
            router.replace('/login');
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        checkAuth();

        // Subscribe to auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') {
                cachedProfile = null;
                router.replace('/login');
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [checkAuth, router]);

    // Memoize children wrapper to prevent unnecessary re-renders
    const content = useMemo(() => (
        <div className="p-4 lg:p-6">
            {children}
        </div>
    ), [children]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-navy-900">
                <div className="flex flex-col items-center space-y-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <p className="text-sm text-slate-500 dark:text-navy-300">Memuat...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-navy-900">
            {/* Sidebar */}
            <Sidebar
                userRole={profile?.role || 'admin_dept'}
                userName={profile?.full_name || profile?.email}
            />

            {/* Header */}
            <Header
                userName={profile?.full_name || profile?.email}
            />

            {/* Main Content */}
            <main className="pt-16 lg:pl-64">
                {content}
            </main>

            {/* Notification Manager */}
            <NotificationManager />
        </div>
    );
}
