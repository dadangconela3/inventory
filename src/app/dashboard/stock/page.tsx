'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Item } from '@/types/database';

export default function StockManagementPage() {
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<Item | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        sku: '',
        unit: 'pcs',
        current_stock: 0,
        min_stock: 0,
    });

    useEffect(() => {
        fetchItems();
    }, []);

    const fetchItems = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('items')
                .select('*')
                .order('name');

            if (error) throw error;
            setItems(data || []);
        } catch (error) {
            console.error('Error fetching items:', error);
        } finally {
            setLoading(false);
        }
    };

    const openAddModal = () => {
        setEditingItem(null);
        setFormData({
            name: '',
            sku: '',
            unit: 'pcs',
            current_stock: 0,
            min_stock: 0,
        });
        setShowModal(true);
    };

    const openEditModal = (item: Item) => {
        setEditingItem(item);
        setFormData({
            name: item.name,
            sku: item.sku,
            unit: item.unit,
            current_stock: item.current_stock,
            min_stock: item.min_stock,
        });
        setShowModal(true);
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.sku) {
            alert('Nama dan SKU wajib diisi');
            return;
        }

        setSubmitting(true);
        try {
            if (editingItem) {
                // Update existing item
                const { error } = await supabase
                    .from('items')
                    .update(formData)
                    .eq('id', editingItem.id);

                if (error) throw error;
            } else {
                // Create new item
                const { error } = await supabase
                    .from('items')
                    .insert(formData);

                if (error) throw error;
            }

            setShowModal(false);
            fetchItems();
        } catch (error: any) {
            console.error('Error saving item:', error);
            alert(error.message || 'Gagal menyimpan barang');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (item: Item) => {
        if (!confirm(`Hapus barang "${item.name}"?`)) return;

        try {
            const { error } = await supabase
                .from('items')
                .delete()
                .eq('id', item.id);

            if (error) throw error;
            fetchItems();
        } catch (error) {
            console.error('Error deleting item:', error);
            alert('Gagal menghapus barang');
        }
    };

    const filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const lowStockItems = items.filter(item => item.current_stock <= item.min_stock);

    const toggleSelectItem = (itemId: string) => {
        const newSet = new Set(selectedItems);
        if (newSet.has(itemId)) {
            newSet.delete(itemId);
        } else {
            newSet.add(itemId);
        }
        setSelectedItems(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedItems.size === filteredItems.length) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(filteredItems.map(i => i.id)));
        }
    };

    const handleBatchDelete = async () => {
        if (selectedItems.size === 0) return;

        if (!confirm(`Apakah Anda yakin ingin menghapus ${selectedItems.size} barang?`)) return;

        setSubmitting(true);
        try {
            const { error } = await supabase
                .from('items')
                .delete()
                .in('id', Array.from(selectedItems));

            if (error) throw error;

            alert(`${selectedItems.size} barang berhasil dihapus!`);
            setSelectedItems(new Set());
            fetchItems();
        } catch (error) {
            console.error('Error batch deleting items:', error);
            alert('Gagal menghapus barang');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-700 dark:text-navy-100">
                        Master Stok Barang
                    </h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-navy-300">
                        Kelola daftar barang dan stok
                    </p>
                </div>

                <button
                    onClick={openAddModal}
                    className="btn bg-primary text-white hover:bg-primary-focus dark:bg-accent dark:hover:bg-accent-focus"
                >
                    <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Tambah Barang
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="card p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-500 dark:text-navy-300">Total Jenis Barang</p>
                            <p className="mt-1 text-2xl font-semibold text-slate-700 dark:text-navy-100">
                                {items.length}
                            </p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                            <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                        </div>
                    </div>
                </div>

                <div className="card p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-500 dark:text-navy-300">Total Stok</p>
                            <p className="mt-1 text-2xl font-semibold text-slate-700 dark:text-navy-100">
                                {items.reduce((sum, item) => sum + item.current_stock, 0).toLocaleString()}
                            </p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/10">
                            <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                </div>

                <div className="card p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-500 dark:text-navy-300">Stok Menipis</p>
                            <p className="mt-1 text-2xl font-semibold text-slate-700 dark:text-navy-100">
                                {lowStockItems.length}
                            </p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-error/10">
                            <svg className="h-6 w-6 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="card p-4">
                <div className="flex items-center justify-between gap-4">
                    {selectedItems.size > 0 && (
                        <button
                            onClick={handleBatchDelete}
                            disabled={submitting}
                            className="btn bg-error text-white hover:bg-error-focus disabled:opacity-50"
                        >
                            <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Hapus ({selectedItems.size})
                        </button>
                    )}
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Cari berdasarkan nama atau SKU..."
                            className="form-input w-full rounded-lg border border-slate-300 bg-transparent py-2 pl-10 pr-4 placeholder:text-slate-400/70 dark:border-navy-450"
                        />
                        <svg className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* Items Table */}
            <div className="card">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-150 dark:border-navy-600">
                                <th className="px-5 py-4 text-left">
                                    <input
                                        type="checkbox"
                                        checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                                        onChange={toggleSelectAll}
                                        className="h-4 w-4 rounded border-2 border-slate-300 text-primary transition-all hover:border-primary focus:ring-2 focus:ring-primary/20 focus:ring-offset-0 checked:border-primary checked:bg-primary dark:border-navy-450 dark:checked:border-accent dark:checked:bg-accent"
                                    />
                                </th>
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Nama Barang
                                </th>
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    SKU
                                </th>
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Stok
                                </th>
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Min. Stok
                                </th>
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Satuan
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
                                        <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                    </td>
                                </tr>
                            ) : filteredItems.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-5 py-12 text-center text-slate-400 dark:text-navy-300">
                                        Tidak ada barang ditemukan
                                    </td>
                                </tr>
                            ) : (
                                filteredItems.map((item) => (
                                    <tr key={item.id} className={`border-b border-slate-100 last:border-0 dark:border-navy-700 ${selectedItems.has(item.id) ? 'bg-primary/5 dark:bg-accent/5' : ''}`}>
                                        <td className="px-5 py-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.has(item.id)}
                                                onChange={() => toggleSelectItem(item.id)}
                                                className="h-4 w-4 rounded border-2 border-slate-300 text-primary transition-all hover:border-primary focus:ring-2 focus:ring-primary/20 focus:ring-offset-0 checked:border-primary checked:bg-primary dark:border-navy-450 dark:checked:border-accent dark:checked:bg-accent"
                                            />
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className="font-medium text-slate-700 dark:text-navy-100">
                                                {item.name}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-600 dark:text-navy-200">
                                            {item.sku}
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className={`font-medium ${item.current_stock <= item.min_stock
                                                ? 'text-error'
                                                : 'text-slate-700 dark:text-navy-100'
                                                }`}>
                                                {item.current_stock.toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-500 dark:text-navy-300">
                                            {item.min_stock}
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-600 dark:text-navy-200">
                                            {item.unit}
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => openEditModal(item)}
                                                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-navy-300 dark:hover:bg-navy-600"
                                                >
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(item)}
                                                    className="rounded-lg p-2 text-error hover:bg-error/10"
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

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-navy-700">
                        <h3 className="text-lg font-semibold text-slate-700 dark:text-navy-100">
                            {editingItem ? 'Edit Barang' : 'Tambah Barang'}
                        </h3>

                        <div className="mt-4 space-y-4">
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                    Nama Barang <span className="text-error">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                    SKU <span className="text-error">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.sku}
                                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                    className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                        Stok
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.current_stock}
                                        onChange={(e) => setFormData({ ...formData, current_stock: parseInt(e.target.value) || 0 })}
                                        className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                        Min. Stok
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.min_stock}
                                        onChange={(e) => setFormData({ ...formData, min_stock: parseInt(e.target.value) || 0 })}
                                        className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                        Satuan
                                    </label>
                                    <select
                                        value={formData.unit}
                                        onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                                        className="form-select w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                    >
                                        <option value="lusin">Lusin</option>
                                        <option value="pcs">Pcs</option>
                                        <option value="pasang">Pasang</option>
                                        <option value="set">Set</option>
                                        <option value="unit">Unit</option>
                                        <option value="botol">Botol</option>
                                        <option value="buah">Buah</option>
                                    </select>
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
        </div>
    );
}
