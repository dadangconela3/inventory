'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function ChangePasswordPage() {
    const router = useRouter();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        // Validation
        if (!currentPassword || !newPassword || !confirmPassword) {
            setError('Semua field harus diisi');
            return;
        }

        if (newPassword.length < 6) {
            setError('Password baru minimal 6 karakter');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Password baru dan konfirmasi password tidak cocok');
            return;
        }

        if (currentPassword === newPassword) {
            setError('Password baru harus berbeda dengan password lama');
            return;
        }

        setLoading(true);

        try {
            // First, verify current password by attempting to sign in
            const { data: { user } } = await supabase.auth.getUser();
            
            if (!user?.email) {
                setError('User tidak ditemukan');
                setLoading(false);
                return;
            }

            // Try to sign in with current password to verify it
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: currentPassword,
            });

            if (signInError) {
                setError('Password lama tidak sesuai');
                setLoading(false);
                return;
            }

            // Update password
            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword,
            });

            if (updateError) {
                setError(updateError.message);
                setLoading(false);
                return;
            }

            setSuccess('Password berhasil diubah!');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            
            // Redirect to dashboard after 2 seconds
            setTimeout(() => {
                router.push('/dashboard');
            }, 2000);
        } catch (err) {
            setError('Terjadi kesalahan saat mengubah password');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-navy-900 p-4 lg:p-6">
            <div className="mx-auto max-w-2xl">
                <div className="mb-6">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center text-sm text-slate-600 hover:text-slate-900 dark:text-navy-300 dark:hover:text-navy-100"
                    >
                        <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Kembali
                    </button>
                </div>

                <div className="bg-white dark:bg-navy-800 rounded-lg shadow-soft p-6 lg:p-8">
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-navy-100 mb-6">
                        Ganti Password
                    </h1>

                    {error && (
                        <div className="mb-4 rounded-lg bg-error/10 border border-error/20 p-4">
                            <p className="text-sm text-error">{error}</p>
                        </div>
                    )}

                    {success && (
                        <div className="mb-4 rounded-lg bg-success/10 border border-success/20 p-4">
                            <p className="text-sm text-success">{success}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="currentPassword" className="block text-sm font-medium text-slate-700 dark:text-navy-100 mb-2">
                                Password Lama
                            </label>
                            <input
                                type="password"
                                id="currentPassword"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-navy-450 dark:bg-navy-700 dark:text-navy-100 dark:focus:border-accent"
                                placeholder="Masukkan password lama"
                                disabled={loading}
                            />
                        </div>

                        <div>
                            <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 dark:text-navy-100 mb-2">
                                Password Baru
                            </label>
                            <input
                                type="password"
                                id="newPassword"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-navy-450 dark:bg-navy-700 dark:text-navy-100 dark:focus:border-accent"
                                placeholder="Masukkan password baru (minimal 6 karakter)"
                                disabled={loading}
                            />
                        </div>

                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 dark:text-navy-100 mb-2">
                                Konfirmasi Password Baru
                            </label>
                            <input
                                type="password"
                                id="confirmPassword"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-navy-450 dark:bg-navy-700 dark:text-navy-100 dark:focus:border-accent"
                                placeholder="Masukkan ulang password baru"
                                disabled={loading}
                            />
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 rounded-lg bg-primary px-6 py-2.5 text-white font-medium transition-colors hover:bg-primary-focus focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-accent dark:hover:bg-accent-focus dark:focus:ring-accent/50"
                            >
                                {loading ? 'Mengubah...' : 'Ubah Password'}
                            </button>
                            <button
                                type="button"
                                onClick={() => router.back()}
                                disabled={loading}
                                className="rounded-lg border border-slate-300 px-6 py-2.5 text-slate-700 font-medium transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300/50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-navy-450 dark:text-navy-100 dark:hover:bg-navy-600"
                            >
                                Batal
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
