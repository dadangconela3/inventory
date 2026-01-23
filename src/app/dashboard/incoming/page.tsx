'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { IncomingStock, IncomingStockItem, Item } from '@/types/database';

interface IncomingWithItems extends IncomingStock {
    items?: (IncomingStockItem & { item?: Item })[];
    creator?: { full_name: string };
}

export default function IncomingStockPage() {
    const [incomingList, setIncomingList] = useState<IncomingWithItems[]>([]);
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedIncoming, setSelectedIncoming] = useState<IncomingWithItems | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Form state
    const [formData, setFormData] = useState({
        po_number: '',
        incoming_date: new Date().toISOString().split('T')[0],
        notes: '',
    });

    const [selectedItems, setSelectedItems] = useState<{ item_id: string; quantity: number }[]>([]);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch incoming stock with items
            const { data: incoming } = await supabase
                .from('incoming_stock')
                .select(`
                    *,
                    creator:profiles!created_by(full_name),
                    items:incoming_stock_items(
                        *,
                        item:items(*)
                    )
                `)
                .order('incoming_date', { ascending: false });

            setIncomingList(incoming || []);

            // Fetch all items for dropdown
            const { data: itemsData } = await supabase
                .from('items')
                .select('*')
                .order('name');

            setItems(itemsData || []);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const openAddModal = () => {
        setFormData({
            po_number: '',
            incoming_date: new Date().toISOString().split('T')[0],
            notes: '',
        });
        setSelectedItems([]);
        setShowModal(true);
    };

    const addItemRow = () => {
        setSelectedItems([...selectedItems, { item_id: '', quantity: 1 }]);
    };

    const removeItemRow = (index: number) => {
        setSelectedItems(selectedItems.filter((_, i) => i !== index));
    };

    const updateItemRow = (index: number, field: 'item_id' | 'quantity', value: string | number) => {
        const updated = [...selectedItems];
        updated[index] = { ...updated[index], [field]: value };
        setSelectedItems(updated);
    };

    const handleSubmit = async () => {
        if (!formData.po_number || !formData.incoming_date) {
            alert('PO Number dan Tanggal wajib diisi');
            return;
        }

        if (selectedItems.length === 0) {
            alert('Tambahkan minimal satu barang');
            return;
        }

        if (selectedItems.some(item => !item.item_id || item.quantity <= 0)) {
            alert('Pastikan semua barang dipilih dan quantity > 0');
            return;
        }

        setSubmitting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('User not authenticated');

            // Create incoming stock
            const { data: incoming, error: incomingError } = await supabase
                .from('incoming_stock')
                .insert({
                    po_number: formData.po_number,
                    incoming_date: new Date(formData.incoming_date).toISOString(),
                    notes: formData.notes || null,
                    created_by: user.id,
                })
                .select()
                .single();

            if (incomingError) throw incomingError;

            // Insert items
            const itemsToInsert = selectedItems.map(item => ({
                incoming_id: incoming.id,
                item_id: item.item_id,
                quantity: item.quantity,
            }));

            const { error: itemsError } = await supabase
                .from('incoming_stock_items')
                .insert(itemsToInsert);

            if (itemsError) throw itemsError;

            alert('Barang masuk berhasil dicatat!');
            setShowModal(false);
            fetchData();
        } catch (error: any) {
            console.error('Error creating incoming:', error);
            if (error.message?.includes('duplicate')) {
                alert('PO Number sudah ada. Gunakan PO Number yang berbeda.');
            } else {
                alert(`Gagal menyimpan: ${error.message}`);
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (incoming: IncomingWithItems) => {
        if (!confirm(`Hapus incoming stock PO: ${incoming.po_number}?\nStok akan dikurangi kembali.`)) return;

        try {
            const { error } = await supabase
                .from('incoming_stock')
                .delete()
                .eq('id', incoming.id);

            if (error) throw error;

            alert('Incoming stock berhasil dihapus!');
            fetchData();
        } catch (error) {
            console.error('Error deleting incoming:', error);
            alert('Gagal menghapus incoming stock');
        }
    };

    const openDetailModal = (incoming: IncomingWithItems) => {
        setSelectedIncoming(incoming);
        setShowDetailModal(true);
    };

    const filteredIncoming = incomingList.filter(inc =>
        inc.po_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inc.notes || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalItemsThisMonth = incomingList
        .filter(inc => new Date(inc.incoming_date).getMonth() === new Date().getMonth())
        .reduce((sum, inc) => sum + (inc.items?.reduce((s, i) => s + i.quantity, 0) || 0), 0);

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-700 dark:text-navy-100">
                        Barang Masuk
                    </h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-navy-300">
                        Kelola incoming stock dengan PO Number
                    </p>
                </div>

                <button
                    onClick={openAddModal}
                    className="btn bg-primary text-white hover:bg-primary-focus dark:bg-accent dark:hover:bg-accent-focus"
                >
                    <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Tambah Incoming
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="card p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-500 dark:text-navy-300">Total Incoming</p>
                            <p className="mt-1 text-2xl font-semibold text-slate-700 dark:text-navy-100">
                                {incomingList.length}
                            </p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                            <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                    </div>
                </div>

                <div className="card p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-500 dark:text-navy-300">Items Bulan Ini</p>
                            <p className="mt-1 text-2xl font-semibold text-slate-700 dark:text-navy-100">
                                {totalItemsThisMonth.toLocaleString()}
                            </p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/10">
                            <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="card p-4">
                <div className="relative">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Cari PO Number atau notes..."
                        className="form-input w-full rounded-lg border border-slate-300 bg-transparent py-2 pl-10 pr-4 placeholder:text-slate-400/70 dark:border-navy-450"
                    />
                    <svg className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>

            {/* Incoming List */}
            <div className="card">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-150 dark:border-navy-600">
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    PO Number
                                </th>
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Tanggal
                                </th>
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Total Items
                                </th>
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Dibuat Oleh
                                </th>
                                <th className="px-5 py-4 text-center text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Aksi
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-5 py-12 text-center">
                                        <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                    </td>
                                </tr>
                            ) : filteredIncoming.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-5 py-12 text-center text-slate-400 dark:text-navy-300">
                                        Tidak ada data incoming stock
                                    </td>
                                </tr>
                            ) : (
                                filteredIncoming.map((incoming) => (
                                    <tr key={incoming.id} className="border-b border-slate-100 last:border-0 dark:border-navy-700">
                                        <td className="px-5 py-4">
                                            <span className="font-medium text-slate-700 dark:text-navy-100">
                                                {incoming.po_number}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-600 dark:text-navy-200">
                                            {new Date(incoming.incoming_date).toLocaleDateString('id-ID')}
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-600 dark:text-navy-200">
                                            {incoming.items?.reduce((sum, item) => sum + item.quantity, 0) || 0} items
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-600 dark:text-navy-200">
                                            {incoming.creator?.full_name || '-'}
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => openDetailModal(incoming)}
                                                    className="rounded-lg p-2 text-info hover:bg-info/10"
                                                    title="Lihat Detail"
                                                >
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(incoming)}
                                                    className="rounded-lg p-2 text-error hover:bg-error/10"
                                                    title="Hapus"
                                                >
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-3xl rounded-lg bg-white p-6 shadow-xl dark:bg-navy-700 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-semibold text-slate-700 dark:text-navy-100">
                            Tambah Barang Masuk
                        </h3>

                        <div className="mt-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                        PO Number <span className="text-error">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.po_number}
                                        onChange={(e) => setFormData({ ...formData, po_number: e.target.value })}
                                        placeholder="PO-2024-001"
                                        className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                        Tanggal <span className="text-error">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.incoming_date}
                                        onChange={(e) => setFormData({ ...formData, incoming_date: e.target.value })}
                                        className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                    Catatan
                                </label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    rows={2}
                                    className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium text-slate-600 dark:text-navy-100">
                                        Daftar Barang <span className="text-error">*</span>
                                    </label>
                                    <button
                                        onClick={addItemRow}
                                        className="btn bg-info text-white hover:bg-info-focus"
                                    >
                                        <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Tambah Barang
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {selectedItems.map((item, index) => (
                                        <div key={index} className="flex gap-2">
                                            <select
                                                value={item.item_id}
                                                onChange={(e) => updateItemRow(index, 'item_id', e.target.value)}
                                                className="form-select flex-1 rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                            >
                                                <option value="">Pilih Barang</option>
                                                {items.map((i) => (
                                                    <option key={i.id} value={i.id}>
                                                        {i.name} ({i.sku})
                                                    </option>
                                                ))}
                                            </select>
                                            <input
                                                type="number"
                                                value={item.quantity}
                                                onChange={(e) => updateItemRow(index, 'quantity', parseInt(e.target.value) || 0)}
                                                min="1"
                                                className="form-input w-24 rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                            />
                                            <button
                                                onClick={() => removeItemRow(index)}
                                                className="rounded-lg p-2 text-error hover:bg-error/10"
                                            >
                                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                                    {selectedItems.length === 0 && (
                                        <p className="text-sm text-slate-400 dark:text-navy-300">
                                            Belum ada barang. Klik "Tambah Barang" untuk menambahkan.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={() => setShowModal(false)}
                                disabled={submitting}
                                className="btn border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-450 dark:text-navy-200 dark:hover:bg-navy-500"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="btn bg-primary text-white hover:bg-primary-focus disabled:opacity-50 dark:bg-accent dark:hover:bg-accent-focus"
                            >
                                {submitting ? 'Menyimpan...' : 'Simpan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Modal */}
            {showDetailModal && selectedIncoming && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl dark:bg-navy-700">
                        <h3 className="text-lg font-semibold text-slate-700 dark:text-navy-100">
                            Detail Incoming Stock
                        </h3>

                        <div className="mt-4 space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-navy-300">PO Number</p>
                                    <p className="font-medium text-slate-700 dark:text-navy-100">{selectedIncoming.po_number}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-navy-300">Tanggal</p>
                                    <p className="font-medium text-slate-700 dark:text-navy-100">
                                        {new Date(selectedIncoming.incoming_date).toLocaleDateString('id-ID')}
                                    </p>
                                </div>
                            </div>

                            {selectedIncoming.notes && (
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-navy-300">Catatan</p>
                                    <p className="text-slate-700 dark:text-navy-100">{selectedIncoming.notes}</p>
                                </div>
                            )}

                            <div>
                                <p className="mb-2 text-sm font-medium text-slate-600 dark:text-navy-100">Daftar Barang</p>
                                <div className="rounded-lg border border-slate-200 dark:border-navy-600">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-slate-200 bg-slate-50 dark:border-navy-600 dark:bg-navy-800">
                                                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">Barang</th>
                                                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">SKU</th>
                                                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">Qty</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedIncoming.items?.map((item) => (
                                                <tr key={item.id} className="border-b border-slate-100 last:border-0 dark:border-navy-700">
                                                    <td className="px-4 py-2 text-sm text-slate-700 dark:text-navy-100">{item.item?.name}</td>
                                                    <td className="px-4 py-2 text-sm text-slate-600 dark:text-navy-200">{item.item?.sku}</td>
                                                    <td className="px-4 py-2 text-right text-sm font-medium text-slate-700 dark:text-navy-100">
                                                        {item.quantity} {item.item?.unit}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={() => setShowDetailModal(false)}
                                className="btn border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-450 dark:text-navy-200"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
