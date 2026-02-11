'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Department, Item, Profile, UserRole, PRODUCTION_DEPARTMENTS, INDIRECT_DEPARTMENTS } from '@/types/database';
import { generateDocNumberPreview } from '@/lib/utils/doc-number';
import CreatableSelect, { SelectOption } from '@/components/ui/CreatableSelect';

interface RequestItemRow {
    id: string;
    item_id: string;
    quantity: number;
    dept_code: string;
}

// Map role to allowed department codes
const ROLE_DEPARTMENTS: Record<string, readonly string[]> = {
    admin_produksi: PRODUCTION_DEPARTMENTS, // MOLDING, PLATING, PAINTING1, PAINTING2
    admin_indirect: INDIRECT_DEPARTMENTS,   // ASSEMBLY, PP, QC, QA, PPIC, LOGISTICS
    admin_dept: [],                          // Will use their own department
    supervisor: [],                          // Not typically creating requests
    hrga: [],                                // All departments
};

export default function NewRequestPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [filteredDepartments, setFilteredDepartments] = useState<Department[]>([]);
    const [items, setItems] = useState<Item[]>([]);
    const [userProfile, setUserProfile] = useState<Profile | null>(null);

    // Simple ID generator
    const generateId = () => `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Form state
    const [selectedDept, setSelectedDept] = useState('');
    const [requestDate, setRequestDate] = useState(new Date().toISOString().split('T')[0]);
    const [docNumberPreview, setDocNumberPreview] = useState('');
    const [nextSequence, setNextSequence] = useState(1);
    const [requestItems, setRequestItems] = useState<RequestItemRow[]>([]);

    // New Item Modal State
    const [showNewItemModal, setShowNewItemModal] = useState(false);

    const [newItemFormData, setNewItemFormData] = useState({
        name: '',
        sku: '',
        unit: 'pcs',
        min_stock: 0,
    });
    const [savingNewItem, setSavingNewItem] = useState(false);


    // Initialize first row
    useEffect(() => {
        if (requestItems.length === 0) {
            setRequestItems([{ id: generateId(), item_id: '', quantity: 1, dept_code: '' }]);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Fetch profile, departments and items on mount
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Get current user
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    router.replace('/login');
                    return;
                }

                // Fetch profile
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*, department:departments(code, name)')
                    .eq('id', user.id)
                    .single();

                setUserProfile(profile);

                // Fetch departments and items
                const [deptRes, itemRes] = await Promise.all([
                    supabase.from('departments').select('*').order('name'),
                    supabase.from('items').select('*').order('name'),
                ]);

                const departments = deptRes.data || [];
                setItems(itemRes.data || []);

                // Filter departments based on role
                if (profile) {
                    const role = profile.role as UserRole;
                    let filtered: Department[];

                    console.log('User role:', role);
                    console.log('All departments:', departments.map(d => ({ code: d.code, category: d.category })));

                    if (role === 'admin_produksi') {
                        // Admin produksi: filter by production category or production department codes
                        filtered = departments.filter(d =>
                            d.category === 'production' ||
                            (PRODUCTION_DEPARTMENTS as readonly string[]).includes(d.code)
                        );
                    } else if (role === 'admin_indirect') {
                        // Admin indirect: filter by indirect category or indirect department codes
                        filtered = departments.filter(d =>
                            d.category === 'indirect' ||
                            (INDIRECT_DEPARTMENTS as readonly string[]).includes(d.code)
                        );
                    } else if (role === 'admin_dept') {
                        // Only their own department
                        filtered = departments.filter(d => d.id === profile.department_id);
                    } else if (role === 'hrga') {
                        // HRGA can access all departments
                        filtered = departments;
                    } else {
                        // Default (supervisor, etc): only their department
                        filtered = departments.filter(d => d.id === profile.department_id);
                    }

                    console.log('Filtered departments:', filtered.map(d => d.code));
                    setFilteredDepartments(filtered);

                    // Auto-select if only one department
                    if (filtered.length === 1) {
                        setSelectedDept(filtered[0].code);
                    }
                }
            } catch (error) {
                console.error('Error fetching data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [router]);

    // Fetch next sequence number when dept or date changes
    const fetchNextSequence = useCallback(async (deptCode: string, date: Date) => {
        try {
            const year = date.getFullYear();

            // First, try to get from doc_sequences table
            const { data: seqData, error: seqError } = await supabase
                .from('doc_sequences')
                .select('last_number')
                .eq('dept_code', deptCode)
                .eq('year', year)
                .single();

            let nextNum = 1;

            if (seqData && !seqError) {
                // Sequence exists, use next number
                nextNum = seqData.last_number + 1;
            } else {
                // No sequence yet, check existing requests to determine starting number
                const { data: existingRequests } = await supabase
                    .from('requests')
                    .select('doc_number')
                    .like('doc_number', `REQ/%/${deptCode}/%/${year}`)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (existingRequests && existingRequests.length > 0) {
                    // Parse the last doc number to get sequence
                    const lastDocNum = existingRequests[0].doc_number;
                    const match = lastDocNum.match(/^REQ\/(\d{4})\//);
                    if (match) {
                        nextNum = parseInt(match[1], 10) + 1;
                    }
                }
            }

            setNextSequence(nextNum);
            return nextNum;
        } catch (error) {
            console.error('Error fetching sequence:', error);
            return 1;
        }
    }, []);

    // Generate doc number preview when dept or date changes
    useEffect(() => {
        if (selectedDept && requestDate) {
            const date = new Date(requestDate);
            fetchNextSequence(selectedDept, date).then(seq => {
                const preview = generateDocNumberPreview(selectedDept, date, seq);
                setDocNumberPreview(preview);
            });

            // Update default dept_code for all items
            setRequestItems(prev =>
                prev.map(item => ({
                    ...item,
                    dept_code: item.dept_code || selectedDept,
                }))
            );
        }
    }, [selectedDept, requestDate, fetchNextSequence]);

    // Add new item row
    const addItemRow = () => {
        setRequestItems(prev => [
            ...prev,
            { id: generateId(), item_id: '', quantity: 1, dept_code: selectedDept },
        ]);
    };

    // Remove item row
    const removeItemRow = (id: string) => {
        if (requestItems.length > 1) {
            setRequestItems(prev => prev.filter(item => item.id !== id));
        }
    };

    // Update item row
    const updateItemRow = (id: string, field: keyof RequestItemRow, value: string | number) => {
        setRequestItems(prev =>
            prev.map(item =>
                item.id === id ? { ...item, [field]: value } : item
            )
        );
    };

    // Convert items to select options
    const itemOptions: SelectOption[] = items.map(item => ({
        value: item.id,
        label: `${item.name} (${item.sku}) - Stok: ${item.current_stock} ${item.unit}`,
    }));

    // Open new item modal
    const handleCreateNewItem = async (inputValue: string): Promise<SelectOption | null> => {
        // Open modal instead of auto-creating
        setNewItemFormData({
            name: inputValue,
            sku: `SKU-${Date.now()}`,
            unit: 'pcs',
            min_stock: 0,
        });
        setShowNewItemModal(true);
        return null; // Return null, item will be added after modal submit
    };

    // Save new item from modal
    const handleSaveNewItem = async () => {
        if (!newItemFormData.name.trim()) {
            alert('Nama barang harus diisi');
            return;
        }
        if (!newItemFormData.sku.trim()) {
            alert('SKU harus diisi');
            return;
        }

        setSavingNewItem(true);
        try {
            const { data, error } = await supabase
                .from('items')
                .insert({
                    name: newItemFormData.name.trim(),
                    sku: newItemFormData.sku.trim(),
                    unit: newItemFormData.unit || 'pcs',
                    current_stock: 0,
                    min_stock: newItemFormData.min_stock || 0,
                })
                .select()
                .single();

            if (error) {
                console.error('Supabase error:', error);
                alert(`Gagal menambahkan barang: ${error.message}`);
                return;
            }

            // Add to items list
            setItems(prev => [...prev, data]);

            // Auto-select the new item in the first empty row or last row
            const emptyRow = requestItems.find(r => !r.item_id);
            if (emptyRow) {
                updateItemRow(emptyRow.id, 'item_id', data.id);
            }

            // Close modal and reset
            setShowNewItemModal(false);
            setNewItemFormData({ name: '', sku: '', unit: 'pcs', min_stock: 0 });

        } catch (error) {
            console.error('Error creating new item:', error);
            alert('Gagal menambahkan barang baru.');
        } finally {
            setSavingNewItem(false);
        }
    };

    // Cancel new item modal
    const handleCancelNewItem = () => {
        setShowNewItemModal(false);
        setNewItemFormData({ name: '', sku: '', unit: 'pcs', min_stock: 0 });
    };

    // Submit form
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedDept) {
            alert('Pilih departemen terlebih dahulu');
            return;
        }

        const validItems = requestItems.filter(item => item.item_id && item.quantity > 0);
        if (validItems.length === 0) {
            alert('Tambahkan minimal satu barang dengan jumlah yang valid');
            return;
        }

        setSubmitting(true);

        try {
            // Group items by department for multi-split logic
            const itemsByDept = validItems.reduce((acc, item) => {
                const deptCode = item.dept_code || selectedDept;
                if (!acc[deptCode]) {
                    acc[deptCode] = [];
                }
                acc[deptCode].push(item);
                return acc;
            }, {} as Record<string, RequestItemRow[]>);

            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('User not authenticated');

            // Create a request for each department
            for (const [deptCode, deptItems] of Object.entries(itemsByDept)) {
                // Get next sequence number using the RPC function
                const year = new Date(requestDate).getFullYear();
                const { data: seqData, error: seqError } = await supabase
                    .rpc('get_next_doc_sequence', {
                        p_dept_code: deptCode,
                        p_year: year,
                    });

                let sequence = 1;
                if (!seqError && seqData) {
                    sequence = seqData;
                } else {
                    // Fallback: manually check and insert
                    const { data: existingSeq } = await supabase
                        .from('doc_sequences')
                        .select('last_number')
                        .eq('dept_code', deptCode)
                        .eq('year', year)
                        .single();

                    if (existingSeq) {
                        sequence = existingSeq.last_number + 1;
                        await supabase
                            .from('doc_sequences')
                            .update({ last_number: sequence })
                            .eq('dept_code', deptCode)
                            .eq('year', year);
                    } else {
                        await supabase
                            .from('doc_sequences')
                            .insert({ dept_code: deptCode, year, last_number: 1 });
                    }
                }

                const docNumber = generateDocNumberPreview(deptCode, new Date(requestDate), sequence);

                // Create request
                const { data: request, error: requestError } = await supabase
                    .from('requests')
                    .insert({
                        doc_number: docNumber,
                        requester_id: user.id,
                        dept_code: deptCode,
                        status: 'pending',
                    })
                    .select()
                    .single();

                if (requestError) throw requestError;

                // Create request items
                const requestItemsData = deptItems.map(item => ({
                    request_id: request.id,
                    item_id: item.item_id,
                    quantity: item.quantity,
                }));

                const { error: itemsError } = await supabase
                    .from('request_items')
                    .insert(requestItemsData);

                if (itemsError) throw itemsError;

                // Notify supervisor of this department
                const { data: departmentData } = await supabase
                    .from('departments')
                    .select('id')
                    .eq('code', deptCode)
                    .single();

                if (departmentData) {
                    const { data: supervisors } = await supabase
                        .from('profiles')
                        .select('id')
                        .eq('role', 'supervisor')
                        .eq('department_id', departmentData.id);

                    if (supervisors && supervisors.length > 0) {
                        const notifications = supervisors.map(s => ({
                            user_id: s.id,
                            message: `Request baru ${docNumber} menunggu approval`,
                            link: '/dashboard/approvals',
                        }));
                        await supabase.from('notifications').insert(notifications);
                    }
                }
            }

            // Success
            alert('Request berhasil dibuat!');
            router.push('/dashboard/requests');
            router.refresh();
        } catch (error) {
            console.error('Error creating request:', error);
            alert('Gagal membuat request. Silakan coba lagi.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    // Get role display name
    const getRoleInfo = () => {
        if (!userProfile) return '';
        switch (userProfile.role) {
            case 'admin_produksi':
                return 'Anda dapat membuat request untuk: Molding, Plating, Painting 1, Painting 2';
            case 'admin_indirect':
                return 'Anda dapat membuat request untuk: Assembly, PP, QC, QA, PPIC, Logistics';
            case 'admin_dept':
                return 'Anda dapat membuat request untuk departemen Anda sendiri';
            case 'hrga':
                return 'Anda dapat membuat request untuk semua departemen';
            default:
                return '';
        }
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-semibold text-slate-700 dark:text-navy-100">
                    Buat Request Baru
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-navy-300">
                    Buat permintaan barang untuk departemen
                </p>
                {getRoleInfo() && (
                    <div className="mt-2 rounded-lg bg-info/10 px-3 py-2 text-sm text-info">
                        {getRoleInfo()}
                    </div>
                )}
            </div>

            <form onSubmit={handleSubmit}>
                <div className="card p-6">
                    {/* Document Info Section */}
                    <div className="mb-6 grid gap-6 md:grid-cols-3">
                        {/* Department Select */}
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                Departemen <span className="text-error">*</span>
                            </label>
                            <select
                                value={selectedDept}
                                onChange={(e) => setSelectedDept(e.target.value)}
                                className="form-select w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 hover:border-slate-400 focus:border-primary dark:border-navy-450 dark:hover:border-navy-400 dark:focus:border-accent"
                                required
                            >
                                <option value="">Pilih Departemen</option>
                                {filteredDepartments.map((dept) => (
                                    <option key={dept.id} value={dept.code}>
                                        {dept.name}
                                    </option>
                                ))}
                            </select>
                            {filteredDepartments.length === 0 && (
                                <p className="mt-1 text-xs text-error">
                                    Tidak ada departemen yang tersedia untuk role Anda
                                </p>
                            )}
                        </div>

                        {/* Date */}
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                Tanggal <span className="text-error">*</span>
                            </label>
                            <input
                                type="date"
                                value={requestDate}
                                onChange={(e) => setRequestDate(e.target.value)}
                                className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 hover:border-slate-400 focus:border-primary dark:border-navy-450 dark:hover:border-navy-400 dark:focus:border-accent"
                                required
                            />
                        </div>

                        {/* Doc Number Preview */}
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                Nomor Dokumen (Preview)
                            </label>
                            <input
                                type="text"
                                value={docNumberPreview || 'Pilih departemen dan tanggal'}
                                className="form-input w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-slate-500 dark:border-navy-500 dark:bg-navy-600 dark:text-navy-200"
                                disabled
                            />
                            {nextSequence > 1 && (
                                <p className="mt-1 text-xs text-slate-400">
                                    Nomor urut berikutnya: {nextSequence}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="mb-6 border-b border-slate-200 dark:border-navy-600" />

                    {/* Items Section */}
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-lg font-medium text-slate-700 dark:text-navy-100">
                            Daftar Barang
                        </h3>
                        <button
                            type="button"
                            onClick={addItemRow}
                            className="btn bg-success text-white hover:bg-success-focus"
                        >
                            <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Tambah Barang
                        </button>
                    </div>

                    {/* Items Table - Desktop */}
                    <div className="hidden md:block overflow-visible">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-navy-600">
                                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                        Barang <span className="text-error">*</span>
                                    </th>
                                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                        Jumlah <span className="text-error">*</span>
                                    </th>
                                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                        Departemen Tujuan
                                    </th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                        Aksi
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {requestItems.map((row) => (
                                    <tr key={row.id} className="border-b border-slate-100 dark:border-navy-700">
                                        {/* Item Select */}
                                        <td className="px-3 py-3">
                                            <div className="min-w-[280px]">
                                                <CreatableSelect
                                                    options={itemOptions}
                                                    value={row.item_id}
                                                    onChange={(value) => updateItemRow(row.id, 'item_id', value)}
                                                    onCreateNew={handleCreateNewItem}
                                                    placeholder="Ketik untuk mencari atau tambah baru..."
                                                    createLabel="Tambah barang"
                                                />
                                            </div>
                                        </td>

                                        {/* Quantity */}
                                        <td className="px-3 py-3">
                                            <input
                                                type="number"
                                                min="1"
                                                value={row.quantity}
                                                onChange={(e) => updateItemRow(row.id, 'quantity', parseInt(e.target.value) || 1)}
                                                className="form-input w-24 rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm hover:border-slate-400 focus:border-primary dark:border-navy-450 dark:hover:border-navy-400 dark:focus:border-accent"
                                                required
                                            />
                                        </td>

                                        {/* Department Override */}
                                        <td className="px-3 py-3">
                                            <select
                                                value={row.dept_code}
                                                onChange={(e) => updateItemRow(row.id, 'dept_code', e.target.value)}
                                                className="form-select w-full min-w-[150px] rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm hover:border-slate-400 focus:border-primary dark:border-navy-450 dark:hover:border-navy-400 dark:focus:border-accent"
                                            >
                                                <option value="">Default ({selectedDept || '-'})</option>
                                                {filteredDepartments.map((dept) => (
                                                    <option key={dept.id} value={dept.code}>
                                                        {dept.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>

                                        {/* Remove Button */}
                                        <td className="px-3 py-3 text-center">
                                            <button
                                                type="button"
                                                onClick={() => removeItemRow(row.id)}
                                                disabled={requestItems.length === 1}
                                                className="rounded-lg p-2 text-error transition-colors hover:bg-error/10 disabled:opacity-30"
                                            >
                                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Items Cards - Mobile */}
                    <div className="md:hidden space-y-4">
                        {requestItems.map((row, index) => (
                            <div key={row.id} className="rounded-lg border border-slate-200 p-4 dark:border-navy-600">
                                {/* Card Header */}
                                <div className="mb-3 flex items-center justify-between">
                                    <span className="text-sm font-medium text-slate-500 dark:text-navy-300">
                                        Barang #{index + 1}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => removeItemRow(row.id)}
                                        disabled={requestItems.length === 1}
                                        className="rounded-lg p-1.5 text-error transition-colors hover:bg-error/10 disabled:opacity-30"
                                    >
                                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>

                                {/* Item Select */}
                                <div className="mb-3">
                                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-navy-300">
                                        Pilih Barang <span className="text-error">*</span>
                                    </label>
                                    <CreatableSelect
                                        options={itemOptions}
                                        value={row.item_id}
                                        onChange={(value) => updateItemRow(row.id, 'item_id', value)}
                                        onCreateNew={handleCreateNewItem}
                                        placeholder="Ketik untuk mencari..."
                                        createLabel="Tambah barang"
                                    />
                                </div>

                                {/* Quantity & Department Row */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-navy-300">
                                            Jumlah <span className="text-error">*</span>
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={row.quantity}
                                            onChange={(e) => updateItemRow(row.id, 'quantity', parseInt(e.target.value) || 1)}
                                            className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-navy-450"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-navy-300">
                                            Departemen
                                        </label>
                                        <select
                                            value={row.dept_code}
                                            onChange={(e) => updateItemRow(row.id, 'dept_code', e.target.value)}
                                            className="form-select w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-navy-450"
                                        >
                                            <option value="">Default</option>
                                            {filteredDepartments.map((dept) => (
                                                <option key={dept.id} value={dept.code}>
                                                    {dept.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Info Badge */}
                    <div className="mt-4 rounded-lg bg-info/10 p-3 text-sm text-info">
                        <p>
                            <strong>Info:</strong> Jika Anda memilih departemen tujuan yang berbeda untuk setiap barang,
                            sistem akan membuat request terpisah untuk setiap departemen dengan nomor dokumen masing-masing.
                        </p>
                    </div>
                </div>

                {/* Submit Section */}
                <div className="mt-6 flex justify-end space-x-3">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="btn border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-450 dark:text-navy-200 dark:hover:bg-navy-500"
                    >
                        Batal
                    </button>
                    <button
                        type="submit"
                        disabled={submitting || filteredDepartments.length === 0}
                        className="btn bg-primary text-white hover:bg-primary-focus disabled:opacity-50 dark:bg-accent dark:hover:bg-accent-focus"
                    >
                        {submitting ? (
                            <span className="flex items-center">
                                <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Menyimpan...
                            </span>
                        ) : (
                            'Simpan Request'
                        )}
                    </button>
                </div>
            </form>

            {/* New Item Modal */}
            {showNewItemModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-navy-700">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-slate-700 dark:text-navy-100">
                                Tambah Barang Baru
                            </h3>
                            <button
                                type="button"
                                onClick={handleCancelNewItem}
                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-navy-600"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Item Name */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                    Nama Barang <span className="text-error">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={newItemFormData.name}
                                    onChange={(e) => setNewItemFormData({ ...newItemFormData, name: e.target.value })}
                                    className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                    placeholder="Contoh: Sarung Tangan Karet"
                                    autoFocus
                                />
                            </div>

                            {/* SKU */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                    SKU / Kode Barang <span className="text-error">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={newItemFormData.sku}
                                    onChange={(e) => setNewItemFormData({ ...newItemFormData, sku: e.target.value })}
                                    className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                    placeholder="Contoh: GLV-001"
                                />
                            </div>

                            {/* Unit & Min Stock */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                        Satuan
                                    </label>
                                    <select
                                        value={newItemFormData.unit}
                                        onChange={(e) => setNewItemFormData({ ...newItemFormData, unit: e.target.value })}
                                        className="form-select w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                    >
                                        <option value="pcs">pcs</option>
                                        <option value="pasang">pasang</option>
                                        <option value="set">set</option>
                                        <option value="box">box</option>
                                        <option value="botol">botol</option>
                                        <option value="pak">pak</option>
                                        <option value="roll">roll</option>
                                        <option value="kg">kg</option>
                                        <option value="liter">liter</option>
                                        <option value="meter">meter</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                        Stok Minimum
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={newItemFormData.min_stock}
                                        onChange={(e) => setNewItemFormData({ ...newItemFormData, min_stock: parseInt(e.target.value) || 0 })}
                                        className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                    />
                                </div>
                            </div>

                            {/* Info */}
                            <div className="rounded-lg bg-info/10 p-3 text-xs text-info">
                                Stok awal akan diset ke 0. Anda dapat mengubah stok melalui menu Stok Barang.
                            </div>
                        </div>

                        {/* Modal Actions */}
                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={handleCancelNewItem}
                                disabled={savingNewItem}
                                className="btn border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-450 dark:text-navy-200"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveNewItem}
                                disabled={savingNewItem}
                                className="btn bg-primary text-white hover:bg-primary-focus disabled:opacity-50 dark:bg-accent"
                            >
                                {savingNewItem ? 'Menyimpan...' : 'Simpan Barang'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
