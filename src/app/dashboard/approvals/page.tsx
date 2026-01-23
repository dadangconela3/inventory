'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Request, RequestStatus, Profile } from '@/types/database';

export default function ApprovalsPage() {
    const [requests, setRequests] = useState<Request[]>([]);
    const [loading, setLoading] = useState(true);
    const [userProfile, setUserProfile] = useState<Profile | null>(null);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Get current user's profile
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('*, department:departments(*)')
                        .eq('id', user.id)
                        .single();
                    setUserProfile(profile);

                    // Fetch pending requests for supervisor's department
                    if (profile?.role === 'supervisor' && profile?.department_id) {
                        const { data: dept } = await supabase
                            .from('departments')
                            .select('code')
                            .eq('id', profile.department_id)
                            .single();

                        if (dept) {
                            // Determine which departments this supervisor can approve
                            let allowedDeptCodes = [dept.code];

                            // Special case: QC supervisor can approve QC, QA, and PP
                            if (dept.code === 'QC') {
                                allowedDeptCodes = ['QC', 'QA', 'PP'];
                            }

                            const { data: pendingRequests } = await supabase
                                .from('requests')
                                .select(`
                  *,
                  requester:profiles!requester_id(full_name, email),
                  department:departments!dept_code(name),
                  items:request_items(
                    quantity,
                    item:items(name, sku, unit)
                  )
                `)
                                .eq('status', 'pending')
                                .in('dept_code', allowedDeptCodes)
                                .order('created_at', { ascending: false });

                            setRequests(pendingRequests || []);
                        }
                    } else {
                        // For demo, show all pending requests if no department assigned
                        const { data: allPending } = await supabase
                            .from('requests')
                            .select(`
                *,
                requester:profiles!requester_id(full_name, email),
                items:request_items(
                  quantity,
                  item:items(name, sku, unit)
                )
              `)
                            .eq('status', 'pending')
                            .order('created_at', { ascending: false });

                        setRequests(allPending || []);
                    }
                }
            } catch (error) {
                console.error('Error fetching data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        // Subscribe to real-time changes for requests
        const channel = supabase
            .channel('approvals-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'requests',
                },
                (payload) => {
                    console.log('Request change detected:', payload);
                    // Refetch data when changes occur
                    fetchData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const handleApprove = async (request: Request) => {
        if (!confirm('Apakah Anda yakin ingin menyetujui request ini?')) return;

        setProcessing(true);
        try {
            const { error } = await supabase
                .from('requests')
                .update({
                    status: 'approved_spv' as RequestStatus,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', request.id);

            if (error) throw error;

            // Create notification for requester
            await supabase.from('notifications').insert({
                user_id: request.requester_id,
                message: `Request ${request.doc_number} telah disetujui oleh Supervisor`,
                link: `/dashboard/requests/${request.id}`,
            });

            // Notify all HRGA users
            const { data: hrgaUsers } = await supabase
                .from('profiles')
                .select('id')
                .eq('role', 'hrga');

            if (hrgaUsers && hrgaUsers.length > 0) {
                const hrgaNotifications = hrgaUsers.map(h => ({
                    user_id: h.id,
                    message: `Request ${request.doc_number} siap dijadwalkan`,
                    link: '/dashboard/batches',
                }));
                await supabase.from('notifications').insert(hrgaNotifications);
            }

            // Remove from list
            setRequests(prev => prev.filter(r => r.id !== request.id));
            alert('Request berhasil disetujui!');
        } catch (error) {
            console.error('Error approving request:', error);
            alert('Gagal menyetujui request. Silakan coba lagi.');
        } finally {
            setProcessing(false);
        }
    };

    const handleRejectClick = (request: Request) => {
        setSelectedRequest(request);
        setRejectionReason('');
        setShowRejectModal(true);
    };

    const handleRejectConfirm = async () => {
        if (!selectedRequest) return;
        if (!rejectionReason.trim()) {
            alert('Alasan penolakan wajib diisi');
            return;
        }

        setProcessing(true);
        try {
            const { error } = await supabase
                .from('requests')
                .update({
                    status: 'rejected' as RequestStatus,
                    rejection_reason: rejectionReason.trim(),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', selectedRequest.id);

            if (error) throw error;

            // Create notification for requester
            await supabase.from('notifications').insert({
                user_id: selectedRequest.requester_id,
                message: `Request ${selectedRequest.doc_number} ditolak: ${rejectionReason}`,
                link: `/dashboard/requests/${selectedRequest.id}`,
            });

            // Remove from list and close modal
            setRequests(prev => prev.filter(r => r.id !== selectedRequest.id));
            setShowRejectModal(false);
            setSelectedRequest(null);
            alert('Request berhasil ditolak.');
        } catch (error) {
            console.error('Error rejecting request:', error);
            alert('Gagal menolak request. Silakan coba lagi.');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-semibold text-slate-700 dark:text-navy-100">
                    Approval Request
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-navy-300">
                    Setujui atau tolak permintaan barang dari departemen Anda
                </p>
            </div>

            {/* Pending Count */}
            <div className="card bg-gradient-to-r from-primary to-primary-focus p-5 text-white dark:from-accent dark:to-accent-focus">
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-sm opacity-90">Request Menunggu Persetujuan</p>
                        <p className="text-3xl font-bold">{requests.length}</p>
                    </div>
                </div>
            </div>

            {/* Requests List */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
            ) : requests.length === 0 ? (
                <div className="card p-12 text-center">
                    <svg className="mx-auto h-16 w-16 text-slate-300 dark:text-navy-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="mt-4 text-lg font-medium text-slate-600 dark:text-navy-100">
                        Tidak ada request yang perlu disetujui
                    </p>
                    <p className="mt-1 text-sm text-slate-400 dark:text-navy-300">
                        Semua request sudah diproses
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {requests.map((request) => (
                        <div key={request.id} className="card p-5">
                            {/* Header */}
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-700 dark:text-navy-100">
                                        {request.doc_number}
                                    </h3>
                                    <p className="text-sm text-slate-500 dark:text-navy-300">
                                        {(request as any).requester?.full_name || (request as any).requester?.email} •
                                        {' '}{new Date(request.created_at).toLocaleDateString('id-ID', {
                                            day: '2-digit',
                                            month: 'long',
                                            year: 'numeric',
                                        })}
                                    </p>
                                </div>
                                <span className="badge bg-warning/10 text-warning">
                                    Menunggu Persetujuan
                                </span>
                            </div>

                            {/* Items */}
                            <div className="mt-4 rounded-lg bg-slate-50 p-4 dark:bg-navy-600">
                                <h4 className="mb-2 text-sm font-medium text-slate-600 dark:text-navy-200">
                                    Daftar Barang:
                                </h4>
                                <ul className="space-y-1">
                                    {((request as any).items || []).map((ri: any, idx: number) => (
                                        <li key={idx} className="flex items-center text-sm text-slate-600 dark:text-navy-200">
                                            <span className="mr-2 h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-navy-300" />
                                            {ri.item?.name} ({ri.item?.sku}) - {ri.quantity} {ri.item?.unit}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Actions */}
                            <div className="mt-4 flex justify-end gap-3">
                                <button
                                    onClick={() => handleRejectClick(request)}
                                    disabled={processing}
                                    className="btn border border-error text-error hover:bg-error hover:text-white disabled:opacity-50"
                                >
                                    <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    Tolak
                                </button>
                                <button
                                    onClick={() => handleApprove(request)}
                                    disabled={processing}
                                    className="btn bg-success text-white hover:bg-success-focus disabled:opacity-50"
                                >
                                    <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Setujui
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Reject Modal */}
            {showRejectModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-navy-700">
                        <h3 className="text-lg font-semibold text-slate-700 dark:text-navy-100">
                            Tolak Request
                        </h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-navy-300">
                            Berikan alasan penolakan untuk request {selectedRequest?.doc_number}
                        </p>

                        <div className="mt-4">
                            <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                Alasan Penolakan <span className="text-error">*</span>
                            </label>
                            <textarea
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                rows={4}
                                className="form-textarea w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 placeholder:text-slate-400/70 hover:border-slate-400 focus:border-primary dark:border-navy-450 dark:hover:border-navy-400 dark:focus:border-accent"
                                placeholder="Masukkan alasan penolakan..."
                            />
                        </div>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={() => setShowRejectModal(false)}
                                disabled={processing}
                                className="btn border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-450 dark:text-navy-200 dark:hover:bg-navy-500"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleRejectConfirm}
                                disabled={processing || !rejectionReason.trim()}
                                className="btn bg-error text-white hover:bg-error-focus disabled:opacity-50"
                            >
                                {processing ? 'Memproses...' : 'Konfirmasi Tolak'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
