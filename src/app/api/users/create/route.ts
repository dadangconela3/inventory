import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            email,
            password,
            username,
            full_name,
            role,
            department_id,
            departments = [],
        } = body;

        if (!email || !password || !full_name || !role) {
            return NextResponse.json(
                { error: 'Email, password, nama lengkap, dan role harus diisi' },
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

        // Verify HRGA authorization if token is provided
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (token) {
            const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
            if (authError || !callerUser) {
                return NextResponse.json(
                    { error: 'Sesi login tidak valid' },
                    { status: 401 }
                );
            }

            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('role')
                .eq('id', callerUser.id)
                .single();

            if (profile?.role !== 'hrga') {
                return NextResponse.json(
                    { error: 'Hanya role HRGA yang dapat menambahkan user baru' },
                    { status: 403 }
                );
            }
        }

        // Check if user with this email already exists in profiles
        const { data: existingUser } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (existingUser) {
            return NextResponse.json(
                { error: 'Email sudah terdaftar.' },
                { status: 400 }
            );
        }

        // Create user in Supabase Auth via Admin API (Does NOT touch client session!)
        const normalizedUsername = (username || email.split('@')[0]).trim();
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // auto confirm so user can log in immediately
            user_metadata: {
                full_name,
                role,
                username: normalizedUsername,
            },
        });

        if (authError) {
            console.error('Error creating auth user:', authError);
            if (
                authError.message.toLowerCase().includes('already registered') ||
                authError.message.toLowerCase().includes('already exists') ||
                authError.message.toLowerCase().includes('unique')
            ) {
                return NextResponse.json(
                    { error: 'Email sudah terdaftar di sistem.' },
                    { status: 400 }
                );
            }
            return NextResponse.json(
                { error: authError.message || 'Gagal membuat user di Supabase Auth' },
                { status: 500 }
            );
        }

        const newUserId = authData.user.id;

        // Upsert profile record
        const profileData = {
            id: newUserId,
            email,
            username: normalizedUsername,
            full_name,
            role,
            department_id: department_id || null,
        };

        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .upsert(profileData, { onConflict: 'id' });

        if (profileError) {
            console.error('Error updating profile for new user:', profileError);
        }

        // Insert user_departments relations for multi-department support
        if (Array.isArray(departments) && departments.length > 0) {
            const userDeptInserts = departments.map((deptId: string) => ({
                user_id: newUserId,
                department_id: deptId,
                is_primary: deptId === department_id,
            }));

            const { error: deptError } = await supabaseAdmin
                .from('user_departments')
                .insert(userDeptInserts);

            if (deptError) {
                console.error('Error inserting user_departments:', deptError);
            }
        }

        return NextResponse.json({
            success: true,
            user: {
                id: newUserId,
                email,
                username: normalizedUsername,
                full_name,
                role,
            },
        });
    } catch (error: any) {
        console.error('API create user error:', error);
        return NextResponse.json(
            { error: error?.message || 'Terjadi kesalahan saat membuat user' },
            { status: 500 }
        );
    }
}
