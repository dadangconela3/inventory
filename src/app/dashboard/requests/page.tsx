'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Request, RequestStatus, Profile, UserRole, PRODUCTION_DEPARTMENTS, INDIRECT_DEPARTMENTS, RequestItem, Item } from '@/types/database';
import DeleteRequestModal from '@/components/requests/DeleteRequestModal';
import { showColoredToast, toast } from '@/lib/toast';

interface RequestWithRelations extends Omit<Request, 'requester' | 'department' | 'items'> {
    requester?: { full_name: string; email: string };
    department?: { name: string };
    items?: (RequestItem & {
        item?: Item;
    })[];
}

interface FlattenedRequestItem {
    id: string;
    requestId: string;
    docNumber: string;
    createdAt: string;
    status: RequestStatus;
    requesterName: string;
    departmentName: string;
    deptCode: string;
    itemName: string;
    itemSku?: string;
    quantity: number;
    unit: string;
    currentStock: number;
}

export default function RequestsListPage() {
    const [requests, setRequests] = useState<RequestWithRelations[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('all');
    const [userProfile, setUserProfile] = useState<Profile | null>(null);

    // View switcher & filter state
    const [viewMode, setViewMode] = useState<'document' | 'items'>('document');
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    // Delete request state (HRGA only)
    const [requestToDelete, setRequestToDelete] = useState<RequestWithRelations | null>(null);

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
                    .select(`
                        *,
                        department:departments(code, name),
                        user_departments(
                            id,
                            is_primary,
                            department:departments(id, code, name)
                        )
                    `)
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
                    // Supervisor sees their departments (multi-department support)
                    if (profile?.user_departments && profile.user_departments.length > 0) {
                        // Use user_departments for multi-department supervisors
                        allowedDeptCodes = profile.user_departments.map((ud: any) => ud.department.code);
                    } else if (profile?.department?.code) {
                        // Fallback to single department for backward compatibility
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

                // Build query including items and current stock
                let query = supabase
                    .from('requests')
                    .select(`
                        *,
                        requester:profiles!requester_id(full_name, email),
                        department:departments!dept_code(name),
                        items:request_items(
                            id,
                            item_id,
                            quantity,
                            item:items(id, name, sku, unit, current_stock)
                        )
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
                return 'Menampilkan request untuk: Assembly, PP, QC, QA, PPIC, Logistics';
            case 'supervisor':
                if (userProfile.user_departments && userProfile.user_departments.length > 0) {
                    const deptNames = userProfile.user_departments.map((ud: any) => ud.department.name).join(', ');
                    return `Menampilkan request untuk departemen: ${deptNames}`;
                }
                return `Menampilkan request untuk departemen: ${userProfile.department?.name || userProfile.department?.code || '-'}`;
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
            toast.error('Gagal memuat detail request');
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
            toast.success(`${selectedRequests.size} request berhasil disetujui!`);
        } catch (error) {
            console.error('Error approving requests:', error);
            toast.error('Gagal menyetujui request');
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
    const [bulkHandoverQuantities, setBulkHandoverQuantities] = useState<Record<string, number>>({});
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
                    items:request_items(id, item_id, quantity, item:items(id, name, sku, unit, current_stock))
                `)
                .in('id', Array.from(selectedForHandover));

            if (error) throw error;
            const details = data || [];
            setHandoverDetails(details);

            // Initialize bulk handover quantities with original requested quantities
            const initialQuantities: Record<string, number> = {};
            for (const req of details) {
                for (let i = 0; i < (req.items || []).length; i++) {
                    const reqItem = req.items![i];
                    const itemKey = reqItem.id || `${req.id}_${i}`;
                    initialQuantities[itemKey] = reqItem.quantity;
                }
            }
            setBulkHandoverQuantities(initialQuantities);
        } catch (error) {
            console.error('Error fetching handover details:', error);
            showColoredToast('error', 'Gagal memuat detail request');
        } finally {
            setLoadingHandoverDetails(false);
        }
    };

    // Real-time calculation of total allocated quantity per item across all selected requests
    const allocationSummary = (() => {
        const summary: Record<string, { id: string; name: string; sku?: string; unit: string; current_stock: number; totalAllocated: number }> = {};
        for (const req of handoverDetails) {
            for (let i = 0; i < (req.items || []).length; i++) {
                const reqItem = req.items![i];
                const itemId = reqItem.item?.id || reqItem.item_id;
                if (!itemId) continue;
                const itemKey = reqItem.id || `${req.id}_${i}`;
                const qty = bulkHandoverQuantities[itemKey] !== undefined
                    ? bulkHandoverQuantities[itemKey]
                    : reqItem.quantity;

                if (!summary[itemId]) {
                    summary[itemId] = {
                        id: itemId,
                        name: reqItem.item?.name || 'Barang',
                        sku: reqItem.item?.sku,
                        unit: reqItem.item?.unit || 'pcs',
                        current_stock: reqItem.item?.current_stock ?? 0,
                        totalAllocated: 0,
                    };
                }
                summary[itemId].totalAllocated += qty;
            }
        }
        return summary;
    })();

    const hasOverAllocatedItem = Object.values(allocationSummary).some(
        item => item.totalAllocated > item.current_stock
    );

    // Handle bulk handover
    const handleBulkHandover = async () => {
        if (selectedForHandover.size === 0) return;

        setProcessingHandover(true);
        try {
            // Build handovers payload
            const handoversPayload = [];

            for (const req of handoverDetails) {
                const items = [];
                for (let i = 0; i < (req.items || []).length; i++) {
                    const reqItem = req.items![i];
                    const itemId = reqItem.item?.id || reqItem.item_id;
                    if (!itemId) continue;

                    const itemKey = reqItem.id || `${req.id}_${i}`;
                    const actualQty = bulkHandoverQuantities[itemKey] !== undefined
                        ? bulkHandoverQuantities[itemKey]
                        : reqItem.quantity;

                    if (actualQty <= 0) {
                        showColoredToast('warning', `Jumlah serah terima untuk "${reqItem.item?.name || 'barang'}" minimal 1`);
                        setProcessingHandover(false);
                        return;
                    }

                    items.push({
                        requestItemId: reqItem.id,
                        itemId,
                        actualQuantity: Number(actualQty)
                    });
                }
                handoversPayload.push({
                    requestId: req.id,
                    items
                });
            }

            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const response = await fetch('/api/requests/handover', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ handovers: handoversPayload })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Gagal menyerahkan barang');
            }

            // Update local state
            setRequests(prev => prev.map(r =>
                selectedForHandover.has(r.id)
                    ? { ...r, status: 'completed' as RequestStatus }
                    : r
            ));

            const totalReqCount = selectedForHandover.size;
            setSelectedForHandover(new Set());
            setShowBulkHandoverModal(false);
            showColoredToast('success', `${totalReqCount} request berhasil diserahkan dan kuantitas disesuaikan!`);
        } catch (error: any) {
            console.error('Error during bulk handover:', error);
            showColoredToast('error', error?.message || 'Gagal menyerahkan barang');
        } finally {
            setProcessingHandover(false);
        }
    };

    // Toggle expand row for document view
    const toggleExpandRow = (id: string) => {
        const next = new Set(expandedRows);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedRows(next);
    };

    // Flatten all items across requests for item-level view
    const flattenedItems: FlattenedRequestItem[] = useMemo(() => {
        const list: FlattenedRequestItem[] = [];
        for (const req of requests) {
            if (req.items && req.items.length > 0) {
                for (let i = 0; i < req.items.length; i++) {
                    const it = req.items[i];
                    list.push({
                        id: it.id || `${req.id}-${i}`,
                        requestId: req.id,
                        docNumber: req.doc_number,
                        createdAt: req.created_at,
                        status: req.status,
                        requesterName: req.requester?.full_name || req.requester?.email || '-',
                        departmentName: req.department?.name || req.dept_code,
                        deptCode: req.dept_code,
                        itemName: it.item?.name || 'Barang',
                        itemSku: it.item?.sku,
                        quantity: it.quantity,
                        unit: it.item?.unit || 'pcs',
                        currentStock: it.item?.current_stock ?? 0,
                    });
                }
            } else {
                list.push({
                    id: `${req.id}-none`,
                    requestId: req.id,
                    docNumber: req.doc_number,
                    createdAt: req.created_at,
                    status: req.status,
                    requesterName: req.requester?.full_name || req.requester?.email || '-',
                    departmentName: req.department?.name || req.dept_code,
                    deptCode: req.dept_code,
                    itemName: '(Belum ada rincian barang)',
                    quantity: 0,
                    unit: '-',
                    currentStock: 0,
                });
            }
        }
        return list;
    }, [requests]);

    // Filter requests by search query
    const filteredRequests = useMemo(() => {
        if (!searchQuery.trim()) return requests;
        const q = searchQuery.toLowerCase();
        return requests.filter(r =>
            r.doc_number.toLowerCase().includes(q) ||
            (r.requester?.full_name || '').toLowerCase().includes(q) ||
            (r.requester?.email || '').toLowerCase().includes(q) ||
            (r.department?.name || '').toLowerCase().includes(q) ||
            (r.dept_code || '').toLowerCase().includes(q) ||
            (r.items || []).some(it =>
                (it.item?.name || '').toLowerCase().includes(q) ||
                (it.item?.sku || '').toLowerCase().includes(q)
            )
        );
    }, [requests, searchQuery]);

    // Filter flattened items by search query
    const filteredItems = useMemo(() => {
        if (!searchQuery.trim()) return flattenedItems;
        const q = searchQuery.toLowerCase();
        return flattenedItems.filter(it =>
            it.docNumber.toLowerCase().includes(q) ||
            it.itemName.toLowerCase().includes(q) ||
            (it.itemSku || '').toLowerCase().includes(q) ||
            it.requesterName.toLowerCase().includes(q) ||
            it.departmentName.toLowerCase().includes(q) ||
            it.deptCode.toLowerCase().includes(q)
        );
    }, [flattenedItems, searchQuery]);

    const documentColSpan = (isSupervisor || isHRGA ? 1 : 0) + 7; // checkbox + chevron + doc_no + dept + pemohon + barang + status + tanggal + aksi

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

                {/* Primary Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
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

            {/* View Switcher & Toolbar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* View Mode Tabs */}
                <div className="flex items-center rounded-xl bg-slate-100 p-1 dark:bg-navy-750">
                    <button
                        type="button"
                        onClick={() => setViewMode('document')}
                        className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                            viewMode === 'document'
                                ? 'bg-white text-primary shadow-sm dark:bg-navy-600 dark:text-accent'
                                : 'text-slate-600 hover:text-slate-900 dark:text-navy-200 dark:hover:text-white'
                        }`}
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Per Dokumen ({filteredRequests.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewMode('items')}
                        className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                            viewMode === 'items'
                                ? 'bg-white text-primary shadow-sm dark:bg-navy-600 dark:text-accent'
                                : 'text-slate-600 hover:text-slate-900 dark:text-navy-200 dark:hover:text-white'
                        }`}
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        Rincian Barang ({filteredItems.length})
                    </button>
                </div>

                {/* Search & Filter Controls */}
                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Search Input */}
                    <div className="relative">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={viewMode === 'document' ? 'Cari no. dokumen, pemohon...' : 'Cari barang, SKU, dokumen...'}
                            className="w-56 sm:w-64 rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-7 text-xs sm:text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none dark:border-navy-450 dark:bg-navy-800 dark:placeholder:text-navy-300"
                        />
                        <svg className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-navy-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:text-navy-300 dark:hover:text-navy-100"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {/* Status Filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as RequestStatus | 'all')}
                        className="form-select rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs sm:text-sm hover:border-slate-400 focus:border-primary dark:border-navy-450 dark:bg-navy-800 dark:hover:border-navy-400 dark:focus:border-accent"
                    >
                        {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* TAB 1: PER DOKUMEN (DOCUMENT VIEW) */}
            {viewMode === 'document' && (
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
                                    {/* Accordion toggle header */}
                                    <th className="w-10 px-2 py-4 text-center text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                        <span className="sr-only">Buka</span>
                                    </th>
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
                                        Rincian Barang
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
                                        <td colSpan={documentColSpan} className="px-5 py-12 text-center">
                                            <div className="flex items-center justify-center">
                                                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredRequests.length === 0 ? (
                                    <tr>
                                        <td colSpan={documentColSpan} className="px-5 py-12 text-center text-slate-400 dark:text-navy-300">
                                            {searchQuery ? 'Tidak ada request yang sesuai dengan pencarian' : 'Tidak ada request yang ditemukan'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRequests.map((request) => {
                                        const isExpanded = expandedRows.has(request.id);
                                        const itemsCount = request.items?.length || 0;
                                        return (
                                            <>
                                                <tr
                                                    key={request.id}
                                                    className={`border-b border-slate-100 transition-colors hover:bg-slate-50/70 last:border-0 dark:border-navy-700 dark:hover:bg-navy-750 ${
                                                        selectedRequests.has(request.id) ? 'bg-primary/5' : ''
                                                    }`}
                                                >
                                                    {/* Checkbox for supervisor */}
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
                                                    {/* Checkbox for HRGA handover */}
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
                                                    {/* Accordion toggle button */}
                                                    <td className="px-2 py-4 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleExpandRow(request.id)}
                                                            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-navy-300 dark:hover:bg-navy-600 dark:hover:text-white"
                                                            title={isExpanded ? 'Tutup rincian' : 'Buka rincian barang'}
                                                        >
                                                            <svg
                                                                className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-primary dark:text-accent' : ''}`}
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                                stroke="currentColor"
                                                            >
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                            </svg>
                                                        </button>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <Link
                                                            href={`/dashboard/requests/${request.id}`}
                                                            className="font-medium text-slate-800 hover:text-primary dark:text-navy-100 dark:hover:text-accent"
                                                        >
                                                            {request.doc_number}
                                                        </Link>
                                                    </td>
                                                    <td className="px-5 py-4 text-sm text-slate-600 dark:text-navy-200">
                                                        {request.department?.name || request.dept_code}
                                                    </td>
                                                    <td className="px-5 py-4 text-sm text-slate-600 dark:text-navy-200">
                                                        {request.requester?.full_name || request.requester?.email || '-'}
                                                    </td>
                                                    {/* Inline Barang Summary Column */}
                                                    <td className="px-5 py-4">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleExpandRow(request.id)}
                                                            className="group inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-primary/10 hover:text-primary dark:bg-navy-600 dark:text-navy-200 dark:hover:bg-accent/15 dark:hover:text-accent"
                                                        >
                                                            <svg className="h-3.5 w-3.5 text-slate-500 group-hover:text-primary dark:text-navy-300 dark:group-hover:text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                                            </svg>
                                                            <span>{itemsCount} Barang</span>
                                                            <span className="text-[10px] text-slate-400 group-hover:text-primary">
                                                                ({isExpanded ? 'Sembunyikan' : 'Lihat'})
                                                            </span>
                                                        </button>
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
                                                                title="Lihat Detail Halaman"
                                                            >
                                                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                </svg>
                                                            </Link>
                                                            {isHRGA && (
                                                                <button
                                                                    onClick={() => setRequestToDelete(request)}
                                                                    className="rounded-lg p-2 text-error transition-colors hover:bg-error/10"
                                                                    title="Hapus Request (HRGA)"
                                                                >
                                                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>

                                                {/* Expanded Inline Accordion Row */}
                                                {isExpanded && (
                                                    <tr className="bg-slate-50/75 dark:bg-navy-850">
                                                        <td colSpan={documentColSpan} className="px-6 py-3">
                                                            <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-xs dark:border-navy-600 dark:bg-navy-800">
                                                                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-navy-200">
                                                                    <span className="flex items-center gap-1.5">
                                                                        <svg className="h-4 w-4 text-primary dark:text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                                                        </svg>
                                                                        Rincian Barang Permintaan ({itemsCount} Barang)
                                                                    </span>
                                                                    {request.rejection_reason && (
                                                                        <span className="text-rose-500 italic dark:text-rose-400">
                                                                            Alasan Tolak: {request.rejection_reason}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="overflow-x-auto">
                                                                    <table className="w-full text-left text-xs">
                                                                        <thead>
                                                                            <tr className="border-b border-slate-150 text-slate-500 dark:border-navy-600 dark:text-navy-300">
                                                                                <th className="pb-2 font-semibold">Nama Barang</th>
                                                                                <th className="pb-2 font-semibold">SKU</th>
                                                                                <th className="pb-2 font-semibold">Qty Diminta</th>
                                                                                <th className="pb-2 font-semibold">Stok Gudang</th>
                                                                                <th className="pb-2 font-semibold">Ketersediaan</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-slate-100 dark:divide-navy-700">
                                                                            {request.items && request.items.length > 0 ? (
                                                                                request.items.map((it, idx) => {
                                                                                    const isEnough = (it.item?.current_stock ?? 0) >= it.quantity;
                                                                                    const isCompleted = request.status === 'completed';
                                                                                    const isRejected = request.status === 'rejected';

                                                                                    return (
                                                                                        <tr key={idx} className="py-1.5">
                                                                                            <td className="py-2 font-medium text-slate-800 dark:text-navy-100">
                                                                                                {it.item?.name || 'Barang'}
                                                                                            </td>
                                                                                            <td className="py-2 text-slate-500 dark:text-navy-300">
                                                                                                {it.item?.sku || '-'}
                                                                                            </td>
                                                                                            <td className="py-2 font-semibold text-slate-800 dark:text-navy-100">
                                                                                                {it.quantity} {it.item?.unit || 'pcs'}
                                                                                            </td>
                                                                                            <td className="py-2 text-slate-600 dark:text-navy-200">
                                                                                                {isCompleted ? (
                                                                                                    <span className="text-xs italic text-slate-400 dark:text-navy-400">-</span>
                                                                                                ) : isRejected ? (
                                                                                                    <span className="text-xs italic text-slate-400 dark:text-navy-400">-</span>
                                                                                                ) : (
                                                                                                    `${it.item?.current_stock ?? 0} ${it.item?.unit || 'pcs'}`
                                                                                                )}
                                                                                            </td>
                                                                                            <td className="py-2">
                                                                                                {isCompleted ? (
                                                                                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-navy-300">
                                                                                                        <svg className="h-3.5 w-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                                                                        </svg>
                                                                                                        Sudah Diserahkan
                                                                                                    </span>
                                                                                                ) : isRejected ? (
                                                                                                    <span className="text-xs italic text-slate-400 dark:text-navy-400">
                                                                                                        Dibatalkan
                                                                                                    </span>
                                                                                                ) : isEnough ? (
                                                                                                    <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                                                                                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                                                                        </svg>
                                                                                                        Stok Cukup
                                                                                                    </span>
                                                                                                ) : (
                                                                                                    <span className="inline-flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400">
                                                                                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                                                                        </svg>
                                                                                                        Stok Kurang
                                                                                                    </span>
                                                                                                )}
                                                                                            </td>
                                                                                        </tr>
                                                                                    );
                                                                                })
                                                                            ) : (
                                                                                <tr>
                                                                                    <td colSpan={5} className="py-2 text-center text-slate-400">
                                                                                        Tidak ada rincian barang untuk request ini
                                                                                    </td>
                                                                                </tr>
                                                                            )}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 2: RINCIAN BARANG (ITEM-LEVEL VIEW) */}
            {viewMode === 'items' && (
                <div className="card">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-150 dark:border-navy-600">
                                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                        Tanggal
                                    </th>
                                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                        No. Dokumen
                                    </th>
                                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                        Nama Barang
                                    </th>
                                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                        Qty Diminta
                                    </th>
                                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                        Stok Gudang
                                    </th>
                                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                        Status
                                    </th>
                                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                        Pemohon & Dept
                                    </th>
                                    <th className="px-5 py-4 text-center text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                        Aksi
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="px-5 py-12 text-center">
                                            <div className="flex items-center justify-center">
                                                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredItems.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-5 py-12 text-center text-slate-400 dark:text-navy-300">
                                            {searchQuery ? 'Tidak ada barang yang sesuai dengan pencarian' : 'Tidak ada barang request yang ditemukan'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredItems.map((it) => {
                                        const isEnough = it.currentStock >= it.quantity;
                                        const isCompleted = it.status === 'completed';
                                        const isRejected = it.status === 'rejected';

                                        return (
                                            <tr
                                                key={it.id}
                                                className="border-b border-slate-100 transition-colors hover:bg-slate-50/80 last:border-0 dark:border-navy-700 dark:hover:bg-navy-750"
                                            >
                                                <td className="whitespace-nowrap px-5 py-3.5 text-sm text-slate-500 dark:text-navy-300">
                                                    {new Date(it.createdAt).toLocaleDateString('id-ID', {
                                                        day: '2-digit',
                                                        month: 'short',
                                                        year: 'numeric',
                                                    })}
                                                </td>
                                                <td className="whitespace-nowrap px-5 py-3.5">
                                                    <Link
                                                        href={`/dashboard/requests/${it.requestId}`}
                                                        className="font-medium text-primary hover:underline dark:text-accent"
                                                    >
                                                        {it.docNumber}
                                                    </Link>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <div className="font-medium text-slate-800 dark:text-navy-100">
                                                        {it.itemName}
                                                    </div>
                                                    {it.itemSku && (
                                                        <div className="text-xs text-slate-400 dark:text-navy-400">
                                                            SKU: {it.itemSku}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="whitespace-nowrap px-5 py-3.5">
                                                    <span className="font-semibold text-slate-800 dark:text-navy-100">
                                                        {it.quantity}
                                                    </span>{' '}
                                                    <span className="text-xs text-slate-500 dark:text-navy-300">
                                                        {it.unit}
                                                    </span>
                                                </td>
                                                <td className="whitespace-nowrap px-5 py-3.5">
                                                    {isCompleted ? (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-navy-700 dark:text-navy-200">
                                                            <svg className="h-3 w-3 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                            Sudah Diserahkan
                                                        </span>
                                                    ) : isRejected ? (
                                                        <span className="text-xs text-slate-400 dark:text-navy-400 italic">
                                                            -
                                                        </span>
                                                    ) : isEnough ? (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                            {it.currentStock} {it.unit} (Aman)
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" title="Stok gudang kurang dari jumlah yang diminta">
                                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                            </svg>
                                                            {it.currentStock} {it.unit} (Kurang)
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="whitespace-nowrap px-5 py-3.5">
                                                    {getStatusBadge(it.status)}
                                                </td>
                                                <td className="whitespace-nowrap px-5 py-3.5">
                                                    <div className="text-sm font-medium text-slate-700 dark:text-navy-200">
                                                        {it.requesterName}
                                                    </div>
                                                    <div className="text-xs text-slate-400 dark:text-navy-400">
                                                        {it.departmentName}
                                                    </div>
                                                </td>
                                                <td className="whitespace-nowrap px-5 py-3.5 text-center">
                                                    <Link
                                                        href={`/dashboard/requests/${it.requestId}`}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-navy-600 dark:text-navy-200 dark:hover:bg-navy-700"
                                                        title="Lihat Detail Dokumen"
                                                    >
                                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                        Detail
                                                    </Link>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

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
                                                        {(req.items || []).map((item, idx: number) => (
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
                                            <strong>Perhatian:</strong> Anda dapat mengatur jumlah yang diserahkan per request. Jika stok tidak mencukupi, kurangi jumlah serah terima sesuai ketersediaan stok riil.
                                        </div>

                                        {/* Real-time Allocation vs Warehouse Stock summary */}
                                        {Object.keys(allocationSummary).length > 0 && (
                                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-navy-600 dark:bg-navy-800 space-y-2.5">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-navy-200">
                                                        Ringkasan Alokasi vs Stok Gudang
                                                    </h4>
                                                    {hasOverAllocatedItem ? (
                                                        <span className="badge bg-error/15 text-error text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                                                            Stok Tidak Cukup!
                                                        </span>
                                                    ) : (
                                                        <span className="badge bg-success/15 text-success text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                                                            Stok Cukup ✓
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="grid gap-2 sm:grid-cols-2">
                                                    {Object.values(allocationSummary).map((alloc) => {
                                                        const isOver = alloc.totalAllocated > alloc.current_stock;
                                                        return (
                                                            <div
                                                                key={alloc.id}
                                                                className={`flex items-center justify-between rounded-lg p-3 text-xs border ${
                                                                    isOver
                                                                        ? 'border-error/50 bg-error/10 text-error'
                                                                        : 'border-success/40 bg-success/10 text-success'
                                                                }`}
                                                            >
                                                                <div>
                                                                    <span className="font-bold text-slate-800 dark:text-navy-100">{alloc.name}</span>
                                                                    <div className="text-[11px] opacity-80">
                                                                        Stok Tersedia: {alloc.current_stock} {alloc.unit}
                                                                    </div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <div>
                                                                        <span className={`text-base font-extrabold ${isOver ? 'text-error' : 'text-success'}`}>
                                                                            {alloc.totalAllocated}
                                                                        </span>
                                                                        <span className="text-[11px] opacity-75"> / {alloc.current_stock} {alloc.unit}</span>
                                                                    </div>
                                                                    {isOver ? (
                                                                        <div className="text-[10px] font-bold text-error">Kurangi {alloc.totalAllocated - alloc.current_stock} {alloc.unit}!</div>
                                                                    ) : (
                                                                        <div className="text-[10px] font-medium text-success">Sisa nanti: {alloc.current_stock - alloc.totalAllocated} {alloc.unit}</div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <p className="text-[11px] text-slate-500 dark:text-navy-300 italic">
                                                    * Jika yang diserahkan lebih sedikit dari permintaan, jumlah request akan otomatis disesuaikan dengan yang diserahkan.
                                                </p>
                                            </div>
                                        )}

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
                                                    <p className="mb-2 text-xs font-medium uppercase text-slate-500 dark:text-navy-300">Daftar Barang & Jumlah Serah Terima:</p>
                                                    <ul className="space-y-2">
                                                        {(req.items || []).map((item, idx: number) => {
                                                            const itemKey = item.id || `${req.id}_${idx}`;
                                                            const qty = bulkHandoverQuantities[itemKey] !== undefined
                                                                ? bulkHandoverQuantities[itemKey]
                                                                : item.quantity;
                                                            const currentStock = item.item?.current_stock ?? 0;
                                                            const isReduced = qty < item.quantity;

                                                            return (
                                                                <li key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm border-b border-slate-100 pb-2.5 last:border-0 last:pb-0 dark:border-navy-700">
                                                                    <div>
                                                                        <span className="font-medium text-slate-700 dark:text-navy-100">
                                                                            {item.item?.name}
                                                                        </span>
                                                                        <span className="ml-2 text-xs text-slate-400">
                                                                            (Stok: {currentStock} {item.item?.unit || 'pcs'})
                                                                        </span>
                                                                        {isReduced && (
                                                                            <span className="ml-2 text-xs text-primary font-semibold">
                                                                                (Disesuaikan: {qty})
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-2 self-end sm:self-auto">
                                                                        <span className="text-xs text-slate-400">Diserahkan:</span>
                                                                        <input
                                                                            type="number"
                                                                            min="1"
                                                                            max={item.quantity}
                                                                            value={qty}
                                                                            onChange={(e) => {
                                                                                const val = parseInt(e.target.value) || 0;
                                                                                setBulkHandoverQuantities(prev => ({
                                                                                    ...prev,
                                                                                    [itemKey]: Math.min(item.quantity, Math.max(0, val))
                                                                                }));
                                                                            }}
                                                                            className={`w-20 rounded-lg border px-2 py-1 text-center text-sm font-semibold transition-colors ${
                                                                                isReduced
                                                                                    ? 'border-primary text-primary bg-primary/5'
                                                                                    : 'border-slate-300 dark:border-navy-450 dark:bg-navy-700'
                                                                            }`}
                                                                        />
                                                                        <span className="text-xs text-slate-500 font-medium">
                                                                            / {item.quantity} {item.item?.unit || 'pcs'}
                                                                        </span>
                                                                    </div>
                                                                </li>
                                                            );
                                                        })}
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
                                    disabled={processingHandover || loadingHandoverDetails || hasOverAllocatedItem}
                                    className="btn bg-success text-white hover:bg-success-focus disabled:opacity-50"
                                >
                                    {processingHandover ? 'Memproses...' : hasOverAllocatedItem ? 'Alokasi Melebihi Stok' : `Serahkan ${selectedForHandover.size} Request`}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Delete Request Modal (HRGA) */}
            <DeleteRequestModal
                isOpen={!!requestToDelete}
                onClose={() => setRequestToDelete(null)}
                request={requestToDelete}
                onSuccess={(msg) => {
                    toast.success(msg);
                    if (requestToDelete) {
                        setRequests(prev => prev.filter(r => r.id !== requestToDelete.id));
                        setSelectedRequests(prev => {
                            const next = new Set(prev);
                            next.delete(requestToDelete.id);
                            return next;
                        });
                        setSelectedForHandover(prev => {
                            const next = new Set(prev);
                            next.delete(requestToDelete.id);
                            return next;
                        });
                    }
                    setRequestToDelete(null);
                }}
            />
        </div >
    );
}
