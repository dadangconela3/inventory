import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { userId, password } = body;

        if (!userId || !password) {
            return NextResponse.json(
                { error: 'User ID dan password baru harus diisi' },
                { status: 400 }
            );
        }

        if (password.length < 6) {
            return NextResponse.json(
                { error: 'Password minimal 6 karakter' },
                { status: 400 }
            );
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json(
                { error: 'Konfigurasi server Supabase tidak lengkap' },
                { status: 500 }
            );
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceKey);

        // Verify HRGA authorization
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (token) {
            const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
            if (authError || !user) {
                return NextResponse.json(
                    { error: 'Sesi login tidak valid' },
                    { status: 401 }
                );
            }

            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            if (profile?.role !== 'hrga') {
                return NextResponse.json(
                    { error: 'Hanya role HRGA yang berhak mereset password user' },
                    { status: 403 }
                );
            }
        }

        // Reset password using admin API
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
            userId,
            { password }
        );

        if (error) {
            console.error('Error in updateUserById:', error);
            return NextResponse.json(
                { error: error.message || 'Gagal mereset password di auth provider' },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Password berhasil direset'
        });
    } catch (error: any) {
        console.error('Error in /api/users/reset-password:', error);
        return NextResponse.json(
            { error: error?.message || 'Terjadi kesalahan pada server' },
            { status: 500 }
        );
    }
}
