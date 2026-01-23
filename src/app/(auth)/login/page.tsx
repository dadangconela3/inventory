'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [checkingAuth, setCheckingAuth] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Check if user is already logged in
    useEffect(() => {
        const checkSession = async () => {
            if (!isSupabaseConfigured) {
                setCheckingAuth(false);
                return;
            }

            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                // User is already logged in, redirect to dashboard
                router.replace('/dashboard');
            } else {
                setCheckingAuth(false);
            }
        };

        checkSession();
    }, [router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // Determine if input is email or username
            let email = username;

            // If input doesn't contain @, assume it's a username and lookup email
            if (!username.includes('@')) {
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('email')
                    .or(`username.eq.${username},full_name.ilike.${username}`)
                    .limit(1)
                    .single();

                if (profileError || !profile) {
                    setError('Username tidak ditemukan');
                    setLoading(false);
                    return;
                }
                email = profile.email;
            }

            const { data, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) {
                if (authError.message.includes('Invalid login credentials')) {
                    setError('Username atau password salah');
                } else {
                    setError(authError.message);
                }
                return;
            }

            if (data.user) {
                router.replace('/dashboard');
                router.refresh();
            }
        } catch (err) {
            setError('Terjadi kesalahan. Silakan coba lagi.');
        } finally {
            setLoading(false);
        }
    };

    // Show loading while checking auth
    if (checkingAuth) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-navy-900">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex grow bg-slate-50 dark:bg-navy-900">
            <main className="grid w-full grow grid-cols-1 place-items-center">
                <div className="w-full max-w-[26rem] p-4 sm:px-5">
                    {/* Header */}
                    <div className="text-center">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 dark:bg-accent/10">
                            <svg
                                className="h-10 w-10 text-primary dark:text-accent"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M20 7H4C2.89543 7 2 7.89543 2 9V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V9C22 7.89543 21.1046 7 20 7Z"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                                <path
                                    d="M16 7V5C16 3.89543 15.1046 3 14 3H10C8.89543 3 8 3.89543 8 5V7"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                                <path
                                    d="M12 12V16"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                                <path
                                    d="M8 14H16"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </div>
                        <div className="mt-4">
                            <h2 className="text-2xl font-semibold text-slate-600 dark:text-navy-100">
                                Inventory Management
                            </h2>
                            <p className="text-slate-400 dark:text-navy-300">
                                Silakan masuk untuk melanjutkan
                            </p>
                        </div>
                    </div>

                    {/* Login Card */}
                    <div className="card mt-5 rounded-lg p-5 lg:p-7">
                        <form onSubmit={handleLogin}>
                            {/* Error Message */}
                            {error && (
                                <div className="mb-4 rounded-lg bg-error/10 p-3 text-sm text-error">
                                    {error}
                                </div>
                            )}

                            {/* Username/Email Field */}
                            <label className="block">
                                <span className="text-slate-600 dark:text-navy-100">Username / Email:</span>
                                <span className="relative mt-1.5 flex">
                                    <input
                                        className="form-input peer w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 pl-9 placeholder:text-slate-400/70 hover:z-10 hover:border-slate-400 focus:z-10 focus:border-primary dark:border-navy-450 dark:hover:border-navy-400 dark:focus:border-accent"
                                        placeholder="Masukkan username atau email"
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        required
                                        autoComplete="username"
                                    />
                                    <span className="pointer-events-none absolute flex h-full w-10 items-center justify-center text-slate-400 peer-focus:text-primary dark:text-navy-300 dark:peer-focus:text-accent">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="h-5 w-5 transition-colors duration-200"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth="1.5"
                                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                            />
                                        </svg>
                                    </span>
                                </span>
                            </label>

                            {/* Password Field */}
                            <label className="mt-4 block">
                                <span className="text-slate-600 dark:text-navy-100">Password:</span>
                                <span className="relative mt-1.5 flex">
                                    <input
                                        className="form-input peer w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 pl-9 placeholder:text-slate-400/70 hover:z-10 hover:border-slate-400 focus:z-10 focus:border-primary dark:border-navy-450 dark:hover:border-navy-400 dark:focus:border-accent"
                                        placeholder="Masukkan password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        autoComplete="current-password"
                                    />
                                    <span className="pointer-events-none absolute flex h-full w-10 items-center justify-center text-slate-400 peer-focus:text-primary dark:text-navy-300 dark:peer-focus:text-accent">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="h-5 w-5 transition-colors duration-200"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth="1.5"
                                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                            />
                                        </svg>
                                    </span>
                                </span>
                            </label>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="btn mt-5 w-full bg-primary font-medium text-white hover:bg-primary-focus focus:bg-primary-focus active:bg-primary-focus/90 disabled:opacity-50 dark:bg-accent dark:hover:bg-accent-focus dark:focus:bg-accent-focus dark:active:bg-accent/90"
                            >
                                {loading ? (
                                    <span className="flex items-center justify-center">
                                        <svg
                                            className="mr-2 h-5 w-5 animate-spin"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                        >
                                            <circle
                                                className="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                strokeWidth="4"
                                            />
                                            <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            />
                                        </svg>
                                        Memproses...
                                    </span>
                                ) : (
                                    'Masuk'
                                )}
                            </button>
                        </form>

                        {/* Help Text */}
                        <div className="mt-4 text-center text-xs text-slate-400 dark:text-navy-300">
                            Gunakan username atau email untuk masuk
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-8 flex justify-center text-xs text-slate-400 dark:text-navy-300">
                        <span>© 2026 Inventory Management System</span>
                    </div>
                </div>
            </main>
        </div>
    );
}
