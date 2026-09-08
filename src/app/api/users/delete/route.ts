import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { userIds } = body as { userIds: string[] };

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return NextResponse.json(
                { error: 'ID user tidak valid atau kosong' },
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
                    { error: 'Hanya role HRGA yang dapat menghapus user' },
                    { status: 403 }
                );
            }

            // Do not allow deleting own account
            if (userIds.includes(user.id)) {
                return NextResponse.json(
                    { error: 'Tidak dapat menghapus akun sendiri' },
                    { status: 400 }
                );
            }
        }

        let successCount = 0;
        let errors: string[] = [];

        for (const userId of userIds) {
            try {
                // 1. Delete notifications for this user
                await supabaseAdmin
                    .from('notifications')
                    .delete()
                    .eq('user_id', userId);

                // 2. Delete multi-department assignments
                await supabaseAdmin
                    .from('user_departments')
                    .delete()
                    .eq('user_id', userId);

                // 3. Set created_by to NULL in incoming_stock to preserve history
                await supabaseAdmin
                    .from('incoming_stock')
                    .update({ created_by: null })
                    .eq('created_by', userId);

                // 4. Set requester_id to NULL in requests to preserve request history
                await supabaseAdmin
                    .from('requests')
                    .update({ requester_id: null })
                    .eq('requester_id', userId);

                // 5. Delete profile
                const { error: profileErr } = await supabaseAdmin
                    .from('profiles')
                    .delete()
                    .eq('id', userId);

                if (profileErr) {
                    throw profileErr;
                }

                // 6. Delete auth user
                const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
                if (authErr) {
                    console.warn(`Auth user delete warning for ${userId}:`, authErr.message);
                }

                successCount++;
            } catch (err: any) {
                console.error(`Error deleting user ${userId}:`, err);
                errors.push(err.message || 'Gagal menghapus user');
            }
        }

        if (successCount === 0 && errors.length > 0) {
            return NextResponse.json(
                { error: errors[0] },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            deletedCount: successCount,
            errorCount: errors.length,
        });
    } catch (error: any) {
        console.error('API delete user error:', error);
        return NextResponse.json(
            { error: error?.message || 'Terjadi kesalahan saat menghapus user' },
            { status: 500 }
        );
    }
}
