'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface DeleteItemInfo {
    quantity: number;
    item?: {
        id?: string;
        name: string;
        sku?: string;
        unit?: string;
        current_stock?: number;
    };
}

interface DeleteRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (message: string) => void;
    request: {
        id: string;
        doc_number: string;
        dept_code?: string;
        department?: { name: string } | null;
        status?: string;
        items?: DeleteItemInfo[];
    } | null;
}

export default function DeleteRequestModal({
    isOpen,
    onClose,
    onSuccess,
    request,
}: DeleteRequestModalProps) {
    const [confirmText, setConfirmText] = useState('');
    const [returnStock, setReturnStock] = useState<boolean>(true);
    const [items, setItems] = useState<DeleteItemInfo[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (!isOpen || !request) {
            setConfirmText('');
            setErrorMsg('');
            setItems([]);
            return;
        }

        // Set default returnStock based on whether items were actually handed over
        const wasHandedOver = request.status === 'completed';
        setReturnStock(wasHandedOver);

        // Load items if not provided or empty
        if (request.items && request.items.length > 0) {
            setItems(request.items);
        } else {
            const fetchItems = async () => {
                setLoadingItems(true);
                try {
                    const { data, error } = await supabase
                        .from('request_items')
                        .select('quantity, item:items(id, name, sku, unit, current_stock)')
                        .eq('request_id', request.id);

                    if (!error && data) {
                        setItems(data as any);
                    }
                } catch (e) {
                    console.error('Error fetching request items:', e);
                } finally {
                    setLoadingItems(false);
                }
            };
            fetchItems();
        }
    }, [isOpen, request]);

    // Handle ESC key press to close modal
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !deleting) {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, deleting]);

    if (!isOpen || !request) return null;

    const isDeleteConfirmed = confirmText.trim().toLowerCase() === 'delete';

    const handleDelete = async () => {
        if (!isDeleteConfirmed || deleting) return;

        setDeleting(true);
        setErrorMsg('');

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const res = await fetch('/api/requests/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    requestId: request.id,
                    returnStock,
                }),
            });

            const result = await res.json();

            if (!res.ok) {
                throw new Error(result.error || 'Gagal menghapus request');
            }

            onSuccess(result.message || `Request ${request.doc_number} berhasil dihapus.`);
            onClose();
        } catch (err: any) {
            console.error('Delete request failed:', err);
            setErrorMsg(err.message || 'Terjadi kesalahan saat menghapus');
        } finally {
            setDeleting(false);
        }
    };

    const isCompleted = request.status === 'completed';

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
            onClick={(e) => {
                if (e.target === e.currentTarget && !deleting) {
                    onClose();
                }
            }}
        >
            <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl dark:bg-navy-700 max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-navy-600 bg-error/5">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-error/15 text-error">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-base font-semibold text-slate-800 dark:text-navy-100">
                                Hapus Request
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-navy-300">
                                {request.doc_number}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={deleting}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-600"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {/* Warning message */}
                    <div className="rounded-lg bg-error/10 border border-error/20 p-3 text-sm text-error">
                        <strong>Perhatian:</strong> Tindakan ini akan menghapus request secara permanen dari sistem.
                    </div>

                    {/* Request info */}
                    <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-navy-800 space-y-1 text-slate-600 dark:text-navy-200">
                        <div className="flex justify-between">
                            <span className="text-slate-400">Departemen:</span>
                            <span className="font-medium">{request.department?.name || request.dept_code || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Status Saat Ini:</span>
                            <span className="font-medium uppercase">{request.status || '-'}</span>
                        </div>
                    </div>

                    {/* Items List */}
                    <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-navy-300 mb-2">
                            Daftar Barang dalam Request:
                        </h4>
                        {loadingItems ? (
                            <div className="text-xs text-slate-400 py-2">Memuat daftar barang...</div>
                        ) : items.length === 0 ? (
                            <div className="text-xs text-slate-400 py-2">Tidak ada barang tercatat</div>
                        ) : (
                            <div className="rounded-lg border border-slate-200 dark:border-navy-600 divide-y divide-slate-100 dark:divide-navy-600 max-h-36 overflow-y-auto">
                                {items.map((it, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2.5 text-sm">
                                        <div>
                                            <span className="font-medium text-slate-700 dark:text-navy-100">
                                                {it.item?.name || 'Barang'}
                                            </span>
                                            {it.item?.sku && (
                                                <span className="text-xs text-slate-400 ml-1.5">({it.item.sku})</span>
                                            )}
                                        </div>
                                        <span className="font-semibold text-slate-700 dark:text-navy-100">
                                            {it.quantity} {it.item?.unit || 'pcs'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Stock Return Question */}
                    <div className="rounded-lg border border-slate-200 p-4 dark:border-navy-600 bg-slate-50 dark:bg-navy-800 space-y-3">
                        <div>
                            <label className="block text-sm font-semibold text-slate-800 dark:text-navy-100">
                                Apakah barang dikembalikan ke stok?
                            </label>
                            <p className="text-xs text-slate-500 dark:text-navy-300 mt-0.5">
                                {isCompleted
                                    ? 'Request ini sudah pernah diserahkan (stok pernah dipotong).'
                                    : 'Catatan: Request ini belum diserahkan (stok belum pernah dipotong sebelumnya).'}
                            </p>
                        </div>

                        <div className="space-y-2 pt-1">
                            <label className="flex items-start gap-3 cursor-pointer p-2.5 rounded-lg border transition-colors border-slate-200 bg-white hover:border-slate-300 dark:border-navy-600 dark:bg-navy-700">
                                <input
                                    type="radio"
                                    name="returnStock"
                                    checked={returnStock === true}
                                    onChange={() => setReturnStock(true)}
                                    className="mt-1 h-4 w-4 text-primary"
                                />
                                <div className="text-xs">
                                    <span className="font-medium text-slate-700 dark:text-navy-100 block">
                                        Ya, kembalikan barang ke stok
                                    </span>
                                    <span className="text-slate-500 dark:text-navy-300">
                                        Jumlah barang di atas akan ditambahkan kembali ke stok gudang.
                                    </span>
                                </div>
                            </label>

                            <label className="flex items-start gap-3 cursor-pointer p-2.5 rounded-lg border transition-colors border-slate-200 bg-white hover:border-slate-300 dark:border-navy-600 dark:bg-navy-700">
                                <input
                                    type="radio"
                                    name="returnStock"
                                    checked={returnStock === false}
                                    onChange={() => setReturnStock(false)}
                                    className="mt-1 h-4 w-4 text-primary"
                                />
                                <div className="text-xs">
                                    <span className="font-medium text-slate-700 dark:text-navy-100 block">
                                        Tidak, jangan ubah stok
                                    </span>
                                    <span className="text-slate-500 dark:text-navy-300">
                                        Hanya hapus data request ini tanpa menambahkan atau mengubah stok gudang.
                                    </span>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Confirmation input */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-navy-100">
                            Ketik <span className="font-bold text-error">delete</span> untuk mengonfirmasi:
                        </label>
                        <input
                            type="text"
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            placeholder='Ketik "delete"'
                            className={`form-input w-full rounded-lg border bg-transparent px-3 py-2 text-sm transition-colors ${
                                confirmText && !isDeleteConfirmed
                                    ? 'border-warning focus:border-warning'
                                    : isDeleteConfirmed
                                    ? 'border-error focus:border-error ring-1 ring-error/20'
                                    : 'border-slate-300 dark:border-navy-450'
                            }`}
                            autoComplete="off"
                            disabled={deleting}
                        />
                    </div>

                    {/* Error display */}
                    {errorMsg && (
                        <div className="rounded-lg bg-error/10 p-3 text-xs text-error">
                            {errorMsg}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4 dark:border-navy-600 bg-slate-50 dark:bg-navy-800">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={deleting}
                        className="btn border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:border-navy-450 dark:text-navy-200"
                    >
                        Batal
                    </button>
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={!isDeleteConfirmed || deleting}
                        className="btn bg-error px-4 py-2 text-sm text-white hover:bg-error-focus disabled:opacity-40 flex items-center gap-2"
                    >
                        {deleting ? (
                            <>
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                Menghapus...
                            </>
                        ) : (
                            <>
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Hapus Request
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
