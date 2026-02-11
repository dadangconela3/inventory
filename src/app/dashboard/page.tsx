'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Request, RequestStatus, Profile, UserRole, PRODUCTION_DEPARTMENTS, INDIRECT_DEPARTMENTS } from '@/types/database';

interface DashboardStats {
    pendingRequests: number;
    approvedRequests: number;
    rejectedRequests: number;
    totalItems: number;
    lowStockItems: number;
    scheduledBatches: number;
}

export default function DashboardPage() {
    const [stats, setStats] = useState<DashboardStats>({
        pendingRequests: 0,
        approvedRequests: 0,
        rejectedRequests: 0,
        totalItems: 0,
        lowStockItems: 0,
        scheduledBatches: 0,
    });
    const [recentRequests, setRecentRequests] = useState<Request[]>([]);
    const [loading, setLoading] = useState(true);
    const [userProfile, setUserProfile] = useState<Profile | null>(null);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                // Get user profile first
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*, department:departments(code, name)')
                    .eq('id', user.id)
                    .single();

                setUserProfile(profile);

                // Determine which department codes this user can see
                let allowedDeptCodes: string[] = [];
                const role = profile?.role as UserRole;

                if (role === 'admin_produksi') {
                    allowedDeptCodes = [...PRODUCTION_DEPARTMENTS];
                } else if (role === 'admin_indirect') {
                    allowedDeptCodes = [...INDIRECT_DEPARTMENTS];
                } else if (role === 'supervisor' || role === 'admin_dept') {
                    if (profile?.department?.code) {
                        allowedDeptCodes = [profile.department.code];

                        // Special case: QC supervisor can see QC, QA, and PP
                        if (profile.department.code === 'QC') {
                            allowedDeptCodes = ['QC', 'QA', 'PP'];
                        }
                    }
                }
                // HRGA sees all - no filter

                // Build filtered stats queries
                const buildStatQuery = (status: RequestStatus) => {
                    let query = supabase
                        .from('requests')
                        .select('*', { count: 'exact', head: true })
                        .eq('status', status);

                    if (role !== 'hrga' && allowedDeptCodes.length > 0) {
                        query = query.in('dept_code', allowedDeptCodes);
                    }
                    return query;
                };

                // Fetch request stats (filtered by role)
                const [pending, approved, rejected] = await Promise.all([
                    buildStatQuery('pending'),
                    buildStatQuery('approved_spv'),
                    buildStatQuery('rejected'),
                ]);

                // Fetch item stats (only for HRGA, show for all but data is global)
                const { count: totalItems } = await supabase
                    .from('items')
                    .select('*', { count: 'exact', head: true });

                const { count: lowStockItems } = await supabase
                    .from('items')
                    .select('*', { count: 'exact', head: true })
                    .lte('current_stock', 10);

                // Fetch batch stats (only for HRGA)
                const { count: scheduledBatches } = await supabase
                    .from('pickup_batches')
                    .select('*', { count: 'exact', head: true })
                    .eq('hrga_status', 'pending');

                setStats({
                    pendingRequests: pending.count || 0,
                    approvedRequests: approved.count || 0,
                    rejectedRequests: rejected.count || 0,
                    totalItems: totalItems || 0,
                    lowStockItems: lowStockItems || 0,
                    scheduledBatches: scheduledBatches || 0,
                });

                // Fetch recent requests (filtered by role)
                let requestQuery = supabase
                    .from('requests')
                    .select('*, department:departments(name)')
                    .order('created_at', { ascending: false })
                    .limit(5);

                if (role !== 'hrga' && allowedDeptCodes.length > 0) {
                    requestQuery = requestQuery.in('dept_code', allowedDeptCodes);
                }

                const { data: requests } = await requestQuery;
                setRecentRequests(requests || []);

            } catch (error) {
                console.error('Error fetching dashboard data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();

        // Subscribe to real-time changes
        const requestsChannel = supabase
            .channel('dashboard-requests-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'requests',
                },
                (payload) => {
                    console.log('Request change detected on dashboard:', payload);
                    fetchDashboardData();
                }
            )
            .subscribe();

        const itemsChannel = supabase
            .channel('dashboard-items-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'items',
                },
                (payload) => {
                    console.log('Item change detected on dashboard:', payload);
                    fetchDashboardData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(requestsChannel);
            supabase.removeChannel(itemsChannel);
        };
    }, []);

    const getStatusBadge = (status: RequestStatus) => {
        const styles: Record<RequestStatus, string> = {
            pending: 'bg-warning/10 text-warning',
            approved_spv: 'bg-success/10 text-success',
            rejected: 'bg-error/10 text-error',
            scheduled: 'bg-info/10 text-info',
            completed: 'bg-slate-100 text-slate-600 dark:bg-navy-500 dark:text-navy-100',
        };

        const labels: Record<RequestStatus, string> = {
            pending: 'Menunggu',
            approved_spv: 'Disetujui',
            rejected: 'Ditolak',
            scheduled: 'Terjadwal',
            completed: 'Selesai',
        };

        return (
            <span className={`badge ${styles[status]}`}>
                {labels[status]}
            </span>
        );
    };

    const getWelcomeMessage = () => {
        if (!userProfile) return 'Selamat datang di Sistem Manajemen Inventaris';
        switch (userProfile.role) {
            case 'admin_produksi':
                return 'Dashboard Admin Produksi - Molding, Plating, Painting';
            case 'admin_indirect':
                return 'Dashboard Admin Indirect - Assembly, PP, QC, QA, PPIC, Logistics';
            case 'supervisor':
                return `Dashboard Supervisor - ${userProfile.department?.name || 'Departemen'}`;
            case 'admin_dept':
                return `Dashboard Admin - ${userProfile.department?.name || 'Departemen'}`;
            case 'hrga':
                return 'Dashboard HRGA - Overview Seluruh Sistem';
            default:
                return 'Selamat datang di Sistem Manajemen Inventaris';
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    const isAdmin = userProfile?.role === 'admin_produksi' || userProfile?.role === 'admin_indirect' || userProfile?.role === 'admin_dept';
    const isSupervisor = userProfile?.role === 'supervisor';
    const isHRGA = userProfile?.role === 'hrga';

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-semibold text-slate-700 dark:text-navy-100">
                    Dashboard
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-navy-300">
                    {getWelcomeMessage()}
                </p>
            </div>

            {/* Stats Cards - Different for each role */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* Pending Requests - All roles */}
                <div className="card p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-500 dark:text-navy-300">
                                {isSupervisor ? 'Menunggu Approval' : 'Request Pending'}
                            </p>
                            <p className="mt-1 text-2xl font-semibold text-slate-700 dark:text-navy-100">
                                {stats.pendingRequests}
                            </p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-warning/10">
                            <svg className="h-6 w-6 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                    {isSupervisor && stats.pendingRequests > 0 && (
                        <Link href="/dashboard/approvals" className="mt-3 block text-sm text-primary hover:underline">
                            Lihat untuk approval →
                        </Link>
                    )}
                </div>

                {/* Approved Requests - All roles */}
                <div className="card p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-500 dark:text-navy-300">Request Disetujui</p>
                            <p className="mt-1 text-2xl font-semibold text-slate-700 dark:text-navy-100">
                                {stats.approvedRequests}
                            </p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/10">
                            <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Rejected Requests - All roles */}
                <div className="card p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-500 dark:text-navy-300">Request Ditolak</p>
                            <p className="mt-1 text-2xl font-semibold text-slate-700 dark:text-navy-100">
                                {stats.rejectedRequests}
                            </p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-error/10">
                            <svg className="h-6 w-6 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* HRGA-only: Total Items */}
                {isHRGA && (
                    <div className="card p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500 dark:text-navy-300">Total Barang</p>
                                <p className="mt-1 text-2xl font-semibold text-slate-700 dark:text-navy-100">
                                    {stats.totalItems}
                                </p>
                            </div>
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                                <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                            </div>
                        </div>
                        <Link href="/dashboard/stock" className="mt-3 block text-sm text-primary hover:underline">
                            Kelola stok →
                        </Link>
                    </div>
                )}

                {/* HRGA-only: Low Stock Alert */}
                {isHRGA && (
                    <div className="card p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500 dark:text-navy-300">Stok Menipis</p>
                                <p className="mt-1 text-2xl font-semibold text-slate-700 dark:text-navy-100">
                                    {stats.lowStockItems}
                                </p>
                            </div>
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-error/10">
                                <svg className="h-6 w-6 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                        </div>
                    </div>
                )}

                {/* HRGA-only: Scheduled Batches */}
                {isHRGA && (
                    <div className="card p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500 dark:text-navy-300">Batch Pending</p>
                                <p className="mt-1 text-2xl font-semibold text-slate-700 dark:text-navy-100">
                                    {stats.scheduledBatches}
                                </p>
                            </div>
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-info/10">
                                <svg className="h-6 w-6 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </div>
                        </div>
                        <Link href="/dashboard/batches" className="mt-3 block text-sm text-primary hover:underline">
                            Kelola batch →
                        </Link>
                    </div>
                )}
            </div>

            {/* Quick Actions for Supervisor */}
            {isSupervisor && stats.pendingRequests > 0 && (
                <div className="card bg-warning/5 p-5">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/20">
                            <svg className="h-6 w-6 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                        </div>
                        <div className="flex-1">
                            <h3 className="font-medium text-slate-700 dark:text-navy-100">
                                {stats.pendingRequests} Request Menunggu Approval Anda
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-navy-300">
                                Silakan review dan approve/reject request dari departemen Anda
                            </p>
                        </div>
                        <Link
                            href="/dashboard/approvals"
                            className="btn bg-warning text-white hover:bg-warning-focus"
                        >
                            Review Sekarang
                        </Link>
                    </div>
                </div>
            )}

            {/* Quick Actions for Admin */}
            {isAdmin && (
                <div className="card bg-primary/5 p-5">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                            <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                        <div className="flex-1">
                            <h3 className="font-medium text-slate-700 dark:text-navy-100">
                                Buat Request Baru
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-navy-300">
                                Ajukan permintaan barang untuk departemen Anda
                            </p>
                        </div>
                        <Link
                            href="/dashboard/requests/new"
                            className="btn bg-primary text-white hover:bg-primary-focus dark:bg-accent"
                        >
                            Buat Request
                        </Link>
                    </div>
                </div>
            )}
            <div className="card">
                <div className="border-b border-slate-150 p-5 dark:border-navy-600">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-slate-700 dark:text-navy-100">
                            Request Terbaru
                        </h2>
                        <Link href="/dashboard/requests" className="text-sm text-primary hover:underline">
                            Lihat Semua →
                        </Link>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-150 dark:border-navy-600">
                                <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    No. Dokumen
                                </th>
                                <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Departemen
                                </th>
                                <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Status
                                </th>
                                <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Tanggal
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentRequests.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-5 py-8 text-center text-slate-400 dark:text-navy-300">
                                        Belum ada request
                                    </td>
                                </tr>
                            ) : (
                                recentRequests.map((request) => (
                                    <tr key={request.id} className="border-b border-slate-150 last:border-0 dark:border-navy-600">
                                        <td className="px-5 py-3 text-sm font-medium text-slate-700 dark:text-navy-100">
                                            <Link href={`/dashboard/requests/${request.id}`} className="hover:text-primary">
                                                {request.doc_number}
                                            </Link>
                                        </td>
                                        <td className="px-5 py-3 text-sm text-slate-600 dark:text-navy-200">
                                            {request.department?.name || request.dept_code}
                                        </td>
                                        <td className="px-5 py-3">
                                            {getStatusBadge(request.status)}
                                        </td>
                                        <td className="px-5 py-3 text-sm text-slate-500 dark:text-navy-300">
                                            {new Date(request.created_at).toLocaleDateString('id-ID')}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
