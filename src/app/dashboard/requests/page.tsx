'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Request, RequestStatus, Profile, UserRole, PRODUCTION_DEPARTMENTS, INDIRECT_DEPARTMENTS } from '@/types/database';

export default function RequestsListPage() {
    const [requests, setRequests] = useState<Request[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('all');
    const [userProfile, setUserProfile] = useState<Profile | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Get current user's profile with department info
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

                console.log('User role:', role);
                console.log('User department:', profile?.department);

                if (role === 'admin_produksi') {
                    // Admin produksi sees production departments
                    allowedDeptCodes = [...PRODUCTION_DEPARTMENTS];
                    console.log('Admin Produksi - allowed depts:', allowedDeptCodes);
                } else if (role === 'admin_indirect') {
                    // Admin indirect sees indirect departments
                    allowedDeptCodes = [...INDIRECT_DEPARTMENTS];
                    console.log('Admin Indirect - allowed depts:', allowedDeptCodes);
                } else if (role === 'supervisor') {
                    // Supervisor sees only their department
                    if (profile?.department?.code) {
                        allowedDeptCodes = [profile.department.code];
                    }
                    console.log('Supervisor - allowed depts:', allowedDeptCodes);
                } else if (role === 'admin_dept') {
                    // Admin dept sees only their department
                    if (profile?.department?.code) {
                        allowedDeptCodes = [profile.department.code];
                    }
                    console.log('Admin Dept - allowed depts:', allowedDeptCodes);
                } else if (role === 'hrga') {
                    // HRGA sees all - no filter
                    console.log('HRGA - sees all departments');
                }
                // Note: if allowedDeptCodes is empty and not HRGA, no requests shown

                // Build query
                let query = supabase
                    .from('requests')
                    .select(`
                        *,
                        requester:profiles!requester_id(full_name, email),
                        department:departments!dept_code(name)
                    `)
                    .order('created_at', { ascending: false });

                // Apply department filter for non-HRGA roles
                if (role !== 'hrga' && allowedDeptCodes.length > 0) {
                    query = query.in('dept_code', allowedDeptCodes);
                }

                // Apply status filter
                if (statusFilter !== 'all') {
                    query = query.eq('status', statusFilter);
                }

                const { data, error } = await query;

                if (error) throw error;
                setRequests(data || []);
            } catch (error) {
                console.error('Error fetching requests:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [statusFilter]);

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
            approved_spv: 'Disetujui SPV',
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

    const statusOptions: { value: RequestStatus | 'all'; label: string }[] = [
        { value: 'all', label: 'Semua Status' },
        { value: 'pending', label: 'Menunggu' },
        { value: 'approved_spv', label: 'Disetujui SPV' },
        { value: 'scheduled', label: 'Terjadwal' },
        { value: 'completed', label: 'Selesai' },
        { value: 'rejected', label: 'Ditolak' },
    ];

    // Get description based on role
    const getRoleDescription = () => {
        if (!userProfile) return '';
        switch (userProfile.role) {
            case 'admin_produksi':
                return 'Menampilkan request untuk: Molding, Plating, Painting 1, Painting 2';
            case 'admin_indirect':
                return 'Menampilkan request untuk: PP, QC, QA, PPIC, Logistics';
            case 'supervisor':
            case 'admin_dept':
                return `Menampilkan request untuk departemen: ${userProfile.department?.name || userProfile.department?.code || '-'}`;
            case 'hrga':
                return 'Menampilkan semua request';
            default:
                return '';
        }
    };

    // Check if user can create requests
    const canCreateRequest = () => {
        if (!userProfile) return false;
        const role = userProfile.role as UserRole;
        return role === 'admin_produksi' || role === 'admin_indirect' || role === 'admin_dept';
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-700 dark:text-navy-100">
                        Daftar Request
                    </h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-navy-300">
                        {getRoleDescription() || 'Kelola semua permintaan barang'}
                    </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                    {/* Status Filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as RequestStatus | 'all')}
                        className="form-select rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm hover:border-slate-400 focus:border-primary dark:border-navy-450 dark:hover:border-navy-400 dark:focus:border-accent"
                    >
                        {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>

                    {/* New Request Button */}
                    {canCreateRequest() && (
                        <Link
                            href="/dashboard/requests/new"
                            className="btn bg-primary text-white hover:bg-primary-focus dark:bg-accent dark:hover:bg-accent-focus"
                        >
                            <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Buat Request
                        </Link>
                    )}
                </div>
            </div>

            {/* Requests Table */}
            <div className="card">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-150 dark:border-navy-600">
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    No. Dokumen
                                </th>
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Departemen
                                </th>
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Pemohon
                                </th>
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Status
                                </th>
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Tanggal
                                </th>
                                <th className="px-5 py-4 text-center text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Aksi
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-5 py-12 text-center">
                                        <div className="flex items-center justify-center">
                                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                        </div>
                                    </td>
                                </tr>
                            ) : requests.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-5 py-12 text-center text-slate-400 dark:text-navy-300">
                                        Tidak ada request yang ditemukan
                                    </td>
                                </tr>
                            ) : (
                                requests.map((request) => (
                                    <tr key={request.id} className="border-b border-slate-100 last:border-0 dark:border-navy-700">
                                        <td className="px-5 py-4">
                                            <span className="font-medium text-slate-700 dark:text-navy-100">
                                                {request.doc_number}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-600 dark:text-navy-200">
                                            {(request as any).department?.name || request.dept_code}
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-600 dark:text-navy-200">
                                            {(request as any).requester?.full_name || (request as any).requester?.email || '-'}
                                        </td>
                                        <td className="px-5 py-4">
                                            {getStatusBadge(request.status)}
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-500 dark:text-navy-300">
                                            {new Date(request.created_at).toLocaleDateString('id-ID', {
                                                day: '2-digit',
                                                month: 'short',
                                                year: 'numeric',
                                            })}
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <Link
                                                    href={`/dashboard/requests/${request.id}`}
                                                    className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:text-navy-300 dark:hover:bg-navy-600"
                                                    title="Lihat Detail"
                                                >
                                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                    </svg>
                                                </Link>
                                            </div>
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
