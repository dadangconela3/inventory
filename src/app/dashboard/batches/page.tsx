'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Request, RequestStatus, Profile } from '@/types/database';

export default function BatchSchedulingPage() {
    const [approvedRequests, setApprovedRequests] = useState<Request[]>([]);
    const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('09:00');
    const [showModal, setShowModal] = useState(false);
    const [userProfile, setUserProfile] = useState<Profile | null>(null);

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

                // Fetch approved requests not yet scheduled
                const { data } = await supabase
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
                    .eq('status', 'approved_spv')
                    .is('batch_id', null)
                    .order('created_at', { ascending: true });

                setApprovedRequests(data || []);
            } catch (error) {
                console.error('Error fetching data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedRequests);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedRequests(newSet);
    };

    const selectAll = () => {
        if (selectedRequests.size === approvedRequests.length) {
            setSelectedRequests(new Set());
        } else {
            setSelectedRequests(new Set(approvedRequests.map(r => r.id)));
        }
    };

    const handleCreateBatch = async () => {
        if (selectedRequests.size === 0) {
            alert('Pilih minimal satu request');
            return;
        }
        if (!scheduleDate || !scheduleTime) {
            alert('Pilih tanggal dan waktu pengambilan');
            return;
        }

        setSubmitting(true);
        try {
            const scheduleDatetime = new Date(`${scheduleDate}T${scheduleTime}`);

            // Create batch
            const { data: batch, error: batchError } = await supabase
                .from('pickup_batches')
                .insert({
                    schedule_date: scheduleDatetime.toISOString(),
                    hrga_status: 'pending',
                })
                .select()
                .single();

            if (batchError) throw batchError;

            // Update requests with batch_id
            const { error: updateError } = await supabase
                .from('requests')
                .update({
                    batch_id: batch.id,
                    status: 'scheduled' as RequestStatus,
                    updated_at: new Date().toISOString(),
                })
                .in('id', Array.from(selectedRequests));

            if (updateError) throw updateError;

            // Create notifications for HRGA
            const { data: hrgaUsers } = await supabase
                .from('profiles')
                .select('id')
                .eq('role', 'hrga');

            if (hrgaUsers) {
                const notifications = hrgaUsers.map(u => ({
                    user_id: u.id,
                    message: `Batch pengambilan baru dijadwalkan untuk ${scheduleDatetime.toLocaleDateString('id-ID')}`,
                    link: '/dashboard/batches',
                }));

                await supabase.from('notifications').insert(notifications);
            }

            // Clear selection and refresh
            setSelectedRequests(new Set());
            setShowModal(false);
            setApprovedRequests(prev => prev.filter(r => !selectedRequests.has(r.id)));
            alert('Batch berhasil dibuat!');
        } catch (error) {
            console.error('Error creating batch:', error);
            alert('Gagal membuat batch. Silakan coba lagi.');
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
                        Jadwal Batch Pengambilan
                    </h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-navy-300">
                        Kelompokkan request yang sudah diapprove untuk dijadwalkan
                    </p>
                </div>

                {/* Create Batch Button */}
                <button
                    onClick={() => setShowModal(true)}
                    disabled={selectedRequests.size === 0}
                    className="btn bg-primary text-white hover:bg-primary-focus disabled:opacity-50 dark:bg-accent dark:hover:bg-accent-focus"
                >
                    <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Buat Jadwal ({selectedRequests.size} dipilih)
                </button>
            </div>

            {/* Info Card */}
            <div className="card bg-gradient-to-r from-info to-info-focus p-5 text-white">
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-sm opacity-90">Request Siap Dijadwalkan</p>
                        <p className="text-3xl font-bold">{approvedRequests.length}</p>
                    </div>
                </div>
            </div>

            {/* Requests Table */}
            <div className="card">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-150 dark:border-navy-600">
                                <th className="px-5 py-4 text-left">
                                    <input
                                        type="checkbox"
                                        checked={selectedRequests.size === approvedRequests.length && approvedRequests.length > 0}
                                        onChange={selectAll}
                                        className="form-checkbox is-basic h-5 w-5 rounded border-slate-400/70 checked:border-primary checked:bg-primary dark:border-navy-400"
                                    />
                                </th>
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    No. Dokumen
                                </th>
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Departemen
                                </th>
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Jumlah Item
                                </th>
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Tanggal Request
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-5 py-12 text-center">
                                        <div className="flex items-center justify-center">
                                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                        </div>
                                    </td>
                                </tr>
                            ) : approvedRequests.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-5 py-12 text-center text-slate-400 dark:text-navy-300">
                                        Tidak ada request yang siap dijadwalkan
                                    </td>
                                </tr>
                            ) : (
                                approvedRequests.map((request) => (
                                    <tr
                                        key={request.id}
                                        className={`border-b border-slate-100 last:border-0 dark:border-navy-700 ${selectedRequests.has(request.id) ? 'bg-primary/5 dark:bg-accent/5' : ''
                                            }`}
                                    >
                                        <td className="px-5 py-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedRequests.has(request.id)}
                                                onChange={() => toggleSelect(request.id)}
                                                className="form-checkbox is-basic h-5 w-5 rounded border-slate-400/70 checked:border-primary checked:bg-primary dark:border-navy-400"
                                            />
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className="font-medium text-slate-700 dark:text-navy-100">
                                                {request.doc_number}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-600 dark:text-navy-200">
                                            {(request as any).department?.name || request.dept_code}
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-600 dark:text-navy-200">
                                            {((request as any).items || []).length} item
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-500 dark:text-navy-300">
                                            {new Date(request.created_at).toLocaleDateString('id-ID')}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Schedule Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-navy-700">
                        <h3 className="text-lg font-semibold text-slate-700 dark:text-navy-100">
                            Buat Jadwal Pengambilan
                        </h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-navy-300">
                            {selectedRequests.size} request akan dijadwalkan
                        </p>

                        <div className="mt-4 space-y-4">
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                    Tanggal <span className="text-error">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={scheduleDate}
                                    onChange={(e) => setScheduleDate(e.target.value)}
                                    min={new Date().toISOString().split('T')[0]}
                                    className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                    Waktu <span className="text-error">*</span>
                                </label>
                                <input
                                    type="time"
                                    value={scheduleTime}
                                    onChange={(e) => setScheduleTime(e.target.value)}
                                    className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                />
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
                                onClick={handleCreateBatch}
                                disabled={submitting || !scheduleDate}
                                className="btn bg-primary text-white hover:bg-primary-focus disabled:opacity-50 dark:bg-accent dark:hover:bg-accent-focus"
                            >
                                {submitting ? 'Memproses...' : 'Buat Jadwal'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
