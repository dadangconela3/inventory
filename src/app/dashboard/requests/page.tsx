'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Request, RequestStatus, Profile, UserRole, PRODUCTION_DEPARTMENTS, INDIRECT_DEPARTMENTS, Department, RequestItem, Item } from '@/types/database';

interface RequestWithRelations extends Omit<Request, 'requester' | 'department' | 'items'> {
    requester?: { full_name: string; email: string };
    department?: { name: string };
    items?: (RequestItem & {
        item?: Item;
    })[];
}

export default function RequestsListPage() {
    const [requests, setRequests] = useState<RequestWithRelations[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('all');
    const [userProfile, setUserProfile] = useState<Profile | null>(null);

    // Bulk approval state
    const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
    const [showBulkApprovalModal, setShowBulkApprovalModal] = useState(false);
    const [selectedRequestDetails, setSelectedRequestDetails] = useState<RequestWithRelations[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [processing, setProcessing] = useState(false);

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

        // Subscribe to real-time changes for requests
        const channel = supabase
            .channel('requests-list-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'requests',
                },
                (payload) => {
                    console.log('Request change detected in list:', payload);
                    // Refetch data when changes occur
                    fetchData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
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

    // Check if user is supervisor
    const isSupervisor = userProfile?.role === 'supervisor';

    // Get pending requests for supervisor
    const pendingRequests = requests.filter(r => r.status === 'pending');

    // Toggle request selection
    const toggleSelectRequest = (requestId: string) => {
        const newSelected = new Set(selectedRequests);
        if (newSelected.has(requestId)) {
            newSelected.delete(requestId);
        } else {
            newSelected.add(requestId);
        }
        setSelectedRequests(newSelected);
    };

    // Select all pending requests
    const toggleSelectAll = () => {
        if (selectedRequests.size === pendingRequests.length) {
            setSelectedRequests(new Set());
        } else {
            setSelectedRequests(new Set(pendingRequests.map(r => r.id)));
        }
    };

    // Open bulk approval modal with details
    const openBulkApprovalModal = async () => {
        if (selectedRequests.size === 0) return;

        setLoadingDetails(true);
        setShowBulkApprovalModal(true);

        try {
            // Fetch details for all selected requests
            const { data, error } = await supabase
                .from('requests')
                .select(`
                    *,
                    requester:profiles!requester_id(full_name, email),
                    department:departments!dept_code(name),
                    items:request_items(quantity, item:items(name, sku, unit))
                `)
                .in('id', Array.from(selectedRequests));

            if (error) throw error;
            setSelectedRequestDetails(data || []);
        } catch (error) {
            console.error('Error fetching request details:', error);
            alert('Gagal memuat detail request');
        } finally {
            setLoadingDetails(false);
        }
    };

    // Handle bulk approval
    const handleBulkApproval = async () => {
        if (selectedRequests.size === 0) return;

        setProcessing(true);
        try {
            const { error } = await supabase
                .from('requests')
                .update({
                    status: 'approved_spv',
                    updated_at: new Date().toISOString()
                })
                .in('id', Array.from(selectedRequests));

            if (error) throw error;

            // Get request details for notifications
            const { data: approvedRequests } = await supabase
                .from('requests')
                .select('id, doc_number, requester_id')
                .in('id', Array.from(selectedRequests));

            if (approvedRequests) {
                // Notify each requester
                const requesterNotifications = approvedRequests.map(req => ({
                    user_id: req.requester_id,
                    message: `Request ${req.doc_number} telah disetujui oleh Supervisor`,
                    link: `/dashboard/requests/${req.id}`,
                }));
                await supabase.from('notifications').insert(requesterNotifications);

                // Notify all HRGA users
                const { data: hrgaUsers } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('role', 'hrga');

                if (hrgaUsers && hrgaUsers.length > 0) {
                    const hrgaNotifications = approvedRequests.flatMap(req =>
                        hrgaUsers.map(h => ({
                            user_id: h.id,
                            message: `Request ${req.doc_number} siap dijadwalkan`,
                            link: '/dashboard/batches',
                        }))
                    );
                    await supabase.from('notifications').insert(hrgaNotifications);
                }
            }

            // Update local state
            setRequests(prev => prev.map(r =>
                selectedRequests.has(r.id)
                    ? { ...r, status: 'approved_spv' as RequestStatus }
                    : r
            ));

            setSelectedRequests(new Set());
            setShowBulkApprovalModal(false);
            alert(`${selectedRequests.size} request berhasil disetujui!`);
        } catch (error) {
            console.error('Error approving requests:', error);
            alert('Gagal menyetujui request');
        } finally {
            setProcessing(false);
        }
    };

    // ==================== HRGA BULK HANDOVER ====================
    const isHRGA = userProfile?.role === 'hrga';

    // Get handoverable requests (scheduled or approved_spv)
    const handoverableRequests = requests.filter(r => r.status === 'scheduled' || r.status === 'approved_spv');

    // Bulk handover state
    const [selectedForHandover, setSelectedForHandover] = useState<Set<string>>(new Set());
    const [showBulkHandoverModal, setShowBulkHandoverModal] = useState(false);
    const [handoverDetails, setHandoverDetails] = useState<RequestWithRelations[]>([]);
    const [loadingHandoverDetails, setLoadingHandoverDetails] = useState(false);
    const [processingHandover, setProcessingHandover] = useState(false);

    // Toggle handover selection
    const toggleSelectForHandover = (requestId: string) => {
        const newSelected = new Set(selectedForHandover);
        if (newSelected.has(requestId)) {
            newSelected.delete(requestId);
        } else {
            newSelected.add(requestId);
        }
        setSelectedForHandover(newSelected);
    };

    // Select all handoverable requests
    const toggleSelectAllHandover = () => {
        if (selectedForHandover.size === handoverableRequests.length) {
            setSelectedForHandover(new Set());
        } else {
            setSelectedForHandover(new Set(handoverableRequests.map(r => r.id)));
        }
    };

    // Open bulk handover modal
    const openBulkHandoverModal = async () => {
        if (selectedForHandover.size === 0) return;

        setLoadingHandoverDetails(true);
        setShowBulkHandoverModal(true);

        try {
            const { data, error } = await supabase
                .from('requests')
                .select(`
                    *,
                    requester:profiles!requester_id(full_name, email),
                    department:departments!dept_code(name),
                    items:request_items(quantity, item:items(id, name, sku, unit, current_stock))
                `)
                .in('id', Array.from(selectedForHandover));

            if (error) throw error;
            setHandoverDetails(data || []);
        } catch (error) {
            console.error('Error fetching handover details:', error);
            alert('Gagal memuat detail request');
        } finally {
            setLoadingHandoverDetails(false);
        }
    };

    // Handle bulk handover
    const handleBulkHandover = async () => {
        if (selectedForHandover.size === 0) return;

        setProcessingHandover(true);
        try {
            // Update stock for each item in each request
            for (const req of handoverDetails) {
                for (const reqItem of (req.items || [])) {
                    const currentStock = reqItem.item?.current_stock || 0;
                    const newStock = Math.max(0, currentStock - reqItem.quantity);

                    await supabase
                        .from('items')
                        .update({ current_stock: newStock })
                        .eq('id', reqItem.item?.id);
                }
            }

            // Update all selected requests to completed
            const { error } = await supabase
                .from('requests')
                .update({
                    status: 'completed',
                    updated_at: new Date().toISOString()
                })
                .in('id', Array.from(selectedForHandover));

            if (error) throw error;

            // Notify all requesters
            const requesterIds = new Set(handoverDetails.map(r => r.requester_id));
            const notifications = Array.from(requesterIds).map(userId => ({
                user_id: userId,
                message: 'Barang untuk request Anda telah diserahkan',
                link: '/dashboard/requests',
            }));
            await supabase.from('notifications').insert(notifications);

            // Update local state
            setRequests(prev => prev.map(r =>
                selectedForHandover.has(r.id)
                    ? { ...r, status: 'completed' as RequestStatus }
                    : r
            ));

            setSelectedForHandover(new Set());
            setShowBulkHandoverModal(false);
            alert(`${selectedForHandover.size} request berhasil diserahkan! Stok telah diperbarui.`);
        } catch (error) {
            console.error('Error during bulk handover:', error);
            alert('Gagal menyerahkan barang');
        } finally {
            setProcessingHandover(false);
        }
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

                    {/* Bulk Approve Button for Supervisor */}
                    {isSupervisor && selectedRequests.size > 0 && (
                        <button
                            onClick={openBulkApprovalModal}
                            className="btn bg-success text-white hover:bg-success-focus"
                        >
                            <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Setujui ({selectedRequests.size})
                        </button>
                    )}

                    {/* Bulk Handover Button for HRGA */}
                    {isHRGA && selectedForHandover.size > 0 && (
                        <button
                            onClick={openBulkHandoverModal}
                            className="btn bg-success text-white hover:bg-success-focus"
                        >
                            <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Serahkan ({selectedForHandover.size})
                        </button>
                    )}
                </div>
            </div>

            {/* Requests Table */}
            <div className="card">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-150 dark:border-navy-600">
                                {/* Checkbox column for supervisor */}
                                {isSupervisor && (
                                    <th className="px-3 py-4 text-center">
                                        <input
                                            type="checkbox"
                                            checked={pendingRequests.length > 0 && selectedRequests.size === pendingRequests.length}
                                            onChange={toggleSelectAll}
                                            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                            title="Pilih Semua"
                                        />
                                    </th>
                                )}
                                {/* Checkbox column for HRGA handover */}
                                {isHRGA && (
                                    <th className="px-3 py-4 text-center">
                                        <input
                                            type="checkbox"
                                            checked={handoverableRequests.length > 0 && selectedForHandover.size === handoverableRequests.length}
                                            onChange={toggleSelectAllHandover}
                                            className="h-4 w-4 rounded border-slate-300 text-success focus:ring-success"
                                            title="Pilih Semua untuk Diserahkan"
                                        />
                                    </th>
                                )}
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
                                    <tr key={request.id} className={`border-b border-slate-100 last:border-0 dark:border-navy-700 ${selectedRequests.has(request.id) ? 'bg-primary/5' : ''}`}>
                                        {/* Checkbox for supervisor - only for pending */}
                                        {isSupervisor && (
                                            <td className="px-3 py-4 text-center">
                                                {request.status === 'pending' ? (
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedRequests.has(request.id)}
                                                        onChange={() => toggleSelectRequest(request.id)}
                                                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                                    />
                                                ) : (
                                                    <span className="text-slate-300">-</span>
                                                )}
                                            </td>
                                        )}
                                        {/* Checkbox for HRGA - only for scheduled/approved_spv */}
                                        {isHRGA && (
                                            <td className="px-3 py-4 text-center">
                                                {(request.status === 'scheduled' || request.status === 'approved_spv') ? (
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedForHandover.has(request.id)}
                                                        onChange={() => toggleSelectForHandover(request.id)}
                                                        className="h-4 w-4 rounded border-slate-300 text-success focus:ring-success"
                                                    />
                                                ) : (
                                                    <span className="text-slate-300">-</span>
                                                )}
                                            </td>
                                        )}
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

            {/* Bulk Approval Modal */}
            {
                showBulkApprovalModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                        <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl dark:bg-navy-700">
                            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-navy-600">
                                <h3 className="text-lg font-semibold text-slate-700 dark:text-navy-100">
                                    Konfirmasi Persetujuan ({selectedRequests.size} Request)
                                </h3>
                                <button
                                    onClick={() => setShowBulkApprovalModal(false)}
                                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                                >
                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="max-h-[50vh] overflow-y-auto p-6">
                                {loadingDetails ? (
                                    <div className="flex items-center justify-center py-12">
                                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {selectedRequestDetails.map((req) => (
                                            <div key={req.id} className="rounded-lg border border-slate-200 p-4 dark:border-navy-600">
                                                <div className="mb-2 flex items-center justify-between">
                                                    <span className="font-medium text-slate-700 dark:text-navy-100">
                                                        {req.doc_number}
                                                    </span>
                                                    <span className="text-sm text-slate-500">
                                                        {req.department?.name || req.dept_code}
                                                    </span>
                                                </div>
                                                <p className="mb-2 text-sm text-slate-500">
                                                    Pemohon: {req.requester?.full_name || req.requester?.email}
                                                </p>
                                                <div className="rounded-lg bg-slate-50 p-3 dark:bg-navy-600">
                                                    <p className="mb-2 text-xs font-medium uppercase text-slate-500 dark:text-navy-300">Daftar Barang:</p>
                                                    <ul className="space-y-1">
                                                        {(req.items || []).map((item: any, idx: number) => (
                                                            <li key={idx} className="flex items-center justify-between text-sm">
                                                                <span className="text-slate-700 dark:text-navy-100">
                                                                    {item.item?.name} ({item.item?.sku})
                                                                </span>
                                                                <span className="font-medium text-slate-600 dark:text-navy-200">
                                                                    {item.quantity} {item.item?.unit}
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4 dark:border-navy-600">
                                <button
                                    onClick={() => setShowBulkApprovalModal(false)}
                                    disabled={processing}
                                    className="btn border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-450 dark:text-navy-200"
                                >
                                    Batal
                                </button>
                                <button
                                    onClick={handleBulkApproval}
                                    disabled={processing || loadingDetails}
                                    className="btn bg-success text-white hover:bg-success-focus disabled:opacity-50"
                                >
                                    {processing ? 'Memproses...' : `Setujui ${selectedRequests.size} Request`}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            {
                showBulkHandoverModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                        <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl dark:bg-navy-700">
                            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-navy-600">
                                <h3 className="text-lg font-semibold text-slate-700 dark:text-navy-100">
                                    Konfirmasi Serah Terima ({selectedForHandover.size} Request)
                                </h3>
                                <button
                                    onClick={() => setShowBulkHandoverModal(false)}
                                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                                >
                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="max-h-[50vh] overflow-y-auto p-6">
                                {loadingHandoverDetails ? (
                                    <div className="flex items-center justify-center py-12">
                                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="rounded-lg bg-warning/10 p-4 text-sm text-warning">
                                            <strong>Perhatian:</strong> Stok barang akan dikurangi otomatis untuk semua request yang dipilih.
                                        </div>

                                        {handoverDetails.map((req) => (
                                            <div key={req.id} className="rounded-lg border border-slate-200 p-4 dark:border-navy-600">
                                                <div className="mb-2 flex items-center justify-between">
                                                    <span className="font-medium text-slate-700 dark:text-navy-100">
                                                        {req.doc_number}
                                                    </span>
                                                    <span className="text-sm text-slate-500">
                                                        {req.department?.name || req.dept_code}
                                                    </span>
                                                </div>
                                                <p className="mb-2 text-sm text-slate-500">
                                                    Pemohon: {req.requester?.full_name || req.requester?.email}
                                                </p>
                                                <div className="rounded-lg bg-slate-50 p-3 dark:bg-navy-600">
                                                    <p className="mb-2 text-xs font-medium uppercase text-slate-500 dark:text-navy-300">Daftar Barang:</p>
                                                    <ul className="space-y-1">
                                                        {(req.items || []).map((item: any, idx: number) => (
                                                            <li key={idx} className="flex items-center justify-between text-sm">
                                                                <div>
                                                                    <span className="text-slate-700 dark:text-navy-100">
                                                                        {item.item?.name}
                                                                    </span>
                                                                    <span className="ml-2 text-xs text-slate-400">
                                                                        (Stok: {item.item?.current_stock})
                                                                    </span>
                                                                </div>
                                                                <span className="font-medium text-slate-600 dark:text-navy-200">
                                                                    {item.quantity} {item.item?.unit}
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4 dark:border-navy-600">
                                <button
                                    onClick={() => setShowBulkHandoverModal(false)}
                                    disabled={processingHandover}
                                    className="btn border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-450 dark:text-navy-200"
                                >
                                    Batal
                                </button>
                                <button
                                    onClick={handleBulkHandover}
                                    disabled={processingHandover || loadingHandoverDetails}
                                    className="btn bg-success text-white hover:bg-success-focus disabled:opacity-50"
                                >
                                    {processingHandover ? 'Memproses...' : `Serahkan ${selectedForHandover.size} Request`}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
