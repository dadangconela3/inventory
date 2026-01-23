import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Check if we're in development without Supabase configured
const isDemoMode = !supabaseUrl || !supabaseAnonKey;

if (isDemoMode && typeof window !== 'undefined') {
    console.warn(
        '⚠️ Supabase environment variables not configured.\n' +
        'Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local\n' +
        'See .env.example for reference.'
    );
}

// Create a mock/dummy client for demo mode that won't crash
// Using placeholder URL when not configured
const safeUrl = supabaseUrl || 'https://placeholder.supabase.co';
const safeKey = supabaseAnonKey || 'placeholder_key';

export const supabase: SupabaseClient = createClient(safeUrl, safeKey, {
    auth: {
        autoRefreshToken: !isDemoMode,
        persistSession: !isDemoMode,
    },
});

// Export demo mode status for components to check
export const isSupabaseConfigured = !isDemoMode;

// Server-side client for use in Server Components and API routes
export const createServerClient = () => {
    return createClient(safeUrl, safeKey, {
        auth: {
            persistSession: false,
        },
    });
};

// Helper to check if Supabase is available
export const checkSupabaseConnection = async (): Promise<boolean> => {
    if (isDemoMode) return false;

    try {
        const { error } = await supabase.from('departments').select('id').limit(1);
        return !error;
    } catch {
        return false;
    }
};
