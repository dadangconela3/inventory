'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PRODUCTION_DEPARTMENTS, INDIRECT_DEPARTMENTS } from '@/types/database';

interface Supervisor {
    id: string;
    full_name: string;
    department_code: string;
    department_name: string;
}

export default function TestDepartmentNotification() {
    const [userRole, setUserRole] = useState<string>('');
    const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
    const [selectedDept, setSelectedDept] = useState<string>('');
    const [sending, setSending] = useState(false);
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchUserAndSupervisors();
    }, []);

    const fetchUserAndSupervisors = async () => {
        try {
            // Get current user role
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            setUserRole(profile?.role || '');

            // Fetch all supervisors with their departments
            const { data: supervisorData } = await supabase
                .from('profiles')
                .select(`
                    id,
                    full_name,
                    department:departments!department_id(code, name)
                `)
                .eq('role', 'supervisor');

            if (supervisorData) {
                const formatted = supervisorData
                    .filter(s => s.department)
                    .map(s => ({
                        id: s.id,
                        full_name: s.full_name,
                        department_code: (s.department as any).code,
                        department_name: (s.department as any).name,
                    }));
                setSupervisors(formatted);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const getAvailableDepartments = () => {
        if (userRole === 'admin_produksi') {
            return PRODUCTION_DEPARTMENTS;
        } else if (userRole === 'admin_indirect') {
            return INDIRECT_DEPARTMENTS;
        }
        return [];
    };

    const handleSendTest = async () => {
        if (!selectedDept) {
            setMessage('⚠️ Pilih departemen terlebih dahulu');
            return;
        }

        setSending(true);
        setMessage('⏳ Mengirim notifikasi...');

        try {
            // Find supervisors for selected department
            const targetSupervisors = supervisors.filter(s => s.department_code === selectedDept);

            if (targetSupervisors.length === 0) {
                setMessage(`⚠️ Tidak ada supervisor untuk departemen ${selectedDept}`);
                return;
            }

            const { sendPushNotification } = await import('@/lib/notifications');
            let successCount = 0;

            for (const supervisor of targetSupervisors) {
                try {
                    await sendPushNotification({
                        title: '🧪 Test Notification',
                        body: `Test notifikasi untuk supervisor ${supervisor.department_name}`,
                        link: '/dashboard',
                        userId: supervisor.id,
                    });
                    successCount++;
                } catch (error) {
                    console.error(`Failed to send to ${supervisor.full_name}:`, error);
                }
            }

            setMessage(`✅ Notifikasi terkirim ke ${successCount}/${targetSupervisors.length} supervisor (${targetSupervisors.map(s => s.full_name).join(', ')})`);
        } catch (error) {
            console.error('Error sending notification:', error);
            setMessage('❌ Gagal mengirim notifikasi');
        } finally {
            setSending(false);
        }
    };

    if (loading) {
        return (
            <div className="card p-6">
                <div className="flex items-center gap-3">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span className="text-slate-600 dark:text-navy-200">Loading...</span>
                </div>
            </div>
        );
    }

    const availableDepts = getAvailableDepartments();

    if (availableDepts.length === 0) {
        return (
            <div className="card p-6">
                <p className="text-slate-600 dark:text-navy-200">
                    Fitur ini hanya tersedia untuk admin produksi dan admin indirect
                </p>
            </div>
        );
    }

    return (
        <div className="card p-6">
            <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                    <svg className="h-6 w-6 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-slate-700 dark:text-navy-100">
                        Test Notifikasi Departemen
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-navy-300">
                        Kirim test notification ke supervisor departemen
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600 dark:text-navy-100">
                        Pilih Departemen
                    </label>
                    <select
                        value={selectedDept}
                        onChange={(e) => setSelectedDept(e.target.value)}
                        className="form-select w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-navy-450 dark:bg-navy-700"
                        disabled={sending}
                    >
                        <option value="">-- Pilih Departemen --</option>
                        {availableDepts.map(dept => {
                            const supervisor = supervisors.find(s => s.department_code === dept);
                            return (
                                <option key={dept} value={dept}>
                                    {dept} {supervisor ? `(${supervisor.full_name})` : '(No supervisor)'}
                                </option>
                            );
                        })}
                    </select>
                </div>

                <button
                    onClick={handleSendTest}
                    disabled={sending || !selectedDept}
                    className="btn w-full bg-warning text-white hover:bg-warning-focus disabled:opacity-50"
                >
                    {sending ? (
                        <>
                            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Mengirim...
                        </>
                    ) : (
                        <>
                            <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                            Kirim Test Notification
                        </>
                    )}
                </button>

                {message && (
                    <div className={`rounded-lg p-3 text-sm ${
                        message.startsWith('✅') ? 'bg-success/10 text-success' :
                        message.startsWith('❌') ? 'bg-error/10 text-error' :
                        'bg-warning/10 text-warning'
                    }`}>
                        {message}
                    </div>
                )}

                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-navy-600 dark:text-navy-200">
                    <strong>💡 Catatan:</strong> Supervisor harus sudah subscribe terlebih dahulu agar dapat menerima notifikasi.
                    Jika notifikasi terkirim tapi tidak muncul, cek apakah supervisor sudah klik "🔔 Step 1: Allow & Subscribe" di dashboard mereka.
                </div>
            </div>
        </div>
    );
}
