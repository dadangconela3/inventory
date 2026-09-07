'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { RequestStatus, Profile } from '@/types/database';
import SignaturePad from '@/components/ui/SignaturePad';
import DeleteRequestModal from '@/components/requests/DeleteRequestModal';
import { showColoredToast } from '@/lib/toast';

interface RequestWithDetails {
    id: string;
    doc_number: string;
    requester_id: string;
    dept_code: string;
    status: RequestStatus;
    rejection_reason: string | null;
    batch_id: string | null;
    admin_signature_url: string | null;
    spv_signature_url: string | null;
    created_at: string;
    updated_at: string;
    requester?: { full_name: string; email: string };
    department?: { name: string };
    items?: {
        item_id?: string;
        quantity: number;
        item: { id?: string; name: string; sku: string; unit: string; current_stock?: number };
    }[];
}

export default function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const router = useRouter();
    const [request, setRequest] = useState<RequestWithDetails | null>(null);
    const [userProfile, setUserProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [showSignModal, setShowSignModal] = useState(false);
    const [signatureType, setSignatureType] = useState<'admin' | 'spv'>('admin');
    const [processing, setProcessing] = useState(false);

    // Handover state
    const [showHandoverModal, setShowHandoverModal] = useState(false);
    const [handoverNote, setHandoverNote] = useState('');
    const [handoverQuantities, setHandoverQuantities] = useState<Record<number, number>>({});

    // Delete modal state (HRGA only)
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Get current user profile
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', user.id)
                        .single();
                    setUserProfile(profile);
                }

                // Fetch request details
                const { data, error } = await supabase
                    .from('requests')
                    .select(`
            *,
            requester:profiles!requester_id(full_name, email),
            department:departments!dept_code(name),
            items:request_items(
              id,
              quantity,
              item_id,
              item:items(id, name, sku, unit, current_stock)
            )
          `)
                    .eq('id', resolvedParams.id)
                    .single();

                if (error) throw error;
                setRequest(data);
            } catch (error) {
                console.error('Error fetching request:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [resolvedParams.id]);

    const getStatusBadge = (status: RequestStatus) => {
        const styles: Record<RequestStatus, string> = {
            pending: 'bg-warning/10 text-warning',
            approved_spv: 'bg-success/10 text-success',
            rejected: 'bg-error/10 text-error',
            scheduled: 'bg-info/10 text-info',
            completed: 'bg-slate-100 text-slate-600 dark:bg-navy-500 dark:text-navy-100',
        };

        const labels: Record<RequestStatus, string> = {
            pending: 'Menunggu Approval',
            approved_spv: 'Disetujui Supervisor',
            rejected: 'Ditolak',
            scheduled: 'Terjadwal',
            completed: 'Selesai',
        };

        return (
            <span className={`badge text-sm ${styles[status]}`}>
                {labels[status]}
            </span>
        );
    };

    const handleOpenSignModal = (type: 'admin' | 'spv') => {
        setSignatureType(type);
        setShowSignModal(true);
    };

    const handleSaveSignature = async (signatureData: string) => {
        if (!request) return;

        setProcessing(true);
        try {
            // Upload signature to Supabase Storage
            const fileName = `signatures/${request.id}_${signatureType}_${Date.now()}.png`;
            const base64Data = signatureData.replace(/^data:image\/png;base64,/, '');
            const { error: uploadError } = await supabase.storage
                .from('inventory')
                .upload(fileName, Buffer.from(base64Data, 'base64'), {
                    contentType: 'image/png',
                });

            // If storage bucket doesn't exist, skip upload and store data URL directly
            const signatureUrl = uploadError ? signatureData : fileName;

            // Update request with signature
            const updateData: Partial<RequestWithDetails> = {};
            if (signatureType === 'admin') {
                updateData.admin_signature_url = signatureUrl;
            } else {
                updateData.spv_signature_url = signatureUrl;
                updateData.status = 'approved_spv';
                updateData.updated_at = new Date().toISOString();
            }

            const { error } = await supabase
                .from('requests')
                .update(updateData)
                .eq('id', request.id);

            if (error) throw error;

            // Refresh request data
            setRequest(prev => prev ? { ...prev, ...updateData } : null);
            setShowSignModal(false);
            alert('Tanda tangan berhasil disimpan!');
        } catch (error) {
            console.error('Error saving signature:', error);
            alert('Gagal menyimpan tanda tangan');
        } finally {
            setProcessing(false);
        }
    };

    // Initialize handover quantities from request items
    const openHandoverModal = () => {
        if (request?.items) {
            const quantities: Record<number, number> = {};
            request.items.forEach((item, index) => {
                quantities[index] = item.quantity;
            });
            setHandoverQuantities(quantities);
        }
        setHandoverNote('');
        setShowHandoverModal(true);
    };

    // Handle item handover
    const handleHandover = async () => {
        if (!request) return;

        setProcessing(true);
        try {
            const handoverItems = (request.items || []).map((reqItem, idx) => {
                const quantityToDeduct = handoverQuantities[idx] !== undefined ? handoverQuantities[idx] : reqItem.quantity;
                return {
                    requestItemId: (reqItem as any).id,
                    itemId: (reqItem as any).item_id || (reqItem as any).item?.id,
                    actualQuantity: Number(quantityToDeduct)
                };
            });

            // Validate that quantities are valid
            for (const it of handoverItems) {
                if (!it.actualQuantity || it.actualQuantity <= 0) {
                    showColoredToast('warning', 'Jumlah barang yang diserahkan minimal 1');
                    setProcessing(false);
                    return;
                }
            }

            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const response = await fetch('/api/requests/handover', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    handovers: [
                        {
                            requestId: request.id,
                            items: handoverItems
                        }
                    ]
                })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Gagal menyerahkan barang');
            }

            // Refresh request data with updated quantities
            setRequest(prev => prev ? {
                ...prev,
                status: 'completed' as RequestStatus,
                items: prev.items?.map((it, idx) => ({
                    ...it,
                    quantity: handoverQuantities[idx] !== undefined ? Number(handoverQuantities[idx]) : it.quantity
                }))
            } : null);
            setShowHandoverModal(false);
            showColoredToast('success', 'Barang berhasil diserahkan dan kuantitas request diperbarui!');
        } catch (error: any) {
            console.error('Error during handover:', error);
            showColoredToast('error', error?.message || 'Gagal menyerahkan barang.');
        } finally {
            setProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    if (!request) {
        return (
            <div className="card p-12 text-center">
                <p className="text-lg text-slate-600 dark:text-navy-200">
                    Request tidak ditemukan
                </p>
                <Link href="/dashboard/requests" className="btn mt-4 bg-primary text-white">
                    Kembali ke Daftar
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <div className="flex items-center gap-3">
                        <Link
                            href="/dashboard/requests"
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-navy-300 dark:hover:bg-navy-600"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <h1 className="text-2xl font-semibold text-slate-700 dark:text-navy-100">
                            {request.doc_number}
                        </h1>
                        {getStatusBadge(request.status)}
                    </div>
                    <p className="ml-11 mt-1 text-sm text-slate-500 dark:text-navy-300">
                        Dibuat: {new Date(request.created_at).toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                    </p>
                </div>

                {/* HRGA Delete Action */}
                {userProfile?.role === 'hrga' && (
                    <button
                        onClick={() => setShowDeleteModal(true)}
                        className="btn border border-error/50 text-error hover:bg-error hover:text-white transition-colors flex items-center gap-1.5 self-start sm:self-auto"
                        title="Hapus Request (HRGA)"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Hapus Request
                    </button>
                )}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Main Info */}
                <div className="card p-6 lg:col-span-2">
                    <h3 className="mb-4 text-lg font-medium text-slate-700 dark:text-navy-100">
                        Informasi Request
                    </h3>

                    <div className="mb-6 grid gap-4 sm:grid-cols-2">
                        <div>
                            <p className="text-sm text-slate-500 dark:text-navy-300">Departemen</p>
                            <p className="font-medium text-slate-700 dark:text-navy-100">
                                {request.department?.name || request.dept_code}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-slate-500 dark:text-navy-300">Pemohon</p>
                            <p className="font-medium text-slate-700 dark:text-navy-100">
                                {request.requester?.full_name || request.requester?.email || '-'}
                            </p>
                        </div>
                    </div>

                    <h4 className="mb-3 font-medium text-slate-600 dark:text-navy-200">
                        Daftar Barang
                    </h4>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-navy-500">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 dark:border-navy-500 dark:bg-navy-600">
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                        Barang
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                        SKU
                                    </th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                        Qty
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                        Satuan
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {(request.items || []).map((item, idx) => (
                                    <tr key={idx} className="border-b border-slate-100 last:border-0 dark:border-navy-700">
                                        <td className="px-4 py-3 font-medium text-slate-700 dark:text-navy-100">
                                            {item.item?.name}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-navy-200">
                                            {item.item?.sku}
                                        </td>
                                        <td className="px-4 py-3 text-center text-slate-700 dark:text-navy-100">
                                            {item.quantity}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-navy-200">
                                            {item.item?.unit}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Rejection Reason */}
                    {request.status === 'rejected' && request.rejection_reason && (
                        <div className="mt-4 rounded-lg bg-error/10 p-4">
                            <p className="text-sm font-medium text-error">Alasan Penolakan:</p>
                            <p className="mt-1 text-sm text-slate-700 dark:text-navy-100">
                                {request.rejection_reason}
                            </p>
                        </div>
                    )}

                    {/* Handover Button for HRGA */}
                    {userProfile?.role === 'hrga' && (request.status === 'scheduled' || request.status === 'approved_spv') && (
                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={openHandoverModal}
                                className="btn bg-success text-white hover:bg-success-focus"
                            >
                                <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Serahkan Barang
                            </button>
                        </div>
                    )}

                    {/* Completed Badge */}
                    {request.status === 'completed' && (
                        <div className="mt-6 rounded-lg bg-success/10 p-4">
                            <div className="flex items-center gap-2">
                                <svg className="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="font-medium text-success">Barang sudah diserahkan</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Signatures */}
                <div className="card p-6">
                    <h3 className="mb-4 text-lg font-medium text-slate-700 dark:text-navy-100">
                        Tanda Tangan
                    </h3>

                    <div className="space-y-4">
                        {/* Admin Signature */}
                        <div className="rounded-lg border border-slate-200 p-4 dark:border-navy-500">
                            <p className="mb-2 text-sm font-medium text-slate-600 dark:text-navy-200">
                                Admin
                            </p>
                            {request.admin_signature_url ? (
                                <img
                                    src={request.admin_signature_url}
                                    alt="Tanda tangan Admin"
                                    className="max-h-24 rounded border"
                                />
                            ) : (
                                <>
                                    {userProfile?.role?.includes('admin') && request.status === 'pending' ? (
                                        <button
                                            onClick={() => handleOpenSignModal('admin')}
                                            className="btn border border-primary text-primary hover:bg-primary hover:text-white"
                                        >
                                            Tanda Tangani
                                        </button>
                                    ) : (
                                        <p className="text-sm italic text-slate-400 dark:text-navy-300">
                                            Belum ditandatangani
                                        </p>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Supervisor Signature */}
                        <div className="rounded-lg border border-slate-200 p-4 dark:border-navy-500">
                            <p className="mb-2 text-sm font-medium text-slate-600 dark:text-navy-200">
                                Supervisor
                            </p>
                            {request.spv_signature_url ? (
                                <img
                                    src={request.spv_signature_url}
                                    alt="Tanda tangan Supervisor"
                                    className="max-h-24 rounded border"
                                />
                            ) : (
                                <>
                                    {userProfile?.role === 'supervisor' && request.status === 'pending' ? (
                                        <button
                                            onClick={() => handleOpenSignModal('spv')}
                                            className="btn border border-primary text-primary hover:bg-primary hover:text-white"
                                        >
                                            Tanda Tangani & Setujui
                                        </button>
                                    ) : (
                                        <p className="text-sm italic text-slate-400 dark:text-navy-300">
                                            Belum ditandatangani
                                        </p>
                                    )}
                                </>
                            )}
                        </div>

                        {/* HRGA Signature (for batches) */}
                        <div className="rounded-lg border border-slate-200 p-4 dark:border-navy-500">
                            <p className="mb-2 text-sm font-medium text-slate-600 dark:text-navy-200">
                                HRGA
                            </p>
                            <p className="text-sm italic text-slate-400 dark:text-navy-300">
                                {request.status === 'completed' ? 'Sudah ditandatangani di batch' : 'Menunggu jadwal batch'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Signature Modal */}
            {showSignModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-navy-700">
                        <h3 className="mb-4 text-lg font-semibold text-slate-700 dark:text-navy-100">
                            {signatureType === 'admin' ? 'Tanda Tangan Admin' : 'Tanda Tangan Supervisor'}
                        </h3>

                        <SignaturePad
                            onSave={handleSaveSignature}
                            width={400}
                            height={200}
                            label="Gambar tanda tangan di bawah"
                        />

                        <div className="mt-4 flex justify-end">
                            <button
                                onClick={() => setShowSignModal(false)}
                                disabled={processing}
                                className="btn border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-450 dark:text-navy-200"
                            >
                                Batal
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Handover Modal */}
            {showHandoverModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-navy-700">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-slate-700 dark:text-navy-100">
                                Serah Terima Barang
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowHandoverModal(false)}
                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="mb-4 rounded-lg bg-warning/10 p-3 text-sm text-warning">
                            <strong>Perhatian:</strong> Setelah diserahkan, stok barang akan dikurangi otomatis.
                        </div>

                        {/* Items to handover */}
                        <div className="mb-4">
                            <h4 className="mb-2 text-sm font-medium text-slate-600 dark:text-navy-200">
                                Barang yang Diserahkan
                            </h4>
                            <div className="space-y-2">
                                {request?.items?.map((item, index) => {
                                    const currentStock = item.item?.current_stock ?? 0;
                                    const qty = handoverQuantities[index] !== undefined ? handoverQuantities[index] : item.quantity;
                                    const isShort = currentStock < qty;
                                    return (
                                        <div key={index} className={`flex items-center justify-between rounded-lg border p-3 ${isShort ? 'border-error/40 bg-error/5 dark:border-error/30' : 'border-slate-200 dark:border-navy-500'}`}>
                                            <div>
                                                <p className="font-medium text-slate-700 dark:text-navy-100">
                                                    {item.item.name}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    {item.item.sku} • <span className={isShort ? 'text-error font-semibold' : 'text-slate-500'}>Stok Gudang: {currentStock} {item.item.unit}{isShort ? ' (Kurang!)' : ''}</span>
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max={item.quantity}
                                                    value={qty}
                                                    onChange={(e) => setHandoverQuantities({
                                                        ...handoverQuantities,
                                                        [index]: Math.min(item.quantity, parseInt(e.target.value) || 0)
                                                    })}
                                                    className={`w-20 rounded-lg border px-2 py-1 text-center text-sm ${isShort ? 'border-error text-error' : 'border-slate-300 dark:border-navy-450 dark:bg-navy-600'}`}
                                                />
                                                <span className="text-sm text-slate-500">
                                                    / {item.quantity} {item.item.unit}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Note */}
                        <div className="mb-4">
                            <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                Catatan (opsional)
                            </label>
                            <textarea
                                value={handoverNote}
                                onChange={(e) => setHandoverNote(e.target.value)}
                                className="form-textarea w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-navy-450"
                                rows={2}
                                placeholder="Catatan tambahan..."
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowHandoverModal(false)}
                                disabled={processing}
                                className="btn border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-450 dark:text-navy-200"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleHandover}
                                disabled={processing}
                                className="btn bg-success text-white hover:bg-success-focus disabled:opacity-50"
                            >
                                {processing ? 'Memproses...' : 'Konfirmasi Serah Terima'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Request Modal (HRGA) */}
            <DeleteRequestModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                request={request}
                onSuccess={(msg) => {
                    alert(msg);
                    router.push('/dashboard/requests');
                }}
            />
        </div>
    );
}
